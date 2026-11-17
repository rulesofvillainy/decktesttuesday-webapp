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
  console.log('Connecting to PostgreSQL database...');
  const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('Running db/schema.sql...');
  await pool.query(sql);
  console.log('Schema executed successfully!');

  const { rows } = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log('Public tables:', rows.map((r) => r.table_name));

  await pool.end();
}

main().catch((err) => {
  console.error('Failed to initialize schema:', err);
  process.exit(1);
});
