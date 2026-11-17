const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const p = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('--- Step 1: Alter Postgres schema for built_by and optional pilot ---');
  await p.query(`
    ALTER TABLE decks ADD COLUMN IF NOT EXISTS built_by TEXT;
    ALTER TABLE decks DROP CONSTRAINT IF EXISTS decks_pilot_check;
    ALTER TABLE decks ALTER COLUMN pilot DROP NOT NULL;
    ALTER TABLE decks ADD CONSTRAINT decks_pilot_check CHECK (pilot IS NULL OR pilot IN ('Andy', 'Kirsten', 'Community Sub', 'Unassigned'));
    ALTER TABLE episodes ALTER COLUMN is_hidden SET DEFAULT TRUE;
  `);
  console.log('Postgres schema updated successfully.');

  console.log('--- Step 2: Set stream visibility (Only Hyperia City visible, rest hidden) ---');
  const hideRes = await p.query(`
    UPDATE episodes
    SET is_hidden = TRUE
    WHERE title NOT ILIKE '%Hyperia City%' AND set_name NOT ILIKE '%Hyperia City%'
    RETURNING id
  `);
  console.log(`Hidden ${hideRes.rowCount} non-Hyperia episodes.`);

  const showRes = await p.query(`
    UPDATE episodes
    SET is_hidden = FALSE
    WHERE title ILIKE '%Hyperia City%' OR set_name ILIKE '%Hyperia City%'
    RETURNING id, title
  `);
  console.log(`Visible Hyperia City episodes (${showRes.rowCount}):`, showRes.rows.map(r => r.title));

  console.log('--- Step 3: Remove all dummy matches ---');
  const delMatches = await p.query(`DELETE FROM matches`);
  console.log(`Removed ${delMatches.rowCount} dummy matches. (Matches will be recorded fresh for streams).`);

  console.log('--- Step 4: Remove old/empty dummy decks ---');
  // Keep decks with non-empty raw_decklist or parsed_cards
  const keepDecks = await p.query(`
    SELECT id, deck_name FROM decks
    WHERE (raw_decklist IS NOT NULL AND TRIM(raw_decklist) != '')
       OR (parsed_cards IS NOT NULL AND jsonb_array_length(parsed_cards) > 0)
  `);
  console.log('Decks to preserve:', keepDecks.rows);
  const keepIds = keepDecks.rows.map(r => r.id);

  if (keepIds.length > 0) {
    const delEpDecks = await p.query(`DELETE FROM episode_decks WHERE deck_id != ALL($1)`, [keepIds]);
    console.log(`Cleaned up ${delEpDecks.rowCount} episode_deck bindings.`);

    const delDecks = await p.query(`DELETE FROM decks WHERE id != ALL($1)`, [keepIds]);
    console.log(`Deleted ${delDecks.rowCount} empty dummy decks.`);

    // Set built_by on preserved decks
    await p.query(`
      UPDATE decks
      SET built_by = CASE
        WHEN deck_name ILIKE '%Amber Amethyst%' THEN 'Andy'
        WHEN deck_name ILIKE '%Detectives%' THEN 'Kirsten'
        ELSE COALESCE(built_by, pilot)
      END,
      pilot = 'Unassigned'
      WHERE id = ANY($1)
    `, [keepIds]);
  } else {
    console.log('No decks to preserve, skipping delete.');
  }

  console.log('--- Step 5: Update data/local-db.json ---');
  const localDbPath = path.join(__dirname, '..', 'data', 'local-db.json');
  if (fs.existsSync(localDbPath)) {
    const localDb = JSON.parse(fs.readFileSync(localDbPath, 'utf8'));

    // Update episodes: only Hyperia City visible
    localDb.episodes = (localDb.episodes || []).map(ep => {
      const isHyperia = (ep.title && ep.title.includes('Hyperia City')) ||
                        (ep.set_name && ep.set_name.includes('Hyperia City'));
      return {
        ...ep,
        is_hidden: !isHyperia
      };
    });

    // Clear matches
    localDb.matches = [];

    // Filter decks to only preserved decks
    const preservedLocalDecks = (localDb.decks || []).filter(d => {
      return (d.raw_decklist && d.raw_decklist.trim().length > 0) ||
             (d.parsed_cards && d.parsed_cards.length > 0) ||
             keepIds.includes(d.id);
    }).map(d => ({
      ...d,
      built_by: d.deck_name?.includes('Amber Amethyst') ? 'Andy' :
                d.deck_name?.includes('Detectives') ? 'Kirsten' : (d.pilot || 'Andy'),
      pilot: 'Unassigned'
    }));

    localDb.decks = preservedLocalDecks;

    // Filter episode_decks
    const localKeepIds = new Set(preservedLocalDecks.map(d => d.id));
    localDb.episode_decks = (localDb.episode_decks || []).filter(ed => localKeepIds.has(ed.deck_id));

    fs.writeFileSync(localDbPath, JSON.stringify(localDb, null, 2), 'utf8');
    console.log(`Updated local-db.json successfully: ${localDb.episodes.filter(e => !e.is_hidden).length} visible episodes, ${localDb.decks.length} decks, ${localDb.matches.length} matches.`);
  }

  console.log('--- Migration & Cleanup Complete! ---');
}

run().catch(console.error).finally(() => p.end());

