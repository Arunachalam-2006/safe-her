import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Building2,
  CheckCircle2,
  CircleDot,
  Clock3,
  Inbox,
  LogOut,
  Search,
  ShieldAlert,
  Siren,
  Wrench,
  XCircle,
} from 'lucide-react-native';
import { useTheme } from '../../lib/theme';

/* ── Workflow vocabulary ────────────────────────────────────────────────
   Single source of truth shared by every government screen.            */

export const REPORT_STATUS = {
  NEW: 'NEW',
  UNDER_REVIEW: 'UNDER_REVIEW',
  ACTION_TAKEN: 'ACTION_TAKEN',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
};

export const STATUS_ORDER = [
  REPORT_STATUS.NEW,
  REPORT_STATUS.UNDER_REVIEW,
  REPORT_STATUS.ACTION_TAKEN,
  REPORT_STATUS.RESOLVED,
  REPORT_STATUS.CLOSED,
];

export const STATUS_LABEL = {
  NEW: 'New',
  UNDER_REVIEW: 'Under Review',
  ACTION_TAKEN: 'Action Taken',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

/** Only these transitions are offered in the UI. */
export const STATUS_TRANSITIONS = {
  NEW: [REPORT_STATUS.UNDER_REVIEW, REPORT_STATUS.ACTION_TAKEN, REPORT_STATUS.RESOLVED, REPORT_STATUS.CLOSED],
  UNDER_REVIEW: [REPORT_STATUS.ACTION_TAKEN, REPORT_STATUS.RESOLVED, REPORT_STATUS.CLOSED],
  ACTION_TAKEN: [REPORT_STATUS.RESOLVED, REPORT_STATUS.CLOSED],
  RESOLVED: [REPORT_STATUS.CLOSED],
  CLOSED: [],
};

export const PRIORITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

export const PRIORITY_LABEL = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

const STATUS_META = {
  NEW: { icon: CircleDot, label: 'New' },
  UNDER_REVIEW: { icon: Clock3, label: 'Under Review' },
  ACTION_TAKEN: { icon: Wrench, label: 'Action Taken' },
  RESOLVED: { icon: CheckCircle2, label: 'Resolved' },
  CLOSED: { icon: XCircle, label: 'Closed' },
};

const PRIORITY_META = {
  LOW: { icon: CircleDot, label: 'Low' },
  MEDIUM: { icon: Clock3, label: 'Medium' },
  HIGH: { icon: Siren, label: 'High' },
  CRITICAL: { icon: ShieldAlert, label: 'Critical' },
};

function resolveColor(colors, key, fallback) {
  const value = colors?.[key];
  return typeof value === 'string' && value.length ? value : fallback;
}

/* ── Badges (always icon + text, never colour alone) ─────────────────── */

export function StatusBadge({ status, size = 'md' }) {
  const { colors } = useTheme();
  const meta = STATUS_META[status] || STATUS_META.NEW;
  const Icon = meta.icon;

  const tone =
    status === REPORT_STATUS.RESOLVED
      ? resolveColor(colors, 'teal', '#059669')
      : status === REPORT_STATUS.CLOSED
        ? colors.muted
        : status === REPORT_STATUS.ACTION_TAKEN
          ? colors.primary
          : status === REPORT_STATUS.UNDER_REVIEW
            ? resolveColor(colors, 'orange', '#F97316')
            : resolveColor(colors, 'blue', '#0284C7');

  const small = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        small && styles.badgeSm,
        { backgroundColor: tone + '1F', borderColor: tone + '55' },
      ]}
    >
      <Icon color={tone} size={small ? 11 : 13} />
      <Text style={[styles.badgeText, small && styles.badgeTextSm, { color: tone }]}>
        {meta.label}
      </Text>
    </View>
  );
}

