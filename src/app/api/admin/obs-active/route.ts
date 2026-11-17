import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { getEpisodeById, getEpisodes, getSetting, setSetting } from '@/lib/db';
import { broadcastRealtimeEvent } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const assignedId = await getSetting('obs_active_episode_id');
    let targetEpisode = null;

    if (assignedId) {
      targetEpisode = await getEpisodeById(assignedId, { includeHidden: true });
    }

    // Fallback: Check for an episode marked is_live === true
    if (!targetEpisode) {
      const allEpisodes = await getEpisodes({ includeHidden: true });
      const liveEp = allEpisodes.find((e) => e.is_live);
      if (liveEp) {
        targetEpisode = liveEp;
      } else if (allEpisodes.length > 0) {
        // Fallback to latest episode
        targetEpisode = allEpisodes[0];
      }
    }

    return NextResponse.json({
      activeEpisodeId: targetEpisode ? targetEpisode.id : null,
      episode: targetEpisode,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch OBS active episode';
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
    const episodeId = String(body.episodeId || '').trim();

    if (!episodeId) {
      return NextResponse.json(
        { error: 'episodeId is required' },
        { status: 400 }
      );
    }

    const episode = await getEpisodeById(episodeId, { includeHidden: true });
    if (!episode) {
      return NextResponse.json(
        { error: 'Episode not found' },
        { status: 404 }
      );
    }

    await setSetting('obs_active_episode_id', episodeId);

    // Broadcast instant update so all OBS overlays and web pages switch in real time
    broadcastRealtimeEvent('obs_assigned', { episodeId, episodeTitle: episode.title });

    return NextResponse.json({
      success: true,
      activeEpisodeId: episodeId,
      episode,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to assign OBS episode';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

