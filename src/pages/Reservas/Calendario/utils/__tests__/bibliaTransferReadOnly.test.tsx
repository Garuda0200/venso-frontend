import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";

test("Transfer enters Biblia after session loading and cannot open editing routes even with extra grants", async () => {
  const bundled = await build({
    entryPoints: ["src/components/RoleBasedRoute.tsx"], bundle: true, write: false,
    format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/jsx-runtime", "react-dom"],
    plugins: [{ name: "transfer-route-boundaries", setup(builder) {
      builder.onResolve({ filter: /AuthContext$|LoadingSpinner$|^react-router-dom$/ }, args => ({ path: args.path.split("/").at(-1), namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "jsx", contents:
        args.path === "AuthContext" ? 'export const useAuth=()=>({auth:globalThis.__transferAuth});' :
        args.path === "react-router-dom" ? 'export const Navigate=({to})=><div data-redirect={to}/>;' :
        'export default ()=><div role="status">Cargando sesión</div>;'
      }));
    } }],
  });
  const module = { exports: {} as any };
  new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(resolve("package.json")), module, module.exports);
  const Guard = module.exports.default;
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  window.location = { pathname: "/reservas/calendario" };
  const values: any = { window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true, __transferAuth: { loading: true } };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, globalThis[key]]));
  Object.assign(globalThis, values);
  const root = createRoot(document.getElementById("root"));
  const render = () => React.act(async () => root.render(<Guard allowedRoles={[0, 3, 6]}><span data-biblia>Contenido de Biblia</span></Guard>));
  try {
    await render(); assert.match(document.body.textContent, /Cargando sesión/);
    globalThis.__transferAuth = { loading: false, isAuthenticated: true, role: 6, permissions: { allowed_routes: ["/*"], allowed_modules: ["admin", "ventas", "reservas"], actions: ["*"] } };
    await render(); assert.ok(document.querySelector("[data-biblia]"));
    for (const path of ["/ventas/cotizaciones", "/reservas/vouchers", "/reservas/servicios", "/reservas/configuracion"]) {
      window.location.pathname = path;
      await render();
      assert.equal(document.querySelector("[data-biblia]"), null);
      assert.equal(document.querySelector("[data-redirect]").getAttribute("data-redirect"), "/404");
    }
  } finally {
    await React.act(async () => root.unmount());
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete globalThis[key] : globalThis[key] = value;
  }
});

test("Transfer can browse and filter the real Biblia without editors, links or background snapshot writes", async () => {
  const bundled = await build({
    entryPoints: ["src/pages/Reservas/Calendario/Calendario.tsx"], bundle: true, write: false,
    format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/jsx-runtime", "react-dom", "exceljs"],
    plugins: [{ name: "read-only-biblia-boundaries", setup(builder) {
      builder.onResolve({ filter: /\.scss$|AuthContext$|bibliaActivityService$|apiUtils$|SourceVoucherPreviewModal$|VentasSummaryPDFModal$|file-saver$/ }, args => ({ path: args.path.split("/").at(-1), namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "jsx", contents:
        args.path === "AuthContext" ? 'export const useAuth=()=>({auth:{role:6}});' :
        args.path === "bibliaActivityService" ? 'export const bibliaActivityService=new Proxy({getOperationalData:async()=>globalThis.__bibliaData},{get:(target,key)=>target[key]||(()=>{globalThis.__bibliaWrites.push(key);throw new Error("Transfer cannot write");})});' :
        args.path === "apiUtils" ? 'export const createApiInstance=()=>({get:async()=>({data:[]})});export const isRequestCanceled=()=>false;' :
        args.path === "file-saver" ? 'export const saveAs=()=>{};' : 'export default ()=>null;'
      }));
    } }],
  });
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  const dateKey = new Date().toLocaleDateString("sv-SE");
  const values: any = { window, document, HTMLElement: window.HTMLElement, Element: window.Element,
    IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: callback => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    __bibliaWrites: [], __bibliaData: {
      quotations: [{ id: "READ-ONLY-QA", voucher_code: "FILE-LECTURA", titulo: "Reserva QA", cantidadpersonas: 2, fechainicio: dateKey,
        itinerario: [{ numero: 1, titulo: "Excursión derivada QA", servicios: [] }], biblia_actividades: [] }],
      standalone: [{ id: "readonly-row", cotizacion_id: null, is_active: true, actividad: {
        schemaVersion: 3, id: "standalone-entry:readonly", dateKey, dayNumber: 1, order: 1,
        file: "FILE-LIBRE-QA", reservationName: "Reserva independiente QA", pax: 2, excursion: "Tour de lectura QA", nationality: "Perú",
      } }],
    },
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, globalThis[key]]));
  Object.assign(globalThis, values);
  window.requestAnimationFrame = values.requestAnimationFrame;
  window.cancelAnimationFrame = clearTimeout;
  window.getComputedStyle = () => ({ getPropertyValue: () => "", position: "static" });
  const module = { exports: {} as any };
  const root = createRoot(document.getElementById("root"));
  try {
    new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(resolve("package.json")), module, module.exports);
    const Calendario = module.exports.default;
    await React.act(async () => root.render(<Calendario />));
    assert.doesNotMatch(document.body.textContent, /Agregar registro/);
    await React.act(async () => [...document.querySelectorAll("button")].find(button => button.textContent.trim() === "Día").click());
    assert.match(document.body.textContent, /FILE-LIBRE-QA/);
    assert.match(document.body.textContent, /Tour de lectura QA/);
    assert.equal(document.querySelectorAll(".biblia-edit-value,.biblia-edit-input,.biblia-sheet-table__actions,.biblia-inline-editor,.biblia-quotation-link").length, 0);
    for (const cell of document.querySelectorAll(".biblia-readonly-value")) await React.act(async () => cell.click());
    assert.equal(document.querySelectorAll(".biblia-edit-input,.biblia-inline-editor").length, 0);
    assert.match(document.body.textContent, /Descargar día/);
    const search = document.querySelector('input[placeholder="Buscar file, reserva, actividad, agencia o responsable"]');
    assert.ok(search);
    const props = search[Object.keys(search).find(key => key.startsWith("__reactProps"))];
    await React.act(async () => props.onChange({ target: { value: "NO-EXISTE" } }));
    assert.equal(document.querySelectorAll(".biblia-sheet-table tbody tr").length, 0);
    assert.deepEqual(globalThis.__bibliaWrites, []);
  } finally {
    await React.act(async () => root.unmount());
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete globalThis[key] : globalThis[key] = value;
  }
});
