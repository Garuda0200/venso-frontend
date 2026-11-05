import test from 'node:test';
import assert from 'node:assert/strict';
import { persistVoucherDocuments, documentSnapshot, mergeConfirmedDocuments } from '../../../../../../../services/voucherDocumentPersistence.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(count = 1) {
  return { quote: 'SYNTHETIC', voucher: 7, code: 'SYNTHETIC',
    passengerData: { adults: [{ id_pasajero: 42 }], children: [] },
    documentData: { 'adult-0': { passports: Array.from({ length: count }, (_, index) =>
      ({ id: `pending-${index}`, fileObject: new Blob([`synthetic-${index}`]), isPending: true })) } } };
}
function legacy(overrides = {}) {
  let id = 100;
  return { ai: { capabilities: async () => ({ enabled: false, can_manage: true }) },
    legacyUpload: async () => ({ tigrisUrl: 'https://synthetic.invalid/opaque', metadata: { originalName: 'synthetic' } }),
    legacyRegister: async () => ({ success: true, data: { id: ++id, proxyUrl: `/proxy/${id}` } }),
    legacyFolder: () => 'synthetic', legacyProxy: value => value, privateProxy: value => value,
    legacyPayload: doc => ({ filename: doc.filename, url: doc.tigrisUrl }), ...overrides };
}

test('storage success survives a DB failure and retry does not upload the same file twice', async () => {
  const input = fixture(), original = input.documentData, snapshot = documentSnapshot(original);
  let uploads = 0, registrations = 0, progress = 0;
  const deps = legacy({
    legacyUpload: async (...args) => { ++uploads; return legacy().legacyUpload(...args); },
    legacyRegister: async () => { if (++registrations === 1) throw new Error('synthetic DB outage'); return { success: true, data: { id: 100 } }; },
    onProgress: () => { ++progress; },
  });
  await assert.rejects(persistVoucherDocuments({ ...input, documentData: snapshot }, deps), /DB outage/);
  const merged = mergeConfirmedDocuments(original, snapshot), pending = merged['adult-0'].passports[0];
  assert.ok(pending.tigrisUrl); assert.ok(pending.fileObject); assert.equal(pending.dbId, undefined);
  assert.equal(progress, 1);
  await persistVoucherDocuments({ ...input, documentData: merged }, deps);
  assert.equal(uploads, 1); assert.equal(registrations, 2);
  assert.equal(pending.dbId, 100); assert.equal(pending.fileObject, undefined);
});

test('a successful response without a database ID is not marked as saved', async () => {
  const input = fixture();
  await assert.rejects(persistVoucherDocuments(input, legacy({ legacyRegister: async () => ({ success: true, data: {} }) })), /vincular/);
  const pending = input.documentData['adult-0'].passports[0];
  assert.ok(pending.fileObject); assert.equal(pending.isPending, true); assert.equal(pending.isFromDatabase, undefined);
});

test('at most two uploads run simultaneously and every file is registered before completion', async () => {
  const input = fixture(5), gates = Array.from({ length: 5 }, deferred);
  let active = 0, maxActive = 0, started = 0, registered = 0;
  const operation = persistVoucherDocuments(input, legacy({
    legacyUpload: async () => {
      const index = started++; ++active; maxActive = Math.max(maxActive, active);
      await gates[index].promise; --active; return legacy().legacyUpload();
    },
    legacyRegister: async () => ({ success: true, data: { id: ++registered } }),
  }));
  await flush(); assert.equal(started, 2);
  gates[0].resolve(); await flush(); assert.equal(started, 3); assert.equal(registered, 1);
  gates[1].resolve(); await flush(); assert.equal(started, 4);
  gates[2].resolve(); await flush(); assert.equal(started, 5);
  gates[3].resolve(); gates[4].resolve(); await operation;
  assert.equal(maxActive, 2); assert.equal(registered, 5);
  assert.ok(input.documentData['adult-0'].passports.every(doc => doc.dbId && !doc.fileObject));
});

test('a failed upload stops new work and waits for the other in-flight confirmation before retry', async () => {
  const input = fixture(4), gates = [deferred(), deferred()];
  let started = 0, completed = false;
  const operation = persistVoucherDocuments(input, legacy({ legacyUpload: async () => {
    const index = started++; await gates[index].promise; return legacy().legacyUpload();
  } })).catch(error => { completed = true; return error; });
  await flush(); assert.equal(started, 2);
  gates[0].reject(new Error('synthetic upload failure')); await flush();
  assert.equal(completed, false); assert.equal(started, 2);
  gates[1].resolve(); assert.match((await operation).message, /upload failure/);
  const docs = input.documentData['adult-0'].passports;
  assert.ok(docs[0].fileObject); assert.ok(docs[1].dbId); assert.ok(docs[2].fileObject);
  let retried = 0;
  await persistVoucherDocuments(input, legacy({ legacyUpload: async () => { ++retried; return legacy().legacyUpload(); } }));
  assert.equal(retried, 3); assert.equal(started, 2);
});

test('a changed modal scope cannot start another upload', async () => {
  let uploads = 0;
  await assert.rejects(persistVoucherDocuments(fixture(), legacy({ isCurrent: () => false,
    legacyUpload: async () => { ++uploads; },
  })), /ficha cambió/);
  assert.equal(uploads, 0);
});

test('partial storage progress never overwrites an unrelated file without a client ID', () => {
  const current = { 'adult-0': { passports: [{ fileObject: new Blob(['unrelated']), isPending: true }] } };
  const processed = { 'adult-0': { passports: [{ tigrisUrl: 'https://synthetic.invalid/unrelated' }] } };
  assert.equal(mergeConfirmedDocuments(current, processed)['adult-0'].passports[0].tigrisUrl, undefined);
});

test('document upload permission is independent from identity editing permission', async () => {
  const input = fixture();
  await persistVoucherDocuments(input, legacy({ ai: { capabilities: async () => ({
    enabled: false, can_manage: false, can_upload_documents: true,
  }) } }));
  assert.ok(input.documentData['adult-0'].passports[0].dbId);
});

test('explicit document upload denial takes precedence over identity editing permission', async () => {
  let uploads = 0;
  await assert.rejects(persistVoucherDocuments(fixture(), legacy({
    ai: { capabilities: async () => ({ enabled: false, can_manage: true, can_upload_documents: false }) },
    legacyUpload: async () => { ++uploads; },
  })), /No tienes permiso/);
  assert.equal(uploads, 0);
});
