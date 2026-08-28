import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureLocalDataEpoch, withStorageLock } from '@/services/storageLock';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const STORAGE_KEY = 'duavara.zakat';
const GOLD_NISAB_GRAMS = 85;
const SILVER_NISAB_GRAMS = 595;
const ZAKAT_RATE = 0.025;

const COLORS = {
  background: '#071D1A',
  sheet: '#0D2B27',
  raised: '#123C35',
  border: '#2A5D50',
  text: '#FFF8E8',
  muted: '#A5C3B8',
  emerald: '#86D3B4',
  emeraldDeep: '#1D6B56',
  gold: '#EACB7D',
  parchment: '#F5E6B5',
  coral: '#EF967C',
};

type NisabBasis = 'gold' | 'silver';

type ZakatForm = {
  cash: string;
  goldGrams: string;
  goldPricePerGram: string;
  silverGrams: string;
  silverPricePerGram: string;
  businessAssets: string;
  debtsDue: string;
  nisabBasis: NisabBasis;
};

export type ZakatInput = {
  cash: number;
  goldGrams: number;
  goldPricePerGram: number;
  silverGrams: number;
  silverPricePerGram: number;
  businessAssets: number;
  debtsDue: number;
  nisabBasis: NisabBasis;
};

export type ZakatResult = {
  assets: number;
  nisab: number;
  zakat: number;
};

const EMPTY_FORM: ZakatForm = {
  cash: '',
  goldGrams: '',
  goldPricePerGram: '',
  silverGrams: '',
  silverPricePerGram: '',
  businessAssets: '',
  debtsDue: '',
  nisabBasis: 'gold',
};

