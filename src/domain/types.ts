export const PRAYER_NAMES = [
  'Fajr',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
] as const;

export type PrayerName = (typeof PRAYER_NAMES)[number];
export type PrayerSchool = 'standard' | 'hanafi';
export type FastingRoutine = 'off' | 'mondayThursday' | 'dawud';
export type AdhanVolumeCategory = 'alarm' | 'media' | 'notification';
export type LocationProfileKind =
  | 'home'
  | 'work'
  | 'mosque'
  | 'travel'
  | 'custom';
export type HighLatitudeRule = 'angleBased' | 'midnight' | 'oneSeventh';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface PrayerAdjustments {
  Fajr: number;
  Dhuhr: number;
  Asr: number;
  Maghrib: number;
  Isha: number;
}

export interface LocationProfile {
  id: string;
  name: string;
  kind: LocationProfileKind;
  coordinates: Coordinates;
  timezone?: string;
  highLatitudeRule?: HighLatitudeRule;
  adjustments?: Partial<PrayerAdjustments>;
}

export interface LocationProfileStore {
  activeProfileId: string | null;
  profiles: LocationProfile[];
}

export interface AlAdhanCalculationOptions {
  timezone?: string;
  highLatitudeRule?: HighLatitudeRule;
  adjustments?: Partial<PrayerAdjustments>;
  locationProfile?: LocationProfile;
}

export interface CachedScheduleSet {
  profileId: string;
  calculationKey: string;
  savedAt: number;
  schedules: DailyPrayerData[];
}

export interface PrayerSettings {
  method: number;
  school: PrayerSchool;
  notificationsEnabled: boolean;
  adhanEnabled: boolean;
  adhanVolumeCategory: AdhanVolumeCategory;
  enabledPrayers: Record<PrayerName, boolean>;
  fastingRoutine: FastingRoutine;
  fastingAlarmsEnabled: boolean;
  suhoorReminderEnabled: boolean;
  imsakAlarmEnabled: boolean;
  dawudAnchorDate: string | null;
  use24HourTime: boolean;
}

export interface LocationInfo {
  coordinates: Coordinates;
  timestamp: number;
  source: 'device';
}

export interface PrayerTime {
  name: PrayerName;
  time: string;
  date: Date;
}

export interface ImsakTime {
  time: string;
  date: Date;
}

export interface DailyPrayerData {
  date: string;
  timings: Record<PrayerName, string>;
  prayers: PrayerTime[];
  imsak: ImsakTime;
  timezone?: string;
  location?: Coordinates;
}

export interface ApiEnvelope<T> {
  code: number;
  status: string;
  data: T;
}

export interface AlAdhanTimingsData {
  timings: Record<string, string>;
  date?: {
    readable?: string;
    gregorian?: { date?: string };
    hijri?: Record<string, unknown>;
  };
  meta?: {
    timezone?: string;
    latitude?: number;
    longitude?: number;
    method?: Record<string, unknown>;
  };
}

export interface QiblaData extends Coordinates {
  direction: number;
}

export interface AlAdhanMethod {
  id: number;
  name: string;
  params?: Record<string, number | string>;
  location?: Record<string, string>;
}
