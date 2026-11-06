import { MemoryRouter } from "react-router-dom";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { prepareBibliaLinkActivity } from "../bibliaLinkDefaults";
import { buildParticipantPlan } from "../bibliaParticipantEditor";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { act as legacyAct } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { buildBibliaEditRecord, getBibliaLinkRecommendations, getBibliaLinkUnavailableReason,
  getBibliaPendingChangeLabels, getBibliaLinkDateNotice, getBibliaLinkDateWindow, quotationSyncCommandRecords } from "../bibliaQuotationLinking";
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
  assert.equal(getBibliaLinkUnavailableReason(row("free", "", { dateKey: "2026-08-31" }), quotation()), "");
  assert.equal(getBibliaLinkUnavailableReason(row("free", "", { dateKey: "2026-12-29" }), quotation()), "");
  assert.match(getBibliaLinkUnavailableReason(row("free", "", { dateKey: "2026-12-30" }), quotation()), /120 días/);
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

test("los avisos de movilidad/tarifa persisten por fila al recargar un vínculo ya guardado", () => {
  const saved = buildBibliaEditRecord(row("a", "Q1"), { transport: "Transportes Paul · City Tour · Auto" });
  const synchronized = { ...saved, quotationSyncPending: false, syncWarnings: ["Revisa la tarifa de transporte", "Revisa la tarifa de transporte", " "] };
  const [reloaded] = buildBibliaActivitiesFromSnapshots([quotation()], [{ id: "a", cotizacion_id: "Q1", actividad: synchronized }]);
  const html = renderToStaticMarkup(<BibliaQuotationSyncPrompt activity={reloaded} busy={false} onConfirm={() => {}} />);
  assert.match(html, /Vinculado/);
  assert.match(html, /aria-label="Revisar vínculo \(1 aviso\)"/);
  assert.match(html, /aria-expanded="false">!<\/button>/);
  assert.doesNotMatch(html, /Última sincronización del día/);
  const source = readFileSync(resolve("src/pages/Reservas/Calendario/Calendario.tsx"), "utf8");
  assert.doesNotMatch(source, /biblia-sync-notice|syncWarnings/);
  assert.doesNotMatch(html, /Actualización pendiente/);
  assert.doesNotMatch(JSON.stringify(buildBibliaDayExportMatrix([reloaded])), /Revisa la tarifa|syncWarnings/);
});

