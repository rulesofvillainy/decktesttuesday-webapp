import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { getYouTubeImportData, lookupYouTubeStreamByUrl } from '@/lib/youtube';

export async function GET() {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await getYouTubeImportData();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch YouTube streams';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const url = String(body.url || body.youtube_url || '').trim();
    if (!url) {
      return NextResponse.json(
        { error: 'YouTube stream URL or video ID is required.' },
        { status: 400 }
      );
    }

    const result = await lookupYouTubeStreamByUrl(url);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to inspect YouTube URL';
    const status = message.toLowerCase().includes('valid youtube') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

