import { NextRequest, NextResponse } from 'next/server';
import { syncYouTubeStreams } from '@/lib/youtube';

export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET?.trim();
    if (cronSecret) {
      const authHeader = req.headers.get('authorization');
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          { error: 'Unauthorized cron trigger' },
          { status: 401 }
        );
      }
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
