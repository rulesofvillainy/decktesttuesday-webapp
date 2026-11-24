import dns from 'node:dns';
import { extractFormatFromTitle, extractSetFromTitle } from './constants';
import {
  addExcludedYouTubeStream,
  createDeck,
  createMatch,
  createOrUpdateEpisode,
  getDecks,
  getEpisodes,
  getExcludedYouTubeStreams,
  getMatches,
  removeExcludedYouTubeStream,
  setEpisodeLiveStatus,
} from './db';
import {
  Episode,
  EpisodeFormatTag,
  ExcludedYouTubeStream,
  YouTubeStreamCandidate,
} from './types';

// Ensure Node uses IPv4 first so Google Cloud IPv4-restricted API keys succeed
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore if unsupported in current runtime
}

interface YouTubePlaylistItem {
  snippet?: {
    title?: string;
    publishedAt?: string;
    resourceId?: {
      videoId?: string;
    };
  };
  contentDetails?: {
    videoId?: string;
    videoPublishedAt?: string;
  };
}

interface YouTubeSearchItem {
  id?: {
    videoId?: string;
  };
  snippet?: {
    title?: string;
    publishedAt?: string;
    liveBroadcastContent?: 'live' | 'upcoming' | 'none';
  };
}

function inferFormatTag(title: string): EpisodeFormatTag {
  return extractFormatFromTitle(title);
}

const YOUTUBE_ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
]);

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extracts and validates an 11-character YouTube video ID from a YouTube URL or raw ID.
 * Only permits known YouTube hostnames to prevent SSRF against arbitrary URLs.
 */
export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;
  if (VIDEO_ID_REGEX.test(trimmed)) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    );
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_ALLOWED_HOSTS.has(host)) return null;

  if (host === 'youtu.be') {
    const seg = parsed.pathname.split('/').filter(Boolean)[0] || '';
    return VIDEO_ID_REGEX.test(seg) ? seg : null;
  }

  const vParam = parsed.searchParams.get('v');
  if (vParam && VIDEO_ID_REGEX.test(vParam)) {
    return vParam;
  }

  const pathMatch = parsed.pathname.match(
    /^\/(?:live|embed|shorts|v)\/([a-zA-Z0-9_-]{11})(?:\/|$)/
  );
  if (pathMatch && VIDEO_ID_REGEX.test(pathMatch[1])) {
    return pathMatch[1];
  }

  return null;
}

function toChicagoDateString(rawDate?: string | null): string {
  if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())) {
    return rawDate.trim();
  }
  const parsed = rawDate ? new Date(rawDate) : new Date();
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(safeDate);
  } catch {
    return safeDate.toISOString().split('T')[0];
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, num) => {
      const code = Number(num);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    });
}

function extractBalancedJsonObject(
  source: string,
  markerRegex: RegExp
): Record<string, unknown> | null {
  const match = markerRegex.exec(source);
  if (!match) return null;
  const start = source.indexOf('{', match.index);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, i + 1)) as Record<
            string,
            unknown
          >;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function formatYouTubeApiError(status: number, bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { message?: string; status?: string };
    };
    const msg = parsed?.error?.message;
    if (msg) return `YouTube API (${status}): ${msg}`;
  } catch {
    // fall through
  }
  return `YouTube API (${status})`;
}

/**
 * Ensures an episode has placeholder Decks ("Deck 1", "Deck 2", "Deck 3")
 * and placeholder Matches ("Match 1", "Match 2", "Match 3") so old DTT
 * streams have structured placeholders ready to be edited in /admin.
 */
