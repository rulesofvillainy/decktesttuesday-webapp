import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { extractSetFromTitle } from './constants';
import {
  SEED_CARDS_CACHE,
  SEED_DECKS,
  SEED_EPISODES,
  SEED_MATCHES,
  SEED_SUBMISSIONS,
} from './seed-data';
import {
  CachedCard,
  Deck,
  DeckSubmission,
  EnrichedEpisode,
  Episode,
  ExcludedYouTubeStream,
  Match,
  ParsedCardEntry,
  PilotName,
  SubmissionStatus,
} from './types';

interface EpisodeDeckRow {
  episode_id: string;
  deck_id: string;
  assigned_at: string;
}

interface LocalDatabaseSchema {
  episodes: Episode[];
  cards_cache: CachedCard[];
  decks: Deck[];
  episode_decks: EpisodeDeckRow[];
  matches: Match[];
  deck_submissions: DeckSubmission[];
  excluded_youtube_streams?: ExcludedYouTubeStream[];
  settings?: Record<string, string>;
}

const LOCAL_DB_DIR = path.join(process.cwd(), 'data');
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, 'local-db.json');

let pgPool: Pool | null = null;
let pgInitialized = false;

export function isPostgresConfigured(): boolean {
  return Boolean(
    process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0
  );
}

export function getDbMode(): 'postgresql' | 'local-json' {
  return isPostgresConfigured() ? 'postgresql' : 'local-json';
}

function getPool(): Pool {
  if (!pgPool) {
    const connectionString = process.env.DATABASE_URL!;
    pgPool = new Pool({
      connectionString,
      ssl:
        connectionString.includes('localhost') ||
        connectionString.includes('127.0.0.1')
          ? false
          : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pgPool;
}

async function ensurePostgresInitialized(): Promise<void> {
  if (pgInitialized || !isPostgresConfigured()) return;
  const pool = getPool();
  try {
    const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(sql);
    }
    pgInitialized = true;
  } catch (err) {
    console.error('[DTT DB] Error initializing PostgreSQL:', err);
    throw err;
  }
}

function readLocalDb(): LocalDatabaseSchema {
  if (!fs.existsSync(LOCAL_DB_DIR)) {
    fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOCAL_DB_FILE)) {
    const initial: LocalDatabaseSchema = {
      episodes: [...SEED_EPISODES],
      cards_cache: [...SEED_CARDS_CACHE],
      decks: [...SEED_DECKS],
      episode_decks: [],
      matches: [...SEED_MATCHES],
      deck_submissions: [...SEED_SUBMISSIONS],
    };
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalDatabaseSchema>;

    const episodes: Episode[] = Array.isArray(parsed.episodes)
      ? parsed.episodes.map((e) => ({
          ...e,
          is_upcoming: Boolean(e.is_upcoming),
          is_hidden: Boolean(e.is_hidden),
          set_name: e.set_name || extractSetFromTitle(e.title),
        }))
      : [];

    const decks: Deck[] = Array.isArray(parsed.decks) ? parsed.decks : [];
    let episode_decks: EpisodeDeckRow[] = Array.isArray(parsed.episode_decks)
      ? parsed.episode_decks
      : [];

    // Backfill episode_decks from deck.episode_id if empty
    if (episode_decks.length === 0 && decks.length > 0) {
      for (const d of decks) {
        if (d.episode_id) {
          episode_decks.push({
            episode_id: d.episode_id,
            deck_id: d.id,
            assigned_at: d.created_at || new Date().toISOString(),
          });
        }
      }
    }

    return {
      episodes,
      cards_cache: Array.isArray(parsed.cards_cache) ? parsed.cards_cache : [],
      decks,
      episode_decks,
      matches: Array.isArray(parsed.matches) ? parsed.matches : [],
      deck_submissions: Array.isArray(parsed.deck_submissions)
        ? parsed.deck_submissions
        : [],
    };
  } catch {
    return {
      episodes: [],
      cards_cache: [],
      decks: [],
      episode_decks: [],
      matches: [],
      deck_submissions: [],
    };
  }
}

function writeLocalDb(data: LocalDatabaseSchema): void {
  if (!fs.existsSync(LOCAL_DB_DIR)) {
    fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
  }
  fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function formatDateOnly(val: unknown): string {
  if (!val) return new Date().toISOString().split('T')[0];
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const str = String(val);
  return str.includes('T') ? str.split('T')[0] : str;
}

// =============================================================================
// EPISODES QUERIES
// =============================================================================

export async function getEpisodes(options?: {
  includeHidden?: boolean;
}): Promise<Episode[]> {
  const includeHidden = options?.includeHidden ?? false;

  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const query = includeHidden
      ? `SELECT * FROM episodes ORDER BY stream_date DESC, episode_number DESC NULLS LAST`
      : `SELECT * FROM episodes WHERE is_hidden = FALSE ORDER BY stream_date DESC, episode_number DESC NULLS LAST`;
    const { rows } = await getPool().query(query);
    return rows.map((r) => ({
      ...r,
      is_upcoming: Boolean(r.is_upcoming),
      is_hidden: Boolean(r.is_hidden),
      set_name: r.set_name || extractSetFromTitle(r.title),
      stream_date: formatDateOnly(r.stream_date),
      created_at: new Date(r.created_at).toISOString(),
    }));
  }

  const db = readLocalDb();
  let list = db.episodes;
  if (!includeHidden) {
    list = list.filter((e) => !e.is_hidden);
  }
  return [...list].sort((a, b) => b.stream_date.localeCompare(a.stream_date));
}

export async function getEpisodeById(
  id: string,
  options?: { includeHidden?: boolean }
): Promise<Episode | null> {
  const all = await getEpisodes(options);
  return all.find((e) => e.id === id) || null;
}

export async function getEpisodeByYoutubeId(
  youtubeVideoId: string
): Promise<Episode | null> {
  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const { rows } = await getPool().query(
      `SELECT * FROM episodes WHERE youtube_video_id = $1 LIMIT 1`,
      [youtubeVideoId]
    );
    if (!rows[0]) return null;
    return {
      ...rows[0],
      is_upcoming: Boolean(rows[0].is_upcoming),
      is_hidden: Boolean(rows[0].is_hidden),
      set_name: rows[0].set_name || extractSetFromTitle(rows[0].title),
      stream_date: formatDateOnly(rows[0].stream_date),
      created_at: new Date(rows[0].created_at).toISOString(),
    };
  }
  const db = readLocalDb();
  return (
    db.episodes.find((e) => e.youtube_video_id === youtubeVideoId) || null
  );
}

