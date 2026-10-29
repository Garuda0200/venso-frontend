const normalizeText = (value) =>
  value === undefined || value === null ? "" : String(value).trim().toLowerCase();

const firstValue = (...values) =>
  values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");

export const isExternalReservationSummaryService = (service = {}, day = {}) => {
  const source = normalizeText(
    firstValue(
      service?.sourceItinerary,
      service?.source_itinerary,
      day?.sourceItinerary,
      day?.source_itinerary,
    ),
  );
  const refType = normalizeText(
    firstValue(
      service?.refTipo,
      service?.ref_tipo,
      service?.cotizacionServiceRef?.refTipo,
      service?.cotizacionServiceRef?.ref_tipo,
      service?.cotizacion_service_ref?.refTipo,
      service?.cotizacion_service_ref?.ref_tipo,
      day?.refTipo,
      day?.ref_tipo,
    ),
  );

  return Boolean(
    service?.isExternalItinerary === true ||
      service?.is_external_itinerary === true ||
      day?.isExternalItinerary === true ||
      day?.is_external_itinerary === true ||
      source === "external" ||
      refType === "cotizacion_externa",
  );
};

export const markReservationExternalItinerary = (itinerary = []) =>
  (Array.isArray(itinerary) ? itinerary : []).map((day, dayIndex) => ({
    ...day,
    numero: Number(day?.numero || day?.day || dayIndex + 1) || dayIndex + 1,
    sourceItinerary: "external",
    isExternalItinerary: true,
    refTipo: "cotizacion_externa",
    servicios: (Array.isArray(day?.servicios) ? day.servicios : []).map(
      (service) => ({
        ...service,
        sourceItinerary: "external",
        isExternalItinerary: true,
        refTipo:
          service?.refTipo || service?.ref_tipo || "cotizacion_externa",
      }),
    ),
  }));

const getStableId = (service = {}) =>
  firstValue(
    service?.servicioId,
    service?.itinerarioServicioId,
    service?.itinerario_servicio_id,
    service?.id,
  );

const getReferenceId = (service = {}) =>
  firstValue(
    service?.cotizacionServiceRef?.id,
    service?.cotizacion_service_ref?.id,
  );

const getReferenceIndex = (service = {}) => {
  const value = firstValue(
    service?.cotizacionServiceRef?.serviceIndex,
    service?.cotizacion_service_ref?.service_index,
  );
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const getServiceType = (service = {}) =>
  normalizeText(
    firstValue(
      service?.cotizacionServiceRef?.typeService,
      service?.cotizacion_service_ref?.type_service,
      service?.typeService,
      service?.type_service,
      service?.parentService?.typeService,
      service?.parentService?.type_service,
      service?.childService?.typeService,
      service?.childService?.type_service,
      service?.category,
    ),
  );

const getParentReferenceId = (service = {}) => {
  const parent = service?.parentService || service?.parent_service || {};
  return firstValue(
    service?.parent_id,
    service?.parentId,
    service?.cotizacionServiceRef?.parent_id,
    service?.cotizacionServiceRef?.parentId,
    parent?.id_hotel,
    parent?.id_transporte,
    parent?.id_tren,
    parent?.id_restaurante,
    parent?.id,
    parent?.id_servicio,
    parent?.codigo,
  );
};

const getChildReferenceId = (service = {}) => {
  const child = service?.childService || service?.child_service || {};
  return firstValue(
    service?.child_id,
    service?.childId,
    service?.cotizacionServiceRef?.child_id,
    service?.cotizacionServiceRef?.childId,
    child?.id_habitacion,
    child?.habitacion?.id_habitacion,
    child?.id_movilidad,
    child?.id_vagon,
    child?.id_ruta,
    child?.id_ticket,
    child?.ticket?.id_ticket,
    child?.id,
    child?.id_servicio,
    child?.codigo,
  );
};

export const getReservationQuotedIdentity = (service = {}) => {
  const parentId = getParentReferenceId(service);
  const childId = getChildReferenceId(service);
  if (parentId == null || childId == null) return "";

  return [getServiceType(service), parentId, childId]
    .map(normalizeText)
    .join("|");
};

export const hasReservationQuotedIdentity = (service = {}) =>
  Boolean(getReservationQuotedIdentity(service));

const getNestedIdentity = (service = {}) => {
  const parent = service?.parentService || service?.parent_service || {};
  const child = service?.childService || service?.child_service || {};
  return [
    getServiceType(service),
    getParentReferenceId(service) ||
      firstValue(parent?.id, parent?.id_servicio, parent?.codigo),
    getChildReferenceId(service) ||
      firstValue(child?.id, child?.id_servicio, child?.codigo),
  ]
    .map(normalizeText)
    .join("|");
};

export const getReservationSummaryServiceSource = (service = {}, day = {}) =>
  isExternalReservationSummaryService(service, day) ? "external" : "main";

export const findReservationQuotedService = ({
  service = {},
  quotedServices = [],
} = {}) => {
  const source = getReservationSummaryServiceSource(service);
  const candidates = (Array.isArray(quotedServices) ? quotedServices : []).filter(
    (candidate) => getReservationSummaryServiceSource(candidate) === source,
  );

  if (candidates.length === 0) return null;

  const referenceId = getReferenceId(service);
  const currentId = getStableId(service);
  const serviceType = getServiceType(service);

  // La identidad estable es más fuerte que la posición. Esto protege resúmenes
  // históricos cuando el orden del día cambió después de una edición.
  const byId = candidates.find((candidate) => {
    const candidateId = getStableId(candidate);
    if (candidateId == null) return false;
    if (referenceId != null && String(candidateId) === String(referenceId)) {
      return true;
    }
    return currentId != null && String(candidateId) === String(currentId);
  });
  if (byId) return byId;

  // parent_id + child_id es la identidad comercial del registro. Es más
  // estable que la posición cuando Reservas agrega o reordena servicios.
  const quotedIdentity = getReservationQuotedIdentity(service);
  if (quotedIdentity) {
    const byQuotedIdentity = candidates.find(
      (candidate) =>
        getReservationQuotedIdentity(candidate) === quotedIdentity,
    );
    if (byQuotedIdentity) return byQuotedIdentity;
  }

  // serviceIndex pertenece a su propia colección de origen. Un índice 0 de
  // cotizacion_externa nunca debe apuntar al índice 0 de la cotización base.
  const referenceIndex = getReferenceIndex(service);
  if (referenceIndex !== null && candidates[referenceIndex]) {
    return candidates[referenceIndex];
  }

  const identity = getNestedIdentity(service);
  if (identity && identity !== "||") {
    const byIdentity = candidates.find(
      (candidate) => getNestedIdentity(candidate) === identity,
    );
    if (byIdentity) return byIdentity;
  }

  const sameType = candidates.filter(
    (candidate) => getServiceType(candidate) === serviceType,
  );
  return sameType.length === 1 ? sameType[0] : null;
};

export const dedupeReservationSummaryServices = (services = []) => {
  const seen = new Set();
  return (Array.isArray(services) ? services : []).filter((service, index) => {
    const source = getReservationSummaryServiceSource(service);
    const stableId = getStableId(service);
    const identity = getNestedIdentity(service);
    const key = stableId != null
      ? `${source}:id:${stableId}`
      : `${source}:identity:${identity || index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
