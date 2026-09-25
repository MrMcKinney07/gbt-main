import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { useAppContext } from '../../state/AppContext';
import { CameraCapture } from './CameraCapture';
import { deferPhotoVerification } from './verificationApi';
import { recordPhotoVerificationSubmission } from '../../db/writes';
import { colors, spacing } from '../../ui/theme';

const MAX_DEFERRALS = 2;
const appStartMs = Date.now();

interface Props {
  verificationId: string;
  shiftId: string;
  onDone: () => void;
}

/**
 * ACCOUNTABILITY module — photo verification prompt. Different purpose, different copy,
 * different color (colors.verification, purple — never colors.safety) and a different
 * component tree than the safety module's WellnessPromptSheet. Lives in its own directory
 * that src/features/safety/ must never import from (test/safety-firewall.test.ts enforces
 * this at the source level).
 */
export function PhotoVerificationScreen({ verificationId, shiftId, onDone }: Props) {
  const { db, api } = useAppContext();
  const [step, setStep] = useState<'camera' | 'submitted' | 'deferred'>('camera');
  const [deferCount, setDeferCount] = useState(0);
  const [deferring, setDeferring] = useState(false);
  const [deferError, setDeferError] = useState<string | null>(null);

  async function handleCaptured(photo: { base64: string; capturedAt: string }) {
    if (!db) return;

    let captureGeom = { lat: 0, lng: 0 };
    let captureAccuracyM = 0;
    let mockLocationFlag = false;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({});
        captureGeom = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        captureAccuracyM = pos.coords.accuracy ?? 0;
        mockLocationFlag = Boolean((pos as unknown as { mocked?: boolean }).mocked);
      }
    } catch {
      // Fall back to the zeroed geom above rather than blocking the (offline-first) write.
    }

    // Write to the outbox FIRST, then leave the screen. No spinner waiting on the network —
    // the sync worker drains this in the background.
    await recordPhotoVerificationSubmission(db, verificationId, {
      imageBase64: photo.base64,
      capturedAt: photo.capturedAt,
      captureGeom,
      captureAccuracyM,
      deviceUptimeMs: Date.now() - appStartMs,
      mockLocationFlag,
      // TODO(real build): see CameraCapture.tsx — no on-device face detector is wired up in
      // this scaffold, so this is always false rather than a fabricated detection result.
      faceDetected: false,
    });

    setStep('submitted');
    setTimeout(onDone, 900);
  }

  async function handleDefer() {
    if (deferCount >= MAX_DEFERRALS || deferring) return;
    setDeferring(true);
    setDeferError(null);
    try {
      const res = await deferPhotoVerification(api, verificationId);
      setDeferCount(res.deferralCount);
      setStep('deferred');
      setTimeout(onDone, 900);
    } catch (err) {
      setDeferError(
        'Could not defer — this requires a connection to the server. Try capturing the photo instead.'
      );
    } finally {
      setDeferring(false);
    }
  }

  if (step === 'submitted') {
    return (
      <View style={styles.ackContainer} testID="verification-submitted">
        <Text style={styles.ackText}>Photo submitted.</Text>
      </View>
    );
  }

  if (step === 'deferred') {
    return (
      <View style={styles.ackContainer} testID="verification-deferred">
        <Text style={styles.ackText}>Deferred. You'll be asked again shortly.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Photo verification</Text>
        <Text style={styles.headerSubtitle}>
          Time to take a photo of the street or house number.
        </Text>
      </View>

      <CameraCapture onCaptured={handleCaptured} />

      <View style={styles.footer}>
        {deferError ? <Text style={styles.deferError}>{deferError}</Text> : null}
        <TouchableOpacity
          style={[styles.deferButton, (deferCount >= MAX_DEFERRALS || deferring) && styles.deferButtonDisabled]}
          onPress={handleDefer}
          disabled={deferCount >= MAX_DEFERRALS || deferring}
          testID="verification-defer"
        >
          <Text style={styles.deferButtonText}>
            {deferCount >= MAX_DEFERRALS
              ? 'No deferrals left'
              : `Defer (${MAX_DEFERRALS - deferCount} left)`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { backgroundColor: colors.verificationBg, padding: spacing.md },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.verification },
  headerSubtitle: { fontSize: 13, color: colors.text, marginTop: 2 },
  footer: { backgroundColor: colors.verificationBg, padding: spacing.md },
  deferButton: {
    borderWidth: 1.5,
    borderColor: colors.verification,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deferButtonDisabled: { opacity: 0.4 },
  deferButtonText: { color: colors.verification, fontWeight: '600' },
  deferError: { color: colors.danger, marginBottom: spacing.sm, fontSize: 12, textAlign: 'center' },
  ackContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.verificationBg },
  ackText: { fontSize: 16, fontWeight: '600', color: colors.verification },
});
