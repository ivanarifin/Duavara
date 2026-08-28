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
  Modal,
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
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
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
  isSignedDecimalInput,
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
import kaabaAsset from '@/assets/kaaba-cc0.png';
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
  DEFAULT_PRAYER_SETTINGS,
  deleteAllLocalData,
  getCachedSchedule,
  getCachedSchedules,
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

type Tab = 'today' | 'calendar' | 'qibla' | 'discover';
type DiscoverData = {
  nextHoliday: unknown;
  months: unknown;
  specialDays: unknown;
  names: unknown;
};

const COLORS = {
  ink: '#08201E',
  inkSoft: '#10332F',
  inkDeep: '#051816',
  moss: '#1F5147',
  mint: '#91D6BE',
  mintBright: '#C7F0DA',
  cream: '#FFF8E8',
  parchment: '#F6EEDC',
  sand: '#D6C9AD',
  muted: '#A9B9AC',
  line: 'rgba(255, 248, 232, 0.14)',
  gold: '#EACB7D',
  coral: '#EF967C',
  white: '#FFFFFF',
};

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

const TAB_ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: '⌂' },
  { id: 'calendar', label: 'Calendar', icon: '▦' },
  { id: 'qibla', label: 'Qibla', icon: '⌁' },
  { id: 'discover', label: 'Discover', icon: '✦' },
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
    custom: 'Saved place',
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
  const finishSplash = useCallback(() => setHasFinishedSplash(true), []);
  const resetAppSession = useCallback(
    () => setAppSession(current => current + 1),
    [],
  );

  return (
    <RootErrorBoundary>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        {hasFinishedSplash ? (
          <Duavara key={appSession} onLocalDataDeleted={resetAppSession} />
        ) : (
          <SplashScreen onFinish={finishSplash} />
        )}
      </SafeAreaProvider>
    </RootErrorBoundary>
  );
}

