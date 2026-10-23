import test from "node:test";
import assert from "node:assert/strict";
import { prepareTicketRequests, ticketDraft, ticketDraftTotal, ticketMovementPrefill, ticketName, ticketPricingPayload } from "../ticketPayment";

const ticket = (extra: any = {}) => ({ id: 11, typeService: "tickets", isAssigned: true,
  assignedMoneda: "dolares", assignedTipoPrecio: "privado", assignedPrecioServicio: 40,
  assignedPrecioTotal: 100, assignedBeneficiariosAdultos: [{ id: "adult:1" }, { id: "adult:2" }],
  assignedBeneficiariosNinos: [{ id: "child:1", precio: 20 }, { id: "child:2", precio: 0 }], ...extra });
const pending = (extra: any = {}) => ({ id: "request-11", voucher_reserva_id: "VR1", itinerario_servicio_id: 11,
  status: "pending", is_active: true, amount: "100.00", currency: "USD", ...extra });

test("precios privados, compartidos y solo niños conservan los ceros explícitos", () => {
  const service = ticket();
  assert.equal(ticketDraftTotal(service, ticketDraft(service)), 100);
  assert.equal(ticketDraftTotal(ticket({ assignedTipoPrecio: "compartido" }), ticketDraft(service)), 60);
  assert.equal(ticketDraftTotal(service, { ...ticketDraft(service), adults: [] }), 20);
  assert.equal(ticketDraftTotal(service, { ...ticketDraft(service), adultUnitPrice: 0 }), 20);
});

test("aliases de pasajeros convertidos, duplicados y precios negativos no pasan", () => {
  const service = ticket();
  for (const draft of [
    { ...ticketDraft(service), adults: [{ id: "child:0:uuid", child_origin: "child:0:uuid" }] },
    { ...ticketDraft(service), adultUnitPrice: -1 },
    { ...ticketDraft(service), children: [{ id: "child:1", precio: -1 }] },
  ]) assert.throws(() => ticketDraftTotal(service, draft));
});

test("tarifa en soles sin TC exige confirmar y guardar, USD mantiene valoración uno", () => {
  const draft = ticketDraft(ticket({ assignedMoneda: "soles" }));
  assert.equal(draft.dirty, true);
  assert.equal(ticketDraft(ticket()).dirty, false);
  assert.equal(ticketPricingPayload(ticket(), ticketDraft(ticket())).assigned_tasa_cambio, 1);
  for (const exchangeRate of [0, -1, Infinity, "texto", 1000000]) {
    assert.throws(() => ticketPricingPayload(ticket(), { ...draft, exchangeRate }));
  }
});

test("crear solicita una vez, relee confirmación y no modifica la cotización", async () => {
  let reads = 0, writes = 0;
  const service = ticket(), original = JSON.stringify(service);
  const result = await prepareTicketRequests({ services: [service], voucherId: "VR1", api: {
    getPaymentRequestsByVoucherReservaId: async () => ++reads === 1 ? [] : [pending()],
    requestPaymentsBatch: async payload => { writes++; assert.equal(payload.requests[0].amount, 100); },
  }});
  assert.equal(writes, 1); assert.equal(reads, 2); assert.equal(result[0].id, "request-11");
  assert.equal(JSON.stringify(service), original);
});

test("pendiente existente se reutiliza sin solicitud adicional", async () => {
  const result = await prepareTicketRequests({ services: [ticket()], voucherId: "VR1", api: {
    getPaymentRequestsByVoucherReservaId: async () => [pending()], requestPaymentsBatch: async () => assert.fail(),
  }});
  assert.equal(result[0].id, "request-11");
});

test("historial pagado prima sobre un pendiente viejo y no crea otro pago", async () => {
  await assert.rejects(prepareTicketRequests({ services: [ticket()], voucherId: "VR1", api: {
    getPaymentRequestsByVoucherReservaId: async () => [pending(), pending({ status: "paid", is_active: false, movimiento_id: 8 })],
    requestPaymentsBatch: async () => assert.fail(),
  }}), /pagada/);
});

test("dobles selecciones, entradas sin validar y gratuitas no generan solicitudes", async () => {
  for (const services of [[ticket(), ticket()], [ticket({ isAssigned: false })], [ticket({ assignedPrecioTotal: 0 })]]) {
    await assert.rejects(prepareTicketRequests({ services, voucherId: "VR1", api: {
      getPaymentRequestsByVoucherReservaId: async () => [], requestPaymentsBatch: async () => assert.fail(),
    }}));
  }
});

test("cerrar durante la consulta no publica una solicitud ni abre un formulario tardío", async () => {
  let current = true;
  const result = await prepareTicketRequests({ services: [ticket()], voucherId: "VR1", isCurrent: () => current, api: {
    getPaymentRequestsByVoucherReservaId: async () => { current = false; return []; },
    requestPaymentsBatch: async () => assert.fail(),
  }});
  assert.equal(result, null);
});

test("una confirmación perdida, ajena o pagada en otra pestaña nunca se interpreta como pendiente", async () => {
  for (const response of [[], [pending({ voucher_reserva_id: "VR2" })], [pending({ status: "paid", movimiento_id: 2 })]]) {
    let reads = 0;
    await assert.rejects(prepareTicketRequests({ services: [ticket()], voucherId: "VR1", api: {
      getPaymentRequestsByVoucherReservaId: async () => ++reads === 1 ? [] : response,
      requestPaymentsBatch: async () => ({ notification_id: "not-a-request" }),
    }}));
  }
});

test("el egreso recibe la moneda, TC y contexto de la obligación, no del usuario ni de la tarifa cotizada", () => {
  const form = ticketMovementPrefill(pending({ currency: "PEN", amount: "150", assigned_tasa_cambio: "3.75", platform: "venso", business_type: "B2B" }), "FILE1");
  assert.equal(form.moneda, "soles"); assert.equal(form.monto, 150); assert.equal(form.tipo_cambio, 3.75);
  assert.equal(form.platform, "venso"); assert.equal(form.business_type, "B2B");
  assert.equal(form.contexto_pago.payment_request_id, "request-11");
});

test("respuesta inválida no equivale a una lista vacía ni autoriza crear solicitudes", async () => {
  for (const response of [undefined, null, {}, { success: false }]) {
    await assert.rejects(prepareTicketRequests({ services: [ticket()], voucherId: "VR1", api: {
      getPaymentRequestsByVoucherReservaId: async () => response,
      requestPaymentsBatch: async () => assert.fail("No debe crear solicitudes tras una lectura inválida"),
    }}), /verificar/);
  }
});

test("nombre de entrada contempla contratos operativos planos y anidados", () => {
  assert.equal(ticketName({ assignedChildService: { entrada: "BTG" } }), "BTG");
  assert.equal(ticketName({ assignedChildService: { tickets: { entrada: "CATEDRAL" } } }), "CATEDRAL");
  assert.equal(ticketName({ childService: { ticket: { entrada: "QORICANCHA" } } }), "QORICANCHA");
});

test("los índices legacy de adultos no bloquean el pago ni se confunden con niños", () => {
  const service = ticket({ assignedBeneficiariosAdultos: [0,1], assignedBeneficiariosNinos: [{id:"child:1",precio:20}] });
  const draft = ticketDraft(service);
  assert.deepEqual(draft.adults, [{id:"adult:1"},{id:"adult:2"}]);
  assert.equal(ticketDraftTotal(service,draft),100);
});
