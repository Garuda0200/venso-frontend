const toArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
};

export const normalizeSpecializedPaymentType = (value: unknown) => {
  const type = String(value || "").trim().toLowerCase();
  if (["vuelo", "vuelos"].includes(type)) return "vuelos";
  if (["ticket", "tickets", "entrada", "entradas"].includes(type)) return "tickets";
  return type;
};

export const getSpecializedServiceType = (service: any = {}) =>
  normalizeSpecializedPaymentType(
    service.typeService || service.type_service || service.tipo_servicio ||
      service.assignedService?.typeService || service.assigned_service?.type_service ||
      service.assignedParentService?.typeService || service.assigned_parent_service?.type_service ||
      service.parentService?.typeService || service.parent_service?.type_service,
  );

/** Agrupa vuelos y entradas preservando día e índices de origen para los formularios especializados. */
export const getSpecializedPaymentGroups = (itinerary: any = [], requestedType: unknown) => {
  const type = normalizeSpecializedPaymentType(requestedType);
  if (!["vuelos", "tickets"].includes(type)) return [];

  return toArray(itinerary).flatMap((day, dayIndex) => {
    const services = toArray(day?.servicios)
      .map((service, serviceIndex) => ({ ...service, _sourceDayIndex: dayIndex, _sourceServiceIndex: serviceIndex }))
      .filter((service) => getSpecializedServiceType(service) === type);
    if (!services.length) return [];
    return [{
      dayNumber: Number(day?.numero || day?.day || dayIndex + 1) || dayIndex + 1,
      dayTitle: day?.titulo || day?.title || day?.nombre || "",
      dayData: day,
      services,
      flights: services,
    }];
  });
};
