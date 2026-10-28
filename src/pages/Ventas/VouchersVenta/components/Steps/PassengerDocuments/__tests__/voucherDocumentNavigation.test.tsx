import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct } from 'react-dom/test-utils';
import { parseHTML } from 'linkedom';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';

const act = React.act || legacyAct;
const testBase = path.resolve('src/pages/Ventas/VouchersVenta/components/Steps/PassengerDocuments/__tests__');
const base = path.resolve('src');
const fixtureModule = code => 'const f = globalThis.__voucherNavigationFixture;\n' + code;
// Bundle the real wizard, document step, drop zone and persistence code. Only
// network/provider boundaries and unrelated step UIs are replaced with fixtures.
const mocks = {
  secureStorage: 'export default { getItem: key => key === "userRole" ? (f.role ?? 1) : "fixture" };',
  axiosInstance: 'export default { post: async () => ({data:{}}) };',
  useFileUpload: 'export default () => ({ uploadFile: f.legacyUpload });',
  presignedUrlService: 'export const makeProxyUrlAbsolute = url => url ? (url.startsWith("http") ? url : "http://backend" + url) : null; export const getProxyUrl = url => "/legacy/" + url;',
  voucherDocumentService: 'const service = { getDocumentsByVoucherId: (...args) => f.list(...args), deleteDocument: (...args) => f.remove(...args), uploadDocument: (...args) => f.register(...args), convertFrontendToBackend: (doc, code, passengerId) => ({ ...doc, passengerId }) }; export { service as voucherDocumentService }; export default service;',
  documentAiService: 'export const getDocumentAiService = () => f.ai;',
  cotizacionService: 'export const getCotizacionById = async () => f.quote;',
  pasajeroService: 'export default { getPassengersByCotizacion: async () => f.rows, getPassengersByVoucherVenta: async () => f.loadRows ? f.loadRows() : f.rows, syncPassengersByVoucherVenta: async (_, body) => { f.syncs.push(body); return f.sync ? f.sync(body) : f.rows; } };',
  voucherVentaService: 'export const voucherVentaService = { createVoucher: async body => { f.creates.push(body); return { success: true, data: { id: 7, voucher_code: body.voucher_code } }; }, updateVoucher: async (...args) => { f.updates.push(args); return { success:true, data: {id:7} }; }, getVoucherWithCotizacionById: async () => ({ success:true, data:{ id:7, voucher_code:"FIXTURE", cotizacion_id:f.quote.id, cotizacion_data:f.quote, status:"draft" } }) };',
  userService: 'export const getUsers = async () => ({ accounts: [] });',
  PassengerStep: 'export default props => { f.passengerProps = props; return <div data-step="passengers">Pasajeros opcionales</div>; };',
  PaymentStep: 'export default props => { f.paymentProps = props; return <div data-step="payments">Pagos</div>; };',
  ConfirmationStep: 'export default () => <div data-step="confirmation">Confirmar</div>;',
  PassengerIdentityModal: 'export default props => { f.identityProps = props; return <div data-identity="fixture" />; };',
  ImagePreviewModal: 'export default props => <div data-preview={props.fileUrl} />;',
  PassengerPortal: 'export default () => null;',
  PredecesoresExpander: 'export default () => null;',
  VoucherLinkedPaymentDeck: 'export default () => null;',
};

async function compile(entry, { realPreview = false } = {}) {
  const result = await build({
    entryPoints: [path.resolve(testBase, entry)],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external',
    define: { 'import.meta.env': JSON.stringify({ VITE_DOCUMENT_AI_UI: 'true' }) },
    plugins: [{
      name: 'voucher-fixture-boundaries',
      setup(plugin) {
        plugin.onResolve({ filter: /\.scss$/ }, args => ({ path: args.path, namespace: 'empty' }));
        plugin.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '', loader: 'js' }));
        plugin.onResolve({ filter: /.*/ }, args => {
          const name = args.path.split('/').pop().replace(/\.(jsx?|tsx?|mjs)$/, '');
          if (realPreview && name === 'ImagePreviewModal') return null;
          return mocks[name] ? { path: name, namespace: 'fixture' } : null;
        });
        plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
          contents: fixtureModule(mocks[args.path]), loader: 'jsx', resolveDir: base,
        }));
      },
    }],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(path.resolve('package.json')), module, module.exports);
  return module.exports.default;
}

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  const f = {
    quote: { id: 'SYNTHETIC-QUOTE', platform: 'venso', total_final: 100 },
    rows: [
      { id_pasajero: 42, tipo_pasajero: 'adult', nombres: '', apellidos: '' },
      { id_pasajero: 51, tipo_pasajero: 'adult', nombres: '', apellidos: '' },
      { id_pasajero: 75, tipo_pasajero: 'child', nombres: '', apellidos: '' },
    ],
    records: [], creates: [], updates: [], syncs: [], uploads: 0, reads: 0, listings: [], deleted: [],
  };
  f.list = async (id, options) => {
    f.listings.push([id, options]);
    const data = { passports: [], idCards: [], otherDocuments: [] };
    for (const doc of f.records) data[{ passport: 'passports', idcard: 'idCards', other: 'otherDocuments' }[doc.documentoTipo]].push({ canDelete: !doc.documentAssetId, ...doc });
    return { success: true, data: { success: true, data } };
  };
  f.remove = async id => { f.deleted.push(id); f.records = f.records.filter(doc => doc.id !== id); return { success: true }; };
  f.legacyUpload = () => { throw new Error('Unexpected legacy storage'); };
  f.register = () => { throw new Error('Unexpected legacy registration'); };
  f.ai = {
    capabilities: async () => ({ enabled: true, private_documents: true, can_manage: true }),
    uploadAsset: async body => {
      ++f.uploads;
      if (f.failUpload === f.uploads) throw new Error('Synthetic storage failure');
      const id = 100 + f.uploads;
      const document = { id, passengerId: body.passenger, documentoTipo: body.category, documentAssetId: 'asset-' + id,
        filename: 'document-' + id, fileType: body.file.type, fileSize: body.file.size, proxyUrl: '/proxy/' + id };
      f.records.push(document);
      return { document };
    },
  };
  return f;
}

