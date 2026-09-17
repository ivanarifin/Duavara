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
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_RETRY_MAX_DELAY_MS = 2_000;
const MAX_OVERPASS_TIMEOUT_SECONDS = 10;
const RESPONSE_GRACE_MS = 1_000;
const MAX_CACHE_ENTRIES = 20;
const OVERPASS_USER_AGENT =
  'Duavara/1.0 (+https://github.com/ivanarifin/Duavara)';
const EARTH_RADIUS_METERS = 6_371_000;

const mosqueCache = new Map<string, { expiresAt: number; results: Mosque[] }>();
let mosqueCacheGeneration = 0;

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
  signal?: AbortSignal;
  fetchImpl?: OverpassFetch;
  endpoints?: readonly string[];
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  random?: () => number;
  cacheTtlMs?: number;
  forceRefresh?: boolean;
}

type MosqueLookupErrorCode = 'ABORTED' | 'TIMEOUT' | 'INVALID_RESPONSE';

export class MosqueLookupError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: MosqueLookupErrorCode,
  ) {
    super(message);
    this.name = 'MosqueLookupError';
  }
}

export function clearNearbyMosqueCache(): void {
  mosqueCacheGeneration += 1;
  mosqueCache.clear();
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

function validateNonNegativeNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new MosqueLookupError(
      `${label} must be a non-negative finite number`,
    );
  }
}

function validateAttemptCount(attempts: number, maximum: number): void {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > maximum) {
    throw new MosqueLookupError(
      `Attempts must be a whole number from 1 to ${maximum}`,
    );
  }
}

function overpassTimeoutSeconds(timeoutMs: number): number {
  return Math.max(
    1,
    Math.min(
      MAX_OVERPASS_TIMEOUT_SECONDS,
      Math.floor(Math.max(0, timeoutMs - RESPONSE_GRACE_MS) / 1_000),
    ),
  );
}

function buildQuery(
  coordinates: Coordinates,
  radiusMeters: number,
  timeoutSeconds: number,
): string {
  const around = `(around:${radiusMeters},${coordinates.latitude},${coordinates.longitude})`;
  return `[out:json][timeout:${timeoutSeconds}];(nwr["amenity"="place_of_worship"]["religion"~"^(muslim|islam)$",i]${around};nwr["building"="mosque"]${around};);out center tags;`;
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
    throw new MosqueLookupError(
      'Overpass returned an unexpected response',
      undefined,
      'INVALID_RESPONSE',
    );
  }
  return body.elements.filter(isOSMElement);
}

function abortError(): MosqueLookupError {
  return new MosqueLookupError(
    'Overpass request was cancelled',
    undefined,
    'ABORTED',
  );
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof MosqueLookupError)) return true;
  if (error.code === 'ABORTED') return false;
  if (error.code === 'INVALID_RESPONSE') return true;
  return (
    error.code === 'TIMEOUT' ||
    error.statusCode === undefined ||
    error.statusCode === 408 ||
    error.statusCode === 429 ||
    error.statusCode >= 500
  );
}

function cacheKey(coordinates: Coordinates, radiusMeters: number): string {
  return `${coordinates.latitude}:${coordinates.longitude}:${radiusMeters}`;
}

function cloneMosques(results: Mosque[]): Mosque[] {
  return results.map(mosque => ({ ...mosque }));
}

function readCachedMosques(key: string): Mosque[] | null {
  const cached = mosqueCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    mosqueCache.delete(key);
    return null;
  }
  return cloneMosques(cached.results);
}

function cacheMosques(
  key: string,
  results: Mosque[],
  ttlMs: number,
  generation: number,
): void {
  if (ttlMs <= 0 || generation !== mosqueCacheGeneration) return;
  if (!mosqueCache.has(key) && mosqueCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = mosqueCache.keys().next().value;
    if (oldestKey) mosqueCache.delete(oldestKey);
  }
  mosqueCache.set(key, {
    expiresAt: Date.now() + ttlMs,
    results: cloneMosques(results),
  });
}

