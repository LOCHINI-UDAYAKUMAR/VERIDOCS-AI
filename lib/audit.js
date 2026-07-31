import { v4 as uuidv4 } from 'uuid';
import getDb from './db';

export function logAction({ userId = null, documentId = null, action, details = null, ip = null }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO audit_logs (id, userId, documentId, action, details, ip, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(uuidv4(), userId, documentId, action, details ? JSON.stringify(details) : null, ip, new Date().toISOString());
}

export function getAuditLogs({ documentId, userId, limit = 100 } = {}) {
  const db = getDb();
  let query = 'SELECT * FROM audit_logs';
  const clauses = [];
  const params = [];
  if (documentId) { clauses.push('documentId = ?'); params.push(documentId); }
  if (userId) { clauses.push('userId = ?'); params.push(userId); }
  if (clauses.length) query += ' WHERE ' + clauses.join(' AND ');
  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);
  return db.prepare(query).all(...params);
}
