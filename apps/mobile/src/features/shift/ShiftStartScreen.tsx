import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppContext } from '../../state/AppContext';
import { getActiveWalkbook, type Walkbook } from '../../db/localData';
import { ConsentScreen } from './ConsentScreen';
import { ApiError } from '../../api/client';
import { colors, spacing } from '../../ui/theme';

// Demo fixed IDs from docs/API_CONTRACT.md's db/seed.sql section.
const DEMO_CAMPAIGN_ID = '00000000-0000-0000-0000-000000000002';
const DEMO_DEVICE_ID = 'demo-device-001';

interface Props {
  onShiftStarted: (shift: { id: string; photoIntervalProfileId: string }) => void;
}

export function ShiftStartScreen({ onShiftStarted }: Props) {
  const { db, api } = useAppContext();
  const [walkbook, setWalkbook] = useState<Walkbook | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    getActiveWalkbook(db).then(setWalkbook);
  }, [db]);

  async function handleStartShift(consentRecordIds: string[]) {
    setStarting(true);
    setError(null);
    try {
      const res = await api.startShift({
        campaignId: DEMO_CAMPAIGN_ID,
        deviceId: DEMO_DEVICE_ID,
        consentRecordIds,
      });
      onShiftStarted({ id: res.id, photoIntervalProfileId: res.photoIntervalProfileId });
    } catch (err) {
      if (err instanceof ApiError && err.body.error === 'consent_missing') {
        setError('Consent is missing: ' + (err.body.missing ?? []).join(', '));
      } else if (err instanceof ApiError && err.body.error === 'license_missing') {
        setError(`This campaign isn't licensed to operate in ${err.body.state ?? 'this state'}.`);
      } else if (err instanceof ApiError) {
        setError(err.body.message ?? err.body.error);
      } else {
        setError(
          'Could not reach the server to start the shift. The door screen still works ' +
            'offline once a shift exists locally, but starting one currently requires the API.'
        );
      }
      setShowConsent(false);
    } finally {
      setStarting(false);
    }
  }

  if (showConsent) {
    return (
      <ConsentScreen onAccept={handleStartShift} onCancel={() => setShowConsent(false)} />
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Today's walkbook</Text>
      {walkbook ? (
        <View style={styles.card}>
          <Text style={styles.walkbookName}>{walkbook.name}</Text>
          {walkbook.turfName ? <Text style={styles.turfName}>{walkbook.turfName}</Text> : null}
          <Text style={styles.doorCount}>{walkbook.doorCount} doors assigned</Text>
        </View>
      ) : (
        <Text style={styles.textMuted}>No walkbook synced locally yet.</Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, starting && styles.buttonDisabled]}
        disabled={starting}
        onPress={() => setShowConsent(true)}
        testID="shift-start-button"
      >
        {starting ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : (
          <Text style={styles.buttonText}>Start shift</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  walkbookName: { fontSize: 20, fontWeight: '700', color: colors.text },
  turfName: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  doorCount: { fontSize: 14, color: colors.textMuted, marginTop: spacing.sm },
  textMuted: { color: colors.textMuted, marginBottom: spacing.lg },
  error: { color: colors.danger, marginBottom: spacing.md },
  button: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
});
