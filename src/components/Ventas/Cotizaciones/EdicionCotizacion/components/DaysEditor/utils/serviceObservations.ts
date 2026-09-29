const normalizeObservationText = (value) => {
  if (value == null) return "";

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeObservationText(item))
      .filter(Boolean)
      .join(" · ");
  }

  if (typeof value === "object") return "";

  return String(value).trim();
};

const getChildCandidates = (service = {}) => [
  service.childService,
  service.child_service,
  service.assignedChildService,
  service.assigned_child_service,
  service.assignedService?.childService,
  service.assignedService?.child_service,
  service.assigned_service?.childService,
  service.assigned_service?.child_service,
].filter(Boolean);

const isEndoseTourService = (service = {}, serviceType = "") => {
  const normalizedType = String(
    serviceType ||
      service.typeService ||
      service.type_service ||
      service.parentService?.typeService ||
      service.parentService?.type_service ||
      "",
  )
    .trim()
    .toLowerCase();

  if (["endose", "endoses", "tour", "tours"].includes(normalizedType)) {
    return true;
  }

  const childCandidates = getChildCandidates(service);
  return Boolean(
    service.parentService?.id_endose ||
      service.parent_service?.id_endose ||
      service.tour?.id_tipotour ||
      service.id_tipotour ||
      childCandidates.some(
        (child) =>
          child?.id_tipotour ||
          child?.tour?.id_tipotour ||
          child?.id_endose ||
          child?.tour?.id_endose,
      ),
  );
};

/**
 * Devuelve las observaciones operativas del tour hijo de un servicio de endose.
 *
 * El mismo servicio puede llegar desde Cotizaciones, VouchersVenta o
 * VouchersReserva con formas camelCase/snake_case y, durante la asignación,
 * también dentro de assigned*Service. Centralizar la lectura evita que cada
 * resumen interprete una estructura distinta.
 */
export const getServiceObservations = (service = {}, serviceType = "") => {
  if (!service || typeof service !== "object") return "";
  if (!isEndoseTourService(service, serviceType)) return "";

  const childCandidates = getChildCandidates(service);
  const candidates = [
    ...childCandidates.flatMap((child) => [
      child?.observaciones,
      child?.tour?.observaciones,
    ]),
    service.tour?.observaciones,
    service.observaciones,
  ];

  for (const candidate of candidates) {
    const text = normalizeObservationText(candidate);
    if (text) return text;
  }

  return "";
};

export default getServiceObservations;
