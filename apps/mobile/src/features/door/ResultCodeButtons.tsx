import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ContactResultCode } from '../../api/types';
import { colors, spacing } from '../../ui/theme';

/** Every result code from docs/API_CONTRACT.md's contact-attempts shape. */
const RESULT_CODES: { code: ContactResultCode; label: string }[] = [
  { code: 'spoke_with_target', label: 'Spoke with target' },
  { code: 'spoke_with_other', label: 'Spoke with other' },
  { code: 'not_home', label: 'Not home' },
  { code: 'refused', label: 'Refused' },
  { code: 'moved', label: 'Moved' },
  { code: 'deceased', label: 'Deceased' },
  { code: 'language_barrier', label: 'Language barrier' },
  { code: 'inaccessible_gate', label: 'Inaccessible: gate' },
  { code: 'inaccessible_locked_building', label: 'Inaccessible: locked building' },
  { code: 'inaccessible_dog', label: 'Inaccessible: dog' },
  { code: 'vacant', label: 'Vacant' },
  { code: 'wrong_address', label: 'Wrong address' },
  { code: 'left_literature', label: 'Left literature' },
];

interface Props {
  selected: ContactResultCode | null;
  onSelect: (code: ContactResultCode) => void;
}

export function ResultCodeButtons({ selected, onSelect }: Props) {
  return (
    <View style={styles.grid}>
      {RESULT_CODES.map((rc) => (
        <TouchableOpacity
          key={rc.code}
          style={[styles.button, selected === rc.code && styles.buttonSelected]}
          onPress={() => onSelect(rc.code)}
          testID={`result-code-${rc.code}`}
        >
          <Text style={[styles.buttonText, selected === rc.code && styles.buttonTextSelected]}>
            {rc.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
  button: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  buttonSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  buttonText: { fontSize: 13, color: colors.text },
  buttonTextSelected: { color: colors.primaryText, fontWeight: '600' },
});
