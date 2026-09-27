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
import {
  BarChart3,
  Bell,
  ChevronRight,
  ClipboardList,
  Info,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
} from 'lucide-react-native';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { countByStatus, fetchActiveSosAlerts, fetchGovernmentReports, daysPending, isOverdue } from '../../lib/government/govApi';
import { ErrorState, GovHeader, SectionHeader } from '../../components/government/GovUI';

export default function GovMoreScreen() {
  const router = useRouter();
  const { colors, themeName, setThemeName } = useTheme();
  const { profile, signOut } = useAuth();

  const [reports, setReports] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [r, s] = await Promise.all([fetchGovernmentReports(), fetchActiveSosAlerts()]);
      setReports(r.reports);
      setAlerts(s.alerts);
      setOffline(r.offline || s.offline);
    } catch (err) {
      setError(err?.message || 'Could not load dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => countByStatus(reports), [reports]);
  const openCount = reports.length - counts.RESOLVED - counts.CLOSED;
  const overdueCount = useMemo(() => reports.filter((r) => isOverdue(r)).length, [reports]);
  const oldestOpen = useMemo(
    () => reports.filter((r) => r.status !== 'CLOSED' && r.status !== 'RESOLVED')
      .reduce((max, r) => Math.max(max, daysPending(r)), 0),
    [reports]
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.paper }]}>
      <GovHeader
        agency={profile?.agency}
        subtitle={profile?.full_name || 'Officer'}
        onSignOut={signOut}
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
            <Text style={[styles.offlineText, { color: colors.pink }]}>
              Offline — showing locally stored data
            </Text>
          </View>
        ) : null}

        {error && reports.length === 0 ? <ErrorState message={error} onRetry={load} /> : null}

        <SectionHeader title="Case Management" />
        <NavRow
          icon={ClipboardList}
          label="Pending & Overdue Reports"
          value={openCount > 0 ? `${openCount} open` : 'All clear'}
          tone={openCount > 0 ? colors.orange : colors.teal}
          onPress={() => router.push('/(gov)/pending')}
        />
        <NavRow
          icon={BarChart3}
          label="Analytics"
          value={`${reports.length} total`}
          tone={colors.primary}
          onPress={() => router.push('/(gov)/analytics')}
        />
        <NavRow
          icon={Bell}
          label="Active SOS Alerts"
          value={alerts.length > 0 ? `${alerts.length} active` : 'None'}
          tone={alerts.length > 0 ? colors.pink : colors.muted}
          onPress={() => router.push('/(gov)/sos')}
        />

        <View style={styles.sectionGap} />
        <SectionHeader title="Account" />
        <View style={[styles.profileCard, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
            <UserRound color={colors.primary} size={22} />
          </View>
          <View style={styles.profileText}>
            <Text style={[styles.profileName, { color: colors.ink }]}>
              {profile?.full_name || 'Officer'}
            </Text>
            <Text style={[styles.profileMeta, { color: colors.muted }]}>
              {profile?.agency || 'SafeHer Response Desk'}
            </Text>
            <Text style={[styles.profileRole, { color: colors.primary }]}>Government account</Text>
          </View>
        </View>

        <View style={styles.sectionGap} />
        <SectionHeader title="Settings" />
        <NavRow
          icon={themeName === 'midnight' ? Sun : Moon}
          label="Appearance"
          value={themeName === 'midnight' ? 'Midnight Shield' : 'Blossom Luxe'}
          tone={colors.primary}
          onPress={() => setThemeName(themeName === 'midnight' ? 'blossom' : 'midnight')}
        />

        <View style={styles.sectionGap} />
        <SectionHeader title="About" />
        <View style={[styles.aboutCard, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
          <ShieldCheck color={colors.primary} size={20} />
          <View style={styles.aboutText}>
            <Text style={[styles.aboutTitle, { color: colors.ink }]}>Safe-Her Response Desk</Text>
            <Text style={[styles.aboutBody, { color: colors.muted }]}>
              Officer dashboard for reviewing, acting on and closing community safety reports.
              Citizen data is read-only; every officer action is recorded against the report.
            </Text>
            <Text style={[styles.aboutNote, { color: colors.muted }]}>
              Information shown here assists review and does not by itself establish the facts of
              an incident.
            </Text>
          </View>
        </View>

        <Pressable
          onPress={signOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          android_ripple={{ color: colors.pinkSoft }}
          style={({ pressed }) => [
            styles.signOut,
            { backgroundColor: colors.cardBg, borderColor: colors.pink },
            pressed && styles.pressed,
          ]}
        >
          <LogOut color={colors.pink} size={18} />
          <Text style={[styles.signOutText, { color: colors.pink }]}>Sign out</Text>
        </Pressable>

        {loading ? <Text style={[styles.loading, { color: colors.muted }]}>Loading…</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function NavRow({ icon: Icon, label, value, tone, onPress }) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.primarySoft }}
      style={({ pressed }) => [
        styles.navRow,
        { backgroundColor: colors.cardBg, borderColor: colors.line },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.navIcon, { backgroundColor: (tone || colors.primary) + '1C' }]}>
        <Icon color={tone || colors.primary} size={18} />
      </View>
      <View style={styles.navText}>
        <Text style={[styles.navLabel, { color: colors.ink }]}>{label}</Text>
        {value ? <Text style={[styles.navValue, { color: colors.muted }]}>{value}</Text> : null}
      </View>
      <ChevronRight color={colors.muted} size={19} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 28 },
  pressed: { opacity: 0.75 },
  loading: { fontSize: 12.5, fontWeight: '600', textAlign: 'center', paddingVertical: 14 },
  sectionGap: { height: 10 },

  offline: { borderRadius: 10, paddingVertical: 7, paddingHorizontal: 11, marginBottom: 12 },
  offlineText: { fontSize: 11.5, fontWeight: '700' },

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 15,
    borderWidth: 1,
    padding: 13,
    marginBottom: 9,
    minHeight: 60,
  },
  navIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  navText: { flex: 1 },
  navLabel: { fontSize: 14, fontWeight: '700' },
  navValue: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },

  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 16, borderWidth: 1, padding: 14 },
  avatar: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  profileText: { flex: 1 },
  profileName: { fontSize: 15.5, fontWeight: '800' },
  profileMeta: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  profileRole: { fontSize: 11, fontWeight: '800', marginTop: 4 },

  aboutCard: { flexDirection: 'row', gap: 12, borderRadius: 16, borderWidth: 1, padding: 14 },
  aboutText: { flex: 1 },
  aboutTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  aboutBody: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  aboutNote: { fontSize: 11, lineHeight: 16, fontWeight: '600', marginTop: 8, fontStyle: 'italic' },

  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    height: 50,
    borderRadius: 15,
    borderWidth: 1.5,
    marginTop: 18,
  },
  signOutText: { fontSize: 14, fontWeight: '800' },
});
