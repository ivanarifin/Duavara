import {
  AlAdhanCalculationOptions,
  AlAdhanMethod,
  AlAdhanTimingsData,
  ApiEnvelope,
  Coordinates,
  HighLatitudeRule,
  PrayerSettings,
  QiblaData,
} from '@/domain/types';
import { formatLocalDate } from '@/domain/prayer';

const DEFAULT_BASE_URL = 'https://api.aladhan.com/v1';
const DEFAULT_TIMEOUT_MS = 15_000;

export class AlAdhanError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'AlAdhanError';
  }
}

export interface AlAdhanClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function validateCoordinates(coordinates: Coordinates): void {
  if (
    !Number.isFinite(coordinates.latitude) ||
    coordinates.latitude < -90 ||
    coordinates.latitude > 90 ||
    !Number.isFinite(coordinates.longitude) ||
    coordinates.longitude < -180 ||
    coordinates.longitude > 180
  ) {
    throw new Error('Coordinates must be finite latitude/longitude values');
  }
}

function validateSettings(settings: PrayerSettings): void {
  if (
    settings.method !== null &&
    (!Number.isInteger(settings.method) || settings.method < 0)
  ) {
    throw new Error('Prayer calculation method must be a non-negative integer');
  }
  if (settings.school !== 'standard' && settings.school !== 'hanafi') {
    throw new Error('Prayer school must be standard or hanafi');
  }
}

const HIGH_LATITUDE_METHODS: Record<HighLatitudeRule, number> = {
  angleBased: 3,
  midnight: 1,
  oneSeventh: 2,
};
const ADJUSTMENT_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
const ADJUSTMENT_POSITIONS = {
  Fajr: 0,
  Dhuhr: 2,
  Asr: 3,
  Maghrib: 5,
  Isha: 9,
} as const;

function validateTimezone(timezone: unknown): asserts timezone is string {
  if (typeof timezone !== 'string' || !timezone.trim()) {
    throw new Error('Timezone must be a valid IANA timezone');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new Error(`Timezone must be a valid IANA timezone: ${timezone}`);
  }
}

function validateCalculation(
  calculation: AlAdhanCalculationOptions,
): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (calculation.timezone !== undefined) {
    validateTimezone(calculation.timezone);
    params.timezonestring = calculation.timezone;
  }
  if (calculation.highLatitudeRule !== undefined) {
    if (
      !Object.prototype.hasOwnProperty.call(
        HIGH_LATITUDE_METHODS,
        calculation.highLatitudeRule,
      )
    ) {
      throw new Error(
        'High latitude rule must be angleBased, midnight, or oneSeventh',
      );
    }
    params.latitudeAdjustmentMethod =
      HIGH_LATITUDE_METHODS[calculation.highLatitudeRule];
  }

  if (calculation.adjustments === undefined) return params;
  const adjustments = calculation.adjustments;
  if (typeof adjustments !== 'object' || adjustments === null) {
    throw new Error('Prayer adjustments must be an object');
  }
  Object.entries(adjustments).forEach(([name, value]) => {
    if (
      !ADJUSTMENT_NAMES.includes(name as (typeof ADJUSTMENT_NAMES)[number]) ||
      !Number.isInteger(value) ||
      value < -180 ||
      value > 180
    ) {
      throw new Error(
        `${name} adjustment must be an integer from -180 through 180`,
      );
    }
  });
  const tune = Array.from({ length: 10 }, () => 0);
  ADJUSTMENT_NAMES.forEach(name => {
    const value = adjustments[name];
    if (value !== undefined) tune[ADJUSTMENT_POSITIONS[name]] = value;
  });
  params.tune = tune.join(',');
  return params;
}

function validateYear(year: number): void {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new Error('Year must be an integer from 1000 through 9999');
  }
}

function validateMonth(month: number): void {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Month must be an integer from 1 through 12');
  }
}

function apiDate(date: string | Date): string {
  if (date instanceof Date) return formatLocalDate(date);
  if (!/^\d{2}-\d{2}-\d{4}$/.test(date)) {
    throw new Error('Date must use DD-MM-YYYY format');
  }
  const [day, month, year] = date.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new Error(`Invalid date: ${date}`);
  }
  return date;
}

function queryValue(value: string | number): string {
  return String(value);
}

