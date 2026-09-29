const hasValue = (value) =>
  value !== undefined && value !== null && value !== "";

const toCount = (value, fallback = null) => {
  if (!hasValue(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
};

const firstCount = (...values) => {
  for (const value of values) {
    const parsed = toCount(value, null);
    if (parsed !== null) return parsed;
  }
  return null;
};

const getDetailsCounts = (cotizacion = {}) => {
  const details = cotizacion.peopleDetails || cotizacion.peopledetails || {};
  const hasAdults = Array.isArray(details?.adults);
  const hasChildren = Array.isArray(details?.children);

  return {
    hasDetails: hasAdults || hasChildren,
    adults: hasAdults ? details.adults.length : null,
    children: hasChildren ? details.children.length : null,
  };
};

/**
 * Resolves the passenger split shown in quotation lists.
 * Explicit passenger-table counters and the live PeopleSelection state are
 * authoritative. `cantidadpersonas` is only a legacy total fallback.
 */
export const resolveCotizacionPassengerCounts = (cotizacion = {}) => {
  const safeCotizacion =
    cotizacion && typeof cotizacion === "object" ? cotizacion : {};
  const peopleCount =
    safeCotizacion.peopleCount || safeCotizacion.peoplecount || {};
  const detailsCounts = getDetailsCounts(safeCotizacion);

  let adults = firstCount(
    peopleCount.adults,
    detailsCounts.hasDetails ? detailsCounts.adults : null,
    safeCotizacion.num_adults,
    safeCotizacion.numAdults,
  );
  let children = firstCount(
    peopleCount.children,
    detailsCounts.hasDetails ? detailsCounts.children : null,
    safeCotizacion.num_children,
    safeCotizacion.numChildren,
  );
  const legacyTotal = firstCount(
    safeCotizacion.cantidadpersonas,
    safeCotizacion.cantidadPersonas,
  );

  if (adults === null && children === null) {
    adults = legacyTotal ?? 0;
    children = 0;
  } else if (adults === null) {
    adults = Math.max(0, (legacyTotal ?? children ?? 0) - (children ?? 0));
  } else if (children === null) {
    children = Math.max(0, (legacyTotal ?? adults) - adults);
  }

  return {
    adults,
    children,
    total: adults + children,
  };
};

/**
 * Produces every alias consumed by legacy and current quotation views so an
 * optimistic cache update cannot retain stale `num_adults`/`num_children`.
 */
export const buildCotizacionPassengerCountPatch = (source = {}) => {
  const counts = resolveCotizacionPassengerCounts(source);
  const peopleCount = {
    adults: counts.adults,
    children: counts.children,
  };

  return {
    num_adults: counts.adults,
    numAdults: counts.adults,
    num_children: counts.children,
    numChildren: counts.children,
    cantidadpersonas: counts.total,
    cantidadPersonas: counts.total,
    peopleCount,
    peoplecount: peopleCount,
  };
};
