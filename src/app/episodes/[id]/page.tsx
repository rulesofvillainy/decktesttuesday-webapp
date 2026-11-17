import React from 'react';
import { notFound } from 'next/navigation';
import { getEnrichedEpisodeById } from '@/lib/db';
import { EpisodeDetailClient } from '@/components/EpisodeDetailClient';

export const dynamic = 'force-dynamic';

export default async function EpisodeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const episode = await getEnrichedEpisodeById(id);

  if (!episode) {
    notFound();
  }

  return <EpisodeDetailClient initialEpisode={episode} />;
}
