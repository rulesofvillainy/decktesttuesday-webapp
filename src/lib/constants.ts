import {
  LorcanaInk,
  EpisodeFormatTag,
  SubmissionFormatCategory,
  MatchFormat,
} from './types';

export const LORCANA_INKS: LorcanaInk[] = [
  'Amber',
  'Amethyst',
  'Emerald',
  'Ruby',
  'Sapphire',
  'Steel',
];

export const INK_CONFIG: Record<
  LorcanaInk,
  {
    color: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    symbol: string;
    description: string;
  }
> = {
  Amber: {
    color: '#E5A93B',
    bgClass: 'bg-ink-amber',
    textClass: 'text-black',
    borderClass: 'border-ink-amber',
    symbol: '●',
    description: 'Support, Healing & Go-Wide Choirs',
  },
  Amethyst: {
    color: '#8B5FA8',
    bgClass: 'bg-ink-amethyst',
    textClass: 'text-white',
    borderClass: 'border-ink-amethyst',
    symbol: '●',
    description: 'Card Draw, Bounce & Sorcery',
  },
  Emerald: {
    color: '#2E8B57',
    bgClass: 'bg-ink-emerald',
    textClass: 'text-white',
    borderClass: 'border-ink-emerald',
    symbol: '●',
    description: 'Discard, Tempo & Evasive Trickery',
  },
  Ruby: {
    color: '#D62828',
    bgClass: 'bg-ink-ruby',
    textClass: 'text-white',
    borderClass: 'border-ink-ruby',
    symbol: '●',
    description: 'Rush, Banish Removal & Reckless Lore',
  },
  Sapphire: {
    color: '#1D70B8',
    bgClass: 'bg-ink-sapphire',
    textClass: 'text-white',
    borderClass: 'border-ink-sapphire',
    symbol: '●',
    description: 'Inkwell Ramp, Items & High-Cost Titans',
  },
  Steel: {
    color: '#7A8B99',
    bgClass: 'bg-ink-steel',
    textClass: 'text-black',
    borderClass: 'border-ink-steel',
    symbol: '●',
    description: 'Direct Damage Songs, Bodyguards & Armour',
  },
};

export const EPISODE_FORMATS: EpisodeFormatTag[] = [
  'Core',
  'Infinity',
  'Coconut',
  'Limited',
  'Other',
];

export function extractFormatFromTitle(title: string): EpisodeFormatTag {
  if (!title) return 'Core';
  const lower = title.toLowerCase();
  if (lower.includes('infinity')) return 'Infinity';
  if (lower.includes('coconut')) return 'Coconut';
  if (
    lower.includes('sealed') ||
    lower.includes('draft') ||
    lower.includes('pack rush')
  ) {
    return 'Limited';
  }
  return 'Core';
}

export const LORCANA_SETS: string[] = [
  'Hyperia City',
  'Attack of the Vine',
  'Wilds Unknown',
  'Winterspell',
  'Whispers',
  'Fabled',
  'Reign Of Jafar',
  "Archazia's Island",
  'Special / Other',
];

export function extractSetFromTitle(title: string): string {
  if (!title) return 'Special / Other';
  const t = title.trim();
  const known = [
    'Hyperia City',
    'Attack of the Vine',
    'Wilds Unknown',
    'Winterspell',
    'Whispers',
    'Fabled',
    'Reign Of Jafar',
    "Archazia's Island",
  ];
  for (const k of known) {
    if (new RegExp(k, 'i').test(t)) return k;
  }
  if (/the vine/i.test(t)) return 'Attack of the Vine';
  const m = t.match(
    /Deck Test Tuesday\s*(?:\[[^\]]*\])?\s*-\s*([^\[\-]+?)(?:\s*\[Week|\s*Week|\s*-|\s*!|$)/i
  );
  if (m && m[1].trim()) {
    const raw = m[1].trim();
    if (raw.toLowerCase().includes('limited')) return 'Special / Other';
    return raw;
  }
  return 'Special / Other';
}

/**
 * Format who played this deck on a stream. Returns null if not played on the stream.
 */
export function formatPlayedBy(deck?: {
  played_by?: ('Andy' | 'Kirsten')[] | null;
  pilot?: string | null;
} | null): string | null {
  if (!deck) return null;
  if (deck.played_by && deck.played_by.length > 0) {
    if (deck.played_by.includes('Andy') && deck.played_by.includes('Kirsten')) {
      return 'Played by Andy & Kirsten';
    }
    if (deck.played_by.includes('Andy')) {
      return 'Played by Andy';
    }
    if (deck.played_by.includes('Kirsten')) {
      return 'Played by Kirsten';
    }
  }
  // When played_by is explicitly provided as an array (including []),
  // never fall back to the legacy deck-level pilot field.
  if (Array.isArray(deck.played_by)) {
    return null;
  }
  // Fallback to legacy pilot only when played_by was not supplied
  if (deck.pilot && deck.pilot !== 'Unassigned') {
    return `Played by ${deck.pilot}`;
  }
  return null;
}


export const SUBMISSION_FORMATS: SubmissionFormatCategory[] = [
  'Core',
  'Infinity',
  'Coconut',
  'Limited',
  'Other',
];

export const MATCH_FORMATS: {
  value: MatchFormat;
  label: string;
  winsNeeded: number;
}[] = [
  { value: 'Bo1', label: 'Best of 1 (Single Game)', winsNeeded: 1 },
  { value: 'Bo3', label: 'Best of 3 (First to 2)', winsNeeded: 2 },
  { value: 'Bo5', label: 'Best of 5 (First to 3)', winsNeeded: 3 },
];

export const SAMPLE_DECKLIST_TEXT = `4x Robin Hood - Champion of Sherwood
4x Robin Hood - Beloved Outlaw
4x Tinker Bell - Giant Fairy
4x Beast - Tragic Hero
4x Diablo - Devoted Herald
4x Cursed Merfolk - Ursula's Handiwork
4x Ursula - Deceiver
4x Ursula - Deceiver of All
4x Bucky - Squirrel Squeak Tutor
4x Prince John - Greediest of All
4x Sudden Chill
4x Strength of a Raging Fire
4x Let the Storm Rage On
4x A Whole New World
4x Hidden Cove - Tranquil Haven`;
