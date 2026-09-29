/**
 * Utility functions for ReservaServiceEditor
 * Pure functions with no React dependencies
 */

import { getRoomCapacityByType } from "../../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/utils/priceCalculations";
import { getTourCapacity } from "../../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/unifiedServiceManager";
import {
  buildRuntimePassengerSelection,
  getPassengerSlotKey,
  getServicePassengerPricingState,
  mergePassengerPricingIntoTariff,
} from "../../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/passengerPricingState";

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const isChildPassengerId = (value) =>
  typeof value === "string" && value.startsWith("child:");
const isAdultPassengerId = (value) =>
  typeof value === "string" && value.startsWith("adult:");

const normalizeChildPriceMap = (childIds = [], childPriceMap = {}) =>
  childIds.reduce((accumulator, childId) => {
    const parsedValue = parseFloat(childPriceMap?.[childId]);
    if (Number.isFinite(parsedValue)) {
      accumulator[childId] = round2(parsedValue);
    }
    return accumulator;
  }, {});

const hasSelectedChildSlot = (selectedChildSlots, candidate) =>
  typeof candidate === "string" &&
  candidate.startsWith("child:") &&
  selectedChildSlots.has(getPassengerSlotKey(candidate));

/**
 * Conserva solo la parte operativa de una asignación que sigue beneficiándose
 * del servicio. Esta función no agrega pasajeros: la interfaz únicamente
 * puede retirar personas que ya estaban asignadas por la cotización.
 *
 * Al quitar un niño también se eliminan sus reglas de precio/conversión; de
 * ese modo los JSON assigned_beneficiarios_* y el total nunca quedan con
 * referencias a un beneficiario que ya no participa.
 */
export const selectAssignedBeneficiaries = (
  passengerSelection = {},
  selectedIds = [],
) => {
  const originalIds = Array.isArray(passengerSelection?.selectedIds)
    ? passengerSelection.selectedIds.filter(Boolean)
    : [];
  const selectableIds = new Set(originalIds);
  const nextSelectedIds = Array.from(
    new Set(
      (Array.isArray(selectedIds) ? selectedIds : []).filter(
        (id) => selectableIds.has(id),
      ),
    ),
  );
  const selectedChildSlots = new Set(
    nextSelectedIds
      .filter(isChildPassengerId)
      .map((childId) => getPassengerSlotKey(childId)),
  );
  const pruneChildMap = (source = {}) =>
    Object.entries(source || {}).reduce((next, [key, value]) => {
      const childReference = isChildPassengerId(key)
        ? key
        : typeof value === "string" && isChildPassengerId(value)
          ? value
          : null;
      if (
        childReference &&
        hasSelectedChildSlot(selectedChildSlots, childReference)
      ) {
        next[key] = value;
      }
      return next;
    }, {});

  const convertedChildToAdultMap = pruneChildMap(
    passengerSelection?.convertedChildToAdultMap ||
      passengerSelection?.ninosComoAdulto ||
      {},
  );
  const convertedChildSlots = new Set(
    Object.entries(convertedChildToAdultMap).flatMap(([key, value]) => {
      if (isChildPassengerId(key)) return [getPassengerSlotKey(key)];
      if (typeof value === "string" && isChildPassengerId(value)) {
        return [getPassengerSlotKey(value)];
      }
      return [];
    }),
  );
  const pruneExplicitChildPricing = (source = {}) =>
    Object.entries(pruneChildMap(source)).reduce((next, [key, value]) => {
      if (
        !isChildPassengerId(key) ||
        !convertedChildSlots.has(getPassengerSlotKey(key))
      ) {
        next[key] = value;
      }
      return next;
    }, {});
  const assignedChildExplicitPriceMap = pruneExplicitChildPricing(
    passengerSelection?.assignedChildExplicitPriceMap ||
      passengerSelection?.preciosNinos ||
      {},
  );
  const childPercentageMap = pruneExplicitChildPricing(
    passengerSelection?.childPercentageMap || {},
  );

  return {
    ...passengerSelection,
    selectedIds: nextSelectedIds,
    assignedPassengerCount: nextSelectedIds.length,
    assignedChildExplicitPriceMap,
    assignedChildExplicitPriceSum: round2(
      Object.values(assignedChildExplicitPriceMap).reduce(
        (total, price) => total + (parseFloat(price) || 0),
        0,
      ),
    ),
    assignedChildExplicitCount: Object.keys(assignedChildExplicitPriceMap)
      .length,
    childPercentageMap,
    convertedChildToAdultMap,
    treatChildrenAsAdults:
      selectedChildSlots.size > 0 &&
      Array.from(selectedChildSlots).every((slot) =>
        Object.entries(convertedChildToAdultMap).some(([key, value]) =>
          hasSelectedChildSlot(new Set([slot]), key) ||
          hasSelectedChildSlot(new Set([slot]), value),
        ),
      ),
  };
};

