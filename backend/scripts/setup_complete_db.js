const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

async function init() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('1. Connected to PostgreSQL.');

  console.log('2. Resetting public schema...');
  await client.query('DROP SCHEMA IF EXISTS public CASCADE;');
  await client.query('CREATE SCHEMA public;');
  await client.query('GRANT ALL ON SCHEMA public TO postgres;');
  await client.query('GRANT ALL ON SCHEMA public TO public;');

  console.log('3. Applying complete DDL schema from schema.sql...');
  const schemaPath = path.join(__dirname, 'schema.sql');
  const ddl = fs.readFileSync(schemaPath, 'utf8');
  await client.query(ddl);
  console.log('   Schema applied successfully.');

  console.log('4. Seeding default tenant...');
  const BIZ_ID = '00000000-0000-0000-0000-000000000001';
  const BRANCH_ID = '00000000-0000-0000-0000-000000000002';
  await client.query(`
    INSERT INTO businesses (id, name, slug)
    VALUES ('${BIZ_ID}', 'Default Business', 'default-business')
    ON CONFLICT (id) DO NOTHING;
  `);
  await client.query(`
    INSERT INTO branches (id, business_id, name, slug)
    VALUES ('${BRANCH_ID}', '${BIZ_ID}', 'Main Branch', 'main-branch')
    ON CONFLICT (id) DO NOTHING;
  `);

  console.log('5. Seeding users...');
  const superHash = await bcrypt.hash('super8609', 10);
  const ownerHash = await bcrypt.hash('owner123', 10);
  const adminHash = await bcrypt.hash('admin123', 10);
  const staffHash = await bcrypt.hash('password123', 10);
  const pinHash = await bcrypt.hash('1234', 10);

  // Platform Super Admin
  await client.query(`
    INSERT INTO users (id, username, name, password_hash, role, is_active)
    VALUES ('00000000-0000-0000-0000-0000000000a1', 'superadmin', 'Platform Super Admin', $1, 'super_admin', true)
    ON CONFLICT DO NOTHING;
  `, [superHash]);

  // Business Owner
  await client.query(`
    INSERT INTO users (id, business_id, username, name, password_hash, role, is_active)
    VALUES ('00000000-0000-0000-0000-0000000000b1', '${BIZ_ID}', 'owner', 'Business Owner', $1, 'owner', true)
    ON CONFLICT DO NOTHING;
  `, [ownerHash]);

  // Branch Admin
  await client.query(`
    INSERT INTO users (id, business_id, branch_id, username, name, password_hash, pin_hash, role, is_active)
    VALUES ('00000000-0000-0000-0000-0000000000c1', '${BIZ_ID}', '${BRANCH_ID}', 'admin', 'Branch Admin', $1, $2, 'admin', true)
    ON CONFLICT DO NOTHING;
  `, [adminHash, pinHash]);

  // Cashier
  await client.query(`
    INSERT INTO users (id, business_id, branch_id, username, name, password_hash, pin_hash, role, is_active)
    VALUES ('00000000-0000-0000-0000-0000000000d1', '${BIZ_ID}', '${BRANCH_ID}', 'cashier1', 'Mike Cashier', $1, $2, 'cashier', true)
    ON CONFLICT DO NOTHING;
  `, [staffHash, pinHash]);

  // Waiter
  await client.query(`
    INSERT INTO users (id, business_id, branch_id, username, name, password_hash, pin_hash, role, is_active)
    VALUES ('00000000-0000-0000-0000-0000000000e1', '${BIZ_ID}', '${BRANCH_ID}', 'waiter1', 'Sarah Waiter', $1, $2, 'cafe_waiter', true)
    ON CONFLICT DO NOTHING;
  `, [staffHash, pinHash]);

  console.log('\n=========================================');
  console.log('  DATABASE INITIALIZED SUCCESSFULLY!');
  console.log('=========================================');
  console.log('Credentials:');
  console.log('  Super Admin: superadmin / super8609');
  console.log('  Owner:       owner      / owner123');
  console.log('  Admin:       admin      / admin123    (PIN: 1234)');
  console.log('  Cashier:     cashier1   / password123 (PIN: 1234)');
  console.log('  Waiter:      waiter1    / password123 (PIN: 1234)');
  console.log('=========================================\n');

  await client.end();
}

init().catch(err => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
