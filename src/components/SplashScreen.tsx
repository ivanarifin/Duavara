import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import appIconAsset from '@/assets/duavara-app-icon.png';

const COLORS = {
  ink: '#08201E',
  moss: '#1F5147',
  mint: '#91D6BE',
  mintBright: '#C7F0DA',
  cream: '#FFF8E8',
  gold: '#EACB7D',
};

const NATIVE_DRIVER = { useNativeDriver: true } as const;

export function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const crescentOpacity = useRef(new Animated.Value(0)).current;
  const crescentScale = useRef(new Animated.Value(0.72)).current;
  const artifactOpacity = useRef(new Animated.Value(0)).current;
  const artifactScale = useRef(new Animated.Value(0.84)).current;
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkRise = useRef(new Animated.Value(18)).current;
  const starPulse = useRef(new Animated.Value(0.35)).current;
  const starOrbit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(starPulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.sin),
          ...NATIVE_DRIVER,
        }),
        Animated.timing(starPulse, {
          toValue: 0.35,
          duration: 650,
          easing: Easing.inOut(Easing.sin),
          ...NATIVE_DRIVER,
        }),
      ]),
    );
    const orbit = Animated.loop(
      Animated.timing(starOrbit, {
        toValue: 1,
        duration: 4600,
        easing: Easing.linear,
        ...NATIVE_DRIVER,
      }),
    );
    const intro = Animated.sequence([
      Animated.delay(110),
      Animated.parallel([
        Animated.timing(crescentOpacity, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          ...NATIVE_DRIVER,
        }),
        Animated.spring(crescentScale, {
          toValue: 1,
          friction: 6,
          tension: 45,
          ...NATIVE_DRIVER,
        }),
      ]),
      Animated.parallel([
        Animated.timing(artifactOpacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.quad),
          ...NATIVE_DRIVER,
        }),
        Animated.spring(artifactScale, {
          toValue: 1,
          friction: 7,
          tension: 55,
          ...NATIVE_DRIVER,
        }),
        Animated.parallel([
          Animated.timing(wordmarkOpacity, {
            toValue: 1,
            duration: 430,
            easing: Easing.out(Easing.quad),
            ...NATIVE_DRIVER,
          }),
          Animated.timing(wordmarkRise, {
            toValue: 0,
            duration: 430,
            easing: Easing.out(Easing.cubic),
            ...NATIVE_DRIVER,
          }),
        ]),
      ]),
      Animated.delay(420),
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 350,
        easing: Easing.inOut(Easing.quad),
        ...NATIVE_DRIVER,
      }),
    ]);

    pulse.start();
    orbit.start();
    intro.start();
    const handoffTimer = setTimeout(onFinish, 1_800);

    return () => {
      clearTimeout(handoffTimer);
      pulse.stop();
      orbit.stop();
      intro.stop();
    };
  }, [
    artifactOpacity,
    artifactScale,
    crescentOpacity,
    crescentScale,
    onFinish,
    screenOpacity,
    starOrbit,
    starPulse,
    wordmarkOpacity,
    wordmarkRise,
  ]);

  const orbitRotation = starOrbit.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[styles.screen, { opacity: screenOpacity }]}
      accessible
      accessibilityLabel="Duavara splash screen"
      accessibilityRole="image"
    >
      <View style={styles.topGlow} />
      <Animated.View
        style={[styles.orbit, { transform: [{ rotate: orbitRotation }] }]}
      >
        <Animated.View
          style={[
            styles.orbitStar,
            styles.orbitStarOne,
            { opacity: starPulse },
          ]}
        />
        <Animated.View
          style={[
            styles.orbitStar,
            styles.orbitStarTwo,
            { opacity: starPulse },
          ]}
        />
        <Animated.View
          style={[
            styles.orbitStar,
            styles.orbitStarThree,
            { opacity: starPulse },
          ]}
        />
      </Animated.View>

      <View style={styles.content}>
        <Animated.View
          style={[
            styles.crescent,
            {
              opacity: crescentOpacity,
              transform: [{ scale: crescentScale }],
            },
          ]}
          testID="splash-crescent"
        >
          <View style={styles.crescentCutout} />
        </Animated.View>

        <Animated.View
          style={[
            styles.artifactFrame,
            {
              opacity: artifactOpacity,
              transform: [{ scale: artifactScale }],
            },
          ]}
          testID="splash-artifact-frame"
        >
          <Image source={appIconAsset} style={styles.artifact} />
        </Animated.View>

        <Animated.View
          style={[
            styles.brandBlock,
            {
              opacity: wordmarkOpacity,
              transform: [{ translateY: wordmarkRise }],
            },
          ]}
        >
          <Text style={styles.arabic}>وَقْتُ الصَّلَاة</Text>
          <Text style={styles.wordmark}>Duavara</Text>
          <View style={styles.rule} />
          <Text style={styles.tagline}>Prayer, in its time</Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.footer, { opacity: wordmarkOpacity }]}>
        <View style={styles.footerDot} />
        <Text style={styles.footerText}>YOUR MOMENT OF STILLNESS</Text>
        <View style={styles.footerDot} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.ink,
    overflow: 'hidden',
  },
  topGlow: {
    position: 'absolute',
    top: -180,
    width: 440,
    height: 440,
    borderRadius: 220,
    backgroundColor: 'rgba(31, 81, 71, 0.58)',
  },
  orbit: {
    position: 'absolute',
    width: 310,
    height: 310,
    borderRadius: 155,
    borderWidth: 1,
    borderColor: 'rgba(199, 240, 218, 0.10)',
  },
  orbitStar: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.gold,
  },
  orbitStarOne: { top: 30, left: 47 },
  orbitStarTwo: { top: 82, right: 8, width: 3, height: 3 },
  orbitStarThree: { bottom: 36, right: 40, width: 4, height: 4 },
  content: { alignItems: 'center', justifyContent: 'center', marginTop: -22 },
  crescent: {
    width: 102,
    height: 102,
    borderRadius: 51,
    backgroundColor: COLORS.gold,
    overflow: 'hidden',
    marginBottom: 12,
  },
  crescentCutout: {
    position: 'absolute',
    top: -7,
    left: -29,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.ink,
  },
  artifactFrame: {
    width: 116,
    height: 116,
    borderRadius: 31,
    padding: 6,
    backgroundColor: 'rgba(255, 248, 232, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(234, 203, 125, 0.52)',
    shadowColor: COLORS.gold,
    shadowOpacity: 0.23,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  artifact: { width: '100%', height: '100%', borderRadius: 25 },
  brandBlock: { alignItems: 'center', marginTop: 23 },
  arabic: { color: COLORS.mintBright, fontSize: 16, lineHeight: 24 },
  wordmark: {
    color: COLORS.cream,
    fontFamily: 'Georgia',
    fontSize: 45,
    lineHeight: 54,
    letterSpacing: -1.25,
    marginTop: 3,
  },
  rule: { width: 34, height: 1, backgroundColor: COLORS.gold, marginTop: 11 },
  tagline: {
    color: COLORS.mint,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginTop: 11,
    textTransform: 'uppercase',
  },
  footer: {
    position: 'absolute',
    bottom: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  footerDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.gold,
  },
  footerText: {
    color: 'rgba(199, 240, 218, 0.62)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
});
