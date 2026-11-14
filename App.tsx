import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  AlAdhanCalculationOptions,
  AlAdhanMethod,
  AlAdhanTimingsData,
  Coordinates,
  DailyPrayerData,
  formatCountdown,
  formatDateKeyInTimeZone,
  formatLocalDate,
  formatLocalDateKey,
  addDateKey,
  HighLatitudeRule,
  isValidLocalDateKey,
  isSignedDecimalInput,
  isUnsignedIntegerInput,
  isSignedIntegerInput,
  parseSignedDecimal,
  parseSignedInteger,
  LocationProfile,
  LocationProfileKind,
  LocationProfileStore,
  PrayerAdjustments,
  formatPrayerScheduleForSharing,
  formatPrayerTime,
  getNextPrayer,
  isFastingDate,
  PRAYER_NAMES,
  PrayerName,
  PrayerSettings,
  PrayerTime,
  QiblaData,
  toDailyPrayerData,
} from '@/domain';
import appIconAsset from '@/assets/duavara-app-icon.png';
import {
  MotionSheet,
  PressableScale,
  ProgressRail,
  PulseDot,
  Reveal,
  ScreenTransition,
  Skeleton,
  ValuePop,
} from '@/ui/motion';
import { COLORS, FONTS, SHADOW } from '@/ui/theme';
import type { AppInfo } from '@/services/appInfo';
import type { CompassHeading } from '@/services/compass';
import {
  NearbyMosques,
  QiblaCameraFinder,
  QuranReader,
  RamadanDashboard,
  SplashScreen,
  WorshipCompanion,
  ZakatCalculator,
} from '@/components';
import {
  alAdhanClient,
  cancelFastingNotifications,
  cancelPrayerNotifications,
  clearPrayerWidget,
  clearNearbyMosqueCache,
  DEFAULT_PRAYER_SETTINGS,
  deleteAllLocalData,
  getCachedSchedule,
  getCachedSchedules,
  getAppInfo,
  getDeviceLocation,
  getLocationProfileStore,
  getNotificationHealth,
  getRegionName,
  hasNativeNotificationSupport,
  NotificationHealth,
  getPrayerSettings,
  openBatteryOptimizationSettings,
  openExactAlarmSettings,
  playAdhanPreview,
  saveCachedSchedules,
  savePrayerSettings,
  setActiveLocationProfile,
  upsertLocationProfile,
  getRelativeQiblaAngle,
  startQiblaCompass,
  schedulePrayerNotifications,
  stopAdhanPreview,
  syncPrayerWidget,
  widgetLocationLabel,
} from '@/services';

type Tab = 'today' | 'calendar' | 'qibla' | 'discover' | 'about';
type DiscoverData = {
  nextHoliday: unknown;
  months: unknown;
  specialDays: unknown;
  names: unknown;
};

type QuranShortcutRequest = { id: number };

const QURAN_SHORTCUT_URL = /^duavara:\/\/quran\/?$/;

const SUPPORT_DUAVARA_LINK = {
  label: 'Support Duavara on Buy Me a Coffee',
  url: 'https://buymeacoffee.com/ivanarifin',
} as const;

const ABOUT_LINKS = [
  {
    label: 'Open Duavara source repository',
    title: 'Source repository',
    description: 'View Duavara on GitHub.',
    url: 'https://github.com/ivanarifin/Duavara',
  },
  {
    label: 'View Duavara privacy policy',
    title: 'Privacy policy',
    description: 'Read how Duavara handles app data.',
    url: 'https://github.com/ivanarifin/Duavara/blob/main/PRIVACY.md',
  },
  {
    label: 'View Duavara Apache 2.0 license',
    title: 'Apache License 2.0',
    description: 'Read the app license and contribution terms.',
    url: 'https://github.com/ivanarifin/Duavara/blob/main/LICENSE',
  },
  {
    label: 'View third-party notices',
    title: 'Third-party notices',
    description: 'Review sources, licenses, and required attribution.',
    url: 'https://github.com/ivanarifin/Duavara/blob/main/THIRD_PARTY_NOTICES.md',
  },
  {
    label: 'Open AlAdhan data source',
    title: 'AlAdhan',
    description: 'Prayer times, Qibla, and Hijri data.',
    url: 'https://aladhan.com/prayer-times-api',
  },
  {
    label: 'Open AlQuran.cloud data source',
    title: 'AlQuran.cloud',
    description: 'Arabic Quran text, translations, and recitation streams.',
    url: 'https://alquran.cloud/api',
  },
  {
    label: 'Open OpenStreetMap data source',
    title: 'OpenStreetMap',
    description: 'Nearby mosque and direction data.',
    url: 'https://overpass-api.de/',
  },
  {
    label: 'Open latest Duavara release',
    title: 'Latest release',
    description: 'See the newest stable APK on GitHub.',
    url: 'https://github.com/ivanarifin/Duavara/releases/latest',
  },
] as const;

export function isQuranShortcutUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && QURAN_SHORTCUT_URL.test(url);
}

const ARABIC_PRAYER_NAMES: Record<PrayerName, string> = {
  Fajr: 'الفجر',
  Dhuhr: 'الظهر',
  Asr: 'العصر',
  Maghrib: 'المغرب',
  Isha: 'العشاء',
};

const PRAYER_ICONS: Record<PrayerName, string> = {
  Fajr: '◒',
  Dhuhr: '☀',
  Asr: '◐',
  Maghrib: '◑',
  Isha: '☾',
};

const CALENDAR_COLUMN_LABELS: Record<PrayerName, string> = {
  Fajr: 'FJR',
  Dhuhr: 'DHR',
  Asr: 'ASR',
  Maghrib: 'MGH',
  Isha: 'ISH',
};

const TAB_ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: '⌂' },
  { id: 'calendar', label: 'Calendar', icon: '▦' },
  { id: 'qibla', label: 'Qibla', icon: '⌁' },
  { id: 'discover', label: 'Discover', icon: '✦' },
  { id: 'about', label: 'About', icon: 'ⓘ' },
];

const DEFAULT_PRAYER_ADJUSTMENTS: PrayerAdjustments = {
  Fajr: 0,
  Dhuhr: 0,
  Asr: 0,
  Maghrib: 0,
  Isha: 0,
};

function profileCalculationOptions(
  profile: LocationProfile | null,
): AlAdhanCalculationOptions | undefined {
  if (!profile) return undefined;
  const adjustments = profile.adjustments;
  return {
    ...(profile.timezone ? { timezone: profile.timezone } : {}),
    ...(profile.highLatitudeRule
      ? { highLatitudeRule: profile.highLatitudeRule }
      : {}),
    ...(adjustments && Object.values(adjustments).some(value => value !== 0)
      ? { adjustments }
      : {}),
  };
}

export function getCalculationKey(
  profile: LocationProfile,
  settings: PrayerSettings,
): string {
  return JSON.stringify({
    method: settings.method,
    school: settings.school,
    latitude: profile.coordinates.latitude,
    longitude: profile.coordinates.longitude,
    timezone: profile.timezone ?? null,
    highLatitudeRule: profile.highLatitudeRule ?? null,
    adjustments: { ...DEFAULT_PRAYER_ADJUSTMENTS, ...profile.adjustments },
  });
}

function profileName(kind: LocationProfileKind): string {
  return {
    home: 'Home',
    work: 'Work',
    mosque: 'Mosque',
    travel: 'Travel',
    custom: 'My place',
  }[kind];
}

function notificationHealthLabel(
  value:
    | NotificationHealth['notifications']
    | NotificationHealth['timing']
    | NotificationHealth['batteryOptimization'],
): string {
  return (
    {
      allowed: 'Allowed',
      blocked: 'Blocked',
      notDetermined: 'Not set',
      exact: 'Exact timing available',
      approximate: 'Approximate timing',
      unrestricted: 'Unrestricted',
      restricted: 'May delay alerts',
      notApplicable: 'Not applicable',
      unknown: 'Unavailable',
    }[value] ?? 'Unavailable'
  );
}

