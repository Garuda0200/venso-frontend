import { assignedPaymentCurrency, assignedPaymentExchangeRate, DEFAULT_ASSIGNED_PEN_RATE,
  storedPaymentCurrency, roundPaymentMoney, requestPaymentCurrency, paymentExchangeRatePrefill } from "../../../../utils/paymentCurrency";
import { getPaymentServiceId, getAssignedPaymentAmount } from "./reservationPaymentManagement";
import { sharedPriceFlag } from "../../../../utils/servicePricingType";

const rows = value => Array.isArray(value) ? value : [];
const beneficiaryRows = (value, audience) => rows(value).map(row =>
  typeof row === "number" && Number.isSafeInteger(row) && row >= 0
    ? { id: `${audience}:${row + 1}` } : row);
export const ticketName = service => service.assignedChildService?.ticket?.entrada
  || service.assignedChildService?.tickets?.entrada || service.assignedChildService?.entrada
  || service.childService?.ticket?.entrada || service.childService?.tickets?.entrada || service.childService?.entrada || "Entrada";
export const ticketRows = service => ({
  adults: beneficiaryRows(service.assignedBeneficiariosAdultos ?? service.assigned_beneficiarios_adultos ?? service.beneficiariosAdultos, "adult"),
  children: beneficiaryRows(service.assignedBeneficiariosNinos ?? service.assigned_beneficiarios_ninos ?? service.beneficiariosNinos, "child"),
});
export const ticketDraft = service => ({
  currency: assignedPaymentCurrency(service),
  exchangeRate: assignedPaymentExchangeRate(service) ?? DEFAULT_ASSIGNED_PEN_RATE,
  adultUnitPrice: service.assignedPrecioServicio ?? service.assigned_precio_servicio ?? service.precioServicio ?? 0,
  ...ticketRows(service), dirty: assignedPaymentCurrency(service) === "PEN" && assignedPaymentExchangeRate(service) == null,
});
const id = row => typeof row === "string" ? row : row.child_origin || row.childOrigin || row.id;
const identitySlot = row => {
  const value = id(row);
  const match = /^(adult|child):(\d+)(:.*)?$/.exec(value || "");
  return match ? `${match[1]}:${Number(match[2]) + (match[3] ? 1 : 0)}` : value;
};
export const ticketDraftTotal = (service, draft) => {
  const identities = new Set();
  for (const row of [...draft.adults, ...draft.children]) {
    const identity = identitySlot(row);
    if (!identity || identities.has(identity)) throw new Error("Hay beneficiarios duplicados o sin identidad");
    identities.add(identity);
  }
  const unit = roundPaymentMoney(draft.adultUnitPrice);
  const shared = sharedPriceFlag(service.assignedTipoPrecio ?? service.assigned_tipo_precio ?? service.tipoPrecio ?? service.tipo_precio) === true;
  const adultTotal = draft.adults.length ? shared ? unit : unit * draft.adults.length : 0;
  return roundPaymentMoney(adultTotal + draft.children.reduce((sum, row) => sum + roundPaymentMoney(row.precio ?? row.price ?? 0), 0));
};
export const ticketPricingPayload = (service, draft) => {
  ticketDraftTotal(service, draft);
  const rate = draft.currency === "USD" ? 1 : Number(draft.exchangeRate);
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 1000000) throw new Error("Confirma un TC válido (PEN por USD)");
  return { assigned_moneda: storedPaymentCurrency(draft.currency), assigned_tasa_cambio: rate,
    assigned_precio_servicio: roundPaymentMoney(draft.adultUnitPrice),
    assigned_beneficiarios_adultos: draft.adults, assigned_beneficiarios_ninos: draft.children };
};

/** Re-read after creating: a notification acknowledgement is not a payment request. */
export async function prepareTicketRequests({ services, voucherId, api, isCurrent = () => true }) {
  if (!voucherId || !services.length) throw new Error("Selecciona entradas de una reserva");
  const requests = await api.getPaymentRequestsByVoucherReservaId(voucherId, { skipCache: true });
  if (!isCurrent()) return null;
  if (!Array.isArray(requests)) throw new Error("No se pudieron verificar las solicitudes existentes; actualiza antes de solicitar");
  const existing = requests;
  const pending = [], seen = new Set();
  for (const service of services) {
    const serviceId = getPaymentServiceId(service);
    if (!serviceId || seen.has(serviceId) || !(service.isAssigned || service.is_assigned)) throw new Error("Valida cada entrada antes de solicitar su pago");
    seen.add(serviceId);
    const matching = existing.filter(row => Number(row.itinerario_servicio_id) === serviceId
      && (!row.voucher_reserva_id || String(row.voucher_reserva_id) === String(voucherId)));
    const request = matching.find(row => row.status === "paid" || row.movimiento_id != null)
      || matching.find(row => row.status === "pending" && row.is_active !== false);
    if (request?.status === "paid" || request?.movimiento_id != null) throw new Error("Una entrada seleccionada ya está pagada");
    if (!request) pending.push({ itinerario_servicio_id: serviceId, amount: getAssignedPaymentAmount(service), observaciones: null, payment_deadline: null });
  }
  if (pending.some(row => !(row.amount > 0))) throw new Error("Las entradas gratuitas no requieren un pago");
  if (pending.length) await api.requestPaymentsBatch({ voucher_reserva_id: voucherId, requests: pending });
  if (!isCurrent()) return null;
  const fresh = await api.getPaymentRequestsByVoucherReservaId(voucherId, { skipCache: true });
  if (!isCurrent()) return null;
  if (!Array.isArray(fresh)) throw new Error("No se confirmó la lista de solicitudes pendientes");
  return services.map(service => {
    if (fresh.some(row => Number(row.itinerario_servicio_id) === getPaymentServiceId(service) && (row.status === "paid" || row.movimiento_id != null))) {
      throw new Error("Una entrada seleccionada ya está pagada; actualiza los pendientes");
    }
    const request = fresh.find(row => Number(row.itinerario_servicio_id) === getPaymentServiceId(service)
      && (!row.voucher_reserva_id || String(row.voucher_reserva_id) === String(voucherId))
      && row.status === "pending" && row.is_active !== false);
    if (!request) throw new Error("No se confirmó la solicitud pendiente. Actualiza antes de pagar");
    return { ...request, service_data: service };
  });
}
export const ticketMovementPrefill = (request, voucherCode) => ({
  descripcion: `Pago de entrada - ${ticketName(request.service_data || {})}`,
  monto: Number(request.amount), moneda: storedPaymentCurrency(requestPaymentCurrency(request)),
  platform: request.platform, business_type: request.business_type,
  obligation_currency: requestPaymentCurrency(request), assigned_tasa_cambio: request.assigned_tasa_cambio,
  tipo_cambio: paymentExchangeRatePrefill(request), payment_request_service_data: request.service_data,
  referencia_voucher_reserva: request.voucher_reserva_id, voucher_code: voucherCode,
  contexto_pago: { tipo: "ServiciosVoucherReserva", payment_request_id: request.id,
    obligation_currency: requestPaymentCurrency(request), assigned_tasa_cambio: request.assigned_tasa_cambio },
});
