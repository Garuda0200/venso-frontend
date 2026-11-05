import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const mocks = {
  AuthContext: "export const useAuth = () => f.auth;",
  secureStorage: "export default { getItem: key => key === 'userRole' ? 3 : 'reservas-qa' };",
  "react-router-dom": "export const useSearchParams = () => [f.search, () => {}];",
  useAgencyDirectory: "export const useAgencyDirectory = () => ({ data: [{ id: 1, name: 'Venso Tours', active: true, is_primary: true }] });",
  cacheInvalidation: "export const invalidateReservaAssignmentGraphCache = () => { f.invalidations++; };",
  voucherVentaService: `export const voucherVentaService = {
    getVouchersWithCotizacion: async options => { f.salesReads.push(options); return { success: true, data: structuredClone(f.vouchers) }; }
  };`,
  voucherReservaService: `export const voucherReservaService = {
    getVoucherReservasWithRelations: async options => { f.reservationReads.push(options); return { data: structuredClone(f.reservations) }; }
  };`,
  VoucherModal: `export default function VoucherModal(props) {
    f.management = props;
    const mode = props.isPaymentManagementMode ? 'payments' : props.isDocumentManagementMode ? 'documents' : 'passengers';
    return <section role="dialog" data-mode={mode} aria-label="Gestión del voucher de venta">
      <strong>{props.voucherData.voucher_code}</strong>
      <button onClick={props.onClose}>Cerrar gestión</button>
      <button onClick={async () => { await (mode === 'passengers' ? props.onPassengerInfoSaved() : props.onSave()); props.onClose(); }}>Simular guardado confirmado</button>
    </section>;
  }`,
  PaymentManagementModal: `export default function ServicePayments(props) {
    f.operational = props;
    return <section role="dialog" data-mode="services"><button onClick={props.onClose}>Cerrar pagos de servicios</button></section>;
  }`,
  ExpandableActions: `export default function Actions({ actions }) {
    return <div data-actions>{actions.filter(action => !action.hidden).map(action => <button key={action.key}
      data-action={action.key} disabled={action.disabled} onClick={action.onClick}>{action.label}</button>)}</div>;
  }`,
  QuotationVersionHistory: "export const buildClosedSaleQuotation = () => null; export default () => null;",
  EdicionReserva: "export default () => null;",
  ServiceSummaryModal: "export default () => null;",
  VentasSummaryModal: "export default () => null;",
  VentasSummaryPDFModal: "export default () => null;",
  AgencyPaymentReportModal: "export default () => null;",
  VoucherMediaManagerModal: "export default () => null;",
  PredecesoresExpander: "export default () => null;",
};

const components = build({
  stdin: {
    contents: `export { default as Page } from './src/pages/Reservas/VouchersReserva/VouchersReserva';
      export { default as Card } from './src/pages/Reservas/VouchersReserva/components/VoucherReservaCard/VoucherReservaCard';`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", packages: "external",
  define: { "import.meta.env": "{}" },
  plugins: [{ name: "reservation-management-boundaries", setup(builder) {
    builder.onResolve({ filter: /\.(scss|css)$/ }, () => ({ path: "style", namespace: "fixture" }));
    builder.onResolve({ filter: /.*/ }, args => {
      const name = args.path === "react-router-dom" ? args.path : args.path.split("/").at(-1).replace(/\.[jt]sx?$/, "");
      return mocks[name] ? { path: name, namespace: "fixture" } : null;
    });
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({
      contents: args.path === "style" ? "" : `import React from 'react';
        const f = new Proxy({}, {
          get: (_, key) => globalThis.__reservationManagement[key],
          set: (_, key, value) => { globalThis.__reservationManagement[key] = value; return true; },
        });
        ${mocks[args.path]}`,
      loader: "jsx", resolveDir: process.cwd(),
    }));
  } }],
}).then(result => {
  const module = { exports: {} as any };
  new Function("require", "module", "exports", result.outputFiles[0].text)(
    createRequire(resolve("package.json")), module, module.exports,
  );
  return module.exports;
});

const sale = (id = 41) => ({
  id, voucher_code: `FILE-${id}`, cotizacion_id: `COT-${id}`, is_active: true,
  created_at: "2026-11-01T12:00:00Z", passenger_data: { adults: [{ firstName: "María", lastName: "Quispe" }], children: [] },
  cotizacion_data: { id: `COT-${id}`, agency_id: 1, fechainicio: "2026-11-10", fechafin: "2026-11-11", total_final: 100, cantidadpersonas: 1 },
});
const reservation = () => ({
  id: "RESERVA-UUID", voucher_id: 41, cotizacion_id: "COT-41", voucher_code: "RES-41",
  assigned_itinerary: [{ numero: 1, servicios: [{ servicioId: 17, typeService: "transportes", isAssigned: true, assignedParentId: 5, assignedPrecioTotal: 50 }] }],
});

