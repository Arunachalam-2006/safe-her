import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, Linking, Platform } from 'react-native';
import {
  ShieldAlert, MapPin, Clock, UsersRound, Share2, StopCircle, X, AlertTriangle, CheckCircle2, XCircle,
  Info, Send, ChevronRight, Wifi, Map as MapIcon,
} from 'lucide-react-native';
import { useTheme } from '../lib/theme';
import { LOCATION_STATUS, SOS_STATUS, TRACKING_STATUS, useSOS } from '../lib/sos';
import { buildMapsLink, generateEmergencyMessage } from '../lib/emergencyMessage';
import { sendEmergencySMS, shareEmergencyAlert, SHARE_RESULT } from '../lib/alertSharing';
import { getLatestTrackedLocation } from '../lib/backgroundLocationTask';
import { Pill } from '../components/ui';

function formatClock(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return '—'; }
}

function formatElapsed(start) {
  if (!start) return '0s';
  const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
  if (diff < 60) return `${diff}s`;
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${m}m ${s}s`;
}

export default function SOSActiveScreen() {
  const { colors, isDark } = useTheme();
  const {
    status, sessionId, startedAt, location, locationStatus, locationUpdatedAt,
    trackingStatus, contactCount, contacts, shareStatus, error,
    stopSOS, dismissStopped, setShareStatus,
  } = useSOS();
  const [, setTick] = useState(0);
  const [bgLocation, setBgLocation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);

  useEffect(() => {
    if (status !== SOS_STATUS.ACTIVE) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (status !== SOS_STATUS.ACTIVE) return;
    let cancelled = false;
    (async () => {
      const rec = await getLatestTrackedLocation();
      if (!cancelled && rec) setBgLocation(rec);
    })();
    const id = setInterval(async () => {
      const rec = await getLatestTrackedLocation();
      if (!cancelled && rec) setBgLocation(rec);
    }, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [status]);

  const effectiveLocation = useMemo(() => {
    const candidates = [location, bgLocation].filter(Boolean);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return candidates[0];
  }, [location, bgLocation]);

  const effectiveUpdatedAt = effectiveLocation?.timestamp || locationUpdatedAt || startedAt;
  const mapsUrl = buildMapsLink(effectiveLocation?.latitude || location?.latitude, effectiveLocation?.longitude || location?.longitude);

  const openMaps = async () => {
    if (!mapsUrl) return;
    try { await Linking.openURL(mapsUrl); } catch {}
  };

  const doShareSMS = async () => {
    if (busy) return;
    setBusy(true);
    setShareStatus(null);
    const msg = generateEmergencyMessage(effectiveLocation, Date.now());
    const result = await sendEmergencySMS(msg, contacts);
    if (result.status === SHARE_RESULT.COMPOSER_OPENED) {
      setShareStatus('composer');
    } else if (result.status === SHARE_RESULT.USER_CANCELLED) {
      setShareStatus('cancelled');
    } else if (result.status === SHARE_RESULT.NOT_AVAILABLE) {
      setShareStatus('unavailable');
    } else {
      setShareStatus('error');
    }
    setTimeout(() => setBusy(false), 400);
  };

  const doShareSheet = async () => {
    if (busy) return;
    setBusy(true);
    setShareStatus(null);
    const msg = generateEmergencyMessage(effectiveLocation, Date.now());
    const result = await shareEmergencyAlert(msg, '🚨 Safe-Her Emergency Alert');
    if (result.status === SHARE_RESULT.SHARE_SHEET_OPENED) {
      setShareStatus('sharesheet');
    } else if (result.status === SHARE_RESULT.USER_CANCELLED) {
      setShareStatus('cancelled');
    } else if (result.status === SHARE_RESULT.NOT_AVAILABLE) {
      setShareStatus('unavailable');
    } else {
      setShareStatus('error');
    }
    setTimeout(() => setBusy(false), 400);
  };

  const isStopped = status === SOS_STATUS.STOPPED;
  const isActive = status === SOS_STATUS.ACTIVE || status === SOS_STATUS.STOPPING || isStopped;
  const isActivating = status === SOS_STATUS.ACTIVATING;
  const visible = isActive || isActivating;

  const locStatusBadge = (() => {
    switch (locationStatus) {
      case LOCATION_STATUS.AVAILABLE: return { tone: 'green', label: 'Location available', Icon: CheckCircle2 };
      case LOCATION_STATUS.REQUESTING: return { tone: 'amber', label: 'Requesting location…', Icon: Wifi };
      case LOCATION_STATUS.PERMISSION_DENIED: return { tone: 'pink', label: 'Location permission denied', Icon: XCircle };
      case LOCATION_STATUS.UNAVAILABLE: return { tone: 'pink', label: 'Location unavailable', Icon: XCircle };
      default: return { tone: 'amber', label: 'Location status unknown', Icon: Info };
    }
  })();

  const trackingBadge = (() => {
    if (Platform.OS === 'web') return { tone: 'amber', label: 'Tracking unavailable on web', Icon: Info };
    switch (trackingStatus) {
      case TRACKING_STATUS.ACTIVE: return { tone: 'green', label: 'Background tracking active', Icon: CheckCircle2 };
      case TRACKING_STATUS.STARTING: return { tone: 'amber', label: 'Starting tracking…', Icon: Wifi };
      case TRACKING_STATUS.UNAVAILABLE: return { tone: 'amber', label: 'Background tracking unavailable', Icon: Info };
      default: return { tone: 'neutral', label: 'Tracking inactive', Icon: Info };
    }
  })();

  const shareStatusLine = (() => {
    switch (shareStatus) {
      case 'composer': return { tone: 'green', text: 'Message prepared in SMS composer — user action required.' };
      case 'sharesheet': return { tone: 'green', text: 'Share sheet opened — user action required.' };
      case 'cancelled': return { tone: 'amber', text: 'Share cancelled by user.' };
      case 'unavailable': return { tone: 'amber', text: 'Share service unavailable on this device.' };
      case 'error': return { tone: 'pink', text: 'Could not open share service. Try again or copy manually.' };
      default: return null;
    }
  })();

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={() => {}}>
      <View style={[s.root, { backgroundColor: colors.sosBg }]}>
        <View style={s.wrap}>
          <View style={[s.headerCard, { backgroundColor: colors.cardBg, borderColor: colors.sosBorder }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={[s.icon, { backgroundColor: isDark ? '#4C1D24' : '#FFE8F0' }]}>
                <ShieldAlert color={colors.pink} size={26} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.headline, { color: colors.ink }]}>
                  {isActivating ? 'Preparing SOS…' : isStopped ? 'SOS Stopped' : '🚨 SOS ACTIVE'}
                </Text>
                <Text style={[s.sub, { color: colors.muted }]}>
                  {isActivating ? 'Requesting location and starting tracking.' :
                   isStopped ? 'Emergency session has been stopped.' :
                   'Emergency session is running. Stay calm and share the alert below.'}
                </Text>
              </View>
              {isStopped ? (
                <Pressable onPress={dismissStopped} style={[s.closeChip, { backgroundColor: colors.paper }]}>
                  <X color={colors.ink} size={16} />
                </Pressable>
              ) : null}
            </View>

            {startedAt && !isStopped ? (
              <View style={s.timeRow}>
                <View style={s.timeBox}>
                  <Clock color={colors.muted} size={14} />
                  <Text style={[s.timeLabel, { color: colors.muted }]}>Started</Text>
                  <Text style={[s.timeValue, { color: colors.ink }]}>{formatClock(startedAt)}</Text>
                </View>
                <View style={s.timeBox}>
                  <MapPin color={colors.muted} size={14} />
                  <Text style={[s.timeLabel, { color: colors.muted }]}>Duration</Text>
                  <Text style={[s.timeValue, { color: colors.ink }]}>{formatElapsed(startedAt)}</Text>
                </View>
                <View style={s.timeBox}>
                  <UsersRound color={colors.muted} size={14} />
                  <Text style={[s.timeLabel, { color: colors.muted }]}>Contacts</Text>
                  <Text style={[s.timeValue, { color: colors.ink }]}>{contactCount}</Text>
                </View>
              </View>
            ) : null}
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 260 }}>
            <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.sosBorder }]}>
              <View style={s.cardHead}>
                <MapIcon color={colors.primary} size={18} />
                <Text style={[s.cardTitle, { color: colors.ink }]}>Location Status</Text>
                <View style={{ flex: 1 }} />
                <Pill tone={locStatusBadge.tone}>
                  <locStatusBadge.Icon size={11} color="#FFFFFF" />
                  {locStatusBadge.label}
                </Pill>
              </View>

              {effectiveLocation ? (
                <View style={s.locBlock}>
                  <Text style={[s.locLat, { color: colors.ink }]}>
                    {Number(effectiveLocation.latitude).toFixed(6)}, {Number(effectiveLocation.longitude).toFixed(6)}
                  </Text>
                  {effectiveLocation.accuracy != null ? (
                    <Text style={[s.locAcc, { color: colors.muted }]}>Accuracy: ± {Math.round(Number(effectiveLocation.accuracy))}m</Text>
                  ) : null}
                  <Text style={[s.locTime, { color: colors.muted }]}>Last updated: {formatClock(effectiveUpdatedAt)}</Text>
                  <Pressable onPress={openMaps} style={({ pressed }) => [s.openMapBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }, pressed && s.pressed]}>
                    <MapPin color={colors.primary} size={15} />
                    <Text style={[s.openMapText, { color: colors.primary }]}>View on Google Maps</Text>
                    <ChevronRight color={colors.primary} size={15} />
                  </Pressable>
                </View>
              ) : (
                <View style={[s.locFallback, { backgroundColor: colors.paper }]}>
                  <AlertTriangle color={colors.orange} size={18} />
                  <Text style={[s.locFallbackText, { color: colors.muted }]}>
                    Coordinates not yet available. Shared alerts will include last known coordinates when available.
                  </Text>
                </View>
              )}

              <View style={[s.trackRow, { borderTopColor: colors.line }]}>
                <trackingBadge.Icon color={colors.primary} size={14} />
                <Text style={[s.trackText, { color: colors.muted }]}>{trackingBadge.label}</Text>
                {trackingStatus === TRACKING_STATUS.ACTIVE ? (
                  <Pill tone="green">On</Pill>
                ) : (
                  <Pill tone="amber">Limited</Pill>
                )}
              </View>

              {error && !isStopped ? (
                <View style={[s.errorBar, { backgroundColor: isDark ? '#4C1D24' : '#FFE8F0' }]}>
                  <AlertTriangle color={colors.pink} size={14} />
                  <Text style={[s.errorText, { color: colors.pink }]}>{error}</Text>
                </View>
              ) : null}
            </View>

            <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.sosBorder }]}>
              <View style={s.cardHead}>
                <Share2 color={colors.primary} size={18} />
                <Text style={[s.cardTitle, { color: colors.ink }]}>Share Emergency Alert</Text>
              </View>
              <Text style={[s.alertNote, { color: colors.muted }]}>
                Safe-Her prepares an alert with your latest location. It does NOT send anything automatically — you choose when to share.
              </Text>

              <View style={s.shareRow}>
                <Pressable disabled={busy || isStopped} onPress={doShareSMS} style={({ pressed }) => [s.shareBtn, { backgroundColor: colors.pink }, pressed && s.pressed, (busy || isStopped) && { opacity: 0.6 }]}>
                  <Send color="#FFFFFF" size={16} />
                  <Text style={s.shareBtnText}>Send via SMS</Text>
                </Pressable>
                <Pressable disabled={busy || isStopped} onPress={doShareSheet} style={({ pressed }) => [s.shareBtn, s.shareBtnAlt, { backgroundColor: colors.primary }, pressed && s.pressed, (busy || isStopped) && { opacity: 0.6 }]}>
                  <Share2 color="#FFFFFF" size={16} />
                  <Text style={s.shareBtnText}>Share alert</Text>
                </Pressable>
              </View>

              {shareStatusLine ? (
                <View style={[s.shareStatus, { backgroundColor: shareStatusLine.tone === 'green' ? colors.greenSoft : shareStatusLine.tone === 'pink' ? '#FFE8F0' : colors.amberSoft }]}>
                  {shareStatusLine.tone === 'green' ? <CheckCircle2 color={colors.green} size={14} /> :
                   shareStatusLine.tone === 'pink' ? <XCircle color={colors.pink} size={14} /> : <Info color={colors.amber} size={14} />}
                  <Text style={[s.shareStatusText, { color: shareStatusLine.tone === 'green' ? colors.green : shareStatusLine.tone === 'pink' ? colors.pink : colors.amber }]}>
                    {shareStatusLine.text}
                  </Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => setDetailVisible((v) => !v)}
                style={({ pressed }) => [s.previewBtn, { backgroundColor: colors.paper, borderColor: colors.line }, pressed && s.pressed]}
              >
                <Text style={[s.previewLabel, { color: colors.ink }]}>{detailVisible ? 'Hide preview' : 'Preview alert message'}</Text>
                <ChevronRight color={colors.muted} size={16} style={{ transform: detailVisible ? [{ rotate: '90deg' }] : [] }} />
              </Pressable>

              {detailVisible ? (
                <View style={[s.preview, { backgroundColor: isDark ? '#18101a' : '#FFF1F7', borderColor: colors.line }]}>
                  <Text style={[s.previewText, { color: colors.ink }]}>
                    {generateEmergencyMessage(effectiveLocation, Date.now())}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.sosBorder }]}>
              <View style={s.cardHead}>
                <Info color={colors.primary} size={18} />
                <Text style={[s.cardTitle, { color: colors.ink }]}>Important limitations</Text>
              </View>
              <Text style={[s.bullet, { color: colors.muted }]}>• This is NOT a replacement for calling emergency services.</Text>
              <Text style={[s.bullet, { color: colors.muted }]}>• Safe-Her does not auto-send SMS or call emergency services.</Text>
              <Text style={[s.bullet, { color: colors.muted }]}>• Background tracking can be stopped by Android battery optimizations.</Text>
              <Text style={[s.bullet, { color: colors.muted }]}>• GPS availability depends on signal strength and device settings.</Text>
            </View>
          </ScrollView>

          <View style={[s.footer, { backgroundColor: colors.cardBg, borderColor: colors.sosBorder }]}>
            {!isStopped ? (
              <Pressable
                onPress={stopSOS}
                style={({ pressed }) => [s.stopBtn, { backgroundColor: isDark ? '#4C1D24' : '#FFE8F0', borderColor: colors.pink }, pressed && s.pressed]}
              >
                <StopCircle color={colors.pink} size={20} />
                <Text style={[s.stopBtnText, { color: colors.pink }]}>
                  {status === SOS_STATUS.STOPPING ? 'Stopping SOS…' : 'Stop SOS'}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={dismissStopped}
                style={({ pressed }) => [s.stopBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primary }, pressed && s.pressed]}
              >
                <CheckCircle2 color={colors.primary} size={20} />
                <Text style={[s.stopBtnText, { color: colors.primary }]}>Close SOS summary</Text>
              </Pressable>
            )}
            {sessionId ? <Text style={[s.id, { color: colors.muted }]}>Session: {sessionId}</Text> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  wrap: { flex: 1, padding: 16, gap: 14 },
  headerCard: { borderRadius: 22, borderWidth: 1, padding: 18, gap: 16 },
  icon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headline: { fontSize: 22, fontWeight: '900', marginBottom: 4 },
  sub: { fontSize: 13, lineHeight: 19 },
  closeChip: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  timeRow: { flexDirection: 'row', gap: 10 },
  timeBox: { flex: 1, backgroundColor: 'transparent', gap: 2 },
  timeLabel: { fontSize: 11, fontWeight: '700', marginLeft: 20, marginTop: -16, opacity: 0.85 },
  timeValue: { fontSize: 14, fontWeight: '800' },
  card: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  cardTitle: { fontSize: 15, fontWeight: '800', flex: 0 },
  locBlock: { gap: 4 },
  locLat: { fontSize: 15, fontWeight: '800' },
  locAcc: { fontSize: 12, fontWeight: '600' },
  locTime: { fontSize: 12, marginBottom: 10 },
  openMapBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, alignSelf: 'flex-start' },
  openMapText: { fontSize: 13, fontWeight: '800' },
  locFallback: { padding: 14, borderRadius: 14, flexDirection: 'row', gap: 10 },
  locFallbackText: { flex: 1, fontSize: 12, lineHeight: 18 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, paddingTop: 12, borderTopWidth: 1 },
  trackText: { flex: 1, fontSize: 12.5, fontWeight: '600' },
  errorBar: { marginTop: 8, borderRadius: 12, padding: 10, flexDirection: 'row', gap: 8 },
  errorText: { flex: 1, fontSize: 12, fontWeight: '700' },
  alertNote: { fontSize: 12, lineHeight: 18 },
  shareRow: { flexDirection: 'row', gap: 10 },
  shareBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 16 },
  shareBtnAlt: { opacity: 0.92 },
  shareBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13.5 },
  shareStatus: { borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareStatusText: { flex: 1, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  previewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
  previewLabel: { fontSize: 13, fontWeight: '800' },
  preview: { borderRadius: 14, padding: 14, borderWidth: 1 },
  previewText: { fontSize: 12, lineHeight: 19 },
  bullet: { fontSize: 12, lineHeight: 18 },
  footer: { borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 14, position: 'absolute', left: 16, right: 16, bottom: 16, gap: 10 },
  stopBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 54, borderRadius: 16, borderWidth: 1.5 },
  stopBtnText: { fontSize: 14.5, fontWeight: '900' },
  id: { textAlign: 'center', fontSize: 10, fontWeight: '600' },
  pressed: { opacity: 0.78 },
});
