import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

function inferFormat(title) {
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

async function main() {
  // 1. Update local-db.json
  const dbPath = path.join(process.cwd(), 'data', 'local-db.json');
  if (fs.existsSync(dbPath)) {
    const raw = fs.readFileSync(dbPath, 'utf8');
    const db = JSON.parse(raw);
    let count = 0;
    for (const ep of db.episodes) {
      const nextFmt = inferFormat(ep.title);
      if (ep.format_tag !== nextFmt) {
        ep.format_tag = nextFmt;
        count++;
      }
    }
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    console.log(`Updated ${count} episodes in local-db.json.`);
  }

  // 2. Update PostgreSQL database
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('No DATABASE_URL configured, skipping PostgreSQL update.');
    return;
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  console.log('Connecting to PostgreSQL database to update formats...');
  const { rows } = await pool.query('SELECT id, title, format_tag FROM episodes');
  let dbCount = 0;
  for (const ep of rows) {
    const nextFmt = inferFormat(ep.title);
    if (ep.format_tag !== nextFmt) {
      await pool.query('UPDATE episodes SET format_tag = $1 WHERE id = $2', [
        nextFmt,
        ep.id,
      ]);
      dbCount++;
    }
  }

  console.log(`Updated ${dbCount} episodes in PostgreSQL.`);

  const summary = await pool.query(`
    SELECT format_tag, count(*) AS count 
    FROM episodes 
    GROUP BY format_tag 
    ORDER BY count DESC
  `);
  console.log('Current format distribution in database:');
  console.table(summary.rows);

  await pool.end();
}

main().catch((err) => {
  console.error('Update formats failed:', err);
  process.exit(1);
});
