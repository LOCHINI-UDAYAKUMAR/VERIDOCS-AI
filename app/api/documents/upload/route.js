import { NextResponse } from 'next/server';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getUserFromRequest, requireRole } from '../../../../lib/auth';
import { processDocument } from '../../../../lib/pipeline';
import { detectRealMimeType, safeExtensionForMime } from '../../../../lib/fileValidation';
import { checkRateLimit } from '../../../../lib/rateLimit';

export const runtime = 'nodejs';

const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg'];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(req) {
  const user = getUserFromRequest(req);
  if (!requireRole(user, ['organization', 'admin'])) {
    return NextResponse.json({ error: 'Only Organization or Admin accounts may upload documents.' }, { status: 403 });
  }

  const rl = checkRateLimit(req, 'upload', 30, 60_000); // 30 uploads/minute/IP — generous for legitimate bulk upload
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many uploads in a short time. Please slow down and try again.' }, { status: 429 });
  }

  let tempPath = null;
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided under field "file".' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File exceeds the 20MB limit.' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'File is empty.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // SECURITY: `file.type` is entirely client-supplied and trivially
    // spoofable (an attacker can upload arbitrary content while claiming
    // any Content-Type). Detect the REAL type from the file's magic bytes
    // and use that for every downstream decision — never the client claim.
    const realMime = detectRealMimeType(buffer);
    if (!realMime || !ALLOWED_MIME.includes(realMime)) {
      return NextResponse.json(
        { error: 'File content does not match an allowed type (PDF, PNG, or JPG). The file may be corrupted, empty, or a different format than its extension suggests.' },
        { status: 400 }
      );
    }

    // Extension is derived from the *validated* type, never from the
    // user-supplied filename — removes any path/extension manipulation risk.
    const safeExt = safeExtensionForMime(realMime);
    tempPath = path.join(os.tmpdir(), `veridocs-${uuidv4()}${safeExt}`);
    fs.writeFileSync(tempPath, buffer);

    const doc = await processDocument({
      tempFilePath: tempPath,
      originalFilename: file.name || 'upload',
      mimeType: realMime, // validated type, not the client's claim
      ownerId: user.id,
    });

    return NextResponse.json({ document: doc });
  } catch (e) {
    console.error('[upload] error:', e);
    // Don't leak internal exception details (stack traces, file paths, etc.) to the client.
    return NextResponse.json({ error: 'Document processing failed. Please try again or contact support if the problem persists.' }, { status: 500 });
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (e) { /* best effort cleanup */ }
    }
  }
}
