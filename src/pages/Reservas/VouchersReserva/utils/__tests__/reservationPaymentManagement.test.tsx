import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { compileString } from "sass";
import { normalizePaymentItinerary, getPaymentServiceId, getAssignedPaymentAmount,
  getOperationalPaymentRequest, enrichPaymentItinerary, canRequestReservationPayment,
  buildReservationPaymentCandidates, getAssignedTicketQuantity } from "../reservationPaymentManagement";
import PaymentBatchBar from "../../components/PaymentManagementModal/PaymentBatchBar";
import TicketChargeSummary from "../../components/PaymentManagementModal/TicketChargeSummary";

const ticket = (id = 1, extra: any = {}) => ({ servicioId: id, typeService: "tickets", isAssigned: true,
  assignedChildId: 20, assignedPrecioServicio: 21.90, assignedPrecioTotal: 43.80,
  assignedBeneficiariosAdultos: [], assignedBeneficiariosNinos: [0, 1], ...extra });
const itinerary = (services: any[]) => [{ numero: 1, titulo: "City Tour", servicios: services }];
const money = (value: number) => `$ ${value.toFixed(2)}`;
const componentPath = "src/pages/Reservas/VouchersReserva/components/PaymentManagementModal/";

test("normaliza assigned_* snake_case, mapas JSON e IDs numéricos sin usar lo cotizado", () => {
  const source = [{ numero: 1, servicios: { a: { id: "41", tipo_servicio: "tickets", is_assigned: true,
    child_id: 4, assigned_child_id: 9, precio_total: 900, assigned_precio_total: "43.80",
    assigned_beneficiarios_adultos: "[]", assigned_beneficiarios_ninos: { n1: 0, n2: 1 } } } }];
  const before = JSON.stringify(source);
  const row = normalizePaymentItinerary(source)[0].servicios[0];
  assert.equal(getPaymentServiceId(row), 41);
  assert.equal(canRequestReservationPayment(row), true);
  assert.equal(getAssignedPaymentAmount(row), 43.80);
  assert.equal(getAssignedTicketQuantity(row), 2);
  assert.equal(JSON.stringify(source), before);
});

test("admite asignaciones legacy con IDs operativos y wrapper camel o snake", () => {
  for (const key of ["assignedService", "assigned_service"]) {
    const row = normalizePaymentItinerary(itinerary([{ servicio_id: "17", [key]: {
      typeService: "restaurantes", childService: { id: 12 }, precioTotal: "50.10" } }]))[0].servicios[0];
    assert.equal(getPaymentServiceId(row), 17);
    assert.equal(canRequestReservationPayment(row), true);
    assert.equal(getAssignedPaymentAmount(row), 50.10);
  }
  const row = normalizePaymentItinerary(itinerary([{ id: 19, type_service: "transportes", assigned_parent_id: 5, assigned_precio_total: 60 }]))[0].servicios[0];
  assert.equal(canRequestReservationPayment(row), true);
});

test("un servicio únicamente cotizado nunca se vuelve candidato de pago", () => {
  const row = normalizePaymentItinerary(itinerary([{ id: 4, typeService: "tickets", childId: 5,
    childService: { id: 5 }, precioTotal: 100, tariff: { precio_original: 100 } }]))[0].servicios[0];
  assert.equal(row.isAssigned, false);
  assert.equal(canRequestReservationPayment(row), false);
  assert.equal(getAssignedPaymentAmount(row), 0);
});

test("cero asignado no se reemplaza por un total cotizado; precio faltante tampoco", () => {
  assert.equal(getAssignedPaymentAmount(ticket(1, { assignedPrecioTotal: 0, precioTotal: 900 })), 0);
  assert.equal(getAssignedPaymentAmount(ticket(1, { assignedPrecioTotal: undefined,
    assignedPrecioServicio: undefined, tariff: { precio_original: 900 } })), 0);
  assert.equal(canRequestReservationPayment(ticket(1, { assignedPrecioTotal: 0 })), false);
  assert.equal(canRequestReservationPayment(ticket(1, { assignedPrecioTotal: NaN })), false);
});

