import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Camera,
  Clock3,
  ImageOff,
  MapPin,
  UserRound,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { daysPending, fetchReportDetail } from '../../lib/government/govApi';
import RouteMap from '../../components/RouteMap';
import {
  ErrorState,
  GovHeader,
  PrimaryButton,
  PriorityBadge,
  SectionHeader,
  StatusBadge,
} from '../../components/government/GovUI';
import ReportActionSheet from '../../components/government/ReportActionSheet';

export default function GovReportDetailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { profile } = useAuth();
  const { id } = useLocalSearchParams();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [evidence, setEvidence] = useState([]);
  const [actionOpen, setActionOpen] = useState(false);
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    if (!id) {
      setError('No report selected.');
      setLoading(false);
      return;
    }
    setError('');
    try {
      const result = await fetchReportDetail(String(id));
      if (!result.report) {
        setError('This report could not be found.');
      } else {
        setReport(result.report);
        setEvidence(result.report.evidence || []);
      }
    } catch (err) {
      setError(err?.message || 'Could not load this report.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function addPhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setEvidence((prev) => [...prev, { localUri: result.assets[0].uri, pending: true }]);
      }
    } catch {
      /* picker unavailable — ignore */
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.paper }]}>
        <GovHeader agency="Report Detail" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerText, { color: colors.muted }]}>Loading report…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !report) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.paper }]}>
        <GovHeader agency="Report Detail" />
        <ErrorState message={error || 'Report unavailable.'} onRetry={load} />
      </SafeAreaView>
    );
  }

  const hasCoords = typeof report.lat === 'number' && typeof report.lng === 'number';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.paper }]}>
      <GovHeader
        agency={report.id}
        subtitle={`${report.category} · ${daysPending(report)}d pending`}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            android_ripple={{ color: colors.primarySoft, borderless: true, radius: 22 }}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <ArrowLeft color={colors.ink} size={19} />
            <Text style={[styles.backText, { color: colors.ink }]}>Back to reports</Text>
          </Pressable>

          {/* Status + priority */}
          <View style={styles.badgeRow}>
            <StatusBadge status={report.status} />
            <PriorityBadge priority={report.priority} />
          </View>

          {/* Description */}
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
            <Text style={[styles.label, { color: colors.muted }]}>REPORT</Text>
            <Text style={[styles.title, { color: colors.ink }]}>{report.category}</Text>
            <Text style={[styles.details, { color: colors.ink }]}>
              {report.details || 'No additional description was provided.'}
            </Text>
          </View>

          {/* Meta */}
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
            <Text style={[styles.label, { color: colors.muted }]}>DETAILS</Text>
            <MetaRow icon={MapPin} label="Location" value={report.locationLabel} />
            <MetaRow icon={Clock3} label="Received" value={formatDate(report.createdAt)} />
            {report.updatedAt && report.updatedAt !== report.createdAt ? (
              <MetaRow icon={Clock3} label="Last updated" value={formatDate(report.updatedAt)} />
            ) : null}
            <MetaRow
              icon={UserRound}
              label="Assigned to"
              value={report.assignedTo || 'Unassigned'}
            />
            {report.assignedDepartment ? (
              <MetaRow icon={UserRound} label="Department" value={report.assignedDepartment} />
            ) : null}
          </View>

          {/* Map — only when real coordinates exist */}
          <SectionHeader title="Location" />
          {hasCoords ? (
            <View style={[styles.mapWrap, { borderColor: colors.line }]}>
              <RouteMap
                source={{ lat: report.lat, lng: report.lng }}
                destination={null}
                route={null}
                allRoutes={[]}
                selectedRouteIndex={0}
              />
            </View>
          ) : (
            <View style={[styles.noMap, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
              <MapPin color={colors.muted} size={18} />
              <Text style={[styles.noMapTitle, { color: colors.ink }]}>No coordinates recorded</Text>
              <Text style={[styles.noMapText, { color: colors.muted }]}>
                The citizen supplied an area name only. Location: {report.locationLabel}
              </Text>
            </View>
          )}

          {/* Evidence */}
          <SectionHeader
            title="Evidence"
            action={
              <Pressable onPress={addPhoto} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.link, { color: colors.primary }]}>Add photo</Text>
              </Pressable>
            }
          />
          <View style={styles.evidenceRow}>
            <Pressable
              onPress={addPhoto}
              accessibilityRole="button"
              accessibilityLabel="Add photo evidence"
              android_ripple={{ color: colors.primarySoft }}
              style={({ pressed }) => [
                styles.addPhoto,
                { backgroundColor: colors.cardBg, borderColor: colors.line },
                pressed && styles.pressed,
              ]}
            >
              <Camera color={colors.primary} size={20} />
              <Text style={[styles.addPhotoText, { color: colors.primary }]}>Add</Text>
            </Pressable>

            {evidence.map((item, index) => {
              const uri = item.localUri || item.uri;
              return (
                <View
                  key={item.localUri || item.id || index}
                  style={[styles.thumb, { borderColor: colors.line }]}
                >
                  <Image source={{ uri }} style={styles.thumbImage} />
                </View>
              );
            })}

            {evidence.length === 0 ? (
              <View style={styles.evidenceHint}>
                <ImageOff color={colors.muted} size={15} />
                <Text style={[styles.evidenceHintText, { color: colors.muted }]}>
                  {report.hasPhoto
                    ? 'Citizen indicated a photo, but the file was not uploaded.'
                    : 'No photo evidence attached.'}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Officer actions */}
          <View style={styles.actionBar}>
            <PrimaryButton
              label={report.status === 'CLOSED' ? 'Report Closed' : 'Take Action / Update Status'}
              onPress={() => (report.status === 'CLOSED' ? null : setActionOpen(true))}
              disabled={report.status === 'CLOSED'}
              style={styles.actionBarBtn}
            />
          </View>

          {success ? (
            <View style={[styles.success, { backgroundColor: colors.tealSoft, borderColor: colors.teal }]}>
              <Text style={[styles.successText, { color: colors.ink }]}>{success}</Text>
            </View>
          ) : null}

          {/* Action history */}
          <SectionHeader title="Action History" />
          {report.actions && report.actions.length > 0 ? (
            report.actions.map((action, index) => (
              <View
                key={action.id || index}
                style={[styles.actionCard, { backgroundColor: colors.cardBg, borderColor: colors.line }]}
              >
                <View style={styles.actionTop}>
                  <Text style={[styles.actionType, { color: colors.ink }]}>{actionTypeLabel(action.type)}</Text>
                  <Text style={[styles.actionTime, { color: colors.muted }]}>
                    {formatDate(action.created_at || action.createdAt)}
                  </Text>
                </View>
                {action.notes ? (
                  <Text style={[styles.actionNotes, { color: colors.muted }]}>{action.notes}</Text>
                ) : null}
                <Text style={[styles.actionOfficer, { color: colors.primary }]}>
                  {action.officer || profile?.full_name || 'Officer'}
                </Text>
              </View>
            ))
          ) : (
            <View style={[styles.noActions, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
              <Text style={[styles.noActionsText, { color: colors.muted }]}>
                No officer actions recorded yet.
              </Text>
            </View>
          )}

          <View style={styles.bottomSpace} />
        </ScrollView>

        <ReportActionSheet
          visible={actionOpen}
          report={report}
          onClose={() => setActionOpen(false)}
          onCompleted={async (result) => {
            setSuccess('Saved to the report record.');
            if (result?.report) {
              setReport(result.report);
            } else {
              await load();
            }
            setEvidence([]);
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MetaRow({ icon: Icon, label, value }) {
  const { colors } = useTheme();

  return (
    <View style={styles.metaRow}>
      <Icon color={colors.muted} size={15} />
      <Text style={[styles.metaLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: colors.ink }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function actionTypeLabel(type) {
  const map = {
    STATUS_CHANGE: 'Status updated',
    CLOSE: 'Report closed',
    RESOLVE: 'Report resolved',
    ACTION: 'Action taken',
    ASSIGN: 'Assigned',
  };
  return map[type] || 'Update';
}

function formatDate(ts) {
  if (!ts) return 'Unknown';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString();
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  centerText: { fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.75 },
  bottomSpace: { height: 24 },

  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  backText: { fontSize: 14, fontWeight: '700' },

  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },

  card: { borderRadius: 16, borderWidth: 1, padding: 15, marginBottom: 12 },
  label: { fontSize: 9.5, fontWeight: '800', letterSpacing: 1.2, marginBottom: 7 },
  title: { fontSize: 19, fontWeight: '800', marginBottom: 7 },
  details: { fontSize: 14, lineHeight: 21, fontWeight: '500' },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7 },
  metaLabel: { fontSize: 12.5, fontWeight: '600', width: 96 },
  metaValue: { flex: 1, fontSize: 12.5, fontWeight: '700' },

  mapWrap: { height: 240, borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  noMap: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  noMapTitle: { fontSize: 14, fontWeight: '800' },
  noMapText: { fontSize: 12, lineHeight: 18, textAlign: 'center', fontWeight: '600' },

  link: { fontSize: 12.5, fontWeight: '800' },
  evidenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  addPhoto: {
    width: 72,
    height: 72,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  addPhotoText: { fontSize: 11, fontWeight: '800' },
  thumb: { width: 72, height: 72, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },
  evidenceHint: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, minWidth: 160 },
  evidenceHintText: { flex: 1, fontSize: 11.5, lineHeight: 16, fontWeight: '600' },

  actionCard: { borderRadius: 14, borderWidth: 1, padding: 13, marginBottom: 8 },
  actionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  actionType: { fontSize: 13.5, fontWeight: '800' },
  actionTime: { fontSize: 10.5, fontWeight: '600' },
  actionNotes: { fontSize: 12.5, lineHeight: 18, marginTop: 5 },
  actionOfficer: { fontSize: 11, fontWeight: '800', marginTop: 6 },
  noActions: { borderRadius: 14, borderWidth: 1, padding: 16 },
  noActionsText: { fontSize: 12.5, fontWeight: '600', textAlign: 'center' },

  actionBar: { marginTop: 4, marginBottom: 14 },
  actionBarBtn: { width: '100%' },
  success: { borderRadius: 13, borderWidth: 1, padding: 12, marginBottom: 12 },
  successText: { fontSize: 12.5, fontWeight: '700' },
});
