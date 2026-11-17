import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { getYouTubeImportData } from '@/lib/youtube';

export async function GET() {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await getYouTubeImportData();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch YouTube streams';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

