import { filterVoucherPaymentMovements, getQuoteTravelDates, movementAmountInUsd, summarizeVoucherFinancials } from "../voucherFinancials";

const equal = (actual: unknown, expected: unknown, message: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
};

equal(
  summarizeVoucherFinancials({ voucher: { id: 7, total_amount: 999, total_paid: 999, financial_summary: { total_paid: "40" }, cotizacion_data: { total_final: "125" } } }),
  { totalFinal: 125, totalPaid: 40, remainingAmount: 85, paymentStatus: "partial" },
  "card summary must ignore removed persisted totals",
);

equal(
  summarizeVoucherFinancials({
    voucher: { id: 7, financial_summary: { total_paid: 999 } },
    cotizacion: { total_final: 125 },
    movimientos: [
      { tipo_movimiento: "ingreso", monto: 50, moneda: "USD", contexto_pago: { tipo: "PagoCotizacion" }, referencia_voucher_venta: "7" },
      { tipo_movimiento: "ingreso", monto: 187.5, moneda: "PEN", contexto_pago: { tipo: "PagoCotizacion", conversion: { tipo_cambio: 3.75 } }, referencia_voucher_venta: "7" },
      { tipo_movimiento: "ingreso", monto: 500, moneda: "USD", contexto_pago: { tipo: "PagoVuelo" }, referencia_voucher_venta: "7" },
    ],
  }),
  { totalFinal: 125, totalPaid: 100, remainingAmount: 25, paymentStatus: "partial" },
  "movement summary",
);

equal(
  filterVoucherPaymentMovements([
    { tipo_movimiento: "ingreso", monto: 25, moneda: "USD", referencia_voucher_venta: "7" },
    { tipo_movimiento: "ingreso", monto: 80, moneda: "USD", contexto_pago: { tipo: "PagoVuelo" }, referencia_voucher_venta: "7" },
  ], { id: 7 }).length,
  1,
  "legacy ingresos without contexto_pago remain quote payments",
);
equal(movementAmountInUsd({ monto: 400, moneda: "PEN", contexto_pago: { conversion: { monto_base_usd: 95.25 } } }), 95.25, "base USD conversion");
equal(filterVoucherPaymentMovements([{ tipo_movimiento: "ingreso", contexto_pago: "PagoCotizacion", referencia_voucher_venta: "ABC" }], { id: 7, voucher_code: "ABC" }).length, 1, "voucher code matching");
equal(getQuoteTravelDates({ fecha_inicio: "1999-01-01", cotizacion_data: { fechainicio: "2026-09-01", fechafin: "2026-09-05" } }), { fechaInicio: "2026-09-01", fechaFin: "2026-09-05" }, "quote dates only");
