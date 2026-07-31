import { NextResponse } from 'next/server';
import { getUserFromRequest, requireRole } from '../../../lib/auth';
import getDb from '../../../lib/db';

export const runtime = 'nodejs';

export async function GET(req) {
  const user = getUserFromRequest(req);
  if (!requireRole(user, ['admin'])) {
    return NextResponse.json({ error: 'Only Admin accounts may view the user list.' }, { status: 403 });
  }
  const db = getDb();
  const users = db.prepare('SELECT id, name, email, role, createdAt FROM users ORDER BY createdAt DESC').all();
  return NextResponse.json({ users });
}
