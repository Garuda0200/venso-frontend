import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { buildBibliaEditRecord, getBibliaLinkRecommendations, getBibliaLinkUnavailableReason,
  getBibliaPendingChangeLabels, quotationSyncCommandRecords } from "../bibliaQuotationLinking";
import { buildBibliaActivitiesFromSnapshots, materializeBibliaOverride } from "../bibliaActivityMapper";
import { buildBibliaDayExportMatrix } from "../bibliaDayJpegExport";
import BibliaLinkRecommendations from "../../components/BibliaLinkRecommendations";
import BibliaQuotationSyncPrompt from "../../components/BibliaQuotationSyncPrompt";

const quotation = (id = "Q1", extra = {}) => ({ id, voucher_code: "FILE01", titulo: "Viaje",
  fechainicio: "2026-09-01", platform: "venso", is_active: true, ...extra });
const row = (id = "free", quote = "", extra = {}) => ({ id, dateKey: "2026-09-03", file: "FILE01",
  sourceQuotationId: quote, sourceType: "standalone", standaloneRecordId: id, platform: "venso",
  pax: 2, restaurant: "Restaurante A", transport: "Transporte A", tickets: "Entrada",
  overrideRecord: { id, syncQuotation: true }, ...extra }) as any;

test("recomienda la misma vinculación entre días y normaliza solo caso y espacios externos", () => {
  const candidates = [row("a", "Q1", { file: " file01 ", dateKey: "2026-09-01" }),
    row("b", "Q1", { dateKey: "2026-09-02" }), row("c", "Q1", { dateKey: "2026-09-02" })];
  const result = getBibliaLinkRecommendations(row(), candidates, [quotation()]);
  assert.equal(result.length, 1); assert.equal(result[0].records, 3);
  assert.deepEqual(result[0].dates, ["2026-09-01", "2026-09-02"]);
});

test("no recomienda códigos vacíos, parecidos, registros eliminados ni la misma fila", () => {
  const rows = [row("free", "Q1"), row("a", "Q1", { isDeleted: true }),
    row("b", "Q1", { file: "FILE010" }), row("c", "Q1", { file: "FILE-01" }), row("d")];
  assert.deepEqual(getBibliaLinkRecommendations(row(), rows, [quotation()]), []);
  assert.deepEqual(getBibliaLinkRecommendations(row("free", "", { file: "—" }), [row("a", "Q1", { file: "—" })], [quotation()]), []);
});

test("solo usa cotizaciones autorizadas y activas en la misma plataforma", () => {
  const rows = [row("a", "hidden"), row("b", "inactive"), row("c", "magic")];
  assert.deepEqual(getBibliaLinkRecommendations(row(), rows,
    [quotation("inactive", { is_active: false }), quotation("magic", { platform: "magic" })]), []);
});

test("varias cotizaciones para el mismo código permanecen como opciones explícitas", () => {
  const result = getBibliaLinkRecommendations(row(), [row("a", "Q2"), row("b", "Q1")], [quotation(), quotation("Q2")]);
  assert.deepEqual(result.map(item => item.quotation.id), ["Q1", "Q2"]);
  assert.deepEqual(getBibliaLinkRecommendations(row("linked", "Q1"), [row("a", "Q1")], [quotation()]), []);
});

test("bloquea vínculos incompatibles con ventas cerradas y fechas fuera de 120 días", () => {
  assert.equal(getBibliaLinkUnavailableReason(row(), quotation()), "");
  assert.match(getBibliaLinkUnavailableReason(row(), quotation("Q1", { tiene_voucher: true })), /Venta cerrada/);
  assert.match(getBibliaLinkUnavailableReason(row(), quotation("Q1", { source_sales_voucher_id: 1 })), /Venta cerrada/);
  assert.match(getBibliaLinkUnavailableReason(row(), quotation("Q1", { fechainicio: null })), /fecha de inicio/);
  assert.match(getBibliaLinkUnavailableReason(row("free", "", { dateKey: "2026-08-31" }), quotation()), /fuera/);
  assert.equal(getBibliaLinkUnavailableReason(row("free", "", { dateKey: "2026-12-29" }), quotation()), "");
  assert.match(getBibliaLinkUnavailableReason(row("free", "", { dateKey: "2026-12-30" }), quotation()), /fuera/);
});

test("editar servicios guarda Biblia y marca un pendiente sin disparar sincronización", () => {
  const record = buildBibliaEditRecord(row("a", "Q1"), { restaurant: "Restaurante B" });
  assert.equal(record.restaurant, "Restaurante B"); assert.equal(record.syncQuotation, false);
  assert.equal(record.quotationSyncPending, true); assert.deepEqual(record.quotationSyncFields, ["restaurant"]);
  assert.equal(buildBibliaEditRecord(row(), { transport: "B" }).quotationSyncPending, false);
});

