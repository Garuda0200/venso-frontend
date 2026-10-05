import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { buildBibliaRowChanges, createBibliaRowDraftStore } from "../bibliaRowDrafts";
import { buildBibliaEditRecord } from "../bibliaQuotationLinking";
import { buildBibliaActivitiesFromSnapshots } from "../bibliaActivityMapper";
import { buildBibliaDayExportMatrix } from "../bibliaDayJpegExport";
import BibliaRowSave from "../../components/BibliaRowSave";
import BibliaQuotationSyncPrompt from "../../components/BibliaQuotationSyncPrompt";

const activity = (id = "row-a", extra = {}) => ({ id, sourceType: "standalone", standaloneRecordId: id,
  dateKey: "2026-09-28", file: "DK01124", pax: 3, restaurant: "Restaurante A",
  trainOutbound: "Tren A", trainReturn: "Tren B", sourceQuotationId: "Q1",
  overrideRecord: { id, syncQuotation: false }, ...extra }) as any;

test("escribir dos servicios crea borradores sin alterar el registro guardado", () => {
  const store = createBibliaRowDraftStore(); const row = activity();
  store.stage(row, "trainOutbound", "EXPEDITION 31");
  store.stage(row, "trainReturn", "EXPEDITION 32");
  assert.deepEqual(store.getSnapshot().rows[row.id].values,
    { trainOutbound: "EXPEDITION 31", trainReturn: "EXPEDITION 32" });
  assert.equal(row.trainOutbound, "Tren A"); assert.equal(row.overrideRecord.syncQuotation, false);
});

test("Guardar registro reúne ambos trenes en una sola escritura y espera la confirmación", async () => {
  const store = createBibliaRowDraftStore(); const row = activity();
  store.stage(row, "trainOutbound", "EXPEDITION 31"); store.stage(row, "trainReturn", "EXPEDITION 32");
  let release!: () => void; let calls = 0;
  const pending = store.save(row, async (_row, changes) => {
    calls++; assert.deepEqual(changes, { trainOutbound: "EXPEDITION 31", trainReturn: "EXPEDITION 32" });
    await new Promise<void>(resolve => { release = resolve; });
  });
  assert.equal(store.getSnapshot().savingId, row.id);
  assert.equal(store.getSnapshot().rows[row.id].saved, false);
  assert.equal(store.getSnapshot().rows[row.id].savedVersion, 0);
  assert.equal(Object.keys(store.getSnapshot().rows[row.id].values).length, 2);
  release(); assert.equal(await pending, true);
  assert.equal(calls, 1); assert.equal(store.getSnapshot().savingId, null);
  assert.deepEqual(store.getSnapshot().rows[row.id].values, {});
  assert.equal(store.getSnapshot().rows[row.id].saved, true);
  assert.equal(store.getSnapshot().rows[row.id].savedVersion, 1);
});

test("un fallo conserva lo escrito, informa el error y permite reintentar", async () => {
  const store = createBibliaRowDraftStore(); const row = activity();
  store.stage(row, "restaurant", "Restaurante B");
  const failed = await store.save(row, async () => { throw { response: { data: { message: "Servicio inválido" } } }; });
  assert.equal(failed, false); assert.equal(store.getSnapshot().rows[row.id].error, "Servicio inválido");
  assert.equal(store.getSnapshot().rows[row.id].values.restaurant, "Restaurante B");
  assert.equal(store.getSnapshot().rows[row.id].savedVersion, 0);
  assert.equal(store.getSnapshot().savingId, null);
  assert.equal(await store.save(row, async () => {}), true);
  assert.equal(store.getSnapshot().rows[row.id].error, "");
  assert.equal(store.getSnapshot().rows[row.id].saved, true);
});

test("doble clic y otro registro no lanzan escrituras simultáneas", async () => {
  const store = createBibliaRowDraftStore(); const a = activity(); const b = activity("row-b");
  store.stage(a, "restaurant", "B"); store.stage(b, "restaurant", "C");
  let release!: () => void; let calls = 0;
  const persist = async () => { calls++; await new Promise<void>(resolve => { release = resolve; }); };
  const pending = store.save(a, persist);
  assert.equal(await store.save(a, persist), false); assert.equal(await store.save(b, persist), false);
  assert.equal(calls, 1); release(); await pending;
  assert.equal(store.getSnapshot().rows[b.id].values.restaurant, "C");
});