export async function ensureEpisodePlaceholders(
  episodeId: string
): Promise<void> {
  const existingDecks = await getDecks(episodeId);
  if (existingDecks.length > 0) {
    return;
  }

  const deck1 = await createDeck({
    episode_id: episodeId,
    pilot: 'Andy',
    deck_name: 'Deck 1',
    ink_one: 'Amber',
    ink_two: 'Steel',
    deck_link: null,
    raw_decklist: '',
    parsed_cards: [],
  });

  const deck2 = await createDeck({
    episode_id: episodeId,
    pilot: 'Kirsten',
    deck_name: 'Deck 2',
    ink_one: 'Ruby',
    ink_two: 'Amethyst',
    deck_link: null,
    raw_decklist: '',
    parsed_cards: [],
  });

  const deck3 = await createDeck({
    episode_id: episodeId,
    pilot: 'Andy',
    deck_name: 'Deck 3',
    ink_one: 'Emerald',
    ink_two: 'Sapphire',
    deck_link: null,
    raw_decklist: '',
    parsed_cards: [],
  });

  const existingMatches = await getMatches(episodeId);
  if (existingMatches.length === 0) {
    await createMatch({
      episode_id: episodeId,
      andy_deck_id: deck1.id,
      kirsten_deck_id: deck2.id,
      match_format: 'Bo3',
      andy_score: 2,
      kirsten_score: 1,
      winner: 'Andy',
      game_log: [
        { game: 1, winner: 'Andy' },
        { game: 2, winner: 'Kirsten' },
        { game: 3, winner: 'Andy' },
      ],
    });

    await createMatch({
      episode_id: episodeId,
      andy_deck_id: deck1.id,
      kirsten_deck_id: deck2.id,
      match_format: 'Bo3',
      andy_score: 1,
      kirsten_score: 2,
      winner: 'Kirsten',
      game_log: [
        { game: 1, winner: 'Kirsten' },
        { game: 2, winner: 'Andy' },
        { game: 3, winner: 'Kirsten' },
      ],
    });

    await createMatch({
      episode_id: episodeId,
      andy_deck_id: deck3.id,
      kirsten_deck_id: deck2.id,
      match_format: 'Bo3',
      andy_score: 2,
      kirsten_score: 0,
      winner: 'Andy',
      game_log: [
        { game: 1, winner: 'Andy' },
        { game: 2, winner: 'Andy' },
      ],
    });
  }
}