async function mounted(f, component, props, verify, options = {}) {
  globalThis.__voucherNavigationFixture = f;
  const Component = await compile(component, options);
  const { window, document } = parseHTML('<html><body><div id="app"></div></body></html>');
  window.requestAnimationFrame = callback => { callback();return 0; };
  window.cancelAnimationFrame = () => {};
  const keys = ['window', 'document', 'HTMLElement', 'FileReader', 'IS_REACT_ACT_ENVIRONMENT'];
  const old = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const timers = new Set(), intervals = new Set(), oldTimeout = globalThis.setTimeout, oldInterval = globalThis.setInterval;
  globalThis.setInterval = (...args) => {const id = oldInterval(...args);intervals.add(id);return id;};
  globalThis.setTimeout = (callback, ms, ...args) => { const id = oldTimeout(callback, ms, ...args); timers.add(id); return id; };
  class FileReaderFixture {
    readAsDataURL(file) {
      ++f.reads;
      const done = () => { this.result = 'data:' + file.type + ';base64,c3ludGhldGlj'; this.onload?.({ target: this }); };
      if (f.deferRead) f.finishRead = done; else queueMicrotask(done);
    }
  }
  Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, FileReader: FileReaderFixture, IS_REACT_ACT_ENVIRONMENT: true });
  window.confirm = () => { throw new Error('Native confirmations must not be used'); };
  const root = createRoot(document.getElementById('app'));
  const render = async updates => act(async () => root.render(React.createElement(Component, { ...props, ...updates })));
  try {
    await render();
    await verify(document, render);
  } finally {
    await act(async () => root.unmount());
    for (const id of timers) clearTimeout(id);
    for (const id of intervals) clearInterval(id);
    globalThis.setInterval = oldInterval;
    globalThis.setTimeout = oldTimeout;
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
    delete globalThis.__voucherNavigationFixture;
  }
}
const wizardEntry = '../../../VoucherModal/VoucherModal.tsx';
const documentsEntry = '../PassengerDocuments.tsx';
const next = document => document.querySelector('.voucher-modal-footer .next-button');
const previous = document => document.querySelector('.voucher-modal-footer .prev-button');
const click = node => act(async () => { assert.ok(node); node.click(); });
const wizardProps = f => ({ isOpen: true, cotizacionData: f.quote, onClose: () => {}, onSave: () => {} });
async function start(document) {
  const input = document.querySelector('#voucher-code-header');
  // React's input plugin expects a browser feature-detection phase absent in
  // linkedom. Invoke its real controlled callback, then navigate via DOM clicks.
  const props = input[Object.keys(input).find(key => key.startsWith('__reactProps$'))];
  await act(async () => props.onChange({ target: { value: 'SYNTHETICX3' } }));
  await click(next(document));
  assert.ok(document.querySelector('.passenger-documents'));
}
async function add(document, name = 'synthetic.png', type = 'image/png') {
  const input = document.querySelector('.file-drop-zone input');
  const file = new Blob(['synthetic'], { type }); file.name = name;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new window.Event('change', { bubbles: true })));
}

test('new file with blank passengers retains all category previews when Payments returns to Documents, without reuploads', async () => {
  const f = fixture();
  await mounted(f, wizardEntry, wizardProps(f), async document => {
    await start(document);
    assert.equal(f.creates.length, 1); assert.equal(f.creates[0].is_initialized, false);
    assert.equal(f.syncs[0].adults[0].nombres, null);
    await add(document);
    await click(document.querySelectorAll('.passenger-item')[1]);
    await click(document.querySelectorAll('.category-tab')[1]);
    await add(document, 'synthetic.pdf', 'application/pdf');
    await click(document.querySelectorAll('.passenger-item')[2]);
    await click(document.querySelectorAll('.category-tab')[2]);
    await add(document);
    assert.equal(f.reads, 3, 'one browser read per selected file');
    await click(next(document));
    assert.ok(document.querySelector('[data-step="payments"]')); assert.equal(f.uploads, 3);
    await click(previous(document));
    assert.deepEqual([...document.querySelectorAll('.document-counter')].map(node => node.textContent), ['1', '1', '1']);
    await click(document.querySelectorAll('.passenger-item')[0]);
    assert.equal(document.querySelectorAll('.document-card').length, 1);
    assert.equal(document.querySelector('.document-thumbnail').getAttribute('src'), 'http://backend/proxy/101');
    assert.equal(document.querySelector('.delete-button'), null, 'private evidence remains protected');
    await click(document.querySelectorAll('.passenger-item')[1]);
    await click(document.querySelectorAll('.category-tab')[1]);
    assert.equal(document.querySelectorAll('.document-card').length, 1);
    await click(next(document)); await click(previous(document)); await click(next(document));
    assert.equal(f.uploads, 3); assert.equal(f.creates.length, 1);
    await click(next(document));
    assert.ok(document.querySelector('[data-step="confirmation"]'));
    await click(document.querySelector('.confirm-button'));
    assert.equal(f.updates.length, 1); assert.equal(f.uploads, 3);
    assert.equal(f.syncs.length, 1, 'unchanged passengers are linked only once, including confirmation');
  });
});

test('partial save keeps pending previews and retry uploads only unconfirmed files', async () => {
  const f = fixture(); f.failUpload = 2;
  await mounted(f, wizardEntry, wizardProps(f), async document => {
    await start(document); await add(document); await add(document);
    assert.ok(document.querySelector('.passenger-documents'));
    assert.equal(document.querySelectorAll('.document-card').length, 2);
    assert.equal(f.records.length, 1);
    await click(next(document));
    assert.ok(document.querySelector('[data-step="payments"]')); assert.equal(f.uploads, 3);
    await click(previous(document));
    assert.equal(document.querySelectorAll('.document-card').length, 2);
  });
});

test('navigation waits while a selected file is being prepared', async () => {
  const f = fixture(); f.deferRead = true;
  await mounted(f, wizardEntry, wizardProps(f), async document => {
    await start(document); await add(document);
    assert.equal(next(document).disabled, true); assert.equal(previous(document).disabled, true);
    assert.match(next(document).textContent, /Preparando/);
    await act(async () => f.finishRead());
    assert.equal(next(document).disabled, false);
    await click(next(document)); assert.equal(f.uploads, 1);
  });
});

