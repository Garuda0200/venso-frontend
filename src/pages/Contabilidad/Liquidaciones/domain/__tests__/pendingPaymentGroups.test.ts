import test from "node:test";
import assert from "node:assert/strict";
import { buildPendingPaymentGroups, reconcilePendingPaymentSelection } from "../pendingPaymentGroups";
import { DateFilterDomain } from "../DateFilterDomain";

const name = (service: any) => service.childService?.ticket?.entrada || service.parentService?.nombre || "Servicio";
const request = (id: string, overrides: any = {}) => ({ id, amount: "10.10", status: "pending", is_active: true,
  created_at: "2026-10-02T12:00:00-05:00", currency: "USD", assigned_parent_id: 7, assigned_child_id: 8,
  service_data: { isAssigned: true, parent_id: 1, child_id: 2, parentService: { nombre: "Cotizado" },
    assignedService: { typeService: "transportes", parentService: { nombre: "Proveedor operativo" }, childService: { ruta: "Cusco" } } },
  ...overrides });

test("agrupa por proveedor y servicio asignados, nunca por los IDs cotizados", () => {
  const groups = buildPendingPaymentGroups([request("a"), request("b"), request("c", { assigned_child_id: 9 })], name);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].nombre, "Proveedor operativo");
  assert.equal(groups[0].cantidadPagos, 2);
  assert.equal(groups[0].totalPendiente, 20.20);
  assert.match(groups[0].serviceKey, /parent-7-child-8/);
});

test("incluye entradas y restaurantes standalone, extras y solicitudes sin snapshot", () => {
  const rows = ["tickets", "restaurantes", "extras"].map((type, i) => request(String(i), {
    assigned_parent_id: null, assigned_child_id: i + 1, service_type: type,
    service_data: { isAssigned: true, assigned_child_id: i + 1, assignedService: {
      typeService: type, childService: { id: i + 1, ticket: type === "tickets" ? { entrada: "BTG" } : undefined } } },
  }));
  rows.push(request("sin-snapshot", { assigned_parent_id: null, assigned_child_id: null, service_data: null }));
  const groups = buildPendingPaymentGroups(rows, name);
  assert.equal(groups.reduce((count, group) => count + group.cantidadPagos, 0), 4);
  assert.deepEqual(groups.map((group) => group.tipo), ["tickets", "restaurantes", "extras", "unknown"]);
  assert.equal(groups[0].nombre, "BTG");
});

test("no mezcla proveedores, monedas ni contextos comerciales diferentes", () => {
  const rows = [request("a"), request("b", { assigned_parent_id: 9 }), request("c", { currency: "PEN" }),
    request("d", { platform: "otra" }), request("e", { business_type: "B2B" })];
  assert.equal(buildPendingPaymentGroups(rows, name).length, 5);
});

test("no fusiona solicitudes sin identidad de proveedor o servicio", () => {
  const rows = ["a", "b"].map((id) => request(id, { assigned_parent_id: null, assigned_child_id: null, service_data: {} }));
  assert.equal(buildPendingPaymentGroups(rows, name).length, 2);
});

test("las once entradas del flujo de Reservas conservan su total de 671.05", () => {
  const amounts = [23.43, 25, 12.50, 162.52, 43.80, 25, 25, 96, 48, 161.40, 48.40];
  const rows = amounts.map((amount, i) => request(String(i), { amount: String(amount), service_type: "tickets" }));
  const groups = buildPendingPaymentGroups(rows, name);
  assert.equal(groups[0].cantidadPagos, 11);
  assert.equal(groups[0].totalPendiente, 671.05);
});

test("creación, pago y cancelación se reflejan sin conservar snapshots seleccionados", () => {
  const initial = [request("a"), request("b")];
  const ids = initial.map((row) => row.id);
  const fresh = [request("a", { amount: "12.34" }), request("c")];
  const selected = reconcilePendingPaymentSelection(fresh, ids);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].amount, "12.34");
  assert.equal(buildPendingPaymentGroups(fresh, name)[0].cantidadPagos, 2);
  assert.deepEqual(reconcilePendingPaymentSelection([], ids), []);
});

test("pagados, cancelados e inactivos nunca se incorporan al lote", () => {
  const rows = [request("a"), request("b", { status: "paid" }), request("c", { status: "cancelled" }),
    request("d", { is_active: false })];
  assert.equal(buildPendingPaymentGroups(rows, name)[0].cantidadPagos, 1);
  assert.deepEqual(reconcilePendingPaymentSelection(rows, rows.map((row) => row.id)).map((row) => row.id), ["a"]);
});

test("el filtro de fecha sigue aplicándose después de recibir nuevas solicitudes", () => {
  const filter = DateFilterDomain.createDateRangeFilter("2026-10-02", "2026-10-02");
  const rows = [request("hoy"), request("ayer", { created_at: "2026-10-01T12:00:00-05:00" })];
  const filtered = DateFilterDomain.applyDateFilter(rows, filter);
  assert.deepEqual(filtered.map((row) => row.id), ["hoy"]);
  assert.equal(buildPendingPaymentGroups(filtered, name)[0].cantidadPagos, 1);
});

test("las fechas del filtro incluyen el día completo en Perú sin desfase UTC", () => {
  const savedTimezone = process.env.TZ;
  process.env.TZ = "America/Lima";
  try {
    const filter = DateFilterDomain.createDateRangeFilter("2026-10-02", "2026-10-02");
    const rows = [request("inicio", { created_at: "2026-10-02T00:00:00-05:00" }),
      request("fin", { created_at: "2026-10-02T23:59:59-05:00" }),
      request("previo", { created_at: "2026-10-01T23:59:59-05:00" }),
      request("posterior", { created_at: "2026-10-03T00:00:00-05:00" })];
    assert.deepEqual(DateFilterDomain.applyDateFilter(rows, filter).map((row) => row.id), ["inicio", "fin"]);
    assert.throws(() => DateFilterDomain.createDateRangeFilter("2026-10-03", "2026-10-02"));
  } finally {
    if (savedTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = savedTimezone;
  }
});
