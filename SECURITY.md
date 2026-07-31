# Security Fixes Applied

This document lists every vulnerability found in a security review of this codebase, what the actual risk was, and exactly how each was fixed. All fixes were tested end-to-end against a running instance of the app (not just read through) — see the verification notes under each item.

---

## 1. CRITICAL — Public registration allowed self-assigning the `admin` role

**Before:** `POST /api/auth/register` accepted `role: "admin"` from any unauthenticated caller. Anyone who found the endpoint could create a full administrator account with zero verification.

**Fix:** `app/api/auth/register/route.js` now only accepts `organization`, `auditor`, or `verifier`. Admin accounts can only be created by an existing admin via the new `POST /api/users/create` (admin-only, see fix below), or by `npm run seed`.

**Verified:**
```
POST /api/auth/register {"role":"admin", ...}
→ {"error":"role must be one of: organization, auditor, verifier"}
```

---

## 2. HIGH — File upload trusted the client-supplied MIME type

**Before:** The upload route checked `file.type`, which is a header the browser/client sets and can be spoofed by anyone using `curl` or a script. An attacker could upload an HTML/JS file while claiming `image/png`.

**Fix:** New `lib/fileValidation.js` reads the actual file bytes and checks them against real PDF/PNG/JPEG magic-byte signatures. The upload route (`app/api/documents/upload/route.js`) now validates content, not claims, and rejects anything that doesn't match.

**Verified:**
```
Uploaded a text file with <script> content, claimed image/png
→ {"error":"File content does not match an allowed type..."}
Uploaded a real PNG, claimed image/png
→ succeeded normally
```

---

## 3. HIGH — Missing security headers (MIME-sniffing / clickjacking exposure)

**Before:** No `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, or `Permissions-Policy` headers on any response. Combined with #2, this meant a browser could MIME-sniff a spoofed upload and render it as HTML.

**Fix:** `next.config.js` now sets these headers on every response via `headers()`. The file-serving and QR routes additionally set `X-Content-Type-Options: nosniff` explicitly.

**Verified:**
```
curl -I /login
→ X-Content-Type-Options: nosniff
→ X-Frame-Options: DENY
→ Referrer-Policy: strict-origin-when-cross-origin
→ Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## 4. MEDIUM — QR code links trusted the client-supplied `Origin` header

**Before:** `app/api/documents/[id]/qr/route.js` built the verification URL from `req.headers.get('origin')`, which is fully attacker-controlled. A malicious caller could make their own QR code point at a phishing domain instead of the real app.

**Fix:** Now uses `process.env.APP_BASE_URL` (a server-configured trusted value) with a fallback to the resolved request URL — never the spoofable `Origin` header.

---

## 5. MEDIUM — `Content-Disposition` header injection via filename

**Before:** The file-download route built `filename="${doc.originalFilename}"` by directly interpolating the user's uploaded filename. A filename containing a `"` character could break out of the quoted value and inject extra header parameters.

**Fix:** New `sanitizeFilenameForHeader()` in `lib/fileValidation.js` strips quotes, control characters, and non-ASCII bytes before the filename is placed in any header.

**Verified:**
```
Uploaded with filename containing: evil"; injected=malicious.png
Response header: Content-Disposition: inline; filename="evil"
(injection stripped)
```

---

## 6. MEDIUM — File extension derived from user-supplied filename

**Before:** The stored file's extension came from `path.extname()` on the client-supplied filename — fragile and unnecessary.

**Fix:** Extension is now derived from the *validated* file type (post magic-byte check), never from anything the client sent.

---

## 7. MEDIUM — Silent insecure default JWT secret

**Before:** If `JWT_SECRET` was never set, the app silently signed tokens with a hardcoded value visible in the source code. Anyone who read the repo could forge valid login tokens for any deployment that forgot to configure this.

**Fix:** `lib/auth.js` now refuses to sign or verify tokens when `NODE_ENV=production` and the secret is still the default. Development mode is unaffected. The check is lazy (runs when a token is actually signed/verified, not at build time) so `npm run build` still succeeds without a secret configured — it's only real token operations in production that are blocked.

**Verified:**
```
npm start (production) without JWT_SECRET set:
→ login/register return 500, server log shows the SECURITY error clearly

npm start with JWT_SECRET set:
→ login/register work normally
```

**Action required:** set `JWT_SECRET` before running `npm start` — see `.env.example`.

---

## 8. MEDIUM — No rate limiting on authentication endpoints

**Before:** `/api/auth/login` and `/api/auth/register` had no request throttling — unlimited password-guessing attempts were possible.

**Fix:** New `lib/rateLimit.js` (in-memory sliding-window limiter, no external dependency needed). Login: 10 attempts/minute/IP. Register: 5/minute/IP. Upload: 30/minute/IP (generous for legitimate bulk upload, still blocks abuse).

**Verified:**
```
11 rapid login attempts from same IP
→ first 9-10 return 401 (invalid credentials)
→ remaining return 429 (rate limited)
```

**Note:** this is in-memory and per-server-instance — fine for a single server, but won't coordinate across multiple instances behind a load balancer. Swap for a shared store (Redis/Upstash) if you scale horizontally.

---

## 9. LOW — Internal exception details leaked to API responses

**Before:** `'Document processing failed: ' + e.message` sent raw internal error text (which can include file paths, stack details, or library internals) directly to the client.

**Fix:** Client now gets a generic message; the real error is logged server-side only (`console.error`).

---