test('edit/direct document management reads the nested backend envelope and keeps saved previews', async () => {
  const f = fixture();
  f.records = [{ id: 20, passengerId: 75, documentoTipo: 'idcard', filename: 'synthetic.pdf', fileType: 'application/pdf', proxyUrl: '/proxy/20' }];
  await mounted(f, wizardEntry, { ...wizardProps(f), isEditMode: true, isDocumentManagementMode: true, voucherData: { id: 7 } }, async document => {
    assert.ok(document.querySelector('.passenger-documents'));
    await click(document.querySelectorAll('.passenger-item')[2]);
    await click(document.querySelectorAll('.category-tab')[1]);
    assert.equal(document.querySelectorAll('.document-card').length, 1);
    assert.equal(f.uploads, 0);
    assert.equal(f.identityProps.documentMap.get('child-0').idCards[0].dbId, 20);
  });
});

for (const privateDocument of [false, true]) {
  test(`clicking a saved ${privateDocument ? 'private' : 'legacy'} PDF opens the real authenticated blob preview`, async () => {
    const f = fixture();
    f.records = [{ id: 20, passengerId: 42, documentoTipo: 'passport', filename: 'synthetic (1).pdf', fileType: 'application/pdf',
      documentAssetId: privateDocument ? 'synthetic-asset' : null,
      proxyUrl: '/api/turismo/vouchers-venta/documentos/20/proxy' }];
    const previousFetch = globalThis.fetch, previousCreate = URL.createObjectURL, previousRevoke = URL.revokeObjectURL;
    const requests = [], blobs = [], revoked = [];
    globalThis.fetch = async (url, options) => {
      requests.push({url,options});
      return new Response(new Blob(['%PDF-1.4\nSynthetic PDF\n%%EOF'],{type:'application/pdf'}));
    };
    URL.createObjectURL = blob => { blobs.push(blob); return 'blob:synthetic-pdf'; };
    URL.revokeObjectURL = url => revoked.push(url);
    try {
      await mounted(f, documentsEntry, { voucherId:7, passengerData:{adults:f.rows}, documentData:{}, onDocumentDataChange:()=>{} }, async document => {
        await click(document.querySelector('.document-preview'));
        await act(async () => {
          for (let turn=0;turn<20 && blobs.length===0;turn++) await new Promise(setImmediate);
        });
        assert.equal(requests.length,1);
        assert.equal(requests[0].url,'http://backend/api/turismo/vouchers-venta/documentos/20/proxy');
        assert.equal(requests[0].options.credentials,'include');
        assert.equal(document.querySelector('.pdf-preview-error'),null,document.body.textContent);
        assert.equal(blobs[0]?.type,'application/pdf');
        assert.match(document.querySelector('.pdf-document-frame').getAttribute('src'),/^blob:synthetic-pdf#/);
        assert.equal(document.querySelector('.pdf-preview-error'),null);
        await click(document.querySelector('[aria-label="Cerrar vista previa"]'));
        assert.equal(document.querySelector('.pdf-document-frame'),null);
      }, {realPreview:true});
      assert.deepEqual(revoked,['blob:synthetic-pdf']);
    } finally {
      globalThis.fetch=previousFetch; URL.createObjectURL=previousCreate; URL.revokeObjectURL=previousRevoke;
    }
  });
}

test('a real PDF preview failure is visible and never falls back to the public Tigris URL', async () => {
  const f=fixture();
  f.records=[{id:20,passengerId:42,documentoTipo:'passport',filename:'synthetic.pdf',fileType:'application/pdf',proxyUrl:'/api/turismo/vouchers-venta/documentos/20/proxy',tigrisUrl:'https://untrusted.example.test/should-not-open.pdf'}];
  const previousFetch=globalThis.fetch, requests=[];
  globalThis.fetch=async url=>{requests.push(url);return new Response('Not found',{status:404});};
  try {
    await mounted(f,documentsEntry,{voucherId:7,passengerData:{adults:f.rows},documentData:{},onDocumentDataChange:()=>{}},async document=>{
      await click(document.querySelector('.document-preview'));
      assert.match(document.querySelector('.pdf-preview-error[role="alert"]').textContent,/404/);
      assert.equal(document.querySelector('.pdf-document-frame'),null);
      assert.deepEqual(requests,['http://backend/api/turismo/vouchers-venta/documentos/20/proxy']);
    },{realPreview:true});
  }finally{globalThis.fetch=previousFetch;}
});

for (const role of [0, 2, 3, 4]) for (const privateDocuments of [false, true]) {
  test(`document manager role ${role} drops a small file and autosaves (${privateDocuments ? 'private' : 'legacy'})`, async () => {
    const f = fixture(); f.role = role; f.deferRead = true;
    let uploaded = 0, registered = 0, closed = 0;
    f.ai.capabilities = async () => ({ enabled: privateDocuments, private_documents: privateDocuments,
      can_manage: false, can_upload_documents: true, private_upload: privateDocuments });
    f.legacyUpload = async file => { ++uploaded; return { tigrisUrl: 'synthetic-storage', metadata: { originalName: file.name } }; };
    f.register = async (_, body) => {
      ++registered;
      const doc = { id: 100, passengerId: body.passengerId, documentoTipo: 'passport',
        filename: body.filename, fileType: body.type, proxyUrl: '/proxy/100', canDelete: true, createdBy: 'fixture' };
      f.records.push(doc); return { success: true, data: doc };
    };
    await mounted(f, wizardEntry, { ...wizardProps(f), isEditMode: true, isDocumentManagementMode: true,
      voucherData: { id: 7 }, onClose: () => { ++closed; } }, async (document, render) => {
      const file = new Blob(['small synthetic file'], { type: 'image/png' }); file.name = 'synthetic.png';
      const drop = new window.Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(drop, 'dataTransfer', { value: { files: [file], types: ['Files'] } });
      await act(async () => document.querySelector('.file-drop-zone').dispatchEvent(drop));
      assert.equal(f.records.length, 0);
      await act(async () => f.finishRead());
      assert.equal(f.records.length, 1, 'DB confirmation happens without a Save/Next click');
      assert.equal(f.records[0].passengerId, 42);
      assert.equal(f.reads, 1);
      assert.match(document.querySelector('.document-save-state').textContent, /Guardado en el file/);
      assert.doesNotMatch(document.body.textContent, /Pendiente de guardar/);
      assert.equal(f.uploads, privateDocuments ? 1 : 0);
      assert.equal(uploaded, privateDocuments ? 0 : 1);
      assert.equal(registered, privateDocuments ? 0 : 1);
      assert.equal(f.updates.length, 0, 'no voucher edits are needed to save media');
      await click(document.querySelector('.voucher-modal-footer button'));
      assert.equal(closed, 1);
      await render({ isOpen: false }); await render({ isOpen: true });
      assert.equal(document.querySelectorAll('.document-card').length, 1);
      assert.equal(f.records.length, 1, 'reopening uses the saved DB record without uploading twice');
    });
  });
}

test('sales retries a voucher snapshot document without a quote FK or uploading its media twice', async () => {
  const f = fixture(); f.role = 2;
  f.quote.createdby = 'another-seller';
  f.rows = f.rows.map(passenger => ({ ...passenger, cotizacion_id: null, voucher_venta_id: 7 }));
  f.ai.capabilities = async () => ({ enabled: false, private_documents: false, can_manage: false, can_upload_documents: true });
  let uploads = 0, registrations = 0, allowRegistration = false;
  f.legacyUpload = async file => {
    ++uploads;
    return { tigrisUrl: 'synthetic-snapshot-storage', metadata: { originalName: file.name } };
  };
  f.register = async (voucher, body) => {
    ++registrations;
    assert.equal(voucher, 7);
    assert.equal(body.passengerId, 42, 'Keep the selected voucher passenger, never substitute a quotation passenger');
    if (!allowRegistration) return { success: false, error: 'El pasajero no pertenece al file' };
    const doc = { id: 120, passengerId: 42, documentoTipo: 'passport', filename: 'snapshot.png',
      fileType: 'image/png', proxyUrl: '/proxy/120', createdBy: 'fixture', canDelete: true };
    f.records.push(doc);
    return { success: true, data: doc };
  };
  await mounted(f, wizardEntry, { ...wizardProps(f), isEditMode: true, isDocumentManagementMode: true, voucherData: { id: 7 } }, async document => {
    const file = new Blob(['small synthetic snapshot'], { type: 'image/png' }); file.name = 'snapshot.png';
    const drop = new window.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [file], types: ['Files'] } });
    await act(async () => document.querySelector('.file-drop-zone').dispatchEvent(drop));
    assert.equal(uploads, 1); assert.equal(registrations, 1);
    assert.match(document.body.textContent, /Pendiente de guardar/);
    assert.ok(document.querySelector('.document-retry-button'));
    allowRegistration = true;
    await click(document.querySelector('.document-retry-button'));
    assert.equal(uploads, 1, 'Retry registration using the file already uploaded to storage');
    assert.equal(registrations, 2);
    assert.equal(f.records.length, 1);
    assert.match(document.body.textContent, /Guardado en el file/);
    assert.doesNotMatch(document.body.textContent, /Pendiente de guardar/);
    assert.equal(f.syncs.length, 0, 'Uploading evidence never rewrites the passenger snapshot');
    assert.equal(f.updates.length, 0);
  });
});

