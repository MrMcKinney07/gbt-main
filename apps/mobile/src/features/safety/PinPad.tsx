import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing } from '../../ui/theme';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

interface Props {
  length?: number;
  onSubmit: (pin: string) => void;
  errorText?: string | null;
}

/**
 * Plain numeric PIN pad. Deliberately has no visual concept of "which PIN" was entered —
 * it just collects digits and calls onSubmit once `length` digits are entered. That is what
 * makes the duress-vs-normal PIN paths downstream indistinguishable in the UI: this
 * component's rendering never depends on whether the digits match the normal or duress PIN.
 */
export function PinPad({ length = 4, onSubmit, errorText }: Props) {
  const [pin, setPin] = useState('');

  function press(key: string) {
    if (key === '') return;
    if (key === 'del') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = (pin + key).slice(0, length);
    setPin(next);
    if (next.length === length) {
      onSubmit(next);
      setPin('');
    }
  }

  return (
    <View>
      <View style={styles.dotsRow} testID="pin-dots">
        {Array.from({ length }).map((_, i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </View>
      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      <View style={styles.grid}>
        {DIGITS.map((d, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.key, d === '' && styles.keyHidden]}
            onPress={() => press(d)}
            disabled={d === ''}
            testID={`pin-key-${d || 'blank'}-${i}`}
          >
            <Text style={styles.keyText}>{d === 'del' ? '⌫' : d}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dotsRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.md, gap: 12 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    marginHorizontal: 6,
  },
  dotFilled: { backgroundColor: colors.text, borderColor: colors.text },
  errorText: { color: colors.danger, textAlign: 'center', marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 240, alignSelf: 'center' },
  key: { width: 80, height: 64, alignItems: 'center', justifyContent: 'center' },
  keyHidden: { opacity: 0 },
  keyText: { fontSize: 24, color: colors.text },
});
