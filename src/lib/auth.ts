import crypto from 'node:crypto';
import { cookies } from 'next/headers';

export const ADMIN_COOKIE_NAME = 'dtt_admin_session';
const ADMIN_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEV_FALLBACK_ADMIN_PASSWORD = 'villainy';
const DEV_FALLBACK_SESSION_SECRET = 'dtt-rules-of-villainy-hmac-secret-2026';

function getAdminPassword(): string {
  const configured = process.env.ADMIN_PASSWORD?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_PASSWORD environment variable is required in production');
  }
  return DEV_FALLBACK_ADMIN_PASSWORD;
}

function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET environment variable is required in production');
  }
  return DEV_FALLBACK_SESSION_SECRET;
}

export function createAdminSessionToken(): string {
  const payload = `dtt-admin:${Date.now()}`;
  const hmac = crypto
    .createHmac('sha256', `${getSessionSecret()}:${getAdminPassword()}`)
    .update(payload)
    .digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${hmac}`;
}

export function verifyAdminSessionToken(token?: string | null): boolean {
  if (!token || !token.includes('.')) return false;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return false;

  try {
    const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    if (!payload.startsWith('dtt-admin:')) return false;
    const issuedAt = Number(payload.slice('dtt-admin:'.length));
    const now = Date.now();
    if (
      !Number.isFinite(issuedAt) ||
      issuedAt > now + 60_000 ||
      now - issuedAt > ADMIN_SESSION_MAX_AGE_MS
    ) {
      return false;
    }

    const expectedHmac = crypto
      .createHmac('sha256', `${getSessionSecret()}:${getAdminPassword()}`)
      .update(payload)
      .digest('hex');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedHmac, 'utf8');
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

export function verifyAdminPassword(inputPassword: string): boolean {
  const expected = getAdminPassword();
  if (!inputPassword) return false;
  // Hash both values before timingSafeEqual so password length cannot leak via timing
  const a = crypto.createHash('sha256').update(inputPassword, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME);
  return verifyAdminSessionToken(sessionCookie?.value);
}