// =============================================================================
// DECKS & ASSIGNMENTS (DECK MANAGER)
// =============================================================================

export async function getAllDecks(): Promise<Deck[]> {
  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const pool = getPool();
    const { rows: decks } = await pool.query(
      `SELECT * FROM decks ORDER BY updated_at DESC, created_at DESC`
    );
    const { rows: assignments } = await pool.query(
      `SELECT ed.deck_id, ed.episode_id, e.title, e.stream_date
       FROM episode_decks ed
       JOIN episodes e ON e.id = ed.episode_id
       ORDER BY e.stream_date DESC`
    );

    const { rows: matchRows } = await pool.query(
      `SELECT andy_deck_id, kirsten_deck_id FROM matches`
    );
    const andyPlayed = new Set<string>();
    const kirstenPlayed = new Set<string>();
    for (const m of matchRows) {
      if (m.andy_deck_id) andyPlayed.add(m.andy_deck_id);
      if (m.kirsten_deck_id) kirstenPlayed.add(m.kirsten_deck_id);
    }

    const assignMap = new Map<
      string,
      { episode_id: string; title: string; stream_date: string }[]
    >();
    for (const a of assignments) {
      const arr = assignMap.get(a.deck_id) || [];
      arr.push({
        episode_id: a.episode_id,
        title: a.title,
        stream_date: formatDateOnly(a.stream_date),
      });
      assignMap.set(a.deck_id, arr);
    }

    return decks.map((d) => {
      const played_by: ('Andy' | 'Kirsten')[] = [];
      if (andyPlayed.has(d.id)) played_by.push('Andy');
      if (kirstenPlayed.has(d.id)) played_by.push('Kirsten');

      return {
        ...d,
        parsed_cards: Array.isArray(d.parsed_cards) ? d.parsed_cards : [],
        created_at: new Date(d.created_at).toISOString(),
        updated_at: d.updated_at
          ? new Date(d.updated_at).toISOString()
          : new Date(d.created_at).toISOString(),
        assigned_episodes: assignMap.get(d.id) || [],
        played_by,
      };
    });
  }

  const db = readLocalDb();
  const epMap = new Map(db.episodes.map((e) => [e.id, e]));

  const andyPlayed = new Set((db.matches || []).map((m) => m.andy_deck_id).filter(Boolean));
  const kirstenPlayed = new Set((db.matches || []).map((m) => m.kirsten_deck_id).filter(Boolean));

  return db.decks
    .map((deck) => {
      // Find all episodes assigned to this deck
      const epDecks = db.episode_decks.filter((ed) => ed.deck_id === deck.id);
      const assigned_episodes = epDecks
        .map((ed) => {
          const ep = epMap.get(ed.episode_id);
          return ep
            ? {
                episode_id: ep.id,
                title: ep.title,
                stream_date: ep.stream_date,
              }
            : null;
        })
        .filter(
          (x): x is { episode_id: string; title: string; stream_date: string } =>
            x !== null
        );

      // If legacy deck.episode_id exists and not in assigned_episodes, include it
      if (deck.episode_id && !assigned_episodes.some((a) => a.episode_id === deck.episode_id)) {
        const ep = epMap.get(deck.episode_id);
        if (ep) {
          assigned_episodes.push({
            episode_id: ep.id,
            title: ep.title,
            stream_date: ep.stream_date,
          });
        }
      }

      const played_by: ('Andy' | 'Kirsten')[] = [];
      if (andyPlayed.has(deck.id)) played_by.push('Andy');
      if (kirstenPlayed.has(deck.id)) played_by.push('Kirsten');

      return {
        ...deck,
        assigned_episodes,
        played_by,
      };
    })
    .sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at));
}

export async function getDecks(episodeId?: string): Promise<Deck[]> {
  const allDecks = await getAllDecks();
  if (!episodeId) return allDecks;

  return allDecks.filter(
    (d) =>
      d.episode_id === episodeId ||
      d.assigned_episodes?.some((a) => a.episode_id === episodeId)
  );
}