function createProfileId(): string {
  return `place-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function getHijriLabel(data: AlAdhanTimingsData): string | null {
  const hijri = data.date?.hijri as
    | { day?: unknown; month?: { en?: unknown }; year?: unknown }
    | undefined;
  if (
    !hijri ||
    typeof hijri.day !== 'string' ||
    typeof hijri.year !== 'string'
  ) {
    return null;
  }
  const month = typeof hijri.month?.en === 'string' ? hijri.month.en : '';
  return [hijri.day, month, hijri.year].filter(Boolean).join(' ');
}

function getCurrentPrayer(
  prayers: readonly PrayerTime[],
  now: Date,
): PrayerTime | null {
  return (
    [...prayers]
      .sort((first, second) => second.date.getTime() - first.date.getTime())
      .find(prayer => prayer.date.getTime() <= now.getTime()) ?? null
  );
}

function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function getTimingDate(data: AlAdhanTimingsData, fallback: Date): string {
  return data.date?.gregorian?.date ?? formatLocalDate(fallback);
}

function asRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    item => typeof item === 'object' && item !== null,
  ) as Record<string, unknown>[];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getCachedTodaySchedule(
  schedules: readonly DailyPrayerData[],
  todayKey: string,
): DailyPrayerData | null {
  return schedules.find(schedule => schedule.date === todayKey) ?? null;
}

export function parseManualCoordinates(
  latitudeInput: string,
  longitudeInput: string,
): Coordinates | null {
  const latitudeText = latitudeInput.trim();
  const longitudeText = longitudeInput.trim();
  if (!latitudeText || !longitudeText) return null;
  const latitude = parseSignedDecimal(latitudeText);
  const longitude = parseSignedDecimal(longitudeText);
  return latitude !== null &&
    longitude !== null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
    ? { latitude, longitude }
    : null;
}

function dateKeyParts(dateKey: string | null): [string, string, string] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey ?? '');
  return match ? [match[1], match[2], match[3]] : ['', '', ''];
}

export function formatLocationLabel(
  regionName: string | null,
  activeProfileName: string | null,
  coordinates: Coordinates | null,
): string {
  if (regionName) return `in ${regionName}`;
  if (activeProfileName) return activeProfileName;
  return coordinates
    ? `${coordinates.latitude.toFixed(2)}°, ${coordinates.longitude.toFixed(
        2,
      )}°`
    : 'Set your location';
}

class RootErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyKicker}>DUAVARA NEEDS A RESET</Text>
          <Text style={styles.emptyTitle}>Something went wrong.</Text>
          <Text style={styles.emptyText}>
            The app could not render this screen. Try again before restarting
            Duavara.
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => this.setState({ hasError: false })}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>TRY AGAIN</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [hasFinishedSplash, setHasFinishedSplash] = useState(false);
  const [appSession, setAppSession] = useState(0);
  const [quranShortcutRequest, setQuranShortcutRequest] =
    useState<QuranShortcutRequest | null>(null);
  const shortcutRequestIdRef = useRef(0);
  const finishSplash = useCallback(() => setHasFinishedSplash(true), []);
  const resetAppSession = useCallback(
    () => setAppSession(current => current + 1),
    [],
  );
  const requestQuranShortcut = useCallback(() => {
    shortcutRequestIdRef.current += 1;
    setQuranShortcutRequest({ id: shortcutRequestIdRef.current });
  }, []);
  const consumeQuranShortcut = useCallback((requestId: number) => {
    setQuranShortcutRequest(current =>
      current?.id === requestId ? null : current,
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    const handleUrl = (url: string | null | undefined) => {
      if (isQuranShortcutUrl(url)) requestQuranShortcut();
    };
    const subscription = Linking.addEventListener('url', event =>
      handleUrl(event.url),
    );

    Linking.getInitialURL()
      .then(url => {
        if (!cancelled) handleUrl(url);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [requestQuranShortcut]);

  return (
    <RootErrorBoundary>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        {hasFinishedSplash ? (
          <Duavara
            key={appSession}
            onLocalDataDeleted={resetAppSession}
            quranShortcutRequest={quranShortcutRequest}
            onQuranShortcutHandled={consumeQuranShortcut}
          />
        ) : (
          <SplashScreen onFinish={finishSplash} />
        )}
      </SafeAreaProvider>
    </RootErrorBoundary>
  );
}

function Duavara({
  onLocalDataDeleted,
  quranShortcutRequest,
  onQuranShortcutHandled,
}: {
  onLocalDataDeleted: () => void;
  quranShortcutRequest: QuranShortcutRequest | null;
  onQuranShortcutHandled: (requestId: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('today');
  const [isQuranReaderOpen, setIsQuranReaderOpen] = useState(false);
  const [settings, setSettings] = useState<PrayerSettings>(
    DEFAULT_PRAYER_SETTINGS,
  );
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [regionName, setRegionName] = useState<string | null>(null);
  const [profileStore, setProfileStore] = useState<LocationProfileStore>({
    activeProfileId: null,
    profiles: [],
  });
  const [today, setToday] = useState<DailyPrayerData | null>(null);
  const [upcomingSchedules, setUpcomingSchedules] = useState<DailyPrayerData[]>(
    [],
  );
  const [monthSchedules, setMonthSchedules] = useState<DailyPrayerData[]>([]);
  const [hijriDate, setHijriDate] = useState<string | null>(null);
  const [methods, setMethods] = useState<AlAdhanMethod[]>([]);
  const [qibla, setQibla] = useState<QiblaData | null>(null);
  const [discover, setDiscover] = useState<DiscoverData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [latitudeInput, setLatitudeInput] = useState('');
  const [longitudeInput, setLongitudeInput] = useState('');
  const [profileNameInput, setProfileNameInput] = useState('Home');
  const [profileKindInput, setProfileKindInput] =
    useState<LocationProfileKind>('home');
  const [timezoneInput, setTimezoneInput] = useState('');
  const [highLatitudeRuleInput, setHighLatitudeRuleInput] = useState<
    HighLatitudeRule | 'default'
  >('default');
  const [adjustmentInputs, setAdjustmentInputs] = useState<
    Record<PrayerName, string>
  >({ Fajr: '0', Dhuhr: '0', Asr: '0', Maghrib: '0', Isha: '0' });
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const nativeNotificationsAvailable = hasNativeNotificationSupport();
  const [notificationHealth, setNotificationHealth] =
    useState<NotificationHealth>({
      notifications: 'unknown',
      timing: 'unknown',
      batteryOptimization: 'unknown',
      bootRescheduling: 'notApplicable',
    });
  const requestTokenRef = useRef(0);
  const regionNameRef = useRef(regionName);
  regionNameRef.current = regionName;
  const activeProfileNameRef = useRef<string | null>(null);
  const regionRequestRef = useRef(0);
  const qiblaRequestTokenRef = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const schedulesRef = useRef(upcomingSchedules);
  schedulesRef.current = upcomingSchedules;
  const notificationTransactionRef = useRef<Promise<void>>(Promise.resolve());
  const settingsTransactionRef = useRef<Promise<void>>(Promise.resolve());
  const cacheCommitRef = useRef<Promise<void>>(Promise.resolve());
  const widgetCommitRef = useRef<Promise<void>>(Promise.resolve());
  const scrollRef = useRef<ScrollViewInstance>(null);
  const beginRequest = useCallback(() => {
    requestTokenRef.current += 1;
    return requestTokenRef.current;
  }, []);

  const coordinateLatitude = coordinates?.latitude;
  const coordinateLongitude = coordinates?.longitude;
  useEffect(() => {
    const requestId = regionRequestRef.current + 1;
    regionRequestRef.current = requestId;
    setRegionName(null);
    if (coordinateLatitude === undefined || coordinateLongitude === undefined)
      return;
    getRegionName({
      latitude: coordinateLatitude,
      longitude: coordinateLongitude,
    })
      .then(region => {
        if (regionRequestRef.current === requestId) setRegionName(region);
      })
      .catch(() => {
        if (regionRequestRef.current === requestId) setRegionName(null);
      });
  }, [coordinateLatitude, coordinateLongitude]);
  const isCurrentRequest = useCallback(
    (token: number) => requestTokenRef.current === token,
    [],
  );
  const clearPrayerSchedules = useCallback(() => {
    schedulesRef.current = [];
    setToday(null);
    setUpcomingSchedules([]);
    setMonthSchedules([]);
    setHijriDate(null);
    const queued = widgetCommitRef.current.then(() =>
      clearPrayerWidget().catch(() => undefined),
    );
    widgetCommitRef.current = queued.catch(() => undefined);
  }, []);
  const invalidateQibla = useCallback(() => {
    qiblaRequestTokenRef.current += 1;
    setQibla(null);
  }, []);
  const activeProfile = useMemo(
    () =>
      profileStore.profiles.find(
        profile => profile.id === profileStore.activeProfileId,
      ) ?? null,
    [profileStore],
  );
  activeProfileNameRef.current = activeProfile?.name ?? null;

  useEffect(() => {
    if (!upcomingSchedules.length) return;
    const queued = widgetCommitRef.current.then(() =>
      syncPrayerWidget(
        upcomingSchedules,
        widgetLocationLabel(
          regionNameRef.current,
          activeProfileNameRef.current,
        ),
      ).catch(() => undefined),
    );
    widgetCommitRef.current = queued.catch(() => undefined);
  }, [regionName, upcomingSchedules]);

  const syncProfileInputs = useCallback((profile: LocationProfile) => {
    setProfileNameInput(profile.name);
    setProfileKindInput(profile.kind);
    setLatitudeInput(profile.coordinates.latitude.toFixed(4));
    setLongitudeInput(profile.coordinates.longitude.toFixed(4));
    setTimezoneInput(profile.timezone ?? '');
    setHighLatitudeRuleInput(profile.highLatitudeRule ?? 'default');
    setAdjustmentInputs(
      Object.fromEntries(
        PRAYER_NAMES.map(name => [
          name,
          String(profile.adjustments?.[name] ?? 0),
        ]),
      ) as Record<PrayerName, string>,
    );
  }, []);

  const scheduleNotificationsNow = useCallback(
    async (
      schedules: readonly DailyPrayerData[],
      nextSettings: PrayerSettings,
    ) => {
      if (!schedules.length) {
        await cancelPrayerNotifications();
        await cancelFastingNotifications();
        return;
      }
      await schedulePrayerNotifications(schedules.slice(0, 7), {
        prayerRemindersEnabled: nextSettings.notificationsEnabled,
        adhanEnabled: nextSettings.adhanEnabled,
        adhanVolumeCategory: nextSettings.adhanVolumeCategory,
        enabledPrayers: nextSettings.enabledPrayers,
        use24HourTime: nextSettings.use24HourTime,
        fasting: nextSettings,
      });
    },
    [],
  );

  const enqueueNotificationOperation = useCallback(
    (operation: () => Promise<void>) => {
      const queued = notificationTransactionRef.current.then(operation);
      notificationTransactionRef.current = queued.catch(() => undefined);
      return queued;
    },
    [],
  );

  const enqueueSettingsOperation = useCallback(
    (operation: () => Promise<void>) => {
      const queued = settingsTransactionRef.current.then(operation);
      settingsTransactionRef.current = queued.catch(() => undefined);
      return queued;
    },
    [],
  );

  const commitCachedSchedules = useCallback(
    (
      profile: LocationProfile,
      nextSettings: PrayerSettings,
      schedules: readonly DailyPrayerData[],
      requestToken: number,
    ) => {
      const queued = cacheCommitRef.current.then(async () => {
        if (!isCurrentRequest(requestToken)) return;
        await saveCachedSchedules(
          profile.id,
          getCalculationKey(profile, nextSettings),
          schedules,
        );
      });
      cacheCommitRef.current = queued.catch(() => undefined);
      return queued;
    },
    [isCurrentRequest],
  );

  const commitWidget = useCallback(
    (schedules: readonly DailyPrayerData[], requestToken: number) => {
      const queued = widgetCommitRef.current.then(async () => {
        if (!isCurrentRequest(requestToken)) return;
        const locationLabel = widgetLocationLabel(
          regionNameRef.current,
          activeProfileNameRef.current,
        );
        await syncPrayerWidget(schedules, locationLabel).catch(() => undefined);
        if (!isCurrentRequest(requestToken)) {
          await syncPrayerWidget(schedulesRef.current, locationLabel).catch(
            () => undefined,
          );
        }
      });
      widgetCommitRef.current = queued.catch(() => undefined);
      return queued;
    },
    [isCurrentRequest],
  );

  const restoreCachedSchedules = useCallback(
    async (
      profile: LocationProfile,
      nextSettings: PrayerSettings,
      requestToken: number,
    ) => {
      const schedules = await getCachedSchedules(
        profile.id,
        getCalculationKey(profile, nextSettings),
      );
      if (!isCurrentRequest(requestToken) || !schedules?.length) return false;
      const todayKey = formatDateKeyInTimeZone(new Date(), profile.timezone);
      const todaySchedule = getCachedTodaySchedule(schedules, todayKey);
      if (!todaySchedule || !isCurrentRequest(requestToken)) return false;
      schedulesRef.current = schedules;
      setCoordinates(profile.coordinates);
      setToday(todaySchedule);
      setUpcomingSchedules(schedules);
      setMonthSchedules(schedules);
      syncProfileInputs(profile);
      if (!isCurrentRequest(requestToken)) return false;
      await commitWidget(schedules, requestToken);
      return isCurrentRequest(requestToken);
    },
    [commitWidget, isCurrentRequest, syncProfileInputs],
  );

  const refreshForCoordinates = useCallback(
    async (
      profile: LocationProfile,
      nextSettings: PrayerSettings,
      requestToken: number,
    ) => {
      if (!isCurrentRequest(requestToken)) return;
      const nextCoordinates = profile.coordinates;
      const now = new Date();
      const calculation = profileCalculationOptions(profile);
      const timeZone = profile.timezone;
      const todayKey = formatDateKeyInTimeZone(now, timeZone);
      const endKey = addDateKey(todayKey, 29);
      const month = Number(todayKey.slice(5, 7));
      const year = Number(todayKey.slice(0, 4));
      const endMonth = Number(endKey.slice(5, 7));
      const endYear = Number(endKey.slice(0, 4));
      const [dailyResponse, calendarResponse, followingCalendarResponse] =
        await Promise.all([
          alAdhanClient.getTimings(
            `${todayKey.slice(8, 10)}-${todayKey.slice(5, 7)}-${todayKey.slice(
              0,
              4,
            )}`,
            nextCoordinates,
            nextSettings,
            calculation,
          ),
          alAdhanClient.getCalendar(
            month,
            year,
            nextCoordinates,
            nextSettings,
            calculation,
          ),
          endMonth !== month || endYear !== year
            ? alAdhanClient.getCalendar(
                endMonth,
                endYear,
                nextCoordinates,
                nextSettings,
                calculation,
              )
            : Promise.resolve(null),
        ]);
      if (!isCurrentRequest(requestToken)) return;
      const dailySchedule = toDailyPrayerData(
        dailyResponse.data,
        getTimingDate(dailyResponse.data, now),
        nextCoordinates,
      );
      const scheduleByDate = new Map<string, DailyPrayerData>([
        [dailySchedule.date, dailySchedule],
      ]);
      calendarResponse.data.forEach(entry => {
        const schedule = toDailyPrayerData(
          entry,
          getTimingDate(entry, now),
          nextCoordinates,
        );
        if (schedule.date >= todayKey && schedule.date <= endKey) {
          scheduleByDate.set(schedule.date, schedule);
        }
      });
      followingCalendarResponse?.data.forEach(entry => {
        const schedule = toDailyPrayerData(
          entry,
          getTimingDate(entry, now),
          nextCoordinates,
        );
        if (schedule.date >= todayKey && schedule.date <= endKey) {
          scheduleByDate.set(schedule.date, schedule);
        }
      });

      const schedules = Array.from(scheduleByDate.values())
        .filter(
          schedule => schedule.date >= todayKey && schedule.date <= endKey,
        )
        .sort((first, second) => first.date.localeCompare(second.date))
        .slice(0, 30);

      if (!isCurrentRequest(requestToken)) return;
      schedulesRef.current = schedules;
      setCoordinates(nextCoordinates);
      setToday(dailySchedule);
      setUpcomingSchedules(schedules);
      setMonthSchedules(schedules);
      setHijriDate(getHijriLabel(dailyResponse.data));
      setLatitudeInput(String(nextCoordinates.latitude.toFixed(4)));
      setLongitudeInput(String(nextCoordinates.longitude.toFixed(4)));
      if (!isCurrentRequest(requestToken)) return;
      await commitCachedSchedules(
        profile,
        nextSettings,
        schedules,
        requestToken,
      );
      if (!isCurrentRequest(requestToken)) return;
      await commitWidget(schedules, requestToken);
      if (!isCurrentRequest(requestToken)) return;
      try {
        await enqueueNotificationOperation(async () => {
          if (!isCurrentRequest(requestToken)) return;
          await scheduleNotificationsNow(schedules, settingsRef.current);
          if (!isCurrentRequest(requestToken)) {
            await scheduleNotificationsNow(
              schedulesRef.current,
              settingsRef.current,
            ).catch(() => undefined);
          }
        });
      } catch {
        if (
          isCurrentRequest(requestToken) &&
          (nextSettings.notificationsEnabled ||
            (nextSettings.fastingAlarmsEnabled &&
              nextSettings.fastingRoutine !== 'off'))
        ) {
          setMessage(
            'Prayer times updated, but reminders need notification permission.',
          );
        }
      }
    },
    [
      commitCachedSchedules,
      commitWidget,
      enqueueNotificationOperation,
      isCurrentRequest,
      scheduleNotificationsNow,
    ],
  );

  const refreshDeviceLocation = useCallback(async () => {
    const requestToken = beginRequest();
    setIsRefreshing(true);
    setMessage(null);
    try {
      const location = await getDeviceLocation();
      if (!isCurrentRequest(requestToken)) return;
      const profile: LocationProfile = activeProfile
        ? { ...activeProfile, coordinates: location.coordinates }
        : {
            id: createProfileId(),
            name: 'Home',
            kind: 'home',
            coordinates: location.coordinates,
          };
      const savedStore = await upsertLocationProfile(profile, () =>
        isCurrentRequest(requestToken),
      );
      if (!savedStore || !isCurrentRequest(requestToken)) return;
      clearPrayerSchedules();
      invalidateQibla();
      setProfileStore(savedStore);
      setCoordinates(profile.coordinates);
      setEditingProfileId(profile.id);
      syncProfileInputs(profile);
      await refreshForCoordinates(profile, settings, requestToken);
    } catch (error) {
      if (isCurrentRequest(requestToken)) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Unable to refresh prayer times. Please try again.',
        );
      }
    } finally {
      if (isCurrentRequest(requestToken)) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [
    activeProfile,
    beginRequest,
    isCurrentRequest,
    refreshForCoordinates,
    settings,
    syncProfileInputs,
    clearPrayerSchedules,
    invalidateQibla,
  ]);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const requestToken = beginRequest();
    const initialize = async () => {
      const [savedSettings, savedProfileStore, legacySchedule] =
        await Promise.all([
          getPrayerSettings(),
          getLocationProfileStore(),
          getCachedSchedule(),
        ]);
      if (!isCurrentRequest(requestToken)) return;
      settingsRef.current = savedSettings;
      setSettings(savedSettings);
      let nextStore = savedProfileStore;
      if (!nextStore.profiles.length && legacySchedule?.location) {
        const legacyProfile: LocationProfile = {
          id: 'home',
          name: 'Home',
          kind: 'home',
          coordinates: legacySchedule.location,
        };
        const savedLegacyProfile = await upsertLocationProfile(
          legacyProfile,
          () => isCurrentRequest(requestToken),
        );
        if (!savedLegacyProfile) return;
        nextStore = savedLegacyProfile;
      }
      if (!isCurrentRequest(requestToken)) return;
      setProfileStore(nextStore);
      const profile =
        nextStore.profiles.find(
          item => item.id === nextStore.activeProfileId,
        ) ?? null;
      if (!profile) {
        setIsLoading(false);
        return;
      }
      setCoordinates(profile.coordinates);
      syncProfileInputs(profile);
      await restoreCachedSchedules(profile, savedSettings, requestToken);
      if (!isCurrentRequest(requestToken)) return;
      setIsLoading(false);
      setIsRefreshing(true);
      try {
        await refreshForCoordinates(profile, savedSettings, requestToken);
      } catch {
        if (isCurrentRequest(requestToken)) {
          setMessage(
            'Prayer times are unavailable. Pull to refresh when online.',
          );
        }
      } finally {
        if (isCurrentRequest(requestToken)) setIsRefreshing(false);
      }
    };
    initialize().catch(() => {
      if (isCurrentRequest(requestToken)) {
        clearPrayerSchedules();
        setMessage('Unable to restore saved prayer times.');
        setIsLoading(false);
        setIsRefreshing(false);
      }
    });
  }, [
    beginRequest,
    isCurrentRequest,
    refreshForCoordinates,
    restoreCachedSchedules,
    syncProfileInputs,
    clearPrayerSchedules,
  ]);

  const loadMonth = useCallback(async () => {
    if (!activeProfile) return;
    const requestToken = beginRequest();
    if (upcomingSchedules.length) {
      setMonthSchedules(upcomingSchedules);
      return;
    }
    setIsRefreshing(true);
    try {
      await refreshForCoordinates(activeProfile, settings, requestToken);
    } catch (error) {
      if (isCurrentRequest(requestToken)) {
        setMessage(
          error instanceof Error ? error.message : 'Unable to load calendar.',
        );
      }
    } finally {
      if (isCurrentRequest(requestToken)) setIsRefreshing(false);
    }
  }, [
    activeProfile,
    beginRequest,
    isCurrentRequest,
    refreshForCoordinates,
    settings,
    upcomingSchedules,
  ]);

  const loadQibla = useCallback(
    async (requestCoordinates = coordinates) => {
      if (!requestCoordinates) return;
      const requestToken = qiblaRequestTokenRef.current + 1;
      qiblaRequestTokenRef.current = requestToken;
      setIsRefreshing(true);
      try {
        const response = await alAdhanClient.getQibla(requestCoordinates);
        if (qiblaRequestTokenRef.current === requestToken) {
          setQibla(response.data);
        }
      } catch (error) {
        if (qiblaRequestTokenRef.current === requestToken) {
          setMessage(
            error instanceof Error ? error.message : 'Unable to find Qibla.',
          );
        }
      } finally {
        if (qiblaRequestTokenRef.current === requestToken) {
          setIsRefreshing(false);
        }
      }
    },
    [coordinates],
  );

  const loadDiscover = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [nextHoliday, months, specialDays, names] = await Promise.all([
        alAdhanClient.getNextHijriHoliday(),
        alAdhanClient.getIslamicMonths(),
        alAdhanClient.getSpecialDays(),
        alAdhanClient.getAsmaAlHusna(),
      ]);
      setDiscover({
        nextHoliday: nextHoliday.data,
        months: months.data,
        specialDays: specialDays.data,
        names: names.data,
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to load Islamic resources.',
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const selectTab = useCallback(
    (tab: Tab) => {
      setActiveTab(tab);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      if (tab === 'calendar' && monthSchedules.length === 0) {
        loadMonth().catch(() => undefined);
      }
      if (tab === 'qibla' && !qibla) {
        loadQibla().catch(() => undefined);
      }
      if (tab === 'discover' && !discover) {
        loadDiscover().catch(() => undefined);
      }
    },
    [
      discover,
      loadDiscover,
      loadMonth,
      loadQibla,
      monthSchedules.length,
      qibla,
    ],
  );

  const openQuranReader = useCallback(() => {
    setIsSettingsOpen(false);
    setIsQuranReaderOpen(true);
  }, []);

  useEffect(() => {
    if (!quranShortcutRequest) return;
    openQuranReader();
    onQuranShortcutHandled(quranShortcutRequest.id);
  }, [onQuranShortcutHandled, openQuranReader, quranShortcutRequest]);

  const refreshNotificationHealth = useCallback(async () => {
    try {
      setNotificationHealth(await getNotificationHealth());
    } catch {
      setNotificationHealth({
        notifications: 'unknown',
        timing: 'unknown',
        batteryOptimization: 'unknown',
        bootRescheduling: 'notApplicable',
      });
    }
  }, []);

  const openExternalUrl = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      setMessage('Unable to open this link on this device.');
    }
  }, []);

  const openSettings = useCallback(async () => {
    setIsSettingsOpen(true);
    refreshNotificationHealth().catch(() => undefined);
    if (methods.length) return;
    try {
      const response = await alAdhanClient.getMethods();
      setMethods(Object.values(response.data).sort((a, b) => a.id - b.id));
    } catch {
      setMessage(
        'Calculation methods could not be loaded. Your current method remains active.',
      );
    }
  }, [methods.length, refreshNotificationHealth]);

  const updateSettings = useCallback(
    async (
      update: (current: PrayerSettings) => PrayerSettings,
      refresh = false,
    ) => {
      const shouldRefresh = refresh && activeProfile !== null;
      const requestToken = shouldRefresh ? beginRequest() : null;
      const previousSettings = settingsRef.current;
      const previousSchedules = schedulesRef.current;
      const previousToday = today;
      const previousMonthSchedules = monthSchedules;
      const previousHijriDate = hijriDate;
      let committed: PrayerSettings | undefined;
      let clearedReminders = false;
      try {
        if (shouldRefresh && requestToken !== null) {
          clearPrayerSchedules();
          if (hasNativeNotificationSupport()) {
            clearedReminders = true;
            await enqueueNotificationOperation(async () => {
              if (!isCurrentRequest(requestToken)) return;
              await scheduleNotificationsNow([], previousSettings);
            });
          }
          if (!isCurrentRequest(requestToken)) return;
        }
        await enqueueSettingsOperation(async () => {
          if (
            shouldRefresh &&
            requestToken !== null &&
            !isCurrentRequest(requestToken)
          ) {
            return;
          }
          const nextSettings = update(settingsRef.current);
          await savePrayerSettings(nextSettings);
          settingsRef.current = nextSettings;
          setSettings(nextSettings);
          committed = nextSettings;
        });
        if (
          !shouldRefresh ||
          !committed ||
          !activeProfile ||
          requestToken === null
        )
          return;
        invalidateQibla();
        setIsRefreshing(true);
        try {
          await refreshForCoordinates(activeProfile, committed, requestToken);
        } finally {
          if (isCurrentRequest(requestToken)) setIsRefreshing(false);
        }
      } catch (error) {
        if (
          !committed &&
          (requestToken === null || isCurrentRequest(requestToken))
        ) {
          schedulesRef.current = previousSchedules;
          setToday(previousToday);
          setUpcomingSchedules(previousSchedules);
          setMonthSchedules(previousMonthSchedules);
          setHijriDate(previousHijriDate);
          if (clearedReminders) {
            await enqueueNotificationOperation(() =>
              scheduleNotificationsNow(previousSchedules, previousSettings),
            ).catch(() => undefined);
          }
        }
        setMessage(
          committed
            ? 'Settings saved, but prayer alerts are paused until prayer times refresh.'
            : error instanceof Error
            ? error.message
            : 'Unable to apply preferences.',
        );
      }
    },
    [
      activeProfile,
      beginRequest,
      clearPrayerSchedules,
      enqueueNotificationOperation,
      enqueueSettingsOperation,
      hijriDate,
      invalidateQibla,
      isCurrentRequest,
      monthSchedules,
      refreshForCoordinates,
      scheduleNotificationsNow,
      today,
    ],
  );

  const commitNotificationSettings = useCallback(
    async (
      update: (current: PrayerSettings) => PrayerSettings,
      requestToken: number,
    ) => {
      return enqueueSettingsOperation(() =>
        enqueueNotificationOperation(async () => {
          if (!isCurrentRequest(requestToken)) return;
          const previousSettings = settingsRef.current;
          const nextSettings = update(previousSettings);
          const schedules = schedulesRef.current;
          try {
            await scheduleNotificationsNow(schedules, nextSettings);
            if (!isCurrentRequest(requestToken)) {
              await scheduleNotificationsNow(schedules, previousSettings).catch(
                () => undefined,
              );
              return;
            }
            try {
              await savePrayerSettings(nextSettings);
            } catch (error) {
              await scheduleNotificationsNow(schedules, previousSettings).catch(
                () => undefined,
              );
              await savePrayerSettings(previousSettings).catch(() => undefined);
              throw error;
            }
            if (!isCurrentRequest(requestToken)) {
              await scheduleNotificationsNow(schedules, previousSettings).catch(
                () => undefined,
              );
              return;
            }
            settingsRef.current = nextSettings;
            setSettings(nextSettings);
          } catch (error) {
            throw error;
          }
        }),
      );
    },
    [
      enqueueNotificationOperation,
      enqueueSettingsOperation,
      isCurrentRequest,
      scheduleNotificationsNow,
    ],
  );

  const applyNotificationSettings = useCallback(
    async (
      update: (current: PrayerSettings) => PrayerSettings,
      fallbackMessage: string,
    ) => {
      const requestToken = requestTokenRef.current;
      try {
        await commitNotificationSettings(update, requestToken);
      } catch (error) {
        if (isCurrentRequest(requestToken)) {
          setMessage(error instanceof Error ? error.message : fallbackMessage);
        }
      }
    },
    [commitNotificationSettings, isCurrentRequest],
  );

  const togglePrayerReminder = useCallback(
    async (prayer: PrayerName, enabled: boolean) => {
      await applyNotificationSettings(
        current => ({
          ...current,
          enabledPrayers: { ...current.enabledPrayers, [prayer]: enabled },
        }),
        'Reminder update failed.',
      );
    },
    [applyNotificationSettings],
  );

  const toggleNotifications = useCallback(
    async (enabled: boolean) => {
      const requestToken = requestTokenRef.current;
      try {
        await commitNotificationSettings(
          current => ({ ...current, notificationsEnabled: enabled }),
          requestToken,
        );
        if (isCurrentRequest(requestToken)) {
          setMessage(
            enabled
              ? upcomingSchedules.length
                ? 'Prayer reminders are scheduled for the next seven days.'
                : 'Prayer reminders will schedule after prayer times load.'
              : 'Prayer reminders are paused.',
          );
        }
      } catch (error) {
        if (isCurrentRequest(requestToken)) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Unable to update reminders.',
          );
          refreshNotificationHealth().catch(() => undefined);
        }
      }
    },
    [
      commitNotificationSettings,
      isCurrentRequest,
      refreshNotificationHealth,
      upcomingSchedules.length,
    ],
  );

  const setFastingRoutine = useCallback(
    async (fastingRoutine: PrayerSettings['fastingRoutine']) => {
      await applyNotificationSettings(
        current => ({
          ...current,
          fastingRoutine,
          fastingAlarmsEnabled:
            fastingRoutine === 'off' ? false : current.fastingAlarmsEnabled,
        }),
        'Unable to update fasting routine.',
      );
    },
    [applyNotificationSettings],
  );

  const setDawudAnchorDate = useCallback(
    async (dawudAnchorDate: string) => {
      const requestToken = requestTokenRef.current;
      try {
        await commitNotificationSettings(
          current => ({
            ...current,
            fastingRoutine: 'dawud',
            dawudAnchorDate,
          }),
          requestToken,
        );
        if (isCurrentRequest(requestToken)) {
          setMessage(
            'Dawud fasting anchor updated. This date is a fasting day.',
          );
        }
      } catch (error) {
        if (isCurrentRequest(requestToken)) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Unable to update Dawud fasting anchor.',
          );
        }
      }
    },
    [commitNotificationSettings, isCurrentRequest],
  );

  const toggleFastingAlarms = useCallback(
    async (enabled: boolean) => {
      const requestToken = requestTokenRef.current;
      if (enabled && settingsRef.current.fastingRoutine === 'off') {
        setMessage('Choose a fasting routine before enabling fasting alarms.');
        return;
      }
      if (
        enabled &&
        settingsRef.current.fastingRoutine === 'dawud' &&
        !settingsRef.current.dawudAnchorDate
      ) {
        setMessage(
          'Set your Dawud fasting anchor date before enabling fasting alarms.',
        );
        return;
      }
      try {
        await commitNotificationSettings(
          current => ({ ...current, fastingAlarmsEnabled: enabled }),
          requestToken,
        );
        if (isCurrentRequest(requestToken)) {
          setMessage(
            enabled
              ? upcomingSchedules.length
                ? 'Suhoor and Imsak alarms are scheduled for the next seven days.'
                : 'Fasting alarms will schedule after prayer times load.'
              : 'Fasting alarms are paused.',
          );
        }
      } catch (error) {
        if (isCurrentRequest(requestToken)) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Unable to update fasting alarms.',
          );
          refreshNotificationHealth().catch(() => undefined);
        }
      }
    },
    [
      commitNotificationSettings,
      isCurrentRequest,
      refreshNotificationHealth,
      upcomingSchedules.length,
    ],
  );

  const selectLocationProfile = useCallback(
    async (profileId: string) => {
      const requestToken = beginRequest();
      const profile = profileStore.profiles.find(item => item.id === profileId);
      if (!profile) return;
      try {
        const nextStore = await setActiveLocationProfile(profile.id, () =>
          isCurrentRequest(requestToken),
        );
        if (!nextStore || !isCurrentRequest(requestToken)) return;
        clearPrayerSchedules();
        invalidateQibla();
        setProfileStore(nextStore);
        setEditingProfileId(profile.id);
        syncProfileInputs(profile);
        setCoordinates(profile.coordinates);
        setIsRefreshing(true);
        await restoreCachedSchedules(profile, settings, requestToken);
        if (!isCurrentRequest(requestToken)) return;
        try {
          await refreshForCoordinates(profile, settings, requestToken);
        } catch {
          if (isCurrentRequest(requestToken)) {
            setMessage(
              'Prayer times are unavailable. Pull to refresh when online.',
            );
          }
        } finally {
          if (isCurrentRequest(requestToken)) setIsRefreshing(false);
        }
      } catch (error) {
        if (isCurrentRequest(requestToken)) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Unable to select the saved place.',
          );
        }
      }
    },
    [
      beginRequest,
      isCurrentRequest,
      refreshForCoordinates,
      restoreCachedSchedules,
      settings,
      syncProfileInputs,
      clearPrayerSchedules,
      invalidateQibla,
      profileStore.profiles,
    ],
  );

  const saveManualLocation = useCallback(async () => {
    const parsedCoordinates = parseManualCoordinates(
      latitudeInput,
      longitudeInput,
    );
    const latitude = parsedCoordinates?.latitude ?? Number.NaN;
    const longitude = parsedCoordinates?.longitude ?? Number.NaN;
    const timezone = timezoneInput.trim();
    const adjustments: PrayerAdjustments = {
      Fajr: parseSignedInteger(adjustmentInputs.Fajr || '0') ?? Number.NaN,
      Dhuhr: parseSignedInteger(adjustmentInputs.Dhuhr || '0') ?? Number.NaN,
      Asr: parseSignedInteger(adjustmentInputs.Asr || '0') ?? Number.NaN,
      Maghrib:
        parseSignedInteger(adjustmentInputs.Maghrib || '0') ?? Number.NaN,
      Isha: parseSignedInteger(adjustmentInputs.Isha || '0') ?? Number.NaN,
    };
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      setMessage(
        'Enter a latitude from −90 to 90 and longitude from −180 to 180.',
      );
      return;
    }
    if (
      Object.values(adjustments).some(
        value => !Number.isInteger(value) || value < -180 || value > 180,
      )
    ) {
      setMessage('Prayer adjustments must be whole minutes from −180 to 180.');
      return;
    }
    if (timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
      } catch {
        setMessage('Use a valid IANA timezone, for example Europe/London.');
        return;
      }
    }

    const id = editingProfileId ?? activeProfile?.id ?? createProfileId();
    const profile: LocationProfile = {
      id,
      name:
        profileNameInput.trim().slice(0, 40) || profileName(profileKindInput),
      kind: profileKindInput,
      coordinates: { latitude, longitude },
      ...(timezone ? { timezone } : {}),
      ...(highLatitudeRuleInput !== 'default'
        ? { highLatitudeRule: highLatitudeRuleInput }
        : {}),
      ...(Object.values(adjustments).some(value => value !== 0)
        ? { adjustments }
        : {}),
    };
    const requestToken = beginRequest();
    setIsRefreshing(true);
    try {
      const nextStore = await upsertLocationProfile(profile, () =>
        isCurrentRequest(requestToken),
      );
      if (!nextStore || !isCurrentRequest(requestToken)) return;
      clearPrayerSchedules();
      invalidateQibla();
      setProfileStore(nextStore);
      setCoordinates(profile.coordinates);
      setEditingProfileId(profile.id);
      syncProfileInputs(profile);
      await refreshForCoordinates(profile, settings, requestToken);
      if (isCurrentRequest(requestToken)) {
        setMessage(`Prayer times updated for ${profile.name}.`);
      }
    } catch (error) {
      if (isCurrentRequest(requestToken)) {
        setMessage(
          error instanceof Error ? error.message : 'Unable to update location.',
        );
      }
    } finally {
      if (isCurrentRequest(requestToken)) setIsRefreshing(false);
    }
  }, [
    activeProfile?.id,
    beginRequest,
    isCurrentRequest,
    adjustmentInputs,
    editingProfileId,
    highLatitudeRuleInput,
    latitudeInput,
    longitudeInput,
    profileKindInput,
    profileNameInput,
    refreshForCoordinates,
    settings,
    syncProfileInputs,
    timezoneInput,
    clearPrayerSchedules,
    invalidateQibla,
  ]);

  const deleteLocalData = useCallback(() => {
    Alert.alert(
      'Delete all local data?',
      'This permanently removes saved places, prayer caches, reminders, worship progress, Quran downloads, mosque notes, and Zakat data from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete data',
          style: 'destructive',
          onPress: () => {
            const requestToken = beginRequest();
            clearNearbyMosqueCache();
            setIsRefreshing(true);
            deleteAllLocalData()
              .then(() => {
                if (!isCurrentRequest(requestToken)) return;
                clearPrayerSchedules();
                invalidateQibla();
                settingsRef.current = DEFAULT_PRAYER_SETTINGS;
                setSettings(DEFAULT_PRAYER_SETTINGS);
                setCoordinates(null);
                setProfileStore({ activeProfileId: null, profiles: [] });
                setEditingProfileId(null);
                setProfileNameInput('Home');
                setProfileKindInput('home');
                setLatitudeInput('');
                setLongitudeInput('');
                setTimezoneInput('');
                setHighLatitudeRuleInput('default');
                setAdjustmentInputs({
                  Fajr: '0',
                  Dhuhr: '0',
                  Asr: '0',
                  Maghrib: '0',
                  Isha: '0',
                });
                setIsSettingsOpen(false);
                setMessage('All local Duavara data was deleted.');
                onLocalDataDeleted();
              })
              .catch(error => {
                if (isCurrentRequest(requestToken)) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : 'Some local data could not be deleted.',
                  );
                }
              })
              .finally(() => {
                if (isCurrentRequest(requestToken)) setIsRefreshing(false);
              });
          },
        },
      ],
    );
  }, [
    beginRequest,
    clearPrayerSchedules,
    invalidateQibla,
    isCurrentRequest,
    onLocalDataDeleted,
  ]);

  const allUpcomingPrayers = useMemo(
    () => upcomingSchedules.flatMap(schedule => schedule.prayers),
    [upcomingSchedules],
  );
  const nextPrayer = useMemo(
    () => getNextPrayer(allUpcomingPrayers, clock),
    [allUpcomingPrayers, clock],
  );
  const currentPrayer = useMemo(
    () => (today ? getCurrentPrayer(today.prayers, clock) : null),
    [clock, today],
  );

  const refreshActive = useCallback(async () => {
    if (activeProfile) {
      const requestToken = beginRequest();
      setIsRefreshing(true);
      try {
        await refreshForCoordinates(activeProfile, settings, requestToken);
        if (!isCurrentRequest(requestToken)) return;
        if (activeTab === 'qibla') {
          await loadQibla(activeProfile.coordinates);
        }
        if (activeTab === 'discover') await loadDiscover();
      } catch (error) {
        if (isCurrentRequest(requestToken)) {
          setMessage(
            error instanceof Error ? error.message : 'Unable to refresh.',
          );
        }
      } finally {
        if (isCurrentRequest(requestToken)) setIsRefreshing(false);
      }
      return;
    }
    await refreshDeviceLocation();
  }, [
    activeProfile,
    activeTab,
    beginRequest,
    isCurrentRequest,
    loadDiscover,
    loadQibla,
    refreshDeviceLocation,
    refreshForCoordinates,
    settings,
  ]);

  const content = renderTab({
    activeTab,
    today,
    nextPrayer,
    currentPrayer,
    clock,
    hijriDate,
    coordinates,
    monthSchedules,
    qibla,
    discover,
    isLoading,
    isRefreshing,
    use24HourTime: settings.use24HourTime,
    settings,
    onUseLocation: refreshDeviceLocation,
    onOpenExternalUrl: openExternalUrl,
    onOpenSettings: openSettings,
    onOpenQuranReader: openQuranReader,
    onRefresh: refreshActive,
  });

  return (
    <View style={styles.app}>
      <View style={[styles.appBar, { paddingTop: insets.top + 14 }]}>
        <Header
          coordinates={coordinates}
          regionName={regionName}
          activeProfileName={activeProfile?.name ?? null}
          onSettings={() => {
            openSettings().catch(() => undefined);
          }}
          onLocation={() => {
            refreshDeviceLocation().catch(() => undefined);
          }}
        />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 124 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              refreshActive().catch(() => undefined);
            }}
            tintColor={COLORS.mint}
            progressViewOffset={8}
          />
        }
      >
        {message ? (
          <PressableScale
            style={styles.messageBanner}
            onPress={() => setMessage(null)}
            accessibilityRole="button"
            accessibilityLabel={`Dismiss message: ${message}`}
          >
            <Text style={styles.messageText}>{message}</Text>
            <Text style={styles.messageDismiss}>×</Text>
          </PressableScale>
        ) : null}
        <ScreenTransition transitionKey={activeTab}>{content}</ScreenTransition>
      </ScrollView>

      <BottomTabs
        activeTab={activeTab}
        insetBottom={insets.bottom}
        onChange={selectTab}
      />

      <SettingsSheet
        isVisible={isSettingsOpen}
        settings={settings}
        methods={methods}
        profiles={profileStore.profiles}
        activeProfileId={activeProfile?.id ?? null}
        profileNameValue={profileNameInput}
        profileKindValue={profileKindInput}
        timezoneValue={timezoneInput}
        highLatitudeRule={highLatitudeRuleInput}
        profileAdjustments={adjustmentInputs}
        health={notificationHealth}
        nativeNotificationsAvailable={nativeNotificationsAvailable}
        latitude={latitudeInput}
        longitude={longitudeInput}
        isBusy={isRefreshing}
        message={message}
        onClose={() => setIsSettingsOpen(false)}
        onMethod={method =>
          updateSettings(current => ({ ...current, method }), true).catch(
            error =>
              setMessage(
                error instanceof Error
                  ? error.message
                  : 'Unable to update calculation method.',
              ),
          )
        }
        onSchool={school => {
          updateSettings(current => ({ ...current, school }), true).catch(
            error =>
              setMessage(
                error instanceof Error
                  ? error.message
                  : 'Unable to update Asr method.',
              ),
          );
        }}
        onNotifications={enabled => {
          toggleNotifications(enabled).catch(() => undefined);
        }}
        onPrayerReminder={(prayer, enabled) => {
          togglePrayerReminder(prayer, enabled).catch(() => undefined);
        }}
        onAdhanEnabled={enabled => {
          applyNotificationSettings(
            current => ({ ...current, adhanEnabled: enabled }),
            'Unable to update Adhan settings.',
          ).catch(() => undefined);
        }}
        onAdhanVolumeCategory={adhanVolumeCategory => {
          applyNotificationSettings(
            current => ({ ...current, adhanVolumeCategory }),
            'Unable to update Adhan volume.',
          ).catch(() => undefined);
        }}
        onPreviewAdhan={() => playAdhanPreview(settings.adhanVolumeCategory)}
        onStopAdhanPreview={stopAdhanPreview}
        onFastingRoutine={routine => {
          setFastingRoutine(routine).catch(() => undefined);
        }}
        onDawudAnchorDate={date => {
          setDawudAnchorDate(date).catch(() => undefined);
        }}
        onFastingAlarms={enabled => {
          toggleFastingAlarms(enabled).catch(() => undefined);
        }}
        onSuhoorReminder={enabled => {
          applyNotificationSettings(
            current => ({ ...current, suhoorReminderEnabled: enabled }),
            'Unable to update Suhoor reminder.',
          ).catch(() => undefined);
        }}
        onImsakAlarm={enabled => {
          applyNotificationSettings(
            current => ({ ...current, imsakAlarmEnabled: enabled }),
            'Unable to update Imsak alarm.',
          ).catch(() => undefined);
        }}
        onUse24HourTime={enabled => {
          applyNotificationSettings(
            current => ({ ...current, use24HourTime: enabled }),
            'Unable to update time format.',
          ).catch(() => undefined);
        }}
        onSelectProfile={profileId => {
          selectLocationProfile(profileId).catch(() => undefined);
        }}
        onNewProfile={() => {
          setEditingProfileId(createProfileId());
          setProfileNameInput('');
          setProfileKindInput('custom');
          setLatitudeInput('');
          setLongitudeInput('');
          setTimezoneInput('');
          setHighLatitudeRuleInput('default');
          setAdjustmentInputs({
            Fajr: '0',
            Dhuhr: '0',
            Asr: '0',
            Maghrib: '0',
            Isha: '0',
          });
        }}
        onProfileName={setProfileNameInput}
        onProfileKind={setProfileKindInput}
        onTimezone={setTimezoneInput}
        onHighLatitudeRule={setHighLatitudeRuleInput}
        onAdjustment={(prayer, value) =>
          setAdjustmentInputs(current => ({ ...current, [prayer]: value }))
        }
        onRefreshNotificationHealth={() => {
          refreshNotificationHealth().catch(() => undefined);
        }}
        onOpenExactAlarmSettings={() => {
          openExactAlarmSettings()
            .then(() => refreshNotificationHealth())
            .catch(() =>
              setMessage(
                'Exact-alarm settings are unavailable on this device.',
              ),
            );
        }}
        onOpenBatterySettings={() => {
          openBatteryOptimizationSettings()
            .then(() => refreshNotificationHealth())
            .catch(() =>
              setMessage('Battery settings are unavailable on this device.'),
            );
        }}
        onOpenSystemSettings={() => {
          Linking.openSettings().catch(() =>
            setMessage('System settings are unavailable on this device.'),
          );
        }}
        onLatitude={setLatitudeInput}
        onLongitude={setLongitudeInput}
        onSaveLocation={() => {
          saveManualLocation().catch(() => undefined);
        }}
        onDeleteAllData={deleteLocalData}
      />
      <QuranReader
        visible={isQuranReaderOpen}
        onClose={() => setIsQuranReaderOpen(false)}
      />
    </View>
  );
}

function renderTab(props: {
  activeTab: Tab;
  today: DailyPrayerData | null;
  nextPrayer: PrayerTime | null;
  currentPrayer: PrayerTime | null;
  clock: Date;
  hijriDate: string | null;
  coordinates: Coordinates | null;
  monthSchedules: DailyPrayerData[];
  qibla: QiblaData | null;
  discover: DiscoverData | null;
  isLoading: boolean;
  isRefreshing: boolean;
  use24HourTime: boolean;
  settings: PrayerSettings;
  onUseLocation: () => void;
  onOpenExternalUrl: (url: string) => Promise<void>;
  onOpenSettings: () => void;
  onOpenQuranReader: () => void;
  onRefresh: () => void;
}) {
  if (props.activeTab === 'about') {
    return <AboutView onOpenExternalUrl={props.onOpenExternalUrl} />;
  }
  if (props.isLoading && !props.today) return <LoadingState />;
  if (!props.coordinates && !props.today) {
    return (
      <LocationEmptyState
        onUseLocation={props.onUseLocation}
        onSettings={props.onOpenSettings}
      />
    );
  }

  if (props.activeTab === 'calendar') {
    if (
      !props.monthSchedules.length &&
      !props.isLoading &&
      !props.isRefreshing
    ) {
      return <UnavailableState title="Prayer calendar unavailable." />;
    }
    return (
      <CalendarView
        schedules={props.monthSchedules}
        isLoading={props.isRefreshing}
        use24HourTime={props.use24HourTime}
      />
    );
  }
  if (props.activeTab === 'qibla') {
    return (
      <QiblaView
        qibla={props.qibla}
        isLoading={props.isRefreshing}
        onRefresh={props.onRefresh}
      />
    );
  }
  if (props.activeTab === 'discover') {
    return (
      <DiscoverView
        discover={props.discover}
        isLoading={props.isRefreshing}
        coordinates={props.coordinates}
        onOpenQuranReader={props.onOpenQuranReader}
      />
    );
  }
  if (!props.today) {
    return props.isLoading || props.isRefreshing ? (
      <LoadingState />
    ) : (
      <UnavailableState title="Prayer times unavailable." />
    );
  }
  return (
    <TodayView
      today={props.today}
      nextPrayer={props.nextPrayer}
      currentPrayer={props.currentPrayer}
      clock={props.clock}
      hijriDate={props.hijriDate}
      use24HourTime={props.use24HourTime}
      fastingRoutine={props.settings.fastingRoutine}
      dawudAnchorDate={props.settings.dawudAnchorDate}
    />
  );
}

function Header({
  coordinates,
  regionName,
  activeProfileName,
  onSettings,
  onLocation,
}: {
  coordinates: Coordinates | null;
  regionName: string | null;
  activeProfileName: string | null;
  onSettings: () => void;
  onLocation: () => void;
}) {
  const locationLabel = formatLocationLabel(
    regionName,
    activeProfileName,
    coordinates,
  );

  return (
    <View style={styles.header}>
      <View style={styles.headerIdentity}>
        <Text style={styles.wordmark} accessibilityRole="header">
          Duavara
        </Text>
        <PressableScale
          style={styles.locationPill}
          onPress={onLocation}
          accessibilityRole="button"
          accessibilityLabel={`${locationLabel}. Tap to update from device location.`}
        >
          <PulseDot size={6} color={COLORS.mint} />
          <Text style={styles.locationText} numberOfLines={1}>
            {locationLabel}
          </Text>
        </PressableScale>
      </View>
      <View style={styles.headerActions}>
        <PressableScale
          style={styles.headerRefreshButton}
          onPress={onLocation}
          accessibilityRole="button"
          accessibilityLabel="Refresh location from device"
          accessibilityHint="Updates your active saved place from device GPS."
          hitSlop={6}
        >
          <LocationPinIcon />
        </PressableScale>
        <PressableScale
          style={styles.settingsButton}
          onPress={onSettings}
          accessibilityRole="button"
          accessibilityLabel="Open prayer preferences"
          hitSlop={6}
        >
          <SlidersGlyph />
        </PressableScale>
      </View>
    </View>
  );
}

function SlidersGlyph() {
  return (
    <View accessible={false} style={styles.slidersGlyph}>
      <View style={[styles.sliderLine, styles.sliderLineWide]} />
      <View style={[styles.sliderLine, styles.sliderLineShort]} />
      <View style={[styles.sliderLine, styles.sliderLineMid]} />
    </View>
  );
}

function LocationPinIcon() {
  return (
    <View accessible={false} style={styles.locationPinIcon}>
      <View style={styles.locationPinHole} />
    </View>
  );
}

function TodayView({
  today,
  nextPrayer,
  currentPrayer,
  clock,
  hijriDate,
  use24HourTime,
  fastingRoutine,
  dawudAnchorDate,
}: {
  today: DailyPrayerData | null;
  nextPrayer: PrayerTime | null;
  currentPrayer: PrayerTime | null;
  clock: Date;
  hijriDate: string | null;
  use24HourTime: boolean;
  fastingRoutine: PrayerSettings['fastingRoutine'];
  dawudAnchorDate: string | null;
}) {
  if (!today) return <LoadingState />;
  const isFastingToday = isFastingDate(
    today.date,
    fastingRoutine,
    dawudAnchorDate,
  );
  const countdown = nextPrayer
    ? formatCountdown(nextPrayer.date.getTime() - clock.getTime())
    : '—';

  const nowMs = clock.getTime();
  const previousPrayer = [...today.prayers]
    .reverse()
    .find(prayer => prayer.date.getTime() <= nowMs);
  const intervalMs =
    nextPrayer && previousPrayer
      ? nextPrayer.date.getTime() - previousPrayer.date.getTime()
      : 0;
  const elapsedMs =
    nextPrayer && previousPrayer
      ? Math.max(0, nowMs - previousPrayer.date.getTime())
      : 0;
  const prayerProgress =
    intervalMs > 0 ? Math.min(1, elapsedMs / intervalMs) : 0;

  return (
    <>
      <View style={styles.dateBlock}>
        <Text style={styles.dateEyebrow}>
          {hijriDate ?? 'Prayer times for today'}
        </Text>
        <Text style={styles.dateTitle}>{formatLongDate(clock)}</Text>
      </View>

      <Reveal delay={40}>
        <View style={styles.nextCard}>
          <View style={styles.heroGlow} />
          <View style={styles.heroOrbitOuter} />
          <View style={styles.heroOrbitInner} />

          <View style={styles.heroTopRow}>
            <View style={styles.heroKickerRow}>
              {nextPrayer ? (
                <PulseDot size={6} color={COLORS.mintBright} />
              ) : null}
              <Text style={styles.nextEyebrow}>
                {nextPrayer ? 'NEXT PRAYER' : 'DAY COMPLETE'}
              </Text>
            </View>
            <View style={styles.countdownPill}>
              <Text style={styles.countdownLabel}>IN</Text>
              <ValuePop trigger={countdown}>
                <Text style={styles.countdownValue}>{countdown}</Text>
              </ValuePop>
            </View>
          </View>

          <View style={styles.heroNameRow}>
            <View style={styles.heroNameBlock}>
              <Text
                style={styles.nextName}
                numberOfLines={1}
                ellipsizeMode="clip"
              >
                {nextPrayer?.name ?? 'Rest well'}
              </Text>
              <Text style={styles.nextArabic}>
                {nextPrayer
                  ? ARABIC_PRAYER_NAMES[nextPrayer.name]
                  : 'ليلة طيبة'}
              </Text>
            </View>
            <Text style={styles.nextTime} numberOfLines={1}>
              {nextPrayer
                ? formatPrayerTime(nextPrayer.time, use24HourTime)
                : '—'}
            </Text>
          </View>

          <ProgressRail
            value={prayerProgress}
            color={COLORS.mintBright}
            trackColor="rgba(203, 243, 224, 0.16)"
            height={5}
          />

          <Text style={styles.nextHint}>
            {currentPrayer
              ? `${currentPrayer.name} is in progress`
              : 'A quiet moment before Fajr'}
          </Text>
        </View>
      </Reveal>

      <RamadanDashboard
        schedule={today}
        hijriDate={hijriDate}
        now={clock}
        use24HourTime={use24HourTime}
      />

      {fastingRoutine !== 'off' ? (
        <Reveal delay={90}>
          <View
            style={[
              styles.fastingStatusCard,
              isFastingToday && styles.fastingStatusCardActive,
            ]}
            accessible
            accessibilityLabel={
              isFastingToday
                ? `Fasting today. Imsak is ${formatPrayerTime(
                    today.imsak.time,
                    use24HourTime,
                  )}.`
                : 'Not a fasting day in your selected routine.'
            }
          >
            <View
              style={[
                styles.fastingBadge,
                isFastingToday && styles.fastingBadgeActive,
              ]}
            >
              <Text
                style={[
                  styles.fastingBadgeGlyph,
                  isFastingToday && styles.fastingBadgeGlyphActive,
                ]}
              >
                ☾
              </Text>
            </View>
            <View style={styles.fastingBody}>
              <Text style={styles.fastingStatusKicker}>FASTING COMPANION</Text>
              <Text style={styles.fastingStatusTitle}>
                {isFastingToday ? 'Fasting today' : 'Rest day'}
              </Text>
              <Text style={styles.fastingStatusText}>
                {isFastingToday
                  ? `Imsak ${formatPrayerTime(
                      today.imsak.time,
                      use24HourTime,
                    )} · Iftar at Maghrib ${formatPrayerTime(
                      today.timings.Maghrib,
                      use24HourTime,
                    )}`
                  : fastingRoutine === 'dawud'
                  ? 'Your Dawud cycle resumes on the next alternating day.'
                  : 'Your next voluntary fast is Monday or Thursday.'}
              </Text>
            </View>
          </View>
        </Reveal>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Today’s rhythm</Text>
        <Text style={styles.sectionMeta}>{today.timezone ?? 'Local time'}</Text>
      </View>
      <View style={styles.prayerList}>
        {today.prayers.map((prayer, index) => {
          const isNext =
            prayer.name === nextPrayer?.name &&
            prayer.date.getDate() === nextPrayer?.date.getDate();
          const isCurrent = prayer.name === currentPrayer?.name;
          const isPast =
            prayer.date.getTime() <= nowMs && !isNext && !isCurrent;
          return (
            <Reveal
              key={prayer.name}
              delay={Math.min(index * 45, 220)}
              distance={10}
            >
              <View
                style={[styles.prayerRow, isNext && styles.prayerRowNext]}
                accessible
                accessibilityLabel={`${prayer.name}, ${formatPrayerTime(
                  prayer.time,
                  use24HourTime,
                )}${isNext ? ', next prayer' : ''}`}
              >
                <View
                  style={[
                    styles.prayerIcon,
                    isNext && styles.prayerIconNext,
                    isPast && styles.prayerIconPast,
                  ]}
                >
                  <Text
                    style={[
                      styles.prayerIconText,
                      isNext && styles.prayerIconTextNext,
                      isPast && styles.prayerIconTextPast,
                    ]}
                  >
                    {PRAYER_ICONS[prayer.name]}
                  </Text>
                </View>
                <View style={styles.prayerNameBlock}>
                  <View style={styles.prayerNameRow}>
                    <Text
                      style={[
                        styles.prayerName,
                        isNext && styles.prayerNameNext,
                        isPast && styles.prayerNamePast,
                      ]}
                    >
                      {prayer.name}
                    </Text>
                    {isCurrent ? (
                      <Text style={styles.nowBadge}>NOW</Text>
                    ) : null}
                    {isNext ? <Text style={styles.nextBadge}>NEXT</Text> : null}
                  </View>
                  <Text style={styles.prayerArabic}>
                    {ARABIC_PRAYER_NAMES[prayer.name]}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.prayerTime,
                    isNext && styles.prayerTimeNext,
                    isPast && styles.prayerTimePast,
                  ]}
                >
                  {formatPrayerTime(prayer.time, use24HourTime)}
                </Text>
              </View>
            </Reveal>
          );
        })}
      </View>

      <PressableScale
        style={styles.shareTimesButton}
        onPress={() => {
          Share.share({
            message: formatPrayerScheduleForSharing(today, use24HourTime),
          }).catch(() => undefined);
        }}
        accessibilityRole="button"
        accessibilityLabel="Share today’s prayer times"
      >
        <Text style={styles.shareTimesText}>SHARE TODAY’S TIMES</Text>
        <Text style={styles.shareTimesIcon}>↗</Text>
      </PressableScale>

      <WorshipCompanion schedule={today} use24HourTime={use24HourTime} />

      <View style={styles.footnote}>
        <Text style={styles.footnoteIcon}>✦</Text>
        <Text style={styles.footnoteText}>
          Times use your selected calculation method. Local masjid timetables
          may differ.
        </Text>
      </View>
    </>
  );
}

function CalendarView({
  schedules,
  isLoading,
  use24HourTime,
}: {
  schedules: DailyPrayerData[];
  isLoading: boolean;
  use24HourTime: boolean;
}) {
  const [selectedSchedule, setSelectedSchedule] =
    useState<DailyPrayerData | null>(null);
  const nowKey = formatLocalDateKey(new Date());
  const monthLabel = schedules.length
    ? localDateFromSchedule(schedules[0].date).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })
    : 'Prayer calendar';
  const calendarColumns: PrayerName[] = [
    'Fajr',
    'Dhuhr',
    'Asr',
    'Maghrib',
    'Isha',
  ];

  return (
    <>
      <View style={styles.viewHeading}>
        <Text style={styles.viewKicker}>PLAN AHEAD</Text>
        <Text style={styles.viewTitle}>Prayer calendar</Text>
        <Text style={styles.viewDescription}>
          Tap a date for every prayer, Imsak, and a shareable daily timetable.
        </Text>
      </View>
      {isLoading && !schedules.length ? <LoadingState compact /> : null}

      <View style={styles.calendarCard}>
        <View style={styles.calendarCardHeader}>
          <Text style={styles.calendarCardTitle}>{monthLabel}</Text>
          <Text style={styles.calendarCardMeta}>{schedules.length} days</Text>
        </View>

        <View style={styles.calendarHeader}>
          <Text style={[styles.calendarHeaderCell, styles.calendarDateCell]}>
            DAY
          </Text>
          {calendarColumns.map(prayer => (
            <Text key={prayer} style={styles.calendarHeaderCell}>
              {CALENDAR_COLUMN_LABELS[prayer]}
            </Text>
          ))}
        </View>

        <View style={styles.calendarList}>
          {schedules.map((schedule, index) => {
            const scheduleDate = localDateFromSchedule(schedule.date);
            const isToday = schedule.date === nowKey;
            return (
              <Reveal
                key={schedule.date}
                delay={Math.min(index * 18, 220)}
                distance={8}
              >
                <Pressable
                  style={({ pressed }) => [
                    styles.calendarRow,
                    index === schedules.length - 1 && styles.calendarRowLast,
                    isToday && styles.calendarRowToday,
                    pressed && styles.calendarRowPressed,
                  ]}
                  onPress={() => setSelectedSchedule(schedule)}
                  accessibilityRole="button"
                  accessibilityLabel={`View all prayer times for ${schedule.date}`}
                >
                  <View
                    style={[styles.calendarDateCell, styles.calendarDateColumn]}
                  >
                    <Text
                      style={[
                        styles.calendarDay,
                        isToday && styles.calendarTodayText,
                      ]}
                    >
                      {scheduleDate.getDate()}
                    </Text>
                    <Text
                      style={[
                        styles.calendarWeekday,
                        isToday && styles.calendarTodayText,
                      ]}
                    >
                      {scheduleDate
                        .toLocaleDateString('en-US', { weekday: 'short' })
                        .toUpperCase()}
                    </Text>
                  </View>
                  {calendarColumns.map(prayer => {
                    const [clockPart, meridiem] = formatPrayerTime(
                      schedule.timings[prayer],
                      use24HourTime,
                    ).split(' ');
                    return (
                      <View key={prayer} style={styles.calendarCell}>
                        <Text
                          style={[
                            styles.calendarCellTime,
                            isToday && styles.calendarTodayText,
                          ]}
                          numberOfLines={1}
                        >
                          {clockPart}
                        </Text>
                        {meridiem ? (
                          <Text
                            style={[
                              styles.calendarCellMeridiem,
                              isToday && styles.calendarTodayText,
                            ]}
                          >
                            {meridiem}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </Pressable>
              </Reveal>
            );
          })}
        </View>
      </View>

      <CalendarDayDetails
        schedule={selectedSchedule}
        use24HourTime={use24HourTime}
        onClose={() => setSelectedSchedule(null)}
      />
    </>
  );
}

function CalendarDayDetails({
  schedule,
  use24HourTime,
  onClose,
}: {
  schedule: DailyPrayerData | null;
  use24HourTime: boolean;
  onClose: () => void;
}) {
  const [lastSchedule, setLastSchedule] = useState<DailyPrayerData | null>(
    schedule,
  );

  useEffect(() => {
    if (schedule) setLastSchedule(schedule);
  }, [schedule]);

  const activeSchedule = schedule ?? lastSchedule;
  if (!activeSchedule) return null;
  const date = localDateFromSchedule(activeSchedule.date);

  return (
    <MotionSheet
      visible={!!schedule}
      onRequestClose={onClose}
      style={styles.calendarDetailSheet}
    >
      <View style={styles.sheetHandle} />
      <View style={styles.calendarDetailHeader}>
        <View style={styles.calendarDetailHeading}>
          <Text style={styles.sheetKicker}>DAILY TIMETABLE</Text>
          <Text style={styles.calendarDetailTitle} numberOfLines={1}>
            {date.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>
        <PressableScale
          style={styles.closeButton}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close calendar prayer details"
        >
          <Text style={styles.closeText}>×</Text>
        </PressableScale>
      </View>
      <View style={styles.imsakDetailRow}>
        <Text style={styles.imsakDetailLabel}>IMSAK</Text>
        <Text style={styles.imsakDetailTime}>
          {formatPrayerTime(activeSchedule.imsak.time, use24HourTime)}
        </Text>
      </View>
      <View style={styles.calendarDetailPrayerList}>
        {activeSchedule.prayers.map(prayer => (
          <View style={styles.calendarDetailPrayerRow} key={prayer.name}>
            <View style={styles.calendarDetailPrayerNames}>
              <Text style={styles.calendarDetailPrayerName}>{prayer.name}</Text>
              <Text style={styles.calendarDetailPrayerArabic}>
                {ARABIC_PRAYER_NAMES[prayer.name]}
              </Text>
            </View>
            <Text style={styles.calendarDetailPrayerTime}>
              {formatPrayerTime(prayer.time, use24HourTime)}
            </Text>
          </View>
        ))}
      </View>
      <PressableScale
        style={styles.calendarShareButton}
        onPress={() => {
          Share.share({
            message: formatPrayerScheduleForSharing(
              activeSchedule,
              use24HourTime,
            ),
          }).catch(() => undefined);
        }}
        accessibilityRole="button"
      >
        <Text style={styles.calendarShareButtonText}>SHARE THIS DAY</Text>
      </PressableScale>
    </MotionSheet>
  );
}

function localDateFromSchedule(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function QiblaView({
  qibla,
  isLoading,
  onRefresh,
}: {
  qibla: QiblaData | null;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const [isCameraFinderOpen, setIsCameraFinderOpen] = useState(false);
  const [heading, setHeading] = useState<CompassHeading | null>(null);
  const [compassError, setCompassError] = useState<string | null>(null);

  useEffect(() => {
    if (!qibla) return;
    let stopCompass: (() => void) | undefined;
    let isCancelled = false;
    setHeading(null);
    setCompassError(null);

    startQiblaCompass(qibla, nextHeading => {
      if (!isCancelled) setHeading(nextHeading);
    })
      .then(stop => {
        if (isCancelled) stop();
        else stopCompass = stop;
      })
      .catch(error => {
        if (!isCancelled) {
          setCompassError(
            error instanceof Error
              ? error.message
              : 'Live compass is unavailable.',
          );
        }
      });

    return () => {
      isCancelled = true;
      stopCompass?.();
    };
  }, [qibla]);

  const relativeAngle =
    qibla && heading !== null
      ? getRelativeQiblaAngle(qibla.direction, heading.heading)
      : null;
  const isAligned = relativeAngle !== null && Math.abs(relativeAngle) <= 4;
  const turnDirection =
    relativeAngle !== null && relativeAngle < 0 ? 'LEFT' : 'RIGHT';
  const displayedAngle =
    relativeAngle === null
      ? Math.round(qibla?.direction ?? 0)
      : Math.round(Math.abs(relativeAngle));
  const qiblaAngle = relativeAngle ?? qibla?.direction ?? 0;

  const needleAngle = useSharedValue(qiblaAngle);

  useEffect(() => {
    const current = needleAngle.value;
    const delta = ((qiblaAngle - current + 540) % 360) - 180;
    needleAngle.value = withSpring(current + delta, {
      damping: 18,
      stiffness: 90,
      mass: 1.1,
    });
  }, [needleAngle, qiblaAngle]);

  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${needleAngle.value}deg` }],
  }));

  return (
    <>
      <View style={styles.viewHeading}>
        <Text style={styles.viewKicker}>DIRECTION</Text>
        <Text style={styles.viewTitle}>Find the Qibla</Text>
        <Text style={styles.viewDescription}>
          Use this bearing with your phone’s compass, away from metal or
          magnets.
        </Text>
      </View>
      {qibla ? (
        <View style={[styles.qiblaCard, isAligned && styles.qiblaCardAligned]}>
          {relativeAngle !== null ? (
            <View style={styles.compassPhoneForwardRow}>
              <PulseDot size={5} color={COLORS.mint} />
              <Text style={styles.compassPhoneForward}>PHONE FORWARD</Text>
            </View>
          ) : null}
          <View
            style={[styles.compass, isAligned && styles.compassAligned]}
            accessible={false}
          >
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(index => (
              <View
                key={index}
                style={[
                  styles.compassTickLayer,
                  { transform: [{ rotate: `${index * 30}deg` }] },
                ]}
              >
                <View
                  style={[
                    styles.compassTick,
                    index % 3 === 0 && styles.compassTickMajor,
                  ]}
                />
              </View>
            ))}
            <Text style={styles.compassCardinalNorth}>N</Text>
            <Text style={styles.compassCardinalEast}>E</Text>
            <Text style={styles.compassCardinalSouth}>S</Text>
            <Text style={styles.compassCardinalWest}>W</Text>

            <Animated.View style={[styles.qiblaNeedle, needleStyle]}>
              <View
                style={[
                  styles.qiblaNeedleTip,
                  isAligned && styles.qiblaNeedleTipAligned,
                ]}
              />
              <View style={styles.qiblaNeedleTail} />
            </Animated.View>
            <Image source={appIconAsset} style={styles.qiblaTargetImage} />
            <View style={styles.compassCenter} />
          </View>

          <View style={styles.qiblaReadoutRow}>
            <Text style={styles.qiblaNumber}>{displayedAngle}°</Text>
            <Text style={styles.qiblaLabel}>
              {relativeAngle === null
                ? 'QIBLA DIRECTION · TRUE-NORTH REFERENCE'
                : isAligned
                ? 'QIBLA ALIGNED'
                : `TURN ${turnDirection}`}
            </Text>
          </View>

          <Text style={styles.qiblaInstruction}>
            {relativeAngle === null
              ? `Face ${Math.round(
                  qibla.direction,
                )}° on a true-north compass to face the Qibla (the Kaaba).`
              : isAligned
              ? 'The top of your phone is pointing toward the Qibla.'
              : `Turn your phone ${turnDirection.toLowerCase()} until the arrow points straight ahead.`}
          </Text>

          <View style={styles.qiblaStatusRow}>
            <PulseDot
              size={5}
              color={isAligned ? COLORS.mintBright : COLORS.muted}
            />
            <Text style={styles.qiblaLiveStatus}>
              {relativeAngle === null
                ? compassError
                  ? 'Compass unavailable — use the Qibla bearing above.'
                  : 'Calibrating Qibla compass…'
                : `LIVE QIBLA COMPASS · TRUE-NORTH HEADING ${Math.round(
                    heading?.heading ?? 0,
                  )}°`}
            </Text>
          </View>

          <View style={styles.qiblaActions}>
            <PressableScale
              style={styles.qiblaCameraButton}
              onPress={() => setIsCameraFinderOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Open optional camera Qibla finder"
            >
              <Text style={styles.qiblaCameraButtonText}>USE CAMERA VIEW</Text>
            </PressableScale>
            <PressableScale
              style={styles.qiblaRefresh}
              onPress={onRefresh}
              accessibilityRole="button"
            >
              <Text style={styles.qiblaRefreshText}>REFRESH DIRECTION</Text>
            </PressableScale>
          </View>
          <Text style={styles.qiblaCameraHint}>
            Optional — camera access is only requested after you tap camera
            view.
          </Text>
          <QiblaCameraFinder
            visible={isCameraFinderOpen}
            qibla={qibla}
            heading={heading}
            onClose={() => setIsCameraFinderOpen(false)}
          />
        </View>
      ) : (
        <View style={styles.resourceCard}>
          {isLoading ? <ActivityIndicator color={COLORS.mint} /> : null}
          <Text style={styles.resourceTitle}>
            {isLoading
              ? 'Calculating your Qibla bearing'
              : 'Qibla direction unavailable'}
          </Text>
          <Text style={styles.resourceText}>
            {isLoading
              ? 'Please wait while your direction is calculated.'
              : 'Pull down to refresh when an internet connection is available.'}
          </Text>
        </View>
      )}
    </>
  );
}

