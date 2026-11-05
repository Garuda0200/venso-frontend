import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct } from 'react-dom/test-utils';
import { parseHTML } from 'linkedom';
import { before } from 'node:test';
import { loadIdentityComponent } from './loadIdentityComponent.js';
let PassengerIdentityBatch;
before(async()=>{ PassengerIdentityBatch=await loadIdentityComponent('PassengerIdentityBatch'); });
const act = React.act || legacyAct;
const passengerData = { adults: [{ id_pasajero: 1, nombres: 'ANA', apellidos: 'FIXTURE', numeroDocumento: '0001', tipoDocumento: 'passport', fecha_nacimiento: '1990-01-01', fecha_caducidad: '2032-06-15', pais: 'Perú' }, { id_pasajero: 2, nombres: 'PEDRO' }], children: [{ id_pasajero: 3 }] };
const documentMap = new Map([['adult-0', { passports: [{ dbId: 11, ownerId: 1, type: 'image/jpeg' }] }], ['adult-1', { passports: [{ dbId: 12, ownerId: 2, type: 'image/jpeg' }] }], ['child-0', { idCards: [{ dbId: 13, ownerId: 3, type: 'application/pdf' }] }]]);
function mockApi(extra = {}) { return { capabilities: async () => ({ enabled: true, existing_documents: true, can_manage: true, sold: false }), createBatch: async () => ({ job_id: 'job-fixture', state: 'queued', context_revision: 'r1' }), job: async () => ({ id: 'job-fixture', state: 'extraction_done', context_revision: 'r1', items: [] }), candidates: async () => ({ rows: [] }), ...extra }; }
async function mounted(props, verify, { strictMode = false } = {}) {
  const { window, document } = parseHTML('<html><body><div id="app"></div></body></html>');
  const old = Object.fromEntries(['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById('app'));
  const defaults = { passengerData, documentMap, cotizacionId: 'TEST-QUOTE', voucherId: 1, ...props };
  const render = async updates => act(async () => {
    const panel = React.createElement(PassengerIdentityBatch, { ...defaults, ...updates });
    root.render(strictMode ? React.createElement(React.StrictMode, null, panel) : panel);
  });
  try { await render(); await verify(document, render); } finally { await act(async () => root.unmount()); for (const [key, value] of Object.entries(old)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
}
const button = (document, text) => [...document.querySelectorAll('button')].find(node => node.textContent.includes(text));

test('un documento guardado explica junto al botón que falta habilitar la lectura en el servidor', async () => {
  let extractions = 0;
  const api = mockApi({ capabilities: async () => ({ enabled: false, can_manage: true }),
    createBatch: async () => { ++extractions; } });
  await mounted({ api, documentMap: new Map([['adult-1', documentMap.get('adult-1')]]) }, async document => {
    const process = button(document, 'Procesar');
    assert.equal(process.disabled, true);
    assert.match(process.textContent, /\(1\)/);
    assert.match(document.getElementById(process.getAttribute('aria-describedby')).textContent, /documento está guardado.*servidor de Venso/);
    assert.ok(button(document, 'Actualizar disponibilidad'));
    await act(async () => process.click());
    assert.equal(extractions, 0);
  });
});

test('actualizar disponibilidad habilita sólo el pasajero seleccionado sin volver a subir documentos', async () => {
  let reads = 0, body, uploads = 0;
  const api = mockApi({ capabilities: async () => ++reads === 1 ? { enabled: false, can_manage: true }
    : { enabled: true, existing_documents: true, can_manage: true },
    createBatch: async value => { body = value; return { job_id: 'selected-one', state: 'queued' }; },
    uploadAsset: async () => { ++uploads; } });
  await mounted({ api, documentMap: new Map([['adult-1', documentMap.get('adult-1')]]) }, async document => {
    await act(async () => button(document, 'Actualizar disponibilidad').click());
    assert.equal(reads, 2);
    assert.equal(button(document, 'Procesar').disabled, false);
    await act(async () => button(document, 'Procesar').click());
    assert.deepEqual(body.document_groups, [{ selected_passenger_id: 2, document_ids: [12] }]);
    assert.equal(uploads, 0);
  });
});

test('la comprobación pendiente o fallida nunca habilita lectura ni muestra errores privados', async () => {
  let finish, calls = 0;
  const api = mockApi({ capabilities: () => new Promise((_, reject) => { finish = reject; }),
    createBatch: async () => { ++calls; } });
  await mounted({ api }, async document => {
    assert.equal(button(document, 'Procesar').disabled, true);
    assert.match(document.body.textContent, /Comprobando la disponibilidad/);
    await act(async () => finish(new Error('PRIVATE_CONNECTION_DETAIL')));
    assert.equal(button(document, 'Procesar').disabled, true);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_CONNECTION_DETAIL/);
    assert.ok(button(document, 'Actualizar disponibilidad'));
    assert.equal(calls, 0);
  });
});

test('una respuesta antigua de disponibilidad no habilita otro voucher', async () => {
  let finish;
  const api = mockApi({ capabilities: async (_, voucher) => voucher === 1
    ? new Promise(resolve => { finish = resolve; }) : { enabled: false, can_manage: true } });
  await mounted({ api }, async (document, render) => {
    await render({ voucherId: 2 });
    await act(async () => finish({ enabled: true, existing_documents: true, can_manage: true }));
    assert.equal(button(document, 'Procesar').disabled, true);
    assert.match(document.body.textContent, /lectura asistida no está habilitada/);
  });
});

test('expiry proposal displays dd/mm/yyyy and sends ISO only after human confirmation on a sold quote', async () => {
  let reviewed = null, applied = 0;
  const api = mockApi({
    capabilities: async () => ({ enabled: true, existing_documents: true, can_manage: true, sold: true }),
    createBatch: async () => ({ job_id: 'expiry-fixture', state: 'extraction_done', context_revision: 'r1' }),
    candidates: async () => ({ rows: [{ id: 'expiry-candidate', revision: 1, state: 'review_pending', suggestion: { passenger_id: 2 }, identity_values: { fecha_caducidad: '2032-06-15' } }] }),
    review: async (_, body) => { reviewed = body; return { id: 'expiry-review' }; },
    apply: async () => { ++applied; },
  });
  await mounted({ api }, async document => {
    await act(async () => button(document, 'Procesar').click());
    await act(async () => button(document, 'Revisar datos').click());
    const input = document.querySelector('[aria-label="Propuesta: Caducidad del documento"]');
    assert.equal(input.type, 'text');
    assert.equal(input.value, '15/06/2032');
    assert.equal(input.placeholder, 'dd/mm/aaaa');
    assert.equal(input.disabled, false);
    assert.match(input.closest('label').textContent, /Opcional/);
    assert.ok(document.querySelector('.identity-batch__fields'));
    assert.equal(button(document, 'Confirmar y guardar').disabled, true);
    assert.equal(reviewed, null);
    const check = document.querySelector('.identity-batch__confirm input');
    await act(async () => { check.checked = true; check.dispatchEvent(new window.Event('change', { bubbles: true })); check.click(); });
    await act(async () => button(document, 'Confirmar y guardar').click());
    assert.deepEqual(reviewed.selected_fields, ['fecha_caducidad']);
    assert.deepEqual(reviewed.corrections, { fecha_caducidad: '2032-06-15' });
    assert.equal(reviewed.missing_only, true);
    assert.equal(applied, 1);
  });
});

test('birth and expiry dates display consistently and impossible proposed dates block confirmation', async () => {
  let calls = 0;
  const api = mockApi({
    createBatch: async () => ({ job_id: 'dates-fixture', state: 'extraction_done', context_revision: 'r1' }),
    candidates: async () => ({ rows: [{ id: 'dates-candidate', revision: 1, state: 'review_pending', suggestion: { passenger_id: 2 }, identity_values: { fecha_nacimiento: '1990-01-02', fecha_caducidad: '2032-02-30' } }] }),
    review: async () => { ++calls; return { id: 'dates-review' }; }, apply: async () => { ++calls; },
  });
  await mounted({ api }, async document => {
    await act(async () => button(document, 'Procesar').click());
    await act(async () => button(document, 'Revisar datos').click());
    assert.equal(document.querySelector('[aria-label="Propuesta: Nacimiento"]').value, '02/01/1990');
    assert.equal(document.querySelector('[aria-label="Propuesta: Caducidad del documento"]').getAttribute('aria-invalid'), 'true');
    assert.match(document.body.textContent, /Introduce una fecha válida/);
    const check = document.querySelector('.identity-batch__confirm input');
    await act(async () => { check.checked = true; check.dispatchEvent(new window.Event('change', { bubbles: true })); check.click(); });
    assert.equal(button(document, 'Confirmar y guardar').disabled, true);
    await act(async () => button(document, 'Confirmar y guardar').click());
    assert.equal(calls, 0);
  });
});

test('production hybrid panel submits saved historical and unordered private documents only after a click', async () => {
  let body, calls = 0;
  const api = mockApi({ capabilities: async () => ({ enabled: true, existing_documents: true, private_documents: true, private_upload: true, can_manage: true, environment: 'production' }),
    createBatch: async payload => { ++calls; body = payload; return { job_id: 'hybrid', state: 'extraction_done' }; } });
  await mounted({ api, unassignedDocuments: [{ id: 20, documentoTipo: 'passport', type: 'image/png', documentAssetId: 'private-fixture' }] }, async document => {
    assert.equal(calls, 0);
    assert.match(document.body.textContent, /ya guardados y nuevas cargas privadas/);
    assert.equal(button(document, 'Procesar').disabled, false);
    await act(async () => button(document, 'Procesar').click());
    assert.deepEqual(body.document_groups, [{ selected_passenger_id: 2, document_ids: [12] }, { selected_passenger_id: 3, document_ids: [13] }, { selected_passenger_id: null, document_ids: [20] }]);
    assert.equal(calls, 1);
    assert.ok(!JSON.stringify(body).includes('PEDRO'));
  });
});

test('new voucher does not upload or extract before its voucher and placeholder passengers are saved', async () => {
  let calls = 0;
  await mounted({ voucherId: null, passengerData: { adults: [{}], children: [{}] }, api: mockApi({ createBatch: async () => { ++calls; } }) }, async document => {
    assert.match(document.body.textContent, /Guarda primero el voucher y sus pasajeros/);
    assert.equal(button(document, 'Procesar').disabled, true);
    assert.equal(calls, 0);
  });
});
test('unordered private batch allows a reviewed assignment to any incomplete saved passenger, never a complete one', async () => {
  let payload, applied = 0, reviews = 0, reloads = 0;
  const api = mockApi({ capabilities: async () => ({ enabled: true, private_documents: true, private_upload: true, can_manage: true }),
    createBatch: async body => { payload = body; return { job_id: 'job-fixture', state: 'extraction_done', context_revision: 'r1' }; },
    candidates: async () => ({ rows: [{ id: 'candidate', revision: 1, state: applied ? 'applied' : 'review_pending', suggestion: { passenger_id: null }, identity_values: { nombres: 'SYNTHETIC', apellidos: 'PROPOSAL', numero_documento: '000123', tipo_documento: 'passport' } }] }),
    review: async (_, body) => { ++reviews; assert.equal(body.passenger_id, 3); assert.equal(body.missing_only, true); return { id: 'review' }; },
    apply: async () => { ++applied; }, documents: async () => ({ passports: [] }),
  });
  await mounted({ api, documentMap: new Map(), unassignedDocuments: [{ id: 20, passengerId: null, documentoTipo: 'passport', documentAssetId: 'private', type: 'image/png' }], onDocumentsReload: () => { ++reloads; } }, async document => {
    assert.equal(document.querySelectorAll('[aria-pressed="true"]').length, 1);
    await act(async () => button(document, 'Procesar').click());
    assert.deepEqual(payload.document_groups, [{ selected_passenger_id: null, document_ids: [20] }]);
    await act(async () => button(document, 'Revisar datos').click());
    const select = document.querySelector('[aria-label="Asignar propuesta a pasajero del lote"]');
    await act(async () => select.click());
    const options = [...document.querySelectorAll('[role="option"]')];
    assert.deepEqual(options.map(option => option.textContent), ['Seleccionar pasajero', 'PEDRO', 'Niño 1']);
    assert.equal(button(document, 'Confirmar y guardar').disabled, true);
    await act(async () => options[2].click());
    assert.ok(document.querySelector('[aria-label="Propuesta: Nombres"]'));
    const check = document.querySelector('.identity-batch__confirm input');
    await act(async () => { check.checked = true; check.dispatchEvent(new window.Event('change', { bubbles: true })); check.click(); });
    assert.equal(button(document, 'Confirmar y guardar').disabled, false);
    await act(async () => button(document, 'Confirmar y guardar').click());
    assert.equal(reviews, 1); assert.equal(applied, 1); assert.equal(reloads, 1);
  });
});
test('unordered upload stores privately without OCR and preserves partial successful saves on error', async () => {
  let saved = [], uploads = 0, processes = 0;
  const api = mockApi({ capabilities: async () => ({ enabled: true, private_documents: true, private_upload: true, can_manage: true }),
    uploadAsset: async body => { assert.equal(body.passenger, null); assert.equal(body.category, 'passport'); if (++uploads > 1) throw new Error('Sensitive provider error'); return { document: { id: 20, passengerId: null, documentoTipo: 'passport', documentAssetId: 'private', fileType: 'image/png', proxyUrl: '/api/turismo/vouchers-venta/documentos/20/proxy' } }; },
    createBatch: async () => { ++processes; },
  });
  await mounted({ api, documentMap: new Map(), onDocumentsReload: () => {}, onUnassignedDocumentsChange: update => { saved = update(saved); } }, async document => {
    const input = document.querySelector('[aria-label="Seleccionar documentos sin asignar"]');
    Object.defineProperty(input, 'files', { value: [new Blob(['one'], { type: 'image/png' }), new Blob(['two'], { type: 'image/png' })] });
    await act(async () => input.dispatchEvent(new window.Event('change', { bubbles: true })));
    assert.equal(uploads, 2); assert.equal(saved.length, 1); assert.equal(saved[0].id, 20); assert.equal(processes, 0);
    assert.doesNotMatch(document.body.textContent, /Sensitive provider error/);
  });
});

test('private panel saves pending files without extraction and only processes private identities', async () => {
  let saves = 0, processes = 0, payload;
  const map = new Map([['adult-1', { passports: [{ dbId: 12, ownerId: 2, type: 'image/png', documentAssetId: 'asset-private' }, { fileObject: {}, isPending: true }] }],
    ['child-0', { idCards: [{ dbId: 13, ownerId: 3, type: 'application/pdf' }] }]]);
  const api = mockApi({ capabilities: async () => ({ enabled: true, private_documents: true, private_upload: true, existing_documents: false, can_manage: true }),
    createBatch: async body => { ++processes; payload = body; return { job_id: 'fixture', state: 'queued' }; } });
  await mounted({ api, documentMap: map, onPersistDocuments: async () => { ++saves; return true; } }, async document => {
    assert.equal(button(document, 'Niño 1').disabled, true);
    await act(async () => { button(document, 'Guardar documentos privados').click(); button(document, 'Guardar documentos privados').click(); });
    assert.equal(saves, 1); assert.equal(processes, 0);
    await act(async () => button(document, 'Procesar').click());
    assert.equal(processes, 1); assert.deepEqual(payload.document_groups, [{ selected_passenger_id: 2, document_ids: [12] }]);
  });
});
test('private save respects unsaved passengers and failed save never starts extraction', async () => {
  const map = new Map([['adult-1', { passports: [{ fileObject: {}, isPending: true }] }]]);
  const api = mockApi({ capabilities: async () => ({ enabled: true, private_documents: true, private_upload: true, can_manage: true }) });
  await mounted({ api, documentMap: map, hasUnsavedPassengers: true, onPersistDocuments: () => { throw new Error('Should not run'); } }, async document => {
    assert.equal(button(document, 'Guardar documentos privados').disabled, true);
  });
  await mounted({ api, documentMap: map, onPersistDocuments: async () => false }, async document => {
    await act(async () => button(document, 'Guardar documentos privados').click());
    assert.match(document.body.textContent, /no se enviaron a Gemini/); assert.equal(button(document, 'Procesar').disabled, true);
  });
});

test('panel marca sólo pasajeros pendientes y no envía nada al abrirse', async () => {
  let calls = 0;
  await mounted({ api: mockApi({ createBatch: async () => { ++calls; } }) }, async document => {
    assert.match(document.body.textContent, /2 pendientes/);
    assert.equal(document.querySelectorAll('[aria-pressed="true"]').length, 2);
    assert.equal(button(document, 'ANA').disabled, true);
    assert.match(button(document, 'Procesar').textContent, /\(2\)/);
    assert.equal(calls, 0);
  });
});

test('procesa un pasajero con documento aunque los demás todavía no tengan archivos', async () => {
  let payload;
  const oneDocument = new Map([['adult-1', { passports: [{ dbId: 12, ownerId: 2, type: 'image/jfif' }] }]]);
  await mounted({ documentMap: oneDocument, api: mockApi({ createBatch: async body => { payload = body; return { job_id: 'partial-roster', state: 'queued' }; } }) }, async document => {
    assert.equal(document.querySelectorAll('[aria-pressed="true"]').length, 1);
    assert.equal(button(document, 'Procesar').disabled, false);
    await act(async () => button(document, 'Procesar').click());
    assert.deepEqual(payload.document_groups, [{ selected_passenger_id: 2, document_ids: [12] }]);
  });
});

test('procesa dos pasajeros y deja fuera al niño pendiente que todavía no tiene documento', async () => {
  let payload;
  const passengers = { adults: [{ id_pasajero: 1 }, { id_pasajero: 2 }], children: [{ id_pasajero: 3 }] };
  const documents = new Map([
    ['adult-0', { passports: [{ dbId: 11, ownerId: 1, type: 'image/jpeg' }] }],
    ['adult-1', { idCards: [{ dbId: 12, ownerId: 2, type: 'application/pdf' }] }],
  ]);
  await mounted({ passengerData: passengers, documentMap: documents, api: mockApi({ createBatch: async body => { payload = body; return { job_id: 'two-passengers', state: 'queued' }; } }) }, async document => {
    assert.equal(document.querySelectorAll('[aria-pressed="true"]').length, 2);
    await act(async () => button(document, 'Procesar').click());
    assert.deepEqual(payload.document_groups, [
      { selected_passenger_id: 1, document_ids: [11] },
      { selected_passenger_id: 2, document_ids: [12] },
    ]);
  });
});
test('failed and unreadable batches do not present completion as successful identity extraction', async () => {
 for(const state of ['failed','partial','extraction_done']){
  const api=mockApi({createBatch:async()=>({job_id:'empty',state}),job:async()=>({id:'empty',state,items:[{state:state==='failed'?'failed':'unreadable'}]}),candidates:async()=>({rows:[]})});
  await mounted({api},async document=>{
   await act(async()=>button(document,'Procesar').click());
   assert.doesNotMatch(document.body.textContent,/Lote finalizado/);
   assert.match(document.body.textContent,state==='failed'?/No se pudo extraer la información/:/No hay propuestas de identidad disponibles/);
   assert.equal(button(document,'Revisar datos'),undefined);
  });
 }
});
test('StrictMode conserva la selección inicial y no procesa al abrir el panel', async () => {
  let calls = 0;
  await mounted({ api: mockApi({ createBatch: async () => { ++calls; } }) }, async document => {
    assert.equal(document.querySelectorAll('[aria-pressed="true"]').length, 2);
    assert.match(button(document, 'Procesar').textContent, /\(2\)/);
    assert.equal(calls, 0);
  }, { strictMode: true });
});
test('doble clic crea un solo lote y conserva sólo IDs seleccionados', async () => {
  let resolve, calls = 0, payload;
  const pending = new Promise(done => { resolve = done; });
  await mounted({ api: mockApi({ createBatch: async body => { ++calls; payload = body; return pending; } }) }, async document => {
    await act(async () => { button(document, 'Procesar').click(); button(document, 'Procesar').click(); });
    assert.equal(calls, 1); assert.deepEqual(payload.document_groups.map(group => group.selected_passenger_id), [2, 3]);
    await act(async () => resolve({ job_id: 'fixture', state: 'queued', context_revision: 'r1' }));
  });
});
test('borradores sin guardar y permisos de lectura bloquean el procesamiento', async () => {
  await mounted({ api: mockApi(), hasUnsavedPassengers: true }, async document => { assert.equal(button(document, 'Procesar').disabled, true); assert.match(document.body.textContent, /Guarda los cambios/); });
  await mounted({ api: mockApi({ capabilities: async () => ({ enabled: true, existing_documents: true, can_manage: false }) }) }, async document => { assert.equal(button(document, 'Procesar').disabled, true); });
});
test('un cambio de voucher ignora respuestas tardías del anterior', async () => {
  let complete;
  const pending = new Promise(resolve => { complete = resolve; });
  const api = mockApi({ capabilities: async (_, voucher) => voucher === 1 ? pending : { enabled: false, existing_documents: false, can_manage: true } });
  await mounted({ api }, async (document, render) => {
    await render({ voucherId: 2 });
    await act(async () => complete({ enabled: true, existing_documents: true, can_manage: true }));
    assert.equal(button(document, 'Procesar').disabled, true);
  });
});
test('reintento de recepción usa la misma clave sin repetir automáticamente', async () => {
  const requests = [];
  await mounted({ api: mockApi({ createBatch: async body => { requests.push(body); throw new Error('private-provider-message'); } }) }, async document => {
    await act(async () => button(document, 'Procesar').click());
    assert.equal(requests.length, 1); assert.doesNotMatch(document.body.textContent, /private-provider-message/);
    await act(async () => button(document, 'Procesar').click());
    assert.equal(requests.length, 2); assert.equal(requests[0].idempotency_key, requests[1].idempotency_key);
  });
});
test('lote terminal idempotente carga propuestas y exige comparación humana', async () => {
  let reviewed = 0, applied = 0;
  const api = mockApi({ createBatch: async () => ({ job_id: 'job-fixture', state: 'extraction_done', context_revision: 'r1' }), candidates: async () => ({ rows: [{ id: 'candidate', revision: 1, state: 'review_pending', suggestion: { passenger_id: 2 }, identity_values: { nombres: 'NO REEMPLAZAR', apellidos: 'PROPUESTA', numero_documento: '00123', tipo_documento: 'passport' } }] }), review: async (_, body) => { ++reviewed; assert.equal(body.missing_only, true); assert.ok(!body.selected_fields.includes('nombres')); return { id: 'review' }; }, apply: async () => { ++applied; return { applied: true }; } });
  await mounted({ api }, async document => {
    await act(async () => button(document, 'Procesar').click());
    await act(async () => button(document, 'Revisar datos').click());
    assert.equal(button(document, 'Confirmar y guardar').disabled, true);
    assert.equal(document.querySelector('[aria-label="Propuesta: Nombres"]'), null);
    const check = document.querySelector('.identity-batch__confirm input');
    await act(async () => { check.checked = true; check.dispatchEvent(new window.Event('change', { bubbles: true })); check.click(); });
    assert.equal(reviewed, 0); assert.equal(applied, 0);
    assert.equal(button(document, 'Confirmar y guardar').disabled, false);
    await act(async () => button(document, 'Confirmar y guardar').click());
    assert.equal(reviewed, 1); assert.equal(applied, 1);
  });
});


test('el límite del servidor bloquea el lote y actualizar disponibilidad permite continuar sin subir archivos', async () => {
  let reads=0, creates=0;
  const api=mockApi({capabilities:async()=>({enabled:true,existing_documents:true,can_manage:true,
    budget:{daily_limit:100,monthly_limit:1000,remaining:++reads===1?0:95}}),
    createBatch:async()=>{++creates;return {job_id:'new-budget',state:'queued'};}});
  await mounted({api},async document=>{
    assert.equal(button(document,'Procesar').disabled,true);
    assert.match(document.body.textContent,/límite de lecturas del servidor/);
    await act(async()=>button(document,'Actualizar disponibilidad').click());
    assert.equal(button(document,'Procesar').disabled,false);
    await act(async()=>button(document,'Procesar').click());
    assert.equal(creates,1);
  });
});

test('un lote fallido por presupuesto explica la causa y sólo un clic explícito inicia otro intento',async()=>{
  const keys=[];
  const api=mockApi({createBatch:async body=>{keys.push(body.idempotency_key);return {job_id:'budget-failed',state:'failed'};},
    job:async()=>({id:'budget-failed',state:'failed',items:[{state:'failed',attempts:0,error_code:'budget_exhausted'}]})});
  await mounted({api},async document=>{
    await act(async()=>button(document,'Procesar').click());
    assert.match(document.body.textContent,/límite de lecturas configurado/);
    assert.match(document.body.textContent,/no llamó al modelo/);
    assert.equal(keys.length,1);
    await act(async()=>button(document,'Procesar').click());
    assert.equal(keys.length,2);
    assert.notEqual(keys[0],keys[1]);
  });
});

test('404 documental y 502 temporal no se presentan como una función inexistente ni exponen mensajes privados',async()=>{
  for(const [status,expected] of [[404,/No se encontró el documento/],[502,/backend no está disponible temporalmente/]]){
    const api=mockApi({createBatch:async()=>{throw {response:{status,data:{message:'PRIVATE_STORAGE_URL_AND_KEY'}}};}});
    await mounted({api},async document=>{
      await act(async()=>button(document,'Procesar').click());
      assert.match(document.body.textContent,expected);
      assert.doesNotMatch(document.body.textContent,/todavía no dispone|PRIVATE_STORAGE/);
    });
  }
});

test('un duplicado muestra la acción segura que corresponde, sin revelar referencias o reasignar pasajeros',async()=>{
  const message='Este archivo ya está registrado como otro documento del file. Selecciona el documento original o un archivo distinto.';
  const api=mockApi({createBatch:async()=>{throw {response:{status:409,data:{message}}};}});
  await mounted({api},async document=>{
    await act(async()=>button(document,'Procesar').click());
    assert.match(document.body.textContent,/Selecciona el documento original o un archivo distinto/);
  });
});
