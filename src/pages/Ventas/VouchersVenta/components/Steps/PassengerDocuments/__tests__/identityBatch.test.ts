import test from 'node:test';
import { reconcileDocumentListing } from '../documentListing.js';
import assert from 'node:assert/strict';
import { identityBatchRows, defaultBatchSelection, missingFields, makeIdentityBatch, reviewableFields } from '../identityBatch.js';
import { createDocumentAiService } from '../../../../../../../services/documentAiService.js';
const complete = { id_pasajero: 1, nombres: 'ANA', apellidos: 'FIXTURE', numeroDocumento: '0000123', tipoDocumento: 'passport', fecha_nacimiento: '1990-01-01', fecha_caducidad: '2032-06-15', pais: 'México' };
const document = (id, ownerId, extra = {}) => ({ dbId: id, ownerId, type: 'image/jpeg', ...extra });
const data = { adults: [complete, { id_pasajero: 2, nombres: 'PEDRO' }], children: [{ id_pasajero: 3 }] };

test('expiry can be reviewed on sold quotes but cannot overwrite saved values', () => {
  assert.deepEqual(reviewableFields({ ...complete, fecha_caducidad: null }, { fecha_caducidad: '2032-06-15' }, true), ['fecha_caducidad']);
  assert.deepEqual(reviewableFields(complete, { fecha_caducidad: '2033-01-01' }, false), []);
  assert.deepEqual(reviewableFields({ ...complete, fecha_caducidad: null }, { fecha_caducidad: null }, false), []);
});

test('hybrid readiness admits historical and private evidence, without foreign owners or complete pax', () => {
  const map = new Map([['adult-0', { passports: [document(10, 1)] }], ['adult-1', { passports: [document(11, 2), document(12, 2, { documentAssetId: 'private' }), document(13, 999)] }]]);
  const unassignedDocuments = [{ id: 20, documentoTipo: 'passport', type: 'application/pdf' }, { id: 21, documentoTipo: 'idcard', type: 'image/png', documentAssetId: 'private' }, { id: 22, documentoTipo: 'other', type: 'application/pdf' }];
  const rows = identityBatchRows(data, map, { privateOnly: true, allowHistorical: true, unassignedDocuments });
  assert.equal(rows[0].eligible, false);
  assert.deepEqual(rows[1].documentIds, [11, 12]);
  assert.deepEqual(rows.filter(row => row.type === 'unassigned').map(row => row.documentIds[0]), [20, 21]);
  assert.deepEqual(makeIdentityBatch(rows, ['adult-1', 'unassigned-20', 'unassigned-21'], 'QUOTE', 1, 'key').document_groups, [{ selected_passenger_id: 2, document_ids: [11, 12] }, { selected_passenger_id: null, document_ids: [20, 21] }]);
  assert.deepEqual(identityBatchRows(data, map, { privateOnly: true }).find(row => row.key === 'adult-1').documentIds, [12]);
});
test('unordered private documents produce unselected-owner groups, never historical or foreign sources', () => {
  const documents = [
    { id: 20, passengerId: null, documentoTipo: 'passport', documentAssetId: 'private', type: 'application/pdf' },
    { id: 21, passengerId: null, documentoTipo: 'idcard', documentAssetId: 'private2', type: 'image/png' },
    { id: 22, passengerId: null, documentoTipo: 'passport', type: 'image/png' },
    { id: 23, passengerId: 999, documentoTipo: 'passport', documentAssetId: 'foreign', type: 'image/png' },
    { id: 24, passengerId: null, documentoTipo: 'other', documentAssetId: 'ticket', type: 'application/pdf' },
  ];
  const rows = identityBatchRows(data, new Map(), { privateOnly: true, unassignedDocuments: documents });
  assert.deepEqual(rows.filter(row => row.type === 'unassigned').map(row => row.documentIds[0]), [20, 21]);
  assert.deepEqual(makeIdentityBatch(rows, ['unassigned-21', 'unassigned-20'], 'QUOTE', 1, 'key').document_groups,
    [{ selected_passenger_id: null, document_ids: [20, 21] }]);
  assert.equal(identityBatchRows({ adults: [complete] }, new Map(), { privateOnly: true, unassignedDocuments: documents }).filter(row => row.eligible).length, 0);
  assert.equal(identityBatchRows(data, new Map(), { unassignedDocuments: documents }).some(row => row.type === 'unassigned'), false);
});
test('private upload without owner omits passenger_id and never carries secrets or URLs', async () => {
  let body;
  const api = createDocumentAiService({ post: async (_, request) => { body = request; return { data: {} }; } });
  await api.uploadAsset({ quote: 'QUOTE', voucher: 1, passenger: null, category: 'passport', file: new Blob(['fixture'], { type: 'image/png' }) });
  assert.equal(body.has('passenger_id'), false);
  assert.equal(body.get('documento_tipo'), 'passport');
  assert.deepEqual([...body.keys()], ['cotizacion_id', 'voucher_id', 'documento_tipo', 'file']);
});
test('reloaded ownership uses DB IDs regardless of file order and preserves unsaved browser files', () => {
  const pending = { id: 'browser', fileObject: {}, isPending: true };
  const current = new Map([['adult-0', { passports: [pending, { dbId: 99 }] }]]);
  const rows = [{ passengerKey: 'adult-0', id_pasajero: 2 }, { passengerKey: 'child-0', id_pasajero: 3 }];
  const before = reconcileDocumentListing(rows, current, { passports: [{ id: 10, passengerId: null, proxyUrl: '/proxy/10' }] }, value => value);
  assert.equal(before.unassigned.length, 1);
  const after = reconcileDocumentListing(rows, before.documents, { data: { passports: [
    { id: 11, passengerId: 3, proxyUrl: '/proxy/11' }, { id: 10, passengerId: 2, proxyUrl: '/proxy/10' },
  ] } }, value => `http://backend${value}`);
  assert.equal(after.unassigned.length, 0);
  assert.equal(after.documents.get('adult-0').passports[0].dbId, 10);
  assert.equal(after.documents.get('adult-0').passports[0].proxyUrl, 'http://backend/proxy/10');
  assert.equal(after.documents.get('adult-0').passports[1], pending);
  assert.equal(after.documents.get('child-0').passports[0].dbId, 11);
});
const docs = new Map([['adult-0', { passports: [document(11, 1)] }], ['adult-1', { passports: [document(12, 2), document(13, 2)] }], ['child-0', { idCards: [document(14, 3, { type: 'application/pdf' })] }]]);

