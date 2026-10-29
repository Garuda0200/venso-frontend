// Receipts come from a successful settlement response, never from a movement
// draft or a file code (different sales can share that code).
export const SERVICE_PAYMENTS_CONFIRMED_EVENT = "servicePaymentsConfirmed";
const identifier = value => value == null ? "" : String(value);
const timestamp = value => {
  if (!value) return 0;
  const raw = String(value);
  const parsed = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(raw) ? raw : `${raw}Z`);
  return Number.isFinite(parsed) ? parsed : 0;
};
const version = request => timestamp(request?.updated_at || request?.updatedAt || request?.paid_at || request?.paidAt);
const validReceipt = request => request && request.id && request.status &&
  (request.itinerario_servicio_id || request.itinerarioServicioId);

export function extractConfirmedServicePayments(response) {
  if (!response || response.success === false) return [];
  if (Array.isArray(response)) return response.filter(validReceipt);
  if (validReceipt(response)) return [response];
  return extractConfirmedServicePayments(response.payment_requests || response.payment_request || response.data);
}

export function mergeConfirmedServicePayments(current = [], incoming = []) {
  const byId = new Map(current.map(request => [identifier(request.id), request]));
  incoming.filter(validReceipt).forEach(request => {
    const previous = byId.get(identifier(request.id));
    if (!previous || !version(request) || version(request) >= version(previous)) {
      byId.set(identifier(request.id), { ...previous, ...request });
    }
  });
  return [...byId.values()];
}

export function publishConfirmedServicePayments(requests) {
  const receipts = extractConfirmedServicePayments(requests);
  if (!receipts.length || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SERVICE_PAYMENTS_CONFIRMED_EVENT, {
    detail: { payment_requests: receipts },
  }));
}

export function applyConfirmedServicePayments(itinerary = [], confirmations = [], scope = {}) {
  if (!Array.isArray(itinerary) || !confirmations.length) return itinerary;
  return itinerary.map(day => ({
    ...day,
    servicios: (Array.isArray(day.servicios) ? day.servicios : []).map(service => {
      const existing = service.paymentRequest || service.payment_request;
      const serviceId = identifier(service.itinerario_servicio_id || service.itinerarioServicioId ||
        service.servicioId || service.servicio_id || service.db_id || service.id);
      const candidates = confirmations.filter(request => {
        const saleId = request.voucher_venta_id ?? request.voucher_id;
        if (saleId != null && scope.voucherId != null && identifier(saleId) !== identifier(scope.voucherId)) return false;
        if (request.voucher_reserva_id != null && scope.reservationId != null && identifier(request.voucher_reserva_id) !== identifier(scope.reservationId)) return false;
        return identifier(request.id) === identifier(existing?.id) ||
          identifier(request.itinerario_servicio_id || request.itinerarioServicioId) === serviceId;
      }).sort((a, b) => version(b) - version(a));
      const receipt = candidates[0];
      if (!receipt || (version(existing) > version(receipt))) return service;
      const cancelled = ["cancelled", "canceled", "rejected", "reversed", "anulado"].includes(String(receipt.status).toLowerCase());
      const paymentRequest = {
        ...(identifier(existing?.id) === identifier(receipt.id) ? existing : {}),
        ...receipt,
        ...(cancelled ? { paid_at: null, paidAt: null, paid_amount: 0, amount_paid: 0, payment_amount: 0 } : {}),
      };
      return { ...service, paymentRequest, payment_request: paymentRequest };
    }),
  }));
}
