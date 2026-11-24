import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { importSelectedStreams } from '@/lib/youtube';
import { broadcastRealtimeEvent } from '@/lib/realtime';

export async function POST(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const streams = Array.isArray(body.streams) ? body.streams : [];
    if (streams.length === 0) {
      return NextResponse.json(
        { error: 'No streams selected for import' },
        { status: 400 }
      );
    }

    const result = await importSelectedStreams(streams);
    broadcastRealtimeEvent('episode_created', {
      importedCount: result.importedCount,
    });
    broadcastRealtimeEvent('episode_updated', {
      importedCount: result.importedCount,
    });
    return NextResponse.json({
      success: true,
      message: `Successfully imported ${result.importedCount} stream${
        result.importedCount === 1 ? '' : 's'
      } into Deck Test Tuesday!`,
      importedCount: result.importedCount,
      episodes: result.episodes,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to import YouTube streams';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

