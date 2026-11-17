'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { EnrichedEpisode } from '@/lib/types';
import { DeckVisualizer } from '@/components/DeckVisualizer';
import { InkPairBadges } from '@/components/InkBadge';
import { useRealtime } from '@/hooks/useRealtime';

interface EpisodeDetailClientProps {
  initialEpisode: EnrichedEpisode;
}

export function EpisodeDetailClient({ initialEpisode }: EpisodeDetailClientProps) {
  const [episode, setEpisode] = useState<EnrichedEpisode>(initialEpisode);

  const fetchFreshData = useCallback(async () => {
    try {
      const res = await fetch(`/api/episodes?id=${initialEpisode.id}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.episode) {
          setEpisode(data.episode);
        }
      }
    } catch (err) {
      console.error('Failed to refresh episode data', err);
    }
  }, [initialEpisode.id]);

  // Real-time updates subscription: refreshes immediately on matches, decks, or stream status changes
  useRealtime((event) => {
    if (
      event.type === 'match_created' ||
      event.type === 'match_updated' ||
      event.type === 'match_deleted' ||
      event.type === 'deck_assigned' ||
      event.type === 'deck_unassigned' ||
      event.type === 'deck_created' ||
      event.type === 'deck_updated' ||
      event.type === 'episode_updated' ||
      event.type === 'episode_live_toggled'
    ) {
      fetchFreshData();
    }
  }, 5000);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="brutal-btn bg-[#2E184A] text-white px-4 py-2 text-xs hover:bg-[#00F5D4] hover:text-black"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Streams
        </Link>

        {episode.vod_url && (
          <a
            href={episode.vod_url}
            target="_blank"
            rel="noreferrer"
            className="brutal-btn bg-[#FF2E93] text-white px-4 py-2 text-xs"
          >
            <ExternalLink className="w-4 h-4" />
            Watch on YouTube
          </a>
        )}
      </div>

      {/* Stream Video & Title */}
      <section className="brutal-card p-5 sm:p-6 space-y-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-neutral-400">
            <span>{episode.stream_date}</span>
            <span>•</span>
            <span className="text-[#00F5D4] font-bold uppercase">
              {episode.format_tag}
            </span>
            {episode.is_live && (
              <span className="brutal-tag bg-[#FF2E93] text-white animate-pulse text-[10px]">
                LIVE NOW
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-white">
            {episode.title}
          </h1>
        </div>

        {episode.youtube_video_id && (
          <div className="aspect-video w-full bg-black border-[3px] border-black">
            <iframe
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${episode.youtube_video_id}?rel=0`}
              title={episode.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
      </section>

      {/* Match Results */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b-[3px] border-black pb-2">
          <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
            Match Results ({episode.matches.length})
          </h2>
          <span className="text-xs font-mono text-neutral-400">Real-Time Sync Active</span>
        </div>

        {episode.matches.length === 0 ? (
          <div className="brutal-card p-6 text-center text-sm font-bold text-neutral-400">
            No matches recorded for this stream yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {episode.matches.map((match, idx) => (
              <div
                key={match.id}
                className="brutal-card p-4 space-y-3 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between border-b border-black pb-2 text-xs font-mono">
                  <span className="font-black text-neutral-300 uppercase">
                    Match {idx + 1} ({match.match_format})
                  </span>
                  <span className="text-[#00F5D4] font-bold">
                    Winner: {match.winner || 'Draw'}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="bg-[#1C0F2F] border-[2px] border-black p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono text-[#A855F7] font-bold">
                        Andy
                      </div>
                      <div className="font-black text-xs uppercase text-white truncate">
                        {match.andy_deck?.deck_name || 'Deck'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {match.andy_deck && (
                        <InkPairBadges
                          inkOne={match.andy_deck.ink_one}
                          inkTwo={match.andy_deck.ink_two}
                          size="sm"
                        />
                      )}
                      <span className="text-xl font-black text-white w-6 text-right">
                        {match.andy_score}
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#1C0F2F] border-[2px] border-black p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono text-[#FF4B91] font-bold">
                        Kirsten
                      </div>
                      <div className="font-black text-xs uppercase text-white truncate">
                        {match.kirsten_deck?.deck_name || 'Deck'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {match.kirsten_deck && (
                        <InkPairBadges
                          inkOne={match.kirsten_deck.ink_one}
                          inkTwo={match.kirsten_deck.ink_two}
                          size="sm"
                        />
                      )}
                      <span className="text-xl font-black text-white w-6 text-right">
                        {match.kirsten_score}
                      </span>
                    </div>
                  </div>
                </div>

                {match.game_log && match.game_log.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {match.game_log.map((g) => (
                      <span
                        key={g.game}
                        className="px-2 py-0.5 text-[11px] font-mono font-bold bg-[#1C0F2F] border border-black text-neutral-300"
                      >
                        G{g.game}: {g.winner}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Decklists */}
      <section className="space-y-5">
        <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white border-b-[3px] border-black pb-2">
          Decklists ({episode.decks.length})
        </h2>

        <div className="space-y-6">
          {episode.decks.map((deck) => (
            <DeckVisualizer key={deck.id} deck={deck} />
          ))}
        </div>
      </section>
    </div>
  );
}

