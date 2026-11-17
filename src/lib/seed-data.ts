import {
  CachedCard,
  Deck,
  DeckSubmission,
  Episode,
  LorcanaInk,
  Match,
} from './types';

/**
 * Generates an inline Neobrutalist Lorcana card SVG data URI as an instant,
 * zero-latency visual fallback if a card isn't yet cached from Lorcast.
 */
export function generateCardArtworkFallback(
  name: string,
  version: string,
  ink: LorcanaInk,
  cost: number,
  type = 'Character'
): string {
  const inkColors: Record<LorcanaInk, { bg: string; accent: string }> = {
    Amber: { bg: '#E5A93B', accent: '#FFF3D1' },
    Amethyst: { bg: '#8B5FA8', accent: '#F3E5FF' },
    Emerald: { bg: '#2E8B57', accent: '#D8F8E5' },
    Ruby: { bg: '#D62828', accent: '#FFE0E0' },
    Sapphire: { bg: '#1D70B8', accent: '#DCEEFF' },
    Steel: { bg: '#7A8B99', accent: '#E8EEF2' },
  };
  const palette = inkColors[ink] || inkColors.Amethyst;
  const safeName = name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .slice(0, 24);
  const safeVer = (version || type)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .slice(0, 28);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" width="300" height="420">
    <rect width="300" height="420" rx="16" fill="#121212"/>
    <rect x="8" y="8" width="284" height="404" rx="12" fill="${palette.bg}" stroke="#000000" stroke-width="6"/>
    <rect x="20" y="64" width="260" height="210" fill="#1F102F" stroke="#000000" stroke-width="5"/>
    <circle cx="150" cy="168" r="65" fill="${palette.bg}" opacity="0.25"/>
    <polygon points="44,16 68,30 68,58 44,72 20,58 20,30" fill="#262730" stroke="#000000" stroke-width="5"/>
    <text x="44" y="54" text-anchor="middle" font-family="Impact, sans-serif" font-size="28" font-weight="900" fill="#FFFFFF">${cost}</text>
    <rect x="82" y="24" width="196" height="30" fill="#121212"/>
    <text x="180" y="45" text-anchor="middle" font-family="monospace" font-size="14" font-weight="700" fill="#00F5D4">${ink.toUpperCase()} • ${type.toUpperCase()}</text>
    <text x="150" y="176" text-anchor="middle" font-family="Impact, sans-serif" font-size="24" fill="${palette.accent}" letter-spacing="1">${safeName.toUpperCase()}</text>
    <rect x="20" y="286" width="260" height="72" fill="#181920" stroke="#000000" stroke-width="5"/>
    <text x="150" y="316" text-anchor="middle" font-family="Impact, sans-serif" font-size="19" font-weight="900" fill="#FFFFFF">${safeName}</text>
    <text x="150" y="342" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700" fill="#00F5D4">${safeVer}</text>
    <rect x="20" y="368" width="260" height="28" fill="#121212"/>
    <text x="150" y="387" text-anchor="middle" font-family="monospace" font-size="11" font-weight="700" fill="#FF2E93">DECK TEST TUESDAY</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const SEED_CARDS_CACHE: CachedCard[] = [];
export const SEED_EPISODES: Episode[] = [];
export const SEED_DECKS: Deck[] = [];
export const SEED_MATCHES: Match[] = [];
export const SEED_SUBMISSIONS: DeckSubmission[] = [];
