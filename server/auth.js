import crypto from 'crypto';
import { db } from './db.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_COOKIE = 'session_id';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function createUser({ email, phone, fname, lname, password, role = 'customer', gdprMarketingOptIn = false }) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return { ok: false, error: 'An account with this email already exists' };
  const now = new Date().toISOString();
  const verifyToken = crypto.randomBytes(24).toString('hex');
  const id = db.prepare(`
    INSERT INTO users (role, email, phone, fname, lname, password_hash, verify_token, gdpr_marketing_opt_in, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(role, email, phone || '', fname || '', lname || '', hashPassword(password), verifyToken, gdprMarketingOptIn ? 1 : 0, now).lastInsertRowid;
  return { ok: true, id, verifyToken };
}

export function verifyEmailToken(token) {
  const user = db.prepare('SELECT id FROM users WHERE verify_token = ?').get(token);
  if (!user) return false;
  db.prepare('UPDATE users SET email_verified = 1, verify_token = NULL WHERE id = ?').run(user.id);
  return true;
}

export function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
}

export function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

export function updateLastLogin(id) {
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), id);
}

export function createPasswordResetToken(email) {
  const user = findUserByEmail(email);
  if (!user) return null;
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').run(token, expires, user.id);
  return token;
}

export function resetPasswordWithToken(token, newPassword) {
  const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token);
  if (!user || !user.reset_token_expires || new Date(user.reset_token_expires) < new Date()) return false;
  db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?')
    .run(hashPassword(newPassword), user.id);
  return true;
}

export function createSession(userId) {
  const id = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(id, userId, now.toISOString(), expires.toISOString());
  return { id, expires };
}

export function destroySession(id) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function getUserBySession(sessionId) {
  if (!sessionId) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    destroySession(sessionId);
    return null;
  }
  return findUserById(row.user_id);
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

/* Attaches req.user (or null) based on the session cookie. Does not block
   the request — routes decide what to require via requireRole(). */
export function sessionMiddleware(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  req.sessionId = cookies[SESSION_COOKIE] || null;
  req.user = getUserBySession(req.sessionId);
  next();
}

export function setSessionCookie(res, session) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${session.id}; HttpOnly; SameSite=Lax; Path=/; Expires=${session.expires.toUTCString()}${secure}`);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

/* Role guard for staff/admin API routes. Accepts either a valid session
   with a sufficient role, or the legacy x-admin-secret header (useful for
   scripts/print-node webhook style access). */
export function requireRole(...roles) {
  return (req, res, next) => {
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    if (roles.includes('admin') && secret && secret === process.env.ADMIN_SECRET) return next();
    if (req.user && roles.includes(req.user.role)) return next();
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  };
}
