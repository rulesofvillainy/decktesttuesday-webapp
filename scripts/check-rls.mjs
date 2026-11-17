import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const { rows } = await pool.query(`
    SELECT 
      tablename, 
      rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `);
  console.log('Tables and RLS status:');
  console.table(rows);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

