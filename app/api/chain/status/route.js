import { NextResponse } from 'next/server';
import { getUserFromRequest } from '../../../../lib/auth';
import { verifyChainIntegrity } from '../../../../lib/blockchain';
import getDb from '../../../../lib/db';

export const runtime = 'nodejs';

export async function GET(req) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const result = verifyChainIntegrity();
  const db = getDb();
  const latest = db.prepare('SELECT * FROM chain_blocks ORDER BY idx DESC LIMIT 10').all();

  return NextResponse.json({ ...result, latestBlocks: latest });
}