export function PriorityBadge({ priority, size = 'md' }) {
  const { colors } = useTheme();
  const meta = PRIORITY_META[priority] || PRIORITY_META.LOW;
  const Icon = meta.icon;

  const tone =
    priority === PRIORITY.CRITICAL
      ? resolveColor(colors, 'pink', '#EC4899')
      : priority === PRIORITY.HIGH
        ? resolveColor(colors, 'orange', '#F97316')
        : priority === PRIORITY.MEDIUM
          ? resolveColor(colors, 'yellow', '#EAB308')
          : resolveColor(colors, 'teal', '#059669');

  const small = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        small && styles.badgeSm,
        { backgroundColor: tone + '1F', borderColor: tone + '55' },
      ]}
    >
      <Icon color={tone} size={small ? 11 : 13} />
      <Text style={[styles.badgeText, small && styles.badgeTextSm, { color: tone }]}>
        {meta.label}
      </Text>
    </View>
  );
}

/* ── Header ─────────────────────────────────────────────────────────── */

export function GovHeader({ agency, subtitle, onSignOut }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.header, { backgroundColor: colors.ink, borderBottomColor: colors.line }]}>
      <View style={styles.headerRow}>
        <View style={[styles.headerMark, { backgroundColor: colors.primarySoft }]}>
          <Building2 color={colors.primary} size={20} />
        </View>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerEyebrow}>Safe-Her · Response Desk</Text>
          <Text style={styles.headerAgency} numberOfLines={1}>
            {agency || 'Government Dashboard'}
          </Text>
        </View>
        {onSignOut ? (
          <Pressable
            onPress={onSignOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            hitSlop={10}
            android_ripple={{ color: colors.primary, borderless: true, radius: 24 }}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
          >
            <LogOut color={colors.ink} size={18} />
          </Pressable>
        ) : null}
      </View>
      {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
    </View>
  );
}

/* ── Stat card ──────────────────────────────────────────────────────── */

