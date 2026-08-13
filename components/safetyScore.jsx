import { StyleSheet, Text, View } from 'react-native';
import { ShieldCheck, TrendingUp } from 'lucide-react-native';
import { Card, colors, Pill } from './ui';

export function SafetyScore({ score = 82, label = 'Safe to travel' }) {
  return <Card style={styles.card}><View style={styles.top}><View><Text style={styles.label}>LIVE SAFETY SCORE</Text><View style={styles.scoreLine}><Text style={styles.score}>{score}</Text><Text style={styles.outOf}>/ 100</Text></View><Pill>{label}</Pill></View><View style={styles.shield}><ShieldCheck color={colors.teal} size={32} /></View></View><View style={styles.track}><View style={[styles.progress, { width: `${score}%` }]} /></View><View style={styles.meta}><View style={styles.metaItem}><TrendingUp color={colors.teal} size={15} /><Text style={styles.metaText}>+6 since yesterday</Text></View><Text style={styles.updated}>Updated 2 min ago</Text></View></Card>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.ink, borderColor: colors.ink },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  label: { color: '#AAB8CD', fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  scoreLine: { flexDirection: 'row', alignItems: 'baseline', marginVertical: 6 },
  score: { color: colors.white, fontSize: 48, fontWeight: '800', lineHeight: 52 },
  outOf: { color: '#AAB8CD', fontSize: 14, marginLeft: 5 },
  shield: { width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealSoft },
  track: { backgroundColor: '#344865', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 20 },
  progress: { backgroundColor: '#56C2A8', height: '100%', borderRadius: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: '#C4D0E1', fontSize: 12, fontWeight: '600' },
  updated: { color: '#8D9DB5', fontSize: 11 },
});
