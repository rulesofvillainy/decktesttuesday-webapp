import React, { Suspense } from 'react';
import { Metadata } from 'next';
import { ObsOverlayClient } from '@/components/ObsOverlayClient';
import { getSetting, getEnrichedEpisodeById, getEnrichedEpisodes, getDeckById } from '@/lib/db';

export const metadata: Metadata = {
  title: 'OBS Overlay | Deck Test Tuesday',
  description: 'Live match history overlay for Deck Test Tuesday livestreams.',
};

export const dynamic = 'force-dynamic';

export default async function ObsOverlayPage({
  searchParams,
}: {
  searchParams?: Promise<{ episodeId?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  let targetId = resolvedParams?.episodeId || null;

  if (!targetId) {
    targetId = await getSetting('obs_active_episode_id');
  }

  let episode = null;
  if (targetId) {
    episode = await getEnrichedEpisodeById(targetId);
  }

  if (!episode) {
    const all = await getEnrichedEpisodes({ includeHidden: true });
    episode = all.find((e) => e.is_live) || all[0] || null;
  }

  let liveMatch = null;
  const activeEpId = episode?.id || targetId;
  if (activeEpId) {
    const raw = await getSetting('live_match_' + activeEpId);
    if (raw) {
      try {
        liveMatch = JSON.parse(raw);
        if (liveMatch.andy_deck_id && !liveMatch.andy_deck) {
          liveMatch.andy_deck = (await getDeckById(liveMatch.andy_deck_id)) || undefined;
        }
        if (liveMatch.kirsten_deck_id && !liveMatch.kirsten_deck) {
          liveMatch.kirsten_deck = (await getDeckById(liveMatch.kirsten_deck_id)) || undefined;
        }
      } catch {
        // ignore
      }
    }
  }

  return (
    <Suspense
      fallback={
        <div className="w-[375px] h-[500px] flex items-center justify-center bg-transparent text-neutral-800 font-black text-sm">
          Loading OBS Overlay...
        </div>
      }
    >
      <ObsOverlayClient initialEpisode={episode} initialLiveMatch={liveMatch} />
    </Suspense>
  );
}
