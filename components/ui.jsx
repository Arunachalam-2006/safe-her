import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

export const colors = {
  ink: '#12233F',
  teal: '#007F7B',
  tealSoft: '#E3F3F0',
  pink: '#E83D83',
  orange: '#F28C28',
  yellow: '#F4C95D',
  blue: '#3B72C4',
  muted: '#768196',
  line: '#E7ECF2',
  paper: '#F7F9FC',
  white: '#FFFFFF',
};

export function Screen({ children, scroll = true }) {
  const { ScrollView, SafeAreaView } = require('react-native');
  const Content = scroll ? ScrollView : View;
  return <SafeAreaView style={styles.safe}><Content contentContainerStyle={scroll ? styles.content : styles.fill} showsVerticalScrollIndicator={false}>{children}</Content></SafeAreaView>;
}

export function Header({ eyebrow, title, action }) {
  return <View style={styles.header}><View><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text></View>{action}</View>;
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, action }) {
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{children}</Text>{action}</View>;
}

export function ActionRow({ icon, title, subtitle, onPress, accent = colors.teal }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}><View style={[styles.iconBox, { backgroundColor: accent + '18' }]}>{icon}</View><View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View><ChevronRight color={colors.muted} size={18} /></Pressable>;
}

export function Pill({ children, tone = 'teal' }) {
  const toneColor = tone === 'orange' ? colors.orange : tone === 'pink' ? colors.pink : colors.teal;
  return <View style={[styles.pill, { backgroundColor: toneColor + '16' }]}><View style={[styles.dot, { backgroundColor: toneColor }]} /><Text style={[styles.pillText, { color: toneColor }]}>{children}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 20, paddingBottom: 36 },
  fill: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  eyebrow: { color: colors.teal, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: colors.line, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  pressed: { opacity: 0.65 },
  iconBox: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowCopy: { flex: 1 },
  rowTitle: { color: colors.ink, fontWeight: '700', fontSize: 15, marginBottom: 4 },
  rowSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  pill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  pillText: { fontSize: 11, fontWeight: '800' },
});
