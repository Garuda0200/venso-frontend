import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct } from 'react-dom/test-utils';
import { parseHTML } from 'linkedom';
import { before } from 'node:test';
import { loadIdentityComponent } from './loadIdentityComponent.js';
let PassengerIdentityModal;
before(async()=>{ PassengerIdentityModal=await loadIdentityComponent('PassengerIdentityModal'); });
const act = React.act || legacyAct;
const passengerData = { adults: [{ id_pasajero: 1 }, { id_pasajero: 2 }], children: [{ id_pasajero: 3 }] };
const documentMap = new Map([
  ['adult-0', { passports: [{ dbId: 11, ownerId: 1, type: 'image/png' }] }],
  ['adult-1', { passports: [{ dbId: 12, ownerId: 2, type: 'application/pdf' }] }],
  ['child-0', { idCards: [{ dbId: 13, ownerId: 3, type: 'image/jpeg' }] }],
]);
const button = (document, text) => [...document.querySelectorAll('button')].find(node => node.textContent.includes(text));
const apiMock = extra => ({
  capabilities: async () => ({ enabled: true, existing_documents: true, can_manage: true }),
  createBatch: async () => ({ job_id: 'fixture-job', state: 'extraction_done', context_revision: 'fixture' }),
  job: async () => ({ id: 'fixture-job', state: 'extraction_done', context_revision: 'fixture', items: [] }),
  candidates: async () => ({ rows: [] }), ...extra,
});

test('el combobox consume Escape y regresar recupera el panel y el foco sin otra extracción', async () => {
  let creates = 0;
  await mounted({ api: apiMock({
    createBatch: async () => { ++creates; return { job_id: 'combo-job', state: 'extraction_done' }; },
    candidates: async () => ({ rows: [{ id: 'combo-candidate', revision: 1, state: 'review_pending',
      suggestion: { passenger_id: 1 }, identity_values: { nombres: 'SYNTHETIC' } }] }),
  }) }, async document => {
    await act(async () => button(document, 'Completar datos').click());
    await act(async () => button(document, 'Procesar').click());
    await act(async () => { const review = button(document, 'Revisar datos'); review.focus(); review.click(); });
    const combo = document.querySelector('[role="combobox"]');
    await act(async () => combo.click());
    assert.equal(combo.getAttribute('aria-expanded'), 'true');
    assert.ok(document.querySelector('dialog [role="listbox"]'));
    await act(async () => {
      const event = new window.Event('keydown', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'key', { value: 'Escape' }); combo.dispatchEvent(event);
    });
    assert.equal(combo.getAttribute('aria-expanded'), 'false');
    assert.equal(document.querySelector('dialog').open, true);
    await act(async () => document.querySelector('[aria-label="Volver al panel de lectura"]').click());
    assert.equal(document.querySelector('.identity-batch__review'), null);
    assert.equal(document.querySelector('.identity-batch__selection').hidden, false);
    assert.equal(document.activeElement?.textContent, 'Revisar datos');
    assert.equal(creates, 1);
  });
});

test('reabrir actualiza la disponibilidad y conserva el lote aceptado sin repetir la extracción', async () => {
  let reads = 0, extractions = 0;
  await mounted({ api: apiMock({ capabilities: async () => { ++reads; return { enabled: true, existing_documents: true, can_manage: true }; },
    createBatch: async () => { ++extractions; return { job_id: 'preserved-job', state: 'extraction_done' }; } }) }, async document => {
    await act(async () => button(document, 'Completar datos').click());
    await act(async () => button(document, 'Procesar').click());
    assert.equal(extractions, 1);
    assert.ok(document.querySelector('.identity-batch__progress'));
    await act(async () => button(document, 'Volver a documentos').click());
    await act(async () => button(document, 'Completar datos').click());
    assert.equal(reads, 2);
    assert.equal(extractions, 1);
    assert.ok(document.querySelector('.identity-batch__progress'));
  });
});