test("entradas asignadas participan individualmente y en lote sin cambiar trenes/vuelos", () => {
  for (const type of ["tickets", "entradas", "ticket", "restaurantes", "transportes", "guias", "endoses", "extras", "hoteles"]) {
    assert.equal(canRequestReservationPayment(ticket(1, { typeService: type })), true, type);
  }
  for (const type of ["trenes", "tren", "vuelos", "vuelo"]) {
    assert.equal(canRequestReservationPayment(ticket(1, { typeService: type })), false, type);
  }
});

test("pago archivado y solicitud pendiente bloquean; cancelado permite nuevo intento", () => {
  for (const request of [{ status: "paid", is_active: false }, { status: "PENDING", is_active: true }]) {
    assert.equal(canRequestReservationPayment(ticket(1, { paymentRequest: request })), false);
  }
  assert.equal(getOperationalPaymentRequest({ payment_request: { status: "PAID", is_active: false } })?.status, "paid");
  assert.equal(canRequestReservationPayment(ticket(1, { paymentRequest: { status: "cancelled", is_active: false } })), true);
  assert.equal(canRequestReservationPayment(ticket(1, { paymentRequest: { status: "pending", is_active: false } })), true);
});

test("el estado fresco reemplaza estados antiguos, incluso una respuesta vacía", () => {
  const source = itinerary([ticket(10, { payment_request: { status: "pending" } }), ticket(11), ticket(12)]);
  assert.equal(enrichPaymentItinerary(source, [])[0].servicios[0].paymentRequest, null);
  const enriched = enrichPaymentItinerary(source, [
    { itinerario_servicio_id: "10", status: "paid", is_active: false, created_at: "2026-09-01" },
    { itinerario_servicio_id: 10, status: "pending", is_active: true, created_at: "2026-09-02" },
    { itinerario_servicio_id: 11, status: "cancelled", is_active: false },
    { itinerario_servicio_id: 12, status: "pending", is_active: true },
  ]);
  assert.equal(enriched[0].servicios[0].paymentRequest.status, "paid");
  assert.deepEqual(buildReservationPaymentCandidates(enriched).map(item => item.key), ["11"]);
});

test("la selección deduplica IDs sin fusionar tarifas distintas de una misma entrada", () => {
  const candidates = buildReservationPaymentCandidates(itinerary([ticket(1), ticket(2), ticket(1),
    ticket(3, { is_active: false }), ticket(0)]));
  assert.deepEqual(candidates.map(item => item.key), ["1", "2"]);
  assert.equal(candidates[0].dayTitle, "City Tour");
});

test("el flujo de las once entradas mantiene monto y cada ID al pasar a pendientes", () => {
  const totals = [23.43, 25, 12.50, 162.52, 43.80, 25, 25, 96, 48, 161.40, 48.40];
  const days = itinerary(totals.map((total, i) => ticket(i + 1, { assignedPrecioTotal: total })));
  const available = buildReservationPaymentCandidates(days);
  assert.equal(available.length, 11);
  assert.equal(available.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100, 671.05);
  const pending = enrichPaymentItinerary(days, available.map(row => ({ itinerario_servicio_id: row.service.servicioId,
    status: "pending", is_active: true })));
  assert.equal(buildReservationPaymentCandidates(pending).length, 0);
  const cancelled = enrichPaymentItinerary(days, available.map(row => ({ itinerario_servicio_id: row.service.servicioId,
    status: "cancelled", is_active: false })));
  assert.equal(buildReservationPaymentCandidates(cancelled).length, 11);
});

test("beneficiarios de entradas respetan 4 adultos, 2 estudiantes, cero y cantidad desconocida", () => {
  assert.equal(getAssignedTicketQuantity(ticket(1, { assignedBeneficiariosAdultos: [0, 1, 2, 3], assignedBeneficiariosNinos: [] })), 4);
  assert.equal(getAssignedTicketQuantity(ticket()), 2);
  assert.equal(getAssignedTicketQuantity(ticket(1, { assignedBeneficiariosAdultos: [], assignedBeneficiariosNinos: [] })), 0);
  assert.equal(getAssignedTicketQuantity({}), null);
  assert.equal(getAssignedTicketQuantity({ assignedPassengerSelection: { selectedIds: [1, 1, 2] } }), 2);
});

