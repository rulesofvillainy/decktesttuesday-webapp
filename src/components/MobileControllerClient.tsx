'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Edit3,
  ExternalLink,
  GripVertical,
  Lock,
  MessageSquare,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  Swords,
  Trash2,
  Trophy,
  Tv,
  Unlock,
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
  YouTubeLiveChatMessage,
} from '@/lib/types';
import { DeckSelectDropdown } from './DeckSelectDropdown';

type ControllerSectionId = 'stream' | 'chat' | 'setup' | 'arena' | 'history';

const DEFAULT_SECTION_ORDER: ControllerSectionId[] = [
  'stream',
  'chat',
  'setup',
  'arena',
  'history',
];

const DEFAULT_COLLAPSED: Record<ControllerSectionId, boolean> = {
  stream: false,
  chat: false,
  setup: false,
  arena: false,
  history: false,
};

const STORAGE_ORDER_KEY = 'dtt_controller_section_order_v1';
const STORAGE_COLLAPSED_KEY = 'dtt_controller_collapsed_v1';

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

  // Layout customization: Collapse & Lock/Unlock Drag Reorder
  const [sectionOrder, setSectionOrder] = useState<ControllerSectionId[]>(
    DEFAULT_SECTION_ORDER
  );
  const [collapsed, setCollapsed] =
    useState<Record<ControllerSectionId, boolean>>(DEFAULT_COLLAPSED);
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [isLayoutUnlocked, setIsLayoutUnlocked] = useState(false);
  const [draggingSection, setDraggingSection] =
    useState<ControllerSectionId | null>(null);
  const sectionsContainerRef = useRef<HTMLDivElement>(null);

  // YouTube Live Chat State
  const [chatMessages, setChatMessages] = useState<YouTubeLiveChatMessage[]>([]);
  const [chatActive, setChatActive] = useState(false);
  const [chatStatusMsg, setChatStatusMsg] = useState<string | null>(
    'Connecting to stream chat...'
  );
  const [chatVideoUrl, setChatVideoUrl] = useState<string | null>(null);
  const [chatVideoId, setChatVideoId] = useState<string | null>(null);
  const [chatPollMs, setChatPollMs] = useState<number>(6000);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatAutoScroll, setChatAutoScroll] = useState(true);
  const chatScrollRef = useRef<HTMLDivElement>(null);

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

  // Hydrate layout order & collapsed state from localStorage
  useEffect(() => {
    try {
      const savedOrderRaw = localStorage.getItem(STORAGE_ORDER_KEY);
      if (savedOrderRaw) {
        const parsed = JSON.parse(savedOrderRaw);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((id): id is ControllerSectionId =>
            DEFAULT_SECTION_ORDER.includes(id as ControllerSectionId)
          );
          for (const id of DEFAULT_SECTION_ORDER) {
            if (!valid.includes(id)) valid.push(id);
          }
          if (valid.length === DEFAULT_SECTION_ORDER.length) {
            setSectionOrder(valid);
          }
        }
      }
      const savedCollapsedRaw = localStorage.getItem(STORAGE_COLLAPSED_KEY);
      if (savedCollapsedRaw) {
        const parsedC = JSON.parse(savedCollapsedRaw);
        if (parsedC && typeof parsedC === 'object') {
          setCollapsed({ ...DEFAULT_COLLAPSED, ...parsedC });
        }
      }
    } catch {
      // Ignore malformed storage
    } finally {
      setLayoutLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!layoutLoaded) return;
    try {
      localStorage.setItem(STORAGE_ORDER_KEY, JSON.stringify(sectionOrder));
    } catch {
      // Ignore storage quota errors
    }
  }, [sectionOrder, layoutLoaded]);

  useEffect(() => {
    if (!layoutLoaded) return;
    try {
      localStorage.setItem(STORAGE_COLLAPSED_KEY, JSON.stringify(collapsed));
    } catch {
      // Ignore storage quota errors
    }
  }, [collapsed, layoutLoaded]);

  const toggleCollapse = (id: ControllerSectionId) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const moveSectionByStep = (id: ControllerSectionId, delta: -1 | 1) => {
    setSectionOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const targetIdx = idx + delta;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(targetIdx, 0, item);
      return next;
    });
  };

  // Pointer-based touch + mouse Drag-and-Drop reordering when unlocked
  const startSectionDrag = (
    id: ControllerSectionId,
    e: React.PointerEvent<HTMLElement>
  ) => {
    if (!isLayoutUnlocked) return;
    e.preventDefault();
    e.stopPropagation();
    setDraggingSection(id);

    const handleMove = (moveEvt: PointerEvent) => {
      const container = sectionsContainerRef.current;
      if (!container) return;
      const children = Array.from(
        container.querySelectorAll<HTMLElement>('[data-section-id]')
      );
      let hoverId: ControllerSectionId | null = null;
      let insertBefore = true;

      for (const el of children) {
        const elId = el.dataset.sectionId as ControllerSectionId | undefined;
        if (!elId || elId === id) continue;
        const rect = el.getBoundingClientRect();
        if (moveEvt.clientY >= rect.top && moveEvt.clientY <= rect.bottom) {
          hoverId = elId;
          insertBefore = moveEvt.clientY < rect.top + rect.height / 2;
          break;
        }
      }

      if (hoverId) {
        setSectionOrder((prev) => {
          const fromIdx = prev.indexOf(id);
          const toIdx = prev.indexOf(hoverId!);
          if (fromIdx < 0 || toIdx < 0) return prev;
          const desiredIdx = insertBefore
            ? toIdx > fromIdx
              ? toIdx - 1
              : toIdx
            : toIdx < fromIdx
              ? toIdx + 1
              : toIdx;
          if (desiredIdx === fromIdx) return prev;
          const next = [...prev];
          const [moved] = next.splice(fromIdx, 1);
          next.splice(desiredIdx, 0, moved);
          return next;
        });
      }
    };

    const handleUp = () => {
      setDraggingSection(null);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

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

  // Fetch YouTube Live Chat for the active stream
  const fetchChatMessages = useCallback(
    async (force = false) => {
      if (!activeEpisode?.id) {
        setChatMessages([]);
        setChatActive(false);
        setChatVideoId(null);
        setChatVideoUrl(null);
        setChatStatusMsg('Select a stream to connect YouTube chat.');
        return;
      }
      if (force) setChatLoading(true);
      try {
        const res = await fetch(
          `/api/admin/youtube-chat?episodeId=${encodeURIComponent(
            activeEpisode.id
          )}${force ? '&refresh=1' : ''}`,
          { cache: 'no-store' }
        );
        const data = await res.json();
        if (!res.ok) {
          setChatStatusMsg(data.error || 'Could not load YouTube chat.');
          setChatActive(false);
          return;
        }
        setChatVideoId(data.videoId || activeEpisode.youtube_video_id || null);
        setChatVideoUrl(data.vodUrl || activeEpisode.vod_url || null);
        setChatActive(Boolean(data.liveChatActive));
        setChatMessages(Array.isArray(data.messages) ? data.messages : []);
        setChatStatusMsg(data.statusMessage || null);
        if (
          typeof data.pollingIntervalMs === 'number' &&
          data.pollingIntervalMs >= 3000
        ) {
          setChatPollMs(data.pollingIntervalMs);
        }
      } catch {
        setChatStatusMsg('Network error loading YouTube chat.');
      } finally {
        if (force) setChatLoading(false);
      }
    },
    [activeEpisode?.id, activeEpisode?.vod_url, activeEpisode?.youtube_video_id]
  );

  // Reset chat when changing episodes and poll only when Chat section is open
  useEffect(() => {
    setChatMessages([]);
    setChatActive(false);
    setChatVideoId(activeEpisode?.youtube_video_id || null);
    setChatVideoUrl(
      activeEpisode?.vod_url ||
        (activeEpisode?.youtube_video_id
          ? `https://www.youtube.com/watch?v=${activeEpisode.youtube_video_id}`
          : null)
    );
    if (collapsed.chat) return;
    fetchChatMessages(true);
  }, [activeEpisode?.id, activeEpisode?.vod_url, activeEpisode?.youtube_video_id, collapsed.chat, fetchChatMessages]);

  useEffect(() => {
    if (collapsed.chat || !activeEpisode?.id) return;
    const timer = setInterval(() => {
      fetchChatMessages(false);
    }, Math.max(chatPollMs, 5000));
    return () => clearInterval(timer);
  }, [collapsed.chat, activeEpisode?.id, chatPollMs, fetchChatMessages]);

  // Auto-scroll chat box to bottom unless user scrolled up
  useEffect(() => {
    if (!chatAutoScroll || !chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages, chatAutoScroll]);

  const handleChatScroll = () => {
    const el = chatScrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 28;
    setChatAutoScroll(nearBottom);
  };

  // Refresh handler (re-fetches episodes, decks, active match, and chat)
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
      if (!collapsed.chat) {
        await fetchChatMessages(true);
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
    showToast('Match started! 0-0 live on OBS.');
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
      return `${seriesWinner} Clinched (${andyScore}-${kirstenScore})`;
    }
    if (andyScore === 0 && kirstenScore === 0) {
      return `Game 1 • 0-0 (${matchFormat})`;
    }
    if (andyScore === kirstenScore) {
      return `G${currentGameNumber} • Tied ${andyScore}-${kirstenScore}`;
    }
    const leader = andyScore > kirstenScore ? 'Andy' : 'Kirsten';
    const high = Math.max(andyScore, kirstenScore);
    const low = Math.min(andyScore, kirstenScore);
    return `G${currentGameNumber} • ${leader} ${high}-${low}`;
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
        showToast(`Saved (${winner} won ${andyScore}-${kirstenScore})!`);
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
                ? `Stream OFF-AIR. Unassigned ${removedCount} unplayed deck(s).`
                : 'Stream OFF-AIR.'
            );
            router.refresh();
            return;
          }
        }
      }
      showToast(nextLive ? 'Stream is now LIVE!' : 'Stream OFF-AIR.');
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
        showToast('Match updated!');
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

  const assignDeckIfNeeded = (val: string) => {
    if (selectedEpisodeId && otherDecks.some((d) => d.id === val)) {
      fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign',
          episode_id: selectedEpisodeId,
          deck_id: val,
        }),
      }).catch(console.error);
    }
  };

  const renderSectionHeader = (
    id: ControllerSectionId,
    title: string,
    icon: React.ReactNode,
    summary: string,
    rightAction?: React.ReactNode
  ) => {
    const isCollapsed = collapsed[id];
    const idx = sectionOrder.indexOf(id);

    return (
      <div
        className={`bg-[#160D24] px-2.5 py-1.5 flex items-center justify-between gap-2 ${
          !isCollapsed ? 'border-b-[2px] border-black' : ''
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {isLayoutUnlocked && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onPointerDown={(e) => startSectionDrag(id, e)}
                className="p-1 bg-[#2E184A] text-[#00F5D4] border border-black touch-none cursor-grab active:cursor-grabbing"
                title="Drag to reorder section"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => moveSectionByStep(id, -1)}
                className="p-1 bg-[#181920] text-neutral-300 hover:text-white border border-black disabled:opacity-30"
                title="Move section up"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                disabled={idx === sectionOrder.length - 1}
                onClick={() => moveSectionByStep(id, 1)}
                className="p-1 bg-[#181920] text-neutral-300 hover:text-white border border-black disabled:opacity-30"
                title="Move section down"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => toggleCollapse(id)}
            className="flex items-center gap-1.5 min-w-0 flex-1 text-left py-0.5 hover:opacity-90"
          >
            {isCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5 text-[#00F5D4] shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[#00F5D4] shrink-0" />
            )}
            <span className="shrink-0">{icon}</span>
            <span className="font-black uppercase text-[11px] tracking-wider text-white shrink-0">
              {title}
            </span>
            {summary && (
              <span className="text-[10px] font-mono text-neutral-400 truncate ml-1">
                • {summary}
              </span>
            )}
          </button>
        </div>

        {rightAction && <div className="shrink-0">{rightAction}</div>}
      </div>
    );
  };

  const renderSection = (id: ControllerSectionId) => {
    const isCollapsed = collapsed[id];
    const isDragging = draggingSection === id;
    const cardClass = `bg-[#1E1231] border-[2px] border-black shadow-[3px_3px_0_#000000] transition-opacity ${
      isDragging ? 'opacity-75 ring-2 ring-[#00F5D4]' : ''
    }`;

    if (id === 'stream') {
      const streamSummary = activeEpisode
        ? `${activeEpisode.is_live ? 'LIVE' : 'OFF'} • ${activeEpisode.title}`
        : 'None selected';

      return (
        <section key={id} data-section-id={id} className={cardClass}>
          {renderSectionHeader(
            'stream',
            'Stream Control',
            <Tv className="w-3.5 h-3.5 text-[#00F5D4]" />,
            isCollapsed ? streamSummary : '',
            <button
              type="button"
              onClick={handleToggleLiveStatus}
              className={`px-2 py-0.5 text-[10px] font-black uppercase border border-black flex items-center gap-1 ${
                activeEpisode?.is_live
                  ? 'bg-[#FF2E93] text-white animate-pulse'
                  : 'bg-[#181920] text-neutral-300 hover:text-white'
              }`}
            >
              <Radio className="w-3 h-3" />
              {activeEpisode?.is_live ? 'LIVE' : 'OFF-AIR'}
            </button>
          )}

          {!isCollapsed && (
            <div className="p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono uppercase text-[#00F5D4] font-black">
                  Active Stream
                </span>
                {activeEpisode?.vod_url && (
                  <a
                    href={activeEpisode.vod_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-mono text-[#FF4B91] hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    YouTube ({activeEpisode.youtube_video_id || 'VOD'})
                  </a>
                )}
              </div>
              <div className="relative">
                <select
                  value={selectedEpisodeId}
                  onChange={(e) => handleEpisodeChange(e.target.value)}
                  className="w-full bg-[#181920] text-white border-[2px] border-black shadow-[2px_2px_0_#000000] text-xs font-bold py-1.5 pl-2.5 pr-7 rounded-none focus:outline-none focus:border-[#00F5D4] appearance-none"
                >
                  {episodes.map((ep) => (
                    <option key={ep.id} value={ep.id} className="bg-[#181920]">
                      [{ep.stream_date}] {ep.title}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[#00F5D4] text-[10px]">
                  ▼
                </div>
              </div>
            </div>
          )}
        </section>
      );
    }

    if (id === 'chat') {
      const chatSummary = chatActive
        ? `${chatMessages.length} msgs`
        : chatVideoId || 'Standby';

      return (
        <section key={id} data-section-id={id} className={cardClass}>
          {renderSectionHeader(
            'chat',
            'YouTube Chat',
            <MessageSquare className="w-3.5 h-3.5 text-[#FF2E93]" />,
            isCollapsed ? chatSummary : chatVideoId || '',
            <div className="flex items-center gap-1.5">
              <span
                className={`px-1.5 py-0.5 text-[9px] font-mono font-black uppercase border border-black ${
                  chatActive
                    ? 'bg-[#00F5D4] text-black'
                    : 'bg-[#181920] text-neutral-400'
                }`}
              >
                {chatActive ? 'LIVE' : 'IDLE'}
              </span>
              {chatVideoUrl && (
                <a
                  href={chatVideoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 bg-[#181920] text-[#FF4B91] hover:text-white border border-black"
                  title="Open stream on YouTube"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button
                type="button"
                disabled={chatLoading}
                onClick={() => fetchChatMessages(true)}
                className="p-1 bg-[#181920] text-[#00F5D4] hover:text-white border border-black disabled:opacity-50"
                title="Refresh chat now"
              >
                <RefreshCw
                  className={`w-3 h-3 ${chatLoading ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          )}

          {!isCollapsed && (
            <div className="p-2 space-y-1 relative">
              <div
                ref={chatScrollRef}
                onScroll={handleChatScroll}
                className="h-32 overflow-y-auto bg-[#120A1E] border-[2px] border-black p-2 space-y-1 text-[11px] leading-snug"
              >
                {chatMessages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center text-[11px] font-mono text-neutral-400 px-2">
                    {chatStatusMsg || 'No chat messages yet.'}
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`break-words px-1.5 py-0.5 ${
                        msg.superChatAmount
                          ? 'bg-[#FFB703]/20 border-l-2 border-[#FFB703]'
                          : 'hover:bg-[#1E1231]/80'
                      }`}
                    >
                      <span className="text-[10px] font-mono text-neutral-500 mr-1.5">
                        {msg.timeLabel}
                      </span>
                      {msg.authorBadge && (
                        <span
                          className={`inline-block text-[9px] font-mono font-black px-1 mr-1 border border-black ${
                            msg.authorBadge === 'OWNER'
                              ? 'bg-[#FFB703] text-black'
                              : msg.authorBadge === 'MOD'
                                ? 'bg-[#00F5D4] text-black'
                                : 'bg-[#3B1F54] text-white'
                          }`}
                        >
                          {msg.authorBadge}
                        </span>
                      )}
                      <span
                        className={`font-black mr-1.5 ${
                          msg.authorBadge === 'OWNER'
                            ? 'text-[#FFB703]'
                            : msg.authorBadge === 'MOD'
                              ? 'text-[#00F5D4]'
                              : 'text-[#C084FC]'
                        }`}
                      >
                        {msg.authorName}:
                      </span>
                      {msg.superChatAmount && (
                        <span className="font-mono font-black text-[#FFB703] mr-1">
                          [{msg.superChatAmount}]
                        </span>
                      )}
                      <span className="text-neutral-100">{msg.message}</span>
                    </div>
                  ))
                )}
              </div>

              {!chatAutoScroll && chatMessages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setChatAutoScroll(true);
                    if (chatScrollRef.current) {
                      chatScrollRef.current.scrollTop =
                        chatScrollRef.current.scrollHeight;
                    }
                  }}
                  className="absolute bottom-3 right-3 bg-[#00F5D4] text-black px-2 py-0.5 text-[10px] font-black uppercase border border-black shadow-[2px_2px_0_#000000]"
                >
                  ↓ Latest
                </button>
              )}
            </div>
          )}
        </section>
      );
    }

    if (id === 'setup') {
      const setupSummary = `${selectedAndyDeck?.deck_name || 'Andy'} vs ${
        selectedKirstenDeck?.deck_name || 'Kirsten'
      } (${matchFormat})`;

      return (
        <section key={id} data-section-id={id} className={cardClass}>
          {renderSectionHeader(
            'setup',
            'Match Setup',
            <Swords className="w-3.5 h-3.5 text-[#FF2E93]" />,
            isCollapsed ? setupSummary : matchFormat,
            <button
              type="button"
              onClick={() => setQuickDeckModalOpen(true)}
              className="bg-[#00F5D4] hover:bg-[#00daba] text-black px-2 py-0.5 text-[10px] font-black uppercase border border-black flex items-center gap-0.5"
            >
              <Plus className="w-3 h-3" />
              Deck
            </button>
          )}

          {!isCollapsed && (
            <div className="p-2.5 space-y-2">
              {/* Side-by-Side Deck Pickers */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#3B1F54] text-white border-[2px] border-black shadow-[2px_2px_0_#000000] p-2 space-y-1">
                  <div className="text-[10px] font-mono font-black uppercase text-[#00F5D4] flex items-center justify-between">
                    <span>ANDY</span>
                    {isMatchLive && (
                      <span className="text-[9px] text-neutral-300 lowercase">
                        locked
                      </span>
                    )}
                  </div>
                  <DeckSelectDropdown
                    selectedDeckId={andyDeckId}
                    assignedDecks={assignedDecks}
                    otherDecks={otherDecks}
                    allDecks={decks}
                    disabled={isMatchLive}
                    theme="andy"
                    compact
                    menuAlign="left"
                    placeholder="Andy deck..."
                    onSelect={(val) => {
                      setAndyDeckId(val);
                      assignDeckIfNeeded(val);
                    }}
                  />
                </div>

                <div className="bg-[#FF2E93] text-white border-[2px] border-black shadow-[2px_2px_0_#000000] p-2 space-y-1">
                  <div className="text-[10px] font-mono font-black uppercase text-white flex items-center justify-between">
                    <span>KIRSTEN</span>
                    {isMatchLive && (
                      <span className="text-[9px] text-neutral-100 lowercase">
                        locked
                      </span>
                    )}
                  </div>
                  <DeckSelectDropdown
                    selectedDeckId={kirstenDeckId}
                    assignedDecks={assignedDecks}
                    otherDecks={otherDecks}
                    allDecks={decks}
                    disabled={isMatchLive}
                    theme="kirsten"
                    compact
                    menuAlign="right"
                    placeholder="Kirsten deck..."
                    onSelect={(val) => {
                      setKirstenDeckId(val);
                      assignDeckIfNeeded(val);
                    }}
                  />
                </div>
              </div>

              {/* Compact Swap & Format Row */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isMatchLive}
                  onClick={handleSwapPilotDecks}
                  className="bg-[#181920] hover:bg-[#252834] text-neutral-200 border-[2px] border-black shadow-[2px_2px_0_#000000] py-1.5 px-2.5 text-[11px] font-black uppercase flex items-center gap-1 disabled:opacity-50"
                  title="Swap Andy and Kirsten decks"
                >
                  <ArrowLeftRight className="w-3 h-3 text-[#00F5D4]" />
                  SWAP
                </button>

                <div className="grid grid-cols-3 gap-1.5 flex-1">
                  {(['Bo1', 'Bo3', 'Bo5'] as MatchFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      disabled={isMatchLive}
                      onClick={() => setMatchFormat(fmt)}
                      className={`py-1.5 text-[11px] font-black uppercase border-[2px] border-black shadow-[2px_2px_0_#000000] transition-colors ${
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
          )}
        </section>
      );
    }

    if (id === 'arena') {
      const arenaSummary = isMatchLive
        ? `${andyScore}-${kirstenScore} (${matchFormat})`
        : `Ready • ${matchFormat}`;

      return (
        <section key={id} data-section-id={id} className={cardClass}>
          {renderSectionHeader(
            'arena',
            'Match Arena',
            <Trophy className="w-3.5 h-3.5 text-[#FFB703]" />,
            isCollapsed ? arenaSummary : seriesStatusText
          )}

          {!isCollapsed && (
            <div className="p-2.5 space-y-2.5">
              {/* Compact Scoreboard Box */}
              <div className="bg-[#181920] border-[2px] border-black p-2 text-center space-y-1.5 shadow-[2px_2px_0_#000000]">
                <div className="grid grid-cols-3 items-center">
                  <div>
                    <div className="text-[10px] font-mono uppercase text-[#00F5D4] font-black">
                      ANDY
                    </div>
                    <div className="text-3xl font-black text-white leading-none mt-0.5">
                      {andyScore}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1 bg-[#00F5D4] text-black px-2 py-0.5 border border-black font-black uppercase text-[10px] tracking-wide">
                      {seriesStatusText}
                    </div>
                    <div className="text-[9px] font-mono font-black uppercase text-[#FFB703]">
                      FIRST TO {winsNeeded}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-mono uppercase text-[#FF4B91] font-black">
                      KIRSTEN
                    </div>
                    <div className="text-3xl font-black text-white leading-none mt-0.5">
                      {kirstenScore}
                    </div>
                  </div>
                </div>

                {gameLog.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-1 pt-1 border-t border-black/50">
                    {gameLog.map((g) => (
                      <span
                        key={g.game}
                        className={`px-1.5 py-0.5 text-[10px] font-mono font-black border border-black ${
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

              {/* Idle vs Live Controls */}
              {!isMatchLive ? (
                <button
                  type="button"
                  onClick={handleStartMatch}
                  className="w-full bg-[#00F5D4] hover:bg-[#00daba] text-black py-2.5 px-3 text-sm font-black uppercase tracking-wider border-[2px] border-black shadow-[3px_3px_0_#000000] flex items-center justify-center gap-2 active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                >
                  <Swords className="w-4 h-4" />
                  Start Match (Lock In Decks)
                </button>
              ) : (
                <div className="space-y-2">
                  {/* Side-by-Side Win Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={Boolean(seriesWinner)}
                      onClick={() => handleRecordGameWin('Andy')}
                      className="bg-[#3B1F54] hover:bg-[#4c286c] text-white py-2.5 px-2 border-[2px] border-black shadow-[3px_3px_0_#00F5D4] flex flex-col items-center justify-center gap-0.5 active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-45 cursor-pointer"
                    >
                      <span className="font-black uppercase text-xs sm:text-sm text-white">
                        Andy Won G{currentGameNumber}
                      </span>
                      <span className="text-[10px] font-mono text-[#00F5D4] font-bold truncate max-w-full">
                        {selectedAndyDeck?.deck_name || 'Andy Deck'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={Boolean(seriesWinner)}
                      onClick={() => handleRecordGameWin('Kirsten')}
                      className="bg-[#FF2E93] hover:bg-[#FF4B91] text-white py-2.5 px-2 border-[2px] border-black shadow-[3px_3px_0_#FFB703] flex flex-col items-center justify-center gap-0.5 active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-45 cursor-pointer"
                    >
                      <span className="font-black uppercase text-xs sm:text-sm text-white">
                        Kirsten Won G{currentGameNumber}
                      </span>
                      <span className="text-[10px] font-mono text-white/95 font-bold truncate max-w-full">
                        {selectedKirstenDeck?.deck_name || 'Kirsten Deck'}
                      </span>
                    </button>
                  </div>

                  {/* Quick Actions Row */}
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      disabled={gameLog.length === 0}
                      onClick={handleUndoLastGame}
                      className="bg-[#FFB703] hover:bg-[#ffaa00] text-black py-1.5 px-2 text-[11px] font-black uppercase border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center justify-center gap-1 disabled:opacity-45"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Undo
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenLiveEditDrawer}
                      className="bg-[#282A32] hover:bg-[#343742] text-white py-1.5 px-2 text-[11px] font-black uppercase border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center justify-center gap-1"
                    >
                      <Edit3 className="w-3 h-3 text-[#00F5D4]" />
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={handleResetMatch}
                      className="bg-red-600 hover:bg-red-500 text-white py-1.5 px-2 text-[11px] font-black uppercase border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center justify-center gap-1"
                    >
                      <X className="w-3 h-3" />
                      Cancel
                    </button>
                  </div>

                  {/* Finish & Save Button */}
                  <div className="space-y-1">
                    {seriesWinner && (
                      <div className="flex items-center justify-center gap-1.5 font-black uppercase text-[11px] text-[#00F5D4]">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {seriesWinner} Clinched ({andyScore}-{kirstenScore})
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={saving || gameLog.length === 0}
                      onClick={handleFinishAndSaveMatch}
                      className="w-full py-2 text-xs bg-[#00F5D4] hover:bg-[#00daba] text-black font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center justify-center gap-1.5 disabled:opacity-45 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saving ? 'Saving...' : 'Finish Match & Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      );
    }

    // id === 'history'
    const matchCount = activeEpisode?.matches.length || 0;
    return (
      <section key={id} data-section-id={id} className={cardClass}>
        {renderSectionHeader(
          'history',
          'Match History',
          <Swords className="w-3.5 h-3.5 text-[#00F5D4]" />,
          `${matchCount} ${matchCount === 1 ? 'Match' : 'Matches'}`
        )}

        {!isCollapsed && (
          <div className="p-2.5 space-y-2">
            {matchCount === 0 ? (
              <div className="bg-[#160D24] border border-black p-3 text-center text-[11px] font-mono text-neutral-400">
                No matches logged for this stream yet.
              </div>
            ) : (
              [...(activeEpisode?.matches || [])]
                .reverse()
                .map((m, revIdx) => {
                  const matchNum = matchCount - revIdx;
                  const aDeck =
                    m.andy_deck || decks.find((d) => d.id === m.andy_deck_id);
                  const kDeck =
                    m.kirsten_deck ||
                    decks.find((d) => d.id === m.kirsten_deck_id);

                  return (
                    <div
                      key={m.id}
                      className="bg-[#160D24] border-[2px] border-black shadow-[2px_2px_0_#000000] p-2 space-y-1.5"
                    >
                      {/* Compact Header + Actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-black text-[10px] text-neutral-300 uppercase">
                            M{matchNum} • {m.match_format || 'Bo3'}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 text-[9px] font-black uppercase border border-black ${
                              m.winner === 'Andy'
                                ? 'bg-[#3B1F54] text-[#00F5D4]'
                                : m.winner === 'Kirsten'
                                  ? 'bg-[#FF2E93] text-white'
                                  : 'bg-[#00F5D4] text-black'
                            }`}
                          >
                            {m.winner?.toUpperCase() || 'DRAW'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditLoggedMatch(m)}
                            className="bg-[#FFB703] hover:bg-[#ffaa00] text-black px-2 py-0.5 text-[10px] font-black uppercase border border-black flex items-center gap-0.5"
                          >
                            <Edit3 className="w-2.5 h-2.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingMatchId(m.id)}
                            className="bg-[#181920] hover:bg-red-950 text-red-400 px-2 py-0.5 text-[10px] font-black uppercase border border-black flex items-center gap-0.5"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                            Del
                          </button>
                        </div>
                      </div>

                      {/* Side-by-Side Compact Result Strip */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="bg-[#181920] border border-black px-2 py-1 flex items-center justify-between gap-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-[9px] font-mono text-[#C084FC] font-black leading-none">
                              ANDY
                            </div>
                            <div className="text-[11px] font-bold text-white truncate">
                              {aDeck?.deck_name || 'Andy Deck'}
                            </div>
                          </div>
                          <span className="text-[#00F5D4] text-sm font-black shrink-0">
                            {m.andy_score}
                          </span>
                        </div>

                        <div className="bg-[#181920] border border-black px-2 py-1 flex items-center justify-between gap-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-[9px] font-mono text-[#FF4B91] font-black leading-none">
                              KIRSTEN
                            </div>
                            <div className="text-[11px] font-bold text-white truncate">
                              {kDeck?.deck_name || 'Kirsten Deck'}
                            </div>
                          </div>
                          <span className="text-[#FF4B91] text-sm font-black shrink-0">
                            {m.kirsten_score}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="w-full max-w-xl mx-auto px-2.5 sm:px-4 py-2.5 space-y-2.5">
      {/* Compact Global Utility Toolbar */}
      <div className="bg-[#1E1231] border-[2px] border-black shadow-[3px_3px_0_#000000] px-2.5 py-2 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleToggleLiveStatus}
            className={`px-2.5 py-1.5 text-[11px] font-black uppercase border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center gap-1 ${
              activeEpisode?.is_live
                ? 'bg-[#FF2E93] text-white animate-pulse'
                : 'bg-[#181920] text-neutral-300 hover:text-white'
            }`}
          >
            <Radio className="w-3 h-3" />
            {activeEpisode?.is_live ? 'LIVE' : 'OFF-AIR'}
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="bg-[#00F5D4] hover:bg-[#00daba] text-black px-2.5 py-1.5 text-[11px] font-black uppercase border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center gap-1 disabled:opacity-60"
          >
            <RefreshCw
              className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            REFRESH
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsLayoutUnlocked((v) => !v)}
            className={`px-2.5 py-1.5 text-[11px] font-black uppercase border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center gap-1 ${
              isLayoutUnlocked
                ? 'bg-[#FF2E93] text-white'
                : 'bg-[#2E184A] text-neutral-200 hover:text-white'
            }`}
            title="Lock or unlock section drag-and-drop ordering"
          >
            {isLayoutUnlocked ? (
              <>
                <Unlock className="w-3 h-3" />
                UNLOCKED
              </>
            ) : (
              <>
                <Lock className="w-3 h-3" />
                LOCKED
              </>
            )}
          </button>

          <Link
            href="/admin"
            className="bg-[#FFB703] hover:bg-[#ffaa00] text-black px-2.5 py-1.5 text-[11px] font-black uppercase border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center gap-1"
          >
            <ShieldAlert className="w-3 h-3" />
            ADMIN
          </Link>
        </div>
      </div>

      {isLayoutUnlocked && (
        <div className="bg-[#241438] border border-[#00F5D4] px-2.5 py-1.5 text-[11px] font-mono text-[#00F5D4] flex items-center justify-between gap-2">
          <span>Drag sections using ⋮⋮ (or ↑/↓) to rearrange</span>
          <button
            type="button"
            onClick={() => setSectionOrder(DEFAULT_SECTION_ORDER)}
            className="underline text-[#FFB703] font-bold shrink-0"
          >
            Reset Order
          </button>
        </div>
      )}

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="bg-[#00F5D4] text-black border-[2px] border-black shadow-[2px_2px_0_#000000] px-3 py-1.5 text-xs font-black uppercase flex items-center justify-between animate-in fade-in">
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="font-mono font-black ml-2 text-sm leading-none p-0.5 hover:opacity-70"
          >
            ✕
          </button>
        </div>
      )}

      {/* Reorderable, Collapsible Sections */}
      <div ref={sectionsContainerRef} className="space-y-2.5">
        {sectionOrder.map((secId) => renderSection(secId))}
      </div>

      {/* MODAL 1: EDIT LIVE MATCH DRAWER */}
      {liveEditDrawerOpen && (
        <div
          className="fixed inset-0 !mt-0 z-50 bg-black/80 flex items-end justify-center p-0"
          onClick={() => setLiveEditDrawerOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-[#282A32] text-white border-t-[4px] border-x-[4px] border-black p-4 space-y-3 animate-in slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-[2px] border-black pb-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
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
              <div className="bg-[#3B1F54] text-white border-[2px] border-black p-2.5 text-center space-y-1.5">
                <div className="text-[11px] font-mono text-[#00F5D4] font-black uppercase">
                  ANDY SCORE
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setManualAndyScore((s) => Math.max(0, s - 1))
                    }
                    className="bg-[#181920] text-white w-8 h-8 text-base font-black border-[2px] border-black"
                  >
                    -
                  </button>
                  <span className="text-2xl font-black">{manualAndyScore}</span>
                  <button
                    type="button"
                    onClick={() => setManualAndyScore((s) => s + 1)}
                    className="bg-[#00F5D4] text-black w-8 h-8 text-base font-black border-[2px] border-black"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="bg-[#FF2E93] text-white border-[2px] border-black p-2.5 text-center space-y-1.5">
                <div className="text-[11px] font-mono text-white font-black uppercase">
                  KIRSTEN SCORE
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setManualKirstenScore((s) => Math.max(0, s - 1))
                    }
                    className="bg-[#181920] text-white w-8 h-8 text-base font-black border-[2px] border-black"
                  >
                    -
                  </button>
                  <span className="text-2xl font-black">
                    {manualKirstenScore}
                  </span>
                  <button
                    type="button"
                    onClick={() => setManualKirstenScore((s) => s + 1)}
                    className="bg-[#FFB703] text-black w-8 h-8 text-base font-black border-[2px] border-black"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSwapPilotDecks}
              className="w-full bg-[#FFB703] text-black py-2 text-xs font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center justify-center gap-2"
            >
              <ArrowLeftRight className="w-4 h-4" />
              Swap Andy &amp; Kirsten Decks
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleApplyLiveManualEdit}
                className="flex-1 bg-[#00F5D4] text-black py-2.5 text-xs font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000]"
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
                className="bg-[#D62828] text-white py-2.5 px-3 text-xs font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000]"
              >
                Reset 0-0
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT LOGGED MATCH DIALOG */}
      {editingLoggedMatch && (
        <div
          className="fixed inset-0 !mt-0 z-50 bg-black/85 flex items-center justify-center p-3"
          onClick={() => setEditingLoggedMatch(null)}
        >
          <div
            className="w-full max-w-md bg-[#1F1133] text-white border-[3px] border-black shadow-[6px_6px_0_#000000] p-4 space-y-3"
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
                compact
                onSelect={(val) => setEditLoggedAndyDeckId(val)}
              />
            </div>

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
                compact
                onSelect={(val) => setEditLoggedKirstenDeckId(val)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="bg-[#3B1F54] text-white border-[2px] border-black p-2 text-center space-y-1">
                <div className="text-[10px] font-mono text-[#00F5D4] font-black uppercase">
                  Andy Score
                </div>
                <div className="flex items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      setEditLoggedAndyScore((s) => Math.max(0, s - 1))
                    }
                    className="bg-[#181920] text-white w-7 h-7 text-sm font-black border border-black"
                  >
                    -
                  </button>
                  <span className="text-xl font-black">
                    {editLoggedAndyScore}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditLoggedAndyScore((s) => s + 1)}
                    className="bg-[#00F5D4] text-black w-7 h-7 text-sm font-black border border-black"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="bg-[#FF2E93] text-white border-[2px] border-black p-2 text-center space-y-1">
                <div className="text-[10px] font-mono text-white font-black uppercase">
                  Kirsten Score
                </div>
                <div className="flex items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      setEditLoggedKirstenScore((s) => Math.max(0, s - 1))
                    }
                    className="bg-[#181920] text-white w-7 h-7 text-sm font-black border border-black"
                  >
                    -
                  </button>
                  <span className="text-xl font-black">
                    {editLoggedKirstenScore}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditLoggedKirstenScore((s) => s + 1)}
                    className="bg-[#FFB703] text-black w-7 h-7 text-sm font-black border border-black"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {(['Bo1', 'Bo3', 'Bo5'] as MatchFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setEditLoggedFormat(fmt)}
                  className={`py-1.5 text-xs font-black uppercase border-[2px] border-black ${
                    editLoggedFormat === fmt
                      ? 'bg-[#FFB703] text-black'
                      : 'bg-[#181920] text-neutral-400'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingLoggedMatch(null)}
                className="bg-[#181920] text-neutral-300 py-2 px-3 text-xs font-black uppercase border-[2px] border-black"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={editingMatchSaving}
                onClick={handleSaveLoggedMatchEdit}
                className="flex-1 bg-[#00F5D4] hover:bg-[#00daba] text-black py-2 px-3 text-xs font-black uppercase border-[2px] border-black shadow-[2px_2px_0_#000000] flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
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
            className="w-full max-w-sm bg-[#1F1133] text-white border-[3px] border-black shadow-[6px_6px_0_#000000] p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-black uppercase tracking-wider text-red-400 flex items-center gap-1.5">
              <Trash2 className="w-4 h-4" />
              CONFIRM DELETE
            </h3>
            <p className="text-xs text-neutral-300 font-bold leading-relaxed">
              Are you sure you want to permanently delete this logged match?
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingMatchId(null)}
                className="flex-1 bg-[#181920] text-neutral-300 py-2 text-xs font-black uppercase border-[2px] border-black"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteLoggedMatch(deletingMatchId)}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 text-xs font-black uppercase border-[2px] border-black shadow-[2px_2px_0_#000000]"
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
            className="w-full max-w-md bg-[#1F1133] border-[3px] border-black shadow-[6px_6px_0_#000000] p-4 space-y-3"
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
              className="w-full bg-[#181920] text-white border-[2px] border-black p-2 text-xs font-bold focus:outline-none focus:border-[#00F5D4]"
            />

            <div className="grid grid-cols-2 gap-2">
              <select
                value={quickInkOne}
                onChange={(e) => setQuickInkOne(e.target.value as LorcanaInk)}
                className="bg-[#181920] text-white border-[2px] border-black p-2 text-xs font-bold"
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
                className="bg-[#181920] text-white border-[2px] border-black p-2 text-xs font-bold"
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
              className="w-full bg-[#00F5D4] hover:bg-[#00daba] text-black py-2.5 text-xs font-black uppercase tracking-wider border-[2px] border-black shadow-[2px_2px_0_#000000]"
            >
              Create &amp; Select Deck
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
