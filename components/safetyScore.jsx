import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ShieldCheck, TrendingUp, Zap, Sun, Droplets, Clock, Building2, Siren, AlertTriangle } from 'lucide-react-native';
import { Card, Pill } from './ui';
import { useTheme } from '../lib/theme';

/**
 * SafetyScore card — renders the live safety score with real factor chips.
 *
 * Props:
 *   score      — numeric 0-100 (default 88)
 *   label      — human-readable status string
 *   factors    — { lighting, police, hospital, amenities, weather, time } (0-100)
 *   confidence — 0.0–1.0  (used for "Updated" line)
 *   loading    — show loading shimmer instead of data
 *   offline    — true when the score was generated from a fallback
 */
export function SafetyScore({
  score = 88,
  label = 'Safe Zone',
  factors = null,
  confidence = null,
  loading = false,
  offline = false,
}) {
  const { colors, isDark } = useTheme();
  const numericScore = typeof score === 'number' ? score : parseInt(score, 10) || 85;
  const isHighSafety = numericScore >= 75;

  const progressColor = isHighSafety
    ? colors.teal
    : numericScore >= 50
      ? colors.orange
      : colors.pink;

  const pillTone = isHighSafety ? 'teal' : numericScore >= 50 ? 'orange' : 'pink';

  // Build dynamic factor chips from real data
  const factorChips = _buildFactorChips(factors, colors);

  // Confidence label
  const confidenceLabel = confidence != null
    ? confidence >= 0.8
      ? 'High confidence'
      : confidence >= 0.5
        ? 'Moderate confidence'
        : 'Low confidence'
    : null;

  return (
    <Card
      style={[
        styles.card,
        {
          backgroundColor: colors.safetyCardBg,
          borderColor: colors.safetyCardBorder,
        },
      ]}
    >
      <View style={styles.top}>
        <View>
          <Text style={[styles.label, { color: isDark ? '#8B949E' : '#AAB8CD' }]}>LIVE SAFETY INDEX</Text>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: isDark ? '#8B949E' : '#AAB8CD' }]}>Analyzing area...</Text>
            </View>
          ) : (
            <>
              <View style={styles.scoreLine}>
                <Text style={[styles.score, { color: colors.safetyCardText }]}>{numericScore}</Text>
                <Text style={[styles.outOf, { color: isDark ? '#8B949E' : '#AAB8CD' }]}>/ 100</Text>
              </View>
              <Pill tone={pillTone}>{label}</Pill>
            </>
          )}
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
              backgroundColor: progressColor,
            },
          ]}
        />
      </View>

      {/* Factor Chips — real data or defaults */}
      <View style={styles.factorsRow}>
        {factorChips.map((chip, i) => (
          <View key={i} style={[styles.factorChip, { backgroundColor: isDark ? '#1C2938' : '#1C2C46' }]}>
            {chip.icon}
            <Text style={[styles.factorText, { color: isDark ? '#E6EDF3' : '#D5E1F2' }]}>{chip.text}</Text>
          </View>
        ))}
      </View>

      {/* Meta Footer */}
      <View style={[styles.meta, { borderTopColor: isDark ? '#1F2937' : '#1E3254' }]}>
        <View style={styles.metaItem}>
          {offline ? (
            <>
              <AlertTriangle color={colors.orange} size={15} />
              <Text style={[styles.metaText, { color: colors.orange }]}>Offline estimate</Text>
            </>
          ) : (
            <>
              <TrendingUp color={colors.teal} size={15} />
              <Text style={[styles.metaText, { color: isDark ? '#C9D1D9' : '#C4D0E1' }]}>
                {confidenceLabel ? `${confidenceLabel} · Live` : 'Live analysis'}
              </Text>
            </>
          )}
        </View>
        <Text style={[styles.updated, { color: isDark ? '#8B949E' : '#8D9DB5' }]}>
          {loading ? 'Loading...' : 'Updated just now'}
        </Text>
      </View>
    </Card>
  );
}

/**
 * Build factor chip data from real factors object.
 */
function _buildFactorChips(factors, colors) {
  if (!factors) {
    // Legacy fallback — show static chips
    return [
      { icon: <Zap color={colors.teal} size={12} />, text: '3 Patrols Nearby' },
      { icon: <Sun color={colors.yellow} size={12} />, text: '95% Lit' },
      { icon: <ShieldCheck color={colors.blue} size={12} />, text: 'Verified Zone' },
    ];
  }

  const chips = [];

  // Lighting chip
  const lighting = factors.lighting ?? 0;
  if (lighting >= 80) {
    chips.push({ icon: <Sun color={colors.teal} size={12} />, text: 'Well Lit Area' });
  } else if (lighting >= 55) {
    chips.push({ icon: <Sun color={colors.yellow} size={12} />, text: 'Partially Lit' });
  } else {
    chips.push({ icon: <Sun color={colors.orange} size={12} />, text: 'Low Lighting' });
  }

  // Police chip
  const police = factors.police ?? 0;
  if (police >= 75) {
    chips.push({ icon: <Siren color={colors.teal} size={12} />, text: 'Patrol Nearby' });
  } else {
    chips.push({ icon: <Siren color={colors.muted} size={12} />, text: 'No Patrol' });
  }

  // Weather chip
  const weather = factors.weather ?? 80;
  if (weather >= 80) {
    chips.push({ icon: <Droplets color={colors.blue} size={12} />, text: 'Clear Weather' });
  } else if (weather >= 50) {
    chips.push({ icon: <Droplets color={colors.yellow} size={12} />, text: 'Fair Weather' });
  } else {
    chips.push({ icon: <Droplets color={colors.orange} size={12} />, text: 'Poor Weather' });
  }

  // Time chip
  const time = factors.time ?? 80;
  if (time >= 80) {
    chips.push({ icon: <Clock color={colors.teal} size={12} />, text: 'Safe Hours' });
  } else if (time >= 55) {
    chips.push({ icon: <Clock color={colors.yellow} size={12} />, text: 'Evening Hours' });
  } else {
    chips.push({ icon: <Clock color={colors.orange} size={12} />, text: 'Late Night' });
  }

  return chips;
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
  loadingWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
  loadingText: { fontSize: 14, fontWeight: '600' },
});