export function StatCard({ icon: Icon, value, label, tone, onPress }) {
  const { colors } = useTheme();
  const accent = tone || colors.primary;

  const body = (
    <View style={[styles.statCard, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
      <View style={[styles.statIcon, { backgroundColor: accent + '1A' }]}>
        {Icon ? <Icon color={accent} size={17} /> : null}
      </View>
      <Text style={[styles.statValue, { color: colors.ink }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.muted }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.statWrap, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

/* ── Filter chip ────────────────────────────────────────────────────── */

export function FilterChip({ label, count, active, onPress, icon: Icon }) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      android_ripple={{ color: colors.primarySoft }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.cardBg,
          borderColor: active ? colors.primary : colors.line,
        },
        pressed && styles.pressed,
      ]}
    >
      {Icon ? <Icon color={active ? '#FFFFFF' : colors.muted} size={13} /> : null}
      <Text style={[styles.chipText, { color: active ? '#FFFFFF' : colors.ink }]}>{label}</Text>
      {count != null ? (
        <View style={[styles.chipCount, { backgroundColor: active ? 'rgba(255,255,255,0.22)' : colors.paper }]}>
          <Text style={[styles.chipCountText, { color: active ? '#FFFFFF' : colors.muted }]}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/* ── Buttons ────────────────────────────────────────────────────────── */

export function PrimaryButton({ label, onPress, icon: Icon, tone, disabled, busy, style }) {
  const { colors } = useTheme();
  const bg = tone || colors.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || busy) }}
      android_ripple={{ color: 'rgba(255,255,255,0.22)' }}
      style={({ pressed }) => [
        styles.primaryBtn,
        { backgroundColor: bg },
        (disabled || busy) && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : Icon ? <Icon color="#FFFFFF" size={17} /> : null}
      <Text style={styles.primaryBtnText}>{busy ? 'Working…' : label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, icon: Icon, tone, style }) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.primarySoft }}
      style={({ pressed }) => [
        styles.secondaryBtn,
        { backgroundColor: colors.cardBg, borderColor: colors.line },
        pressed && styles.pressed,
        style,
      ]}
    >
      {Icon ? <Icon color={tone || colors.ink} size={17} /> : null}
      <Text style={[styles.secondaryBtnText, { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

/* ── Screen states ──────────────────────────────────────────────────── */

export function LoadingState({ label = 'Loading…' }) {
  const { colors } = useTheme();

  return (
    <View style={styles.stateBox}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.stateTitle, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title = 'Nothing here yet', message, icon: Icon = Inbox, action }) {
  const { colors } = useTheme();

  return (
    <View style={styles.stateBox}>
      <View style={[styles.stateIcon, { backgroundColor: colors.primarySoft }]}>
        <Icon color={colors.primary} size={24} />
      </View>
      <Text style={[styles.stateTitle, { color: colors.ink }]}>{title}</Text>
      {message ? <Text style={[styles.stateMessage, { color: colors.muted }]}>{message}</Text> : null}
      {action}
    </View>
  );
}

export function ErrorState({ message = 'Something went wrong', onRetry }) {
  const { colors } = useTheme();

  return (
    <View style={styles.stateBox}>
      <View style={[styles.stateIcon, { backgroundColor: colors.pinkSoft }]}>
        <XCircle color={colors.pink} size={24} />
      </View>
      <Text style={[styles.stateTitle, { color: colors.ink }]}>Unable to load</Text>
      <Text style={[styles.stateMessage, { color: colors.muted }]}>{message}</Text>
      {onRetry ? (
        <View style={styles.retryWrap}>
          <SecondaryButton label="Try Again" onPress={onRetry} icon={Search} />
        </View>
      ) : null}
    </View>
  );
}

/* ── Success toast (inline, avoids ToastAndroid dependency) ─────────── */

export function SuccessBanner({ message, onDismiss }) {
  const { colors } = useTheme();
  if (!message) return null;

  return (
    <View style={[styles.banner, { backgroundColor: colors.tealSoft, borderColor: colors.teal }]}>
      <CheckCircle2 color={colors.teal} size={16} />
      <Text style={[styles.bannerText, { color: colors.ink }]}>{message}</Text>
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
          <XCircle color={colors.teal} size={16} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function SectionHeader({ title, action }) {
  const { colors } = useTheme();

  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.ink }]}>{title}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeSm: { paddingHorizontal: 6, paddingVertical: 3, gap: 3 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  badgeTextSm: { fontSize: 10 },

  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  headerMark: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerTextWrap: { flex: 1 },
  headerEyebrow: { color: '#A5B4FC', fontSize: 9.5, fontWeight: '800', letterSpacing: 1.1, marginBottom: 2 },
  headerAgency: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  headerSub: { color: '#C7D2FE', fontSize: 11.5, fontWeight: '600', marginTop: 6 },
  headerBtn: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  statWrap: { flex: 1 },
  statCard: { borderRadius: 16, borderWidth: 1, padding: 12, minHeight: 92 },
  statIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
  statLabel: { fontSize: 10.5, fontWeight: '700', marginTop: 1, lineHeight: 14 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipText: { fontSize: 12.5, fontWeight: '700' },
  chipCount: { paddingHorizontal: 6, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  chipCountText: { fontSize: 10, fontWeight: '800' },

  primaryBtn: {
    height: 50,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800' },
  secondaryBtn: {
    height: 48,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    borderWidth: 1.5,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },

  stateBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 34, paddingHorizontal: 26, gap: 6 },
  stateIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  stateTitle: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  stateMessage: { fontSize: 12.5, lineHeight: 18, textAlign: 'center', fontWeight: '600' },
  retryWrap: { marginTop: 12 },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  bannerText: { flex: 1, fontSize: 12.5, fontWeight: '700' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 4 },
  sectionTitle: { fontSize: 15.5, fontWeight: '800', letterSpacing: -0.2 },
});
