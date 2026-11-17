/**
 * Client- and Server-safe Lorcana Decklist Text Parser & URL Validator
 * Uses the exact specification regex: ^(\d+)[xX]?\s+([^-–]+)(?:[-–]\s*(.+))?$
 */

export const DECKLIST_LINE_REGEX = /^(\d+)[xX]?\s+([^-–]+)(?:[-–]\s*(.+))?$/;

export interface ParsedDeckLine {
  lineNumber: number;
  rawLine: string;
  valid: boolean;
  count: number;
  name: string;
  version: string;
  error?: string;
}

export interface DecklistValidationSummary {
  lines: ParsedDeckLine[];
  validLines: ParsedDeckLine[];
  invalidLines: ParsedDeckLine[];
  totalCardCount: number;
  uniqueCardCount: number;
  isValidDecklist: boolean;
}

export function parseDecklistText(rawText: string): DecklistValidationSummary {
  if (!rawText || !rawText.trim()) {
    return {
      lines: [],
      validLines: [],
      invalidLines: [],
      totalCardCount: 0,
      uniqueCardCount: 0,
      isValidDecklist: false,
    };
  }

  const rawLines = rawText.split(/\r?\n/);
  const lines: ParsedDeckLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(DECKLIST_LINE_REGEX);
    if (!match) {
      lines.push({
        lineNumber: i + 1,
        rawLine: trimmed,
        valid: false,
        count: 0,
        name: '',
        version: '',
        error: 'Expected format: "4x Card Name - Version" or "4 Card Name"',
      });
      continue;
    }

    const count = parseInt(match[1], 10);
    const name = (match[2] || '').trim();
    const version = (match[3] || '').trim();

    if (!name || isNaN(count) || count <= 0 || count > 99) {
      lines.push({
        lineNumber: i + 1,
        rawLine: trimmed,
        valid: false,
        count: 0,
        name,
        version,
        error: 'Invalid card count or missing card name',
      });
      continue;
    }

    lines.push({
      lineNumber: i + 1,
      rawLine: trimmed,
      valid: true,
      count,
      name,
      version,
    });
  }

  const validLines = lines.filter((l) => l.valid);
  const invalidLines = lines.filter((l) => !l.valid);
  const totalCardCount = validLines.reduce((sum, l) => sum + l.count, 0);

  return {
    lines,
    validLines,
    invalidLines,
    totalCardCount,
    uniqueCardCount: validLines.length,
    isValidDecklist: validLines.length > 0 && invalidLines.length === 0,
  };
}

export function validateDeckUrl(url: string): {
  valid: boolean;
  provider: 'Dreamborn' | 'Inkdecks' | null;
  error?: string;
} {
  if (!url || !url.trim()) {
    return { valid: false, provider: null, error: 'Deck URL is required' };
  }
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    if (host === 'dreamborn.ink' || host.endsWith('.dreamborn.ink')) {
      return { valid: true, provider: 'Dreamborn' };
    }
    if (host === 'inkdecks.com' || host.endsWith('.inkdecks.com')) {
      return { valid: true, provider: 'Inkdecks' };
    }
    return {
      valid: false,
      provider: null,
      error: 'Only Dreamborn (dreamborn.ink) or Inkdecks (inkdecks.com) links are accepted.',
    };
  } catch {
    return {
      valid: false,
      provider: null,
      error: 'Please enter a valid https:// URL from Dreamborn or Inkdecks.',
    };
  }
}

export function formatDreambornExport(
  cards: { count: number; name: string; version?: string }[]
): string {
  return cards
    .map((c) =>
      c.version && c.version.trim()
        ? `${c.count}x ${c.name} - ${c.version}`
        : `${c.count}x ${c.name}`
    )
    .join('\n');
}
