import {
  getBookedSlots,
  getRecentlyPlayed,
  getSongIntel,
  getStats,
  toAbsoluteStreamUrl,
  type UpbeatBooked,
  type UpbeatRecent,
  type UpbeatSongIntel,
  type UpbeatStats,
} from '@/lib/upbeat-api';
import { FontAwesome5 } from '@expo/vector-icons';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Constants ────────────────────────────────────────────────────────────────
const LOGO_URL    = 'https://upbeatradio.net/v3/_images_/UpBeat.png';
const SITE_BASE   = 'https://upbeatradio.net';
const CREDITS_URL = 'https://taymaerz.de';
const POLL_MS     = 20_000;
const { width: SW } = Dimensions.get('window');

// UpBeat brand palette — dark navy/purple base, magenta accent
const C = {
  bg:         '#07040f',
  surface:    '#120d1f',
  surface2:   '#171126',
  border:     '#241c38',
  borderHi:   '#3d3a5c',
  text:       '#f0eeff',
  textMuted:  '#8b82b0',
  textFaint:  '#4a4468',
  accent:     '#c026d3',
  accentText: '#e879f9',
  green:      '#22c55e',
  red:        '#ef4444',
  gold:       '#f59e0b',
  spotify:    '#1DB954',
  error:      '#f43f5e',
} as const;

const AD_RATIO = 1500 / 448;
const AD_W     = SW - 32;
const AD_H     = Math.round(AD_W / AD_RATIO);

const ADS = [
  { uri: 'https://upbeat.pw/images/g4dw5m', url: null },
  { uri: 'https://upbeat.pw/images/h6n93j', url: null },
  { uri: 'https://upbeat.pw/images/hx2dwl', url: null },
  { uri: 'https://upbeat.pw/images/tfxdiv', url: null },
  { uri: 'https://upbeat.pw/images/pbk90y', url: 'https://upbeat.pw/discord' },
  { uri: 'https://upbeat.pw/images/9a1eno', url: 'https://upbeat.pw/apply' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function absUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('//'))   return 'https:' + url;
  if (url.startsWith('/'))    return SITE_BASE + url;
  return SITE_BASE + '/' + url;
}
function fmt(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}
function rgba(hex: string, a: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

function Avatar({
  url,
  name,
  size = 44,
}: {
  url?: string | null;
  name: string;
  size?: number;
}) {
  const uri = absUrl(url);
  const r = size / 2;

  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: r }} contentFit="cover" />;
  }

  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.accentText, fontSize: size * 0.42, fontWeight: '800' }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

// ─── Spotify art cache ────────────────────────────────────────────────────────
const _artCache: Record<string, string | null> = {};
async function fetchSpotifyArt(sid: string): Promise<string | null> {
  if (sid in _artCache) return _artCache[sid];
  try {
    const res  = await fetch('https://open.spotify.com/oembed?url=https://open.spotify.com/track/' + sid);
    if (!res.ok) { _artCache[sid] = null; return null; }
    const data = await res.json() as { thumbnail_url?: string };
    _artCache[sid] = data.thumbnail_url ?? null;
    return _artCache[sid];
  } catch {
    _artCache[sid] = null;
    return null;
  }
}

// ─── Vote store ───────────────────────────────────────────────────────────────
type VoteState = { myLike: boolean; myDislike: boolean };
const _votes: Record<string, VoteState> = {};

function useVote(key: string, apiLikes: number, apiDislikes: number | null) {
  const init = _votes[key] ?? { myLike: false, myDislike: false };
  const [myLike,    setMyLike]    = useState(init.myLike);
  const [myDislike, setMyDislike] = useState(init.myDislike);
  const likes    = apiLikes + (myLike ? 1 : 0);
  const dislikes = apiDislikes !== null ? apiDislikes + (myDislike ? 1 : 0) : null;
  function toggleLike() {
    const next = !myLike;
    setMyLike(next);
    if (next && myDislike) setMyDislike(false);
    _votes[key] = { myLike: next, myDislike: next ? false : myDislike };
  }
  function toggleDislike() {
    const next = !myDislike;
    setMyDislike(next);
    if (next && myLike) setMyLike(false);
    _votes[key] = { myLike: next ? false : myLike, myDislike: next };
  }
  return { likes, dislikes, myLike, myDislike, toggleLike, toggleDislike };
}

// ─── Time helpers ─────────────────────────────────────────────────────────────
const UK_TZ   = 'Europe/London';
const IS_UK   = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone === UK_TZ; } catch { return false; } })();
const DAY_ABB = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function fmtEpoch(epoch: number): string {
  const d = new Date(epoch * 1000);
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (IS_UK) return t;
  const uk = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: UK_TZ });
  return t + ' / ' + uk + ' UK';
}

function slotToLocal(day: number, hour: number): Date {
  const now    = new Date();
  const isoDay = now.getDay() === 0 ? 7 : now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (isoDay - 1));
  monday.setHours(0, 0, 0, 0);
  const sd = new Date(monday);
  sd.setDate(monday.getDate() + (day - 1));
  const dateStr = sd.toLocaleDateString('en-CA');
  const probe   = new Date(dateStr + 'T12:00:00Z');
  const ukH     = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: UK_TZ, hour: 'numeric', hour12: false }).format(probe), 10);
  return new Date(new Date(dateStr + 'T' + String(hour).padStart(2, '0') + ':00:00Z').getTime() + (12 - ukH) * 3_600_000);
}

function fmtSlot(day: number, hour: number): string {
  const d = slotToLocal(day, hour);
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (IS_UK) return t;
  return t + ' / ' + String(hour).padStart(2, '0') + ':00 UK';
}

