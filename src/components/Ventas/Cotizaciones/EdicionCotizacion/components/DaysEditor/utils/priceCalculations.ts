import { getHotelRoomCapacity } from "../../../../../../../utils/hotelRoomTypes";
/**
 * Utility functions for price calculations in DaysEditor
 * Following Single Responsibility Principle
 */

import { detectServiceType } from "./serviceTypeMapper";
import { getTourCapacity } from "../../../utils/unifiedServiceManager";
import { getServicePricingSnapshot } from "../../../utils/servicePricingRuntime";
import { reconcilePricingSnapshotToPassengerRoster } from "../../../utils/passengerPricingReconciliation";

const round2 = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

const addAmountToMap = (target, key, amount) => {
  if (!key) return;
  target[key] = round2((target[key] || 0) + (Number(amount) || 0));
};

const mergeAmountMap = (target, source = {}) => {
  Object.entries(source || {}).forEach(([key, amount]) => {
    addAmountToMap(target, key, amount);
  });
};

const getPassengerGroupCount = (peopleDetails = {}, group = "adults") => {
  const direct = Array.isArray(peopleDetails?.[group]) ? peopleDetails[group] : [];
  if (direct.length > 0) return direct.length;

  const details = Array.isArray(peopleDetails?.details) ? peopleDetails.details : [];
  if (!details.length) return 0;

  const isChildGroup = group === "children";
  return details.filter((passenger) => {
    const type = String(
      passenger?.tipo_pasajero ||
        passenger?.tipoPasajero ||
        passenger?.passenger_type ||
        passenger?.type ||
        "",
    ).toLowerCase();
    const key = String(
      passenger?.passenger_key || passenger?.passengerKey || "",
    ).toLowerCase();
    const isChild = type === "child" || type.includes("nino") || key.startsWith("child");
    return isChildGroup ? isChild : !isChild;
  }).length;
};

const getAdultAverageDenominator = (peopleDetails, fallbackAdultIds = new Set()) => {
  const quoteAdultCount = getPassengerGroupCount(peopleDetails, "adults");
  if (quoteAdultCount > 0) return quoteAdultCount;
  if (fallbackAdultIds?.size > 0) return fallbackAdultIds.size;
  return 1;
};

/**
 * Validates if a service has the new unified structure
 * @param {Object} service - The service object to validate
 * @returns {boolean}
 */
export const validateServiceStructure = (service) => {
  return service?.parentService && service?.childService && service?.tariff;
};

/**
 * Gets room capacity using the shared Venso hotel-room catalog rules.
 */
export const getRoomCapacityByType = (roomOrType) =>
  getHotelRoomCapacity(roomOrType, 2);

/**
 * Gets the base price from a service object
 * @param {Object} service - Service object
 * @returns {number} Base price
 */
export const getServicePrice = (service) => {
  if (!service) return 0;
  if (validateServiceStructure(service)) {
    return getServicePricingSnapshot(service).total;
  }
  return parseFloat(service.precio || 0);
};

/**
 * Gets division counts for a service (passengers, children with explicit prices)
 * @param {Object} service - Service object
 * @param {number} fallbackTotal - Fallback total passengers
 * @returns {Object} Division counts
 */
export const getDivisionCountsForService = (service, fallbackTotal) => {
  const assignedIds = Array.isArray(service.assignedPassengerIds)
    ? service.assignedPassengerIds
    : null;

  const paxAssigned = assignedIds
    ? assignedIds.length
    : Math.max(1, fallbackTotal);

  const childMap = service.assignedChildExplicitPriceMap || {};
  const pricingMode =
    service?.pricingMode ||
    service?.passengerSelection?.pricingMode ||
    "percentage";
  const treatChildrenAsAdults =
    pricingMode === "adult" ||
    service?.treatChildrenAsAdults === true ||
    service?.passengerSelection?.treatChildrenAsAdults === true;
  const childIds = assignedIds
    ? assignedIds.filter((id) => String(id).startsWith("child:"))
    : [];
  let explicitChildCount = Object.values(childMap).filter(
    (v) => v != null && !isNaN(parseFloat(v)),
  ).length;

  if (
    !treatChildrenAsAdults &&
    pricingMode === "percentage" &&
    childIds.length > explicitChildCount
  ) {
    explicitChildCount = childIds.length;
  }

  const paxForDivision = Math.max(1, paxAssigned - explicitChildCount);

  const childExtrasTotal =
    Number(
      service.tariff?.childExtrasTotal ??
        service.assignedChildExplicitPriceSum ??
        0,
    ) || 0;

  return { paxAssigned, explicitChildCount, paxForDivision, childExtrasTotal };
};

