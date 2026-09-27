import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Check,
  Clock3,
  MapPin,
  Radio,
  ShieldCheck,
  Siren,
  UsersRound,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { fetchActiveSosAlerts, updateSosStatus } from '../../lib/government/govApi';
import NavigationMap from '../../components/NavigationMap';
import {
  EmptyState,
  ErrorState,
  GovHeader,
  PrimaryButton,
  SecondaryButton,
} from '../../components/government/GovUI';

const SOS_FLOW = ['ACTIVE', 'ACKNOWLEDGED', 'RESPONDING', 'RESOLVED'];
const SOS_NEXT = {
  ACTIVE: ['ACKNOWLEDGED'],
  ACKNOWLEDGED: ['RESPONDING', 'RESOLVED'],
  RESPONDING: ['RESOLVED'],
  RESOLVED: [],
};

const SOS_LABEL = {
  ACTIVE: 'Active',
  ACKNOWLEDGED: 'Acknowledged',
  RESPONDING: 'Responding',
  RESOLVED: 'Resolved',
};

export default function GovSosScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await fetchActiveSosAlerts();
      setAlerts(result.alerts);
      setOffline(result.offline);
      setSelected((prev) => (prev ? result.alerts.find((a) => a.id === prev.id) || null : null));
    } catch (err) {
      setError(err?.message || 'Could not load SOS alerts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Officer desk polls rather than pretending to be a realtime socket.
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const active = useMemo(
    () => alerts.filter((a) => a.status !== 'RESOLVED'),
    [alerts]
  );
  const resolved = useMemo(
    () => alerts.filter((a) => a.status === 'RESOLVED'),
    [alerts]
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.paper }]}>
      <GovHeader
        agency="Smart SOS"
        subtitle={
          active.length > 0
            ? `${active.length} alert${active.length === 1 ? '' : 's'} awaiting response`
            : 'No active alerts'
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {offline ? (
          <View style={[styles.offline, { backgroundColor: colors.pinkSoft }]}>
            <AlertTriangle color={colors.pink} size={14} />
            <Text style={[styles.offlineText, { color: colors.ink }]}>
              Response server unreachable. No live alert feed right now.
            </Text>
          </View>
        ) : null}

        {error && alerts.length === 0 ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading ? (
          <Text style={[styles.loading, { color: colors.muted }]}>Loading alerts…</Text>
        ) : alerts.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No SOS alerts"
            message="When a citizen activates Safe-Her SOS and their device is connected, the alert appears here."
          />
        ) : (
          <>
            {active.length > 0 ? (
              <>
                <Text style={[styles.groupLabel, { color: colors.ink }]}>Active alerts</Text>
                {active.map((alert) => (
                  <AlertCard key={alert.id} alert={alert} onPress={() => setSelected(alert)} />
                ))}
              </>
            ) : null}

            {resolved.length > 0 ? (
              <>
                <Text style={[styles.groupLabel, styles.groupSpaced, { color: colors.ink }]}>
                  Resolved
                </Text>
                {resolved.map((alert) => (
                  <AlertCard key={alert.id} alert={alert} onPress={() => setSelected(alert)} muted />
                ))}
              </>
            ) : null}
          </>
        )}

        <Text style={[styles.note, { color: colors.muted }]}>
          Alerts appear only for devices that have reported their SOS session to the response
          server. Location is shown when the reporting device supplied coordinates.
        </Text>
      </ScrollView>

      <SosActionSheet
        alert={selected}
        officer={profile?.full_name || 'Officer'}
        onClose={() => setSelected(null)}
        onCompleted={load}
      />
    </SafeAreaView>
  );
}