test("precio operativo no se inventa y cambios de participantes, hora y fecha quedan pendientes", () => {
  const plan = { version: 1, adults: { count: 1, nationalities: [{ country: "Perú", count: 1 }] },
    children: { count: 1, nationalities: [{ country: "Italia", count: 1 }] } } as any;
  const record = buildBibliaEditRecord(row("a", "Q1"), { participantPlan: plan, time: "10:30", dateKey: "2026-09-04", pax: 1 });
  assert.deepEqual(new Set(record.quotationSyncFields), new Set(["participantPlan", "time", "dateKey", "pax"]));
  assert.equal("assigned_precio_total" in record, false); assert.equal("beneficiariosAdultos" in record, false);
});

test("colores, orden y observaciones no generan pendientes ni borran los existentes", () => {
  assert.equal(buildBibliaEditRecord(row("a", "Q1"), { color: "#FFFFFF", order: 4, observations: "Nota" }).quotationSyncPending, false);
  const pending = row("a", "Q1", { overrideRecord: { id: "a", quotationSyncPending: true, quotationSyncFields: ["tickets"] } });
  const record = buildBibliaEditRecord(pending, { color: "#FFFFFF" });
  assert.equal(record.quotationSyncPending, true); assert.deepEqual(record.quotationSyncFields, ["tickets"]);
  assert.equal(buildBibliaEditRecord(row("a", "Q1"), { restaurant: "Restaurante A" }).quotationSyncPending, false);
});

test("el aviso persiste después de recargar y acumula servicios modificados", () => {
  const saved = buildBibliaEditRecord(row("a", "Q1"), { tickets: "Otra entrada" });
  const [reloaded] = buildBibliaActivitiesFromSnapshots([quotation()], [{ id: "a", cotizacion_id: "Q1", actividad: saved }]);
  assert.deepEqual(getBibliaPendingChangeLabels(reloaded), ["Entradas"]);
  const again = buildBibliaEditRecord(reloaded, { transport: "Transporte B" });
  assert.deepEqual(again.quotationSyncFields, ["tickets", "transport"]);
});

test("confirmar sincroniza solo la fila elegida y retira marcas legacy de otros días", () => {
  const records = [materializeBibliaOverride(row("a", "Q1"), { syncQuotation: true }), materializeBibliaOverride(row("b", "Q1"), { syncQuotation: true })];
  const command = quotationSyncCommandRecords(records, "a");
  assert.equal(command[0].syncQuotation, true); assert.equal(command[1].syncQuotation, false);
  assert.deepEqual(quotationSyncCommandRecords(records).map(record => record.syncQuotation), [false, false]);
  assert.equal(records[1].syncQuotation, true, "no muta el snapshot original");
});

test("la recomendación muestra acciones rápidas y razones de bloqueo sin enlazar automáticamente", () => {
  const recommendations = getBibliaLinkRecommendations(row(), [row("a", "Q1"), row("b", "Q2")],
    [quotation(), quotation("Q2", { tiene_voucher: true })]);
  const html = renderToStaticMarkup(<BibliaLinkRecommendations activity={row()} recommendations={recommendations} busy={false} onLink={() => {}} />);
  assert.match(html, /Vincular aquí/); assert.match(html, /Venta cerrada/); assert.match(html, /disabled/);
  assert.equal((html.match(/Vincular aquí<\/button>/g) || []).length, 2);
});

test("el mismo registro ofrece confirmar o posponer sin borrar el pendiente", () => {
  const record = buildBibliaEditRecord(row("a", "Q1"), { restaurant: "B" });
  const activity = row("a", "Q1", { overrideRecord: record });
  const html = renderToStaticMarkup(<BibliaQuotationSyncPrompt activity={activity} busy={false} onConfirm={() => {}} />);
  assert.match(html, /Actualización pendiente/); assert.match(html, /Actualizar cotización/);
  assert.match(html, /Restaurante/); assert.match(html, /Luego/);
  const busy = renderToStaticMarkup(<BibliaQuotationSyncPrompt activity={activity} busy onConfirm={() => {}} />);
  assert.match(busy, /Guardando/); assert.match(busy, /disabled/);
  const confirmed = renderToStaticMarkup(<BibliaQuotationSyncPrompt activity={row("a", "Q1")} busy={false} onConfirm={() => {}} />);
  assert.match(confirmed, /Vinculado/); assert.doesNotMatch(confirmed, /Actualización pendiente/);
});

test("avisos y recomendaciones no aparecen en las columnas exportadas", () => {
  const activity = row("a", "Q1", { overrideRecord: { quotationSyncPending: true, quotationSyncFields: ["tickets"] } });
  const matrix = buildBibliaDayExportMatrix([activity]);
  assert.doesNotMatch(JSON.stringify(matrix), /quotationSync|Actualización pendiente|Vincular aquí/);
  const source = readFileSync(resolve("src/pages/Reservas/Calendario/Calendario.tsx"), "utf8");
  assert.match(source, /<BibliaLinkRecommendations/); assert.match(source, /onConfirm=\{\(\) => void syncLinkedActivity\(activity\)\}/);
  assert.match(source, /const record = buildBibliaEditRecord\(activity, changes\)/);
  assert.doesNotMatch(source, /shouldSyncQuotation|BIBLIA_ITINERARY_SERVICE_FIELDS/);
});
