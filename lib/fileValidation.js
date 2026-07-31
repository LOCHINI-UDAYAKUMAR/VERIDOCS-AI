/**
 * Validates the actual bytes of an uploaded file against its claimed MIME
 * type, instead of trusting the client-supplied Content-Type. Previously
 * the upload route only checked `file.type`, which is entirely set by the
 * browser/client and trivially spoofable — an attacker could upload any
 * file (e.g. an HTML file with an embedded <script>) while claiming
 * "image/png", bypassing the allowlist entirely.
 *
 * This checks the file's magic bytes (signature) instead, which is what
 * the file actually is, not what the client claims it is.
 */

const SIGNATURES = {
  'application/pdf': [{ bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 }], // %PDF
  'image/png': [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0 }],
  'image/jpeg': [{ bytes: [0xff, 0xd8, 0xff], offset: 0 }],
};

const EXTENSIONS = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
};

function matchesSignature(buffer, sig) {
  if (buffer.length < sig.offset + sig.bytes.length) return false;
  for (let i = 0; i < sig.bytes.length; i++) {
    if (buffer[sig.offset + i] !== sig.bytes[i]) return false;
  }
  return true;
}

/**
 * Returns the detected real MIME type based on file content, or null if
 * the bytes don't match any allowed signature — regardless of what the
 * client claimed. Callers should reject the upload if this returns null.
 */
export function detectRealMimeType(buffer) {
  for (const [mime, sigs] of Object.entries(SIGNATURES)) {
    if (sigs.some((sig) => matchesSignature(buffer, sig))) return mime;
  }
  return null;
}

/**
 * Returns a safe, fixed file extension derived from the *validated* MIME
 * type — never from the user-supplied filename. This removes any
 * possibility of extension-based path manipulation.
 */
export function safeExtensionForMime(mime) {
  return EXTENSIONS[mime] || '';
}

/**
 * Strips characters that could break out of a quoted Content-Disposition
 * header value or inject additional header parameters/newlines.
 */
export function sanitizeFilenameForHeader(filename) {
  return String(filename || 'file')
    .replace(/[\r\n"]/g, '')   // quotes and CR/LF are the actual injection vectors
    .replace(/[^\x20-\x7E]/g, '_') // keep it to printable ASCII for header safety
    .slice(0, 200) || 'file';
}