/**
 * Calculates and applies divided price to a service based on its type
 * Respects per-service selection and children with explicit prices
 * @param {Object} service - Service object
 * @param {number} totalPassengers - Total passengers
 * @returns {Object} Service with divided price applied
 */
export const calculateAndSetDividedPrice = (service, totalPassengers) => {
  if (!service || !service.tariff) return service;

  // Avoid reprocessing if IGV already processed (hotel modal case)
  if (service.tariff.hasProcessedIGV) {
    return service;
  }

  // If service has pricingMode = 'percentage', already processed by createUnifiedService
  if (service.pricingMode === "percentage") {
    return service;
  }

  // If service has hasChildExplicitPrices = true, already processed
  if (service.hasChildExplicitPrices) {
    return service;
  }

  const basePrice =
    parseFloat(service.tariff.precio_original || service.tariff.precio) || 0;
  if (basePrice === 0) return service;

  // If already divided (precio ≠ precio_original), don't divide again
  const currentPrice = parseFloat(service.tariff.precio) || 0;
  const originalPrice = parseFloat(service.tariff.precio_original) || 0;
  if (originalPrice > 0 && currentPrice !== originalPrice) {
    return service;
  }

  const { paxForDivision } = getDivisionCountsForService(
    service,
    totalPassengers,
  );

  let dividedPrice = basePrice;
  const serviceType = detectServiceType(service);
  let shouldDivide = false;

  if (serviceType === "transportes" || serviceType === "guias") {
    dividedPrice = basePrice / paxForDivision;
    shouldDivide = true;
  } else if (serviceType === "endoses") {
    const tourCapacity = getTourCapacity(service);
    if (tourCapacity != null) {
      dividedPrice = basePrice / Math.max(1, tourCapacity);
      shouldDivide = true;
    } else {
      // Endose normal en Venso: la tarifa es por persona, no un total grupal.
      dividedPrice = basePrice;
      shouldDivide = false;
    }
  } else if (serviceType === "hoteles") {
    const tipoHabitacion =
      service.childService?.tipo_habitacion ||
      service.childService?.habitacion?.tipo_habitacion ||
      "";
    const roomCapacity = getRoomCapacityByType(tipoHabitacion);
    dividedPrice = basePrice / roomCapacity; // hotels always by capacity
    shouldDivide = true;
  } else if (
    serviceType === "trenes" ||
    serviceType === "vuelos" ||
    serviceType === "restaurantes" ||
    serviceType === "tickets"
  ) {
    dividedPrice = basePrice / paxForDivision;
    shouldDivide = true;
  } else if (serviceType === "extras") {
    dividedPrice = basePrice; // unitary
    shouldDivide = false;
  }

  return {
    ...service,
    tariff: {
      ...service.tariff,
      precio_original: basePrice, // preserve total base
      precio: shouldDivide ? Math.round(dividedPrice * 100) / 100 : basePrice,
      // Note: child extras are stored separately in childExtrasTotal
    },
  };
};

/**
 * Gets the capacity of a service based on its type
 * @param {Object} service - Service object
 * @param {string} serviceType - Type of service
 * @returns {number|null} Service capacity
 */
export const getServiceCapacity = (service, serviceType) => {
  if (!service) return null;

  switch (serviceType?.toLowerCase()) {
    case "hoteles":
    case "hotel": {
      const tipoHabitacion =
        service.childService?.tipo_habitacion ||
        service.serviceDetails?.tipo_habitacion ||
        service.tipo_habitacion;
      return getRoomCapacityByType(tipoHabitacion);
    }
    case "transportes":
    case "transporte":
      return (
        service.childService?.nro_pasajeros ||
        service.serviceDetails?.nro_pasajeros ||
        service.nro_pasajeros ||
        null
      );
    case "endoses":
    case "endose": {
      const capacidad = Number(
        service.childService?.capacidad ??
          service.childService?.tour?.capacidad ??
          service.serviceDetails?.capacidad ??
          service.capacidad ??
          0,
      );
      return capacidad >= 1 ? capacidad : null;
    }
    case "trenes":
    case "tren":
    case "vuelos":
    case "vuelo":
      return 1; // Per person pricing
    default:
      return null;
  }
};

