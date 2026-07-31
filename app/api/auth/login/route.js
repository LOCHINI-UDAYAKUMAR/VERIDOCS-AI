import { NextResponse } from 'next/server';
import getDb from '../../../../lib/db';
import { verifyPassword, signToken } from '../../../../lib/auth';
import { logAction } from '../../../../lib/audit';
import { checkRateLimit } from '../../../../lib/rateLimit';

export const runtime = 'nodejs';

export async function POST(req) {
  // SECURITY: previously unlimited — allowed unbounded password-guessing
  // against any account. 10 attempts/minute/IP is generous for a real user
  // fumbling their password, but meaningfully slows down brute force.
  const rl = checkRateLimit(req, 'login', 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many login attempts. Please try again shortly.' }, { status: 429 });
  }

  try {
    const { email, password } = await req.json();
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'email and password are required.' }, { status: 400 });
    }
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user || !verifyPassword(password, user.password)) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }
    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    logAction({ userId: user.id, action: 'USER_LOGIN', details: { email: user.email } });
    const token = signToken(safeUser);
    return NextResponse.json({ token, user: safeUser });
  } catch (e) {
    console.error('[login] error:', e);
    return NextResponse.json({ error: 'Login failed.' }, { status: 500 });
  }
}
