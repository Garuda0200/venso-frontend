import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeNominalRoster } from '../../../passengerDraft.js';

const passenger = (id, key, voucher = null) => ({
  id_pasajero: id, passenger_key: key, voucher_venta_id: voucher,
  tipo_pasajero: key.startsWith('child') ? 'child' : 'adult',
});
const ids = data => [...data.adults, ...data.children].map(row => row.id_pasajero);

test('voucher-only identities retain their IDs when quote rows describe the same slots', () => {
  const existing = [passenger(10, 'adult-1', 7), passenger(11, 'adult-2', 7)];
  const quoted = [passenger(20, 'adult-1'), passenger(21, 'adult-2'), passenger(22, 'child-1')];
  assert.deepEqual(ids(mergeNominalRoster(quoted, { adults: existing })), [10, 11, 22]);
});

test('zero-based colon keys preserve historical identities and admit the new adult and child', () => {
  const existing = [passenger(10, 'adult:0', 7), passenger(11, 'adult:1', 7)];
  const quoted = [passenger(20, 'adult-1'), passenger(21, 'adult-2'),
    passenger(22, 'adult-3'), passenger(23, 'child-1'), passenger(24, 'child-1')];
  assert.deepEqual(ids(mergeNominalRoster(quoted, { adults: existing })), [10, 11, 22, 23]);
});

test('a passenger owned by a different voucher is never inferred into the current roster', () => {
  assert.deepEqual(ids(mergeNominalRoster([
    passenger(10, 'adult-1', 99), passenger(20, 'adult-2'),
  ], {})), [20]);
});

test('quote placeholders without database IDs keep their distinct commercial slots', () => {
  const data = mergeNominalRoster([passenger(null, 'adult-1'), passenger(null, 'adult-2')], {});
  assert.equal(data.adults.length, 2);
  assert.deepEqual(data.adults.map(row => row.passenger_key), ['adult-1', 'adult-2']);
});