export async function syncYouTubeStreams(options?: {
  fullHistory?: boolean;
}): Promise<{
  synced: boolean;
  mode: 'youtube-api' | 'local-simulation';
  message: string;
  importedCount: number;
  liveEpisode: Episode | null;
  episodes: Episode[];
}> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  const channelId =
    process.env.YOUTUBE_CHANNEL_ID?.trim() || 'UCY3lW8wYIQ6fd7RCQHk31_Q';

  if (!apiKey) {
    const existing = await getEpisodes();
    return {
      synced: false,
      mode: 'local-simulation',
      message: 'YOUTUBE_API_KEY is not configured in .env.local.',
      importedCount: 0,
      liveEpisode: existing.find((e) => e.is_live) || null,
      episodes: existing,
    };
  }

  const maxPages = options?.fullHistory !== false ? 10 : 2;
  const uploadsPlaylistId = channelId.startsWith('UC')
    ? `UU${channelId.slice(2)}`
    : channelId;

  const discoveredVideos: {
    videoId: string;
    title: string;
    publishedDate: string;
  }[] = [];

  let pageToken = '';
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      maxResults: '50',
      playlistId: uploadsPlaylistId,
      key: apiKey,
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const url = `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(formatYouTubeApiError(res.status, errText));
    }

    const data = (await res.json()) as {
      items?: YouTubePlaylistItem[];
      nextPageToken?: string;
    };
    const items = Array.isArray(data.items) ? data.items : [];

    for (const item of items) {
      const title = item.snippet?.title || '';
      const videoId =
        item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      const publishedRaw =
        item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt;

      if (!videoId || !title.toLowerCase().includes('deck test tuesday')) {
        continue;
      }

      const publishedDate = publishedRaw
        ? publishedRaw.split('T')[0]
        : new Date().toISOString().split('T')[0];

      discoveredVideos.push({
        videoId,
        title,
        publishedDate,
      });
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  // Sort oldest to newest
  discoveredVideos.sort((a, b) =>
    a.publishedDate.localeCompare(b.publishedDate)
  );

  const [excludedStreams, existingEpisodes] = await Promise.all([
    getExcludedYouTubeStreams(),
    getEpisodes({ includeHidden: true }),
  ]);
  const excludedIds = new Set(
    excludedStreams.map((item) => item.youtube_video_id)
  );
  const existingByYtId = new Map(
    existingEpisodes
      .filter((e): e is Episode & { youtube_video_id: string } =>
        Boolean(e.youtube_video_id)
      )
      .map((e) => [e.youtube_video_id, e])
  );

  let importedCount = 0;
  for (const v of discoveredVideos) {
    if (excludedIds.has(v.videoId)) {
      continue;
    }
    const existingEp = existingByYtId.get(v.videoId);
    await createOrUpdateEpisode({
      youtube_video_id: v.videoId,
      title: v.title,
      episode_number: existingEp ? existingEp.episode_number : null,
      stream_date: v.publishedDate,
      vod_url: `https://www.youtube.com/watch?v=${v.videoId}`,
      is_live: existingEp ? existingEp.is_live : false,
      is_upcoming: existingEp ? existingEp.is_upcoming : false,
      is_hidden: existingEp ? existingEp.is_hidden : false,
      set_name: extractSetFromTitle(v.title),
      format_tag: inferFormatTag(v.title),
    });
    importedCount++;
  }

  // Check upcoming broadcasts so newly scheduled streams sync when API allows
  try {
    const upParams = new URLSearchParams({
      part: 'snippet',
      channelId,
      eventType: 'upcoming',
      type: 'video',
      key: apiKey,
    });
    const upRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${upParams.toString()}`,
      { headers: { Accept: 'application/json' } }
    );
    if (upRes.ok) {
      const upData = (await upRes.json()) as { items?: YouTubeSearchItem[] };
      const upItems = Array.isArray(upData.items) ? upData.items : [];
      for (const item of upItems) {
        const title = item.snippet?.title || '';
        const videoId = item.id?.videoId;
        if (
          !videoId ||
          excludedIds.has(videoId) ||
          !title.toLowerCase().includes('deck test tuesday')
        ) {
          continue;
        }
        const existingEp = existingByYtId.get(videoId);
        await createOrUpdateEpisode({
          youtube_video_id: videoId,
          title,
          episode_number: existingEp ? existingEp.episode_number : null,
          stream_date: toChicagoDateString(item.snippet?.publishedAt),
          vod_url: `https://www.youtube.com/watch?v=${videoId}`,
          is_live: existingEp ? existingEp.is_live : false,
          is_upcoming: existingEp ? existingEp.is_upcoming : true,
          is_hidden: existingEp ? existingEp.is_hidden : false,
          set_name: extractSetFromTitle(title),
          format_tag: inferFormatTag(title),
        });
        if (!existingEp) {
          importedCount++;
        }
      }
    }
  } catch {
    // Ignore upcoming check failure if quota or eventType search is restricted
  }

  // Also check if the channel has an active LIVE broadcast right now
  let detectedLiveEpisode: Episode | null = null;
  try {
    const liveParams = new URLSearchParams({
      part: 'snippet',
      channelId,
      eventType: 'live',
      type: 'video',
      key: apiKey,
    });
    const liveRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${liveParams.toString()}`,
      { headers: { Accept: 'application/json' } }
    );
    if (liveRes.ok) {
      const liveData = (await liveRes.json()) as { items?: YouTubeSearchItem[] };
      const liveItems = Array.isArray(liveData.items) ? liveData.items : [];
      const activeDttLive = liveItems.find((item) =>
        (item.snippet?.title || '').toLowerCase().includes('deck test tuesday')
      );
      if (
        activeDttLive?.id?.videoId &&
        !excludedIds.has(activeDttLive.id.videoId)
      ) {
        const liveEp = await createOrUpdateEpisode({
          youtube_video_id: activeDttLive.id.videoId,
          title: activeDttLive.snippet?.title || 'Deck Test Tuesday LIVE',
          stream_date: toChicagoDateString(),
          vod_url: `https://www.youtube.com/watch?v=${activeDttLive.id.videoId}`,
          is_live: true,
          is_upcoming: false,
          is_hidden: false,
          format_tag: inferFormatTag(activeDttLive.snippet?.title || ''),
        });
        await setEpisodeLiveStatus(liveEp.id, true);
        detectedLiveEpisode = { ...liveEp, is_live: true };
      }
    }
  } catch {
    // Ignore live check failure if quota or eventType search is restricted
  }

  const allEpisodes = await getEpisodes();
  return {
    synced: true,
    mode: 'youtube-api',
    message: `Synced ${importedCount} non-excluded "Deck Test Tuesday" streams from Rules of Villainy.`,
    importedCount,
    liveEpisode:
      detectedLiveEpisode || allEpisodes.find((e) => e.is_live) || null,
    episodes: allEpisodes,
  };
}

