/* eslint-env jest */
/*
 * Jest does not run the native Reanimated runtime, so give tests a small,
 * predictable stand-in that keeps the same API surface the app uses.
 */
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text, ScrollView, Image } = require('react-native');

  const createAnimatedComponent = Component => {
    if (!Component) return View;
    const Wrapped = React.forwardRef((props, ref) =>
      React.createElement(Component, { ...props, ref }),
    );
    Wrapped.displayName = `Animated(${
      Component.displayName || Component.name || 'Component'
    })`;
    return Wrapped;
  };

  const animationBuilder = () => {
    const builder = {};
    const chain = () => builder;
    builder.delay = chain;
    builder.duration = chain;
    builder.withInitialValues = chain;
    builder.reduceMotion = chain;
    builder.springify = chain;
    builder.damping = chain;
    builder.stiffness = chain;
    builder.build = () => ({});
    builder.toString = () => 'animation';
    return builder;
  };

  const identity = value => value;
  const lastValue = (...values) => values[values.length - 1];

  const Animated = {
    View: createAnimatedComponent(View),
    Text: createAnimatedComponent(Text),
    ScrollView: createAnimatedComponent(ScrollView),
    Image: createAnimatedComponent(Image),
    createAnimatedComponent,
  };

  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: initial => ({ value: initial }),
    useAnimatedStyle: factory => {
      try {
        return factory() ?? {};
      } catch {
        return {};
      }
    },
    useAnimatedProps: factory => {
      try {
        return factory() ?? {};
      } catch {
        return {};
      }
    },
    useAnimatedRef: () => React.createRef(),
    useAnimatedScrollHandler: () => () => undefined,
    useAnimatedReaction: () => undefined,
    useDerivedValue: factory => ({ value: factory() }),
    useAnimatedGestureHandler: () => () => undefined,
    withSpring: identity,
    withTiming: identity,
    withDecay: identity,
    withDelay: (_delay, value) => value,
    withRepeat: identity,
    withSequence: lastValue,
    cancelAnimation: () => undefined,
    runOnJS: fn => fn,
    runOnUI: fn => fn,
    interpolate: value => value,
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    Easing: {
      linear: identity,
      ease: identity,
      quad: identity,
      cubic: identity,
      sin: identity,
      bezier: () => identity,
      in: factory => factory,
      out: factory => factory,
      inOut: factory => factory,
    },
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    FadeIn: animationBuilder(),
    FadeInDown: animationBuilder(),
    FadeInUp: animationBuilder(),
    FadeOut: animationBuilder(),
    FadeOutDown: animationBuilder(),
    SlideInDown: animationBuilder(),
    Layout: animationBuilder(),
    LinearTransition: animationBuilder(),
    setUpTests: () => undefined,
  };
});
