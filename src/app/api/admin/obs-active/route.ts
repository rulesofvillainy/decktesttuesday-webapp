import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import {
  deleteSetting,
  getEnvOverlaySiteUrl,
  getEpisodeById,
  getEpisodes,
  getOverlaySiteUrl,
  getSetting,
  setSetting,
} from '@/lib/db';
import { broadcastRealtimeEvent } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const [assignedId, customSiteUrl, siteUrl] = await Promise.all([
      getSetting('obs_active_episode_id'),
      getSetting('obs_site_url'),
      getOverlaySiteUrl(),
    ]);
    const envSiteUrl = getEnvOverlaySiteUrl();
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
      siteUrl,
      customSiteUrl: customSiteUrl.trim(),
      envSiteUrl,
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

    // Update configurable OBS footer URL badge
    if (body.siteUrl !== undefined && body.episodeId === undefined) {
      const nextUrl = String(body.siteUrl ?? '').trim();
      if (nextUrl) {
        await setSetting('obs_site_url', nextUrl);
      } else {
        await deleteSetting('obs_site_url');
      }

      const resolvedSiteUrl = await getOverlaySiteUrl();
      broadcastRealtimeEvent('obs_site_url_updated', {
        siteUrl: resolvedSiteUrl,
      });

      return NextResponse.json({
        success: true,
        siteUrl: resolvedSiteUrl,
        customSiteUrl: nextUrl,
        envSiteUrl: getEnvOverlaySiteUrl(),
      });
    }

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
      siteUrl: await getOverlaySiteUrl(),
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to assign OBS episode';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

