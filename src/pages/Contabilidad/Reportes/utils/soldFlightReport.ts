import { buildPassengerPresentations } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/passengerPricingPresentation";
import { passengerIdMatchesSet } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/igvUtils";

export const flightPaymentLabels = {
  no_request: "Sin solicitud", pending: "Pendiente", partial: "Liquidación parcial",
  paid: "Liquidado", cancelled: "Cancelado",
};
export const normalizeReportCurrency = (value) => {
  const text = String(value || "").trim().toUpperCase();
  if (["USD", "DOLARES", "DÓLARES", "$"].includes(text)) return "USD";
  if (["PEN", "SOLES", "S/"].includes(text)) return "PEN";
  return text || "Sin moneda";
};
export const flightMoney = (value, currency) => {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return "Sin importe";
  const code = normalizeReportCurrency(currency);
  const amount = Number(value).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${code} ${amount}`;
};
export const flightRoute = (catalog = {}) => `${catalog.departure || "Origen sin registrar"} → ${catalog.destination || "Destino sin registrar"}`;
export const flightOrigin = (catalog = {}) => catalog.origin || "Sin procedencia";
export const flightSource = (value) => value === "cotizacion_externa" ? "Extras sin fee" : "Cotización";
export const reportDate = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "Sin fecha";
};
export const flightBeneficiaryLabel = (row, people = {}) => {
  const presentations = buildPassengerPresentations(people);
  const person = presentations.find((p) => p.prefix === row.passenger_type && passengerIdMatchesSet(row.id, p.aliases));
  if (person) return person.label;
  const id = String(row.id || "");
  const index = id.match(/^(?:adult|child):(\d+)(?::.+)?$/);
  const number = index ? Number(index[1]) + (id.split(":").length > 2 ? 1 : 0) : null;
  return `${row.passenger_type === "child" ? "Niño" : "Adulto"}${number ? ` ${number}` : " sin correspondencia"}`;
};
export const summarizeFlightCurrencies = (totals = [], scope) => {
  const byCurrency = new Map();
  totals.filter((t) => t.scope === scope).forEach((t) => {
    const currency = normalizeReportCurrency(t.currency);
    const current = byCurrency.get(currency) || { currency, amount: 0, missing: 0 };
    current.amount += Number(t.amount || 0);
    current.missing += Number(t.missing || 0);
    byCurrency.set(currency, current);
  });
  return [...byCurrency.values()];
};
export const pricingCaption = (pricing = {}, currency) => {
  if (!pricing.count) return "Sin beneficiarios explícitos";
  if (pricing.uniform) return `${flightMoney(pricing.beneficiaries?.[0]?.amount, currency)} / pax`;
  return "Tarifas distintas o incompletas · ver detalle";
};
