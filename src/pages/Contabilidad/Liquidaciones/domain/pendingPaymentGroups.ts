import { resolvePendingPaymentAssignment, resolvePendingPaymentCurrency } from "../../../../utils/pendingPayments";

const firstId = (...ids: any[]) => ids.find((id) => id != null && id !== "");
const entityId = (entity: any = {}) => firstId(entity.id_hotel, entity.id_vuelo, entity.id_tren,
  entity.id_transporte, entity.id_guia, entity.id_endose, entity.id_habitacion, entity.id_vagon,
  entity.id_movilidad, entity.id_ruta, entity.id_tipotour, entity.id_restaurante, entity.id_restaurant,
  entity.id_ticket, entity.id_extra, entity.id_servicio_extra, entity.id,
  entity.ticket?.id_ticket, entity.restaurante?.id_restaurante, entity.servicio_extra?.id_servicio_extra);

export function buildPendingPaymentGroups(requests: any[], getName: (service: any) => string) {
  const groups = new Map<string, any>();
  for (const request of requests) {
    if (request.is_active === false || (request.status && String(request.status).toLowerCase() !== "pending")) continue;
    const assignment = resolvePendingPaymentAssignment(request);
    const service = assignment.service;
    const parent = service.parentService || {};
    const child = service.childService || {};
    const type = String(request.service_type || service.typeService || service.type_service || parent.typeService ||
      (child.ticket || child.id_ticket ? "tickets" : child.restaurante || child.id_restaurante ? "restaurantes" :
        child.servicio_extra || child.extra ? "extras" : "unknown")).toLowerCase();
    const parentId = firstId(assignment.assignedParentId, entityId(parent));
    const childId = firstId(assignment.assignedChildId, entityId(child));
    const identity = parentId != null || childId != null
      ? `parent-${parentId ?? "none"}-child-${childId ?? "none"}` : `request-${request.id}`;
    const currency = resolvePendingPaymentCurrency(request);
    const serviceKey = [type, identity, currency, request.platform || "venso", request.business_type || "B2C"].join("|");
    if (!groups.has(serviceKey)) groups.set(serviceKey, {
      serviceKey, serviceData: service, categoryId: service.tariff?.tipo_tarifa || service.tipo_tarifa || type,
      nombre: getName(service), tipo: type, currency, totalPendiente: 0, cantidadPagos: 0, paymentRequests: [],
    });
    const group = groups.get(serviceKey);
    group.paymentRequests.push(request);
    group.cantidadPagos++;
    const amount = Number.parseFloat(request.amount);
    group.totalPendiente = Math.round((group.totalPendiente + (Number.isFinite(amount) ? amount : 0)) * 100) / 100;
  }
  return [...groups.values()];
}

/** Devuelve los objetos frescos, no snapshots que pudieron pagarse o cambiar de monto. */
export function reconcilePendingPaymentSelection(requests: any[], ids: string[]) {
  const selected = new Set(ids.map(String));
  return requests.filter((request) => selected.has(String(request.id)) && request.is_active !== false &&
    (!request.status || String(request.status).toLowerCase() === "pending"));
}
