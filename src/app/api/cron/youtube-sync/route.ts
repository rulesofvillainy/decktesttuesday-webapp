import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { syncYouTubeStreams } from '@/lib/youtube';

function hasValidCronBearer(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return false;
  const a = crypto.createHash('sha256').update(token, 'utf8').digest();
  const b = crypto.createHash('sha256').update(cronSecret, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  try {
    const [isAdmin, hasCronToken] = await Promise.all([
      isAdminAuthenticated(),
      Promise.resolve(hasValidCronBearer(req)),
    ]);

    // Fail closed unless caller is an authenticated admin OR supplies valid CRON_SECRET
    if (!isAdmin && !hasCronToken) {
      return NextResponse.json(
        { error: 'Unauthorized cron trigger' },
        { status: 401 }
      );
    }

    const result = await syncYouTubeStreams();
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to sync YouTube streams';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