test("el aviso guardado abre junto al vínculo, se cierra y no actualiza la cotización", async () => {
  const { window, document } = parseHTML('<html><body><div id="root"></div><button id="outside">Fuera</button></body></html>');
  const keys = ["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  Object.assign(window, {
    innerWidth: 1024, innerHeight: 768,
    requestAnimationFrame: callback => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout,
  });
  Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const act = React.act || legacyAct;
  const root = createRoot(document.getElementById("root"));
  const saved = { ...buildBibliaEditRecord(row("a", "Q1"), {}), quotationSyncPending: false,
    syncWarnings: ["Revisa la tarifa de transporte", "Revisa la tarifa de transporte"] };
  const [activity] = buildBibliaActivitiesFromSnapshots([quotation()], [{ id: "a", cotizacion_id: "Q1", actividad: saved }]);
  let updates = 0;
  const wait = () => new Promise(resolve => setTimeout(resolve, 10));
  try {
    await act(async () => { root.render(<BibliaQuotationSyncPrompt activity={activity} busy={false} onConfirm={() => updates++} />); });
    const trigger = document.querySelector(".biblia-link-warning-trigger") as HTMLElement;
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await act(async () => { trigger.click(); await wait(); });
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    assert.equal(document.querySelectorAll('[role="dialog"] li').length, 1);
    assert.match(document.querySelector('[role="dialog"]').textContent, /Revisa la tarifa de transporte/);
    const escape = new window.Event("keydown");
    Object.defineProperty(escape, "key", { value: "Escape" });
    await act(async () => document.dispatchEvent(escape));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await act(async () => { trigger.click(); await wait(); });
    await act(async () => document.getElementById("outside").dispatchEvent(new window.Event("pointerdown", { bubbles: true })));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(updates, 0);
    assert.match(document.body.textContent, /Vinculado/);
  } finally {
    await act(async () => root.unmount());
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test("guardar cambios de transporte, excursión, PAX y modalidad no sincroniza ni inventa precio", () => {
  const activity = row("a", "Q1", { excursion: "CITY TOUR AM, MARAS MORAY PM", serviceMode: "SIC", time: "08:00" });
  const selected = "Transportes Paul · Hotel - Estación Ollantaytambo · Camioneta";
  const record = buildBibliaEditRecord(activity, { transport: selected, excursion: "VALLE SAGRADO + CONEXIÓN", pax: 5, serviceMode: "PRIV" });
  assert.equal(record.transport, selected);
  assert.equal(record.syncQuotation, false);
  assert.deepEqual(new Set(record.quotationSyncFields), new Set(["transport", "excursion", "pax", "serviceMode"]));
  assert.equal("precioTotal" in record, false);
  assert.equal("assignedPrecioTotal" in record, false);
  const command = quotationSyncCommandRecords([record, { id: "otro-dia", syncQuotation: true }], String(record.id));
  assert.deepEqual(command.map(item => item.syncQuotation), [true, false]);
  assert.equal(command[0].transport, selected);
  assert.equal(activity.transport, "Transporte A", "editar no muta el registro previo");
});

test("corregir y resincronizar quita avisos previos sin alterar la señal de vinculación", () => {
  const [activity] = buildBibliaActivitiesFromSnapshots([quotation()], [{ id: "a", cotizacion_id: "Q1", actividad: {
    ...buildBibliaEditRecord(row("a", "Q1"), {}), syncWarnings: [], quotationSyncPending: false,
  } }]);
  const html = renderToStaticMarkup(<BibliaQuotationSyncPrompt activity={activity} busy={false} onConfirm={() => {}} />);
  assert.match(html, /Vinculado/);
  assert.doesNotMatch(html, /Revisar vínculo/);
});


test("DK0802 permite vincular el 28/09 a la cotización iniciada el 29/09 sin mover otros días", () => {
  const quote = quotation("COT261002-228", { voucher_code: "DK0802", fechainicio: "2026-09-29", fechafin: "2026-09-30",
    itinerario: [{ numero: 1 }, { numero: 2 }] });
  const before = row("28", "", { file: "DK0802", dateKey: "2026-09-28", dayNumber: 1 });
  assert.equal(getBibliaLinkUnavailableReason(before, quote), "");
  assert.match(getBibliaLinkDateNotice(before, quote), /28\/09\/2026.*conservarán sus fechas/);
  assert.equal(getBibliaLinkDateWindow(before, quote).days, 3);
  const original = JSON.stringify(quote);
  const recommendations = getBibliaLinkRecommendations(before, [row("29", quote.id, { file: "DK0802" })], [quote]);
  const html = renderToStaticMarkup(<BibliaLinkRecommendations activity={before} recommendations={recommendations} busy={false} onLink={() => {}} />);
  assert.doesNotMatch(html, /disabled/);
  assert.match(html, /El inicio se ampliará/);
  assert.equal(JSON.stringify(quote), original);
});

test("el límite considera todo el viaje, también extras, y rechaza fechas inexistentes", () => {
  const before = row("free", "", { dateKey: "2026-08-31" });
  assert.equal(getBibliaLinkUnavailableReason(before, quotation("Q1", { fechafin: "2026-12-28" })), "");
  assert.match(getBibliaLinkUnavailableReason(before, quotation("Q1", { fechafin: "2026-12-29" })), /120 días/);
  assert.match(getBibliaLinkUnavailableReason(before, quotation("Q1", { itinerario_externo: [{ numero: 120 }] })), /120 días/);
  assert.match(getBibliaLinkUnavailableReason(row("bad", "", { dateKey: "2026-02-30" }), quotation()), /inválida/);
  assert.equal(getBibliaLinkDateNotice(row(), quotation()), "");
});


test("el botón recomendado para un día anterior sólo vincula al pulsarlo y respeta el guardado en curso", async () => {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  const keys = ["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const act = React.act || legacyAct;
  const root = createRoot(document.getElementById("root"));
  const activity = row("28", "", { dateKey: "2026-09-28" });
  const quote = quotation("Q1", { fechainicio: "2026-09-29", fechafin: "2026-09-30" });
  const recommendations = [{ quotation: quote, records: 2, dates: ["2026-09-29", "2026-09-30"] }];
  const linked: string[] = [];
  try {
    await act(async () => root.render(<BibliaLinkRecommendations activity={activity} recommendations={recommendations} busy={false} onLink={id => linked.push(id)} />));
    assert.deepEqual(linked, []);
    const button = document.querySelector("button") as HTMLButtonElement;
    assert.equal(button.disabled, false);
    await act(async () => button.click());
    assert.deepEqual(linked, ["Q1"]);
    await act(async () => root.render(<BibliaLinkRecommendations activity={activity} recommendations={recommendations} busy onLink={id => linked.push(id)} />));
    assert.equal((document.querySelector("button") as HTMLButtonElement).disabled, true);
  } finally {
    await act(async () => root.unmount());
    for (const key of keys) {
      if (previous[key] === undefined) delete globalThis[key]; else globalThis[key] = previous[key];
    }
  }
});

const populatedQuotation = () => quotation("Q1", { titulo: "Dora Carreño", voucher_code: "DK44567",
  cantidadpersonas: 3, idioma: "en", packagetype: "compartido",
  passengers: [{ tipo_pasajero: "adult", passenger_key: "adult-1", nacionalidad: "Perú" },
    { tipo_pasajero: "adult", passenger_key: "adult-2", nacionalidad: "Estados Unidos" },
    { tipo_pasajero: "child", passenger_key: "child-1", nacionalidad: "Perú" }],
  itinerario: [{ numero: 3, tipoServicio: "privado", titulo: "City Tour", servicios: [{ id: 1 }] }],
});
const freshRow = (extra = {}) => row("fresh", "", { pax: 0, file: "—", reservationName: "—", nationality: "—",
  language: "—", serviceMode: "SIC", excursion: "Actividad", participantPlan: null, ...extra });

test("una fila nueva se habilita y trae file, nombre, padrón adulto/niño, países, idioma y tipo del día", () => {
  const activity = freshRow(); const before = JSON.stringify(activity);
  const prepared = prepareBibliaLinkActivity(activity, populatedQuotation());
  assert.equal(getBibliaLinkUnavailableReason(activity, populatedQuotation()), "");
  assert.equal(prepared.file, "DK44567"); assert.equal(prepared.reservationName, "Dora Carreño");
  assert.equal(prepared.pax, 3); assert.equal(prepared.language, "INGLES"); assert.equal(prepared.serviceMode, "PRIV");
  assert.equal(prepared.participantPlan.adults.count, 2); assert.equal(prepared.participantPlan.children.count, 1);
  assert.equal(prepared.nationality, "Perú, Estados Unidos");
  assert.equal(prepared.restaurant, activity.restaurant); assert.equal(prepared.tickets, activity.tickets);
  assert.equal(prepared.excursion, "Actividad"); assert.equal(prepared.sourceQuotationId, "");
  assert.equal(JSON.stringify(activity), before);
});

test("un segundo registro del mismo file y fecha se recomienda sin bloquearlo por cero pax", () => {
  const quote = populatedQuotation(); const activity = freshRow({ file: "DK44567" });
  const recommendations = getBibliaLinkRecommendations(activity,
    [row("first", "Q1", { file: "DK44567", dateKey: activity.dateKey })], [quote]);
  assert.equal(recommendations.length, 1); assert.deepEqual(recommendations[0].dates, [activity.dateKey]);
  const html = renderToStaticMarkup(<BibliaLinkRecommendations activity={activity} recommendations={recommendations} busy={false} onLink={() => {}} />);
  assert.doesNotMatch(html, /disabled|necesita al menos un beneficiario/);
  assert.match(html, /Vincular aquí/);
});

test("los beneficiarios elegidos y servicios manuales del día no se reemplazan por los de la cotización", () => {
  const plan = buildParticipantPlan({ adults: ["Estados Unidos"], children: ["Perú"] });
  const activity = freshRow({ pax: 2, participantPlan: plan, nationality: "Estados Unidos, Perú",
    reservationName: "Grupo del día", language: "ESPAÑOL", serviceMode: "PRIV", transport: "Mi transporte", excursion: "Otro tour" });
  const prepared = prepareBibliaLinkActivity(activity, populatedQuotation());
  assert.equal(prepared.pax, 2); assert.deepEqual(prepared.participantPlan, plan);
  assert.equal(prepared.reservationName, "Grupo del día"); assert.equal(prepared.language, "ESPAÑOL");
  assert.equal(prepared.transport, "Mi transporte"); assert.equal(prepared.excursion, "Otro tour");
  assert.equal(getBibliaLinkUnavailableReason(activity, populatedQuotation()), "");
  assert.match(getBibliaLinkUnavailableReason({ ...activity, pax: 4, participantPlan: null }, populatedQuotation()), /superar/);
});

test("un padrón con países pendientes no inventa países ni obliga a cambiar a sus niños", () => {
  const quote = populatedQuotation(); quote.passengers[2].nacionalidad = null;
  const prepared = prepareBibliaLinkActivity(freshRow(), quote);
  assert.equal(prepared.pax, 3); assert.equal(prepared.participantPlan, null); assert.equal(prepared.nationality, "—");
  assert.equal(getBibliaLinkUnavailableReason(prepared, quote), "");
});

test("sin padrón detallado usa el total del file y no la cantidad menor de otro registro", () => {
  const quote = populatedQuotation(); quote.passengers = [];
  quote.biblia_actividades = [{ dateKey: "2026-09-01", pax: 1, reservationName: "Reserva original", restaurant: "No copiar" }];
  const prepared = prepareBibliaLinkActivity(freshRow({ restaurant: "Mi restaurante" }), quote);
  assert.equal(prepared.pax, 3); assert.equal(prepared.reservationName, "Reserva original");
  assert.equal(prepared.restaurant, "Mi restaurante");
});

test("la selección de un file sigue respetando ceros de equipaje, ventas cerradas y límites de fechas", () => {
  const imported = freshRow({ sourceExcel: { workbook: "Equipaje.xlsx" } });
  assert.equal(prepareBibliaLinkActivity(imported, populatedQuotation()).pax, 0);
  assert.match(getBibliaLinkUnavailableReason(freshRow(), populatedQuotationWithClosedSale()), /Venta cerrada/);
  assert.match(getBibliaLinkUnavailableReason(freshRow({ dateKey: "2027-01-01" }), populatedQuotation()), /120 días/);
});
function populatedQuotationWithClosedSale() { return { ...populatedQuotation(), tiene_voucher: true }; }


test("el Calendario real vincula una segunda fila vacía al mismo día, conserva el error para reintentar y recarga sus datos", async () => {
  const bundled = await build({ entryPoints: ["src/pages/Reservas/Calendario/Calendario.tsx"], bundle: true, write: false,
    format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/jsx-runtime", "react-dom", "react-router-dom", "exceljs"],
    plugins: [{ name: "link-flow-boundaries", setup(builder) {
      builder.onResolve({ filter: /\.scss$|AuthContext$|bibliaActivityService$|apiUtils$|SourceVoucherPreviewModal$|VentasSummaryPDFModal$|file-saver$/ }, args => ({ path: args.path.split("/").at(-1), namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "jsx", contents:
        args.path === "AuthContext" ? 'export const useAuth=()=>({auth:{role:3,platform:"venso"}});' :
        args.path === "bibliaActivityService" ? `export const bibliaActivityService={
          getOperationalData:async()=>globalThis.__linkData,
          saveQuotationSnapshotsBatch:async rows=>rows.map(row=>{const q=globalThis.__linkData.quotations.find(q=>q.id===row.id);q.biblia_actividades=row.biblia_actividades;return q;}),
          updateStandaloneActivity:async(id,quote,record)=>{globalThis.__linkWrites.push({id,quote,record});
            if(globalThis.__linkFail)throw {response:{data:{message:"Error de prueba al vincular"}}};
            const row=globalThis.__linkData.standalone.find(row=>row.id===id);
            Object.assign(row,{cotizacion_id:quote,actividad:record});return row;}
        };` : args.path === "apiUtils" ? 'export const createApiInstance=()=>({get:async()=>({data:[]})});export const isRequestCanceled=()=>false;' :
        args.path === "file-saver" ? 'export const saveAs=()=>{};' : 'export default ()=>null;'
      }));
    } }],
  });
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  const dateKey = new Date().toLocaleDateString("sv-SE");
  const quote = populatedQuotation(); quote.fechainicio = dateKey; quote.itinerario[0].numero = 1;
  const first = { id: "first", cotizacion_id: quote.id, actividad: { id: "entry-first", dateKey, dayNumber: 1,
    file: quote.voucher_code, reservationName: quote.titulo, pax: 3, excursion: "City Tour", order: 1 } };
  const second = { id: "second", cotizacion_id: null, actividad: { id: "entry-second", dateKey, dayNumber: 1,
    file: "—", reservationName: "—", pax: 0, excursion: "Otra excursión", serviceMode: "SIC", order: 2, restaurant: "Mi restaurante" } };
  const values: any = { window, document, HTMLElement: window.HTMLElement, Element: window.Element,
    IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: callback => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    __linkWrites: [], __linkFail: true, __linkData: { quotations: [quote], standalone: [first, second] } };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, globalThis[key]]));
  Object.assign(globalThis, values);
  window.innerWidth = 1280; window.innerHeight = 800;
  window.requestAnimationFrame = values.requestAnimationFrame; window.cancelAnimationFrame = clearTimeout;
  window.getComputedStyle = () => ({ getPropertyValue: () => "", position: "static" });
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 40, width: 200, height: 40 });
  Object.defineProperties(window.HTMLElement.prototype, {
    offsetWidth: { configurable: true, get: () => 200 }, offsetHeight: { configurable: true, get: () => 48 },
  });
  const root = createRoot(document.getElementById("root"));
  const module = { exports: {} as any }; const act = React.act || legacyAct;
  try {
    new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(resolve("package.json")), module, module.exports);
    const Calendario = module.exports.default;
    await act(async () => root.render(<MemoryRouter><Calendario /></MemoryRouter>));
    await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent.trim() === "Día").click());
    assert.equal(document.querySelectorAll(".biblia-sheet-table tbody tr").length, 2);
    await act(async () => document.querySelector('button[aria-label="Vincular file a cotización"]').click());
    let option = document.querySelector(".biblia-link-popover__list button") as HTMLButtonElement;
    assert.ok(option); assert.equal(option.disabled, false);
    await act(async () => option.click());
    assert.match(document.body.textContent, /Error de prueba al vincular/);
    assert.ok(document.querySelector(".biblia-link-popover"));
    globalThis.__linkFail = false;
    option = document.querySelector(".biblia-link-popover__list button");
    await act(async () => option.click());
    assert.equal(document.querySelector(".biblia-link-popover"), null);
    const written = globalThis.__linkWrites;
    assert.equal(written.length, 2); assert.ok(written.every(item => item.id === "second" && item.quote === "Q1"));
    assert.equal(written[1].record.pax, 3); assert.equal(written[1].record.reservationName, "Dora Carreño");
    assert.equal(written[1].record.language, "INGLES"); assert.equal(written[1].record.serviceMode, "PRIV");
    assert.equal(written[1].record.participantPlan.children.count, 1);
    assert.equal(written[1].record.restaurant, "Mi restaurante"); assert.equal(written[1].record.excursion, "Otra excursión");
    assert.equal(document.querySelectorAll(".biblia-sheet-table tbody tr").length, 2);
    assert.equal(document.querySelectorAll(".biblia-quotation-link").length, 2);
    assert.equal(first.actividad.pax, 3); assert.equal(first.actividad.excursion, "City Tour");
  } finally {
    await act(async () => root.unmount());
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete globalThis[key] : globalThis[key] = value;
  }
});
