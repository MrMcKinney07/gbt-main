import type { SQLiteDatabase } from './types';

/**
 * Local mirror reads/writes for the data the door screen needs offline. In a full build
 * these tables are populated by a pull-sync against the server's walkbook/address/household
 * endpoints (not specified in docs/API_CONTRACT.md v0, which only covers the write path this
 * build focuses on). Here, `seedDemoWalkbookIfEmpty` stands in for that pull-sync so the app
 * has something to show on a fresh install — see README "What's stubbed".
 */

export interface Walkbook {
  id: string;
  name: string;
  turfName: string | null;
  doorCount: number;
}

export interface AddressWithHousehold {
  id: string;
  walkbookId: string;
  line1: string;
  unit: string | null;
  accessStatus: AccessStatus;
  accessNotes: string | null;
  household: { id: string; displayName: string | null };
  voters: { id: string; firstName: string; lastName: string; isTarget: boolean }[];
}

export type AccessStatus = 'none' | 'gate' | 'dog' | 'locked_building' | 'no_soliciting';

export async function getActiveWalkbook(db: SQLiteDatabase): Promise<Walkbook | null> {
  const row = await db.getFirstAsync<{
    id: string;
    name: string;
    turf_name: string | null;
    door_count: number;
  }>('SELECT * FROM walkbooks ORDER BY synced_at DESC LIMIT 1');
  if (!row) return null;
  return { id: row.id, name: row.name, turfName: row.turf_name, doorCount: row.door_count };
}

export async function getAddressesForWalkbook(
  db: SQLiteDatabase,
  walkbookId: string
): Promise<AddressWithHousehold[]> {
  const addressRows = await db.getAllAsync<{
    id: string;
    walkbook_id: string;
    line1: string;
    unit: string | null;
    access_status: AccessStatus;
    access_notes: string | null;
  }>('SELECT * FROM addresses WHERE walkbook_id = ? ORDER BY sort_order ASC', [walkbookId]);

  const result: AddressWithHousehold[] = [];
  for (const a of addressRows) {
    const household = await db.getFirstAsync<{ id: string; display_name: string | null }>(
      'SELECT * FROM households WHERE address_id = ? LIMIT 1',
      [a.id]
    );
    const voterRows = household
      ? await db.getAllAsync<{
          id: string;
          first_name: string;
          last_name: string;
          is_target: number;
        }>('SELECT * FROM voters WHERE household_id = ?', [household.id])
      : [];
    result.push({
      id: a.id,
      walkbookId: a.walkbook_id,
      line1: a.line1,
      unit: a.unit,
      accessStatus: a.access_status,
      accessNotes: a.access_notes,
      household: household
        ? { id: household.id, displayName: household.display_name }
        : { id: '', displayName: null },
      voters: voterRows.map((v) => ({
        id: v.id,
        firstName: v.first_name,
        lastName: v.last_name,
        isTarget: v.is_target === 1,
      })),
    });
  }
  return result;
}

export async function setAccessStatus(
  db: SQLiteDatabase,
  addressId: string,
  status: AccessStatus,
  notes: string | null
): Promise<void> {
  await db.runAsync('UPDATE addresses SET access_status = ?, access_notes = ? WHERE id = ?', [
    status,
    notes,
    addressId,
  ]);
}

/**
 * Demo/offline-first-proof-of-concept seed: a small walkbook with two doors.
 *
 * Every id below is a REAL UUID matching a real row in db/seed.sql -- not a placeholder. An
 * earlier version of this seed used invented, non-UUID string ids ("addr-demo-1", "hh-demo-1",
 * "voter-1", ...) with no corresponding server-side rows at all, which is fine for local-only
 * UI development but meant every contact-attempt this app ever recorded failed the API's
 * foreign-key/UUID validation the moment it tried to sync -- silently, since the batch
 * endpoint returns HTTP 200 with a per-item error rather than an HTTP-level failure. See
 * apps/mobile/README.md "Web preview" and docs/API_CONTRACT.md's "Demo fixed IDs" for the
 * full story. Because these now match real rows, this app's local household/voter model is
 * also intentionally simpler than the real schema (one voter per household, no second
 * "other resident" member) -- inventing a second local-only person here would recreate the
 * exact same bug the moment a canvasser selected them as the contact.
 */
export async function seedDemoWalkbookIfEmpty(db: SQLiteDatabase): Promise<void> {
  const existing = await getActiveWalkbook(db);
  if (existing) return;

  const walkbookId = '00000000-0000-0000-0000-0000000000a0'; // matches API_CONTRACT demo walkbook id
  await db.runAsync(
    'INSERT INTO walkbooks (id, name, turf_name, door_count, synced_at) VALUES (?, ?, ?, ?, ?)',
    [walkbookId, 'Sun Ray Estates A', 'Precinct 14', 2, new Date().toISOString()]
  );

  const addr1 = '00000000-0000-0000-0000-000000000070'; // 412 Oak St -- db/seed.sql
  const addr2 = '00000000-0000-0000-0000-0000000000c0'; // 414 Oak St Apt 2 -- db/seed.sql
  await db.runAsync(
    'INSERT INTO addresses (id, walkbook_id, line1, unit, lat, lng, sort_order, access_status, access_notes) VALUES (?,?,?,?,?,?,?,?,?)',
    [addr1, walkbookId, '412 Oak St', null, 38.5785, -121.4901, 1, 'none', null]
  );
  await db.runAsync(
    'INSERT INTO addresses (id, walkbook_id, line1, unit, lat, lng, sort_order, access_status, access_notes) VALUES (?,?,?,?,?,?,?,?,?)',
    [addr2, walkbookId, '414 Oak St', 'Apt 2', 38.5786, -121.4899, 2, 'dog', 'Large dog in yard, knock loudly']
  );

  const hh1 = '00000000-0000-0000-0000-000000000080'; // db/seed.sql
  const hh2 = '00000000-0000-0000-0000-0000000000c1'; // db/seed.sql
  await db.runAsync('INSERT INTO households (id, address_id, display_name) VALUES (?,?,?)', [
    hh1,
    addr1,
    'Gonzalez household',
  ]);
  await db.runAsync('INSERT INTO households (id, address_id, display_name) VALUES (?,?,?)', [
    hh2,
    addr2,
    'Alvarez household',
  ]);

  await db.runAsync(
    'INSERT INTO voters (id, household_id, first_name, last_name, is_target) VALUES (?,?,?,?,?)',
    ['00000000-0000-0000-0000-000000000090', hh1, 'Maria', 'Gonzalez', 1] // db/seed.sql
  );
  await db.runAsync(
    'INSERT INTO voters (id, household_id, first_name, last_name, is_target) VALUES (?,?,?,?,?)',
    ['00000000-0000-0000-0000-0000000000c2', hh2, 'Sofia', 'Alvarez', 1] // db/seed.sql
  );
}
