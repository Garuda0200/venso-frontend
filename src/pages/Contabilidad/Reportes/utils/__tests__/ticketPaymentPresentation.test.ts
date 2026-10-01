import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAgencyPaymentRows, buildProviderPaymentGroups, flattenQuoteServices } from "../paymentReportUtils";
import { groupPaymentServiceSections, reportTicketName, ticketPaymentDetailText, ticketPaymentTariffs } from "../ticketPaymentPresentation";
import TicketPaymentBreakdown from "../../../../../components/Contabilidad/shared/TicketPaymentBreakdown";

const ticket = (id: number, origin: string, child = false, entrada = "Machu Picchu") => ({
  id, typeService: "tickets", moneda: "soles", precioServicio: child ? 80 : 160,
  precioTotal: child ? 80 : 320,
  beneficiariosAdultos: child ? [{ id: "child:1", child_origin: "child:1" }] : [{ id: `adult:${id}:1` }, { id: `adult:${id}:2` }],
  beneficiariosNinos: [],
  childService: { ticket: { id_ticket: id, entrada, procedencia: origin, tipo_usuario: child ? "estudiante" : "adulto" } },
});
const quote = (services: any[], extra: any = {}) => ({
  id: "COT-TICKETS", cantidadpersonas: 6, fechainicio: "2026-10-01", additionalcosts: {},
  itinerario: [{ numero: 1, titulo: "Machu Picchu", servicios: services }], ...extra,
});

test("el nombre de entrada se resuelve en JSON anidado, plano y assigned snake/camel", () => {
  assert.equal(reportTicketName(ticket(1, "nacional")), "Machu Picchu");
  assert.equal(reportTicketName({ child_service: { entrada: "BTG" } }), "BTG");
  assert.equal(reportTicketName({ childService: { entrada: "Cotizada" }, assigned_child_service: { ticket: { entrada: "Circuito 2" } } }), "Circuito 2");
  assert.equal(reportTicketName({ childService: { entrada: "Cotizada" }, assignedChildService: { entrada: "Museo" } }), "Museo");
});

test("flujo cotización → informe agrupa las cuatro tarifas bajo la misma entrada sin cambiar servicios", () => {
  const source = quote([ticket(1, "nacional"), ticket(2, "nacional", true), ticket(3, "extranjero"), ticket(4, "extranjero", true)]);
  const before = JSON.stringify(source);
  const rows = buildAgencyPaymentRows(source);
  const groups = groupPaymentServiceSections(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, "Machu Picchu");
  assert.deepEqual(groups[0].rows.map((row) => row.serviceId), [1, 2, 3, 4]);
  assert.deepEqual(rows.map((row) => row.serviceName), Array(4).fill("Machu Picchu"));
  assert.deepEqual(rows.map((row) => row.providerName), Array(4).fill("Machu Picchu"));
  assert.deepEqual(rows.flatMap(ticketPaymentTariffs).map((item) => item.label), [
    "Adultos · Nacional · Adulto", "Niños · Nacional · Estudiante",
    "Adultos · Extranjero · Adulto", "Niños · Extranjero · Estudiante",
  ]);
  assert.deepEqual(rows.flatMap(ticketPaymentTariffs).map((item) => item.unit), [160, 80, 160, 80]);
  assert.equal(JSON.stringify(source), before);
});

test("flujo solicitudes → proveedor conserva pagos/pendientes individuales al agrupar tickets standalone", () => {
  const source = quote([ticket(1, "nacional"), ticket(2, "nacional", true)]);
  const providers = buildProviderPaymentGroups(source, { is_primary: true }, [
    { cotizacion_id: source.id, itinerario_servicio_id: 1, amount: 320, status: "paid" },
    { cotizacion_id: source.id, itinerario_servicio_id: 2, amount: 80, status: "pending" },
  ]);
  assert.equal(providers.length, 1);
  assert.equal(providers[0].providerName, "Machu Picchu");
  assert.deepEqual(providers[0].rows.map((row) => row.requestSummary.status), ["paid", "pending"]);
  assert.equal(providers[0].totals.soles.supplier, 400);
  assert.equal(providers[0].totals.soles.paid, 320);
  assert.equal(providers[0].totals.soles.pending, 80);
  assert.equal(providers[0].status, "partial");
});

