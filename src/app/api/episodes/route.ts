import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import {
  createOrUpdateEpisode,
  getEnrichedEpisodeById,
  getEnrichedEpisodes,
  getFeaturedEpisode,
  setEpisodeLiveStatus,
  updateEpisode,
} from '@/lib/db';
import { ensureEpisodePlaceholders } from '@/lib/youtube';
import { EpisodeFormatTag } from '@/lib/types';
import { extractSetFromTitle } from '@/lib/constants';
import { broadcastRealtimeEvent } from '@/lib/realtime';

export async function GET(req: NextRequest) {
  try {
    const episodeId = req.nextUrl.searchParams.get('id');
    if (episodeId) {
      const episode = await getEnrichedEpisodeById(episodeId);
      if (!episode) {
        return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
      }
      return NextResponse.json({ episode });
    }

    if (req.nextUrl.searchParams.get('featured') === 'true') {
      const featured = await getFeaturedEpisode();
      return NextResponse.json(featured);
    }

    const isAdmin = await isAdminAuthenticated();
    const includeHidden =
      isAdmin && req.nextUrl.searchParams.get('includeHidden') === 'true';

    const episodes = await getEnrichedEpisodes({ includeHidden });
    return NextResponse.json({ episodes });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch episodes';
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
    const title = String(body.title || '').trim();
    if (!title) {
      return NextResponse.json(
        { error: 'Episode title is required' },
        { status: 400 }
      );
    }

    const set_name = body.set_name?.trim() || extractSetFromTitle(title);

    const episode = await createOrUpdateEpisode({
      title,
      episode_number: body.episode_number ? Number(body.episode_number) : null,
      youtube_video_id: body.youtube_video_id
        ? String(body.youtube_video_id).trim()
        : null,
      stream_date: body.stream_date || new Date().toISOString().split('T')[0],
      vod_url: body.vod_url ? String(body.vod_url).trim() : '',
      is_live: Boolean(body.is_live),
      is_upcoming: Boolean(body.is_upcoming),
      is_hidden: Boolean(body.is_hidden),
      set_name,
      format_tag: (body.format_tag as EpisodeFormatTag) || 'Core',
    });

    if (body.createPlaceholders !== false) {
      await ensureEpisodePlaceholders(episode.id);
    }

    broadcastRealtimeEvent('episode_created', { episode });

    return NextResponse.json({ episode });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to create episode';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const episodeId = String(body.episodeId || body.id || '');

    if (!episodeId) {
      return NextResponse.json(
        { error: 'episodeId is required' },
        { status: 400 }
      );
    }

    // If only toggling live status
    if (body.isLive !== undefined && body.title === undefined) {
      const updated = await setEpisodeLiveStatus(
        episodeId,
        Boolean(body.isLive)
      );
      broadcastRealtimeEvent('episode_live_toggled', { episodeId, isLive: Boolean(body.isLive), episode: updated });
      return NextResponse.json({ episode: updated });
    }

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = String(body.title).trim();
    if (body.episode_number !== undefined) {
      updates.episode_number =
        body.episode_number === null || body.episode_number === ''
          ? null
          : Number(body.episode_number);
    }
    if (body.stream_date !== undefined) updates.stream_date = body.stream_date;
    if (body.vod_url !== undefined) updates.vod_url = body.vod_url;
    if (body.is_live !== undefined) updates.is_live = Boolean(body.is_live);
    if (body.is_upcoming !== undefined) updates.is_upcoming = Boolean(body.is_upcoming);
    if (body.is_hidden !== undefined) updates.is_hidden = Boolean(body.is_hidden);
    if (body.set_name !== undefined) updates.set_name = String(body.set_name).trim();
    if (body.format_tag !== undefined) updates.format_tag = body.format_tag as EpisodeFormatTag;

    const updated = await updateEpisode(episodeId, updates);
    broadcastRealtimeEvent('episode_updated', { episode: updated });

    return NextResponse.json({ episode: updated });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to update episode';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