test("el resumen de entradas inicia cerrado, conserva las tarifas y el número real de PAX", () => {
  const html = renderToStaticMarkup(<TicketChargeSummary summary={{ paxName: "PAX", agencyName: "AGENCIA", total: 68.80,
    lines: [{ id: 1, quantity: 4, description: "CATEDRAL extranjero adulto", unit: 6.25, total: 25 },
      { id: 2, quantity: 2, description: "BTG extranjero estudiante", unit: 21.90, total: 43.80 }] }} formatAmount={money} />);
  assert.match(html, /^<details/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.match(html, /<b>04<\/b>/);
  assert.match(html, /<b>02<\/b>/);
  assert.match(html, /BTG extranjero estudiante/);
  assert.match(html, /\$ 21.90/);
  assert.match(html, /\$ 68.80/);
});

test("barra de lote muestra disponibilidad, monto y bloquea vacío, recarga o más de cien", () => {
  const bar = (count: number, selected: number, disabled = false) => renderToStaticMarkup(<PaymentBatchBar count={count}
    selectedCount={selected} total={43.80} formatAmount={money} onSelectAll={() => {}} onRequest={() => {}} disabled={disabled} />);
  assert.match(bar(11, 2), /Seleccionar disponibles \(11\)/);
  assert.match(bar(11, 2), /2 seleccionados/);
  assert.match(bar(11, 2), /\$ 43.80/);
  assert.doesNotMatch(bar(11, 2), /disabled=/);
  assert.match(bar(11, 0), /<button[^>]*disabled=/);
  assert.match(bar(11, 2, true), /<button[^>]*disabled=/);
  assert.match(bar(0, 0), /Sin servicios disponibles/);
  assert.match(bar(101, 101), /como máximo 100/);
});

test("el footer está fuera del área desplazable y el resumen no vuelve a ser sticky", () => {
  const source = readFileSync(resolve(componentPath, "PaymentManagementModal.tsx"), "utf8");
  const ast = ts.createSourceFile("modal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  function visit(node: ts.Node, withinScroll = false) {
    if (ts.isJsxElement(node) && node.openingElement.attributes.getText(ast).includes('className="payment-management-scroll"')) withinScroll = true;
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "PaymentBatchBar") {
      found = true; assert.equal(withinScroll, false);
    }
    ts.forEachChild(node, child => visit(child, withinScroll));
  }
  visit(ast);
  assert.equal(found, true);
  const css = compileString(readFileSync(resolve(componentPath, "PaymentManagementModal.scss"), "utf8")).css;
  assert.match(css, /\.payment-management-scroll\s*\{[^}]*overflow-y: auto/);
  assert.match(css, /\.batch-request-bar\s*\{[^}]*flex: 0 0 auto/);
  assert.doesNotMatch(css, /\.payment-management-overview\s*\{[^}]*position: sticky/);
  assert.match(css, /max-width: 720px/);
});

test("un error de consulta no habilita el formulario ni oculta su botón de reintento", () => {
  const requestModal = readFileSync(resolve(componentPath, "../PaymentVoucherModal/PaymentVoucherModal.tsx"), "utf8");
  const manager = readFileSync(resolve(componentPath, "../PaymentRequestManager/PaymentRequestManager.tsx"), "utf8");
  const service = readFileSync(resolve("src/services/voucherReservaService.ts"), "utf8");
  assert.match(requestModal, /hasPaymentRequest === false \? " hidden" : ""/);
  assert.match(requestModal, /paymentRequest === undefined \? null : !!paymentRequest/);
  assert.match(requestModal, /isSubmitting \|\| hasPaymentRequest !== false/);
  assert.match(manager, /if \(!response\?\.success\) throw/);
  assert.match(manager, /onStatusLoaded\?\.\(undefined\)/);
  assert.match(manager, /onClick=\{fetchPaymentRequest\}>Reintentar/);
  assert.match(service, /status === 404 && !options.skipCache/);
});
