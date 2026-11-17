import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(
      '[DTT Migrate] No DATABASE_URL found in environment. Local file-backed DB will be used automatically in dev mode.'
    );
    process.exit(0);
  }

  const sqlPath = path.join(process.cwd(), 'db', 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost')
      ? false
      : { rejectUnauthorized: false },
  });

  try {
    console.log('[DTT Migrate] Running PostgreSQL schema migration...');
    await pool.query(sql);
    console.log('[DTT Migrate] Schema migration completed successfully!');
  } catch (err) {
    console.error('[DTT Migrate] Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
