const first = (...values) => values.find(v => v !== undefined && v !== null && v !== "");
// Suggested only in editable forms. Never backfill historical records on read.
export const DEFAULT_ASSIGNED_PEN_RATE = 3;
export const paymentCurrency = (value = "USD") => {
  const normalized = String(value).trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (["USD", "DOLARES", "$"].includes(normalized)) return "USD";
  if (["PEN", "SOLES", "SOL", "S/"].includes(normalized)) return "PEN";
  throw new Error("La moneda debe ser USD o PEN");
};
export const storedPaymentCurrency = value => paymentCurrency(value) === "PEN" ? "soles" : "dolares";
export const paymentSymbol = value => paymentCurrency(value) === "PEN" ? "S/" : "$";
export const roundPaymentMoney = value => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("El importe debe ser un número no negativo");
  return Math.round((number + Number.EPSILON) * 100) / 100;
};
export const convertPaymentAmount = (amount, from, to, rate) => {
  const value = roundPaymentMoney(amount), source = paymentCurrency(from), target = paymentCurrency(to);
  if (source === target) return value;
  if (!Number.isFinite(Number(rate)) || Number(rate) <= 0) throw new Error("Confirma un tipo de cambio mayor a cero (PEN por USD)");
  return roundPaymentMoney(source === "USD" ? value * Number(rate) : value / Number(rate));
};

/** Restore unedited prices exactly on reversal, instead of accumulating FX rounding. */
export const convertPaymentPricing = (draft, currency, rate) => {
  const source = paymentCurrency(draft.currency), target = paymentCurrency(currency);
  if (source === target) return draft;
  const anchor = draft.currencyConversion;
  const reversing = anchor?.source === target && anchor?.target === source && anchor?.rate === Number(rate);
  const restoreOrConvert = (value, original, converted) =>
    reversing && original != null && Number(value) === Number(converted)
      ? roundPaymentMoney(original) : convertPaymentAmount(value, source, target, rate);
  // Validate the rate even when every value is restored from the previous conversion.
  convertPaymentAmount(0, source, target, rate);
  const adultUnitPrice = restoreOrConvert(draft.adultUnitPrice, anchor?.original?.adultUnitPrice, anchor?.converted?.adultUnitPrice);
  const childRows = (draft.childRows || []).map(row => {
    const original = anchor?.original?.childRows?.find(item => item.id === row.id);
    const converted = anchor?.converted?.childRows?.find(item => item.id === row.id);
    return { ...row, precio: restoreOrConvert(row.precio, original?.precio, converted?.precio) };
  });
  return {
    ...draft, currency: target, exchangeRate: Number(rate), adultUnitPrice, childRows,
    currencyConversion: {
      source, target, rate: Number(rate),
      original: { adultUnitPrice: roundPaymentMoney(draft.adultUnitPrice), childRows: (draft.childRows || []).map(row => ({ id: row.id, precio: roundPaymentMoney(row.precio) })) },
      converted: { adultUnitPrice, childRows: childRows.map(row => ({ id: row.id, precio: row.precio })) },
    },
  };
};
export const assignedPaymentCurrency = (service = {}) => paymentCurrency(first(
  service.assignedMoneda, service.assigned_moneda,
  service.assignedService?.assignedMoneda, service.assignedService?.assigned_moneda,
  service.assignedService?.moneda, service.assignedService?.tariff?.moneda,
  service.assignedTariff?.moneda, service.assigned_service?.assigned_moneda,
  service.assigned_service?.moneda, service.moneda, "USD",
));
export const positiveAssignedRate = value => {
  const number=Number(value), rounded=Math.round(number*10000)/10000;
  return Number.isFinite(number) && number>0 && number<1000000 && rounded>0 ? rounded : null;
};
export const assignedPaymentExchangeRate = (service = {}) => {
  if (assignedPaymentCurrency(service)==="USD") return 1;
  const value=[service.assignedTasaCambio,service.assigned_tasa_cambio,
    service.assignedService?.assignedTasaCambio,service.assignedService?.assigned_tasa_cambio,
    service.assigned_service?.assigned_tasa_cambio,
    service.assignedTariff?.tasa_cambio,service.assignedService?.tariff?.tasa_cambio,
    service.assignedTariff?.tasaCambio,service.assignedService?.tariff?.tasaCambio,
    service.assignedCurrencyRate].find(value=>value!==undefined);
  return positiveAssignedRate(value);
};
export const requestAssignedExchangeRate = (request = {}) => {
  if (requestPaymentCurrency(request)==="USD") return 1;
  const frozen=request.assigned_tasa_cambio ?? request.assignedTasaCambio;
  if (Object.hasOwn(request,"assigned_tasa_cambio") || Object.hasOwn(request,"assignedTasaCambio")) return positiveAssignedRate(frozen);
  return assignedPaymentExchangeRate({...request.service_data,assignedMoneda:requestPaymentCurrency(request)});
};
// USD valuation=1 is not a fund conversion rate. Missing payment FX suggests 3,
// independently of the assigned USD valuation, and remains editable before pay.
export const paymentExchangeRatePrefill = request => requestPaymentCurrency(request)==="PEN"
  ? requestAssignedExchangeRate(request) ?? DEFAULT_ASSIGNED_PEN_RATE
  : DEFAULT_ASSIGNED_PEN_RATE;
export const requestPaymentCurrency = (request = {}) => {
  const snapshot = first(request.currency, request.moneda, request.contexto_pago?.obligation_currency);
  return snapshot ? paymentCurrency(snapshot) : assignedPaymentCurrency(request.service_data || {});
};
export const formatPaymentMoney = (amount, currency = "USD") => new Intl.NumberFormat("es-PE", {
  style: "currency", currency: paymentCurrency(currency), minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(amount) || 0);

export const paymentConversionContext = ({ amount, from, to, rate, saldoId }) => {
  const source = paymentCurrency(from), target = paymentCurrency(to);
  if (source === target) return null;
  const converted = convertPaymentAmount(amount, source, target, rate);
  return { moneda_base: storedPaymentCurrency(source), moneda_fondo: storedPaymentCurrency(target),
    monto_base: roundPaymentMoney(amount), monto_convertido: converted, tipo_cambio: Number(rate), rate_convention: "PEN_PER_USD",
    ...(saldoId ? { saldo_id: saldoId } : {}),
    ...(source === "USD" && target === "PEN" ? { monto_base_usd: roundPaymentMoney(amount), monto_convertido_soles: converted } : {}),
  };
};
export const sumPaymentCurrencies = (rows, amount = r => r.amount, currency = requestPaymentCurrency) => {
  const totals = {};
  for (const row of rows || []) { const key = currency(row); totals[key] = roundPaymentMoney((totals[key] || 0) + Number(amount(row) || 0)); }
  return totals;
};
export const formatPaymentTotals = totals => Object.entries(totals || {}).map(([currency, amount]) => formatPaymentMoney(amount, currency)).join(" + ") || formatPaymentMoney(0);
export const paymentRequestPrefill = request => ({
  monto: Number(request.amount ?? request.monto ?? 0),
  moneda: storedPaymentCurrency(requestPaymentCurrency(request)),
  obligation_currency: requestPaymentCurrency(request),
  assigned_tasa_cambio: requestAssignedExchangeRate(request),
  tipo_cambio: paymentExchangeRatePrefill(request) ?? "",
  platform: request.platform || request.contexto_pago?.platform,
  business_type: request.business_type || request.contexto_pago?.business_type,
});
