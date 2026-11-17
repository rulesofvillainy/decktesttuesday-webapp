import { NextRequest, NextResponse } from 'next/server';
import { parseDecklistText } from '@/lib/deck-parser';
import { parseAndResolveDecklist } from '@/lib/lorcast';
import { LorcanaInk } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawDecklist = String(body.rawDecklist || '');
    const defaultInk = (body.defaultInk as LorcanaInk) || 'Amber';
    const resolveLorcast = body.resolveLorcast !== false;

    const validation = parseDecklistText(rawDecklist);

    if (!resolveLorcast || validation.validLines.length === 0) {
      return NextResponse.json({
        validation,
        parsedCards: [],
        totalCards: validation.totalCardCount,
        uninkableCount: 0,
      });
    }

    const resolved = await parseAndResolveDecklist(rawDecklist, defaultInk);
    return NextResponse.json({
      validation,
      ...resolved,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to parse decklist';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
