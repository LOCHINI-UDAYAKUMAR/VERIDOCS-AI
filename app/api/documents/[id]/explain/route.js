import { NextResponse } from 'next/server';
import { getUserFromRequest } from '../../../../../lib/auth';
import { getDocumentById, reverifyDocument } from '../../../../../lib/pipeline';
import { explainDocument } from '../../../../../lib/assistant';

export const runtime = 'nodejs';

export async function GET(req, { params }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const doc = getDocumentById(params.id);
  if (!doc) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

  const canView = user.role === 'admin' || user.role === 'auditor' || doc.ownerId === user.id;
  if (!canView) return NextResponse.json({ error: 'You do not have access to this document.' }, { status: 403 });

  const live = reverifyDocument(params.id);
  const explanation = explainDocument(live);
  return NextResponse.json({ explanation });
}
