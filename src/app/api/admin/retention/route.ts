import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { getRetentionStats, pruneOldSubmissions } from '@/lib/db';

export async function GET() {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stats = await getRetentionStats(90);
  return NextResponse.json(stats);
}

export async function POST(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const days = Number(body.retentionDays || 90);
    const result = await pruneOldSubmissions(days > 0 ? days : 90);
    const updatedStats = await getRetentionStats(90);
    return NextResponse.json({
      ...result,
      stats: updatedStats,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to prune old submissions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
