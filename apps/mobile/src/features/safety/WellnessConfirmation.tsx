import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing } from '../../ui/theme';

interface Props {
  onDismiss: () => void;
}

/**
 * Purely presentational. This is the screen shown after either PIN is entered — it has no
 * prop, state, or branch that could reveal which one. See
 * test/duress-parity.test.tsx, which renders the "I'm fine" flow via both PINs and asserts
 * the two resulting trees are identical.
 */
export function WellnessConfirmation({ onDismiss }: Props) {
  return (
    <View style={styles.container} testID="wellness-confirmation">
      <Text style={styles.title}>Thanks — glad you're okay.</Text>
      <Text style={styles.body}>Keep going, and reach out any time if that changes.</Text>
      <TouchableOpacity style={styles.button} onPress={onDismiss} testID="wellness-confirm-dismiss">
        <Text style={styles.buttonText}>OK</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  body: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg },
  button: {
    backgroundColor: colors.text,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
  },
  buttonText: { color: colors.surface, fontWeight: '700' },
});
