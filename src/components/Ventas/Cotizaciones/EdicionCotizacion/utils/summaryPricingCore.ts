import {
  inferHotelRoomCapacityFromType,
  isExtraBedRoomType,
} from "../../../../../utils/hotelRoomTypes";
import {
  calculateCotizacionFinancialSummary,
  calculateExternalItineraryBreakdown,
  ensureNumber,
} from "./cotizacionFinancialSummary";
import {
  aggregatePerRoomPricingByStayGroup,
  buildFinancialSummaryParts,
  buildRoomBasedFinancialSummaryParts,
  calculateAdditionalCostForAudience,
  resolveChildChargeSummary,
} from "./financialDisplayHelpers";
import { buildChildPricingRows } from "./passengerPricingPresentation";
import { resolveCanonicalChildServicePrice } from "./childServicePricingReconciliation";

const round2 = (value) =>
  Math.round((ensureNumber(value) + Number.EPSILON) * 100) / 100;

const normalizePricingSource = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const firstPositiveSummaryPricingNumber = (...values) => {
  for (const value of values) {
    const parsed = ensureNumber(value);
    if (parsed > 0) return parsed;
  }
  return 0;
};

export const parseSummaryPricingObject = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};

export const parseSummaryPricingArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return Object.values(parsed);
    return [];
  } catch {
    return [];
  }
};