export async function getDeckById(id: string): Promise<Deck | null> {
  const allDecks = await getAllDecks();
  return allDecks.find((d) => d.id === id) || null;
}

export async function assignDeckToEpisode(
  episodeId: string,
  deckId: string
): Promise<void> {
  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    await getPool().query(
      `INSERT INTO episode_decks (episode_id, deck_id, assigned_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (episode_id, deck_id) DO NOTHING`,
      [episodeId, deckId]
    );
    return;
  }

  const db = readLocalDb();
  const exists = db.episode_decks.some(
    (ed) => ed.episode_id === episodeId && ed.deck_id === deckId
  );
  if (!exists) {
    db.episode_decks.push({
      episode_id: episodeId,
      deck_id: deckId,
      assigned_at: new Date().toISOString(),
    });
    writeLocalDb(db);
  }
}

export async function removeDeckFromEpisode(
  episodeId: string,
  deckId: string
): Promise<void> {
  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    await getPool().query(
      `DELETE FROM episode_decks WHERE episode_id = $1 AND deck_id = $2`,
      [episodeId, deckId]
    );
    return;
  }

  const db = readLocalDb();
  db.episode_decks = db.episode_decks.filter(
    (ed) => !(ed.episode_id === episodeId && ed.deck_id === deckId)
  );
  // Also clear legacy deck.episode_id if matched
  const targetDeck = db.decks.find((d) => d.id === deckId);
  if (targetDeck && targetDeck.episode_id === episodeId) {
    targetDeck.episode_id = null;
  }
  writeLocalDb(db);
}

export async function createDeck(
  input: Omit<Deck, 'id' | 'created_at'> & { episode_id?: string | null }
): Promise<Deck> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const deck: Deck = {
    id,
    episode_id: input.episode_id || null,
    pilot: input.pilot || 'Unassigned',
    built_by: input.built_by || null,
    deck_name: input.deck_name,
    ink_one: input.ink_one,
    ink_two: input.ink_two,
    deck_link: input.deck_link || null,
    notes: input.notes || null,
    raw_decklist: input.raw_decklist || '',
    parsed_cards: input.parsed_cards || [],
    created_at: now,
    updated_at: now,
  };

  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const pool = getPool();
    await pool.query(
      `INSERT INTO decks (id, episode_id, pilot, built_by, deck_name, ink_one, ink_two, deck_link, notes, raw_decklist, parsed_cards, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)`,
      [
        deck.id,
        deck.episode_id,
        deck.pilot,
        deck.built_by,
        deck.deck_name,
        deck.ink_one,
        deck.ink_two,
        deck.deck_link,
        deck.notes,
        deck.raw_decklist,
        JSON.stringify(deck.parsed_cards),
        deck.created_at,
        deck.updated_at,
      ]
    );

    if (input.episode_id) {
      await pool.query(
        `INSERT INTO episode_decks (episode_id, deck_id, assigned_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (episode_id, deck_id) DO NOTHING`,
        [input.episode_id, deck.id]
      );
    }
    return deck;
  }

  const db = readLocalDb();
  db.decks.unshift(deck);
  if (input.episode_id) {
    db.episode_decks.push({
      episode_id: input.episode_id,
      deck_id: deck.id,
      assigned_at: now,
    });
  }
  writeLocalDb(db);
  return deck;
}

export async function updateDeck(
  id: string,
  updates: Partial<
    Pick<
      Deck,
      | 'pilot'
      | 'built_by'
      | 'deck_name'
      | 'ink_one'
      | 'ink_two'
      | 'deck_link'
      | 'notes'
      | 'raw_decklist'
      | 'parsed_cards'
    >
  >
): Promise<Deck | null> {
  const now = new Date().toISOString();

  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const pool = getPool();
    const { rows: existing } = await pool.query(
      `SELECT * FROM decks WHERE id = $1`,
      [id]
    );
    if (!existing[0]) return null;
    const merged = { ...existing[0], ...updates, updated_at: now };
    const { rows } = await pool.query(
      `UPDATE decks
       SET pilot = $1,
           built_by = $2,
           deck_name = $3,
           ink_one = $4,
           ink_two = $5,
           deck_link = $6,
           notes = $7,
           raw_decklist = $8,
           parsed_cards = $9::jsonb,
           updated_at = $10
       WHERE id = $11
       RETURNING *`,
      [
        merged.pilot,
        merged.built_by || null,
        merged.deck_name,
        merged.ink_one,
        merged.ink_two,
        merged.deck_link || null,
        merged.notes || null,
        merged.raw_decklist || '',
        JSON.stringify(merged.parsed_cards || []),
        now,
        id,
      ]
    );
    return rows[0] || null;
  }

  const db = readLocalDb();
  const idx = db.decks.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  db.decks[idx] = {
    ...db.decks[idx],
    ...updates,
    updated_at: now,
  };
  writeLocalDb(db);
  return db.decks[idx];
}

export async function deleteDeck(id: string): Promise<boolean> {
  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const pool = getPool();
    await pool.query(`DELETE FROM episode_decks WHERE deck_id = $1`, [id]);
    const { rowCount } = await pool.query(`DELETE FROM decks WHERE id = $1`, [
      id,
    ]);
    return (rowCount || 0) > 0;
  }

  const db = readLocalDb();
  const before = db.decks.length;
  db.decks = db.decks.filter((d) => d.id !== id);
  db.episode_decks = db.episode_decks.filter((ed) => ed.deck_id !== id);
  writeLocalDb(db);
  return db.decks.length < before;
}

