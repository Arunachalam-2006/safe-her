import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Inbox, MapPin, Search, X } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';
import { daysPending, fetchGovernmentReports, isOverdue } from '../../lib/government/govApi';
import {
  EmptyState,
  ErrorState,
  FilterChip,
  GovHeader,
  PriorityBadge,
  StatusBadge,
  STATUS_LABEL,
  STATUS_ORDER,
} from '../../components/government/GovUI';

const ALL = 'ALL';

export default function GovReportsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(
    params.status && STATUS_ORDER.includes(params.status) ? params.status : ALL
  );

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await fetchGovernmentReports();
      setReports(result.reports);
      setOffline(result.offline);
    } catch (err) {
      setError(err?.message || 'Could not load reports.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const map = { [ALL]: reports.length };
    STATUS_ORDER.forEach((s) => {
      map[s] = reports.filter((r) => r.status === s).length;
    });
    return map;
  }, [reports]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return reports
      .filter((r) => (statusFilter === ALL ? true : r.status === statusFilter))
      .filter((r) => {
        if (!term) return true;
        return [r.id, r.category, r.locationLabel, r.details, r.assignedTo]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term));
      })
      .sort((a, b) => {
        const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        const pa = rank[a.priority] ?? 9;
        const pb = rank[b.priority] ?? 9;
        if (pa !== pb) return pa - pb;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
  }, [reports, statusFilter, query]);

  const renderItem = useCallback(
    ({ item }) => (
      <ReportCard
        report={item}
        onPress={() => router.push(`/(gov)/report?id=${encodeURIComponent(item.id)}`)}
      />
    ),
    [router]
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.paper }]}>
      <GovHeader agency="Report Management" subtitle={`${reports.length} report${reports.length === 1 ? '' : 's'} on file`} />

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
          <Search color={colors.muted} size={17} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search ID, category, area…"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search reports"
            style={[styles.searchInput, { color: colors.ink }]}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
              <X color={colors.muted} size={16} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Filter chips */}
      <View style={styles.chipsWrap}>
        <FlatList
          horizontal
          data={[ALL, ...STATUS_ORDER]}
          keyExtractor={(s) => s}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          renderItem={({ item }) => (
            <FilterChip
              label={item === ALL ? 'All' : STATUS_LABEL[item]}
              count={counts[item] ?? 0}
              active={statusFilter === item}
              onPress={() => setStatusFilter(item)}
            />
          )}
        />
      </View>

      {offline ? (
        <View style={[styles.offline, { backgroundColor: colors.pinkSoft }]}>
          <Text style={[styles.offlineText, { color: colors.pink }]}>
            Offline — showing locally stored reports
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerText, { color: colors.muted }]}>Loading reports…</Text>
        </View>
      ) : error && reports.length === 0 ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
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
          ListEmptyComponent={
            <EmptyState
              icon={Inbox}
              title={query ? 'No matching reports' : 'No reports in this view'}
              message={
                query
                  ? `Nothing matches “${query.trim()}”. Try a different search.`
                  : 'Reports submitted by citizens will appear here automatically.'
              }
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

function ReportCard({ report, onPress }) {
  const { colors } = useTheme();
  const age = daysPending(report);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Report ${report.id}, ${report.category}, ${report.status}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.cardBg, borderColor: colors.line },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.cardId, { color: colors.muted }]}>{report.id}</Text>
        <Text style={[styles.cardAge, { color: colors.muted }]}>
          {age > 0 ? `${age}d pending` : 'Today'}
        </Text>
      </View>

      <Text style={[styles.cardCat, { color: colors.ink }]} numberOfLines={1}>
        {report.category}
      </Text>

      <View style={styles.cardLoc}>
        <MapPin color={colors.muted} size={13} />
        <Text style={[styles.cardLocText, { color: colors.muted }]} numberOfLines={1}>
          {report.locationLabel}
        </Text>
      </View>

      {report.details ? (
        <Text style={[styles.cardDetails, { color: colors.muted }]} numberOfLines={2}>
          {report.details}
        </Text>
      ) : null}

      <View style={styles.cardBadges}>
        <StatusBadge status={report.status} size="sm" />
        <PriorityBadge priority={report.priority} size="sm" />
        {isOverdue(report) ? (
          <View style={[styles.overdue, { backgroundColor: colors.pinkSoft }]}>
            <Text style={[styles.overdueText, { color: colors.pink }]}>Overdue</Text>
          </View>
        ) : null}
        {report.assignedTo ? (
          <View style={[styles.assignee, { backgroundColor: colors.primarySoft }]}>
            <Text style={[styles.assigneeText, { color: colors.primary }]} numberOfLines={1}>
              {report.assignedTo}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  centerText: { fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.75 },

  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 13,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600' },

  chipsWrap: { paddingBottom: 8 },
  chipsRow: { paddingHorizontal: 16, gap: 8 },

  offline: { marginHorizontal: 16, marginBottom: 8, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 11 },
  offlineText: { fontSize: 11.5, fontWeight: '700' },

  card: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardId: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },
  cardAge: { fontSize: 11, fontWeight: '700' },
  cardCat: { fontSize: 15.5, fontWeight: '800', marginTop: 4 },
  cardLoc: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  cardLocText: { flex: 1, fontSize: 12, fontWeight: '600' },
  cardDetails: { fontSize: 12, lineHeight: 17, marginTop: 7 },
  cardBadges: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 11, flexWrap: 'wrap' },
  overdue: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  overdueText: { fontSize: 10, fontWeight: '800' },
  assignee: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, maxWidth: 130 },
  assigneeText: { fontSize: 10, fontWeight: '800' },
});
