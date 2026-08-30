import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ShieldCheck, TrendingUp, Zap, Sun } from 'lucide-react-native';
import { Card, Pill } from './ui';
import { useTheme } from '../lib/theme';

export function SafetyScore({ score = 88, label = 'Safe Zone' }) {
  const { colors, isDark } = useTheme();
  const numericScore = typeof score === 'number' ? score : parseInt(score, 10) || 85;
  const isHighSafety = numericScore >= 75;
  
  const progressColor = isHighSafety 
    ? colors.teal 
    : numericScore >= 50 
      ? colors.orange 
      : colors.pink;

  const pillTone = isHighSafety ? 'teal' : numericScore >= 50 ? 'orange' : 'pink';

  return (
    <Card 
      style={[
        styles.card, 
        { 
          backgroundColor: colors.safetyCardBg, 
          borderColor: colors.safetyCardBorder 
        }
      ]}
    >
      <View style={styles.top}>
        <View>
          <Text style={[styles.label, { color: isDark ? '#8B949E' : '#AAB8CD' }]}>LIVE SAFETY INDEX</Text>
          <View style={styles.scoreLine}>
            <Text style={[styles.score, { color: colors.safetyCardText }]}>{numericScore}</Text>
            <Text style={[styles.outOf, { color: isDark ? '#8B949E' : '#AAB8CD' }]}>/ 100</Text>
          </View>
          <Pill tone={pillTone}>{label}</Pill>
        </View>
        <View style={[styles.shield, { backgroundColor: isHighSafety ? colors.tealSoft : colors.pinkSoft }]}>
          <ShieldCheck color={isHighSafety ? colors.teal : colors.pink} size={34} />
        </View>
      </View>

      {/* Dynamic Progress Track */}
      <View style={[styles.track, { backgroundColor: isDark ? '#1F2937' : '#263750' }]}>
        <View 
          style={[
            styles.progress, 
            { 
              width: `${Math.min(numericScore, 100)}%`, 
              backgroundColor: progressColor 
            }
          ]} 
        />
      </View>

      {/* Factor Chips */}
      <View style={styles.factorsRow}>
        <View style={[styles.factorChip, { backgroundColor: isDark ? '#1C2938' : '#1C2C46' }]}>
          <Zap color={colors.teal} size={12} />
          <Text style={[styles.factorText, { color: isDark ? '#E6EDF3' : '#D5E1F2' }]}>3 Patrols Nearby</Text>
        </View>
        <View style={[styles.factorChip, { backgroundColor: isDark ? '#1C2938' : '#1C2C46' }]}>
          <Sun color={colors.yellow} size={12} />
          <Text style={[styles.factorText, { color: isDark ? '#E6EDF3' : '#D5E1F2' }]}>95% Lit</Text>
        </View>
        <View style={[styles.factorChip, { backgroundColor: isDark ? '#1C2938' : '#1C2C46' }]}>
          <ShieldCheck color={colors.blue} size={12} />
          <Text style={[styles.factorText, { color: isDark ? '#E6EDF3' : '#D5E1F2' }]}>Verified Zone</Text>
        </View>
      </View>

      {/* Meta Footer */}
      <View style={[styles.meta, { borderTopColor: isDark ? '#1F2937' : '#1E3254' }]}>
        <View style={styles.metaItem}>
          <TrendingUp color={colors.teal} size={15} />
          <Text style={[styles.metaText, { color: isDark ? '#C9D1D9' : '#C4D0E1' }]}>+6 pts improvement in area safety</Text>
        </View>
        <Text style={[styles.updated, { color: isDark ? '#8B949E' : '#8D9DB5' }]}>Updated 1 min ago</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  label: { fontSize: 11, letterSpacing: 1.2, fontWeight: '800' },
  scoreLine: { flexDirection: 'row', alignItems: 'baseline', marginVertical: 6 },
  score: { fontSize: 50, fontWeight: '800', lineHeight: 54 },
  outOf: { fontSize: 15, marginLeft: 6, fontWeight: '700' },
  shield: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 18 },
  progress: { height: '100%', borderRadius: 4 },
  factorsRow: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  factorChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  factorText: { fontSize: 11, fontWeight: '700' },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTopWidth: 1 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, fontWeight: '600' },
  updated: { fontSize: 11 },
});
