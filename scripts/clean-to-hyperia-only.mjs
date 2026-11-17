import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('=== Cleaning Database to Hyperia City Streams Only ===');

  // 1. Clean Postgres
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      console.log('Connected to PostgreSQL...');

      // Find non-hyperia episodes
      const { rows: nonHyperia } = await pool.query(`
        SELECT id, title FROM episodes
        WHERE title NOT ILIKE '%Hyperia City%' AND (set_name IS NULL OR set_name NOT ILIKE '%Hyperia City%')
      `);
      console.log(`Found ${nonHyperia.length} non-Hyperia City streams in PostgreSQL to delete.`);

      if (nonHyperia.length > 0) {
        const ids = nonHyperia.map(e => e.id);
        // Delete any matches for these episodes
        await pool.query(`DELETE FROM matches WHERE episode_id = ANY($1::uuid[])`, [ids]);
        // Delete any episode_decks assignments
        await pool.query(`DELETE FROM episode_decks WHERE episode_id = ANY($1::uuid[])`, [ids]);
        // Delete episodes
        await pool.query(`DELETE FROM episodes WHERE id = ANY($1::uuid[])`, [ids]);
        console.log(`Deleted ${nonHyperia.length} non-Hyperia City streams from PostgreSQL.`);
      }

      // Check remaining
      const { rows: remaining } = await pool.query(`SELECT id, title, stream_date, is_hidden FROM episodes ORDER BY stream_date DESC`);
      console.log(`Remaining episodes in PostgreSQL (${remaining.length}):`);
      remaining.forEach(r => console.log(` - [${r.stream_date}] ${r.title} (hidden: ${r.is_hidden})`));

    } finally {
      await pool.end();
    }
  }

  // 2. Clean local-db.json
  const localDbPath = path.resolve('data/local-db.json');
  if (fs.existsSync(localDbPath)) {
    const db = JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
    const beforeCount = db.episodes.length;
    
    // Filter episodes to only Hyperia City
    const keptEpisodes = db.episodes.filter(e => 
      (e.title && e.title.toLowerCase().includes('hyperia city')) ||
      (e.set_name && e.set_name.toLowerCase().includes('hyperia city'))
    );
    const keptIds = new Set(keptEpisodes.map(e => e.id));

    db.episodes = keptEpisodes;
    db.matches = (db.matches || []).filter(m => keptIds.has(m.episode_id));
    db.episode_decks = (db.episode_decks || []).filter(ed => keptIds.has(ed.episode_id));

    fs.writeFileSync(localDbPath, JSON.stringify(db, null, 2), 'utf8');
    console.log(`Cleaned data/local-db.json: episodes reduced from ${beforeCount} to ${db.episodes.length}.`);
  }

  console.log('=== Database cleanup complete! ===');
}

main().catch(err => {
  console.error('Error cleaning database:', err);
  process.exit(1);
});