const getTransportEffectiveDivisor = (divisor, childService = {}) => {
  // Igual que en EdicionCotizacion/unifiedServiceManager:
  // en transportes, nro_pasajeros representa capacidad máxima/control de conflicto,
  // no el divisor económico. El precio se divide entre los beneficiarios cobrables.
  return Math.max(1, Number(divisor) || 1);
};

/**
 * Calcula la fecha de un día dado el inicio del itinerario
 */
export const calculateDayDate = (startDate, dayIndex) => {
  if (!startDate) return null;
  const date = new Date(startDate);
  const localDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
  localDate.setDate(localDate.getDate() + dayIndex);
  return localDate;
};

/**
 * Formatear fecha para mostrar (ej: "lunes, 5 de enero de 2026")
 */
export const formatDate = (date) => {
  if (!date) return "";
  const options = {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  };
  return date.toLocaleDateString("es-ES", options);
};

/**
 * Construir array de pasajeros desde peopleDetails
 */
export const buildPassengersFromPeopleDetails = (peopleDetails) => {
  if (!peopleDetails) return [];
  if (Array.isArray(peopleDetails.details)) return peopleDetails.details;
  if (
    Array.isArray(peopleDetails.adults) ||
    Array.isArray(peopleDetails.children)
  ) {
    return [...(peopleDetails.adults || []), ...(peopleDetails.children || [])];
  }
  return [];
};

/**
 * Desglose de tarifas: Adultos / Niños / Total
 */
export const getTariffBreakdown = (tariff = {}, passengerSelection = {}) => {
  if (!tariff) {
    return {
      hasAdults: false,
      hasChildren: false,
      adultsCount: 0,
      childrenCount: 0,
      adultUnitPrice: 0,
      childUnitPrice: 0,
      adultsSubtotal: 0,
      childrenSubtotal: 0,
      total: 0,
    };
  }

  const totalPassengers = passengerSelection?.assignedPassengerCount ?? 0;

  let childrenCount = 0;
  if (typeof passengerSelection?.assignedChildExplicitCount === "number") {
    childrenCount = passengerSelection.assignedChildExplicitCount;
  } else if (Array.isArray(passengerSelection?.selectedIds)) {
    childrenCount = passengerSelection.selectedIds.filter(
      (id) => typeof id === "string" && id.startsWith("child:"),
    ).length;
  }

  const adultsCount =
    totalPassengers > 0 ? Math.max(totalPassengers - childrenCount, 0) : 0;
  const adultUnitPrice =
    tariff.precio != null ? parseFloat(tariff.precio) : null;

  const childrenExtrasTotal =
    tariff.childExtrasTotal != null
      ? parseFloat(tariff.childExtrasTotal)
      : passengerSelection?.assignedChildExplicitPriceSum != null
        ? parseFloat(passengerSelection.assignedChildExplicitPriceSum)
        : 0;

  const adultsSubtotal =
    adultUnitPrice != null && adultsCount > 0
      ? adultUnitPrice * adultsCount
      : 0;
  const childrenSubtotal = childrenCount > 0 ? childrenExtrasTotal : 0;
  const childUnitPrice =
    childrenCount > 0 && childrenSubtotal > 0
      ? childrenSubtotal / childrenCount
      : null;

  const baseTotal = parseFloat(
    tariff.precio_original_with_child_extras ??
      tariff.precio_original ??
      tariff.precio ??
      0,
  );
  const total = baseTotal || adultsSubtotal + childrenSubtotal;

  return {
    hasAdults: adultsCount > 0 && adultUnitPrice != null,
    hasChildren: childrenCount > 0 && childUnitPrice != null,
    adultsCount,
    childrenCount,
    adultUnitPrice,
    childUnitPrice,
    adultsSubtotal,
    childrenSubtotal,
    total,
  };
};