test('failed refresh does not hide the canonical draft', async () => {
  const f = fixture(); f.list = async () => ({ success: false });
  const documentData = { 'adult-0': { passports: [{ id: 20, dbId: 20, ownerId: 42, name: 'synthetic', proxyUrl: '/proxy/20', type: 'image/png' }] } };
  await mounted(f, documentsEntry, { voucherId: 7, passengerData: { adults: f.rows }, documentData, onDocumentDataChange: () => {} }, async document => {
    assert.equal(document.querySelectorAll('.document-card').length, 1);
    assert.match(document.body.textContent, /se conservan/);
  });
});

test('response from another voucher cannot restore its files in the current voucher', async () => {
  const f = fixture(), late = deferred(); let calls = 0;
  f.list = async () => ++calls === 1 ? late.promise : ({ success: true, data: { passports: [] } });
  const updates = [];
  await mounted(f, documentsEntry, { voucherId: 7, passengerData: { adults: f.rows }, documentData: {}, onDocumentDataChange: data => updates.push(data) }, async (document, render) => {
    await render({ voucherId: 8, documentData: {} });
    await act(async () => late.resolve({ success: true, data: { passports: [{ id: 99, passengerId: 42, proxyUrl: '/proxy/99' }] } }));
    assert.equal(document.querySelectorAll('.document-card').length, 0);
    assert.ok(updates.every(data => !JSON.stringify(data).includes('99')));
  });
});

test('file preparation from the previous voucher cannot attach a file to a new one', async () => {
  const f = fixture(); f.deferRead = true;
  const updates = [];
  await mounted(f, documentsEntry, { voucherId: 7, passengerData: { adults: f.rows }, documentData: {}, onDocumentDataChange: data => updates.push(data) }, async (document, render) => {
    await add(document);
    await render({ voucherId: 8, documentData: {} });
    await act(async () => f.finishRead());
    assert.equal(document.querySelectorAll('.document-card').length, 0);
    assert.ok(updates.every(data => !JSON.stringify(data).includes('synthetic.png')));
  });
});

test('a persisted new voucher removes legacy metadata only after the server confirms; failures keep its preview', async () => {
  const f = fixture();
  f.records = [{ id: 20, passengerId: 42, documentoTipo: 'passport', filename: 'synthetic', fileType: 'image/png', proxyUrl: '/proxy/20' }];
  const props = { voucherId: 7, isEditMode: false, passengerData: { adults: f.rows }, documentData: {}, onDocumentDataChange: () => {} };
  await mounted(f, documentsEntry, props, async document => {
    f.remove = async () => ({ success: false });
    await click(document.querySelector('.delete-button'));
    assert.ok(document.querySelector('[role="alertdialog"]'));
    assert.equal(document.querySelectorAll('.document-card').length, 1, 'opening the popover never deletes');
    await click(document.querySelector('.document-delete-popover__confirm'));
    assert.equal(document.querySelectorAll('.document-card').length, 1);
    assert.match(document.body.textContent, /Se conserva/);
    f.remove = async id => { f.deleted.push(id); return { success: true }; };
    await click(document.querySelector('.document-delete-popover__confirm'));
    assert.equal(document.querySelectorAll('.document-card').length, 0);
    assert.deepEqual(f.deleted, [20]);
  });
});

test('a listing started before upload cannot erase the browser draft when it finishes', async () => {
  const f = fixture(), late = deferred(); f.list = () => late.promise;
  let draft;
  await mounted(f, documentsEntry, { voucherId: 7, passengerData: { adults: f.rows }, documentData: {}, onDocumentDataChange: data => { draft = data; } }, async document => {
    await add(document);
    await act(async () => late.resolve({ success: true, data: { passports: [] } }));
    assert.equal(document.querySelectorAll('.document-card').length, 1);
    assert.ok(draft['adult-0'].passports[0].fileObject);
  });
});

