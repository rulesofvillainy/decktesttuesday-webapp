import crypto from 'node:crypto';
import { cookies } from 'next/headers';

export const ADMIN_COOKIE_NAME = 'dtt_admin_session';

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'villainy';
}

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    'dtt-rules-of-villainy-hmac-secret-2026'
  );
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
    const expectedHmac = crypto
      .createHmac('sha256', `${getSessionSecret()}:${getAdminPassword()}`)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expectedHmac, 'utf8')
    );
  } catch {
    return false;
  }
}

export function verifyAdminPassword(inputPassword: string): boolean {
  const expected = getAdminPassword();
  if (!inputPassword) return false;
  const a = Buffer.from(inputPassword);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME);
  return verifyAdminSessionToken(sessionCookie?.value);
}
