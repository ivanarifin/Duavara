import { Coordinates } from '@/domain/types';

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
] as const;
export const OVERPASS_ENDPOINT = OVERPASS_ENDPOINTS[0];
export const MAX_RADIUS_METERS = 5_000;
export const MAX_NEARBY_MOSQUES = 50;

const DEFAULT_TIMEOUT_MS = 12_000;
const OVERPASS_USER_AGENT =
  'Duavara/1.0 (+https://github.com/ivanarifin/Duavara)';
const EARTH_RADIUS_METERS = 6_371_000;

type OverpassFetch = typeof fetch;

type OSMTags = Record<string, string>;

type OSMElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OSMTags;
};

export interface Mosque {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  distanceMeters?: number;
}

export interface MosqueLookupOptions {
  radiusMeters?: number;
  timeoutMs?: number;
  fetchImpl?: OverpassFetch;
  endpoints?: readonly string[];
}

export class MosqueLookupError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'MosqueLookupError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validateCoordinates(value: Coordinates): void {
  if (
    !isRecord(value) ||
    typeof value.latitude !== 'number' ||
    !Number.isFinite(value.latitude) ||
    value.latitude < -90 ||
    value.latitude > 90 ||
    typeof value.longitude !== 'number' ||
    !Number.isFinite(value.longitude) ||
    value.longitude < -180 ||
    value.longitude > 180
  ) {
    throw new MosqueLookupError(
      'Coordinates must be finite latitude/longitude values within bounds',
    );
  }
}

function validatePositiveNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new MosqueLookupError(`${label} must be a positive finite number`);
  }
}

function validateRadius(radiusMeters: number): void {
  validatePositiveNumber(radiusMeters, 'Radius');
  if (radiusMeters > MAX_RADIUS_METERS) {
    throw new MosqueLookupError(
      `Radius must not exceed ${MAX_RADIUS_METERS} meters`,
    );
  }
}

function validateTimeout(timeoutMs: number): void {
  validatePositiveNumber(timeoutMs, 'Timeout');
}

function buildQuery(coordinates: Coordinates, radiusMeters: number): string {
  const around = `(around:${radiusMeters},${coordinates.latitude},${coordinates.longitude})`;
  return `[out:json][timeout:25];(nwr["amenity"="place_of_worship"]["religion"~"^(muslim|islam)$",i]${around};nwr["building"="mosque"]${around};);out center tags;`;
}

function isOSMTags(value: unknown): value is OSMTags {
  return (
    isRecord(value) &&
    Object.values(value).every(tag => typeof tag === 'string')
  );
}

function isOSMElement(value: unknown): value is OSMElement {
  if (!isRecord(value)) return false;
  if (
    (value.type !== 'node' &&
      value.type !== 'way' &&
      value.type !== 'relation') ||
    typeof value.id !== 'number' ||
    !Number.isInteger(value.id) ||
    value.id <= 0
  ) {
    return false;
  }
  if (value.tags !== undefined && !isOSMTags(value.tags)) return false;
  if (value.lat !== undefined && typeof value.lat !== 'number') return false;
  if (value.lon !== undefined && typeof value.lon !== 'number') return false;
  if (value.center !== undefined) {
    if (
      !isRecord(value.center) ||
      typeof value.center.lat !== 'number' ||
      typeof value.center.lon !== 'number'
    ) {
      return false;
    }
  }
  return true;
}

