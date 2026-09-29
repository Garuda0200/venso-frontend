const DEFAULT_PEN_USD_RATE = 3.75;

const finiteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundMoney = (value: number): number => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const normalizePaymentContext = (context: any): any => {
  if (!context) return null;
  if (typeof context === "string") return { tipo: context };
  return typeof context === "object" ? context : null;
};

export const isQuotePaymentMovement = (movement: any): boolean => {
  if (!movement) return false;
  const movementType = String(movement.tipo_movimiento || "").toLowerCase();
  if (movementType && movementType !== "ingreso") return false;
  const context = normalizePaymentContext(movement.contexto_pago);
  const contextType = String(context?.tipo || "").trim().toLowerCase();
  // Compatibilidad: los ingresos históricos enlazados al voucher no tenían contexto_pago.
  // Cuando existe un tipo explícito, solo PagoCotizacion pertenece al saldo de la venta.
  return !contextType || contextType === "pagocotizacion";
};

const normalizeCurrency = (currency: unknown): "PEN" | "USD" => {
  const value = String(currency || "USD").trim().toLowerCase();
  return ["sol", "soles", "pen", "s/"].includes(value) ? "PEN" : "USD";
};

export const movementAmountInUsd = (movement: any): number => {
  const amount = finiteNumber(movement?.monto) ?? 0;
  const context = normalizePaymentContext(movement?.contexto_pago);
  const baseUsd = finiteNumber(context?.conversion?.monto_base_usd);
  if (baseUsd !== null) return roundMoney(baseUsd);
  if (normalizeCurrency(movement?.moneda) !== "PEN") return roundMoney(amount);

  const rate =
    finiteNumber(context?.conversion?.tipo_cambio) ??
    finiteNumber(context?.tipo_cambio) ??
    finiteNumber(context?.datos_extra?.tipo_cambio) ??
    finiteNumber(movement?.datos_extra?.tipo_cambio) ??
    finiteNumber(movement?.tipo_cambio) ??
    DEFAULT_PEN_USD_RATE;

  return rate > 0 ? roundMoney(amount / rate) : 0;
};

export const filterVoucherPaymentMovements = (movements: any[], voucher: any = {}): any[] => {
  const voucherId = voucher?.id === null || voucher?.id === undefined ? "" : String(voucher.id);
  const voucherCode = String(voucher?.voucher_code || voucher?.voucherCode || "");

  return (Array.isArray(movements) ? movements : []).filter((movement) => {
    if (!isQuotePaymentMovement(movement)) return false;
    const reference = String(movement?.referencia_voucher_venta || "");
    const movementCode = String(movement?.voucher_code || "");
    const matchesReference =
      (!voucherId && !voucherCode) ||
      (voucherId && reference === voucherId) ||
      (voucherCode && (reference === voucherCode || movementCode === voucherCode));
    return matchesReference;
  });
};

export const getQuoteFromVoucher = (voucher: any, explicitQuote?: any): any =>
  explicitQuote || voucher?.cotizacion_data || voucher?.cotizacionData || voucher?.cotizacion || null;

export const getQuoteTravelDates = (voucher: any, explicitQuote?: any): { fechaInicio: any; fechaFin: any } => {
  const quote = getQuoteFromVoucher(voucher, explicitQuote) || {};
  return {
    fechaInicio: quote.fechainicio || null,
    fechaFin: quote.fechafin || null,
  };
};

export interface VoucherFinancialView {
  totalFinal: number;
  totalPaid: number;
  remainingAmount: number;
  paymentStatus: "completed" | "partial" | "pending";
}

export const summarizeVoucherFinancials = ({ voucher = {}, cotizacion, movimientos }: { voucher?: any; cotizacion?: any; movimientos?: any[] } = {}): VoucherFinancialView => {
  const quote = getQuoteFromVoucher(voucher, cotizacion) || {};
  const backendSummary = voucher?.financial_summary || voucher?.financialSummary || {};
  const totalFinal = roundMoney(
    finiteNumber(quote.total_final) ??
      finiteNumber(quote.totalFinal) ??
      finiteNumber(backendSummary.total_final) ??
      finiteNumber(backendSummary.totalFinal) ??
      0,
  );

  const totalPaid = Array.isArray(movimientos)
    ? roundMoney(
        filterVoucherPaymentMovements(movimientos, voucher).reduce(
          (sum, movement) => sum + movementAmountInUsd(movement),
          0,
        ),
      )
    : roundMoney(
        finiteNumber(backendSummary.total_paid) ?? finiteNumber(backendSummary.totalPaid) ?? 0,
      );

  const remainingAmount = roundMoney(Math.max(0, totalFinal - totalPaid));
  const paymentStatus =
    totalFinal > 0 && remainingAmount <= 0.01
      ? "completed"
      : totalPaid > 0
        ? "partial"
        : "pending";

  return { totalFinal, totalPaid, remainingAmount, paymentStatus };
};
