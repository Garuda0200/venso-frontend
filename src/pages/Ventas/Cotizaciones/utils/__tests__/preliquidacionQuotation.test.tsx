import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allocatePreLiquidacionMoney, normalizePreLiquidacionQuotationSummary } from "../preliquidacionMoney";
import { buildPreLiquidacionQuotationSummary } from "../preliquidacionQuotation";
import { calculatePreLiquidacionTotal, normalizePreLiquidacion } from "../preliquidacion";
import PreLiquidacionDocument from "../../components/PreLiquidacionDocument";
import { paginatePreLiquidacionRows } from "../preliquidacionPagination";
import { buildSummaryContentPricingModel } from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/summaryContentPricingParts";
import { buildVisibleSummaryPayload } from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/visibleSummaryTotals";

const people = { adults: [{ id: "adult:1", passenger_key: "adult:1" }, { id: "adult:2", passenger_key: "adult:2" }], children: [] };
const service = (cost: number, ids = ["adult:1", "adult:2"]) => ({
  parentService: { typeService: "tickets", nombre: "Servicio que no debe imprimirse" },
  childService: { entrada: "Entrada oculta", tipo_usuario: "adulto", procedencia: "extranjero" },
  assignedPassengerIds: ids,
  passengerSelection: { selectedIds: ids, pricingMode: "fixed" },
  pricingMode: "fixed",
  tariff: { precio: cost, precio_original: cost * ids.length },
});
const quote = () => ({
  total_final: 300.01, peopleDetails: structuredClone(people),
  additionalCosts: { fee: 0, operationalCosts: 0, extraFee: 0 },
  itinerario: [{ numero: 1, titulo: "Valle Sagrado", servicios: [service(20)] }, { numero: 2, titulo: "Machu Picchu", servicios: [service(40)] }],
});
const sum = (days: Array<{ total: number }>) => Math.round(days.reduce((acc, day) => acc + day.total, 0) * 100) / 100;

