import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";

const projectRequire = createRequire(path.resolve("package.json"));
const { QueryClient, QueryClientProvider } = projectRequire("@tanstack/react-query");
const empty = "export default function Empty(){return null;}";
const stubs = {
  queryClient: "export const queryKeys={vouchersVenta:{all:['ventas'],withCotizaciones:()=>['ventas','cotizaciones']}};",
  AuthContext: "export const useAuth=()=>({auth:globalThis.__travelListing.actor,user:globalThis.__travelListing.actor});",
  "react-router-dom": "export const useLocation=()=>({state:null});",
  secureStorage: "export default {getItem:()=>0};",
  useNotifications: "export const useNotifications=()=>({confirmationModal:{isOpen:false},notification:{isVisible:false},showSuccess:()=>{},showError:()=>{},showInfo:()=>{},confirmDelete:()=>{},closeConfirmation:()=>{},closeNotification:()=>{}});",
  voucherVentaService: "export const voucherVentaService={getVouchersWithCotizacion:async()=>{globalThis.__travelListing.reads++;return {success:true,data:globalThis.__travelListing.rows};}};",
  voucherReservaService: "export const voucherReservaService={getItinerariosByVouchersVenta:async()=>({success:true,data:[]})};",
  cacheInvalidation: "export const invalidateCotizacionGraphCache=()=>{};export const invalidateReservaAssignmentGraphCache=()=>{};",
  comisionesService: "export const invalidateComisionesCache=()=>{};",
  apiUtils: "export const isRequestCanceled=()=>false;",
  pasajeroService: "export default {};",
  VoucherModal: empty, CotizacionSelectorModal: empty, VentasSummaryModal: empty,
  VentasSummaryPDFModal: empty, FlightPaymentModal: empty, TicketPaymentModal: empty,
  ServiceSummaryModal: empty, ConfirmationModal: empty, NotificationToast: empty,
  PassengerPortal: empty, PredecesoresExpander: empty,
  AgencyPaymentReportModal: empty, VoucherMediaManagerModal: empty, QuotationVersionHistory: empty,
  useAgencyDirectory: "export const useAgencyDirectory=()=>({data:[{id:1,name:'Agencia de prueba'}]});",
};
let bundle;
async function loadPage() {
  bundle ||= build({
    entryPoints: ["src/pages/Ventas/VouchersVenta/VouchersVenta.tsx"],
    bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic",
    external: ["react", "react/jsx-runtime", "@tanstack/react-query"],
    plugins: [{ name: "travel-listing-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /\.(css|scss)$/ }, () => ({ path: "style", namespace: "stub" }));
      plugin.onResolve({ filter: /.*/ }, args => {
        const key = args.path.split("/").at(-1);
        if (stubs[key]) return { path: key, namespace: "stub" };
      });
      plugin.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: stubs[args.path] || "export default {};", loader: "jsx" }));
    } }],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", (await bundle).outputFiles[0].text)(projectRequire, module, module.exports);
  return module.exports.default;
}

const wait = () => new Promise(resolve => setTimeout(resolve, 25));
async function withPage(actor, check) {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  const keys = ["window", "document", "HTMLElement", "CustomEvent", "IS_REACT_ACT_ENVIRONMENT", "__travelListing"];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false } } });
  const today = new Date();
  const day = n => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
  const row = (id, start, end, extra = {}) => ({
    id, voucher_code: `FILE-${id}`, created_by: "qa", created_at: today.toISOString(),
    is_active: true, cotizacion_id: `COT-${id}`, platform: "venso",
    cotizacion_data: { id: `COT-${id}`, fechainicio: start, fechafin: end, agency_id: 1, titulo: `Tour ${id}` },
    passenger_summary: { total: 1, adults: 1, children: 0 },
    financial_summary: { total_final: 1000, total_paid: 0 }, ...extra,
  });
  const fixture = { actor: { dniuser: "qa", ...actor }, reads: 0, rows: [
    row(1, day(10), day(20)), row(2, day(10), day(15)), row(3, day(5), day(25)),
    row(4, null, null), row(5, day(7), day(9), { is_active: false }),
    row(6, day(8), day(9), { is_active: false }),
    row(7, day(9), day(12), { created_by: "another-seller", created_by_name: "Otro vendedor" }),
  ] };
  if (Number(actor.role) === 2 && !actor.permissions?.actions?.includes("view_all_vouchers")) {
    fixture.rows = fixture.rows.filter(row => row.created_by === "qa");
  }
  Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, CustomEvent: window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true, __travelListing: fixture });
  const root = createRoot(document.getElementById("root"));
  const click = async node => { assert.ok(node, "Control visible"); await React.act(async () => { node.click(); await wait(); }); };
  const ids = () => [...document.querySelectorAll(".voucher-sale-row__code")].map(node => node.textContent.trim());
  const button = text => [...document.querySelectorAll("button")].find(node => node.textContent.trim().startsWith(text));
  try {
    const Page = await loadPage();
    await React.act(async () => { root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Page))); await wait(); });
    await React.act(async () => { await wait(); });
    await check({ fixture, document, ids, click, button, root, Page, client });
  } finally {
    await React.act(async () => root.unmount());
    client.clear();
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete globalThis[key] : globalThis[key] = value;
  }
}

