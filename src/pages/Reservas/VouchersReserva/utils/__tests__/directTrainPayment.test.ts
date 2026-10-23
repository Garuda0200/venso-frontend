import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { canPayAssignedTrain, prepareDirectTrainPayment } from "../directTrainPayment";
import { getPaymentServiceId } from "../reservationPaymentManagement";
import { buildPaymentServiceComparison } from "../../../../../utils/paymentFacturacion";
import { paymentRequestPrefill } from "../../../../../utils/paymentCurrency";

const train = (extra: any = {}) => ({ id: 41, type_service: "trenes", is_assigned: true,
  assigned_parent_id: 5, assigned_child_id: 9, assigned_precio_total: "180.50", ...extra });
const voucher = { id: "R1", voucher_code: "FILE01", voucherId: 7 };
const pending = (extra: any = {}) => ({ id: "PR1", status: "pending", is_active: true,
  voucher_reserva_id: "R1", itinerario_servicio_id: 41, amount: "180.50", ...extra });
const response = (data: any) => ({ success: true, data });
const prepare = (api: any, extra: any = {}) => prepareDirectTrainPayment({ service: train(), voucher, api, ...extra });

test("tren asignado por IDs abre el flujo aunque el proveedor no esté hidratado", () => {
  assert.equal(canPayAssignedTrain(train()), true);
  assert.equal(canPayAssignedTrain(train({ type_service: " TREN " })), true);
  assert.equal(canPayAssignedTrain({ servicio_id: 41, assigned_service: { type_service: "trenes", parent_id: 5 } }), true);
  assert.equal(canPayAssignedTrain({ typeService: "trenes", parentService: { id: 5 } }), false);
  assert.equal(canPayAssignedTrain(train({ assigned_parent_id: null })), false);
  assert.equal(canPayAssignedTrain(train({ type_service: "vuelos" })), false);
  assert.equal(canPayAssignedTrain(train({ is_active: false })), false);
});

test("contrato POST actual notification_id: crea una solicitud y relee antes de abrir", async () => {
  let posts = 0, reads = 0;
  const result = await prepare({ getPaymentRequest: async (...args: any[]) => {
    assert.deepEqual(args, ["R1", 41]); return response(++reads === 1 ? null : pending());
  }, requestPayment: async (payload: any) => {
    posts++; assert.equal(payload.itinerario_servicio_id, 41); assert.equal(payload.voucher_reserva_id, "R1");
    assert.equal(payload.amount, 180.50); return { success: true, notification_id: "PR1" };
  } });
  assert.equal(posts, 1); assert.equal(reads, 2); assert.equal(result?.created, true);
  assert.equal(result?.request.id, "PR1"); assert.equal(result?.request.amount, 180.50);
  assert.equal(result?.request.service_data.assignedParentId, 5);
});

test("el contexto contable conserva proveedor cotizado y asignado sin confundirlos", async () => {
  const result = await prepare({ getPaymentRequest: async () => response(pending()), requestPayment: async () => assert.fail() }, {
    service: train({ parentService: { id: 1, nombre_empresa: "Tren cotizado" }, tariff: { precio_original: 999 },
      assignedParentService: { id: 5, nombre_empresa: "Tren asignado" }, assignedBeneficiariosAdultos: [{ id: "adult:1" }] }),
  });
  const comparison = buildPaymentServiceComparison(result?.request.service_data);
  assert.equal(comparison.quoted.parentService.id, 1);
  assert.equal(comparison.assigned.parentService.id, 5);
  assert.equal(comparison.assignedPricing.total, 180.50);
  assert.equal(comparison.quotedPricing.total, 999);
});

test("una solicitud pendiente existente se reutiliza sin POST y conserva su importe", async () => {
  const result = await prepare({ getPaymentRequest: async () => response(pending({ amount: 120 })),
    requestPayment: async () => { assert.fail("No debe duplicar la solicitud"); } });
  assert.equal(result?.created, false); assert.equal(result?.request.amount, 120);
});

