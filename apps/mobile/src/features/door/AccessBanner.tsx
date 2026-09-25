import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { AccessStatus } from '../../db/localData';
import { colors, spacing } from '../../ui/theme';

const STATUS_META: Record<AccessStatus, { label: string; color: string }> = {
  none: { label: 'No access notes', color: colors.accessNone },
  gate: { label: 'Locked gate', color: colors.accessCaution },
  dog: { label: 'Dog on property', color: colors.accessCaution },
  locked_building: { label: 'Locked building / needs buzz-in', color: colors.accessLocked },
  no_soliciting: { label: 'No soliciting posted', color: colors.accessNoSoliciting },
};

const STATUS_OPTIONS: AccessStatus[] = ['none', 'gate', 'dog', 'locked_building', 'no_soliciting'];

interface Props {
  status: AccessStatus;
  notes: string | null;
  onUpdate: (status: AccessStatus, notes: string | null) => void;
}

/**
 * Color-coded access banner. It is "dismissible only by acting on it": there is no plain
 * close/X — the canvasser has to either confirm the current status is still accurate or pick
 * a new one (optionally with a note), and that choice is what re-collapses the banner.
 */
export function AccessBanner({ status, notes, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [draftNotes, setDraftNotes] = useState(notes ?? '');
  const meta = STATUS_META[status];

  if (!expanded) {
    return (
      <TouchableOpacity
        style={[styles.collapsed, { backgroundColor: meta.color }]}
        onPress={() => setExpanded(true)}
        testID="access-banner"
      >
        <Text style={styles.collapsedText}>{meta.label}</Text>
        {notes ? <Text style={styles.collapsedNotes}>{notes}</Text> : null}
        <Text style={styles.collapsedAction}>Update</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.expanded}>
      <Text style={styles.expandedTitle}>Access status for this door</Text>
      <View style={styles.optionsRow}>
        {STATUS_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[
              styles.optionChip,
              { borderColor: STATUS_META[opt].color },
              status === opt && { backgroundColor: STATUS_META[opt].color },
            ]}
            onPress={() => {
              onUpdate(opt, draftNotes.trim() ? draftNotes.trim() : null);
              setExpanded(false);
            }}
            testID={`access-option-${opt}`}
          >
            <Text style={status === opt ? styles.optionTextSelected : styles.optionText}>
              {STATUS_META[opt].label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.notesInput}
        placeholder="Optional note (e.g. use side gate)"
        value={draftNotes}
        onChangeText={setDraftNotes}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  collapsed: {
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  collapsedText: { fontWeight: '700', color: colors.text },
  collapsedNotes: { color: colors.text, marginTop: 2, fontSize: 13 },
  collapsedAction: { marginTop: spacing.xs, fontSize: 12, fontWeight: '600', color: colors.text },
  expanded: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  expandedTitle: { fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
    marginBottom: 6,
  },
  optionText: { fontSize: 12, color: colors.text },
  optionTextSelected: { fontSize: 12, color: colors.text, fontWeight: '700' },
  notesInput: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: spacing.sm,
    fontSize: 14,
  },
});
