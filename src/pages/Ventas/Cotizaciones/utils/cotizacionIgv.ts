const TRUE_VALUES = new Set([true, 1, "1", "true", "TRUE", "yes", "YES"]);

const asBoolean = (value) => TRUE_VALUES.has(value);

const getQuoteDays = (cotizacion: any = {}) => {
  const candidates = [
    cotizacion.itinerario,
    cotizacion.dias,
    cotizacion.itinerary,
  ];

  return (
    candidates.find((value) => Array.isArray(value) && value.length > 0) || []
  );
};

const getDayServices = (day: any = {}) => {
  if (Array.isArray(day.servicios)) return day.servicios;
  if (Array.isArray(day.services)) return day.services;
  return [];
};

export const serviceHasQuotedIgv = (service: any = {}) =>
  [
    service.igv,
    service.tieneIgv,
    service.tiene_igv,
    service.hasIgv,
    service.has_igv,
  ].some(asBoolean);

export const countQuotedIgvServices = (cotizacion: any = {}) =>
  getQuoteDays(cotizacion).reduce(
    (total, day) =>
      total +
      getDayServices(day).filter((service) => serviceHasQuotedIgv(service)).length,
    0,
  );

export const resolveCotizacionIgvInfo = (cotizacion: any = {}) => {
  const backendCount = Number(
    cotizacion.igv_service_count ??
      cotizacion.igvServiceCount ??
      cotizacion.igvservicecount ??
      0,
  );
  const normalizedBackendCount = Number.isFinite(backendCount)
    ? Math.max(0, Math.trunc(backendCount))
    : 0;

  const itineraryCount = countQuotedIgvServices(cotizacion);
  const count = Math.max(normalizedBackendCount, itineraryCount);
  const explicitFlag = [
    cotizacion.has_igv,
    cotizacion.hasIgv,
    cotizacion.hasigv,
  ].some(asBoolean);

  return {
    hasIgv: count > 0 || explicitFlag,
    serviceCount: count,
    source:
      count > 0
        ? itineraryCount > 0
          ? "itinerary"
          : "backend"
        : explicitFlag
          ? "legacy"
          : "none",
  };
};

export const resolveCotizacionHasIgv = (cotizacion: any = {}) =>
  resolveCotizacionIgvInfo(cotizacion).hasIgv;
