import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";

(async () => {
  const bundle = await build({
    entryPoints: ["src/pages/Ventas/VouchersVenta/components/VoucherPdfVersionManager/VoucherPdfVersionManager.tsx"],
    bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic",
    loader: { ".scss": "empty" }, external: ["react", "react/jsx-runtime", "react-icons/*"],
    plugins: [{ name: "pdf-history-api", setup(plugin) {
      plugin.onResolve({ filter: /voucherVentaService$/ }, () => ({ path: "api", namespace: "qa" }));
      plugin.onResolve({ filter: /^react-toastify$/ }, () => ({ path: "toast", namespace: "qa" }));
      plugin.onLoad({ filter: /.*/, namespace: "qa" }, args => ({ loader: "js", contents: args.path === "toast"
        ? 'export const toast = { success: () => {}, error: () => {} };'
        : 'export const voucherVentaService = new Proxy({}, { get: (_, key) => (...args) => globalThis.__pdfHistoryQa.api[key](...args) });' }));
    } }],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(path.resolve("package.json")), module, module.exports);
  const Manager = module.exports.default;
  const version = { id: "version-1", version_number: 1, change_type: "INITIAL", created_at: "2026-10-28T16:00:00Z" };
  const snapshot = title => ({ id: version.id, snapshot: { datos_pdf: { itinerary: { days: [{ title, content: "Traslado" }], day_refs: ["100"] } }, vuelos_externos: [] } });
  const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
  const button = (document, label) => [...document.querySelectorAll("button")].find(b => b.textContent.includes(label));

  async function mounted(run) {
    const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
    const keys = ["window", "document", "HTMLElement", "CustomEvent", "IS_REACT_ACT_ENVIRONMENT", "__pdfHistoryQa"];
    const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
    const qa = { writes: [], restored: [], api: {
      getDatosPdfVersions: async () => ({ data: [version] }),
      getDatosPdfVersion: async () => ({ data: snapshot("Cusco QA") }),
      restoreDatosPdfVersion: async (...args) => { qa.writes.push(args); return { data: { voucher: { id: "voucher-A", datos_pdf: { restored: true } } } }; },
      deleteDatosPdfVersion: async (...args) => { qa.writes.push(args); },
    } };
    Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, CustomEvent: window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true, __pdfHistoryQa: qa });
    const root = createRoot(document.getElementById("root"));
    const render = props => React.act(async () => root.render(React.createElement(Manager, { isOpen: true, voucherId: "voucher-A", canRestore: true, canDelete: false, onClose: () => {}, onRestored: value => qa.restored.push(value), ...props })));
    try { await run({ document, qa, render }); }
    finally { await React.act(async () => root.unmount()); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
  }

  test("historial: consulta sin permisos de escritura y muestra el contenido de Venso", async () => {
    await mounted(async ({ document, qa, render }) => {
      await render({ canRestore: false });
      assert.match(document.body.textContent, /Venso Tours/);
      assert.match(document.body.textContent, /Cusco QA/);
      assert.equal(button(document, "Restaurar"), undefined);
      assert.equal(document.querySelector('[aria-label^="Eliminar versión"]'), null);
      assert.deepEqual(qa.writes, []);
    });
  });

  test("historial: doble confirmación envía una restauración y refleja la respuesta confirmada", async () => {
    await mounted(async ({ document, qa, render }) => {
      const request = deferred();
      qa.api.restoreDatosPdfVersion = async (...args) => { qa.writes.push(args); return request.promise; };
      await render({});
      await React.act(async () => button(document, "Restaurar esta versión").click());
      await React.act(async () => { const confirm = button(document, "Confirmar"); confirm.click(); confirm.click(); });
      assert.deepEqual(qa.writes, [["voucher-A", "version-1"]]);
      assert.equal(qa.restored.length, 0);
      await React.act(async () => request.resolve({ data: { voucher: { id: "voucher-A", datos_pdf: { restored: true } } } }));
      assert.equal(qa.restored[0].datos_pdf.restored, true);
      assert.equal(button(document, "Confirmar"), undefined);
    });
  });

  test("historial: error de restauración conserva la confirmación sin aplicar contenido local", async () => {
    await mounted(async ({ document, qa, render }) => {
      qa.api.restoreDatosPdfVersion = async () => { throw new Error("rechazo de prueba"); };
      await render({});
      await React.act(async () => button(document, "Restaurar esta versión").click());
      const previousError = console.error;
      try {
        console.error = () => {};
        await React.act(async () => button(document, "Confirmar").click());
      } finally { console.error = previousError; }
      assert.equal(qa.restored.length, 0);
      assert.ok(button(document, "Confirmar"));
      assert.match(document.body.textContent, /Cusco QA/);
    });
  });

  test("historial: una respuesta tardía de otro file no reemplaza su comparación actual", async () => {
    await mounted(async ({ document, qa, render }) => {
      const old = deferred();
      qa.api.getDatosPdfVersion = async voucher => voucher === "voucher-A" ? old.promise : ({ data: snapshot("Contenido B") });
      await render({});
      await render({ voucherId: "voucher-B" });
      assert.match(document.body.textContent, /Contenido B/);
      await React.act(async () => old.resolve({ data: snapshot("Contenido A antiguo") }));
      assert.match(document.body.textContent, /Contenido B/);
      assert.doesNotMatch(document.body.textContent, /Contenido A antiguo/);
      assert.deepEqual(qa.writes, []);
    });
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
