'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Ban,
  Check,
  CheckSquare,
  Copy,
  Database,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FolderPlus,
  Gamepad2,
  Layers,
  Lock,
  LogOut,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Square,
  Swords,
  Trash2,
  Tv,
  X,
  Youtube,
} from 'lucide-react';
import {
  EPISODE_FORMATS,
  INK_CONFIG,
  LORCANA_INKS,
  LORCANA_SETS,
  MATCH_FORMATS,
  SAMPLE_DECKLIST_TEXT,
  formatPlayedBy,
} from '@/lib/constants';
import {
  Deck,
  DeckSubmission,
  EnrichedEpisode,
  EpisodeFormatTag,
  ExcludedYouTubeStream,
  LorcanaInk,
  Match,
  MatchFormat,
  SubmissionStatus,
  YouTubeStreamCandidate,
} from '@/lib/types';
import { InkPairBadges } from './InkBadge';
import { DeckModal } from './DeckModal';
import { useRealtime } from '@/hooks/useRealtime';
import { copyTextToClipboard } from '@/lib/clipboard';
import { sanitizeExternalUrl } from '@/lib/deck-parser';

interface RetentionStats {
  totalSubmissions: number;
  pendingCount: number;
  prunableOldCount: number;
  cachedCardsCount: number;
  cutoffDateIso: string;
  dbMode: 'postgresql' | 'local-json';
}

interface AdminDashboardClientProps {
  initialEpisodes: EnrichedEpisode[];
  initialSubmissions: DeckSubmission[];
  initialRetention: RetentionStats;
  initialDecks: Deck[];
}

