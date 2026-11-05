import test from 'node:test';
import assert from 'node:assert/strict';
import { documentListingData, hydrateDocumentDraft, reconcileDocumentListing } from '../documentListing.js';

const roster = [
  { passengerKey: 'adult-0', id_pasajero: 42 },
  { passengerKey: 'adult-1', id_pasajero: 51 },
  { passengerKey: 'child-0', id_pasajero: 75 },
];
const groups = (passports = [], idCards = [], otherDocuments = []) => ({ passports, idCards, otherDocuments });
const absolute = value => value ? 'http://local' + value : null;
const legacy = value => '/legacy/' + value;

test('canonical wizard draft survives unmount/remount in every category, including pending Files', () => {
  const file = new Blob(['synthetic'], { type: 'image/png' });
  const draft = {
    'adult-0': groups([{ id: 10, dbId: 10, ownerId: 42, proxyUrl: '/proxy/10', isFromDatabase: true }]),
    'adult-1': groups([], [{ id: 'pending', ownerId: 51, fileObject: file, dataUrl: 'data:fixture', isPending: true }]),
    'child-0': groups([], [], [{ id: 12, ownerId: 75, tigrisUrl: 'fixture.pdf' }]),
  };
  const result = hydrateDocumentDraft(roster, draft, absolute, legacy);
  assert.equal(result.get('adult-0').passports[0].dataUrl, 'http://local/proxy/10');
  assert.equal(result.get('adult-1').idCards[0].fileObject, file);
  assert.equal(result.get('adult-1').idCards[0].isPending, true);
  assert.equal(result.get('child-0').otherDocuments[0].dataUrl, '/legacy/fixture.pdf');
  assert.equal(draft['adult-0'].passports[0].dataUrl, undefined);
});

test('legacy flat and DB-id-keyed drafts map by persisted ownership, never array order or names', () => {
  const file = { id: 1, ownerId: 75, passengerKey: 'adult-0', name: 'untrusted-name' };
  for (const draft of [{ passports: [file] }, { 'adult-999': groups([file]) }]) {
    const result = hydrateDocumentDraft(roster, draft, absolute, legacy);
    assert.equal(result.get('child-0').passports.length, 1);
    assert.equal(result.get('adult-0').passports.length, 0);
  }
  const missingOwner = hydrateDocumentDraft(roster, { 'adult-0': groups([{ ownerId: 999 }]) }, absolute, legacy);
  assert.equal(missingOwner.get('adult-0').passports.length, 0);
  const unsaved = hydrateDocumentDraft([{ passengerKey: 'adult-0' }], { 'adult-0': groups([{ id: 'pending' }]) }, absolute, legacy);
  assert.equal(unsaved.get('adult-0').passports.length, 1);
});

test('backend, service and API response envelopes expose the same categories', () => {
  const data = groups([{ id: 10, passengerId: 42, proxyUrl: '/proxy/10' }]);
  for (const response of [data, { data }, { success: true, data: { success: true, data } }]) {
    assert.equal(documentListingData(response), data);
    assert.equal(reconcileDocumentListing(roster, new Map(), response, absolute).documents.get('adult-0').passports[0].dbId, 10);
  }
});

test('stale empty listing preserves session confirmations and pending uploads without duplicate files', () => {
  const current = new Map([['adult-0', groups([{ id: 10, dbId: 10, isFromDatabase: true }, { id: 'pending', fileObject: {} }])]]);
  const empty = reconcileDocumentListing(roster, current, groups(), absolute, { preserveSaved: true });
  assert.equal(empty.documents.get('adult-0').passports.length, 2);
  const fresh = reconcileDocumentListing(roster, empty.documents, groups([{ id: 10, passengerId: 42 }]), absolute, { preserveSaved: true });
  assert.equal(fresh.documents.get('adult-0').passports.length, 2);
  const deleted = reconcileDocumentListing(roster, fresh.documents, groups([{ id: 10, passengerId: 42 }]), absolute,
    { preserveSaved: true, excludedIds: new Set(['10']) });
  assert.deepEqual(deleted.documents.get('adult-0').passports.map(doc => doc.id), ['pending']);
});

test('server reassignment outranks old session owner and moves a file only once', () => {
  const current = new Map([['adult-0', groups([{ id: 10, dbId: 10, isFromDatabase: true }])]]);
  const reassigned = reconcileDocumentListing(roster, current, groups([{ id: 10, passengerId: 75 }]), absolute, { preserveSaved: true });
  assert.equal(reassigned.documents.get('adult-0').passports.length, 0);
  assert.equal(reassigned.documents.get('child-0').passports.length, 1);
  const unassigned = reconcileDocumentListing(roster, current, groups([{ id: 10, passengerId: null }]), absolute, { preserveSaved: true });
  assert.equal(unassigned.documents.get('adult-0').passports.length, 0);
  assert.equal(unassigned.unassigned.length, 1);
});
