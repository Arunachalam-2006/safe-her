import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info, LockKeyhole, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';

/**
 * Authentication screen primitives.
 *
 * These deliberately reuse the existing Safe-Her theme, the same shield mark as
 * the splash, and the same dark hero used by the previous auth screen, so the
 * flow feels like part of the product rather than a bolted-on layer.
 */

export function AuthHero({ title, subtitle }) {
  const { colors, isDark } = useTheme();

  return (
    <View style={[s.hero, { backgroundColor: isDark ? '#090D14' : '#1E1B4B' }]}>
      <View style={[s.mark, { backgroundColor: colors.primarySoft }]}>
        <ShieldCheck color={colors.primary} size={26} />
      </View>
      <Text style={s.brand}>Safe-Her</Text>
      <Text style={s.tagline}>Safer journeys, together</Text>
      {title ? <Text style={s.heroTitle}>{title}</Text> : null}
      {subtitle ? <Text style={s.heroSub}>{subtitle}</Text> : null}
    </View>
  );
}

export function AuthCard({ children }) {
  const { colors } = useTheme();
  return (
    <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>{children}</View>
  );
}

export function AuthField({
  label,
  error,
  icon: Icon,
  rightIcon,
  onRightPress,
  ...props
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.pink : focused ? colors.primary : colors.line;

  return (
    <View style={s.fieldWrap}>
      {label ? <Text style={[s.label, { color: colors.muted }]}>{label.toUpperCase()}</Text> : null}
      <View
        style={[
          s.field,
          { backgroundColor: colors.paper, borderColor },
          focused && { borderWidth: 1.6 },
        ]}
      >
        {Icon ? <Icon color={error ? colors.pink : colors.muted} size={17} /> : null}
        <TextInput
          placeholderTextColor={colors.muted}
          accessibilityLabel={label || props.placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
          style={[s.input, { color: colors.ink, outlineStyle: 'none' }]}
        />
        {rightIcon}
      </View>
      {error ? (
        <View style={s.errorRow}>
          <AlertCircle color={colors.pink} size={13} />
          <Text style={[s.errorText, { color: colors.pink }]}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function PasswordField(props) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <AuthField
      icon={LockKeyhole}
      {...props}
      secureTextEntry={!visible}
      rightIcon={
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff color={colors.muted} size={18} /> : <Eye color={colors.muted} size={18} />}
        </Pressable>
      }
    />
  );
}

export function PasswordStrength({ score, hint }) {
  const { colors } = useTheme();
  if (!score) return null;

  const tone =
    score === 1 ? colors.pink : score === 2 ? colors.orange : score === 3 ? colors.yellow : colors.teal;
  const label = score === 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Good' : 'Strong';

  return (
    <View style={s.strengthWrap}>
      <View style={s.strengthRow}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[s.strengthBar, { backgroundColor: i <= score ? tone : colors.line }]}
          />
        ))}
        <Text style={[s.strengthLabel, { color: tone }]}>{label}</Text>
      </View>
      {hint ? <Text style={[s.strengthHint, { color: colors.muted }]}>{hint}</Text> : null}
    </View>
  );
}

export function AuthButton({ label, onPress, busy, disabled, tone, icon: Icon }) {
  const { colors } = useTheme();
  const bg = tone || colors.primary;
  const isDisabled = disabled || busy;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!busy }}
      android_ripple={{ color: 'rgba(255,255,255,0.22)' }}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg },
        isDisabled && s.buttonDisabled,
        pressed && !isDisabled && s.pressed,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : Icon ? <Icon color="#FFFFFF" size={18} /> : null}
      <Text style={s.buttonText}>{busy ? 'Please wait…' : label}</Text>
    </Pressable>
  );
}

export function AuthError({ message }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View style={[s.banner, { backgroundColor: colors.pinkSoft, borderColor: colors.pink }]}>
      <AlertCircle color={colors.pink} size={15} />
      <Text style={[s.bannerText, { color: colors.ink }]}>{message}</Text>
    </View>
  );
}

export function AuthNotice({ message, tone = 'info' }) {
  const { colors } = useTheme();
  if (!message) return null;
  const isSuccess = tone === 'success';
  const accent = isSuccess ? colors.teal : colors.blue;
  const Icon = isSuccess ? CheckCircle2 : Info;
  return (
    <View style={[s.banner, { backgroundColor: accent + '18', borderColor: accent }]}>
      <Icon color={accent} size={15} />
      <Text style={[s.bannerText, { color: colors.ink }]}>{message}</Text>
    </View>
  );
}

/** Shown when Supabase environment variables are absent. Never blocks sign-in. */
export function ConfigWarning({ message }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View style={[s.banner, { backgroundColor: colors.primarySoft, borderColor: colors.orange }]}>
      <Info color={colors.orange} size={15} />
      <Text style={[s.bannerText, { color: colors.ink }]}>{message}</Text>
    </View>
  );
}

export function AuthLink({ children, onPress }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8}>
      {({ pressed }) => (
        <Text style={[s.link, { color: colors.primary, opacity: pressed ? 0.6 : 1 }]}>{children}</Text>
      )}
    </Pressable>
  );
}

export function AuthSwitch({ options, value, onChange }) {
  const { colors, isDark } = useTheme();

  return (
    <View style={[s.switch, { backgroundColor: colors.paper }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              s.switchItem,
              active && { backgroundColor: colors.ink },
              pressed && s.pressed,
            ]}
          >
            <Text
              style={[
                s.switchText,
                { color: active ? (isDark ? '#0D1117' : '#FFFFFF') : colors.muted },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: 40, paddingBottom: 22, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  mark: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  brand: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', letterSpacing: 0.4 },
  tagline: { color: '#AAB8CD', fontSize: 12, marginTop: 4 },
  heroTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginTop: 14, textAlign: 'center' },
  heroSub: { color: '#C7D2FE', fontSize: 12, marginTop: 5, textAlign: 'center', paddingHorizontal: 30, lineHeight: 17 },

  card: { margin: 18, borderRadius: 22, padding: 18, borderWidth: 1 },

  fieldWrap: { marginBottom: 13 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.9, marginBottom: 6 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13 },
  input: { flex: 1, fontSize: 14.5, fontWeight: '600' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  errorText: { fontSize: 11.5, fontWeight: '700', flex: 1 },

  strengthWrap: { marginTop: -4, marginBottom: 12 },
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 10.5, fontWeight: '800', marginLeft: 4, width: 46, textAlign: 'right' },
  strengthHint: { fontSize: 11, fontWeight: '600', marginTop: 5 },

  button: { height: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  buttonDisabled: { opacity: 0.55 },
  pressed: { opacity: 0.75 },

  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 13, padding: 11, marginBottom: 14 },
  bannerText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: '600' },

  link: { fontSize: 13.5, fontWeight: '800' },
  switch: { flexDirection: 'row', borderRadius: 13, padding: 4, marginBottom: 18 },
  switchItem: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  switchText: { fontSize: 13, fontWeight: '700' },
});
