import { FontAwesome5 } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getBookedSlots,
  type UpbeatBooked,
} from '@/lib/upbeat-api';

// ─── Tokens ──────────────────────────────────────────────────────────────────
const C = {
  violet:      '#7c3aed',
  violetSoft:  '#a78bfa',
  magenta:     '#c026d3',
  magentaSoft: '#e879f9',
  gold:        '#f59e0b',
  goldSoft:    '#fcd34d',
  bg:          '#07050c',
  surface:     '#0f0b17',
  surface2:    '#161021',
  border:      '#241a35',
  text:        '#f3eeff',
  textMuted:   '#9580b8',
  textFaint:   '#4a3868',
  error:       '#f43f5e',
  green:       '#22c55e',
} as const;

function rgba(hex: string, a: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const SITE_BASE = 'https://upbeatradio.net';

function absUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('//'))   return 'https:' + url;
  if (url.startsWith('/'))    return SITE_BASE + url;
  return SITE_BASE + '/' + url;
}

// ─── Time ─────────────────────────────────────────────────────────────────────
const UK_TZ = 'Europe/London';
const DAY_LABELS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_SHORT  = ['', 'M', 'T', 'W', 'T', 'F', 'S', 'S'];

function slotToDate(day: number, hour: number): Date {
  const now    = new Date();
  const isoDay = now.getDay() === 0 ? 7 : now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (isoDay - 1));
  monday.setHours(0, 0, 0, 0);
  const slotDate = new Date(monday);
  slotDate.setDate(monday.getDate() + (day - 1));
  const dateStr = slotDate.toLocaleDateString('en-CA');
  const probe   = new Date(dateStr + 'T12:00:00Z');
  const ukH     = parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: UK_TZ, hour: 'numeric', hour12: false }).format(probe),
    10,
  );
  return new Date(
    new Date(dateStr + 'T' + String(hour).padStart(2, '0') + ':00:00Z').getTime() + (12 - ukH) * 3_600_000,
  );
}

function fmtSlotTime(day: number, hour: number): string {
  const d     = slotToDate(day, hour);
  const local = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isUK  = Intl.DateTimeFormat().resolvedOptions().timeZone === UK_TZ;
  if (isUK) return local;
  const uk = String(hour).padStart(2, '0') + ':00';
  return local + ' \u00b7 ' + uk + ' UK';
}

function minutesUntil(day: number, hour: number, nowMs = Date.now()): number {
  return Math.round((slotToDate(day, hour).getTime() - nowMs) / 60_000);
}

function fmtCountdown(mins: number): string {
  if (mins < 60)   return 'in ' + mins + 'm';
  if (mins < 1440) return 'in ' + Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
  return 'in ' + Math.floor(mins / 1440) + 'd';
}

// ─── Error boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null };
  componentDidCatch(e: any) { this.setState({ error: e?.message ?? String(e) }); }
  static getDerivedStateFromError(e: any) { return { error: e?.message ?? String(e) }; }
  render() {
    if (this.state.error) {
      return (
        <ScrollView style={{ flex: 1, backgroundColor: '#07050c', padding: 20 }}>
          <Text style={{ color: '#f43f5e', fontSize: 13, fontWeight: '800', marginBottom: 8 }}>
            RENDER ERROR
          </Text>
          <Text style={{ color: '#f3eeff', fontSize: 11, lineHeight: 18 }}>
            {this.state.error}
          </Text>
        </ScrollView>
      );
    }
    return this.props.children as any;
  }
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({
  url, name, size = 40, ring = false,
}: {
  url?: string | null; name: string; size?: number; ring?: boolean;
}) {
  const uri = absUrl(url);
  const r   = size / 2;
  const img = uri
    ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: r }} contentFit="cover" />
    : (
      <View style={{ width: size, height: size, borderRadius: r, backgroundColor: rgba(C.violet, 0.22), alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.violetSoft, fontSize: size * 0.42, fontWeight: '800' }}>
          {name.charAt(0).toUpperCase()}
        </Text>
      </View>
    );
  if (!ring) return img;
  return (
    <View style={{ borderRadius: r + 2, borderWidth: 2, borderColor: C.violet, padding: 2 }}>
      {img}
    </View>
  );
}