test("un snapshot legacy no reemplaza la tarifa operativa fresca al mostrar el pago", async () => {
  const result = await prepare({ getPaymentRequest: async () => response(pending()), requestPayment: async () => assert.fail() }, {
    service: train({ assigned_precio_servicio: 90.25, assignedService: {
      parentService: { id: 5, nombre_empresa: "Tren asignado" }, tariff: { precio_original: 12 },
    } }),
  });
  const comparison = buildPaymentServiceComparison(result?.request.service_data);
  assert.equal(comparison.assignedPricing.total, 180.50);
  assert.equal(comparison.assigned.tariff.precio_original, 180.50);
});

test("una solicitud histórica sin monto recupera solo el precio operativo asignado", async () => {
  const result = await prepare({ getPaymentRequest: async () => response(pending({ amount: undefined })), requestPayment: async () => assert.fail() });
  assert.equal(result?.request.amount, 180.50);
  assert.equal(result?.request.monto, 180.50);
  assert.equal(result?.request.service_data.typeService, "trenes");
});

test("cero y montos inválidos de la solicitud nunca se sustituyen por la cotización", async () => {
  for (const amount of [0, -5, "no-monto", Infinity]) {
    await assert.rejects(prepare({ getPaymentRequest: async () => response(pending({ amount })), requestPayment: async () => assert.fail() }), /monto pendiente/);
  }
  await assert.rejects(prepare({ getPaymentRequest: async () => response(null), requestPayment: async () => assert.fail() },
    { service: train({ assigned_precio_total: 0, precioTotal: 999 }) }), /monto asignado/);
});

test("errores o respuestas inválidas al consultar no crean solicitudes", async () => {
  for (const value of [undefined, {}, { success: true, data: {} }, { success: false, data: null }]) {
    await assert.rejects(prepare({ getPaymentRequest: async () => value, requestPayment: async () => assert.fail() }));
  }
});

test("pagados, archivados y solicitudes ajenas nunca abren el egreso", async () => {
  for (const request of [pending({ status: "paid", is_active: false }), pending({ voucher_reserva_id: "R2" }), pending({ itinerario_servicio_id: 42 })]) {
    await assert.rejects(prepare({ getPaymentRequest: async () => response(request), requestPayment: async () => assert.fail() }), /pagado|corresponde/);
  }
});

test("una cancelación permite crear de nuevo y el contrato con data.payment_request también abre", async () => {
  const result = await prepare({ getPaymentRequest: async () => response(pending({ status: "cancelled", is_active: false })),
    requestPayment: async () => ({ success: true, data: { payment_request: pending({ id: "PR2" }) } }) });
  assert.equal(result?.request.id, "PR2");
});

test("conflicto por otra pestaña relee sin segundo POST; errores de red se propagan", async () => {
  let reads = 0, posts = 0;
  const result = await prepare({ getPaymentRequest: async () => response(++reads === 1 ? null : pending()),
    requestPayment: async () => { posts++; throw { response: { status: 409 } }; } });
  assert.equal(result?.request.id, "PR1"); assert.equal(posts, 1);
  const offline = new Error("Sin conexión");
  await assert.rejects(prepare({ getPaymentRequest: async () => response(null), requestPayment: async () => { throw offline; } }), /Sin conexión/);
});

test("no abre si la creación no puede confirmarse o la reserva/servicio no existen", async () => {
  const api = { getPaymentRequest: async () => response(null), requestPayment: async () => ({ success: true, notification_id: "PR1" }) };
  await assert.rejects(prepare(api), /No se confirmó/);
  await assert.rejects(prepare(api, { voucher: {} }), /identificar la reserva/);
  await assert.rejects(prepare(api, { service: train({ id: "temporal" }) }), /servicio de itinerario/);
});

test("cerrar o cambiar reserva durante la consulta no crea ni abre un pago tardío", async () => {
  let current = true;
  const result = await prepare({ getPaymentRequest: async () => { current = false; return response(null); }, requestPayment: async () => assert.fail() }, { isCurrent: () => current });
  assert.equal(result, null);
});

