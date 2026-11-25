// Who is signed in. Staff sign in with Microsoft Entra (see entra.js); the site owner can also sign in
// with ADMIN_USER and ADMIN_PASSWORD, which keeps the site reachable if Entra is unavailable.
import crypto from 'node:crypto';
import { readJson, writeJson, withLock } from './content.js';

export const SESSION_COOKIE = 'session';
const FILE = 'sessions';
const SESSION_MS = 12 * 3600 * 1000;

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');

function cookieValue(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function createAuth({ adminUser, adminPassword }) {
  const owner = { id: 'owner', name: adminUser, email: '', role: 'admin' };

  const update = (fn) => withLock(FILE, async () => {
    const data = { sessions: [], ...(await readJson(FILE, {})) };
    const now = Date.now();
    data.sessions = data.sessions.filter((s) => s.expires > now);
    const out = await fn(data);
    await writeJson(FILE, data);
    return out;
  });

  // The signed-in person for this request, or null for visitors.
  async function currentUser(req) {
    // Only the session cookie counts. Browser-cached username and password prompts are ignored,
    // so signing out always works.
    const raw = cookieValue(req, SESSION_COOKIE);
    if (!raw) return null;
    const data = await readJson(FILE, { sessions: [] });
    const s = data.sessions.find((x) => x.hash === sha(raw) && x.expires > Date.now());
    return s ? { id: s.userId, name: s.name, email: s.email, role: s.role } : null;
  }

  // Starts a session for a person and returns the cookie value to send them.
  async function startSession({ id, name, email, role }) {
    const raw = token();
    await update((data) => {
      data.sessions.push({ hash: sha(raw), userId: id, name, email, role, expires: Date.now() + SESSION_MS });
    });
    return raw;
  }

  async function endSession(req) {
    const raw = cookieValue(req, SESSION_COOKIE);
    if (!raw) return;
    await update((data) => {
      data.sessions = data.sessions.filter((s) => s.hash !== sha(raw));
    });
  }

  // Owner sign-in with the ADMIN_USER / ADMIN_PASSWORD pair. Failed tries are slowed down per address.
  const failures = new Map();
  function ownerLogin(username, password, ip = '') {
    const key = `${ip}`;
    const f = failures.get(key);
    if (f && f.count >= 10 && Date.now() - f.since < 15 * 60 * 1000) return { error: 'Too many attempts. Wait a few minutes, then try again.' };
    if (String(username ?? '').trim() === adminUser && String(password ?? '') === adminPassword) {
      failures.delete(key);
      return { person: owner };
    }
    if (!f || Date.now() - f.since >= 15 * 60 * 1000) failures.set(key, { count: 1, since: Date.now() });
    else f.count += 1;
    return { error: 'That username or password is not right.' };
  }

  return { currentUser, startSession, endSession, ownerLogin };
}
