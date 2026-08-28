import { NativeEventEmitter, NativeModules } from 'react-native';
import { Coordinates } from '@/domain/types';

const EVENT_NAME = 'QiblaCompassHeading';
let activeSession = 0;

type NativeHeading = {
  heading: number;
  accuracy: number;
  north: 'true';
  timestamp: number;
};

type NativeCompassModule = {
  start(options: Coordinates): Promise<{ north: 'true' }>;
  stop(): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

export interface CompassHeading {
  heading: number;
  accuracy: number;
  north: 'true';
  timestamp: number;
}

function getCompass(): NativeCompassModule | null {
  const candidate: unknown = NativeModules.QiblaCompass;
  if (typeof candidate !== 'object' || candidate === null) return null;
  const compass = candidate as Partial<NativeCompassModule>;
  return typeof compass.start === 'function' &&
    typeof compass.stop === 'function'
    ? (compass as NativeCompassModule)
    : null;
}

function normalizeHeading(value: unknown): CompassHeading | null {
  if (typeof value !== 'object' || value === null) return null;
  const sample = value as Partial<NativeHeading>;
  const { heading, accuracy, timestamp, north } = sample;
  if (
    typeof heading !== 'number' ||
    !Number.isFinite(heading) ||
    heading < 0 ||
    heading >= 360 ||
    typeof accuracy !== 'number' ||
    !Number.isFinite(accuracy) ||
    typeof timestamp !== 'number' ||
    !Number.isFinite(timestamp) ||
    north !== 'true'
  ) {
    return null;
  }
  return {
    heading: heading as number,
    accuracy: accuracy as number,
    north,
    timestamp: timestamp as number,
  };
}

export async function startQiblaCompass(
  coordinates: Coordinates,
  onHeading: (heading: CompassHeading) => void,
): Promise<() => void> {
  const compass = getCompass();
  if (!compass) throw new Error('COMPASS_UNSUPPORTED');
  if (
    !Number.isFinite(coordinates.latitude) ||
    !Number.isFinite(coordinates.longitude)
  ) {
    throw new Error('INVALID_COORDINATES');
  }

  const session = activeSession + 1;
  activeSession = session;
  const subscription = new NativeEventEmitter(compass).addListener(
    EVENT_NAME,
    (value: Object) => {
      if (activeSession !== session) return;
      const heading = normalizeHeading(value);
      if (heading) onHeading(heading);
    },
  );

  await compass.stop().catch(() => undefined);
  if (activeSession !== session) {
    subscription.remove();
    return () => undefined;
  }

  try {
    await compass.start(coordinates);
  } catch (error) {
    subscription.remove();
    if (activeSession === session) activeSession = 0;
    throw error;
  }

  if (activeSession !== session) {
    subscription.remove();
    return () => undefined;
  }

  return () => {
    subscription.remove();
    if (activeSession !== session) return;
    activeSession = 0;
    compass.stop().catch(() => undefined);
  };
}

export function getRelativeQiblaAngle(
  qiblaBearing: number,
  heading: number,
): number {
  const difference = ((qiblaBearing - heading + 540) % 360) - 180;
  return Number.isFinite(difference) ? difference : 0;
}
