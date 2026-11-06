import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { BibliaCellEditorPanel } from "../../components/BibliaCellEditorModal";
import BibliaTimeFields from "../../components/BibliaTimeFields";
import { buildBibliaRowChanges, createBibliaRowDraftStore } from "../bibliaRowDrafts";
import { buildBibliaEditRecord } from "../bibliaQuotationLinking";
import { buildBibliaDayExportMatrix } from "../bibliaDayJpegExport";

const activity = () => ({ id: "time-row", sourceType: "standalone", standaloneRecordId: "time-row",
  sourceQuotationId: "Q1", dateKey: "2026-09-28", file: "TIME-FILE", reservationName: "Reserva de prueba",
  time: "Sin hora", pax: 2, overrideRecord: { id: "time-row" } }) as any;
const props = { title: "Horario del día", context: "TIME-FILE · Reserva de prueba", busy: false, titleId: "time-title",
  onSave() {}, onCancel() {} };
const panel = (value: string, extra: { busy?: boolean; error?: string } = {}) =>
  <BibliaCellEditorPanel {...props} {...extra}>
    <BibliaTimeFields value={value} disabled={extra.busy} onChange={() => {}} />
  </BibliaCellEditorPanel>;

test("el panel ofrece dos selectores y conserva visible el texto histórico completo", () => {
  for (const value of ["8:10-10:00", "08:10", "04:00 04:15", "08:10-10:00\nRecojo en hotel y salida por confirmar"]) {
    const markup = renderToStaticMarkup(panel(value));
    assert.match(markup, /role="dialog"/);
    assert.match(markup, /aria-modal="true"/);
    assert.equal((markup.match(/type="time"/g) || []).length, 2);
    assert.match(markup, /Hora de inicio/);
    assert.match(markup, /Hora de fin/);
    if (value.includes("Recojo")) assert.ok(markup.includes(value));
  }
});

test("el error del servidor mantiene el horario visible y el guardado bloquea los selectores", () => {
  const error = "No se pudo guardar el horario. Puedes reintentar.";
  const failed = renderToStaticMarkup(panel("08:10-10:00", { error }));
  assert.match(failed, /role="alert"/);
  assert.ok(failed.includes(error));
  assert.match(failed, /value="08:10"/);
  assert.match(failed, /value="10:00"/);
  const saving = renderToStaticMarkup(panel("08:10-10:00", { busy: true }));
  assert.match(saving, /aria-busy="true"/);
  assert.match(saving, /<fieldset[^>]+disabled/);
  assert.match(saving, /type="time"[^>]+disabled/);
  assert.match(saving, /Guardando…/);
});

test("guardar el rango conserva ambas horas en el registro y en la exportación del día", async () => {
  const store = createBibliaRowDraftStore();
  const row = activity();
  store.stage(row, "time", "8:10-10:00");
  let saved: Record<string, any> | undefined;
  assert.equal(await store.save(row, async (original, changes) => { saved = buildBibliaEditRecord(original, changes); }), true);
  assert.equal(saved?.time, "8:10-10:00");
  assert.equal(saved?.syncQuotation, false);
  assert.equal(saved?.quotationSyncPending, true);
  assert.deepEqual(saved?.quotationSyncFields, ["time"]);
  const exported = buildBibliaDayExportMatrix([{ ...row, time: saved?.time }]);
  assert.equal(exported.rows[0][exported.headers.indexOf("HORA")], "8:10-10:00");
  assert.equal(row.time, "Sin hora");
});

test("un fallo de guardado permite reintentar el mismo rango sin perder el borrador", async () => {
  const store = createBibliaRowDraftStore();
  const row = activity();
  store.stage(row, "time", "8:10-10:00");
  assert.equal(await store.save(row, async () => { throw new Error("Conexión interrumpida"); }), false);
  assert.equal(store.getSnapshot().rows[row.id].values.time, "8:10-10:00");
  assert.ok(store.getSnapshot().rows[row.id].error);
  let savedTime = "";
  assert.equal(await store.save(row, async (_original, changes) => { savedTime = String(changes.time); }), true);
  assert.equal(savedTime, "8:10-10:00");
  assert.deepEqual(store.getSnapshot().rows[row.id].values, {});
});

test("cancelar el horario conserva los demás cambios de la fila y limpiar permite dejarlo sin hora", () => {
  const store = createBibliaRowDraftStore();
  const row = activity();
  store.stage(row, "time", "8:10-10:00");
  store.stage(row, "restaurant", "Restaurante del día");
  store.discardField(row.id, "time");
  assert.deepEqual(store.getSnapshot().rows[row.id].values, { restaurant: "Restaurante del día" });
  assert.deepEqual(buildBibliaRowChanges({ ...row, time: "8:10-10:00" }, { time: "" }), { time: "—" });
});
