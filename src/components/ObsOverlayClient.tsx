'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRealtime } from '@/hooks/useRealtime';
import { LorcanaInkIcon, LorcanaInkPairDots } from '@/components/LorcanaInkIcon';
import { EnrichedEpisode, EnrichedMatch } from '@/lib/types';

interface ObsOverlayClientProps {
  initialEpisodeId?: string | null;
  initialEpisode?: EnrichedEpisode | null;
  initialLiveMatch?: any | null;
}

export function ObsOverlayClient({ initialEpisodeId, initialEpisode, initialLiveMatch }: ObsOverlayClientProps) {
  const searchParams = useSearchParams();
  const paramEpisodeId = searchParams.get('episodeId') || initialEpisodeId;

  // Icon style: 'dot' (default, matches user sketch & compact) or 'official'
  const iconParam = searchParams.get('icons');
  const [iconMode, setIconMode] = useState<'dot' | 'official'>(
    iconParam === 'official' ? 'official' : 'dot'
  );

  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(
    paramEpisodeId || initialEpisode?.id || null
  );
  const [episode, setEpisode] = useState<EnrichedEpisode | null>(initialEpisode || null);
  const [matches, setMatches] = useState<EnrichedMatch[]>(() => {
    if (!initialEpisode?.matches) return [];
    return initialEpisode.matches.slice().sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  });
  const [liveMatch, setLiveMatch] = useState<{
    episode_id: string;
    andy_deck_id: string;
    kirsten_deck_id: string;
    match_format: string;
    andy_score: number;
    kirsten_score: number;
    andy_deck?: any;
    kirsten_deck?: any;
  } | null>(initialLiveMatch || null);
  const [loading, setLoading] = useState(!initialEpisode);
  const [error, setError] = useState<string | null>(null);

  // Fetch episode data & matches
  const fetchData = useCallback(async () => {
    try {
      let targetId = activeEpisodeId;

      // 1. If no target ID specified, discover currently assigned OBS stream from server
      if (!targetId) {
        const obsRes = await fetch('/api/admin/obs-active', { cache: 'no-store' });
        if (obsRes.ok) {
          const obsData = await obsRes.json();
          if (obsData.activeEpisodeId) {
            targetId = obsData.activeEpisodeId;
            setActiveEpisodeId(targetId);
          }
        }
      }

      // 2. Fetch specific episode data if target ID is known
      if (targetId) {
        const [res, liveRes] = await Promise.all([
          fetch(`/api/episodes?id=${encodeURIComponent(targetId)}`, { cache: 'no-store' }),
          fetch(`/api/matches/live?episodeId=${encodeURIComponent(targetId)}`, { cache: 'no-store' }).catch(() => null),
        ]);

        if (res.ok) {
          const data = await res.json();
          if (data.episode) {
            setEpisode(data.episode);
            const epMatches = (data.episode.matches || []).slice().sort((a: EnrichedMatch, b: EnrichedMatch) => {
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
            setMatches(epMatches);
            if (liveRes && liveRes.ok) {
              const liveData = await liveRes.json();
              setLiveMatch(liveData.liveMatch || null);
            }
            setError(null);
            setLoading(false);
            return;
          }
        }
      }

      // 3. Fallback: discover live or latest episode if targetId was invalid
      const listRes = await fetch('/api/episodes', { cache: 'no-store' });
      if (listRes.ok) {
        const listData = await listRes.json();
        const eps: EnrichedEpisode[] = listData.episodes || [];
        const fallbackEp = eps.find((e) => e.is_live) || eps[0] || null;
        setEpisode(fallbackEp);
        if (fallbackEp) {
          setActiveEpisodeId(fallbackEp.id);
          const epMatches = (fallbackEp.matches || []).slice().sort((a: EnrichedMatch, b: EnrichedMatch) => {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          setMatches(epMatches);

          try {
            const liveRes = await fetch(`/api/matches/live?episodeId=${encodeURIComponent(fallbackEp.id)}`, { cache: 'no-store' });
            if (liveRes.ok) {
              const liveData = await liveRes.json();
              setLiveMatch(liveData.liveMatch || null);
            }
          } catch {
            // ignore
          }
        } else {
          setMatches([]);
          setLiveMatch(null);
        }
      }
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading overlay');
    } finally {
      setLoading(false);
    }
  }, [activeEpisodeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-Time Event Subscription (SSE) without fallback interval spam
  useRealtime((event) => {
    // Ignore internal polling ticks so console is completely quiet while idle
    if (event.type === 'poll_tick') return;

    // Handle instant live match score updates
    if (event.type === 'live_match_updated') {
      const match = event.liveMatch as any;
      if (match) {
        setLiveMatch(match);
      }
      return;
    }

    if (event.type === 'live_match_cleared') {
      setLiveMatch(null);
      return;
    }

    // Handle OBS stream assignment change in real-time
    if (event.type === 'obs_assigned') {
      const newEpId = event.episodeId as string;
      if (!paramEpisodeId && newEpId && newEpId !== activeEpisodeId) {
        setActiveEpisodeId(newEpId);
        return;
      }
    }

    // Refetch on actual mutations (matches, decks, stream live status)
    if (
      event.type === 'match_created' ||
      event.type === 'match_updated' ||
      event.type === 'match_deleted' ||
      event.type === 'deck_assigned' ||
      event.type === 'deck_unassigned' ||
      event.type === 'episode_updated' ||
      event.type === 'obs_assigned'
    ) {
      fetchData();
    }
  }, 0);

  // Dynamic row sizing to fit 375x500 perfectly without overflowing
  const totalMatchCount = matches.length + (liveMatch ? 1 : 0);
  const isCompact = totalMatchCount >= 6;
  const isSuperCompact = totalMatchCount >= 8;

  const dotSize = isSuperCompact ? 8 : isCompact ? 9 : 9.5;
  const officialIconSize = isSuperCompact ? 12 : isCompact ? 13 : 14;
  const nameFontSize = isSuperCompact
    ? 'text-[9.5px] leading-tight tracking-tight'
    : isCompact
      ? 'text-[10px] leading-tight tracking-tight'
      : 'text-[11px] leading-tight tracking-tight';

  const scoreFontSize = isSuperCompact
    ? 'text-sm font-black'
    : isCompact
      ? 'text-base font-black'
      : 'text-lg font-black';

  const rowPadding = isSuperCompact
    ? 'py-1 px-1.5'
    : isCompact
      ? 'py-1.5 px-2'
      : 'py-2 px-2';

  return (
    <div
      data-obs-overlay="true"
      className="w-[375px] h-[500px] max-w-[375px] max-h-[500px] overflow-hidden select-none font-sans box-border bg-transparent flex flex-col p-1.5"
    >
      {/* Light Theme Neo-Brutalist Card */}
      <div className="w-full h-full flex flex-col bg-[#FFFDF7] border-[3px] border-black rounded-xl shadow-[4px_4px_0px_#000000] p-2.5 box-border overflow-hidden">
        {/* Top Header: ANDY vs KIRSTEN */}
        <div className="flex items-center justify-between gap-1.5 shrink-0 px-0.5">
          {/* Andy Badge */}
          <div className="flex items-center gap-1.5 bg-[#8B5CF6] text-white px-2.5 py-0.5 rounded-md border-[2px] border-black shadow-[2px_2px_0px_#000000]">
            <span className="font-black tracking-wider text-xs sm:text-sm">ANDY</span>
            {episode && episode.andy_episode_wins > 0 && (
              <span className="text-[10px] font-black bg-black/40 text-purple-100 px-1 py-0.2 rounded">
                {episode.andy_episode_wins}W
              </span>
            )}
          </div>

          {/* VS Center Badge */}
          <div
            onClick={() => setIconMode((prev) => (prev === 'dot' ? 'official' : 'dot'))}
            title="Click to toggle icon style (Dots vs Official)"
            className="cursor-pointer bg-[#FFB703] text-black font-black text-[10px] px-2 py-0.5 rounded border-[1.5px] border-black shadow-[1.5px_1.5px_0px_#000000] tracking-widest hover:bg-[#F59E0B] transition-colors"
          >
            VS
          </div>

          {/* Kirsten Badge */}
          <div className="flex items-center gap-1.5 bg-[#FF2E93] text-white px-2.5 py-0.5 rounded-md border-[2px] border-black shadow-[2px_2px_0px_#000000]">
            <span className="font-black tracking-wider text-xs sm:text-sm">KIRSTEN</span>
            {episode && episode.kirsten_episode_wins > 0 && (
              <span className="text-[10px] font-black bg-black/40 text-pink-100 px-1 py-0.2 rounded">
                {episode.kirsten_episode_wins}W
              </span>
            )}
          </div>
        </div>

        {/* Solid Black Divider Rule */}
        <div className="w-full border-b-[2px] border-black my-1.5 shrink-0" />

        {/* Content Area: Match Rows (fills available space) */}
        <div className="flex-1 flex flex-col justify-stretch gap-1.5 min-h-0 overflow-hidden">
          {loading && matches.length === 0 && !liveMatch ? (
            <div className="flex-1 flex items-center justify-center text-neutral-500 font-bold text-xs tracking-wide">
              Loading stream matches...
            </div>
          ) : matches.length === 0 && !liveMatch ? (
            /* Empty State: Plain text Match History */
            <div className="flex-1 flex items-center justify-center text-center">
              <span className="font-black text-base text-neutral-400 uppercase tracking-widest">
                Match History
              </span>
            </div>
          ) : (
            <>
              {/* 1. CURRENT LIVE MATCH (TOP OF THE LIST, SUBTLY HIGHLIGHTED) */}
              {liveMatch && (() => {
                const andyDeck = liveMatch.andy_deck;
                const kirstenDeck = liveMatch.kirsten_deck;
                const andyLeading = liveMatch.andy_score > liveMatch.kirsten_score;
                const kirstenLeading = liveMatch.kirsten_score > liveMatch.andy_score;

                return (
                  <div
                    key="live-current-match"
                    className={`flex-1 min-h-[34px] max-h-[76px] flex items-center justify-between border-[2px] border-black rounded-md shadow-[2px_2px_0px_#F59E0B] bg-[#FFFBEB] transition-colors ${rowPadding}`}
                    style={{
                      borderLeftWidth: '5px',
                      borderLeftColor: '#8B5CF6',
                      borderRightWidth: '5px',
                      borderRightColor: '#FF2E93',
                    }}
                  >
                    {/* ANDY'S SIDE: [Inks] [Deck Name] */}
                    <div className="flex items-center gap-1 flex-1 min-w-0 pr-0.5">
                      <div className="shrink-0 flex items-center">
                        {iconMode === 'official' ? (
                          <div className="flex items-center gap-0.5">
                            <LorcanaInkIcon ink={andyDeck?.ink_one} size={officialIconSize} variant="official" />
                            <LorcanaInkIcon ink={andyDeck?.ink_two} size={officialIconSize} variant="official" />
                          </div>
                        ) : (
                          <LorcanaInkPairDots
                            inkOne={andyDeck?.ink_one}
                            inkTwo={andyDeck?.ink_two}
                            size={dotSize}
                          />
                        )}
                      </div>

                      <span
                        className={`font-black uppercase truncate flex-1 min-w-0 text-left text-neutral-950 ${nameFontSize}`}
                        title={andyDeck?.deck_name || 'Andy Deck'}
                      >
                        {andyDeck?.deck_name || 'Andy Deck'}
                      </span>
                    </div>

                    {/* CENTER SCORE & SUBTLE IN-PROGRESS BADGE */}
                    <div className="flex flex-col items-center justify-center shrink-0 px-1 py-0.5">
                      <div className="flex items-center justify-center leading-none">
                        <span
                          className={`font-black tabular-nums min-w-[14px] text-right ${scoreFontSize} ${
                            andyLeading ? 'text-[#7C3AED]' : 'text-neutral-950'
                          }`}
                        >
                          {liveMatch.andy_score}
                        </span>
                        <span className="px-1 text-neutral-400 font-black text-xs select-none">-</span>
                        <span
                          className={`font-black tabular-nums min-w-[14px] text-left ${scoreFontSize} ${
                            kirstenLeading ? 'text-[#DB2777]' : 'text-neutral-950'
                          }`}
                        >
                          {liveMatch.kirsten_score}
                        </span>
                      </div>
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[7px] font-mono font-black uppercase text-amber-950 bg-[#FDE68A] px-1.5 py-0.2 rounded border border-amber-400 leading-none tracking-widest shadow-[0.5px_0.5px_0px_#000000]">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        LIVE
                      </span>
                    </div>

                    {/* KIRSTEN'S SIDE */}
                    <div className="flex items-center justify-end gap-1 flex-1 min-w-0 pl-0.5">
                      <span
                        className={`font-black uppercase truncate flex-1 min-w-0 text-right text-neutral-950 ${nameFontSize}`}
                        title={kirstenDeck?.deck_name || 'Kirsten Deck'}
                      >
                        {kirstenDeck?.deck_name || 'Kirsten Deck'}
                      </span>

                      <div className="shrink-0 flex items-center">
                        {iconMode === 'official' ? (
                          <div className="flex items-center gap-0.5">
                            <LorcanaInkIcon ink={kirstenDeck?.ink_one} size={officialIconSize} variant="official" />
                            <LorcanaInkIcon ink={kirstenDeck?.ink_two} size={officialIconSize} variant="official" />
                          </div>
                        ) : (
                          <LorcanaInkPairDots
                            inkOne={kirstenDeck?.ink_one}
                            inkTwo={kirstenDeck?.ink_two}
                            size={dotSize}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 2. COMPLETED MATCHES (NEWEST PUSHING OLDER MATCHES DOWN) */}
              {matches.map((match, idx) => {
                const isEven = idx % 2 === 0;
                const andyDeck = match.andy_deck;
                const kirstenDeck = match.kirsten_deck;

                const andyWon = match.andy_score > match.kirsten_score;
                const kirstenWon = match.kirsten_score > match.andy_score;

                return (
                  <div
                    key={match.id || idx}
                    className={`flex-1 min-h-[34px] max-h-[76px] flex items-center justify-between border-[1.5px] border-black rounded-md shadow-[1.5px_1.5px_0px_#000000] transition-colors ${rowPadding} ${
                      isEven ? 'bg-[#FFFFFF]' : 'bg-[#FFF9EB]'
                    }`}
                    style={{
                      borderLeftWidth: andyWon ? '4.5px' : '1.5px',
                      borderLeftColor: andyWon ? '#8B5CF6' : '#000000',
                      borderRightWidth: kirstenWon ? '4.5px' : '1.5px',
                      borderRightColor: kirstenWon ? '#FF2E93' : '#000000',
                    }}
                  >
                    {/* ANDY'S SIDE: [Inks] [Deck Name] */}
                    <div className="flex items-center gap-1 flex-1 min-w-0 pr-0.5">
                      <div className="shrink-0 flex items-center">
                        {iconMode === 'official' ? (
                          <div className="flex items-center gap-0.5">
                            <LorcanaInkIcon ink={andyDeck?.ink_one} size={officialIconSize} variant="official" />
                            <LorcanaInkIcon ink={andyDeck?.ink_two} size={officialIconSize} variant="official" />
                          </div>
                        ) : (
                          <LorcanaInkPairDots
                            inkOne={andyDeck?.ink_one}
                            inkTwo={andyDeck?.ink_two}
                            size={dotSize}
                          />
                        )}
                      </div>

                      <span
                        className={`font-black uppercase truncate flex-1 min-w-0 text-left ${nameFontSize} ${
                          andyWon ? 'text-neutral-950 font-black' : 'text-neutral-700 font-extrabold'
                        }`}
                        title={andyDeck?.deck_name || 'Andy Deck'}
                      >
                        {andyDeck?.deck_name || 'Andy Deck'}
                      </span>
                    </div>

                    {/* CENTER SCORE */}
                    <div className="flex items-center justify-center shrink-0 px-1">
                      <span
                        className={`font-black tabular-nums min-w-[14px] text-right ${scoreFontSize} ${
                          andyWon ? 'text-[#7C3AED]' : 'text-neutral-500'
                        }`}
                      >
                        {match.andy_score}
                      </span>
                      <span className="px-1 text-neutral-400 font-black text-xs select-none">-</span>
                      <span
                        className={`font-black tabular-nums min-w-[14px] text-left ${scoreFontSize} ${
                          kirstenWon ? 'text-[#DB2777]' : 'text-neutral-500'
                        }`}
                      >
                        {match.kirsten_score}
                      </span>
                    </div>

                    {/* KIRSTEN'S SIDE */}
                    <div className="flex items-center justify-end gap-1 flex-1 min-w-0 pl-0.5">
                      <span
                        className={`font-black uppercase truncate flex-1 min-w-0 text-right ${nameFontSize} ${
                          kirstenWon ? 'text-neutral-950 font-black' : 'text-neutral-700 font-extrabold'
                        }`}
                        title={kirstenDeck?.deck_name || 'Kirsten Deck'}
                      >
                        {kirstenDeck?.deck_name || 'Kirsten Deck'}
                      </span>

                      <div className="shrink-0 flex items-center">
                        {iconMode === 'official' ? (
                          <div className="flex items-center gap-0.5">
                            <LorcanaInkIcon ink={kirstenDeck?.ink_one} size={officialIconSize} variant="official" />
                            <LorcanaInkIcon ink={kirstenDeck?.ink_two} size={officialIconSize} variant="official" />
                          </div>
                        ) : (
                          <LorcanaInkPairDots
                            inkOne={kirstenDeck?.ink_one}
                            inkTwo={kirstenDeck?.ink_two}
                            size={dotSize}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