/**
 * Fetches all available Deck Test Tuesday streams directly from the YouTube channel,
 * cross-referenced against existing DB episodes and excluded streams.
 *
 * Streams are sorted from:
 * 1) Live events
 * 2) Upcoming events
 * 3) Latest date to oldest date
 */
export async function getYouTubeImportData(): Promise<{
  available: YouTubeStreamCandidate[];
  excluded: ExcludedYouTubeStream[];
  totalAvailable: number;
  totalExcluded: number;
  totalImported: number;
  apiWarning?: string;
}> {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch {
    // Ignore runtime restriction
  }

  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  const channelId =
    process.env.YOUTUBE_CHANNEL_ID?.trim() || 'UCY3lW8wYIQ6fd7RCQHk31_Q';

  const [existingEpisodes, excludedStreams] = await Promise.all([
    getEpisodes({ includeHidden: true }),
    getExcludedYouTubeStreams(),
  ]);

  const existingIds = new Set(
    existingEpisodes
      .map((e) => e.youtube_video_id)
      .filter((id): id is string => Boolean(id))
  );

  const excludedMap = new Map<string, ExcludedYouTubeStream>(
    excludedStreams.map((item) => [item.youtube_video_id, item])
  );

  if (!apiKey) {
    return {
      available: [],
      excluded: excludedStreams,
      totalAvailable: 0,
      totalExcluded: excludedStreams.length,
      totalImported: existingIds.size,
      apiWarning:
        'YOUTUBE_API_KEY is not configured. Auto-scan is unavailable — paste a YouTube stream URL below to import manually.',
    };
  }

  const allFoundVideos: Map<string, YouTubeStreamCandidate> = new Map();
  const apiWarnings: string[] = [];

  // 1. Check Live Broadcasts
  try {
    const liveParams = new URLSearchParams({
      part: 'snippet',
      channelId,
      eventType: 'live',
      type: 'video',
      key: apiKey,
    });
    const liveRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${liveParams.toString()}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!liveRes.ok) {
      apiWarnings.push(formatYouTubeApiError(liveRes.status, await liveRes.text()));
    } else {
      const data = (await liveRes.json()) as { items?: YouTubeSearchItem[] };
      const items = Array.isArray(data.items) ? data.items : [];
      for (const item of items) {
        const title = item.snippet?.title || '';
        const videoId = item.id?.videoId;
        if (!videoId || !title.toLowerCase().includes('deck test tuesday')) continue;
        allFoundVideos.set(videoId, {
          youtube_video_id: videoId,
          title,
          stream_date: toChicagoDateString(item.snippet?.publishedAt),
          published_at: item.snippet?.publishedAt,
          vod_url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail_url: (item.snippet as any)?.thumbnails?.medium?.url || (item.snippet as any)?.thumbnails?.default?.url,
          set_name: extractSetFromTitle(title),
          format_tag: inferFormatTag(title),
          is_live: true,
          is_upcoming: false,
        });
      }
    }
  } catch (err) {
    console.warn('YouTube live check warning:', err);
  }

  // 2. Check Upcoming Broadcasts
  try {
    const upParams = new URLSearchParams({
      part: 'snippet',
      channelId,
      eventType: 'upcoming',
      type: 'video',
      key: apiKey,
    });
    const upRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${upParams.toString()}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!upRes.ok) {
      apiWarnings.push(formatYouTubeApiError(upRes.status, await upRes.text()));
    } else {
      const data = (await upRes.json()) as { items?: YouTubeSearchItem[] };
      const items = Array.isArray(data.items) ? data.items : [];
      for (const item of items) {
        const title = item.snippet?.title || '';
        const videoId = item.id?.videoId;
        if (!videoId || !title.toLowerCase().includes('deck test tuesday')) continue;
        if (!allFoundVideos.has(videoId)) {
          allFoundVideos.set(videoId, {
            youtube_video_id: videoId,
            title,
            stream_date: toChicagoDateString(item.snippet?.publishedAt),
            published_at: item.snippet?.publishedAt,
            vod_url: `https://www.youtube.com/watch?v=${videoId}`,
            thumbnail_url: (item.snippet as any)?.thumbnails?.medium?.url || (item.snippet as any)?.thumbnails?.default?.url,
            set_name: extractSetFromTitle(title),
            format_tag: inferFormatTag(title),
            is_live: false,
            is_upcoming: true,
          });
        }
      }
    }
  } catch (err) {
    console.warn('YouTube upcoming check warning:', err);
  }

  // 3. Paginate uploads playlist to retrieve all past DTT broadcasts
  const uploadsPlaylistId = channelId.startsWith('UC')
    ? `UU${channelId.slice(2)}`
    : channelId;

  let pageToken = '';
  for (let page = 0; page < 15; page++) {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      maxResults: '50',
      playlistId: uploadsPlaylistId,
      key: apiKey,
    });
    if (pageToken) params.set('pageToken', pageToken);

    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) {
        apiWarnings.push(formatYouTubeApiError(res.status, await res.text()));
        break;
      }
      const data = (await res.json()) as {
        items?: YouTubePlaylistItem[];
        nextPageToken?: string;
      };
      const items = Array.isArray(data.items) ? data.items : [];

      for (const item of items) {
        const title = item.snippet?.title || '';
        const videoId =
          item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
        const publishedRaw =
          item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || '';

        if (!videoId || !title.toLowerCase().includes('deck test tuesday')) {
          continue;
        }

        if (!allFoundVideos.has(videoId)) {
          allFoundVideos.set(videoId, {
            youtube_video_id: videoId,
            title,
            stream_date: toChicagoDateString(publishedRaw),
            published_at: publishedRaw,
            vod_url: `https://www.youtube.com/watch?v=${videoId}`,
            thumbnail_url:
              (item.snippet as any)?.thumbnails?.medium?.url ||
              (item.snippet as any)?.thumbnails?.default?.url,
            set_name: extractSetFromTitle(title),
            format_tag: inferFormatTag(title),
            is_live: false,
            is_upcoming: false,
          });
        }
      }

      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    } catch (err) {
      console.warn('YouTube playlist page error:', err);
      break;
    }
  }

  // Sort candidate videos:
  // 1) is_live === true
  // 2) is_upcoming === true
  // 3) published_at / stream_date DESCENDING (latest to oldest)
  const allList = Array.from(allFoundVideos.values()).sort((a, b) => {
    if (a.is_live && !b.is_live) return -1;
    if (!a.is_live && b.is_live) return 1;
    if (a.is_upcoming && !b.is_upcoming) return -1;
    if (!a.is_upcoming && b.is_upcoming) return 1;
    const dateA = a.published_at || a.stream_date;
    const dateB = b.published_at || b.stream_date;
    return dateB.localeCompare(dateA); // latest to oldest
  });

  // Filter into available (not in DB AND not in excluded)
  const available: YouTubeStreamCandidate[] = [];
  for (const item of allList) {
    if (existingIds.has(item.youtube_video_id)) {
      continue; // already in DB
    }
    if (excludedMap.has(item.youtube_video_id)) {
      continue; // excluded
    }
    available.push(item);
  }

  const uniqueWarnings = Array.from(new Set(apiWarnings));
  return {
    available,
    excluded: excludedStreams,
    totalAvailable: available.length,
    totalExcluded: excludedStreams.length,
    totalImported: existingIds.size,
    apiWarning:
      uniqueWarnings.length > 0
        ? `${uniqueWarnings[0]} — You can still import any stream directly by pasting its YouTube URL below.`
        : undefined,
  };
}