async function fixture(run, { assigned = false, cardOnly = false, callbacks = true } = {}) {
  const { Page, Card } = await components;
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  const keys = ["window", "document", "CustomEvent", "IS_REACT_ACT_ENVIRONMENT", "__reservationManagement"];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const state = {
    auth: { auth: { role: 3, dniuser: "reservas-qa" } }, search: new URLSearchParams(),
    vouchers: [sale()], reservations: assigned ? [reservation()] : [], invalidations: 0,
    salesReads: [], reservationReads: [], management: null, operational: null, selected: [],
  };
  const previousLog = console.log;
  console.log = () => {};
  Object.assign(globalThis, { window, document, CustomEvent: window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true, __reservationManagement: state });
  const root = createRoot(document.getElementById("root"));
  const click = async (text: string) => {
    const button = [...document.querySelectorAll("button")].find(element => element.textContent.trim() === text);
    assert.ok(button, text);
    await React.act(async () => button.click());
  };
  const options = callbacks ? {
    onManageQuotationPayments: voucher => state.selected.push(["payments", voucher.id]),
    onEditPassengers: voucher => state.selected.push(["passengers", voucher.id]),
    onManageDocuments: voucher => state.selected.push(["documents", voucher.id]),
  } : {};
  try {
    await React.act(async () => root.render(cardOnly ? <Card voucher={sale()} userRole={3} {...options} /> : <Page />));
    await run({ document, state, click, window });
  } finally {
    await React.act(async () => root.unmount());
    console.log = previousLog;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

test("reservation cards expose each sales action once without needing service assignments", async () => {
  await fixture(async ({ document, state, click }) => {
    for (const [action, label] of [
      ["quotation-payments", "Pagos de la cotización"], ["passengers", "Información de pasajeros"], ["documents", "Gestionar documentos"],
    ]) {
      assert.equal(document.querySelectorAll(`[data-action="${action}"]`).length, 1);
      await click(label);
    }
    assert.deepEqual(state.selected, [["payments", 41], ["passengers", 41], ["documents", 41]]);
    assert.ok(!document.querySelector('[data-action="payments"]'));
  }, { cardOnly: true });
});

test("optional missing callbacks do not create empty or duplicate actions", async () => {
  await fixture(async ({ document }) => {
    assert.equal(document.querySelectorAll('[data-action="quotation-payments"], [data-action="passengers"], [data-action="documents"]').length, 0);
  }, { cardOnly: true, callbacks: false });
});

for (const [mode, label] of [
  ["payments", "Pagos de la cotización"], ["passengers", "Información de pasajeros"], ["documents", "Gestionar documentos"],
]) {
  test(`${mode} opens the shared sales modal with the sales voucher and correct quotation`, async () => {
    await fixture(async ({ document, state, click }) => {
      await click(label);
      assert.equal(document.querySelector('[role="dialog"]').getAttribute("data-mode"), mode);
      assert.equal(state.management.voucherData.id, 41);
      assert.equal(state.management.cotizacionData.id, "COT-41");
      assert.equal(state.management.isEditMode, true);
      assert.equal(state.management.isPaymentManagementMode, mode === "payments");
      assert.equal(state.management.isDocumentManagementMode, mode === "documents");
      assert.equal(document.body.style.overflow, "hidden");
      await click("Simular guardado confirmado");
      assert.ok(!document.querySelector('[role="dialog"]'));
      assert.equal(document.body.style.overflow, "");
      assert.equal(state.invalidations, 1);
      assert.equal(state.salesReads.at(-1).skipCache, true);
      assert.equal(state.reservationReads.at(-1).skipCache, true);
    });
  });
}

test("service payments retain their reservation ID and remain separate from quotation payments", async () => {
  await fixture(async ({ document, state, click }) => {
    await click("Pagos de servicios");
    assert.equal(state.operational.voucherReserva.id, "RESERVA-UUID");
    assert.equal(state.operational.voucherReserva.voucherId, 41);
    assert.equal(state.operational.voucherReserva.cotizacionData.id, "COT-41");
    assert.equal(state.management, null);
    await click("Cerrar pagos de servicios");
    await click("Pagos de la cotización");
    assert.equal(state.management.voucherData.id, 41);
    assert.equal(state.management.voucherData.reservationVoucher.id, "RESERVA-UUID");
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
    await click("Cerrar gestión");
    assert.ok(!document.querySelector('[role="dialog"]'));
  }, { assigned: true });
});

test("reopening different actions resets their mode and cancellation does not refresh or save", async () => {
  await fixture(async ({ document, state, click }) => {
    for (const [mode, label] of [["payments", "Pagos de la cotización"], ["documents", "Gestionar documentos"], ["passengers", "Información de pasajeros"]]) {
      await click(label);
      assert.equal(document.querySelector('[role="dialog"]').getAttribute("data-mode"), mode);
      await click("Cerrar gestión");
    }
    assert.equal(state.invalidations, 0);
    assert.equal(document.body.style.overflow, "");
  });
});
