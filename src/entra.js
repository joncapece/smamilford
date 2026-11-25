// Microsoft Entra ID (Azure AD) sign-in for the parish directory, using OpenID Connect with PKCE.
// Only accounts from our own tenant are accepted, and roles come from the app roles assigned in Entra.
import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const LOGIN_TTL_MS = 10 * 60 * 1000;
const jwksByTenant = new Map();
const pending = new Map(); // state -> { verifier, nonce, next, expires }

// Returns the settings when Entra is set up (ENTRA_CLIENT_ID is present), otherwise null.
export function entraConfig(env = process.env, requestBase = '') {
  if (!env.ENTRA_CLIENT_ID) return null;
  if (!env.ENTRA_TENANT_ID || !env.ENTRA_CLIENT_SECRET) {
    throw new Error('ENTRA_TENANT_ID and ENTRA_CLIENT_SECRET must be set along with ENTRA_CLIENT_ID.');
  }
  return {
    tenant: env.ENTRA_TENANT_ID,
    clientId: env.ENTRA_CLIENT_ID,
    clientSecret: env.ENTRA_CLIENT_SECRET,
    publicUrl: (env.PUBLIC_URL || requestBase).replace(/\/$/, ''),
  };
}

export const redirectUri = (cfg) => `${cfg.publicUrl}/auth/callback`;
const issuer = (cfg) => `https://login.microsoftonline.com/${cfg.tenant}/v2.0`;

// Maps the app roles in the sign-in token to a website role. No role means no access.
export function roleFromClaims(roles = []) {
  if (roles.includes('Admin')) return 'admin';
  if (roles.includes('Editor')) return 'editor';
  return null;
}

function forget() {
  const now = Date.now();
  for (const [state, p] of pending) if (p.expires < now) pending.delete(state);
}

// The Microsoft sign-in address to send the person to.
export function loginUrl(cfg, next = '/') {
  forget();
  const state = crypto.randomBytes(16).toString('base64url');
  const nonce = crypto.randomBytes(16).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  pending.set(state, { verifier, nonce, next, expires: Date.now() + LOGIN_TTL_MS });
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: redirectUri(cfg),
    response_mode: 'query',
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/authorize?${params}`;
}

// Completes the sign-in after Microsoft sends the person back. Returns { name, email, role, next }
// or throws an Error whose message can be shown to the person.
export async function finishLogin(cfg, { code, state }) {
  forget();
  const p = pending.get(String(state || ''));
  pending.delete(String(state || ''));
  if (!p || p.expires < Date.now()) throw new Error('That sign-in link has expired. Please try again.');
  if (!code) throw new Error('Microsoft sign-in did not finish. Please try again.');

  const res = await fetch(`https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code: String(code),
      redirect_uri: redirectUri(cfg),
      code_verifier: p.verifier,
    }),
  });
  const tokens = await res.json().catch(() => ({}));
  if (!res.ok || !tokens.id_token) throw new Error('Microsoft did not accept the sign-in. Please try again.');

  if (!jwksByTenant.has(cfg.tenant)) {
    jwksByTenant.set(cfg.tenant, createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${cfg.tenant}/discovery/v2.0/keys`)));
  }
  const { payload } = await jwtVerify(tokens.id_token, jwksByTenant.get(cfg.tenant), {
    issuer: issuer(cfg),
    audience: cfg.clientId,
  });
  if (payload.nonce !== p.nonce) throw new Error('The sign-in did not match. Please try again.');
  if (payload.tid !== cfg.tenant) throw new Error('Only accounts from the parish directory can sign in here.');

  const role = roleFromClaims(payload.roles);
  if (!role) {
    throw new Error('Your account does not have access to edit the website yet. Please ask the parish office to add you.');
  }
  return {
    id: `entra:${payload.oid || payload.sub}`,
    name: payload.name || payload.preferred_username || 'Staff member',
    email: payload.preferred_username || payload.email || '',
    role,
    next: p.next,
  };
}
