import { StyleSheet, Text, View } from 'react-native';
import { formatCountdown, formatPrayerTime } from '@/domain/prayer';
import { DailyPrayerData } from '@/domain/types';

export type RamadanDashboardProps = {
  schedule: DailyPrayerData;
  hijriDate: string | null;
  now: Date;
  use24HourTime: boolean;
};

type RamadanPhase = 'beforeImsak' | 'fasting' | 'completed';

const COLORS = {
  background: '#051816',
  panel: '#08201E',
  panelRaised: '#10332F',
  border: '#1F5147',
  cream: '#FFF8E8',
  mint: '#C7F0DA',
  mutedMint: '#91D6BE',
  gold: '#EACB7D',
};

function parseRamadanDay(label: string): number | null {
  const match =
    /\b(\d{1,2})\s+ramadan\b/i.exec(label) ??
    /\bramadan\s+(\d{1,2})\b/i.exec(label);
  const day = match ? Number(match[1]) : NaN;
  return day >= 1 && day <= 30 ? day : null;
}

function validTime(date: Date | undefined): date is Date {
  return date instanceof Date && Number.isFinite(date.getTime());
}

function countdownUntil(target: Date | undefined, now: Date): string | null {
  if (!validTime(target) || !validTime(now)) return null;
  const milliseconds = target.getTime() - now.getTime();
  return milliseconds > 0 ? formatCountdown(milliseconds) : null;
}

export function RamadanDashboard({
  schedule,
  hijriDate,
  now,
  use24HourTime,
}: RamadanDashboardProps) {
  if (!hijriDate || !/\bramadan\b/i.test(hijriDate)) return null;

  const ramadanDay = parseRamadanDay(hijriDate);
  const maghribPrayer = schedule.prayers.find(
    prayer => prayer.name === 'Maghrib',
  );
  const imsakDate = schedule.imsak.date;
  const maghribDate = maghribPrayer?.date;
  const nowMilliseconds = validTime(now) ? now.getTime() : NaN;
  const imsakMilliseconds = validTime(imsakDate) ? imsakDate.getTime() : NaN;
  const maghribMilliseconds = validTime(maghribDate)
    ? maghribDate.getTime()
    : NaN;

  const phase: RamadanPhase =
    Number.isFinite(nowMilliseconds) &&
    Number.isFinite(imsakMilliseconds) &&
    nowMilliseconds < imsakMilliseconds
      ? 'beforeImsak'
      : Number.isFinite(nowMilliseconds) &&
        Number.isFinite(maghribMilliseconds) &&
        nowMilliseconds >= maghribMilliseconds
      ? 'completed'
      : 'fasting';

  const imsakTime = formatPrayerTime(schedule.imsak.time, use24HourTime);
  const maghribTime = formatPrayerTime(schedule.timings.Maghrib, use24HourTime);
  const countdown =
    phase === 'beforeImsak'
      ? countdownUntil(imsakDate, now)
      : phase === 'fasting'
      ? countdownUntil(maghribDate, now)
      : null;
  const statusText =
    phase === 'beforeImsak'
      ? 'Imsak begins in'
      : phase === 'fasting'
      ? 'Iftar / Maghrib in'
      : 'Fast completed';
  const cardLabel = `Ramadan${
    ramadanDay ? ` day ${ramadanDay}` : ''
  }. ${statusText}${countdown ? ` ${countdown}` : ''}`;

  return (
    <View
      style={styles.card}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={cardLabel}
    >
      <View style={styles.header}>
        <View style={styles.moonBadge} accessibilityElementsHidden>
          <Text style={styles.moon}>☾</Text>
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>RAMADAN</Text>
          <Text style={styles.title}>
            {ramadanDay ? `Day ${ramadanDay}` : 'Daily dashboard'}
          </Text>
          <Text style={styles.hijriDate}>{hijriDate}</Text>
        </View>
      </View>

      <View style={styles.statusPanel} accessibilityLiveRegion="polite">
        <Text style={styles.statusLabel}>{statusText}</Text>
        {countdown ? <Text style={styles.countdown}>{countdown}</Text> : null}
        {phase === 'completed' ? (
          <Text style={styles.completedCopy}>
            The fast is complete for today.
          </Text>
        ) : null}
      </View>

      <View style={styles.timesRow}>
        <View
          style={[styles.timeBlock, styles.timeBlockFirst]}
          accessible
          accessibilityLabel={`Imsak at ${imsakTime}${
            phase === 'beforeImsak' && countdown
              ? `, ${countdown} remaining`
              : ''
          }`}
        >
          <Text style={styles.timeLabel}>IMSAK</Text>
          <Text style={styles.timeValue}>{imsakTime}</Text>
          {phase === 'beforeImsak' ? (
            <Text style={styles.timeHint}>Start of fast</Text>
          ) : null}
        </View>
        <View
          style={styles.timeBlock}
          accessible
          accessibilityLabel={`Iftar and Maghrib at ${maghribTime}${
            phase === 'fasting' && countdown ? `, ${countdown} remaining` : ''
          }`}
        >
          <Text style={styles.timeLabel}>IFTAR / MAGHRIB</Text>
          <Text style={styles.timeValue}>{maghribTime}</Text>
          {phase === 'fasting' ? (
            <Text style={styles.timeHint}>End of fast</Text>
          ) : null}
        </View>
      </View>

      <Text style={styles.disclaimer}>
        Calculated Hijri dates can differ by local moon sighting.
      </Text>
    </View>
  );
}

export default RamadanDashboard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 18,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  moonBadge: {
    alignItems: 'center',
    backgroundColor: COLORS.panelRaised,
    borderColor: COLORS.gold,
    borderRadius: 24,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    marginRight: 14,
    width: 52,
  },
  moon: {
    color: COLORS.gold,
    fontSize: 31,
    lineHeight: 35,
  },
  headingCopy: {
    flex: 1,
  },
  eyebrow: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 5,
  },
  title: {
    color: COLORS.cream,
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  hijriDate: {
    color: COLORS.mutedMint,
    fontSize: 13,
    marginTop: 4,
  },
  statusPanel: {
    alignItems: 'center',
    backgroundColor: COLORS.panel,
    borderColor: COLORS.border,
    borderRadius: 17,
    borderWidth: 1,
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 15,
  },
  statusLabel: {
    color: COLORS.mutedMint,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  countdown: {
    color: COLORS.gold,
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 5,
  },
  completedCopy: {
    color: COLORS.mint,
    fontSize: 14,
    marginTop: 6,
  },
  timesRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  timeBlock: {
    backgroundColor: COLORS.panelRaised,
    borderRadius: 15,
    flex: 1,
    minHeight: 92,
    padding: 14,
  },
  timeBlockFirst: {
    marginRight: 6,
  },
  timeLabel: {
    color: COLORS.mutedMint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  timeValue: {
    color: COLORS.cream,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 7,
  },
  timeHint: {
    color: COLORS.mint,
    fontSize: 11,
    marginTop: 5,
  },
  disclaimer: {
    color: COLORS.mutedMint,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 15,
  },
});
