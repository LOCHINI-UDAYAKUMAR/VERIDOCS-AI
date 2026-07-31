import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getUserFromRequest } from '../../../../../lib/auth';
import { getDocumentById } from '../../../../../lib/pipeline';

export const runtime = 'nodejs';

export async function GET(req, { params }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const doc = getDocumentById(params.id);
  if (!doc) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

  const canView = user.role === 'admin' || user.role === 'auditor' || doc.ownerId === user.id;
  if (!canView) return NextResponse.json({ error: 'You do not have access to this document.' }, { status: 403 });

  // SECURITY: the request's Origin header is entirely client-controlled —
  // a caller could set an arbitrary Origin to make the generated QR code
  // point at a phishing domain instead of this app. Prefer an explicit,
  // server-configured base URL; fall back to the request's own resolved
  // URL (not the spoofable Origin header) only if none is configured.
  const origin = process.env.APP_BASE_URL || new URL(req.url).origin;
  const verifyUrl = `${origin}/verify/${doc.qrToken}`;
  const pngBuffer = await QRCode.toBuffer(verifyUrl, { width: 300, margin: 1 });

  return new NextResponse(pngBuffer, { headers: { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff' } });
}