// ─── Eyebrow ──────────────────────────────────────────────────────────────────
function Eyebrow({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 }}>
      <FontAwesome5 name={icon as any} size={10} color={C.violet} />
      <Text style={{ color: C.violet, fontSize: 10, fontWeight: '900', letterSpacing: 3 }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────
type Tab = 'booked' | 'recurring';

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'booked',    label: 'This Week', icon: 'calendar-check' },
    { id: 'recurring', label: 'Recurring', icon: 'redo' },
  ];
  return (
    <View style={tb.wrap}>
      {tabs.map(t => (
        <TouchableOpacity
          key={t.id}
          style={[tb.tab, active === t.id && tb.tabActive]}
          activeOpacity={0.78}
          onPress={() => onChange(t.id)}
        >
          <FontAwesome5
            name={t.icon as any}
            size={11}
            color={active === t.id ? C.violetSoft : C.textFaint}
          />
          <Text style={[tb.label, active === t.id && tb.labelActive]}>
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const tb = StyleSheet.create({
  wrap:        { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: C.border, gap: 4 },
  tab:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10 },
  tabActive:   { backgroundColor: rgba(C.violet, 0.18), borderWidth: 1, borderColor: rgba(C.violet, 0.35) },
  label:       { color: C.textFaint, fontSize: 12, fontWeight: '700' },
  labelActive: { color: C.violetSoft },
});

// ─── Slot card ────────────────────────────────────────────────────────────────
function SlotCard({ slot, isNext, nowMs }: { slot: UpbeatBooked; isNext: boolean; nowMs: number }) {
  const mins    = minutesUntil(slot.day, slot.hour, nowMs);
  const past    = mins < -60;
  const soon    = !past && mins < 120;
  const timeStr = fmtSlotTime(slot.day, slot.hour);

  const glowAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isNext) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
  }, [glowAnim, isNext]);

  const borderColor = isNext ? rgba(C.violet, 0.6) : soon ? rgba(C.gold, 0.35) : C.border;

  return (
    <TouchableOpacity
      style={[sc.card, { borderColor }, past && sc.cardPast]}
      activeOpacity={0.78}
      onPress={() => Linking.openURL(slot.profile_url).catch(() => {})}
    >
      {isNext && (
        <Animated.View style={[
          sc.nextGlow,
          { opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.22] }) },
        ]} />
      )}
      <Avatar url={slot.avatar} name={slot.name} size={44} ring={isNext} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[sc.name, past && { color: C.textMuted }]}>{slot.name}</Text>
        <Text style={sc.time}>{timeStr}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {isNext && (
          <View style={sc.nextBadge}>
            <Text style={sc.nextBadgeLabel}>NEXT UP</Text>
            <Text style={sc.nextBadgeText}>{mins <= 0 ? 'now' : fmtCountdown(mins)}</Text>
          </View>
        )}
        {soon && !isNext && (
          <View style={sc.soonBadge}>
            <Text style={sc.soonBadgeText}>{fmtCountdown(mins)}</Text>
          </View>
        )}
        {past && <Text style={sc.pastLabel}>Done</Text>}
        <View style={sc.weekChip}>
          <Text style={sc.weekText}>{'W' + slot.week}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const sc = StyleSheet.create({
  card:          { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderRadius: 16, padding: 12, overflow: 'hidden' },
  cardPast:      { opacity: 0.45 },
  nextGlow:      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.violet },
  name:          { color: C.text, fontSize: 14, fontWeight: '800' },
  time:          { color: C.textMuted, fontSize: 11, fontWeight: '500' },
  nextBadge:     { backgroundColor: rgba(C.violet, 0.18), borderWidth: 1, borderColor: rgba(C.violet, 0.42), borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, alignItems: 'flex-end', gap: 1 },
  nextBadgeLabel:{ color: C.violetSoft, fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  nextBadgeText:  { color: C.text, fontSize: 10, fontWeight: '800' },
  soonBadge:     { backgroundColor: rgba(C.gold, 0.14), borderWidth: 1, borderColor: rgba(C.gold, 0.35), borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  soonBadgeText: { color: C.goldSoft, fontSize: 9, fontWeight: '800' },
  pastLabel:     { color: C.textFaint, fontSize: 9, fontWeight: '700' },
  weekChip:      { backgroundColor: C.surface2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  weekText:      { color: C.textFaint, fontSize: 9, fontWeight: '700' },
});

// ─── Weekly heatmap ───────────────────────────────────────────────────────────
function WeekGrid({ slots }: { slots: UpbeatBooked[] }) {
  const counts = Array.from({ length: 7 }, (_, i) => slots.filter(s => s.day === i + 1).length);
  const max    = Math.max(...counts, 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingVertical: 6 }}>
      {counts.map((count, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <View style={{
            width: '100%',
            height: Math.max(6, Math.round((count / max) * 36)),
            borderRadius: 4,
            backgroundColor: count > 0
              ? rgba(C.violet, 0.25 + (count / max) * 0.6)
              : C.surface2,
          }} />
          <Text style={{ color: C.textFaint, fontSize: 9, fontWeight: '700' }}>{DAY_SHORT[i + 1]}</Text>
          {count > 0 && (
            <Text style={{ color: C.violetSoft, fontSize: 9, fontWeight: '800' }}>{count}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

// ─── DJ roster ────────────────────────────────────────────────────────────────
function DJRoster({ slots }: { slots: UpbeatBooked[] }) {
  const seen: Set<number> = new Set();
  const djs = slots.filter(s => { if (seen.has(s.user_id)) return false; seen.add(s.user_id); return true; });
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: C.textMuted, fontSize: 11 }}>
        {djs.length + ' DJs \u00b7 ' + slots.length + ' slots this week'}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {djs.map(dj => (
          <TouchableOpacity
            key={dj.user_id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}
            activeOpacity={0.78}
            onPress={() => Linking.openURL(dj.profile_url).catch(() => {})}
          >
            <Avatar url={dj.avatar} name={dj.name} size={30} />
            <Text style={{ color: C.text, fontSize: 12, fontWeight: '700' }}>{dj.name}</Text>
            <Text style={{ color: C.textFaint, fontSize: 10, fontWeight: '700' }}>
              {slots.filter(s => s.user_id === dj.user_id).length + 'x'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
function ScheduleScreenInner() {
  const [slots,      setSlots]      = useState<UpbeatBooked[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<Tab>('booked');
  const [dayFilter,  setDayFilter]  = useState<number | null>(null);
  const [nowMs,      setNowMs]      = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const raw = await getBookedSlots();
      const sorted = [...raw].sort((a, b) => a.day !== b.day ? a.day - b.day : a.hour - b.hour);
      setSlots(sorted);
    } catch (e: any) {
      console.error('[ScheduleScreen] loadAll ERROR:', e);
      throw e;
    }
  }, []);

  useEffect(() => {
    loadAll()
      .catch((e: any) => {
        const msg = e?.message ?? String(e);
        console.error('[ScheduleScreen] loadAll ERROR:', e);
        setError('Could not load the schedule: ' + msg);
      })
      .finally(() => setLoading(false));
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { setError(null); await loadAll(); }
    catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error('[ScheduleScreen] refresh ERROR:', e);
      setError('Refresh failed: ' + msg);
    }
    finally { setRefreshing(false); }
  }, [loadAll]);

  const nextSlot = useMemo(
    () => slots.find(s => minutesUntil(s.day, s.hour, nowMs) > -60) ?? null,
    [slots, nowMs],
  );

  const nextCountdown = nextSlot ? minutesUntil(nextSlot.day, nextSlot.hour, nowMs) : null;
  const nextCountdownLabel = nextCountdown == null ? '' : nextCountdown <= 0 ? 'now' : fmtCountdown(nextCountdown);

  const grouped = useMemo(() => {
    const filtered = dayFilter !== null ? slots.filter(s => s.day === dayFilter) : slots;
    const map = new Map<number, UpbeatBooked[]>();
    for (const s of filtered) {
      if (!map.has(s.day)) map.set(s.day, []);
      map.get(s.day)!.push(s);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([day, items]) => ({ day, label: DAY_LABELS[day] ?? '?', items }));
  }, [slots, dayFilter]);

  const activeDays = useMemo(
    () => Array.from(new Set(slots.map(s => s.day))).sort(),
    [slots],
  );

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={s.safeArea}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.violet} />
          <Text style={{ color: C.textFaint, fontSize: 11, fontWeight: '800', letterSpacing: 4 }}>
            LOADING SCHEDULE
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.safeArea}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.violet} />
        }
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ color: C.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 }}>
              Schedule
            </Text>
            <Text style={{ color: C.textFaint, fontSize: 11, fontWeight: '600', marginTop: 2 }}>
              {slots.length + ' slot' + (slots.length !== 1 ? 's' : '') + ' booked this week'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: rgba(C.magenta, 0.1), borderColor: rgba(C.magenta, 0.3), borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
            <FontAwesome5 name="broadcast-tower" size={10} color={C.magentaSoft} />
            <Text style={{ color: C.magentaSoft, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 }}>
              UPBEAT
            </Text>
          </View>
        </View>

        {/* Next up */}
        <View style={s.heroCard}>
          <View style={s.heroTopRow}>
            <View>
              <Text style={s.heroEyebrow}>NEXT UP</Text>
              <Text style={s.heroTitle}>{nextSlot ? nextSlot.name : 'No upcoming slot'}</Text>
              <Text style={s.heroSub}>
                {nextSlot ? fmtSlotTime(nextSlot.day, nextSlot.hour) : 'Schedule will appear when slots are booked'}
              </Text>
            </View>
            {nextSlot ? (
              <Avatar url={nextSlot.avatar} name={nextSlot.name} size={58} ring />
            ) : (
              <View style={s.heroAvatarFallback}>
                <FontAwesome5 name="broadcast-tower" size={20} color={C.violetSoft} />
              </View>
            )}
          </View>

          {nextSlot && (
            <View style={s.heroBottomRow}>
              <View style={s.heroCountdownPill}>
                <Text style={s.heroCountdownLabel}>COUNTDOWN</Text>
                <Text style={s.heroCountdownText}>{nextCountdownLabel}</Text>
              </View>
              <View style={s.heroMetaPill}>
                <Text style={s.heroMetaText}>{'W' + nextSlot.week}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Tabs */}
        <TabBar active={activeTab} onChange={t => { setActiveTab(t); setDayFilter(null); }} />

        {/* ── BOOKED TAB ── */}
        {activeTab === 'booked' && (
          <>
            <View style={s.card}>
              <Eyebrow icon="chart-bar" label="WEEKLY ACTIVITY" />
              <WeekGrid slots={slots} />
            </View>

            {slots.length > 0 && (
              <View style={s.card}>
                <Eyebrow icon="headphones" label="DJS THIS WEEK" />
                <DJRoster slots={slots} />
              </View>
            )}

            {activeDays.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
                <TouchableOpacity
                  style={[s.dayPill, dayFilter === null && s.dayPillActive]}
                  onPress={() => setDayFilter(null)}
                >
                  <Text style={[s.dayPillText, dayFilter === null && s.dayPillTextActive]}>All</Text>
                </TouchableOpacity>
                {activeDays.map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[s.dayPill, dayFilter === d && s.dayPillActive]}
                    onPress={() => setDayFilter(d === dayFilter ? null : d)}
                  >
                    <Text style={[s.dayPillText, dayFilter === d && s.dayPillTextActive]}>
                      {DAY_LABELS[d]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {grouped.length === 0 ? (
              <View style={[s.card, { alignItems: 'center', paddingVertical: 32 }]}>
                <FontAwesome5 name="calendar-times" size={28} color={C.textFaint} />
                <Text style={{ color: C.textFaint, fontSize: 13, marginTop: 12, fontWeight: '700' }}>
                  No slots found
                </Text>
              </View>
            ) : (
              grouped.map(group => (
                <View key={group.day} style={s.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={s.dayBadge}>
                      <Text style={s.dayBadgeText}>{group.label.toUpperCase()}</Text>
                    </View>
                    <Text style={{ color: C.textFaint, fontSize: 11, fontWeight: '600' }}>
                      {group.items.length + ' slot' + (group.items.length !== 1 ? 's' : '')}
                    </Text>
                  </View>
                  {group.items.map(slot => (
                    <SlotCard
                      key={slot.user_id + '-' + slot.day + '-' + slot.hour}
                      slot={slot}
                      nowMs={nowMs}
                      isNext={
                        nextSlot !== null &&
                        slot.user_id === nextSlot.user_id &&
                        slot.day === nextSlot.day &&
                        slot.hour === nextSlot.hour
                      }
                    />
                  ))}
                </View>
              ))
            )}

            {error && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <FontAwesome5 name="exclamation-circle" size={12} color={C.error} />
                <Text style={{ color: C.error, fontSize: 12, fontWeight: '700' }}>{error}</Text>
              </View>
            )}
          </>
        )}

        {/* ── RECURRING TAB ── */}
        {activeTab === 'recurring' && (
          <>
            <View style={s.card}>
              <Eyebrow icon="redo" label="RECURRING SHOWS" />
              <Text style={{ color: C.textMuted, fontSize: 12, lineHeight: 20 }}>
                The Upbeat API does not expose recurring shows directly. View the full list on the website.
              </Text>
              <TouchableOpacity
                style={[s.siteLink, { marginTop: 4 }]}
                activeOpacity={0.78}
                onPress={() => Linking.openURL('https://upbeatradio.net/v3/Radio.RecurringShows').catch(() => {})}
              >
                <FontAwesome5 name="external-link-alt" size={11} color={C.violetSoft} />
                <Text style={s.siteLinkText}>Open Recurring Shows on upbeatradio.net</Text>
              </TouchableOpacity>
            </View>

            <View style={[s.card, { alignItems: 'center', paddingVertical: 32, gap: 14 }]}>
              <FontAwesome5 name="broadcast-tower" size={32} color={C.textFaint} />
              <Text style={{ color: C.textFaint, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
                In-app recurring shows coming soon
              </Text>
              <Text style={{ color: C.textFaint, fontSize: 11, textAlign: 'center', maxWidth: 220, lineHeight: 17 }}>
                Once the Upbeat API exposes a /recurringShows endpoint this will populate automatically.
              </Text>
            </View>
          </>
        )}

        <View style={{ height: 8 }} />
      </ScrollView>

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safeArea:        { flex: 1, backgroundColor: C.bg },
  scroll:          { flex: 1 },
  content:         { padding: 14, gap: 12, paddingBottom: 120 },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, gap: 16 },
  card:            { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 16, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.24, shadowRadius: 14, elevation: 6 },
  heroCard:        { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 22, padding: 16, gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.34, shadowRadius: 20, elevation: 10 },
  heroTopRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  heroEyebrow:     { color: C.violet, fontSize: 10, fontWeight: '900', letterSpacing: 3, marginBottom: 4 },
  heroTitle:       { color: C.text, fontSize: 18, fontWeight: '900', letterSpacing: -0.3, lineHeight: 22 },
  heroSub:         { color: C.textFaint, fontSize: 11, marginTop: 4, lineHeight: 16 },
  heroAvatarFallback:{ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: rgba(C.violet, 0.18), borderWidth: 1, borderColor: rgba(C.violet, 0.35) },
  heroBottomRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heroCountdownPill:{ flex: 1, backgroundColor: rgba(C.violet, 0.14), borderWidth: 1, borderColor: rgba(C.violet, 0.34), borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  heroCountdownLabel:{ color: C.violetSoft, fontSize: 8, fontWeight: '900', letterSpacing: 2 },
  heroCountdownText:{ color: C.text, fontSize: 15, fontWeight: '900' },
  heroMetaPill:    { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  heroMetaText:    { color: C.textFaint, fontSize: 12, fontWeight: '800' },
  dayPill:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  dayPillActive:   { backgroundColor: rgba(C.violet, 0.18), borderColor: rgba(C.violet, 0.45) },
  dayPillText:     { color: C.textFaint, fontSize: 12, fontWeight: '700' },
  dayPillTextActive: { color: C.violetSoft },
  dayBadge:        { backgroundColor: rgba(C.violet, 0.18), borderWidth: 1, borderColor: rgba(C.violet, 0.4), borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  dayBadgeText:    { color: C.violetSoft, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  siteLink:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 14 },
  siteLinkText:    { color: C.violetSoft, fontSize: 12, fontWeight: '700' },
});

export default function ScheduleScreen() {
  return (
    <ErrorBoundary>
      <ScheduleScreenInner />
    </ErrorBoundary>
  );
}