test('sólo selecciona datos faltantes, no reemplaza información parcial ni ceros', () => {
  assert.deepEqual(missingFields(complete), []);
  assert.equal(missingFields({ nombres: 'ANA', apellidos: 'FIXTURE', numeroDocumento: '0' }).includes('numero_documento'), false);
  assert.equal(missingFields({ nombres: 'Adulto 1' }).includes('nombres'), true);
  const rows = identityBatchRows(data, docs);
  assert.deepEqual(rows.map(row => row.eligible), [false, true, true]);
  assert.equal(rows[1].missing.includes('nombres'), false);
  assert.deepEqual(rows[1].documentIds, [12, 13]);
});
test('excluye archivos no guardados, otros adjuntos, formatos no aptos y propietarios ajenos', () => {
  const map = { 'adult-0': { passports: [{ id: 'temporary', type: 'image/jpeg' }, document(15, 99), document(16, 2, { type: 'text/plain' })], otherDocuments: [document(17, 2)] } };
  const rows = identityBatchRows({ adults: [{ id_pasajero: 2 }] }, map);
  assert.deepEqual(rows[0].documentIds, []);
  assert.equal(rows[0].eligible, false);
});
test('lote incluye únicamente IDs guardados de seleccionados, sin URLs ni nombres', () => {
  const rows = identityBatchRows(data, docs);
  const body = makeIdentityBatch(rows, ['adult-1', 'child-0'], 'TEST-QUOTE', 5, 'fixture-idempotency-key');
  assert.deepEqual(body.document_groups, [{ selected_passenger_id: 2, document_ids: [12, 13] }, { selected_passenger_id: 3, document_ids: [14] }]);
  assert.doesNotMatch(JSON.stringify(body), /ANA|PEDRO|https|apiKey|tigris/i);
  assert.throws(() => makeIdentityBatch(rows, ['adult-0'], 'TEST', 5, 'fixture-key'));
  assert.throws(() => makeIdentityBatch(rows, ['unknown'], 'TEST', 5, 'fixture-key'));
});
test('rechaza documentos duplicados entre pasajeros y lotes mayores a diez', () => {
  const rows = identityBatchRows(data, docs);
  rows[2].documentIds = [12];
  assert.throws(() => makeIdentityBatch(rows, ['adult-1', 'child-0'], 'TEST', 5, 'fixture-key'));
  const many = Array.from({ length: 11 }, (_, index) => ({ key: `p-${index}`, passengerId: index + 1, eligible: true, documentIds: [index + 20] }));
  assert.throws(() => makeIdentityBatch(many, many.map(row => row.key), 'TEST', 5, 'fixture-key'));
});
test('selección inicial respeta diez archivos incluso con anverso/reverso', () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ key: `p-${index}`, eligible: true, documentIds: [index * 2 + 1, index * 2 + 2] }));
  assert.equal(defaultBatchSelection(rows).length, 5);
  assert.throws(() => makeIdentityBatch(rows, rows.map(row => row.key), 'TEST', 1, 'fixture-key'), /10 archivos/);
});
test('review protege valores existentes y campos sujetos a postventa', () => {
  const values = { nombres: 'OTHER', apellidos: 'PROPUESTA', nacionalidad: 'Perú', fecha_nacimiento: '1990-01-01', numero_documento: '00001' };
  assert.deepEqual(reviewableFields({ nombres: 'YA GUARDADO' }, values, true), ['apellidos', 'numero_documento']);
  assert.deepEqual(reviewableFields(complete, values, false), []);
});
test('servicio sólo usa backend autenticado, paginación y señales de cancelación', async () => {
  const calls = [], signal = new AbortController().signal;
  const client = { get: async (...args) => { calls.push(['get', ...args]); return { data: { ok: true } }; }, post: async (...args) => { calls.push(['post', ...args]); return { data: { ok: true } }; } };
  const api = createDocumentAiService(client);
  await api.capabilities('TEST', 1, signal); await api.createBatch({ document_groups: [] }, signal);
  await api.candidates('job/a', 100, signal); await api.review('candidate', { missing_only: true }, signal); await api.apply('review', signal);
  assert.ok(calls.every(call => call[1].startsWith('/turismo/document-ai/')));
  assert.equal(calls[2][1], '/turismo/document-ai/jobs/job%2Fa/candidates');
  assert.equal(calls[2][2].params.offset, 100);
  assert.equal(calls[0][2].signal, signal);
  assert.ok(calls.filter(call => call[0] === 'get').every(call => call[2]._skipDedup === true));
});
