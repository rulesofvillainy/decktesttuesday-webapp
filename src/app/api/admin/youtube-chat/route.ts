import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { fetchYouTubeLiveChatForEpisode } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const episodeId = req.nextUrl.searchParams.get('episodeId')?.trim() || undefined;
    const videoId = req.nextUrl.searchParams.get('videoId')?.trim() || undefined;
    const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1';

    if (!episodeId && !videoId) {
      return NextResponse.json(
        { error: 'episodeId or videoId is required' },
        { status: 400 }
      );
    }

    const result = await fetchYouTubeLiveChatForEpisode({
      episodeId,
      videoId,
      forceRefresh,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch YouTube live chat';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
