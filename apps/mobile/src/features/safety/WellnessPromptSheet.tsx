import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppContext } from '../../state/AppContext';
import { checkPin } from './pins';
import { respondToWellnessCheck, reportDuress } from './safetyApi';
import { PinPad } from './PinPad';
import { WellnessConfirmation } from './WellnessConfirmation';
import { colors, spacing } from '../../ui/theme';

type Step = 'prompt' | 'pin' | 'confirmed' | 'help_ack';

interface Props {
  visible: boolean;
  checkId: string;
  shiftId: string;
  onClose: () => void;
}

/**
 * SAFETY module — full-width sheet for the inactivity watchdog's wellness check. This is
 * NOT the photo verification prompt: different copy, different color (colors.safety, red —
 * never colors.verification), and it lives in its own directory that
 * src/features/verification/ must never import from (enforced by
 * test/safety-firewall.test.ts).
 *
 * Duress handling: entering the duress PIN instead of the normal PIN takes the exact same
 * visible path as the normal PIN — both call respondToWellnessCheck(..., 'ok', ...) and land
 * on the identical <WellnessConfirmation/> screen. The duress PIN additionally, and only in
 * the background with no UI/haptic/sound difference, calls reportDuress(). See
 * test/duress-parity.test.tsx.
 */
export function WellnessPromptSheet({ visible, checkId, shiftId, onClose }: Props) {
  const { api } = useAppContext();
  const [step, setStep] = useState<Step>('prompt');
  const [pinError, setPinError] = useState<string | null>(null);

  function reset() {
    setStep('prompt');
    setPinError(null);
  }

  async function handlePinSubmit(pin: string) {
    const result = checkPin(pin);
    if (result === 'invalid') {
      setPinError('Incorrect PIN. Try again.');
      return;
    }
    setPinError(null);

    // Both branches below produce IDENTICAL UI: the same await, the same state transition,
    // the same next screen. Only the duress branch makes one extra, silent network call.
    await respondToWellnessCheck(api, checkId, 'ok', 'pin');
    if (result === 'duress') {
      await reportDuress(api, shiftId);
    }
    setStep('confirmed');
  }

  async function handleNeedHelp() {
    await respondToWellnessCheck(api, checkId, 'need_help', 'button');
    setStep('help_ack');
  }

  function handleDismiss() {
    reset();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="wellness-sheet">
          {step === 'prompt' && (
            <View style={styles.promptContainer}>
              <Text style={styles.promptTitle}>
                Haven't seen any activity for a bit. Everything okay?
              </Text>
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.fineButton]}
                  onPress={() => setStep('pin')}
                  testID="wellness-im-fine"
                >
                  <Text style={styles.fineButtonText}>I'm fine</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.helpButton]}
                  onPress={handleNeedHelp}
                  testID="wellness-need-help"
                >
                  <Text style={styles.helpButtonText}>I need help</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {step === 'pin' && (
            <View style={styles.promptContainer}>
              <Text style={styles.pinTitle}>Enter your PIN to confirm</Text>
              <PinPad onSubmit={handlePinSubmit} errorText={pinError} />
            </View>
          )}

          {step === 'confirmed' && <WellnessConfirmation onDismiss={handleDismiss} />}

          {step === 'help_ack' && (
            <View style={styles.promptContainer}>
              <Text style={styles.promptTitle}>Help is on the way.</Text>
              <Text style={styles.helpAckBody}>
                Your team lead has been notified along with your last known location. Stay on
                the line if you can.
              </Text>
              <TouchableOpacity
                style={[styles.actionButton, styles.helpButton]}
                onPress={handleDismiss}
                testID="wellness-help-ack-dismiss"
              >
                <Text style={styles.helpButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.safetyBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 3,
    borderTopColor: colors.safety,
    padding: spacing.lg,
    minHeight: 260,
  },
  promptContainer: { alignItems: 'center' },
  promptTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  pinTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: spacing.md },
  buttonRow: { flexDirection: 'row', width: '100%', gap: 12 },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginHorizontal: 6,
  },
  fineButton: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.text },
  fineButtonText: { fontWeight: '700', color: colors.text, fontSize: 16 },
  helpButton: { backgroundColor: colors.safety },
  helpButtonText: { fontWeight: '700', color: '#fff', fontSize: 16 },
  helpAckBody: { color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg },
});
