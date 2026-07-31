import { NextResponse } from 'next/server';
import getDb from '../../../../lib/db';
import { reverifyDocument } from '../../../../lib/pipeline';
import { logAction } from '../../../../lib/audit';

export const runtime = 'nodejs';

// Public endpoint — anyone with the QR token can check a document's status.
// Intentionally returns a minimal, non-sensitive payload (no OCR text, no
// owner PII beyond what's needed to identify the document type).
export async function GET(req, { params }) {
  const db = getDb();
  const row = db.prepare('SELECT id FROM documents WHERE qrToken = ?').get(params.token);
  if (!row) return NextResponse.json({ error: 'Invalid or unknown verification code.' }, { status: 404 });

  const live = reverifyDocument(row.id);
  logAction({ documentId: row.id, action: 'PUBLIC_QR_SCAN', details: { qrToken: params.token } });

  return NextResponse.json({
    documentType: live.documentType,
    originalFilename: live.originalFilename,
    status: live.status,
    trustScore: live.trustScore,
    blockchainVerified: live.blockchainVerified,
    verifiedAt: live.updatedAt,
    version: live.version,
  });
}