/**
 * Obtiene la selección de pasajeros efectiva para un servicio asignado.
 */
export const getAssignedPassengerSelectionForService = (service = {}) => {
  const baseSelection =
    service.assignedService?.assignedPassengerSelection ||
    service.assignedService?.passengerSelection ||
    service.assignedPassengerSelection ||
    service.assignedTariff?.assignedPassengerSelection ||
    service.assignedTariff?.passengerSelection ||
    service.passengerSelection ||
    {};

  const pricingCarrier = {
    ...service,
    beneficiariosAdultos:
      service.assignedService?.assignedBeneficiariosAdultos ||
      service.assignedService?.beneficiariosAdultos ||
      service.assignedBeneficiariosAdultos ||
      service.assigned_beneficiarios_adultos ||
      service.beneficiariosAdultos,
    beneficiariosNinos:
      service.assignedService?.assignedBeneficiariosNinos ||
      service.assignedService?.beneficiariosNinos ||
      service.assignedBeneficiariosNinos ||
      service.assigned_beneficiarios_ninos ||
      service.beneficiariosNinos,
    tariff:
      service.assignedService?.tariff ||
      service.assignedTariff ||
      service.tariff ||
      {},
    passengerSelection: baseSelection,
    assignedPassengerIds:
      service.assignedService?.assignedPassengerIds ||
      service.assignedPassengerIds ||
      service.assigned_passenger_ids ||
      service.assignedService?.passengerSelection?.selectedIds,
    assignedPassengerCount:
      service.assignedService?.assignedPassengerCount ||
      service.assignedService?.assignedPassengerSelection
        ?.assignedPassengerCount ||
      service.assignedPassengerCount ||
      service.assigned_passenger_count ||
      service.assignedService?.passengerSelection?.assignedPassengerCount,
    assignedChildExplicitPriceMap:
      service.assignedService?.assignedChildExplicitPriceMap ||
      service.assignedService?.assignedPassengerSelection
        ?.assignedChildExplicitPriceMap ||
      service.assignedChildExplicitPriceMap ||
      service.assignedService?.passengerSelection
        ?.assignedChildExplicitPriceMap,
    assignedChildExplicitPriceSum:
      service.assignedService?.assignedChildExplicitPriceSum ||
      service.assignedService?.assignedPassengerSelection
        ?.assignedChildExplicitPriceSum ||
      service.assignedChildExplicitPriceSum ||
      service.assignedService?.passengerSelection
        ?.assignedChildExplicitPriceSum,
    assignedChildExplicitCount:
      service.assignedService?.assignedChildExplicitCount ||
      service.assignedService?.assignedPassengerSelection
        ?.assignedChildExplicitCount ||
      service.assignedChildExplicitCount ||
      service.assignedService?.passengerSelection?.assignedChildExplicitCount,
    pricingMode: service.assignedService?.pricingMode || service.pricingMode,
    childPercentageMap:
      service.assignedService?.childPercentageMap || service.childPercentageMap,
    uniformPercentage:
      service.assignedService?.uniformPercentage || service.uniformPercentage,
    treatChildrenAsAdults:
      service.assignedService?.treatChildrenAsAdults ||
      service.treatChildrenAsAdults,
    convertedChildToAdultMap:
      service.assignedService?.convertedChildToAdultMap ||
      service.assignedService?.assignedPassengerSelection
        ?.convertedChildToAdultMap ||
      service.assignedService?.passengerSelection?.convertedChildToAdultMap ||
      service.convertedChildToAdultMap,
  };

  return buildRuntimePassengerSelection(
    baseSelection,
    getServicePassengerPricingState(pricingCarrier, baseSelection),
  );
};

/**
 * Detecta si el voucher/cotización tiene niños en peopleDetails, incluyendo formatos legacy.
 */
