import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const CHANGED_EVENT = "venso:agencies-changed";
const initialRows = () => [
  { id: 1, code: "venso", name: "Venso Tours", active: true, is_primary: true },
  { id: 2, code: "andina", name: "Agencia Andina", active: true, is_primary: false },
  { id: 3, code: "historica", name: "Agencia Histórica", active: false, is_primary: false },
].map(row => ({ ...row, business_type: "B2C", default_tariff_type: "externa" }));

const bundledComponents = build({
  stdin: {
    contents: `export { default as Manager } from './src/pages/Reservas/Servicios/components/agency/AgencyManager';
      export { default as Picker } from './src/components/common/TariffAgencyCombobox/TariffAgencyCombobox';
      export { default as Services } from './src/pages/Reservas/Servicios/Servicios';
      export { default as QuotationSelector } from './src/pages/Ventas/Cotizaciones/components/BusinessTypeModal';`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
  external: ["react", "react/jsx-runtime", "react-dom"],
  plugins: [{
    name: "agency-ui-boundaries",
    setup(builder) {
      builder.onLoad({ filter: /\.scss$/ }, () => ({ contents: "", loader: "js" }));
      builder.onLoad({ filter: /[\\/]AuthContext\.[jt]sx?$/ }, () => ({
        contents: "export const useAuth = () => globalThis.__agencyHarness.auth;", loader: "js",
      }));
      builder.onLoad({ filter: /[\\/]agencyService\.ts$/ }, () => ({ contents: `
        export const getAgencies = (...args) => globalThis.__agencyHarness.read(...args);
        export const getPrimaryAgency = async () => globalThis.__agencyHarness.rows[0];
        export const createAgency = body => globalThis.__agencyHarness.save('create', null, body);
        export const updateAgency = (id, body) => globalThis.__agencyHarness.save('update', id, body);
        export const deleteAgency = id => globalThis.__agencyHarness.save('delete', id);`, loader: "js",
      }));
      builder.onLoad({ filter: /Servicios[\\/]services[\\/]api\.ts$/ }, () => ({
        contents: "export const setServiciosAgencyScope = id => { globalThis.__agencyHarness.scope = id; };", loader: "js",
      }));
      builder.onLoad({ filter: /[\\/](HotelList|TicketsList|TransporteList|VuelosList|EndosesList|TrenList|GuiaList|RestauranteList|ServicioExtraList)\.tsx$/ }, () => ({
        contents: "export default function List() { return null; }", loader: "js",
      }));
      builder.onLoad({ filter: /[\\/]ServiciosWorkspace\.tsx$/ }, () => ({
        contents: "export default function Workspace({ children }) { return children; }", loader: "js",
      }));
      builder.onLoad({ filter: /[\\/]EntidadIconView\.[jt]sx$/ }, () => ({
        contents: "import React from 'react'; export default function Categories({ onSelectEntidad }) { return <button onClick={() => onSelectEntidad('agencias')}>Abrir agencias</button>; }", loader: "jsx",
      }));
      builder.onLoad({ filter: /[\\/]ServiciosCategoryTabs\.tsx$/ }, () => ({
        contents: "export default function Tabs() { return null; }", loader: "js",
      }));
      builder.onResolve({ filter: /^primereact\/dialog$/ }, () => ({ path: "quotation-dialog", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
        contents: "import React from 'react'; export function Dialog({ visible, children, footer }) { return visible ? <section role='dialog'>{children}{footer}</section> : null; }", loader: "jsx",
      }));
    },
  }],
}).then(result => {
  const module = { exports: {} as any };
  new Function("require", "module", "exports", result.outputFiles[0].text)(
    createRequire(resolve("package.json")), module, module.exports,
  );
  return module.exports;
});

async function fixture(run, options: { role?: number; services?: boolean; picker?: boolean; stored?: string; quotationSelector?: boolean } = {}) {
  const { Manager, Picker, Services, QuotationSelector } = await bundledComponents;
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  const globals = ["window", "document", "CustomEvent", "localStorage", "IS_REACT_ACT_ENVIRONMENT", "__agencyHarness"];
  const previous = Object.fromEntries(globals.map(key => [key, globalThis[key]]));
  const storage = new Map([["venso:servicios:agency-id", options.stored ?? "2"]]);
  let focused = document.body;
  Object.defineProperty(document, "activeElement", { get: () => focused });
  window.HTMLElement.prototype.focus = function () { focused = this; };
  window.HTMLElement.prototype.showModal = function () { this.open = true; };
  window.HTMLElement.prototype.close = function () { this.open = false; };
  const state = {
    rows: initialRows(), auth: { auth: { role: options.role ?? 0 } }, calls: [], changed: [], scope: null,
    readOverride: null, saveOverride: null,
    async read(includeInactive = false, config = {}) {
      if (state.readOverride) return state.readOverride(includeInactive, config);
      return structuredClone(state.rows.filter(row => includeInactive || row.active));
    },
    async save(action, id, body = {}) {
      state.calls.push({ action, id, body });
      if (state.saveOverride) await state.saveOverride(action, id, body);
      const row = action === "create"
        ? { ...state.rows[1], ...body, id: 4, code: "nueva", is_primary: false }
        : { ...state.rows.find(row => row.id === id), ...body, ...(action === "delete" ? { active: false } : {}) };
      state.rows = [...state.rows.filter(item => item.id !== row.id), row];
      window.dispatchEvent(new window.CustomEvent(CHANGED_EVENT));
      return structuredClone(row);
    },
  };
  Object.assign(globalThis, {
    window, document, CustomEvent: window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true, __agencyHarness: state,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  });
  const root = createRoot(document.getElementById("root"));
  const props = element => element[Object.keys(element).find(key => key.startsWith("__reactProps"))];
  const button = text => [...document.querySelectorAll("button")].find(element => element.textContent.trim() === text);
  const click = async target => {
    const element = typeof target === "string" ? button(target) : target;
    assert.ok(element, String(target));
    await React.act(async () => {
      element.focus();
      if (element.type === "submit") await props(element.closest("form")).onSubmit({ preventDefault() {} });
      else element.click();
    });
  };
  const change = async (selector, value, checked?) => {
    const element = document.querySelector(selector);
    assert.ok(element, selector);
    await React.act(async () => props(element).onChange({ target: { value, checked } }));
  };
  const flush = async () => React.act(async () => { await new Promise(done => setImmediate(done)); });
  const refresh = async () => React.act(async () => { window.dispatchEvent(new window.CustomEvent(CHANGED_EVENT)); });
  try {
    await React.act(async () => root.render(options.services ? <Services /> : options.quotationSelector ?
      <QuotationSelector visible onHide={() => {}} canManageAgencies onSelect={selection => { state.selection = selection; }} /> : <>
      <Manager selectedAgencyId={2} onSelectAgency={() => {}} onAgenciesChanged={rows => state.changed.push(rows)} />
      {options.picker && <Picker value={2} onChange={() => {}} />}
    </>));
    await run({ document, window, state, storage, click, change, props, flush, refresh, focus: () => focused });
  } finally {
    await React.act(async () => root.unmount());
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

test("superadmin creates, renames and reactivates agencies through the form", async () => {
  await fixture(async ({ document, state, click, change }) => {
    assert.equal(document.querySelector('[data-agency-id="3"]'), null);
    await click("Nueva agencia");
    await change('.agency-form input:not([type="checkbox"])', "Agencia Nueva");
    await click("Crear agencia");
    assert.equal(document.querySelector("dialog"), null);
    assert.match(document.querySelector('[data-agency-id="4"]').textContent, /Agencia Nueva/);
    assert.equal(state.calls[0].action, "create");
    await click(document.querySelector('[aria-label="Editar Agencia Nueva"]'));
    await change('.agency-form input:not([type="checkbox"])', "Agencia Renombrada");
    await click("Guardar cambios");
    assert.match(document.querySelector('[data-agency-id="4"]').textContent, /Agencia Renombrada/);
    await change('.agency-manager__inactive-filter input', "", true);
    await click(document.querySelector('[aria-label="Editar Agencia Histórica"]'));
    await change('.agency-form__check input', "", true);
    await click("Guardar cambios");
    assert.equal(state.rows.find(row => row.id === 3).active, true);
    assert.equal(document.querySelector('[data-agency-id="3"]').classList.contains("inactive"), false);
  });
});

test("delete confirmation cancels safely, protects primary and hides only the confirmed agency", async () => {
  await fixture(async ({ document, state, click, change, focus }) => {
    assert.equal(document.querySelector('[aria-label="Eliminar Venso Tours"]'), null);
    const trigger = document.querySelector('[aria-label="Eliminar Agencia Andina"]');
    await click(trigger);
    assert.match(document.querySelector("dialog").textContent, /cotizaciones y tarifas conservarán su referencia/);
    await click("Cancelar");
    assert.equal(state.calls.length, 0);
    assert.equal(focus(), trigger);
    await click(trigger);
    await click("Eliminar agencia");
    assert.equal(document.querySelector('[data-agency-id="2"]'), null);
    assert.equal(state.changed.at(-1).find(row => row.id === 2).active, false);
    await change('.agency-manager__inactive-filter input', "", true);
    const inactive = document.querySelector('[data-agency-id="2"]');
    assert.ok(inactive.querySelector("button").disabled);
    assert.ok(inactive.querySelector('[aria-label="Editar Agencia Andina"]'));
    assert.equal(inactive.querySelector(".delete"), null);
  });
});

test("failed deletion remains retryable and duplicate clicks submit only one request", async () => {
  await fixture(async ({ document, state, click, props, flush }) => {
    state.saveOverride = async () => { throw new Error("Sin permiso para eliminar"); };
    await click(document.querySelector('[aria-label="Eliminar Agencia Andina"]'));
    await click("Eliminar agencia");
    assert.match(document.querySelector('dialog [role="alert"]').textContent, /Sin permiso/);
    assert.ok(document.querySelector('[data-agency-id="2"]'));
    let finish;
    state.saveOverride = () => new Promise(resolve => { finish = resolve; });
    const confirm = document.querySelector("dialog .primary");
    await React.act(async () => { props(confirm).onClick(); props(confirm).onClick(); });
    assert.equal(state.calls.length, 2);
    assert.ok(document.querySelector("dialog .secondary").disabled);
    await React.act(async () => finish());
    await flush();
    assert.equal(document.querySelector("dialog"), null);
    assert.equal(document.querySelector('[data-agency-id="2"]'), null);
  });
});

test("a failed refresh after committed deletion keeps the canonical inactive state", async () => {
  await fixture(async ({ document, state, click }) => {
    state.readOverride = async () => { throw new Error("Lectura temporalmente indisponible"); };
    await click(document.querySelector('[aria-label="Eliminar Agencia Andina"]'));
    await click("Eliminar agencia");
    assert.equal(document.querySelector("dialog"), null);
    assert.equal(document.querySelector('[data-agency-id="2"]'), null);
    assert.match(document.querySelector('[role="status"]').textContent, /eliminada/);
    assert.match(document.querySelector('[role="alert"]').textContent, /cargar las agencias/);
    assert.equal(state.calls.length, 1);
  });
});

test("read-only roles have no mutation actions and Escape cancels the admin dialog", async () => {
  for (const role of [1, 2, 3, 4, 5, 6]) {
    await fixture(async ({ document, state }) => {
      assert.equal(document.querySelector(".agency-manager__create, .agency-card .edit, .agency-card .delete"), null);
      assert.ok(document.querySelector(".agency-card button"));
      assert.equal(state.calls.length, 0);
    }, { role });
  }
  await fixture(async ({ document, state, click, props }) => {
    await click(document.querySelector('[aria-label="Eliminar Agencia Andina"]'));
    let prevented = false;
    await React.act(async () => props(document.querySelector("dialog")).onCancel({ preventDefault() { prevented = true; } }));
    assert.equal(prevented, true);
    assert.equal(document.querySelector("dialog"), null);
    assert.equal(state.calls.length, 0);
  });
});

test("mounted manager and tariff picker refresh and discard older list responses", async () => {
  await fixture(async ({ document, window, state, refresh, flush, click }) => {
    const pending = [];
    state.readOverride = (_includeInactive, { signal }) => new Promise(resolve => { pending.push({ signal, resolve }); });
    await refresh();
    assert.equal(pending.length, 2);
    state.rows[1].name = "Nombre actualizado";
    state.readOverride = null;
    await refresh();
    assert.ok(pending.every(request => request.signal.aborted));
    await React.act(async () => pending.forEach(request => request.resolve(initialRows())));
    await flush();
    assert.match(document.querySelector('[data-agency-id="2"]').textContent, /Nombre actualizado/);
    assert.match(document.querySelector(".tac-trigger").textContent, /Nombre actualizado/);
    await click(document.querySelector(".tac-trigger"));
    state.rows[1].active = false;
    await refresh();
    assert.equal(document.querySelector('[data-agency-id="2"]'), null);
    assert.doesNotMatch(document.querySelector(".tac-menu").textContent, /Nombre actualizado|Agencia Histórica/);
  }, { picker: true });
});

test("Servicios falls back to primary after deleting the selected agency and preserves the all-agencies scope", async () => {
  for (const stored of ["2", "0"]) {
    await fixture(async ({ document, state, storage, click }) => {
      await click("Abrir agencias");
      await click(document.querySelector('[aria-label="Eliminar Agencia Andina"]'));
      await click("Eliminar agencia");
      assert.equal(document.querySelector("dialog"), null);
      assert.equal(storage.get("venso:servicios:agency-id"), stored === "0" ? "0" : "1");
      assert.equal(state.scope, stored === "0" ? 0 : 1);
      assert.equal(document.querySelector('#services-agency-select option[value="2"]'), null);
    }, { services: true, stored });
  }
});

test("the open quotation selector refreshes deletion and deduplicates its newly created agency", async () => {
  await fixture(async ({ document, state, click, change, refresh }) => {
    await click(document.querySelectorAll(".agency-cards > button")[1]);
    state.rows[1].active = false;
    await refresh();
    assert.equal(document.querySelector(".agency-cards .selected .platform-name").textContent, "Venso Tours");
    await click("+ Nueva agencia");
    await change(".agency-create-form input", "Nueva agencia de cotización");
    await click("Guardar agencia");
    const names = [...document.querySelectorAll(".agency-cards .platform-name")].map(element => element.textContent);
    assert.deepEqual(names.filter(name => name === "Nueva agencia de cotización"), ["Nueva agencia de cotización"]);
    assert.equal(document.querySelector(".agency-cards .selected .platform-name").textContent, "Nueva agencia de cotización");
    await click("Crear cotización");
    assert.equal(state.selection.agency.id, 4);
  }, { quotationSelector: true });
});
