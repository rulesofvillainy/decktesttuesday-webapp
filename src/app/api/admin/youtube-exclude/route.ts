import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import {
  addExcludedYouTubeStream,
  removeExcludedYouTubeStream,
} from '@/lib/db';

export async function POST(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = body.action; // 'exclude' | 'include'
    const videoId = String(body.youtube_video_id || body.videoId || '').trim();

    if (!videoId) {
      return NextResponse.json(
        { error: 'youtube_video_id is required' },
        { status: 400 }
      );
    }

    if (action === 'exclude') {
      const title = String(body.title || 'Untitled Stream').trim();
      const publishedDate = body.published_date || null;
      await addExcludedYouTubeStream({
        youtube_video_id: videoId,
        title,
        published_date: publishedDate,
      });
      return NextResponse.json({
        success: true,
        action: 'exclude',
        message: 'Stream marked as excluded from future imports.',
      });
    } else if (action === 'include') {
      await removeExcludedYouTubeStream(videoId);
      return NextResponse.json({
        success: true,
        action: 'include',
        message: 'Stream restored and will show in available imports list.',
      });
    } else {
      return NextResponse.json(
        { error: "Invalid action. Must be 'exclude' or 'include'" },
        { status: 400 }
      );
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to update stream exclusion';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

