import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation, {
  GeolocationError,
  GeolocationResponse,
} from '@react-native-community/geolocation';
import { LocationInfo } from '@/domain/types';

const LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 5 * 60 * 1000,
};

function locationFromResponse(position: GeolocationResponse): LocationInfo {
  const { latitude, longitude } = position.coords;
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error('Device returned invalid coordinates');
  }
  return {
    coordinates: { latitude, longitude },
    timestamp: position.timestamp,
    source: 'device',
  };
}

function geolocationError(error: GeolocationError): Error {
  return new Error(
    `Unable to get device location: ${error.message || 'unknown error'}`,
  );
}

export async function getDeviceLocation(): Promise<LocationInfo> {
  let enableHighAccuracy = LOCATION_OPTIONS.enableHighAccuracy;
  if (Platform.OS === 'android') {
    const permissions = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);
    const hasFineLocation =
      permissions[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
      PermissionsAndroid.RESULTS.GRANTED;
    const hasCoarseLocation =
      permissions[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] ===
      PermissionsAndroid.RESULTS.GRANTED;
    if (!hasFineLocation && !hasCoarseLocation) {
      throw new Error('Location permission was denied');
    }
    enableHighAccuracy = hasFineLocation;
  }

  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      position => {
        try {
          resolve(locationFromResponse(position));
        } catch (error) {
          reject(error);
        }
      },
      error => reject(geolocationError(error)),
      { ...LOCATION_OPTIONS, enableHighAccuracy },
    );
  });
}
