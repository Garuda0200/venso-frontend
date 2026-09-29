import { calculateGeneralTotalsDetailed } from "../components/DaysEditor/utils/priceCalculations";
import { calculateExternalItineraryBreakdown } from "./cotizacionFinancialSummary";
import {
  aggregatePerRoomPricingByStayGroup,
  calculateAdditionalCostForAudience,
  resolveChildChargeSummary,
} from "./financialDisplayHelpers";
import {
  deriveSelectedHotelFromDays,
  normalizeSelectedHotelConfig,
} from "./hotelServiceHelpers";
import { hydrateItinerarioFromDB } from "./itinerarioCleanupUtils";
import {
  normalizeAdditionalCostsAliases,
  round2,
  toMoneyNumber,
} from "./quotePricingEngine";
import { buildChildPricingRows } from "./passengerPricingPresentation";
import { resolveCanonicalChildServicePrice } from "./childServicePricingReconciliation";
import { groupEquivalentChildPricingParts } from "./pricingPartGrouping";
import { normalizeChildRoomLabel } from "./childHotelAccommodation";

const parseObject = (value) => {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
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

const parseArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeDays = (value) => hydrateItinerarioFromDB(parseArray(value));

const positiveInteger = (...values) => {
  for (const value of values) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
};

const normalizePassenger = (passenger = {}, audience = "adult", index = 0) => ({
  ...passenger,
  id:
    passenger?.id ||
    passenger?.id_pasajero ||
    passenger?.passenger_key ||
    passenger?.passengerKey ||
    `${audience}:${index + 1}`,
  passenger_key:
    passenger?.passenger_key ||
    passenger?.passengerKey ||
    passenger?.id ||
    `${audience}:${index + 1}`,
  tipo_pasajero:
    passenger?.tipo_pasajero || passenger?.tipoPasajero || audience,
  age:
    passenger?.age ??
    passenger?.edad ??
    (audience === "child" ? 8 : 30),
  edad:
    passenger?.edad ??
    passenger?.age ??
    (audience === "child" ? 8 : 30),
});

/**
 * El listado recibe conteos de la tabla pasajero. Cuando el detalle completo ya
 * está cargado se conserva; de lo contrario se crea únicamente el contexto de
 * identidad requerido por el motor de precios del frontend.
 */
export const buildQuotationPeopleDetails = (cotizacion = {}) => {
  const source =
    cotizacion?.peopleDetails ||
    cotizacion?.peopledetails ||
    cotizacion?.passengers ||
    cotizacion?.pasajeros ||
    {};
  const sourceAdults = Array.isArray(source?.adults) ? source.adults : [];
  const sourceChildren = Array.isArray(source?.children) ? source.children : [];
  const flatPassengers = Array.isArray(source?.details)
    ? source.details
    : Array.isArray(source)
      ? source
      : [];

  const flatAdults = flatPassengers.filter((passenger) => {
    const type = String(
      passenger?.tipo_pasajero || passenger?.tipoPasajero || "adult",
    ).toLowerCase();
    return type !== "child" && type !== "niño" && type !== "nino";
  });
  const flatChildren = flatPassengers.filter((passenger) => {
    const type = String(
      passenger?.tipo_pasajero || passenger?.tipoPasajero || "",
    ).toLowerCase();
    return type === "child" || type === "niño" || type === "nino";
  });

  const adultsCount =
    sourceAdults.length ||
    flatAdults.length ||
    positiveInteger(
      cotizacion?.num_adults,
      cotizacion?.numAdults,
      cotizacion?.peopleCount?.adults,
      cotizacion?.peoplecount?.adults,
      cotizacion?.cantidadpersonas,
      cotizacion?.cantidadPersonas,
    ) ||
    1;
  const childrenCount =
    sourceChildren.length ||
    flatChildren.length ||
    positiveInteger(
      cotizacion?.num_children,
      cotizacion?.numChildren,
      cotizacion?.peopleCount?.children,
      cotizacion?.peoplecount?.children,
    );

  const adultSource = sourceAdults.length > 0 ? sourceAdults : flatAdults;
  const childSource = sourceChildren.length > 0 ? sourceChildren : flatChildren;

  return {
    adults: Array.from({ length: adultsCount }, (_, index) =>
      normalizePassenger(adultSource[index] || {}, "adult", index),
    ),
    children: Array.from({ length: childrenCount }, (_, index) =>
      normalizePassenger(childSource[index] || {}, "child", index),
    ),
  };
};

const getAdditionalCosts = (cotizacion = {}) =>
  normalizeAdditionalCostsAliases(
    parseObject(
      cotizacion?.additionalCosts ||
        cotizacion?.additionalcosts ||
        cotizacion?.additional_costs ||
        {},
    ),
  );

const normalizeRoomLabel = (value) =>
  String(value || "Habitación")
    .replace(/^HABITACI[ÓO]N\s+/i, "")
    .replace(/^NIÑOS?\s+/i, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim();

const roomPassengerIds = (room = {}) => {
  const adultPassengerIds = Array.isArray(room?.adultPassengerIds)
    ? room.adultPassengerIds
    : [];
  const convertedChildPassengerIds = Array.isArray(
    room?.convertedChildPassengerIds,
  )
    ? room.convertedChildPassengerIds
    : [];
  const passengerIds = Array.isArray(room?.passengerIds)
    ? room.passengerIds
    : [];

  return {
    adultPassengerIds:
      adultPassengerIds.length > 0
        ? adultPassengerIds
        : passengerIds.filter((id) => String(id).startsWith("adult:")),
    convertedChildPassengerIds:
      convertedChildPassengerIds.length > 0
        ? convertedChildPassengerIds
        : passengerIds.filter((id) => String(id).startsWith("child:")),
  };
};

const normalizePerRoomPricing = (rooms = []) =>
  (Array.isArray(rooms) ? rooms : [])
    .map((room, index) => {
      if (!room || typeof room !== "object") return null;
      const ids = roomPassengerIds(room);
      const adultBeneficiaries = Math.max(
        0,
        positiveInteger(room?.adultBeneficiaries) || ids.adultPassengerIds.length,
      );
      const convertedChildBeneficiaries = Math.max(
        0,
        positiveInteger(room?.convertedChildBeneficiaries) ||
          ids.convertedChildPassengerIds.length,
      );
      const beneficiaries = Math.max(
        1,
        positiveInteger(room?.beneficiaries) ||
          adultBeneficiaries + convertedChildBeneficiaries,
      );
      const hotelTotalRoom = toMoneyNumber(
        room?.hotelTotalRoom ?? room?.hotelTotal ?? room?.totalHotel,
      );
      const hotelPerPerson =
        toMoneyNumber(room?.hotelPerPerson) ||
        (hotelTotalRoom > 0 ? round2(hotelTotalRoom / beneficiaries) : 0);

      if (
        hotelPerPerson <= 0 &&
        adultBeneficiaries <= 0 &&
        convertedChildBeneficiaries <= 0
      ) {
        return null;
      }

      return {
        ...room,
        key: room?.key || room?.roomKey || `room-${index + 1}`,
        roomKey: room?.roomKey || room?.sourceRoomKey || room?.key,
        label: normalizeRoomLabel(
          room?.label || room?.roomLabel || room?.roomKey,
        ),
        beneficiaries,
        adultBeneficiaries,
        convertedChildBeneficiaries,
        adultPassengerIds: ids.adultPassengerIds,
        convertedChildPassengerIds: ids.convertedChildPassengerIds,
        passengerIds: [
          ...new Set([
            ...ids.adultPassengerIds,
            ...ids.convertedChildPassengerIds,
          ]),
        ],
        hotelPerPerson,
        convertedChildHotelPerPerson:
          toMoneyNumber(room?.convertedChildHotelPerPerson) || hotelPerPerson,
      };
    })
    .filter(Boolean);

const mapRoomOptions = (config = {}) => {
  if (Array.isArray(config?.roomOptions) && config.roomOptions.length > 0) {
    return config.roomOptions;
  }

  return (Array.isArray(config?.breakdown) ? config.breakdown : []).map(
    (room, index) => ({
      key: room?.key || `room-${index + 1}`,
      label: room?.label || room?.key || `Habitación ${index + 1}`,
      capacity: positiveInteger(room?.capacity) || 1,
      pricePerRoomNight: toMoneyNumber(
        room?.pricePerRoomNight ?? room?.unit ?? room?.precio,
      ),
      count: positiveInteger(room?.cnt, room?.count) || 1,
    }),
  );
};

const getAssignment = (assignments = {}, slotId, roomKey, roomIndex) => {
  const aliases = [
    slotId,
    `${roomKey}:${roomIndex + 1}`,
    `${roomKey}:${roomIndex}`,
    roomKey,
  ];

  for (const alias of aliases) {
    if (Array.isArray(assignments?.[alias])) return [...assignments[alias]];
  }
  return [];
};

/**
 * Compatibilidad para cotizaciones históricas: si el objeto seleccionado no
 * trae perRoomPricing, se reconstruye desde mix/breakdown/roomAssignments, que
 * a su vez se derivan del itinerario_dia e itinerario_servicio.
 */
const buildPerRoomPricingFromHotelConfig = (
  config = {},
  peopleDetails = {},
  groupKey = "hotel",
) => {
  const roomOptions = mapRoomOptions(config);
  if (roomOptions.length === 0) return [];

  const mix =
    config?.mix && typeof config.mix === "object"
      ? config.mix
      : config?.roomMix && typeof config.roomMix === "object"
        ? config.roomMix
        : {};
  const assignments =
    config?.roomAssignments && typeof config.roomAssignments === "object"
      ? config.roomAssignments
      : {};
  const childPricing = config?.childPricing || {};
  const convertedMap = childPricing?.convertedChildToAdultMap || {};
  const nights = Math.max(
    1,
    positiveInteger(config?.nights) ||
      (Array.isArray(config?.dayIndices) ? config.dayIndices.length : 0) ||
      (Array.isArray(config?.selectedNightIndices)
        ? config.selectedNightIndices.length
        : 0),
  );

  const fallbackAdults = (peopleDetails?.adults || []).map(
    (passenger, index) => passenger?.passenger_key || `adult:${index + 1}`,
  );
  const fallbackChildren = (peopleDetails?.children || []).map(
    (passenger, index) => passenger?.passenger_key || `child:${index + 1}`,
  );
  const adultPassengerKeys = new Set(
    (peopleDetails?.adults || []).flatMap((passenger, index) => [
      String(passenger?.passenger_key || `adult:${index + 1}`),
      String(passenger?.id || ""),
      String(passenger?.id_pasajero || ""),
    ]).filter(Boolean),
  );
  const childPassengerKeys = new Set(
    (peopleDetails?.children || []).flatMap((passenger, index) => [
      String(passenger?.passenger_key || `child:${index + 1}`),
      String(passenger?.id || ""),
      String(passenger?.id_pasajero || ""),
    ]).filter(Boolean),
  );
  const isAdultPassenger = (id) =>
    adultPassengerKeys.has(String(id)) || String(id).startsWith("adult:");
  const isChildPassenger = (id) =>
    childPassengerKeys.has(String(id)) || String(id).startsWith("child:");
  const assignedIds = new Set();
  const slots = [];

  roomOptions.forEach((option, optionIndex) => {
    const count = Math.max(
      0,
      positiveInteger(mix?.[option?.key], option?.count, option?.cnt) || 0,
    );
    for (let roomIndex = 0; roomIndex < count; roomIndex += 1) {
      slots.push({
        option,
        optionIndex,
        roomIndex,
        slotId: `${option?.key || `room-${optionIndex + 1}`}:${roomIndex + 1}`,
        passengerIds: getAssignment(
          assignments,
          `${option?.key}:${roomIndex + 1}`,
          option?.key,
          roomIndex,
        ),
      });
    }
  });

  if (slots.length === 0) return [];

  slots.forEach((slot) => {
    slot.passengerIds.forEach((id) => assignedIds.add(String(id)));
  });

  const allocate = (ids = []) => {
    ids.forEach((id) => {
      if (assignedIds.has(String(id))) return;
      const target = slots.find(
        (slot) =>
          slot.passengerIds.length <
          Math.max(1, positiveInteger(slot.option?.capacity) || 1),
      );
      if (!target) return;
      target.passengerIds.push(id);
      assignedIds.add(String(id));
    });
  };

  allocate(fallbackAdults);
  allocate(fallbackChildren.filter((id) => convertedMap?.[id] === true));

  return normalizePerRoomPricing(
    slots.map((slot) => {
      const adultPassengerIds = slot.passengerIds.filter(isAdultPassenger);
      const convertedChildPassengerIds = slot.passengerIds.filter(
        isChildPassenger,
      );
      const beneficiaries = Math.max(1, slot.passengerIds.length);
      const unit = toMoneyNumber(
        slot.option?.pricePerRoomNight ??
          slot.option?.unit ??
          slot.option?.precio,
      );
      const hotelTotalRoom = round2(unit * nights);

      return {
        key: `${groupKey}-${slot.slotId}`,
        groupKey,
        label: slot.option?.label || slot.option?.key,
        capacity: positiveInteger(slot.option?.capacity) || 1,
        beneficiaries,
        adultBeneficiaries: adultPassengerIds.length,
        convertedChildBeneficiaries: convertedChildPassengerIds.length,
        passengerIds: slot.passengerIds,
        adultPassengerIds,
        convertedChildPassengerIds,
        hotelTotalRoom,
        hotelPerPerson: round2(hotelTotalRoom / beneficiaries),
      };
    }),
  );
};

const findArrayCandidate = (...candidates) =>
  candidates.find(
    (candidate) => Array.isArray(candidate) && candidate.length > 0,
  ) || [];

const getPerRoomPricing = ({ cotizacion, selectedHotel, days, peopleDetails }) => {
  const direct = findArrayCandidate(
    cotizacion?.perRoomPricing,
    cotizacion?.per_room_pricing,
    selectedHotel?.perRoomPricing,
  );
  if (direct.length > 0) return normalizePerRoomPricing(direct);

  const selectedCategoryRow = (selectedHotel?.allCategoryRows || []).find(
    (row) => row?.isSelected === true || row?.selected === true,
  );
  if (Array.isArray(selectedCategoryRow?.perRoomPricing)) {
    const normalized = normalizePerRoomPricing(
      selectedCategoryRow.perRoomPricing,
    );
    if (normalized.length > 0) return normalized;
  }

  const groups = Array.isArray(selectedHotel?.dayGroups)
    ? selectedHotel.dayGroups
    : [];
  const groupedDirect = groups.flatMap((group, index) =>
    normalizePerRoomPricing(group?.perRoomPricing || []).map((room) => ({
      ...room,
      groupKey: room?.groupKey || group?.id || `group-${index + 1}`,
      groupDayIndices: room?.groupDayIndices || group?.dayIndices || [],
    })),
  );
  if (groupedDirect.length > 0) return groupedDirect;

  const serviceCandidate = days
    .flatMap((day) => (Array.isArray(day?.servicios) ? day.servicios : []))
    .map((service) =>
      findArrayCandidate(
        service?.perRoomPricing,
        service?.hotelPerRoomPricing,
        service?.tariff?.perRoomPricing,
        service?.tariff?.hotelPerRoomPricing,
      ),
    )
    .find((candidate) => candidate.length > 0);
  if (serviceCandidate) return normalizePerRoomPricing(serviceCandidate);

  const rebuiltGroups = groups.flatMap((group, index) =>
    buildPerRoomPricingFromHotelConfig(
      {
        ...group,
        mix: group?.mix || group?.roomMix,
        nights:
          group?.nights ||
          (Array.isArray(group?.dayIndices) ? group.dayIndices.length : 0),
        childPricing: group?.childPricing || selectedHotel?.childPricing,
      },
      peopleDetails,
      group?.id || `group-${index + 1}`,
    ),
  );
  if (rebuiltGroups.length > 0) return rebuiltGroups;

  return buildPerRoomPricingFromHotelConfig(
    selectedHotel || {},
    peopleDetails,
    "selected-hotel",
  );
};

/**
 * Reconstruye el snapshot en memoria desde la cotización actual. No lee ni
 * requiere summaryVisibleParts guardado: las fuentes son itinerario_dia,
 * itinerario_servicio, configuración de adicionales/hotel y pasajeros.
 */
export const buildQuotationPricingSnapshotFromCotizacion = (cotizacion = {}) => {
  const days = normalizeDays(cotizacion?.itinerario || cotizacion?.dias || []);
  const externalDays = normalizeDays(
    cotizacion?.itinerario_externo ||
      cotizacion?.itinerarioExterno ||
      cotizacion?.externalItinerary ||
      cotizacion?.externalDays ||
      [],
  );
  const peopleDetails = buildQuotationPeopleDetails(cotizacion);
  const adultsCount = Math.max(
    1,
    positiveInteger(
      cotizacion?.peopleCount?.adults,
      cotizacion?.peoplecount?.adults,
      cotizacion?.num_adults,
      cotizacion?.numAdults,
      peopleDetails.adults.length,
      cotizacion?.cantidadpersonas,
      cotizacion?.cantidadPersonas,
    ) || 1,
  );
  const childrenCount = Math.max(
    0,
    positiveInteger(
      cotizacion?.peopleCount?.children,
      cotizacion?.peoplecount?.children,
      cotizacion?.num_children,
      cotizacion?.numChildren,
      peopleDetails.children.length,
    ),
  );
  const additionalCosts = getAdditionalCosts(cotizacion);
  const rawSelectedHotel =
    cotizacion?.selectedHotel || cotizacion?.selected_hotel || null;
  const selectedHotel = deriveSelectedHotelFromDays(
    days,
    cotizacion?.hotel_detalle || cotizacion?.hotelDetalle || null,
    normalizeSelectedHotelConfig(rawSelectedHotel),
  );
  const calculatedTotals = calculateGeneralTotalsDetailed(days, peopleDetails);
  const calculatedExternal = calculateExternalItineraryBreakdown(
    externalDays,
    peopleDetails,
  );

  const pickNumber = (...values) => {
    for (const value of values) {
      if (value === undefined || value === null || value === "") continue;
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  };

  // SummaryContent siempre privilegia los importes canónicos de la cotización
  // antes de recalcular el itinerario. Esto evita sumar nuevamente hotel o
  // servicios cuando el detalle ya fue normalizado al abrir el resumen.
  const subtotalIndividual = round2(
    pickNumber(
      cotizacion?.precio_it_adulto,
      cotizacion?.precioItAdulto,
      cotizacion?.subtotalIndividual,
      cotizacion?.subtotal_individual,
      cotizacion?.nonHotelsTotal,
      calculatedTotals?.totalPerPerson,
    ),
  );
  const canonicalChildServicePerPerson = resolveCanonicalChildServicePrice(
    cotizacion?.precio_it_ninos,
    cotizacion?.precioItNinos,
  );
  const hasStoredChildServicePrice = canonicalChildServicePerPerson !== null;
  const storedChildServicePerPerson = canonicalChildServicePerPerson ?? 0;
  const externalAdultTotal = round2(
    externalDays.length > 0
      ? calculatedExternal?.adultTotal
      : pickNumber(
          cotizacion?.precio_it_ext_adulto,
          cotizacion?.precioItExtAdulto,
          calculatedExternal?.adultTotal,
        ),
  );
  const externalChildTotal = round2(
    externalDays.length > 0
      ? calculatedExternal?.childTotal
      : pickNumber(
          cotizacion?.precio_it_ext_ninos,
          cotizacion?.precioItExtNinos,
          calculatedExternal?.childTotal,
        ),
  );
  const externalConvertedChildTotal = round2(
    pickNumber(calculatedExternal?.convertedChildTotal),
  );
  const unifiedChildExternal = round2(
    externalChildTotal + externalConvertedChildTotal,
  );

  const hotelConvertedChildTotal = round2(
    pickNumber(
      cotizacion?.hotelConvertedChildTotal,
      cotizacion?.hotel_converted_child_total,
      calculatedTotals?.hotelConvertedChildTotal,
    ),
  );
  const hotelChildTotal = round2(
    pickNumber(
      cotizacion?.hotelChildTotal,
      cotizacion?.hotel_child_total,
      calculatedTotals?.hotelChildrenTotal,
    ),
  );
  const hotelExplicitChildTotal = round2(
    pickNumber(
      cotizacion?.hotelExplicitChildTotal,
      cotizacion?.hotel_explicit_child_total,
      Math.max(0, hotelChildTotal - hotelConvertedChildTotal),
    ),
  );
  const nonHotelExplicitChildTotal = round2(
    pickNumber(
      cotizacion?.nonHotelExplicitChildTotal,
      cotizacion?.non_hotel_explicit_child_total,
      calculatedTotals?.baseExplicitChildTotal,
    ),
  );
  const nonHotelConvertedChildTotal = round2(
    pickNumber(
      cotizacion?.nonHotelConvertedChildTotal,
      cotizacion?.non_hotel_converted_child_total,
      calculatedTotals?.baseConvertedChildTotal,
    ),
  );

  const childSummary = resolveChildChargeSummary({
    childrenCount,
    baseExplicitChildCount: pickNumber(
      cotizacion?.baseExplicitChildCount,
      calculatedTotals?.baseExplicitChildCount,
    ),
    baseConvertedChildCount: pickNumber(
      cotizacion?.baseConvertedChildCount,
      calculatedTotals?.baseConvertedChildCount,
    ),
    hotelExplicitChildCount: pickNumber(
      cotizacion?.hotelExplicitChildCount,
      calculatedTotals?.hotelExplicitChildCount,
    ),
    hotelConvertedChildCount: pickNumber(
      cotizacion?.hotelConvertedChildCount,
      calculatedTotals?.hotelConvertedChildCount,
    ),
    nonHotelExplicitChildTotal,
    nonHotelConvertedChildTotal,
    hotelExplicitChildTotal,
    hotelConvertedChildTotal,
  });

  const rawPerRoomPricing = getPerRoomPricing({
    cotizacion,
    selectedHotel,
    days,
    peopleDetails,
  });
  const aggregatedPerRoomPricing =
    aggregatePerRoomPricingByStayGroup(rawPerRoomPricing);
  const perRoomPricing =
    aggregatedPerRoomPricing.length > 0
      ? aggregatedPerRoomPricing
      : rawPerRoomPricing;

  const adultParts = perRoomPricing
    .map((room, index) => {
      const beneficiaries = Math.max(
        0,
        Number(room?.adultBeneficiaries || room?.adultBeneficiaryCount || 0),
      );
      if (beneficiaries <= 0) return null;

      const hotel = round2(
        pickNumber(
          room?.hotelPerPerson,
          room?.value,
          room?.hotelBasePerPerson,
        ),
      );
      const base = round2(subtotalIndividual + hotel);
      const additional = calculateAdditionalCostForAudience(
        base,
        additionalCosts,
        "adult",
      );
      const total = round2(
        subtotalIndividual + hotel + additional.total + externalAdultTotal,
      );
      const label = normalizeRoomLabel(
        room?.label || room?.baseLabel || room?.roomLabel || "Adulto",
      );

      return {
        key: `summary-adult-${room?.key || index}`,
        label,
        roomLabel: label,
        audience: "adult",
        beneficiaries,
        capacity: positiveInteger(room?.capacity, room?.roomCapacity) || null,
        passengerIds: Array.isArray(room?.passengerIds)
          ? room.passengerIds
          : [],
        value: total,
        roundedValue: Math.ceil(total),
        displayValue: Math.ceil(total),
        // Keep the primitive breakdown together with the final price. SummaryContent,
        // the quotation list and PDF consumers can then render the same values
        // without reverse-engineering a total that already includes fee/external.
        services: subtotalIndividual,
        hotel,
        additional: round2(additional.total),
        operational: round2(additional.operational),
        fee: round2(additional.fee),
        contingency: round2(additional.extra),
        external: externalAdultTotal,
        commissionableValue: round2(total - externalAdultTotal),
        externalPerPerson: externalAdultTotal,
      };
    })
    .filter(Boolean);

  if (adultParts.length === 0 && adultsCount > 0) {
    const hotelPerAdult = round2(
      pickNumber(
        cotizacion?.hotelPerAdult,
        cotizacion?.hotel_per_adult,
        adultsCount > 0
          ? pickNumber(
              cotizacion?.hotelAdultTotal,
              cotizacion?.hotel_adult_total,
              calculatedTotals?.hotelAdultTotal,
            ) / adultsCount
          : 0,
      ),
    );
    const base = round2(subtotalIndividual + hotelPerAdult);
    const additional = calculateAdditionalCostForAudience(
      base,
      additionalCosts,
      "adult",
    );
    const total = round2(
      subtotalIndividual +
        hotelPerAdult +
        additional.total +
        externalAdultTotal,
    );
    adultParts.push({
      key: "summary-adult-no-room",
      label: hotelPerAdult > 0 ? "Adulto" : "Sin hotel",
      roomLabel: hotelPerAdult > 0 ? "Adulto" : "Sin hotel",
      audience: "adult",
      beneficiaries: adultsCount,
      value: total,
      roundedValue: Math.ceil(total),
      displayValue: Math.ceil(total),
      services: subtotalIndividual,
      hotel: hotelPerAdult,
      additional: round2(additional.total),
      operational: round2(additional.operational),
      fee: round2(additional.fee),
      contingency: round2(additional.extra),
      external: externalAdultTotal,
      commissionableValue: round2(total - externalAdultTotal),
      externalPerPerson: externalAdultTotal,
    });
  }

  const childRows = buildChildPricingRows({
    peopleDetails,
    childrenCount,
    additionalCosts,
    pricingSource: {
      ...cotizacion,
      nonHotelExplicitChildTotal,
      nonHotelConvertedChildTotal,
      hotelExplicitChildTotal,
      hotelConvertedChildTotal,
    },
    perRoomPricing,
    serviceFallbackPerChild: hasStoredChildServicePrice
      ? storedChildServicePerPerson
      : childSummary.nonHotelUnifiedPerChild,
    authoritativeServiceFallback: hasStoredChildServicePrice,
    hotelFallbackPerChild: childSummary.hotelUnifiedPerChild,
    externalPerChild: unifiedChildExternal,
    calculateAdditional: calculateAdditionalCostForAudience,
  });

  const childParts = childRows
    .map((row, index) => {
      const roomLabels = Array.isArray(row?.roomLabels)
        ? row.roomLabels.filter(Boolean)
        : [];
      const roomLabel = normalizeChildRoomLabel(roomLabels[0] || "");
      const hasHotelRoom = roomLabel !== "Sin hotel";
      const label = hasHotelRoom
        ? `${childrenCount === 1 ? "Niño" : "Niños"} ${roomLabel}`
        : row?.label || (childrenCount === 1 ? "Niño" : "Niños");
      const total = round2(row?.total);
      if (total <= 0 && !row?.isFree) return null;

      return {
        key: row?.key || `summary-child-${index + 1}`,
        label,
        roomLabel,
        audience: "child",
        beneficiaries: 1,
        value: total,
        roundedValue: Math.ceil(total),
        displayValue: Math.ceil(total),
        services: round2(row?.services),
        hotel: round2(row?.hotel),
        additional: round2(row?.additional?.total),
        operational: round2(row?.additional?.operational),
        fee: round2(row?.additional?.fee),
        contingency: round2(row?.additional?.extra),
        external: round2(row?.external ?? unifiedChildExternal),
        commissionableValue: round2(total - unifiedChildExternal),
        externalPerPerson: unifiedChildExternal,
        passengerIds: [
          row?.passenger?.passenger_key,
          row?.passenger?.id,
          row?.passenger?.id_pasajero,
        ].filter(Boolean),
        isFree: Boolean(row?.isFree),
      };
    })
    .filter(Boolean);

  const perPerson = groupEquivalentChildPricingParts([
    ...adultParts,
    ...childParts,
  ]).filter(
    (part) =>
      Number(part?.beneficiaries || 0) > 0 &&
      (Number(part?.displayValue || 0) > 0 || part?.isFree),
  );
  const grandTotal = perPerson.reduce(
    (sum, part) =>
      sum +
      Number(part?.displayValue || 0) *
        Math.max(1, Number(part?.beneficiaries || 1)),
    0,
  );
  const commissionableGrandTotal = perPerson.reduce(
    (sum, part) =>
      sum +
      Math.ceil(Math.max(0, Number(part?.commissionableValue || 0))) *
        Math.max(1, Number(part?.beneficiaries || 1)),
    0,
  );

  return {
    parts: perPerson,
    perPerson,
    adults: perPerson.filter((part) => part.audience === "adult"),
    children: perPerson.filter((part) => part.audience === "child"),
    grandTotal,
    commissionableGrandTotal,
    source: "summary-content-live",
  };
};