test('reviewed identity reload updates the passenger and owner without losing documents on back navigation', async () => {
  const f = fixture();
  await mounted(f, wizardEntry, wizardProps(f), async document => {
    await start(document); await add(document); await click(next(document)); await click(previous(document));
    f.rows[0] = { ...f.rows[0], nombres: 'SYNTHETIC', apellidos: 'REVIEWED' };
    await act(async () => {
      const listing = await f.list(7);
      f.identityProps.onDocumentsReload(listing);
      await f.identityProps.onIdentityApplied();
    });
    assert.match(document.querySelector('.passenger-name').textContent, /SYNTHETIC REVIEWED/);
    await click(next(document)); await click(previous(document));
    assert.equal(document.querySelectorAll('.document-card').length, 1);
    assert.match(document.querySelector('.passenger-name').textContent, /SYNTHETIC REVIEWED/);
    assert.equal(f.uploads, 1);
  });
});

test('legacy upload remains visible when Documents saves on Previous and passenger names are edited manually', async () => {
  const f = fixture(); let legacyUploads = 0, registrations = 0;
  f.ai.capabilities = async () => ({ enabled: false, can_manage: true });
  f.legacyUpload = async file => { ++legacyUploads; return { tigrisUrl: 'synthetic-storage', metadata: { originalName: file.name } }; };
  f.register = async (_, body) => {
    ++registrations;
    const document = { id: 100, passengerId: body.passengerId, documentoTipo: 'passport',
      filename: body.filename, fileType: body.type, proxyUrl: '/proxy/100', canDelete: true, createdBy: 'fixture' };
    f.records.push(document);
    return { success: true, data: document };
  };
  await mounted(f, wizardEntry, wizardProps(f), async document => {
    await start(document); await add(document); await click(previous(document));
    assert.ok(document.querySelector('[data-step="passengers"]'));
    const draft = f.passengerProps.passengerData;
    const changed = { ...draft, adults: draft.adults.map((passenger, index) => index ? passenger : { ...passenger, nombres: 'MANUAL' }) };
    await act(async () => f.passengerProps.onPassengerDataChange(changed));
    f.rows[0] = { ...f.rows[0], nombres: 'MANUAL' };
    await click(next(document));
    assert.equal(document.querySelectorAll('.document-card').length, 1);
    assert.match(document.querySelector('.passenger-name').textContent, /MANUAL/);
    await click(next(document)); await click(previous(document));
    assert.equal(legacyUploads, 1); assert.equal(registrations, 1); assert.equal(f.creates.length, 1);
    assert.ok(f.listings.every(([, options]) => !options || options._skipDedup === true));
  });
});

test('shared drop zone keeps its default prepared-file contract and size filtering', async () => {
  const f = fixture(); let pending;
  await mounted(f, '../../../../../../../components/common/FileDropZone/FileDropZone.tsx', { onFilesAdded: files => { pending = files; }, maxSizeMB: 1 }, async document => {
    const input = document.querySelector('input');
    const small = new Blob(['synthetic'], { type: 'image/png' }); small.name = 'synthetic.png';
    const big = { size: 2 * 1024 * 1024 };
    Object.defineProperty(input, 'files', { value: [small, big] });
    await act(async () => input.dispatchEvent(new window.Event('change', { bubbles: true })));
    assert.equal(f.reads, 1); assert.equal(pending.length, 1);
    assert.equal(pending[0].fileObject, small); assert.equal(pending[0].isPending, true);
    assert.match(pending[0].dataUrl, /^data:image\/png/);
  });
});

test('raw drop zone contract skips duplicate preview reads and respects disabled uploads', async () => {
  const f = fixture(); let calls = 0;
  await mounted(f, '../../../../../../../components/common/FileDropZone/FileDropZone.tsx', { onRawFilesAdded: files => { ++calls; assert.equal(files.length, 1); } }, async (document, render) => {
    await add(document);
    assert.equal(calls, 1); assert.equal(f.reads, 0);
    await render({ disabled: true });
    await add(document);
    assert.equal(calls, 1);
  });
});

test('new media is uploaded and registered immediately, while navigation waits for confirmation', async () => {
  const f = fixture(), gate = deferred(), upload = f.ai.uploadAsset;
  let started = 0;
  f.ai.uploadAsset = async body => { ++started; await gate.promise; return upload(body); };
  await mounted(f, wizardEntry, wizardProps(f), async document => {
    await start(document); await add(document);
    assert.equal(started, 1, 'starts before Next is clicked');
    assert.equal(f.records.length, 0);
    assert.equal(next(document).disabled, true); assert.equal(previous(document).disabled, true);
    assert.match(document.querySelector('.document-save-state').textContent, /Guardando/);
    await act(async () => gate.resolve());
    assert.equal(f.records.length, 1);
    assert.equal(next(document).disabled, false);
    assert.match(document.querySelector('.document-save-state').textContent, /Guardado en el file/);
    await click(next(document)); assert.equal(f.uploads, 1);
  });
});

test('files added for another passenger during an upload are queued and confirmed without losing either owner', async () => {
  const f = fixture(), first = deferred(), second = deferred(), upload = f.ai.uploadAsset;
  let started = 0;
  f.ai.uploadAsset = async body => { await (++started === 1 ? first : second).promise; return upload(body); };
  await mounted(f, wizardEntry, wizardProps(f), async document => {
    await start(document); await add(document);
    await click(document.querySelectorAll('.passenger-item')[1]); await add(document);
    assert.equal(started, 1);
    await act(async () => first.resolve());
    assert.equal(started, 2); assert.equal(next(document).disabled, true);
    await act(async () => second.resolve());
    assert.deepEqual(f.records.map(doc => doc.passengerId), [42, 51]);
    assert.deepEqual([...document.querySelectorAll('.document-counter')].map(node => node.textContent), ['1', '1', '']);
    await click(next(document)); await click(previous(document));
    assert.equal(f.uploads, 2);
  });
});

