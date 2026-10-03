import { getAssignedTariff, hasAssignedService, mergeItineraryDaysByNumber } from "./serviceAssignment";
import { getSpecializedServiceType } from "./specializedPaymentGroups";

const defined = (...values: any[]) => values.find(value => value != null && value !== "");
const rows = (value: any): any[] => {
  if (typeof value === "string") { try { return rows(JSON.parse(value)); } catch { return []; } }
  return Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];
};
const positiveId = (value: any) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const cents = (value: any) => Math.round((Number(value) || 0) * 100) / 100;

/** Normaliza exclusivamente el contrato operativo, sin inventar asignaciones cotizadas. */
export function normalizePaymentItinerary(itinerary: any): any[] {
  return mergeItineraryDaysByNumber(rows(itinerary).map(day => ({
    ...day,
    servicios: rows(day?.servicios).filter(service => service && typeof service === "object").map(service => {
      const wrapper = service.assignedService || service.assigned_service || {};
      const parent = defined(service.assignedParentService, service.assigned_parent_service, wrapper.parentService, wrapper.parent_service);
      const child = defined(service.assignedChildService, service.assigned_child_service, wrapper.childService, wrapper.child_service);
      const parentId = defined(service.assignedParentId, service.assigned_parent_id, wrapper.parentId, wrapper.parent_id);
      const childId = defined(service.assignedChildId, service.assigned_child_id, wrapper.childId, wrapper.child_id);
      const assigned = service.isAssigned === true || service.is_assigned === true || Boolean(parent || child || parentId || childId || Object.keys(wrapper).length);
      const normalized = {
        ...service,
        servicioId: getPaymentServiceId(service),
        isAssigned: assigned,
        assignedParentService: parent || null,
        assignedChildService: child || null,
        assignedParentId: parentId ?? null,
        assignedChildId: childId ?? null,
        typeService: defined(wrapper.typeService, wrapper.type_service, service.typeService, service.type_service, service.tipo_servicio),
        assignedPrecioServicio: defined(service.assignedPrecioServicio, service.assigned_precio_servicio, wrapper.assignedPrecioServicio, wrapper.assigned_precio_servicio, wrapper.precioServicio, wrapper.precio_servicio),
        assignedPrecioTotal: defined(service.assignedPrecioTotal, service.assigned_precio_total, wrapper.assignedPrecioTotal, wrapper.assigned_precio_total, wrapper.precioTotal, wrapper.precio_total),
        assignedMoneda: defined(service.assignedMoneda, service.assigned_moneda, wrapper.moneda),
        assignedIgv: defined(service.assignedIgv, service.assigned_igv, wrapper.igv),
        assignedPrecioAdultoDividido: defined(service.assignedPrecioAdultoDividido, service.assigned_precio_adulto_dividido, wrapper.precioAdultoDividido, wrapper.precio_adulto_dividido),
        assignedCapacidadLimite: defined(service.assignedCapacidadLimite, service.assigned_capacidad_limite, wrapper.capacidadLimite, wrapper.capacidad_limite),
        assignedBeneficiariosAdultos: defined(service.assignedBeneficiariosAdultos, service.assigned_beneficiarios_adultos, wrapper.assignedBeneficiariosAdultos, wrapper.beneficiariosAdultos, wrapper.beneficiarios_adultos),
        assignedBeneficiariosNinos: defined(service.assignedBeneficiariosNinos, service.assigned_beneficiarios_ninos, wrapper.assignedBeneficiariosNinos, wrapper.beneficiariosNinos, wrapper.beneficiarios_ninos),
        assignedPassengerSelection: defined(service.assignedPassengerSelection, service.assigned_passenger_selection, wrapper.passengerSelection, wrapper.passenger_selection),
        assignedTariff: defined(service.assignedTariff, service.assigned_tariff, wrapper.tariff, wrapper.tarifa),
        assignedService: assigned ? { ...wrapper, parentService: parent || null, childService: child || null } : null,
      };
      // Beneficiarios JSON pueden venir como listas o mapas de identificadores.
      if (normalized.assignedBeneficiariosAdultos != null) normalized.assignedBeneficiariosAdultos = rows(normalized.assignedBeneficiariosAdultos);
      if (normalized.assignedBeneficiariosNinos != null) normalized.assignedBeneficiariosNinos = rows(normalized.assignedBeneficiariosNinos);
      return normalized;
    }),
  })));
}