export const hasChildrenInPeopleDetails = (peopleDetails = {}) => {
  if (
    Array.isArray(peopleDetails?.children) &&
    peopleDetails.children.length > 0
  ) {
    return true;
  }

  if (Array.isArray(peopleDetails?.details)) {
    return peopleDetails.details.some((person) => {
      const passengerType = String(
        person?.type ||
          person?.tipo ||
          person?.tipo_pasajero ||
          person?.tipoPasajero ||
          "",
      ).toLowerCase();

      if (
        passengerType.includes("child") ||
        passengerType.includes("niñ") ||
        passengerType.includes("menor")
      ) {
        return true;
      }

      const age = Number(person?.age ?? person?.edad);
      return Number.isFinite(age) && age >= 0 && age < 18;
    });
  }

  return false;
};

/**
 * Recalcula la tarifa asignada en reservas reutilizando getDivisionCountsForService
 * (la misma lógica de divisor que usan las cotizaciones en DaysEditor/SortableService).
 * - precio: precio por persona (unitario)
 * - precio_original: precio total base (adultos)
 */
export const syncTariffWithReservationPricing = ({
  tariff = {},
  serviceType = "",
  childService = {},
  passengerSelection = {},
  unitPrice = 0,
  fallbackTotal = 1,
  precioAdultoDividido = undefined,
  preserveGroupedTotal = false,
}) => {
  // Normalize to handle both new lean format (preciosNinos/ninosComoAdulto)
  // and legacy fat format (assignedChildExplicitPriceMap/convertedChildToAdultMap)
  const normalizedSelection = {
    ...passengerSelection,
    assignedChildExplicitPriceMap:
      passengerSelection.assignedChildExplicitPriceMap ||
      passengerSelection.preciosNinos ||
      {},
    convertedChildToAdultMap:
      passengerSelection.convertedChildToAdultMap ||
      passengerSelection.ninosComoAdulto ||
      {},
    treatChildrenAsAdults:
      passengerSelection.treatChildrenAsAdults ||
      Object.keys(passengerSelection.ninosComoAdulto || {}).length > 0,
    // If no pricingMode stored but preciosNinos present → explicit prices
    pricingMode:
      passengerSelection.pricingMode ||
      (passengerSelection.preciosNinos &&
      Object.keys(passengerSelection.preciosNinos).length > 0
        ? "fixed"
        : "percentage"),
  };
  passengerSelection = normalizedSelection;
  const rawConvertedChildToAdultMap =
    passengerSelection?.convertedChildToAdultMap || {};

  const normalizedUnitPrice = round2(unitPrice);
  const normalizedType = String(serviceType || "").toLowerCase();
  const selectedIds = Array.isArray(passengerSelection?.selectedIds)
    ? passengerSelection.selectedIds.filter(Boolean)
    : [];
  const allChildIds = selectedIds.filter(isChildPassengerId);
  const noChildrenExist = allChildIds.length === 0;
  const convertedChildSlots = new Set();
  Object.entries(rawConvertedChildToAdultMap).forEach(([key, rawValue]) => {
    if (isChildPassengerId(key) && rawValue) {
      convertedChildSlots.add(getPassengerSlotKey(key));
    }
    if (typeof rawValue === "string" && isChildPassengerId(rawValue)) {
      convertedChildSlots.add(getPassengerSlotKey(rawValue));
    }
  });

  let pricingMode = passengerSelection?.pricingMode || "percentage";
  let uniformPercentage = passengerSelection?.uniformPercentage ?? "";
  let childPercentageMap = {
    ...(passengerSelection?.childPercentageMap || {}),
  };
  let effectiveConvertedChildSlots = new Set(convertedChildSlots);
  if (
    pricingMode === "adult" &&
    effectiveConvertedChildSlots.size === 0 &&
    allChildIds.length > 0
  ) {
    allChildIds.forEach((childId) =>
      effectiveConvertedChildSlots.add(getPassengerSlotKey(childId)),
    );
  }
  const convertedChildIds = allChildIds.filter((childId) =>
    effectiveConvertedChildSlots.has(getPassengerSlotKey(childId)),
  );
  const explicitChildIds = allChildIds.filter(
    (childId) => !effectiveConvertedChildSlots.has(getPassengerSlotKey(childId)),
  );
  const convertedChildToAdultMap = convertedChildIds.reduce(
    (accumulator, childId) => {
      accumulator[childId] = true;
      return accumulator;
    },
    {},
  );
  let assignedChildExplicitPriceMap = normalizeChildPriceMap(
    explicitChildIds,
    passengerSelection?.assignedChildExplicitPriceMap || {},
  );
  const treatChildrenAsAdults =
    allChildIds.length > 0 &&
    convertedChildIds.length === allChildIds.length &&
    Object.keys(assignedChildExplicitPriceMap).length === 0;

  if (noChildrenExist) {
    pricingMode = "percentage";
    uniformPercentage = "";
    childPercentageMap = {};
    assignedChildExplicitPriceMap = {};
  }

  const baseAssignedCount = selectedIds.length || Math.max(1, fallbackTotal);
  const adultIds = selectedIds.filter(isAdultPassengerId);
  const adultEquivalentCount =
    adultIds.length + convertedChildIds.length || Math.max(1, baseAssignedCount);
  let paxForDivision = baseAssignedCount;

  if (
    convertedChildIds.length > 0 ||
    explicitChildIds.length > 0 ||
    Object.keys(assignedChildExplicitPriceMap).length > 0 ||
    pricingMode === "percentage"
  ) {
    paxForDivision = Math.max(1, adultEquivalentCount);
  }

  const isHotel = normalizedType.includes("hotel");
  const isTransport =
    normalizedType === "transportes" || normalizedType === "transporte";
  const isGuide = normalizedType === "guias" || normalizedType === "guia";
  const isEndose = normalizedType === "endoses" || normalizedType === "endose";
  const isExtra = normalizedType === "extras" || normalizedType === "extra";
  const tourCapacity = isEndose ? getTourCapacity(childService) : null;
  const isCapacityLimitedEndose = isEndose && tourCapacity != null;
  const isGroupedPricing = isTransport || isGuide || isCapacityLimitedEndose;
  const usesGroupedTotal =
    isGroupedPricing &&
    (precioAdultoDividido != null
      ? Boolean(precioAdultoDividido)
      : isTransport || isGuide || isCapacityLimitedEndose);

  let normalizedOriginal = round2(normalizedUnitPrice);
  let normalizedAdultUnitPrice = normalizedUnitPrice;

  if (isGroupedPricing) {
    const effectiveDivisor = isCapacityLimitedEndose
      ? Math.max(1, tourCapacity)
      : isTransport
        ? getTransportEffectiveDivisor(paxForDivision, childService)
        : Math.max(1, paxForDivision);
    const groupedBaseTotal = round2(
      parseFloat(tariff?.precio_original || 0) ||
        normalizedUnitPrice * effectiveDivisor,
    );

    normalizedOriginal =
      preserveGroupedTotal && usesGroupedTotal
        ? groupedBaseTotal
        : round2(normalizedUnitPrice * effectiveDivisor);
    normalizedAdultUnitPrice =
      preserveGroupedTotal && usesGroupedTotal
        ? round2(groupedBaseTotal / Math.max(1, effectiveDivisor))
        : normalizedUnitPrice;
  } else if (isHotel) {
    const roomCapacity = getRoomCapacityByType(
      childService?.tipo_habitacion ||
        childService?.habitacion?.tipo_habitacion ||
        "",
    );
    normalizedOriginal = round2(
      normalizedUnitPrice * Math.max(1, roomCapacity),
    );
    normalizedAdultUnitPrice = normalizedUnitPrice;
  } else {
    // Servicios unitarios tipo tickets / trenes / vuelos / restaurantes / extras:
    // el precio del adulto es unitario y el total base se multiplica por los
    // adultos cobrables, excluyendo ninos con precio propio.
    normalizedOriginal = round2(
      normalizedUnitPrice * Math.max(1, adultEquivalentCount),
    );
    normalizedAdultUnitPrice = normalizedUnitPrice;
  }

  let effectiveChildPriceMap = { ...assignedChildExplicitPriceMap };

  if (pricingMode === "percentage") {
    effectiveChildPriceMap = explicitChildIds.reduce((accumulator, childId) => {
      const percentageValue = parseFloat(
        childPercentageMap?.[childId] || uniformPercentage || 0,
      );

      accumulator[childId] =
        percentageValue > 0
          ? round2((percentageValue / 100) * normalizedAdultUnitPrice)
          : 0;

      return accumulator;
    }, {});
  } else if (pricingMode === "adult") {
    effectiveChildPriceMap = {};
  }

  const childExtrasTotal = round2(
    Object.values(effectiveChildPriceMap).reduce(
      (sum, price) => sum + (parseFloat(price) || 0),
      0,
    ),
  );

  const pricingState = {
    selectedIds,
    assignedPassengerCount: selectedIds.length,
    assignedChildExplicitPriceMap: effectiveChildPriceMap,
    assignedChildExplicitPriceSum: childExtrasTotal,
    assignedChildExplicitCount: Object.keys(effectiveChildPriceMap).length,
    hasChildExplicitPrices: Object.keys(effectiveChildPriceMap).length > 0,
    pricingMode,
    uniformPercentage,
    childPercentageMap,
    treatChildrenAsAdults,
    convertedChildToAdultMap,
  };

  const normalizedPassengerSelection = buildRuntimePassengerSelection(
    passengerSelection,
    pricingState,
  );

  return {
    ...mergePassengerPricingIntoTariff(
      {
        ...tariff,
        precio: normalizedAdultUnitPrice,
        precio_original: normalizedOriginal,
        childExtrasTotal,
        precio_original_with_child_extras: round2(
          normalizedOriginal + childExtrasTotal,
        ),
      },
      pricingState,
    ),
    assignedPassengerSelection: normalizedPassengerSelection,
    passengerSelection: normalizedPassengerSelection,
  };
};