function DiscoverView({
  discover,
  isLoading,
  coordinates,
  onOpenQuranReader,
}: {
  discover: DiscoverData | null;
  isLoading: boolean;
  coordinates: Coordinates | null;
  onOpenQuranReader: () => void;
}) {
  const [isZakatCalculatorOpen, setIsZakatCalculatorOpen] = useState(false);
  const names = asRecords(discover?.names);
  const specialDays = asRecords(discover?.specialDays);
  const monthValues =
    discover?.months && typeof discover.months === 'object'
      ? Object.values(discover.months as Record<string, unknown>)
      : [];
  const nameOfTheDay = names.length
    ? names[new Date().getDate() % names.length]
    : null;
  const nextHoliday =
    discover?.nextHoliday && typeof discover.nextHoliday === 'object'
      ? (discover.nextHoliday as Record<string, unknown>)
      : null;
  const holidayHijri = nextHoliday?.hijri as
    | Record<string, unknown>
    | undefined;
  const holidayMonth = holidayHijri?.month as
    | Record<string, unknown>
    | undefined;

  return (
    <>
      <View style={styles.viewHeading}>
        <Text style={styles.viewKicker}>ISLAMIC COMPANION</Text>
        <Text style={styles.viewTitle}>Discover</Text>
        <Text style={styles.viewDescription}>
          Meaningful dates, the Divine Names, and the Hijri months—all from
          Islamic Network’s free data.
        </Text>
      </View>
      {isLoading && !discover ? <LoadingState compact /> : null}
      {nextHoliday ? (
        <Reveal delay={30}>
          <View style={styles.occasionCard}>
            <View style={styles.occasionBody}>
              <Text style={styles.occasionLabel}>NEXT HIJRI OCCASION</Text>
              <Text style={styles.occasionTitle} numberOfLines={2}>
                {stringValue(holidayHijri?.day) ?? 'Upcoming date'}{' '}
                {stringValue(holidayMonth?.en) ?? ''}
              </Text>
              <Text style={styles.occasionDate}>
                {stringValue(holidayHijri?.year) ?? 'Hijri calendar'}
              </Text>
            </View>
            <Text style={styles.occasionMark}>☾</Text>
          </View>
        </Reveal>
      ) : null}
      {nameOfTheDay ? (
        <Reveal delay={70}>
          <View style={styles.nameCard}>
            <Text style={styles.nameLabel}>A NAME TO REFLECT ON</Text>
            <Text style={styles.nameArabic} numberOfLines={1}>
              {stringValue(nameOfTheDay.name) ?? 'ٱللَّٰه'}
            </Text>
            <Text style={styles.nameTransliteration}>
              {stringValue(nameOfTheDay.transliteration) ?? 'Allah'}
            </Text>
            <Text style={styles.nameMeaning} numberOfLines={2}>
              {stringValue(
                (nameOfTheDay.en as Record<string, unknown> | undefined)
                  ?.meaning,
              ) ?? 'The Most Beautiful Names'}
            </Text>
          </View>
        </Reveal>
      ) : null}
      <Reveal delay={110}>
        <View style={styles.discoverGrid}>
          <View style={styles.discoverSmallCard}>
            <Text style={styles.smallCardNumber}>
              {monthValues.length || '12'}
            </Text>
            <Text style={styles.smallCardLabel}>HIJRI MONTHS</Text>
          </View>
          <View style={styles.discoverSmallCard}>
            <Text style={styles.smallCardNumber}>
              {specialDays.length || '—'}
            </Text>
            <Text style={styles.smallCardLabel}>SPECIAL DAYS</Text>
          </View>
        </View>
      </Reveal>

      <Reveal delay={140}>
        <View style={styles.companionActionsCard}>
          <Text style={styles.resourceEyebrow}>PRACTICAL COMPANION</Text>
          <Text style={styles.companionActionsTitle}>
            Read, then find your way.
          </Text>
          <Text style={styles.companionActionsText}>
            Quran text, translations, recitation and nearby mosque data are
            loaded only when you choose to use them.
          </Text>
          <View style={styles.companionActionRow}>
            <PressableScale
              style={styles.companionPrimaryAction}
              onPress={onOpenQuranReader}
              accessibilityRole="button"
              accessibilityLabel="Open Quran reader"
            >
              <Text style={styles.companionPrimaryActionText}>OPEN QURAN</Text>
              <Text style={styles.companionActionGlyph}>۞</Text>
            </PressableScale>
            <PressableScale
              style={styles.companionSecondaryAction}
              onPress={() => setIsZakatCalculatorOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Open local Zakat calculator"
            >
              <Text style={styles.companionSecondaryActionText}>ZAKAT</Text>
              <Text style={styles.companionActionGlyph}>٪</Text>
            </PressableScale>
          </View>
          <Text style={styles.companionSourceText}>
            Arabic Quran text: AlQuran.cloud / Islamic Network (Uthmani
            edition).
          </Text>
        </View>
      </Reveal>

      <NearbyMosques coordinates={coordinates} />

      <View style={styles.resourceCard}>
        <Text style={styles.resourceEyebrow}>WHAT’S INCLUDED</Text>
        <Text style={styles.resourceTitle}>
          Prayer times, calculation methods, Hijri dates, Qibla, special days
          and all 99 Names.
        </Text>
        <Text style={styles.resourceText}>
          Your prayer calculations and reminders stay tied to the preferences
          you choose.
        </Text>
      </View>
      <ZakatCalculator
        visible={isZakatCalculatorOpen}
        onClose={() => setIsZakatCalculatorOpen(false)}
      />
    </>
  );
}

function LoadingState({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <View style={styles.loadingCompact} accessibilityRole="progressbar">
        <Skeleton height={10} width="45%" radius={5} />
        <Skeleton height={10} width="70%" radius={5} />
      </View>
    );
  }

  return (
    <View style={styles.loadingState} accessibilityRole="progressbar">
      <View style={styles.loadingHero}>
        <Skeleton height={10} width={96} radius={5} />
        <Skeleton
          height={40}
          width="58%"
          radius={10}
          style={styles.loadingGap}
        />
        <Skeleton
          height={12}
          width="38%"
          radius={6}
          style={styles.loadingGapSm}
        />
        <Skeleton height={5} radius={3} style={styles.loadingGapLg} />
      </View>
      <View style={styles.loadingListCard}>
        {[0, 1, 2, 3].map(row => (
          <View key={row} style={styles.loadingRow}>
            <Skeleton height={36} width={36} radius={18} />
            <View style={styles.loadingRowText}>
              <Skeleton height={11} width="52%" radius={5} />
              <Skeleton
                height={9}
                width="34%"
                radius={4}
                style={styles.loadingGapSm}
              />
            </View>
            <Skeleton height={11} width={56} radius={5} />
          </View>
        ))}
      </View>
      <Text style={styles.loadingText}>Preparing your prayer times</Text>
    </View>
  );
}