test('cancelling, Escape or clicking outside the delete popover never deletes a document', async () => {
  const f = fixture();
  f.records = [{ id: 20, passengerId: 42, documentoTipo: 'passport', filename: 'synthetic', fileType: 'image/png', proxyUrl: '/proxy/20' }];
  await mounted(f, documentsEntry, { voucherId: 7, passengerData: { adults: f.rows }, documentData: {}, onDocumentDataChange: () => {} }, async document => {
    await click(document.querySelector('.delete-button'));
    await click(document.querySelector('.document-delete-popover button'));
    assert.equal(document.querySelector('[role="alertdialog"]'), null);
    await click(document.querySelector('.delete-button'));
    await act(async () => { const event = new window.Event('keydown', { bubbles: true }); event.key = 'Escape'; document.querySelector('[role="alertdialog"]').dispatchEvent(event); });
    assert.equal(document.querySelector('[role="alertdialog"]'), null);
    await click(document.querySelector('.delete-button'));
    await act(async () => document.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true })));
    assert.equal(document.querySelector('[role="alertdialog"]'), null);
    assert.equal(f.deleted.length, 0); assert.equal(document.querySelectorAll('.document-card').length, 1);
  });
});

test('double confirmation sends a single delete and locks navigation until it completes', async () => {
  const f = fixture(), gate = deferred();
  f.ai.capabilities = async () => ({ enabled: false, can_manage: true });
  f.legacyUpload = async file => ({ tigrisUrl: 'synthetic', metadata: { originalName: file.name } });
  f.register = async (_, body) => {
    const document = { id: 100, passengerId: body.passengerId, documentoTipo: 'passport', filename: body.filename, fileType: body.type, proxyUrl: '/proxy/100', canDelete: true, createdBy: 'fixture' };
    f.records.push(document); return { success: true, data: document };
  };
  f.remove = async id => { f.deleted.push(id); await gate.promise; f.records = []; return { success: true }; };
  await mounted(f, wizardEntry, wizardProps(f), async document => {
    await start(document); await add(document); await click(document.querySelector('.delete-button'));
    const confirm = document.querySelector('.document-delete-popover__confirm');
    await act(async () => { confirm.click(); confirm.click(); });
    assert.equal(f.deleted.length, 1); assert.equal(next(document).disabled, true);
    assert.equal(document.querySelectorAll('.document-card').length, 1);
    await act(async () => gate.resolve());
    assert.equal(next(document).disabled, false);
    assert.equal(document.querySelectorAll('.document-card').length, 0);
    assert.equal(document.querySelector('[role="alertdialog"]'), null);
  });
});

test('a pending file in a new voucher requires confirmation and cancellation preserves the original', async () => {
  const f = fixture(); let draft;
  await mounted(f, documentsEntry, { passengerData: { adults: f.rows }, documentData: {}, onDocumentDataChange: value => { draft = value; } }, async document => {
    await add(document); await click(document.querySelector('.delete-button'));
    assert.ok(document.querySelector('[role="alertdialog"]'));
    assert.ok(draft['adult-0'].passports[0].fileObject);
    await click(document.querySelector('.document-delete-popover button'));
    assert.equal(document.querySelectorAll('.document-card').length, 1);
    await click(document.querySelector('.delete-button'));
    await click(document.querySelector('.document-delete-popover__confirm'));
    assert.equal(document.querySelectorAll('.document-card').length, 0);
    assert.equal(draft['adult-0'].passports.length, 0); assert.equal(f.deleted.length, 0);
  });
});

test('a late upload from a closed modal cannot leak its file into a different quotation', async () => {
  const f = fixture(), gate = deferred(), upload = f.ai.uploadAsset;
  f.ai.uploadAsset = async body => { await gate.promise; return upload(body); };
  await mounted(f, wizardEntry, wizardProps(f), async (document, render) => {
    await start(document); await add(document);
    await render({ isOpen: false });
    f.records = []; f.quote = { ...f.quote, id: 'ANOTHER-SYNTHETIC-QUOTE' };
    // The real listing is voucher-scoped; the old upload cannot be returned
    // by the new file's endpoint, even if it completes after reopening.
    f.list = async () => ({ success: true, data: { passports: [], idCards: [], otherDocuments: [] } });
    await render({ cotizacionData: f.quote });
    await act(async () => gate.resolve());
    await start(document);
    assert.equal(document.querySelectorAll('.document-card').length, 0);
    assert.equal(next(document).disabled, false);
  });
});

test('document management closes saved files without a second save or passenger sync', async () => {
  const f = fixture(); let closed = 0, refreshed = 0;
  await mounted(f, wizardEntry, { ...wizardProps(f), isEditMode: true, isDocumentManagementMode: true,
    voucherData: { id: 7 }, onClose: () => { ++closed; }, onSave: () => { ++refreshed; } }, async document => {
    assert.equal(document.querySelector('.voucher-modal-footer .save-button'), null);
    assert.match(document.querySelector('.document-autosave-status').textContent, /automáticamente/);
    await add(document);
    await click(document.querySelector('.close-documents-button'));
    assert.equal(closed, 1); assert.equal(refreshed, 1);
    assert.equal(f.uploads, 1); assert.equal(f.updates.length, 0); assert.equal(f.syncs.length, 0);
    assert.equal(document.querySelector('.unsaved-changes-warning'), null);
  });
});

test('both close buttons and Escape wait for automatic persistence in document management', async () => {
  const f = fixture(), gate = deferred(), upload = f.ai.uploadAsset; let closed = 0;
  f.ai.uploadAsset = async body => { await gate.promise; return upload(body); };
  await mounted(f, wizardEntry, { ...wizardProps(f), isEditMode: true, isDocumentManagementMode: true,
    voucherData: { id: 7 }, onClose: () => { ++closed; } }, async document => {
    await add(document);
    assert.equal(document.querySelector('.close-documents-button').disabled, true);
    assert.equal(document.querySelector('.voucher-modal-header .close-button').disabled, true);
    await act(async () => { const event = new window.Event('keydown', { bubbles: true }); event.key = 'Escape'; document.dispatchEvent(event); });
    assert.equal(closed, 0); assert.match(document.querySelector('.document-autosave-status').textContent, /Guardando/);
    await act(async () => gate.resolve());
    assert.equal(document.querySelector('.close-documents-button').disabled, false);
    await click(document.querySelector('.close-documents-button')); assert.equal(closed, 1);
  });
});