export class AlAdhanClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AlAdhanClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    if (!this.baseUrl) throw new Error('AlAdhan base URL is required');
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error('AlAdhan timeout must be positive');
    }
  }

  private async request<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<ApiEnvelope<T>> {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) search.set(key, queryValue(value));
    });
    const url = `${this.baseUrl}${path}${
      search.toString() ? `?${search}` : ''
    }`;
    const controller =
      typeof AbortController === 'undefined'
        ? undefined
        : new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller?.abort();
        reject(
          new AlAdhanError(
            `AlAdhan request timed out after ${this.timeoutMs}ms`,
          ),
        );
      }, this.timeoutMs);
    });

    let response: Response;
    try {
      try {
        response = await Promise.race([
          this.fetchImpl(
            url,
            controller ? { signal: controller.signal } : undefined,
          ),
          timeoutPromise,
        ]);
      } catch (error) {
        if (timedOut) throw error;
        const message =
          error instanceof Error ? error.message : 'Network request failed';
        throw new AlAdhanError(`AlAdhan request failed: ${message}`);
      }

      let body: unknown;
      try {
        body = await Promise.race([response.json(), timeoutPromise]);
      } catch (error) {
        if (timedOut) throw error;
        throw new AlAdhanError(
          `AlAdhan returned invalid JSON (HTTP ${response.status})`,
          response.status,
        );
      }
      if (!response.ok) {
        throw new AlAdhanError(
          `AlAdhan request failed (HTTP ${response.status})`,
          response.status,
        );
      }
      if (
        typeof body !== 'object' ||
        body === null ||
        typeof (body as { code?: unknown }).code !== 'number' ||
        !('data' in body)
      ) {
        throw new AlAdhanError('AlAdhan returned an unexpected response');
      }
      const envelope = body as ApiEnvelope<T>;
      if (envelope.code !== 200) {
        throw new AlAdhanError(
          `AlAdhan API error ${envelope.code}: ${
            envelope.status || 'unknown error'
          }`,
          envelope.code,
        );
      }
      return envelope;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  getTimings(
    date: string | Date,
    coordinates: Coordinates,
    settings: PrayerSettings,
    calculation?: AlAdhanCalculationOptions,
  ): Promise<ApiEnvelope<AlAdhanTimingsData>> {
    validateCoordinates(coordinates);
    validateSettings(settings);
    const calculationParams = calculation
      ? validateCalculation(calculation)
      : {};
    return this.request<AlAdhanTimingsData>(`/timings/${apiDate(date)}`, {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      method: settings.method ?? undefined,
      school: settings.school === 'hanafi' ? 1 : 0,
      iso8601: 'true',
      ...calculationParams,
    });
  }

  getCalendar(
    month: number,
    year: number,
    coordinates: Coordinates,
    settings: PrayerSettings,
    calculation?: AlAdhanCalculationOptions,
  ): Promise<ApiEnvelope<AlAdhanTimingsData[]>> {
    validateMonth(month);
    validateYear(year);
    validateCoordinates(coordinates);
    validateSettings(settings);
    const calculationParams = calculation
      ? validateCalculation(calculation)
      : {};
    return this.request<AlAdhanTimingsData[]>(`/calendar/${year}/${month}`, {
      month,
      year,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      method: settings.method ?? undefined,
      school: settings.school === 'hanafi' ? 1 : 0,
      iso8601: 'true',
      ...calculationParams,
    });
  }

  getMethods(): Promise<ApiEnvelope<Record<string, AlAdhanMethod>>> {
    return this.request<Record<string, AlAdhanMethod>>('/methods');
  }

  getQibla(coordinates: Coordinates): Promise<ApiEnvelope<QiblaData>> {
    validateCoordinates(coordinates);
    return this.request<QiblaData>(
      `/qibla/${coordinates.latitude}/${coordinates.longitude}`,
    );
  }

  getNextHijriHoliday(): Promise<ApiEnvelope<unknown>> {
    return this.request<unknown>('/nextHijriHoliday');
  }

  getIslamicMonths(): Promise<ApiEnvelope<unknown>> {
    return this.request<unknown>('/islamicMonths');
  }

  getSpecialDays(): Promise<ApiEnvelope<unknown>> {
    return this.request<unknown>('/specialDays');
  }

  getAsmaAlHusna(): Promise<ApiEnvelope<unknown>> {
    return this.request<unknown>('/asmaAlHusna');
  }
}

export const alAdhanClient = new AlAdhanClient();