function AlertCard({ alert, onPress, muted }) {
  const { colors } = useTheme();
  const tone = muted ? colors.muted : colors.pink;
  const hasCoords = typeof alert.lat === 'number' && typeof alert.lng === 'number';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`SOS alert ${alert.id}, ${SOS_LABEL[alert.status] || alert.status}`}
      style={({ pressed }) => [
        styles.alertCard,
        { backgroundColor: colors.cardBg, borderColor: muted ? colors.line : tone },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.alertIcon, { backgroundColor: tone + '1A' }]}>
        <Siren color={tone} size={20} />
      </View>

      <View style={styles.alertBody}>
        <Text style={[styles.alertId, { color: colors.ink }]}>Alert {alert.id}</Text>
        <View style={styles.alertMetaRow}>
          <View style={[styles.statusPill, { backgroundColor: tone + '1F' }]}>
            <Text style={[styles.statusText, { color: tone }]}>
              {SOS_LABEL[alert.status] || alert.status}
            </Text>
          </View>
          <Text style={[styles.alertTime, { color: colors.muted }]}>
            {relative(alert.receivedAt)}
          </Text>
        </View>

        <View style={styles.alertLocRow}>
          <MapPin color={colors.muted} size={12} />
          <Text style={[styles.alertLoc, { color: colors.muted }]} numberOfLines={1}>
            {hasCoords
              ? `${alert.lat.toFixed(4)}, ${alert.lng.toFixed(4)}`
              : 'No coordinates reported'}
          </Text>
        </View>

        {alert.contactCount > 0 ? (
          <View style={styles.alertFoot}>
            <UsersRound color={colors.muted} size={12} />
            <Text style={[styles.alertFootText, { color: colors.muted }]}>
              {alert.contactCount} contact{alert.contactCount === 1 ? '' : 's'} on device
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function SosActionSheet({ alert, officer, onClose, onCompleted }) {
  const { colors } = useTheme();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (alert) {
      setNotes('');
      setError('');
    }
  }, [alert]);

  if (!alert) return null;

  const hasCoords = typeof alert.lat === 'number' && typeof alert.lng === 'number';
  const nextOptions = SOS_NEXT[alert.status] || [];

  async function advance(status) {
    setBusy(true);
    setError('');
    try {
      await updateSosStatus(alert.id, status, notes.trim());
      setNotes('');
      onCompleted?.();
      onClose();
    } catch (err) {
      setError(err?.message || 'Could not update this alert.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          style={styles.sheetWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.sheet, { backgroundColor: colors.cardBg }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.line }]}>
              <View style={styles.sheetHeaderText}>
                <Text style={[styles.sheetTitle, { color: colors.ink }]}>Alert {alert.id}</Text>
                <Text style={[styles.sheetSub, { color: colors.muted }]}>
                  {SOS_LABEL[alert.status]} · {relative(alert.receivedAt)}
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={[styles.closeBtn, { backgroundColor: colors.paper }]}
              >
                <X color={colors.ink} size={18} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
              {hasCoords ? (
                <View style={[styles.mapWrap, { borderColor: colors.line }]}>
                  <NavigationMap
                    routeCoords={[[alert.lat, alert.lng]]}
                    travelledIdx={0}
                    liveLocation={{ lat: alert.lat, lng: alert.lng }}
                    destination={null}
                  />
                </View>
              ) : (
                <View style={[styles.noMap, { backgroundColor: colors.paper, borderColor: colors.line }]}>
                  <MapPin color={colors.muted} size={18} />
                  <Text style={[styles.noMapText, { color: colors.ink }]}>
                    No coordinates available
                  </Text>
                  <Text style={[styles.noMapSub, { color: colors.muted }]}>
                    The reporting device did not share a GPS fix with this alert.
                  </Text>
                </View>
              )}

              {/* Response progress */}
              <Text style={[styles.label, { color: colors.muted }]}>RESPONSE PROGRESS</Text>
              <View style={styles.stepRow}>
                {SOS_FLOW.map((step, i) => {
                  const reached = SOS_FLOW.indexOf(alert.status) >= i;
                  return (
                    <View key={step} style={styles.stepCol}>
                      <View
                        style={[
                          styles.stepDot,
                          {
                            backgroundColor: reached ? colors.teal : colors.paper,
                            borderColor: reached ? colors.teal : colors.line,
                          },
                        ]}
                      >
                        {reached ? <Check color="#FFFFFF" size={12} /> : null}
                      </View>
                      <Text style={[styles.stepText, { color: reached ? colors.ink : colors.muted }]}>
                        {SOS_LABEL[step]}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {alert.notes ? (
                <View style={[styles.noteBox, { backgroundColor: colors.paper, borderColor: colors.line }]}>
                  <Text style={[styles.noteBoxText, { color: colors.ink }]}>{alert.notes}</Text>
                  <Text style={[styles.noteBoxOfficer, { color: colors.muted }]}>
                    Recorded by {alert.assignedTo || officer}
                  </Text>
                </View>
              ) : null}

              {error ? (
                <View style={[styles.error, { backgroundColor: colors.pinkSoft }]}>
                  <AlertTriangle color={colors.pink} size={14} />
                  <Text style={[styles.errorText, { color: colors.pink }]}>{error}</Text>
                </View>
              ) : null}

              {nextOptions.length === 0 ? (
                <View style={[styles.doneBox, { backgroundColor: colors.tealSoft }]}>
                  <ShieldCheck color={colors.teal} size={16} />
                  <Text style={[styles.doneText, { color: colors.ink }]}>
                    This alert is resolved. No further actions available.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={[styles.label, styles.labelSpaced, { color: colors.muted }]}>
                    OFFICER NOTE
                  </Text>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="What response is being taken?"
                    placeholderTextColor={colors.muted}
                    multiline
                    textAlignVertical="top"
                    accessibilityLabel="Officer note"
                    style={[
                      styles.input,
                      { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paper },
                    ]}
                  />

                  {nextOptions.map((status) => (
                    <PrimaryButton
                      key={status}
                      label={
                        status === 'ACKNOWLEDGED'
                          ? 'Acknowledge alert'
                          : status === 'RESPONDING'
                            ? 'Mark as responding'
                            : 'Resolve alert'
                      }
                      icon={status === 'RESOLVED' ? Check : Radio}
                      tone={status === 'RESOLVED' ? colors.teal : colors.pink}
                      busy={busy}
                      style={styles.actionBtn}
                      onPress={() => advance(status)}
                    />
                  ))}

                  <SecondaryButton
                    label="Back to alert"
                    onPress={onClose}
                    style={styles.actionBtn}
                  />
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function relative(ts) {
  if (!ts) return 'Unknown time';
  const then = new Date(ts).getTime();
  if (Number.isNaN(then)) return 'Unknown time';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 28 },
  pressed: { opacity: 0.75 },
  loading: { fontSize: 12.5, fontWeight: '600', textAlign: 'center', paddingVertical: 20 },
  groupLabel: { fontSize: 13, fontWeight: '800', marginBottom: 10 },
  groupSpaced: { marginTop: 14 },

  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 11,
    marginBottom: 12,
  },
  offlineText: { flex: 1, fontSize: 11.5, fontWeight: '700', lineHeight: 16 },

  alertCard: { flexDirection: 'row', gap: 12, borderRadius: 16, borderWidth: 1.5, padding: 13, marginBottom: 9 },
  alertIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  alertBody: { flex: 1 },
  alertId: { fontSize: 15, fontWeight: '800' },
  alertMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 10.5, fontWeight: '800' },
  alertTime: { fontSize: 11, fontWeight: '600' },
  alertLocRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7 },
  alertLoc: { flex: 1, fontSize: 11.5, fontWeight: '600' },
  alertFoot: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  alertFootText: { fontSize: 11, fontWeight: '600' },

  note: { fontSize: 11, lineHeight: 16, fontWeight: '600', fontStyle: 'italic', marginTop: 18, textAlign: 'center' },

  overlay: { flex: 1, backgroundColor: 'rgba(15,12,35,0.55)', justifyContent: 'flex-end' },
  sheetWrap: { maxHeight: '92%' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  sheetHeaderText: { flex: 1 },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  sheetSub: { fontSize: 11.5, fontWeight: '600', marginTop: 3 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  sheetBody: { padding: 16, paddingBottom: 28 },

  mapWrap: { height: 220, borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  noMap: { borderRadius: 16, borderWidth: 1, padding: 18, alignItems: 'center', gap: 5, marginBottom: 16 },
  noMapText: { fontSize: 13.5, fontWeight: '800' },
  noMapSub: { fontSize: 11.5, lineHeight: 16, fontWeight: '600', textAlign: 'center' },

  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 9 },
  labelSpaced: { marginTop: 16 },
  stepRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  stepCol: { flex: 1, alignItems: 'center', gap: 5 },
  stepDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 9.5, fontWeight: '700', textAlign: 'center' },

  noteBox: { borderRadius: 13, borderWidth: 1, padding: 12, marginTop: 16 },
  noteBoxText: { fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
  noteBoxOfficer: { fontSize: 10.5, fontWeight: '700', marginTop: 5 },

  error: { flexDirection: 'row', gap: 7, alignItems: 'center', borderRadius: 12, padding: 11, marginTop: 16 },
  errorText: { flex: 1, fontSize: 12, fontWeight: '700' },
  doneBox: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 13, padding: 13, marginTop: 16 },
  doneText: { flex: 1, fontSize: 12.5, fontWeight: '700' },

  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, height: 92, paddingTop: 12, fontSize: 14, fontWeight: '600' },
  actionBtn: { marginTop: 12 },
});
