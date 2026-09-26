import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';

/**
 * Shared building blocks for the onboarding flow so every step keeps the same
 * rhythm: top bar, progress, art, copy, actions.
 */

export function OnboardingTopBar({ onBack, onSkip, skipLabel = 'Skip' }) {
  const { colors } = useTheme();

  return (
    <View style={styles.topBar}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          android_ripple={{ color: colors.primarySoft, borderless: true, radius: 22 }}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.cardBg, borderColor: colors.line },
            pressed && styles.pressed,
          ]}
        >
          <ArrowLeft color={colors.ink} size={20} />
        </Pressable>
      ) : (
        <View style={styles.iconButtonSpacer} />
      )}

      {onSkip ? (
        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel={skipLabel}
          hitSlop={10}
          android_ripple={{ color: colors.primarySoft, borderless: true, radius: 30 }}
          style={({ pressed }) => [styles.skipWrap, pressed && styles.pressed]}
        >
          <Text style={[styles.skipText, { color: colors.muted }]}>{skipLabel}</Text>
        </Pressable>
      ) : (
        <View style={styles.iconButtonSpacer} />
      )}
    </View>
  );
}

export function ProgressDots({ total, index }) {
  const { colors } = useTheme();

  return (
    <View
      style={styles.dots}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${index + 1} of ${total}`}
      accessibilityValue={{ min: 1, max: total, now: index + 1 }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const active = i <= index;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              {
                width: active ? 20 : 7,
                backgroundColor: active ? colors.primary : colors.line,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export function PrimaryButton({ label, onPress, icon: Icon, tone = 'primary', disabled = false }) {
  const { colors } = useTheme();
  const background = tone === 'sos' ? colors.sosBg : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: 'rgba(255,255,255,0.22)' }}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: background },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={styles.primaryText}>{label}</Text>
      {Icon ? <Icon color="#FFFFFF" size={19} /> : null}
    </Pressable>
  );
}

export function GhostButton({ label, onPress, icon: Icon }) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.primarySoft }}
      style={({ pressed }) => [
        styles.ghost,
        { borderColor: colors.line, backgroundColor: colors.cardBg },
        pressed && styles.pressed,
      ]}
    >
      {Icon ? <Icon color={colors.ink} size={18} /> : null}
      <Text style={[styles.ghostText, { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

/** Small footnote used to keep the product copy honest. */
export function FinePrint({ children, icon: Icon }) {
  const { colors } = useTheme();

  return (
    <View style={styles.finePrint}>
      {Icon ? <Icon color={colors.muted} size={14} /> : null}
      <Text style={[styles.finePrintText, { color: colors.muted }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 10 : 4,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconButtonSpacer: { width: 44, height: 44 },
  skipWrap: {
    minHeight: 44,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: { fontSize: 14, fontWeight: '700' },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
  },
  dot: { height: 7, borderRadius: 4 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
  primary: {
    height: 56,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#1E1B4B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  primaryText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '800', letterSpacing: 0.2 },
  ghost: {
    height: 52,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1.5,
  },
  ghostText: { fontSize: 14.5, fontWeight: '700' },
  finePrint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 14,
    paddingHorizontal: 4,
  },
  finePrintText: { flex: 1, fontSize: 11.5, lineHeight: 17, fontWeight: '600' },
});
