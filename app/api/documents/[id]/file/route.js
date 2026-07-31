import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getUserFromRequest } from '../../../../../lib/auth';
import { getDocumentById, UPLOAD_DIR } from '../../../../../lib/pipeline';
import { sanitizeFilenameForHeader } from '../../../../../lib/fileValidation';

export const runtime = 'nodejs';

export async function GET(req, { params }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const doc = getDocumentById(params.id);
  if (!doc) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

  const canView = user.role === 'admin' || user.role === 'auditor' || doc.ownerId === user.id;
  if (!canView) return NextResponse.json({ error: 'You do not have access to this document.' }, { status: 403 });

  const filePath = path.join(UPLOAD_DIR, doc.storedFilename);
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'File missing from storage.' }, { status: 404 });

  const buffer = fs.readFileSync(filePath);
  // SECURITY: originalFilename is user-supplied; sanitize before placing it
  // inside a header value to prevent breaking out of the quoted string or
  // injecting additional Content-Disposition parameters.
  const safeName = sanitizeFilenameForHeader(doc.originalFilename);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': doc.mimeType,
      'Content-Disposition': `inline; filename="${safeName}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
