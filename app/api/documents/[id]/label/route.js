import { NextResponse } from 'next/server';
import { getUserFromRequest, requireRole } from '../../../../../lib/auth';
import getDb from '../../../../../lib/db';
import { getDocumentById } from '../../../../../lib/pipeline';
import { logAction } from '../../../../../lib/audit';

export const runtime = 'nodejs';

const VALID_LABELS = ['genuine', 'fraudulent', null];

/**
 * Records a human-confirmed ground-truth outcome for a document — this is
 * the actual real-world label the synthetic-data caveat in
 * training/train_trust_score.py is missing. Labeled documents can be
 * exported via training/export_labeled_data.mjs and blended into a
 * retrain, replacing the synthetic ground-truth function with real
 * outcomes as they accumulate.
 */
export async function POST(req, { params }) {
  const user = getUserFromRequest(req);
  if (!requireRole(user, ['admin', 'auditor'])) {
    return NextResponse.json({ error: 'Only Admin or Auditor accounts may label documents.' }, { status: 403 });
  }

  const doc = getDocumentById(params.id);
  if (!doc) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

  const { label } = await req.json();
  if (!VALID_LABELS.includes(label)) {
    return NextResponse.json({ error: "label must be 'genuine', 'fraudulent', or null to clear." }, { status: 400 });
  }

  const db = getDb();
  const now = label ? new Date().toISOString() : null;
  db.prepare('UPDATE documents SET humanLabel = ?, humanLabeledBy = ?, humanLabeledAt = ? WHERE id = ?')
    .run(label, label ? user.id : null, now, params.id);

  logAction({ userId: user.id, documentId: params.id, action: 'DOCUMENT_LABELED', details: { label } });

  return NextResponse.json({ ok: true, label });
}