function retryDelayMs(
  error: unknown,
  retryIndex: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number,
): number {
  if (error instanceof MosqueLookupError && error.statusCode === 429) {
    return 0;
  }
  const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** retryIndex);
  return Math.floor(Math.max(0, Math.min(1, random())) * (cap + 1));
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function request(
  endpoint: string,
  query: string,
  fetchImpl: OverpassFetch,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ response: Response; body: unknown }> {
  if (signal?.aborted) throw abortError();

  const controller =
    typeof AbortController === 'undefined' ? undefined : new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbortListener: (() => void) | undefined;
  const externalAbortPromise = new Promise<never>((_, reject) => {
    const onAbort = () => {
      controller?.abort();
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    removeAbortListener = () => signal?.removeEventListener('abort', onAbort);
  });
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
          undefined,
          'TIMEOUT',
        ),
      );
    }, timeoutMs);
  });

  try {
    let response: Response;
    try {
      response = await Promise.race([
        fetchPromise,
        timeoutPromise,
        externalAbortPromise,
      ]);
    } catch (error) {
      if (timedOut || signal?.aborted || error instanceof MosqueLookupError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'Network request failed';
      throw new MosqueLookupError(`Overpass request failed: ${message}`);
    }

    if (!response.ok) return { response, body: null };

    let body: unknown;
    try {
      body = await Promise.race([
        response.json(),
        timeoutPromise,
        externalAbortPromise,
      ]);
    } catch (error) {
      if (timedOut || signal?.aborted || error instanceof MosqueLookupError) {
        throw error;
      }
      throw new MosqueLookupError(
        `Overpass returned invalid JSON (HTTP ${response.status})`,
        response.status,
        'INVALID_RESPONSE',
      );
    }
    return { response, body };
  } finally {
    if (timer) clearTimeout(timer);
    removeAbortListener?.();
  }
}

export async function getNearbyMosques(
  coordinates: Coordinates,
  options: MosqueLookupOptions = {},
): Promise<Mosque[]> {
  validateCoordinates(coordinates);
  const radiusMeters = options.radiusMeters ?? MAX_RADIUS_METERS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryBaseDelayMs =
    options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  const retryMaxDelayMs = options.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS;
  const cacheTtlMs = options.cacheTtlMs ?? 0;
  validateRadius(radiusMeters);
  validateTimeout(timeoutMs);
  validateNonNegativeNumber(retryBaseDelayMs, 'Retry base delay');
  validateNonNegativeNumber(retryMaxDelayMs, 'Retry maximum delay');
  validateNonNegativeNumber(cacheTtlMs, 'Cache TTL');
  if (retryMaxDelayMs < retryBaseDelayMs) {
    throw new MosqueLookupError(
      'Retry maximum delay must not be less than retry base delay',
    );
  }
  if (options.signal?.aborted) throw abortError();

  const endpoints = options.endpoints ?? OVERPASS_ENDPOINTS;
  if (
    !endpoints.length ||
    endpoints.some(endpoint => !endpoint.startsWith('https://'))
  ) {
    throw new MosqueLookupError('No valid Overpass endpoint is configured');
  }
  const maxAttempts = options.maxAttempts ?? endpoints.length;
  validateAttemptCount(maxAttempts, endpoints.length);

  const cacheGeneration = mosqueCacheGeneration;
  const key = cacheKey(coordinates, radiusMeters);
  if (!options.forceRefresh) {
    const cached = readCachedMosques(key);
    if (cached) return cached;
  }

  const query = buildQuery(
    coordinates,
    radiusMeters,
    overpassTimeoutSeconds(timeoutMs),
  );
  const fetchImpl = options.fetchImpl ?? fetch;
  const random = options.random ?? Math.random;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const endpoint = endpoints[attempt % endpoints.length];
    try {
      const { response, body } = await request(
        endpoint,
        query,
        fetchImpl,
        timeoutMs,
        options.signal,
      );
      if (!response.ok) {
        throw new MosqueLookupError(
          `Overpass request failed (HTTP ${response.status})`,
          response.status,
        );
      }

      const seen = new Set<string>();
      const results = responseElements(body)
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
      cacheMosques(key, results, cacheTtlMs, cacheGeneration);
      return results;
    } catch (error) {
      lastError = error;
      if (options.signal?.aborted || !isRetryableError(error)) throw error;
      if (attempt === maxAttempts - 1) throw error;
      await waitForRetry(
        retryDelayMs(error, attempt, retryBaseDelayMs, retryMaxDelayMs, random),
        options.signal,
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new MosqueLookupError('Overpass request failed');
}
