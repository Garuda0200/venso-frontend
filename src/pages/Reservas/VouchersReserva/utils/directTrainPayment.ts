import { getAssignedTariff, hasAssignedService, resolveServiceType } from "./serviceAssignment";
import { getAssignedPaymentAmount, getPaymentServiceId, normalizePaymentItinerary } from "./reservationPaymentManagement";

const normalized = (service: any) => normalizePaymentItinerary([{ numero: 1, servicios: [service] }])[0]?.servicios[0];

/** Provider hydration is not required when its operational ID is already saved. */
export function canPayAssignedTrain(service: any = {}) {
  const row = normalized(service);
  const type = String(resolveServiceType(row) || "").trim().toLowerCase();
  return ["tren", "trenes"].includes(type) && row.is_active !== false && hasAssignedService(row)
    && Boolean(row.assignedParentService || Number(row.assignedParentId) > 0);
}

function unwrapRequest(response: any): any {
  if (response?.success === false) throw new Error(response.message || "No se pudo consultar la solicitud de pago");
  const candidate = response?.data?.payment_request ?? response?.payment_request ?? response?.data ?? response;
  if (candidate?.id) return candidate;
  if (response?.success === true && (response.data === null || response.notification_id != null)) return null;
  throw new Error("La respuesta de la solicitud de pago no es válida. Actualiza y vuelve a intentarlo");
}

const operational = (request: any) => request && (
  String(request.status || "").toLowerCase() === "paid"
  || (String(request.status || "").toLowerCase() === "pending" && request.is_active !== false)
);

/** Prepare an obligation, never an accounting movement. Saving MovimientoForm is
 * still the only action that pays it. Dependencies keep this flow testable. */
export async function prepareDirectTrainPayment({ service, paymentRequest, voucher, api,
  isCurrent = () => true }: {
  service: any; paymentRequest?: any; voucher: any;
  api: { getPaymentRequest: (...args: any[]) => Promise<any>; requestPayment: (payload: any) => Promise<any> };
  isCurrent?: () => boolean;
}) {
  const row = normalized(service);
  const serviceId = getPaymentServiceId(row);
  const voucherId = voucher?.reservationVoucher?.id || voucher?.id || voucher?.voucher_reserva_id;
  if (!canPayAssignedTrain(row)) throw new Error("El tren debe tener un proveedor asignado para pagar");
  if (!serviceId) throw new Error("No se encontró el servicio de itinerario para pagar");
  if (!voucherId) throw new Error("No se pudo identificar la reserva necesaria para registrar el pago");
  if (String(paymentRequest?.status || "").toLowerCase() === "paid") throw new Error("Este servicio ya está pagado");

  // A fresh lookup also recovers a previous POST whose response was lost. Never
  // blindly retry a creation or interpret a failed lookup as an absent request.
  let request = unwrapRequest(await api.getPaymentRequest(voucherId, serviceId));
  if (!isCurrent()) return null;
  let created = false;
  if (!operational(request)) {
    const amount = getAssignedPaymentAmount(row);
    if (!(amount > 0)) throw new Error("El servicio no tiene un monto asignado mayor a 0");
    try {
      const response = await api.requestPayment({
        voucher_reserva_id: voucherId, itinerario_servicio_id: serviceId,
        amount, currency: "USD", moneda: "dolares", observaciones: null, payment_deadline: null,
      });
      created = true;
      if (!isCurrent()) return null;
      request = unwrapRequest(response);
      // Venso's current POST returns notification_id, not a request object.
      if (!request) request = unwrapRequest(await api.getPaymentRequest(voucherId, serviceId));
    } catch (error: any) {
      if (!isCurrent()) return null;
      // Another tab may have created the same request. Re-read once, without
      // sending another POST; permission/network errors remain visible.
      if (![400, 409, 422].includes(error?.response?.status)) throw error;
      request = unwrapRequest(await api.getPaymentRequest(voucherId, serviceId));
      if (!operational(request)) throw error;
    }
  }
  if (!isCurrent()) return null;
  if (!request?.id || !operational(request)) throw new Error("No se confirmó una solicitud de pago pendiente. Actualiza y vuelve a intentarlo");
  if (String(request.status).toLowerCase() === "paid") throw new Error("Este servicio ya está pagado");
  if (request.voucher_reserva_id != null && String(request.voucher_reserva_id) !== String(voucherId)
    || request.itinerario_servicio_id != null && Number(request.itinerario_servicio_id) !== serviceId) {
    throw new Error("La solicitud de pago no corresponde a este servicio y reserva");
  }
  const rawAmount = request.amount ?? request.monto;
  const amount = rawAmount == null || rawAmount === "" ? getAssignedPaymentAmount(row) : Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("No se pudo determinar un monto pendiente mayor a 0");
  // The shared display helper supports quoted fallbacks. Accounting must not:
  // a legacy row with only an assigned total must keep that total, not tariff.
  const assignedTariff = row.assignedPrecioServicio != null ? getAssignedTariff(row)
    : row.assignedTariff || row.assignedService?.tariff || (row.assignedPrecioTotal != null ? {
      precio_original: row.assignedPrecioTotal, precio_original_with_child_extras: row.assignedPrecioTotal,
      moneda: row.assignedMoneda || "dolares",
    } : null);
  return { created, request: {
    ...request, amount: Math.round(amount * 100) / 100, monto: Math.round(amount * 100) / 100,
    voucher_reserva_id: voucherId, itinerario_servicio_id: serviceId,
    service_data: {
      ...(request.service_data || {}),
      parentService: row.parentService || request.service_data?.parentService || null,
      childService: row.childService || request.service_data?.childService || null,
      tariff: row.tariff || request.service_data?.tariff || null, typeService: "trenes",
      isAssigned: true, assignedService: {
        ...row.assignedService, typeService: "trenes", tariff: assignedTariff,
        parentService: row.assignedParentService, childService: row.assignedChildService,
        parentId: row.assignedParentId, childId: row.assignedChildId,
        precioServicio: row.assignedPrecioServicio, precioTotal: row.assignedPrecioTotal,
      },
      assignedParentService: row.assignedParentService, assignedChildService: row.assignedChildService,
      assignedParentId: row.assignedParentId, assignedChildId: row.assignedChildId,
      assignedTariff, assignedPrecioTotal: row.assignedPrecioTotal,
      assignedPrecioServicio: row.assignedPrecioServicio, assignedMoneda: row.assignedMoneda,
      assignedBeneficiariosAdultos: row.assignedBeneficiariosAdultos,
      assignedBeneficiariosNinos: row.assignedBeneficiariosNinos,
    },
  } };
}