// =============================================================================
// MATCHES
// =============================================================================

export async function getMatches(episodeId?: string): Promise<Match[]> {
  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const query = episodeId
      ? `SELECT * FROM matches WHERE episode_id = $1 ORDER BY created_at ASC`
      : `SELECT * FROM matches ORDER BY created_at ASC`;
    const params = episodeId ? [episodeId] : [];
    const { rows } = await getPool().query(query, params);
    return rows.map((r) => ({
      ...r,
      game_log: Array.isArray(r.game_log) ? r.game_log : [],
      created_at: new Date(r.created_at).toISOString(),
    }));
  }

  const db = readLocalDb();
  const list = episodeId
    ? db.matches.filter((m) => m.episode_id === episodeId)
    : db.matches;
  return [...list];
}

export async function createMatch(
  input: Omit<Match, 'id' | 'created_at'>
): Promise<Match> {
  const match: Match = {
    id: crypto.randomUUID(),
    episode_id: input.episode_id,
    andy_deck_id: input.andy_deck_id,
    kirsten_deck_id: input.kirsten_deck_id,
    match_format: input.match_format,
    andy_score: Number(input.andy_score),
    kirsten_score: Number(input.kirsten_score),
    winner: input.winner,
    game_log: input.game_log || [],
    created_at: new Date().toISOString(),
  };

  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    await getPool().query(
      `INSERT INTO matches (id, episode_id, andy_deck_id, kirsten_deck_id, match_format, andy_score, kirsten_score, winner, game_log, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
      [
        match.id,
        match.episode_id,
        match.andy_deck_id,
        match.kirsten_deck_id,
        match.match_format,
        match.andy_score,
        match.kirsten_score,
        match.winner,
        JSON.stringify(match.game_log),
        match.created_at,
      ]
    );
    return match;
  }

  const db = readLocalDb();
  db.matches.push(match);
  writeLocalDb(db);
  return match;
}

export async function updateMatch(
  id: string,
  updates: Partial<
    Pick<
      Match,
      | 'andy_deck_id'
      | 'kirsten_deck_id'
      | 'match_format'
      | 'andy_score'
      | 'kirsten_score'
      | 'winner'
      | 'game_log'
    >
  >
): Promise<Match | null> {
  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const pool = getPool();
    const { rows: existing } = await pool.query(
      `SELECT * FROM matches WHERE id = $1`,
      [id]
    );
    if (!existing[0]) return null;
    const merged: Match = {
      ...existing[0],
      ...updates,
    };
    const { rows } = await pool.query(
      `UPDATE matches
       SET andy_deck_id = $1,
           kirsten_deck_id = $2,
           match_format = $3,
           andy_score = $4,
           kirsten_score = $5,
           winner = $6,
           game_log = $7::jsonb
       WHERE id = $8
       RETURNING *`,
      [
        merged.andy_deck_id,
        merged.kirsten_deck_id,
        merged.match_format,
        merged.andy_score,
        merged.kirsten_score,
        merged.winner,
        JSON.stringify(merged.game_log || []),
        id,
      ]
    );
    return rows[0] || null;
  }

  const db = readLocalDb();
  const idx = db.matches.findIndex((m) => m.id === id);
  if (idx < 0) return null;
  db.matches[idx] = {
    ...db.matches[idx],
    ...updates,
  };
  writeLocalDb(db);
  return db.matches[idx];
}

export async function deleteMatch(id: string): Promise<boolean> {
  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const { rowCount } = await getPool().query(
      `DELETE FROM matches WHERE id = $1`,
      [id]
    );
    return (rowCount || 0) > 0;
  }

  const db = readLocalDb();
  const prevLen = db.matches.length;
  db.matches = db.matches.filter((m) => m.id !== id);
  writeLocalDb(db);
  return db.matches.length < prevLen;
}

// =============================================================================
// ENRICHED EPISODES (STREAMS WITH DECKS & MATCHES)
// =============================================================================

export async function getEnrichedEpisodes(options?: {
  includeHidden?: boolean;
}): Promise<EnrichedEpisode[]> {
  const [episodes, allDecks, allMatches] = await Promise.all([
    getEpisodes(options),
    getAllDecks(),
    getMatches(),
  ]);

  const deckMap = new Map<string, Deck>();
  for (const d of allDecks) {
    deckMap.set(d.id, d);
  }

  return episodes.map((ep) => {
    // Find all decks assigned to this episode
    const epDecks = allDecks.filter(
      (d) =>
        d.episode_id === ep.id ||
        d.assigned_episodes?.some((a) => a.episode_id === ep.id)
    );

    const epMatches = allMatches
      .filter((m) => m.episode_id === ep.id)
      .map((m) => ({
        ...m,
        andy_deck: deckMap.get(m.andy_deck_id),
        kirsten_deck: deckMap.get(m.kirsten_deck_id),
      }));

    let andy_episode_wins = 0;
    let kirsten_episode_wins = 0;
    let andy_game_wins = 0;
    let kirsten_game_wins = 0;

    for (const m of epMatches) {
      if (m.winner === 'Andy') andy_episode_wins++;
      if (m.winner === 'Kirsten') kirsten_episode_wins++;
      andy_game_wins += Number(m.andy_score || 0);
      kirsten_game_wins += Number(m.kirsten_score || 0);
    }

    const episode_winner: 'Andy' | 'Kirsten' | 'Tie' =
      andy_episode_wins > kirsten_episode_wins
        ? 'Andy'
        : kirsten_episode_wins > andy_episode_wins
          ? 'Kirsten'
          : 'Tie';

    return {
      ...ep,
      decks: epDecks,
      matches: epMatches,
      andy_episode_wins,
      kirsten_episode_wins,
      andy_game_wins,
      kirsten_game_wins,
      episode_winner,
    };
  });
}

export async function getEnrichedEpisodeById(
  id: string,
  options?: { includeHidden?: boolean }
): Promise<EnrichedEpisode | null> {
  const all = await getEnrichedEpisodes({ includeHidden: true });
  const ep = all.find((e) => e.id === id) || null;
  if (!ep) return null;
  if (ep.is_hidden && !options?.includeHidden) return null;
  return ep;
}

/**
 * Returns the active live episode, or an upcoming scheduled episode,
 * or falls back to the latest stream.
 */
export async function getFeaturedEpisode(): Promise<{
  episode: EnrichedEpisode | null;
  status: 'live' | 'upcoming' | 'latest';
}> {
  const all = await getEnrichedEpisodes({ includeHidden: false });
  if (all.length === 0) return { episode: null, status: 'latest' };

  const live = all.find((e) => e.is_live);
  if (live) return { episode: live, status: 'live' };

  const todayStr = new Date().toISOString().split('T')[0];
  const upcoming = all.find(
    (e) => e.is_upcoming || e.stream_date > todayStr
  );
  if (upcoming) return { episode: upcoming, status: 'upcoming' };

  return { episode: all[0], status: 'latest' };
}

export async function getLiveEpisode(): Promise<EnrichedEpisode | null> {
  const all = await getEnrichedEpisodes({ includeHidden: false });
  return all.find((ep) => ep.is_live) || null;
}

export async function createOrUpdateEpisode(
  input: Partial<Episode> & { title: string }
): Promise<Episode> {
  const id = input.id || crypto.randomUUID();
  const youtube_video_id = input.youtube_video_id || null;
  const title = input.title.trim();
  const episode_number =
    input.episode_number !== undefined ? input.episode_number : null;
  const stream_date =
    input.stream_date || new Date().toISOString().split('T')[0];
  const vod_url =
    input.vod_url ||
    (youtube_video_id
      ? `https://www.youtube.com/watch?v=${youtube_video_id}`
      : '');
  const is_live = Boolean(input.is_live);
  const is_upcoming = Boolean(input.is_upcoming);
  const set_name = input.set_name || extractSetFromTitle(title);
  const is_hidden =
    input.is_hidden !== undefined
      ? Boolean(input.is_hidden)
      : !(
          set_name.toLowerCase().includes('hyperia') ||
          title.toLowerCase().includes('hyperia')
        );
  const format_tag = input.format_tag || 'Core';
  const created_at = input.created_at || new Date().toISOString();

  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const pool = getPool();
    if (is_live) {
      await pool.query(`UPDATE episodes SET is_live = FALSE WHERE id != $1`, [
        id,
      ]);
    }
    const { rows } = await pool.query(
      `INSERT INTO episodes (id, youtube_video_id, title, episode_number, stream_date, vod_url, is_live, is_upcoming, is_hidden, set_name, format_tag, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (youtube_video_id) DO UPDATE SET
         title = EXCLUDED.title,
         episode_number = COALESCE(EXCLUDED.episode_number, episodes.episode_number),
         is_live = EXCLUDED.is_live,
         is_upcoming = EXCLUDED.is_upcoming,
         vod_url = EXCLUDED.vod_url,
         set_name = COALESCE(NULLIF(EXCLUDED.set_name, 'Core'), episodes.set_name)
       RETURNING *`,
      [
        id,
        youtube_video_id,
        title,
        episode_number,
        stream_date,
        vod_url,
        is_live,
        is_upcoming,
        is_hidden,
        set_name,
        format_tag,
        created_at,
      ]
    );
    return {
      ...rows[0],
      is_upcoming: Boolean(rows[0].is_upcoming),
      is_hidden: Boolean(rows[0].is_hidden),
      set_name: rows[0].set_name || extractSetFromTitle(rows[0].title),
      stream_date: formatDateOnly(rows[0].stream_date),
      created_at: new Date(rows[0].created_at).toISOString(),
    };
  }

  const db = readLocalDb();
  if (is_live) {
    db.episodes.forEach((e) => {
      e.is_live = false;
    });
  }

  const existingIdx = db.episodes.findIndex(
    (e) =>
      e.id === id ||
      (youtube_video_id && e.youtube_video_id === youtube_video_id)
  );

  const epRecord: Episode = {
    id: existingIdx >= 0 ? db.episodes[existingIdx].id : id,
    youtube_video_id,
    title,
    episode_number:
      episode_number !== null
        ? episode_number
        : existingIdx >= 0
          ? db.episodes[existingIdx].episode_number
          : null,
    stream_date,
    vod_url,
    is_live,
    is_upcoming,
    is_hidden,
    set_name,
    format_tag,
    created_at:
      existingIdx >= 0 ? db.episodes[existingIdx].created_at : created_at,
  };

  if (existingIdx >= 0) {
    db.episodes[existingIdx] = epRecord;
  } else {
    db.episodes.unshift(epRecord);
  }
  writeLocalDb(db);
  return epRecord;
}