export const normalizeSummaryPricingRoomKey = (value) =>
  String(value || "habitacion")
    .replace(/\([^)]*\)\s*$/g, "")
    .replace(/^ni(?:ñ|n)o?s?\s+/i, "")
    .replace(/^habitaci(?:ó|o)n\s+/i, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "habitacion";

/**
 * Identidad de habitación compartida por SummaryContent y el PDF y
 * el voucher. Evita que "Doble / Matrimonial", "doble-1" y aliases de la
 * habitación terminen en columnas distintas o desaparezcan del documento.
 */
export const normalizeSummaryPricingRoomTypeKey = (value) => {
  const source = String(value || "")
    .replace(/\(\s*\d+\s*\)\s*$/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_:]+/g, " ")
    .replace(/[-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!source) return "";

  const audienceFreeSource = source
    .replace(/\b(?:ninos?|children?|child|menores?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const compactNoHotelSource = audienceFreeSource.replace(/\s+/g, "");
  if (
    /\b(?:sin|without|sem|no)\s+(?:hotel|room|habitacion)\b/.test(
      audienceFreeSource,
    ) ||
    /^(?:sin|without|sem|no)(?:hotel|room|habitacion)$/.test(
      compactNoHotelSource,
    )
  ) {
    return "sin-hotel";
  }

  const normalized = audienceFreeSource
    .replace(/\b(?:habitacion|room|hotel)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";
  if (isExtraBedRoomType(normalized)) return "extra-bed";
  const canonicalCapacity = inferHotelRoomCapacityFromType(normalized);
  if (canonicalCapacity === 1) return "simple";
  if (canonicalCapacity === 2) return "doble";
  if (canonicalCapacity === 3) return "triple";
  if (canonicalCapacity === 4) return "familiar";
  if (canonicalCapacity === 5) return "quintuple";
  if (canonicalCapacity === 6) return "sextuple";
  return normalizeSummaryPricingRoomKey(normalized);
};

const SUMMARY_PRICING_ROOM_ORDER = {
  simple: 0,
  doble: 1,
  triple: 2,
  familiar: 3,
  quintuple: 4,
  sextuple: 5,
  "extra-bed": 98,
  "sin-hotel": 99,
};

const cleanSummaryPricingRoomLabel = (part = {}) => {
  const source = String(
    part.roomLabel || part.roomType || part.label || part.roomKey || "Habitación",
  )
    .replace(/\(\s*\d+\s*\)\s*$/g, " ")
    .replace(/^ni(?:ñ|n)o?s?\s+/i, "")
    .replace(/^habitaci(?:ó|o)n\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const roomTypeKey = normalizeSummaryPricingRoomTypeKey(source);
  if (roomTypeKey === "simple") return "Simple";
  if (roomTypeKey === "doble") {
    return /matrimonial/i.test(source) ? "Doble / Matrimonial" : "Doble";
  }
  if (roomTypeKey === "triple") return "Triple";
  if (roomTypeKey === "familiar") return "Familiar";
  if (roomTypeKey === "quintuple") return "Quíntuple";
  if (roomTypeKey === "sextuple") return "Séxtuple";
  if (roomTypeKey === "extra-bed") return "Cama adicional";
  if (roomTypeKey === "sin-hotel") return "Sin hotel";
  return source || "Habitación";
};

/**
 * Modelo de presentación canónico. No vuelve a calcular importes: toma las
 * partes exactas que produjo buildSummaryPricingCore (la misma fuente de
 * ac__summary-calc) y las organiza por habitación/audiencia para cualquier
 * salida visual.
 */
export const buildSummaryPricingPresentation = (modelOrParts = {}) => {
  const parts = Array.isArray(modelOrParts)
    ? modelOrParts
    : Array.isArray(modelOrParts?.parts)
      ? modelOrParts.parts
      : [];
  const columnsByRoom = new Map();

  parts.forEach((rawPart, index) => {
    const part = rawPart && typeof rawPart === "object" ? rawPart : {};
    const audience = part.audience || inferSummaryPricingAudience(part);
    const roomTypeKey = normalizeSummaryPricingRoomTypeKey(
      part.roomKey || part.roomLabel || part.label || part.key,
    );
    if (!roomTypeKey) return;

    const beneficiaries = Math.max(
      1,
      resolveSummaryPricingBeneficiaries(part),
    );
    const value = round2(
      part.value ?? part.final ?? part.total ?? part.totalPerPerson,
    );
    const displayValue = Math.ceil(
      ensureNumber(part.displayValue ?? part.roundedValue ?? value),
    );
    if (displayValue <= 0 && !part.isFree) return;

    const normalizedPart = {
      ...part,
      key: part.key || `summary-pricing-part-${index}`,
      audience,
      roomTypeKey,
      roomKey: roomTypeKey,
      roomLabel: cleanSummaryPricingRoomLabel(part),
      beneficiaries,
      value,
      displayValue,
      lineTotal:
        ensureNumber(part.lineTotal) > 0
          ? ensureNumber(part.lineTotal)
          : displayValue * beneficiaries,
    };

    const column = columnsByRoom.get(roomTypeKey) || {
      key: roomTypeKey,
      roomTypeKey,
      label: normalizedPart.roomLabel,
      capacity: ensureNumber(part.capacity) || null,
      adult: null,
      child: null,
    };
    const current = column[audience];
    column[audience] = current
      ? {
          ...current,
          beneficiaries: current.beneficiaries + beneficiaries,
          lineTotal: current.lineTotal + normalizedPart.lineTotal,
          value: Math.max(current.value, normalizedPart.value),
          displayValue: Math.max(
            current.displayValue,
            normalizedPart.displayValue,
          ),
        }
      : normalizedPart;
    if (!column.capacity && ensureNumber(part.capacity) > 0) {
      column.capacity = ensureNumber(part.capacity);
    }
    if (!column.label || column.label === "Habitación") {
      column.label = normalizedPart.roomLabel;
    }
    columnsByRoom.set(roomTypeKey, column);
  });

  const columns = [...columnsByRoom.values()].sort((left, right) => {
    const orderLeft = SUMMARY_PRICING_ROOM_ORDER[left.roomTypeKey] ?? 50;
    const orderRight = SUMMARY_PRICING_ROOM_ORDER[right.roomTypeKey] ?? 50;
    if (orderLeft !== orderRight) return orderLeft - orderRight;
    return String(left.label || "").localeCompare(String(right.label || ""), "es");
  });

  return {
    parts,
    columns,
    adultRows: columns.map((column) => column.adult).filter(Boolean),
    childRows: columns.map((column) => column.child).filter(Boolean),
    roundedTotal: columns.reduce(
      (sum, column) =>
        sum +
        ensureNumber(column.adult?.lineTotal) +
        ensureNumber(column.child?.lineTotal),
      0,
    ),
  };
};

export const inferSummaryPricingAudience = (part = {}) => {
  const text = `${part.key || ""} ${part.label || ""} ${part.className || ""}`.toLowerCase();
  return /child|niñ|nino|menor/.test(text) ? "child" : "adult";
};

export const resolveSummaryPricingBeneficiaries = (part = {}) => {
  const direct = ensureNumber(part.beneficiaries ?? part.count ?? part.pax);
  if (direct > 0) return direct;

  const match = String(part.label || "").match(/\((\d+)\)/);
  if (match) {
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 1;
};

const resolvePeopleContext = (cotizacion = {}) => {
  cotizacion = normalizePricingSource(cotizacion);

  const peopleDetails =
    cotizacion.peopleDetails ||
    cotizacion.people_details ||
    cotizacion.peopledetails || { adults: [], children: [] };
  const suppliedPeopleCount =
    cotizacion.peopleCount ||
    cotizacion.peoplecount ||
    cotizacion.people_count || {};
  const adultsFromDetails = Array.isArray(peopleDetails?.adults)
    ? peopleDetails.adults.length
    : 0;
  const childrenFromDetails = Array.isArray(peopleDetails?.children)
    ? peopleDetails.children.length
    : 0;
  const adults = Math.max(
    0,
    ensureNumber(
      suppliedPeopleCount.adults ??
        cotizacion.num_adults ??
        cotizacion.numAdults ??
        adultsFromDetails,
    ),
  );
  const children = Math.max(
    0,
    ensureNumber(
      suppliedPeopleCount.children ??
        cotizacion.num_children ??
        cotizacion.numChildren ??
        childrenFromDetails,
    ),
  );

  return {
    peopleDetails,
    peopleCount: {
      adults: adults > 0 ? adults : 1,
      children,
    },
  };
};

/**
 * Núcleo puro del precio visible de SummaryContent.
 *
 * Recibe una cotización cuyo perRoomPricing ya fue resuelto y reproduce la
 * cadena usada por ac__summary-calc, ac__summary-total-main y pax-price-check:
 * servicios + hotel por pasajero + adicionales por audiencia + externo.
 */
export const buildSummaryPricingCore = (
  cotizacion = {},
  options = {},
) => {
  cotizacion = normalizePricingSource(cotizacion);
  options = normalizePricingSource(options);
  const explicitPerRoomPricing = options.perRoomPricing ?? null;

  const { peopleDetails, peopleCount } = resolvePeopleContext(cotizacion);
  const additionalCosts = parseSummaryPricingObject(
    cotizacion.additionalCosts ||
      cotizacion.additionalcosts ||
      cotizacion.additional_costs ||
      {},
  );
  const selectedHotel =
    cotizacion.selectedHotel || cotizacion.selected_hotel || null;
  const rawPerRoomPricing = Array.isArray(explicitPerRoomPricing)
    ? explicitPerRoomPricing
    : [
        cotizacion.perRoomPricing,
        cotizacion.per_room_pricing,
        selectedHotel?.perRoomPricing,
        selectedHotel?.per_room_pricing,
      ]
        .map(parseSummaryPricingArray)
        .find((rows) => rows.length > 0) || [];
  // Una estancia con varios grupos/días puede contener una fila por habitación
  // en cada grupo. El core suma la estancia por beneficiario antes de la
  // deduplicación final, evitando conservar únicamente el grupo más caro.
  const aggregatedPerRoomPricing =
    aggregatePerRoomPricingByStayGroup(rawPerRoomPricing);
  const perRoomPricing =
    aggregatedPerRoomPricing.length > 0
      ? aggregatedPerRoomPricing
      : rawPerRoomPricing;

  const externalItinerary = parseSummaryPricingArray(
    cotizacion.externalItinerary ||
      cotizacion.itinerarioExterno ||
      cotizacion.itinerario_externo ||
      [],
  );
  const externalBreakdown = calculateExternalItineraryBreakdown(
    externalItinerary,
    peopleDetails,
  );
  // Los vouchers pueden traer el itinerario externo transformado para el PDF:
  // conserva sus días/textos, pero no siempre mantiene beneficiarios ni precios.
  // En ese caso calculateExternalItineraryBreakdown devuelve cero aunque la
  // cotización sí tenga los importes por persona persistidos. El core debe usar
  // el cálculo vivo cuando sea útil y, de lo contrario, recurrir a las cifras
  // canónicas de la cotización/additionalCosts. Así todas las salidas reutilizan
  // exactamente la misma trayectoria que ac__summary-calc.
  const calculatedExternalAdultTotal = ensureNumber(
    externalBreakdown.adultTotal,
  );
  const calculatedExternalChildTotal = ensureNumber(
    externalBreakdown.childTotal,
  );
  const calculatedExternalConvertedChildTotal = ensureNumber(
    externalBreakdown.convertedChildTotal,
  );
  const persistedExternalAdultTotal = firstPositiveSummaryPricingNumber(
    cotizacion.backendExternalAdultPerPerson,
    cotizacion.precio_it_ext_adulto,
    cotizacion.precioItExtAdulto,
    cotizacion.externalAdultTotal,
    cotizacion.external_adult_total,
    additionalCosts.externalAdultTotal,
    additionalCosts.external_adult_total,
    additionalCosts.precio_it_ext_adulto,
  );
  const persistedExternalChildTotal = firstPositiveSummaryPricingNumber(
    cotizacion.backendExternalChildPerPerson,
    cotizacion.precio_it_ext_ninos,
    cotizacion.precioItExtNinos,
    cotizacion.externalChildTotal,
    cotizacion.external_child_total,
    additionalCosts.externalChildTotal,
    additionalCosts.external_child_total,
    additionalCosts.precio_it_ext_ninos,
  );
  const persistedExternalConvertedChildTotal = firstPositiveSummaryPricingNumber(
    cotizacion.externalConvertedChildTotal,
    cotizacion.external_converted_child_total,
    additionalCosts.externalConvertedChildTotal,
    additionalCosts.external_converted_child_total,
  );
  const externalAdultTotal =
    calculatedExternalAdultTotal > 0
      ? calculatedExternalAdultTotal
      : persistedExternalAdultTotal;
  const externalChildTotal =
    calculatedExternalChildTotal + calculatedExternalConvertedChildTotal > 0
      ? calculatedExternalChildTotal
      : persistedExternalChildTotal;
  const externalConvertedChildTotal =
    calculatedExternalChildTotal + calculatedExternalConvertedChildTotal > 0
      ? calculatedExternalConvertedChildTotal
      : persistedExternalConvertedChildTotal;
  const hasCalculatedExternalChildBreakdown =
    calculatedExternalChildTotal + calculatedExternalConvertedChildTotal > 0;
  const externalExplicitChildCount = hasCalculatedExternalChildBreakdown
    ? ensureNumber(externalBreakdown.explicitChildCount)
    : firstPositiveSummaryPricingNumber(
        cotizacion.externalExplicitChildCount,
        cotizacion.external_explicit_child_count,
        additionalCosts.externalExplicitChildCount,
        additionalCosts.external_explicit_child_count,
      );
  const externalConvertedChildCount = hasCalculatedExternalChildBreakdown
    ? ensureNumber(externalBreakdown.convertedChildCount)
    : firstPositiveSummaryPricingNumber(
        cotizacion.externalConvertedChildCount,
        cotizacion.external_converted_child_count,
        additionalCosts.externalConvertedChildCount,
        additionalCosts.external_converted_child_count,
      );

  const subtotalIndividual = ensureNumber(
    cotizacion.subtotalIndividual ??
      cotizacion.subtotal_individual ??
      cotizacion.nonHotelsUnitTotal ??
      cotizacion.nonHotelsTotal ??
      cotizacion.precio_it_adulto ??
      cotizacion.precioItAdulto,
  );
  const hotelGroupTotal = ensureNumber(
    cotizacion.hotelsTotal ??
      cotizacion.hotelTotal ??
      selectedHotel?.total ??
      selectedHotel?.hotelTotal,
  );

  const summaryTotals = calculateCotizacionFinancialSummary({
    subtotalIndividual,
    adultsCount: peopleCount.adults,
    childrenCount: peopleCount.children,
    hotelsTotal: hotelGroupTotal,
    hotelAdultTotal:
      ensureNumber(cotizacion.hotelAdultTotal ?? cotizacion.hotel_adult_total) ||
      Math.max(
        0,
        hotelGroupTotal -
          ensureNumber(
            cotizacion.hotelConvertedChildTotal ??
              cotizacion.hotel_converted_child_total,
          ),
      ),
    hotelChildTotal: ensureNumber(
      cotizacion.hotelChildTotal ?? cotizacion.hotel_child_total,
    ),
    hotelConvertedChildTotal: ensureNumber(
      cotizacion.hotelConvertedChildTotal ??
        cotizacion.hotel_converted_child_total,
    ),
    subtotalNinos: ensureNumber(
      cotizacion.subtotalNinos ??
        cotizacion.subtotal_ninos ??
        cotizacion.subtotal_nino ??
        cotizacion.precio_it_ninos ??
        cotizacion.precioItNinos,
    ),
    externalAdultTotal,
    externalChildTotal,
    externalConvertedChildTotal,
    externalExplicitChildCount,
    externalConvertedChildCount,
    baseExplicitChildCount: ensureNumber(cotizacion.baseExplicitChildCount),
    baseConvertedChildCount: ensureNumber(cotizacion.baseConvertedChildCount),
    hotelExplicitChildCount: ensureNumber(cotizacion.hotelExplicitChildCount),
    hotelConvertedChildCount: ensureNumber(
      cotizacion.hotelConvertedChildCount,
    ),
    nonHotelExplicitChildTotal: ensureNumber(
      cotizacion.nonHotelExplicitChildTotal,
    ),
    nonHotelConvertedChildTotal: ensureNumber(
      cotizacion.nonHotelConvertedChildTotal,
    ),
    additionalCosts,
  });

  const childSummary = resolveChildChargeSummary({
    childrenCount: peopleCount.children,
    baseExplicitChildCount: ensureNumber(cotizacion.baseExplicitChildCount),
    baseConvertedChildCount: ensureNumber(cotizacion.baseConvertedChildCount),
    hotelExplicitChildCount: ensureNumber(cotizacion.hotelExplicitChildCount),
    hotelConvertedChildCount: ensureNumber(
      cotizacion.hotelConvertedChildCount,
    ),
    nonHotelExplicitChildTotal: ensureNumber(
      cotizacion.nonHotelExplicitChildTotal,
    ),
    nonHotelConvertedChildTotal: ensureNumber(
      cotizacion.nonHotelConvertedChildTotal,
    ),
    hotelExplicitChildTotal: summaryTotals.hotelExplicitChildTotal,
    hotelConvertedChildTotal: summaryTotals.hotelConvertedChildTotal,
  });

  // Build the same visible rows rendered by SummaryContent's
  // ac__summary-calc.  Do not trust totalPerPerson from a preview/category
  // row: that field can already contain a previous additional/external amount.
  // The visible card is always rebuilt from its primitive components.
  const adultRoomParts = perRoomPricing
    .map((room, index) => {
      const beneficiaries = Math.max(
        0,
        ensureNumber(room?.adultBeneficiaries ?? room?.beneficiaries),
      );
      if (beneficiaries <= 0) return null;

      const hotel = ensureNumber(room?.hotelPerPerson);
      const base = round2(summaryTotals.subtotalIndividual + hotel);
      const additional = calculateAdditionalCostForAudience(
        base,
        additionalCosts,
        "adult",
      );
      const value = round2(base + additional.total + externalAdultTotal);
      if (value <= 0) return null;

      const label = String(room?.label || room?.baseLabel || "Habitación").trim();
      return {
        key: `room-${room?.key || index}`,
        label: `${label} (${beneficiaries})`,
        value,
        commissionableValue: round2(
          base + ensureNumber(additional.commissionable ?? additional.fee),
        ),
        beneficiaries,
        audience: "adult",
        roomKey: normalizeSummaryPricingRoomKey(label),
        roomLabel: label,
        services: round2(summaryTotals.subtotalIndividual),
        hotel: round2(hotel),
        additional: round2(additional.total),
        external: round2(externalAdultTotal),
        passengerIds: Array.isArray(room?.adultPassengerIds)
          ? room.adultPassengerIds
          : Array.isArray(room?.passengerIds)
            ? room.passengerIds
            : [],
        capacity: ensureNumber(room?.capacity ?? room?.roomCapacity) || null,
      };
    })
    .filter(Boolean);

  const backendChildServicePerPerson = resolveCanonicalChildServicePrice(
    cotizacion.hasBackendChildServicePrice === false
      ? undefined
      : cotizacion.backendChildServicePerPerson,
    cotizacion.precio_it_ninos,
    cotizacion.precioItNinos,
  );
  const hasBackendChildServicePrice = backendChildServicePerPerson !== null;
  const childPricingRows = buildChildPricingRows({
    peopleDetails,
    childrenCount: peopleCount.children,
    additionalCosts,
    pricingSource: cotizacion,
    perRoomPricing,
    serviceFallbackPerChild: hasBackendChildServicePrice
      ? backendChildServicePerPerson
      : ensureNumber(childSummary.nonHotelUnifiedPerChild),
    authoritativeServiceFallback: hasBackendChildServicePrice,
    hotelFallbackPerChild: ensureNumber(childSummary.hotelUnifiedPerChild),
    externalPerChild: round2(externalChildTotal + externalConvertedChildTotal),
    calculateAdditional: calculateAdditionalCostForAudience,
  });

  const childRoomParts = childPricingRows
    .map((row, index) => {
      const roomLabels = Array.isArray(row?.roomLabels)
        ? row.roomLabels.filter(Boolean)
        : [];
      const roomLabel = roomLabels.join(" · ") || "Sin hotel";
      const value = round2(row?.total);
      if (value <= 0 && !row?.isFree) return null;
      const additional = row?.additional || {};
      const base = round2(ensureNumber(row?.services) + ensureNumber(row?.hotel));

      return {
        key: row?.key || `child-price-${index + 1}`,
        label:
          roomLabels.length > 0
            ? `Niños ${roomLabel} (1)`
            : "Niño sin hotel",
        value,
        commissionableValue: round2(base + ensureNumber(additional?.fee)),
        beneficiaries: 1,
        audience: "child",
        roomKey: normalizeSummaryPricingRoomKey(roomLabel),
        roomLabel,
        services: round2(row?.services),
        hotel: round2(row?.hotel),
        additional: round2(additional?.total),
        external: round2(row?.external),
        passengerIds: row?.passenger?.id ? [row.passenger.id] : [],
        className: "financial-summary__pill--child",
        isFree: Boolean(row?.isFree),
      };
    })
    .filter(Boolean);

  const exactVisibleParts = [...adultRoomParts, ...childRoomParts];

  const roomParts = buildRoomBasedFinancialSummaryParts({
    adultsCount: peopleCount.adults,
    childrenCount: peopleCount.children,
    subtotalIndividual: summaryTotals.subtotalIndividual,
    additionalCosts,
    childSummary,
    perRoomPricing,
    externalAdultTotal,
    externalChildTotal,
    externalConvertedChildTotal,
  });

  const fallbackParts = buildFinancialSummaryParts({
    adultsCount: peopleCount.adults,
    adultTotal: summaryTotals.perAdultVisibleTotal,
    childTotal: summaryTotals.perExplicitChildVisibleTotal,
    convertedChildTotal: summaryTotals.perConvertedChildVisibleTotal,
    unifiedChildTotal: summaryTotals.perUnifiedChildVisibleTotal,
    childSummary,
    perRoomPricing,
    adultLabelWithConverted: true,
    externalAdultTotal,
    externalChildTotal,
    externalConvertedChildTotal,
  });

  const sourceParts =
    exactVisibleParts.length > 0
      ? exactVisibleParts
      : roomParts.length > 0
        ? roomParts
        : fallbackParts;

  const parts = sourceParts
    .map((part, index) => {
      const beneficiaries = Math.max(
        1,
        resolveSummaryPricingBeneficiaries(part),
      );
      const value = round2(part.value);
      const audience = inferSummaryPricingAudience(part);
      const roomKey = normalizeSummaryPricingRoomKey(part.label);
      const displayValue = Math.ceil(value);
      return {
        ...part,
        key: part.key || `summary-content-price-${index}`,
        audience,
        roomKey,
        beneficiaries,
        value,
        displayValue,
        lineTotal: displayValue * beneficiaries,
      };
    })
    .filter((part) => part.value > 0 || part.beneficiaries > 0);

  const roundedTotal = parts.reduce(
    (sum, part) => sum + part.displayValue * part.beneficiaries,
    0,
  );

  const adultPartsByRoom = new Map();
  const childPartsByRoom = new Map();
  parts.forEach((part) => {
    const target = part.audience === "child" ? childPartsByRoom : adultPartsByRoom;
    const previous = target.get(part.roomKey);
    if (!previous) {
      target.set(part.roomKey, part);
      return;
    }
    target.set(part.roomKey, {
      ...previous,
      beneficiaries: previous.beneficiaries + part.beneficiaries,
      lineTotal: previous.lineTotal + part.lineTotal,
      // El mismo tipo de habitación puede aparecer en varios grupos. En tal
      // caso se conserva la trayectoria total por persona, no se promedian
      // montos de pasajeros diferentes.
      value: Math.max(previous.value, part.value),
      displayValue: Math.max(previous.displayValue, part.displayValue),
    });
  });

  return {
    peopleDetails,
    peopleCount,
    additionalCosts,
    perRoomPricing,
    summaryTotals,
    childSummary,
    externalBreakdown,
    externalAdultTotal,
    externalChildTotal,
    externalConvertedChildTotal,
    externalExplicitChildCount,
    externalConvertedChildCount,
    parts,
    roundedTotal,
    adultPartsByRoom,
    childPartsByRoom,
  };
};

export default buildSummaryPricingCore;
