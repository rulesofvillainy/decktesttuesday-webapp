'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ExternalLink, Eye, RotateCcw, Search } from 'lucide-react';
import {
  EPISODE_FORMATS,
  formatPlayedBy,
  INK_CONFIG,
  LORCANA_INKS,
  LORCANA_SETS,
} from '@/lib/constants';
import {
  Deck,
  EnrichedEpisode,
  EpisodeFormatTag,
  LorcanaInk,
} from '@/lib/types';
import { InkPairBadges } from './InkBadge';
import { DeckModal } from './DeckModal';
import { useRealtime } from '@/hooks/useRealtime';

interface EpisodeCatalogClientProps {
  initialEpisodes: EnrichedEpisode[];
}

type PilotRecordFilter = 'All' | 'Andy Won More' | 'Kirsten Won More' | 'Ties';

export function EpisodeCatalogClient({
  initialEpisodes,
}: EpisodeCatalogClientProps) {
  const [episodes, setEpisodes] = useState<EnrichedEpisode[]>(initialEpisodes);
  const [selectedSet, setSelectedSet] = useState<string>('All');
  const [selectedInks, setSelectedInks] = useState<LorcanaInk[]>([]);
  const [pilotFilter, setPilotFilter] = useState<PilotRecordFilter>('All');
  const [formatFilter, setFormatFilter] = useState<EpisodeFormatTag | 'All'>(
    'All'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectingDeck, setInspectingDeck] = useState<Deck | null>(null);

  useEffect(() => {
    setEpisodes(initialEpisodes);
  }, [initialEpisodes]);

  const refreshEpisodes = useCallback(async () => {
    try {
      const res = await fetch('/api/episodes', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.episodes) {
          setEpisodes(data.episodes);
        }
      }
    } catch (err) {
      console.error('Failed to refresh episodes catalog', err);
    }
  }, []);

  useRealtime((event) => {
    if (
      event.type === 'match_created' ||
      event.type === 'match_updated' ||
      event.type === 'match_deleted' ||
      event.type === 'deck_assigned' ||
      event.type === 'deck_unassigned' ||
      event.type === 'deck_created' ||
      event.type === 'deck_updated' ||
      event.type === 'episode_updated'
    ) {
      refreshEpisodes();
    }
  }, 5000);

  const availableSets = useMemo(() => {
    const set = new Set<string>();
    episodes.forEach((e) => {
      if (e.set_name) set.add(e.set_name);
    });
    return ['All', ...Array.from(set)];
  }, [episodes]);

  const toggleInk = (ink: LorcanaInk) => {
    setSelectedInks((prev) =>
      prev.includes(ink) ? prev.filter((i) => i !== ink) : [...prev, ink]
    );
  };

  const resetFilters = () => {
    setSelectedSet('All');
    setSelectedInks([]);
    setPilotFilter('All');
    setFormatFilter('All');
    setSearchQuery('');
  };

  const filteredEpisodes = useMemo(() => {
    return episodes.filter((ep) => {
      // 1. Set filter
      if (selectedSet !== 'All' && ep.set_name !== selectedSet) {
        return false;
      }

      // 2. Format filter
      if (formatFilter !== 'All' && ep.format_tag !== formatFilter) {
        return false;
      }

      // 3. Pilot filter
      if (pilotFilter === 'Andy Won More' && ep.episode_winner !== 'Andy') {
        return false;
      }
      if (
        pilotFilter === 'Kirsten Won More' &&
        ep.episode_winner !== 'Kirsten'
      ) {
        return false;
      }
      if (pilotFilter === 'Ties' && ep.episode_winner !== 'Tie') {
        return false;
      }

      // 4. Inks filter
      if (selectedInks.length > 0) {
        const episodeInks = new Set<LorcanaInk>();
        ep.decks.forEach((d) => {
          episodeInks.add(d.ink_one);
          episodeInks.add(d.ink_two);
        });

        if (selectedInks.length === 2) {
          const exactPairMatch = ep.decks.some(
            (d) =>
              (d.ink_one === selectedInks[0] &&
                d.ink_two === selectedInks[1]) ||
              (d.ink_one === selectedInks[1] && d.ink_two === selectedInks[0])
          );
          const bothPresent = selectedInks.every((ink) =>
            episodeInks.has(ink)
          );
          if (!exactPairMatch && !bothPresent) return false;
        } else {
          const matchesAllSelected = selectedInks.every((ink) =>
            episodeInks.has(ink)
          );
          if (!matchesAllSelected) return false;
        }
      }

      // 5. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inTitle = ep.title.toLowerCase().includes(q);
        const inSet = (ep.set_name || '').toLowerCase().includes(q);
        const inDate = ep.stream_date.includes(q);
        const inDecks = ep.decks.some(
          (d) =>
            d.deck_name.toLowerCase().includes(q) ||
            d.ink_one.toLowerCase().includes(q) ||
            d.ink_two.toLowerCase().includes(q)
        );
        if (!inTitle && !inSet && !inDate && !inDecks) return false;
      }

      return true;
    });
  }, [
    episodes,
    selectedSet,
    formatFilter,
    pilotFilter,
    selectedInks,
    searchQuery,
  ]);

  const hasFilters =
    selectedSet !== 'All' ||
    selectedInks.length > 0 ||
    pilotFilter !== 'All' ||
    formatFilter !== 'All' ||
    searchQuery.trim() !== '';

  return (
    <>
      <div className="space-y-6">
        {/* Filter Card */}
        <div className="brutal-card p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search stream title, set, date, or deck name..."
                className="brutal-input pl-10 text-sm py-2"
              />
            </div>

            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="brutal-btn bg-[#FFB703] text-black px-3.5 py-2 text-xs shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear Filters
              </button>
            )}
          </div>

          {/* Set Filter Pills */}
          <div className="space-y-1.5">
            <div className="text-xs font-mono uppercase text-[#00F5D4] font-bold">
              Filter by Lorcana Set:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableSets.map((setName) => {
                const isSelected = selectedSet === setName;
                return (
                  <button
                    key={setName}
                    type="button"
                    onClick={() => setSelectedSet(setName)}
                    className={`px-3 py-1 text-xs font-black uppercase border-[2px] border-black transition-all ${
                      isSelected
                        ? 'bg-[#00F5D4] text-black shadow-[2px_2px_0px_#000000]'
                        : 'bg-[#181920] text-neutral-300 hover:text-white'
                    }`}
                  >
                    {setName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ink Filters */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-black/50">
            <span className="text-xs font-mono uppercase text-neutral-400 mr-1 font-bold">
              Inks:
            </span>
            {LORCANA_INKS.map((ink) => {
              const cfg = INK_CONFIG[ink];
              const isSelected = selectedInks.includes(ink);
              return (
                <button
                  key={ink}
                  type="button"
                  onClick={() => toggleInk(ink)}
                  style={{
                    backgroundColor: isSelected ? cfg.color : '#181920',
                  }}
                  className={`brutal-btn px-3 py-1 text-xs flex items-center gap-1.5 ${
                    isSelected
                      ? `${cfg.textClass} ring-2 ring-white`
                      : 'text-neutral-200 hover:bg-[#282A32]'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-black/60 shrink-0 shadow-[1px_1px_0px_#000000]"
                    style={{ backgroundColor: cfg.color }}
                  />
                  <span>{ink}</span>
                </button>
              );
            })}
          </div>

          {/* Format & Result Chips */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-black/50 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-neutral-400 font-mono font-bold mr-1">
                Format:
              </span>
              {(['All', ...EPISODE_FORMATS] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setFormatFilter(fmt)}
                  className={`px-2.5 py-1 font-black uppercase border-[2px] border-black transition-colors ${
                    formatFilter === fmt
                      ? 'bg-[#FFB703] text-black shadow-[2px_2px_0px_#000000]'
                      : 'bg-[#1C0F2F] text-neutral-300 hover:text-white hover:bg-[#2A1545]'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-neutral-400 font-mono font-bold mr-1">
                Results:
              </span>
              {(
                [
                  'All',
                  'Andy Won More',
                  'Kirsten Won More',
                  'Ties',
                ] as PilotRecordFilter[]
              ).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPilotFilter(option)}
                  className={`px-2.5 py-1 font-black uppercase border-[2px] border-black transition-colors ${
                    pilotFilter === option
                      ? 'bg-[#FF2E93] text-white shadow-[2px_2px_0px_#000000]'
                      : 'bg-[#1C0F2F] text-neutral-300 hover:text-white hover:bg-[#2A1545]'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stream List */}
        {filteredEpisodes.length === 0 ? (
          <div className="brutal-card p-10 text-center space-y-3">
            <div className="text-lg font-black uppercase">
              No streams match your filter combinations
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="brutal-btn bg-[#00F5D4] text-black px-4 py-2 text-xs"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredEpisodes.map((ep) => (
              <article
                key={ep.id}
                className="brutal-card p-5 space-y-4 hover:border-neutral-700 transition-colors"
              >
                {/* Top Strip */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-[2px] border-black pb-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-neutral-400">
                      <span>{ep.stream_date}</span>
                      <span>•</span>
                      <span className="text-[#00F5D4] font-bold uppercase">
                        SET: {ep.set_name}
                      </span>
                      <span>•</span>
                      <span className="text-neutral-300 uppercase">
                        {ep.format_tag}
                      </span>
                      {ep.is_live && (
                        <span className="bg-[#FF2E93] text-white px-2 py-0.5 font-black uppercase text-[10px] border border-black">
                          LIVE
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/episodes/${ep.id}`}
                      className="block text-xl sm:text-2xl font-black uppercase tracking-tight text-white hover:text-[#00F5D4] transition-colors"
                    >
                      {ep.title}
                    </Link>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/episodes/${ep.id}`}
                      className="brutal-btn bg-[#00F5D4] text-black px-3.5 py-2 text-xs"
                    >
                      Decks &amp; Results
                    </Link>
                    {ep.vod_url && (
                      <a
                        href={ep.vod_url}
                        target="_blank"
                        rel="noreferrer"
                        className="brutal-btn bg-[#181920] text-white px-3 py-2 text-xs hover:bg-[#FF2E93]"
                        title="Watch on YouTube"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        VOD
                      </a>
                    )}
                  </div>
                </div>

                {/* Decks & Matches */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Decks */}
                  <div className="lg:col-span-6 space-y-2">
                    <div className="text-[11px] font-mono uppercase text-neutral-300 font-bold flex items-center justify-between">
                      <span>Decks Tested ({ep.decks.length})</span>
                      <span className="text-[10px]">Click deck to view</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ep.decks.map((deck) => (
                        <button
                          key={deck.id}
                          type="button"
                          onClick={() => setInspectingDeck(deck)}
                          className="text-left bg-[#1C0F2F] border-[2px] border-black p-2.5 flex flex-col justify-between gap-2 hover:border-[#00F5D4] transition-all group"
                        >
                          <div className="flex items-center justify-between gap-2 w-full">
                            <span className="font-black text-xs uppercase text-white truncate group-hover:text-[#00F5D4] transition-colors">
                              {deck.deck_name}
                            </span>
                            {(() => {
                              const played = formatPlayedBy(deck);
                              if (!played) return null;
                              return (
                                <span
                                  className={`text-[10px] font-mono font-bold shrink-0 ${
                                    played.includes('Andy')
                                      ? 'text-[#00F5D4]'
                                      : played.includes('Kirsten')
                                        ? 'text-[#FF4B91]'
                                        : 'text-[#FFB703]'
                                  }`}
                                >
                                  {played}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="flex items-center justify-between gap-1 w-full">
                            <InkPairBadges
                              inkOne={deck.ink_one}
                              inkTwo={deck.ink_two}
                              size="sm"
                            />
                            <span className="text-[10px] font-mono text-neutral-400 flex items-center gap-1 group-hover:text-white">
                              <Eye className="w-3 h-3" />
                              Inspect
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Matches */}
                  <div className="lg:col-span-6 space-y-2">
                    <div className="text-[11px] font-mono uppercase text-neutral-400 font-bold">
                      Match Results ({ep.matches.length})
                    </div>
                    <div className="space-y-1.5">
                      {ep.matches.map((m, idx) => (
                        <div
                          key={m.id}
                          className="bg-[#181920] border-[2px] border-black px-3 py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="font-mono font-bold text-neutral-400">
                            Match {idx + 1}
                          </span>
                          <div className="font-bold text-white truncate">
                            <span className="text-[#00F5D4]">
                              {m.andy_deck?.deck_name || 'Andy'}
                            </span>{' '}
                            <span className="font-mono font-black px-1.5 py-0.5 bg-[#282A32] border border-black mx-1">
                              {m.andy_score} - {m.kirsten_score}
                            </span>{' '}
                            <span className="text-[#FF4B91]">
                              {m.kirsten_deck?.deck_name || 'Kirsten'}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-neutral-400 shrink-0">
                            {m.match_format}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <DeckModal
        deck={inspectingDeck}
        onClose={() => setInspectingDeck(null)}
      />
    </>
  );
}