export async function updateEpisode(
  id: string,
  updates: Partial<
    Pick<
      Episode,
      | 'title'
      | 'episode_number'
      | 'stream_date'
      | 'vod_url'
      | 'is_live'
      | 'is_upcoming'
      | 'is_hidden'
      | 'set_name'
      | 'format_tag'
    >
  >
): Promise<Episode | null> {
  const cleanUpdates: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      cleanUpdates[key] = val;
    }
  }

  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const pool = getPool();
    const { rows: existing } = await pool.query(
      `SELECT * FROM episodes WHERE id = $1`,
      [id]
    );
    if (!existing[0]) return null;
    const merged = { ...existing[0], ...cleanUpdates };
    if (cleanUpdates.is_live) {
      await pool.query(`UPDATE episodes SET is_live = FALSE WHERE id != $1`, [
        id,
      ]);
    }
    const { rows } = await pool.query(
      `UPDATE episodes
       SET title = $1,
           episode_number = $2,
           stream_date = $3,
           vod_url = $4,
           is_live = $5,
           is_upcoming = $6,
           is_hidden = $7,
           set_name = $8,
           format_tag = $9
       WHERE id = $10
       RETURNING *`,
      [
        merged.title,
        merged.episode_number,
        merged.stream_date,
        merged.vod_url,
        Boolean(merged.is_live),
        Boolean(merged.is_upcoming),
        Boolean(merged.is_hidden),
        merged.set_name,
        merged.format_tag,
        id,
      ]
    );
    if (!rows[0]) return null;
    return {
      ...rows[0],
      is_upcoming: Boolean(rows[0].is_upcoming),
      is_hidden: Boolean(rows[0].is_hidden),
      set_name: rows[0].set_name || extractSetFromTitle(rows[0].title),
      stream_date: formatDateOnly(rows[0].stream_date),
      created_at: new Date(rows[0].created_at).toISOString(),
    };
  }

  const db = readLocalDb();
  const idx = db.episodes.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  if (cleanUpdates.is_live) {
    db.episodes.forEach((e) => {
      e.is_live = false;
    });
  }
  db.episodes[idx] = {
    ...db.episodes[idx],
    ...cleanUpdates,
  };
  writeLocalDb(db);
  return db.episodes[idx];
}

