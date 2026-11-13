import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  type ModalProps,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, RADII } from './theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SPRING = {
  damping: 20,
  stiffness: 220,
  mass: 0.7,
  reduceMotion: ReduceMotion.System,
} as const;

/** Pressable with a spring-driven press scale. Use for tappable surfaces. */
export function PressableScale({
  children,
  style,
  scaleTo = 0.96,
  ...rest
}: PressableProps & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
}) {
  const pressed = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(pressed.value ? scaleTo : 1, SPRING) }],
    opacity: withTiming(pressed.value ? 0.9 : 1, { duration: 120 }),
  }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={event => {
        pressed.value = 1;
        rest.onPressIn?.(event);
      }}
      onPressOut={event => {
        pressed.value = 0;
        rest.onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Staggered entrance for list rows and cards. */
export function Reveal({
  children,
  delay = 0,
  distance = 14,
  style,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay)
        .duration(420)
        .withInitialValues({ transform: [{ translateY: distance }] })
        .reduceMotion(ReduceMotion.System)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/** Cross-fade plus small lift when a tab becomes active. */
export function ScreenTransition({
  children,
  transitionKey,
}: {
  children: ReactNode;
  transitionKey: string;
}) {
  return (
    <Animated.View
      key={transitionKey}
      entering={FadeIn.duration(260).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
      style={styles.screen}
    >
      {children}
    </Animated.View>
  );
}

/** Slow breathing dot used for live indicators. */
export function PulseDot({
  color = COLORS.mint,
  size = 7,
}: {
  color?: string;
  size?: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
      undefined,
      ReduceMotion.System,
    );
  }, [progress]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + progress.value * 0.55,
  }));

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        dotStyle,
      ]}
    />
  );
}

/** Progress rail that fills smoothly whenever `value` (0..1) changes. */
export function ProgressRail({
  value,
  color = COLORS.mint,
  trackColor = 'rgba(201, 242, 222, 0.22)',
  height = 6,
}: {
  value: number;
  color?: string;
  trackColor?: string;
  height?: number;
}) {
  const progress = useSharedValue(Math.min(Math.max(value, 0), 1));

  useEffect(() => {
    progress.value = withTiming(Math.min(Math.max(value, 0), 1), {
      duration: 600,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
  }, [progress, value]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View
      style={[
        styles.progressTrack,
        { height, borderRadius: height / 2, backgroundColor: trackColor },
      ]}
    >
      <Animated.View
        style={[
          { height, borderRadius: height / 2, backgroundColor: color },
          fillStyle,
        ]}
      />
    </View>
  );
}

/** Scale pop used when a value (countdown, counter) changes. */
export function ValuePop({
  children,
  trigger,
  style,
}: {
  children: ReactNode;
  trigger: string | number;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(1);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    scale.value = withSequence(
      withTiming(1.04, { duration: 110, easing: Easing.out(Easing.quad) }),
      withSpring(1, SPRING),
    );
  }, [scale, trigger]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
  );
}

/**
 * Soft placeholder block that breathes while data loads.
 */
export function Skeleton({
  height,
  width = '100%',
  radius = 12,
  style,
}: {
  height: number;
  width?: number | `${number}%`;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const breath = useSharedValue(0);

  useEffect(() => {
    breath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
      undefined,
      ReduceMotion.System,
    );
  }, [breath]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + breath.value * 0.3,
  }));

  return (
    <Animated.View
      style={[
        {
          height,
          width,
          borderRadius: radius,
          backgroundColor: COLORS.inkSoft,
        },
        style,
        animatedStyle,
      ]}
    />
  );
}

/** Bottom sheet with a spring slide-up and a fading backdrop.
 * Keeps the platform modal for focus trapping, but drives the motion itself
 * so entrance and exit match the rest of the app.
 */
export function MotionSheet({
  visible,
  onRequestClose,
  children,
  style,
  ...modalProps
}: {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
} & Pick<ModalProps, 'statusBarTranslucent'>) {
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const sheetHeight = useSharedValue(640);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withSpring(1, {
        damping: 22,
        stiffness: 190,
        mass: 0.9,
        reduceMotion: ReduceMotion.System,
      });
      return;
    }
    progress.value = withTiming(0, {
      duration: 220,
      easing: Easing.in(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
    const timer = setTimeout(() => setMounted(false), 240);
    return () => clearTimeout(timer);
  }, [progress, visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (1 - progress.value) * (sheetHeight.value + 40) },
    ],
  }));

  if (!mounted) return null;

  return (
    <Modal
      {...modalProps}
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onRequestClose}
    >
      <View style={styles.sheetRoot}>
        <Animated.View style={[styles.sheetBackdrop, backdropStyle]} />
        <Pressable style={styles.sheetDismiss} onPress={onRequestClose} />
        <Animated.View
          onLayout={event => {
            sheetHeight.value = event.nativeEvent.layout.height;
          }}
          style={[styles.sheetSurface, style, sheetStyle]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  progressTrack: { width: '100%', overflow: 'hidden' },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: COLORS.overlay,
  },
  sheetDismiss: { flex: 1 },
  sheetSurface: {
    backgroundColor: COLORS.cream,
    borderTopLeftRadius: RADII.xxl,
    borderTopRightRadius: RADII.xxl,
    overflow: 'hidden',
  },
});
