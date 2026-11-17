import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  isAdminAuthenticated,
  verifyAdminPassword,
} from '@/lib/auth';

function isHttpsRequest(req: NextRequest): boolean {
  const forwardedProto = req.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase();
  if (forwardedProto) {
    return forwardedProto === 'https';
  }
  return req.nextUrl.protocol === 'https:';
}

export async function GET() {
  const authenticated = await isAdminAuthenticated();
  return NextResponse.json({ authenticated });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const password = String(body.password || '');

    if (!verifyAdminPassword(password)) {
      return NextResponse.json(
        { error: 'Invalid master password. Access denied.' },
        { status: 401 }
      );
    }

    const token = createAdminSessionToken();
    const res = NextResponse.json({
      authenticated: true,
      message: 'Welcome back to the Villainy Control Room!',
    });

    res.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      // Only mark Secure when the request itself arrived over HTTPS (direct or via proxy),
      // so production HTTP access (e.g. IP/LAN before TLS setup) still persists the session cookie.
      secure: isHttpsRequest(req),
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return res;
  } catch {
    return NextResponse.json(
      { error: 'Failed to process authentication request' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ authenticated: false });
  res.cookies.set(ADMIN_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isHttpsRequest(req),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
