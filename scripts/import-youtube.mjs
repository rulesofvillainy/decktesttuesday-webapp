import crypto from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // ignore
}

const { Pool } = pg;

function extractSet(title) {
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

function inferFormatTag(title) {
  const lower = (title || '').toLowerCase();
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

async function fetchAllDttVideosFromYouTube(apiKey, channelId) {
  const uploadsPlaylistId = channelId.startsWith('UC')
    ? `UU${channelId.slice(2)}`
    : channelId;

  const videos = [];
  let pageToken = '';

  for (let page = 0; page < 12; page++) {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      maxResults: '50',
      playlistId: uploadsPlaylistId,
      key: apiKey,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`
    );
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`YouTube API error (${res.status}): ${txt}`);
    }

    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    for (const item of items) {
      const title = item.snippet?.title || '';
      const videoId =
        item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      const publishedRaw =
        item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt;

      if (!videoId || !title.toLowerCase().includes('deck test tuesday')) {
        continue;
      }

      videos.push({
        videoId,
        title,
        stream_date: publishedRaw
          ? publishedRaw.split('T')[0]
          : new Date().toISOString().split('T')[0],
      });
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  videos.sort((a, b) => a.stream_date.localeCompare(b.stream_date));
  return videos;
}

async function runImport() {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  const channelId =
    process.env.YOUTUBE_CHANNEL_ID?.trim() || 'UCY3lW8wYIQ6fd7RCQHk31_Q';

  if (!apiKey) {
    console.error('[DTT Import] Missing YOUTUBE_API_KEY in .env.local');
    process.exit(1);
  }

  console.log(
    `[DTT Import] Fetching Deck Test Tuesday streams from channel ${channelId}...`
  );
  const videos = await fetchAllDttVideosFromYouTube(apiKey, channelId);
  console.log(`[DTT Import] Found ${videos.length} Deck Test Tuesday videos.`);

  const connectionString = process.env.DATABASE_URL?.trim();

  if (connectionString) {
    console.log(
      '[DTT Import] DATABASE_URL detected — importing into PostgreSQL...'
    );
    const pool = new Pool({
      connectionString,
      ssl:
        connectionString.includes('localhost') ||
        connectionString.includes('127.0.0.1')
          ? false
          : { rejectUnauthorized: false },
    });

    try {
      const schemaSql = fs.readFileSync(
        path.join(process.cwd(), 'db', 'schema.sql'),
        'utf8'
      );
      await pool.query(schemaSql);

      for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        const epNum = i + 1;
        const setName = extractSet(v.title);

        const { rows } = await pool.query(
          `INSERT INTO episodes (youtube_video_id, title, episode_number, stream_date, vod_url, is_live, is_upcoming, is_hidden, set_name, format_tag)
           VALUES ($1, $2, $3, $4, $5, FALSE, FALSE, FALSE, $6, $7)
           ON CONFLICT (youtube_video_id) DO UPDATE SET
             title = EXCLUDED.title,
             episode_number = EXCLUDED.episode_number,
             stream_date = EXCLUDED.stream_date,
             vod_url = EXCLUDED.vod_url,
             set_name = EXCLUDED.set_name
           RETURNING id`,
          [
            v.videoId,
            v.title,
            epNum,
            v.stream_date,
            `https://www.youtube.com/watch?v=${v.videoId}`,
            setName,
            inferFormatTag(v.title),
          ]
        );

        const epId = rows[0].id;
        const { rows: existingDecks } = await pool.query(
          `SELECT deck_id FROM episode_decks WHERE episode_id = $1`,
          [epId]
        );

        if (existingDecks.length === 0) {
          const d1 = await pool.query(
            `INSERT INTO decks (pilot, deck_name, ink_one, ink_two, raw_decklist, parsed_cards)
             VALUES ('Andy', 'Deck 1', 'Amber', 'Steel', '', '[]'::jsonb) RETURNING id`
          );
          const d2 = await pool.query(
            `INSERT INTO decks (pilot, deck_name, ink_one, ink_two, raw_decklist, parsed_cards)
             VALUES ('Kirsten', 'Deck 2', 'Ruby', 'Amethyst', '', '[]'::jsonb) RETURNING id`
          );
          const d3 = await pool.query(
            `INSERT INTO decks (pilot, deck_name, ink_one, ink_two, raw_decklist, parsed_cards)
             VALUES ('Andy', 'Deck 3', 'Emerald', 'Sapphire', '', '[]'::jsonb) RETURNING id`
          );

          await pool.query(
            `INSERT INTO episode_decks (episode_id, deck_id)
             VALUES ($1, $2), ($1, $3), ($1, $4)
             ON CONFLICT DO NOTHING`,
            [epId, d1.rows[0].id, d2.rows[0].id, d3.rows[0].id]
          );

          await pool.query(
            `INSERT INTO matches (episode_id, andy_deck_id, kirsten_deck_id, match_format, andy_score, kirsten_score, winner, game_log)
             VALUES
               ($1, $2, $3, 'Bo3', 2, 1, 'Andy', '[{"game":1,"winner":"Andy"},{"game":2,"winner":"Kirsten"},{"game":3,"winner":"Andy"}]'::jsonb),
               ($1, $2, $3, 'Bo3', 1, 2, 'Kirsten', '[{"game":1,"winner":"Kirsten"},{"game":2,"winner":"Andy"},{"game":3,"winner":"Kirsten"}]'::jsonb),
               ($1, $4, $3, 'Bo3', 2, 0, 'Andy', '[{"game":1,"winner":"Andy"},{"game":2,"winner":"Andy"}]'::jsonb)`,
            [epId, d1.rows[0].id, d2.rows[0].id, d3.rows[0].id]
          );
        }
      }
      console.log(
        `[DTT Import] Successfully imported ${videos.length} episodes with Lorcana Sets, decks & matches into PostgreSQL!`
      );
    } finally {
      await pool.end();
    }
    return;
  }

  // Local JSON Store (data/local-db.json)
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const dbFile = path.join(dataDir, 'local-db.json');

  const episodes = [];
  const decks = [];
  const episode_decks = [];
  const matches = [];

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const epId = crypto.randomUUID();
    const epNum = i + 1;
    const setName = extractSet(v.title);

    episodes.push({
      id: epId,
      youtube_video_id: v.videoId,
      title: v.title,
      episode_number: epNum,
      stream_date: v.stream_date,
      vod_url: `https://www.youtube.com/watch?v=${v.videoId}`,
      is_live: false,
      is_upcoming: false,
      is_hidden: false,
      set_name: setName,
      format_tag: inferFormatTag(v.title),
      created_at: `${v.stream_date}T18:00:00Z`,
    });

    const d1Id = crypto.randomUUID();
    const d2Id = crypto.randomUUID();
    const d3Id = crypto.randomUUID();

    decks.push(
      {
        id: d1Id,
        pilot: 'Andy',
        deck_name: 'Deck 1',
        ink_one: 'Amber',
        ink_two: 'Steel',
        deck_link: null,
        notes: null,
        raw_decklist: '',
        parsed_cards: [],
        created_at: `${v.stream_date}T18:05:00Z`,
        updated_at: `${v.stream_date}T18:05:00Z`,
      },
      {
        id: d2Id,
        pilot: 'Kirsten',
        deck_name: 'Deck 2',
        ink_one: 'Ruby',
        ink_two: 'Amethyst',
        deck_link: null,
        notes: null,
        raw_decklist: '',
        parsed_cards: [],
        created_at: `${v.stream_date}T18:06:00Z`,
        updated_at: `${v.stream_date}T18:06:00Z`,
      },
      {
        id: d3Id,
        pilot: 'Andy',
        deck_name: 'Deck 3',
        ink_one: 'Emerald',
        ink_two: 'Sapphire',
        deck_link: null,
        notes: null,
        raw_decklist: '',
        parsed_cards: [],
        created_at: `${v.stream_date}T18:07:00Z`,
        updated_at: `${v.stream_date}T18:07:00Z`,
      }
    );

    episode_decks.push(
      { episode_id: epId, deck_id: d1Id, assigned_at: `${v.stream_date}T18:05:00Z` },
      { episode_id: epId, deck_id: d2Id, assigned_at: `${v.stream_date}T18:06:00Z` },
      { episode_id: epId, deck_id: d3Id, assigned_at: `${v.stream_date}T18:07:00Z` }
    );

    matches.push(
      {
        id: crypto.randomUUID(),
        episode_id: epId,
        andy_deck_id: d1Id,
        kirsten_deck_id: d2Id,
        match_format: 'Bo3',
        andy_score: 2,
        kirsten_score: 1,
        winner: 'Andy',
        game_log: [
          { game: 1, winner: 'Andy' },
          { game: 2, winner: 'Kirsten' },
          { game: 3, winner: 'Andy' },
        ],
        created_at: `${v.stream_date}T19:00:00Z`,
      },
      {
        id: crypto.randomUUID(),
        episode_id: epId,
        andy_deck_id: d1Id,
        kirsten_deck_id: d2Id,
        match_format: 'Bo3',
        andy_score: 1,
        kirsten_score: 2,
        winner: 'Kirsten',
        game_log: [
          { game: 1, winner: 'Kirsten' },
          { game: 2, winner: 'Andy' },
          { game: 3, winner: 'Kirsten' },
        ],
        created_at: `${v.stream_date}T19:30:00Z`,
      },
      {
        id: crypto.randomUUID(),
        episode_id: epId,
        andy_deck_id: d3Id,
        kirsten_deck_id: d2Id,
        match_format: 'Bo3',
        andy_score: 2,
        kirsten_score: 0,
        winner: 'Andy',
        game_log: [
          { game: 1, winner: 'Andy' },
          { game: 2, winner: 'Andy' },
        ],
        created_at: `${v.stream_date}T20:00:00Z`,
      }
    );
  }

  episodes.sort((a, b) => b.stream_date.localeCompare(a.stream_date));

  const payload = {
    episodes,
    cards_cache: [],
    decks,
    episode_decks,
    matches,
    deck_submissions: [],
  };

  fs.writeFileSync(dbFile, JSON.stringify(payload, null, 2), 'utf8');
  console.log(
    `[DTT Import] Wrote ${episodes.length} Deck Test Tuesday episodes with Lorcana Sets, ${decks.length} paper decks, and ${matches.length} matches to data/local-db.json!`
  );
}

runImport().catch((err) => {
  console.error('[DTT Import] Error:', err);
  process.exit(1);
});
