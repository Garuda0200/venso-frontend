import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import MovementFileActions from "../../components/MovementFileActions";
import MovementCurrencyTotals from "../../components/MovementCurrencyTotals";
import { buildMovementYears, movementTotals, movementCurrency, movementInitialData } from "../movementFiles";

const row = (id: number, extra: any = {}) => ({ id, voucher_code: "FILE01", referencia_voucher_venta: 5,
  fecha: "2026-10-02", moneda: "dolares", monto: "10.10", tipo_movimiento: "ingreso", is_active: true, ...extra });
const files = (years: any[]) => years.flatMap(year => year.months.flatMap(month => month.files));

test("no convierte ni mezcla PEN y USD y suma importes en céntimos", () => {
  const totals = movementTotals([row(1), row(2), row(3, { moneda: "PEN", monto: 80 }),
    row(4, { moneda: "USD", tipo_movimiento: "egreso", monto: 2.2 })]);
  assert.deepEqual(totals, [{ currency: "PEN", ingresos: 80, egresos: 0, balance: 80 },
    { currency: "USD", ingresos: 20.2, egresos: 2.2, balance: 18 }]);
  assert.equal(movementCurrency("dólares"), "USD"); assert.equal(movementCurrency(null), "SIN MONEDA");
});

test("busca sin acentos y conserva el resto del file y sus totales", () => {
  const groups = files(buildMovementYears([row(1, { descripcion: "Guía trasladista" }), row(2)], "guia"));
  assert.equal(groups.length, 1); assert.equal(groups[0].movimientos.length, 2);
  assert.equal(groups[0].currencyTotals[0].ingresos, 20.2);
});

test("filtro de ingresos/egresos contrasta en sus totales y excluye inactivos", () => {
  const groups = files(buildMovementYears([row(1), row(2, { tipo_movimiento: "egreso" }), row(3, { is_active: false })], "", "egreso"));
  assert.equal(groups[0].movimientos.length, 1); assert.equal(groups[0].currencyTotals[0].balance, -10.1);
});

test("ordena años y meses, conserva movimientos sin file y no fusiona ventas distintas", () => {
  const years = buildMovementYears([row(1), row(2, { fecha: "2025-09-01" }),
    row(3, { referencia_voucher_venta: 6 }), row(4, { voucher_code: null, referencia_voucher_venta: null })]);
  assert.deepEqual(years.map(year => year.year), [2026, 2025]);
  assert.equal(files(years).length, 4);
  assert.ok(files(years).some(file => file.voucher_code === "Sin file"));
  assert.equal(files(buildMovementYears([row(1, { fecha: "invalid" })]))[0].movimientos.length, 1);
});

test("las fechas YYYY-MM-DD no cambian de mes por la zona horaria", () => {
  const saved = process.env.TZ; process.env.TZ = "America/Lima";
  try { assert.equal(buildMovementYears([row(1, { fecha: "2026-10-01" })])[0].months[0].month, 10); }
  finally { if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved; }
});

test("el nuevo movimiento hereda las referencias del file sin usar cotizaciones ajenas", () => {
  const file = files(buildMovementYears([row(1, { referencia_voucher_reserva: "VR01", platform: "venso" })]))[0];
  assert.deepEqual(movementInitialData(file), { voucher_code: "FILE01", referencia_voucher_venta: 5,
    referencia_voucher_reserva: "VR01", platform: "venso", business_type: "B2C" });
});

test("unifica ingresos y egresos legacy del mismo file sin duplicar el balance", () => {
  const groups = files(buildMovementYears([row(1), row(2, { referencia_voucher_venta: null,
    referencia_voucher_reserva: "VR", tipo_movimiento: "egreso", monto: 2.1 }),
    row(3, { referencia_voucher_venta: null, monto: 4 })]));
  assert.equal(groups.length, 1); assert.equal(groups[0].movimientos.length, 3);
  assert.equal(groups[0].referencia_voucher_reserva, "VR");
  assert.deepEqual(groups[0].currencyTotals, [{ currency: "USD", ingresos: 14.1, egresos: 2.1, balance: 12 }]);
});

test("códigos ambiguos y contextos comerciales distintos nunca se fusionan", () => {
  const groups = files(buildMovementYears([row(1), row(2, { referencia_voucher_venta: 6 }),
    row(3, { referencia_voucher_venta: null, referencia_voucher_reserva: "VR" }),
    row(4, { business_type: "B2B" })]));
  assert.equal(groups.length, 4);
  const linked = files(buildMovementYears([row(1, { referencia_voucher_reserva: "VR1" }),
    row(2, { referencia_voucher_venta: 6 }), row(3, { referencia_voucher_venta: null, referencia_voucher_reserva: "VR1" })]));
  assert.equal(linked.length, 2);
  assert.equal(linked.find(file => String(file.referencia_voucher_venta) === "5").movimientos.length, 2);
});

test("ordena las acciones como Magic y solo ofrece documentos/venta/reserva si existen", () => {
  const full = renderToStaticMarkup(<MovementFileActions file={{ voucher_code: "FILE", referencia_voucher_venta: 1,
    referencia_voucher_reserva: "VR" }} busy={false} onAction={() => {}} />);
  const labels = [...full.matchAll(/aria-label="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(labels.slice(1), ["Ver resumen de venta", "Ver PDF del voucher", "Gestionar documentos",
    "Agregar movimiento a este file", "Ver servicios de reserva", "Ver formato contable"]);
  const empty = renderToStaticMarkup(<MovementFileActions file={{ voucher_code: "Sin file" }} busy={false} onAction={() => {}} />);
  assert.doesNotMatch(empty, /Ver PDF|Gestionar documentos|Ver servicios de reserva/);
});

test("el balance conserva monedas visibles y el detalle reutiliza la tabla operativa", () => {
  const html = renderToStaticMarkup(<MovementCurrencyTotals totals={movementTotals([row(1), row(2, { moneda: "PEN" })])} />);
  assert.match(html, /US\$/); assert.match(html, /S\//);
  const source = readFileSync(resolve("src/pages/Contabilidad/Files/Files.tsx"), "utf8");
  assert.match(source, /compact showFilters=\{false\} showTotals=\{false\}/);
  assert.match(source, /<PendingPaymentsAccess onPaymentSaved=/);
  assert.match(source, /initialData=\{movementFile \? movementInitialData/);
  assert.doesNotMatch(source, /amountSoles|totalIngresosSoles/);
});
