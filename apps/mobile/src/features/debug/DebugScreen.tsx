import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppContext } from '../../state/AppContext';
import { getAll, type OutboxRow } from '../../db/outbox';
import { colors, spacing } from '../../ui/theme';

interface Props {
  onSimulateWellnessCheck: () => void;
  onClose: () => void;
}

/**
 * Dev-only debug screen. Not gated behind __DEV__ in this scaffold so it's easy to reach for
 * review, but "Debug menu" is a deliberately unglamorous link on the door screen rather than
 * a real nav destination — a shipped build should remove it or gate it behind __DEV__.
 *
 * "Simulate wellness check" stands in for the real trigger, which is server-side: the server
 * watches for an absence of door activity + movement and pushes/exposes a wellness check
 * (docs/API_CONTRACT.md's wellness-checks endpoints). This build doesn't implement that
 * server-side watchdog or a client poll for it — see README "What's stubbed".
 */
export function DebugScreen({ onSimulateWellnessCheck, onClose }: Props) {
  const { db } = useAppContext();
  const [outboxRows, setOutboxRows] = useState<OutboxRow[]>([]);

  useEffect(() => {
    if (!db) return;
    getAll(db).then(setOutboxRows);
  }, [db]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Debug menu</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={onSimulateWellnessCheck}
        testID="debug-simulate-wellness"
      >
        <Text style={styles.buttonText}>Simulate wellness check</Text>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>Outbox ({outboxRows.length} rows)</Text>
      {outboxRows.map((row) => (
        <View key={row.id} style={styles.outboxRow}>
          <Text style={styles.outboxType}>{row.entityType}</Text>
          <Text style={styles.outboxMeta}>
            {row.syncedAt ? `synced ${row.syncedAt}` : `pending (${row.syncAttempts} attempts)`}
          </Text>
        </View>
      ))}

      <TouchableOpacity style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeButtonText}>Back to door screen</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },
  button: {
    backgroundColor: colors.safety,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: spacing.sm },
  outboxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
  },
  outboxType: { fontSize: 13, color: colors.text, fontWeight: '600' },
  outboxMeta: { fontSize: 12, color: colors.textMuted },
  closeButton: { marginTop: spacing.xl, alignItems: 'center' },
  closeButtonText: { color: colors.primary, fontSize: 14 },
});