export const buildAssignedFlatPricingState = ({
  tariff = {},
  passengerSelection = {},
  precioAdultoDividido = false,
}) => {
  const selectedIds = Array.isArray(passengerSelection?.selectedIds)
    ? passengerSelection.selectedIds.filter(Boolean)
    : [];
  const childPriceMap =
    passengerSelection?.assignedChildExplicitPriceMap ||
    passengerSelection?.preciosNinos ||
    {};
  const convertedMap =
    passengerSelection?.convertedChildToAdultMap ||
    passengerSelection?.ninosComoAdulto ||
    {};
  const convertedChildSlots = new Set();
  Object.entries(convertedMap).forEach(([key, rawValue]) => {
    if (String(key).startsWith("child:") && rawValue) {
      convertedChildSlots.add(getPassengerSlotKey(key));
    }
    if (typeof rawValue === "string" && rawValue.startsWith("child:")) {
      convertedChildSlots.add(getPassengerSlotKey(rawValue));
    }
  });
  if (
    convertedChildSlots.size === 0 &&
    passengerSelection?.pricingMode === "adult"
  ) {
    selectedIds
      .filter((id) => typeof id === "string" && id.startsWith("child:"))
      .forEach((childId) => convertedChildSlots.add(getPassengerSlotKey(childId)));
  }
  const assignedPrecioServicio = round2(
    precioAdultoDividido
      ? parseFloat(tariff?.precio_original ?? tariff?.precio ?? 0)
      : parseFloat(tariff?.precio ?? tariff?.precio_original ?? 0),
  );

  const assignedBeneficiariosAdultos = selectedIds
    .filter((id) => typeof id === "string" && id.startsWith("adult:"))
    .map((id) => {
      const entry = { id };
      const childOrigin = convertedMap[id];
      if (childOrigin) entry.child_origin = childOrigin;
      return entry;
    });
  selectedIds
    .filter(
      (id) =>
        typeof id === "string" &&
        id.startsWith("child:") &&
        convertedChildSlots.has(getPassengerSlotKey(id)),
    )
    .forEach((childId) => {
      if (!assignedBeneficiariosAdultos.some((entry) => entry.id === childId)) {
        assignedBeneficiariosAdultos.push({
          id: childId,
          child_origin: childId,
        });
      }
    });

  const assignedBeneficiariosNinos = selectedIds
    .filter(
      (id) =>
        typeof id === "string" &&
        id.startsWith("child:") &&
        !convertedChildSlots.has(getPassengerSlotKey(id)),
    )
    .map((id) => ({
      id,
      precio: round2(parseFloat(childPriceMap?.[id] || 0)),
    }));

  const childExtrasTotal = round2(
    assignedBeneficiariosNinos.reduce(
      (sum, child) => sum + (parseFloat(child?.precio || 0) || 0),
      0,
    ),
  );
  const adultUnitPrice = round2(parseFloat(tariff?.precio || 0));
  const assignedPrecioTotal = round2(
    parseFloat(
      tariff?.precio_original_with_child_extras ?? tariff?.precio_original,
    ) ||
      (precioAdultoDividido
        ? assignedPrecioServicio + childExtrasTotal
        : adultUnitPrice * Math.max(1, assignedBeneficiariosAdultos.length || 1) +
          childExtrasTotal),
  );

  return {
    assignedPrecioServicio,
    assigned_precio_servicio: assignedPrecioServicio,
    assignedPrecioTotal,
    assigned_precio_total: assignedPrecioTotal,
    assignedBeneficiariosAdultos,
    assigned_beneficiarios_adultos: assignedBeneficiariosAdultos,
    assignedBeneficiariosNinos,
    assigned_beneficiarios_ninos: assignedBeneficiariosNinos,
  };
};