for (const actor of [
  { role: 0 },
  { role: 2, platform: "all", permissions: { actions: ["view_all_vouchers"], quote_visibility: { mode: "all" } } },
  { role: 2, platform: "venso", permissions: { actions: ["view_all_vouchers"], quote_visibility: { mode: "platform" } } },
]) test(`página, filtros y cards reales alternan cierre/viaje sin recargar ni ampliar alcance, rol ${actor.role}`, () => withPage(actor, async ({ fixture, document, ids, click, button }) => {
  const toggle = () => document.querySelector('[aria-label="Listar por fechas del viaje"]');
  assert.equal(toggle().getAttribute("aria-checked"), "false");
  assert.deepEqual(ids(), ["FILE-1", "FILE-2", "FILE-3", "FILE-4", "FILE-7"], "Todos los vendedores incluye propios y ajenos desde el primer render");
  await click(button("Propios"));
  assert.deepEqual(ids(), ["FILE-1", "FILE-2", "FILE-3", "FILE-4"]);
  assert.equal(document.querySelector(".voucher-sale-row__travel"), null);
  await click(toggle());
  assert.equal(toggle().getAttribute("aria-checked"), "true");
  assert.deepEqual(ids(), ["FILE-3", "FILE-2", "FILE-1", "FILE-4"]);
  assert.match(document.body.textContent, /Sin fecha de viaje/);
  assert.equal(document.querySelectorAll(".voucher-sale-row__travel").length, 4);
  assert.match(document.querySelectorAll(".voucher-sale-row__travel")[3].textContent, /Fechas pendientes/);
  assert.match(document.body.textContent, /Agencia de prueba/);
  assert.equal(fixture.reads, 1, "Cambiar vista no solicita todos los vouchers otra vez");
  await click(button("Otros vendedores"));
  assert.deepEqual(ids(), ["FILE-7"]);
  await click(toggle());
  assert.deepEqual(ids(), ["FILE-7"], "El alcance de vendedor persiste al volver a cierre");
  await click(button("Propios"));
  const input = document.querySelector(".search-input");
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value").set.call(input, "FILE-2");
    input.dispatchEvent(new window.Event("input", { bubbles: true })); await wait();
  });
  // The native DOM input integration is exercised through React's handler
  // because the lightweight DOM does not implement the browser input tracker.
  if (ids().length !== 1) {
    const propsKey = Object.keys(input).find(key => key.startsWith("__reactProps"));
    await React.act(async () => { input[propsKey].onChange({ target: { value: "FILE-2" } }); await wait(); });
  }
  assert.deepEqual(ids(), ["FILE-2"]);
  await click(toggle());
  assert.deepEqual(ids(), ["FILE-2"], "Buscar sigue aplicándose en ambas vistas");
  await click(button("Limpiar"));
  assert.equal(toggle().getAttribute("aria-checked"), "true", "Limpiar conserva la vista elegida");
  assert.deepEqual(ids(), ["FILE-3", "FILE-7", "FILE-2", "FILE-1", "FILE-4"]);
  assert.equal(fixture.reads, 1);
}));

