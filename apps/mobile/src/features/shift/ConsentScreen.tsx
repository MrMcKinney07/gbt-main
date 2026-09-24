import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing } from '../../ui/theme';

/**
 * Consent copy drafted from the build prompt's own required disclosure content
 * (sections 5.2, 8.6, 11.3, 11.3a) — see docs/SCOPE.md item 5: this has NOT had a legal
 * review and must get one before use on a real canvass. It is real, specific copy, not
 * lorem ipsum, because the acceptance gate below is meant to be affirmative and informed.
 */
// `consentRecordId` maps a checklist item to a real, pre-existing `consent_records` row
// (db/seed.sql) so the API's POST /shifts/start can actually verify it -- the route requires
// `z.string().uuid()` entries that resolve to a `consent_type` the consent-gate checks
// (currently just `location_tracking`; see apps/api/src/repositories/core.ts
// hasLocationTrackingConsent). Two of the four checklist items ("contact_data", "retention")
// are informational disclosure only and have no corresponding `consent_type` in this build's
// schema, so they're shown and must still be checked, but contribute no id to the request.
//
// This whole mapping is a stand-in for a real consent-issuance flow, which doesn't exist yet:
// there is no POST /consent-records (record a fresh grant) or GET /consent-records (look up
// this user's existing grants) in docs/API_CONTRACT.md. A production build needs one of
// those -- hardcoding the demo's known consent_record ids here is only valid against
// db/seed.sql's fixed UUIDs.
const CONSENT_ITEMS: { id: string; heading: string; body: string; consentRecordId?: string }[] = [
  {
    id: 'location',
    consentRecordId: '00000000-0000-0000-0000-000000000040',
    heading: 'Location',
    body:
      'While your shift is active, this app records your approximate location roughly every ' +
      'few minutes, plus at the moment you log each door. This is used to show your team ' +
      'lead the turf you’ve covered and, if you use the SOS button or don’t respond to a ' +
      'wellness check, your last known location. Location recording stops automatically the ' +
      'moment you end your shift — it is never collected outside a shift.',
  },
  {
    id: 'photos',
    consentRecordId: '00000000-0000-0000-0000-000000000041',
    heading: 'Photo verification',
    body:
      'A few times per shift, at moments this app chooses at random, you’ll be asked to take ' +
      'a photo of the street or house number (never of a person) to confirm you’re where ' +
      'your door log says you are. These photos are reviewed for accountability and are not ' +
      'shared publicly.',
  },
  {
    id: 'contact_data',
    heading: 'Contact attempt records',
    body:
      'Each door you log — who you spoke with, what they said, and when — is stored under your ' +
      'account and is visible to your team lead and campaign staff who manage your turf.',
  },
  {
    id: 'retention',
    heading: 'Who sees this, and for how long',
    body:
      'Your team lead and campaign field staff can see your production stats and, separately, ' +
      'whether a safety check was ever needed — those two views are kept apart and staff who ' +
      'see one do not automatically see the other. Data is retained per your campaign’s and ' +
      'state’s record-keeping rules and is deleted when no longer required by those rules.',
  },
];

interface Props {
  onAccept: (consentRecordIds: string[]) => void;
  onCancel: () => void;
}

export function ConsentScreen({ onAccept, onCancel }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const allChecked = CONSENT_ITEMS.every((item) => checked[item.id]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Before you start your shift</Text>
        <Text style={styles.intro}>
          Please read each item below and check it to confirm you understand. You can end your
          shift at any time, which stops all data collection described here.
        </Text>

        {CONSENT_ITEMS.map((item) => (
          <View key={item.id} style={styles.item}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemHeading}>{item.heading}</Text>
              <Switch
                testID={`consent-switch-${item.id}`}
                value={Boolean(checked[item.id])}
                onValueChange={(v) => setChecked((prev) => ({ ...prev, [item.id]: v }))}
              />
            </View>
            <Text style={styles.itemBody}>{item.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelText}>Not now</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.acceptButton, !allChecked && styles.acceptButtonDisabled]}
          disabled={!allChecked}
          onPress={() =>
            onAccept(
              CONSENT_ITEMS.map((i) => i.consentRecordId).filter(
                (id): id is string => id !== undefined
              )
            )
          }
          testID="consent-accept"
        >
          <Text style={styles.acceptText}>I understand — start shift</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  intro: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 20 },
  item: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemHeading: { fontSize: 16, fontWeight: '600', color: colors.text, flex: 1, marginRight: spacing.sm },
  itemBody: { fontSize: 13, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 19 },
  footer: {
    flexDirection: 'row',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  cancelButton: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  cancelText: { color: colors.textMuted, fontSize: 15 },
  acceptButton: {
    flex: 2,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  acceptButtonDisabled: { opacity: 0.4 },
  acceptText: { color: colors.primaryText, fontSize: 15, fontWeight: '600' },
});