function UnavailableState({ title }: { title: string }) {
  return (
    <View style={styles.resourceCard}>
      <Text style={styles.resourceEyebrow}>UNAVAILABLE</Text>
      <Text style={styles.resourceTitle}>{title}</Text>
      <Text style={styles.resourceText}>
        Pull down to refresh when an internet connection is available.
      </Text>
    </View>
  );
}

function LocationEmptyState({
  onUseLocation,
  onSettings,
}: {
  onUseLocation: () => void;
  onSettings: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptySky} accessible={false}>
        {[0, 1, 2, 3, 4].map(index => (
          <View
            key={index}
            style={[
              styles.emptyStar,
              {
                top: [12, 58, 30, 96, 74][index],
                left: [36, 196, 268, 118, 236][index],
                opacity: [0.9, 0.5, 0.7, 0.35, 0.6][index],
              },
            ]}
          />
        ))}
        <View style={styles.emptyOrbit} />
        <View style={styles.emptyMoon}>
          <View style={styles.emptyMoonCutout} />
        </View>
      </View>
      <Text style={styles.emptyKicker}>WELCOME TO DUAVARA</Text>
      <Text style={styles.emptyTitle}>Prayer time, made personal.</Text>
      <Text style={styles.emptyText}>
        Allow your location to calculate accurate local times. Prefer privacy?
        Enter coordinates manually instead.
      </Text>
      <PressableScale
        style={[styles.primaryButton, styles.primaryButtonWide]}
        onPress={onUseLocation}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>USE MY LOCATION</Text>
      </PressableScale>
      <PressableScale
        style={styles.secondaryButton}
        onPress={onSettings}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryButtonText}>ENTER COORDINATES</Text>
      </PressableScale>
    </View>
  );
}