function Duavara({ onLocalDataDeleted }: { onLocalDataDeleted: () => void }) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('today');
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
  const cacheCommitRef = useRef<Promise<void>>(Promise.resolve());
  const widgetCommitRef = useRef<Promise<void>>(Promise.resolve());
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
    setToday(null);
    setUpcomingSchedules([]);
    setMonthSchedules([]);
    setHijriDate(null);
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
    async (nextSettings: PrayerSettings, refresh = false) => {
      const requestToken = refresh ? beginRequest() : requestTokenRef.current;
      try {
        await savePrayerSettings(nextSettings);
        if (!isCurrentRequest(requestToken)) return;
        settingsRef.current = nextSettings;
        setSettings(nextSettings);
        if (refresh) {
          clearPrayerSchedules();
          invalidateQibla();
        }
        if (refresh && activeProfile) {
          setIsRefreshing(true);
          try {
            await refreshForCoordinates(
              activeProfile,
              nextSettings,
              requestToken,
            );
          } finally {
            if (isCurrentRequest(requestToken)) setIsRefreshing(false);
          }
        }
      } catch (error) {
        if (isCurrentRequest(requestToken)) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Unable to apply preferences.',
          );
        }
      }
    },
    [
      activeProfile,
      beginRequest,
      clearPrayerSchedules,
      invalidateQibla,
      isCurrentRequest,
      refreshForCoordinates,
    ],
  );

  const commitNotificationSettings = useCallback(
    async (nextSettings: PrayerSettings, requestToken: number) => {
      return enqueueNotificationOperation(async () => {
        if (!isCurrentRequest(requestToken)) return;
        const previousSettings = settingsRef.current;
        try {
          await scheduleNotificationsNow(upcomingSchedules, nextSettings);
          if (!isCurrentRequest(requestToken)) {
            await scheduleNotificationsNow(
              upcomingSchedules,
              previousSettings,
            ).catch(() => undefined);
            return;
          }
          try {
            await savePrayerSettings(nextSettings);
          } catch (error) {
            await scheduleNotificationsNow(
              upcomingSchedules,
              previousSettings,
            ).catch(() => undefined);
            await savePrayerSettings(previousSettings).catch(() => undefined);
            throw error;
          }
          if (!isCurrentRequest(requestToken)) {
            await scheduleNotificationsNow(
              upcomingSchedules,
              previousSettings,
            ).catch(() => undefined);
            return;
          }
          settingsRef.current = nextSettings;
          setSettings(nextSettings);
        } catch (error) {
          throw error;
        }
      });
    },
    [
      enqueueNotificationOperation,
      isCurrentRequest,
      scheduleNotificationsNow,
      upcomingSchedules,
    ],
  );

  const applyNotificationSettings = useCallback(
    async (nextSettings: PrayerSettings, fallbackMessage: string) => {
      const requestToken = requestTokenRef.current;
      try {
        await commitNotificationSettings(nextSettings, requestToken);
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
      const nextSettings = {
        ...settingsRef.current,
        enabledPrayers: {
          ...settingsRef.current.enabledPrayers,
          [prayer]: enabled,
        },
      };
      await applyNotificationSettings(nextSettings, 'Reminder update failed.');
    },
    [applyNotificationSettings],
  );

  const toggleNotifications = useCallback(
    async (enabled: boolean) => {
      const requestToken = requestTokenRef.current;
      const nextSettings = {
        ...settingsRef.current,
        notificationsEnabled: enabled,
      };
      try {
        await commitNotificationSettings(nextSettings, requestToken);
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
      const currentSettings = settingsRef.current;
      const nextSettings: PrayerSettings = {
        ...currentSettings,
        fastingRoutine,
        dawudAnchorDate:
          fastingRoutine === 'dawud' && !currentSettings.dawudAnchorDate
            ? formatLocalDateKey(new Date())
            : currentSettings.dawudAnchorDate,
      };
      await applyNotificationSettings(
        nextSettings,
        'Unable to update fasting routine.',
      );
    },
    [applyNotificationSettings],
  );

  const toggleFastingAlarms = useCallback(
    async (enabled: boolean) => {
      const requestToken = requestTokenRef.current;
      if (enabled && settingsRef.current.fastingRoutine === 'off') {
        setMessage('Choose a fasting routine before enabling fasting alarms.');
        return;
      }
      const nextSettings = {
        ...settingsRef.current,
        fastingAlarmsEnabled: enabled,
      };
      try {
        await commitNotificationSettings(nextSettings, requestToken);
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
    onOpenSettings: openSettings,
    onRefresh: refreshActive,
  });

  return (
    <View style={styles.app}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: 118 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              refreshActive().catch(() => undefined);
            }}
            tintColor={COLORS.mintBright}
          />
        }
      >
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
        {message ? (
          <Pressable
            style={styles.messageBanner}
            onPress={() => setMessage(null)}
          >
            <Text style={styles.messageText}>{message}</Text>
            <Text style={styles.messageDismiss}>×</Text>
          </Pressable>
        ) : null}
        {content}
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
        onClose={() => setIsSettingsOpen(false)}
        onMethod={method => {
          updateSettings({ ...settings, method }, true).catch(error =>
            setMessage(
              error instanceof Error
                ? error.message
                : 'Unable to update calculation method.',
            ),
          );
        }}
        onSchool={school => {
          updateSettings({ ...settings, school }, true).catch(error =>
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
            { ...settingsRef.current, adhanEnabled: enabled },
            'Unable to update Adhan settings.',
          ).catch(() => undefined);
        }}
        onAdhanVolumeCategory={adhanVolumeCategory => {
          applyNotificationSettings(
            { ...settingsRef.current, adhanVolumeCategory },
            'Unable to update Adhan volume.',
          ).catch(() => undefined);
        }}
        onPreviewAdhan={() => playAdhanPreview(settings.adhanVolumeCategory)}
        onStopAdhanPreview={stopAdhanPreview}
        onFastingRoutine={routine => {
          setFastingRoutine(routine).catch(() => undefined);
        }}
        onFastingAlarms={enabled => {
          toggleFastingAlarms(enabled).catch(() => undefined);
        }}
        onSuhoorReminder={enabled => {
          applyNotificationSettings(
            { ...settingsRef.current, suhoorReminderEnabled: enabled },
            'Unable to update Suhoor reminder.',
          ).catch(() => undefined);
        }}
        onImsakAlarm={enabled => {
          applyNotificationSettings(
            { ...settingsRef.current, imsakAlarmEnabled: enabled },
            'Unable to update Imsak alarm.',
          ).catch(() => undefined);
        }}
        onUse24HourTime={enabled => {
          applyNotificationSettings(
            { ...settingsRef.current, use24HourTime: enabled },
            'Unable to update time format.',
          ).catch(() => undefined);
        }}
        onSelectProfile={profileId => {
          selectLocationProfile(profileId).catch(() => undefined);
        }}
        onNewProfile={() => {
          setEditingProfileId(null);
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
  onOpenSettings: () => void;
  onRefresh: () => void;
}) {
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
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.wordmark}>Duavara</Text>
        <Pressable
          style={styles.locationPill}
          onPress={onLocation}
          accessibilityRole="button"
          accessibilityLabel="Refresh your location"
        >
          <Text style={styles.locationDot}>●</Text>
          <Text style={styles.locationText} numberOfLines={1}>
            {formatLocationLabel(regionName, activeProfileName, coordinates)}
          </Text>
        </Pressable>
      </View>
      <Pressable
        style={styles.settingsButton}
        onPress={onSettings}
        accessibilityRole="button"
        accessibilityLabel="Open prayer preferences"
      >
        <Text style={styles.settingsGlyph}>☷</Text>
      </Pressable>
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

  return (
    <>
      <View style={styles.dateBlock}>
        <Text style={styles.dateEyebrow}>
          {hijriDate ?? 'Prayer times for today'}
        </Text>
        <Text style={styles.dateTitle}>{formatLongDate(clock)}</Text>
      </View>

      <View style={styles.nextCard}>
        <View style={styles.moon}>
          <View style={styles.moonCutout} />
          <View style={styles.starOne} />
          <View style={styles.starTwo} />
        </View>
        <Text style={styles.nextEyebrow}>
          {nextPrayer ? 'NEXT PRAYER' : 'DAY COMPLETE'}
        </Text>
        <Text style={styles.nextName}>{nextPrayer?.name ?? 'Rest well'}</Text>
        <Text style={styles.nextArabic}>
          {nextPrayer ? ARABIC_PRAYER_NAMES[nextPrayer.name] : 'ليلة طيبة'}
        </Text>
        <View style={styles.nextTimeRow}>
          <Text style={styles.nextTime}>
            {nextPrayer
              ? formatPrayerTime(nextPrayer.time, use24HourTime)
              : '—'}
          </Text>
          <View style={styles.countdownPill}>
            <Text style={styles.countdownLabel}>IN</Text>
            <Text style={styles.countdownValue}>{countdown}</Text>
          </View>
        </View>
        <Text style={styles.nextHint}>
          {currentPrayer
            ? `${currentPrayer.name} is in progress`
            : 'A quiet moment before Fajr'}
        </Text>
      </View>

      <RamadanDashboard
        schedule={today}
        hijriDate={hijriDate}
        now={clock}
        use24HourTime={use24HourTime}
      />

      {fastingRoutine !== 'off' ? (
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
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Today’s rhythm</Text>
        <Text style={styles.sectionMeta}>{today.timezone ?? 'Local time'}</Text>
      </View>
      <View style={styles.prayerList}>
        {today.prayers.map(prayer => {
          const isNext =
            prayer.name === nextPrayer?.name &&
            prayer.date.getDate() === nextPrayer?.date.getDate();
          const isCurrent = prayer.name === currentPrayer?.name;
          return (
            <View
              key={prayer.name}
              style={[styles.prayerRow, isNext && styles.prayerRowNext]}
              accessible
              accessibilityLabel={`${prayer.name}, ${formatPrayerTime(
                prayer.time,
                use24HourTime,
              )}${isNext ? ', next prayer' : ''}`}
            >
              <View
                style={[styles.prayerIcon, isNext && styles.prayerIconNext]}
              >
                <Text
                  style={[
                    styles.prayerIconText,
                    isNext && styles.prayerIconTextNext,
                  ]}
                >
                  {PRAYER_ICONS[prayer.name]}
                </Text>
              </View>
              <View style={styles.prayerNameBlock}>
                <View style={styles.prayerNameRow}>
                  <Text
                    style={[styles.prayerName, isNext && styles.prayerNameNext]}
                  >
                    {prayer.name}
                  </Text>
                  {isCurrent ? <Text style={styles.nowBadge}>NOW</Text> : null}
                  {isNext ? <Text style={styles.nextBadge}>NEXT</Text> : null}
                </View>
                <Text style={styles.prayerArabic}>
                  {ARABIC_PRAYER_NAMES[prayer.name]}
                </Text>
              </View>
              <Text
                style={[styles.prayerTime, isNext && styles.prayerTimeNext]}
              >
                {formatPrayerTime(prayer.time, use24HourTime)}
              </Text>
            </View>
          );
        })}
      </View>

      <Pressable
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
      </Pressable>

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
      <View style={styles.calendarHeader}>
        <Text style={[styles.calendarCellDate, styles.calendarHeaderText]}>
          DAY
        </Text>
        <Text style={[styles.calendarCellTime, styles.calendarHeaderText]}>
          FAJR
        </Text>
        <Text style={[styles.calendarCellTime, styles.calendarHeaderText]}>
          DHUHR
        </Text>
        <Text style={[styles.calendarCellTime, styles.calendarHeaderText]}>
          MAGHRIB
        </Text>
      </View>
      <View style={styles.calendarList}>
        {schedules.map(schedule => {
          const scheduleDate = localDateFromSchedule(schedule.date);
          const isToday = schedule.date === nowKey;
          return (
            <Pressable
              key={schedule.date}
              style={({ pressed }) => [
                styles.calendarRow,
                isToday && styles.calendarRowToday,
                pressed && styles.calendarRowPressed,
              ]}
              onPress={() => setSelectedSchedule(schedule)}
              accessibilityRole="button"
              accessibilityLabel={`View all prayer times for ${schedule.date}`}
            >
              <View style={styles.calendarCellDate}>
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
              <Text
                style={[
                  styles.calendarCellTime,
                  isToday && styles.calendarTodayText,
                ]}
              >
                {formatPrayerTime(schedule.timings.Fajr, use24HourTime)}
              </Text>
              <Text
                style={[
                  styles.calendarCellTime,
                  isToday && styles.calendarTodayText,
                ]}
              >
                {formatPrayerTime(schedule.timings.Dhuhr, use24HourTime)}
              </Text>
              <Text
                style={[
                  styles.calendarCellTime,
                  isToday && styles.calendarTodayText,
                ]}
              >
                {formatPrayerTime(schedule.timings.Maghrib, use24HourTime)}
              </Text>
            </Pressable>
          );
        })}
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
  if (!schedule) return null;
  const date = localDateFromSchedule(schedule.date);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalDismissArea} onPress={onClose} />
        <View style={styles.calendarDetailSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.calendarDetailHeader}>
            <View>
              <Text style={styles.sheetKicker}>DAILY TIMETABLE</Text>
              <Text style={styles.calendarDetailTitle}>
                {date.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close calendar prayer details"
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <View style={styles.imsakDetailRow}>
            <Text style={styles.imsakDetailLabel}>IMSAK</Text>
            <Text style={styles.imsakDetailTime}>
              {formatPrayerTime(schedule.imsak.time, use24HourTime)}
            </Text>
          </View>
          <View style={styles.calendarDetailPrayerList}>
            {schedule.prayers.map(prayer => (
              <View style={styles.calendarDetailPrayerRow} key={prayer.name}>
                <View>
                  <Text style={styles.calendarDetailPrayerName}>
                    {prayer.name}
                  </Text>
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
          <Pressable
            style={styles.calendarShareButton}
            onPress={() => {
              Share.share({
                message: formatPrayerScheduleForSharing(
                  schedule,
                  use24HourTime,
                ),
              }).catch(() => undefined);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.calendarShareButtonText}>SHARE THIS DAY</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
      ? qibla?.direction ?? 0
      : Math.round(Math.abs(relativeAngle));

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
        <View style={styles.qiblaCard}>
          <View style={styles.qiblaLandmark}>
            <Image source={kaabaAsset} style={styles.qiblaLandmarkImage} />
            <View>
              <Text style={styles.qiblaLandmarkKicker}>TOWARD THE KAABA</Text>
              <Text style={styles.qiblaLandmarkText}>
                Follow the bearing below
              </Text>
            </View>
          </View>
          <View style={styles.compass}>
            {relativeAngle === null ? (
              <>
                <Text style={styles.compassCardinalNorth}>N</Text>
                <Text style={styles.compassCardinalSouth}>S</Text>
                <Text style={styles.compassCardinalWest}>W</Text>
                <Text style={styles.compassCardinalEast}>E</Text>
              </>
            ) : (
              <Text style={styles.compassPhoneForward}>PHONE FORWARD</Text>
            )}
            <View
              style={[
                styles.qiblaNeedle,
                {
                  transform: [
                    { rotate: `${relativeAngle ?? qibla.direction}deg` },
                  ],
                },
              ]}
            >
              <View style={styles.qiblaNeedleTip} />
              <View style={styles.qiblaNeedleTail} />
            </View>
            <View style={styles.compassCenter} />
          </View>
          <Text style={styles.qiblaNumber}>{displayedAngle}°</Text>
          <Text style={styles.qiblaLabel}>
            {relativeAngle === null
              ? 'QIBLA DIRECTION · TRUE-NORTH REFERENCE'
              : isAligned
              ? 'QIBLA ALIGNED'
              : `TURN ${turnDirection}`}
          </Text>
          <View style={styles.qiblaRule} />
          <Text style={styles.qiblaInstruction}>
            {relativeAngle === null
              ? `Face ${Math.round(
                  qibla.direction,
                )}° on a true-north compass to face the Qibla (the Kaaba).`
              : isAligned
              ? 'The top of your phone is pointing toward the Qibla.'
              : `Turn your phone ${turnDirection.toLowerCase()} until the arrow points straight ahead.`}
          </Text>
          <Text style={styles.qiblaLiveStatus}>
            {relativeAngle === null
              ? compassError
                ? 'Compass unavailable — use the Qibla bearing above.'
                : 'Calibrating Qibla compass…'
              : `LIVE QIBLA COMPASS · TRUE-NORTH HEADING ${Math.round(
                  heading?.heading ?? 0,
                )}°`}
          </Text>
          <View style={styles.qiblaActions}>
            <Pressable
              style={styles.qiblaCameraButton}
              onPress={() => setIsCameraFinderOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Open optional camera Qibla finder"
            >
              <Text style={styles.qiblaCameraButtonText}>USE CAMERA VIEW</Text>
            </Pressable>
            <Pressable
              style={styles.qiblaRefresh}
              onPress={onRefresh}
              accessibilityRole="button"
            >
              <Text style={styles.qiblaRefreshText}>REFRESH DIRECTION</Text>
            </Pressable>
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
          {isLoading ? <ActivityIndicator color={COLORS.mintBright} /> : null}
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
}: {
  discover: DiscoverData | null;
  isLoading: boolean;
  coordinates: Coordinates | null;
}) {
  const [isQuranReaderOpen, setIsQuranReaderOpen] = useState(false);
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
        <View style={styles.occasionCard}>
          <Text style={styles.occasionLabel}>NEXT HIJRI OCCASION</Text>
          <Text style={styles.occasionTitle}>
            {stringValue(holidayHijri?.day) ?? 'Upcoming date'}{' '}
            {stringValue(holidayMonth?.en) ?? ''}
          </Text>
          <Text style={styles.occasionDate}>
            {stringValue(holidayHijri?.year) ?? 'Hijri calendar'}
          </Text>
          <Text style={styles.occasionMark}>☾</Text>
        </View>
      ) : null}
      {nameOfTheDay ? (
        <View style={styles.nameCard}>
          <Text style={styles.nameLabel}>A NAME TO REFLECT ON</Text>
          <Text style={styles.nameArabic}>
            {stringValue(nameOfTheDay.name) ?? 'ٱللَّٰه'}
          </Text>
          <Text style={styles.nameTransliteration}>
            {stringValue(nameOfTheDay.transliteration) ?? 'Allah'}
          </Text>
          <Text style={styles.nameMeaning}>
            {stringValue(
              (nameOfTheDay.en as Record<string, unknown> | undefined)?.meaning,
            ) ?? 'The Most Beautiful Names'}
          </Text>
        </View>
      ) : null}
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

      <View style={styles.companionActionsCard}>
        <Text style={styles.resourceEyebrow}>PRACTICAL COMPANION</Text>
        <Text style={styles.companionActionsTitle}>
          Read, then find your way.
        </Text>
        <Text style={styles.companionActionsText}>
          Quran text, translations, recitation and nearby mosque data are loaded
          only when you choose to use them.
        </Text>
        <View style={styles.companionActionRow}>
          <Pressable
            style={styles.companionPrimaryAction}
            onPress={() => setIsQuranReaderOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open Quran reader"
          >
            <Text style={styles.companionPrimaryActionText}>OPEN QURAN</Text>
            <Text style={styles.companionActionGlyph}>۞</Text>
          </Pressable>
          <Pressable
            style={styles.companionSecondaryAction}
            onPress={() => setIsZakatCalculatorOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open local Zakat calculator"
          >
            <Text style={styles.companionSecondaryActionText}>ZAKAT</Text>
            <Text style={styles.companionActionGlyph}>٪</Text>
          </Pressable>
        </View>
        <Text style={styles.companionSourceText}>
          Arabic Quran text: AlQuran.cloud / Islamic Network (Uthmani edition).
        </Text>
      </View>

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
      <QuranReader
        visible={isQuranReaderOpen}
        onClose={() => setIsQuranReaderOpen(false)}
      />
      <ZakatCalculator
        visible={isZakatCalculatorOpen}
        onClose={() => setIsZakatCalculatorOpen(false)}
      />
    </>
  );
}

function LoadingState({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.loadingState, compact && styles.loadingStateCompact]}>
      <ActivityIndicator color={COLORS.mintBright} size="large" />
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
      <View style={styles.emptyMoon}>
        <View style={styles.emptyMoonCutout} />
      </View>
      <Text style={styles.emptyKicker}>WELCOME TO DUAVARA</Text>
      <Text style={styles.emptyTitle}>Prayer time, made personal.</Text>
      <Text style={styles.emptyText}>
        Allow your location to calculate accurate local times. Prefer privacy?
        Enter coordinates manually instead.
      </Text>
      <Pressable
        style={styles.primaryButton}
        onPress={onUseLocation}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>USE MY LOCATION</Text>
      </Pressable>
      <Pressable
        style={styles.secondaryButton}
        onPress={onSettings}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryButtonText}>ENTER COORDINATES</Text>
      </Pressable>
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
  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insetBottom, 12) }]}>
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
            <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>
              {tab.icon}
            </Text>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
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
  onClose: () => void;
  onMethod: (method: number) => void;
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
  const selectedMethod = methods.find(method => method.id === settings.method);
  const [isAdhanPreviewPlaying, setIsAdhanPreviewPlaying] = useState(false);
  const [adhanPreviewError, setAdhanPreviewError] = useState<string | null>(
    null,
  );

  const closeSettings = () => {
    onStopAdhanPreview()
      .catch(() => undefined)
      .finally(() => onClose());
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
    <Modal
      visible={isVisible}
      transparent
      animationType="slide"
      onRequestClose={closeSettings}
    >
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalDismissArea} onPress={closeSettings} />
        <View style={styles.settingsSheet}>
          <View style={styles.sheetHandle} />
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.methodScroller}
            >
              {(methods.length
                ? methods
                : [{ id: settings.method, name: `Method ${settings.method}` }]
              ).map(method => {
                const isSelected = method.id === settings.method;
                return (
                  <Pressable
                    key={method.id}
                    style={[
                      styles.methodChip,
                      isSelected && styles.methodChipSelected,
                    ]}
                    onPress={() => onMethod(method.id)}
                  >
                    <Text
                      style={[
                        styles.methodChipText,
                        isSelected && styles.methodChipTextSelected,
                      ]}
                    >
                      {method.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.settingsHint}>
              {selectedMethod?.name ??
                'Select a method used by your local community.'}
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
                ? 'Dawud alternates daily. Today is your fasting anchor day.'
                : settings.fastingRoutine === 'off'
                ? 'Choose Mon & Thu or Dawud above to enable fasting alarms.'
                : 'Schedules Suhoor and Imsak for your chosen fasting days.'}
            </Text>

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
                        trackColor={{ false: COLORS.sand, true: COLORS.moss }}
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
                {isBusy ? 'UPDATING…' : 'SAVE PLACE & UPDATE TIMES'}
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
        </View>
      </View>
    </Modal>
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
  scrollContent: { paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 26,
  },
  wordmark: {
    color: COLORS.cream,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 30,
    letterSpacing: -0.8,
    lineHeight: 36,
  },
  locationPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
    maxWidth: 230,
  },
  locationDot: { color: COLORS.mint, fontSize: 10 },
  locationText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  settingsButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.inkSoft,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  settingsGlyph: {
    color: COLORS.cream,
    fontSize: 20,
    transform: [{ rotate: '90deg' }],
  },
  messageBanner: {
    backgroundColor: 'rgba(234, 203, 125, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(234, 203, 125, 0.35)',
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  messageText: {
    color: COLORS.parchment,
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  messageDismiss: { color: COLORS.gold, fontSize: 20, lineHeight: 18 },
  dateBlock: { marginBottom: 16 },
  dateEyebrow: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.25,
    textTransform: 'uppercase',
  },
  dateTitle: {
    color: COLORS.cream,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 27,
    lineHeight: 34,
    letterSpacing: -0.45,
    marginTop: 4,
  },
  nextCard: {
    backgroundColor: COLORS.moss,
    borderRadius: 30,
    padding: 25,
    minHeight: 258,
    overflow: 'hidden',
    marginBottom: 29,
    borderWidth: 1,
    borderColor: 'rgba(199, 240, 218, 0.18)',
  },
  moon: {
    position: 'absolute',
    top: -48,
    right: -31,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: COLORS.gold,
    opacity: 0.95,
  },
  moonCutout: {
    position: 'absolute',
    width: 158,
    height: 158,
    borderRadius: 79,
    backgroundColor: COLORS.moss,
    top: -12,
    left: -49,
  },
  starOne: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.cream,
    top: 60,
    left: 24,
  },
  starTwo: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.cream,
    top: 83,
    left: 41,
  },
  nextEyebrow: {
    color: COLORS.mintBright,
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: '800',
  },
  nextName: {
    color: COLORS.cream,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 48,
    letterSpacing: -1.2,
    lineHeight: 56,
    marginTop: 9,
  },
  nextArabic: {
    color: COLORS.mintBright,
    fontSize: 19,
    lineHeight: 25,
    textAlign: 'left',
  },
  nextTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 25,
  },
  nextTime: {
    color: COLORS.cream,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  countdownPill: {
    backgroundColor: 'rgba(5, 24, 22, 0.32)',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
    alignItems: 'flex-end',
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
    fontSize: 16,
    fontWeight: '700',
    marginTop: 1,
  },
  nextHint: { color: 'rgba(255, 248, 232, 0.70)', fontSize: 12, marginTop: 16 },
  fastingStatusCard: {
    backgroundColor: 'rgba(234, 203, 125, 0.09)',
    borderColor: 'rgba(234, 203, 125, 0.28)',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 20,
    padding: 17,
  },
  fastingStatusCardActive: {
    backgroundColor: 'rgba(145, 214, 190, 0.12)',
    borderColor: 'rgba(145, 214, 190, 0.42)',
  },
  fastingStatusKicker: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  fastingStatusTitle: {
    color: COLORS.cream,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 22,
    marginTop: 5,
  },
  fastingStatusText: {
    color: COLORS.mint,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  sectionTitle: {
    color: COLORS.cream,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 21,
    letterSpacing: -0.3,
  },
  sectionMeta: {
    color: COLORS.muted,
    fontSize: 11,
    maxWidth: 120,
    textAlign: 'right',
  },
  prayerList: {
    backgroundColor: COLORS.inkSoft,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  prayerRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.line,
  },
  prayerRowNext: { backgroundColor: COLORS.cream, borderBottomWidth: 0 },
  prayerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(145, 214, 190, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  prayerIconNext: { backgroundColor: COLORS.moss },
  prayerIconText: { color: COLORS.mint, fontSize: 19 },
  prayerIconTextNext: { color: COLORS.cream },
  prayerNameBlock: { flex: 1 },
  prayerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  prayerName: { color: COLORS.cream, fontSize: 16, fontWeight: '700' },
  prayerNameNext: { color: COLORS.ink },
  prayerArabic: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  prayerTime: {
    color: COLORS.cream,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  prayerTimeNext: { color: COLORS.ink },
  nowBadge: {
    color: COLORS.mint,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  nextBadge: {
    color: COLORS.moss,
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
    minHeight: 350,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  loadingStateCompact: { minHeight: 150 },
  loadingText: { color: COLORS.muted, fontSize: 13 },
  emptyState: { alignItems: 'center', paddingTop: 50, paddingHorizontal: 18 },
  emptyMoon: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: COLORS.gold,
    marginBottom: 27,
    overflow: 'hidden',
  },
  emptyMoonCutout: {
    width: 106,
    height: 106,
    borderRadius: 53,
    backgroundColor: COLORS.ink,
    position: 'absolute',
    top: -13,
    left: -28,
  },
  emptyKicker: {
    color: COLORS.gold,
    letterSpacing: 1.4,
    fontSize: 11,
    fontWeight: '800',
  },
  emptyTitle: {
    color: COLORS.cream,
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 34,
    lineHeight: 41,
    letterSpacing: -0.8,
    marginTop: 8,
  },
  emptyText: {
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 21,
    fontSize: 14,
    marginTop: 16,
    marginBottom: 27,
  },
  primaryButton: {
    backgroundColor: COLORS.cream,
    alignSelf: 'stretch',
    borderRadius: 15,
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  secondaryButton: {
    alignSelf: 'stretch',
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
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
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: 'rgba(5, 24, 22, 0.97)',
    borderTopWidth: 1,
    borderColor: COLORS.line,
    paddingTop: 10,
    paddingHorizontal: 8,
    justifyContent: 'space-around',
  },
  tabItem: { width: 67, alignItems: 'center', gap: 3, paddingVertical: 3 },
  tabIcon: { color: '#759187', fontSize: 20, lineHeight: 23 },
  tabIconActive: { color: COLORS.gold },
  tabLabel: { color: '#759187', fontSize: 10, fontWeight: '700' },
  tabLabelActive: { color: COLORS.cream },
  viewHeading: { marginBottom: 24 },
  viewKicker: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  viewTitle: {
    color: COLORS.cream,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 32,
    letterSpacing: -0.7,
    lineHeight: 40,
    marginTop: 4,
  },
  viewDescription: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
    maxWidth: 340,
  },
  calendarHeader: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  calendarHeaderText: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  calendarList: {
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.inkSoft,
    borderRadius: 18,
    overflow: 'hidden',
  },
  calendarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 59,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.line,
  },
  calendarRowToday: { backgroundColor: COLORS.moss },
  calendarRowPressed: { backgroundColor: 'rgba(145, 214, 190, 0.16)' },
  calendarCellDate: { width: '30%' },
  calendarCellTime: {
    width: '23.33%',
    color: COLORS.cream,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  calendarDay: {
    color: COLORS.cream,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20,
  },
  calendarWeekday: {
    color: COLORS.muted,
    fontSize: 9,
    letterSpacing: 0.65,
    marginTop: 2,
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
  },
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
  qiblaLandmark: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(234, 203, 125, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(234, 203, 125, 0.18)',
    borderRadius: 16,
    padding: 10,
    marginBottom: 20,
  },
  qiblaLandmarkImage: { width: 58, height: 58, borderRadius: 12 },
  qiblaLandmarkKicker: {
    color: COLORS.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.05,
  },
  qiblaLandmarkText: {
    color: COLORS.cream,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 16,
    marginTop: 4,
  },
  compass: {
    width: 246,
    height: 246,
    borderRadius: 123,
    borderWidth: 1,
    borderColor: 'rgba(234, 203, 125, 0.45)',
    backgroundColor: COLORS.ink,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
  },
  compassCardinalNorth: {
    color: COLORS.coral,
    fontSize: 13,
    fontWeight: '900',
    position: 'absolute',
    top: 15,
  },
  compassCardinalSouth: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
    position: 'absolute',
    bottom: 15,
  },
  compassCardinalWest: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
    position: 'absolute',
    left: 17,
  },
  compassCardinalEast: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
    position: 'absolute',
    right: 17,
  },
  compassPhoneForward: {
    color: COLORS.mintBright,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    position: 'absolute',
    top: 17,
  },
  qiblaNeedle: {
    width: 22,
    height: 178,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qiblaNeedleTip: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderBottomWidth: 80,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: COLORS.gold,
  },
  qiblaNeedleTail: {
    position: 'absolute',
    bottom: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 66,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: COLORS.moss,
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
  qiblaNumber: {
    color: COLORS.cream,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 49,
    lineHeight: 58,
    letterSpacing: -1.5,
  },
  qiblaLabel: {
    color: COLORS.gold,
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 1.1,
    textAlign: 'center',
    marginTop: 1,
  },
  qiblaRule: {
    width: 48,
    height: 1,
    backgroundColor: COLORS.line,
    marginVertical: 18,
  },
  qiblaInstruction: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
  },
  qiblaLiveStatus: {
    color: COLORS.mint,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.65,
    marginTop: 11,
    textAlign: 'center',
  },
  qiblaActions: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 20,
  },
  qiblaCameraButton: {
    backgroundColor: COLORS.cream,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  qiblaCameraButtonText: {
    color: COLORS.ink,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  qiblaRefresh: {
    borderWidth: 1,
    borderColor: 'rgba(145, 214, 190, 0.45)',
    borderRadius: 12,
    paddingHorizontal: 17,
    paddingVertical: 11,
  },
  qiblaRefreshText: {
    color: COLORS.mintBright,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  qiblaCameraHint: {
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 12,
  },
  occasionCard: {
    backgroundColor: COLORS.gold,
    minHeight: 159,
    padding: 21,
    borderRadius: 22,
    marginBottom: 12,
    overflow: 'hidden',
  },
  occasionLabel: {
    color: COLORS.inkSoft,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  occasionTitle: {
    color: COLORS.ink,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 29,
    lineHeight: 35,
    letterSpacing: -0.7,
    marginTop: 8,
    maxWidth: '78%',
  },
  occasionDate: {
    color: COLORS.inkSoft,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
  },
  occasionMark: {
    position: 'absolute',
    right: 18,
    bottom: 6,
    color: COLORS.cream,
    opacity: 0.65,
    fontSize: 72,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.54)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: { flex: 1 },
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
