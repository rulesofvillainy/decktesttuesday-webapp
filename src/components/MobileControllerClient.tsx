'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftRight,
  CheckCircle2,
  Edit3,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  Swords,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { LORCANA_INKS, MATCH_FORMATS } from '@/lib/constants';
import {
  Deck,
  EnrichedEpisode,
  EnrichedMatch,
  GameLogEntry,
  LorcanaInk,
  MatchFormat,
  MatchWinner,
} from '@/lib/types';
import { DeckSelectDropdown } from './DeckSelectDropdown';

interface MobileControllerClientProps {
  initialEpisodes: EnrichedEpisode[];
  allDecks: Deck[];
  defaultEpisodeId?: string;
}

export function MobileControllerClient({
  initialEpisodes,
  allDecks,
  defaultEpisodeId,
}: MobileControllerClientProps) {
  const router = useRouter();

  const [episodes, setEpisodes] = useState<EnrichedEpisode[]>(initialEpisodes);
  const [decks, setDecks] = useState<Deck[]>(allDecks);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const initialEp =
    episodes.find((e) => e.id === defaultEpisodeId) ||
    episodes.find((e) => e.is_live) ||
    episodes[0];

  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>(
    initialEp?.id || ''
  );

  const activeEpisode = useMemo(
    () =>
      episodes.find((e) => e.id === selectedEpisodeId) || episodes[0] || null,
    [episodes, selectedEpisodeId]
  );

  // Split decks into Assigned vs Other library decks for the active episode
  const assignedDecks = useMemo(() => {
    return decks.filter(
      (d) =>
        d.episode_id === selectedEpisodeId ||
        d.assigned_episodes?.some((a) => a.episode_id === selectedEpisodeId)
    );
  }, [decks, selectedEpisodeId]);

  const otherDecks = useMemo(() => {
    const assignedIds = new Set(assignedDecks.map((d) => d.id));
    return decks.filter((d) => !assignedIds.has(d.id));
  }, [decks, assignedDecks]);

  const episodeDecks = useMemo(() => {
    return assignedDecks.length > 0 ? assignedDecks : decks;
  }, [assignedDecks, decks]);

  const defaultAndyDeck =
    episodeDecks.find((d) => d.pilot === 'Andy') || episodeDecks[0];
  const defaultKirstenDeck =
    episodeDecks.find(
      (d) => d.pilot === 'Kirsten' && d.id !== defaultAndyDeck?.id
    ) ||
    episodeDecks.find((d) => d.id !== defaultAndyDeck?.id) ||
    episodeDecks[1] ||
    episodeDecks[0];

  const [andyDeckId, setAndyDeckId] = useState<string>(
    defaultAndyDeck?.id || ''
  );
  const [kirstenDeckId, setKirstenDeckId] = useState<string>(
    defaultKirstenDeck?.id || ''
  );
  const [matchFormat, setMatchFormat] = useState<MatchFormat>('Bo3');
  const [isMatchLive, setIsMatchLive] = useState(false);

  const [gameLog, setGameLog] = useState<GameLogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals
  const [liveEditDrawerOpen, setLiveEditDrawerOpen] = useState(false);
  const [manualAndyScore, setManualAndyScore] = useState(0);
  const [manualKirstenScore, setManualKirstenScore] = useState(0);

  const [quickDeckModalOpen, setQuickDeckModalOpen] = useState(false);
  const [quickDeckName, setQuickDeckName] = useState('');
  const [quickInkOne, setQuickInkOne] = useState<LorcanaInk>('Amber');
  const [quickInkTwo, setQuickInkTwo] = useState<LorcanaInk>('Steel');

  // Edit Logged Match Modal State
  const [editingLoggedMatch, setEditingLoggedMatch] =
    useState<EnrichedMatch | null>(null);
  const [editLoggedAndyDeckId, setEditLoggedAndyDeckId] = useState<string>('');
  const [editLoggedKirstenDeckId, setEditLoggedKirstenDeckId] =
    useState<string>('');
  const [editLoggedAndyScore, setEditLoggedAndyScore] = useState<number>(0);
  const [editLoggedKirstenScore, setEditLoggedKirstenScore] = useState<number>(0);
  const [editLoggedFormat, setEditLoggedFormat] = useState<MatchFormat>('Bo3');
  const [editingMatchSaving, setEditingMatchSaving] = useState(false);

  // Delete Logged Match Confirm State
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);

  // Fetch live in-progress match from server on stream selection
  useEffect(() => {
    if (!selectedEpisodeId) return;
    fetch(`/api/matches/live?episodeId=${selectedEpisodeId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.liveMatch) {
          setIsMatchLive(true);
          if (data.liveMatch.andy_deck_id)
            setAndyDeckId(data.liveMatch.andy_deck_id);
          if (data.liveMatch.kirsten_deck_id)
            setKirstenDeckId(data.liveMatch.kirsten_deck_id);
          if (data.liveMatch.match_format)
            setMatchFormat(data.liveMatch.match_format);
          if (Array.isArray(data.liveMatch.game_log))
            setGameLog(data.liveMatch.game_log);
        } else {
          setIsMatchLive(false);
        }
      })
      .catch(() => {});
  }, [selectedEpisodeId]);

  // Refresh handler (re-fetches episodes, decks, and active match)
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [epRes, deckRes] = await Promise.all([
        fetch('/api/episodes?includeHidden=true'),
        fetch('/api/decks'),
      ]);
      if (epRes.ok) {
        const epData = await epRes.json();
        if (Array.isArray(epData.episodes)) {
          setEpisodes(epData.episodes);
        }
      }
      if (deckRes.ok) {
        const deckData = await deckRes.json();
        if (Array.isArray(deckData.decks)) {
          setDecks(deckData.decks);
        }
      }
      if (selectedEpisodeId) {
        const liveRes = await fetch(
          `/api/matches/live?episodeId=${selectedEpisodeId}`
        );
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          if (liveData.liveMatch) {
            setIsMatchLive(true);
            if (liveData.liveMatch.andy_deck_id)
              setAndyDeckId(liveData.liveMatch.andy_deck_id);
            if (liveData.liveMatch.kirsten_deck_id)
              setKirstenDeckId(liveData.liveMatch.kirsten_deck_id);
            if (liveData.liveMatch.match_format)
              setMatchFormat(liveData.liveMatch.match_format);
            if (Array.isArray(liveData.liveMatch.game_log))
              setGameLog(liveData.liveMatch.game_log);
          } else {
            setIsMatchLive(false);
          }
        }
      }
      showToast('Controller data refreshed!');
    } catch (err) {
      console.error(err);
      showToast('Refresh failed.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3000);
  };

  const syncLiveMatch = async (
    currentAndyScore: number,
    currentKirstenScore: number,
    currentLog: GameLogEntry[]
  ) => {
    if (!activeEpisode || !andyDeckId || !kirstenDeckId) return;
    try {
      await fetch('/api/matches/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episode_id: activeEpisode.id,
          andy_deck_id: andyDeckId,
          kirsten_deck_id: kirstenDeckId,
          match_format: matchFormat,
          andy_score: currentAndyScore,
          kirsten_score: currentKirstenScore,
          game_log: currentLog,
        }),
      });
    } catch (err) {
      console.error('Failed to sync live match', err);
    }
  };

  const handleStartMatch = async () => {
    if (!activeEpisode || !andyDeckId || !kirstenDeckId) {
      showToast('Please select an active stream and both decks first.');
      return;
    }
    setGameLog([]);
    setIsMatchLive(true);
    showToast('⚔️ Match started! Decks locked in & displaying 0-0 on OBS overlay.');
    await syncLiveMatch(0, 0, []);
  };

  const handleResetMatch = async () => {
    if (activeEpisode && isMatchLive) {
      try {
        await fetch(`/api/matches/live?episodeId=${activeEpisode.id}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.error(err);
      }
    }
    setGameLog([]);
    setIsMatchLive(false);
    showToast('Match cancelled & cleared from OBS overlay.');
  };

  const andyScore = useMemo(
    () => gameLog.filter((g) => g.winner === 'Andy').length,
    [gameLog]
  );
  const kirstenScore = useMemo(
    () => gameLog.filter((g) => g.winner === 'Kirsten').length,
    [gameLog]
  );

  const winsNeeded = useMemo(() => {
    const cfg = MATCH_FORMATS.find((f) => f.value === matchFormat);
    return cfg ? cfg.winsNeeded : 2;
  }, [matchFormat]);

  const seriesWinner: 'Andy' | 'Kirsten' | null =
    andyScore >= winsNeeded
      ? 'Andy'
      : kirstenScore >= winsNeeded
        ? 'Kirsten'
        : null;

  const currentGameNumber = gameLog.length + 1;

  const seriesStatusText = useMemo(() => {
    if (seriesWinner) {
      return `${seriesWinner} Clinched ${matchFormat} Series (${andyScore}-${kirstenScore})!`;
    }
    if (andyScore === 0 && kirstenScore === 0) {
      return `Game 1 • Series 0-0 (${matchFormat})`;
    }
    if (andyScore === kirstenScore) {
      return `Game ${currentGameNumber} • Series tied ${andyScore}-${kirstenScore}`;
    }
    const leader = andyScore > kirstenScore ? 'Andy' : 'Kirsten';
    const high = Math.max(andyScore, kirstenScore);
    const low = Math.min(andyScore, kirstenScore);
    return `Game ${currentGameNumber} • ${leader} leads ${high}-${low}`;
  }, [andyScore, kirstenScore, currentGameNumber, matchFormat, seriesWinner]);

  const selectedAndyDeck = useMemo(
    () => decks.find((d) => d.id === andyDeckId) || null,
    [decks, andyDeckId]
  );
  const selectedKirstenDeck = useMemo(
    () => decks.find((d) => d.id === kirstenDeckId) || null,
    [decks, kirstenDeckId]
  );

  const handleEpisodeChange = (newEpisodeId: string) => {
    setSelectedEpisodeId(newEpisodeId);
    const epSpecific = decks.filter(
      (d) =>
        d.episode_id === newEpisodeId ||
        d.assigned_episodes?.some((a) => a.episode_id === newEpisodeId)
    );
    const pool = epSpecific.length > 0 ? epSpecific : decks;
    const nextAndy = pool.find((d) => d.pilot === 'Andy') || pool[0];
    const nextKirsten =
      pool.find((d) => d.pilot === 'Kirsten' && d.id !== nextAndy?.id) ||
      pool.find((d) => d.id !== nextAndy?.id) ||
      pool[1] ||
      pool[0];
    if (nextAndy) setAndyDeckId(nextAndy.id);
    if (nextKirsten) setKirstenDeckId(nextKirsten.id);
  };

  const handleRecordGameWin = async (winner: 'Andy' | 'Kirsten') => {
    if (seriesWinner) return;
    const nextLog: GameLogEntry[] = [
      ...gameLog,
      { game: currentGameNumber, winner },
    ];
    setGameLog(nextLog);
    const nextAndy = nextLog.filter((g) => g.winner === 'Andy').length;
    const nextKirsten = nextLog.filter((g) => g.winner === 'Kirsten').length;
    await syncLiveMatch(nextAndy, nextKirsten, nextLog);
  };

  const handleUndoLastGame = async () => {
    if (gameLog.length === 0) return;
    const nextLog = gameLog.slice(0, -1);
    setGameLog(nextLog);
    const nextAndy = nextLog.filter((g) => g.winner === 'Andy').length;
    const nextKirsten = nextLog.filter((g) => g.winner === 'Kirsten').length;
    await syncLiveMatch(nextAndy, nextKirsten, nextLog);
    showToast('Undid last game result.');
  };

  const handleOpenLiveEditDrawer = () => {
    setManualAndyScore(andyScore);
    setManualKirstenScore(kirstenScore);
    setLiveEditDrawerOpen(true);
  };

  const handleApplyLiveManualEdit = async () => {
    const newLog: GameLogEntry[] = [];
    let g = 1;
    for (let i = 0; i < manualAndyScore; i++) {
      newLog.push({ game: g++, winner: 'Andy' });
    }
    for (let i = 0; i < manualKirstenScore; i++) {
      newLog.push({ game: g++, winner: 'Kirsten' });
    }
    setGameLog(newLog);
    setLiveEditDrawerOpen(false);
    await syncLiveMatch(manualAndyScore, manualKirstenScore, newLog);
    showToast(
      `Adjusted match score to Andy ${manualAndyScore} - ${manualKirstenScore} Kirsten.`
    );
  };

  const handleSwapPilotDecks = () => {
    const temp = andyDeckId;
    setAndyDeckId(kirstenDeckId);
    setKirstenDeckId(temp);
    showToast('Swapped Andy and Kirsten decks.');
  };

  const handleFinishAndSaveMatch = async () => {
    if (!activeEpisode || !andyDeckId || !kirstenDeckId) return;
    setSaving(true);
    try {
      const winner =
        andyScore > kirstenScore
          ? 'Andy'
          : kirstenScore > andyScore
            ? 'Kirsten'
            : 'Draw';

      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episode_id: activeEpisode.id,
          andy_deck_id: andyDeckId,
          kirsten_deck_id: kirstenDeckId,
          match_format: matchFormat,
          andy_score: andyScore,
          kirsten_score: kirstenScore,
          winner,
          game_log: gameLog,
        }),
      });

      const data = await res.json();
      if (res.ok && data.match) {
        const enrichedMatch: EnrichedMatch = {
          ...data.match,
          andy_deck: selectedAndyDeck || undefined,
          kirsten_deck: selectedKirstenDeck || undefined,
        };

        setEpisodes((prev) =>
          prev.map((ep) => {
            if (ep.id !== activeEpisode.id) return ep;
            const nextMatches = [...ep.matches, enrichedMatch];
            const aWins = ep.andy_episode_wins + (winner === 'Andy' ? 1 : 0);
            const kWins =
              ep.kirsten_episode_wins + (winner === 'Kirsten' ? 1 : 0);
            return {
              ...ep,
              matches: nextMatches,
              andy_episode_wins: aWins,
              kirsten_episode_wins: kWins,
              andy_game_wins: ep.andy_game_wins + andyScore,
              kirsten_game_wins: ep.kirsten_game_wins + kirstenScore,
            };
          })
        );

        setGameLog([]);
        setIsMatchLive(false);
        showToast(
          `Saved Match (${winner} won ${andyScore}-${kirstenScore})! Arena reset.`
        );
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleLiveStatus = async () => {
    if (!activeEpisode) return;
    const nextLive = !activeEpisode.is_live;
    const prevDeckCount = activeEpisode.decks.length;
    const res = await fetch('/api/episodes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episodeId: activeEpisode.id, isLive: nextLive }),
    });
    if (res.ok) {
      setEpisodes((prev) =>
        prev.map((ep) => ({
          ...ep,
          is_live: ep.id === activeEpisode.id ? nextLive : false,
          is_upcoming: ep.id === activeEpisode.id ? false : ep.is_upcoming,
        }))
      );
      if (!nextLive) {
        const epRes = await fetch('/api/episodes?includeHidden=true');
        if (epRes.ok) {
          const epData = await epRes.json();
          if (Array.isArray(epData.episodes)) {
            setEpisodes(epData.episodes);
            const updatedEp = epData.episodes.find(
              (e: EnrichedEpisode) => e.id === activeEpisode.id
            );
            const removedCount = updatedEp
              ? Math.max(0, prevDeckCount - updatedEp.decks.length)
              : 0;
            showToast(
              removedCount > 0
                ? `● Stream is now OFF-AIR. Unassigned ${removedCount} unplayed deck(s).`
                : '● Stream is now OFF-AIR.'
            );
            router.refresh();
            return;
          }
        }
      }
      showToast(nextLive ? '● Stream is now LIVE!' : '● Stream is now OFF-AIR.');
      router.refresh();
    }
  };

  const handleDeleteLoggedMatch = async (matchId: string) => {
    if (!activeEpisode) return;
    const res = await fetch(`/api/matches?id=${matchId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setEpisodes((prev) =>
        prev.map((ep) => {
          if (ep.id !== activeEpisode.id) return ep;
          const remaining = ep.matches.filter((m) => m.id !== matchId);
          return {
            ...ep,
            matches: remaining,
          };
        })
      );
      setDeletingMatchId(null);
      showToast('Match deleted.');
      router.refresh();
    }
  };

  const handleOpenEditLoggedMatch = (match: EnrichedMatch) => {
    setEditingLoggedMatch(match);
    setEditLoggedAndyDeckId(match.andy_deck_id);
    setEditLoggedKirstenDeckId(match.kirsten_deck_id);
    setEditLoggedAndyScore(match.andy_score);
    setEditLoggedKirstenScore(match.kirsten_score);
    setEditLoggedFormat(match.match_format || 'Bo3');
  };

  const handleSaveLoggedMatchEdit = async () => {
    if (!editingLoggedMatch) return;
    setEditingMatchSaving(true);
    try {
      const winner: MatchWinner =
        editLoggedAndyScore > editLoggedKirstenScore
          ? 'Andy'
          : editLoggedKirstenScore > editLoggedAndyScore
            ? 'Kirsten'
            : 'Draw';

      const res = await fetch('/api/matches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingLoggedMatch.id,
          andy_deck_id: editLoggedAndyDeckId,
          kirsten_deck_id: editLoggedKirstenDeckId,
          match_format: editLoggedFormat,
          andy_score: editLoggedAndyScore,
          kirsten_score: editLoggedKirstenScore,
          winner,
        }),
      });

      if (res.ok) {
        const nextAndyDeck = decks.find((d) => d.id === editLoggedAndyDeckId);
        const nextKirstenDeck = decks.find(
          (d) => d.id === editLoggedKirstenDeckId
        );

        setEpisodes((prev) =>
          prev.map((ep) => {
            if (ep.id !== editingLoggedMatch.episode_id) return ep;
            const updatedMatches: EnrichedMatch[] = ep.matches.map((m) => {
              if (m.id !== editingLoggedMatch.id) return m;
              return {
                ...m,
                andy_deck_id: editLoggedAndyDeckId,
                kirsten_deck_id: editLoggedKirstenDeckId,
                andy_deck: nextAndyDeck || m.andy_deck,
                kirsten_deck: nextKirstenDeck || m.kirsten_deck,
                match_format: editLoggedFormat,
                andy_score: editLoggedAndyScore,
                kirsten_score: editLoggedKirstenScore,
                winner,
              };
            });
            return {
              ...ep,
              matches: updatedMatches,
            };
          })
        );

        setEditingLoggedMatch(null);
        showToast('Match updated successfully!');
        router.refresh();
      } else {
        showToast('Failed to update match.');
      }
    } catch (err) {
      console.error(err);
      showToast('Error updating match.');
    } finally {
      setEditingMatchSaving(false);
    }
  };

  const handleQuickCreateDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickDeckName.trim() || !activeEpisode) return;
    const res = await fetch('/api/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        episode_id: activeEpisode.id,
        pilot: 'Unassigned',
        deck_name: quickDeckName.trim(),
        ink_one: quickInkOne,
        ink_two: quickInkTwo,
        raw_decklist: '',
      }),
    });
    const data = await res.json();
    if (res.ok && data.deck) {
      setDecks((prev) => [data.deck, ...prev]);
      if (!andyDeckId) setAndyDeckId(data.deck.id);
      else if (!kirstenDeckId) setKirstenDeckId(data.deck.id);
      setQuickDeckName('');
      setQuickDeckModalOpen(false);
      showToast(`Created deck "${data.deck.deck_name}"!`);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto px-3 sm:px-4 py-4 space-y-4">
      {/* 1. TOP HEADER & STREAM STATUS (matches Android Companion App) */}
      <div className="bg-[#1E1231] border-[3px] border-black shadow-[4px_4px_0_#000000] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          {/* Live / Off-Air Toggle */}
          <button
            type="button"
            onClick={handleToggleLiveStatus}
            className={`px-3 py-2 text-xs font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center gap-1.5 transition-transform active:translate-x-0.5 active:translate-y-0.5 ${
              activeEpisode?.is_live
                ? 'bg-[#FF2E93] text-white animate-pulse'
                : 'bg-[#181920] text-neutral-400 hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            {activeEpisode?.is_live ? '● STREAM LIVE' : '● OFF-AIR'}
          </button>

          <div className="flex items-center gap-2">
            {/* Refresh Button */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="bg-[#00F5D4] hover:bg-[#00daba] text-black px-3 py-2 text-xs font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center gap-1 transition-transform active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
              />
              REFRESH
            </button>

            {/* Admin Return Button */}
            <Link
              href="/admin"
              className="bg-[#FFB703] hover:bg-[#ffaa00] text-black px-3 py-2 text-xs font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center gap-1 transition-transform active:translate-x-0.5 active:translate-y-0.5"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              ADMIN
            </Link>
          </div>
        </div>

        {/* Active Stream Selector */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-mono uppercase text-[#00F5D4] font-black tracking-wider">
            Active Stream:
          </label>
          <div className="relative">
            <select
              value={selectedEpisodeId}
              onChange={(e) => handleEpisodeChange(e.target.value)}
              className="w-full bg-[#181920] text-white border-[2px] border-black shadow-[3px_3px_0_#000000] text-xs font-bold py-2.5 px-3 rounded-none focus:outline-none focus:border-[#00F5D4] appearance-none"
            >
              {episodes.map((ep) => (
                <option key={ep.id} value={ep.id} className="bg-[#181920]">
                  [{ep.stream_date}] {ep.title}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#00F5D4]">
              ▼
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="bg-[#00F5D4] text-black border-[3px] border-black shadow-[3px_3px_0_#000000] px-4 py-2.5 text-xs font-black uppercase flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="font-mono font-black ml-2 text-base leading-none p-1 hover:opacity-70"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. MATCH SETUP CARD */}
      <div className="bg-[#1E1231] border-[3px] border-black shadow-[4px_4px_0_#000000] p-4 space-y-4">
        <div className="flex items-center justify-between border-b-[2px] border-black/60 pb-2">
          <span className="font-black uppercase text-xs tracking-wider flex items-center gap-1.5 text-white">
            <Swords className="w-4 h-4 text-[#FF2E93]" />
            Match Setup
          </span>
          <button
            type="button"
            onClick={() => setQuickDeckModalOpen(true)}
            className="bg-[#00F5D4] hover:bg-[#00daba] text-black px-2.5 py-1 text-[11px] font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center gap-1 transition-transform active:translate-x-0.5 active:translate-y-0.5"
          >
            <Plus className="w-3 h-3 font-black" />
            New Deck
          </button>
        </div>

        {/* Andy's Deck Section (Vibrant Purple Card) */}
        <div className="bg-[#3B1F54] text-white border-[2px] border-black shadow-[3px_3px_0_#000000] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-black uppercase tracking-wider text-[#00F5D4]">
              ANDY&apos;S DECK{' '}
              {isMatchLive && (
                <span className="text-neutral-300 text-[10px] lowercase font-normal">
                  (locked)
                </span>
              )}
            </span>
          </div>

          <DeckSelectDropdown
            selectedDeckId={andyDeckId}
            assignedDecks={assignedDecks}
            otherDecks={otherDecks}
            allDecks={decks}
            disabled={isMatchLive}
            theme="andy"
            placeholder="Select Andy's deck..."
            onSelect={(val) => {
              setAndyDeckId(val);
              if (selectedEpisodeId && otherDecks.some((d) => d.id === val)) {
                fetch('/api/decks', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'assign',
                    episodeId: selectedEpisodeId,
                    deckId: val,
                  }),
                }).catch(console.error);
              }
            }}
          />
        </div>

        {/* Kirsten's Deck Section (Pink Card) */}
        <div className="bg-[#FF2E93] text-white border-[2px] border-black shadow-[3px_3px_0_#000000] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-black uppercase tracking-wider text-white">
              KIRSTEN&apos;S DECK{' '}
              {isMatchLive && (
                <span className="text-neutral-100 text-[10px] lowercase font-normal">
                  (locked)
                </span>
              )}
            </span>
          </div>

          <DeckSelectDropdown
            selectedDeckId={kirstenDeckId}
            assignedDecks={assignedDecks}
            otherDecks={otherDecks}
            allDecks={decks}
            disabled={isMatchLive}
            theme="kirsten"
            placeholder="Select Kirsten's deck..."
            onSelect={(val) => {
              setKirstenDeckId(val);
              if (selectedEpisodeId && otherDecks.some((d) => d.id === val)) {
                fetch('/api/decks', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'assign',
                    episodeId: selectedEpisodeId,
                    deckId: val,
                  }),
                }).catch(console.error);
              }
            }}
          />
        </div>

        {/* Swap & Format Row */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            disabled={isMatchLive}
            onClick={handleSwapPilotDecks}
            className="bg-[#181920] hover:bg-[#252834] text-neutral-200 border-[2px] border-black shadow-[2px_2px_0_#000000] py-2 px-3 text-xs font-black uppercase flex items-center gap-1.5 transition-transform active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50"
            title="Swap Andy and Kirsten decks"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-[#00F5D4]" />
            SWAP
          </button>

          <div className="grid grid-cols-3 gap-1.5 flex-1">
            {(['Bo1', 'Bo3', 'Bo5'] as MatchFormat[]).map((fmt) => (
              <button
                key={fmt}
                type="button"
                disabled={isMatchLive}
                onClick={() => setMatchFormat(fmt)}
                className={`py-2 text-xs font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000] transition-colors ${
                  matchFormat === fmt
                    ? 'bg-[#FFB703] text-black'
                    : 'bg-[#181920] text-neutral-400 hover:text-white'
                } disabled:opacity-50`}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. LIVE MATCH ARENA CARD */}
      <div className="bg-[#1E1231] border-[3px] border-black shadow-[4px_4px_0_#000000] p-4 sm:p-5 space-y-4">
        {/* Arena Scoreboard Box */}
        <div className="bg-[#181920] border-[3px] border-black p-3.5 text-center space-y-2 shadow-[3px_3px_0_#000000]">
          <div className="inline-flex items-center gap-1.5 bg-[#00F5D4] text-black px-3 py-1 border-[2px] border-black font-black uppercase text-xs tracking-wider shadow-[2px_2px_0_#000000]">
            <Trophy className="w-3.5 h-3.5" />
            {seriesStatusText}
          </div>

          <div className="grid grid-cols-3 items-center pt-2">
            <div>
              <div className="text-xs font-mono uppercase text-[#00F5D4] font-black">
                ANDY
              </div>
              <div className="text-5xl sm:text-6xl font-black text-white leading-tight">
                {andyScore}
              </div>
            </div>
            <div className="text-xs font-mono font-black uppercase text-[#FFB703]">
              FIRST TO {winsNeeded}
            </div>
            <div>
              <div className="text-xs font-mono uppercase text-[#FF4B91] font-black">
                KIRSTEN
              </div>
              <div className="text-5xl sm:text-6xl font-black text-white leading-tight">
                {kirstenScore}
              </div>
            </div>
          </div>

          {gameLog.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2 border-t border-black/40">
              {gameLog.map((g) => (
                <span
                  key={g.game}
                  className={`px-2 py-0.5 text-[11px] font-mono font-black border border-black shadow-[1px_1px_0_#000000] ${
                    g.winner === 'Andy'
                      ? 'bg-[#3B1F54] text-[#00F5D4]'
                      : 'bg-[#FF2E93] text-white'
                  }`}
                >
                  G{g.game}: {g.winner}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* When Match is IDLE (not live) */}
        {!isMatchLive ? (
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={handleStartMatch}
              className="w-full bg-[#00F5D4] hover:bg-[#00daba] text-black py-5 px-4 text-xl sm:text-2xl font-black uppercase tracking-wider border-[3px] border-black shadow-[5px_5px_0_#000000] flex items-center justify-center gap-3 transition-transform active:translate-x-1 active:translate-y-1 cursor-pointer"
            >
              <Swords className="w-7 h-7" />
              Start Match (Lock In Decks)
            </button>
            <p className="text-center text-xs text-neutral-400 font-mono">
              Locks in selected decks and displays 0-0 live on OBS overlay
            </p>
          </div>
        ) : (
          /* When Match is LIVE */
          <>
            <div className="space-y-3">
              {/* Andy Win Button */}
              <button
                type="button"
                disabled={Boolean(seriesWinner)}
                onClick={() => handleRecordGameWin('Andy')}
                className="w-full bg-[#3B1F54] hover:bg-[#4c286c] text-white py-5 px-4 border-[3px] border-black shadow-[5px_5px_0_#00F5D4] flex flex-col items-center justify-center gap-1 transition-transform active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 cursor-pointer"
              >
                <span className="font-black uppercase tracking-tight text-xl sm:text-2xl text-white">
                  Andy Won Game {currentGameNumber}
                </span>
                <span className="text-xs font-mono text-[#00F5D4] font-bold truncate max-w-full">
                  {selectedAndyDeck?.deck_name || 'Andy Deck'}
                </span>
              </button>

              {/* Kirsten Win Button */}
              <button
                type="button"
                disabled={Boolean(seriesWinner)}
                onClick={() => handleRecordGameWin('Kirsten')}
                className="w-full bg-[#FF2E93] hover:bg-[#FF4B91] text-white py-5 px-4 border-[3px] border-black shadow-[5px_5px_0_#FFB703] flex flex-col items-center justify-center gap-1 transition-transform active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 cursor-pointer"
              >
                <span className="font-black uppercase tracking-tight text-xl sm:text-2xl text-white">
                  Kirsten Won Game {currentGameNumber}
                </span>
                <span className="text-xs font-mono text-white/95 font-bold truncate max-w-full">
                  {selectedKirstenDeck?.deck_name || 'Kirsten Deck'}
                </span>
              </button>
            </div>

            {/* Quick Actions Row */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                disabled={gameLog.length === 0}
                onClick={handleUndoLastGame}
                className="bg-[#FFB703] hover:bg-[#ffaa00] text-black py-3 px-2 text-xs font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center justify-center gap-1.5 transition-transform active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Undo
              </button>

              <button
                type="button"
                onClick={handleOpenLiveEditDrawer}
                className="bg-[#282A32] hover:bg-[#343742] text-white py-3 px-2 text-xs font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center justify-center gap-1.5 transition-transform active:translate-x-0.5 active:translate-y-0.5"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#00F5D4]" />
                Edit
              </button>

              <button
                type="button"
                onClick={handleResetMatch}
                className="bg-red-600 hover:bg-red-500 text-white py-3 px-2 text-xs font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center justify-center gap-1.5 transition-transform active:translate-x-0.5 active:translate-y-0.5"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>

            {/* Save Section */}
            <div className="border-[3px] border-black p-3.5 space-y-2.5 bg-[#181920] shadow-[3px_3px_0_#000000]">
              {seriesWinner && (
                <div className="flex items-center justify-center gap-2 font-black uppercase text-xs sm:text-sm text-[#00F5D4] text-center">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>
                    {seriesWinner} Reached {winsNeeded} Win(s) — Series Complete!
                  </span>
                </div>
              )}
              <button
                type="button"
                disabled={saving || gameLog.length === 0}
                onClick={handleFinishAndSaveMatch}
                className="w-full py-4 text-base bg-[#00F5D4] hover:bg-[#00daba] text-black font-black uppercase tracking-wider border-[2px] border-black shadow-[3px_3px_0_#000000] flex items-center justify-center gap-2 transition-transform active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-5 h-5" />
                {saving ? 'Saving...' : 'Finish Match & Save'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* 4. MATCH HISTORY CARD (matches item_match_history.xml from Android app) */}
      {activeEpisode && activeEpisode.matches.length > 0 && (
        <div className="bg-[#1E1231] border-[3px] border-black shadow-[4px_4px_0_#000000] p-4 space-y-3">
          <div className="flex items-center justify-between border-b-[2px] border-black/60 pb-2">
            <span className="font-black uppercase text-xs tracking-wider text-white">
              MATCH HISTORY ({activeEpisode.matches.length})
            </span>
          </div>

          <div className="space-y-3">
            {[...activeEpisode.matches].reverse().map((m, revIdx) => {
              const matchNum = activeEpisode.matches.length - revIdx;
              const aDeck = m.andy_deck || decks.find((d) => d.id === m.andy_deck_id);
              const kDeck =
                m.kirsten_deck || decks.find((d) => d.id === m.kirsten_deck_id);

              return (
                <div
                  key={m.id}
                  className="bg-[#160D24] border-[2px] border-black shadow-[3px_3px_0_#000000] p-3.5 space-y-2.5"
                >
                  {/* Header: Match # and Winner Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-xs text-[#F4F4F6] uppercase tracking-wider">
                      MATCH {matchNum} • {m.match_format || 'Bo3'}
                    </span>
                    <span className="bg-[#00F5D4] text-black px-2 py-0.5 text-[11px] font-black uppercase tracking-wider border-[1.5px] border-black">
                      WINNER: {m.winner?.toUpperCase() || 'DRAW'}
                    </span>
                  </div>

                  {/* Andy Row */}
                  <div className="bg-[#181920] border-[2px] border-black p-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-[#C084FC] text-[11px] font-black uppercase shrink-0">
                        ANDY:
                      </span>
                      <span className="text-white text-xs font-black truncate">
                        {aDeck?.deck_name || 'Andy Deck'}
                      </span>
                    </div>
                    <span className="text-[#00F5D4] text-lg font-black w-8 text-center shrink-0">
                      {m.andy_score}
                    </span>
                  </div>

                  {/* Kirsten Row */}
                  <div className="bg-[#181920] border-[2px] border-black p-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-[#FF4B91] text-[11px] font-black uppercase shrink-0">
                        KIRSTEN:
                      </span>
                      <span className="text-white text-xs font-black truncate">
                        {kDeck?.deck_name || 'Kirsten Deck'}
                      </span>
                    </div>
                    <span className="text-[#FF4B91] text-lg font-black w-8 text-center shrink-0">
                      {m.kirsten_score}
                    </span>
                  </div>

                  {/* Bottom Actions: Edit & Delete */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEditLoggedMatch(m)}
                      className="bg-[#FFB703] hover:bg-[#ffaa00] text-black px-3 py-1.5 text-[11px] font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center gap-1 transition-transform active:translate-x-0.5 active:translate-y-0.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      EDIT
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingMatchId(m.id)}
                      className="bg-[#181920] hover:bg-red-950 text-red-500 hover:text-red-400 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center gap-1 transition-transform active:translate-x-0.5 active:translate-y-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      DELETE
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL 1: EDIT LIVE MATCH DRAWER */}
      {liveEditDrawerOpen && (
        <div
          className="fixed inset-0 !mt-0 z-50 bg-black/80 flex items-end justify-center p-0"
          onClick={() => setLiveEditDrawerOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-[#282A32] text-white border-t-[4px] border-x-[4px] border-black p-5 space-y-4 animate-in slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-[2px] border-black pb-2">
              <h3 className="text-base font-black uppercase tracking-wider text-white">
                Edit Current Match
              </h3>
              <button
                type="button"
                onClick={() => setLiveEditDrawerOpen(false)}
                className="bg-[#FFB703] text-black p-1 border-[2px] border-black"
              >
                <X className="w-4 h-4 font-black" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#3B1F54] text-white border-[2px] border-black p-3 text-center space-y-2">
                <div className="text-xs font-mono text-[#00F5D4] font-black uppercase">
                  ANDY SCORE
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setManualAndyScore((s) => Math.max(0, s - 1))
                    }
                    className="bg-[#181920] text-white w-9 h-9 text-lg font-black border-[2px] border-black"
                  >
                    -
                  </button>
                  <span className="text-3xl font-black">{manualAndyScore}</span>
                  <button
                    type="button"
                    onClick={() => setManualAndyScore((s) => s + 1)}
                    className="bg-[#00F5D4] text-black w-9 h-9 text-lg font-black border-[2px] border-black"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="bg-[#FF2E93] text-white border-[2px] border-black p-3 text-center space-y-2">
                <div className="text-xs font-mono text-white font-black uppercase">
                  KIRSTEN SCORE
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setManualKirstenScore((s) => Math.max(0, s - 1))
                    }
                    className="bg-[#181920] text-white w-9 h-9 text-lg font-black border-[2px] border-black"
                  >
                    -
                  </button>
                  <span className="text-3xl font-black">
                    {manualKirstenScore}
                  </span>
                  <button
                    type="button"
                    onClick={() => setManualKirstenScore((s) => s + 1)}
                    className="bg-[#FFB703] text-black w-9 h-9 text-lg font-black border-[2px] border-black"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSwapPilotDecks}
              className="w-full bg-[#FFB703] text-black py-2.5 text-xs font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center justify-center gap-2"
            >
              <ArrowLeftRight className="w-4 h-4" />
              Swap Andy &amp; Kirsten Decks
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleApplyLiveManualEdit}
                className="flex-1 bg-[#00F5D4] text-black py-3 text-xs font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000]"
              >
                Apply Score
              </button>
              <button
                type="button"
                onClick={() => {
                  setGameLog([]);
                  setLiveEditDrawerOpen(false);
                  syncLiveMatch(0, 0, []);
                }}
                className="bg-[#D62828] text-white py-3 px-4 text-xs font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000]"
              >
                Reset 0-0
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT LOGGED MATCH DIALOG (matches dialog_edit_match.xml) */}
      {editingLoggedMatch && (
        <div
          className="fixed inset-0 !mt-0 z-50 bg-black/85 flex items-center justify-center p-3"
          onClick={() => setEditingLoggedMatch(null)}
        >
          <div
            className="w-full max-w-md bg-[#1F1133] text-white border-[3px] border-black shadow-[6px_6px_0_#000000] p-4 sm:p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-[2px] border-black pb-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                <Edit3 className="w-4 h-4 text-[#00F5D4]" />
                EDIT LOGGED MATCH
              </h3>
              <button
                type="button"
                onClick={() => setEditingLoggedMatch(null)}
                className="bg-[#FFB703] text-black p-1 border-[2px] border-black"
              >
                <X className="w-4 h-4 font-black" />
              </button>
            </div>

            {/* Andy Deck Selector */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono font-black uppercase text-[#00F5D4]">
                Andy&apos;s Deck:
              </label>
              <DeckSelectDropdown
                selectedDeckId={editLoggedAndyDeckId}
                assignedDecks={assignedDecks}
                otherDecks={otherDecks}
                allDecks={decks}
                theme="andy"
                onSelect={(val) => setEditLoggedAndyDeckId(val)}
              />
            </div>

            {/* Kirsten Deck Selector */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono font-black uppercase text-[#FF4B91]">
                Kirsten&apos;s Deck:
              </label>
              <DeckSelectDropdown
                selectedDeckId={editLoggedKirstenDeckId}
                assignedDecks={assignedDecks}
                otherDecks={otherDecks}
                allDecks={decks}
                theme="kirsten"
                onSelect={(val) => setEditLoggedKirstenDeckId(val)}
              />
            </div>

            {/* Scores Adjustment */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="bg-[#3B1F54] text-white border-[2px] border-black p-3 text-center space-y-1">
                <div className="text-[11px] font-mono text-[#00F5D4] font-black uppercase">
                  Andy Score
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setEditLoggedAndyScore((s) => Math.max(0, s - 1))
                    }
                    className="bg-[#181920] text-white w-8 h-8 text-base font-black border-[2px] border-black"
                  >
                    -
                  </button>
                  <span className="text-2xl font-black">
                    {editLoggedAndyScore}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditLoggedAndyScore((s) => s + 1)}
                    className="bg-[#00F5D4] text-black w-8 h-8 text-base font-black border-[2px] border-black"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="bg-[#FF2E93] text-white border-[2px] border-black p-3 text-center space-y-1">
                <div className="text-[11px] font-mono text-white font-black uppercase">
                  Kirsten Score
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setEditLoggedKirstenScore((s) => Math.max(0, s - 1))
                    }
                    className="bg-[#181920] text-white w-8 h-8 text-base font-black border-[2px] border-black"
                  >
                    -
                  </button>
                  <span className="text-2xl font-black">
                    {editLoggedKirstenScore}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditLoggedKirstenScore((s) => s + 1)}
                    className="bg-[#FFB703] text-black w-8 h-8 text-base font-black border-[2px] border-black"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Match Format */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono font-black uppercase text-neutral-300">
                Format:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Bo1', 'Bo3', 'Bo5'] as MatchFormat[]).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setEditLoggedFormat(fmt)}
                    className={`py-2 text-xs font-black uppercase tracking-wider border-[2px] border-black ${
                      editLoggedFormat === fmt
                        ? 'bg-[#FFB703] text-black'
                        : 'bg-[#181920] text-neutral-400'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingLoggedMatch(null)}
                className="bg-[#181920] text-neutral-300 py-2.5 px-3 text-xs font-black uppercase tracking-wider border-[2px] border-black"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={editingMatchSaving}
                onClick={handleSaveLoggedMatchEdit}
                className="flex-1 bg-[#00F5D4] hover:bg-[#00daba] text-black py-2.5 px-3 text-xs font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {editingMatchSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {deletingMatchId && (
        <div
          className="fixed inset-0 !mt-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setDeletingMatchId(null)}
        >
          <div
            className="w-full max-w-sm bg-[#1F1133] text-white border-[3px] border-black shadow-[6px_6px_0_#000000] p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-black uppercase tracking-wider text-red-400 flex items-center gap-1.5">
              <Trash2 className="w-4 h-4" />
              CONFIRM DELETE
            </h3>
            <p className="text-xs text-neutral-300 font-bold leading-relaxed">
              Are you sure you want to permanently delete this logged match from the stream?
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingMatchId(null)}
                className="flex-1 bg-[#181920] text-neutral-300 py-2.5 text-xs font-black uppercase tracking-wider border-[2px] border-black"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteLoggedMatch(deletingMatchId)}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2.5 text-xs font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: QUICK NEW DECK MODAL */}
      {quickDeckModalOpen && (
        <div
          className="fixed inset-0 !mt-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setQuickDeckModalOpen(false)}
        >
          <form
            onSubmit={handleQuickCreateDeck}
            className="w-full max-w-md bg-[#1F1133] border-[3px] border-black shadow-[6px_6px_0_#000000] p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-[2px] border-black pb-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Add Stream Deck
              </h3>
              <button
                type="button"
                onClick={() => setQuickDeckModalOpen(false)}
                className="bg-[#FFB703] text-black p-1 border-[2px] border-black"
              >
                <X className="w-4 h-4 font-black" />
              </button>
            </div>

            <input
              type="text"
              required
              value={quickDeckName}
              onChange={(e) => setQuickDeckName(e.target.value)}
              placeholder="Deck Name *"
              className="w-full bg-[#181920] text-white border-[2px] border-black p-2.5 text-xs font-bold focus:outline-none focus:border-[#00F5D4]"
            />

            <div className="grid grid-cols-2 gap-2">
              <select
                value={quickInkOne}
                onChange={(e) => setQuickInkOne(e.target.value as LorcanaInk)}
                className="bg-[#181920] text-white border-[2px] border-black p-2.5 text-xs font-bold"
              >
                {LORCANA_INKS.map((i) => (
                  <option key={i} value={i}>
                    Ink 1: {i}
                  </option>
                ))}
              </select>
              <select
                value={quickInkTwo}
                onChange={(e) => setQuickInkTwo(e.target.value as LorcanaInk)}
                className="bg-[#181920] text-white border-[2px] border-black p-2.5 text-xs font-bold"
              >
                {LORCANA_INKS.map((i) => (
                  <option key={i} value={i}>
                    Ink 2: {i}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="w-full bg-[#00F5D4] hover:bg-[#00daba] text-black py-3 text-xs font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000]"
            >
              Create &amp; Select Deck
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
