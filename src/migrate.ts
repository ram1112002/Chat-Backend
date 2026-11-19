import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './db';

async function main(): Promise<void> {
  const sql = readFileSync(join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Schema applied');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
