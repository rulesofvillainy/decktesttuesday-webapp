import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('[RLS] Connecting to database...');

  const sql = `
    -- Enable Row Level Security (RLS) on all public tables
    ALTER TABLE IF EXISTS episodes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS decks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS episode_decks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS matches ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS deck_submissions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS cards_cache ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS excluded_youtube_streams ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS app_settings ENABLE ROW LEVEL SECURITY;

    -- Revoke direct permissions from public API roles (anon, authenticated)
    DO $$ BEGIN
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
      REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;
    EXCEPTION
      WHEN undefined_object THEN null;
    END $$;
  `;

  console.log('[RLS] Applying Row Level Security to all tables...');
  await pool.query(sql);
  console.log('[RLS] Successfully enabled RLS on all tables!');

  // Verify status
  const { rows } = await pool.query(`
    SELECT 
      tablename, 
      rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `);

  console.log('[RLS] Updated Table Status:');
  console.table(rows);

  await pool.end();
}

main().catch((err) => {
  console.error('[RLS] Error:', err);
  process.exit(1);
});

