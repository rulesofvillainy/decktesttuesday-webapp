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
      throw new Error(`YouTube API error (${res.status}): ${errText}`);
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
          stream_date: new Date().toISOString().split('T')[0],
          vod_url: `https://www.youtube.com/watch?v=${activeDttLive.id.videoId}`,
          is_live: true,
          is_upcoming: false,
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
    };
  }

  const allFoundVideos: Map<string, YouTubeStreamCandidate> = new Map();

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
    if (liveRes.ok) {
      const data = (await liveRes.json()) as { items?: YouTubeSearchItem[] };
      const items = Array.isArray(data.items) ? data.items : [];
      for (const item of items) {
        const title = item.snippet?.title || '';
        const videoId = item.id?.videoId;
        if (!videoId || !title.toLowerCase().includes('deck test tuesday')) continue;
        allFoundVideos.set(videoId, {
          youtube_video_id: videoId,
          title,
          stream_date: (item.snippet?.publishedAt || new Date().toISOString()).split('T')[0],
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
    if (upRes.ok) {
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
            stream_date: (item.snippet?.publishedAt || new Date().toISOString()).split('T')[0],
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
      if (!res.ok) break;
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
            stream_date: publishedRaw ? publishedRaw.split('T')[0] : new Date().toISOString().split('T')[0],
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

  return {
    available,
    excluded: excludedStreams,
    totalAvailable: available.length,
    totalExcluded: excludedStreams.length,
    totalImported: existingIds.size,
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
