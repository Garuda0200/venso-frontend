const firstDefined = (...values: any[]) =>
  values.find((value) => value !== undefined && value !== null);

const hasObjectData = (value: any) =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0,
  );

/**
 * Una asignación operacional existe cuando el servicio cotizado ya está
 * enlazado al servicio que será operado/pagado en una venta cerrada.
 * Los campos comerciales de pasajeros (assignedPassengerIds, etc.) se
 * ignoran intencionalmente porque existen antes de la asignación del voucher.
 */
export const isOperationallyAssignedService = (service: any = {}) => {
  const assignedParentId = firstDefined(
    service?.assignedParentId,
    service?.assigned_parent_id,
  );
  const assignedChildId = firstDefined(
    service?.assignedChildId,
    service?.assigned_child_id,
  );
  const assignedPrice = firstDefined(
    service?.assignedPrecioServicio,
    service?.assigned_precio_servicio,
    service?.assignedPrecioTotal,
    service?.assigned_precio_total,
  );
  const hasAssignedPayload =
    assignedParentId != null ||
    assignedChildId != null ||
    assignedPrice != null ||
    hasObjectData(service?.assignedTariff) ||
    hasObjectData(service?.assigned_tariff) ||
    hasObjectData(service?.assignedPassengerSelection) ||
    hasObjectData(service?.assigned_passenger_selection) ||
    Array.isArray(service?.assignedBeneficiariosAdultos) ||
    Array.isArray(service?.assigned_beneficiarios_adultos) ||
    Array.isArray(service?.assignedBeneficiariosNinos) ||
    Array.isArray(service?.assigned_beneficiarios_ninos);

  const assignmentFlag =
    service?.isAssigned === true || service?.is_assigned === true;

  return (
    assignedParentId != null ||
    assignedChildId != null ||
    (assignmentFlag && hasAssignedPayload)
  );
};

/**
 * Los recálculos por pasajeros pertenecen al editor comercial. En una venta
 * cerrada no deben reescribir servicios que ya tienen asignación operacional.
 */
export const preserveOperationallyAssignedServices = (
  currentServices: any[] = [],
  recalculatedServices: any[] = [],
) => {
  const current = Array.isArray(currentServices) ? currentServices : [];
  const recalculated = Array.isArray(recalculatedServices)
    ? recalculatedServices
    : [];

  return recalculated.map((service, index) =>
    isOperationallyAssignedService(current[index]) ? current[index] : service,
  );
};

const normalizeText = (value: any) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const getQuotedParentId = (service: any = {}) =>
  firstDefined(
    service?.parentId,
    service?.parent_id,
    service?.parentService?.id_hotel,
    service?.parent_service?.id_hotel,
    service?.id_hotel,
  );

const getQuotedChildId = (service: any = {}) =>
  firstDefined(
    service?.childId,
    service?.child_id,
    service?.childService?.id_habitacion,
    service?.childService?.habitacion?.id_habitacion,
    service?.child_service?.id_habitacion,
    service?.child_service?.habitacion?.id_habitacion,
    service?.id_habitacion,
  );

const getHotelName = (service: any = {}) =>
  normalizeText(
    service?.hotelName ||
      service?.hotel_name ||
      service?.parentService?.nombre ||
      service?.parentService?.name ||
      service?.parent_service?.nombre ||
      "",
  );

const getRoomLabel = (service: any = {}) =>
  normalizeText(
    service?.roomKey ||
      service?.room_key ||
      service?.roomType ||
      service?.room_type ||
      service?.childService?.tipo_habitacion ||
      service?.childService?.habitacion?.tipo_habitacion ||
      service?.child_service?.tipo_habitacion ||
      service?.child_service?.habitacion?.tipo_habitacion ||
      "",
  );

const getStableId = (service: any = {}) =>
  firstDefined(
    service?.id,
    service?.servicioId,
    service?.servicio_id,
    service?.liveServicioId,
    service?.live_servicio_id,
  );

const getVersionUid = (service: any = {}) =>
  firstDefined(service?.versionUid, service?.version_uid);

