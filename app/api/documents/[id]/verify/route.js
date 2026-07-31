import { NextResponse } from 'next/server';
import { getUserFromRequest } from '../../../../../lib/auth';
import { reverifyDocument, getDocumentById } from '../../../../../lib/pipeline';
import { logAction } from '../../../../../lib/audit';

export const runtime = 'nodejs';

export async function POST(req, { params }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const existing = getDocumentById(params.id);
  if (!existing) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

  const canView = user.role === 'admin' || user.role === 'auditor' || existing.ownerId === user.id;
  if (!canView) return NextResponse.json({ error: 'You do not have access to this document.' }, { status: 403 });

  const result = reverifyDocument(params.id);
  logAction({
    userId: user.id,
    documentId: params.id,
    action: 'INTEGRITY_CHECK',
    details: { blockchainVerified: result.blockchainVerified, reason: result.verifyReason },
  });

  return NextResponse.json({
    blockchainVerified: result.blockchainVerified,
    reason: result.verifyReason,
    trustScore: result.trustScore,
    status: result.status,
  });
}
