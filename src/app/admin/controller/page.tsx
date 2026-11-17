import React from 'react';
import { redirect } from 'next/navigation';
import { isAdminAuthenticated } from '@/lib/auth';
import { getDecks, getEnrichedEpisodes } from '@/lib/db';
import { MobileControllerClient } from '@/components/MobileControllerClient';

export const dynamic = 'force-dynamic';

export default async function MobileControllerPage({
  searchParams,
}: {
  searchParams: Promise<{ episodeId?: string }>;
}) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    redirect('/admin/login?next=/admin/controller');
  }

  const { episodeId } = await searchParams;
  const [episodes, decks] = await Promise.all([
    getEnrichedEpisodes(),
    getDecks(),
  ]);

  return (
    <div className="min-h-screen bg-[#160D24] text-[#F4F4F6]">
      <MobileControllerClient
        initialEpisodes={episodes}
        allDecks={decks}
        defaultEpisodeId={episodeId}
      />
    </div>
  );
}
