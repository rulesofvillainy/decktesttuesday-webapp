import {
  getCachedCard,
  normalizeCardCacheId,
  upsertCachedCard,
} from './db';
import { parseDecklistText } from './deck-parser';
import { generateCardArtworkFallback } from './seed-data';
import { CachedCard, LorcanaInk, ParsedCardEntry } from './types';

interface LorcastApiCard {
  id?: string;
  name?: string;
  version?: string | null;
  ink?: string;
  cost?: number;
  type?: string[];
  inkwell?: boolean;
  image_uris?: {
    digital?: {
      normal?: string;
      small?: string;
      large?: string;
    };
  };
}

function normalizeInk(rawInk?: string): LorcanaInk {
  const validInks: LorcanaInk[] = [
    'Amber',
    'Amethyst',
    'Emerald',
    'Ruby',
    'Sapphire',
    'Steel',
  ];
  if (!rawInk) return 'Amber';
  const capitalized =
    rawInk.charAt(0).toUpperCase() + rawInk.slice(1).toLowerCase();
  return validInks.includes(capitalized as LorcanaInk)
    ? (capitalized as LorcanaInk)
    : 'Amber';
}

/**
 * Queries the public Lorcast API (`https://api.lorcast.com/v0/cards/search?q=name:"CardName"`)
 * with DB caching (`cards_cache`) so repeated lookups have 0 latency and 0 rate limit risk.
 */
export async function resolveCardWithLorcast(
  name: string,
  version = '',
  fallbackInk: LorcanaInk = 'Amethyst'
): Promise<CachedCard> {
  // 1. Check cards_cache in DB first
  const cached = await getCachedCard(name, version);
  if (cached) {
    return cached;
  }

  // 2. Query Lorcast API: https://api.lorcast.com/v0/cards/search?q=name:"CardName"
  const cleanName = name.replace(/"/g, '').trim();
  const cleanVersion = version.replace(/"/g, '').trim();
  const query = `name:"${cleanName}"`;
  const url = `https://api.lorcast.com/v0/cards/search?q=${encodeURIComponent(query)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()) as { results?: LorcastApiCard[] };
      const results = Array.isArray(data?.results) ? data.results : [];

      if (results.length > 0) {
        // Match exact version if provided, otherwise best name match
        const normVer = cleanVersion.toLowerCase();
        const matched =
          (normVer &&
            results.find(
              (r) => (r.version || '').toLowerCase() === normVer
            )) ||
          (normVer &&
            results.find((r) =>
              (r.version || '').toLowerCase().includes(normVer)
            )) ||
          results[0];

        const resolvedName = matched.name || cleanName;
        const resolvedVersion = matched.version || cleanVersion || '';
        const resolvedInk = normalizeInk(matched.ink || fallbackInk);
        const resolvedCost =
          typeof matched.cost === 'number' ? matched.cost : 3;
        const resolvedType = Array.isArray(matched.type)
          ? matched.type.join(' - ')
          : 'Character';
        const resolvedInkwell =
          typeof matched.inkwell === 'boolean' ? matched.inkwell : true;
        const resolvedImage =
          matched.image_uris?.digital?.normal ||
          matched.image_uris?.digital?.small ||
          generateCardArtworkFallback(
            resolvedName,
            resolvedVersion,
            resolvedInk,
            resolvedCost,
            resolvedType
          );

        const cardRecord: CachedCard = {
          id:
            matched.id ||
            normalizeCardCacheId(resolvedName, resolvedVersion),
          name: resolvedName,
          version: resolvedVersion,
          ink: resolvedInk,
          cost: resolvedCost,
          type: resolvedType,
          inkwell: resolvedInkwell,
          image_url: resolvedImage,
          updated_at: new Date().toISOString(),
        };

        await upsertCachedCard(cardRecord);
        return cardRecord;
      }
    }
  } catch {
    // Graceful fallback if offline or Lorcast times out
  }

  // 3. Fallback synthetic card record so deck parsing never breaks offline
  const fallbackCard: CachedCard = {
    id: normalizeCardCacheId(cleanName, cleanVersion),
    name: cleanName,
    version: cleanVersion,
    ink: fallbackInk,
    cost: 3,
    type: 'Character',
    inkwell: true,
    image_url: generateCardArtworkFallback(
      cleanName,
      cleanVersion,
      fallbackInk,
      3,
      'Character'
    ),
    updated_at: new Date().toISOString(),
  };

  await upsertCachedCard(fallbackCard);
  return fallbackCard;
}

/**
 * Parses a full raw decklist string and resolves all card lines against
 * `cards_cache` and the Lorcast API.
 */
export async function parseAndResolveDecklist(
  rawDecklist: string,
  defaultInk: LorcanaInk = 'Amber'
): Promise<{
  parsedCards: ParsedCardEntry[];
  totalCards: number;
  uninkableCount: number;
}> {
  const summary = parseDecklistText(rawDecklist);
  if (summary.validLines.length === 0) {
    return { parsedCards: [], totalCards: 0, uninkableCount: 0 };
  }

  // Merge duplicate lines of the same card
  const consolidated = new Map<
    string,
    { count: number; name: string; version: string }
  >();
  for (const line of summary.validLines) {
    const key = normalizeCardCacheId(line.name, line.version);
    const existing = consolidated.get(key);
    if (existing) {
      existing.count += line.count;
    } else {
      consolidated.set(key, {
        count: line.count,
        name: line.name,
        version: line.version,
      });
    }
  }

  const entries = Array.from(consolidated.values());
  const parsedCards: ParsedCardEntry[] = await Promise.all(
    entries.map(async (item) => {
      const card = await resolveCardWithLorcast(
        item.name,
        item.version,
        defaultInk
      );
      return {
        count: item.count,
        card_id: card.id,
        name: card.name,
        version: card.version,
        image_url: card.image_url,
        cost: card.cost,
        ink: card.ink,
        type: card.type,
        inkwell: card.inkwell,
      };
    })
  );

  // Sort by cost ascending, then name
  parsedCards.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));

  const totalCards = parsedCards.reduce((sum, c) => sum + c.count, 0);
  const uninkableCount = parsedCards
    .filter((c) => c.inkwell === false)
    .reduce((sum, c) => sum + c.count, 0);

  return {
    parsedCards,
    totalCards,
    uninkableCount,
  };
}
