import { NextResponse } from 'next/server';
import { getUserFromRequest } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function GET(req) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  return NextResponse.json({ user });
}
