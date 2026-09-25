import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { AddressWithHousehold } from '../../db/localData';
import { colors, spacing } from '../../ui/theme';

interface Props {
  address: AddressWithHousehold;
  selectedVoterId: string | null;
  onSelectVoter: (voterId: string | null) => void;
  onWholeHouseholdNobodyHome: () => void;
}

export function HouseholdList({
  address,
  selectedVoterId,
  onSelectVoter,
  onWholeHouseholdNobodyHome,
}: Props) {
  return (
    <View>
      <TouchableOpacity
        style={styles.nobodyHomeButton}
        onPress={onWholeHouseholdNobodyHome}
        testID="whole-household-nobody-home"
      >
        <Text style={styles.nobodyHomeText}>Whole household — nobody home</Text>
      </TouchableOpacity>

      {address.household.displayName ? (
        <Text style={styles.householdName}>{address.household.displayName}</Text>
      ) : null}

      {address.voters.map((voter) => (
        <TouchableOpacity
          key={voter.id}
          style={[styles.voterRow, selectedVoterId === voter.id && styles.voterRowSelected]}
          onPress={() => onSelectVoter(selectedVoterId === voter.id ? null : voter.id)}
          testID={`voter-${voter.id}`}
        >
          <Text style={styles.voterName}>
            {voter.firstName} {voter.lastName}
          </Text>
          {voter.isTarget ? <Text style={styles.targetBadge}>Target</Text> : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  nobodyHomeButton: {
    backgroundColor: colors.text,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  nobodyHomeText: { color: colors.surface, fontWeight: '700', fontSize: 15 },
  householdName: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.xs },
  voterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: 6,
    backgroundColor: colors.surface,
  },
  voterRowSelected: { borderColor: colors.primary, borderWidth: 2 },
  voterName: { fontSize: 14, color: colors.text },
  targetBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
