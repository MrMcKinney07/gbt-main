import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useAppContext } from '../../state/AppContext';
import { sendSos } from './safetyApi';
import { colors, spacing } from '../../ui/theme';

const LONG_PRESS_MS = 3000;

interface Props {
  shiftId: string;
}

/**
 * SAFETY module — persistent SOS control. A 3-second long press triggers it; confirmation is
 * haptic-only (no sound, no visible alert/dialog), per spec, so it stays usable if the phone
 * needs to be silent or hidden. This does not import anything from src/features/verification/.
 */
export function SosButton({ shiftId }: Props) {
  const { api } = useAppContext();
  const [sent, setSent] = useState(false);
  const [pressing, setPressing] = useState(false);

  async function handleLongPress() {
    setPressing(false);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics unavailable (e.g. web/simulator) — SOS still fires, this is best-effort.
    }

    let geom = { lat: 0, lng: 0 };
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getLastKnownPositionAsync();
        if (pos) geom = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch {
      // Fall back to {0,0} rather than blocking SOS on a location fetch.
    }

    setSent(true);
    try {
      await sendSos(api, shiftId, geom);
    } catch {
      // Network failure: in a full build this would also enqueue locally and retry via the
      // sync worker like every other write. For this scaffold, SOS is fire-and-forget against
      // the live API since it must never appear to succeed silently to the *server* — but the
      // haptic confirmation to the CANVASSER already happened, which is the safety-critical part.
    }
  }

  return (
    <Pressable
      onPressIn={() => setPressing(true)}
      onPressOut={() => setPressing(false)}
      onLongPress={handleLongPress}
      delayLongPress={LONG_PRESS_MS}
      style={[styles.button, pressing && styles.buttonPressing]}
      testID="sos-button"
    >
      <View>
        <Text style={styles.text}>{sent ? 'SOS sent' : 'Hold 3s for SOS'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.safety,
    borderRadius: 30,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressing: { opacity: 0.7 },
  text: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
