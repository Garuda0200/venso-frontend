import test from 'node:test';
import assert from 'node:assert/strict';
import { persistVoucherDocuments, documentSnapshot, mergeConfirmedDocuments } from '../../../../../../../services/voucherDocumentPersistence.js';
import { createDocumentAiService } from '../../../../../../../services/documentAiService.js';
import { identityBatchRows } from '../identityBatch.js';

function fixture(overrides = {}) {
  const documentData = { 'adult-0': { passports: [{ id: 'pending', fileObject: new Blob(['fixture'], { type: 'image/png' }), isPending: true, name: 'private-original-name.png' }] } };
  return { documentData, passengerData: { adults: [{ id_pasajero: 1 }], children: [] }, quote: 'AI-TEST', voucher: 1, code: 'FIXTURE', ...overrides };
}
function dependencies(overrides = {}) {
  return { ai: { capabilities: async () => ({ enabled: true, private_documents: true, can_manage: true }),
    uploadAsset: async input => ({ document: { id: 10, documentAssetId: 'asset-fixture', passengerId: input.passenger,
      documentoTipo: input.category, fileType: 'image/png', filename: 'document-opaque', tigrisUrl: null, proxyUrl: '/api/turismo/vouchers-venta/documentos/10/proxy' } }), ...overrides },
    legacyUpload: () => { throw new Error('Public upload MUST NOT run'); },
    legacyRegister: () => { throw new Error('Legacy register MUST NOT run'); }, privateProxy: value => value };
}
test('private upload binds persisted passenger/category and preserves authenticated preview', async () => {
  const input = fixture(); let calls = 0;
  const deps = dependencies({ uploadAsset: async body => { ++calls; assert.equal(body.passenger, 1); assert.equal(body.category, 'passport'); return dependencies().ai.uploadAsset(body); } });
  await persistVoucherDocuments(input, deps);
  const doc = input.documentData['adult-0'].passports[0];
  assert.equal(doc.documentAssetId, 'asset-fixture'); assert.equal(doc.passengerId, 1);
  assert.equal(doc.tigrisUrl, null); assert.equal(doc.fileObject, undefined); assert.equal(doc.isPending, undefined);
  assert.match(doc.dataUrl, /documentos\/10\/proxy$/);
  assert.equal(identityBatchRows(input.passengerData, input.documentData, { privateOnly: true })[0].eligible, true);
  await persistVoucherDocuments(input, deps); assert.equal(calls, 1);
});
test('capability failure sends no bytes and retains the pending File', async () => {
  const input = fixture(); let uploads = 0;
  await assert.rejects(() => persistVoucherDocuments(input, dependencies({ capabilities: async () => { throw new Error('blocked'); }, uploadAsset: () => { ++uploads; } })));
  assert.equal(uploads, 0); assert.ok(input.documentData['adult-0'].passports[0].fileObject);
});
test('private failure never falls back and a retry skips partial successes', async () => {
  const input = fixture(); input.documentData['adult-0'].passports.push({ fileObject: new Blob(['second']), isPending: true });
  let calls = 0;
  const deps = dependencies({ uploadAsset: async body => { if (++calls === 2) throw new Error('storage unavailable'); return dependencies().ai.uploadAsset(body); } });
  await assert.rejects(() => persistVoucherDocuments(input, deps));
  const docs = input.documentData['adult-0'].passports;
  assert.equal(docs[0].dbId, 10); assert.ok(docs[1].fileObject); assert.equal(docs[1].isPending, true);
  assert.notEqual(documentSnapshot(input.documentData)['adult-0'].passports[0], docs[0]);
  await persistVoucherDocuments(input, deps); assert.equal(calls, 3); assert.equal(docs[1].fileObject, undefined);
});
test('unsaved passenger or wrong backend owner/category stops private persistence', async () => {
  await assert.rejects(() => persistVoucherDocuments(fixture({ passengerData: { adults: [{}] } }), dependencies()), /Guarda los pasajeros/);
  const input = fixture();
  await assert.rejects(() => persistVoucherDocuments(input, dependencies({ uploadAsset: async () => ({ document: { id: 10, documentAssetId: 'fixture', passengerId: 2, documentoTipo: 'passport' } }) })), /vinculación privada/);
  assert.ok(input.documentData['adult-0'].passports[0].fileObject);
});
test('private processing excludes historical documents and unknown ownership without changing originals', () => {
  const input = fixture();
  const legacy = { dbId: 1, ownerId: 1, type: 'image/png', tigrisUrl: 'https://public.invalid/history' };
  input.documentData['adult-0'].passports = [legacy, { dbId: 2, documentAssetId: 'asset', type: 'image/png' }];
  assert.deepEqual(identityBatchRows(input.passengerData, input.documentData, { privateOnly: true })[0].documentIds, []);
  assert.equal(identityBatchRows(input.passengerData, input.documentData)[0].eligible, true);
  assert.equal(legacy.tigrisUrl, 'https://public.invalid/history');
});
test('multipart metadata precedes file and original filename never leaves the browser', async () => {
  let request;
  const api = createDocumentAiService({ post: async (...args) => { request = args; return { data: { asset_id: 'fixture' } }; } });
  await api.uploadAsset({ quote: 'AI-TEST', voucher: 1, passenger: 1, category: 'passport', file: new Blob(['fixture'], { type: 'image/png' }) });
  assert.equal(request[0], '/turismo/document-ai/assets');
  assert.deepEqual([...request[1].keys()], ['cotizacion_id', 'voucher_id', 'passenger_id', 'documento_tipo', 'file']);
  assert.equal(request[1].get('file').name, 'document'); assert.equal(request[2].timeout, 120000);
});
test('late private saves preserve newly added files and never resurrect removed documents', async () => {
  const input = fixture(); const current = documentSnapshot(input.documentData);
  current['adult-0'].passports.push({ id: 'added-during-save', fileObject: new Blob(['new']), isPending: true });
  await persistVoucherDocuments(input, dependencies());
  const merged = mergeConfirmedDocuments(current, input.documentData);
  assert.equal(merged['adult-0'].passports.length, 2); assert.equal(merged['adult-0'].passports[0].dbId, 10);
  assert.equal(merged['adult-0'].passports[0].fileObject, undefined); assert.equal(merged['adult-0'].passports[1].isPending, true);
  assert.deepEqual(mergeConfirmedDocuments({ 'adult-0': { passports: [] } }, input.documentData)['adult-0'].passports, []);
});
test('persistence uses an isolated snapshot before merging confirmed React state', async () => {
  const input = fixture(); const original = input.documentData;
  const snapshot = documentSnapshot(original);
  await persistVoucherDocuments({ ...input, documentData: snapshot }, dependencies());
  assert.ok(original['adult-0'].passports[0].fileObject);
  assert.equal(original['adult-0'].passports[0].dbId, undefined);
  const merged = mergeConfirmedDocuments(original, snapshot);
  assert.equal(merged['adult-0'].passports[0].dbId, 10);
  assert.equal(merged['adult-0'].passports[0].fileObject, undefined);
});