function elementCoordinates(element: OSMElement): Coordinates | null {
  const latitude = element.center?.lat ?? element.lat;
  const longitude = element.center?.lon ?? element.lon;
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

function stringTag(tags: OSMTags, key: string): string | undefined {
  const value = tags[key]?.trim();
  return value || undefined;
}

function elementAddress(tags: OSMTags): string | undefined {
  const full = stringTag(tags, 'addr:full');
  if (full) return full;
  const parts = [
    stringTag(tags, 'addr:housenumber'),
    stringTag(tags, 'addr:street'),
    stringTag(tags, 'addr:city'),
    stringTag(tags, 'addr:postcode'),
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

function haversineDistance(from: Coordinates, to: Coordinates): number {
  const latitudeDelta = ((to.latitude - from.latitude) * Math.PI) / 180;
  const longitudeDelta = ((to.longitude - from.longitude) * Math.PI) / 180;
  const fromLatitude = (from.latitude * Math.PI) / 180;
  const toLatitude = (to.latitude * Math.PI) / 180;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.sin(longitudeDelta / 2) ** 2 *
      Math.cos(fromLatitude) *
      Math.cos(toLatitude);
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeElement(
  element: OSMElement,
  origin: Coordinates,
): Mosque | null {
  const coordinates = elementCoordinates(element);
  if (!coordinates) return null;
  const tags = element.tags ?? {};
  return {
    id: `${element.type}/${element.id}`,
    name:
      stringTag(tags, 'name') ?? stringTag(tags, 'name:en') ?? 'Unnamed mosque',
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    ...(elementAddress(tags) ? { address: elementAddress(tags) } : {}),
    distanceMeters: haversineDistance(origin, coordinates),
  };
}

function responseElements(body: unknown): OSMElement[] {
  if (!isRecord(body) || !Array.isArray(body.elements)) {
    throw new MosqueLookupError('Overpass returned an unexpected response');
  }
  return body.elements.filter(isOSMElement);
}

async function request(
  endpoint: string,
  query: string,
  fetchImpl: OverpassFetch,
  timeoutMs: number,
): Promise<{ response: Response; body: unknown }> {
  const controller =
    typeof AbortController === 'undefined' ? undefined : new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fetchPromise = fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': OVERPASS_USER_AGENT,
    },
    body: `data=${encodeURIComponent(query)}`,
    ...(controller ? { signal: controller.signal } : {}),
  });
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller?.abort();
      reject(
        new MosqueLookupError(
          `Overpass request timed out after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);
  });

  try {
    let response: Response;
    try {
      response = await Promise.race([fetchPromise, timeoutPromise]);
    } catch (error) {
      if (timedOut) throw error;
      const message =
        error instanceof Error ? error.message : 'Network request failed';
      throw new MosqueLookupError(`Overpass request failed: ${message}`);
    }

    let body: unknown;
    try {
      body = await Promise.race([response.json(), timeoutPromise]);
    } catch (error) {
      if (timedOut) throw error;
      throw new MosqueLookupError(
        `Overpass returned invalid JSON (HTTP ${response.status})`,
        response.status,
      );
    }
    return { response, body };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getNearbyMosques(
  coordinates: Coordinates,
  options: MosqueLookupOptions = {},
): Promise<Mosque[]> {
  validateCoordinates(coordinates);
  const radiusMeters = options.radiusMeters ?? MAX_RADIUS_METERS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  validateRadius(radiusMeters);
  validateTimeout(timeoutMs);

  const query = buildQuery(coordinates, radiusMeters);
  const endpoints = options.endpoints ?? OVERPASS_ENDPOINTS;
  if (
    !endpoints.length ||
    endpoints.some(endpoint => !endpoint.startsWith('https://'))
  ) {
    throw new MosqueLookupError('No valid Overpass endpoint is configured');
  }

  let lastError: unknown;
  for (const [index, endpoint] of endpoints.entries()) {
    try {
      const { response, body } = await request(
        endpoint,
        query,
        options.fetchImpl ?? fetch,
        timeoutMs,
      );
      if (!response.ok) {
        throw new MosqueLookupError(
          `Overpass request failed (HTTP ${response.status})`,
          response.status,
        );
      }

      const seen = new Set<string>();
      return responseElements(body)
        .map(element => normalizeElement(element, coordinates))
        .filter((mosque): mosque is Mosque => mosque !== null)
        .filter(mosque => {
          if (seen.has(mosque.id)) return false;
          seen.add(mosque.id);
          return true;
        })
        .sort(
          (left, right) =>
            (left.distanceMeters ?? 0) - (right.distanceMeters ?? 0) ||
            left.id.localeCompare(right.id),
        )
        .slice(0, MAX_NEARBY_MOSQUES);
    } catch (error) {
      lastError = error;
      const statusCode =
        error instanceof MosqueLookupError ? error.statusCode : undefined;
      const canRetry =
        statusCode === undefined || statusCode === 429 || statusCode >= 500;
      if (!canRetry || index === endpoints.length - 1) throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new MosqueLookupError('Overpass request failed');
}
