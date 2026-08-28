import { NativeModules } from 'react-native';
import { Coordinates } from '@/domain';

type NativeLocationModule = {
  reverseGeocode(latitude: number, longitude: number): Promise<unknown>;
};

function getNativeLocation(): NativeLocationModule | null {
  const module: unknown = NativeModules.DuavaraLocation;
  return typeof module === 'object' &&
    module !== null &&
    typeof (module as Partial<NativeLocationModule>).reverseGeocode ===
      'function'
    ? (module as NativeLocationModule)
    : null;
}

export async function getRegionName(
  coordinates: Coordinates,
): Promise<string | null> {
  const location = getNativeLocation();
  if (!location) return null;
  const value = await location.reverseGeocode(
    coordinates.latitude,
    coordinates.longitude,
  );
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