function minutesUntil(day: number, hour: number, nowMs = Date.now()): number {
  return Math.round((slotToLocal(day, hour).getTime() - nowMs) / 60_000);
}

function fmtCountdown(mins: number): string {
  if (mins <= 0) return 'now';
  if (mins < 60) return 'in ' + mins + 'm';
  if (mins < 1440) return 'in ' + Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
  return 'in ' + Math.floor(mins / 1440) + 'd';
}

function toReadableMeta(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const joined = value.map(item => toReadableMeta(item)).filter(Boolean).join(', ');
    return joined || null;
  }
  return null;
}

type TrackSnapshot = {
  key: string;
  title: string;
  artist: string;
  artUrl: string | null;
  spotifyId: string | null;
  played: number;
  likes: number;
  dislikes: number;
  favourites: number;
};

function getNextSlot(slots: UpbeatBooked[]): UpbeatBooked | null {
  if (!slots.length) return null;
  const now = new Date();
  return slots
    .map(s => { const diff = slotToLocal(s.day, s.hour).getTime() - now.getTime(); return { s, score: diff < 0 ? diff + 7 * 86_400_000 : diff }; })
    .sort((a, b) => a.score - b.score)[0]?.s ?? null;
}

function isHumanDj(name?: string): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return n !== 'upbeat' && n !== 'auto dj' && n !== '';
}

// ─── Socials ──────────────────────────────────────────────────────────────────
const SOCIAL_CFG = [
  { key: 'twitter',   icon: 'twitter',       color: '#1d9bf0', base: 'https://twitter.com/' },
  { key: 'instagram', icon: 'instagram',      color: '#e1306c', base: 'https://instagram.com/' },
  { key: 'spotify',   icon: 'spotify',        color: '#1DB954', base: 'https://open.spotify.com/user/' },
  { key: 'snapchat',  icon: 'snapchat-ghost', color: '#f5d800', base: 'https://snapchat.com/add/' },
] as const;

function DJSocials({ socials, profileUrl }: { socials?: Record<string, string>; profileUrl?: string | null }) {
  const btns: { icon: string; color: string; url: string }[] = [];
  if (socials) {
    for (const c of SOCIAL_CFG) {
      const h = (socials as Record<string, string>)[c.key];
      if (h) btns.push({ icon: c.icon, color: c.color, url: c.base + h });
    }
  }
  if (profileUrl) btns.push({ icon: 'user', color: C.textMuted, url: profileUrl });
  if (!btns.length) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      {btns.map(b => (
        <TouchableOpacity
          key={b.icon}
          onPress={() => Linking.openURL(b.url)}
          style={st.iconBtn}
          accessibilityLabel={b.icon}
        >
          <FontAwesome5 name={b.icon as any} size={13} color={b.color} />
        </TouchableOpacity>
      ))}
    </View>
  );
}


// ─── Ad carousel ─────────────────────────────────────────────────────────────
function AdCarousel() {
  const ref    = useRef<FlatList>(null);
  const [idx, setIdx] = useState(0);
  const onView = useRef(({ viewableItems }: any) => {
    if (viewableItems?.[0]?.index != null) setIdx(viewableItems[0].index);
  }).current;
  const vcfg = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  useEffect(() => {
    const t = setInterval(() => {
      setIdx(prev => {
        const next = (prev + 1) % ADS.length;
        ref.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 4_500);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={{ gap: 6 }}>
      <FlatList
        ref={ref}
        data={ADS}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        onViewableItemsChanged={onView}
        viewabilityConfig={vcfg}
        getItemLayout={(_, i) => ({ length: AD_W, offset: AD_W * i, index: i })}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => item.url && Linking.openURL(item.url)}
            style={{ width: AD_W, height: AD_H, borderRadius: 8, overflow: 'hidden' }}
            activeOpacity={item.url ? 0.8 : 1}
          >
            <Image source={{ uri: item.uri }} style={{ width: AD_W, height: AD_H }} contentFit="cover" />
          </TouchableOpacity>
        )}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
        {ADS.map((_, i) => (
          <View key={i} style={{ width: i === idx ? 16 : 4, height: 3, borderRadius: 2, backgroundColor: i === idx ? C.accent : C.border }} />
        ))}
      </View>
    </View>
  );
}

// ─── Song reactions ───────────────────────────────────────────────────────────
function SongReactions({
  songKey, apiLikes, apiDislikes, apiFavourites, compact = false,
}: {
  songKey: string; apiLikes: number; apiDislikes: number; apiFavourites?: number; compact?: boolean;
}) {
  const { likes, dislikes, myLike, myDislike, toggleLike, toggleDislike } =
    useVote(songKey, apiLikes, apiDislikes);
  const sz = compact ? 11 : 12;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <TouchableOpacity
        style={[st.reactBtn, myLike && st.reactLikeActive]}
        onPress={toggleLike}
        accessibilityLabel="Like"
      >
        <FontAwesome5 name="thumbs-up" size={sz} color={myLike ? C.green : C.textFaint} solid={myLike} />
        <Text style={[st.reactCount, myLike && { color: C.green }]}>{fmt(likes)}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[st.reactBtn, myDislike && st.reactDislikeActive]}
        onPress={toggleDislike}
        accessibilityLabel="Dislike"
      >
        <FontAwesome5 name="thumbs-down" size={sz} color={myDislike ? C.red : C.textFaint} solid={myDislike} />
        <Text style={[st.reactCount, myDislike && { color: C.red }]}>{fmt(dislikes ?? 0)}</Text>
      </TouchableOpacity>
      {apiFavourites != null && apiFavourites > 0 && !compact && (
        <View style={st.favChip}>
          <FontAwesome5 name="star" size={9} color={C.gold} solid />
          <Text style={{ color: C.gold, fontSize: 10, fontWeight: '600' }}>{fmt(apiFavourites)}</Text>
        </View>
      )}
    </View>
  );
}

