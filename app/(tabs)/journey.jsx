import { useState, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Clock3, MapPin, Navigation, PhoneCall, Play, ShieldAlert, ShieldCheck, Square, TrendingUp } from 'lucide-react-native';
import { Card, Header, Pill, Screen, SectionTitle } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { useLiveLocation, haversineDistance, estimateTravelTime, formatDistance, formatDuration } from '../../lib/location';

export default function JourneyScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors, isDark } = useTheme();
  const { location, error, tracking, startTracking, stopTracking } = useLiveLocation();
  const [destinationLabel, setDestinationLabel] = useState('');
  const [remainingKm, setRemainingKm] = useState(null);
  const [etaMin, setEtaMin] = useState(null);
  const [travelMode, setTravelMode] = useState('bus');

  useEffect(() => {
    if (!location) return;
    const dest = profile?.work_lat ? { lat: profile.work_lat, lng: profile.work_lng } : null;
    if (dest) {
      const dist = haversineDistance(location.lat, location.lng, dest.lat, dest.lng);
      setRemainingKm(dist);
      setEtaMin(estimateTravelTime(dist, travelMode));
      if (!destinationLabel) {
        setDestinationLabel(profile?.work_label || 'Your destination');
      }
    } else if (!destinationLabel) {
      setDestinationLabel('Set a destination in profile');
    }
  }, [location, profile, travelMode, destinationLabel]);

  const modes = [
    { key: 'walk', label: 'Walk' },
    { key: 'bus', label: 'Bus' },
    { key: 'auto', label: 'Auto' },
    { key: 'car', label: 'Car' },
  ];

  function handleStart() {
    if (profile?.work_lat) {
      startTracking();
    } else {
      setDestinationLabel('Set a work location in your profile first');
    }
  }

  const progressPct = remainingKm !== null && profile?.home_lat && profile?.work_lat
    ? Math.min(100, Math.max(0, 100 - (remainingKm / haversineDistance(profile.home_lat, profile.home_lng, profile.work_lat, profile.work_lng)) * 100))
    : 0;

  return (
    <Screen>
      <Header eyebrow="Journey monitoring" title="Your trip, watched over" action={tracking ? <Pill tone="teal">Active</Pill> : null} />

      {!tracking ? (
        <Card style={s.idleCard}>
          <View style={[s.idleIcon, { backgroundColor: colors.primarySoft }]}>
            <Navigation color={colors.primary} size={28} />
          </View>
          <Text style={[s.idleTitle, { color: colors.ink }]}>Start a monitored journey</Text>
          <Text style={[s.idleText, { color: colors.muted }]}>
            Track your live location, estimate arrival time, and keep your emergency contact one tap away throughout your trip.
          </Text>
          {profile?.work_label ? (
            <Text style={[s.destHint, { color: colors.primary }]}>Destination: {profile.work_label}</Text>
          ) : (
            <Text style={[s.destWarn, { color: colors.orange }]}>Add a work location in your profile to enable journey tracking</Text>
          )}
          <Pressable onPress={handleStart} style={({ pressed }) => [s.startBtn, { backgroundColor: colors.primary }, pressed && s.pressed]}>
            <Play color="#FFFFFF" size={18} />
            <Text style={s.startText}>Start journey</Text>
          </Pressable>
        </Card>
      ) : (
        <Card style={[s.hero, { backgroundColor: isDark ? '#090D14' : '#1E1B4B', borderColor: isDark ? '#1F2937' : '#312E81' }]}>
          <View style={s.liveRow}><View style={[s.liveDot, { backgroundColor: colors.primary }]} /><Text style={s.live}>LIVE MONITORING</Text></View>
          <Text style={s.destination} numberOfLines={1}>{destinationLabel}</Text>
          <Text style={s.route}>{location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'Acquiring GPS…'}</Text>

          <View style={s.progress}><View style={[s.progressFill, { width: `${progressPct}%`, backgroundColor: colors.primary }]} /></View>

          <View style={s.eta}>
            <View>
              <Text style={s.etaLabel}>Arriving in</Text>
              <Text style={s.etaValue}>{etaMin !== null ? formatDuration(etaMin) : '—'}</Text>
            </View>
            <View style={[s.score, { backgroundColor: colors.primarySoft }]}>
              <ShieldCheck color={colors.primary} size={18} />
              <Text style={[s.scoreText, { color: colors.primary }]}>91 safe</Text>
            </View>
          </View>

          <View style={s.statsRow}>
            <Stat icon={<MapPin color={colors.primary} size={15} />} label="Remaining" value={remainingKm !== null ? formatDistance(remainingKm) : '—'} />
            <Stat icon={<TrendingUp color={colors.orange} size={15} />} label="Travel mode" value={modes.find((m) => m.key === travelMode)?.label || 'Bus'} />
          </View>

          <Pressable onPress={stopTracking} style={({ pressed }) => [s.stopBtn, pressed && s.pressed]}>
            <Square color="#FFFFFF" size={16} />
            <Text style={s.stopText}>End journey</Text>
          </Pressable>
        </Card>
      )}

      {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}

      {tracking ? (
        <>
          <SectionTitle>Travel mode</SectionTitle>
          <View style={s.modeRow}>
            {modes.map((m) => (
              <Pressable key={m.key} onPress={() => setTravelMode(m.key)} style={[s.modeChip, { backgroundColor: travelMode === m.key ? colors.ink : colors.cardBg, borderColor: travelMode === m.key ? colors.ink : colors.line }]}>
                <Text style={[s.modeText, { color: travelMode === m.key ? (isDark ? '#0D1117' : '#FFFFFF') : colors.muted }]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <SectionTitle>Journey timeline</SectionTitle>
      <Card>
        <View style={s.timeline}>
          <View style={[s.timelineLine, { backgroundColor: colors.line }]} />
          <TimelineItem time="Now" title={tracking ? 'Live tracking active' : 'Journey not started'} detail={tracking && location ? `GPS accuracy ±${Math.round(location.accuracy || 0)}m` : 'Start a journey to see your timeline'} active={tracking} />
          {tracking && etaMin !== null ? <TimelineItem time={`+${formatDuration(Math.round(etaMin * 0.5))}`} title="Midpoint check" detail="Safety score reassessed automatically" /> : null}
          {tracking && etaMin !== null ? <TimelineItem time={`+${formatDuration(etaMin)}`} title={`Arrive at ${destinationLabel}`} detail="Your saved destination" /> : null}
        </View>
      </Card>

      <SectionTitle>Emergency support</SectionTitle>
      <Card>
        <Pressable style={[s.supportRow, { borderBottomColor: colors.line }]}>
          <View style={[s.supportIcon, { backgroundColor: colors.pink + '18' }]}>
            <ShieldAlert color={colors.pink} size={20} />
          </View>
          <View style={s.supportCopy}>
            <Text style={[s.supportTitle, { color: colors.ink }]}>Smart SOS</Text>
            <Text style={[s.supportText, { color: colors.muted }]}>{profile?.emergency_contact_phone ? `Share live location with ${profile.emergency_contact_name}` : 'Share route, location, and safety score instantly'}</Text>
          </View>
          <ChevronRight color={colors.muted} size={18} />
        </Pressable>
        <Pressable style={[s.supportRow, { borderBottomColor: colors.line }]}>
          <View style={[s.supportIcon, { backgroundColor: colors.primarySoft }]}>
            <PhoneCall color={colors.primary} size={20} />
          </View>
          <View style={s.supportCopy}>
            <Text style={[s.supportTitle, { color: colors.ink }]}>Call emergency services</Text>
            <Text style={[s.supportText, { color: colors.muted }]}>For immediate danger, call your local emergency number</Text>
          </View>
          <ChevronRight color={colors.muted} size={18} />
        </Pressable>
      </Card>
    </Screen>
  );
}

function Stat({ icon, label, value }) {
  return (
    <View style={s.stat}>
      {icon}
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

function TimelineItem({ time, title, detail, active }) {
  const { colors } = useTheme();
  return (
    <View style={s.item}>
      <View style={[s.timelineDot, { backgroundColor: colors.cardBg, borderColor: active ? colors.primary : colors.line }, active && { backgroundColor: colors.primary }]} />
      <View style={s.itemCopy}>
        <Text style={[s.itemTime, { color: colors.primary }]}>{time}</Text>
        <Text style={[s.itemTitle, { color: colors.ink }]}>{title}</Text>
        <Text style={[s.itemDetail, { color: colors.muted }]}>{detail}</Text>
      </View>
      <Clock3 color={colors.muted} size={15} />
    </View>
  );
}

const s = StyleSheet.create({
  idleCard: { alignItems: 'center', padding: 24, gap: 4 },
  idleIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  idleTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  idleText: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 12 },
  destHint: { fontSize: 13, fontWeight: '700', marginBottom: 16 },
  destWarn: { fontSize: 12, fontWeight: '700', marginBottom: 16 },
  startBtn: { borderRadius: 14, height: 50, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  pressed: { opacity: 0.7 },
  startText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  hero: { borderWidth: 1 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  live: { color: '#9DB0C8', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  destination: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 16, marginBottom: 4 },
  route: { color: '#AAB8CD', fontSize: 12 },
  progress: { height: 7, backgroundColor: '#344865', borderRadius: 4, marginTop: 20, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  eta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  etaLabel: { color: '#AAB8CD', fontSize: 11 },
  etaValue: { color: '#FFFFFF', fontSize: 19, fontWeight: '800', marginTop: 3 },
  score: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 8 },
  scoreText: { fontWeight: '800', fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
  stat: { flex: 1, backgroundColor: '#1B2D48', borderRadius: 14, padding: 12, gap: 3 },
  statLabel: { color: '#8D9DB5', fontSize: 10, fontWeight: '700' },
  statValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  stopBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', height: 44, borderRadius: 13, backgroundColor: '#2D4264', marginTop: 16 },
  stopText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  errorBox: { backgroundColor: '#FFF0F0', borderRadius: 12, padding: 12, marginTop: 16 },
  errorText: { color: '#C24141', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  modeChip: { flex: 1, paddingVertical: 10, borderRadius: 13, borderWidth: 1, alignItems: 'center' },
  modeText: { fontWeight: '700', fontSize: 12 },
  timeline: { paddingLeft: 4 },
  timelineLine: { position: 'absolute', left: 13, top: 13, bottom: 22, width: 2 },
  item: { flexDirection: 'row', alignItems: 'flex-start', paddingBottom: 22 },
  timelineDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 4, marginRight: 13, zIndex: 1 },
  itemCopy: { flex: 1 },
  itemTime: { fontSize: 11, fontWeight: '800', marginBottom: 3 },
  itemTitle: { fontSize: 14, fontWeight: '800' },
  itemDetail: { fontSize: 12, marginTop: 4 },
  supportRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1 },
  supportIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  supportCopy: { flex: 1 },
  supportTitle: { fontWeight: '800', fontSize: 14, marginBottom: 4 },
  supportText: { fontSize: 12, lineHeight: 17 },
});