function safeAmount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function parseAmount(value: string): number {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function calculateZakat(input: ZakatInput): ZakatResult {
  const cash = safeAmount(input.cash);
  const goldValue =
    safeAmount(input.goldGrams) * safeAmount(input.goldPricePerGram);
  const silverValue =
    safeAmount(input.silverGrams) * safeAmount(input.silverPricePerGram);
  const businessAssets = safeAmount(input.businessAssets);
  const debtsDue = safeAmount(input.debtsDue);
  const assets = Math.max(
    0,
    cash + goldValue + silverValue + businessAssets - debtsDue,
  );
  const nisab =
    input.nisabBasis === 'silver'
      ? SILVER_NISAB_GRAMS * safeAmount(input.silverPricePerGram)
      : GOLD_NISAB_GRAMS * safeAmount(input.goldPricePerGram);

  return {
    assets,
    nisab,
    zakat: assets >= nisab ? assets * ZAKAT_RATE : 0,
  };
}

function formToInput(form: ZakatForm): ZakatInput {
  return {
    cash: parseAmount(form.cash),
    goldGrams: parseAmount(form.goldGrams),
    goldPricePerGram: parseAmount(form.goldPricePerGram),
    silverGrams: parseAmount(form.silverGrams),
    silverPricePerGram: parseAmount(form.silverPricePerGram),
    businessAssets: parseAmount(form.businessAssets),
    debtsDue: parseAmount(form.debtsDue),
    nisabBasis: form.nisabBasis,
  };
}

function formFromUnknown(value: unknown): ZakatForm {
  if (typeof value !== 'object' || value === null) return EMPTY_FORM;
  const candidate = value as Partial<ZakatForm>;
  const text = (item: unknown) => (typeof item === 'string' ? item : '');
  return {
    cash: text(candidate.cash),
    goldGrams: text(candidate.goldGrams),
    goldPricePerGram: text(candidate.goldPricePerGram),
    silverGrams: text(candidate.silverGrams),
    silverPricePerGram: text(candidate.silverPricePerGram),
    businessAssets: text(candidate.businessAssets),
    debtsDue: text(candidate.debtsDue),
    nisabBasis: candidate.nisabBasis === 'silver' ? 'silver' : 'gold',
  };
}

function formatAmount(value: number): string {
  return value.toFixed(2);
}

export interface ZakatCalculatorProps {
  visible: boolean;
  onClose: () => void;
}

export function ZakatCalculator({ visible, onClose }: ZakatCalculatorProps) {
  const [form, setForm] = useState<ZakatForm>(EMPTY_FORM);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const saveQueue = useRef(Promise.resolve());

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (!isMounted) return;
        if (raw) {
          try {
            setForm(formFromUnknown(JSON.parse(raw)));
          } catch {
            setForm(EMPTY_FORM);
          }
        }
        setIsLoaded(true);
      })
      .catch(() => {
        if (!isMounted) return;
        setStorageError('Saved calculator data could not be loaded.');
        setIsLoaded(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const snapshot = JSON.stringify(form);
    const writeEpoch = captureLocalDataEpoch();
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() =>
        withStorageLock(
          () => AsyncStorage.setItem(STORAGE_KEY, snapshot),
          writeEpoch,
        ),
      )
      .then(() => setStorageError(null))
      .catch(() => setStorageError('Your calculator data could not be saved.'));
  }, [form, isLoaded]);

  const result = useMemo(() => calculateZakat(formToInput(form)), [form]);

  const updateField = (field: keyof ZakatForm, value: string) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const renderInput = (
    field: Exclude<keyof ZakatForm, 'nisabBasis'>,
    label: string,
    placeholder: string,
    hint: string,
  ) => (
    <View style={styles.field} key={field}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={form[field]}
        onChangeText={value => updateField(field, value)}
        keyboardType="numbers-and-punctuation"
        placeholder={placeholder}
        placeholderTextColor="#71998C"
        style={styles.input}
        accessibilityLabel={label}
        accessibilityHint={hint}
        returnKeyType="next"
      />
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close Zakat calculator"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheet}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>PERSONAL CALCULATION</Text>
              <Text style={styles.title}>Zakat calculator</Text>
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close Zakat calculator"
              hitSlop={8}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            <Text style={styles.intro}>
              Enter your own values and current prices. Nothing is fetched or
              estimated for you.
            </Text>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>MONEY &amp; BUSINESS</Text>
              {renderInput(
                'cash',
                'Cash and savings (your currency)',
                '0.00',
                'Enter the amount you want to include.',
              )}
              {renderInput(
                'businessAssets',
                'Business assets (your currency)',
                '0.00',
                'Enter the value of business assets to include.',
              )}
              {renderInput(
                'debtsDue',
                'Debts due (your currency)',
                '0.00',
                'Enter debts currently due to be deducted.',
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>METALS</Text>
              {renderInput(
                'goldGrams',
                'Gold (grams)',
                '0.00',
                'Enter the gold weight in grams.',
              )}
              {renderInput(
                'goldPricePerGram',
                'Gold price per gram (your currency)',
                '0.00',
                'Enter the current gold price you choose to use.',
              )}
              {renderInput(
                'silverGrams',
                'Silver (grams)',
                '0.00',
                'Enter the silver weight in grams.',
              )}
              {renderInput(
                'silverPricePerGram',
                'Silver price per gram (your currency)',
                '0.00',
                'Enter the current silver price you choose to use.',
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>NISAB BASIS</Text>
              <View style={styles.basisRow} accessibilityRole="radiogroup">
                {(['gold', 'silver'] as const).map(basis => {
                  const selected = form.nisabBasis === basis;
                  return (
                    <Pressable
                      key={basis}
                      style={[
                        styles.basisButton,
                        selected && styles.basisSelected,
                      ]}
                      onPress={() =>
                        setForm(current => ({ ...current, nisabBasis: basis }))
                      }
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${basis} nisab basis`}
                    >
                      <Text
                        style={[
                          styles.basisText,
                          selected && styles.basisTextSelected,
                        ]}
                      >
                        {basis === 'gold' ? 'Gold · 85g' : 'Silver · 595g'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.hint}>
                Nisab uses 85g of gold or 595g of silver, multiplied by the
                price you entered above.
              </Text>
            </View>

            <View style={styles.resultCard} accessibilityLiveRegion="polite">
              <View style={styles.resultTopline}>
                <Text style={styles.resultEyebrow}>ESTIMATED AMOUNT</Text>
                <Text style={styles.rate}>2.5%</Text>
              </View>
              <Text style={styles.resultValue}>
                {formatAmount(result.zakat)}
              </Text>
              <Text style={styles.resultCaption}>in your entered currency</Text>
              <View style={styles.resultDetails}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Net assets</Text>
                  <Text style={styles.detailValue}>
                    {formatAmount(result.assets)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Nisab threshold</Text>
                  <Text style={styles.detailValue}>
                    {formatAmount(result.nisab)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <Text style={[styles.detailValue, styles.statusValue]}>
                    {result.zakat > 0 ? 'At or above nisab' : 'Below nisab'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.assumptionsCard}>
              <Text style={styles.assumptionsTitle}>ASSUMPTIONS IN USE</Text>
              <Text style={styles.assumptionsText}>
                Net assets = cash + metal values + business assets − debts due.
                Negative totals are treated as zero. Zakat is 2.5% when net
                assets meet the selected nisab.
              </Text>
              <Text style={styles.assumptionsText}>
                Prices and values are entirely user-entered. This calculator is
                a general planning tool and does not provide religious authority
                or a personal ruling.
              </Text>
            </View>

            {storageError ? (
              <Text style={styles.error} accessibilityRole="alert">
                {storageError}
              </Text>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 12, 11, 0.72)',
  },
  sheet: {
    maxHeight: '94%',
    backgroundColor: COLORS.sheet,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    marginTop: 10,
    marginBottom: 16,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.7,
    marginTop: 4,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: COLORS.raised,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  closeText: {
    color: COLORS.parchment,
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 30,
  },
  content: {
    gap: 18,
    padding: 20,
    paddingBottom: 42,
  },
  intro: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  section: {
    gap: 12,
  },
  sectionLabel: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  field: {
    gap: 7,
  },
  inputLabel: {
    color: COLORS.parchment,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderRadius: 11,
    borderWidth: 1,
    color: COLORS.text,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  basisRow: {
    flexDirection: 'row',
    gap: 10,
  },
  basisButton: {
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderRadius: 11,
    borderWidth: 1,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  basisSelected: {
    backgroundColor: COLORS.emeraldDeep,
    borderColor: COLORS.emerald,
  },
  basisText: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  basisTextSelected: {
    color: COLORS.text,
  },
  hint: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  resultCard: {
    backgroundColor: COLORS.emeraldDeep,
    borderColor: COLORS.emerald,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  resultTopline: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  resultEyebrow: {
    color: COLORS.parchment,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  rate: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '800',
  },
  resultValue: {
    color: COLORS.text,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 10,
  },
  resultCaption: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: -3,
  },
  resultDetails: {
    borderTopColor: 'rgba(255, 248, 232, 0.18)',
    borderTopWidth: 1,
    gap: 8,
    marginTop: 18,
    paddingTop: 13,
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    color: COLORS.muted,
    fontSize: 13,
  },
  detailValue: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  statusValue: {
    color: COLORS.gold,
  },
  assumptionsCard: {
    backgroundColor: COLORS.raised,
    borderColor: COLORS.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 9,
    padding: 15,
  },
  assumptionsTitle: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  assumptionsText: {
    color: COLORS.parchment,
    fontSize: 12,
    lineHeight: 18,
  },
  error: {
    color: COLORS.coral,
    fontSize: 13,
    lineHeight: 19,
  },
});
