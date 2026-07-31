// Seeds a starter Admin account so you can log in immediately.
// Run with: npm run seed
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'veridocs.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','organization','auditor','verifier')),
    createdAt TEXT NOT NULL
  );
`);

const seedUsers = [
  { name: 'System Admin', email: 'admin@veridocs.ai', password: 'admin123', role: 'admin' },
  { name: 'Acme University', email: 'org@veridocs.ai', password: 'org12345', role: 'organization' },
  { name: 'Jane Auditor', email: 'auditor@veridocs.ai', password: 'audit123', role: 'auditor' },
];

const insert = db.prepare(`INSERT INTO users (id, name, email, password, role, createdAt) VALUES (?,?,?,?,?,?)`);
const exists = db.prepare('SELECT id FROM users WHERE email = ?');

for (const u of seedUsers) {
  if (exists.get(u.email)) {
    console.log(`Skipping ${u.email} (already exists)`);
    continue;
  }
  insert.run(randomUUID(), u.name, u.email, bcrypt.hashSync(u.password, 10), u.role, new Date().toISOString());
  console.log(`Created ${u.role}: ${u.email} / ${u.password}`);
}

console.log('\nSeeding complete. Log in with any of the accounts above.');
