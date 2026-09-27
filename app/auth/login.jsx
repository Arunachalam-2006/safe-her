import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LogIn, Mail, UserRound } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { supabaseConfigError } from '../../lib/supabase';
import { validateLogin } from '../../lib/authValidation';
import {
  AuthButton,
  AuthCard,
  AuthError,
  AuthField,
  AuthHero,
  AuthLink,
  ConfigWarning,
  PasswordField,
} from '../../components/auth/AuthUI';

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  // Guards against a double tap producing two requests.
  const inFlightRef = useRef(false);

  const handleSubmit = useCallback(async () => {
    if (inFlightRef.current) return;
    setFormError('');

    const check = validateLogin({ email, password });
    setErrors(check.errors);
    if (!check.valid) return;

    inFlightRef.current = true;
    setBusy(true);
    try {
      const { error } = await signIn({ email, password });
      if (error) {
        setFormError(error.message);
        return;
      }
      // On success the root navigator's gate takes over and routes onward —
      // no manual navigation here.
    } catch (err) {
      setFormError('Something went wrong signing in. Please try again.');
      if (__DEV__) console.warn('[auth] sign-in failed:', err?.message);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [email, password, signIn]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.paper }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AuthHero title="Welcome back" subtitle="Sign in to continue to your Safe-Her account." />

        <AuthCard>
          {supabaseConfigError ? <ConfigWarning message={supabaseConfigError} /> : null}

          <AuthError message={formError} />

          <AuthField
            label="Email"
            icon={Mail}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (errors.email) setErrors((e) => ({ ...e, email: null }));
            }}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            error={errors.email}
          />

          <PasswordField
            label="Password"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (errors.password) setErrors((e) => ({ ...e, password: null }));
            }}
            placeholder="Your password"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            error={errors.password}
          />

          <View style={styles.forgotRow}>
            <AuthLink onPress={() => router.push('/auth/forgot')}>Forgot password?</AuthLink>
          </View>

          <AuthButton label="Sign in" icon={LogIn} onPress={handleSubmit} busy={busy} />

          <View style={styles.footerRow}>
            <Text style={[styles.footerText, { color: colors.muted }]}>New to Safe-Her? </Text>
            <AuthLink onPress={() => router.push('/auth/signup')}>Create an account</AuthLink>
          </View>
        </AuthCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 24 },
  forgotRow: { alignItems: 'flex-end', marginBottom: 16, marginTop: -4 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  footerText: { fontSize: 13, fontWeight: '600' },
});
