import { useState, useEffect, useRef } from 'react';
import { Link } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Bell,
  ChevronRight,
  CircleAlert,
  MapPin,
  ShieldAlert,
  Compass,
  X,
  Radio,
  Sun,
  Moon,
  ShieldCheck,
  Building2,
  Phone,
  BellOff,
  WifiOff,
  Lightbulb,
} from 'lucide-react-native';
import { SafetyScore } from '../../components/safetyScore';
import { ActionRow, Card, Header, Screen, SectionTitle } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { useLocation, reverseGeocode, formatDistance } from '../../lib/location';
import { fetchSpotSafety, fetchSafeHubs } from '../../lib/safetyApi';
import {
  offlineSpotFallback,
  offlineHubsFallback,
} from '../../lib/safetyFallbacks';
import { useNotifications } from '../../lib/notifications';
import { SOS_STATUS, useSOS } from '../../lib/sos';

export default function HomeScreen() {
  const { profile } = useAuth();
  const { colors, isDark } = useTheme();
  const { status: sosStatus, contactCount, requestSOS } = useSOS();
  const firstName = (profile?.full_name || 'there').split(' ')[0];
  const emergencyName = profile?.emergency_contact_name;
  const emergencyPhone = profile?.emergency_contact_phone;
  const emergencyDisplay = profile?.emergency_contact_name
    ? `${profile.emergency_contact_name}${profile.emergency_contact_phone ? ` (${profile.emergency_contact_phone})` : ''}`
    : null;
  const [currentArea, setCurrentArea] = useState('Locating...');
  const { location, error: locationError, loading: locating, requestLocation } = useLocation();
  const [locationRequested, setLocationRequested] = useState(false);
  
  const [showNotifications, setShowNotifications] = useState(false);

  // Time & Safety Context
  const currentHour = new Date().getHours();
  const isNightTime = currentHour >= 18 || currentHour < 6;
  const timeGreeting = currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening';
  const greeting = `${timeGreeting}, ${firstName}`;
  
  // ── REAL Safety Score State ──────────────────────────────────────────
  const [safetyData, setSafetyData] = useState(null);
  const [safetyLoading, setSafetyLoading] = useState(true);
  const [hubsData, setHubsData] = useState(null);
  const [hubsLoading, setHubsLoading] = useState(true);
  const lastFetchedRef = useRef(null); // prevent duplicate fetches for same location

  // Fallbacks come from one place (lib/safetyFallbacks.js) so the Home screen,
  // the Routes screen and the scoring component can never disagree again.
  const offline = offlineSpotFallback();
  const safetyScore = safetyData?.score ?? offline.score;
  const safetyLabel = safetyData?.label ?? offline.label;
  const safetyFactors = safetyData?.factors ?? null;
  const safetyConfidence = safetyData?.confidence ?? null;
  const isOffline = safetyData?._offline === true || safetyData == null;
  // The engine flags partial data (Overpass/weather outage) separately from a
  // total failure. Both mean "do not present this as a confident measurement".
  const isDegraded = safetyData?._degraded === true || safetyData?.degraded === true;

  // ── Real "safety around you" data derived from OSM hubs + spot analysis ──
  // `counts` is null (not all-zero) when the hubs call failed, so `??` is safe
  // here: a real 0 police count still renders as 0 because we null-check the
  // parent object rather than the number.
  const nearestHub = hubsData?.nearest ?? null;
  const hubsCounts = hubsData?.counts ?? null;
  const policeCount = hubsCounts ? hubsCounts.police : null;
  const streetLamps = hubsCounts
    ? hubsCounts.street_lamps
    : (safetyData?.details?.street_lamps ?? null);
  const lightingPct = safetyFactors?.lighting ?? null;
  const hubsOffline = hubsData?._offline === true || hubsData == null;

  // ── Real notifications + unread state ────────────────────────────────
  const { notifications, unreadCount, markAllRead } = useNotifications(safetyData, location);

  function openNotifications() {
    setShowNotifications(true);
    markAllRead();
  }

  useEffect(() => {
    requestLocation().finally(() => setLocationRequested(true));
  }, [requestLocation]);

  useEffect(() => {
    if (location) {
      // Previously `.then()` with no `.catch()`: any rejection here was
      // unhandled, and the "Locating..." label never cleared.
      let cancelled = false;
      reverseGeocode(location.lat, location.lng)
        .then((name) => {
          if (cancelled) return;
          setCurrentArea(
            typeof name === 'string' && name.trim()
              ? name.split(',')[0] || 'Current area'
              : 'Current area',
          );
        })
        .catch(() => {
          if (!cancelled) setCurrentArea('Current area');
        });
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [location]);

  // ── Fetch spot safety when location becomes available ───────────────
  useEffect(() => {
    if (!location) return;

    // Deduplicate: don't re-fetch if coords haven't meaningfully changed
    const coordKey = `${location.lat.toFixed(3)},${location.lng.toFixed(3)}`;
    if (lastFetchedRef.current === coordKey) return;
    lastFetchedRef.current = coordKey;

    setSafetyLoading(true);
    fetchSpotSafety(location.lat, location.lng)
      .then((result) => {
        setSafetyData(result);
      })
      .catch((err) => {
        console.warn('Spot safety fetch failed:', err.message);
        setSafetyData(offlineSpotFallback());
      })
      .finally(() => {
        setSafetyLoading(false);
      });

    setHubsLoading(true);
    fetchSafeHubs(location.lat, location.lng)
      .then((result) => {
        setHubsData(result);
      })
      .catch(() => {
        setHubsData(offlineHubsFallback());
      })
      .finally(() => {
        setHubsLoading(false);
      });
  }, [location]);

  // If location permission was denied (or the fix never arrived) the effect
  // above returns early, so its .finally() never ran and BOTH spinners stayed
  // true forever: the card read "Analyzing area..." indefinitely with no error
  // and no timeout. Bail out explicitly once the request has settled.
  useEffect(() => {
    if (location || !locationRequested) return undefined;
    setSafetyLoading(false);
    setHubsLoading(false);
    setCurrentArea('Location unavailable');
    return undefined;
  }, [location, locationRequested]);

  return (
    <Screen>
      {/* Header with Time-Aware Greeting & Notification Bell */}
      <View style={styles.topBar}>
        <View>
          <View style={styles.modePillWrap}>
            {isNightTime ? (
              <View style={[styles.modeBadge, { backgroundColor: isDark ? '#1C2D37' : '#3A2E59' }]}>
                <Moon color={isDark ? colors.primary : '#E0C3FC'} size={12} />
                <Text style={[styles.modeText, { color: isDark ? colors.primary : '#E0C3FC' }]}>Night Mode Active</Text>
              </View>
            ) : (
              <View style={[styles.modeBadge, { backgroundColor: colors.primarySoft }]}>
                <Sun color={colors.primary} size={12} />
                <Text style={[styles.modeText, { color: colors.primary }]}>Daylight Monitoring</Text>
              </View>
            )}
          </View>
          <Text style={[styles.greetingTitle, { color: colors.ink }]}>{greeting}</Text>
        </View>
        
        <Pressable
          onPress={openNotifications}
          style={[
            styles.bellBtn,
            { backgroundColor: colors.cardBg, borderColor: colors.line }
          ]}
        >
          <Bell color={colors.ink} size={20} />
          {unreadCount > 0 ? (
            <View style={[styles.bellCountBadge, { backgroundColor: colors.pink, borderColor: colors.cardBg }]}>
              <Text style={styles.bellCountText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      
      {/* Live Safety Score Card */}
      <SafetyScore
        score={safetyScore}
        label={safetyLabel}
        factors={safetyFactors}
        confidence={safetyConfidence}
        loading={safetyLoading && !safetyData}
        offline={isOffline}
        degraded={isDegraded}
      />

      {locationError ? (
        <View style={[styles.locError, { backgroundColor: colors.safetyCardBg ?? colors.cardBg, borderColor: colors.line }]}>
          <CircleAlert color={colors.orange} size={16} />
          <Text style={[styles.locErrorText, { color: colors.ink }]}>{locationError}</Text>
        </View>
      ) : null}
      
      {/* Smart Emergency SOS Trigger Card */}
      <View style={styles.sosWrap}>
        <Pressable
          onPress={() => {
            if (sosStatus !== SOS_STATUS.ACTIVE && sosStatus !== SOS_STATUS.ACTIVATING) {
              requestSOS();
            }
          }}
          style={({ pressed }) => [
            styles.sos, 
            { backgroundColor: colors.sosBg, borderColor: colors.sosBorder },
            pressed && styles.pressed, 
            (sosStatus === SOS_STATUS.ACTIVE || sosStatus === SOS_STATUS.ACTIVATING) && styles.sosTriggered,
          ]}
        >
          <View style={styles.sosIcon}>
            <ShieldAlert color="#FFFFFF" size={26} />
          </View>
          <View style={styles.sosCopy}>
            <View style={styles.sosHeaderRow}>
              <Text style={styles.sosTitle}>
                {sosStatus === SOS_STATUS.ACTIVE ? '🚨 SOS Emergency Active' :
                 sosStatus === SOS_STATUS.ACTIVATING ? 'Preparing SOS…' :
                 'Need Emergency Help?'}
              </Text>
              <View style={styles.livePulse}>
                {sosStatus === SOS_STATUS.ACTIVE ? (
                  <><Radio color="#FFFFFF" size={12} /><Text style={styles.liveText}>ON</Text></>
                ) : (
                  <><ShieldAlert color="#FFFFFF" size={12} /><Text style={styles.liveText}>TAP</Text></>
                )}
              </View>
            </View>
            <Text style={styles.sosSub}>
              {sosStatus === SOS_STATUS.ACTIVE
                ? 'Emergency session running. Open SOS panel to share alert and stop tracking.'
                : sosStatus === SOS_STATUS.ACTIVATING
                ? 'Requesting location and starting tracking…'
                : 'Tap to start Smart SOS. You can cancel during the 3-second countdown.'}
            </Text>
            
            <View style={styles.emergencyChip}>
              <Phone color="#FFE7F0" size={11} />
              <Text style={styles.emergencyChipText}>
                {contactCount > 0
                  ? `${contactCount} emergency contact${contactCount === 1 ? '' : 's'} ready`
                  : emergencyDisplay
                  ? `Profile contact: ${emergencyDisplay}`
                  : '⚠ Add emergency contacts to get started'}
              </Text>
            </View>
          </View>
          <ChevronRight color="#FFFFFF" size={20} />
        </Pressable>
      </View>
      
      {/* Your Safety Around You */}
      <SectionTitle>Your safety around you</SectionTitle>

      <Card>
        <ActionRow
          icon={<MapPin color={colors.teal} size={20} />}
          title={`Current area · ${currentArea}`}
          subtitle={
            hubsLoading && !hubsData
              ? 'Finding nearby safe hubs…'
              : nearestHub
              ? `Nearest safe hub: ${nearestHub.name} (${formatDistance((nearestHub.distance_m ?? 0) / 1000)})`
              : hubsOffline
              ? 'Nearby safe hubs unavailable — check your connection'
              : 'No mapped safe hubs found nearby'
          }
          accent={colors.teal}
        />
        <ActionRow
          icon={<Lightbulb color={colors.blue} size={20} />}
          title="Community safety status"
          subtitle={
            hubsLoading && safetyLoading && !hubsData
              ? 'Analysing streetlights & services…'
              : [
                  // `policeCount` is null (not 0) when the hubs call failed, so
                  // a failed lookup can no longer print "0 police stations
                  // nearby" as though it had measured zero.
                  policeCount != null
                    ? `${policeCount} police station${policeCount === 1 ? '' : 's'} nearby`
                    : null,
                  lightingPct != null
                    ? `lighting ${lightingPct}%${streetLamps != null ? ` (${streetLamps} lamps)` : ''}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Live infrastructure data unavailable'
          }
          accent={colors.blue}
        />
      </Card>
      
      {/* Expanded 4-Tile Quick Actions Grid */}
      <SectionTitle>Quick safety actions</SectionTitle>
      
      <View style={styles.grid2x2}>
        <Link href="/routes" asChild>
          <Pressable style={StyleSheet.flatten([styles.quickCard, { backgroundColor: colors.cardBg, borderColor: colors.line }])}>
            <View style={[styles.quickIconBg, { backgroundColor: colors.primarySoft }]}>
              <Compass color={colors.primary} size={22} />
            </View>
            <View>
              <Text style={[styles.quickCardTitle, { color: colors.ink }]}>Plan Safe Route</Text>
              <Text style={[styles.quickCardSub, { color: colors.muted }]}>AI illuminated paths</Text>
            </View>
          </Pressable>
        </Link>
        
        <Link href="/report" asChild>
          <Pressable style={StyleSheet.flatten([styles.quickCard, { backgroundColor: colors.cardBg, borderColor: colors.line }])}>
            <View style={[styles.quickIconBg, { backgroundColor: isDark ? '#4C1D24' : '#FFE8F0' }]}>
              <CircleAlert color={colors.pink} size={22} />
            </View>
            <View>
              <Text style={[styles.quickCardTitle, { color: colors.ink }]}>Report Hazard</Text>
              <Text style={[styles.quickCardSub, { color: colors.muted }]}>Lighting or issues</Text>
            </View>
          </Pressable>
        </Link>

        <Link href="/journey" asChild>
          <Pressable style={StyleSheet.flatten([styles.quickCard, { backgroundColor: colors.cardBg, borderColor: colors.line }])}>
            <View style={[styles.quickIconBg, { backgroundColor: isDark ? '#1E3A5F' : '#E8F0FE' }]}>
              <ShieldCheck color={colors.blue} size={22} />
            </View>
            <View>
              <Text style={[styles.quickCardTitle, { color: colors.ink }]}>Companion Escort</Text>
              <Text style={[styles.quickCardSub, { color: colors.muted }]}>Share live journey</Text>
            </View>
          </Pressable>
        </Link>

        <Link href="/routes" asChild>
          <Pressable style={StyleSheet.flatten([styles.quickCard, { backgroundColor: colors.cardBg, borderColor: colors.line }])}>
            <View style={[styles.quickIconBg, { backgroundColor: isDark ? '#3D2810' : '#FEF3E2' }]}>
              <Building2 color={colors.orange} size={22} />
            </View>
            <View>
              <Text style={[styles.quickCardTitle, { color: colors.ink }]}>Nearby Safe Hubs</Text>
              <Text style={[styles.quickCardSub, { color: colors.muted }]}>Police & 24/7 shops</Text>
            </View>
          </Pressable>
        </Link>
      </View>

      {/* Notifications Drawer Modal */}
      <Modal visible={showNotifications} animationType="slide" transparent={true} onRequestClose={() => setShowNotifications(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.cardBg }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.line }]}>
              <View style={styles.modalHeaderTitleRow}>
                <Bell color={colors.ink} size={20} />
                <Text style={[styles.modalTitle, { color: colors.ink }]}>Safety Alerts & Updates</Text>
              </View>
              <Pressable onPress={() => setShowNotifications(false)} style={[styles.closeBtn, { backgroundColor: colors.paper }]}>
                <X color={colors.ink} size={18} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBody}>
              {notifications.length === 0 ? (
                <View style={styles.notifEmpty}>
                  <View style={[styles.notifIcon, { backgroundColor: colors.paper }]}>
                    <BellOff color={colors.muted} size={20} />
                  </View>
                  <Text style={[styles.notifEmptyTitle, { color: colors.ink }]}>{"You're all caught up"}</Text>
                  <Text style={[styles.notifEmptyText, { color: colors.muted }]}>
                    Safety updates and nearby community reports will appear here.
                  </Text>
                </View>
              ) : (
                notifications.map((n) => {
                  const iconTint =
                    n.kind === 'community' ? colors.pink
                    : n.kind === 'lighting' ? colors.orange
                    : n.kind === 'offline' ? colors.muted
                    : colors.primary;
                  const iconBg =
                    n.kind === 'community' ? (isDark ? '#4C1D24' : '#FFE8F0')
                    : n.kind === 'lighting' ? (isDark ? '#3D2810' : '#FEF3E2')
                    : n.kind === 'offline' ? colors.paper
                    : colors.primarySoft;
                  const Icon =
                    n.kind === 'community' ? ShieldAlert
                    : n.kind === 'lighting' ? Sun
                    : n.kind === 'offline' ? WifiOff
                    : ShieldCheck;
                  return (
                    <View key={n.id} style={[styles.notifItem, { borderBottomColor: colors.line }]}>
                      <View style={[styles.notifIcon, { backgroundColor: iconBg }]}>
                        <Icon color={iconTint} size={18} />
                      </View>
                      <View style={styles.notifContent}>
                        <Text style={[styles.notifTitle, { color: colors.ink }]}>{n.title}</Text>
                        <Text style={[styles.notifDesc, { color: colors.muted }]}>{n.desc}</Text>
                        <Text style={[styles.notifTime, { color: colors.muted }]}>
                          {n.timeLabel}{n.pending ? ' · not yet synced' : ''}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  modePillWrap: { marginBottom: 6 },
  modeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, alignSelf: 'flex-start' },
  modeText: { fontSize: 11, fontWeight: '700' },
  greetingTitle: { fontSize: 26, lineHeight: 32, fontWeight: '800' },
  bellBtn: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  bellCountBadge: { minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, position: 'absolute', top: 6, right: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  bellCountText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  sosWrap: { marginVertical: 8 },
  sos: { borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 20, borderWidth: 1 },
  sosTriggered: { opacity: 0.9 },
  pressed: { opacity: 0.8 },
  sosIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#FFFFFF26', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  sosCopy: { flex: 1 },
  sosHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sosTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  livePulse: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFFFFF33', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  liveText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  sosSub: { color: '#FFE7F0', fontSize: 12, lineHeight: 17, marginBottom: 8 },
  emergencyChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF1F', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  emergencyChipText: { color: '#FFF0F5', fontSize: 10, fontWeight: '700' },
  seeAll: { fontSize: 12, fontWeight: '700' },
  grid2x2: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4, marginBottom: 20 },
  quickCard: { width: '48%', borderWidth: 1, borderRadius: 18, padding: 14, height: 110, justifyContent: 'space-between' },
  quickIconBg: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickCardTitle: { fontSize: 13, fontWeight: '800' },
  quickCardSub: { fontSize: 11, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1 },
  modalHeaderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modalBody: { paddingVertical: 4 },
  notifItem: { flexDirection: 'row', gap: 14, marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1 },
  notifIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: '700' },
  notifDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  notifTime: { fontSize: 10, marginTop: 4, fontWeight: '600' },
  notifEmpty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  notifEmptyTitle: { fontSize: 15, fontWeight: '800' },
  notifEmptyText: { fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },
  locError: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 10 },
  locErrorText: { fontSize: 12, flex: 1, lineHeight: 17 },
});
