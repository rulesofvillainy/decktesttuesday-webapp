export type LorcanaInk =
  | 'Amber'
  | 'Amethyst'
  | 'Emerald'
  | 'Ruby'
  | 'Sapphire'
  | 'Steel';

export type EpisodeFormatTag =
  | 'Core'
  | 'Infinity'
  | 'Coconut'
  | 'Limited'
  | 'Other';

export type PilotName = 'Andy' | 'Kirsten' | 'Community Sub' | 'Unassigned';

export type MatchFormat = 'Bo1' | 'Bo3' | 'Bo5';

export type MatchWinner = 'Andy' | 'Kirsten' | 'Draw' | null;

export type SubmissionType = 'link' | 'full_list';

export type SubmissionFormatCategory =
  | 'Core'
  | 'Infinity'
  | 'Coconut'
  | 'Limited'
  | 'Other';

export type SubmissionStatus = 'Pending' | 'Approved' | 'Played' | 'Archived';

export interface Episode {
  id: string;
  youtube_video_id: string | null;
  title: string;
  episode_number: number | null;
  stream_date: string; // YYYY-MM-DD
  vod_url: string;
  is_live: boolean;
  is_upcoming: boolean;
  is_hidden: boolean;
  set_name: string;
  format_tag: EpisodeFormatTag;
  created_at: string;
}

export interface CachedCard {
  id: string;
  name: string;
  version: string;
  ink: LorcanaInk;
  cost: number;
  type: string;
  inkwell: boolean;
  image_url: string;
  updated_at: string;
}

export interface ParsedCardEntry {
  count: number;
  card_id: string;
  name: string;
  version: string;
  image_url: string;
  cost: number;
  ink: LorcanaInk;
  type?: string;
  inkwell?: boolean;
}

export interface DeckSnapshot {
  id: string;
  pilot?: PilotName | null;
  built_by?: string | null;
  deck_name: string;
  ink_one: LorcanaInk;
  ink_two: LorcanaInk;
  deck_link?: string | null;
  notes?: string | null;
  raw_decklist: string;
  parsed_cards: ParsedCardEntry[];
  locked_at?: string;
}

export interface Deck {
  id: string;
  episode_id?: string | null;
  pilot?: PilotName | null;
  built_by?: string | null;
  played_by?: ('Andy' | 'Kirsten')[];
  deck_name: string;
  ink_one: LorcanaInk;
  ink_two: LorcanaInk;
  deck_link?: string | null;
  notes?: string | null;
  raw_decklist: string;
  parsed_cards: ParsedCardEntry[];
  created_at: string;
  updated_at?: string;
  is_locked?: boolean;
  locked_at?: string | null;
  assigned_episodes?: {
    episode_id: string;
    title: string;
    stream_date: string;
  }[];
}

export interface GameLogEntry {
  game: number;
  winner: 'Andy' | 'Kirsten';
}

export interface Match {
  id: string;
  episode_id: string;
  andy_deck_id: string;
  kirsten_deck_id: string;
  match_format: MatchFormat;
  andy_score: number;
  kirsten_score: number;
  winner: MatchWinner;
  game_log: GameLogEntry[];
  created_at: string;
}

export type EnrichedMatch = Match & {
  andy_deck?: Deck;
  kirsten_deck?: Deck;
};

export interface DeckSubmission {
  id: string;
  deck_name: string;
  submitter_name: string;
  ink_one: LorcanaInk;
  ink_two: LorcanaInk;
  submission_type: SubmissionType;
  deck_link?: string | null;
  raw_decklist?: string | null;
  parsed_cards?: ParsedCardEntry[] | null;
  format_category: SubmissionFormatCategory;
  notes?: string | null;
  status: SubmissionStatus;
  created_at: string;
}

export interface EnrichedEpisode extends Episode {
  decks: Deck[];
  matches: (Match & {
    andy_deck?: Deck;
    kirsten_deck?: Deck;
  })[];
  andy_episode_wins: number;
  kirsten_episode_wins: number;
  andy_game_wins: number;
  kirsten_game_wins: number;
  episode_winner: 'Andy' | 'Kirsten' | 'Tie';
}

export interface ExcludedYouTubeStream {
  youtube_video_id: string;
  title: string;
  published_date?: string | null;
  created_at?: string;
}

export interface YouTubeStreamCandidate {
  youtube_video_id: string;
  title: string;
  stream_date: string;
  published_at?: string;
  vod_url: string;
  thumbnail_url?: string;
  set_name: string;
  format_tag: EpisodeFormatTag;
  is_live: boolean;
  is_upcoming: boolean;
}
