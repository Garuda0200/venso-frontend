import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";

test("los editores de Biblia funcionan en un modal frontal y guardan o cancelan el registro completo", async () => {
  const bundled = await build({
    entryPoints: ["src/pages/Reservas/Calendario/Calendario.tsx"], bundle: true, write: false,
    format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/jsx-runtime", "react-dom", "exceljs"],
    plugins: [{ name: "biblia-cell-modal-boundaries", setup(builder) {
      builder.onResolve({ filter: /\.scss$|AuthContext$|bibliaActivityService$|apiUtils$|SourceVoucherPreviewModal$|VentasSummaryPDFModal$|file-saver$/ }, args => ({ path: args.path.split("/").at(-1), namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "jsx", contents:
        args.path === "AuthContext" ? 'export const useAuth=()=>({auth:{role:3}});' :
        args.path === "bibliaActivityService" ? 'export const bibliaActivityService=globalThis.__bibliaCellService;' :
        args.path === "apiUtils" ? 'export const createApiInstance=()=>globalThis.__bibliaCellHttp;export const isRequestCanceled=()=>false;' :
        args.path === "file-saver" ? 'export const saveAs=()=>{};' : 'export default ()=>null;'
      }));
    } }],
  });
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  const today = new Date();
  const dateKey = today.toLocaleDateString("sv-SE");
  const previousDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).toLocaleDateString("sv-SE");
  const current = { id: "cell-modal-row", is_active: true, cotizacion_id: null, actividad: {
    schemaVersion: 4, id: "standalone-entry:cell-modal", dateKey, dayNumber: 1, order: 1,
    file: "FILE-MODAL", reservationName: "Reserva modal", pax: 2, nationality: "Perú", language: "ESPAÑOL",
    excursion: "Excursión inicial", observations: "Observación inicial", tickets: "BTG", time: "08:10-10:00",
    transport: "Transportes Paul · Hotel - Estación Ollantaytambo · Camioneta", hotelCusco: "Hotel inicial",
  } };
  const previous = { id: "cell-modal-previous", is_active: true, cotizacion_id: null, actividad: {
    ...current.actividad, id: "standalone-entry:cell-modal-previous", dateKey: previousDate,
    reservationName: "Reserva anterior", pax: 3, nationality: "México", language: "INGLÉS",
  } };
  const writes: any[] = [];
  const recommendations: any[] = [];
  let failNext = false;
  const service = {
    getOperationalData: async () => ({ quotations: [], standalone: [current, previous] }),
    updateStandaloneActivity: async (id: string, quotationId: string | null, activity: Record<string, any>) => {
      writes.push({ id, quotationId, activity: structuredClone(activity) });
      if (failNext) { failNext = false; throw { response: { data: { message: "Tarifa de prueba no disponible" } } }; }
      current.actividad = structuredClone(activity) as typeof current.actividad;
      return { id, cotizacion_id: quotationId, actividad: current.actividad };
    },
    recommendTours: async (activity: any) => {
      recommendations.push(activity);
      return [{ key: "valle", excursion: activity.excursion, agencyId: 7, selectedTourId: null,
        candidates: [{ tourId: 44, provider: "Venso Tours", label: "Tour del Valle", tariffAvailable: true }] }];
    },
  };
  const http = { get: async (path: string) => ({ data: {
    data: path.endsWith("/hoteles") ? [{ nombre_hotel: "Hotel nuevo de Cusco" }] :
      path.endsWith("/tickets") ? [{ entrada: "BTG" }, { entrada: "QORICANCHA" }, { entrada: "CATEDRAL" }] : [],
  } }) };
  const values: any = { window, document, HTMLElement: window.HTMLElement, Element: window.Element,
    IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: callback => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    __bibliaCellService: service, __bibliaCellHttp: http };
  const globals = Object.fromEntries(Object.keys(values).map(key => [key, globalThis[key]]));
  Object.assign(globalThis, values);
  window.requestAnimationFrame = values.requestAnimationFrame;
  window.cancelAnimationFrame = clearTimeout;
  window.getComputedStyle = () => ({ getPropertyValue: () => "", position: "static" });
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ top: 100, bottom: 150, left: 100, right: 700, width: 600, height: 50 });
  const module = { exports: {} as any };
  const root = createRoot(document.getElementById("root"));
  const reactProps = (element: any) => element[Object.keys(element).find(key => key.startsWith("__reactProps"))];
  const click = async (element: any) => {
    assert.ok(element, "control presente");
    await React.act(async () => {
      // linkedom does not synthesize a form submit from a submit button click.
      if (element.getAttribute("type") === "submit") reactProps(element.closest("form")).onSubmit({ preventDefault() {} });
      else element.click();
    });
  };
  const row = () => [...document.querySelectorAll(".biblia-sheet-table tbody tr")].find(item => item.textContent.includes("FILE-MODAL"));
  const cell = (label: string) => row().querySelector(`td[data-label="${label}"]`);
  const dialog = () => document.querySelector('[role="dialog"]');
  const open = async (label: string) => {
    await click(cell(label).querySelector(".biblia-edit-value"));
    assert.ok(dialog(), `${label} abre un modal`);
    assert.equal(document.querySelector(".biblia-sheet-table").contains(dialog()), false, "el formulario queda fuera de la tabla");
    assert.equal(cell(label).querySelector("input,textarea,.smart-combobox"), null);
  };
  const edit = async (control: any, value: string) => {
    assert.ok(control, "campo disponible dentro del modal");
    await React.act(async () => reactProps(control).onChange({ target: { value } }));
  };
  const button = (text: string) => [...dialog().querySelectorAll("button")].find(item => item.textContent.trim() === text);
  try {
    new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(resolve("package.json")), module, module.exports);
    const Calendario = module.exports.default;
    await React.act(async () => root.render(<Calendario />));
    await click([...document.querySelectorAll("button")].find(item => item.textContent.trim() === "Día"));

    for (const label of ["FECHA", "NOMBRE DE LA RESERVA", "N° PAX", "IDIOMA", "TIPO DE SERVICIO",
      "HOTEL VALLE", "HOTEL MAPI", "RESTAURANTE", "ENDOSE", "TRANSPORTE", "GUIA TRASLADISTA",
      "TREN IDA", "TREN RETORNO", "INCIDENCIAS", "COUNTER", "NOMBRE DE AGENCIA"]) {
      await open(label);
      assert.ok(dialog().querySelector("input,textarea,select"), `${label} tiene su campo dentro del modal`);
      await click(button("Cancelar"));
      assert.equal(Boolean(dialog()), false);
    }
    assert.equal(writes.length, 0, "abrir y cancelar los distintos editores no escribe registros");

    await open("OBSERVACIONES");
    await edit(dialog().querySelector("textarea"), "Texto amplio\nque se puede leer completo");
    assert.equal(writes.length, 0);
    await click(button("Cancelar"));
    assert.equal(Boolean(dialog()), false);
    assert.equal(cell("OBSERVACIONES").textContent, "Observación inicial");

    await open("HOTEL CUSCO");
    const hotelInput = dialog().querySelector(".combobox-input");
    await edit(hotelInput, "Hotel nuevo");
    await click([...document.querySelectorAll('[role="option"]')].find(item => item.textContent === "Hotel nuevo de Cusco"));
    assert.ok(dialog(), "elegir una opción de catálogo conserva el modal");
    await click(button("Guardar registro"));
    assert.equal(Boolean(dialog()), false);
    assert.equal(writes.at(-1).activity.hotelCusco, "Hotel nuevo de Cusco");
    assert.equal(writes.at(-1).activity.transport, "Transportes Paul · Hotel - Estación Ollantaytambo · Camioneta");

    await open("INGRESOS");
    const addTicket = async (ticket: string) => {
      await edit(dialog().querySelector(".combobox-input"), ticket);
      await click([...document.querySelectorAll('[role="option"]')].find(item => item.textContent === ticket));
    };
    await addTicket("QORICANCHA");
    await addTicket("CATEDRAL");
    assert.match(dialog().textContent, /QORI/);
    assert.match(dialog().textContent, /CATE/);
    await click(button("Guardar registro"));
    assert.equal(writes.at(-1).activity.tickets, "BTG + QORICANCHA + CATEDRAL");

    const beforeFile = writes.length;
    await open("FILE");
    await click([...dialog().querySelectorAll("button")].find(item => item.textContent.includes("Usar estos datos")));
    assert.equal(writes.length, beforeFile, "copiar datos solo modifica el borrador");
    await click(button("Cancelar"));
    assert.equal(cell("N° PAX").textContent, "2");
    assert.equal(cell("NOMBRE DE LA RESERVA").textContent, "Reserva modal");
    await open("FILE");
    await click([...dialog().querySelectorAll("button")].find(item => item.textContent.includes("Usar estos datos")));
    await click(button("Guardar registro"));
    assert.equal(writes.at(-1).activity.pax, 3);
    assert.equal(writes.at(-1).activity.reservationName, "Reserva anterior");
    assert.equal(writes.at(-1).activity.language, "INGLÉS");

    await open("EXCURSION");
    await edit(dialog().querySelector("textarea,input"), "Valle Sagrado");
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 280)); });
    assert.equal(recommendations.at(-1).excursion, "Valle Sagrado");
    await edit(dialog().querySelector("select"), "44");
    await click(button("Guardar registro"));
    assert.equal(writes.at(-1).activity.excursion, "Valle Sagrado");
    assert.deepEqual(writes.at(-1).activity.tourSelections, [{ excursionKey: "valle", tourId: 44, agencyId: 7 }]);

    await open("OBSERVACIONES");
    await edit(dialog().querySelector("textarea"), "Texto conservado ante error");
    failNext = true;
    await click(button("Guardar registro"));
    assert.ok(dialog(), "el fallo del servidor mantiene abierto el modal");
    assert.equal(dialog().querySelector("textarea").value, "Texto conservado ante error");
    assert.match(dialog().textContent, /Tarifa de prueba no disponible/);
    await click(button("Guardar registro"));
    assert.equal(Boolean(dialog()), false);
    assert.equal(cell("OBSERVACIONES").textContent, "Texto conservado ante error");
    assert.equal(current.actividad.transport, "Transportes Paul · Hotel - Estación Ollantaytambo · Camioneta");
  } finally {
    await React.act(async () => root.unmount());
    for (const [key, value] of Object.entries(globals)) value === undefined ? delete globalThis[key] : globalThis[key] = value;
  }
});
