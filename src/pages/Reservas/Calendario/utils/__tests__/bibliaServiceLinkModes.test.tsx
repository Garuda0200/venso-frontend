import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import { parseHTML } from "linkedom";
import { BIBLIA_HOTEL_FIELDS, bibliaModeDraftField, getBibliaServiceLinkMode,
  normalizeBibliaServiceLinkModes, setBibliaServiceLinkMode } from "../bibliaServiceLinkModes";
import { buildBibliaRowChanges, createBibliaRowDraftStore } from "../bibliaRowDrafts";
import { buildBibliaEditRecord } from "../bibliaQuotationLinking";
import { BIBLIA_SCHEMA_VERSION, buildBibliaActivitiesFromSnapshots } from "../bibliaActivityMapper";
import { BIBLIA_SHEET_COLUMNS, buildBibliaDayExportMatrix } from "../bibliaDayJpegExport";
import { createBibliaDayExcelWorkbook } from "../bibliaDayExcelExport";

const row = (extra = {}) => ({ id: "hotel-row", sourceType: "standalone", standaloneRecordId: "hotel-source",
  sourceQuotationId: "Q-HOTEL", dateKey: "2026-09-28", date: new Date(2026, 8, 28),
  pax: 2, file: "HOTEL-FILE", hotelCusco: "Hotel Cusco", hotelValle: "Hotel Valle", hotelMapi: "Hotel Mapi",
  color: "#E7B8AE", overrideRecord: { id: "hotel-row", quotationSyncPending: false }, ...extra }) as any;
const reload = (record: any) => buildBibliaActivitiesFromSnapshots([], [{
  id: "hotel-source", cotizacion_id: "Q-HOTEL", is_active: true, actividad: record,
}])[0];

test("los hoteles existentes siguen siendo servicios; las tres preferencias son independientes", () => {
  for (const field of BIBLIA_HOTEL_FIELDS) assert.equal(getBibliaServiceLinkMode({}, field), "service");
  const modes = normalizeBibliaServiceLinkModes({ hotelCusco: "reference", hotelValle: "service", transport: "reference" });
  assert.deepEqual(modes, { hotelCusco: "reference" });
  assert.equal(getBibliaServiceLinkMode({ serviceLinkModes: modes }, "hotelValle"), "service");
  assert.deepEqual(setBibliaServiceLinkMode(modes, "hotelMapi", "reference"), { hotelCusco: "reference", hotelMapi: "reference" });
  assert.deepEqual(setBibliaServiceLinkMode(modes, "hotelCusco", "service"), {});
  for (const invalid of [null, [], true, "reference", { hotelValle: "unknown" }])
    assert.deepEqual(normalizeBibliaServiceLinkModes(invalid), {});
});

test("guardar reúne texto y modos de dos hoteles en una escritura confirmada", async () => {
  const activity = row(); const store = createBibliaRowDraftStore();
  store.stage(activity, "hotelCusco", "Hotel nuevo");
  store.stage(activity, bibliaModeDraftField("hotelCusco"), "reference");
  store.stage(activity, bibliaModeDraftField("hotelMapi"), "reference");
  assert.equal(activity.hotelCusco, "Hotel Cusco"); assert.equal(activity.serviceLinkModes, undefined);
  let calls = 0; let persisted: any;
  assert.equal(await store.save(activity, async (source, changes) => {
    calls++; persisted = buildBibliaEditRecord(source, changes);
    assert.deepEqual(changes, { hotelCusco: "Hotel nuevo", serviceLinkModes: { hotelCusco: "reference", hotelMapi: "reference" } });
  }), true);
  assert.equal(calls, 1); assert.equal(persisted.syncQuotation, false);
  assert.deepEqual(persisted.quotationSyncFields, ["hotelCusco", "hotelMapi"]);
  const loaded = reload(persisted);
  assert.equal(loaded.hotelCusco, "Hotel nuevo");
  assert.deepEqual(loaded.serviceLinkModes, { hotelCusco: "reference", hotelMapi: "reference" });
  assert.deepEqual(store.getSnapshot().rows[activity.id].values, {});
});

test("cancelar la preferencia de un hotel conserva los cambios de otro", () => {
  const activity = row(); const store = createBibliaRowDraftStore();
  store.stage(activity, "hotelCusco", "Otro Cusco");
  store.stage(activity, bibliaModeDraftField("hotelCusco"), "reference");
  store.stage(activity, bibliaModeDraftField("hotelValle"), "reference");
  store.discardField(activity.id, "hotelCusco");
  store.discardField(activity.id, bibliaModeDraftField("hotelCusco"));
  assert.deepEqual(buildBibliaRowChanges(activity, store.getSnapshot().rows[activity.id].values),
    { serviceLinkModes: { hotelValle: "reference" } });
  store.stage(activity, bibliaModeDraftField("hotelValle"), "service");
  assert.deepEqual(store.getSnapshot().rows[activity.id].values, {});
});

test("un error conserva texto y preferencia para reintentar sin sincronizar de forma implícita", async () => {
  const activity = row(); const store = createBibliaRowDraftStore();
  store.stage(activity, "hotelCusco", "Libre"); store.stage(activity, bibliaModeDraftField("hotelCusco"), "reference");
  const before = store.getSnapshot().rows[activity.id].values;
  assert.equal(await store.save(activity, async () => { throw new Error("Sin conexión"); }), false);
  assert.deepEqual(store.getSnapshot().rows[activity.id].values, before);
  assert.match(store.getSnapshot().rows[activity.id].error, /Sin conexión/);
  assert.equal(await store.save(activity, async (source, changes) => {
    assert.equal(buildBibliaEditRecord(source, changes).syncQuotation, false);
  }), true);
});

