import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import getDb from '../../../../lib/db';
import { hashPassword, getUserFromRequest, requireRole } from '../../../../lib/auth';
import { logAction } from '../../../../lib/audit';

export const runtime = 'nodejs';

const ALL_ROLES = ['admin', 'organization', 'auditor', 'verifier'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Admin-only account creation — the replacement for the public
 * registration endpoint's previous (unsafe) ability to self-assign the
 * admin role. Only an authenticated admin may create another admin,
 * auditor, or organization account through this route.
 */
export async function POST(req) {
  const requester = getUserFromRequest(req);
  if (!requireRole(requester, ['admin'])) {
    return NextResponse.json({ error: 'Only Admin accounts may create new accounts here.' }, { status: 403 });
  }

  try {
    const { name, email, password, role } = await req.json();

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: 'name, email, password, and role are all required.' }, { status: 400 });
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Please provide a valid email address.' }, { status: 400 });
    }
    if (!ALL_ROLES.includes(role)) {
      return NextResponse.json({ error: `role must be one of: ${ALL_ROLES.join(', ')}` }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO users (id, name, email, password, role, createdAt) VALUES (?,?,?,?,?,?)`)
      .run(id, String(name).slice(0, 200), email.toLowerCase(), hashPassword(password), role, now);

    logAction({ userId: requester.id, action: 'USER_CREATED_BY_ADMIN', details: { createdEmail: email.toLowerCase(), role } });

    return NextResponse.json({ user: { id, name, email: email.toLowerCase(), role } });
  } catch (e) {
    console.error('[users/create] error:', e);
    return NextResponse.json({ error: 'Account creation failed.' }, { status: 500 });
  }
}
