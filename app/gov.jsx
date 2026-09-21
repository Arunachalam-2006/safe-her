import { useEffect, useState, useCallback } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { AlertTriangle, Building2, CheckCircle2, Clock3, LogOut, MapPin, MessageSquareWarning, TrendingUp, UsersRound } from 'lucide-react-native';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { getReports, subscribeReports } from '../lib/localReports';
import { Card, Pill, Screen, SectionTitle } from '../components/ui';

export default function GovDashboard() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { colors, isDark } = useTheme();
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState({ total: 0, today: 0, byCategory: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const rows = [...getReports()];
    setReports(rows);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayCount = rows.filter((r) => new Date(r.created_at) >= todayStart).length;
    const catMap = {};
    rows.forEach((r) => { catMap[r.category] = (catMap[r.category] || 0) + 1; });
    const byCategory = Object.entries(catMap).map(([cat, count]) => ({ cat, count })).sort((a, b) => b.count - a.count).slice(0, 5);
    setStats({ total: rows.length, today: todayCount, byCategory });
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
    return subscribeReports(loadData);
  }, [loadData]);

  async function handleSignOut() {
    await signOut();
  }

  if (loading) {
    return <View style={[s.loading, { backgroundColor: colors.paper }]}><ActivityIndicator size="large" color={colors.teal} /></View>;
  }

  const maxCat = Math.max(...stats.byCategory.map((c) => c.count), 1);

  return (
    <Screen>
      <View style={s.topBar}>
        <View style={s.topLeft}>
          <View style={[s.agencyBadge, { backgroundColor: colors.ink }]}><Building2 color={colors.cardBg} size={18} /></View>
          <View><Text style={[s.govLabel, { color: colors.teal }]}>GOVERNMENT DASHBOARD</Text><Text style={[s.agencyName, { color: colors.ink }]}>{profile?.agency || 'SafeHer Official'}</Text></View>
        </View>
        <Pressable onPress={handleSignOut} style={[s.logoutBtn, { backgroundColor: colors.cardBg, borderColor: colors.line }]}><LogOut color={colors.ink} size={18} /></Pressable>
      </View>

      <View style={s.statGrid}>
        <View style={[s.statCard, { backgroundColor: colors.cardBg, borderColor: colors.line }]}><UsersRound color={colors.teal} size={20} /><Text style={[s.statValue, { color: colors.ink }]}>{stats.total}</Text><Text style={[s.statLabel, { color: colors.muted }]}>Total reports</Text></View>
        <View style={[s.statCard, { backgroundColor: colors.cardBg, borderColor: colors.line }]}><Clock3 color={colors.orange} size={20} /><Text style={[s.statValue, { color: colors.ink }]}>{stats.today}</Text><Text style={[s.statLabel, { color: colors.muted }]}>Today</Text></View>
      </View>

      <SectionTitle>Reports by category</SectionTitle>
      <Card>
        {stats.byCategory.length === 0 ? <Text style={[s.empty, { color: colors.muted }]}>No reports yet.</Text> : stats.byCategory.map((c) => (
          <View key={c.cat} style={s.barRow}>
            <Text style={[s.barLabel, { color: colors.ink }]}>{c.cat}</Text>
            <View style={[s.barTrack, { backgroundColor: colors.paper }]}><View style={[s.barFill, { width: `${(c.count / maxCat) * 100}%`, backgroundColor: colors.teal }]} /></View>
            <Text style={[s.barCount, { color: colors.ink }]}>{c.count}</Text>
          </View>
        ))}
      </Card>

      <SectionTitle action={<Text style={[s.liveLabel, { color: colors.teal }]}>Live</Text>}>Recent community reports</SectionTitle>
      <FlatList
        data={reports.slice(0, 20)}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={colors.teal} />}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <Card style={s.reportCard}>
            <View style={s.reportTop}>
              <Pill tone={categoryTone(item.category)}>{item.category}</Pill>
              <Text style={[s.reportTime, { color: colors.muted }]}>{formatTime(item.created_at)}</Text>
            </View>
            <View style={s.reportLoc}><MapPin color={colors.muted} size={14} /><Text style={[s.reportLocText, { color: colors.ink }]}>{item.location_label}</Text></View>
            {item.details ? <Text style={[s.reportDetails, { color: colors.muted }]}>{item.details}</Text> : null}
            {item.image_uri ? <Image source={{ uri: item.image_uri }} style={s.reportImage} /> : null}
            <View style={[s.reportActions, { borderTopColor: colors.line }]}>
              <Pressable style={s.reviewBtn}><CheckCircle2 color={colors.teal} size={16} /><Text style={[s.reviewText, { color: colors.teal }]}>Mark reviewed</Text></Pressable>
            </View>
          </Card>
        )}
        ListEmptyComponent={<Card><Text style={[s.empty, { color: colors.muted }]}>No community reports have been submitted yet.</Text></Card>}
      />
    </Screen>
  );
}

function categoryTone(cat) {
  const map = { 'Harassment': 'pink', 'Theft': 'pink', 'Suspicious activity': 'orange', 'Poor lighting': 'orange', 'Broken CCTV': 'orange', 'Unsafe stop': 'orange' };
  return map[cat] || 'teal';
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffH = Math.floor((now - d) / 3600000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString();
}

const s = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  agencyBadge: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  govLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 3 },
  agencyName: { fontSize: 19, fontWeight: '800' },
  logoutBtn: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statGrid: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: { flex: 1, borderRadius: 18, padding: 16, borderWidth: 1 },
  statValue: { fontSize: 30, fontWeight: '800', marginTop: 10, marginBottom: 2 },
  statLabel: { fontSize: 12, fontWeight: '600' },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  barLabel: { width: 110, fontSize: 12, fontWeight: '700' },
  barTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden', marginHorizontal: 10 },
  barFill: { height: '100%', borderRadius: 5 },
  barCount: { width: 28, textAlign: 'right', fontWeight: '800', fontSize: 13 },
  liveLabel: { fontSize: 12, fontWeight: '700' },
  reportCard: { marginBottom: 12 },
  reportTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  reportTime: { fontSize: 11, fontWeight: '600' },
  reportLoc: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  reportLocText: { fontSize: 14, fontWeight: '700' },
  reportDetails: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  reportImage: { width: '100%', height: 150, borderRadius: 12, marginBottom: 12 },
  reportActions: { flexDirection: 'row', gap: 8, borderTopWidth: 1, paddingTop: 12 },
  reviewBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reviewText: { fontSize: 12, fontWeight: '800' },
});
