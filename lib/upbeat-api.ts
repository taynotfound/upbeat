const API_BASE = 'https://upbeatradio.net/api/v1';
const SITE_BASE = 'https://upbeatradio.net';
const WEB_BASE = `${SITE_BASE}/v3`;

export type UpbeatSong = {
  id?: string | number;
  title: string;
  artist: string;
  art?: string;
  preview?: string | number;
  spotify_id?: string | number;
  likes?: number;
  dislikes?: number;
  favourites?: number;
  played?: number;
};

export type UpbeatOnAir = {
  name: string;
  likes?: number;
  profile_url?: string;
  avatar?: string;
  id?: string | number;
  day?: number;
  hour?: number;
  socials?: Record<string, string>;
  show?: boolean;
};

export type UpbeatStats = {
  song: UpbeatSong;
  onair: UpbeatOnAir;
  last_updated: string | null;
  listeners: number;
  listen_url: string;
};

export type UpbeatRecent = {
  title: string;
  artist: string;
  preview: string | number;
  spotify_id: string | number;
  likes: number;
  dislikes: number;
  favourites: number;
  played: number;
  time: number;
};

export type UpbeatBooked = {
  name: string;
  avatar: string;
  user_id: number;
  day: number;
  hour: number;
  week: number;
  profile_url: string;
};

export type UpbeatSongIntel = {
  title?: string;
  artist?: string;
  album?: string;
  year?: string | number;
  genre?: string;
  description?: string;
  cover?: string;
  cover_url?: string;
  artwork?: string;
  artwork_url?: string;
  lyrics?: unknown;
  source?: string;
  [key: string]: unknown;
};

const songIntelCache: Record<string, UpbeatSongIntel> = {};

async function fetchJson<T>(url: string): Promise<T> {
  try {
    console.debug('[upbeat-api] fetchJson ->', url);
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json,text/plain,*/*',
      },
    });

    console.debug('[upbeat-api] response', { url, status: response.status, ok: response.ok });

    if (!response.ok) {
      const msg = `Request failed (${response.status})`;
      console.error('[upbeat-api] fetchJson ERROR ->', url, msg);
      throw new Error(msg);
    }

    const json = await response.json();
    console.debug('[upbeat-api] fetchJson OK ->', url);
    return json as Promise<T>;
  } catch (e) {
    console.error('[upbeat-api] fetchJson EXCEPTION ->', url, e);
    throw e;
  }
}

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

function stripTags(input: string): string {
  return decodeEntities(input.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normalizeSongIntel(input: unknown): UpbeatSongIntel {
  if (!input || typeof input !== 'object') {
    return {};
  }

  return input as UpbeatSongIntel;
}

export async function getStats(): Promise<UpbeatStats> {
  return fetchJson<UpbeatStats>(`${API_BASE}/stats`);
}

export async function getRecentlyPlayed(): Promise<UpbeatRecent[]> {
  return fetchJson<UpbeatRecent[]>(`${API_BASE}/recentlyPlayed`);
}

export async function getBookedSlots(): Promise<UpbeatBooked[]> {
  const url = `${API_BASE}/booked`;
  console.debug('[upbeat-api] getBookedSlots ->', url);
  try {
    const data = await fetchJson<UpbeatBooked[]>(url);
    console.debug('[upbeat-api] getBookedSlots OK ->', data?.length ?? 0);
    return data;
  } catch (e) {
    console.error('[upbeat-api] getBookedSlots ERROR ->', e);
    throw e;
  }
}

export async function getSongIntel(artist: string, song: string): Promise<UpbeatSongIntel> {
  const key = `${artist}-${song}`.toLowerCase();
  const cached = songIntelCache[key];
  if (cached) {
    console.debug('[upbeat-api] getSongIntel CACHE HIT ->', key);
    return cached;
  }

  const extUrl = `https://test-0k.onrender.com/metadata/?artist=${encodeURIComponent(artist)}&song=${encodeURIComponent(song)}`;
  console.debug('[upbeat-api] getSongIntel CACHE MISS ->', key);

  const response = await fetch(extUrl);
  if (!response.ok) {
    throw new Error(`Song info fetch failed (${response.status})`);
  }

  const json = await response.json() as { data?: unknown; metadata?: unknown };
  const data = normalizeSongIntel(json.data ?? json.metadata ?? {});
  songIntelCache[key] = data;
  return data;
}

export function toAbsoluteStreamUrl(listenUrl?: string): string {
  if (!listenUrl) {
    return 'https://live.upbeat.pw';
  }

  if (listenUrl.startsWith('http://') || listenUrl.startsWith('https://')) {
    return listenUrl;
  }

  return `https://${listenUrl.replace(/^\/+/, '')}`;
}