/**
 * Looks up metadata for a specific YouTube video/stream URL (or video ID).
 * Uses the YouTube Data API v3 when permitted and falls back to YouTube's
 * public watch metadata & oEmbed endpoint so upcoming/newly scheduled streams
 * can always be imported by URL even if search indexing or API keys fail.
 */
export async function lookupYouTubeStreamByUrl(urlOrId: string): Promise<{
  candidate: YouTubeStreamCandidate;
  metadataFound: boolean;
  alreadyImported: boolean;
  existingEpisodeId?: string;
  isExcluded: boolean;
  source: 'youtube-api' | 'youtube-page' | 'manual-fallback';
  warning?: string;
}> {
  const videoId = extractYouTubeVideoId(urlOrId);
  if (!videoId) {
    throw new Error(
      'Please enter a valid YouTube stream URL or 11-character video ID.'
    );
  }

  const [existingEpisodes, excludedStreams] = await Promise.all([
    getEpisodes({ includeHidden: true }),
    getExcludedYouTubeStreams(),
  ]);

  const existingEp = existingEpisodes.find(
    (e) => e.youtube_video_id === videoId
  );
  const isExcluded = excludedStreams.some(
    (item) => item.youtube_video_id === videoId
  );

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const defaultThumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();

  // 1. Try YouTube Data API v3 videos endpoint first if configured
  if (apiKey) {
    try {
      const params = new URLSearchParams({
        part: 'snippet,liveStreamingDetails',
        id: videoId,
        key: apiKey,
      });
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`,
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          items?: Array<{
            id?: string;
            snippet?: {
              title?: string;
              publishedAt?: string;
              liveBroadcastContent?: 'live' | 'upcoming' | 'none';
              thumbnails?: {
                medium?: { url?: string };
                default?: { url?: string };
              };
            };
            liveStreamingDetails?: {
              scheduledStartTime?: string;
              actualStartTime?: string;
            };
          }>;
        };
        const item = data.items?.[0];
        if (item?.snippet?.title) {
          const title = item.snippet.title.trim();
          const broadcast = item.snippet.liveBroadcastContent || 'none';
          const rawDate =
            item.liveStreamingDetails?.actualStartTime ||
            item.liveStreamingDetails?.scheduledStartTime ||
            item.snippet.publishedAt;
          return {
            candidate: {
              youtube_video_id: videoId,
              title,
              stream_date: toChicagoDateString(rawDate),
              published_at: rawDate,
              vod_url: canonicalUrl,
              thumbnail_url:
                item.snippet.thumbnails?.medium?.url ||
                item.snippet.thumbnails?.default?.url ||
                defaultThumb,
              set_name: extractSetFromTitle(title),
              format_tag: inferFormatTag(title),
              is_live: broadcast === 'live',
              is_upcoming: broadcast === 'upcoming',
            },
            metadataFound: true,
            alreadyImported: Boolean(existingEp),
            existingEpisodeId: existingEp?.id,
            isExcluded,
            source: 'youtube-api',
          };
        }
      }
    } catch {
      // Fall through to YouTube watch page lookup
    }
  }

  // 2. Fallback: public YouTube watch page + oEmbed lookup (hardcoded YouTube origin)
  try {
    const watchRes = await fetch(canonicalUrl, {
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (compatible; DeckTestTuesdayBot/1.0; +https://dtt.villainy.ink)',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (watchRes.ok) {
      const html = await watchRes.text();
      const player = extractBalancedJsonObject(
        html,
        /(?:var\s+)?ytInitialPlayerResponse\s*=\s*/
      ) as {
        videoDetails?: {
          title?: string;
          isLive?: boolean;
          isUpcoming?: boolean;
        };
        microformat?: {
          playerMicroformatRenderer?: {
            title?: { simpleText?: string };
            publishDate?: string;
            uploadDate?: string;
            liveBroadcastDetails?: {
              isLiveNow?: boolean;
              startTimestamp?: string;
            };
          };
        };
      } | null;

      const vd = player?.videoDetails;
      const micro = player?.microformat?.playerMicroformatRenderer;

      const ogTitleMatch =
        html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
        html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);
      const htmlTitleMatch = html.match(/<title>(.*?)<\/title>/i);
      const strippedHtmlTitle = htmlTitleMatch?.[1]
        ? decodeHtmlEntities(htmlTitleMatch[1])
            .replace(/\s*-\s*YouTube\s*$/i, '')
            .trim()
        : '';

      let title = (
        vd?.title ||
        micro?.title?.simpleText ||
        (ogTitleMatch?.[1] ? decodeHtmlEntities(ogTitleMatch[1]).trim() : '') ||
        (strippedHtmlTitle && strippedHtmlTitle.toLowerCase() !== 'youtube'
          ? strippedHtmlTitle
          : '')
      ).trim();

      if (!title) {
        try {
          const oembedRes = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
            { signal: AbortSignal.timeout(5000) }
          );
          if (oembedRes.ok) {
            const oembedJson = (await oembedRes.json()) as {
              title?: string;
              html?: string;
            };
            const iframeTitleMatch = oembedJson.html?.match(/\btitle="([^"]+)"/i);
            title = (
              oembedJson.title ||
              (iframeTitleMatch?.[1]
                ? decodeHtmlEntities(iframeTitleMatch[1])
                : '')
            ).trim();
          }
        } catch {
          // Ignore oEmbed failure
        }
      }

      if (title) {
        const isLive = Boolean(
          micro?.liveBroadcastDetails?.isLiveNow || vd?.isLive
        );
        const isUpcoming = !isLive && Boolean(vd?.isUpcoming);
        const rawDate =
          micro?.liveBroadcastDetails?.startTimestamp ||
          micro?.publishDate ||
          micro?.uploadDate;

        return {
          candidate: {
            youtube_video_id: videoId,
            title,
            stream_date: toChicagoDateString(rawDate),
            published_at: rawDate,
            vod_url: canonicalUrl,
            thumbnail_url: defaultThumb,
            set_name: extractSetFromTitle(title),
            format_tag: inferFormatTag(title),
            is_live: isLive,
            is_upcoming: isUpcoming,
          },
          metadataFound: true,
          alreadyImported: Boolean(existingEp),
          existingEpisodeId: existingEp?.id,
          isExcluded,
          source: 'youtube-page',
        };
      }
    }
  } catch {
    // Fall through to editable manual fallback
  }

  // 3. Fallback when YouTube blocks metadata (e.g. private/unlisted restrictions)
  return {
    candidate: {
      youtube_video_id: videoId,
      title: existingEp?.title || '',
      stream_date: existingEp?.stream_date || toChicagoDateString(),
      vod_url: canonicalUrl,
      thumbnail_url: defaultThumb,
      set_name: existingEp?.set_name || 'Hyperia City',
      format_tag: existingEp?.format_tag || 'Core',
      is_live: existingEp?.is_live || false,
      is_upcoming: existingEp ? existingEp.is_upcoming : true,
    },
    metadataFound: false,
    alreadyImported: Boolean(existingEp),
    existingEpisodeId: existingEp?.id,
    isExcluded,
    source: 'manual-fallback',
    warning:
      'Could not automatically read title/date from YouTube (the stream may be private or rate-limited). Enter the details below and click Import.',
  };
}

/**
 * Imports selected YouTube stream candidates as clean episodes into the database.
 * Does NOT generate dummy decks or matches; streams are created ready for manual logging.
 */
export async function importSelectedStreams(
  streams: Array<{
    youtube_video_id: string;
    title: string;
    stream_date?: string;
    vod_url?: string;
    set_name?: string;
    format_tag?: EpisodeFormatTag;
    is_live?: boolean;
    is_upcoming?: boolean;
  }>
): Promise<{ importedCount: number; episodes: Episode[] }> {
  const importedEpisodes: Episode[] = [];

  for (const s of streams) {
    const streamDate = s.stream_date || new Date().toISOString().split('T')[0];
    const ep = await createOrUpdateEpisode({
      youtube_video_id: s.youtube_video_id,
      title: s.title,
      stream_date: streamDate,
      vod_url: s.vod_url || `https://www.youtube.com/watch?v=${s.youtube_video_id}`,
      is_live: Boolean(s.is_live),
      is_upcoming: Boolean(s.is_upcoming),
      is_hidden: false,
      set_name: s.set_name || extractSetFromTitle(s.title),
      format_tag: s.format_tag || inferFormatTag(s.title),
    });

    // Remove from excluded list if it was previously excluded
    await removeExcludedYouTubeStream(s.youtube_video_id);

    importedEpisodes.push(ep);
  }

  return {
    importedCount: importedEpisodes.length,
    episodes: importedEpisodes,
  };
}