/**
 * Calcular totales del día
 */
export const calculateDayTotal = (services) => {
  if (!Array.isArray(services)) return 0;
  return services.reduce((total, service) => {
    if (service.isAssigned && service.assignedService) {
      const breakdown = getTariffBreakdown(
        service.assignedService.tariff || service.assignedTariff,
        getAssignedPassengerSelectionForService(service),
      );
      return total + breakdown.total;
    } else if (service.isCustomService && service.tariff) {
      const breakdown = getTariffBreakdown(
        service.tariff,
        getAssignedPassengerSelectionForService(service),
      );
      return total + breakdown.total;
    }
    return total;
  }, 0);
};

/**
 * Obtener nombre para mostrar del servicio asignado
 */
export const getServiceDisplayName = (svc) => {
  if (!svc?.assignedService?.parentService) return "Servicio";
  const type = svc.assignedService.parentService.typeService?.toLowerCase();
  if (type === "hoteles")
    return svc.assignedService.parentService.nombre || "Hotel";
  if (type === "trenes")
    return svc.assignedService.parentService.nombre_empresa || "Tren";
  if (type === "restaurantes")
    return svc.assignedService.parentService.nombre || "Restaurante";
  if (type === "transportes")
    return svc.assignedService.parentService.nombre_transporte || "Transporte";
  if (type === "guias")
    return svc.assignedService.childService?.ruta?.tour_nombre || "Guia";
  if (type === "tickets")
    return svc.assignedService.childService?.ticket?.entrada || "Ticket";
  if (type === "endoses")
    return svc.assignedService.parentService.tipo_tour || "Endose";
  if (type === "vuelos")
    return svc.assignedService.parentService.nombre || "Vuelo";
  return "Servicio";
};

