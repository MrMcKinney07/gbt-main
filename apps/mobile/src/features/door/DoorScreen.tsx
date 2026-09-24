import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { useAppContext } from '../../state/AppContext';
import { getActiveWalkbook, getAddressesForWalkbook, type AddressWithHousehold } from '../../db/localData';
import { recordContactAttempt, recordAccessReport } from '../../db/writes';
import { countPending } from '../../db/outbox';
import type { ContactResultCode } from '../../api/types';
import { AccessBanner } from './AccessBanner';
import { HouseholdList } from './HouseholdList';
import { ResultCodeButtons } from './ResultCodeButtons';
import { SosButton } from '../safety/SosButton';
import { checkPhotoVerificationDue } from '../verification/verificationApi';
import { colors, spacing } from '../../ui/theme';

interface Props {
  shiftId: string;
  onVerificationDue: (verificationId: string) => void;
  onOpenDebug: () => void;
}

export function DoorScreen({ shiftId, onVerificationDue, onOpenDebug }: Props) {
  const { db, api, syncWorker } = useAppContext();
  const [addresses, setAddresses] = useState<AddressWithHousehold[]>([]);
  const [index, setIndex] = useState(0);
  const [selectedVoterId, setSelectedVoterId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [lastLogged, setLastLogged] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const loadAddresses = useCallback(async () => {
    if (!db) return;
    const wb = await getActiveWalkbook(db);
    if (!wb) return;
    const rows = await getAddressesForWalkbook(db, wb.id);
    setAddresses(rows);
  }, [db]);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const current = addresses[index] ?? null;

  async function getGeom(): Promise<{ lat: number; lng: number; accuracy: number }> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({});
        return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 0 };
      }
    } catch {
      // Location unavailable/denied — fall back to zeroed geom rather than blocking the
      // (offline-first) write. A real build would fall back to the address's stored lat/lng.
    }
    return { lat: 0, lng: 0, accuracy: 0 };
  }

  async function submitResult(resultCode: ContactResultCode) {
    if (!db || !current) return;

    const geom = await getGeom();
    await recordContactAttempt(db, {
      addressId: current.id,
      householdId: current.household.id || undefined,
      voterId: selectedVoterId ?? undefined,
      shiftId,
      arriveAt: new Date().toISOString(),
      arriveGeom: { lat: geom.lat, lng: geom.lng },
      arriveAccuracyM: geom.accuracy,
      resultCode,
      notes: notes.trim() ? notes.trim() : undefined,
    });

    // UI reflects the write immediately — no "saving…" spinner. Sync happens in the
    // background, whenever the sync worker's next trigger fires.
    setLastLogged(`${current.line1}: logged`);
    setNotes('');
    setSelectedVoterId(null);
    void syncWorker?.trigger('manual');
    void refreshPendingCount();

    // ACCOUNTABILITY check — a separate, unrelated concern from anything safety-related.
    // A failure here (e.g. API unreachable) must never block the door screen.
    try {
      const status = await checkPhotoVerificationDue(api, shiftId);
      if (status.due && status.verificationId) {
        onVerificationDue(status.verificationId);
      }
    } catch {
      // offline or API not up yet — fine, we'll check again after the next contact attempt.
    }

    goNext();
  }

  async function refreshPendingCount() {
    if (!db) return;
    setPendingCount(await countPending(db));
  }

  useEffect(() => {
    refreshPendingCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  function goNext() {
    setIndex((i) => Math.min(i + 1, Math.max(addresses.length - 1, 0)));
  }

  if (!current) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No more doors in this walkbook.</Text>
        <SosButton shiftId={shiftId} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.addressHeader}>
          <Text style={styles.address}>{current.line1}</Text>
          {current.unit ? <Text style={styles.unit}>{current.unit}</Text> : null}
          <Text style={styles.doorProgress}>
            Door {index + 1} of {addresses.length}
            {pendingCount > 0 ? ` · ${pendingCount} pending sync` : ''}
          </Text>
        </View>

        <AccessBanner
          status={current.accessStatus}
          notes={current.accessNotes}
          onUpdate={async (status, addrNotes) => {
            if (!db) return;
            await recordAccessReport(db, { addressId: current.id, accessStatus: status, notes: addrNotes });
            await loadAddresses();
            void syncWorker?.trigger('manual');
            void refreshPendingCount();
          }}
        />

        <HouseholdList
          address={current}
          selectedVoterId={selectedVoterId}
          onSelectVoter={setSelectedVoterId}
          onWholeHouseholdNobodyHome={() => submitResult('not_home')}
        />

        <Text style={styles.sectionLabel}>Result</Text>
        <ResultCodeButtons selected={null} onSelect={submitResult} />

        <Text style={styles.sectionLabel}>Notes</Text>
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional notes about this door"
          multiline
          testID="door-notes"
        />

        {lastLogged ? <Text style={styles.lastLogged}>{lastLogged}</Text> : null}

        <TouchableOpacity style={styles.nextButton} onPress={goNext} testID="next-door">
          <Text style={styles.nextButtonText}>Next door</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.debugLink} onPress={onOpenDebug}>
          <Text style={styles.debugLinkText}>Debug menu</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.sosBar}>
        <SosButton shiftId={shiftId} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  addressHeader: { marginBottom: spacing.md },
  address: { fontSize: 22, fontWeight: '700', color: colors.text },
  unit: { fontSize: 15, color: colors.textMuted },
  doorProgress: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: spacing.md, marginBottom: 4 },
  notesInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
    minHeight: 60,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
  lastLogged: { color: colors.primary, fontSize: 13, marginTop: spacing.sm },
  nextButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.text,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  nextButtonText: { color: colors.surface, fontWeight: '700' },
  debugLink: { marginTop: spacing.md, alignItems: 'center' },
  debugLinkText: { color: colors.textMuted, fontSize: 12 },
  sosBar: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, backgroundColor: colors.bg },
  emptyText: { color: colors.textMuted, fontSize: 15 },
});