test('una comprobación fallida al reabrir conserva la revisión y bloquea confirmar hasta reconectar', async () => {
  let reads = 0, applies = 0;
  await mounted({ api: apiMock({ capabilities: async () => {
    if (++reads === 2) throw Error('PRIVATE_CAPABILITY_FAILURE');
    return { enabled: true, existing_documents: true, can_manage: true, sold: false };
  }, candidates: async () => ({ rows: [{ id: 'proposal', revision: 1, state: 'review_pending', suggestion: { passenger_id: 1 },
    identity_values: { nombres: 'SYNTHETIC' } }] }), apply: async () => { ++applies; } }) }, async document => {
    await act(async () => button(document, 'Completar datos').click());
    await act(async () => button(document, 'Procesar').click());
    await act(async () => button(document, 'Revisar datos').click());
    await act(async () => button(document, 'Volver a documentos').click());
    await act(async () => button(document, 'Completar datos').click());
    assert.ok(document.querySelector('.identity-batch__review'));
    assert.equal(button(document, 'Confirmar y guardar').disabled, true);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_CAPABILITY_FAILURE/);
    assert.ok(button(document, 'Actualizar disponibilidad'));
    assert.equal(applies, 0);
  });
});

async function mounted(props, verify, strictMode = false) {
  const { window, document } = parseHTML('<html><body><div id="app"></div></body></html>');
  const old = Object.fromEntries(['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  let focused = document.body;
  Object.defineProperty(document, 'activeElement', { get: () => focused });
  const prototype = window.HTMLElement.prototype;
  const oldFocus = prototype.focus;
  prototype.focus = function () { focused = this; };
  prototype.showModal = function () { this.setAttribute('open', ''); this.open = true; };
  prototype.close = function () { this.removeAttribute('open'); this.open = false; };
  const root = createRoot(document.getElementById('app'));
  const defaults = { passengerData, documentMap, cotizacionId: 'FIXTURE-QUOTE', voucherId: 1, ...props };
  const render = async updates => act(async () => {
    const current = { ...defaults, ...updates };
    const modal = React.createElement(PassengerIdentityModal, { ...current, key: `${current.cotizacionId}:${current.voucherId}` });
    root.render(strictMode ? React.createElement(React.StrictMode, null, modal) : modal);
  });
  const escape = async () => act(async () => {
    const event = new window.Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'key', { value: 'Escape' });
    document.dispatchEvent(event);
  });
  try { await render(); await verify(document, render, escape); }
  finally {
    await act(async () => root.unmount());
    prototype.focus = oldFocus; delete prototype.showModal; delete prototype.close;
    for (const [key, value] of Object.entries(old)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
}

test('document step stays compact: opening the native modal queries capabilities but never extracts', async () => {
  let reads = 0, extractions = 0;
  await mounted({ api: apiMock({ capabilities: async () => { ++reads; return { enabled: true, existing_documents: true, can_manage: true }; }, createBatch: async () => { ++extractions; } }) }, async document => {
    assert.equal(document.querySelector('dialog'), null);
    assert.equal(reads, 0);
    const launcher = button(document, 'Completar datos'); launcher.focus();
    await act(async () => launcher.click());
    const dialog = document.querySelector('dialog');
    assert.equal(dialog.open, true);
    assert.ok(document.getElementById(dialog.getAttribute('aria-labelledby')));
    assert.ok(document.getElementById(dialog.getAttribute('aria-describedby')));
    assert.equal(launcher.getAttribute('aria-expanded'), 'true');
    assert.equal(document.body.style.overflow, 'hidden');
    assert.equal(reads, 1); assert.equal(extractions, 0);
    await act(async () => button(document, 'Volver a documentos').click());
    assert.equal(dialog.open, false);
    assert.equal(document.activeElement, launcher);
    assert.equal(launcher.getAttribute('aria-expanded'), 'false');
    assert.notEqual(document.body.style.overflow, 'hidden');
  });
});

test('Escape closes only assisted reading and preserves the parent voucher scroll lock', async () => {
  await mounted({ api: apiMock() }, async (document, render, escape) => {
    document.body.style.overflow = 'hidden';
    const launcher = button(document, 'Completar datos'); launcher.focus();
    await act(async () => launcher.click());
    let parentClosed = 0;
    const parentListener = event => { if (event.key === 'Escape') ++parentClosed; };
    document.addEventListener('keydown', parentListener);
    try {
      await escape();
      assert.equal(document.querySelector('dialog').open, false);
      assert.equal(parentClosed, 0);
      assert.equal(document.body.style.overflow, 'hidden');
      assert.equal(document.activeElement, launcher);
    } finally { document.removeEventListener('keydown', parentListener); }
  });
});

test('closing and reopening keeps selection and results without extracting, applying or cancelling again', async () => {
  let payload, creates = 0, capabilities = 0, cancels = 0, applies = 0;
  const api = apiMock({
    capabilities: async () => { ++capabilities; return { enabled: true, existing_documents: true, can_manage: true }; },
    createBatch: async body => { ++creates; payload = body; return { job_id: 'fixture-job', state: 'extraction_done' }; },
    candidates: async () => ({ rows: [{ id: 'proposal', revision: 1, state: 'review_pending', suggestion: { passenger_id: 1 }, identity_values: { nombres: 'SYNTHETIC', apellidos: 'FIXTURE' } }] }),
    cancel: async () => { ++cancels; }, apply: async () => { ++applies; },
  });
  await mounted({ api }, async document => {
    await act(async () => button(document, 'Completar datos').click());
    await act(async () => button(document, 'Adulto 2').click());
    await act(async () => button(document, 'Procesar seleccionados').click());
    assert.deepEqual(payload.document_groups.map(group => group.selected_passenger_id), [1, 3]);
    await act(async () => button(document, 'Revisar datos').click());
    assert.ok(document.querySelector('.identity-batch__review'));
    await act(async () => button(document, 'Volver a documentos').click());
    await act(async () => button(document, 'Completar datos').click());
    assert.ok(document.querySelector('.identity-batch__review'));
    assert.equal(button(document, 'Adulto 2').getAttribute('aria-pressed'), 'false');
    assert.equal(creates, 1); assert.equal(capabilities, 2); assert.equal(applies, 0); assert.equal(cancels, 0);
    assert.equal(document.querySelector('.identity-batch__selection').hidden, true);
    assert.equal(document.querySelector('.identity-batch__results').hidden, true);
    await act(async () => document.querySelector('[aria-label="Volver al panel de lectura"]').click());
    assert.equal(document.querySelector('.identity-batch__selection').hidden, false);
    assert.equal(button(document, 'Adulto 2').getAttribute('aria-pressed'), 'false');
    assert.equal(creates, 1);
  });
});

test('original document preview belongs to the top-layer dialog and Escape closes preview before reading', async () => {
  const api = apiMock({ candidates: async () => ({ rows: [{ id: 'proposal', revision: 1, state: 'review_pending', suggestion: { passenger_id: 1 }, identity_values: { nombres: 'SYNTHETIC' },
    documents: [{ id: 11, pages: [1], dataUrl: 'data:image/png;base64,fixture', filename: 'fixture.png', type: 'image/png' }] }] }) });
  await mounted({ api }, async (document, render, escape) => {
    await act(async () => button(document, 'Completar datos').click());
    await act(async () => button(document, 'Procesar seleccionados').click());
    await act(async () => button(document, 'Revisar datos').click());
    const original = button(document, 'Ver original'); original.focus();
    await act(async () => original.click());
    const dialog = document.querySelector('dialog');
    assert.ok(dialog.querySelector('.image-preview-modal-overlay'));
    assert.ok(dialog.querySelector('.identity-modal__body').hasAttribute('inert'));
    let parentClosed = 0;
    const parentListener = () => { ++parentClosed; };
    document.addEventListener('keydown', parentListener);
    try {
      await escape();
      assert.equal(dialog.querySelector('.image-preview-modal-overlay'), null);
      assert.equal(dialog.querySelector('.identity-modal__body').hasAttribute('inert'), false);
      assert.equal(dialog.open, true); assert.equal(parentClosed, 0);
      assert.equal(document.body.style.overflow, 'hidden');
      assert.equal(document.activeElement, original);
      await escape();
      assert.equal(dialog.open, false); assert.equal(parentClosed, 0);
    } finally { document.removeEventListener('keydown', parentListener); }
  });
});

test('switching voucher discards the previous modal session and unsaved vouchers still cannot extract', async () => {
  let creates = 0;
  await mounted({ api: apiMock({ createBatch: async () => { ++creates; } }) }, async (document, render) => {
    await act(async () => button(document, 'Completar datos').click());
    await render({ voucherId: null, passengerData: { adults: [{}], children: [] } });
    assert.equal(document.querySelector('dialog'), null);
    await act(async () => button(document, 'Completar datos').click());
    assert.match(document.body.textContent, /Guarda primero el voucher y sus pasajeros/);
    assert.equal(button(document, 'Procesar seleccionados').disabled, true);
    assert.equal(creates, 0);
  });
});

test('StrictMode leaves the dialog open without sending documents', async () => {
  let creates = 0;
  await mounted({ api: apiMock({ createBatch: async () => { ++creates; } }) }, async document => {
    await act(async () => button(document, 'Completar datos').click());
    assert.equal(document.querySelector('dialog').open, true);
    assert.equal(creates, 0);
  }, true);
});

