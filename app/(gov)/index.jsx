import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ChevronRight,
  CircleDot,
  Clock3,
  Inbox,
  MapPin,
  ShieldAlert,
  Siren,
  TriangleAlert,
  Wrench,
  CheckCircle2,
} from 'lucide-react-native';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import {
  countByStatus,
  daysPending,
  fetchActiveSosAlerts,
  fetchGovernmentReports,
  isOverdue,
} from '../../lib/government/govApi';
import {
  ErrorState,
  GovHeader,
  PriorityBadge,
  REPORT_STATUS,
  SectionHeader,
  StatCard,
  StatusBadge,
} from '../../components/government/GovUI';

export default function GovHomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { profile, signOut } = useAuth();

  const [reports, setReports] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [reportResult, sosResult] = await Promise.all([
        fetchGovernmentReports(),
        fetchActiveSosAlerts(),
      ]);
      setReports(reportResult.reports);
      setAlerts(sosResult.alerts);
      setOffline(reportResult.offline || sosResult.offline);
    } catch (err) {
      setError(err?.message || 'Could not reach the response desk.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => countByStatus(reports), [reports]);

  const attention = useMemo(
    () =>
      reports
        .filter((r) => r.status === REPORT_STATUS.NEW || isOverdue(r))
        .sort((a, b) => {
          const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
          const pa = rank[a.priority] ?? 9;
          const pb = rank[b.priority] ?? 9;
          if (pa !== pb) return pa - pb;
          return daysPending(b) - daysPending(a);
        })
        .slice(0, 5),
    [reports]
  );

  const recent = useMemo(
    () =>
      [...reports]
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 5),
    [reports]
  );

  const openReport = (id) => router.push(`/(gov)/report?id=${encodeURIComponent(id)}`);

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.paper }]}>
        <GovHeader agency={profile?.agency} onSignOut={signOut} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>Loading overview…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && reports.length === 0) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.paper }]}>
        <GovHeader agency={profile?.agency} onSignOut={signOut} />
        <ErrorState message={error} onRetry={load} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.paper }]}>
      <GovHeader
        agency={profile?.agency}
        onSignOut={signOut}
        subtitle={`Officer: ${profile?.full_name || 'Unassigned'}`}
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
          <View style={[styles.offline, { backgroundColor: colors.pinkSoft, borderColor: colors.pink }]}>
            <TriangleAlert color={colors.pink} size={14} />
            <Text style={[styles.offlineText, { color: colors.ink }]}>
              Response server unreachable — showing data stored on this device.
            </Text>
          </View>
        ) : null}

        {/* ── Summary ── */}
        <View style={styles.statRow}>
          <StatCard
            icon={Inbox}
            value={reports.length}
            label="Total Reports"
            tone={colors.blue}
            onPress={() => router.push('/(gov)/reports')}
          />
          <StatCard
            icon={CircleDot}
            value={counts.NEW}
            label="New"
            tone={colors.blue}
            onPress={() => router.push('/(gov)/reports?status=NEW')}
          />
        </View>

        <View style={styles.statRow}>
          <StatCard
            icon={Clock3}
            value={counts.UNDER_REVIEW}
            label="Under Review"
            tone={colors.orange}
            onPress={() => router.push('/(gov)/reports?status=UNDER_REVIEW')}
          />
          <StatCard
            icon={Wrench}
            value={counts.ACTION_TAKEN}
            label="Action Taken"
            tone={colors.primary}
            onPress={() => router.push('/(gov)/reports?status=ACTION_TAKEN')}
          />
        </View>

        <View style={styles.statRow}>
          <StatCard
            icon={CheckCircle2}
            value={counts.RESOLVED}
            label="Resolved"
            tone={colors.teal}
            onPress={() => router.push('/(gov)/reports?status=RESOLVED')}
          />
          <StatCard
            icon={Siren}
            value={alerts.length}
            label="Active SOS"
            tone={alerts.length > 0 ? colors.pink : colors.muted}
            onPress={() => router.push('/(gov)/sos')}
          />
        </View>

        {/* ── Smart SOS ── */}
        <SectionHeader
          title="Smart SOS"
          action={
            <Pressable onPress={() => router.push('/(gov)/sos')} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.link, { color: colors.primary }]}>View all</Text>
            </Pressable>
          }
        />
        {alerts.length === 0 ? (
          <View style={[styles.sosQuiet, { backgroundColor: colors.tealSoft, borderColor: colors.line }]}>
            <ShieldAlert color={colors.teal} size={18} />
            <Text style={[styles.sosQuietText, { color: colors.ink }]}>No active SOS alerts</Text>
          </View>
        ) : (
          alerts.slice(0, 2).map((alert) => (
            <Pressable
              key={alert.id}
              onPress={() => router.push('/(gov)/sos')}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.sosCard,
                { backgroundColor: colors.cardBg, borderColor: colors.pink },
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.sosIcon, { backgroundColor: colors.pinkSoft }]}>
                <Siren color={colors.pink} size={18} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.sosTitle, { color: colors.ink }]}>Alert {alert.id}</Text>
                <Text style={[styles.sosMeta, { color: colors.muted }]}>
                  {alert.status} · {relativeTime(alert.receivedAt)}
                </Text>
              </View>
              <ChevronRight color={colors.muted} size={18} />
            </Pressable>
          ))
        )}

        {/* ── Needs attention ── */}
        <SectionHeader
          title="Reports Requiring Attention"
          action={
            <Pressable onPress={() => router.push('/(gov)/more')} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.link, { color: colors.primary }]}>Pending</Text>
            </Pressable>
          }
        />
        {attention.length === 0 ? (
          <View style={[styles.quiet, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
            <CheckCircle2 color={colors.teal} size={18} />
            <Text style={[styles.quietText, { color: colors.muted }]}>
              Nothing outstanding. All caught up.
            </Text>
          </View>
        ) : (
          attention.map((report) => (
            <ReportRow key={report.id} report={report} onPress={() => openReport(report.id)} />
          ))
        )}

        {/* ── Recent ── */}
        <SectionHeader
          title="Recent Reports"
          action={
            <Pressable onPress={() => router.push('/(gov)/reports')} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.link, { color: colors.primary }]}>All reports</Text>
            </Pressable>
          }
        />
        {recent.length === 0 ? (
          <View style={[styles.quiet, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
            <Inbox color={colors.muted} size={18} />
            <Text style={[styles.quietText, { color: colors.muted }]}>No reports received yet.</Text>
          </View>
        ) : (
          recent.map((report) => (
            <ReportRow key={report.id} report={report} onPress={() => openReport(report.id)} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ReportRow({ report, onPress }) {
  const { colors } = useTheme();
  const pendingDays = daysPending(report);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open report ${report.id}, ${report.category}, ${report.status}`}
      style={({ pressed }) => [
        styles.reportCard,
        { backgroundColor: colors.cardBg, borderColor: colors.line },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.reportTop}>
        <Text style={[styles.reportCat, { color: colors.ink }]} numberOfLines={1}>
          {report.category}
        </Text>
        <Text style={[styles.reportAge, { color: colors.muted }]}>
          {pendingDays > 0 ? `${pendingDays}d ago` : relativeTime(report.createdAt)}
        </Text>
      </View>

      <View style={styles.reportLoc}>
        <MapPin color={colors.muted} size={13} />
        <Text style={[styles.reportLocText, { color: colors.muted }]} numberOfLines={1}>
          {report.locationLabel}
        </Text>
      </View>

      <View style={styles.badgeRow}>
        <StatusBadge status={report.status} size="sm" />
        <PriorityBadge priority={report.priority} size="sm" />
        {isOverdue(report) ? (
          <View style={[styles.overdue, { backgroundColor: colors.pinkSoft }]}>
            <Text style={[styles.overdueText, { color: colors.pink }]}>Overdue</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function relativeTime(ts) {
  if (!ts) return 'Unknown';
  const then = new Date(ts).getTime();
  if (Number.isNaN(then)) return 'Unknown';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.75 },

  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginBottom: 14,
  },
  offlineText: { flex: 1, fontSize: 11.5, fontWeight: '700', lineHeight: 16 },

  statRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  link: { fontSize: 12.5, fontWeight: '800' },

  sosQuiet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  sosQuietText: { fontSize: 13, fontWeight: '700' },
  sosCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    marginBottom: 9,
  },
  sosIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sosTitle: { fontSize: 14, fontWeight: '800' },
  sosMeta: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },

  quiet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  quietText: { fontSize: 13, fontWeight: '600' },

  reportCard: { borderRadius: 15, borderWidth: 1, padding: 13, marginBottom: 9 },
  reportTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  reportCat: { flex: 1, fontSize: 14.5, fontWeight: '800' },
  reportAge: { fontSize: 11, fontWeight: '700' },
  reportLoc: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5, marginBottom: 9 },
  reportLocText: { flex: 1, fontSize: 12, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  overdue: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  overdueText: { fontSize: 10, fontWeight: '800' },
});