// Execute the real modal callback, not a second implementation of its lifecycle.
const source = readFileSync(resolve("src/pages/Reservas/VouchersReserva/components/PaymentManagementModal/PaymentManagementModal.tsx"), "utf8");
const ast = ts.createSourceFile("PaymentManagementModal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name: string) {
  let found: ts.VariableDeclaration | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(found?.initializer);
  return ts.transpileModule(`const ${name} = ${found!.initializer!.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

function modalHarness(prepareFn: any, extra: any = {}) {
  const events: string[] = [], selected: any[] = [], errors: string[] = [];
  const context = { prepareDirectTrainPayment: prepareFn, directPaymentInFlightRef: { current: false },
    directPaymentSessionRef: { current: 1 }, showPaymentModal: false, paymentLoadError: false, refreshingPayments: false,
    getPaymentServiceId, voucherReserva: voucher, voucherReservaService: {}, setPreparingDirectPaymentId: () => {},
    setSelectedPaymentRequest: (request: any) => { selected.push(request); events.push("selected"); },
    setShowPaymentModal: () => events.push("open"), toast: { error: (message: string) => errors.push(message) },
    window: { dispatchEvent: () => events.push("refresh") }, CustomEvent: class { constructor(public type: string, public options: any) {} }, ...extra };
  const run = new Function(...Object.keys(context), `${callback("handlePayDirectly")} return handlePayDirectly;`)(...Object.values(context));
  return { run, context, events, selected, errors };
}

test("callback real: abre antes de refrescar y doble clic no prepara dos solicitudes", async () => {
  let release!: (value: any) => void, calls = 0;
  const harness = modalHarness(async () => { calls++; return new Promise(resolve => { release = resolve; }); });
  const first = harness.run(train(), null, 0, 0);
  await harness.run(train(), null, 0, 0); assert.equal(calls, 1);
  release({ created: true, request: pending() }); await first;
  assert.deepEqual(harness.events, ["selected", "open", "refresh"]);
  assert.equal(harness.context.directPaymentInFlightRef.current, false);
});

test("callback real: error permite reintentar; consulta fallida o recarga bloquean el botón", async () => {
  const harness = modalHarness(async () => { throw new Error("Sin conexión"); });
  await harness.run(train(), null, 0, 0); await harness.run(train(), null, 0, 0);
  assert.deepEqual(harness.errors, ["Sin conexión", "Sin conexión"]); assert.deepEqual(harness.events, []);
  for (const flag of ["paymentLoadError", "refreshingPayments", "showPaymentModal"]) {
    const blocked = modalHarness(async () => assert.fail(), { [flag]: true }); await blocked.run(train(), null, 0, 0);
  }
});

test("callback real: una respuesta de la reserva anterior no abre ni refresca la nueva", async () => {
  let release!: (value: any) => void;
  const harness = modalHarness(async () => new Promise(resolve => { release = resolve; }));
  const first = harness.run(train(), null, 0, 0); harness.context.directPaymentSessionRef.current++;
  release({ created: true, request: pending() }); await first;
  assert.deepEqual(harness.events, []);
});

test("el formulario recibe monto, contexto y referencias contables sin perder el proveedor asignado", () => {
  const selected = pending({ amount: 180.50, service_data: { parentService: { id: 5, nombre_empresa: "PeruRail" } } });
  const context = { useMemo: (fn: any) => fn(), selectedPaymentRequest: selected, voucherReserva: voucher,
    paymentRequestPrefill, generatePaymentDescription: () => "Pago de tren - PeruRail" };
  const initial = new Function(...Object.keys(context), `${callback("movimientoFormInitialData")} return movimientoFormInitialData;`)(...Object.values(context));
  assert.equal(initial.monto, 180.50); assert.equal(initial.contexto_pago.payment_request_id, "PR1");
  assert.equal(initial.referencia_voucher_reserva, "R1"); assert.equal(initial.referencia_voucher_venta, 7);
  assert.equal(initial.payment_request_service_data.parentService.id, 5);
  assert.match(source, /className="reservation-direct-payment-layer"[\s\S]*?<MovimientoForm/);
  assert.match(source, /disabled=\{preparingDirectPaymentId !== null \|\| showPaymentModal \|\| paymentLoadError \|\| refreshingPayments\}/);
});
