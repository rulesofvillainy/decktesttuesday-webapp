import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import {
  deleteSetting,
  getDeckById,
  getSetting,
  setSetting,
} from '@/lib/db';
import { broadcastRealtimeEvent } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    let episodeId = req.nextUrl.searchParams.get('episodeId');
    if (!episodeId) {
      episodeId = await getSetting('obs_active_episode_id');
    }

    if (!episodeId) {
      return NextResponse.json({ liveMatch: null });
    }

    const raw = await getSetting('live_match_' + episodeId);
    if (!raw) {
      return NextResponse.json({ liveMatch: null });
    }

    const liveMatch = JSON.parse(raw);

    // Enrich with current deck names and inks
    if (liveMatch.andy_deck_id && !liveMatch.andy_deck) {
      liveMatch.andy_deck = (await getDeckById(liveMatch.andy_deck_id)) || undefined;
    }
    if (liveMatch.kirsten_deck_id && !liveMatch.kirsten_deck) {
      liveMatch.kirsten_deck = (await getDeckById(liveMatch.kirsten_deck_id)) || undefined;
    }

    return NextResponse.json({ liveMatch });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch live match';
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
    const episode_id = String(body.episode_id || '').trim();
    const andy_deck_id = String(body.andy_deck_id || '').trim();
    const kirsten_deck_id = String(body.kirsten_deck_id || '').trim();
    const match_format = String(body.match_format || 'Bo3');
    const andy_score = Number(body.andy_score ?? 0);
    const kirsten_score = Number(body.kirsten_score ?? 0);
    const game_log = Array.isArray(body.game_log) ? body.game_log : [];

    if (!episode_id || !andy_deck_id || !kirsten_deck_id) {
      return NextResponse.json(
        { error: 'episode_id, andy_deck_id, and kirsten_deck_id are required' },
        { status: 400 }
      );
    }

    const [andy_deck, kirsten_deck] = await Promise.all([
      getDeckById(andy_deck_id),
      getDeckById(kirsten_deck_id),
    ]);

    const liveMatch = {
      episode_id,
      andy_deck_id,
      kirsten_deck_id,
      match_format,
      andy_score,
      kirsten_score,
      game_log,
      status: 'in_progress',
      started_at: body.started_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      andy_deck: andy_deck || undefined,
      kirsten_deck: kirsten_deck || undefined,
    };

    await setSetting('live_match_' + episode_id, JSON.stringify(liveMatch));

    broadcastRealtimeEvent('live_match_updated', {
      liveMatch,
      episodeId: episode_id,
    });

    return NextResponse.json({ success: true, liveMatch });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update live match';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let episodeId = req.nextUrl.searchParams.get('episodeId');
    if (!episodeId) {
      episodeId = await getSetting('obs_active_episode_id');
    }

    if (episodeId) {
      await deleteSetting('live_match_' + episodeId);
      broadcastRealtimeEvent('live_match_cleared', { episodeId });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to clear live match';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