export async function setEpisodeLiveStatus(
  episodeId: string,
  isLive: boolean
): Promise<Episode | null> {
  return updateEpisode(episodeId, { is_live: isLive });
}

// =============================================================================
// CARDS CACHE (Lorcast Local DB Cache)
// =============================================================================

export function normalizeCardCacheId(name: string, version?: string): string {
  const combined = version ? `${name}-${version}` : name;
  return combined
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function getCachedCard(
  name: string,
  version?: string
): Promise<CachedCard | null> {
  const id = normalizeCardCacheId(name, version);
  const normName = name.trim().toLowerCase();
  const normVersion = (version || '').trim().toLowerCase();

  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const pool = getPool();
    if (normVersion) {
      const { rows } = await pool.query(
        `SELECT * FROM cards_cache WHERE id = $1 OR (LOWER(name) = $2 AND LOWER(version) = $3) LIMIT 1`,
        [id, normName, normVersion]
      );
      if (rows[0]) return rows[0];
    } else {
      const { rows } = await pool.query(
        `SELECT * FROM cards_cache WHERE id = $1 OR LOWER(name) = $2 LIMIT 1`,
        [id, normName]
      );
      if (rows[0]) return rows[0];
    }
    return null;
  }

  const db = readLocalDb();
  return (
    db.cards_cache.find((c) => {
      if (c.id === id) return true;
      if (normVersion) {
        return (
          c.name.toLowerCase() === normName &&
          c.version.toLowerCase() === normVersion
        );
      }
      return c.name.toLowerCase() === normName;
    }) || null
  );
}

export async function upsertCachedCard(card: CachedCard): Promise<CachedCard> {
  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    await getPool().query(
      `INSERT INTO cards_cache (id, name, version, ink, cost, type, inkwell, image_url, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         image_url = EXCLUDED.image_url,
         cost = EXCLUDED.cost,
         ink = EXCLUDED.ink,
         type = EXCLUDED.type,
         inkwell = EXCLUDED.inkwell,
         updated_at = EXCLUDED.updated_at`,
      [
        card.id,
        card.name,
        card.version,
        card.ink,
        card.cost,
        card.type,
        card.inkwell,
        card.image_url,
        card.updated_at,
      ]
    );
    return card;
  }

  const db = readLocalDb();
  const idx = db.cards_cache.findIndex((c) => c.id === card.id);
  if (idx >= 0) {
    db.cards_cache[idx] = card;
  } else {
    db.cards_cache.push(card);
  }
  writeLocalDb(db);
  return card;
}

// =============================================================================
// DECK SUBMISSIONS & 90-DAY DATA RETENTION
// =============================================================================

