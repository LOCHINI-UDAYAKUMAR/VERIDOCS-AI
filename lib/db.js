import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'veridocs.sqlite');

let db;

function getDb() {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','organization','auditor','verifier')),
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      originalFilename TEXT NOT NULL,
      storedFilename TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      fileSizeBytes INTEGER NOT NULL,
      documentType TEXT,
      classificationConfidence REAL,
      version INTEGER NOT NULL DEFAULT 1,
      parentId TEXT,
      sha256 TEXT NOT NULL,
      ocrText TEXT,
      ocrConfidence REAL,
      extractedFields TEXT,
      metadataJson TEXT,
      metadataFlags TEXT,
      forgeryScore REAL,
      forgeryFlags TEXT,
      duplicateScore REAL,
      duplicateOfId TEXT,
      embeddingJson TEXT,
      humanLabel TEXT,
      humanLabeledBy TEXT,
      humanLabeledAt TEXT,
      trustScore REAL,
      status TEXT NOT NULL DEFAULT 'processing',
      blockIndex INTEGER,
      qrToken TEXT UNIQUE,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(ownerId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS chain_blocks (
      idx INTEGER PRIMARY KEY AUTOINCREMENT,
      documentId TEXT NOT NULL,
      documentHash TEXT NOT NULL,
      previousBlockHash TEXT NOT NULL,
      blockHash TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      ownerId TEXT NOT NULL,
      version INTEGER NOT NULL,
      FOREIGN KEY(documentId) REFERENCES documents(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      userId TEXT,
      documentId TEXT,
      action TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      timestamp TEXT NOT NULL
    );
  `);

  // Idempotent migrations for databases created before these columns existed
  try { db.exec('ALTER TABLE documents ADD COLUMN embeddingJson TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE documents ADD COLUMN humanLabel TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE documents ADD COLUMN humanLabeledBy TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE documents ADD COLUMN humanLabeledAt TEXT'); } catch (e) {}

  return db;
}

export default getDb;
