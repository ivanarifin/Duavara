import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { QiblaData } from '@/domain';
import { CompassHeading, getRelativeQiblaAngle } from '@/services/compass';

const COLORS = {
  ink: '#08201E',
  moss: '#1F5147',
  mint: '#91D6BE',
  mintBright: '#C7F0DA',
  cream: '#FFF8E8',
  gold: '#EACB7D',
  coral: '#EF967C',
};

export function QiblaCameraFinder({
  visible,
  qibla,
  heading,
  onClose,
}: {
  visible: boolean;
  qibla: QiblaData;
  heading: CompassHeading | null;
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <QiblaCameraFinderContent
      qibla={qibla}
      heading={heading}
      onClose={onClose}
    />
  );
}

function QiblaCameraFinderContent({
  qibla,
  heading,
  onClose,
}: {
  qibla: QiblaData;
  heading: CompassHeading | null;
  onClose: () => void;
}) {
  const device = useCameraDevice('back');
  const { hasPermission, canRequestPermission, requestPermission } =
    useCameraPermission();
  const [appState, setAppState] = useState(AppState.currentState);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [hasRequestedPermission, setHasRequestedPermission] = useState(false);

  const requestCameraPermission = useCallback(() => {
    if (isRequestingPermission) return;
    setIsRequestingPermission(true);
    requestPermission()
      .then(granted => {
        if (granted) {
          setCameraError(null);
        } else {
          setCameraError('Camera permission was not granted.');
        }
      })
      .catch(() => setCameraError('Camera access is unavailable.'))
      .finally(() => setIsRequestingPermission(false));
  }, [isRequestingPermission, requestPermission]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!hasPermission && canRequestPermission && !hasRequestedPermission) {
      setHasRequestedPermission(true);
      requestCameraPermission();
    }
  }, [
    canRequestPermission,
    hasPermission,
    hasRequestedPermission,
    requestCameraPermission,
  ]);

  const showCamera = hasPermission && device !== undefined && !cameraError;
  const isCameraActive = showCamera && !isClosing && appState === 'active';

  const closeCamera = useCallback(() => {
    if (showCamera) {
      setIsClosing(true);
    } else {
      onClose();
    }
  }, [onClose, showCamera]);

  const relativeAngle = useMemo(
    () =>
      heading ? getRelativeQiblaAngle(qibla.direction, heading.heading) : 0,
    [heading, qibla.direction],
  );
  const directionInstruction = useMemo(() => {
    if (!heading) return 'Calibrating compass…';
    const degrees = Math.round(Math.abs(relativeAngle));
    if (degrees <= 4) return 'Qibla aligned';
    return `Turn ${relativeAngle < 0 ? 'left' : 'right'} ${degrees}°`;
  }, [heading, relativeAngle]);

  return (
    <Modal visible animationType="fade" onRequestClose={closeCamera}>
      <View style={styles.screen}>
        {showCamera ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            implementationMode="compatible"
            isActive={isCameraActive}
            onStopped={() => {
              if (isClosing) onClose();
            }}
            onError={() => {
              if (isClosing) {
                onClose();
              } else {
                setCameraError('Camera preview is unavailable.');
              }
            }}
          />
        ) : (
          <View style={styles.permissionFallback}>
            <Text style={styles.fallbackMoon}>☾</Text>
            <Text style={styles.fallbackTitle}>
              {cameraError
                ? 'Camera preview unavailable'
                : 'Camera view is optional'}
            </Text>
            <Text style={styles.fallbackText}>
              {cameraError ??
                'Your regular Qibla bearing still works without camera access.'}
            </Text>
            {cameraError && hasPermission && device ? (
              <Pressable
                style={styles.permissionButton}
                onPress={() => setCameraError(null)}
                accessibilityRole="button"
              >
                <Text style={styles.permissionButtonText}>RETRY CAMERA</Text>
              </Pressable>
            ) : canRequestPermission ? (
              <Pressable
                style={styles.permissionButton}
                onPress={requestCameraPermission}
                disabled={isRequestingPermission}
                accessibilityRole="button"
              >
                <Text style={styles.permissionButtonText}>
                  {isRequestingPermission
                    ? 'REQUESTING CAMERA…'
                    : 'ALLOW CAMERA'}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.permissionButton}
                onPress={() => Linking.openSettings().catch(() => undefined)}
                accessibilityRole="button"
              >
                <Text style={styles.permissionButtonText}>OPEN SETTINGS</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.scrim} pointerEvents="none" />
        <View style={styles.topBar}>
          <View>
            <Text style={styles.topEyebrow}>LIVE QIBLA FINDER</Text>
            <Text style={styles.topSubtitle}>Hold your phone level</Text>
          </View>
          <Pressable
            style={styles.closeButton}
            onPress={closeCamera}
            accessibilityRole="button"
            accessibilityLabel="Close camera Qibla finder"
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        {showCamera ? (
          <View style={styles.centerGuide} pointerEvents="none">
            <View style={styles.guideRing}>
              <Text style={styles.guideNorth}>N</Text>
              <View
                style={[
                  styles.qiblaArrow,
                  { transform: [{ rotate: `${relativeAngle}deg` }] },
                ]}
              >
                <View style={styles.qiblaArrowTip} />
                <View style={styles.qiblaArrowStem} />
              </View>
              <View style={styles.guideCenter} />
            </View>
            <Text style={styles.directionInstruction}>
              {directionInstruction}
            </Text>
            <Text style={styles.directionHint}>
              {heading
                ? `Heading ${Math.round(heading.heading)}° · Qibla ${Math.round(
                    qibla.direction,
                  )}°`
                : 'Keep away from metal and magnets'}
            </Text>
          </View>
        ) : null}

        <View style={styles.bottomPanel}>
          {cameraError ? (
            <View style={styles.warningRow}>
              <Text style={styles.warningMark}>!</Text>
              <Text style={styles.warningText}>{cameraError}</Text>
            </View>
          ) : null}
          {showCamera ? (
            <>
              <Text style={styles.panelLabel}>
                QIBLA OVERLAY · TRUE-NORTH REFERENCE
              </Text>
              <Text style={styles.panelTitle}>{directionInstruction}</Text>
              <Text style={styles.panelText}>
                The arrow points to the Qibla (Kaaba). True north is only the
                compass reference used to calculate the turn.
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.ink },
  permissionFallback: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    backgroundColor: COLORS.ink,
  },
  fallbackMoon: { color: COLORS.gold, fontSize: 70, marginBottom: 12 },
  fallbackTitle: {
    color: COLORS.cream,
    fontFamily: 'Georgia',
    fontSize: 30,
    textAlign: 'center',
  },
  fallbackText: {
    color: COLORS.mint,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
  },
  permissionButton: {
    borderWidth: 1,
    borderColor: 'rgba(234, 203, 125, 0.66)',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 13,
    marginTop: 23,
  },
  permissionButtonText: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(5, 24, 22, 0.20)',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingHorizontal: 22,
    paddingBottom: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 24, 22, 0.48)',
  },
  topEyebrow: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.25,
  },
  topSubtitle: { color: COLORS.cream, fontSize: 13, marginTop: 4 },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 248, 232, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 248, 232, 0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: COLORS.cream, fontSize: 25, lineHeight: 27 },
  centerGuide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  guideRing: {
    width: 244,
    height: 244,
    borderRadius: 122,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 248, 232, 0.62)',
    backgroundColor: 'rgba(5, 24, 22, 0.18)',
  },
  guideNorth: {
    position: 'absolute',
    top: 13,
    color: COLORS.coral,
    fontSize: 13,
    fontWeight: '900',
  },
  qiblaArrow: {
    width: 26,
    height: 174,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qiblaArrowTip: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 13,
    borderRightWidth: 13,
    borderBottomWidth: 84,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: COLORS.gold,
  },
  qiblaArrowStem: {
    position: 'absolute',
    bottom: 0,
    width: 4,
    height: 87,
    borderRadius: 2,
    backgroundColor: COLORS.gold,
  },
  guideCenter: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 4,
    borderColor: COLORS.ink,
    backgroundColor: COLORS.cream,
  },
  directionInstruction: {
    color: COLORS.cream,
    fontFamily: 'Georgia',
    fontSize: 28,
    letterSpacing: -0.5,
    marginTop: 22,
  },
  directionHint: { color: COLORS.mintBright, fontSize: 12, marginTop: 7 },
  bottomPanel: {
    position: 'absolute',
    left: 15,
    right: 15,
    bottom: 28,
    borderRadius: 20,
    padding: 18,
    backgroundColor: 'rgba(5, 24, 22, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(199, 240, 218, 0.20)',
  },
  panelLabel: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.15,
  },
  panelTitle: {
    color: COLORS.cream,
    fontFamily: 'Georgia',
    fontSize: 22,
    marginTop: 6,
  },
  panelText: { color: COLORS.mint, fontSize: 12, lineHeight: 18, marginTop: 7 },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  warningMark: { color: COLORS.gold, fontSize: 14, fontWeight: '900' },
  warningText: { color: COLORS.cream, flex: 1, fontSize: 12, lineHeight: 17 },
});