test("entrada mixta muestra precio real infantil, no el promedio con adultos", () => {
  const service = { ...ticket(1, "extranjero"), beneficiariosNinos: [{ id: "child:1", precio: 80 }, { id: "child:2", precio: 0 }] };
  const [row] = buildAgencyPaymentRows(quote([service]));
  const tariffs = ticketPaymentTariffs(row);
  assert.deepEqual(tariffs.map(({ pax, unit, total }) => ({ pax, unit, total })), [
    { pax: 2, unit: 160, total: 320 }, { pax: 1, unit: 80, total: 80 }, { pax: 1, unit: 0, total: 0 },
  ]);
  assert.equal(tariffs.reduce((sum, item) => sum + item.total, 0), row.quotedTotal);
  assert.match(ticketPaymentDetailText(row), /Niños · Extranjero · Tarifa infantil: 1 pax × S\/ 80.00 = S\/ 80.00/);
});

test("una selección explícita solo infantil no reinserta adultos del file", () => {
  const [row] = flattenQuoteServices(quote([{
    ...ticket(1, "nacional"), beneficiariosAdultos: [], precioTotal: 0,
    beneficiariosNinos: [{ id: "child:1", precio: 80 }],
  }]));
  assert.equal(row.adultPax, 0);
  assert.equal(row.childPax, 1);
  assert.equal(row.pax, 1);
  assert.equal(row.quotedTotal, 80);
  assert.deepEqual(ticketPaymentTariffs(row).map((item) => item.unit), [80]);
});

test("agrupación no cruza file, día, moneda, proveedor, entrada ni itinerario externo", () => {
  const [base] = buildAgencyPaymentRows(quote([ticket(1, "nacional")]));
  const rows = [base, { ...base, quoteId: "OTRO-FILE" }, { ...base, dayNumber: 2 }, { ...base, currency: "dolares" as const },
    { ...base, providerKey: "otro" }, { ...base, daySource: "external" as const },
    { ...base, service: ticket(9, "nacional", false, "BTG") }];
  assert.equal(groupPaymentServiceSections(rows).length, 7);
});

test("procedencia internacional no se confunde con nacional", () => {
  const [row] = buildAgencyPaymentRows(quote([ticket(1, "internacional")]));
  assert.match(ticketPaymentTariffs(row)[0].label, /Extranjero/);
});

test("servicios sin metadata no mezclan entradas desconocidas ni inventan procedencia", () => {
  const rows = buildAgencyPaymentRows(quote([{ ...ticket(1, ""), childService: {} }, { ...ticket(2, ""), childService: {} }]));
  assert.equal(groupPaymentServiceSections(rows).length, 2);
  assert.match(ticketPaymentTariffs(rows[0])[0].label, /Procedencia no indicada/);
});

test("render real conserva etiquetas y precios de niños y no inserta HTML de nombres", () => {
  const [row] = buildAgencyPaymentRows(quote([ticket(1, "extranjero", true, "<script>entrada</script>")]));
  const html = renderToStaticMarkup(React.createElement(TicketPaymentBreakdown, { row }));
  assert.match(html, /Niños · Extranjero · Estudiante/);
  assert.match(html, /80\.00/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("informes no agregan cobros ni alteran fee, moneda o solicitudes al presentar subdivisiones", () => {
  const rows = buildAgencyPaymentRows(quote([ticket(1, "nacional"), ticket(2, "nacional", true)], { additionalcosts: { fee: 25, feeMode: "percentage" } }));
  const before = JSON.stringify(rows);
  const commercial = rows.reduce((sum, row) => sum + row.totalWithCommission, 0);
  groupPaymentServiceSections(rows).forEach((section) => section.rows.forEach(ticketPaymentDetailText));
  assert.equal(rows.reduce((sum, row) => sum + row.totalWithCommission, 0), commercial);
  assert.equal(JSON.stringify(rows), before);
});