export async function getSubmissions(
  status?: SubmissionStatus | 'All'
): Promise<DeckSubmission[]> {
  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const query =
      status && status !== 'All'
        ? `SELECT * FROM deck_submissions WHERE status = $1 ORDER BY created_at DESC`
        : `SELECT * FROM deck_submissions ORDER BY created_at DESC`;
    const params = status && status !== 'All' ? [status] : [];
    const { rows } = await getPool().query(query, params);
    return rows.map((r) => ({
      ...r,
      created_at: new Date(r.created_at).toISOString(),
    }));
  }

  const db = readLocalDb();
  const filtered =
    status && status !== 'All'
      ? db.deck_submissions.filter((s) => s.status === status)
      : db.deck_submissions;
  return [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function createSubmission(
  input: Omit<DeckSubmission, 'id' | 'created_at' | 'status'>
): Promise<DeckSubmission> {
  const sub: DeckSubmission = {
    id: crypto.randomUUID(),
    deck_name: input.deck_name,
    submitter_name: input.submitter_name,
    ink_one: input.ink_one,
    ink_two: input.ink_two,
    submission_type: input.submission_type,
    deck_link: input.deck_link || null,
    raw_decklist: input.raw_decklist || null,
    parsed_cards: input.parsed_cards || null,
    format_category: input.format_category,
    notes: input.notes || null,
    status: 'Pending',
    created_at: new Date().toISOString(),
  };

  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    await getPool().query(
      `INSERT INTO deck_submissions (id, deck_name, submitter_name, ink_one, ink_two, submission_type, deck_link, raw_decklist, parsed_cards, format_category, notes, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)`,
      [
        sub.id,
        sub.deck_name,
        sub.submitter_name,
        sub.ink_one,
        sub.ink_two,
        sub.submission_type,
        sub.deck_link,
        sub.raw_decklist,
        sub.parsed_cards ? JSON.stringify(sub.parsed_cards) : null,
        sub.format_category,
        sub.notes,
        sub.status,
        sub.created_at,
      ]
    );
    return sub;
  }

  const db = readLocalDb();
  db.deck_submissions.unshift(sub);
  writeLocalDb(db);
  return sub;
}

export async function updateSubmissionStatus(
  id: string,
  status: SubmissionStatus,
  parsedCards?: ParsedCardEntry[]
): Promise<DeckSubmission | null> {
  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const query = parsedCards
      ? `UPDATE deck_submissions SET status = $1, parsed_cards = $2::jsonb WHERE id = $3 RETURNING *`
      : `UPDATE deck_submissions SET status = $1 WHERE id = $2 RETURNING *`;
    const params = parsedCards
      ? [status, JSON.stringify(parsedCards), id]
      : [status, id];
    const { rows } = await getPool().query(query, params);
    return rows[0] || null;
  }

  const db = readLocalDb();
  const target = db.deck_submissions.find((s) => s.id === id);
  if (!target) return null;
  target.status = status;
  if (parsedCards) {
    target.parsed_cards = parsedCards;
  }
  writeLocalDb(db);
  return target;
}

export async function assignSubmissionToEpisode(
  submissionId: string,
  episodeId: string,
  pilot: PilotName,
  parsedCards: ParsedCardEntry[]
): Promise<{ deck: Deck; submission: DeckSubmission } | null> {
  const submissions = await getSubmissions('All');
  const sub = submissions.find((s) => s.id === submissionId);
  if (!sub) return null;

  const deck = await createDeck({
    episode_id: episodeId,
    pilot,
    deck_name: `${sub.deck_name} (by ${sub.submitter_name})`,
    ink_one: sub.ink_one,
    ink_two: sub.ink_two,
    deck_link: sub.deck_link || null,
    notes: sub.notes || null,
    raw_decklist: sub.raw_decklist || '',
    parsed_cards: parsedCards.length > 0 ? parsedCards : sub.parsed_cards || [],
  });

  const updatedSub = await updateSubmissionStatus(
    submissionId,
    'Played',
    parsedCards.length > 0 ? parsedCards : undefined
  );

  return {
    deck,
    submission: updatedSub || { ...sub, status: 'Played' },
  };
}