export function getPaymentServiceId(service: any = {}): number | null {
  const wrapper = service.assignedService || service.assigned_service || {};
  return positiveId(defined(service.servicioId, service.itinerario_servicio_id, service.servicio_id, wrapper.servicioId, wrapper.itinerario_servicio_id, wrapper.servicio_id, service.id));
}

/** Un cero asignado es explícito: nunca se sustituye por el precio cotizado. */
export function getAssignedPaymentAmount(service: any = {}): number {
  const wrapper = service.assignedService || service.assigned_service || {};
  const tariff = service.assignedPrecioServicio != null || service.assigned_precio_servicio != null
    ? getAssignedTariff(service)
    : service.assignedTariff || service.assigned_tariff || wrapper.tariff;
  const raw = defined(service.assignedPrecioTotal, service.assigned_precio_total,
    wrapper.assignedPrecioTotal, wrapper.assigned_precio_total, wrapper.precioTotal, wrapper.precio_total,
    tariff?.precio_original_with_child_extras, tariff?.precio_original, wrapper.precio);
  const amount = Number(raw);
  return Number.isFinite(amount) ? cents(amount) : 0;
}

export function getOperationalPaymentRequest(service: any = {}) {
  const request = service.paymentRequest || service.payment_request;
  const status = String(request?.status || "").toLowerCase();
  return request && (status === "paid" || (status === "pending" && request.is_active !== false)) ? { ...request, status } : null;
}

/** Pagados archivados siguen pagados; cancelados no bloquean una nueva solicitud. */
export function enrichPaymentItinerary(itinerary: any[], requests: any[]) {
  return itinerary.map(day => ({ ...day, servicios: (day.servicios || []).map((service: any) => {
    const id = getPaymentServiceId(service);
    const matching = requests.filter(request => id && positiveId(request.itinerario_servicio_id) === id)
      .map(request => getOperationalPaymentRequest({ paymentRequest: request })).filter(Boolean);
    matching.sort((a, b) => Number(b.status === "paid") - Number(a.status === "paid")
      || String(b.created_at || "").localeCompare(String(a.created_at || "")));
    // La respuesta fresca, incluso vacía, reemplaza estados embebidos antiguos.
    return { ...service, paymentRequest: matching[0] || null, payment_request: null };
  }) }));
}

export function canRequestReservationPayment(service: any): boolean {
  const type = getSpecializedServiceType(service);
  // Trenes conservan pago directo, vuelos su formulario; entradas asignadas sí pueden solicitarse.
  return hasAssignedService(service) && service.is_active !== false && Boolean(getPaymentServiceId(service))
    && !getOperationalPaymentRequest(service) && !["trenes", "tren", "vuelos"].includes(type)
    && getAssignedPaymentAmount(service) > 0;
}

export function buildReservationPaymentCandidates(itinerary: any[]) {
  const seen = new Set<number>();
  return itinerary.flatMap((day, dayIndex) => (day.servicios || []).flatMap((service: any, serviceIndex: number) => {
    const id = getPaymentServiceId(service);
    if (!id || seen.has(id) || !canRequestReservationPayment(service)) return [];
    seen.add(id);
    return [{ key: String(id), service, dayIndex, serviceIndex, dayNumber: day.numero,
      dayTitle: day.titulo || "Sin título", amount: getAssignedPaymentAmount(service) }];
  }));
}

export function getAssignedTicketQuantity(service: any) {
  const selection = service.assignedPassengerSelection || service.assignedService?.passengerSelection;
  const adults = service.assignedBeneficiariosAdultos;
  const children = service.assignedBeneficiariosNinos;
  if (adults != null || children != null) return rows(adults).length + rows(children).length;
  if (Array.isArray(selection?.selectedIds)) return new Set(selection.selectedIds).size;
  const count = Number(defined(selection?.count, selection?.cantidad));
  return Number.isFinite(count) && count >= 0 ? count : null;
}
