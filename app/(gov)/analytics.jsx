import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, BarChart3 } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';
import { countByStatus, daysPending, fetchGovernmentReports } from '../../lib/government/govApi';
import { EmptyState, ErrorState, GovHeader, SectionHeader } from '../../components/government/GovUI';

export default function GovAnalyticsScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await fetchGovernmentReports();
      setReports(result.reports);
    } catch (err) {
      setError(err?.message || 'Could not load analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => countByStatus(reports), [reports]);

  const byCategory = useMemo(() => {
    const map = {};
    reports.forEach((r) => {
      map[r.category] = (map[r.category] || 0) + 1;
    });
    return Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [reports]);

  const byPriority = useMemo(() => {
    const map = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    reports.forEach((r) => {
      if (map[r.priority] != null) map[r.priority] += 1;
    });
    return Object.entries(map).map(([label, value]) => ({ label, value }));
  }, [reports]);

  const aging = useMemo(() => {
    const open = reports.filter((r) => r.status !== 'CLOSED' && r.status !== 'RESOLVED');
    return {
      total: open.length,
      avgDays: open.length
        ? Math.round((open.reduce((s, r) => s + daysPending(r), 0) / open.length) * 10) / 10
        : 0,
      oldest: open.reduce((m, r) => Math.max(m, daysPending(r)), 0),
    };
  }, [reports]);

  const maxCat = Math.max(...byCategory.map((c) => c.value), 1);
  const maxPri = Math.max(...byPriority.map((p) => p.value), 1);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.paper }]}>
      <GovHeader agency="Analytics" subtitle={`${reports.length} reports analysed`} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
        ) : loading ? (
          <Text style={[styles.loading, { color: colors.muted }]}>Crunching numbers…</Text>
        ) : reports.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No data to analyse"
            message="Analytics appear once community reports have been received."
          />
        ) : (
          <>
            <SectionHeader title="Aging open cases" />
            <View style={styles.kpiRow}>
              <Kpi value={aging.total} label="Open cases" tone={colors.primary} />
              <Kpi value={`${aging.avgDays}d`} label="Average age" tone={colors.orange} />
              <Kpi value={`${aging.oldest}d`} label="Oldest" tone={colors.pink} />
            </View>

            <SectionHeader title="By status" />
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
              {Object.entries(counts).map(([status, value]) => (
                <BarRow
                  key={status}
                  label={status.replace('_', ' ')}
                  value={value}
                  max={reports.length}
                  color={statusColor(status, colors)}
                />
              ))}
            </View>

            <SectionHeader title="By category" />
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
              {byCategory.map((row) => (
                <BarRow
                  key={row.label}
                  label={row.label}
                  value={row.value}
                  max={maxCat}
                  color={colors.primary}
                />
              ))}
            </View>

            <SectionHeader title="By priority" />
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
              {byPriority.map((row) => (
                <BarRow
                  key={row.label}
                  label={row.label}
                  value={row.value}
                  max={maxPri}
                  color={priorityColor(row.label, colors)}
                />
              ))}
            </View>
          </>
        )}

        <Text style={[styles.disclaimer, { color: colors.muted }]}>
          Figures reflect reports submitted through Safe-Her and are indicative only. Verified
          incident data requires confirmation from the responding agency.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Kpi({ value, label, tone }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.kpi, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
      <Text style={[styles.kpiValue, { color: tone }]}>{value}</Text>
      <Text style={[styles.kpiLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

function BarRow({ label, value, max, color }) {
  const { colors } = useTheme();
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <View style={styles.barRow}>
      <Text style={[styles.barLabel, { color: colors.ink }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.barTrack, { backgroundColor: colors.paper }]}>
        <View style={[styles.barFill, { width: `${Math.max(pct, value > 0 ? 6 : 0)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.barValue, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

function statusColor(status, colors) {
  if (status === 'RESOLVED') return colors.teal;
  if (status === 'CLOSED') return colors.muted;
  if (status === 'ACTION_TAKEN') return colors.primary;
  if (status === 'UNDER_REVIEW') return colors.orange;
  return colors.blue;
}

function priorityColor(priority, colors) {
  if (priority === 'CRITICAL') return colors.pink;
  if (priority === 'HIGH') return colors.orange;
  if (priority === 'MEDIUM') return colors.yellow;
  return colors.teal;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 28 },
  pressed: { opacity: 0.75 },
  loading: { fontSize: 12.5, fontWeight: '600', textAlign: 'center', paddingVertical: 20 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, alignSelf: 'flex-start', marginBottom: 8 },
  backText: { fontSize: 14, fontWeight: '700' },

  kpiRow: { flexDirection: 'row', gap: 9, marginBottom: 6 },
  kpi: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: 'center' },
  kpiValue: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  kpiLabel: { fontSize: 10.5, fontWeight: '700', marginTop: 2, textAlign: 'center' },

  card: { borderRadius: 16, borderWidth: 1, padding: 15, marginBottom: 6 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 11 },
  barRowLast: { marginBottom: 0 },
  barLabel: { width: 104, fontSize: 11.5, fontWeight: '700' },
  barTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  barValue: { width: 26, textAlign: 'right', fontSize: 12.5, fontWeight: '800' },

  disclaimer: { fontSize: 11, lineHeight: 16, fontWeight: '600', fontStyle: 'italic', marginTop: 16, textAlign: 'center' },
});
