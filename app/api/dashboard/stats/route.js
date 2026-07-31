import { NextResponse } from 'next/server';
import getDb from '../../../../lib/db';
import { getUserFromRequest } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function GET(req) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const db = getDb();
  const scoped = user.role === 'admin' || user.role === 'auditor';
  const where = scoped ? '' : 'WHERE ownerId = ?';
  const args = scoped ? [] : [user.id];

  const totals = db.prepare(`SELECT COUNT(*) as count FROM documents ${where}`).get(...args);
  const verified = db.prepare(`SELECT COUNT(*) as count FROM documents ${where ? where + ' AND' : 'WHERE'} status = 'Verified'`).get(...args, );
  const review = db.prepare(`SELECT COUNT(*) as count FROM documents ${where ? where + ' AND' : 'WHERE'} status = 'Needs Review'`).get(...args);
  const rejected = db.prepare(`SELECT COUNT(*) as count FROM documents ${where ? where + ' AND' : 'WHERE'} status = 'Rejected'`).get(...args);
  const avgTrust = db.prepare(`SELECT AVG(trustScore) as avg FROM documents ${where}`).get(...args);

  const byType = db.prepare(`
    SELECT documentType, COUNT(*) as count FROM documents ${where} GROUP BY documentType ORDER BY count DESC
  `).all(...args);

  const trend = db.prepare(`
    SELECT substr(createdAt, 1, 10) as day, COUNT(*) as count, AVG(trustScore) as avgTrust
    FROM documents ${where}
    GROUP BY day ORDER BY day ASC
  `).all(...args);

  return NextResponse.json({
    totalDocuments: totals.count,
    verifiedCount: verified.count,
    needsReviewCount: review.count,
    rejectedCount: rejected.count,
    averageTrustScore: avgTrust.avg ? Math.round(avgTrust.avg) : 0,
    byType,
    trend,
  });
}
