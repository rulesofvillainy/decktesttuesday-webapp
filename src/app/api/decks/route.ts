import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import {
  assignDeckToEpisode,
  createDeck,
  deleteDeck,
  getAllDecks,
  getDecks,
  pruneUnplayedDecksFromEndedEpisode,
  removeDeckFromEpisode,
  updateDeck,
} from '@/lib/db';
import { parseAndResolveDecklist } from '@/lib/lorcast';
import { LorcanaInk, PilotName } from '@/lib/types';
import { broadcastRealtimeEvent } from '@/lib/realtime';

export async function GET(req: NextRequest) {
  try {
    const episodeId = req.nextUrl.searchParams.get('episodeId') || undefined;
    const all = req.nextUrl.searchParams.get('all') === 'true';

    const decks = all || !episodeId
      ? await getAllDecks()
      : await getDecks(episodeId);

    return NextResponse.json({ decks });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch decks';
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

    // Check for assign/unassign actions
    if (body.action === 'assign') {
      const episodeId = String(body.episode_id || body.episodeId || '');
      const deckId = String(body.deck_id || body.deckId || '');
      if (!episodeId || !deckId) {
        return NextResponse.json(
          { error: 'episode_id and deck_id are required to assign' },
          { status: 400 }
        );
      }
      await assignDeckToEpisode(episodeId, deckId);
      broadcastRealtimeEvent('deck_assigned', { episodeId, deckId });
      return NextResponse.json({ assigned: true, episode_id: episodeId, deck_id: deckId });
    }

    if (body.action === 'unassign') {
      const episodeId = String(body.episode_id || body.episodeId || '');
      const deckId = String(body.deck_id || body.deckId || '');
      if (!episodeId || !deckId) {
        return NextResponse.json(
          { error: 'episode_id and deck_id are required to unassign' },
          { status: 400 }
        );
      }
      await removeDeckFromEpisode(episodeId, deckId);
      broadcastRealtimeEvent('deck_unassigned', { episodeId, deckId });
      return NextResponse.json({ unassigned: true, episode_id: episodeId, deck_id: deckId });
    }

    if (body.action === 'prune_unplayed') {
      const episodeId = String(body.episode_id || body.episodeId || '');
      if (!episodeId) {
        return NextResponse.json(
          { error: 'episode_id is required to prune unplayed decks' },
          { status: 400 }
        );
      }
      const removedDeckIds = await pruneUnplayedDecksFromEndedEpisode(episodeId);
      if (removedDeckIds.length > 0) {
        broadcastRealtimeEvent('deck_unassigned', { episodeId, removedDeckIds });
      }
      return NextResponse.json({
        pruned: true,
        episode_id: episodeId,
        removed_deck_ids: removedDeckIds,
      });
    }

    const deck_name = String(body.deck_name || '').trim();
    const pilot = (body.pilot as PilotName) || 'Unassigned';
    const built_by = body.built_by ? String(body.built_by).trim() : null;
    const ink_one = (body.ink_one as LorcanaInk) || 'Amber';
    const ink_two = (body.ink_two as LorcanaInk) || 'Steel';
    const raw_decklist = String(body.raw_decklist || '');
    const episode_id = body.episode_id ? String(body.episode_id) : null;
    const deck_link = body.deck_link ? String(body.deck_link) : null;
    const notes = body.notes ? String(body.notes) : null;

    if (!deck_name) {
      return NextResponse.json(
        { error: 'Deck name is required' },
        { status: 400 }
      );
    }

    let parsed_cards = Array.isArray(body.parsed_cards)
      ? body.parsed_cards
      : [];
    if (parsed_cards.length === 0 && raw_decklist.trim()) {
      const resolved = await parseAndResolveDecklist(raw_decklist, ink_one);
      parsed_cards = resolved.parsedCards;
    }

    const deck = await createDeck({
      episode_id,
      pilot,
      built_by,
      deck_name,
      ink_one,
      ink_two,
      deck_link,
      notes,
      raw_decklist,
      parsed_cards,
    });

    broadcastRealtimeEvent('deck_created', { deck });

    return NextResponse.json({ deck });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to create deck';
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
        { error: 'Deck id is required' },
        { status: 400 }
      );
    }

    const ink_one = (body.ink_one as LorcanaInk) || 'Amber';
    let parsed_cards = body.parsed_cards;

    if (body.raw_decklist !== undefined) {
      const raw = String(body.raw_decklist || '').trim();
      if (raw) {
        const resolved = await parseAndResolveDecklist(raw, ink_one);
        parsed_cards = resolved.parsedCards;
      } else {
        parsed_cards = [];
      }
    }

    const updated = await updateDeck(id, {
      pilot: body.pilot as PilotName | undefined,
      built_by:
        body.built_by !== undefined
          ? body.built_by
            ? String(body.built_by).trim()
            : null
          : undefined,
      deck_name:
        body.deck_name !== undefined ? String(body.deck_name).trim() : undefined,
      ink_one: body.ink_one as LorcanaInk | undefined,
      ink_two: body.ink_two as LorcanaInk | undefined,
      deck_link:
        body.deck_link !== undefined
          ? body.deck_link
            ? String(body.deck_link).trim()
            : null
          : undefined,
      notes: body.notes !== undefined ? (body.notes ? String(body.notes) : null) : undefined,
      raw_decklist: body.raw_decklist,
      parsed_cards,
    });

    broadcastRealtimeEvent('deck_updated', { deck: updated });
    return NextResponse.json({ deck: updated });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to update deck';
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
        { error: 'Deck id is required' },
        { status: 400 }
      );
    }
    const deleted = await deleteDeck(id);
    broadcastRealtimeEvent('deck_deleted', { id });
    return NextResponse.json({ deleted });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to delete deck';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
