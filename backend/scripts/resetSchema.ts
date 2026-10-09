import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();
  console.log('Connected to PostgreSQL database');

  console.log('Resetting schema public...');
  await client.query('DROP SCHEMA IF EXISTS public CASCADE;');
  await client.query('CREATE SCHEMA public;');
  await client.query('GRANT ALL ON SCHEMA public TO postgres;');
  await client.query('GRANT ALL ON SCHEMA public TO public;');
  console.log('Schema public reset successfully!');

  await client.end();
}

main().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
