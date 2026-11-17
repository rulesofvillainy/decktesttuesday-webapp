import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import {
  createMatch,
  deleteMatch,
  deleteSetting,
  getMatches,
  updateDeck,
  updateMatch,
} from '@/lib/db';
import { GameLogEntry, MatchFormat, MatchWinner } from '@/lib/types';
import { broadcastRealtimeEvent } from '@/lib/realtime';

export async function GET(req: NextRequest) {
  try {
    const episodeId = req.nextUrl.searchParams.get('episodeId') || undefined;
    const matches = await getMatches(episodeId);
    return NextResponse.json({ matches });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch matches';
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
    const episode_id = String(body.episode_id || '');
    const andy_deck_id = String(body.andy_deck_id || '');
    const kirsten_deck_id = String(body.kirsten_deck_id || '');
    const match_format = (body.match_format as MatchFormat) || 'Bo3';
    const andy_score = Number(body.andy_score ?? 0);
    const kirsten_score = Number(body.kirsten_score ?? 0);
    const game_log: GameLogEntry[] = Array.isArray(body.game_log)
      ? body.game_log
      : [];

    if (!episode_id || !andy_deck_id || !kirsten_deck_id) {
      return NextResponse.json(
        { error: 'episode_id, andy_deck_id, and kirsten_deck_id are required' },
        { status: 400 }
      );
    }

    const winner: MatchWinner =
      body.winner !== undefined
        ? body.winner
        : andy_score > kirsten_score
          ? 'Andy'
          : kirsten_score > andy_score
            ? 'Kirsten'
            : 'Draw';

    const match = await createMatch({
      episode_id,
      andy_deck_id,
      kirsten_deck_id,
      match_format,
      andy_score,
      kirsten_score,
      winner,
      game_log,
    });

    // When played in a match on stream, the deck is assigned to its live player
    await Promise.allSettled([
      updateDeck(andy_deck_id, { pilot: 'Andy' }),
      updateDeck(kirsten_deck_id, { pilot: 'Kirsten' }),
    ]);

    // Clear any active in-progress match for this episode
    await deleteSetting('live_match_' + episode_id);
    broadcastRealtimeEvent('live_match_cleared', { episodeId: episode_id });

    broadcastRealtimeEvent('match_created', { match, episode_id });

    return NextResponse.json({ match });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to record match';
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
    const id = String(body.id || '');
    if (!id) {
      return NextResponse.json(
        { error: 'Match id is required' },
        { status: 400 }
      );
    }

    const andy_score =
      body.andy_score !== undefined ? Number(body.andy_score) : undefined;
    const kirsten_score =
      body.kirsten_score !== undefined ? Number(body.kirsten_score) : undefined;

    let winner: MatchWinner | undefined = body.winner;
    if (
      winner === undefined &&
      andy_score !== undefined &&
      kirsten_score !== undefined
    ) {
      winner =
        andy_score > kirsten_score
          ? 'Andy'
          : kirsten_score > andy_score
            ? 'Kirsten'
            : 'Draw';
    }

    const updated = await updateMatch(id, {
      andy_deck_id: body.andy_deck_id,
      kirsten_deck_id: body.kirsten_deck_id,
      match_format: body.match_format,
      andy_score,
      kirsten_score,
      winner,
      game_log: body.game_log,
    });

    broadcastRealtimeEvent('match_updated', { match: updated, id });

    return NextResponse.json({ match: updated });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to update match';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const id = req.nextUrl.searchParams.get('id') || '';
    if (!id) {
      return NextResponse.json(
        { error: 'Match id is required' },
        { status: 400 }
      );
    }
    const deleted = await deleteMatch(id);
    broadcastRealtimeEvent('match_deleted', { id });
    return NextResponse.json({ deleted });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to delete match';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