test("el reparto en centavos conserva el importe final con restos y empates", () => {
  assert.deepEqual(allocatePreLiquidacionMoney(100, [1, 1, 1]), [33.34, 33.33, 33.33]);
  assert.deepEqual(allocatePreLiquidacionMoney(0, [10, 20]), [0, 0]);
  assert.deepEqual(allocatePreLiquidacionMoney(5, []), []);
  assert.deepEqual(allocatePreLiquidacionMoney(Infinity, [1]), [0]);
  assert.deepEqual(allocatePreLiquidacionMoney(10, [NaN, -1, 0]), [3.34, 3.33, 3.33]);
});
test("paginación conserva todas las filas y deja el total en la última página", () => {
  assert.deepEqual(paginatePreLiquidacionRows([20, 20, 20, 20], 45, 40), [[0, 1], [2, 3]]);
  assert.deepEqual(paginatePreLiquidacionRows([20, 20], 0, 40), [[], [0, 1]]);
  const heights = Array.from({ length: 200 }, (_, i) => 15 + i % 4 * 15);
  const pages = paginatePreLiquidacionRows(heights, 300, 850);
  assert.deepEqual(pages.flat(), heights.map((_, i) => i));
  assert.ok(pages.every((page, i) => page.reduce((sum, index) => sum + heights[index], 0) <= (i === 0 ? 300 : 850)));
});
test("los días cotizados consolidan el total final, no los conceptos manuales", () => {
  const source = quote();
  const snapshot = JSON.stringify(source);
  const summary = buildPreLiquidacionQuotationSummary(source);
  assert.deepEqual(summary.days.map((day) => day.title), ["Valle Sagrado", "Machu Picchu"]);
  assert.deepEqual(summary.days.map((day) => day.total), [40, 80]);
  assert.equal(sum(summary.days), 120);
  const data = normalizePreLiquidacion({ quotationSummary: summary, lineItems: [{ quantity: 1, unitCost: 999 }] });
  assert.equal(calculatePreLiquidacionTotal(data), 120);
  assert.equal(data.lineItems[0].total, 999);
  assert.equal(JSON.stringify(source), snapshot);
});
test("sin total persistido usa el mismo motor comercial e incluye el fee", () => {
  const source: any = quote();
  delete source.total_final;
  source.additionalCosts.fee = 25;
  source.additionalCosts.feeMode = "percentage";
  const summary = buildPreLiquidacionQuotationSummary(source);
  assert.equal(summary.total, 150);
  assert.equal(sum(summary.days), 150);
  source.total_final = 0;
  assert.equal(buildPreLiquidacionQuotationSummary(source).total, 150);
});
test("beneficiarios distintos por día no se multiplican por todo el grupo", () => {
  const source = quote();
  source.itinerario[1].servicios = [service(40, ["adult:1"])];
  const summary = buildPreLiquidacionQuotationSummary(source);
  assert.deepEqual(summary.days.map((day) => day.total), [40, 40]);
  assert.equal(summary.total, 80);
});
test("itinerario JSON y días externos se agrupan por número y combinan títulos", () => {
  const source: any = quote();
  source.itinerario = JSON.stringify(source.itinerario);
  source.itinerario_externo = [{ numero: 1, titulo: "City Tour", servicios: [] }, { numero: 3, titulo: "Traslado", servicios: [] }];
  const summary = buildPreLiquidacionQuotationSummary(source);
  assert.deepEqual(summary.days.map((day) => day.dayNumber), [1, 2, 3]);
  assert.equal(summary.days[0].title, "Valle Sagrado, City Tour");
  assert.equal(sum(summary.days), 120);
});
test("pasajeros niño/estudiante conservan sus tarifas en los pesos diarios", () => {
  const source: any = quote();
  source.peopleDetails.children = [{ id: "child:1", passenger_key: "child:1", tipo_pasajero: "child" }];
  const ticket: any = service(10, ["child:1"]);
  ticket.childService.tipo_usuario = "estudiante";
  ticket.ticketPassengerTargetGroup = "child";
  ticket.ticketChildrenUseStudentTariffAsAdult = true;
  ticket.ticketChildPricingMode = "student_tariff";
  ticket.convertedChildToAdultMap = { "child:1": true };
  ticket.treatChildrenAsAdults = true;
  source.itinerario[0].servicios.push(ticket);
  const summary = buildPreLiquidacionQuotationSummary(source);
  assert.ok(summary.days[0].total > 40);
  assert.equal(sum(summary.days), summary.total);
});
test("no sustituye el precio cotizado por la tarifa asignada", () => {
  const source: any = quote();
  const expected = buildPreLiquidacionQuotationSummary(source);
  source.itinerario[0].servicios[0].assignedTariff = { precio: 500, precio_original: 1000 };
  assert.deepEqual(buildPreLiquidacionQuotationSummary(source), expected);
});
test("hotel sin servicio de itinerario se reparte en las noches seleccionadas", () => {
  const source: any = quote();
  source.total_final = 400;
  source.perRoomPricing = [{ roomKey: "doble", label: "Doble", beneficiaries: 2, adultBeneficiaries: 2, adultPassengerIds: ["adult:1", "adult:2"], passengerIds: ["adult:1", "adult:2"], hotelPerPerson: 140, groupDayIndices: [0] }];
  const summary = buildPreLiquidacionQuotationSummary(source);
  assert.deepEqual(summary.days.map((day) => day.total), [320, 80]);
  assert.equal(sum(summary.days), 400);
});
test("sin costes diarios distribuye el total sin inventar días ni servicios", () => {
  const summary = buildPreLiquidacionQuotationSummary({ total_final: 100, itinerario: [{ numero: 4, titulo: "Día libre" }, { numero: 7 }] });
  assert.equal(sum(summary.days), 100);
  assert.deepEqual(summary.days.map((day) => day.dayNumber), [4, 7]);
  assert.equal(buildPreLiquidacionQuotationSummary({ total_final: 100 }).days.length, 0);
});
test("snapshot válido persiste y no etiqueta dólares como soles", () => {
  const data = normalizePreLiquidacion({ currency: "PEN", quotationSummary: { total: 100, days: [{ title: "Uno", total: 33 }, { title: "Dos", total: 33 }] } });
  assert.equal(data.currency, "USD");
  assert.equal(sum(data.quotationSummary!.days), 100);
  assert.deepEqual(normalizePreLiquidacion(JSON.parse(JSON.stringify(data))), data);
  assert.equal(normalizePreLiquidacionQuotationSummary({ total: NaN, days: [] }), null);
});
test("documento imprime únicamente día, título y total del cotizado", () => {
  const data = normalizePreLiquidacion({ quotationSummary: buildPreLiquidacionQuotationSummary(quote()) });
  const html = renderToStaticMarkup(<PreLiquidacionDocument data={data} />);
  assert.match(html, /COTIZADO POR DÍA/);
  assert.match(html, /Valle Sagrado/);
  assert.match(html, /120.00 USD/);
  assert.doesNotMatch(html, /Entrada oculta|Servicio que no debe imprimirse|SIN CONCEPTOS/);
});
test("redondea cada precio por pax antes de multiplicar, igual que Resumen y Costos", () => {
  const source: any = quote();
  source.itinerario[0].servicios = [service(20.10)];
  source.itinerario[1].servicios = [service(40.20)];
  const model = buildSummaryContentPricingModel(source);
  const visible = buildVisibleSummaryPayload(model.parts);
  const summary = buildPreLiquidacionQuotationSummary(source);
  assert.equal(visible.grandTotal, 122); // ceil(60.30) × 2, NOT ceil(120.60).
  assert.equal(model.roundedTotal, 122);
  assert.equal(summary.total, visible.grandTotal);
  assert.deepEqual(summary.days.map((day) => day.total), [40.67, 81.33]);
  assert.equal(sum(summary.days), 122);
  source.additionalCosts.fee = 25;
  source.additionalCosts.feeMode = "percentage";
  assert.equal(buildPreLiquidacionQuotationSummary(source).total, 152);
});
test("el cotizado vivo prevalece sobre total_final y snapshots comerciales antiguos", () => {
  const source: any = quote();
  source.additionalCosts.finalTotal = 999.99;
  source.additionalCosts.visibleSummaryGrandTotal = 999.99;
  source.additionalCosts.summaryVisibleParts = [{ value: 999.99, beneficiaries: 2 }];
  assert.equal(buildPreLiquidacionQuotationSummary(source).total, 120);
  source.additionalcosts = JSON.stringify(source.additionalCosts);
  delete source.additionalCosts;
  assert.equal(buildPreLiquidacionQuotationSummary(source).total, 120);
});
test("adultos y niño estudiante redondean sus precios por separado sin redondear los días", () => {
  const source: any = quote();
  source.itinerario[0].servicios = [service(20.10)];
  source.itinerario[1].servicios = [service(40.20)];
  source.peopleDetails.children = [{ id: "child:1", passenger_key: "child:1", tipo_pasajero: "child" }];
  const ticket: any = service(10.10, ["child:1"]);
  Object.assign(ticket, { ticketPassengerTargetGroup: "child", ticketChildrenUseStudentTariffAsAdult: true, ticketChildPricingMode: "student_tariff", convertedChildToAdultMap: { "child:1": true }, treatChildrenAsAdults: true });
  ticket.childService.tipo_usuario = "estudiante";
  source.itinerario[0].servicios.push(ticket);
  const summary = buildPreLiquidacionQuotationSummary(source);
  assert.equal(summary.total, 133); // ceil(60.30) × 2 + ceil(10.10).
  assert.equal(summary.total, buildVisibleSummaryPayload(buildSummaryContentPricingModel(source).parts).grandTotal);
  assert.equal(sum(summary.days), 133);
  assert.ok(summary.days.some((day) => !Number.isInteger(day.total)));
  const updated = normalizePreLiquidacion({ quotationSummary: summary, lineItems: [{ quantity: 1, unitCost: 999.99 }] });
  const html = renderToStaticMarkup(<PreLiquidacionDocument data={updated} />);
  assert.match(html, /133.00 USD/);
  assert.doesNotMatch(html, /300.01|999.99/);
  assert.equal(calculatePreLiquidacionTotal(updated), 133);
});
test("sin reconstrucción disponible conserva el fallback comercial compartido", () => {
  const source = { total_final: 700, additional_costs: JSON.stringify({ summaryVisibleParts: [{ label: "Adultos", value: 273.01, beneficiaries: 3 }] }), itinerario: [{ numero: 1, titulo: "Programa histórico", servicios: [] }] };
  const summary = buildPreLiquidacionQuotationSummary(source);
  assert.equal(summary.total, 822); // ceil(273.01) × 3, not ceil(819.03).
  assert.equal(sum(summary.days), 822);
});
test("listado abre la vista sin escritura y editor usa su cotización viva", () => {
  const source = (path: string) => readFileSync(resolve(process.cwd(), "src", path), "utf8");
  const list = source("pages/Ventas/Cotizaciones/Cotizaciones.tsx");
  assert.match(list, /onPreLiquidacion=\{handleShowPreLiquidacion\}/);
  assert.match(list, /<PreLiquidacionModal\s+isOpen\s+readOnly/);
  assert.match(list, /quotation=\{preLiquidacionCotizacion\}/);
  assert.match(source("pages/Ventas/Cotizaciones/components/CotizacionTableRow.tsx"), /Ver preliquidación/);
  assert.match(source("components/Ventas/Cotizaciones/EdicionCotizacion/EdicionCotizacion.tsx"), /quotation=\{cotizacionPreviewData\}/);
  assert.match(source("pages/Ventas/Cotizaciones/components/PreLiquidacionModal.tsx"), /fieldset className="preliq__fields" disabled=\{readOnly\}/);
});
