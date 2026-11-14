import { Platform } from 'react-native';

// Some tests replace the react-native module with a partial mock, so read the
// platform defensively instead of assuming Platform.select exists.
const platformOS = Platform?.OS ?? 'ios';

/**
 * Duavara design tokens.
 *
 * The app is a night canvas: deep green-black surfaces, warm cream type and
 * muted mint/gold light. Screens should read from these tokens instead of
 * hard-coded values so the whole app stays coherent.
 */
export const COLORS = {
  ink: '#061310',
  inkSoft: '#0E231D',
  inkDeep: '#030C0A',
  moss: '#17594A',
  mossDeep: '#0B3028',
  mint: '#8FD9BE',
  mintBright: '#CBF3E0',
  cream: '#FAF5E9',
  parchment: '#F7F1E3',
  sand: '#C9B99B',
  muted: '#94A79E',
  line: 'rgba(250, 245, 233, 0.12)',
  lineSoft: 'rgba(250, 245, 233, 0.06)',
  gold: '#D9B76B',
  goldSoft: '#3A3020',
  coral: '#EF967C',
  white: '#FFFFFF',
  overlay: 'rgba(3, 12, 10, 0.62)',
  surface: '#0F2A23',
  surfaceHigh: '#143A31',
} as const;

export const SPACING = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const RADII = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  xxl: 32,
  pill: 999,
} as const;

export const FONTS = {
  display: platformOS === 'android' ? 'serif' : 'Georgia',
  body: platformOS === 'android' ? 'sans-serif' : 'System',
  numeric: platformOS === 'android' ? 'monospace' : 'Menlo',
} as const;

export const TYPE = {
  hero: { fontSize: 42, lineHeight: 46, letterSpacing: -1.2 },
  title: { fontSize: 30, lineHeight: 36, letterSpacing: -0.7 },
  section: { fontSize: 21, lineHeight: 27, letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 19 },
  kicker: { fontSize: 10.5, lineHeight: 14, letterSpacing: 1.7 },
  numeral: { fontSize: 34, lineHeight: 40, letterSpacing: -0.4 },
} as const;

export const SHADOW = {
  card: {
    shadowColor: 'rgba(0, 0, 0, 0.9)',
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  floating: {
    shadowColor: 'rgba(0, 0, 0, 0.9)',
    shadowOpacity: 0.42,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  glow: {
    shadowColor: 'rgba(143, 217, 190, 0.9)',
    shadowOpacity: 0.28,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const;