test('closing after a failed automatic save preserves pending files until retry or explicit discard', async () => {
  const f = fixture(); f.failUpload = 1; let closed = 0;
  await mounted(f, wizardEntry, { ...wizardProps(f), isEditMode: true, isDocumentManagementMode: true,
    voucherData: { id: 7 }, onClose: () => { ++closed; } }, async document => {
    await add(document); await click(document.querySelector('.close-documents-button'));
    assert.equal(closed, 0); assert.equal(document.querySelector('.unsaved-changes-warning'), null);
    assert.match(document.body.textContent, /Reintenta guardar los documentos o retira/);
    assert.equal(document.querySelectorAll('.document-card').length, 1);
    await click(document.querySelector('.document-retry-button'));
    await click(document.querySelector('.close-documents-button'));
    assert.equal(closed, 1); assert.equal(f.updates.length, 0);
  });
});

for (const role of [0, 2, 3, 4]) test(`role ${role} can confirm deletion of its own media but never sees deletion of another author's media`, async () => {
  const f = fixture(); f.role = role; f.records = [
    { id: 20, passengerId: 42, documentoTipo: 'passport', filename: 'protected', fileType: 'image/png', createdBy: 'other', canDelete: false },
    { id: 21, passengerId: 42, documentoTipo: 'passport', filename: 'owned', fileType: 'image/png', createdBy: 'fixture', canDelete: true },
  ];
  await mounted(f, documentsEntry, { voucherId: 7, passengerData: { adults: f.rows }, documentData: {}, onDocumentDataChange: () => {} }, async document => {
    const cards = document.querySelectorAll('.document-card');
    assert.equal(cards[0].querySelector('.delete-button'), null);
    assert.ok(cards[1].querySelector('.delete-button'));
    assert.equal(f.deleted.length, 0);
    await click(cards[1].querySelector('.delete-button'));
    assert.equal(f.deleted.length, 0, 'opening the popover never deletes');
    await click(document.querySelector('.document-delete-popover button'));
    assert.equal(f.deleted.length, 0, 'cancellation preserves the document');
    await click(document.querySelectorAll('.document-card')[1].querySelector('.delete-button'));
    await click(document.querySelector('.document-delete-popover__confirm'));
    assert.deepEqual(f.deleted, [21]);
    assert.equal(document.querySelectorAll('.document-card').length, 1);
    assert.equal(document.querySelector('.delete-button'), null);
  });
});

test('removing a failed local upload requires its popover, then closes without updating or deleting the voucher', async () => {
  const f = fixture(); f.failUpload = 1; let closed = 0, refreshed = 0;
  await mounted(f, wizardEntry, { ...wizardProps(f), isEditMode: true, isDocumentManagementMode: true,
    voucherData: { id: 7 }, onClose: () => { ++closed; }, onSave: () => { ++refreshed; } }, async document => {
    await add(document); await click(document.querySelector('.close-documents-button'));
    await click(document.querySelector('.delete-button'));
    await click(document.querySelector('.document-delete-popover__confirm'));
    await click(document.querySelector('.close-documents-button'));
    assert.equal(closed, 1); assert.equal(refreshed, 1);
    assert.equal(f.updates.length, 0); assert.equal(f.deleted.length, 0); assert.equal(f.records.length, 0);
  });
});

const escape = document => act(async () => {
  const event = new window.Event('keydown', { bubbles: true }); event.key = 'Escape'; document.dispatchEvent(event);
});
const closeFrom = (document, source) => source === 'escape' ? escape(document) :
  click(document.querySelector(source === 'header' ? '.voucher-modal-header .close-button' : '.close-documents-button'));
const passengerProps = f => ({ ...wizardProps(f), isEditMode: true, isPassengerInfoEditMode: true, voucherData: { id: 7 } });
const changePassenger = (f, patch, index = 0) => act(async () => {
  const draft = f.passengerProps.passengerData;
  f.passengerProps.onPassengerDataChange({ ...draft, adults: draft.adults.map((row, i) => i === index ? { ...row, ...patch } : row) });
});

for (const source of ['header', 'footer', 'escape']) {
  test(`payments ${source} closes independently of voucher and passenger persistence`, async () => {
    const f = fixture(); let closed = 0, refreshed = 0;
    await mounted(f, wizardEntry, { ...wizardProps(f), isEditMode: true, isPaymentManagementMode: true,
      voucherData: { id: 7 }, onClose: () => { ++closed; }, onSave: () => { ++refreshed; } }, async document => {
      assert.ok(document.querySelector('[data-step="payments"]'));
      assert.equal(document.querySelector('[data-step="passengers"]'), null);
      assert.equal(document.querySelector('.voucher-modal-steps'), null);
      assert.equal(document.querySelector('.save-button'), null);
      assert.equal(next(document), null); assert.equal(previous(document), null);
      await act(async () => f.paymentProps.onPaymentDataChange({ payments: [{ id: 900, monto: 10 }], totalPagado: 10 }));
      await closeFrom(document, source);
      assert.equal(closed, 1); assert.equal(refreshed, 1);
      assert.equal(document.querySelector('.unsaved-changes-warning'), null);
      assert.equal(f.updates.length, 0); assert.equal(f.syncs.length, 0); assert.equal(f.uploads, 0);
    });
  });

  test(`passenger ${source} warns only for a real draft and cancellation preserves it`, async () => {
    const f = fixture(); let closed = 0;
    await mounted(f, wizardEntry, { ...passengerProps(f), onClose: () => { ++closed; } }, async document => {
      assert.equal(document.querySelector('.save-button'), null);
      const original = { ...f.passengerProps.passengerData.adults[0] };
      await changePassenger(f, { nombres: 'SYNTHETIC', apellidoPaterno: 'EXAMPLE', fecha_caducidad: '2030-01-01' });
      assert.ok(document.querySelector('.save-button'));
      await closeFrom(document, source);
      assert.equal(closed, 0); assert.ok(document.querySelector('.unsaved-changes-warning'));
      await click(document.querySelector('.warning-actions .cancel-button'));
      assert.equal(f.passengerProps.passengerData.adults[0].nombres, 'SYNTHETIC');
      await changePassenger(f, original);
      assert.equal(document.querySelector('.save-button'), null);
      await closeFrom(document, source);
      assert.equal(closed, 1); assert.equal(f.syncs.length, 0); assert.equal(f.updates.length, 0);
    });
  });
}