test("una edición posterior a la captura nunca se marca como ya guardada", async () => {
  const store = createBibliaRowDraftStore(); const row = activity();
  store.stage(row, "restaurant", "B");
  let release!: () => void;
  const pending = store.save(row, async () => new Promise<void>(resolve => { release = resolve; }));
  store.stage(row, "restaurant", "C"); release(); await pending;
  assert.deepEqual(store.getSnapshot().rows[row.id].values, { restaurant: "C" });
  assert.equal(store.getSnapshot().rows[row.id].saved, false);
});

test("cancelar afecta solo al campo elegido y volver al original elimina el borrador", async () => {
  const store = createBibliaRowDraftStore(); const row = activity();
  store.stage(row, "restaurant", "B"); store.stage(row, "trainOutbound", "C");
  store.discardField(row.id, "trainOutbound");
  assert.deepEqual(store.getSnapshot().rows[row.id].values, { restaurant: "B" });
  store.stage(row, "restaurant", " Restaurante A ");
  assert.deepEqual(store.getSnapshot().rows[row.id].values, {});
  let calls = 0; assert.equal(await store.save(row, async () => { calls++; }), true);
  assert.equal(calls, 0);
});

test("PAX inválido se conserva sin llegar al servidor y cero sigue siendo explícito", async () => {
  const store = createBibliaRowDraftStore(); const row = activity();
  store.stage(row, "pax", "2.5"); let calls = 0;
  assert.equal(await store.save(row, async () => { calls++; }), false);
  assert.equal(calls, 0); assert.match(store.getSnapshot().rows[row.id].error, /entero/);
  assert.equal(store.getSnapshot().rows[row.id].values.pax, "2.5");
  assert.deepEqual(buildBibliaRowChanges(row, { pax: "0" }), { pax: 0 });
  assert.throws(() => buildBibliaRowChanges(row, { pax: "-1" }), /entero/);
  assert.throws(() => buildBibliaRowChanges(row, { pax: "NaN" }), /entero/);
});

test("una eliminación confirmada retira solo los borradores de ese registro", () => {
  const store = createBibliaRowDraftStore(); const a = activity(); const b = activity("b");
  store.stage(a, "restaurant", "B"); store.stage(b, "restaurant", "C");
  store.discardRow(a.id);
  assert.equal(store.getSnapshot().rows[a.id], undefined);
  assert.equal(store.getSnapshot().rows[b.id].values.restaurant, "C");
});

test("limpiar una celda, espacios y Sin hora no crean diferencias artificiales", () => {
  const store = createBibliaRowDraftStore(); const row = activity("a", { time: "Sin hora", guide: "—" });
  store.stage(row, "time", ""); store.stage(row, "guide", " ");
  assert.deepEqual(store.getSnapshot().rows[row.id].values, {});
  assert.deepEqual(buildBibliaRowChanges(row, { restaurant: "  ", trainOutbound: " Tren nuevo " }),
    { restaurant: "—", trainOutbound: "Tren nuevo" });
});

test("solo retira el texto enriquecido de los campos modificados y conserva colores", () => {
  const row = activity("a", { sourceExcel: { cellColors: { restaurant: "#ABCDEF" },
    richText: { restaurant: [{ text: "A" }], guide: [{ text: "Guía" }] } } });
  const changes = buildBibliaRowChanges(row, { restaurant: "B" });
  assert.deepEqual(changes.sourceExcel, { cellColors: { restaurant: "#ABCDEF" }, richText: { guide: [{ text: "Guía" }] } });
  assert.equal(row.sourceExcel.richText.restaurant[0].text, "A");
});

test("flujo de guardar, recargar y actualizar: los servicios persisten sin sincronización implícita", async () => {
  const store = createBibliaRowDraftStore(); const row = activity();
  store.stage(row, "restaurant", "Restaurante B"); store.stage(row, "trainOutbound", "EXPEDITION 31");
  let stored: Record<string, any> = {};
  await store.save(row, async (current, changes) => { stored = buildBibliaEditRecord(current, changes); });
  const [reloaded] = buildBibliaActivitiesFromSnapshots([{ id: "Q1", fechainicio: row.dateKey }],
    [{ id: row.id, cotizacion_id: "Q1", actividad: stored }]);
  assert.equal(reloaded.restaurant, "Restaurante B"); assert.equal(reloaded.trainOutbound, "EXPEDITION 31");
  assert.equal(reloaded.overrideRecord.syncQuotation, false);
  assert.equal(reloaded.overrideRecord.quotationSyncPending, true);
  assert.deepEqual(reloaded.overrideRecord.quotationSyncFields, ["trainOutbound", "restaurant"]);
});

