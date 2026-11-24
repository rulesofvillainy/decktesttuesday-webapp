import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import {
  approveSubmissionToLibrary,
  assignSubmissionToEpisode,
  createSubmission,
  getSubmissions,
  updateSubmissionStatus,
} from '@/lib/db';
import {
  checkDecklistBounds,
  parseDecklistText,
  validateDeckUrl,
} from '@/lib/deck-parser';
import { parseAndResolveDecklist } from '@/lib/lorcast';
import { checkSubmissionRateLimit, getClientIp } from '@/lib/rate-limit';
import { broadcastRealtimeEvent } from '@/lib/realtime';
import {
  LorcanaInk,
  PilotName,
  SubmissionFormatCategory,
  SubmissionStatus,
  SubmissionType,
} from '@/lib/types';

export async function GET(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const statusParam =
      (req.nextUrl.searchParams.get('status') as SubmissionStatus | 'All') ||
      'All';
    const submissions = await getSubmissions(statusParam);
    return NextResponse.json({ submissions });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch submissions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const rateCheck = checkSubmissionRateLimit(clientIp);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: rateCheck.reason || 'Too many submissions. Please try again later.',
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateCheck.retryAfterSeconds),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body.' },
        { status: 400 }
      );
    }

    // Silent honeypot check against automated bots
    if (body.website && String(body.website).trim().length > 0) {
      return NextResponse.json(
        { error: 'Invalid submission.' },
        { status: 400 }
      );
    }

    const deck_name = String(body.deck_name || '').trim();
    const submitter_name = String(body.submitter_name || '').trim();
    const ink_one = (body.ink_one as LorcanaInk) || 'Amber';
    const ink_two = (body.ink_two as LorcanaInk) || 'Amethyst';
    const submission_type =
      (body.submission_type as SubmissionType) || 'full_list';
    const deck_link = body.deck_link ? String(body.deck_link).trim() : null;
    const raw_decklist = body.raw_decklist
      ? String(body.raw_decklist).trim()
      : null;
    const format_category =
      (body.format_category as SubmissionFormatCategory) || 'Core';
    const notes = body.notes ? String(body.notes).trim() : null;

    if (!deck_name || !submitter_name) {
      return NextResponse.json(
        { error: 'Deck name and your submitter name are required.' },
        { status: 400 }
      );
    }

    if (deck_name.length > 120 || submitter_name.length > 80) {
      return NextResponse.json(
        { error: 'Deck name (max 120) or submitter name (max 80) is too long.' },
        { status: 400 }
      );
    }

    if (notes && notes.length > 1000) {
      return NextResponse.json(
        { error: 'Notes cannot exceed 1000 characters.' },
        { status: 400 }
      );
    }

    if (ink_one === ink_two) {
      return NextResponse.json(
        { error: 'Please select two distinct Lorcana ink colors.' },
        { status: 400 }
      );
    }

    // Validate deck_link regardless of submission_type to prevent stored XSS (e.g. javascript:)
    if (submission_type === 'link' || deck_link) {
      const check = validateDeckUrl(deck_link || '');
      if (!check.valid) {
        return NextResponse.json(
          { error: check.error || 'Invalid Dreamborn/Inkdecks link.' },
          { status: 400 }
        );
      }
    }

    if (raw_decklist) {
      const bounds = checkDecklistBounds(raw_decklist);
      if (!bounds.valid) {
        return NextResponse.json({ error: bounds.error }, { status: 400 });
      }
    }

    if (submission_type !== 'link') {
      const parsed = parseDecklistText(raw_decklist || '');
      if (!parsed.isValidDecklist) {
        return NextResponse.json(
          {
            error:
              parsed.invalidLines.length > 0
                ? `Line ${parsed.invalidLines[0].lineNumber} has invalid syntax: "${parsed.invalidLines[0].rawLine}"`
                : 'Please paste a valid Lorcana decklist.',
          },
          { status: 400 }
        );
      }
    }

    let parsed_cards = null;
    if (raw_decklist) {
      const resolved = await parseAndResolveDecklist(raw_decklist, ink_one);
      parsed_cards = resolved.parsedCards;
    }

    const submission = await createSubmission({
      deck_name,
      submitter_name,
      ink_one,
      ink_two,
      submission_type,
      deck_link,
      raw_decklist,
      parsed_cards,
      format_category,
      notes,
    });

    broadcastRealtimeEvent('submission_created', { submission });

    return NextResponse.json({ submission });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to submit deck';
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
    const action = String(body.action || 'status');

    if (!id) {
      return NextResponse.json(
        { error: 'Submission ID is required' },
        { status: 400 }
      );
    }

    if (
      action === 'approve' ||
      (action === 'status' && body.status === 'Approved')
    ) {
      const allSubs = await getSubmissions('All');
      const targetSub = allSubs.find((s) => s.id === id);
      if (!targetSub) {
        return NextResponse.json(
          { error: 'Submission not found' },
          { status: 404 }
        );
      }

      let parsedCards = targetSub.parsed_cards || [];
      if (parsedCards.length === 0 && targetSub.raw_decklist) {
        const resolved = await parseAndResolveDecklist(
          targetSub.raw_decklist,
          targetSub.ink_one
        );
        parsedCards = resolved.parsedCards;
      }

      const approved = await approveSubmissionToLibrary(id, parsedCards);
      if (!approved) {
        return NextResponse.json(
          { error: 'Submission not found' },
          { status: 404 }
        );
      }

      if (!approved.alreadyInLibrary) {
        broadcastRealtimeEvent('deck_created', { deck: approved.deck });
      }
      broadcastRealtimeEvent('submission_updated', {
        submission: approved.submission,
      });

      return NextResponse.json({
        submission: approved.submission,
        deck: approved.deck,
        alreadyInLibrary: approved.alreadyInLibrary,
      });
    }

    if (action === 'assign') {
      const episodeId = String(body.episodeId || '');
      const pilot = (body.pilot as PilotName) || 'Community Sub';
      if (!episodeId) {
        return NextResponse.json(
          { error: 'Target episodeId is required to assign submission' },
          { status: 400 }
        );
      }

      const allSubs = await getSubmissions('All');
      const targetSub = allSubs.find((s) => s.id === id);
      if (!targetSub) {
        return NextResponse.json(
          { error: 'Submission not found' },
          { status: 404 }
        );
      }

      let parsedCards = targetSub.parsed_cards || [];
      if (parsedCards.length === 0 && targetSub.raw_decklist) {
        const resolved = await parseAndResolveDecklist(
          targetSub.raw_decklist,
          targetSub.ink_one
        );
        parsedCards = resolved.parsedCards;
      }

      const assigned = await assignSubmissionToEpisode(
        id,
        episodeId,
        pilot,
        parsedCards
      );
      broadcastRealtimeEvent('deck_created', { deck: assigned?.deck });
      broadcastRealtimeEvent('deck_assigned', { episodeId });
      broadcastRealtimeEvent('submission_updated', {
        submission: assigned?.submission,
      });
      return NextResponse.json({ assigned });
    }

    const status = (body.status as SubmissionStatus) || 'Approved';
    const updated = await updateSubmissionStatus(id, status);
    if (!updated) {
      return NextResponse.json(
        { error: 'Submission not found' },
        { status: 404 }
      );
    }
    broadcastRealtimeEvent('submission_updated', { submission: updated });
    return NextResponse.json({ submission: updated });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to update submission';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