export function AdminDashboardClient({
  initialEpisodes,
  initialSubmissions,
  initialRetention,
  initialDecks,
}: AdminDashboardClientProps) {
  const router = useRouter();

  const [episodes, setEpisodes] =
    useState<EnrichedEpisode[]>(initialEpisodes);
  const [submissions, setSubmissions] =
    useState<DeckSubmission[]>(initialSubmissions);
  const [retention, setRetention] =
    useState<RetentionStats>(initialRetention);
  const [decks, setDecks] = useState<Deck[]>(initialDecks);

  const [activeTab, setActiveTab] = useState<
    'decks' | 'streams' | 'submissions' | 'tools'
  >('decks');

  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>(
    initialEpisodes[0]?.id || ''
  );

  const selectedEpisode = useMemo(
    () =>
      episodes.find((e) => e.id === selectedEpisodeId) || episodes[0] || null,
    [episodes, selectedEpisodeId]
  );

  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncingYt, setSyncingYt] = useState(false);
  const [pruning, setPruning] = useState(false);

  // Deck Manager State
  const [deckSearch, setDeckSearch] = useState('');
  const [newDeckModalOpen, setNewDeckModalOpen] = useState(false);
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);
  const [inspectingDeck, setInspectingDeck] = useState<Deck | null>(null);

  // Stream Manager List & Filter State
  const [streamSearch, setStreamSearch] = useState('');
  const [streamVisibilityFilter, setStreamVisibilityFilter] = useState<'All' | 'Visible' | 'Hidden'>('All');
  const [expandedEpisodeId, setExpandedEpisodeId] = useState<string | null>(initialEpisodes[0]?.id || null);

  // Submissions State
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus | 'All'>('Pending');

  // OBS Overlay Active Assignment State
  const [obsActiveEpisodeId, setObsActiveEpisodeId] = useState<string | null>(null);
  const [obsSettingBusy, setObsSettingBusy] = useState<string | null>(null);
  const [copiedObsLink, setCopiedObsLink] = useState(false);
  const [obsSiteUrlInput, setObsSiteUrlInput] = useState<string>('DTT.Villainy.Ink');
  const [obsEnvSiteUrl, setObsEnvSiteUrl] = useState<string>('DTT.Villainy.Ink');
  const [obsHasCustomSiteUrl, setObsHasCustomSiteUrl] = useState<boolean>(false);
  const [savingObsSiteUrl, setSavingObsSiteUrl] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/admin/obs-active')
      .then((res) => res.json())
      .then((data) => {
        if (data.activeEpisodeId) {
          setObsActiveEpisodeId(data.activeEpisodeId);
        }
        if (data.siteUrl) {
          setObsSiteUrlInput(data.siteUrl);
        }
        if (data.envSiteUrl) {
          setObsEnvSiteUrl(data.envSiteUrl);
        }
        setObsHasCustomSiteUrl(Boolean(data.customSiteUrl));
      })
      .catch((err) => console.error('Failed to get OBS active stream', err));
  }, []);

  const handleSaveObsSiteUrl = async (nextUrl: string) => {
    setSavingObsSiteUrl(true);
    try {
      const res = await fetch('/api/admin/obs-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl: nextUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        setObsSiteUrlInput(data.siteUrl || '');
        if (data.envSiteUrl) {
          setObsEnvSiteUrl(data.envSiteUrl);
        }
        setObsHasCustomSiteUrl(Boolean(data.customSiteUrl));
        setBannerMsg(
          data.customSiteUrl
            ? `📺 OBS Overlay footer URL updated to "${data.siteUrl}"!`
            : `📺 OBS Overlay footer URL reset to default ("${data.siteUrl}").`
        );
      }
    } catch (err) {
      console.error('Failed to update OBS footer URL', err);
    } finally {
      setSavingObsSiteUrl(false);
    }
  };

  const handleSetObsEpisode = async (epId: string) => {
    setObsSettingBusy(epId);
    try {
      const res = await fetch('/api/admin/obs-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId: epId }),
      });
      if (res.ok) {
        setObsActiveEpisodeId(epId);
        const ep = episodes.find((e) => e.id === epId);
        setBannerMsg(`📺 OBS Overlay stream assigned to: "${ep?.title || epId}"!`);
      }
    } catch (err) {
      console.error('Failed to set OBS stream', err);
    } finally {
      setObsSettingBusy(null);
    }
  };

  const reloadAll = async () => {
    const [epRes, dkRes, subRes] = await Promise.all([
      fetch('/api/episodes?includeHidden=true'),
      fetch('/api/decks?all=true'),
      fetch('/api/submissions'),
    ]);
    const [epData, dkData, subData] = await Promise.all([
      epRes.json(),
      dkRes.json(),
      subRes.json(),
    ]);
    if (epData.episodes) setEpisodes(epData.episodes);
    if (dkData.decks) setDecks(dkData.decks);
    if (subData.submissions) setSubmissions(subData.submissions);
    router.refresh();
  };

  // Subscribe to real-time events across the entire site
  useRealtime((event) => {
    if (
      event.type === 'match_created' ||
      event.type === 'match_updated' ||
      event.type === 'match_deleted' ||
      event.type === 'deck_assigned' ||
      event.type === 'deck_unassigned' ||
      event.type === 'deck_created' ||
      event.type === 'deck_updated' ||
      event.type === 'deck_deleted' ||
      event.type === 'submission_created' ||
      event.type === 'submission_updated' ||
      event.type === 'episode_created' ||
      event.type === 'episode_deleted' ||
      event.type === 'episode_updated' ||
      event.type === 'episode_live_toggled'
    ) {
      reloadAll();
    }
    if (event.type === 'obs_assigned') {
      const newEpId = event.episodeId as string;
      if (newEpId) {
        setObsActiveEpisodeId(newEpId);
      }
    }
    if (event.type === 'obs_site_url_updated') {
      const nextUrl = String(event.siteUrl || '').trim();
      if (nextUrl) {
        setObsSiteUrlInput(nextUrl);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // STREAM MANAGEMENT ACTIONS
  // ---------------------------------------------------------------------------
  const handleToggleStreamVisibility = async (epId: string, makeHidden: boolean) => {
    setBusyId(epId);
    setBannerMsg(null);
    // Instant optimistic update
    setEpisodes((prev) =>
      prev.map((e) => (e.id === epId ? { ...e, is_hidden: makeHidden } : e))
    );
    try {
      const res = await fetch('/api/episodes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episodeId: epId,
          is_hidden: makeHidden,
        }),
      });
      if (res.ok) {
        const ep = episodes.find((e) => e.id === epId);
        setBannerMsg(
          `Stream "${ep?.title?.slice(0, 35) || 'Stream'}..." is now ${
            makeHidden ? 'HIDDEN from public' : 'VISIBLE on public site'
          }. Saved!`
        );
      } else {
        await reloadAll();
      }
    } catch (err) {
      console.error(err);
      await reloadAll();
    } finally {
      setBusyId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // YOUTUBE IMPORT MODAL STATE & ACTIONS
  // ---------------------------------------------------------------------------
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importTab, setImportTab] = useState<'available' | 'excluded'>('available');
  const [ytLoading, setYtLoading] = useState(false);
  const [ytImporting, setYtImporting] = useState(false);
  const [ytApiWarning, setYtApiWarning] = useState<string | null>(null);
  const [ytCandidates, setYtCandidates] = useState<YouTubeStreamCandidate[]>([]);
  const [ytExcluded, setYtExcluded] = useState<ExcludedYouTubeStream[]>([]);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [importSearch, setImportSearch] = useState('');
  const [ytActionBusyId, setYtActionBusyId] = useState<string | null>(null);

  // Manual YouTube URL import state
  const [manualUrlInput, setManualUrlInput] = useState('');
  const [manualLookupBusy, setManualLookupBusy] = useState(false);
  const [manualLookupError, setManualLookupError] = useState<string | null>(null);
  const [manualCandidate, setManualCandidate] = useState<YouTubeStreamCandidate | null>(null);
  const [manualLookupMeta, setManualLookupMeta] = useState<{
    alreadyImported: boolean;
    isExcluded: boolean;
    metadataFound: boolean;
    warning?: string;
  } | null>(null);

  const fetchYouTubeData = async () => {
    setYtLoading(true);
    try {
      const res = await fetch('/api/admin/youtube-streams');
      const data = await res.json();
      if (res.ok) {
        setYtCandidates(data.available || []);
        setYtExcluded(data.excluded || []);
        setYtApiWarning(data.apiWarning || null);
      } else {
        setYtApiWarning(data.error || 'Failed to scan YouTube channel.');
      }
    } catch (err) {
      console.error('Failed to fetch YouTube streams', err);
      setYtApiWarning('Network error while scanning YouTube channel.');
    } finally {
      setYtLoading(false);
    }
  };

  const openImportModal = () => {
    setImportModalOpen(true);
    setSelectedVideoIds(new Set());
    setImportSearch('');
    setYtApiWarning(null);
    setManualUrlInput('');
    setManualLookupError(null);
    setManualCandidate(null);
    setManualLookupMeta(null);
    fetchYouTubeData();
  };

  const handleLookupManualUrl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = manualUrlInput.trim();
    if (!trimmed) return;
    setManualLookupBusy(true);
    setManualLookupError(null);
    setManualCandidate(null);
    setManualLookupMeta(null);
    try {
      const res = await fetch('/api/admin/youtube-streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setManualLookupError(data.error || 'Could not inspect that YouTube URL.');
        return;
      }
      setManualCandidate(data.candidate || null);
      setManualLookupMeta({
        alreadyImported: Boolean(data.alreadyImported),
        isExcluded: Boolean(data.isExcluded),
        metadataFound: Boolean(data.metadataFound),
        warning: data.warning,
      });
    } catch {
      setManualLookupError('Network error while looking up YouTube URL.');
    } finally {
      setManualLookupBusy(false);
    }
  };

  const handleImportManualCandidate = async () => {
    if (!manualCandidate || !manualCandidate.title.trim()) {
      setManualLookupError('Please enter a stream title before importing.');
      return;
    }
    setYtImporting(true);
    setManualLookupError(null);
    try {
      const res = await fetch('/api/admin/youtube-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streams: [manualCandidate] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setManualLookupError(data.error || 'Failed to import stream.');
        return;
      }
      setYtCandidates((prev) =>
        prev.filter((c) => c.youtube_video_id !== manualCandidate.youtube_video_id)
      );
      setYtExcluded((prev) =>
        prev.filter((x) => x.youtube_video_id !== manualCandidate.youtube_video_id)
      );
      setBannerMsg(
        data.message || `Imported "${manualCandidate.title}" into Deck Test Tuesday!`
      );
      setManualUrlInput('');
      setManualCandidate(null);
      setManualLookupMeta(null);
      await reloadAll();
    } catch {
      setManualLookupError('Network error while importing stream.');
    } finally {
      setYtImporting(false);
    }
  };

  const handleDeleteEpisode = async (ep: EnrichedEpisode) => {
    const matchWarn =
      ep.matches.length > 0
        ? ` This will also remove ${ep.matches.length} logged match${
            ep.matches.length === 1 ? '' : 'es'
          } for this stream.`
        : '';
    if (
      !confirm(
        `Permanently delete stream "${ep.title}"?${matchWarn} Your decks in the Deck Library will stay intact.`
      )
    ) {
      return;
    }
    setBusyId(ep.id);
    setBannerMsg(null);
    try {
      const res = await fetch(
        `/api/episodes?id=${encodeURIComponent(ep.id)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        if (expandedEpisodeId === ep.id) setExpandedEpisodeId(null);
        if (selectedEpisodeId === ep.id) setSelectedEpisodeId('');
        if (obsActiveEpisodeId === ep.id) setObsActiveEpisodeId(null);
        await reloadAll();
        setBannerMsg(`Deleted stream "${ep.title}".`);
      } else {
        const err = await res.json().catch(() => ({}));
        setBannerMsg(
          `Delete failed: ${err.error || 'Could not delete stream.'}`
        );
      }
    } catch {
      setBannerMsg('Network error while deleting stream.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleSelectVideo = (videoId: string) => {
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return next;
    });
  };

  const handleSelectAllVideos = (filtered: YouTubeStreamCandidate[]) => {
    if (selectedVideoIds.size === filtered.length) {
      setSelectedVideoIds(new Set());
    } else {
      setSelectedVideoIds(new Set(filtered.map((c) => c.youtube_video_id)));
    }
  };

  const handleImportSelected = async () => {
    if (selectedVideoIds.size === 0) return;
    setYtImporting(true);
    const toImport = ytCandidates.filter((c) => selectedVideoIds.has(c.youtube_video_id));
    try {
      const res = await fetch('/api/admin/youtube-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streams: toImport }),
      });
      if (res.ok) {
        const data = await res.json();
        setBannerMsg(data.message || `Successfully imported ${toImport.length} stream(s)!`);
        setYtCandidates((prev) => prev.filter((c) => !selectedVideoIds.has(c.youtube_video_id)));
        setSelectedVideoIds(new Set());
        await reloadAll();
      } else {
        const err = await res.json();
        setBannerMsg(`Import error: ${err.error || 'Failed to import streams'}`);
      }
    } catch (err) {
      console.error(err);
      setBannerMsg('Network error while importing streams.');
    } finally {
      setYtImporting(false);
    }
  };

  const handleExcludeStream = async (candidate: YouTubeStreamCandidate) => {
    setYtActionBusyId(candidate.youtube_video_id);
    try {
      const res = await fetch('/api/admin/youtube-exclude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'exclude',
          youtube_video_id: candidate.youtube_video_id,
          title: candidate.title,
          published_date: candidate.stream_date,
        }),
      });
      if (res.ok) {
        setYtCandidates((prev) => prev.filter((c) => c.youtube_video_id !== candidate.youtube_video_id));
        setSelectedVideoIds((prev) => {
          const next = new Set(prev);
          next.delete(candidate.youtube_video_id);
          return next;
        });
        setYtExcluded((prev) => [
          {
            youtube_video_id: candidate.youtube_video_id,
            title: candidate.title,
            published_date: candidate.stream_date,
          },
          ...prev,
        ]);
        setBannerMsg(`"${candidate.title.slice(0, 30)}..." excluded from future imports.`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setYtActionBusyId(null);
    }
  };

  const handleIncludeStream = async (videoId: string) => {
    setYtActionBusyId(videoId);
    try {
      const res = await fetch('/api/admin/youtube-exclude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'include',
          youtube_video_id: videoId,
        }),
      });
      if (res.ok) {
        setYtExcluded((prev) => prev.filter((x) => x.youtube_video_id !== videoId));
        await fetchYouTubeData();
        setBannerMsg('Stream restored and available for import again.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setYtActionBusyId(null);
    }
  };

  const handleSaveEpisodeMeta = async (
    epId: string,
    updates: {
      title: string;
      stream_date: string;
      set_name: string;
      format_tag: EpisodeFormatTag;
      is_live: boolean;
      is_upcoming: boolean;
      is_hidden: boolean;
    }
  ) => {
    setBusyId(epId);
    setBannerMsg(null);
    try {
      const res = await fetch('/api/episodes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episodeId: epId,
          ...updates,
        }),
      });
      if (res.ok) {
        await reloadAll();
        setBannerMsg(`Saved stream settings for "${updates.title}".`);
      }
    } finally {
      setBusyId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // DECK ASSIGNMENT ACTIONS
  // ---------------------------------------------------------------------------
  const handleAssignDeckToEpisode = async (episodeId: string, deckId: string) => {
    setBusyId(`assign-${deckId}`);
    try {
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign',
          episode_id: episodeId,
          deck_id: deckId,
        }),
      });
      if (res.ok) {
        await reloadAll();
        setBannerMsg('Assigned deck to stream.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleUnassignDeckFromEpisode = async (episodeId: string, deckId: string) => {
    setBusyId(`unassign-${deckId}`);
    try {
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unassign',
          episode_id: episodeId,
          deck_id: deckId,
        }),
      });
      if (res.ok) {
        await reloadAll();
        setBannerMsg('Unassigned deck from stream.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const handlePruneUnplayedDecks = async (episodeId: string) => {
    setBusyId(`prune-${episodeId}`);
    try {
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'prune_unplayed',
          episode_id: episodeId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const removedCount = Array.isArray(data.removed_deck_ids)
          ? data.removed_deck_ids.length
          : 0;
        await reloadAll();
        setBannerMsg(
          removedCount > 0
            ? `Unassigned ${removedCount} unplayed deck(s) from stream.`
            : 'No unplayed decks to unassign.'
        );
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleRefreshDeckSnapshot = async (episodeId: string, deckId: string) => {
    setBusyId(`refresh-snap-${deckId}`);
    try {
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refresh_snapshot',
          episode_id: episodeId,
          deck_id: deckId,
        }),
      });
      if (res.ok) {
        await reloadAll();
        setBannerMsg('Synced stream deck snapshot from Deck Library.');
      }
    } finally {
      setBusyId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // DECK CRUD
  // ---------------------------------------------------------------------------
  const handleSaveDeck = async (deckData: Partial<Deck> & { id?: string }) => {
    setBusyId('save-deck');
    try {
      if (deckData.id) {
        // Update existing deck
        const res = await fetch('/api/decks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(deckData),
        });
        if (res.ok) {
          await reloadAll();
          setBannerMsg(`Updated "${deckData.deck_name}".`);
          setEditingDeck(null);
        }
      } else {
        // Create new paper deck
        const res = await fetch('/api/decks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(deckData),
        });
        if (res.ok) {
          await reloadAll();
          setBannerMsg(`Created paper deck "${deckData.deck_name}".`);
          setNewDeckModalOpen(false);
        }
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteDeck = async (deckId: string) => {
    if (!confirm('Are you sure you want to delete this deck from the database?')) return;
    setBusyId(deckId);
    try {
      const res = await fetch(`/api/decks?id=${deckId}`, { method: 'DELETE' });
      if (res.ok) {
        await reloadAll();
        setBannerMsg('Deleted deck from database.');
      }
    } finally {
      setBusyId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // MATCH CRUD
  // ---------------------------------------------------------------------------
  const handleSaveMatch = async (match: Match) => {
    setBusyId(match.id);
    try {
      const winner =
        match.andy_score > match.kirsten_score
          ? 'Andy'
          : match.kirsten_score > match.andy_score
            ? 'Kirsten'
            : 'Draw';
      const res = await fetch('/api/matches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...match, winner }),
      });
      if (res.ok) {
        await reloadAll();
        setBannerMsg('Saved match results.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleAddMatchToEpisode = async (episodeToUse?: EnrichedEpisode) => {
    const ep = episodeToUse || selectedEpisode;
    if (!ep || ep.decks.length === 0) {
      alert('Please assign at least one deck to this stream before creating a match.');
      return;
    }
    setBusyId(`add-match-${ep.id}`);
    try {
      const d1 = ep.decks[0];
      const d2 = ep.decks[1] || ep.decks[0];
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episode_id: ep.id,
          andy_deck_id: d1.id,
          kirsten_deck_id: d2.id,
          match_format: 'Bo3',
          andy_score: 0,
          kirsten_score: 0,
          winner: 'Draw',
          game_log: [],
        }),
      });
      if (res.ok) {
        await reloadAll();
        setBannerMsg('Added match to stream.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteMatch = async (matchId: string) => {
    setBusyId(matchId);
    try {
      const res = await fetch(`/api/matches?id=${matchId}`, { method: 'DELETE' });
      if (res.ok) {
        await reloadAll();
        setBannerMsg('Deleted match.');
      }
    } finally {
      setBusyId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // SUBMISSIONS & RETENTION
  // ---------------------------------------------------------------------------
  const isSubmissionInLibrary = (sub: DeckSubmission): boolean => {
    const base = sub.deck_name.trim().toLowerCase();
    const bySuffix = `(by ${sub.submitter_name.trim()})`.toLowerCase();
    const expectedName = base.includes(bySuffix) ? base : `${base} ${bySuffix}`;
    const submitter = sub.submitter_name.trim().toLowerCase();
    return decks.some(
      (d) =>
        d.ink_one === sub.ink_one &&
        d.ink_two === sub.ink_two &&
        (d.deck_name.trim().toLowerCase() === expectedName ||
          (d.deck_name.trim().toLowerCase() === base &&
            (d.built_by || '').trim().toLowerCase() === submitter))
    );
  };

  const handleInspectSubmission = (sub: DeckSubmission) => {
    setInspectingDeck({
      id: sub.id,
      pilot: 'Community Sub',
      built_by: sub.submitter_name,
      deck_name: `${sub.deck_name} (by ${sub.submitter_name})`,
      ink_one: sub.ink_one,
      ink_two: sub.ink_two,
      deck_link: sub.deck_link || null,
      notes: sub.notes || null,
      raw_decklist: sub.raw_decklist || '',
      parsed_cards: Array.isArray(sub.parsed_cards) ? sub.parsed_cards : [],
      created_at: sub.created_at,
    });
  };

  const handleStatusUpdate = async (id: string, status: SubmissionStatus) => {
    setBusyId(id);
    setBannerMsg(null);
    try {
      const res = await fetch('/api/submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'status', status }),
      });
      const data = await res.json();
      if (res.ok && data.submission) {
        setSubmissions((prev) =>
          prev.map((s) => (s.id === id ? data.submission : s))
        );
        if (status === 'Approved') {
          await reloadAll();
          setBannerMsg(
            data.alreadyInLibrary
              ? `"${data.submission.deck_name}" is already in the Deck Manager.`
              : `Approved "${data.submission.deck_name}" and added it to your Deck Manager!`
          );
        } else {
          setBannerMsg(`Marked "${data.submission.deck_name}" as ${status}.`);
        }
      } else {
        setBannerMsg(
          `Submission update failed: ${data.error || 'Could not update submission.'}`
        );
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleRunRetentionPrune = async () => {
    setPruning(true);
    try {
      const res = await fetch('/api/admin/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retentionDays: 90 }),
      });
      const data = await res.json();
      if (res.ok) {
        setRetention(data.stats);
        setBannerMsg(`Pruned ${data.deletedCount} submissions older than 90 days.`);
      }
    } finally {
      setPruning(false);
    }
  };

  const handleSyncYouTube = async () => {
    setSyncingYt(true);
    try {
      const res = await fetch('/api/cron/youtube-sync', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBannerMsg(
          `Sync failed: ${data.error || 'Could not sync streams from YouTube.'}`
        );
        return;
      }
      await reloadAll();
      setBannerMsg(data.message || 'Synced streams from YouTube!');
    } catch {
      setBannerMsg('Network error while syncing streams from YouTube.');
    } finally {
      setSyncingYt(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.push('/admin/login');
    router.refresh();
  };

  // Filtered decks for Deck Manager
  const filteredDecks = useMemo(() => {
    return decks.filter((d) => {
      if (deckSearch.trim()) {
        const q = deckSearch.toLowerCase();
        const inName = d.deck_name.toLowerCase().includes(q);
        const inInks =
          d.ink_one.toLowerCase().includes(q) ||
          d.ink_two.toLowerCase().includes(q);
        const inNotes = (d.notes || '').toLowerCase().includes(q);
        if (!inName && !inInks && !inNotes) return false;
      }
      return true;
    });
  }, [decks, deckSearch]);

  // Filtered streams for Stream Manager List
  const filteredStreams = useMemo(() => {
    return episodes.filter((ep) => {
      if (streamVisibilityFilter === 'Visible' && ep.is_hidden) return false;
      if (streamVisibilityFilter === 'Hidden' && !ep.is_hidden) return false;
      if (streamSearch.trim()) {
        const q = streamSearch.toLowerCase();
        const inTitle = ep.title.toLowerCase().includes(q);
        const inSet = (ep.set_name || '').toLowerCase().includes(q);
        const inDate = ep.stream_date.includes(q);
        if (!inTitle && !inSet && !inDate) return false;
      }
      return true;
    });
  }, [episodes, streamVisibilityFilter, streamSearch]);

  const filteredSubmissions =
    statusFilter === 'All'
      ? submissions
      : submissions.filter((s) => s.status === statusFilter);

  // Filtered YouTube candidates for import popover
  const filteredCandidates = useMemo(() => {
    if (!importSearch.trim()) return ytCandidates;
    const q = importSearch.toLowerCase();
    return ytCandidates.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.set_name.toLowerCase().includes(q) ||
        c.stream_date.includes(q)
    );
  }, [ytCandidates, importSearch]);

  // Filtered YouTube excluded streams
  const filteredExcluded = useMemo(() => {
    if (!importSearch.trim()) return ytExcluded;
    const q = importSearch.toLowerCase();
    return ytExcluded.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.published_date && e.published_date.includes(q))
    );
  }, [ytExcluded, importSearch]);

  return (
    <div className="space-y-6">
      {/* Top Admin Header */}
      <div className="brutal-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase text-white">
            Deck Test Tuesday Admin
          </h1>
          <p className="text-xs font-mono text-neutral-400 mt-0.5">
            Database: {retention.dbMode.toUpperCase()} • {decks.length} Decks in Library • {episodes.length} Streams
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* OBS Overlay Link & Copy Button */}
          <div className="flex items-stretch shadow-[3px_3px_0px_#000000]">
            <Link
              href="/overlay"
              target="_blank"
              rel="noreferrer"
              className="brutal-btn bg-[#FFB703] text-black px-3.5 py-2 text-xs font-black flex items-center gap-1.5 hover:bg-[#e5a400] transition-colors"
              title="Open OBS Overlay in new window"
            >
              <Tv className="w-4 h-4" />
              <span>OBS Overlay</span>
            </Link>
            <button
              type="button"
              onClick={async () => {
                const overlayUrl = `${window.location.origin}/overlay`;
                const ok = await copyTextToClipboard(overlayUrl);
                if (ok) {
                  setCopiedObsLink(true);
                  setTimeout(() => setCopiedObsLink(false), 2500);
                  setBannerMsg(`Copied OBS Overlay URL: ${overlayUrl}`);
                } else {
                  window.prompt('Copy OBS Overlay Browser Source URL:', overlayUrl);
                }
              }}
              className="brutal-btn bg-[#1C0F2F] text-neutral-200 px-2.5 py-2 text-xs border-l-0 hover:bg-[#2E184A] hover:text-[#00F5D4] transition-colors"
              title="Copy OBS Overlay Browser Source URL"
            >
              {copiedObsLink ? (
                <Check className="w-4 h-4 text-[#00F5D4]" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>

          <Link
            href="/admin/controller"
            className="brutal-btn bg-[#FF2E93] text-white px-3.5 py-2 text-xs"
          >
            <Gamepad2 className="w-4 h-4" />
            Stream Controller
          </Link>
          <button
            type="button"
            onClick={handleSyncYouTube}
            disabled={syncingYt}
            className="brutal-btn bg-[#00F5D4] text-black px-3.5 py-2 text-xs"
          >
            <RefreshCw className={`w-4 h-4 ${syncingYt ? 'animate-spin' : ''}`} />
            {syncingYt ? 'Syncing...' : 'Sync YouTube'}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="brutal-btn bg-[#2E184A] text-neutral-200 px-3 py-2 text-xs hover:text-white hover:bg-[#3B1F54]"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex flex-wrap gap-2 border-b-[3px] border-black pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('decks')}
          className={`brutal-btn px-4 py-2 text-xs ${
            activeTab === 'decks'
              ? 'bg-[#00F5D4] text-black shadow-[3px_3px_0px_#000000]'
              : 'bg-[#2E184A] text-white hover:bg-[#3B1F54] hover:text-[#00F5D4]'
          }`}
        >
          <Layers className="w-4 h-4" />
          1. Deck Manager ({decks.length} Decks)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('streams')}
          className={`brutal-btn px-4 py-2 text-xs ${
            activeTab === 'streams'
              ? 'bg-[#00F5D4] text-black shadow-[3px_3px_0px_#000000]'
              : 'bg-[#2E184A] text-white hover:bg-[#3B1F54] hover:text-[#00F5D4]'
          }`}
        >
          <Tv className="w-4 h-4" />
          2. Streams &amp; Matches ({episodes.length} Streams)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('submissions')}
          className={`brutal-btn px-4 py-2 text-xs ${
            activeTab === 'submissions'
              ? 'bg-[#00F5D4] text-black shadow-[3px_3px_0px_#000000]'
              : 'bg-[#2E184A] text-white hover:bg-[#3B1F54] hover:text-[#00F5D4]'
          }`}
        >
          <FolderPlus className="w-4 h-4" />
          <span>
            3. Viewer Submissions ({submissions.length}
            {submissions.filter((s) => s.status === 'Pending').length > 0
              ? ` • ${submissions.filter((s) => s.status === 'Pending').length} Pending`
              : ''}
            )
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tools')}
          className={`brutal-btn px-4 py-2 text-xs ${
            activeTab === 'tools'
              ? 'bg-[#00F5D4] text-black shadow-[3px_3px_0px_#000000]'
              : 'bg-[#2E184A] text-white hover:bg-[#3B1F54] hover:text-[#00F5D4]'
          }`}
        >
          <Database className="w-4 h-4" />
          4. Settings &amp; DB
        </button>
      </div>

      {bannerMsg && (
        <div className="bg-[#00F5D4] text-black border-[3px] border-black px-4 py-2.5 font-black text-xs flex items-center justify-between">
          <span>{bannerMsg}</span>
          <button type="button" onClick={() => setBannerMsg(null)} className="font-mono font-black">
            ✕
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 1: DECK MANAGER (LIBRARY OF ALL DECKS) */}
      {/* =================================================================== */}
      {activeTab === 'decks' && (
        <div className="space-y-5">
          <div className="brutal-card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black uppercase text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-[#00F5D4]" />
                  Paper Deck Library &amp; Manager
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Maintain all paper decks in your library. Assign any deck to one or multiple streams.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setNewDeckModalOpen(true)}
                className="brutal-btn bg-[#00F5D4] text-black px-4 py-2 text-xs shrink-0"
              >
                <Plus className="w-4 h-4" />
                Add Paper Deck
              </button>
            </div>

            {/* Deck Search */}
            <div className="pt-2">
              <div className="relative">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={deckSearch}
                  onChange={(e) => setDeckSearch(e.target.value)}
                  placeholder="Search library decks by name, ink, notes..."
                  className="brutal-input pl-10 text-xs py-2"
                />
              </div>
            </div>
          </div>

          {/* Decks Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDecks.map((deck) => (
              <div
                key={deck.id}
                className="brutal-card p-4 space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <InkPairBadges inkOne={deck.ink_one} inkTwo={deck.ink_two} size="sm" />
                    <span className="text-[10px] font-mono text-neutral-400">
                      {deck.parsed_cards.reduce((s, c) => s + c.count, 0)} cards cached
                    </span>
                  </div>

                  <div>
                    <h3 className="font-black text-lg uppercase text-white leading-tight">
                      {deck.deck_name}
                    </h3>
                    {deck.built_by && (
                      <div className="text-[11px] font-mono text-neutral-400 mt-0.5">
                        Builder: <span className="text-neutral-200 font-bold">{deck.built_by}</span>
                      </div>
                    )}
                  </div>

                  {deck.notes && (
                    <p className="text-xs text-neutral-300 bg-[#1C0F2F] border border-black p-2 font-mono">
                      {deck.notes}
                    </p>
                  )}

                  {/* Assigned Streams */}
                  <div className="space-y-1.5 border-t border-black/60 pt-2.5">
                    <div className="text-[10px] font-mono uppercase text-[#00F5D4] font-bold">
                      Assigned to Streams ({deck.assigned_episodes?.length || 0}):
                    </div>
                    {deck.assigned_episodes && deck.assigned_episodes.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {deck.assigned_episodes.map((a) => (
                          <span
                            key={a.episode_id}
                            className="inline-flex items-center gap-1 text-[11px] font-mono bg-[#1C0F2F] border border-black px-1.5 py-0.5 text-neutral-300"
                          >
                            <span>{a.stream_date}</span>
                            <button
                              type="button"
                              onClick={() => handleUnassignDeckFromEpisode(a.episode_id, deck.id)}
                              className="text-neutral-500 hover:text-[#D62828] font-bold"
                              title="Unassign from this stream"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] font-mono text-neutral-400">
                        Not assigned to any stream yet.
                      </div>
                    )}
                  </div>

                  {/* Quick Assign to Stream Dropdown */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <select
                      id={`assign-select-${deck.id}`}
                      defaultValue=""
                      className="brutal-input text-[11px] py-1 flex-1"
                    >
                      <option value="" disabled>
                        Assign to stream...
                      </option>
                      {episodes.map((ep) => (
                        <option key={ep.id} value={ep.id}>
                          [{ep.stream_date}] {ep.title.slice(0, 30)}...
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const sel = document.getElementById(
                          `assign-select-${deck.id}`
                        ) as HTMLSelectElement;
                        if (sel && sel.value) {
                          handleAssignDeckToEpisode(sel.value, deck.id);
                        }
                      }}
                      className="brutal-btn bg-[#FFB703] text-black px-2.5 py-1 text-[11px]"
                    >
                      Assign
                    </button>
                  </div>
                </div>

                {/* Deck Card Actions */}
                <div className="flex items-center justify-between border-t border-black/80 pt-3 mt-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInspectingDeck(deck)}
                      className="brutal-btn bg-[#181920] text-[#00F5D4] px-2.5 py-1 text-[11px]"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Cards
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingDeck(deck)}
                      className="brutal-btn bg-[#282A32] text-white px-2.5 py-1 text-[11px]"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteDeck(deck.id)}
                    className="text-neutral-500 hover:text-[#D62828] p-1"
                    title="Delete deck"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: STREAMS & MATCHES (STREAM MANAGER LIST VIEW) */}
      {/* =================================================================== */}
      {activeTab === 'streams' && (
        <div className="space-y-6">
          {/* Header & Filter Card */}
          <div className="brutal-card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black uppercase text-white flex items-center gap-2">
                  <Tv className="w-5 h-5 text-[#00F5D4]" />
                  DTT Stream Manager ({episodes.length} Total Streams)
                </h2>
                <p className="text-xs text-neutral-300 mt-0.5">
                  Click <strong className="text-[#00F5D4]">&ldquo;Show&rdquo;</strong> or <strong className="text-[#FF2E93]">&ldquo;Hide&rdquo;</strong> on any stream below to instantly update its public visibility in 1 click.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={openImportModal}
                  className="brutal-btn bg-[#FF2E93] text-white hover:bg-[#ff4da6] px-3.5 py-2 text-xs font-black shadow-[3px_3px_0px_#000000] flex items-center gap-2 transition-all hover:-translate-y-0.5"
                >
                  <Youtube className="w-4 h-4" />
                  <span>Import from YouTube</span>
                </button>

                <div className="flex items-center gap-2 bg-[#1C0F2F] px-3 py-1.5 border-[2px] border-black">
                  <span className="text-xs font-mono font-bold text-neutral-300">
                    Visible: <span className="text-[#00F5D4] font-black">{episodes.filter((e) => !e.is_hidden).length}</span>
                  </span>
                  <span className="text-neutral-500">•</span>
                  <span className="text-xs font-mono font-bold text-neutral-300">
                    Hidden: <span className="text-[#FF4B91] font-black">{episodes.filter((e) => e.is_hidden).length}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Filter toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={streamSearch}
                  onChange={(e) => setStreamSearch(e.target.value)}
                  placeholder="Search streams by title, set name (e.g. Hyperia City), date..."
                  className="brutal-input pl-10 text-xs py-2"
                />
              </div>

              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                {(
                  [
                    { id: 'All', label: `All (${episodes.length})` },
                    { id: 'Visible', label: `Visible (${episodes.filter((e) => !e.is_hidden).length})` },
                    { id: 'Hidden', label: `Hidden (${episodes.filter((e) => e.is_hidden).length})` },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStreamVisibilityFilter(opt.id)}
                    className={`px-3 py-1.5 text-xs font-black uppercase border-[2px] border-black transition-colors ${
                      streamVisibilityFilter === opt.id
                        ? opt.id === 'Visible'
                          ? 'bg-[#00F5D4] text-black shadow-[2px_2px_0px_#000000]'
                          : opt.id === 'Hidden'
                            ? 'bg-[#FF2E93] text-white shadow-[2px_2px_0px_#000000]'
                            : 'bg-[#FFB703] text-black shadow-[2px_2px_0px_#000000]'
                        : 'bg-[#1C0F2F] text-neutral-300 hover:text-white hover:bg-[#2A1545]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Stream List */}
          {filteredStreams.length === 0 ? (
            <div className="brutal-card p-10 text-center space-y-3">
              <div className="text-base font-black uppercase text-white">
                No streams match your filter or search query
              </div>
              <button
                type="button"
                onClick={() => {
                  setStreamSearch('');
                  setStreamVisibilityFilter('All');
                }}
                className="brutal-btn bg-[#00F5D4] text-black px-4 py-2 text-xs"
              >
                Reset Search &amp; Filters
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredStreams.map((ep) => {
                const isExpanded = expandedEpisodeId === ep.id;
                const isBusy = busyId === ep.id;

                return (
                  <article
                    key={ep.id}
                    className={`brutal-card p-5 space-y-4 transition-all ${
                      !ep.is_hidden
                        ? 'border-l-[6px] border-l-[#00F5D4]'
                        : 'opacity-85 hover:opacity-100'
                    }`}
                  >
                    {/* Top Row: Date, Set, Format, Badges & 1-Click Action Controls */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b-[2px] border-black pb-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                        <span className="text-neutral-300 font-bold">{ep.stream_date}</span>
                        <span>•</span>
                        <span className="text-[#00F5D4] font-black uppercase">
                          SET: {ep.set_name}
                        </span>
                        <span>•</span>
                        <span className="text-neutral-300 uppercase font-bold">
                          {ep.format_tag}
                        </span>

                        {/* Visibility Badge */}
                        {!ep.is_hidden ? (
                          <span className="brutal-tag bg-[#00F5D4] text-black font-black text-[10px]">
                            PUBLIC VISIBLE
                          </span>
                        ) : (
                          <span className="brutal-tag bg-[#1C0F2F] text-[#FF4B91] border border-[#FF4B91]/50 font-black text-[10px]">
                            HIDDEN ARCHIVE
                          </span>
                        )}

                        {ep.is_live && (
                          <span className="brutal-tag bg-[#FF2E93] text-white animate-pulse text-[10px]">
                            LIVE NOW
                          </span>
                        )}
                        {ep.is_upcoming && (
                          <span className="brutal-tag bg-[#FFB703] text-black text-[10px]">
                            UPCOMING
                          </span>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {/* 1-CLICK OBS OVERLAY ASSIGN */}
                        {obsActiveEpisodeId === ep.id ? (
                          <span
                            className="brutal-tag bg-[#FFB703] text-black font-black text-[10px] flex items-center gap-1 shadow-[2px_2px_0px_#000000]"
                            title="This stream is currently showing on the OBS Match History Overlay"
                          >
                            📺 OBS ACTIVE
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={obsSettingBusy === ep.id}
                            onClick={() => handleSetObsEpisode(ep.id)}
                            className="brutal-btn px-3 py-1.5 text-xs bg-[#1C0F2F] text-neutral-200 hover:text-[#FFB703] hover:bg-[#2E184A] border-[2px] border-black transition-all"
                            title="Assign this stream to display on the OBS Overlay (/overlay)"
                          >
                            {obsSettingBusy === ep.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Tv className="w-3.5 h-3.5 text-[#FFB703]" />
                            )}
                            <span>{obsSettingBusy === ep.id ? 'Setting...' : 'Set for OBS'}</span>
                          </button>
                        )}

                        {/* 1-CLICK SHOW / HIDE BUTTON */}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggleStreamVisibility(ep.id, !ep.is_hidden)}
                          className={`brutal-btn px-3.5 py-1.5 text-xs transition-all ${
                            ep.is_hidden
                              ? 'bg-[#00F5D4] text-black hover:bg-[#26fadc] shadow-[2px_2px_0px_#000000]'
                              : 'bg-[#2E184A] text-neutral-200 hover:text-white hover:bg-[#3B1F54] border-[2px] border-black'
                          }`}
                          title={
                            ep.is_hidden
                              ? 'Click to immediately make this stream visible to public'
                              : 'Click to immediately hide this stream from public'
                          }
                        >
                          {isBusy ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : ep.is_hidden ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-[#FF2E93]" />
                          )}
                          <span>
                            {isBusy
                              ? 'Saving...'
                              : ep.is_hidden
                                ? 'Show Stream'
                                : 'Hide Stream'}
                          </span>
                        </button>

                        {/* Expand / Edit Details & Decks */}
                        <button
                          type="button"
                          onClick={() => setExpandedEpisodeId(isExpanded ? null : ep.id)}
                          className={`brutal-btn px-3 py-1.5 text-xs ${
                            isExpanded
                              ? 'bg-[#FFB703] text-black'
                              : 'bg-[#1C0F2F] text-white hover:bg-[#2E184A]'
                          }`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>{isExpanded ? 'Close Editor' : 'Edit Stream & Decks'}</span>
                        </button>

                        {/* View Public Page */}
                        <Link
                          href={`/episodes/${ep.id}`}
                          className="brutal-btn bg-[#1C0F2F] text-[#00F5D4] px-3 py-1.5 text-xs hover:bg-[#2E184A]"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Public Page</span>
                        </Link>

                        {/* Delete Stream */}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDeleteEpisode(ep)}
                          className="brutal-btn bg-[#1C0F2F] text-neutral-300 hover:bg-[#D62828] hover:text-white px-2.5 py-1.5 text-xs border-[2px] border-black transition-colors"
                          title="Permanently delete this stream"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>

                    {/* Stream Title */}
                    <div>
                      <h3 className="text-xl sm:text-2xl font-black uppercase text-white leading-snug">
                        {ep.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-neutral-400 mt-1">
                        <span className="font-bold text-neutral-300">
                          {ep.decks.length} Decks Assigned
                        </span>
                        <span>•</span>
                        <span className="font-bold text-neutral-300">
                          {ep.matches.length} Matches Logged
                        </span>
                        {ep.vod_url && (
                          <>
                            <span>•</span>
                            <a
                              href={ep.vod_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#FF2E93] hover:underline"
                            >
                              Watch YouTube VOD
                            </a>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Assigned Decks Preview Chips (when collapsed) */}
                    {!isExpanded && ep.decks.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {ep.decks.map((d) => (
                          <span
                            key={d.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-bold bg-[#1C0F2F] border border-black text-neutral-200"
                          >
                            <InkPairBadges inkOne={d.ink_one} inkTwo={d.ink_two} size="sm" />
                            <span>{d.deck_name}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* EXPANDED EDITOR ACCORDION FOR THIS STREAM */}
                    {isExpanded && (
                      <div className="bg-[#190C28] border-[3px] border-black p-5 space-y-6 mt-4">
                        {/* 1. Metadata Editor */}
                        <div className="space-y-2">
                          <h4 className="text-sm font-black uppercase text-[#00F5D4] flex items-center gap-2">
                            <Edit3 className="w-4 h-4" />
                            Stream Metadata &amp; Broadcast Settings
                          </h4>
                          <StreamMetadataEditor
                            key={ep.id}
                            episode={ep}
                            busy={busyId === ep.id}
                            onSave={(updates) => handleSaveEpisodeMeta(ep.id, updates)}
                          />
                        </div>

                        {/* 2. Assigned Decks */}
                        {(() => {
                          const playedInEpIds = new Set(
                            ep.matches
                              .flatMap((m) => [m.andy_deck_id, m.kirsten_deck_id])
                              .filter(Boolean)
                          );
                          const unplayedInEpCount = ep.decks.filter(
                            (d) => !playedInEpIds.has(d.id)
                          ).length;
                          const showPruneUnplayed =
                            !ep.is_live &&
                            !ep.is_upcoming &&
                            ep.matches.length > 0 &&
                            unplayedInEpCount > 0;

                          return (
                            <div className="space-y-3 border-t border-black/80 pt-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                  <h4 className="text-sm font-black uppercase text-white flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-[#00F5D4]" />
                                    Decks Assigned to this Stream ({ep.decks.length})
                                  </h4>
                                  <p className="text-[11px] text-neutral-400">
                                    These decks will appear on the stream page and mobile controller.
                                  </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  {showPruneUnplayed && (
                                    <button
                                      type="button"
                                      disabled={busyId === `prune-${ep.id}`}
                                      onClick={() => handlePruneUnplayedDecks(ep.id)}
                                      className="brutal-btn bg-[#FFB703] text-black px-3 py-1.5 text-xs shrink-0"
                                      title="Unassign decks that were not played in any match on this ended stream"
                                    >
                                      {busyId === `prune-${ep.id}`
                                        ? 'Unassigning...'
                                        : `Unassign Unplayed (${unplayedInEpCount})`}
                                    </button>
                                  )}

                                  {/* Assign library deck dropdown */}
                                  <select
                                    id={`stream-deck-assign-select-${ep.id}`}
                                    defaultValue=""
                                    className="brutal-input text-xs py-1.5"
                                  >
                                    <option value="" disabled>
                                      + Assign Deck from Library...
                                    </option>
                                    {decks
                                      .filter((d) => !ep.decks.some((ed) => ed.id === d.id))
                                      .map((d) => (
                                        <option key={d.id} value={d.id}>
                                          {d.deck_name} ({d.ink_one}/{d.ink_two})
                                        </option>
                                      ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const sel = document.getElementById(
                                        `stream-deck-assign-select-${ep.id}`
                                      ) as HTMLSelectElement;
                                      if (sel && sel.value) {
                                        handleAssignDeckToEpisode(ep.id, sel.value);
                                        sel.value = '';
                                      }
                                    }}
                                    className="brutal-btn bg-[#00F5D4] text-black px-3 py-1.5 text-xs shrink-0"
                                  >
                                    Assign
                                  </button>
                                </div>
                              </div>

                              {ep.decks.length === 0 ? (
                                <div className="bg-[#140A20] border-[2px] border-black p-4 text-xs font-mono text-neutral-400">
                                  No decks currently assigned to this stream. Select a deck from the library above to assign it!
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {ep.decks.map((deck) => {
                                    const played = formatPlayedBy(deck);
                                    return (
                                      <div
                                        key={deck.id}
                                        className="bg-[#1C0F2F] border-[2px] border-black p-3 space-y-2 flex flex-col justify-between"
                                      >
                                        <div>
                                          <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                            <InkPairBadges inkOne={deck.ink_one} inkTwo={deck.ink_two} size="sm" />
                                            <div className="flex items-center gap-1 flex-wrap">
                                              {deck.is_locked && (
                                                <span
                                                  className="inline-flex items-center gap-1 text-[10px] font-mono font-black uppercase px-1.5 py-0.5 border border-black bg-[#181920] text-[#FFB703]"
                                                  title="Locked stream snapshot — future Deck Library edits will not change this stream's decklist"
                                                >
                                                  <Lock className="w-2.5 h-2.5" />
                                                  Locked
                                                </span>
                                              )}
                                              {played && (
                                                <span
                                                  className={`text-[10px] font-mono font-black uppercase px-1.5 py-0.5 border border-black ${
                                                    played.includes('Andy')
                                                      ? 'bg-[#3B1F54] text-[#00F5D4]'
                                                      : 'bg-[#FF2E93] text-white'
                                                  }`}
                                                >
                                                  {played}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <div className="font-black text-sm uppercase text-white mt-1.5 truncate">
                                            {deck.deck_name}
                                          </div>
                                        </div>

                                        <div className="flex items-center justify-between border-t border-black/60 pt-2 text-xs gap-2">
                                          <button
                                            type="button"
                                            onClick={() => setInspectingDeck(deck)}
                                            className="text-[#00F5D4] font-mono underline"
                                          >
                                            Inspect Cards
                                          </button>
                                          <div className="flex items-center gap-2.5">
                                            {deck.is_locked && (
                                              <button
                                                type="button"
                                                disabled={busyId === `refresh-snap-${deck.id}`}
                                                onClick={() => handleRefreshDeckSnapshot(ep.id, deck.id)}
                                                className="text-[#FFB703] font-mono text-[11px] hover:underline"
                                                title="Pull latest decklist edits from Deck Library into this locked stream snapshot"
                                              >
                                                {busyId === `refresh-snap-${deck.id}` ? 'Syncing...' : 'Sync Latest'}
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              onClick={() => handleUnassignDeckFromEpisode(ep.id, deck.id)}
                                              className="text-[#D62828] font-bold text-xs hover:underline"
                                            >
                                              Unassign
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* 3. Matches Section */}
                        <div className="space-y-3 border-t border-black/80 pt-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-black uppercase text-white flex items-center gap-2">
                                <Swords className="w-4 h-4 text-[#FF2E93]" />
                                Matches Played on this Stream ({ep.matches.length})
                              </h4>
                            </div>
                            <button
                              type="button"
                              disabled={busyId === `add-match-${ep.id}`}
                              onClick={() => handleAddMatchToEpisode(ep)}
                              className="brutal-btn bg-[#FFB703] text-black px-3 py-1.5 text-xs"
                            >
                              <Plus className="w-4 h-4" />
                              Add Match
                            </button>
                          </div>

                          {ep.matches.length === 0 ? (
                            <div className="bg-[#140A20] border-[2px] border-black p-4 text-xs font-mono text-neutral-400">
                              No matches recorded yet for this stream. Matches can be logged using the mobile controller live on stream or with the &ldquo;Add Match&rdquo; button above.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              {ep.matches.map((match, idx) => (
                                <MatchInlineEditor
                                  key={match.id}
                                  index={idx + 1}
                                  match={match}
                                  decks={ep.decks.length > 0 ? ep.decks : decks}
                                  busy={busyId === match.id}
                                  onSave={handleSaveMatch}
                                  onDelete={() => handleDeleteMatch(match.id)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: VIEWER SUBMISSIONS */}
      {/* =================================================================== */}
      {activeTab === 'submissions' && (
        <div className="brutal-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-[2px] border-black pb-3">
            <div>
              <h2 className="text-lg font-black uppercase text-white">
                Viewer Deck Submissions ({filteredSubmissions.length})
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Inspect submitted lists below. Approving a deck adds it to your Deck Manager so you can prep and assign it to a stream later.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['Pending', 'Approved', 'Played', 'Archived', 'All'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 text-xs font-black uppercase border-[2px] border-black ${
                    statusFilter === st ? 'bg-[#00F5D4] text-black' : 'bg-[#181920] text-neutral-300'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {filteredSubmissions.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-neutral-400">
              No submissions in &ldquo;{statusFilter}&rdquo;.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSubmissions.map((sub) => {
                const submittedCardCount = Array.isArray(sub.parsed_cards)
                  ? sub.parsed_cards.reduce((sum, c) => sum + c.count, 0)
                  : 0;
                const canViewDeck =
                  submittedCardCount > 0 ||
                  Boolean(sub.raw_decklist?.trim()) ||
                  Boolean(sub.deck_link);
                const inLibrary = isSubmissionInLibrary(sub);
                const isBusy = busyId === sub.id;

                return (
                  <div
                    key={sub.id}
                    className="bg-[#181920] border-[2px] border-black p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="brutal-tag bg-[#FFB703] text-black">
                          {sub.status}
                        </span>
                        <InkPairBadges inkOne={sub.ink_one} inkTwo={sub.ink_two} size="sm" />
                        <span className="text-xs font-mono text-neutral-400">
                          by {sub.submitter_name} • {sub.format_category} •{' '}
                          {submittedCardCount > 0
                            ? `${submittedCardCount} cards`
                            : sub.submission_type === 'link'
                              ? 'Link Only'
                              : 'Text List'}
                        </span>
                      </div>
                      <div className="text-base font-black uppercase text-white">
                        {sub.deck_name}
                      </div>
                      {sub.notes && (
                        <p className="text-xs text-neutral-300">{sub.notes}</p>
                      )}
                      {(() => {
                        const safeDeckLink = sanitizeExternalUrl(sub.deck_link);
                        if (!safeDeckLink) return null;
                        return (
                          <a
                            href={safeDeckLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-mono text-[#00F5D4] underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {safeDeckLink}
                          </a>
                        );
                      })()}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {canViewDeck && (
                        <button
                          type="button"
                          onClick={() => handleInspectSubmission(sub)}
                          className="brutal-btn bg-[#241438] text-[#00F5D4] hover:bg-[#321c4d] px-3 py-1.5 text-xs border-[2px] border-black"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Deck
                        </button>
                      )}

                      {sub.status === 'Pending' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleStatusUpdate(sub.id, 'Approved')}
                          className="brutal-btn bg-[#00F5D4] text-black px-3 py-1.5 text-xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {isBusy ? 'Approving...' : 'Approve & Add to Decks'}
                        </button>
                      )}

                      {sub.status === 'Approved' && (
                        inLibrary ? (
                          <span className="brutal-tag bg-[#1C0F2F] text-[#00F5D4] border border-[#00F5D4]/60 px-2.5 py-1 text-xs">
                            <Check className="w-3.5 h-3.5" />
                            In Deck Manager
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleStatusUpdate(sub.id, 'Approved')}
                            className="brutal-btn bg-[#FFB703] text-black px-3 py-1.5 text-xs"
                          >
                            <FolderPlus className="w-3.5 h-3.5" />
                            {isBusy ? 'Adding...' : 'Add to Deck Manager'}
                          </button>
                        )
                      )}

                      {sub.status !== 'Archived' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleStatusUpdate(sub.id, 'Archived')}
                          className="brutal-btn bg-[#D62828] text-white px-3 py-1.5 text-xs"
                        >
                          <X className="w-3.5 h-3.5" />
                          Archive
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: SETTINGS, RETENTION & DB TOOLS */}
      {/* =================================================================== */}
      {activeTab === 'tools' && (
        <div className="space-y-5">
          {/* OBS Overlay Configurable Site URL */}
          <div className="brutal-card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-[2px] border-black pb-3">
              <div>
                <h2 className="text-lg font-black uppercase text-white flex items-center gap-2">
                  <Tv className="w-5 h-5 text-[#FFB703]" />
                  OBS Overlay Footer URL Badge
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Controls the small website URL chip at the bottom center of{' '}
                  <code className="font-mono text-[#00F5D4]">/overlay</code>. Updates open OBS overlays immediately and falls back to{' '}
                  <code className="font-mono text-neutral-200">OVERLAY_SITE_URL</code> ({obsEnvSiteUrl}).
                </p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveObsSiteUrl(obsSiteUrlInput);
              }}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
            >
              <input
                type="text"
                value={obsSiteUrlInput}
                onChange={(e) => setObsSiteUrlInput(e.target.value)}
                placeholder={obsEnvSiteUrl}
                className="brutal-input text-xs font-mono flex-1"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="submit"
                  disabled={savingObsSiteUrl}
                  className="brutal-btn bg-[#00F5D4] text-black px-4 py-2 text-xs"
                >
                  <Save className="w-4 h-4" />
                  {savingObsSiteUrl ? 'Saving...' : 'Save URL'}
                </button>
                {obsHasCustomSiteUrl && (
                  <button
                    type="button"
                    disabled={savingObsSiteUrl}
                    onClick={() => handleSaveObsSiteUrl('')}
                    className="brutal-btn bg-[#2E184A] text-neutral-200 hover:text-white px-3 py-2 text-xs"
                    title={`Clear admin override and use ${obsEnvSiteUrl}`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Retention Card */}
          <div className="brutal-card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-[2px] border-black pb-3">
              <div>
                <h2 className="text-lg font-black uppercase text-white flex items-center gap-2">
                  <Database className="w-5 h-5 text-[#00F5D4]" />
                  90-Day Submission Retention &amp; Storage
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Automatically keeps your free PostgreSQL tier storage lean by deleting processed submissions older than 90 days.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunRetentionPrune}
                disabled={pruning}
                className="brutal-btn bg-[#FF2E93] text-white px-4 py-2 text-xs shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                {pruning ? 'Pruning...' : `Prune >90d Submissions (${retention.prunableOldCount})`}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center font-mono text-xs">
              <div className="bg-[#181920] border border-black p-3">
                <div className="text-neutral-400 uppercase">DB Mode</div>
                <div className="text-lg font-black text-[#00F5D4] mt-1">{retention.dbMode}</div>
              </div>
              <div className="bg-[#181920] border border-black p-3">
                <div className="text-neutral-400 uppercase">Submissions</div>
                <div className="text-lg font-black text-white mt-1">{retention.totalSubmissions}</div>
              </div>
              <div className="bg-[#181920] border border-black p-3">
                <div className="text-neutral-400 uppercase">&gt;90d Eligible</div>
                <div className="text-lg font-black text-[#FF4B91] mt-1">{retention.prunableOldCount}</div>
              </div>
              <div className="bg-[#181920] border border-black p-3">
                <div className="text-neutral-400 uppercase">Lorcast Cache</div>
                <div className="text-lg font-black text-[#FFB703] mt-1">{retention.cachedCardsCount}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE NEW PAPER DECK MODAL */}
      {newDeckModalOpen && (
        <DeckEditModal
          title="Create New Paper Deck"
          initialDeck={{
            pilot: 'Andy',
            deck_name: '',
            ink_one: 'Amber',
            ink_two: 'Steel',
            raw_decklist: '',
            deck_link: '',
            notes: '',
          }}
          onSave={handleSaveDeck}
          onClose={() => setNewDeckModalOpen(false)}
        />
      )}

      {/* EDIT EXISTING DECK MODAL */}
      {editingDeck && (
        <DeckEditModal
          title={`Edit Deck: ${editingDeck.deck_name}`}
          initialDeck={editingDeck}
          onSave={handleSaveDeck}
          onClose={() => setEditingDeck(null)}
        />
      )}

      {/* INSPECT CARDS MODAL */}
      <DeckModal deck={inspectingDeck} onClose={() => setInspectingDeck(null)} />

      {/* =================================================================== */}
      {/* YOUTUBE IMPORT MODAL / POPOVER */}
      {/* =================================================================== */}
      {importModalOpen && (
        <div
          className="fixed inset-0 !mt-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in"
          onClick={() => setImportModalOpen(false)}
        >
          <div
            className="brutal-card max-w-4xl w-full bg-[#160D24] border-[3px] border-black shadow-[8px_8px_0px_#000000] flex flex-col max-h-[90vh] overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b-[3px] border-black bg-[#241438] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#FF2E93] text-white border-[2px] border-black shadow-[2px_2px_0px_#000000]">
                  <Youtube className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black uppercase text-white tracking-wide flex items-center gap-2">
                    Import Streams from YouTube
                  </h3>
                  <p className="text-xs text-neutral-300">
                    Live broadcasts &amp; uploads from Rules of Villainy • Sorted upcoming to newest to oldest
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="brutal-btn p-2 bg-[#1C0F2F] text-neutral-300 hover:text-white hover:bg-[#2E184A] border-[2px] border-black"
                title="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Manual Import by YouTube URL */}
            <div className="p-3.5 sm:p-4 bg-[#190C28] border-b-[2px] border-black space-y-2.5 shrink-0">
              <form
                onSubmit={handleLookupManualUrl}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
              >
                <div className="flex-1">
                  <label className="block text-[10px] font-mono font-black uppercase text-[#00F5D4] mb-1">
                    Manual Import by YouTube Stream URL or Video ID
                  </label>
                  <input
                    type="text"
                    value={manualUrlInput}
                    onChange={(e) => setManualUrlInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=... or video ID"
                    className="brutal-input text-xs py-2 w-full bg-[#160D24]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!manualUrlInput.trim() || manualLookupBusy}
                  className="brutal-btn bg-[#FFB703] text-black hover:bg-[#ffca3a] px-4 py-2 text-xs font-black sm:mt-4 disabled:opacity-40 shrink-0"
                >
                  {manualLookupBusy ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Looking up...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" />
                      <span>Look Up URL</span>
                    </>
                  )}
                </button>
              </form>

              {ytApiWarning && (
                <div className="px-3 py-2 bg-[#2B1228] border border-[#FFB703]/70 text-[11px] font-mono text-[#FFB703]">
                  Notice: {ytApiWarning}
                </div>
              )}

              {manualLookupError && (
                <div className="px-3 py-2 bg-[#3A101E] border border-[#FF2E93] text-xs font-mono text-[#FF4B91]">
                  {manualLookupError}
                </div>
              )}

              {manualCandidate && (
                <div className="p-3 bg-[#241438] border-[2px] border-[#00F5D4] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
                      <span className="brutal-tag bg-[#00F5D4] text-black font-black">
                        VIDEO ID: {manualCandidate.youtube_video_id}
                      </span>
                      {manualLookupMeta?.alreadyImported && (
                        <span className="brutal-tag bg-[#FFB703] text-black font-black">
                          ALREADY IMPORTED (WILL UPDATE)
                        </span>
                      )}
                      {manualLookupMeta?.isExcluded && (
                        <span className="brutal-tag bg-[#FF2E93] text-white font-black">
                          EXCLUDED (IMPORT WILL RESTORE)
                        </span>
                      )}
                    </div>
                    <a
                      href={manualCandidate.vod_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-mono text-[#FF2E93] hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Open on YouTube</span>
                    </a>
                  </div>

                  {manualLookupMeta?.warning && (
                    <div className="text-[11px] font-mono text-[#FFB703]">
                      {manualLookupMeta.warning}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-5">
                      <label className="block text-[10px] font-mono uppercase text-neutral-300 mb-0.5">
                        Stream Title *
                      </label>
                      <input
                        type="text"
                        value={manualCandidate.title}
                        onChange={(e) =>
                          setManualCandidate((prev) =>
                            prev ? { ...prev, title: e.target.value } : prev
                          )
                        }
                        placeholder="Deck Test Tuesday - Set [Week #] - Title"
                        className="brutal-input text-xs py-1.5 w-full bg-[#160D24]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-mono uppercase text-neutral-300 mb-0.5">
                        Air Date
                      </label>
                      <input
                        type="date"
                        value={manualCandidate.stream_date}
                        onChange={(e) =>
                          setManualCandidate((prev) =>
                            prev ? { ...prev, stream_date: e.target.value } : prev
                          )
                        }
                        className="brutal-input text-xs py-1.5 w-full bg-[#160D24]"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-mono uppercase text-neutral-300 mb-0.5">
                        Lorcana Set
                      </label>
                      <input
                        type="text"
                        list="set-options"
                        value={manualCandidate.set_name}
                        onChange={(e) =>
                          setManualCandidate((prev) =>
                            prev ? { ...prev, set_name: e.target.value } : prev
                          )
                        }
                        className="brutal-input text-xs py-1.5 w-full bg-[#160D24]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-mono uppercase text-neutral-300 mb-0.5">
                        Status
                      </label>
                      <select
                        value={
                          manualCandidate.is_live
                            ? 'live'
                            : manualCandidate.is_upcoming
                              ? 'upcoming'
                              : 'archive'
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          setManualCandidate((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  is_live: v === 'live',
                                  is_upcoming: v === 'upcoming',
                                }
                              : prev
                          );
                        }}
                        className="brutal-input text-xs py-1.5 w-full bg-[#160D24]"
                      >
                        <option value="upcoming">Upcoming</option>
                        <option value="live">Live Now</option>
                        <option value="archive">Past / VOD</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setManualCandidate(null);
                        setManualLookupMeta(null);
                        setManualLookupError(null);
                      }}
                      className="brutal-btn bg-[#1C0F2F] text-neutral-300 hover:text-white px-3 py-1.5 text-xs"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      disabled={ytImporting || !manualCandidate.title.trim()}
                      onClick={handleImportManualCandidate}
                      className="brutal-btn bg-[#00F5D4] text-black hover:bg-[#32fad9] px-4 py-1.5 text-xs font-black disabled:opacity-40"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {ytImporting
                          ? 'Importing...'
                          : manualLookupMeta?.alreadyImported
                            ? 'Update Stream'
                            : 'Import Stream'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sub-Header Tabs */}
            <div className="flex items-center border-b-[2px] border-black bg-[#1C0F2F] px-4 pt-2.5 gap-2 shrink-0 overflow-x-auto">
              <button
                type="button"
                onClick={() => setImportTab('available')}
                className={`px-4 py-2 text-xs font-black uppercase border-t-[2px] border-x-[2px] border-black transition-all flex items-center gap-2 ${
                  importTab === 'available'
                    ? 'bg-[#241438] text-[#00F5D4] border-b-2 border-b-[#241438] -mb-[2px] shadow-[2px_-2px_0px_#000000]'
                    : 'bg-[#160D24] text-neutral-400 hover:text-white'
                }`}
              >
                <span>Available to Import</span>
                <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-[#00F5D4] text-black">
                  {ytCandidates.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setImportTab('excluded')}
                className={`px-4 py-2 text-xs font-black uppercase border-t-[2px] border-x-[2px] border-black transition-all flex items-center gap-2 ${
                  importTab === 'excluded'
                    ? 'bg-[#241438] text-[#FF2E93] border-b-2 border-b-[#241438] -mb-[2px] shadow-[2px_-2px_0px_#000000]'
                    : 'bg-[#160D24] text-neutral-400 hover:text-white'
                }`}
              >
                <span>Excluded Streams</span>
                <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-[#FF2E93] text-white">
                  {ytExcluded.length}
                </span>
              </button>
            </div>

            {/* Tab 1: Available to Import */}
            {importTab === 'available' && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                {/* Search & Actions Bar */}
                <div className="p-3.5 bg-[#1C0F2F] border-b-[2px] border-black flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={importSearch}
                      onChange={(e) => setImportSearch(e.target.value)}
                      placeholder="Filter streams by title, set name, or date..."
                      className="brutal-input pl-9 text-xs py-1.5 w-full bg-[#160D24]"
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={filteredCandidates.length === 0}
                      onClick={() => handleSelectAllVideos(filteredCandidates)}
                      className="brutal-btn bg-[#241438] text-neutral-200 hover:text-white px-3 py-1.5 text-xs font-bold border-[2px] border-black flex items-center gap-1.5"
                    >
                      {selectedVideoIds.size === filteredCandidates.length && filteredCandidates.length > 0 ? (
                        <>
                          <CheckSquare className="w-3.5 h-3.5 text-[#00F5D4]" />
                          <span>Deselect All</span>
                        </>
                      ) : (
                        <>
                          <Square className="w-3.5 h-3.5" />
                          <span>Select All ({filteredCandidates.length})</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={ytLoading}
                      onClick={fetchYouTubeData}
                      className="brutal-btn bg-[#241438] text-neutral-300 hover:text-white p-1.5 border-[2px] border-black"
                      title="Refresh from YouTube"
                    >
                      <RefreshCw className={`w-4 h-4 ${ytLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Stream Candidates Scroll Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[120px]">
                  {ytLoading ? (
                    <div className="p-12 text-center space-y-3">
                      <RefreshCw className="w-8 h-8 text-[#00F5D4] animate-spin mx-auto" />
                      <div className="text-sm font-black uppercase text-white">
                        Scanning YouTube for Deck Test Tuesday Streams...
                      </div>
                      <p className="text-xs text-neutral-400">
                        Checking upcoming events, live broadcasts, and channel uploads
                      </p>
                    </div>
                  ) : filteredCandidates.length === 0 ? (
                    <div className="p-10 text-center space-y-3 bg-[#1C0F2F] border-[2px] border-black">
                      <div className="text-base font-black uppercase text-white">
                        {importSearch ? 'No matching streams found' : 'All DTT Streams are already imported or excluded!'}
                      </div>
                      <p className="text-xs text-neutral-400">
                        {importSearch
                          ? 'Try clearing your search query'
                          : 'Check the "Excluded Streams" tab if you previously hid any streams from import.'}
                      </p>
                      {importSearch && (
                        <button
                          type="button"
                          onClick={() => setImportSearch('')}
                          className="brutal-btn bg-[#00F5D4] text-black px-3 py-1.5 text-xs font-bold"
                        >
                          Clear Search
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredCandidates.map((candidate) => {
                      const isSelected = selectedVideoIds.has(candidate.youtube_video_id);
                      const isBusy = ytActionBusyId === candidate.youtube_video_id;

                      return (
                        <div
                          key={candidate.youtube_video_id}
                          onClick={() => handleToggleSelectVideo(candidate.youtube_video_id)}
                          className={`p-3.5 border-[2px] border-black transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-[#2E184A] border-l-[6px] border-l-[#00F5D4] shadow-[2px_2px_0px_#000000]'
                              : 'bg-[#1C0F2F] hover:bg-[#25133E]'
                          }`}
                        >
                          {/* Left: Checkbox & Info */}
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSelectVideo(candidate.youtube_video_id);
                              }}
                              className="mt-0.5 text-neutral-300 hover:text-white shrink-0"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-5 h-5 text-[#00F5D4]" />
                              ) : (
                                <Square className="w-5 h-5 text-neutral-400" />
                              )}
                            </button>

                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                                {candidate.is_live && (
                                  <span className="brutal-tag bg-[#FF2E93] text-white font-black animate-pulse px-2 py-0.5">
                                    LIVE NOW
                                  </span>
                                )}
                                {candidate.is_upcoming && (
                                  <span className="brutal-tag bg-[#FFB703] text-black font-black px-2 py-0.5">
                                    UPCOMING
                                  </span>
                                )}
                                <span className="text-neutral-300 font-bold bg-[#160D24] px-2 py-0.5 border border-black">
                                  {candidate.stream_date}
                                </span>
                                <span className="text-[#00F5D4] font-black uppercase bg-[#160D24] px-2 py-0.5 border border-black">
                                  {candidate.set_name}
                                </span>
                                <span className="text-neutral-300 uppercase bg-[#160D24] px-2 py-0.5 border border-black">
                                  {candidate.format_tag}
                                </span>
                              </div>

                              <div className="text-sm font-bold text-white leading-tight">
                                {candidate.title}
                              </div>

                              <div className="flex items-center gap-2 pt-0.5">
                                <a
                                  href={candidate.vod_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[11px] text-[#FF2E93] hover:underline flex items-center gap-1 font-mono"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Watch on YouTube</span>
                                </a>
                              </div>
                            </div>
                          </div>

                          {/* Right: Exclude Action */}
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExcludeStream(candidate);
                              }}
                              className="brutal-btn bg-[#241438] text-neutral-300 hover:text-[#FF2E93] hover:bg-[#341A52] px-2.5 py-1.5 text-[11px] font-bold border-[2px] border-black transition-colors"
                              title="Mark as excluded so it doesn't show in future import lists"
                            >
                              {isBusy ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Ban className="w-3.5 h-3.5 text-[#FF2E93]" />
                              )}
                              <span>Exclude from Import</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer Action Bar */}
                <div className="p-4 bg-[#241438] border-t-[3px] border-black flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                  <div className="text-xs font-mono text-neutral-300">
                    <span className="font-bold text-white">{selectedVideoIds.size}</span> stream{selectedVideoIds.size === 1 ? '' : 's'} selected for import
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setImportModalOpen(false)}
                      className="brutal-btn bg-[#1C0F2F] text-neutral-300 hover:text-white px-4 py-2 text-xs font-bold border-[2px] border-black flex-1 sm:flex-initial"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      disabled={selectedVideoIds.size === 0 || ytImporting}
                      onClick={handleImportSelected}
                      className="brutal-btn bg-[#00F5D4] text-black hover:bg-[#32fad9] px-5 py-2.5 text-xs font-black disabled:opacity-40 disabled:cursor-not-allowed shadow-[3px_3px_0px_#000000] flex-1 sm:flex-initial flex items-center justify-center gap-2"
                    >
                      {ytImporting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Importing {selectedVideoIds.size} Stream{selectedVideoIds.size === 1 ? '' : 's'}...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>
                            Import {selectedVideoIds.size > 0 ? `${selectedVideoIds.size} ` : ''}Stream{selectedVideoIds.size === 1 ? '' : 's'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Excluded Streams */}
            {importTab === 'excluded' && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                {/* Search */}
                <div className="p-3.5 bg-[#1C0F2F] border-b-[2px] border-black shrink-0">
                  <div className="relative">
                    <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={importSearch}
                      onChange={(e) => setImportSearch(e.target.value)}
                      placeholder="Filter excluded streams..."
                      className="brutal-input pl-9 text-xs py-1.5 w-full bg-[#160D24]"
                    />
                  </div>
                </div>

                {/* Excluded List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[120px]">
                  {filteredExcluded.length === 0 ? (
                    <div className="p-10 text-center space-y-2 bg-[#1C0F2F] border-[2px] border-black">
                      <div className="text-base font-black uppercase text-white">
                        No Excluded Streams
                      </div>
                      <p className="text-xs text-neutral-400">
                        Streams you mark as &ldquo;Exclude from Import&rdquo; will be listed here. You can include them back at any time.
                      </p>
                    </div>
                  ) : (
                    filteredExcluded.map((item) => {
                      const isBusy = ytActionBusyId === item.youtube_video_id;

                      return (
                        <div
                          key={item.youtube_video_id}
                          className="p-3.5 bg-[#1C0F2F] border-[2px] border-black flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            {item.published_date && (
                              <span className="text-[10px] font-mono text-neutral-400 font-bold">
                                {item.published_date}
                              </span>
                            )}
                            <div className="text-sm font-bold text-white leading-tight">
                              {item.title}
                            </div>
                            <a
                              href={`https://www.youtube.com/watch?v=${item.youtube_video_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-[#FF2E93] hover:underline flex items-center gap-1 font-mono"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>View on YouTube</span>
                            </a>
                          </div>

                          <div className="shrink-0">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleIncludeStream(item.youtube_video_id)}
                              className="brutal-btn bg-[#00F5D4] text-black hover:bg-[#32fad9] px-3.5 py-1.5 text-xs font-black shadow-[2px_2px_0px_#000000] flex items-center gap-1.5"
                              title="Restore stream to available import list"
                            >
                              {isBusy ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3.5 h-3.5" />
                              )}
                              <span>Restore to Import List</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-[#241438] border-t-[3px] border-black flex items-center justify-between gap-3 shrink-0">
                  <div className="text-xs text-neutral-300">
                    Restoring a stream moves it back to &ldquo;Available to Import&rdquo;.
                  </div>
                  <button
                    type="button"
                    onClick={() => setImportModalOpen(false)}
                    className="brutal-btn bg-[#1C0F2F] text-neutral-300 hover:text-white px-4 py-2 text-xs font-bold border-[2px] border-black"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// STREAM METADATA EDITOR
// -----------------------------------------------------------------------------
function StreamMetadataEditor({
  episode,
  busy,
  onSave,
}: {
  episode: EnrichedEpisode;
  busy: boolean;
  onSave: (updates: {
    title: string;
    stream_date: string;
    set_name: string;
    format_tag: EpisodeFormatTag;
    is_live: boolean;
    is_upcoming: boolean;
    is_hidden: boolean;
  }) => void;
}) {
  const [title, setTitle] = useState(episode.title);
  const [streamDate, setStreamDate] = useState(episode.stream_date);
  const [setName, setSetName] = useState(episode.set_name || 'Core');
  const [formatTag, setFormatTag] = useState<EpisodeFormatTag>(episode.format_tag);
  const [isLive, setIsLive] = useState(episode.is_live);
  const [isUpcoming, setIsUpcoming] = useState(episode.is_upcoming);
  const [isHidden, setIsHidden] = useState(episode.is_hidden);

  return (
    <div className="bg-[#1C0F2F] border-[2px] border-black p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-5">
          <label className="block text-[10px] font-mono uppercase text-neutral-300 mb-1 font-bold">
            Stream Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="brutal-input text-xs py-2"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-[10px] font-mono uppercase text-neutral-300 mb-1 font-bold">
            Air Date
          </label>
          <input
            type="date"
            value={streamDate}
            onChange={(e) => setStreamDate(e.target.value)}
            className="brutal-input text-xs py-2"
          />
        </div>

        <div className="md:col-span-3">
          <label className="block text-[10px] font-mono uppercase text-[#00F5D4] mb-1 font-bold">
            Lorcana Set
          </label>
          <input
            type="text"
            list="set-options"
            value={setName}
            onChange={(e) => setSetName(e.target.value)}
            placeholder="e.g. Hyperia City"
            className="brutal-input text-xs py-2"
          />
          <datalist id="set-options">
            {LORCANA_SETS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div className="md:col-span-2">
          <label className="block text-[10px] font-mono uppercase text-[#FFB703] mb-1 font-bold">
            Format
          </label>
          <select
            value={formatTag}
            onChange={(e) => setFormatTag(e.target.value as EpisodeFormatTag)}
            className="brutal-input text-xs py-2"
          >
            {EPISODE_FORMATS.map((fmt) => (
              <option key={fmt} value={fmt}>
                {fmt}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-black/60">
        <div className="flex flex-wrap items-center gap-2">
          {/* Hidden toggle */}
          <button
            type="button"
            onClick={() => setIsHidden((v) => !v)}
            className={`brutal-btn px-3 py-1.5 text-xs ${
              isHidden
                ? 'bg-[#2E184A] text-[#FF4B91] border-2 border-[#FF4B91]'
                : 'bg-[#00F5D4] text-black font-black'
            }`}
          >
            {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {isHidden ? 'Hidden from Public' : 'Visible Publicly'}
          </button>

          {/* Live toggle */}
          <button
            type="button"
            onClick={() => {
              setIsLive((v) => !v);
              if (!isLive) setIsUpcoming(false);
            }}
            className={`brutal-btn px-3 py-1.5 text-xs ${
              isLive ? 'bg-[#FF2E93] text-white animate-pulse' : 'bg-[#2E184A] text-neutral-300'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            {isLive ? 'Stream LIVE' : 'Not Live'}
          </button>

          {/* Upcoming toggle */}
          <button
            type="button"
            onClick={() => {
              setIsUpcoming((v) => !v);
              if (!isUpcoming) setIsLive(false);
            }}
            className={`brutal-btn px-3 py-1.5 text-xs ${
              isUpcoming ? 'bg-[#FFB703] text-black' : 'bg-[#2E184A] text-neutral-300'
            }`}
          >
            {isUpcoming ? 'Marked Upcoming' : 'Not Upcoming'}
          </button>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSave({
              title,
              stream_date: streamDate,
              set_name: setName,
              format_tag: formatTag,
              is_live: isLive,
              is_upcoming: isUpcoming,
              is_hidden: isHidden,
            })
          }
          className="brutal-btn bg-[#00F5D4] text-black px-4 py-1.5 text-xs"
        >
          <Save className="w-3.5 h-3.5" />
          {busy ? 'Saving...' : 'Save Stream Info'}
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// DECK CREATE / EDIT MODAL
// -----------------------------------------------------------------------------
function DeckEditModal({
  title,
  initialDeck,
  onSave,
  onClose,
}: {
  title: string;
  initialDeck: Partial<Deck>;
  onSave: (deck: Partial<Deck>) => void;
  onClose: () => void;
}) {
  const [deckName, setDeckName] = useState(initialDeck.deck_name || '');
  const [inkOne, setInkOne] = useState<LorcanaInk>(initialDeck.ink_one || 'Amber');
  const [inkTwo, setInkTwo] = useState<LorcanaInk>(initialDeck.ink_two || 'Steel');
  const [deckLink, setDeckLink] = useState(initialDeck.deck_link || '');
  const [notes, setNotes] = useState(initialDeck.notes || '');
  const [rawDecklist, setRawDecklist] = useState(initialDeck.raw_decklist || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deckName.trim()) return;
    onSave({
      ...initialDeck,
      deck_name: deckName.trim(),
      ink_one: inkOne,
      ink_two: inkTwo,
      deck_link: deckLink.trim() || null,
      notes: notes.trim() || null,
      raw_decklist: rawDecklist,
    });
  };

  return (
    <div
      className="fixed inset-0 !mt-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="brutal-card max-w-xl w-full p-5 space-y-4 my-auto bg-[#241438]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-[2px] border-black pb-2">
          <h3 className="text-lg font-black uppercase text-white">{title}</h3>
          <button type="button" onClick={onClose} className="brutal-btn bg-[#FFB703] text-black p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="block text-[10px] font-mono uppercase text-neutral-300 mb-1">
            Deck Name *
          </label>
          <input
            type="text"
            required
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            placeholder="e.g. Sapphire/Steel Items"
            className="brutal-input text-xs"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-mono uppercase text-neutral-400 mb-1">
              Ink One
            </label>
            <select
              value={inkOne}
              onChange={(e) => setInkOne(e.target.value as LorcanaInk)}
              className="brutal-input text-xs"
            >
              {LORCANA_INKS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-neutral-400 mb-1">
              Ink Two
            </label>
            <select
              value={inkTwo}
              onChange={(e) => setInkTwo(e.target.value as LorcanaInk)}
              className="brutal-input text-xs"
            >
              {LORCANA_INKS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-mono uppercase text-neutral-400 mb-1">
            Paper Notes / Sleeve Color / Box (Optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Pink Dragonshields, Box 2"
            className="brutal-input text-xs"
          />
        </div>

        <div>
          <label className="block text-[10px] font-mono uppercase text-neutral-400 mb-1">
            External Dreamborn / Inkdecks URL (Optional)
          </label>
          <input
            type="url"
            value={deckLink}
            onChange={(e) => setDeckLink(e.target.value)}
            placeholder="https://dreamborn.ink/decks/..."
            className="brutal-input text-xs"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[10px] font-mono uppercase text-neutral-400">
              Paste Decklist (4x Card Name - Subtitle)
            </label>
            <button
              type="button"
              onClick={() => setRawDecklist(SAMPLE_DECKLIST_TEXT)}
              className="text-[10px] font-mono text-[#00F5D4] underline"
            >
              Load Sample 60-Card List
            </button>
          </div>
          <textarea
            rows={6}
            value={rawDecklist}
            onChange={(e) => setRawDecklist(e.target.value)}
            placeholder="4x Robin Hood - Champion of Sherwood&#10;4x Beast - Tragic Hero..."
            className="brutal-input font-mono text-xs"
          />
        </div>

        <button type="submit" className="brutal-btn w-full bg-[#00F5D4] text-black py-2.5 text-xs">
          Resolve Cards with Lorcast &amp; Save Deck
        </button>
      </form>
    </div>
  );
}

// -----------------------------------------------------------------------------
// MATCH INLINE EDITOR
// -----------------------------------------------------------------------------
function MatchInlineEditor({
  index,
  match,
  decks,
  busy,
  onSave,
  onDelete,
}: {
  index: number;
  match: Match;
  decks: Deck[];
  busy: boolean;
  onSave: (m: Match) => void;
  onDelete: () => void;
}) {
  const [andyDeckId, setAndyDeckId] = useState(match.andy_deck_id);
  const [kirstenDeckId, setKirstenDeckId] = useState(match.kirsten_deck_id);
  const [format, setFormat] = useState<MatchFormat>(match.match_format);
  const [andyScore, setAndyScore] = useState(match.andy_score);
  const [kirstenScore, setKirstenScore] = useState(match.kirsten_score);

  return (
    <div className="bg-[#181920] border-[2px] border-black p-3.5 space-y-2.5 flex flex-col justify-between">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between border-b border-black pb-1.5">
          <span className="font-mono font-black text-xs text-[#FFB703] uppercase">
            Match {index}
          </span>
          <div className="flex items-center gap-2">
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as MatchFormat)}
              className="bg-[#282A32] text-white text-[11px] font-mono border border-black px-1.5 py-0.5"
            >
              {MATCH_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.value}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onDelete}
              className="text-[#D62828] hover:text-white"
              title="Delete Match"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-[10px] font-mono text-[#00F5D4] uppercase">
            Andy&apos;s Deck &amp; Score
          </label>
          <div className="flex items-center gap-2">
            <select
              value={andyDeckId}
              onChange={(e) => setAndyDeckId(e.target.value)}
              className="brutal-input text-xs py-1 flex-1"
            >
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.deck_name} ({d.ink_one}/{d.ink_two})
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={9}
              value={andyScore}
              onChange={(e) => setAndyScore(Number(e.target.value))}
              className="brutal-input text-xs py-1 w-12 text-center"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-[10px] font-mono text-[#FF4B91] uppercase">
            Kirsten&apos;s Deck &amp; Score
          </label>
          <div className="flex items-center gap-2">
            <select
              value={kirstenDeckId}
              onChange={(e) => setKirstenDeckId(e.target.value)}
              className="brutal-input text-xs py-1 flex-1"
            >
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.deck_name} ({d.ink_one}/{d.ink_two})
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={9}
              value={kirstenScore}
              onChange={(e) => setKirstenScore(Number(e.target.value))}
              className="brutal-input text-xs py-1 w-12 text-center"
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() =>
          onSave({
            ...match,
            andy_deck_id: andyDeckId,
            kirsten_deck_id: kirstenDeckId,
            match_format: format,
            andy_score: andyScore,
            kirsten_score: kirstenScore,
          })
        }
        className="brutal-btn w-full bg-[#FFB703] text-black py-2 text-xs"
      >
        <Save className="w-3.5 h-3.5" />
        {busy ? 'Saving...' : `Save Match ${index}`}
      </button>
    </div>
  );
}
