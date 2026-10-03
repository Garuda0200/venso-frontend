import axiosInstance, { invalidateGetCache } from "../utils/axiosInstance";

export const pendingPaymentsKey = ["payment-requests", "pending"] as const;
export const pendingPaymentsEndpoint = "/turismo/vouchers-reserva/payment-requests/pending";
export const pendingPaymentEvents = [
  "paymentRequestCreated", "paymentRequestCompleted", "paymentRequestPaid",
  "paymentRequestCancelled", "movimientoCreated",
] as const;

export async function getPendingPaymentRequests(signal?: AbortSignal): Promise<any[]> {
  invalidateGetCache(pendingPaymentsEndpoint);
  const response = await axiosInstance.get(pendingPaymentsEndpoint, { _skipDedup: true, signal });
  if (response.data?.success !== true || !Array.isArray(response.data.data)) {
    throw new Error("No se pudieron comprobar las solicitudes pendientes");
  }
  return response.data.data.filter((request) =>
    request.is_active !== false && (!request.status || String(request.status).toLowerCase() === "pending"),
  );
}

/** También recibe los eventos emitidos por las notificaciones SSE de otros usuarios. */
export function subscribePendingPaymentChanges(target: EventTarget, refresh: () => void) {
  pendingPaymentEvents.forEach((event) => target.addEventListener(event, refresh));
  return () => pendingPaymentEvents.forEach((event) => target.removeEventListener(event, refresh));
}

export async function validatePendingPaymentBatch(selected: any[]) {
  if (!selected.length || new Set(selected.map((request) => String(request.id))).size !== selected.length) {
    throw new Error("Seleccione solicitudes pendientes sin duplicados.");
  }
  const pending = await getPendingPaymentRequests();
  for (const request of selected) {
    const current = pending.find((item) => String(item.id) === String(request.id));
    if (!current || Number(current.amount) !== Number(request.amount)) {
      throw new Error("El lote cambió: hay pagos completados, cancelados o con otro importe. Actualice los pendientes.");
    }
  }
}