// ─── DJ like button ───────────────────────────────────────────────────────────
function DJLikes({ djKey, apiLikes }: { djKey: string; apiLikes: number }) {
  const { likes, myLike, toggleLike } = useVote('dj::' + djKey, apiLikes, null);
  return (
    <TouchableOpacity
      style={[st.reactBtn, myLike && st.reactDjActive]}
      onPress={toggleLike}
      accessibilityLabel="Like this DJ"
    >
      <FontAwesome5 name="heart" size={12} color={myLike ? C.accentText : C.textFaint} solid={myLike} />
      <Text style={[st.reactCount, myLike && { color: C.accentText }]}>{fmt(likes)}</Text>
    </TouchableOpacity>
  );
}

// ─── Recently played row ──────────────────────────────────────────────────────
function RecentRow({ item }: { item: UpbeatRecent }) {
  const [artUri, setArtUri] = useState<string | null>(null);
  const sid = typeof item.spotify_id === 'string' && item.spotify_id ? item.spotify_id : null;
  useEffect(() => {
    if (!sid) return;
    if (sid in _artCache) { setArtUri(_artCache[sid]); return; }
    fetchSpotifyArt(sid).then(u => setArtUri(u));
  }, [sid]);
  const spotifyUrl  = sid ? 'https://open.spotify.com/track/' + sid : null;
  const reactionKey = sid ?? (item.title + '::' + item.artist);
  const apiLikes    = typeof item.likes    === 'number' ? item.likes    : 0;
  const apiDislikes = typeof item.dislikes === 'number' ? item.dislikes : 0;

  return (
    <View style={st.recentRow}>
      <TouchableOpacity
        onPress={() => spotifyUrl && Linking.openURL(spotifyUrl)}
        activeOpacity={spotifyUrl ? 0.75 : 1}
        style={st.recentThumb}
      >
        {artUri
          ? <Image source={{ uri: artUri }} style={{ width: 44, height: 44 }} contentFit="cover" />
          : <View style={{ width: 44, height: 44, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <FontAwesome5 name="music" size={14} color={C.textFaint} />
            </View>
        }
      </TouchableOpacity>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={st.recentTitle}  numberOfLines={1}>{item.title}</Text>
        <Text style={st.recentArtist} numberOfLines={1}>{item.artist}</Text>
        <Text style={st.recentTime}>{fmtEpoch(item.time)}</Text>
      </View>
      <SongReactions
        songKey={reactionKey}
        apiLikes={apiLikes}
        apiDislikes={apiDislikes}
        compact
      />
    </View>
  );
}

type FullscreenPlayerProps = {
  visible: boolean;
  onClose: () => void;
  onOpenSpotify: () => void;
  title: string;
  artist: string;
  artUrl?: string | null;
  isPlaying: boolean;
  artSpin: any;
  songIntel: UpbeatSongIntel | null;
  nextDj: UpbeatBooked | null;
  nextCountdown: number | null;
  songPlayed: number;
};

function FullscreenPlayer({
  visible,
  onClose,
  onOpenSpotify,
  title,
  artist,
  artUrl,
  isPlaying,
  artSpin,
  songIntel,
  nextDj,
  nextCountdown,
  songPlayed,
}: FullscreenPlayerProps) {
  const { width, height } = useWindowDimensions();
  const isWide = width > height;

  useEffect(() => {
    if (!visible) return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT).catch(() => {});
    };
  }, [visible]);

  const metadataChips = [
    toReadableMeta(songIntel?.album) ? { label: 'Album', value: toReadableMeta(songIntel?.album)! } : null,
    toReadableMeta(songIntel?.year) ? { label: 'Year', value: toReadableMeta(songIntel?.year)! } : null,
    toReadableMeta(songIntel?.genre) ? { label: 'Genre', value: toReadableMeta(songIntel?.genre)! } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const description = toReadableMeta(songIntel?.description);
  const nextCountdownLabel = nextCountdown == null ? null : fmtCountdown(nextCountdown);
  const nextLine = nextDj ? DAY_ABB[(nextDj.day - 1) % 7] + ' · ' + fmtSlot(nextDj.day, nextDj.hour) : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <StatusBar hidden />
      <View style={fs.shell}>
        <LinearGradient
          colors={['#0e0818', '#07040f', '#050308']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(192,38,211,0.22)', 'rgba(7,4,15,0.0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { opacity: 0.8 }]}
        />

        <View style={[fs.container, isWide ? fs.containerWide : fs.containerStack]}>
          <View style={fs.leftPanel}>
            <View style={fs.topRow}>
              <TouchableOpacity onPress={onClose} style={fs.iconButton} activeOpacity={0.8}>
                <FontAwesome5 name="times" size={14} color={C.text} />
              </TouchableOpacity>
              <View style={fs.modePill}>
                <Text style={fs.modePillLabel}>FULLSCREEN MODE</Text>
              </View>
            </View>

            <View style={fs.heroBlock}>
              <Animated.View style={[fs.heroArtWrap, isPlaying && fs.heroArtWrapLive, { transform: [{ rotate: artSpin }] }]}> 
                {artUrl
                  ? <Image source={{ uri: artUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  : <View style={fs.heroArtFallback}>
                      <FontAwesome5 name="music" size={28} color={C.textFaint} />
                    </View>
                }
              </Animated.View>

              <View style={{ flex: 1, gap: 10 }}>
                <View>
                  <Text style={fs.heroEyebrow}>NOW PLAYING</Text>
                  <Text style={fs.heroTitle}>{title}</Text>
                  <Text style={fs.heroArtist}>{artist}</Text>
                </View>

                <View style={fs.metaRow}>
                  <View style={fs.liveBadge}>
                    <View style={fs.liveDot} />
                    <Text style={fs.liveBadgeText}>{isPlaying ? 'ON AIR' : 'PAUSED'}</Text>
                  </View>
                  {songPlayed > 0 && <Text style={fs.playCount}>{fmt(songPlayed)} plays</Text>}
                </View>

                <View style={fs.buttonRow}>
                  <TouchableOpacity onPress={onOpenSpotify} style={fs.spotifyChip} activeOpacity={0.8}>
                    <FontAwesome5 name="spotify" size={14} color={C.spotify} />
                    <Text style={fs.spotifyChipText}>Open track</Text>
                  </TouchableOpacity>
                  {nextCountdownLabel && (
                    <View style={fs.countdownChip}>
                      <Text style={fs.countdownChipLabel}>NEXT UP</Text>
                      <Text style={fs.countdownChipText}>{nextCountdownLabel}</Text>
                    </View>
                  )}
                </View>

                {metadataChips.length > 0 && (
                  <View style={fs.metaChipRow}>
                    {metadataChips.map(chip => (
                      <View key={chip.label} style={fs.metaChip}>
                        <Text style={fs.metaChipLabel}>{chip.label}</Text>
                        <Text style={fs.metaChipValue} numberOfLines={1}>{chip.value}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {description ? <Text style={fs.description} numberOfLines={4}>{description}</Text> : <Text style={fs.descriptionMuted} numberOfLines={3}>Rich song info will appear here when the metadata API returns it.</Text>}
              </View>
            </View>

            {nextDj && (
              <View style={fs.nextCard}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={fs.nextEyebrow}>NEXT DJ</Text>
                  <Text style={fs.nextName}>{nextDj.name}</Text>
                  <Text style={fs.nextTime}>{nextLine}</Text>
                </View>
                <Avatar url={nextDj.avatar} name={nextDj.name} size={54} />
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function LiveScreen() {
  const [stats,      setStats]      = useState<UpbeatStats | null>(null);
  const [recent,     setRecent]     = useState<UpbeatRecent[]>([]);
  const [booked,     setBooked]     = useState<UpbeatBooked[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataError,  setDataError]  = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [isLoading,  setIsLoading]  = useState(false);
  const [sound,      setSound]      = useState<any>(null);
  const [nowMs,      setNowMs]      = useState(() => Date.now());
  const trackCacheRef = useRef<Record<string, TrackSnapshot>>({});
  const songIntelCacheRef = useRef<Record<string, UpbeatSongIntel>>({});
  const [displayTrack, setDisplayTrack] = useState<TrackSnapshot | null>(null);
  const [songIntel, setSongIntel] = useState<UpbeatSongIntel | null>(null);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const spin = useRef(new Animated.Value(0)).current;

  // All hooks before any early return
  const nextDj   = useMemo(() => getNextSlot(booked), [booked]);
  const upcoming = useMemo(() => {
    const now = new Date();
    return booked
      .map(s => { const diff = slotToLocal(s.day, s.hour).getTime() - now.getTime(); return { s, score: diff < 0 ? diff + 7 * 86_400_000 : diff }; })
      .sort((a, b) => a.score - b.score)
      .slice(0, 4)
      .map(x => x.s);
  }, [booked]);

  const streamUrl = useMemo(() => toAbsoluteStreamUrl(stats?.listen_url), [stats?.listen_url]);
  const djProfile = absUrl(stats?.onair?.profile_url ?? null);
  const djSocials = stats?.onair?.socials as Record<string, string> | undefined;
  const djName    = stats?.onair?.name   ?? '';
  const djId      = stats?.onair?.id != null ? String(stats.onair.id) : djName;
  const humanDj   = isHumanDj(djName);

  const songLikes      = typeof stats?.song?.likes      === 'number' ? stats.song.likes      : 0;
  const songDislikes   = typeof stats?.song?.dislikes   === 'number' ? stats.song.dislikes   : 0;
  const songFavourites = typeof stats?.song?.favourites === 'number' ? stats.song.favourites : 0;
  const songPlayed     = typeof stats?.song?.played     === 'number' ? stats.song.played     : 0;
  const songKey        = (typeof stats?.song?.spotify_id === 'string' && stats.song.spotify_id)
    ? stats.song.spotify_id
    : ((stats?.song?.title ?? 'Unknown Track') + '::' + (stats?.song?.artist ?? 'Unknown Artist'));
  const djApiLikes     = typeof stats?.onair?.likes     === 'number' ? stats.onair.likes     : 0;

  useEffect(() => {
    if (!stats) return;

    const nextTrack: TrackSnapshot = {
      key: songKey,
      title: stats.song?.title ?? 'Unknown Track',
      artist: stats.song?.artist ?? 'Unknown Artist',
      artUrl: absUrl(stats.song?.art),
      spotifyId: typeof stats.song?.spotify_id === 'string' ? stats.song.spotify_id : null,
      played: typeof stats.song?.played === 'number' ? stats.song.played : 0,
      likes: typeof stats.song?.likes === 'number' ? stats.song.likes : 0,
      dislikes: typeof stats.song?.dislikes === 'number' ? stats.song.dislikes : 0,
      favourites: typeof stats.song?.favourites === 'number' ? stats.song.favourites : 0,
    };

    const cached = trackCacheRef.current[songKey];
    if (cached) {
      setDisplayTrack(cached);
      return;
    }

    trackCacheRef.current[songKey] = nextTrack;
    setDisplayTrack(nextTrack);
  }, [songKey, stats]);

  const artUrl = displayTrack?.artUrl ?? absUrl(stats?.song?.art);
  const title = displayTrack?.title ?? stats?.song?.title ?? 'Unknown Track';
  const artist = displayTrack?.artist ?? stats?.song?.artist ?? 'Unknown Artist';
  const spotifyId = displayTrack?.spotifyId ?? (typeof stats?.song?.spotify_id === 'string' ? stats.song.spotify_id : null);
  const songPlayedDisplayed = displayTrack?.played ?? songPlayed;
  const songLikesDisplayed = displayTrack?.likes ?? songLikes;
  const songDislikesDisplayed = displayTrack?.dislikes ?? songDislikes;
  const songFavouritesDisplayed = displayTrack?.favourites ?? songFavourites;

  useEffect(() => {
    if (!artUrl) return;

    if (!isPlaying) {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    loop.start();
    return () => loop.stop();
  }, [artUrl, isPlaying, spin]);

  const artSpin = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const nextCountdown = nextDj ? minutesUntil(nextDj.day, nextDj.hour, nowMs) : null;

  useEffect(() => {
    if (!title || !artist || title === 'Unknown Track') {
      setSongIntel(null);
      return;
    }

    const cached = songIntelCacheRef.current[songKey];
    if (cached) {
      setSongIntel(cached);
      return;
    }

    let cancelled = false;
    console.debug('[LiveScreen] fetching song intel for', songKey);
    getSongIntel(artist, title)
      .then(data => {
        if (cancelled) return;
        songIntelCacheRef.current[songKey] = data;
        setSongIntel(data);
      })
      .catch(err => {
        if (cancelled) return;
        console.warn('[LiveScreen] song intel fetch failed:', err);
        setSongIntel(null);
      });

    return () => {
      cancelled = true;
    };
  }, [artist, songKey, title]);

  const loadAll = useCallback(async () => {
    const [st, re, bo] = await Promise.allSettled([getStats(), getRecentlyPlayed(), getBookedSlots()]);
    const fails: string[] = [];
    if (st.status === 'fulfilled') setStats(st.value);
    else fails.push('stats: ' + (st.reason?.message ?? String(st.reason)));
    if (re.status === 'fulfilled') setRecent(re.value.slice(0, 14));
    else fails.push('recent: ' + (re.reason?.message ?? String(re.reason)));
    if (bo.status === 'fulfilled') setBooked(bo.value);
    else fails.push('booked: ' + (bo.reason?.message ?? String(bo.reason)));
    if (fails.length) throw new Error(fails.join(' | '));
  }, []);

  useEffect(() => {
    loadAll().catch((e: any) => setDataError(e?.message ?? String(e))).finally(() => setLoading(false));
  }, [loadAll]);

  useEffect(() => {
    const t = setInterval(() => loadAll().catch(() => {}), POLL_MS);
    return () => clearInterval(t);
  }, [loadAll]);

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false, playsInSilentModeIOS: true,
      staysActiveInBackground: true, shouldDuckAndroid: true,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => () => { sound?.unloadAsync().catch(() => {}); }, [sound]);

  const onPlaybackStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setIsPlaying(status.isPlaying);
    if (status.isPlaying) setIsLoading(false);
  }, []);

  const togglePlay = useCallback(async () => {
    setAudioError(null);
    try {
      if (!sound) {
        setIsLoading(true);
        const { sound: snd } = await Audio.Sound.createAsync(
          { uri: streamUrl }, { shouldPlay: true, progressUpdateIntervalMillis: 500 }, onPlaybackStatus,
        );
        setSound(snd); return;
      }
      const status = await sound.getStatusAsync();
      if (!status.isLoaded) {
        await sound.unloadAsync(); setIsLoading(true);
        const { sound: snd } = await Audio.Sound.createAsync(
          { uri: streamUrl }, { shouldPlay: true, progressUpdateIntervalMillis: 500 }, onPlaybackStatus,
        );
        setSound(snd); return;
      }
      if (status.isPlaying) { await sound.pauseAsync(); setIsLoading(false); }
      else { setIsLoading(true); await sound.playAsync(); }
    } catch {
      setIsLoading(false);
      setAudioError('Playback failed. Tap to retry.');
    }
  }, [onPlaybackStatus, sound, streamUrl]);

  const openSpotify = useCallback(() => {
    const url = spotifyId
      ? 'https://open.spotify.com/track/' + spotifyId
      : 'https://open.spotify.com/search/' + encodeURIComponent(artist + ' ' + title);
    Linking.openURL(url);
  }, [spotifyId, artist, title]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { setDataError(null); await loadAll(); }
    catch (e: any) { setDataError(e?.message ?? String(e)); }
    finally { setRefreshing(false); }
  }, [loadAll]);

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={st.safeArea}>
        <View style={st.center}>
          <Image source={{ uri: LOGO_URL }} style={{ width: 40, height: 40 }} contentFit="contain" />
          <ActivityIndicator color={C.accent} style={{ marginTop: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={st.safeArea}>
      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        {/* ── Top bar ── */}
        <View style={st.topBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Image source={{ uri: LOGO_URL }} style={{ width: 30, height: 30 }} contentFit="contain" />
            <Text style={st.stationName}>UpBeat</Text>
          </View>
        </View>

        {/* ── Now playing ── */}
        <View style={st.playerCard}>
          <View pointerEvents="none" style={st.playerShade} />
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
            {/* Album art — side panel */}
            <Animated.View style={[st.artWrap, isPlaying && st.artWrapSpinning, { transform: [{ rotate: artSpin }] }]}> 
              {artUrl
                ? <Image source={{ uri: artUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <FontAwesome5 name="music" size={24} color={C.textFaint} />
                  </View>
              }
              <LinearGradient
                pointerEvents="none"
                colors={['transparent', 'rgba(7,4,15,0.25)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
            </Animated.View>

            {/* Track info */}
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={st.trackTitle}  numberOfLines={2}>{title}</Text>
              <Text style={st.trackArtist} numberOfLines={1}>{artist}</Text>
              <View style={st.liveMetaRow}>
                <View style={st.livePill}>
                  <View style={st.liveDot} />
                  <Text style={st.livePillText}>LIVE</Text>
                </View>
                {songPlayedDisplayed > 0 && <Text style={st.playedCount}>{fmt(songPlayedDisplayed)} plays</Text>}
              </View>
              {songIntel ? (
                <View style={st.songIntelBlock}>
                  {toReadableMeta(songIntel.album) && (
                    <Text style={st.songIntelText} numberOfLines={1}>{toReadableMeta(songIntel.album)}</Text>
                  )}
                  {(toReadableMeta(songIntel.genre) || toReadableMeta(songIntel.year)) && (
                    <Text style={st.songIntelMeta} numberOfLines={1}>
                      {[toReadableMeta(songIntel.genre), toReadableMeta(songIntel.year)].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  {toReadableMeta(songIntel.description) && (
                    <Text style={st.trackSubtle} numberOfLines={3}>
                      {toReadableMeta(songIntel.description)}
                    </Text>
                  )}
                </View>
              ) : (
                <Text style={st.trackSubtle} numberOfLines={2}>
                  Fetching richer song details when the track changes.
                </Text>
              )}
              <SongReactions
                songKey={songKey}
                apiLikes={songLikesDisplayed}
                apiDislikes={songDislikesDisplayed}
                apiFavourites={songFavouritesDisplayed}
              />
            </View>
          </View>

          <View style={st.actionRow}>
            <Pressable
              onPress={togglePlay}
              style={({ pressed }) => [st.playBtn, pressed && { opacity: 0.86 }]}
              accessibilityRole="button"
              accessibilityLabel={isLoading ? 'Connecting' : isPlaying ? 'Pause' : 'Play live radio'}
            >
              {isLoading
                ? <><ActivityIndicator size="small" color="#fff" /><Text style={st.playLabel}>Connecting</Text></>
                : <>
                    <FontAwesome5 name={isPlaying ? 'pause' : 'play'} size={14} color="#fff" solid />
                    <Text style={st.playLabel}>{isPlaying ? 'Pause' : 'Play live'}</Text>
                  </>
              }
            </Pressable>

            {title !== 'Unknown Track' && (
              <TouchableOpacity onPress={openSpotify} style={st.spotifyBtn} activeOpacity={0.8}>
                <FontAwesome5 name="spotify" size={13} color={C.spotify} />
                <Text style={st.spotifyBtnText}>Spotify</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => setFullscreenVisible(true)} style={st.fullscreenBtn} activeOpacity={0.8}>
              <FontAwesome5 name="expand" size={12} color={C.text} />
            </TouchableOpacity>
          </View>

          {(audioError || dataError) && (
            <Text style={{ color: C.error, fontSize: 12 }}>{audioError ?? dataError}</Text>
          )}
        </View>

        {/* ── DJ on air ── */}
        {humanDj && (
          <View style={st.djRow}>
            {(() => {
              const uri = absUrl(stats?.onair?.avatar);
              return uri
                ? <Image source={{ uri }} style={st.djAvatar} contentFit="cover" />
                : <View style={[st.djAvatar, { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: C.accentText, fontSize: 16, fontWeight: '800' }}>{djName.charAt(0)}</Text>
                  </View>;
            })()}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={st.djName}>{djName}</Text>
              <Text style={st.djLabel}>on air now</Text>
              <DJSocials socials={djSocials} profileUrl={djProfile} />
            </View>
            <DJLikes djKey={djId} apiLikes={djApiLikes} />
          </View>
        )}

        {/* ── Next up ── */}
        {nextDj && (
          <View style={st.section}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1, gap: 8 }}>
                <View>
                  <Text style={st.sectionTitle}>Next up</Text>
                  <Text style={st.nextName}>{nextDj.name}</Text>
                  <Text style={st.mutedText}>{DAY_ABB[(nextDj.day - 1) % 7]} · {fmtSlot(nextDj.day, nextDj.hour)}</Text>
                </View>
              </View>

              <View style={st.nextAvatarWrap}>
                <Avatar url={nextDj.avatar} name={nextDj.name} size={58} />
              </View>
            </View>
          </View>
        )}

        {nextCountdown != null && (
          <View style={st.countdownStrip}>
            <View style={st.countdownIconWrap}>
              <FontAwesome5 name="clock" size={10} color={C.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.countdownLabel}>NEXT UP IN</Text>
              <Text style={st.countdownText}>{fmtCountdown(nextCountdown)}</Text>
            </View>
            <Text style={st.countdownName}>{nextDj?.name}</Text>
          </View>
        )}

        {/* ── Ads ── */}
        <AdCarousel />

        {/* ── Recently played ── */}
        {recent.length > 0 && (
          <View style={st.section}>
            <Text style={st.sectionTitle}>Recently played</Text>
            {recent.map(item => (
              <RecentRow key={item.time + item.title} item={item} />
            ))}
          </View>
        )}

        {/* ── Stats ── */}
        <View style={st.statsRow}>
          {([
            { label: 'Tracks today', value: String(recent.length) },
            { label: 'Shows booked', value: String(booked.length) },
            { label: 'Song plays',   value: songPlayed > 0 ? fmt(songPlayed) : '--' },
          ] as const).map(({ label, value }) => (
            <View key={label} style={st.statChip}>
              <Text style={st.statValue}>{value}</Text>
              <Text style={st.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── Schedule preview ── */}
        {upcoming.length > 0 && (
          <View style={st.section}>
            <Text style={st.sectionTitle}>Schedule</Text>
            {upcoming.map((slot, i) => (
              <View
                key={slot.user_id + '-' + slot.day + '-' + slot.hour}
                style={[st.schedRow, i < upcoming.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }]}
              >
                <Text style={st.schedDay}>{DAY_ABB[(slot.day - 1) % 7]}</Text>
                <Text style={st.schedName}>{slot.name}</Text>
                <Text style={st.schedTime}>{fmtSlot(slot.day, slot.hour)}</Text>
              </View>
            ))}
            <Text style={st.seeAll}>See all in Schedule tab</Text>
          </View>
        )}

        {/* ── Credits ── */}
        <View style={st.credits}>
          <Text style={st.creditsText}>
            Made with love by{' '}
            <Text style={{ color: C.accentText, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(CREDITS_URL)}>
              Tay März
            </Text>
            {'. Unofficial app. Not affiliated with Upbeat Radio.'}
          </Text>
        </View>

      </ScrollView>

      <FullscreenPlayer
        visible={fullscreenVisible}
        onClose={() => setFullscreenVisible(false)}
        onOpenSpotify={openSpotify}
        title={title}
        artist={artist}
        artUrl={artUrl}
        isPlaying={isPlaying}
        artSpin={artSpin}
        songIntel={songIntel}
        nextDj={nextDj}
        nextCountdown={nextCountdown}
        songPlayed={songPlayedDisplayed}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  scroll:   { flex: 1 },
  content:  { padding: 16, gap: 12, paddingBottom: 100 },
  center:   { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },

  // Top bar
  topBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  stationName: { color: C.text, fontSize: 15, fontWeight: '800' },
  liveLabel:   { color: C.green, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },

  // Player card
  playerCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 24,
    padding: 16,
    gap: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 18,
    elevation: 10,
  },
  playerShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 90, backgroundColor: rgba(C.accent, 0.08) },
  artWrap: {
    width: 104,
    height: 104,
    borderRadius: 52,
    overflow: 'hidden',
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: rgba(C.accentText, 0.18),
  },
  artWrapSpinning: {
    shadowColor: C.accentText,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 14,
  },
  playerAccent: { position: 'absolute', top: -48, right: -48, width: 140, height: 140, borderRadius: 70, backgroundColor: rgba(C.accent, 0.12) },
  trackTitle:  { color: C.text,      fontSize: 17, fontWeight: '900', lineHeight: 22, letterSpacing: -0.3 },
  trackArtist: { color: C.accentText, fontSize: 13, fontWeight: '600' },
  playedCount: { color: C.textFaint,  fontSize: 11 },
  trackSubtle: { color: C.textMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  liveMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: rgba(C.accent, 0.14), borderColor: rgba(C.accent, 0.3), borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  livePillText: { color: C.accentText, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  songIntelBlock: { gap: 3, paddingTop: 4 },
  songIntelText: { color: C.text, fontSize: 12, fontWeight: '700' },
  songIntelMeta: { color: C.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },

  // Play button — UpBeat magenta
  playBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: C.accent,
    borderRadius: 16,
    paddingVertical: 16,
    minHeight: 54,
  },
  playLabel: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  spotifyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: rgba(C.spotify, 0.10), borderWidth: 1, borderColor: rgba(C.spotify, 0.25), borderRadius: 16, paddingHorizontal: 14, paddingVertical: 16, minHeight: 54 },
  spotifyBtnText: { color: C.spotify, fontSize: 12, fontWeight: '800' },
  fullscreenBtn: { width: 48, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },

  // DJ row
  djRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 12,
  },
  djAvatar: { width: 44, height: 44, borderRadius: 22 },
  djName:   { color: C.text, fontSize: 14, fontWeight: '700' },
  djLabel:  { color: C.textFaint, fontSize: 11 },

  // Icon button (socials)
  iconBtn: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },

  // Reaction buttons
  reactBtn:           { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
  reactLikeActive:    { borderColor: rgba(C.green,      0.4), backgroundColor: rgba(C.green,      0.1) },
  reactDislikeActive: { borderColor: rgba(C.red,        0.4), backgroundColor: rgba(C.red,        0.1) },
  reactDjActive:      { borderColor: rgba(C.accentText, 0.4), backgroundColor: rgba(C.accentText, 0.1) },
  reactCount:         { color: C.textFaint, fontSize: 11, fontWeight: '600' },
  favChip:            { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },

  // Sections
  section:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 22, padding: 16, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 6 },
  sectionTitle: { color: C.text, fontSize: 12, fontWeight: '900', marginBottom: 2, letterSpacing: 2.5 },
  mutedText:    { color: C.textMuted, fontSize: 12 },
  nextName:     { color: C.text, fontSize: 15, fontWeight: '700' },
  nextTime:     { color: C.textMuted, fontSize: 13 },
  nextAvatarWrap: { width: 70, alignItems: 'flex-end', justifyContent: 'flex-start' },
  countdownStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: rgba(C.accent, 0.1), borderWidth: 1, borderColor: rgba(C.accent, 0.22), borderRadius: 18, paddingHorizontal: 12, paddingVertical: 10 },
  countdownIconWrap: { width: 26, height: 26, borderRadius: 13, backgroundColor: rgba(C.accent, 0.16), alignItems: 'center', justifyContent: 'center' },
  countdownLabel: { color: C.accentText, fontSize: 8, fontWeight: '900', letterSpacing: 2 },
  countdownText: { color: C.text, fontSize: 15, fontWeight: '900' },
  countdownName: { color: C.textMuted, fontSize: 11, fontWeight: '700', maxWidth: 96, textAlign: 'right' },

  // Recently played rows
  recentRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  recentThumb:  { width: 44, height: 44, borderRadius: 6, overflow: 'hidden', backgroundColor: C.surface2 },
  recentTitle:  { color: C.text,      fontSize: 13, fontWeight: '600' },
  recentArtist: { color: C.textMuted, fontSize: 12 },
  recentTime:   { color: C.textFaint, fontSize: 11 },

  // Stats
  statsRow:  { flexDirection: 'row', gap: 8 },
  statChip:  { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 12, alignItems: 'center', gap: 4 },
  statValue: { color: C.text, fontSize: 18, fontWeight: '800' },
  statLabel: { color: C.textFaint, fontSize: 10, textAlign: 'center', letterSpacing: 0.4 },

  // Schedule
  schedRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  schedDay:  { color: C.textFaint, fontSize: 11, fontWeight: '600', width: 28 },
  schedName: { color: C.text, fontSize: 13, fontWeight: '600', flex: 1 },
  schedTime: { color: C.textMuted, fontSize: 12 },
  seeAll:    { color: C.textFaint, fontSize: 11, textAlign: 'right' },

  // Credits
  credits:     { paddingVertical: 20, alignItems: 'center' },
  creditsText: { color: C.textFaint, fontSize: 11, textAlign: 'center', lineHeight: 17 },
});

const fs = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#07040f' },
  container: { flex: 1, padding: 16, gap: 14 },
  containerWide: { flexDirection: 'row', alignItems: 'stretch' },
  containerStack: { flexDirection: 'column' },
  leftPanel: { flex: 1.15, gap: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: rgba(C.surface, 0.95), borderWidth: 1, borderColor: C.border },
  modePill: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: rgba(C.accent, 0.14), borderWidth: 1, borderColor: rgba(C.accent, 0.28), borderRadius: 999, paddingVertical: 9 },
  modePillLabel: { color: C.accentText, fontSize: 9, fontWeight: '900', letterSpacing: 3 },
  heroBlock: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, backgroundColor: rgba(C.surface, 0.76), borderWidth: 1, borderColor: rgba(C.borderHi, 0.65), borderRadius: 24, padding: 16, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  heroArtWrap: { width: 156, height: 156, borderRadius: 78, overflow: 'hidden', backgroundColor: C.surface2, borderWidth: 1, borderColor: rgba(C.accentText, 0.16) },
  heroArtWrapLive: { shadowColor: C.accentText, shadowOpacity: 0.2, shadowRadius: 22, elevation: 14 },
  heroArtFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroEyebrow: { color: C.accentText, fontSize: 9, fontWeight: '900', letterSpacing: 3, marginBottom: 4 },
  heroTitle: { color: C.text, fontSize: 25, fontWeight: '900', lineHeight: 30, letterSpacing: -0.4 },
  heroArtist: { color: C.textMuted, fontSize: 13, fontWeight: '700', marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: rgba(C.green, 0.12), borderWidth: 1, borderColor: rgba(C.green, 0.28) },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  liveBadgeText: { color: C.green, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  playCount: { color: C.textFaint, fontSize: 10, fontWeight: '700' },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 },
  spotifyChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: rgba(C.spotify, 0.14), borderWidth: 1, borderColor: rgba(C.spotify, 0.28), borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  spotifyChipText: { color: C.spotify, fontSize: 12, fontWeight: '800' },
  countdownChip: { minWidth: 120, backgroundColor: rgba(C.accent, 0.12), borderWidth: 1, borderColor: rgba(C.accent, 0.28), borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  countdownChipLabel: { color: C.accentText, fontSize: 8, fontWeight: '900', letterSpacing: 2 },
  countdownChipText: { color: C.text, fontSize: 14, fontWeight: '900' },
  metaChipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaChip: { minWidth: 86, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  metaChipLabel: { color: C.textFaint, fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  metaChipValue: { color: C.text, fontSize: 11, fontWeight: '800' },
  description: { color: C.text, fontSize: 12, lineHeight: 18 },
  descriptionMuted: { color: C.textMuted, fontSize: 12, lineHeight: 18 },
  nextCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 14 },
  nextEyebrow: { color: C.accentText, fontSize: 9, fontWeight: '900', letterSpacing: 3, marginBottom: 4 },
  nextName: { color: C.text, fontSize: 18, fontWeight: '900' },
  nextTime: { color: C.textMuted, fontSize: 11, fontWeight: '700' },
});
