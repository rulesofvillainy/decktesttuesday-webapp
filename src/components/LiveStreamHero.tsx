'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Calendar,
  ExternalLink,
  Eye,
  Layers,
  Play,
  Radio,
  Tv,
} from 'lucide-react';
import { Deck, EnrichedEpisode } from '@/lib/types';
import { InkPairBadges } from './InkBadge';
import { DeckModal } from './DeckModal';
import { useRealtime } from '@/hooks/useRealtime';
import { formatPlayedBy } from '@/lib/constants';

interface LiveStreamHeroProps {
  episode: EnrichedEpisode | null;
  status: 'live' | 'upcoming' | 'latest';
}

export function LiveStreamHero({ episode, status }: LiveStreamHeroProps) {
  const [currentEpisode, setCurrentEpisode] = useState<EnrichedEpisode | null>(episode);
  const [currentStatus, setCurrentStatus] = useState<'live' | 'upcoming' | 'latest'>(status);
  const [inspectingDeck, setInspectingDeck] = useState<Deck | null>(null);

  // Sync state if props change from server
  useEffect(() => {
    setCurrentEpisode(episode);
    setCurrentStatus(status);
  }, [episode, status]);

  const refreshFeatured = useCallback(async () => {
    try {
      const res = await fetch('/api/episodes?featured=true', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.episode) {
          setCurrentEpisode(data.episode);
          if (data.status) setCurrentStatus(data.status);
        }
      }
    } catch (err) {
      console.error('Failed to refresh featured episode in hero', err);
    }
  }, []);

  // Real-time synchronization
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
      refreshFeatured();
    }
  }, 5000);

  if (!currentEpisode) return null;

  const videoId = currentEpisode.youtube_video_id;

  const statusBadge =
    currentStatus === 'live' || currentEpisode.is_live ? (
      <span className="inline-flex items-center gap-2 bg-[#FF2E93] text-white px-3 py-1 border-[2px] border-black font-black uppercase text-xs tracking-wider animate-pulse">
        <Radio className="w-3.5 h-3.5" />
        LIVE NOW
      </span>
    ) : currentStatus === 'upcoming' || currentEpisode.is_upcoming ? (
      <span className="inline-flex items-center gap-2 bg-[#FFB703] text-black px-3 py-1 border-[2px] border-black font-black uppercase text-xs tracking-wider">
        <Calendar className="w-3.5 h-3.5" />
        UPCOMING STREAM
      </span>
    ) : (
      <span className="inline-flex items-center gap-2 bg-[#282A32] text-neutral-200 px-3 py-1 border-[2px] border-black font-black uppercase text-xs tracking-wider">
        <Play className="w-3.5 h-3.5 text-[#00F5D4]" />
        LATEST STREAM
      </span>
    );

  return (
    <>
      <section className="brutal-card p-5 sm:p-7 space-y-6">
        {/* Status & Set Pill */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-[2px] border-black pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge}
            <span className="brutal-tag bg-[#00F5D4] text-black">
              SET: {currentEpisode.set_name}
            </span>
            <span className="text-xs font-mono text-neutral-400 font-bold ml-1">
              {currentEpisode.stream_date}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/episodes/${currentEpisode.id}`}
              className="brutal-btn bg-[#00F5D4] text-black px-3.5 py-1.5 text-xs"
            >
              View Stream &amp; Matches →
            </Link>
            {currentEpisode.vod_url && (
              <a
                href={currentEpisode.vod_url}
                target="_blank"
                rel="noreferrer"
                className="brutal-btn bg-[#181920] text-white px-3.5 py-1.5 text-xs hover:bg-[#FF2E93]"
                title="Watch on YouTube"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                YouTube VOD
              </a>
            )}
          </div>
        </div>

        {/* Video & Decks Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Embedded Stream */}
          <div className="lg:col-span-7 space-y-3">
            {videoId ? (
              <div className="aspect-video w-full bg-black border-[3px] border-black shadow-[4px_4px_0px_#000000] overflow-hidden">
                <iframe
                  className="w-full h-full"
                  src={`https://www.youtube.com/embed/${videoId}?rel=0`}
                  title={currentEpisode.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="aspect-video w-full bg-[#181920] border-[3px] border-black flex flex-col items-center justify-center text-center p-6 text-neutral-400">
                <Tv className="w-10 h-10 text-[#00F5D4] mb-2" />
                <span className="font-bold text-sm">
                  Stream scheduled for {currentEpisode.stream_date}
                </span>
              </div>
            )}

            <Link
              href={`/episodes/${currentEpisode.id}`}
              className="block font-black text-xl sm:text-2xl uppercase tracking-tight text-white hover:text-[#00F5D4] transition-colors"
            >
              {currentEpisode.title}
            </Link>
          </div>

          {/* Right: Decks Played on this Stream */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between border-b border-black pb-2">
              <span className="text-xs font-mono uppercase text-[#00F5D4] font-bold flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-[#FF2E93]" />
                Decks Tested on this Stream ({currentEpisode.decks.length})
              </span>
              <span className="text-[11px] font-mono text-neutral-400">
                Click deck to inspect
              </span>
            </div>

            {currentEpisode.decks.length === 0 ? (
              <div className="bg-[#1C0F2F] border-[2px] border-black p-4 text-xs font-mono text-neutral-300">
                Decks have not been assigned to this stream yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {currentEpisode.decks.map((deck) => (
                  <button
                    key={deck.id}
                    type="button"
                    onClick={() => setInspectingDeck(deck)}
                    className="w-full text-left bg-[#1C0F2F] border-[2px] border-black p-3 hover:border-[#00F5D4] hover:-translate-y-0.5 transition-all shadow-[2px_2px_0px_#000000] flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const played = formatPlayedBy(deck);
                          if (!played) return null;
                          return (
                            <span
                              className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 border border-black ${
                                played.includes('Andy')
                                  ? 'bg-[#3B1F54] text-[#00F5D4]'
                                  : 'bg-[#FF2E93] text-white'
                              }`}
                            >
                              {played}
                            </span>
                          );
                        })()}
                        <InkPairBadges
                          inkOne={deck.ink_one}
                          inkTwo={deck.ink_two}
                          size="sm"
                        />
                      </div>
                      <div className="font-black text-sm uppercase text-white truncate group-hover:text-[#00F5D4] transition-colors">
                        {deck.deck_name}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1 text-xs font-mono text-neutral-400 group-hover:text-white">
                      <Eye className="w-3.5 h-3.5" />
                      <span>View</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Deck Inspection Modal */}
      <DeckModal
        deck={inspectingDeck}
        onClose={() => setInspectingDeck(null)}
      />
    </>
  );
}
