import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const DEFAULT_DEV_SECRET = 'veridocs-dev-secret-change-in-production';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_DEV_SECRET;
const JWT_EXPIRES_IN = '2h';
const JWT_ALGORITHM = 'HS256';
const BCRYPT_ROUNDS = 12;

// SECURITY: refuse to actually sign/verify tokens with the publicly-known
// default secret while running in production. This is checked lazily
// (inside the functions below) rather than at module-load time — a
// top-level throw here would also fire during `next build`'s static
// page-data collection, which imports this module without ever serving
// a real request, breaking the build entirely. Checking at call time
// means the build still succeeds, but the app will refuse to actually
// issue or accept tokens in production until JWT_SECRET is set.
function assertSecretIsSafeForProduction() {
  if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEFAULT_DEV_SECRET) {
    throw new Error(
      'SECURITY: JWT_SECRET is not set (or still the default dev value) while NODE_ENV=production. ' +
      'Set a long random JWT_SECRET in your environment before using auth in production. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
    );
  }
}

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

export function signToken(user) {
  assertSecretIsSafeForProduction();
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: JWT_ALGORITHM }
  );
}

export function verifyToken(token) {
  try {
    assertSecretIsSafeForProduction();
    // Explicitly pin the accepted algorithm — defense in depth against
    // algorithm-confusion attacks even though jsonwebtoken already
    // defaults away from "alg: none".
    return jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
  } catch (e) {
    return null;
  }
}

// Reads the bearer token from a standard Request object (App Router)
export function getUserFromRequest(req) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  return verifyToken(token);
}

export function requireRole(user, allowedRoles) {
  if (!user) return false;
  return allowedRoles.includes(user.role);
}
