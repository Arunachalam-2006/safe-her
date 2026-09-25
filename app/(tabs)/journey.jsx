import { useState, useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertTriangle, ChevronUp, ChevronDown, MapPin,
  Navigation, PhoneCall, Share2, ShieldAlert,
  ShieldCheck, Square, Star,
} from 'lucide-react-native';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { useLiveLocation, haversineDistance, formatDistance, formatDuration } from '../../lib/location';
import { useJourney } from '../../lib/journey';
import { saveJourney, rateJourney } from '../../lib/journeyApi';
import { SOS_STATUS, useSOS } from '../../lib/sos';
import NavigationMap from '../../components/NavigationMap';

/* ═══════════════════════════════════════════════════════════
   Colour helpers
═══════════════════════════════════════════════════════════ */
const RISK_COLOR = {
  LOW: '#34A853',
  MODERATE: '#FBBC04',
  HIGH: '#EA4335',
};
const riskColor = (level) => RISK_COLOR[level] ?? '#4285F4';
const riskBg = (level) =>
  ({ LOW: '#E6F4EA', MODERATE: '#FEF7E0', HIGH: '#FCE8E6' })[level] ?? '#EAF0FD';

/* ═══════════════════════════════════════════════════════════
   Main screen
═══════════════════════════════════════════════════════════ */
export default function JourneyScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { location, error: locError, tracking, startTracking, stopTracking } = useLiveLocation();
  const { activeJourney, setActiveJourney, updateCurrentSegment, clearJourney } = useJourney();
  const { status: sosStatus, requestSOS } = useSOS();

  const [remainingKm, setRemainingKm] = useState(null);
  const [etaMin, setEtaMin] = useState(null);
  const [travelledIdx, setTravelledIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rating, setRating] = useState(null);
  const drawerAnim = useRef(new Animated.Value(0)).current;

  /* Start live-location tracking when journey becomes active */
  useEffect(() => {
    if (activeJourney.status === 'active' && !tracking) startTracking();
  }, [activeJourney.status]);

  /* Update remaining distance / ETA every time GPS updates */
  useEffect(() => {
    if (!location || activeJourney.status !== 'active') return;
    const geom = activeJourney.routeGeometry ?? [];
    if (!geom.length) return;

    /* Find nearest point on route */
    let minDist = Infinity;
    let closest = 0;
    geom.forEach((pt, i) => {
      const d = haversineDistance(location.lat, location.lng, pt[0], pt[1]);
      if (d < minDist) { minDist = d; closest = i; }
    });

    setTravelledIdx(closest);

    /* Remaining distance */
    let rem = 0;
    for (let i = closest; i < geom.length - 1; i++) {
      rem += haversineDistance(geom[i][0], geom[i][1], geom[i + 1][0], geom[i + 1][1]);
    }
    setRemainingKm(rem);
    setEtaMin(Math.max(1, Math.round((rem / 40) * 60)));

    /* Current safety segment */
    const segs = activeJourney.segments ?? [];
    let minSeg = Infinity, closestSeg = 0;
    segs.forEach((seg, idx) => {
      const d = haversineDistance(location.lat, location.lng, seg.lat, seg.lng);
      if (d < minSeg) { minSeg = d; closestSeg = idx; }
    });
    if (closestSeg !== activeJourney.currentSegmentIndex) updateCurrentSegment(closestSeg);
  }, [location, activeJourney.status]);

  /* Animated slide for bottom drawer */
  useEffect(() => {
    Animated.spring(drawerAnim, {
      toValue: drawerOpen ? 1 : 0,
      useNativeDriver: false,
      tension: 60,
      friction: 10,
    }).start();
  }, [drawerOpen]);

  /* ── Handlers ── */
  async function handleEndJourney() {
    stopTracking();
    setSaving(true);
    const result = await saveJourney({
      origin: activeJourney.origin,
      destination: activeJourney.destination,
      safetyScore: activeJourney.safetyScore,
      riskLevel: activeJourney.riskLevel,
      segments: activeJourney.segments,
      features: activeJourney.features,
      startedAt: activeJourney.startedAt,
      completedAt: new Date().toISOString(),
    });
    setSavedOffline(result.offline);
    setActiveJourney({ status: 'completed', journeyId: result.journeyId });
    setSaving(false);
  }

  async function handleRateAndFinish(r) {
    if (activeJourney.journeyId && r !== null) {
      await rateJourney(activeJourney.journeyId, r);
    }
    setSavedOffline(false);
    clearJourney();
  }

  function handleSOS() {
    if (sosStatus !== SOS_STATUS.ACTIVE && sosStatus !== SOS_STATUS.ACTIVATING) {
      requestSOS();
    }
  }

  const status = activeJourney.status;
  const segSafety = activeJourney.segments?.[activeJourney.currentSegmentIndex];

  /* ══════════════════ IDLE STATE ══════════════════ */
  if (status === 'idle') {
    return (
      <View style={[s.idleRoot, { backgroundColor: colors.pageBg }]}>
        <View style={[s.idleCard, { backgroundColor: colors.cardBg }]}>
          <View style={[s.idleIconWrap, { backgroundColor: '#EAF0FD' }]}>
            <Navigation color="#4285F4" size={32} />
          </View>
          <Text style={[s.idleTitle, { color: colors.ink }]}>Start a journey</Text>
          <Text style={[s.idleBody, { color: colors.muted }]}>
            Plan a safe route first, then tap Start Journey to begin navigation.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/routes')}
            style={({ pressed }) => [s.primaryBtn, { backgroundColor: '#4285F4' }, pressed && s.pressed]}
          >
            <MapPin color="#fff" size={16} />
            <Text style={s.primaryBtnText}>Plan a route</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  /* ══════════════════ COMPLETED STATE ══════════════════ */
  if (status === 'completed') {
    return (
      <View style={[s.idleRoot, { backgroundColor: colors.pageBg }]}>
        <View style={[s.idleCard, { backgroundColor: colors.cardBg }]}>
          <View style={[s.idleIconWrap, { backgroundColor: '#E6F4EA' }]}>
            <ShieldCheck color="#34A853" size={32} />
          </View>
          <Text style={[s.idleTitle, { color: colors.ink }]}>Journey complete!</Text>
          <Text style={[s.completedSub, { color: colors.muted }]}>
            {activeJourney.distanceKm?.toFixed(1) ?? '0'} km ·{' '}
            {activeJourney.durationMin ?? '0'} min ·{' '}
            Safety score {activeJourney.safetyScore}/100
          </Text>
          {savedOffline ? (
            <Text style={[s.completedSub, { color: '#EA4335', fontSize: 12 }]}>
              {"Saved on your device — it will sync when you're back online."}
            </Text>
          ) : null}
          {/* Star rating */}
          <Text style={[s.rateTitle, { color: colors.ink }]}>How safe did you feel?</Text>
          <View style={s.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} style={s.starBtn}>
                <Star
                  size={28}
                  fill={rating >= n ? '#FBBC04' : 'none'}
                  color={rating >= n ? '#FBBC04' : colors.line}
                />
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => handleRateAndFinish(rating)}
            style={({ pressed }) => [s.primaryBtn, { backgroundColor: '#4285F4' }, pressed && s.pressed]}
          >
            <Text style={s.primaryBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  /* ══════════════════ ACTIVE NAVIGATION STATE ══════════════════ */
  const progressPct = (() => {
    const total = activeJourney.distanceKm ?? 0;
    const rem = remainingKm ?? total;
    return total > 0 ? Math.min(100, Math.max(0, ((total - rem) / total) * 100)) : 0;
  })();

  const drawerHeight = drawerAnim.interpolate({ inputRange: [0, 1], outputRange: [180, 340] });

  return (
    <View style={s.navRoot}>
      {/* ── FULL-SCREEN MAP ── */}
      <View style={s.mapFill}>
        <NavigationMap
          routeCoords={activeJourney.routeGeometry ?? activeJourney.routeCoordinates ?? []}
          travelledIdx={travelledIdx}
          liveLocation={location}
          destination={activeJourney.destination}
          height="100%"
        />
      </View>

      {/* ── TOP HUD: ETA + speed bar ── */}
      <View style={[s.topHud, { backgroundColor: isDark ? 'rgba(26,31,46,0.92)' : 'rgba(255,255,255,0.92)' }]}>
        <View style={s.topHudLeft}>
          <Text style={[s.etaMin, { color: colors.ink }]}>
            {etaMin !== null ? etaMin : '--'}
          </Text>
          <Text style={[s.etaUnit, { color: colors.muted }]}>min</Text>
        </View>
        <View style={s.topHudMid}>
          <View style={[s.progressTrack, { backgroundColor: colors.line }]}>
            <View style={[s.progressFill, { width: `${progressPct}%`, backgroundColor: '#4285F4' }]} />
          </View>
          <Text style={[s.remainingLabel, { color: colors.muted }]}>
            {remainingKm !== null ? formatDistance(remainingKm) : '...'} remaining
          </Text>
        </View>
        <View style={s.topHudRight}>
          <View style={[s.safetyBadge, { backgroundColor: riskBg(activeJourney.riskLevel) }]}>
            <ShieldCheck size={13} color={riskColor(activeJourney.riskLevel)} />
            <Text style={[s.safetyScore, { color: riskColor(activeJourney.riskLevel) }]}>
              {activeJourney.safetyScore}
            </Text>
          </View>
        </View>
      </View>

      {/* ── SEGMENT SAFETY BANNER (current segment risk) ── */}
      {segSafety && segSafety.risk_level !== 'LOW' ? (
        <View style={[s.alertBanner, { backgroundColor: riskBg(segSafety.risk_level) }]}>
          <AlertTriangle size={14} color={riskColor(segSafety.risk_level)} />
          <Text style={[s.alertText, { color: riskColor(segSafety.risk_level) }]}>
            Caution — {segSafety.risk_level.toLowerCase()} risk zone ahead (score {segSafety.score}/100)
          </Text>
        </View>
      ) : null}

      {/* ── BOTTOM DRAWER ── */}
      <Animated.View style={[s.bottomDrawer, { height: drawerHeight, backgroundColor: isDark ? '#1E2436' : '#fff' }]}>
        {/* drag handle + toggle */}
        <Pressable style={s.drawerHandle} onPress={() => setDrawerOpen((v) => !v)}>
          <View style={[s.handleBar, { backgroundColor: colors.line }]} />
          {drawerOpen
            ? <ChevronDown size={16} color={colors.muted} />
            : <ChevronUp size={16} color={colors.muted} />}
        </Pressable>

        {/* Destination label */}
        <View style={s.destRow}>
          <View style={[s.destDot, { backgroundColor: '#E83D83' }]} />
          <View style={{ flex: 1 }}>
            <Text style={[s.destLabel, { color: colors.muted }]} numberOfLines={1}>Heading to</Text>
            <Text style={[s.destName, { color: colors.ink }]} numberOfLines={1}>
              {activeJourney.destination?.label ?? 'Destination'}
            </Text>
          </View>
          <Text style={[s.distText, { color: colors.muted }]}>
            {activeJourney.distanceKm ? formatDistance(activeJourney.distanceKm) : ''}
          </Text>
        </View>

        {/* Expanded: segment list */}
        {drawerOpen && (
          <View style={s.segList}>
            <Text style={[s.segTitle, { color: colors.muted }]}>Route Segments</Text>
            {(activeJourney.segments ?? []).slice(0, 5).map((seg, idx) => {
              const isCurrent = seg.segment_id === activeJourney.currentSegmentIndex;
              const isDone = seg.segment_id < activeJourney.currentSegmentIndex;
              return (
                <View key={idx} style={[s.segRow, isCurrent && { backgroundColor: riskBg(seg.risk_level) + '80' }]}>
                  <View style={[s.segDot, { backgroundColor: isDone ? colors.line : riskColor(seg.risk_level) }]} />
                  <Text style={[s.segText, { color: isCurrent ? riskColor(seg.risk_level) : colors.muted }]}>
                    Segment {idx + 1} · {seg.risk_level ?? 'OK'} · {seg.score ?? '—'}/100
                    {isCurrent ? '  ← You are here' : isDone ? '  ✓' : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Action buttons */}
        <View style={s.actionRow}>
          <Pressable
            onPress={handleSOS}
            style={({ pressed }) => [s.actionBtn, { backgroundColor: sosStatus === SOS_STATUS.ACTIVE ? '#C1121F' : '#EA4335' }, pressed && s.pressed]}
          >
            <ShieldAlert color="#fff" size={18} />
            <Text style={s.actionBtnText}>
              {sosStatus === SOS_STATUS.ACTIVE ? 'SOS ON' : 'SOS'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              const url = location
                ? `https://maps.google.com/?q=${location.lat},${location.lng}`
                : '';
              if (url && Platform.OS === 'web') navigator.clipboard?.writeText(url);
            }}
            style={({ pressed }) => [s.actionBtn, { backgroundColor: '#4285F4' }, pressed && s.pressed]}
          >
            <Share2 color="#fff" size={18} />
            <Text style={s.actionBtnText}>Share</Text>
          </Pressable>

          <Pressable
            onPress={handleEndJourney}
            style={({ pressed }) => [s.actionBtn, { backgroundColor: '#202124' }, pressed && s.pressed]}
          >
            <Square color="#fff" size={18} />
            <Text style={s.actionBtnText}>{saving ? 'Ending…' : 'End'}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════
   Styles
═══════════════════════════════════════════════════════════ */
const s = StyleSheet.create({
  /* ── Idle / Completed ── */
  idleRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  idleCard: { borderRadius: 24, padding: 28, alignItems: 'center', gap: 10, width: '100%', maxWidth: 400, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20, elevation: 4 },
  idleIconWrap: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  idleTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  idleBody: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 8 },
  completedSub: { fontSize: 13, textAlign: 'center', marginBottom: 4 },
  rateTitle: { fontSize: 14, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  starsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  starBtn: { padding: 4 },
  primaryBtn: { borderRadius: 14, height: 48, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, width: '100%' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  pressed: { opacity: 0.72 },

  /* ── Navigation layout ── */
  navRoot: { flex: 1, position: 'relative' },
  mapFill: { ...StyleSheet.absoluteFillObject },

  /* ── Top HUD ── */
  topHud: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14,
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 8,
  },
  topHudLeft: { alignItems: 'center', minWidth: 44 },
  etaMin: { fontSize: 26, fontWeight: '800', lineHeight: 28 },
  etaUnit: { fontSize: 11, fontWeight: '500', marginTop: -2 },
  topHudMid: { flex: 1, gap: 5 },
  progressTrack: { height: 5, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  remainingLabel: { fontSize: 11, fontWeight: '500' },
  topHudRight: {},
  safetyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20 },
  safetyScore: { fontSize: 13, fontWeight: '700' },

  /* ── Alert banner ── */
  alertBanner: {
    position: 'absolute', top: 118, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 10, borderRadius: 12,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  alertText: { fontSize: 12, fontWeight: '600', flex: 1 },

  /* ── Bottom drawer ── */
  bottomDrawer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 28,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, elevation: 12,
    overflow: 'hidden',
  },
  drawerHandle: { alignItems: 'center', paddingVertical: 10, gap: 2 },
  handleBar: { width: 36, height: 4, borderRadius: 2 },

  destRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  destDot: { width: 14, height: 14, borderRadius: 7 },
  destLabel: { fontSize: 10, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.6 },
  destName: { fontSize: 15, fontWeight: '700' },
  distText: { fontSize: 12, fontWeight: '500' },

  /* segment list */
  segList: { gap: 6, marginBottom: 12 },
  segTitle: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 4 },
  segRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, padding: 4 },
  segDot: { width: 8, height: 8, borderRadius: 4 },
  segText: { fontSize: 12, fontWeight: '500', flex: 1 },

  /* action row */
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderRadius: 16 },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
