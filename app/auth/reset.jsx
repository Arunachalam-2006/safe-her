import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as LinkingExpo from 'expo-linking';
import { Check, KeyRound } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { supabase, consumeAuthDeepLink, describeAuthError, isSupabaseConfigured } from '../../lib/supabase';
import { validatePassword } from '../../lib/authValidation';
import {
  AuthButton,
  AuthCard,
  AuthError,
  AuthHero,
  AuthNotice,
  PasswordField,
  PasswordStrength,
} from '../../components/auth/AuthUI';

/**
 * Password reset destination.
 *
 * Reached when the user taps the link in the reset email. Supabase sends the
 * recovery token on the app's URL scheme, so we consume it here before
 * allowing a new password to be set.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { session } = useAuth();

  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlightRef = useRef(false);

  const applyLink = useCallback(async (url) => {
    if (!url) return;
    const result = await consumeAuthDeepLink(url);
    if (!result.ok) {
      setLinkError(
        result.error?.message || 'This reset link is invalid or has expired. Request a new one.'
      );
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLinkError('Supabase is not configured, so password reset is unavailable.');
      setReady(true);
      return undefined;
    }

    let active = true;

    (async () => {
      // The app may already have been opened by the link.
      const initial = await LinkingExpo.getInitialURL();
      if (initial && active) {
        await applyLink(initial);
        return;
      }
      // Otherwise wait for the link while the screen is open.
      const sub = Linking.addEventListener('url', ({ url }) => {
        if (active) applyLink(url);
      });
      if (!active) sub.remove();
    })();

    return () => {
      active = false;
    };
  }, [applyLink]);

  const handleSubmit = useCallback(async () => {
    if (inFlightRef.current) return;
    setFormError('');

    const strength = validatePassword(password);
    if (strength.error) {
      setErrors({ password: strength.error });
      return;
    }
    if (password !== confirmPassword) {
      setErrors({ confirmPassword: 'Passwords do not match.' });
      return;
    }
    setErrors({});

    inFlightRef.current = true;
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setFormError(describeAuthError(error, 'We could not update your password. Please try again.'));
        return;
      }
      setDone(true);
    } catch (err) {
      setFormError('Cannot reach the server. Check your connection and try again.');
      if (__DEV__) console.warn('[auth] password update failed:', err?.message);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [password, confirmPassword]);

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.paper }]}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <AuthHero title="Choose a new password" subtitle="Pick something strong and only yours." />

      <AuthCard>
        {!ready ? (
          <AuthNotice message="Opening your reset link…" />
        ) : done ? (
          <>
            <AuthNotice
              tone="success"
              message="Your password has been updated. You are signed in on this device."
            />
            <AuthButton label="Continue to Safe-Her" icon={Check} onPress={() => router.replace('/')} />
          </>
        ) : linkError && !session ? (
          <>
            <AuthError message={linkError} />
            <AuthButton
              label="Request a new link"
              onPress={() => router.replace('/auth/forgot')}
            />
            <View style={styles.footerRow}>
              <Text
                onPress={() => router.replace('/auth/login')}
                accessibilityRole="button"
                style={[styles.backLink, { color: colors.muted }]}
              >
                Back to sign in
              </Text>
            </View>
          </>
        ) : (
          <>
            <AuthError message={formError} />

            <PasswordField
              label="New password"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setErrors((e) => ({ ...e, password: null }));
              }}
              placeholder="At least 8 characters"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              error={errors.password}
            />

            {password ? (
              <PasswordStrength
                score={validatePassword(password).score}
                hint={validatePassword(password).hint}
              />
            ) : null}

            <PasswordField
              label="Confirm new password"
              value={confirmPassword}
              onChangeText={(v) => {
                setConfirmPassword(v);
                setErrors((e) => ({ ...e, confirmPassword: null }));
              }}
              placeholder="Re-enter your new password"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              error={errors.confirmPassword}
            />

            <AuthButton
              label="Update password"
              icon={KeyRound}
              onPress={handleSubmit}
              busy={busy}
            />
          </>
        )}
      </AuthCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 24 },
  footerRow: { alignItems: 'center', marginTop: 16 },
  backLink: { fontSize: 13, fontWeight: '700' },
});