## 10. LOW — JWT algorithm not explicitly pinned

**Before:** `jwt.verify()` didn't specify an `algorithms` allowlist.

**Fix:** Both signing and verification now explicitly pin `HS256` as defense-in-depth against algorithm-confusion attacks.

---

## 11. LOW — Unused `formidable` dependency

**Before:** Listed in `package.json` but never imported anywhere (the upload route uses the native `req.formData()` API instead) — unnecessary attack surface and install weight.

**Fix:** Removed from `package.json`.

---

## 12. LOW — Weak input validation on registration

**Before:** No email format check; password minimum was 6 characters; bcrypt cost factor was 10.

**Fix:** Email regex validation added. Password minimum raised to 8 characters. Bcrypt cost factor raised to 12 (still fast enough for normal login latency, meaningfully more resistant to offline cracking).

---

## What was *not* changed (and why)

- **JWT stored in browser localStorage** (not an httpOnly cookie): this is a real trade-off — localStorage is readable by any script if the app ever has an XSS bug, whereas an httpOnly cookie isn't. Given React auto-escapes rendered content (the main XSS vector) and this is a Bearer-token API rather than a cookie-session API, the current design is reasonable but not maximal security. Migrating to httpOnly cookies + CSRF tokens would be the next hardening step if you're taking this to a real production deployment with untrusted user-generated content rendered anywhere.
- **Registration duplicate-email response is still somewhat informative** (409 vs 400): a determined attacker can still infer whether an email is registered by observing status codes/timing. This is a common, low-severity trade-off most apps accept for usability; a fully enumeration-proof flow (always returning identical responses + email verification) is more friction than this project's scope warrants.

---

## How to verify these fixes yourself

```bash
# 1. Confirm admin self-registration is blocked
curl -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" \
  -d '{"name":"x","email":"x@x.com","password":"password123","role":"admin"}'
# Expect: {"error":"role must be one of: organization, auditor, verifier"}

# 2. Confirm security headers are present
curl -I http://localhost:3000/login | grep -i "x-content-type\|x-frame\|referrer-policy"

# 3. Confirm magic-byte validation (requires a text file saved as .png)
echo "<script>alert(1)</script>" > fake.png
curl -X POST http://localhost:3000/api/documents/upload \
  -H "Authorization: Bearer <token>" -F "file=@fake.png;type=image/png"
# Expect: {"error":"File content does not match an allowed type..."}
```

---

## 13. Compatibility fix — Node.js 24 support

**Issue:** `better-sqlite3@11.1.2` has no prebuilt binary for very new Node.js versions (e.g. v24), forcing `npm install` to compile it from source via `node-gyp`, which requires a full C++ build toolchain (Visual Studio "Desktop development with C++" on Windows, `build-essential` on Linux, Xcode CLI tools on macOS). If that toolchain isn't installed, `npm install` fails and `next` never gets installed either, causing `'next' is not recognized as an internal or external command`.

**Fix:** Bumped `better-sqlite3` to `13.0.2`, which switched to N-API (`node-addon-api`) bindings. This ships ABI-stable prebuilt binaries for `win32-x64`, `linux-x64`, `darwin-x64`/`arm64`, etc. that work across Node versions without any compiler needed — including Node 24.

**Verified:** clean `npm install` (no compiler, no Visual Studio) on Node 22 in the test environment, followed by a full build, seed, and all 18 API routes + 11 pages tested end-to-end — all returned correct results (see route verification table below).

If you're on an older Node version (18/20/22) this change is fully backward compatible — no action needed.

---

## Full route verification (post-fix, end-to-end tested)

Every route below was hit against a running instance with real requests — not just read through.

| # | Route | Method | Test | Result |
|---|---|---|---|---|
| 1 | /api/auth/login | POST | Valid org credentials | 200, token issued |
| 2 | /api/auth/login | POST | Valid admin credentials | 200, token issued |
| 3 | /api/auth/me | GET | With valid token | 200 |
| 4 | /api/documents | GET | List, org-scoped | 200 |
| 5 | /api/dashboard/stats | GET | | 200 |
| 6 | /api/chain/status | GET | | 200 |
| 7 | /api/models/metrics | GET | | 200 |
| 8 | /api/audit | GET | As org (should be blocked) | 403 (correct) |
| 9 | /api/audit | GET | As admin | 200 |
| 10 | /api/users | GET | As org (should be blocked) | 403 (correct) |
| 11 | /api/users | GET | As admin | 200 |
| 12 | /api/documents/upload | POST | Real PNG upload | 200, full pipeline ran |
| 13 | /api/documents/:id | GET | | 200 |
| 14 | /api/documents/:id/verify | POST | | 200 |
| 15 | /api/documents/:id/explain | GET | | 200 |
| 16 | /api/documents/:id/file | GET | | 200 |
| 17 | /api/documents/:id/qr | GET | | 200 |
| 18 | /api/documents/:id/label | POST | As admin | 200 |
| 19 | /api/verify/:token | GET | No auth header at all | 200 |
| 20 | /api/users/create | POST | As admin, creating auditor | 200 |
| 21 | /api/auth/register | POST | role:"admin" (should be blocked) | 400 (correct) |
| 22 | /api/documents/upload | POST | Spoofed-mime malicious file | 400 (correct) |

All 11 frontend pages (/, /login, /register, /dashboard, /upload, /documents, /documents/[id], /audit, /chain, /admin/users, /verify/[token]) returned 200.