export async function getRetentionStats(retentionDays = 90): Promise<{
  totalSubmissions: number;
  pendingCount: number;
  prunableOldCount: number;
  cachedCardsCount: number;
  cutoffDateIso: string;
  dbMode: 'postgresql' | 'local-json';
}> {
  const cutoff = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000
  ).toISOString();

  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const pool = getPool();
    const [subStats, cacheStats] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'Pending')::int AS pending,
           COUNT(*) FILTER (WHERE status IN ('Approved', 'Played', 'Archived') AND created_at < $1)::int AS prunable
         FROM deck_submissions`,
        [cutoff]
      ),
      pool.query(`SELECT COUNT(*)::int AS cnt FROM cards_cache`),
    ]);

    return {
      totalSubmissions: subStats.rows[0]?.total || 0,
      pendingCount: subStats.rows[0]?.pending || 0,
      prunableOldCount: subStats.rows[0]?.prunable || 0,
      cachedCardsCount: cacheStats.rows[0]?.cnt || 0,
      cutoffDateIso: cutoff,
      dbMode: 'postgresql',
    };
  }

  const db = readLocalDb();
  const totalSubmissions = db.deck_submissions.length;
  const pendingCount = db.deck_submissions.filter(
    (s) => s.status === 'Pending'
  ).length;
  const prunableOldCount = db.deck_submissions.filter(
    (s) =>
      ['Approved', 'Played', 'Archived'].includes(s.status) &&
      s.created_at < cutoff
  ).length;

  return {
    totalSubmissions,
    pendingCount,
    prunableOldCount,
    cachedCardsCount: db.cards_cache.length,
    cutoffDateIso: cutoff,
    dbMode: 'local-json',
  };
}

export async function pruneOldSubmissions(retentionDays = 90): Promise<{
  deletedCount: number;
  remainingCount: number;
  cutoffDateIso: string;
  sqlExecuted: string;
}> {
  const cutoff = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const sqlQuery = `DELETE FROM deck_submissions WHERE status IN ('Approved', 'Played', 'Archived') AND created_at < NOW() - INTERVAL '${retentionDays} days';`;

  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const pool = getPool();
    const { rowCount } = await pool.query(
      `DELETE FROM deck_submissions
       WHERE status IN ('Approved', 'Played', 'Archived')
         AND created_at < $1`,
      [cutoff]
    );
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM deck_submissions`
    );
    return {
      deletedCount: rowCount || 0,
      remainingCount: rows[0]?.cnt || 0,
      cutoffDateIso: cutoff,
      sqlExecuted: sqlQuery,
    };
  }

  const db = readLocalDb();
  const before = db.deck_submissions.length;
  db.deck_submissions = db.deck_submissions.filter(
    (s) =>
      !(
        ['Approved', 'Played', 'Archived'].includes(s.status) &&
        s.created_at < cutoff
      )
  );
  const deletedCount = before - db.deck_submissions.length;
  writeLocalDb(db);

  return {
    deletedCount,
    remainingCount: db.deck_submissions.length,
    cutoffDateIso: cutoff,
    sqlExecuted: sqlQuery,
  };
}

// =============================================================================
// EXCLUDED YOUTUBE STREAMS
// =============================================================================

export async function getExcludedYouTubeStreams(): Promise<ExcludedYouTubeStream[]> {
  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS excluded_youtube_streams (
        youtube_video_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        published_date TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    const { rows } = await pool.query(
      `SELECT youtube_video_id, title, published_date, created_at FROM excluded_youtube_streams ORDER BY created_at DESC`
    );
    return rows.map((r) => ({
      youtube_video_id: r.youtube_video_id,
      title: r.title,
      published_date: r.published_date || null,
      created_at: new Date(r.created_at).toISOString(),
    }));
  }

  const db = readLocalDb();
  return db.excluded_youtube_streams || [];
}

export async function addExcludedYouTubeStream(item: {
  youtube_video_id: string;
  title: string;
  published_date?: string | null;
}): Promise<ExcludedYouTubeStream> {
  const record: ExcludedYouTubeStream = {
    youtube_video_id: item.youtube_video_id,
    title: item.title,
    published_date: item.published_date || null,
    created_at: new Date().toISOString(),
  };

  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const pool = getPool();
    await pool.query(
      `INSERT INTO excluded_youtube_streams (youtube_video_id, title, published_date, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (youtube_video_id) DO UPDATE SET title = EXCLUDED.title, published_date = EXCLUDED.published_date`,
      [record.youtube_video_id, record.title, record.published_date]
    );
    return record;
  }

  const db = readLocalDb();
  if (!db.excluded_youtube_streams) {
    db.excluded_youtube_streams = [];
  }
  const idx = db.excluded_youtube_streams.findIndex(
    (e) => e.youtube_video_id === item.youtube_video_id
  );
  if (idx >= 0) {
    db.excluded_youtube_streams[idx] = record;
  } else {
    db.excluded_youtube_streams.unshift(record);
  }
  writeLocalDb(db);
  return record;
}

export async function removeExcludedYouTubeStream(
  youtubeVideoId: string
): Promise<void> {
  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const pool = getPool();
    await pool.query(
      `DELETE FROM excluded_youtube_streams WHERE youtube_video_id = $1`,
      [youtubeVideoId]
    );
    return;
  }

  const db = readLocalDb();
  if (db.excluded_youtube_streams) {
    db.excluded_youtube_streams = db.excluded_youtube_streams.filter(
      (e) => e.youtube_video_id !== youtubeVideoId
    );
    writeLocalDb(db);
  }
}

// =============================================================================
// APP SETTINGS (OBS Active Episode, etc.)
// =============================================================================

export async function getSetting(
  key: string,
  defaultValue = ''
): Promise<string> {
  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    const { rows } = await pool.query(
      `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`,
      [key]
    );
    return rows[0]?.value ?? defaultValue;
  }

  const db = readLocalDb();
  return db.settings?.[key] ?? defaultValue;
}

export async function setSetting(key: string, value: string): Promise<void> {
  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, value]
    );
    return;
  }

  const db = readLocalDb();
  if (!db.settings) {
    db.settings = {};
  }
  db.settings[key] = value;
  writeLocalDb(db);
}

export async function deleteSetting(key: string): Promise<void> {
  if (isPostgresConfigured()) {
    await ensurePostgresInitialized();
    const pool = getPool();
    await pool.query(`DELETE FROM app_settings WHERE key = $1`, [key]);
    return;
  }

  const db = readLocalDb();
  if (db.settings && key in db.settings) {
    delete db.settings[key];
    writeLocalDb(db);
  }
}