for (const role of [0, 1, 2, 3, 4]) {
  test(`role ${role} sees independent card actions without gaining voucher deletion rights`, async () => {
    const f = fixture(), voucher = { id: 7, voucher_code: 'SYNTHETIC', status: 'ACTIVE', can_delete: true };
    const actions = [];
    await mounted(f, '../../../VoucherCard/VoucherCard.tsx', { voucher, userRole: role,
      onEdit: value => actions.push(['passengers', value]), onManagePayments: value => actions.push(['payments', value]),
      onManageDocuments: value => actions.push(['documents', value]), onDelete: () => {} }, async document => {
      const action = label => [...document.querySelectorAll('button')].find(button => button.title === label || button.getAttribute('aria-label') === label || button.textContent.trim() === label);
      // Venso preserves its expandable action row instead of Magic's card CSS.
      await click(action('Información de pasajeros'));
      await click(action('Gestionar pagos'));
      await click(action('Gestionar documentos'));
      assert.deepEqual(actions, [['passengers', voucher], ['payments', voucher], ['documents', voucher]]);
      const more = document.querySelector('.expandable-actions__toggle');
      if (more) await click(more);
      assert.equal(Boolean([...document.querySelectorAll('button')].find(button => /Eliminar voucher/i.test(button.title || button.textContent))), [0, 2].includes(role));
      assert.equal(document.querySelector('.action-button.edit.superadmin'), null);
    });
  });

  test(`role ${role} opens the passenger-only editor with no save before a change`, async () => {
    const f = fixture(); f.role = role;
    await mounted(f, wizardEntry, passengerProps(f), async document => {
      assert.ok(document.querySelector('[data-step="passengers"]'));
      assert.equal(document.querySelector('[data-step="payments"]'), null);
      assert.equal(document.querySelector('.voucher-modal-steps'), null);
      assert.equal(document.querySelector('.save-button'), null);
      assert.ok(document.querySelector('.close-documents-button'));
      assert.equal(document.querySelector('#voucher-created-by'), null);
    });
  });
}

test('saving a changed passenger sends only the passenger snapshot and closes after success', async () => {
  const f = fixture(); let closed = 0, refreshed = 0;
  f.sync = body => body.adults.concat(body.children);
  await mounted(f, wizardEntry, { ...passengerProps(f), onClose: () => { ++closed; },
    onPassengerInfoSaved: () => { ++refreshed; } }, async document => {
    await changePassenger(f, { nombres: 'SYNTHETIC' });
    await click(document.querySelector('.save-button'));
    assert.equal(f.syncs.length, 1); assert.equal(f.syncs[0].adults[0].nombres, 'SYNTHETIC');
    assert.equal(closed, 1); assert.equal(refreshed, 1);
    assert.equal(f.updates.length, 0); assert.equal(f.uploads, 0); assert.equal(f.creates.length, 0);
    assert.equal(document.querySelector('.save-button'), null);
  });
});

test('clearing saved passenger fields is dirty, and a failed save retains the draft', async () => {
  const f = fixture(); let closed = 0;
  f.rows[0].nombres = 'SYNTHETIC';
  f.sync = () => { throw new Error('Synthetic sync failure'); };
  await mounted(f, wizardEntry, { ...passengerProps(f), onClose: () => { ++closed; } }, async document => {
    await changePassenger(f, { nombres: '' });
    await click(document.querySelector('.save-button'));
    assert.equal(closed, 0); assert.ok(document.querySelector('.save-button'));
    assert.equal(f.passengerProps.passengerData.adults[0].nombres, '');
    assert.equal(f.syncs[0].adults[0].nombres, null);
    await closeFrom(document, 'footer');
    assert.ok(document.querySelector('.unsaved-changes-warning'));
    assert.equal(f.updates.length, 0);
  });
});

test('read-only payments have a close button, never a save or a passenger editor', async () => {
  const f = fixture(); let closed = 0;
  await mounted(f, wizardEntry, { ...wizardProps(f), isEditMode: true, isPaymentReadOnly: true,
    voucherData: { id: 7 }, onClose: () => { ++closed; } }, async document => {
    assert.ok(document.querySelector('[data-step="payments"]'));
    assert.equal(document.querySelector('.save-button'), null);
    assert.equal(f.paymentProps.readOnly, true);
    await closeFrom(document, 'footer');
    assert.equal(closed, 1); assert.equal(f.updates.length, 0); assert.equal(f.syncs.length, 0);
  });
});

test('explicit passenger discard closes without saving any part of the voucher', async () => {
  const f = fixture(); let closed = 0;
  await mounted(f, wizardEntry, { ...passengerProps(f), onClose: () => { ++closed; } }, async document => {
    await changePassenger(f, { nombres: 'SYNTHETIC' });
    await closeFrom(document, 'footer');
    await click(document.querySelector('.warning-actions .discard-button'));
    assert.equal(closed, 1); assert.equal(f.syncs.length, 0); assert.equal(f.updates.length, 0);
  });
});

test('closing while passenger data is still loading does not invent unsaved changes', async () => {
  const f = fixture(), gate = deferred(); let closed = 0;
  f.loadRows = () => gate.promise;
  await mounted(f, wizardEntry, { ...passengerProps(f), onClose: () => { ++closed; } }, async document => {
    assert.equal(document.querySelector('.save-button'), null);
    await closeFrom(document, 'header');
    assert.equal(closed, 1); assert.equal(document.querySelector('.unsaved-changes-warning'), null);
    await act(async () => gate.resolve(f.rows));
    assert.equal(f.syncs.length, 0);
  });
});

test('passenger header, footer and Escape cannot interrupt an in-flight passenger save', async () => {
  const f = fixture(), gate = deferred(); let closed = 0;
  f.sync = async body => { await gate.promise; return body.adults.concat(body.children); };
  await mounted(f, wizardEntry, { ...passengerProps(f), onClose: () => { ++closed; } }, async document => {
    await changePassenger(f, { nombres: 'SYNTHETIC' });
    await click(document.querySelector('.save-button'));
    assert.equal(document.querySelector('.close-documents-button').disabled, true);
    assert.equal(document.querySelector('.voucher-modal-header .close-button').disabled, true);
    await escape(document);
    assert.equal(closed, 0); assert.equal(document.querySelector('.unsaved-changes-warning'), null);
    await act(async () => gate.resolve());
    assert.equal(closed, 1); assert.equal(f.syncs.length, 1);
  });
});
