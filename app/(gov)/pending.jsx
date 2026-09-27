import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, ClipboardList, MapPin, TriangleAlert } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';
import { daysPending, fetchGovernmentReports, isOverdue } from '../../lib/government/govApi';
import {
  EmptyState,
  ErrorState,
  GovHeader,
  PriorityBadge,
  REPORT_STATUS,
  SectionHeader,
  StatusBadge,
} from '../../components/government/GovUI';

const OPEN_STATUSES = [REPORT_STATUS.NEW, REPORT_STATUS.UNDER_REVIEW, REPORT_STATUS.ACTION_TAKEN];

export default function GovPendingScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await fetchGovernmentReports();
      setReports(result.reports);
    } catch (err) {
      setError(err?.message || 'Could not load pending reports.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = useMemo(
    () => reports.filter((r) => OPEN_STATUSES.includes(r.status)),
    [reports]
  );

  const buckets = useMemo(
    () => [
      { key: 'critical', label: 'Over 7 days', items: open.filter((r) => daysPending(r) >= 7) },
      { key: 'aging', label: 'Over 3 days', items: open.filter((r) => daysPending(r) >= 3 && daysPending(r) < 7) },
      { key: 'recent', label: 'Under 3 days', items: open.filter((r) => daysPending(r) < 3) },
    ],
    [open]
  );

  const total = open.length;
  const worst = open.reduce((max, r) => Math.max(max, daysPending(r)), 0);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.paper }]}>
      <GovHeader
        agency="Pending & Overdue"
        subtitle={`${total} open · oldest ${worst}d`}
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
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <ArrowLeft color={colors.ink} size={19} />
          <Text style={[styles.backText, { color: colors.ink }]}>Back</Text>
        </Pressable>

        {error && reports.length === 0 ? (
          <ErrorState message={error} onRetry={load} />
        ) : total === 0 && !loading ? (
          <EmptyState
            icon={CheckCircle2}
            title="Nothing pending"
            message="Every report has been resolved or closed. Outstanding cases will appear here automatically."
          />
        ) : (
          buckets.map((bucket) => {
            if (bucket.items.length === 0) return null;
            const tone =
              bucket.key === 'critical'
                ? colors.pink
                : bucket.key === 'aging'
                  ? colors.orange
                  : colors.muted;

            return (
              <View key={bucket.key} style={styles.bucket}>
                <SectionHeader
                  title={bucket.label}
                  action={
                    <View style={[styles.countPill, { backgroundColor: tone + '1F' }]}>
                      <Text style={[styles.countText, { color: tone }]}>{bucket.items.length}</Text>
                    </View>
                  }
                />

                {bucket.items
                  .sort((a, b) => daysPending(b) - daysPending(a))
                  .map((report) => (
                    <PendingRow
                      key={report.id}
                      report={report}
                      tone={tone}
                      onPress={() => router.push(`/(gov)/report?id=${encodeURIComponent(report.id)}`)}
                    />
                  ))}
              </View>
            );
          })
        )}

        {loading ? (
          <Text style={[styles.loading, { color: colors.muted }]}>Loading pending reports…</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function PendingRow({ report, tone, onPress }) {
  const { colors } = useTheme();
  const age = daysPending(report);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${report.id}, pending ${age} days`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.cardBg, borderColor: tone + '66' },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.ageBox, { backgroundColor: tone + '1A' }]}>
        <Text style={[styles.ageValue, { color: tone }]}>{age}</Text>
        <Text style={[styles.ageLabel, { color: tone }]}>days</Text>
      </View>

      <View style={styles.rowBody}>
        <Text style={[styles.rowId, { color: colors.muted }]}>{report.id}</Text>
        <Text style={[styles.rowCat, { color: colors.ink }]} numberOfLines={1}>
          {report.category}
        </Text>
        <View style={styles.rowLoc}>
          <MapPin color={colors.muted} size={12} />
          <Text style={[styles.rowLocText, { color: colors.muted }]} numberOfLines={1}>
            {report.locationLabel}
          </Text>
        </View>
        <View style={styles.rowBadges}>
          <StatusBadge status={report.status} size="sm" />
          <PriorityBadge priority={report.priority} size="sm" />
          {isOverdue(report) ? (
            <View style={[styles.overdue, { backgroundColor: colors.pinkSoft }]}>
              <TriangleAlert color={colors.pink} size={10} />
              <Text style={[styles.overdueText, { color: colors.pink }]}>Overdue</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.assignee, { color: colors.muted }]}>
          {report.assignedTo ? `Assigned: ${report.assignedTo}` : 'Unassigned'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 28 },
  pressed: { opacity: 0.75 },
  loading: { fontSize: 12.5, fontWeight: '600', textAlign: 'center', paddingVertical: 16 },

  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, alignSelf: 'flex-start', marginBottom: 8 },
  backText: { fontSize: 14, fontWeight: '700' },

  bucket: { marginBottom: 18 },
  countPill: { paddingHorizontal: 10, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 12, fontWeight: '800' },

  row: { flexDirection: 'row', gap: 12, borderRadius: 16, borderWidth: 1.5, padding: 13, marginBottom: 9 },
  ageBox: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ageValue: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  ageLabel: { fontSize: 9.5, fontWeight: '800' },
  rowBody: { flex: 1 },
  rowId: { fontSize: 10.5, fontWeight: '800' },
  rowCat: { fontSize: 14.5, fontWeight: '800', marginTop: 2 },
  rowLoc: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  rowLocText: { flex: 1, fontSize: 11.5, fontWeight: '600' },
  rowBadges: { flexDirection: 'row', gap: 6, marginTop: 9, flexWrap: 'wrap' },
  overdue: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  overdueText: { fontSize: 10, fontWeight: '800' },
  assignee: { fontSize: 11, fontWeight: '600', marginTop: 7 },
});