/**
 * Groups services by type (trains vs others)
 * @param {Array} services - Services array
 * @param {Function} detectServiceTypeFn - Function to detect service type
 * @returns {Object} Grouped services
 */
export const groupServicesByType = (services = [], detectServiceTypeFn) => {
  const grouped = { trainServices: [], otherServices: [] };
  services.forEach((service, index) => {
    const serviceType = detectServiceTypeFn
      ? detectServiceTypeFn(service)
      : (
          service.parentService?.typeService ||
          service.typeService ||
          ""
        ).toLowerCase();
    if (serviceType === "trenes") {
      grouped.trainServices.push({ ...service, originalIndex: index });
    } else {
      grouped.otherServices.push({ ...service, originalIndex: index });
    }
  });
  return grouped;
};

/**
 * Calculate day subtotal with hotel separation (enhanced version)
 * @param {Array} services - Services array
 * @returns {Object} Detailed subtotals
 */
export const calculateDaySubtotalDetailed = (services = [], peopleDetails = null) => {
  if (!Array.isArray(services)) {
    return {
      subtotalPerPerson: 0,
      totalSubtotal: 0,
      totalWithHotels: 0,
      totalIGV: 0,
      hotelsTotal: 0,
      hotelsTotalIndividual: 0,
      hotelAdultTotal: 0,
      hotelChildrenTotal: 0,
      subtotalNinos: 0,
      baseSubtotalNinos: 0,
      footerSubtotalNinos: 0,
      baseFooterChildChargeCount: 0,
      hotelFooterChildChargeCount: 0,
      footerChildChargeCount: 0,
      baseExplicitChildTotal: 0,
      baseExplicitChildCount: 0,
      baseConvertedChildTotal: 0,
      baseConvertedChildCount: 0,
      hotelExplicitChildCount: 0,
      hotelConvertedChildTotal: 0,
      hotelConvertedChildCount: 0,
      baseExplicitChildTotalsById: {},
      baseConvertedChildTotalsById: {},
      hotelExplicitChildTotalsById: {},
      hotelConvertedChildTotalsById: {},
      baseAdultCount: 0,
      hotelAdultCount: 0,
    };
  }

  let subtotalPerPerson = 0;
  let totalSubtotal = 0;
  let totalIGV = 0;
  let hotelsTotal = 0;
  let hotelsTotalIndividual = 0;
  let baseAdultTotal = 0;
  let hotelAdultTotal = 0;
  let hotelChildrenTotal = 0;
  let subtotalNinos = 0;
  let baseSubtotalNinos = 0;
  let footerSubtotalNinos = 0;
  let footerChildChargeCount = 0;
  // Accumulators for explicit (non-converted) and converted-to-adult children separately
  let baseExplicitChildTotal = 0;
  let baseConvertedChildTotal = 0;
  let hotelConvertedChildTotal = 0;
  let hasStudentTicketChildPricing = false;

  // Use Sets to count UNIQUE children across services (not sum per-service slots)
  const uniqueBaseChildIds = new Set();
  const uniqueHotelChildIds = new Set();
  const uniqueBaseExplicitChildIds = new Set();
  const uniqueBaseConvertedChildIds = new Set();
  const uniqueHotelExplicitChildIds = new Set();
  const uniqueHotelConvertedChildIds = new Set();
  // Unique adults (real adults, not converted children)
  const uniqueBaseAdultIds = new Set();
  const uniqueHotelAdultIds = new Set();
  const baseAdultTotalsById = {};
  const hotelAdultTotalsById = {};
  const baseExplicitChildTotalsById = {};
  const baseConvertedChildTotalsById = {};
  const hotelExplicitChildTotalsById = {};
  const hotelConvertedChildTotalsById = {};

  services.forEach((service) => {
    const pricing = getServicePricingSnapshot(service);
    const reconciledPricing = reconcilePricingSnapshotToPassengerRoster(
      pricing,
      peopleDetails,
    );
    const precioPersona = pricing.precioAdult;
    const explicitChildEntries = reconciledPricing.explicitChildEntries;
    const convertedChildEntries = reconciledPricing.convertedChildEntries;
    const explicitChildIds = explicitChildEntries.map(([childId]) => childId);
    const convertedChildIds = convertedChildEntries.map(([childId]) => childId);
    const assignedAdultIds = pricing.actualAdultIds;
    const precioOriginalEfectivo = pricing.total;
    const commercialEffectiveTotal = round2(
      reconciledPricing.amountPerAdult + reconciledPricing.amountPerChild,
    );
    const isHotel = pricing.isHotel;

    if (pricing.isTicketStudentTariff && convertedChildEntries.length > 0) {
      hasStudentTicketChildPricing = true;
    }

    if (isHotel) {
      hotelsTotal += precioOriginalEfectivo;
      hotelsTotalIndividual += precioPersona;
      hotelAdultTotal += reconciledPricing.amountPerAdult;
      hotelChildrenTotal += reconciledPricing.amountPerChild;

      assignedAdultIds.forEach((id) => {
        uniqueHotelAdultIds.add(id);
        addAmountToMap(hotelAdultTotalsById, id, precioPersona);
      });
      explicitChildIds.forEach((id) => {
        uniqueHotelChildIds.add(id);
        uniqueHotelExplicitChildIds.add(id);
        addAmountToMap(
          hotelExplicitChildTotalsById,
          id,
          explicitChildEntries.find(([childId]) => childId === id)?.[1]?.amount,
        );
      });
      convertedChildIds.forEach((id) => {
        uniqueHotelChildIds.add(id);
        uniqueHotelConvertedChildIds.add(id);
        addAmountToMap(
          hotelConvertedChildTotalsById,
          id,
          convertedChildEntries.find(([childId]) => childId === id)?.[1]?.amount,
        );
      });
      hotelConvertedChildTotal += convertedChildEntries.reduce(
        (sum, [, childData]) => sum + (Number(childData?.amount) || 0),
        0,
      );
    } else {
      baseAdultTotal += reconciledPricing.amountPerAdult;
      if (commercialEffectiveTotal > 0) {
        totalSubtotal += commercialEffectiveTotal;
      }
      baseSubtotalNinos += reconciledPricing.amountPerChild;

      assignedAdultIds.forEach((id) => {
        uniqueBaseAdultIds.add(id);
        addAmountToMap(baseAdultTotalsById, id, precioPersona);
      });

      explicitChildIds.forEach((id) => {
        uniqueBaseChildIds.add(id);
        uniqueBaseExplicitChildIds.add(id);
        addAmountToMap(
          baseExplicitChildTotalsById,
          id,
          explicitChildEntries.find(([childId]) => childId === id)?.[1]?.amount,
        );
      });
      convertedChildIds.forEach((id) => {
        uniqueBaseChildIds.add(id);
        uniqueBaseConvertedChildIds.add(id);
        addAmountToMap(
          baseConvertedChildTotalsById,
          id,
          convertedChildEntries.find(([childId]) => childId === id)?.[1]?.amount,
        );
      });

      baseExplicitChildTotal += explicitChildEntries.reduce(
        (sum, [, childData]) => sum + (Number(childData?.amount) || 0),
        0,
      );
      baseConvertedChildTotal += convertedChildEntries.reduce(
        (sum, [, childData]) => sum + (Number(childData?.amount) || 0),
        0,
      );
    }

    subtotalNinos += reconciledPricing.amountPerChild;

    if (service.tariff?.tieneIgv) {
      const explicitIgvAmount = parseFloat(service.tariff?.igvAmount);
      const igvAmount = Number.isFinite(explicitIgvAmount)
        ? explicitIgvAmount
        : parseFloat(
            service.tariff?.precio_original || service.tariff?.precio || 0,
          ) * 0.18;
      totalIGV += igvAmount;
    }
  });

  // Fix floating-point drift in hotel adult/child split.
  // Per-night rounded values (e.g. round2(80/3) = 26.67) accumulate a
  // small excess/deficit across many nights. Recompute the split from
  // the exact hotelsTotal (which sums exact room prices) so the parts
  // always add up precisely.
  if (hotelsTotal > 0 && uniqueHotelConvertedChildIds.size > 0 && uniqueHotelExplicitChildIds.size > 0) {
    const equivCount =
      uniqueHotelAdultIds.size + uniqueHotelConvertedChildIds.size;
    if (equivCount > 0) {
      const explicitChildPart = round2(
        hotelChildrenTotal - hotelConvertedChildTotal,
      );
      const roomBase = round2(hotelsTotal - explicitChildPart);
      hotelConvertedChildTotal = round2(
        (roomBase * uniqueHotelConvertedChildIds.size) / equivCount,
      );
      hotelAdultTotal = round2(roomBase - hotelConvertedChildTotal);
      hotelChildrenTotal = round2(explicitChildPart + hotelConvertedChildTotal);

      const convertedPerChild = round2(
        hotelConvertedChildTotal / uniqueHotelConvertedChildIds.size,
      );
      uniqueHotelConvertedChildIds.forEach((id) => {
        hotelConvertedChildTotalsById[id] = convertedPerChild;
      });
    }
  }

  const baseFooterChildChargeCount = uniqueBaseChildIds.size;
  const hotelFooterChildChargeCount = uniqueHotelChildIds.size;
  footerSubtotalNinos = baseSubtotalNinos + hotelChildrenTotal;
  footerChildChargeCount =
    baseFooterChildChargeCount + hotelFooterChildChargeCount;

  const mappedBaseAdultTotal = Object.values(baseAdultTotalsById).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0,
  );
  if (mappedBaseAdultTotal > 0) {
    baseAdultTotal = mappedBaseAdultTotal;
  }

  const baseAdultDenominator = getAdultAverageDenominator(
    peopleDetails,
    uniqueBaseAdultIds,
  );
  subtotalPerPerson = baseAdultTotal > 0 ? baseAdultTotal / baseAdultDenominator : 0;

  const quoteChildrenCount = getPassengerGroupCount(peopleDetails, "children");
  if (
    quoteChildrenCount > 0 &&
    uniqueBaseConvertedChildIds.size >= quoteChildrenCount &&
    uniqueBaseExplicitChildIds.size === 0 &&
    subtotalPerPerson > 0 &&
    !hasStudentTicketChildPricing
  ) {
    baseConvertedChildTotal = round2(subtotalPerPerson * quoteChildrenCount);
    uniqueBaseConvertedChildIds.forEach((id) => {
      baseConvertedChildTotalsById[id] = round2(subtotalPerPerson);
    });
    subtotalNinos = round2(baseConvertedChildTotal + hotelChildrenTotal);
    baseSubtotalNinos = round2(baseConvertedChildTotal);
    footerSubtotalNinos = round2(baseSubtotalNinos + hotelChildrenTotal);
  }

  return {
    subtotalPerPerson: round2(subtotalPerPerson),
    totalSubtotal: round2(totalSubtotal),
    totalWithHotels: round2(totalSubtotal + hotelsTotal),
    totalIGV: round2(totalIGV),
    hotelsTotal: round2(hotelsTotal),
    hotelsTotalIndividual: round2(hotelsTotalIndividual),
    baseAdultTotal: round2(baseAdultTotal),
    hotelAdultTotal: round2(hotelAdultTotal),
    hotelChildrenTotal: round2(hotelChildrenTotal),
    subtotalNinos: round2(subtotalNinos),
    baseSubtotalNinos: round2(baseSubtotalNinos),
    footerSubtotalNinos: round2(footerSubtotalNinos),
    baseFooterChildChargeCount,
    hotelFooterChildChargeCount,
    footerChildChargeCount,
    // Separate explicit-child vs converted-to-adult breakdown
    baseExplicitChildTotal: round2(baseExplicitChildTotal),
    baseExplicitChildCount: uniqueBaseExplicitChildIds.size,
    baseConvertedChildTotal: round2(baseConvertedChildTotal),
    baseConvertedChildCount: uniqueBaseConvertedChildIds.size,
    hotelExplicitChildCount: uniqueHotelExplicitChildIds.size,
    hotelConvertedChildTotal: round2(hotelConvertedChildTotal),
    hotelConvertedChildCount: uniqueHotelConvertedChildIds.size,
    hasStudentTicketChildPricing,
    baseAdultTotalsById,
    hotelAdultTotalsById,
    baseExplicitChildTotalsById,
    baseConvertedChildTotalsById,
    hotelExplicitChildTotalsById,
    hotelConvertedChildTotalsById,
    // Unique real-adult counts per section
    baseAdultCount: uniqueBaseAdultIds.size,
    hotelAdultCount: uniqueHotelAdultIds.size,
  };
};

