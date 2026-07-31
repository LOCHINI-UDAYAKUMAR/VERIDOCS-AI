import { NextResponse } from 'next/server';
import getDb from '../../../lib/db';
import { getUserFromRequest } from '../../../lib/auth';

export const runtime = 'nodejs';

export async function GET(req) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const db = getDb();
  let rows;
  if (user.role === 'admin' || user.role === 'auditor') {
    rows = db.prepare('SELECT * FROM documents ORDER BY createdAt DESC').all();
  } else {
    rows = db.prepare('SELECT * FROM documents WHERE ownerId = ? ORDER BY createdAt DESC').all(user.id);
  }
  return NextResponse.json({ documents: rows });
}
