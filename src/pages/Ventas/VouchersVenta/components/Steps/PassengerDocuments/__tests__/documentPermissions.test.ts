import test from 'node:test';
import assert from 'node:assert/strict';
import { canDeletePassengerDocument, hasPendingDocumentUploads } from '../documentPermissions.js';
import { persistVoucherDocuments } from '../../../../../../../services/voucherDocumentPersistence.js';

test('saved files require a positive server permission, never just a browser actor or matching passenger', () => {
  for (const document of [
    { dbId: 10, canDelete: false, createdBy: 'same-user' },
    { dbId: 10, createdBy: 'same-user' },
    { dbId: 10, canDelete: 'true' },
    { isFromDatabase: true, canDelete: false },
    { dbId: 10, canDelete: true, documentAssetId: 'private-evidence' },
  ]) assert.equal(canDeletePassengerDocument(document), false);
  assert.equal(canDeletePassengerDocument({ dbId: 10, canDelete: true }), true);
});

test('only an actual local pending File can be removed before registration', () => {
  assert.equal(canDeletePassengerDocument({ fileObject: new Blob(['synthetic']), isPending: true }), true);
  assert.equal(canDeletePassengerDocument({ id: 10 }), false);
  assert.equal(canDeletePassengerDocument(null), false);
});

test('close distinguishes saved documents from incomplete storage/DB registration', () => {
  assert.equal(hasPendingDocumentUploads({}), false);
  assert.equal(hasPendingDocumentUploads({ 'adult-0': { passports: [{ dbId: 10, isFromDatabase: true }] } }), false);
  assert.equal(hasPendingDocumentUploads({ 'child-0': { idCards: [{ isPending: true, tigrisUrl: 'synthetic' }] } }), true);
});

test('automatic legacy registration preserves the server audit and deletion capability', async () => {
  const document = { id: 'pending', isPending: true, tigrisUrl: 'synthetic', fileObject: new Blob(['synthetic']) };
  const input = { quote: 'SYNTHETIC', voucher: 7, code: 'SYNTHETIC', passengerData: { adults: [{ id_pasajero: 42 }] },
    documentData: { 'adult-0': { passports: [document] } } };
  await persistVoucherDocuments(input, {
    ai: { capabilities: async () => ({ can_manage: true, enabled: false }) },
    legacyPayload: doc => doc, privateProxy: url => url,
    legacyRegister: async () => ({ success: true, data: { id: 10, createdBy: 'authenticated-actor', canDelete: true } }),
  });
  assert.equal(document.createdBy, 'authenticated-actor'); assert.equal(document.canDelete, true);
  assert.equal(canDeletePassengerDocument(document), true);
});
