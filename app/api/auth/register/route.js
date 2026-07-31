import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import getDb from '../../../../lib/db';
import { hashPassword, signToken } from '../../../../lib/auth';
import { logAction } from '../../../../lib/audit';
import { checkRateLimit } from '../../../../lib/rateLimit';

export const runtime = 'nodejs';

// SECURITY: 'admin' is deliberately excluded from public self-registration.
// Anyone hitting this endpoint could previously request role:'admin' and
// receive full administrative access with zero verification — a critical
// privilege-escalation bug. Admin accounts must be created by an existing
// admin (see POST /api/users/create — admin-only) or via `npm run seed`.
const PUBLIC_ROLES = ['organization', 'auditor', 'verifier'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req) {
  const rl = checkRateLimit(req, 'register', 5, 60_000); // 5 attempts / minute / IP
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many registration attempts. Please try again shortly.' }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { name, email, password, role } = body;

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: 'name, email, password, and role are all required.' }, { status: 400 });
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Please provide a valid email address.' }, { status: 400 });
    }
    if (!PUBLIC_ROLES.includes(role)) {
      return NextResponse.json({ error: `role must be one of: ${PUBLIC_ROLES.join(', ')}` }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      // Intentionally generic — avoids confirming an email is/isn't registered
      // beyond what's already implied by a normal signup flow.
      return NextResponse.json({ error: 'Unable to create account with the provided details.' }, { status: 409 });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO users (id, name, email, password, role, createdAt) VALUES (?,?,?,?,?,?)`)
      .run(id, String(name).slice(0, 200), email.toLowerCase(), hashPassword(password), role, now);

    const user = { id, name, email: email.toLowerCase(), role };
    logAction({ userId: id, action: 'USER_REGISTERED', details: { email: user.email, role } });

    const token = signToken(user);
    return NextResponse.json({ token, user });
  } catch (e) {
    console.error('[register] error:', e);
    return NextResponse.json({ error: 'Registration failed.' }, { status: 500 });
  }
}
