import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const localDbPath = path.join(process.cwd(), 'data', 'local-db.json');
  if (!fs.existsSync(localDbPath)) {
    console.error('No data/local-db.json found.');
    process.exit(1);
  }

  const raw = fs.readFileSync(localDbPath, 'utf8');
  const db = JSON.parse(raw);

  console.log(`Syncing local data to PostgreSQL (${connectionString.split('@')[1]})...`);

  // 1. Cards Cache
  if (db.cards_cache && db.cards_cache.length > 0) {
    console.log(`Inserting ${db.cards_cache.length} cached cards...`);
    for (const card of db.cards_cache) {
      await pool.query(
        `INSERT INTO cards_cache (id, name, version, ink, cost, type, inkwell, image_url, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE 
         SET name = EXCLUDED.name, version = EXCLUDED.version, ink = EXCLUDED.ink,
             cost = EXCLUDED.cost, type = EXCLUDED.type, inkwell = EXCLUDED.inkwell,
             image_url = EXCLUDED.image_url, updated_at = EXCLUDED.updated_at`,
        [
          card.id,
          card.name,
          card.version || '',
          card.ink || 'Amber',
          card.cost || 1,
          card.type || 'Character',
          card.inkwell ?? true,
          card.image_url || '',
          card.updated_at || new Date().toISOString(),
        ]
      );
    }
  }

  // 2. Episodes
  if (db.episodes && db.episodes.length > 0) {
    console.log(`Inserting ${db.episodes.length} episodes...`);
    for (const ep of db.episodes) {
      await pool.query(
        `INSERT INTO episodes (id, youtube_video_id, title, episode_number, stream_date, vod_url, is_live, is_upcoming, is_hidden, set_name, format_tag, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE
         SET youtube_video_id = EXCLUDED.youtube_video_id,
             title = EXCLUDED.title,
             episode_number = EXCLUDED.episode_number,
             stream_date = EXCLUDED.stream_date,
             vod_url = EXCLUDED.vod_url,
             is_live = EXCLUDED.is_live,
             is_upcoming = EXCLUDED.is_upcoming,
             is_hidden = EXCLUDED.is_hidden,
             set_name = EXCLUDED.set_name,
             format_tag = EXCLUDED.format_tag`,
        [
          ep.id,
          ep.youtube_video_id || null,
          ep.title,
          ep.episode_number || null,
          ep.stream_date || new Date().toISOString().split('T')[0],
          ep.vod_url || '',
          Boolean(ep.is_live),
          Boolean(ep.is_upcoming),
          Boolean(ep.is_hidden),
          ep.set_name || 'Core',
          ep.format_tag || 'Core',
          ep.created_at || new Date().toISOString(),
        ]
      );
    }
  }

  // 3. Decks
  if (db.decks && db.decks.length > 0) {
    console.log(`Inserting ${db.decks.length} decks...`);
    for (const deck of db.decks) {
      await pool.query(
        `INSERT INTO decks (id, episode_id, pilot, deck_name, ink_one, ink_two, deck_link, notes, raw_decklist, parsed_cards, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
         ON CONFLICT (id) DO UPDATE
         SET episode_id = EXCLUDED.episode_id,
             pilot = EXCLUDED.pilot,
             deck_name = EXCLUDED.deck_name,
             ink_one = EXCLUDED.ink_one,
             ink_two = EXCLUDED.ink_two,
             deck_link = EXCLUDED.deck_link,
             notes = EXCLUDED.notes,
             raw_decklist = EXCLUDED.raw_decklist,
             parsed_cards = EXCLUDED.parsed_cards,
             updated_at = EXCLUDED.updated_at`,
        [
          deck.id,
          deck.episode_id || null,
          deck.pilot,
          deck.deck_name,
          deck.ink_one,
          deck.ink_two,
          deck.deck_link || null,
          deck.notes || null,
          deck.raw_decklist || '',
          JSON.stringify(deck.parsed_cards || []),
          deck.created_at || new Date().toISOString(),
          deck.updated_at || new Date().toISOString(),
        ]
      );
    }
  }

  // 4. Episode Decks (assignments)
  if (db.episode_decks && db.episode_decks.length > 0) {
    console.log(`Inserting ${db.episode_decks.length} episode deck assignments...`);
    for (const ed of db.episode_decks) {
      await pool.query(
        `INSERT INTO episode_decks (episode_id, deck_id, assigned_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (episode_id, deck_id) DO NOTHING`,
        [ed.episode_id, ed.deck_id, ed.assigned_at || new Date().toISOString()]
      );
    }
  }

  // 5. Matches
  if (db.matches && db.matches.length > 0) {
    console.log(`Inserting ${db.matches.length} matches...`);
    for (const m of db.matches) {
      await pool.query(
        `INSERT INTO matches (id, episode_id, andy_deck_id, kirsten_deck_id, match_format, andy_score, kirsten_score, winner, game_log, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
         ON CONFLICT (id) DO UPDATE
         SET episode_id = EXCLUDED.episode_id,
             andy_deck_id = EXCLUDED.andy_deck_id,
             kirsten_deck_id = EXCLUDED.kirsten_deck_id,
             match_format = EXCLUDED.match_format,
             andy_score = EXCLUDED.andy_score,
             kirsten_score = EXCLUDED.kirsten_score,
             winner = EXCLUDED.winner,
             game_log = EXCLUDED.game_log`,
        [
          m.id,
          m.episode_id,
          m.andy_deck_id,
          m.kirsten_deck_id,
          m.match_format || 'Bo3',
          m.andy_score || 0,
          m.kirsten_score || 0,
          m.winner || null,
          JSON.stringify(m.game_log || []),
          m.created_at || new Date().toISOString(),
        ]
      );
    }
  }

  // 6. Submissions
  if (db.deck_submissions && db.deck_submissions.length > 0) {
    console.log(`Inserting ${db.deck_submissions.length} submissions...`);
    for (const sub of db.deck_submissions) {
      await pool.query(
        `INSERT INTO deck_submissions (id, deck_name, submitter_name, ink_one, ink_two, submission_type, deck_link, raw_decklist, parsed_cards, format_category, notes, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
         ON CONFLICT (id) DO NOTHING`,
        [
          sub.id,
          sub.deck_name,
          sub.submitter_name,
          sub.ink_one,
          sub.ink_two,
          sub.submission_type,
          sub.deck_link || null,
          sub.raw_decklist || '',
          JSON.stringify(sub.parsed_cards || []),
          sub.format_category || 'Core',
          sub.notes || null,
          sub.status || 'Pending',
          sub.created_at || new Date().toISOString(),
        ]
      );
    }
  }

  console.log('PostgreSQL database synchronization complete!');
  await pool.end();
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
