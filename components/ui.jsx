import React from 'react';
import { Pressable, StyleSheet, Text, View, ScrollView, SafeAreaView } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme, blossomTheme } from '../lib/theme';

// Export legacy static colors for any direct import fallbacks
export const colors = blossomTheme.colors;

export function Screen({ children, scroll = true }) {
  const { colors } = useTheme();
  const Content = scroll ? ScrollView : View;
  
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]}>
      <Content 
        contentContainerStyle={scroll ? styles.content : styles.fill} 
        showsVerticalScrollIndicator={false}
      >
        {children}
      </Content>
    </SafeAreaView>
  );
}

export function Header({ eyebrow, title, action }) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        {eyebrow ? (
          <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text>
        ) : null}
        <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

export function Card({ children, style }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.cardBg,
          borderColor: colors.cardBorder,
          shadowColor: colors.cardShadow,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children, action }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.ink }]}>{children}</Text>
      {action}
    </View>
  );
}

export function ActionRow({ icon, title, subtitle, onPress, accent }) {
  const { colors } = useTheme();
  const iconAccent = accent || colors.primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        { borderBottomColor: colors.line },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: iconAccent + '1C' }]}>
        {icon}
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: colors.ink }]}>{title}</Text>
        <Text style={[styles.rowSubtitle, { color: colors.muted }]}>{subtitle}</Text>
      </View>
      <ChevronRight color={colors.muted} size={18} />
    </Pressable>
  );
}

export function Pill({ children, tone = 'primary' }) {
  const { colors } = useTheme();
  let toneColor = colors.primary;

  if (tone === 'orange') toneColor = colors.orange;
  else if (tone === 'pink') toneColor = colors.pink;
  else if (tone === 'teal' || tone === 'green') toneColor = colors.teal;
  else if (tone === 'blue') toneColor = colors.blue;

  return (
    <View style={[styles.pill, { backgroundColor: toneColor + '1F' }]}>
      <View style={[styles.dot, { backgroundColor: toneColor }]} />
      <Text style={[styles.pillText, { color: toneColor }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  fill: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 6 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -0.5 },
  card: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  pressed: { opacity: 0.7 },
  iconBox: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  rowCopy: { flex: 1 },
  rowTitle: { fontWeight: '700', fontSize: 15, marginBottom: 3 },
  rowSubtitle: { fontSize: 12, lineHeight: 17 },
  pill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  pillText: { fontSize: 11, fontWeight: '800' },
});
