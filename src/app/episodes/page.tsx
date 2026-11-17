import React from 'react';
import { getEnrichedEpisodes } from '@/lib/db';
import { EpisodeCatalogClient } from '@/components/EpisodeCatalogClient';

export const dynamic = 'force-dynamic';

export default async function EpisodesCatalogPage() {
  const episodes = await getEnrichedEpisodes();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="border-b-[3px] border-black pb-4">
        <h1 className="text-3xl font-black uppercase tracking-tight text-white">
          Deck Test Tuesday Archive
        </h1>
        <p className="text-sm font-bold text-neutral-400 mt-1">
          Browse past streams, match results, and decklists.
        </p>
      </div>

      <EpisodeCatalogClient initialEpisodes={episodes} />
    </div>
  );
}