const serviceMatchScore = (existing: any = {}, generated: any = {}) => {
  const existingStableId = getStableId(existing);
  const generatedStableId = getStableId(generated);
  if (
    existingStableId != null &&
    generatedStableId != null &&
    String(existingStableId) === String(generatedStableId)
  ) {
    return 100;
  }

  const existingVersionUid = getVersionUid(existing);
  const generatedVersionUid = getVersionUid(generated);
  if (
    existingVersionUid &&
    generatedVersionUid &&
    String(existingVersionUid) === String(generatedVersionUid)
  ) {
    return 95;
  }

  const existingParentId = getQuotedParentId(existing);
  const generatedParentId = getQuotedParentId(generated);
  const existingChildId = getQuotedChildId(existing);
  const generatedChildId = getQuotedChildId(generated);

  if (
    existingParentId != null &&
    generatedParentId != null &&
    existingChildId != null &&
    generatedChildId != null &&
    String(existingParentId) === String(generatedParentId) &&
    String(existingChildId) === String(generatedChildId)
  ) {
    return 90;
  }

  if (
    existingChildId != null &&
    generatedChildId != null &&
    String(existingChildId) === String(generatedChildId)
  ) {
    return 80;
  }

  const existingHotel = getHotelName(existing);
  const generatedHotel = getHotelName(generated);
  const existingRoom = getRoomLabel(existing);
  const generatedRoom = getRoomLabel(generated);

  if (
    existingHotel &&
    generatedHotel &&
    existingRoom &&
    generatedRoom &&
    existingHotel === generatedHotel &&
    existingRoom === generatedRoom
  ) {
    return 70;
  }

  if (existingRoom && generatedRoom && existingRoom === generatedRoom) {
    return 60;
  }

  return 0;
};

const STABLE_IDENTITY_KEYS = [
  "id",
  "servicioId",
  "servicio_id",
  "liveServicioId",
  "live_servicio_id",
  "versionUid",
  "version_uid",
  "refTipo",
  "ref_tipo",
  "sourceItinerary",
  "isExternalItinerary",
];

export const preserveServiceStableIdentity = (
  generated: any = {},
  existing: any = {},
) => {
  const next = { ...generated };
  STABLE_IDENTITY_KEYS.forEach((key) => {
    if (existing?.[key] !== undefined && existing?.[key] !== null) {
      next[key] = existing[key];
    }
  });
  return next;
};

/**
 * Reconcilia las habitaciones regeneradas por HotelPricingModal con las filas
 * reales de itinerario_servicio. Las filas asignadas se conservan exactamente
 * y las editables mantienen identidad DB para producir UPDATE en vez de
 * DELETE+INSERT.
 */
export const reconcileHotelServiceRows = (
  existingHotelServices: any[] = [],
  generatedHotelServices: any[] = [],
) => {
  const existing = Array.isArray(existingHotelServices)
    ? existingHotelServices.filter(Boolean)
    : [];
  const generated = Array.isArray(generatedHotelServices)
    ? generatedHotelServices.filter(Boolean)
    : [];
  const usedExisting = new Set<number>();

  const reconciled = generated.map((generatedService, generatedIndex) => {
    let bestIndex = -1;
    let bestScore = 0;

    existing.forEach((existingService, existingIndex) => {
      if (usedExisting.has(existingIndex)) return;
      const score = serviceMatchScore(existingService, generatedService);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = existingIndex;
      }
    });

    if (bestIndex < 0) {
      const positionalIndex = existing.findIndex(
        (_, existingIndex) =>
          !usedExisting.has(existingIndex) && existingIndex >= generatedIndex,
      );
      bestIndex =
        positionalIndex >= 0
          ? positionalIndex
          : existing.findIndex(
              (_, existingIndex) => !usedExisting.has(existingIndex),
            );
    }

    if (bestIndex < 0) return generatedService;

    usedExisting.add(bestIndex);
    const existingService = existing[bestIndex];
    if (isOperationallyAssignedService(existingService)) {
      return existingService;
    }

    return preserveServiceStableIdentity(generatedService, existingService);
  });

  existing.forEach((existingService, existingIndex) => {
    if (
      !usedExisting.has(existingIndex) &&
      isOperationallyAssignedService(existingService)
    ) {
      reconciled.push(existingService);
    }
  });

  return reconciled;
};
