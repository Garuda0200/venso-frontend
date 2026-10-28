import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseVoucherTravelDates, parseVoucherListingDate, getVoucherTravelDates,
  formatVoucherTravelDates, groupSalesVouchersByDate,
} from "../voucherListingDates";

for (const [label, actor, allowed] of [
  ["superadmin", { role: 0 }, true],
  ["ventas global", { role: 2, permissions: { actions: ["view_all_vouchers"], quote_visibility: { mode: "all" } } }, true],
  ["ventas de plataforma", { role: "2", platform: "venso", permissions: { actions: ["view_all_vouchers"], quote_visibility: { mode: "platform" } } }, true],
  ["ventas plataformas permitidas", { role: 2, permissions: { actions: ["view_all_vouchers"], quote_visibility: { mode: "selected", platforms: ["venso"] } } }, true],
  ["ventas propias", { role: 2, platform: "venso" }, false],
  ["solo cotizaciones", { role: 2, permissions: { actions: ["view_all_quotes"] } }, false],
  ["admin", { role: 1 }, false],
  ["reservas", { role: 3 }, false],
  ["contabilidad", { role: 4 }, false],
  ["sin usuario", null, false],
  ["auth anidado", { auth: { role: "2", permissions: { actions: ["view_all_vouchers"] } } }, true],
]) test(`selector de fechas: ${label}`, () => assert.equal(canUseVoucherTravelDates(actor), allowed));

const sale = (id, start, end, created = "2026-10-27T15:00:00Z") => ({
  id, created_at: created, cotizacion_data: { fechainicio: start, fechafin: end },
});
const ids = groups => groups.flatMap(year => year.months.flatMap(month => month.vouchers.map(v => v.id)));

test("fecha de viaje conserva el primer día del mes en hora local", () => {
  const date = parseVoucherListingDate("2026-11-01");
  assert.equal(date.getFullYear(), 2026); assert.equal(date.getMonth(), 10); assert.equal(date.getDate(), 1);
  for (const value of [null, "", "no es fecha", "2026-02-31", new Date(NaN)]) assert.equal(parseVoucherListingDate(value), null);
  assert.equal(parseVoucherListingDate("2028-02-29").getDate(), 29);
});

test("vista clásica conserva mes de cierre y orden de la respuesta", () => {
  const rows = [sale(2, "2027-01-04", "2027-01-10"), sale(1, "2026-11-02", null)];
  const groups = groupSalesVouchersByDate(rows);
  assert.equal(groups[0].months[0].key, "2026-10");
  assert.deepEqual(ids(groups), [2, 1]);
  assert.deepEqual(ids(groupSalesVouchersByDate(rows, "travel")), [2, 1]);
});

test("viajes agrupa por inicio y desempata por fin y cierre reciente sin mutar la lista", () => {
  const rows = Object.freeze([
    sale(1, "2026-11-10", "2026-11-20"), sale(2, "2026-11-10", "2026-11-15"),
    sale(3, "2026-11-05", "2026-11-25"), sale(4, "2026-11-10", "2026-11-15", "2026-10-28T15:00:00Z"),
  ]);
  const groups = groupSalesVouchersByDate(rows, "travel");
  assert.equal(groups[0].months[0].key, "2026-11");
  assert.deepEqual(ids(groups), [3, 4, 2, 1]);
  assert.deepEqual(rows.map(v => v.id), [1, 2, 3, 4]);
});

test("viajes que cruzan mes o año aparecen una sola vez en el mes de inicio", () => {
  const groups = groupSalesVouchersByDate([sale(1, "2026-12-29", "2027-01-10")], "travel");
  assert.equal(groups[0].year, 2026); assert.equal(groups[0].months[0].key, "2026-12");
  assert.deepEqual(ids(groups), [1]);
});

test("sin inicio no usa fecha de cierre como viaje y no desaparece del listado", () => {
  const rows = [sale(1, null, null), sale(2, "invalida", "2026-11-20"), sale(3, "2026-11-10", null)];
  const groups = groupSalesVouchersByDate(rows, "travel");
  assert.equal(groups[1].label, "Sin fecha de viaje");
  assert.deepEqual(ids(groups[1] ? [groups[1]] : []), [2, 1]);
  assert.equal(groups.reduce((sum, group) => sum + group.totalCount, 0), 3);
  assert.deepEqual(ids(groupSalesVouchersByDate(rows)), [1, 2, 3]);
  assert.equal(formatVoucherTravelDates(rows[0]), "Fechas pendientes");
  assert.match(formatVoucherTravelDates(rows[1]), /Inicio pendiente.*20\/11\/2026/);
  assert.match(formatVoucherTravelDates(rows[2]), /10\/11\/2026.*Fin pendiente/);
});

test("soporta los nombres normalizados de cotización y fechas sin sustituir sus datos", () => {
  for (const key of ["cotizacion_data", "cotizacionData", "cotizacion"]) {
    const row = { [key]: { fechainicio: "2026-11-01", fechafin: "2026-11-05" } };
    assert.equal(getVoucherTravelDates(row).start.getDate(), 1);
    assert.equal(formatVoucherTravelDates(row), "01/11/2026 – 05/11/2026");
  }
  assert.equal(getVoucherTravelDates({ fechaInicio: "2026-11-02" }).start.getDate(), 2);
});

test("no deduplica files por código y mantiene solo la lista ya autorizada", () => {
  const rows = [sale(1, "2026-11-01"), sale(2, "2026-11-01")].map(v => ({ ...v, voucher_code: "SAME-CODE", platform: "venso" }));
  for (const mode of ["sale", "travel"]) assert.deepEqual(ids(groupSalesVouchersByDate(rows, mode)), [1, 2]);
  assert.deepEqual(groupSalesVouchersByDate([], "travel"), []);
});