/**
 * Formatear fecha limite de pago
 */
export const formatPaymentDeadline = (dateString) => {
  if (!dateString) return "No establecida";
  const date = new Date(dateString);
  const options = {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  };
  return date.toLocaleDateString("es-ES", options);
};

/**
 * Determinar si se debe mostrar la fecha limite de pago
 */
export const shouldShowPaymentDeadline = (service) => {
  const hasPaymentRequest =
    service?.paymentRequest && Object.keys(service.paymentRequest).length > 0;
  const isPaid = service?.paymentRequest?.status === "paid";
  return hasPaymentRequest && !isPaid;
};

/**
 * Obtener color del estado de pago
 */
export const getPaymentStatusColor = (service) => {
  const hasPaymentRequest =
    service?.paymentRequest && Object.keys(service.paymentRequest).length > 0;
  const isPaid = service?.paymentRequest?.status === "paid";
  const deadline =
    service?.assignedService?.payment_deadline ||
    service?.payment_deadline ||
    service?.paymentRequest?.payment_deadline;

  if (isPaid) return "paid";
  if (!hasPaymentRequest) return "none";

  if (deadline) {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const hoursRemaining = (deadlineDate - now) / (1000 * 60 * 60);
    if (hoursRemaining <= 3 && hoursRemaining > 0) return "urgent";
    if (hoursRemaining <= 0) return "overdue";
    return "pending";
  }
  return "pending";
};