/**
 * Calculate general totals from all days (enhanced version)
 * @param {Array} days - Days array
 * @returns {Object} Detailed totals
 */
export const calculateGeneralTotalsDetailed = (days = [], peopleDetails = null) => {
  let totalPerPerson = 0;
  let grandTotal = 0;
  let totalIGV = 0;
  let hotelsTotal = 0;
  let hotelsTotalIndividual = 0;
  let hotelAdultTotal = 0;
  let hotelChildrenTotal = 0;
  let hotelConvertedChildTotal = 0;
  let subtotalNinos = 0;
  let baseAdultTotal = 0;
  let baseExplicitChildTotal = 0;
  let baseConvertedChildTotal = 0;
  let hasStudentTicketChildPricing = false;

  // Global Sets to track unique passengers across ALL days (avoids double-counting)
  const globalBaseExplicitChildIds = new Set();
  const globalBaseConvertedChildIds = new Set();
  const globalHotelExplicitChildIds = new Set();
  const globalHotelConvertedChildIds = new Set();
  const globalBaseAdultIds = new Set();
  const globalHotelAdultIds = new Set();
  const baseAdultTotalsById = {};
  const hotelAdultTotalsById = {};
  const baseExplicitChildTotalsById = {};
  const baseConvertedChildTotalsById = {};
  const hotelExplicitChildTotalsById = {};
  const hotelConvertedChildTotalsById = {};

  days.forEach((day) => {
    const services = day.servicios || [];
    const dayTotals = calculateDaySubtotalDetailed(services, peopleDetails);
    baseAdultTotal += dayTotals.baseAdultTotal || 0;
    grandTotal += dayTotals.totalSubtotal;
    totalIGV += dayTotals.totalIGV;
    hotelsTotal += dayTotals.hotelsTotal;
    hotelsTotalIndividual += dayTotals.hotelsTotalIndividual;
    hotelAdultTotal += dayTotals.hotelAdultTotal || 0;
    hotelChildrenTotal += dayTotals.hotelChildrenTotal || 0;
    hotelConvertedChildTotal += dayTotals.hotelConvertedChildTotal || 0;
    subtotalNinos += dayTotals.subtotalNinos || 0;
    baseExplicitChildTotal += dayTotals.baseExplicitChildTotal || 0;
    baseConvertedChildTotal += dayTotals.baseConvertedChildTotal || 0;
    hasStudentTicketChildPricing =
      hasStudentTicketChildPricing || Boolean(dayTotals.hasStudentTicketChildPricing);
    mergeAmountMap(baseAdultTotalsById, dayTotals.baseAdultTotalsById);
    mergeAmountMap(hotelAdultTotalsById, dayTotals.hotelAdultTotalsById);
    mergeAmountMap(
      baseExplicitChildTotalsById,
      dayTotals.baseExplicitChildTotalsById,
    );
    mergeAmountMap(
      baseConvertedChildTotalsById,
      dayTotals.baseConvertedChildTotalsById,
    );
    mergeAmountMap(
      hotelExplicitChildTotalsById,
      dayTotals.hotelExplicitChildTotalsById,
    );
    mergeAmountMap(
      hotelConvertedChildTotalsById,
      dayTotals.hotelConvertedChildTotalsById,
    );

    // Global cohorts use the reconciled day snapshot so stale post-sale child
    // IDs cannot be resurrected by historical service snapshots.
    Object.keys(dayTotals.baseAdultTotalsById || {}).forEach((id) =>
      globalBaseAdultIds.add(id),
    );
    Object.keys(dayTotals.hotelAdultTotalsById || {}).forEach((id) =>
      globalHotelAdultIds.add(id),
    );
    Object.keys(dayTotals.baseExplicitChildTotalsById || {}).forEach((id) =>
      globalBaseExplicitChildIds.add(id),
    );
    Object.keys(dayTotals.baseConvertedChildTotalsById || {}).forEach((id) =>
      globalBaseConvertedChildIds.add(id),
    );
    Object.keys(dayTotals.hotelExplicitChildTotalsById || {}).forEach((id) =>
      globalHotelExplicitChildIds.add(id),
    );
    Object.keys(dayTotals.hotelConvertedChildTotalsById || {}).forEach((id) =>
      globalHotelConvertedChildIds.add(id),
    );
  });

  // Fix floating-point drift at the cross-day level (same logic as per-day).
  if (hotelsTotal > 0 && globalHotelConvertedChildIds.size > 0) {
    const equivCount =
      globalHotelAdultIds.size + globalHotelConvertedChildIds.size;
    if (equivCount > 0) {
      const explicitChildPart = round2(
        hotelChildrenTotal - hotelConvertedChildTotal,
      );
      const roomBase = round2(hotelsTotal - explicitChildPart);
      hotelConvertedChildTotal = round2(
        (roomBase * globalHotelConvertedChildIds.size) / equivCount,
      );
      hotelAdultTotal = round2(roomBase - hotelConvertedChildTotal);
      hotelChildrenTotal = round2(explicitChildPart + hotelConvertedChildTotal);

      const convertedPerChild = round2(
        hotelConvertedChildTotal / globalHotelConvertedChildIds.size,
      );
      globalHotelConvertedChildIds.forEach((id) => {
        hotelConvertedChildTotalsById[id] = convertedPerChild;
      });
    }
  }

  const mappedBaseAdultTotal = Object.values(baseAdultTotalsById).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0,
  );
  if (mappedBaseAdultTotal > 0) {
    baseAdultTotal = mappedBaseAdultTotal;
  }

  const baseAdultDenominator = getAdultAverageDenominator(
    peopleDetails,
    globalBaseAdultIds,
  );
  totalPerPerson = baseAdultTotal > 0 ? baseAdultTotal / baseAdultDenominator : 0;

  const quoteChildrenCount = getPassengerGroupCount(peopleDetails, "children");
  if (
    quoteChildrenCount > 0 &&
    globalBaseConvertedChildIds.size >= quoteChildrenCount &&
    globalBaseExplicitChildIds.size === 0 &&
    totalPerPerson > 0 &&
    !hasStudentTicketChildPricing
  ) {
    baseConvertedChildTotal = round2(totalPerPerson * quoteChildrenCount);
    globalBaseConvertedChildIds.forEach((id) => {
      baseConvertedChildTotalsById[id] = round2(totalPerPerson);
    });
    subtotalNinos = round2(baseConvertedChildTotal + hotelChildrenTotal);
  }

  return {
    totalPerPerson: round2(totalPerPerson),
    subtotalIndividual: round2(totalPerPerson),
    grandTotal: round2(grandTotal),
    totalIGV: round2(totalIGV),
    hotelsTotal: round2(hotelsTotal),
    hotelsTotalIndividual: round2(hotelsTotalIndividual),
    hotelAdultTotal: round2(hotelAdultTotal),
    hotelChildrenTotal: round2(hotelChildrenTotal),
    hotelConvertedChildTotal: round2(hotelConvertedChildTotal),
    subtotalNinos: round2(subtotalNinos),
    baseAdultTotal: round2(baseAdultTotal),
    baseExplicitChildTotal: round2(baseExplicitChildTotal),
    baseConvertedChildTotal: round2(baseConvertedChildTotal),
    // Unique counts across all days
    baseExplicitChildCount: globalBaseExplicitChildIds.size,
    baseConvertedChildCount: globalBaseConvertedChildIds.size,
    hotelExplicitChildCount: globalHotelExplicitChildIds.size,
    hotelConvertedChildCount: globalHotelConvertedChildIds.size,
    baseExplicitChildTotalsById,
    baseConvertedChildTotalsById,
    hotelExplicitChildTotalsById,
    hotelConvertedChildTotalsById,
    baseAdultCount: globalBaseAdultIds.size,
    hotelAdultCount: globalHotelAdultIds.size,
  };
};