test("editar solo el texto de un hotel referencial no solicita actualizar la cotización", () => {
  const activity = row({ serviceLinkModes: { hotelCusco: "reference" } });
  const saved = buildBibliaEditRecord(activity, { hotelCusco: "Nombre de libre referencia" });
  assert.equal(saved.quotationSyncPending, false); assert.deepEqual(saved.quotationSyncFields, []);
  assert.equal(reload(saved).hotelCusco, "Nombre de libre referencia");
  assert.deepEqual(reload(saved).serviceLinkModes, { hotelCusco: "reference" });
});

test("promover a servicio solicita confirmación, conserva otros pendientes y no inventa cambios del resto", () => {
  const activity = row({ serviceLinkModes: { hotelCusco: "reference", hotelMapi: "reference" },
    overrideRecord: { id: "hotel-row", quotationSyncPending: true, quotationSyncFields: ["restaurant"] } });
  const changes = buildBibliaRowChanges(activity, { [bibliaModeDraftField("hotelCusco")]: "service" });
  const saved = buildBibliaEditRecord(activity, changes);
  assert.deepEqual(saved.serviceLinkModes, { hotelMapi: "reference" });
  assert.deepEqual(saved.quotationSyncFields, ["restaurant", "hotelCusco"]);
  assert.equal(saved.quotationSyncPending, true); assert.equal(saved.syncQuotation, false);
  assert.equal(buildBibliaEditRecord(row(), { serviceLinkModes: { hotelCusco: "service" } }).quotationSyncPending, false);
});

test("un registro libre guarda la elección sin reclamar sincronizar una cotización inexistente", () => {
  const saved = buildBibliaEditRecord(row({ sourceQuotationId: "" }), { serviceLinkModes: { hotelCusco: "reference" } });
  assert.equal(saved.quotationSyncPending, false); assert.deepEqual(saved.quotationSyncFields, []);
  assert.equal(saved.serviceLinkModes.hotelCusco, "reference");
});

test("snapshots de cotizaciones y registros legacy conservan sus preferencias al recargar", () => {
  const [loaded] = buildBibliaActivitiesFromSnapshots([{ id: "Q-HOTEL", fechainicio: "2026-09-28", biblia_actividades: [{
    schemaVersion: BIBLIA_SCHEMA_VERSION, id: "hotel-row", dayNumber: 1, order: 1, dateKey: "2026-09-28",
    hotelCusco: "Cusco", hotelValle: "Valle", serviceLinkModes: { hotelValle: "reference" },
  }] }], []);
  assert.equal(getBibliaServiceLinkMode(loaded, "hotelCusco"), "service");
  assert.equal(getBibliaServiceLinkMode(loaded, "hotelValle"), "reference");
  assert.equal(getBibliaServiceLinkMode(reload({ schemaVersion: BIBLIA_SCHEMA_VERSION, id: "old", dateKey: "2026-09-28", hotelCusco: "A" }), "hotelCusco"), "service");
});

test("JPG y Excel mantienen los hoteles y colores sin mostrar los controles ni añadir columnas", async () => {
  const activity = row({ serviceLinkModes: { hotelCusco: "reference", hotelMapi: "reference" } });
  const matrix = buildBibliaDayExportMatrix([activity]);
  assert.equal(matrix.headers.length, 23); assert.doesNotMatch(JSON.stringify(matrix), /reference|serviceLink|Sólo referencia/);
  const { workbook, worksheet } = createBibliaDayExcelWorkbook({ date: activity.date, activities: [activity] });
  for (const field of BIBLIA_HOTEL_FIELDS) {
    const index = BIBLIA_SHEET_COLUMNS.findIndex(([key]) => key === field);
    assert.equal(matrix.rows[0][index], activity[field]);
    assert.equal(worksheet.getRow(4).getCell(index + 1).value, activity[field]);
    assert.equal((worksheet.getRow(4).getCell(index + 1).fill as any).fgColor.argb, "FFE7B8AE");
  }
  assert.ok((await workbook.xlsx.writeBuffer()).byteLength > 0);
});

const projectRequire = createRequire(path.resolve("package.json"));
let component: any;
async function loadControl() {
  if (!component) {
    const bundle = await build({ entryPoints: ["src/pages/Reservas/Calendario/components/BibliaServiceLinkMode.tsx"],
      bundle: true, write: false, format: "cjs", platform: "node", loader: { ".scss": "empty" },
      external: ["react", "react/jsx-runtime"] });
    const exports = { exports: {} as any };
    new Function("require", "module", "exports", bundle.outputFiles[0].text)(projectRequire, exports, exports.exports);
    component = exports.exports.default;
  }
  return component;
}

test("el control muestra ambas opciones accesibles con un grupo único por hotel y estado de guardado", async () => {
  const Control = await loadControl();
  const html = renderToStaticMarkup(<div><Control label="Hotel Cusco" value="reference" onChange={() => {}} />
    <Control label="Hotel Valle" value="service" disabled onChange={() => {}} /></div>);
  const { document } = parseHTML(html);
  const groups = [...document.querySelectorAll("fieldset")];
  assert.equal(groups.length, 2);
  assert.equal(groups[0].querySelector('input[value="reference"]').hasAttribute("checked"), true);
  assert.equal(groups[0].querySelector('input[value="service"]').hasAttribute("checked"), false);
  const inputs = [...document.querySelectorAll("input")];
  assert.equal(inputs[0].getAttribute("name"), inputs[1].getAttribute("name"));
  assert.notEqual(inputs[0].getAttribute("name"), inputs[2].getAttribute("name"));
  assert.equal(groups[1].hasAttribute("disabled"), true);
  assert.match(groups[0].textContent, /Sólo referencia/); assert.match(groups[0].textContent, /sin generar un servicio/);
});