test("borradores de files o días distintos no se mezclan ni aparecen en las exportaciones", async () => {
  const store = createBibliaRowDraftStore(); const a = activity(); const b = activity("b", { dateKey: "2026-09-29" });
  store.stage(a, "restaurant", "BORRADOR_A"); store.stage(b, "restaurant", "BORRADOR_B");
  await store.save(a, async (_row, changes) => { assert.equal(changes.restaurant, "BORRADOR_A"); });
  assert.equal(store.getSnapshot().rows[b.id].values.restaurant, "BORRADOR_B");
  assert.doesNotMatch(JSON.stringify(buildBibliaDayExportMatrix([a, b])), /BORRADOR_|Guardar registro/);
});

test("el control muestra Guardar registro, pendientes, confirmación, error y bloqueo", () => {
  const store = createBibliaRowDraftStore(); const row = activity();
  const initial = renderToStaticMarkup(<BibliaRowSave busy={false} disabled={false} file={row.file} onSave={() => {}} />);
  assert.match(initial, /Guardar registro/); assert.match(initial, /disabled/);
  store.stage(row, "restaurant", "B");
  const dirty = renderToStaticMarkup(<BibliaRowSave draft={store.getSnapshot().rows[row.id]} busy={false} disabled={false} file={row.file} onSave={() => {}} />);
  assert.match(dirty, /1 cambio sin guardar/); assert.doesNotMatch(dirty, /disabled/);
  const busy = renderToStaticMarkup(<BibliaRowSave draft={store.getSnapshot().rows[row.id]} busy disabled={false} file={row.file} onSave={() => {}} />);
  assert.match(busy, /Guardando/); assert.match(busy, /disabled/);
  const error = renderToStaticMarkup(<BibliaRowSave draft={{ ...store.getSnapshot().rows[row.id], error: "No hay conexión" }} busy={false} disabled={false} file={row.file} onSave={() => {}} />);
  assert.match(error, /No se guardó/); assert.match(error, /role="alert"/);
});

test("no permite actualizar la cotización mientras hay cambios del registro sin guardar", () => {
  const row = activity("a", { overrideRecord: { quotationSyncPending: true, quotationSyncFields: ["tickets"] } });
  const html = renderToStaticMarkup(<BibliaQuotationSyncPrompt activity={row} busy={false} hasUnsavedChanges onConfirm={() => {}} />);
  assert.match(html, /Guarda el registro antes/); assert.match(html, /disabled/);
});

test("los editores usan Guardar explícito, esperan al servidor y no se pierden al salir del campo", () => {
  const source = readFileSync(resolve("src/pages/Reservas/Calendario/Calendario.tsx"), "utf8");
  const editor = source.slice(source.indexOf("const EditableValue ="), source.indexOf("const SortableBibliaRow ="));
  assert.match(editor, /if \(await onCommit\(activity\)\) setEditing\(false\)/);
  assert.doesNotMatch(editor, /onBlur=/);
  assert.match(editor, /biblia-inline-editor__save/);
  assert.match(source, /<BibliaRowSave/); assert.match(source, /draftStore\.save\(activity, commitActivityChanges\)/);
  assert.match(source, /onDraftChange=\{draftStore.stage\}/);
  const quoteSave = source.slice(source.indexOf("const persistQuotationRecords ="), source.indexOf("const persistStandaloneRecord ="));
  assert.doesNotMatch(quoteSave.slice(0, quoteSave.indexOf("try {")), /setQuotations\(/);
  const standaloneSave = source.slice(source.indexOf("const persistStandaloneRecord ="), source.indexOf("const commitActivityChanges ="));
  assert.doesNotMatch(standaloneSave.slice(0, standaloneSave.indexOf("try {")), /setStandaloneRecords\(/);
  assert.match(standaloneSave, /await bibliaActivityService.updateStandaloneActivity[\s\S]*?setStandaloneRecords/);
  assert.match(source, /if \(!open\) setPlan/);
  const css = readFileSync(resolve("src/pages/Reservas/Calendario/Calendario.scss"), "utf8");
  assert.match(css, /\.biblia-inline-editor[\s\S]*?flex-direction: column/);
  assert.doesNotMatch(css, /min-width: (300|360)px/);
});