const reactProps = node => node[Object.keys(node).find(key => key.startsWith("__reactProps"))];
for (const scope of ["all", "platform"]) test(`selector y pestañas comparten un solo filtro de vendedores, alcance ${scope}`, () => withPage({
  role: 2, platform: scope === "all" ? "all" : "magic",
  permissions: { actions: ["view_all_vouchers"], quote_visibility: { mode: scope } },
}, async ({ fixture, document, ids, click, button, client }) => {
  const select = () => document.querySelector(".seller-filter select");
  const selected = () => [...select().options].find(option => option.selected)?.textContent;
  const changeSeller = async value => React.act(async () => {
    reactProps(select()).onChange({ target: { value } }); await wait();
  });
  assert.equal(selected(), "Todos los vendedores");
  assert.deepEqual(ids(), ["FILE-1", "FILE-2", "FILE-3", "FILE-4", "FILE-7"]);
  assert.ok(button("Todos los vendedores").classList.contains("active"));
  await click(button("Propios"));
  assert.equal(selected(), "Propios");
  assert.deepEqual(ids(), ["FILE-1", "FILE-2", "FILE-3", "FILE-4"]);
  await changeSeller("another-seller");
  assert.equal(selected(), "Otro vendedor");
  assert.deepEqual(ids(), ["FILE-7"]);
  assert.ok(button("Otros vendedores").classList.contains("active"));
  await changeSeller("");
  assert.equal(selected(), "Todos los vendedores");
  assert.deepEqual(ids(), ["FILE-1", "FILE-2", "FILE-3", "FILE-4", "FILE-7"]);
  await click(button("Otros vendedores"));
  assert.equal(selected(), "Otros vendedores");
  assert.deepEqual(ids(), ["FILE-7"]);
  await click(document.querySelector('[aria-label="Listar por fechas del viaje"]'));
  assert.equal(selected(), "Otros vendedores");
  assert.deepEqual(ids(), ["FILE-7"]);
  await click(button("Limpiar"));
  assert.equal(selected(), "Todos los vendedores");
  assert.deepEqual(ids(), ["FILE-3", "FILE-7", "FILE-2", "FILE-1", "FILE-4"]);
  await click(button("Propios"));
  await changeSeller("qa");
  await click(button("Todos los vendedores"));
  assert.equal(selected(), "Todos los vendedores");
  const input = document.querySelector(".search-input");
  for (const value of ["Tour", "Tour ", "Tour 7"]) {
    await React.act(async () => { reactProps(input).onChange({ target: { value } }); await wait(); });
    assert.equal(input.value, value, "El buscador conserva espacios mientras se escribe");
  }
  assert.deepEqual(ids(), ["FILE-7"]);
  await click(button("Limpiar"));
  assert.equal(selected(), "Todos los vendedores");
  assert.equal(ids().length, 5);
  await React.act(async () => {
    const additional = { ...fixture.rows.find(row => row.id === 7), id: 8, voucher_code: "FILE-8", created_by: "second-seller", created_by_name: "Segundo vendedor" };
    client.setQueryData(['ventas', 'cotizaciones'], [...fixture.rows, additional]);
    await wait();
  });
  assert.equal(ids().length, 6, "La selección Todos sigue aplicándose al actualizar la lista");
  await changeSeller("another-seller");
  assert.deepEqual(ids(), ["FILE-7"], "Un vendedor concreto no significa todos los otros vendedores");
  await click(button("Otros vendedores"));
  assert.deepEqual([...ids()].sort(), ["FILE-7", "FILE-8"]);
  assert.equal(selected(), "Otros vendedores");
  await React.act(async () => {
    client.setQueryData(['ventas', 'cotizaciones'], fixture.rows.filter(row => row.created_by === 'another-seller'));
    await wait();
  });
  await click(button("Propios"));
  assert.deepEqual(ids(), [], "Un grupo vacío no salta automáticamente a otro vendedor");
  assert.equal(selected(), "Propios");
  await changeSeller("");
  assert.deepEqual(ids(), ["FILE-7"]);
  assert.equal(fixture.reads, 1, "Cambiar vendedores no amplía el endpoint ni recarga todos los vouchers");
}));

test("el rango de viaje se combina con vendedor y vista, y rechaza fechas inválidas", () => withPage({ role: 0 }, async ({ document, ids, click, button }) => {
  const today = new Date();
  const day = n => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
  const changeDate = (label, value) => React.act(async () => {
    reactProps(document.querySelector(`[aria-label="${label}"]`)).onChange({ target: { value } });
    await wait();
  });
  await changeDate("Viajes desde", day(9));
  await changeDate("Viajes hasta", day(10));
  assert.deepEqual(ids(), ["FILE-1", "FILE-2", "FILE-7"]);
  await click(button("Otros vendedores"));
  assert.deepEqual(ids(), ["FILE-7"]);
  await click(document.querySelector('[aria-label="Listar por fechas del viaje"]'));
  assert.deepEqual(ids(), ["FILE-7"]);
  await changeDate("Viajes desde", "fecha inválida");
  assert.deepEqual(ids(), []);
  await click(button("Limpiar"));
  assert.equal(document.querySelector('[aria-label="Viajes desde"]').value, "");
  assert.equal(document.querySelector('[aria-label="Viajes hasta"]').value, "");
  assert.equal(document.querySelector('[aria-label="Listar por fechas del viaje"]').getAttribute("aria-checked"), "true");
  assert.deepEqual(ids(), ["FILE-3", "FILE-7", "FILE-2", "FILE-1", "FILE-4"]);
}));

for (const role of [1, 2, 3, 4]) test(`sin switch para rol ${role} sin autorización de listado global de ventas`, () => withPage({ role }, async ({ document, ids }) => {
  assert.equal(document.querySelector('[aria-label="Listar por fechas del viaje"]'), null);
  assert.ok(ids().includes("FILE-1"));
  if (role === 2) {
    assert.equal(ids().includes("FILE-7"), false, "Sin permiso se conserva la lista propia autorizada por la API");
    assert.equal(document.querySelector('.seller-scope-tabs'), null);
    assert.equal([...document.querySelectorAll('.seller-filter option')].some(option => option.textContent === 'Otros vendedores'), false);
  }
}));
