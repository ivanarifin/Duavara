import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  calculateCurrentStreak,
  calculatePrayedCount,
  completedCycles,
  DailyPrayerData,
  formatPrayerTime,
  PRAYER_NAMES,
  PrayerName,
} from '@/domain';
import {
  getTasbihState,
  getWorshipRecords,
  incrementTasbih,
  resetTasbih,
  setTasbihTarget,
  togglePrayerStatus,
} from '@/services/worship';
import type {
  TasbihState,
  TasbihTarget,
  WorshipRecords,
} from '@/services/worship';

const COLORS = {
  background: '#071D1A',
  card: '#0D2B27',
  cardRaised: '#123C35',
  border: '#23564B',
  text: '#FFF8E8',
  textMuted: '#A5C3B8',
  emerald: '#86D3B4',
  emeraldDeep: '#1D6B56',
  gold: '#EACB7D',
  goldSoft: '#F5E6B5',
};

const DEFAULT_TASBIH: TasbihState = { count: 0, target: 33 };

export interface WorshipCompanionProps {
  schedule: DailyPrayerData;
  use24HourTime: boolean;
}

export function WorshipCompanion({
  schedule,
  use24HourTime,
}: WorshipCompanionProps) {
  const [records, setRecords] = useState<WorshipRecords>({});
  const [tasbih, setTasbih] = useState<TasbihState>(DEFAULT_TASBIH);
  const [isResetConfirmationVisible, setIsResetConfirmationVisible] =
    useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    Promise.all([getWorshipRecords(), getTasbihState()])
      .then(([nextRecords, nextTasbih]) => {
        if (!isMounted) return;
        setRecords(nextRecords);
        setTasbih(nextTasbih);
      })
      .catch(() => {
        if (isMounted) {
          setStorageError('Your worship progress could not be loaded.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const prayers = useMemo(
    () =>
      PRAYER_NAMES.map(
        name => schedule.prayers.find(prayer => prayer.name === name)!,
      ),
    [schedule.prayers],
  );
  const prayedCount = calculatePrayedCount(records, schedule.date);
  const streak = calculateCurrentStreak(records, schedule.date);
  const dayRecords = records[schedule.date];
  const cycles = completedCycles(tasbih.count, tasbih.target);

  const reportStorageError = () =>
    setStorageError('Progress could not be saved. Please try again.');

  const handlePrayerPress = async (prayer: PrayerName) => {
    try {
      const nextRecords = await togglePrayerStatus(
        schedule.date,
        prayer,
        'prayed',
      );
      setRecords(nextRecords);
      setStorageError(null);
    } catch {
      reportStorageError();
    }
  };

  const handleTasbihTarget = async (target: TasbihTarget) => {
    if (target === tasbih.target) return;
    try {
      const nextTasbih = await setTasbihTarget(target);
      setTasbih(nextTasbih);
      setStorageError(null);
    } catch {
      reportStorageError();
    }
  };

  const handleTasbihIncrement = async () => {
    try {
      const nextTasbih = await incrementTasbih();
      setTasbih(nextTasbih);
      setStorageError(null);
    } catch {
      reportStorageError();
    }
  };

  const handleTasbihReset = async () => {
    try {
      const nextTasbih = await resetTasbih();
      setTasbih(nextTasbih);
      setStorageError(null);
      setIsResetConfirmationVisible(false);
    } catch {
      reportStorageError();
    }
  };

  const cancelTasbihReset = () => setIsResetConfirmationVisible(false);

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        <View>
          <Text style={styles.eyebrow}>TODAY&apos;S WORSHIP</Text>
          <Text style={styles.heading}>A quiet record</Text>
        </View>
        <View style={styles.streakBadge}>
          <Text style={styles.streakValue}>{streak}</Text>
          <Text style={styles.streakLabel}>DAY STREAK</Text>
        </View>
      </View>

      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.cardTitle}>Five daily prayers</Text>
          <Text style={styles.progressValue}>{prayedCount}/5</Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${(prayedCount / 5) * 100}%` },
            ]}
          />
        </View>
      </View>

      <View style={styles.prayerList}>
        {prayers.map(prayer => {
          const isPrayed = dayRecords?.[prayer.name] === 'prayed';
          return (
            <Pressable
              key={prayer.name}
              style={({ pressed }) => [
                styles.prayerRow,
                isPrayed && styles.prayerRowComplete,
                pressed && styles.pressed,
              ]}
              onPress={() => handlePrayerPress(prayer.name)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isPrayed }}
              accessibilityLabel={`${prayer.name}, ${formatPrayerTime(
                prayer.time,
                use24HourTime,
              )}, ${isPrayed ? 'prayed' : 'not prayed'}`}
            >
              <View style={[styles.check, isPrayed && styles.checkComplete]}>
                {isPrayed ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <View style={styles.prayerDetails}>
                <Text
                  style={[styles.prayerName, isPrayed && styles.completeText]}
                >
                  {prayer.name}
                </Text>
                <Text style={styles.prayerTime}>
                  {formatPrayerTime(prayer.time, use24HourTime)}
                </Text>
              </View>
              <Text
                style={[styles.statusText, isPrayed && styles.statusComplete]}
              >
                {isPrayed ? 'PRAYED' : 'MARK'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.tasbihCard}>
        <View style={styles.tasbihHeader}>
          <View>
            <Text style={styles.eyebrow}>TASBIH</Text>
            <Text style={styles.cardTitle}>Keep your count</Text>
          </View>
          <View style={styles.targetSelector} accessibilityRole="radiogroup">
            {[33, 99].map(target => {
              const selected = tasbih.target === target;
              return (
                <Pressable
                  key={target}
                  style={[
                    styles.targetButton,
                    selected && styles.targetSelected,
                  ]}
                  onPress={() => handleTasbihTarget(target as TasbihTarget)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${target} count target`}
                >
                  <Text
                    style={[
                      styles.targetText,
                      selected && styles.targetTextSelected,
                    ]}
                  >
                    {target}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.countArea}>
          <Text style={styles.count}>{tasbih.count}</Text>
          <Text style={styles.cycleText}>
            {cycles} {cycles === 1 ? 'cycle' : 'cycles'} complete
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.incrementButton,
            pressed && styles.pressed,
          ]}
          onPress={handleTasbihIncrement}
          accessibilityRole="button"
          accessibilityLabel={`Increment Tasbih count, ${tasbih.count} of ${tasbih.target}`}
        >
          <Text style={styles.incrementText}>TAP TO COUNT</Text>
          <Text style={styles.incrementGlyph}>+</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.resetButton,
            pressed && styles.pressed,
          ]}
          onPress={() => setIsResetConfirmationVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Reset Tasbih count"
          accessibilityHint="Opens a confirmation before clearing the count."
        >
          <Text style={styles.resetText}>RESET COUNT</Text>
        </Pressable>
      </View>

      <Modal
        visible={isResetConfirmationVisible}
        transparent
        animationType="fade"
        onRequestClose={cancelTasbihReset}
        accessibilityViewIsModal
      >
        <View style={styles.resetModalBackdrop}>
          <View
            accessible
            accessibilityViewIsModal
            accessibilityLabel="Reset Tasbih confirmation"
            style={styles.resetModalCard}
          >
            <Text style={styles.resetModalTitle}>Reset Tasbih count?</Text>
            <Text style={styles.resetModalMessage}>
              Your current count of {tasbih.count} will be cleared.
            </Text>
            <View style={styles.resetModalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.resetModalButton,
                  styles.resetModalCancelButton,
                  pressed && styles.pressed,
                ]}
                onPress={cancelTasbihReset}
                accessibilityRole="button"
                accessibilityLabel="Cancel resetting Tasbih count"
                accessibilityHint="Keeps your current Tasbih count."
              >
                <Text style={styles.resetModalCancelText}>CANCEL</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.resetModalButton,
                  styles.resetModalConfirmButton,
                  pressed && styles.pressed,
                ]}
                onPress={handleTasbihReset}
                accessibilityRole="button"
                accessibilityLabel="Confirm reset Tasbih count"
                accessibilityHint="Clears and saves the Tasbih count as zero."
              >
                <Text style={styles.resetModalConfirmText}>RESET</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {storageError ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {storageError}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  heading: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
  },
  streakBadge: {
    alignItems: 'center',
    backgroundColor: COLORS.cardRaised,
    borderColor: COLORS.border,
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 76,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  streakValue: {
    color: COLORS.goldSoft,
    fontSize: 22,
    fontWeight: '800',
  },
  streakLabel: {
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 1,
  },
  progressCard: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  progressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  progressValue: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '800',
  },
  progressTrack: {
    backgroundColor: '#1A423A',
    borderRadius: 99,
    height: 6,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: COLORS.emerald,
    borderRadius: 99,
    height: '100%',
  },
  prayerList: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  prayerRow: {
    alignItems: 'center',
    borderBottomColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 76,
    paddingHorizontal: 15,
  },
  prayerRowComplete: {
    backgroundColor: '#103A31',
    borderBottomColor: COLORS.emeraldDeep,
  },
  pressed: {
    opacity: 0.78,
  },
  check: {
    alignItems: 'center',
    borderColor: '#5B8074',
    borderRadius: 12,
    borderWidth: 1.5,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checkComplete: {
    backgroundColor: COLORS.emerald,
    borderColor: COLORS.emerald,
  },
  checkMark: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: '900',
  },
  prayerDetails: {
    flex: 1,
    marginLeft: 12,
  },
  prayerName: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  completeText: {
    color: COLORS.emerald,
  },
  prayerTime: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 3,
  },
  statusText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  statusComplete: {
    color: COLORS.gold,
  },
  tasbihCard: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.gold,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  tasbihHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  targetSelector: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 3,
  },
  targetButton: {
    alignItems: 'center',
    borderRadius: 7,
    minWidth: 36,
    paddingVertical: 6,
  },
  targetSelected: {
    backgroundColor: COLORS.gold,
  },
  targetText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  targetTextSelected: {
    color: COLORS.background,
  },
  countArea: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  count: {
    color: COLORS.goldSoft,
    fontSize: 56,
    fontWeight: '800',
    includeFontPadding: false,
    lineHeight: 64,
  },
  cycleText: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  incrementButton: {
    alignItems: 'center',
    backgroundColor: COLORS.emeraldDeep,
    borderRadius: 13,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 52,
  },
  incrementText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  incrementGlyph: {
    color: COLORS.gold,
    fontSize: 25,
    fontWeight: '300',
    marginLeft: 10,
    marginTop: -2,
  },
  resetButton: {
    alignItems: 'center',
    paddingTop: 14,
  },
  resetText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  resetModalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  resetModalCard: {
    backgroundColor: COLORS.cardRaised,
    borderColor: COLORS.border,
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: 360,
    padding: 20,
    width: '100%',
  },
  resetModalTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  resetModalMessage: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  resetModalActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  resetModalButton: {
    alignItems: 'center',
    borderRadius: 10,
    minWidth: 86,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  resetModalCancelButton: {
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  resetModalConfirmButton: {
    backgroundColor: COLORS.gold,
  },
  resetModalCancelText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  resetModalConfirmText: {
    color: COLORS.background,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  errorText: {
    color: '#F4AF91',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
