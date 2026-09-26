import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { useTheme } from '../lib/theme';

/**
 * Safe-Her brand mark.
 * Mirrors the mark already used on the auth screen (see app/auth.jsx) so the
 * splash, the auth screen and onboarding all share one identity.
 */
export function SafeHerLogo({ size = 104, radius, iconSize }) {
  const { colors } = useTheme();
  const box = radius ?? Math.round(size * 0.3);
  const glyph = iconSize ?? Math.round(size * 0.5);

  return (
    <View
      style={[
        styles.logo,
        {
          width: size,
          height: size,
          borderRadius: box,
          backgroundColor: colors.primarySoft,
          borderColor: colors.line,
        },
      ]}
    >
      <ShieldCheck color={colors.primary} size={glyph} />
    </View>
  );
}

/**
 * App splash screen.
 *
 * The parent decides *when* to start the exit (prop `exiting`); this component
 * only owns the fade/scale choreography so it never replays on re-render.
 */
export default function SplashScreen({ exiting = false, onExited }) {
  const { colors } = useTheme();
  const [hiding, setHiding] = useState(false);

  const intro = useRef(new Animated.Value(0)).current;
  const brand = useRef(new Animated.Value(0)).current;
  const halo = useRef(new Animated.Value(0)).current;
  const exitedRef = useRef(false);

  // Logo: gentle scale + fade in.
  useEffect(() => {
    const animation = Animated.timing(intro, {
      toValue: 1,
      duration: 780,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [intro]);

  // Wordmark + tagline settle in slightly after the mark.
  useEffect(() => {
    const animation = Animated.timing(brand, {
      toValue: 1,
      duration: 620,
      delay: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [brand]);

  // Slow, calm breathing halo — reassuring rather than urgent.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(halo, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [halo]);

  useEffect(() => {
    if (exiting && !hiding) setHiding(true);
  }, [exiting, hiding]);

  useEffect(() => {
    if (!hiding || exitedRef.current) return;
    exitedRef.current = true;

    const animation = Animated.parallel([
      Animated.timing(intro, {
        toValue: 1.05,
        duration: 420,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(brand, {
        toValue: 0,
        duration: 320,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start(() => {
      if (onExited) onExited();
    });
    return () => animation.stop();
  }, [hiding, intro, brand, onExited]);

  const haloScale = halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const haloOpacity = halo.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.12] });

  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      {/* Soft ambient wash */}
      <View style={styles.ambient}>
        <Animated.View
          style={[
            styles.blob,
            styles.blobTop,
            { backgroundColor: colors.primarySoft, opacity: haloOpacity },
          ]}
        />
        <View style={[styles.blob, styles.blobBottom, { backgroundColor: colors.pinkSoft, opacity: 0.75 }]} />
      </View>

      <Animated.View
        style={[
          styles.center,
          {
            opacity: intro,
            transform: [
              { scale: intro.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
            ],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.halo,
            {
              width: 176,
              height: 176,
              borderRadius: 88,
              backgroundColor: colors.primarySoft,
              opacity: haloOpacity,
              transform: [{ scale: haloScale }],
            },
          ]}
        />

        <SafeHerLogo size={104} />
      </Animated.View>

      <Animated.View
        style={[
          styles.copy,
          {
            opacity: brand,
            transform: [
              { translateY: brand.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
            ],
          },
        ]}
      >
        <Text style={[styles.brand, { color: colors.ink }]}>Safe-Her</Text>
        <View style={[styles.rule, { backgroundColor: colors.line }]} />
        <Text style={[styles.tagline, { color: colors.muted }]}>
          Your safety. Your journey. Your choice.
        </Text>
      </Animated.View>

      <Animated.View style={[styles.footer, { opacity: brand }]}>
        <ShieldCheck color={colors.teal} size={14} />
        <Text style={[styles.footerText, { color: colors.muted }]}>Safer journeys, together</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ambient: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', pointerEvents: 'none' },
  blob: { position: 'absolute', borderRadius: 999 },
  blobTop: { width: 340, height: 340, top: -120, right: -130 },
  blobBottom: { width: 300, height: 300, bottom: -110, left: -120 },
  center: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute' },
  logo: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  copy: { alignItems: 'center', marginTop: 30, paddingHorizontal: 40 },
  brand: { fontSize: 32, fontWeight: '900', letterSpacing: -0.6 },
  rule: { width: 44, height: 3, borderRadius: 2, marginTop: 16, marginBottom: 16 },
  tagline: { fontSize: 14.5, fontWeight: '600', textAlign: 'center', lineHeight: 21 },
  footer: {
    position: 'absolute',
    bottom: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  footerText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
});