function BottomTabs({
  activeTab,
  insetBottom,
  onChange,
}: {
  activeTab: Tab;
  insetBottom: number;
  onChange: (tab: Tab) => void;
}) {
  const [barWidth, setBarWidth] = useState(0);
  const activeIndex = TAB_ITEMS.findIndex(tab => tab.id === activeTab);
  const slotWidth = barWidth > 0 ? (barWidth - 12) / TAB_ITEMS.length : 0;
  const indicatorX = useSharedValue(0);

  useEffect(() => {
    indicatorX.value = withSpring(Math.max(activeIndex, 0) * slotWidth, {
      damping: 22,
      stiffness: 210,
      mass: 0.8,
    });
  }, [activeIndex, indicatorX, slotWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: slotWidth,
    transform: [{ translateX: indicatorX.value }],
  }));

  return (
    <View
      style={[styles.tabBar, { paddingBottom: Math.max(insetBottom, 10) - 6 }]}
      onLayout={event => setBarWidth(event.nativeEvent.layout.width)}
    >
      <View style={styles.tabBarInner}>
        {slotWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.tabIndicator, indicatorStyle]}
          />
        ) : null}
        {TAB_ITEMS.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <Pressable
              key={tab.id}
              style={styles.tabItem}
              onPress={() => onChange(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
            >
              <TabIcon id={tab.id} active={isActive} />
              <Text
                style={[styles.tabLabel, isActive && styles.tabLabelActive]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TabIcon({ id, active }: { id: Tab; active: boolean }) {
  const color = active ? COLORS.inkDeep : COLORS.muted;

  if (id === 'today') {
    return (
      <View style={styles.tabGlyph} accessible={false}>
        <View style={[styles.glyphSun, { borderColor: color }]} />
        <View style={[styles.glyphHorizon, { backgroundColor: color }]} />
      </View>
    );
  }
  if (id === 'calendar') {
    return (
      <View style={styles.tabGlyph} accessible={false}>
        <View style={[styles.glyphFrame, { borderColor: color }]}>
          <View style={[styles.glyphFrameDot, { backgroundColor: color }]} />
        </View>
        <View style={[styles.glyphFrameTick, { backgroundColor: color }]} />
      </View>
    );
  }
  if (id === 'qibla') {
    return (
      <View style={styles.tabGlyph} accessible={false}>
        <View style={[styles.glyphCompass, { borderColor: color }]}>
          <View
            style={[styles.glyphCompassNeedle, { backgroundColor: color }]}
          />
        </View>
        <View style={[styles.glyphCompassTop, { backgroundColor: color }]} />
      </View>
    );
  }
  if (id === 'discover') {
    return (
      <View style={styles.tabGlyph} accessible={false}>
        <View style={[styles.glyphDiamond, { backgroundColor: color }]} />
        <View style={[styles.glyphDiamondDot, { backgroundColor: color }]} />
      </View>
    );
  }
  return (
    <View style={styles.tabGlyph} accessible={false}>
      <View style={[styles.glyphInfoRing, { borderColor: color }]}>
        <View style={[styles.glyphInfoDot, { backgroundColor: color }]} />
        <View style={[styles.glyphInfoStem, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

function SettingsSheet({
  isVisible,
  settings,
  methods,
  profiles,
  activeProfileId,
  profileNameValue,
  profileKindValue,
  timezoneValue,
  highLatitudeRule,
  profileAdjustments,
  health,
  nativeNotificationsAvailable,
  latitude,
  longitude,
  isBusy,
  message,
  onClose,
  onMethod,
  onSchool,
  onNotifications,
  onPrayerReminder,
  onAdhanEnabled,
  onAdhanVolumeCategory,
  onPreviewAdhan,
  onStopAdhanPreview,
  onFastingRoutine,
  onDawudAnchorDate,
  onFastingAlarms,
  onSuhoorReminder,
  onImsakAlarm,
  onUse24HourTime,
  onSelectProfile,
  onNewProfile,
  onProfileName,
  onProfileKind,
  onTimezone,
  onHighLatitudeRule,
  onAdjustment,
  onRefreshNotificationHealth,
  onOpenExactAlarmSettings,
  onOpenBatterySettings,
  onOpenSystemSettings,
  onLatitude,
  onLongitude,
  onSaveLocation,
  onDeleteAllData,
}: {
  isVisible: boolean;
  settings: PrayerSettings;
  methods: AlAdhanMethod[];
  profiles: LocationProfile[];
  activeProfileId: string | null;
  profileNameValue: string;
  profileKindValue: LocationProfileKind;
  timezoneValue: string;
  highLatitudeRule: HighLatitudeRule | 'default';
  profileAdjustments: Record<PrayerName, string>;
  health: NotificationHealth;
  nativeNotificationsAvailable: boolean;
  latitude: string;
  longitude: string;
  isBusy: boolean;
  message: string | null;
  onClose: () => void;
  onMethod: (method: PrayerSettings['method']) => Promise<void>;
  onSchool: (school: PrayerSettings['school']) => void;
  onNotifications: (enabled: boolean) => void;
  onPrayerReminder: (prayer: PrayerName, enabled: boolean) => void;
  onAdhanEnabled: (enabled: boolean) => void;
  onAdhanVolumeCategory: (
    category: PrayerSettings['adhanVolumeCategory'],
  ) => void;
  onPreviewAdhan: () => Promise<boolean>;
  onStopAdhanPreview: () => Promise<void>;
  onFastingRoutine: (routine: PrayerSettings['fastingRoutine']) => void;
  onDawudAnchorDate: (date: string) => void;
  onFastingAlarms: (enabled: boolean) => void;
  onSuhoorReminder: (enabled: boolean) => void;
  onImsakAlarm: (enabled: boolean) => void;
  onUse24HourTime: (enabled: boolean) => void;
  onSelectProfile: (profileId: string) => void;
  onNewProfile: () => void;
  onProfileName: (value: string) => void;
  onProfileKind: (kind: LocationProfileKind) => void;
  onTimezone: (value: string) => void;
  onHighLatitudeRule: (rule: HighLatitudeRule | 'default') => void;
  onAdjustment: (prayer: PrayerName, value: string) => void;
  onRefreshNotificationHealth: () => void;
  onOpenExactAlarmSettings: () => void;
  onOpenBatterySettings: () => void;
  onOpenSystemSettings: () => void;
  onLatitude: (value: string) => void;
  onLongitude: (value: string) => void;
  onSaveLocation: () => void;
  onDeleteAllData: () => void;
}) {
  const automaticMethod = {
    id: null,
    name: 'Automatic (closest authority)',
  };
  const methodOptions: {
    id: PrayerSettings['method'];
    name: string;
  }[] = [
    automaticMethod,
    ...(methods.length
      ? methods.map(method => ({ id: method.id, name: method.name }))
      : settings.method === null
      ? []
      : [{ id: settings.method, name: `Method ${settings.method}` }]),
  ];
  const selectedMethod = methodOptions.find(
    method => method.id === settings.method,
  );
  const [isMethodPickerOpen, setIsMethodPickerOpen] = useState(false);
  const [isAdhanPreviewPlaying, setIsAdhanPreviewPlaying] = useState(false);
  const [adhanPreviewError, setAdhanPreviewError] = useState<string | null>(
    null,
  );
  const [dawudAnchorYear, setDawudAnchorYear] = useState('');
  const [dawudAnchorMonth, setDawudAnchorMonth] = useState('');
  const [dawudAnchorDay, setDawudAnchorDay] = useState('');
  const [dawudAnchorError, setDawudAnchorError] = useState<string | null>(null);

  useEffect(() => {
    const [year, month, day] = dateKeyParts(settings.dawudAnchorDate);
    setDawudAnchorYear(year);
    setDawudAnchorMonth(month);
    setDawudAnchorDay(day);
    setDawudAnchorError(null);
  }, [settings.dawudAnchorDate]);

  const saveDawudAnchorDate = () => {
    const date = `${dawudAnchorYear}-${dawudAnchorMonth.padStart(
      2,
      '0',
    )}-${dawudAnchorDay.padStart(2, '0')}`;
    if (!isValidLocalDateKey(date)) {
      setDawudAnchorError('Enter a real date using year, month, and day.');
      return;
    }
    setDawudAnchorError(null);
    onDawudAnchorDate(date);
  };

  const closeSettings = () => {
    setIsMethodPickerOpen(false);
    onStopAdhanPreview()
      .catch(() => undefined)
      .finally(() => onClose());
  };

  const handleSettingsRequestClose = () => {
    if (isMethodPickerOpen) {
      setIsMethodPickerOpen(false);
      return;
    }
    closeSettings();
  };

  const toggleAdhanPreview = () => {
    if (isAdhanPreviewPlaying) {
      onStopAdhanPreview()
        .then(() => setIsAdhanPreviewPlaying(false))
        .catch(() => setAdhanPreviewError('Unable to stop the Adhan preview.'));
      return;
    }
    onPreviewAdhan()
      .then(() => {
        setAdhanPreviewError(null);
        setIsAdhanPreviewPlaying(true);
      })
      .catch(() => {
        setAdhanPreviewError(
          'Adhan preview is unavailable. Prayer notifications still work.',
        );
      });
  };

  return (
    <MotionSheet
      visible={isVisible}
      onRequestClose={handleSettingsRequestClose}
      style={styles.settingsSheet}
    >
      <View style={styles.sheetHandle} />
      {isMethodPickerOpen ? (
        <>
          <View style={styles.sheetHeader}>
            <Pressable
              style={styles.methodPickerBackButton}
              onPress={() => setIsMethodPickerOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Back to prayer settings"
            >
              <Text style={styles.methodPickerBackText}>‹ BACK</Text>
            </Pressable>
            <Pressable
              style={styles.closeButton}
              onPress={closeSettings}
              accessibilityRole="button"
              accessibilityLabel="Close prayer settings"
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <View style={styles.methodPickerHeading}>
            <Text style={styles.sheetKicker}>PRAYER TIMES</Text>
            <Text style={styles.sheetTitle}>Calculation method</Text>
            <Text style={styles.settingsHint}>
              Automatic lets AlAdhan choose the closest supported authority for
              this place. Choose your local community&apos;s method to override
              it.
            </Text>
            {message ? (
              <Text
                style={styles.settingsInlineMessage}
                accessibilityRole="alert"
              >
                {message}
              </Text>
            ) : null}
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.methodPickerList}
          >
            {methodOptions.map(method => {
              const isSelected = method.id === settings.method;
              return (
                <Pressable
                  key={method.id ?? 'automatic'}
                  style={[
                    styles.methodPickerOption,
                    isSelected && styles.methodPickerOptionSelected,
                  ]}
                  onPress={() => {
                    const saveMethod = onMethod(method.id);
                    setIsMethodPickerOpen(false);
                    return saveMethod;
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={method.name}
                >
                  <Text
                    style={[
                      styles.methodPickerOptionText,
                      isSelected && styles.methodPickerOptionTextSelected,
                    ]}
                  >
                    {method.name}
                  </Text>
                  <Text
                    style={[
                      styles.methodPickerCheck,
                      !isSelected && styles.methodPickerCheckHidden,
                    ]}
                  >
                    ✓
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : (
        <>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetKicker}>YOUR PREFERENCES</Text>
              <Text style={styles.sheetTitle}>Prayer settings</Text>
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={closeSettings}
              accessibilityRole="button"
              accessibilityLabel="Close prayer settings"
              accessibilityHint="Closes the prayer settings panel"
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetScrollContent}
          >
            {message ? (
              <Text
                style={styles.settingsInlineMessage}
                accessibilityRole="alert"
              >
                {message}
              </Text>
            ) : null}
            <Text style={styles.settingsLabel}>SAVED PLACES</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.methodScroller}
            >
              {profiles.map(profile => {
                const selected = profile.id === activeProfileId;
                return (
                  <Pressable
                    key={profile.id}
                    style={[
                      styles.methodChip,
                      selected && styles.methodChipSelected,
                    ]}
                    onPress={() => onSelectProfile(profile.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Use ${profile.name} saved place`}
                  >
                    <Text
                      style={[
                        styles.methodChipText,
                        selected && styles.methodChipTextSelected,
                      ]}
                    >
                      {profile.name}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                style={styles.newProfileChip}
                onPress={onNewProfile}
                accessibilityRole="button"
                accessibilityLabel="Add a saved place"
              >
                <Text style={styles.newProfileChipText}>+ ADD PLACE</Text>
              </Pressable>
            </ScrollView>
            <Text style={styles.settingsHint}>
              Keep Home, Work, Mosque, Travel and custom places with their own
              local calculation adjustments and cached schedules.
            </Text>

            <Text style={styles.settingsLabel}>CALCULATION METHOD</Text>
            <Pressable
              style={styles.methodPickerTrigger}
              onPress={() => setIsMethodPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Choose calculation method"
              accessibilityHint="Opens the list of prayer-time calculation methods"
            >
              <View style={styles.methodPickerTriggerText}>
                <Text style={styles.methodPickerTriggerLabel}>
                  CURRENT METHOD
                </Text>
                <Text style={styles.methodPickerTriggerValue} numberOfLines={1}>
                  {selectedMethod?.name ??
                    (settings.method === null
                      ? automaticMethod.name
                      : `Method ${settings.method}`)}
                </Text>
              </View>
              <Text style={styles.methodPickerChevron}>›</Text>
            </Pressable>
            <Text style={styles.settingsHint}>
              Automatic uses this place&apos;s coordinates to select
              AlAdhan&apos;s closest supported authority. Use a manual method
              when your mosque or community follows a specific timetable.
            </Text>

            <Text style={styles.settingsLabel}>ASR JURISTIC METHOD</Text>
            <View style={styles.segmentedControl}>
              {(['standard', 'hanafi'] as const).map(school => (
                <Pressable
                  key={school}
                  style={[
                    styles.segment,
                    settings.school === school && styles.segmentSelected,
                  ]}
                  onPress={() => onSchool(school)}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      settings.school === school && styles.segmentTextSelected,
                    ]}
                  >
                    {school === 'standard' ? 'Standard' : 'Hanafi'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.settingsLabel}>HIGH-LATITUDE RULE</Text>
            <View style={styles.profileOptionRow}>
              {(
                [
                  ['default', 'API default'],
                  ['angleBased', 'Angle'],
                  ['midnight', 'Midnight'],
                  ['oneSeventh', '1/7 night'],
                ] as const
              ).map(([rule, label]) => {
                const selected = highLatitudeRule === rule;
                return (
                  <Pressable
                    key={rule}
                    style={[
                      styles.profileOption,
                      selected && styles.profileOptionSelected,
                    ]}
                    onPress={() => onHighLatitudeRule(rule)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[
                        styles.profileOptionText,
                        selected && styles.profileOptionTextSelected,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.settingsHint}>
              Use your local mosque’s guidance. API default is preserved unless
              you choose an override.
            </Text>

            <Text style={styles.settingsLabel}>FASTING ROUTINE</Text>
            <View style={styles.segmentedControl}>
              {(
                [
                  ['off', 'Off'],
                  ['mondayThursday', 'Mon & Thu'],
                  ['dawud', 'Dawud'],
                ] as const
              ).map(([routine, label]) => (
                <Pressable
                  key={routine}
                  style={[
                    styles.segment,
                    settings.fastingRoutine === routine &&
                      styles.segmentSelected,
                  ]}
                  onPress={() => onFastingRoutine(routine)}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      settings.fastingRoutine === routine &&
                        styles.segmentTextSelected,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.settingsHint}>
              {settings.fastingRoutine === 'dawud'
                ? settings.dawudAnchorDate
                  ? `Anchor ${settings.dawudAnchorDate} is a fasting day. Dawud fasting alternates every other day.`
                  : 'Set the date that is a fasting day to begin your Dawud cycle.'
                : settings.fastingRoutine === 'off'
                ? 'Choose Mon & Thu or Dawud above to enable fasting alarms.'
                : 'Schedules Suhoor and Imsak for your chosen fasting days.'}
            </Text>
            {settings.fastingRoutine === 'dawud' ? (
              <View style={styles.dawudAnchorCard}>
                <Text style={styles.dawudAnchorTitle}>
                  DAWUD FASTING ANCHOR
                </Text>
                <Text style={styles.dawudAnchorHint}>
                  This date is a fasting day. The cycle alternates every other
                  day from it.
                </Text>
                <View style={styles.dawudAnchorRow}>
                  <View style={styles.dawudAnchorFieldYear}>
                    <Text style={styles.dawudAnchorLabel}>YEAR</Text>
                    <TextInput
                      value={dawudAnchorYear}
                      onChangeText={value => {
                        if (isUnsignedIntegerInput(value)) {
                          setDawudAnchorYear(value);
                          setDawudAnchorError(null);
                        }
                      }}
                      keyboardType="numeric"
                      maxLength={4}
                      placeholder="2026"
                      placeholderTextColor="#8C9A8F"
                      style={styles.dawudAnchorInput}
                      accessibilityLabel="Dawud fasting anchor year"
                    />
                  </View>
                  <View style={styles.dawudAnchorField}>
                    <Text style={styles.dawudAnchorLabel}>MONTH</Text>
                    <TextInput
                      value={dawudAnchorMonth}
                      onChangeText={value => {
                        if (isUnsignedIntegerInput(value)) {
                          setDawudAnchorMonth(value);
                          setDawudAnchorError(null);
                        }
                      }}
                      keyboardType="numeric"
                      maxLength={2}
                      placeholder="08"
                      placeholderTextColor="#8C9A8F"
                      style={styles.dawudAnchorInput}
                      accessibilityLabel="Dawud fasting anchor month"
                    />
                  </View>
                  <View style={styles.dawudAnchorField}>
                    <Text style={styles.dawudAnchorLabel}>DAY</Text>
                    <TextInput
                      value={dawudAnchorDay}
                      onChangeText={value => {
                        if (isUnsignedIntegerInput(value)) {
                          setDawudAnchorDay(value);
                          setDawudAnchorError(null);
                        }
                      }}
                      keyboardType="numeric"
                      maxLength={2}
                      placeholder="31"
                      placeholderTextColor="#8C9A8F"
                      style={styles.dawudAnchorInput}
                      accessibilityLabel="Dawud fasting anchor day"
                    />
                  </View>
                </View>
                <Pressable
                  style={styles.dawudAnchorSaveButton}
                  onPress={saveDawudAnchorDate}
                  accessibilityRole="button"
                  accessibilityLabel="Save Dawud fasting anchor date"
                  accessibilityHint="Sets this date as a fasting day and updates fasting alarms."
                >
                  <Text style={styles.dawudAnchorSaveText}>
                    SAVE ANCHOR DATE
                  </Text>
                </Pressable>
                {dawudAnchorError ? (
                  <Text
                    style={styles.dawudAnchorError}
                    accessibilityRole="alert"
                  >
                    {dawudAnchorError}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.toggleRow}>
              <View style={styles.toggleTextBlock}>
                <Text style={styles.toggleTitle}>Fasting alarms</Text>
                <Text style={styles.toggleDescription}>
                  Suhoor reminder 30 minutes before Imsak, plus Imsak alarm.
                </Text>
              </View>
              <Switch
                value={settings.fastingAlarmsEnabled}
                onValueChange={onFastingAlarms}
                accessibilityLabel="Fasting alarms"
                accessibilityHint="Schedules Suhoor and Imsak alerts"
                accessibilityRole="switch"
                disabled={
                  settings.fastingRoutine === 'off' ||
                  !nativeNotificationsAvailable
                }
                trackColor={{ false: COLORS.sand, true: COLORS.moss }}
                thumbColor={COLORS.cream}
              />
            </View>
            {settings.fastingAlarmsEnabled &&
            settings.fastingRoutine !== 'off' ? (
              <View style={styles.prayerToggleGroup}>
                <View style={styles.prayerToggleRow}>
                  <Text style={styles.prayerToggleLabel}>Suhoor reminder</Text>
                  <Switch
                    value={settings.suhoorReminderEnabled}
                    onValueChange={onSuhoorReminder}
                    accessibilityLabel="Suhoor reminder"
                    accessibilityHint="Schedules a reminder before Imsak"
                    accessibilityRole="switch"
                    trackColor={{ false: COLORS.sand, true: COLORS.moss }}
                    thumbColor={COLORS.cream}
                  />
                </View>
                <View style={styles.prayerToggleRow}>
                  <Text style={styles.prayerToggleLabel}>Imsak alarm</Text>
                  <Switch
                    value={settings.imsakAlarmEnabled}
                    onValueChange={onImsakAlarm}
                    accessibilityLabel="Imsak alarm"
                    accessibilityHint="Schedules an alarm at Imsak"
                    accessibilityRole="switch"
                    trackColor={{ false: COLORS.sand, true: COLORS.moss }}
                    thumbColor={COLORS.cream}
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.toggleRow}>
              <View style={styles.toggleTextBlock}>
                <Text style={styles.toggleTitle}>24-hour time</Text>
                <Text style={styles.toggleDescription}>
                  Display prayer and calendar times as 05:30 instead of 5:30 AM.
                </Text>
              </View>
              <Switch
                value={settings.use24HourTime}
                onValueChange={onUse24HourTime}
                accessibilityLabel="24-hour time"
                accessibilityHint="Displays times using the 24-hour clock"
                accessibilityRole="switch"
                trackColor={{ false: COLORS.sand, true: COLORS.moss }}
                thumbColor={COLORS.cream}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleTextBlock}>
                <Text style={styles.toggleTitle}>Prayer reminders</Text>
                <Text style={styles.toggleDescription}>
                  Native alerts for the next seven days.
                </Text>
              </View>
              <Switch
                value={settings.notificationsEnabled}
                onValueChange={onNotifications}
                disabled={!nativeNotificationsAvailable}
                accessibilityLabel="Prayer reminders"
                accessibilityHint="Schedules native prayer alerts"
                accessibilityRole="switch"
                trackColor={{ false: COLORS.sand, true: COLORS.moss }}
                thumbColor={COLORS.cream}
              />
            </View>
            {settings.notificationsEnabled ? (
              <>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleTextBlock}>
                    <Text style={styles.toggleTitle}>Adhan sound</Text>
                    <Text style={styles.toggleDescription}>
                      Uses a bundled 28-second Adhan clip for prayer alerts.
                      Fasting alarms keep the system sound.
                    </Text>
                  </View>
                  <Switch
                    value={settings.adhanEnabled}
                    onValueChange={onAdhanEnabled}
                    accessibilityLabel="Adhan sound"
                    accessibilityHint="Uses Adhan audio for prayer alerts"
                    accessibilityRole="switch"
                    trackColor={{ false: COLORS.sand, true: COLORS.moss }}
                    thumbColor={COLORS.cream}
                  />
                </View>
                <Text style={styles.adhanVolumeLabel}>ADHAN VOLUME ROUTE</Text>
                <View style={styles.adhanVolumeSelector}>
                  {(
                    [
                      ['alarm', 'Alarm'],
                      ['media', 'Media'],
                      ['notification', 'Notification'],
                    ] as const
                  ).map(([category, label]) => {
                    const isSelected =
                      settings.adhanVolumeCategory === category;
                    return (
                      <Pressable
                        key={category}
                        style={[
                          styles.adhanVolumeButton,
                          isSelected && styles.adhanVolumeButtonSelected,
                        ]}
                        onPress={() => onAdhanVolumeCategory(category)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`${label} volume route`}
                      >
                        <Text
                          style={[
                            styles.adhanVolumeButtonText,
                            isSelected && styles.adhanVolumeButtonTextSelected,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.adhanVolumeHint}>
                  Android follows this system volume. iPhone uses its standard
                  notification audio route.
                </Text>
                <View style={styles.adhanPreviewRow}>
                  <Pressable
                    style={styles.adhanPreviewButton}
                    onPress={toggleAdhanPreview}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isAdhanPreviewPlaying
                        ? 'Stop full Adhan preview'
                        : 'Play full Adhan preview'
                    }
                  >
                    <Text style={styles.adhanPreviewText}>
                      {isAdhanPreviewPlaying
                        ? 'STOP FULL PREVIEW'
                        : 'PLAY FULL PREVIEW'}
                    </Text>
                  </Pressable>
                  <Text style={styles.adhanLicenseText}>
                    CC0 recording · source in Third Party Notices
                  </Text>
                </View>
                {adhanPreviewError ? (
                  <Text
                    style={styles.adhanPreviewError}
                    accessibilityRole="alert"
                  >
                    {adhanPreviewError}
                  </Text>
                ) : null}
                <View style={styles.prayerToggleGroup}>
                  {PRAYER_NAMES.map(prayer => (
                    <View style={styles.prayerToggleRow} key={prayer}>
                      <Text style={styles.prayerToggleLabel}>{prayer}</Text>
                      <Switch
                        value={settings.enabledPrayers[prayer]}
                        onValueChange={enabled =>
                          onPrayerReminder(prayer, enabled)
                        }
                        accessibilityLabel={`${prayer} reminder`}
                        accessibilityHint={`Schedules ${prayer} prayer alerts`}
                        accessibilityRole="switch"
                        trackColor={{
                          false: COLORS.sand,
                          true: COLORS.moss,
                        }}
                        thumbColor={COLORS.cream}
                      />
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.settingsLabel}>NOTIFICATION HEALTH</Text>
            <View style={styles.healthCard} accessibilityLiveRegion="polite">
              <HealthRow
                label="Notifications"
                value={notificationHealthLabel(health.notifications)}
              />
              {health.timing !== 'notApplicable' ? (
                <HealthRow
                  label="Timing"
                  value={notificationHealthLabel(health.timing)}
                />
              ) : null}
              {health.batteryOptimization !== 'notApplicable' ? (
                <HealthRow
                  label="Battery"
                  value={notificationHealthLabel(health.batteryOptimization)}
                />
              ) : null}
              {health.bootRescheduling === 'supported' ? (
                <HealthRow
                  label="After restart"
                  value="Reschedules reminders"
                />
              ) : null}
              {!nativeNotificationsAvailable ? (
                <Text
                  style={styles.nativeReminderUnavailable}
                  accessibilityRole="alert"
                >
                  Reminders require the latest Duavara app build. Reinstall the
                  current APK, then reopen these settings to allow
                  notifications.
                </Text>
              ) : null}
              <Text style={styles.healthHint}>
                Focus, Do Not Disturb, and system notification settings can
                still delay alerts.
              </Text>
              <View style={styles.healthActions}>
                <Pressable
                  style={styles.healthButton}
                  onPress={onRefreshNotificationHealth}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh notification health"
                >
                  <Text style={styles.healthButtonText}>REFRESH STATUS</Text>
                </Pressable>
                {health.timing === 'approximate' ? (
                  <Pressable
                    style={styles.healthButton}
                    onPress={onOpenExactAlarmSettings}
                    accessibilityRole="button"
                    accessibilityLabel="Open exact alarm settings"
                  >
                    <Text style={styles.healthButtonText}>
                      ALLOW EXACT TIME
                    </Text>
                  </Pressable>
                ) : null}
                {health.batteryOptimization === 'restricted' ? (
                  <Pressable
                    style={styles.healthButton}
                    onPress={onOpenBatterySettings}
                    accessibilityRole="button"
                    accessibilityLabel="Open battery optimization settings"
                  >
                    <Text style={styles.healthButtonText}>
                      BATTERY SETTINGS
                    </Text>
                  </Pressable>
                ) : null}
                {health.notifications === 'blocked' ? (
                  <Pressable
                    style={styles.healthButton}
                    onPress={onOpenSystemSettings}
                    accessibilityRole="button"
                    accessibilityLabel="Open system notification settings"
                  >
                    <Text style={styles.healthButtonText}>SYSTEM SETTINGS</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <Text style={styles.settingsLabel}>SAVED PLACE DETAILS</Text>
            <Text style={styles.settingsHint}>
              Each place keeps its own coordinates, optional timezone,
              high-latitude rule, minute adjustments, and 30-day offline
              timetable.
            </Text>
            <TextInput
              value={profileNameValue}
              onChangeText={onProfileName}
              placeholder="Place name, e.g. Home"
              placeholderTextColor="#8C9A8F"
              style={styles.profileTextInput}
              maxLength={40}
              accessibilityLabel="Saved place name"
            />
            <View style={styles.profileOptionRow}>
              {(
                [
                  ['home', 'Home'],
                  ['work', 'Work'],
                  ['mosque', 'Mosque'],
                  ['travel', 'Travel'],
                  ['custom', 'Custom'],
                ] as const
              ).map(([kind, label]) => {
                const selected = profileKindValue === kind;
                return (
                  <Pressable
                    key={kind}
                    style={[
                      styles.profileOption,
                      selected && styles.profileOptionSelected,
                    ]}
                    onPress={() => onProfileKind(kind)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${label} place type`}
                  >
                    <Text
                      style={[
                        styles.profileOptionText,
                        selected && styles.profileOptionTextSelected,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.settingsLabel}>MANUAL COORDINATES</Text>
            <Text style={styles.settingsHint}>
              Enter coordinates manually to update this saved place.
            </Text>
            <View style={styles.coordinateRow}>
              <View style={styles.coordinateField}>
                <Text style={styles.coordinateLabel}>LATITUDE</Text>
                <TextInput
                  value={latitude}
                  onChangeText={value => {
                    if (isSignedDecimalInput(value)) onLatitude(value);
                  }}
                  keyboardType={
                    Platform.OS === 'android'
                      ? 'numeric'
                      : 'numbers-and-punctuation'
                  }
                  placeholder="e.g. 51.5074"
                  placeholderTextColor="#8C9A8F"
                  style={styles.coordinateInput}
                  accessibilityLabel="Latitude"
                />
              </View>
              <View style={styles.coordinateField}>
                <Text style={styles.coordinateLabel}>LONGITUDE</Text>
                <TextInput
                  value={longitude}
                  onChangeText={value => {
                    if (isSignedDecimalInput(value)) onLongitude(value);
                  }}
                  keyboardType={
                    Platform.OS === 'android'
                      ? 'numeric'
                      : 'numbers-and-punctuation'
                  }
                  placeholder="e.g. -0.1278"
                  placeholderTextColor="#8C9A8F"
                  style={styles.coordinateInput}
                  accessibilityLabel="Longitude"
                />
              </View>
            </View>
            <Text style={styles.coordinateLabel}>
              TIMEZONE OVERRIDE (OPTIONAL)
            </Text>
            <TextInput
              value={timezoneValue}
              onChangeText={onTimezone}
              autoCapitalize="none"
              placeholder="e.g. Europe/London"
              placeholderTextColor="#8C9A8F"
              style={styles.profileTextInput}
              accessibilityLabel="IANA timezone override"
            />
            <Text style={styles.settingsLabel}>LOCAL MINUTE ADJUSTMENTS</Text>
            <Text style={styles.settingsHint}>
              Use only when your local masjid timetable differs. Set 0 to keep
              the API time.
            </Text>
            <View style={styles.adjustmentRow}>
              {PRAYER_NAMES.map(prayer => (
                <View key={prayer} style={styles.adjustmentField}>
                  <Text style={styles.adjustmentLabel}>{prayer}</Text>
                  <TextInput
                    value={profileAdjustments[prayer]}
                    onChangeText={value => {
                      if (isSignedIntegerInput(value))
                        onAdjustment(prayer, value);
                    }}
                    keyboardType={
                      Platform.OS === 'android'
                        ? 'numeric'
                        : 'numbers-and-punctuation'
                    }
                    style={styles.adjustmentInput}
                    accessibilityLabel={`${prayer} minute adjustment`}
                  />
                </View>
              ))}
            </View>
            <Pressable
              style={[
                styles.saveLocationButton,
                isBusy && styles.saveLocationButtonDisabled,
              ]}
              onPress={onSaveLocation}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel="Save place and update prayer times"
            >
              <Text style={styles.saveLocationText}>
                {isBusy
                  ? 'UPDATING…'
                  : 'SAVE MANUAL COORDINATES & UPDATE TIMES'}
              </Text>
            </Pressable>

            <Text style={styles.settingsLabel}>PRIVACY</Text>
            <Text style={styles.settingsHint}>
              Delete all locally stored app data, including saved places, prayer
              caches, worship progress, Quran downloads, mosque notes, Zakat
              data, and scheduled reminders.
            </Text>
            <Pressable
              style={styles.deleteDataButton}
              onPress={onDeleteAllData}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel="Delete all local data"
            >
              <Text style={styles.deleteDataButtonText}>
                DELETE ALL LOCAL DATA
              </Text>
            </Pressable>
          </ScrollView>
        </>
      )}
    </MotionSheet>
  );
}

function AboutView({
  onOpenExternalUrl,
}: {
  onOpenExternalUrl: (url: string) => Promise<void>;
}) {
  const [appInfo, setAppInfo] = useState<AppInfo>({
    version: 'Unavailable',
    build: null,
  });

  useEffect(() => {
    let cancelled = false;
    getAppInfo().then(info => {
      if (!cancelled) setAppInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.aboutView} accessibilityLabel="About Duavara screen">
      <View style={styles.aboutHero}>
        <View style={styles.aboutHeroTop}>
          <Image source={appIconAsset} style={styles.aboutAppIcon} />
          <View style={styles.aboutHeroCopy}>
            <Text style={styles.aboutHeroKicker}>YOUR WORSHIP COMPANION</Text>
            <Text style={styles.aboutHeroTitle}>Duavara</Text>
          </View>
        </View>
        <Text style={styles.aboutHeroDescription}>
          Prayer times, Qibla, Quran, and mindful worship tools—designed to work
          quietly around your day.
        </Text>
        <View style={styles.aboutFeatureRow}>
          {['PRAYER', 'QIBLA', 'QURAN'].map(feature => (
            <View key={feature} style={styles.aboutFeaturePill}>
              <Text style={styles.aboutFeatureText}>{feature}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.aboutVersionCard}>
        <View style={styles.aboutVersionHeader}>
          <Text style={styles.aboutVersionLabel}>INSTALLED ON THIS DEVICE</Text>
          <View style={styles.aboutInstalledBadge}>
            <View style={styles.aboutInstalledDot} />
            <Text style={styles.aboutInstalledText}>LOCAL APP</Text>
          </View>
        </View>
        <Text
          style={styles.aboutVersionValue}
          accessibilityLabel={`Duavara version ${appInfo.version}${
            appInfo.build ? `, build ${appInfo.build}` : ''
          }`}
        >
          Version {appInfo.version}
          {appInfo.build ? ` · Build ${appInfo.build}` : ''}
        </Text>
      </View>

      <View
        style={styles.aboutPrivacyCard}
        accessibilityLabel="Privacy by design: app data is stored locally; location is shared with named services only when location-based features are used"
      >
        <Text style={styles.aboutPrivacyKicker}>PRIVATE BY DESIGN</Text>
        <Text style={styles.aboutPrivacyTitle}>
          Your practice stays personal.
        </Text>
        <Text style={styles.aboutPrivacyDescription}>
          Duavara does not create accounts, use analytics, or operate an app
          backend. Location is shared with AlAdhan, OpenStreetMap, and platform
          geocoding only when you use location-based features.
        </Text>
        <View style={styles.aboutPrivacyFacts}>
          {[
            'No account required',
            'No analytics tracking',
            'App data stored locally',
          ].map(fact => (
            <View key={fact} style={styles.aboutPrivacyFact}>
              <Text style={styles.aboutPrivacyCheck}>✓</Text>
              <Text style={styles.aboutPrivacyFactText}>{fact}</Text>
            </View>
          ))}
        </View>
      </View>

      <Reveal delay={60}>
        <SupportDuavaraCard
          onPress={() => onOpenExternalUrl(SUPPORT_DUAVARA_LINK.url)}
        />
      </Reveal>

      <Text style={styles.aboutSectionLabel}>APP & PRIVACY</Text>
      {ABOUT_LINKS.slice(0, 4).map(link => (
        <AboutLink
          key={link.label}
          {...link}
          onPress={() => onOpenExternalUrl(link.url)}
        />
      ))}
      <Text style={styles.aboutSectionLabel}>DATA SOURCES</Text>
      {ABOUT_LINKS.slice(4, 7).map(link => (
        <AboutLink
          key={link.label}
          {...link}
          onPress={() => onOpenExternalUrl(link.url)}
        />
      ))}
      <Text style={styles.aboutSectionLabel}>UPDATES</Text>
      <AboutLink
        {...ABOUT_LINKS[7]}
        onPress={() => onOpenExternalUrl(ABOUT_LINKS[7].url)}
      />
    </View>
  );
}

function SupportDuavaraCard({ onPress }: { onPress: () => Promise<void> }) {
  return (
    <View style={styles.aboutSupportCard}>
      <View style={styles.aboutSupportHeader}>
        <View
          style={styles.aboutSupportMark}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={styles.aboutSupportMarkText}>♥</Text>
        </View>
        <View style={styles.aboutSupportCopy}>
          <Text style={styles.aboutSupportKicker}>OPTIONAL SUPPORT</Text>
          <Text style={styles.aboutSupportTitle}>Help Duavara grow.</Text>
        </View>
      </View>
      <Text style={styles.aboutSupportDescription}>
        A one-time coffee helps sustain thoughtful, privacy-first worship tools.
      </Text>
      <PressableScale
        style={styles.aboutSupportButton}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={SUPPORT_DUAVARA_LINK.label}
        accessibilityHint="Opens Buy Me a Coffee in your browser."
      >
        <View style={styles.aboutSupportButtonCopy}>
          <Text style={styles.aboutSupportButtonText}>DONATE HERE</Text>
          <Text style={styles.aboutSupportButtonDetail}>BUY ME A COFFEE</Text>
        </View>
        <Text style={styles.aboutSupportButtonArrow}>↗</Text>
      </PressableScale>
    </View>
  );
}

function AboutLink({
  title,
  description,
  label,
  onPress,
}: {
  title: string;
  description: string;
  label: string;
  onPress: () => Promise<void>;
}) {
  return (
    <Pressable
      style={styles.aboutLink}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens in your browser."
    >
      <View style={styles.aboutLinkText}>
        <Text style={styles.aboutLinkTitle}>{title}</Text>
        <Text style={styles.aboutLinkDescription}>{description}</Text>
      </View>
      <Text style={styles.aboutLinkChevron}>↗</Text>
    </Pressable>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.healthRow}>
      <Text style={styles.healthLabel}>{label}</Text>
      <Text style={styles.healthValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: COLORS.ink },
  appBar: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 14,
    backgroundColor: COLORS.ink,
  },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerIdentity: { flex: 1, flexShrink: 1 },
  wordmark: {
    color: COLORS.cream,
    fontFamily: FONTS.display,
    fontSize: 27,
    letterSpacing: -0.7,
    lineHeight: 32,
  },
  locationPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 7,
    marginTop: 3,
    minHeight: 24,
  },
  locationText: {
    color: COLORS.muted,
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  headerActions: { flexDirection: 'row', flexShrink: 0, gap: 10 },
  headerRefreshButton: {
    alignItems: 'center',
    backgroundColor: COLORS.inkSoft,
    borderColor: COLORS.line,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  locationPinIcon: {
    alignItems: 'center',
    backgroundColor: COLORS.cream,
    borderBottomRightRadius: 3,
    borderRadius: 9,
    height: 18,
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
    width: 18,
  },
  locationPinHole: {
    backgroundColor: COLORS.inkSoft,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.inkSoft,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  slidersGlyph: { width: 17, gap: 4, alignItems: 'flex-start' },
  sliderLine: {
    height: 1.8,
    borderRadius: 1,
    backgroundColor: COLORS.cream,
  },
  sliderLineWide: { width: 15 },
  sliderLineMid: { width: 12 },
  sliderLineShort: { width: 9 },
  messageBanner: {
    backgroundColor: 'rgba(217, 183, 107, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(217, 183, 107, 0.32)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  messageText: {
    color: COLORS.parchment,
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
  messageDismiss: { color: COLORS.gold, fontSize: 20, lineHeight: 20 },
  dateBlock: { marginBottom: 18 },
  dateEyebrow: {
    color: COLORS.gold,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  dateTitle: {
    color: COLORS.cream,
    fontFamily: FONTS.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    marginTop: 6,
  },
  nextCard: {
    backgroundColor: COLORS.mossDeep,
    borderRadius: 28,
    padding: 22,
    minHeight: 210,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(203, 243, 224, 0.14)',
  },
  heroGlow: {
    position: 'absolute',
    top: -140,
    right: -110,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(143, 217, 190, 0.08)',
  },
  heroOrbitOuter: {
    position: 'absolute',
    top: -62,
    right: -56,
    width: 210,
    height: 210,
    borderRadius: 105,
    borderWidth: 1,
    borderColor: 'rgba(217, 183, 107, 0.22)',
  },
  heroOrbitInner: {
    position: 'absolute',
    top: -26,
    right: -22,
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: 'rgba(203, 243, 224, 0.12)',
  },
  moon: {
    position: 'absolute',
    top: -54,
    right: -42,
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: COLORS.gold,
    opacity: 0.18,
  },
  moonCutout: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: COLORS.mossDeep,
    top: -10,
    left: -46,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroKickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nextEyebrow: {
    color: COLORS.mintBright,
    fontSize: 10.5,
    letterSpacing: 1.7,
    fontWeight: '800',
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 14,
    marginTop: 16,
    marginBottom: 20,
  },
  heroNameBlock: { flex: 1, minWidth: 0 },
  nextName: {
    color: COLORS.cream,
    fontFamily: FONTS.display,
    fontSize: 44,
    letterSpacing: -1.2,
    lineHeight: 50,
  },
  nextArabic: {
    color: 'rgba(203, 243, 224, 0.72)',
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'left',
    marginTop: 4,
  },
  nextTime: {
    color: COLORS.cream,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  countdownPill: {
    backgroundColor: 'rgba(3, 12, 10, 0.42)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(203, 243, 224, 0.16)',
  },
  countdownLabel: {
    color: COLORS.mint,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  countdownValue: {
    color: COLORS.cream,
    fontVariant: ['tabular-nums'],
    fontSize: 13,
    fontWeight: '700',
  },
  nextHint: {
    color: 'rgba(250, 245, 233, 0.66)',
    fontSize: 12.5,
    marginTop: 14,
  },
  fastingStatusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: 'rgba(217, 183, 107, 0.08)',
    borderColor: 'rgba(217, 183, 107, 0.24)',
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 22,
    padding: 16,
  },
  fastingStatusCardActive: {
    backgroundColor: 'rgba(143, 217, 190, 0.10)',
    borderColor: 'rgba(143, 217, 190, 0.36)',
  },
  fastingBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(217, 183, 107, 0.14)',
  },
  fastingBadgeActive: { backgroundColor: 'rgba(143, 217, 190, 0.18)' },
  fastingBadgeGlyph: { color: COLORS.gold, fontSize: 20 },
  fastingBadgeGlyphActive: { color: COLORS.mintBright },
  fastingBody: { flex: 1 },
  fastingStatusKicker: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  fastingStatusTitle: {
    color: COLORS.cream,
    fontFamily: FONTS.display,
    fontSize: 21,
    marginTop: 4,
  },
  fastingStatusText: {
    color: COLORS.mint,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  sectionTitle: {
    color: COLORS.cream,
    fontFamily: FONTS.display,
    fontSize: 22,
    letterSpacing: -0.3,
  },
  sectionMeta: {
    color: COLORS.muted,
    fontSize: 11,
    maxWidth: 140,
    textAlign: 'right',
  },
  prayerList: {
    backgroundColor: COLORS.inkSoft,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  prayerRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.line,
  },
  prayerRowNext: {
    backgroundColor: 'rgba(143, 217, 190, 0.10)',
    borderBottomWidth: 0,
  },
  prayerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(250, 245, 233, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  prayerIconNext: { backgroundColor: COLORS.mint },
  prayerIconPast: { opacity: 0.6 },
  prayerIconText: { color: COLORS.sand, fontSize: 17 },
  prayerIconTextNext: { color: COLORS.inkDeep },
  prayerIconTextPast: { color: COLORS.muted },
  prayerNameBlock: { flex: 1, marginRight: 10 },
  prayerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prayerName: { color: COLORS.cream, fontSize: 16.5, fontWeight: '700' },
  prayerNameNext: { color: COLORS.mintBright },
  prayerNamePast: { color: 'rgba(250, 245, 233, 0.68)' },
  prayerArabic: { color: COLORS.muted, fontSize: 12.5, marginTop: 2 },
  prayerTime: {
    color: COLORS.cream,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  prayerTimeNext: { color: COLORS.mintBright },
  prayerTimePast: { color: 'rgba(250, 245, 233, 0.58)' },
  nowBadge: {
    color: COLORS.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  nextBadge: {
    color: COLORS.mintBright,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  shareTimesButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(145, 214, 190, 0.10)',
    borderColor: 'rgba(145, 214, 190, 0.28)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 50,
  },
  shareTimesText: {
    color: COLORS.mintBright,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  shareTimesIcon: { color: COLORS.gold, fontSize: 18, marginLeft: 8 },
  footnote: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    paddingHorizontal: 4,
    marginTop: 18,
  },
  footnoteIcon: { color: COLORS.gold, fontSize: 12, marginTop: 2 },
  footnoteText: { color: COLORS.muted, fontSize: 11, lineHeight: 17, flex: 1 },
  loadingState: {
    flex: 1,
    paddingTop: 8,
    gap: 18,
  },
  loadingCompact: { gap: 10, paddingVertical: 18 },
  loadingHero: {
    backgroundColor: COLORS.mossDeep,
    borderColor: 'rgba(203, 243, 224, 0.14)',
    borderRadius: 28,
    borderWidth: 1,
    padding: 22,
    minHeight: 190,
  },
  loadingGap: { marginTop: 18 },
  loadingGapSm: { marginTop: 8 },
  loadingGapLg: { marginTop: 22 },
  loadingListCard: {
    backgroundColor: COLORS.inkSoft,
    borderColor: COLORS.line,
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 4,
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    minHeight: 66,
    paddingHorizontal: 16,
  },
  loadingRowText: { flex: 1 },
  loadingText: {
    color: COLORS.muted,
    fontSize: 12.5,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 12,
  },
  emptySky: {
    width: '100%',
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyStar: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.cream,
  },
  emptyOrbit: {
    position: 'absolute',
    width: 218,
    height: 218,
    borderRadius: 109,
    borderWidth: 1,
    borderColor: 'rgba(203, 243, 224, 0.12)',
  },
  emptyMoon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.gold,
    overflow: 'hidden',
  },
  emptyMoonCutout: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: COLORS.ink,
    position: 'absolute',
    top: -11,
    left: -25,
  },
  emptyKicker: {
    color: COLORS.gold,
    letterSpacing: 1.6,
    fontSize: 10.5,
    fontWeight: '800',
  },
  emptyTitle: {
    color: COLORS.cream,
    textAlign: 'center',
    fontFamily: FONTS.display,
    fontSize: 33,
    lineHeight: 40,
    letterSpacing: -0.8,
    marginTop: 10,
  },
  emptyText: {
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 21,
    fontSize: 14,
    marginTop: 14,
    marginBottom: 26,
    maxWidth: 330,
  },
  primaryButton: {
    backgroundColor: COLORS.cream,
    alignSelf: 'stretch',
    borderRadius: 999,
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonWide: { paddingHorizontal: 28 },
  primaryButtonText: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  secondaryButton: {
    alignSelf: 'stretch',
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  secondaryButtonText: {
    color: COLORS.mintBright,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(14, 35, 29, 0.98)',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 26,
    paddingTop: 8,
    paddingHorizontal: 6,
    ...SHADOW.floating,
  },
  tabBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 18,
    backgroundColor: COLORS.mint,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    minHeight: 50,
  },
  tabLabel: { color: '#8CA69C', fontSize: 9.5, fontWeight: '700' },
  tabLabelActive: { color: COLORS.inkDeep },
  tabGlyph: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphSun: {
    width: 14,
    height: 7,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderWidth: 1.6,
    borderBottomWidth: 0,
    marginTop: 3,
  },
  glyphHorizon: { width: 16, height: 1.6, borderRadius: 1, marginTop: 2 },
  glyphFrame: {
    width: 15,
    height: 13,
    borderWidth: 1.6,
    borderRadius: 3.5,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2.5,
  },
  glyphFrameDot: { width: 4, height: 4, borderRadius: 1 },
  glyphFrameTick: {
    position: 'absolute',
    top: 2,
    width: 6,
    height: 1.4,
    borderRadius: 1,
  },
  glyphCompass: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphCompassNeedle: { width: 3, height: 6, borderRadius: 1.5 },
  glyphCompassTop: {
    position: 'absolute',
    top: -1,
    width: 3,
    height: 4,
    borderRadius: 1.5,
  },
  glyphDiamond: {
    width: 10,
    height: 10,
    borderRadius: 1.5,
    transform: [{ rotate: '45deg' }],
  },
  glyphDiamondDot: {
    position: 'absolute',
    top: 1,
    width: 2.4,
    height: 2.4,
    borderRadius: 1.2,
  },
  glyphInfoRing: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1.5,
  },
  glyphInfoDot: { width: 2.4, height: 2.4, borderRadius: 1.2 },
  glyphInfoStem: { width: 2, height: 4, borderRadius: 1 },
  viewHeading: { marginBottom: 24 },
  viewKicker: {
    color: COLORS.gold,
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  viewTitle: {
    color: COLORS.cream,
    fontFamily: FONTS.display,
    fontSize: 32,
    letterSpacing: -0.8,
    lineHeight: 39,
    marginTop: 6,
  },
  viewDescription: {
    color: COLORS.muted,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 340,
  },
  calendarCard: {
    backgroundColor: COLORS.inkSoft,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.line,
    overflow: 'hidden',
  },
  calendarCardHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  calendarCardTitle: {
    color: COLORS.cream,
    fontFamily: FONTS.display,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  calendarCardMeta: { color: COLORS.muted, fontSize: 11 },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.line,
  },
  calendarHeaderCell: {
    flex: 1,
    color: COLORS.muted,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  calendarHeaderText: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  calendarList: { backgroundColor: COLORS.inkSoft },
  calendarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.line,
  },
  calendarRowLast: { borderBottomWidth: 0 },
  calendarRowToday: { backgroundColor: 'rgba(143, 217, 190, 0.10)' },
  calendarRowPressed: { backgroundColor: 'rgba(143, 217, 190, 0.16)' },
  calendarDateCell: { flex: 1.2, textAlign: 'left' },
  calendarDateColumn: { flexDirection: 'column', justifyContent: 'center' },
  calendarCell: { flex: 1, alignItems: 'center' },
  calendarCellTime: {
    color: COLORS.cream,
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  calendarCellMeridiem: {
    color: COLORS.muted,
    fontSize: 7.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 1,
  },
  calendarDay: {
    color: COLORS.cream,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 19,
  },
  calendarWeekday: {
    color: COLORS.muted,
    fontSize: 8.5,
    letterSpacing: 0.6,
    marginTop: 1,
  },
  calendarTodayText: { color: COLORS.mintBright },
  calendarDetailSheet: {
    backgroundColor: COLORS.parchment,
    borderTopLeftRadius: 29,
    borderTopRightRadius: 29,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  calendarDetailHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 17,
    paddingBottom: 18,
    gap: 12,
  },
  calendarDetailHeading: { flexShrink: 1 },
  calendarDetailTitle: {
    color: COLORS.ink,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 25,
    marginTop: 4,
  },
  imsakDetailRow: {
    alignItems: 'center',
    backgroundColor: '#E8DEC8',
    borderRadius: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  imsakDetailLabel: {
    color: COLORS.moss,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  imsakDetailTime: { color: COLORS.ink, fontSize: 17, fontWeight: '800' },
  calendarDetailPrayerList: { marginTop: 10 },
  calendarDetailPrayerRow: {
    alignItems: 'center',
    borderBottomColor: '#DED2BA',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
  },
  calendarDetailPrayerNames: { flexShrink: 1 },
  calendarDetailPrayerName: {
    color: COLORS.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  calendarDetailPrayerArabic: {
    color: COLORS.moss,
    fontSize: 12,
    marginTop: 2,
  },
  calendarDetailPrayerTime: {
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  calendarShareButton: {
    alignItems: 'center',
    backgroundColor: COLORS.ink,
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 52,
  },
  calendarShareButtonText: {
    color: COLORS.cream,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  qiblaCard: {
    alignItems: 'center',
    backgroundColor: COLORS.inkSoft,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 24,
    borderRadius: 28,
    overflow: 'hidden',
  },
  qiblaCardAligned: {
    borderColor: 'rgba(203, 243, 224, 0.38)',
    backgroundColor: 'rgba(143, 217, 190, 0.06)',
  },
  compass: {
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 1,
    borderColor: 'rgba(217, 183, 107, 0.35)',
    backgroundColor: COLORS.ink,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  compassAligned: { borderColor: 'rgba(203, 243, 224, 0.55)' },
  compassTickLayer: {
    position: 'absolute',
    width: 250,
    height: 250,
    alignItems: 'center',
    paddingTop: 10,
  },
  compassTick: {
    width: 1.5,
    height: 5,
    borderRadius: 1,
    backgroundColor: 'rgba(250, 245, 233, 0.22)',
  },
  compassTickMajor: {
    height: 9,
    backgroundColor: 'rgba(217, 183, 107, 0.55)',
  },
  compassCardinalNorth: {
    position: 'absolute',
    top: 30,
    left: '50%',
    marginLeft: -5,
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '800',
  },
  compassCardinalEast: {
    position: 'absolute',
    right: 30,
    top: '50%',
    marginTop: -7,
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  compassCardinalSouth: {
    position: 'absolute',
    bottom: 30,
    left: '50%',
    marginLeft: -5,
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  compassCardinalWest: {
    position: 'absolute',
    left: 30,
    top: '50%',
    marginTop: -7,
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  compassPhoneForwardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    backgroundColor: 'rgba(3, 12, 10, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(203, 243, 224, 0.14)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  compassPhoneForward: {
    color: COLORS.mintBright,
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 1,
  },
  qiblaNeedle: {
    width: 22,
    height: 176,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qiblaNeedleTip: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 88,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: COLORS.gold,
  },
  qiblaNeedleTipAligned: { borderBottomColor: COLORS.mintBright },
  qiblaTargetImage: {
    position: 'absolute',
    top: 30,
    left: '50%',
    marginLeft: -23,
    width: 46,
    height: 46,
    borderRadius: 12,
  },
  qiblaNeedleTail: {
    position: 'absolute',
    bottom: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 62,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(250, 245, 233, 0.28)',
  },
  compassCenter: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.cream,
    borderWidth: 4,
    borderColor: COLORS.ink,
  },
  qiblaReadoutRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  qiblaNumber: {
    color: COLORS.cream,
    fontFamily: FONTS.display,
    fontSize: 46,
    lineHeight: 54,
    letterSpacing: -1.5,
  },
  qiblaLabel: {
    color: COLORS.gold,
    fontWeight: '900',
    fontSize: 9.5,
    letterSpacing: 1.1,
    textAlign: 'center',
  },
  qiblaInstruction: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
    marginTop: 12,
  },
  qiblaStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    justifyContent: 'center',
  },
  qiblaLiveStatus: {
    color: COLORS.mint,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.65,
    textAlign: 'center',
    flexShrink: 1,
  },
  qiblaActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  qiblaCameraButton: {
    backgroundColor: COLORS.cream,
    borderRadius: 999,
    paddingHorizontal: 18,
    minHeight: 46,
    justifyContent: 'center',
  },
  qiblaCameraButtonText: {
    color: COLORS.ink,
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  qiblaRefresh: {
    borderWidth: 1,
    borderColor: 'rgba(143, 217, 190, 0.4)',
    borderRadius: 999,
    paddingHorizontal: 18,
    minHeight: 46,
    justifyContent: 'center',
  },
  qiblaRefreshText: {
    color: COLORS.mintBright,
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  qiblaCameraHint: {
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 14,
  },
  occasionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.gold,
    minHeight: 150,
    padding: 20,
    borderRadius: 24,
    marginBottom: 12,
    overflow: 'hidden',
  },
  occasionBody: { flex: 1, paddingRight: 12 },
  occasionLabel: {
    color: 'rgba(8, 18, 15, 0.72)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  occasionTitle: {
    color: COLORS.inkDeep,
    fontFamily: FONTS.display,
    fontSize: 27,
    lineHeight: 33,
    letterSpacing: -0.6,
    marginTop: 8,
  },
  occasionDate: {
    color: 'rgba(8, 18, 15, 0.68)',
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 4,
  },
  occasionMark: {
    color: 'rgba(8, 18, 15, 0.32)',
    fontSize: 64,
    marginLeft: 8,
  },
  nameCard: {
    backgroundColor: COLORS.moss,
    borderRadius: 22,
    padding: 21,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(199, 240, 218, 0.18)',
  },
  nameLabel: {
    color: COLORS.mintBright,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  nameArabic: {
    color: COLORS.cream,
    fontSize: 31,
    lineHeight: 45,
    marginTop: 11,
    textAlign: 'right',
  },
  nameTransliteration: {
    color: COLORS.cream,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 25,
    letterSpacing: -0.4,
    marginTop: 3,
  },
  nameMeaning: { color: COLORS.mintBright, fontSize: 13, marginTop: 4 },
  discoverGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  discoverSmallCard: {
    flex: 1,
    backgroundColor: COLORS.inkSoft,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  smallCardNumber: {
    color: COLORS.cream,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 31,
  },
  smallCardLabel: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 3,
  },
  companionActionsCard: {
    backgroundColor: COLORS.moss,
    borderColor: 'rgba(199, 240, 218, 0.22)',
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 12,
    padding: 20,
  },
  companionActionsTitle: {
    color: COLORS.cream,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 23,
    marginTop: 6,
  },
  companionActionsText: {
    color: COLORS.mintBright,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
  },
  companionActionRow: { flexDirection: 'row', gap: 9, marginTop: 17 },
  companionPrimaryAction: {
    alignItems: 'center',
    backgroundColor: COLORS.cream,
    borderRadius: 13,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 50,
  },
  companionPrimaryActionText: {
    color: COLORS.ink,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  companionSecondaryAction: {
    alignItems: 'center',
    borderColor: 'rgba(255, 248, 232, 0.48)',
    borderRadius: 13,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 50,
  },
  companionSecondaryActionText: {
    color: COLORS.cream,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  companionActionGlyph: { color: COLORS.gold, fontSize: 19, marginLeft: 8 },
  companionSourceText: {
    color: 'rgba(199, 240, 218, 0.68)',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 12,
  },
  resourceCard: {
    backgroundColor: 'rgba(145, 214, 190, 0.08)',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(145, 214, 190, 0.15)',
    padding: 20,
    alignItems: 'flex-start',
  },
  resourceEyebrow: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  resourceTitle: {
    color: COLORS.cream,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 20,
    letterSpacing: -0.25,
    lineHeight: 27,
    marginTop: 6,
  },
  resourceText: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 9,
  },
  settingsSheet: {
    maxHeight: '86%',
    backgroundColor: COLORS.parchment,
    borderTopLeftRadius: 29,
    borderTopRightRadius: 29,
    paddingHorizontal: 20,
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.sand,
    alignSelf: 'center',
    marginTop: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 17,
    paddingBottom: 21,
  },
  sheetKicker: {
    color: COLORS.moss,
    fontSize: 10,
    letterSpacing: 1.1,
    fontWeight: '900',
  },
  sheetTitle: {
    color: COLORS.ink,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 29,
    letterSpacing: -0.6,
    marginTop: 3,
  },
  closeButton: {
    width: 36,
    height: 36,
    backgroundColor: '#E8DEC8',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: COLORS.ink, fontSize: 23, lineHeight: 25 },
  methodPickerBackButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 3,
  },
  methodPickerBackText: {
    color: COLORS.moss,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  methodPickerHeading: { paddingBottom: 14 },
  methodPickerList: { gap: 8, paddingBottom: 38 },
  aboutView: { paddingBottom: 20 },
  aboutHero: {
    backgroundColor: COLORS.moss,
    borderColor: 'rgba(199, 240, 218, 0.18)',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 18,
  },
  aboutHeroTop: { alignItems: 'center', flexDirection: 'row', gap: 13 },
  aboutAppIcon: {
    borderColor: 'rgba(255, 248, 232, 0.34)',
    borderRadius: 14,
    borderWidth: 1,
    height: 54,
    width: 54,
  },
  aboutHeroCopy: { flex: 1 },
  aboutHeroKicker: {
    color: COLORS.mint,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.05,
  },
  aboutHeroTitle: {
    color: COLORS.cream,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 28,
    letterSpacing: -0.5,
    lineHeight: 33,
    marginTop: 2,
  },
  aboutHeroDescription: {
    color: COLORS.parchment,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 16,
  },
  aboutFeatureRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 15,
  },
  aboutFeaturePill: {
    backgroundColor: 'rgba(255, 248, 232, 0.12)',
    borderColor: 'rgba(255, 248, 232, 0.16)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  aboutFeatureText: {
    color: COLORS.mintBright,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.75,
  },
  aboutVersionCard: {
    backgroundColor: COLORS.inkSoft,
    borderColor: COLORS.line,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
    padding: 15,
  },
  aboutVersionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  aboutVersionLabel: {
    color: COLORS.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  aboutInstalledBadge: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  aboutInstalledDot: {
    backgroundColor: COLORS.mint,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  aboutInstalledText: {
    color: COLORS.mint,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.75,
  },
  aboutVersionValue: {
    color: COLORS.cream,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 20,
    marginTop: 7,
  },
  aboutPrivacyCard: {
    backgroundColor: '#E8DEC8',
    borderColor: '#D6C9AD',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
    padding: 15,
  },
  aboutPrivacyKicker: {
    color: COLORS.moss,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  aboutPrivacyTitle: {
    color: COLORS.inkSoft,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 20,
    letterSpacing: -0.25,
    marginTop: 5,
  },
  aboutPrivacyDescription: {
    color: '#65756A',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  aboutPrivacyFacts: { gap: 7, marginTop: 13 },
  aboutPrivacyFact: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  aboutPrivacyCheck: {
    color: COLORS.moss,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 15,
  },
  aboutPrivacyFactText: {
    color: COLORS.inkSoft,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.15,
  },
  aboutSupportCard: {
    backgroundColor: 'rgba(217, 183, 107, 0.09)',
    borderColor: 'rgba(217, 183, 107, 0.32)',
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 16,
    padding: 18,
  },
  aboutSupportHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  aboutSupportMark: {
    alignItems: 'center',
    backgroundColor: COLORS.gold,
    borderRadius: 19,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  aboutSupportMarkText: {
    color: COLORS.inkDeep,
    fontSize: 18,
    lineHeight: 21,
  },
  aboutSupportCopy: { flex: 1 },
  aboutSupportKicker: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  aboutSupportTitle: {
    color: COLORS.cream,
    fontFamily: FONTS.display,
    fontSize: 20,
    letterSpacing: -0.3,
    marginTop: 3,
  },
  aboutSupportDescription: {
    color: COLORS.mintBright,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 12,
  },
  aboutSupportButton: {
    alignItems: 'center',
    backgroundColor: COLORS.cream,
    borderRadius: 999,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    minHeight: 58,
    paddingHorizontal: 20,
  },
  aboutSupportButtonCopy: { flex: 1 },
  aboutSupportButtonText: {
    color: COLORS.inkDeep,
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  aboutSupportButtonDetail: {
    color: COLORS.moss,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 2,
  },
  aboutSupportButtonArrow: {
    color: COLORS.inkDeep,
    fontSize: 22,
    fontWeight: '900',
  },
  aboutSectionLabel: {
    color: COLORS.mint,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.15,
    marginBottom: 9,
    marginTop: 20,
  },
  aboutLink: {
    alignItems: 'center',
    backgroundColor: COLORS.cream,
    borderColor: '#D6C9AD',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 8,
    minHeight: 64,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  aboutLinkText: { flex: 1, paddingRight: 12 },
  aboutLinkTitle: { color: COLORS.inkSoft, fontSize: 14, fontWeight: '800' },
  aboutLinkDescription: {
    color: '#65756A',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  aboutLinkChevron: { color: COLORS.moss, fontSize: 21, fontWeight: '700' },
  methodPickerOption: {
    alignItems: 'center',
    backgroundColor: COLORS.cream,
    borderColor: '#D6C9AD',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 15,
  },
  methodPickerOptionSelected: {
    backgroundColor: COLORS.ink,
    borderColor: COLORS.ink,
  },
  methodPickerOptionText: {
    color: COLORS.inkSoft,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    paddingRight: 12,
  },
  methodPickerOptionTextSelected: { color: COLORS.cream },
  methodPickerCheck: { color: COLORS.gold, fontSize: 19, fontWeight: '900' },
  methodPickerCheckHidden: { opacity: 0 },
  sheetScrollContent: { paddingBottom: 38 },
  settingsLabel: {
    color: COLORS.inkSoft,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.15,
    marginTop: 12,
    marginBottom: 9,
  },
  methodScroller: { gap: 8, paddingRight: 20 },
  methodPickerTrigger: {
    alignItems: 'center',
    backgroundColor: COLORS.cream,
    borderColor: '#D6C9AD',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 15,
  },
  methodPickerTriggerText: { flex: 1, paddingRight: 12 },
  methodPickerTriggerLabel: {
    color: COLORS.moss,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  methodPickerTriggerValue: {
    color: COLORS.inkSoft,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 3,
  },
  methodPickerChevron: { color: COLORS.moss, fontSize: 28, lineHeight: 30 },
  newProfileChip: {
    alignItems: 'center',
    borderColor: COLORS.moss,
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  newProfileChipText: { color: COLORS.moss, fontSize: 11, fontWeight: '900' },
  methodChip: {
    borderColor: '#D6C9AD',
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 12,
    maxWidth: 200,
  },
  methodChipSelected: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  methodChipText: { color: COLORS.inkSoft, fontSize: 12, fontWeight: '700' },
  methodChipTextSelected: { color: COLORS.cream },
  settingsHint: {
    color: '#65756A',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  settingsInlineMessage: {
    backgroundColor: 'rgba(162, 59, 40, 0.10)',
    borderColor: 'rgba(162, 59, 40, 0.32)',
    borderRadius: 10,
    borderWidth: 1,
    color: '#8D321F',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
    padding: 10,
  },

  profileTextInput: {
    backgroundColor: COLORS.cream,
    borderColor: '#D6C9AD',
    borderRadius: 12,
    borderWidth: 1,
    color: COLORS.ink,
    fontSize: 14,
    marginTop: 8,
    minHeight: 46,
    paddingHorizontal: 13,
  },
  profileOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 8,
  },
  profileOption: {
    alignItems: 'center',
    borderColor: '#D6C9AD',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 10,
  },
  profileOptionSelected: {
    backgroundColor: COLORS.ink,
    borderColor: COLORS.ink,
  },
  profileOptionText: { color: COLORS.inkSoft, fontSize: 11, fontWeight: '800' },
  profileOptionTextSelected: { color: COLORS.cream },
  dawudAnchorCard: {
    backgroundColor: '#E8DEC8',
    borderColor: '#D6C9AD',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    padding: 13,
  },
  dawudAnchorTitle: {
    color: COLORS.inkSoft,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  dawudAnchorHint: {
    color: '#65756A',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
  dawudAnchorRow: { flexDirection: 'row', gap: 8, marginTop: 11 },
  dawudAnchorField: { flex: 1 },
  dawudAnchorFieldYear: { flex: 1.35 },
  dawudAnchorLabel: {
    color: COLORS.moss,
    fontSize: 9,
    fontWeight: '900',
    marginBottom: 4,
  },
  dawudAnchorInput: {
    backgroundColor: COLORS.cream,
    borderColor: '#D6C9AD',
    borderRadius: 9,
    borderWidth: 1,
    color: COLORS.ink,
    fontSize: 14,
    minHeight: 42,
    paddingHorizontal: 9,
    textAlign: 'center',
  },
  dawudAnchorSaveButton: {
    alignItems: 'center',
    backgroundColor: COLORS.ink,
    borderRadius: 10,
    marginTop: 12,
    minHeight: 42,
    justifyContent: 'center',
  },
  dawudAnchorSaveText: {
    color: COLORS.cream,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  dawudAnchorError: {
    color: '#A23B28',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  adjustmentRow: { flexDirection: 'row', gap: 6, marginTop: 9 },
  adjustmentField: { flex: 1 },
  adjustmentLabel: {
    color: COLORS.moss,
    fontSize: 9,
    fontWeight: '900',
    marginBottom: 4,
    textAlign: 'center',
  },
  adjustmentInput: {
    backgroundColor: COLORS.cream,
    borderColor: '#D6C9AD',
    borderRadius: 9,
    borderWidth: 1,
    color: COLORS.ink,
    fontSize: 13,
    minHeight: 40,
    paddingHorizontal: 6,
    textAlign: 'center',
  },
  healthCard: {
    backgroundColor: '#E8DEC8',
    borderColor: '#D6C9AD',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 3,
    padding: 13,
  },
  healthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  healthLabel: { color: COLORS.inkSoft, fontSize: 12, fontWeight: '700' },
  healthValue: {
    color: COLORS.moss,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
  },
  nativeReminderUnavailable: {
    color: '#9A3F2B',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 8,
  },
  healthHint: { color: '#65756A', fontSize: 10, lineHeight: 14, marginTop: 8 },
  healthActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 11,
  },
  healthButton: {
    borderColor: COLORS.moss,
    borderRadius: 9,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  healthButtonText: {
    color: COLORS.moss,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.55,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#E8DEC8',
    borderRadius: 13,
    padding: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  segmentSelected: {
    backgroundColor: COLORS.cream,
    shadowColor: '#1B2822',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  },
  segmentText: { color: '#65756A', fontSize: 13, fontWeight: '700' },
  segmentTextSelected: { color: COLORS.ink },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 25,
    paddingTop: 18,
    borderTopWidth: 1,
    borderColor: '#DED2BA',
  },
  toggleTextBlock: { flex: 1, paddingRight: 18 },
  toggleTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '800' },
  toggleDescription: {
    color: '#65756A',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  adhanVolumeLabel: {
    color: COLORS.inkSoft,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 15,
  },
  adhanVolumeSelector: {
    backgroundColor: '#E8DEC8',
    borderRadius: 12,
    flexDirection: 'row',
    marginTop: 7,
    padding: 3,
  },
  adhanVolumeButton: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    paddingVertical: 9,
  },
  adhanVolumeButtonSelected: {
    backgroundColor: COLORS.ink,
  },
  adhanVolumeButtonText: {
    color: '#65756A',
    fontSize: 11,
    fontWeight: '800',
  },
  adhanVolumeButtonTextSelected: {
    color: COLORS.cream,
  },
  adhanVolumeHint: {
    color: '#65756A',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 7,
  },
  adhanPreviewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    marginTop: 10,
  },
  adhanPreviewButton: {
    alignItems: 'center',
    backgroundColor: COLORS.inkSoft,
    borderColor: COLORS.moss,
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 13,
  },
  adhanPreviewText: {
    color: COLORS.mintBright,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  adhanLicenseText: { color: '#65756A', flex: 1, fontSize: 10, lineHeight: 14 },
  adhanPreviewError: {
    color: '#B6543D',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  prayerToggleGroup: {
    marginTop: 11,
    backgroundColor: '#EDE3CF',
    paddingHorizontal: 13,
    borderRadius: 14,
  },
  prayerToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#D6C9AD',
  },
  prayerToggleLabel: { color: COLORS.inkSoft, fontSize: 13, fontWeight: '700' },
  coordinateRow: { flexDirection: 'row', gap: 10 },
  coordinateField: { flex: 1 },
  coordinateLabel: {
    color: '#65756A',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
    marginBottom: 5,
  },
  coordinateInput: {
    backgroundColor: COLORS.cream,
    borderWidth: 1,
    borderColor: '#D6C9AD',
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 11,
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  saveLocationButton: {
    minHeight: 52,
    backgroundColor: COLORS.ink,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 17,
  },
  saveLocationButtonDisabled: { opacity: 0.5 },
  saveLocationText: {
    color: COLORS.cream,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  deleteDataButton: {
    minHeight: 50,
    borderColor: 'rgba(239, 150, 124, 0.62)',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  deleteDataButtonText: {
    color: COLORS.coral,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
});

export default App;
