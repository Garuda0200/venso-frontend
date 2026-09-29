import { getRoomCapacityByType } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/utils/priceCalculations";
import { getTourCapacity } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/unifiedServiceManager";
import { getPassengerSlotKey } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/passengerPricingState";

const getAssignedParentService = (service = {}) =>
  service.assignedParentService ||
  service.assignedService?.parentService ||
  service.parentService ||
  null;

const getAssignedChildService = (service = {}) =>
  service.assignedChildService ||
  service.assignedService?.childService ||
  service.childService ||
  null;


const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const isAdultPassengerId = (value) =>
  typeof value === "string" && value.startsWith("adult:");
const isChildPassengerId = (value) =>
  typeof value === "string" && value.startsWith("child:");

const getPassengerSelectionByScope = (service = {}, assigned = true) =>
  assigned
    ? service.assignedPassengerSelection ||
      service.assigned_passenger_selection ||
      service.assignedService?.assignedPassengerSelection ||
      service.assignedService?.passengerSelection ||
      service.assignedTariff?.assignedPassengerSelection ||
      service.assignedTariff?.passengerSelection ||
      service.passengerSelection ||
      null
    : service.passengerSelection || service.tariff?.passengerSelection || null;

const getConvertedChildSlots = (selection = {}) => {
  const convertedMap =
    selection?.convertedChildToAdultMap || selection?.ninosComoAdulto || {};
  const convertedSlots = new Set();

  Object.entries(convertedMap || {}).forEach(([key, rawValue]) => {
    if (isChildPassengerId(String(key)) && rawValue) {
      convertedSlots.add(getPassengerSlotKey(key));
    }

    if (typeof rawValue === "string" && isChildPassengerId(rawValue)) {
      convertedSlots.add(getPassengerSlotKey(rawValue));
    }
  });

  if (selection?.pricingMode === "adult") {
    (selection?.selectedIds || [])
      .filter(isChildPassengerId)
      .forEach((childId) => convertedSlots.add(getPassengerSlotKey(childId)));
  }

  return convertedSlots;
};

const resolveBaseServiceType = (service = {}) =>
  (
    service.typeService ||
    service.parentService?.typeService ||
    service.childService?.typeService ||
    ""
  )
    .toString()
    .toLowerCase();

const getBeneficiariosByScope = (service = {}, assigned = true) => {
  const adults = assigned
    ? service.assignedBeneficiariosAdultos ||
      service.assigned_beneficiarios_adultos ||
      service.assignedService?.assignedBeneficiariosAdultos ||
      service.assignedService?.assigned_beneficiarios_adultos ||
      service.assignedService?.beneficiariosAdultos
    : service.beneficiariosAdultos || service.beneficiarios_adultos;
  const children = assigned
    ? service.assignedBeneficiariosNinos ||
      service.assigned_beneficiarios_ninos ||
      service.assignedService?.assignedBeneficiariosNinos ||
      service.assignedService?.assigned_beneficiarios_ninos ||
      service.assignedService?.beneficiariosNinos
    : service.beneficiariosNinos || service.beneficiarios_ninos;

  const normalizedAdults = Array.isArray(adults) ? adults : [];
  const normalizedChildren = Array.isArray(children) ? children : [];

  if (normalizedAdults.length > 0 || normalizedChildren.length > 0) {
    return { adults: normalizedAdults, children: normalizedChildren };
  }

  const selection = getPassengerSelectionByScope(service, assigned);
  const selectedIds = Array.isArray(selection?.selectedIds)
    ? selection.selectedIds.filter(Boolean)
    : [];

  if (selectedIds.length === 0) {
    return { adults: [], children: [] };
  }

  const convertedSlots = getConvertedChildSlots(selection);
  const childPriceMap =
    selection?.assignedChildExplicitPriceMap || selection?.preciosNinos || {};

  return {
    adults: selectedIds
      .filter(
        (id) =>
          isAdultPassengerId(String(id)) ||
          (isChildPassengerId(String(id)) &&
            convertedSlots.has(getPassengerSlotKey(id))),
      )
      .map((id) =>
        isChildPassengerId(String(id))
          ? { id, child_origin: id }
          : { id },
      ),
    children: selectedIds
      .filter(
        (id) =>
          isChildPassengerId(String(id)) &&
          !convertedSlots.has(getPassengerSlotKey(id)),
      )
      .map((id) => ({
        id,
        precio: round2(parseFloat(childPriceMap?.[id] || 0)),
      })),
  };
};

const getCapacityLimitForService = (service = {}, assigned = true) => {
  const typeService = String(
    assigned ? resolveServiceType(service) : resolveBaseServiceType(service),
  ).toLowerCase();
  const childService = assigned
    ? getAssignedChildService(service)
    : service.childService || {};

  if (typeService.includes("transporte")) {
    return (
      parseInt(
        childService?.nro_pasajeros ||
          childService?.movilidad?.nro_pasajeros ||
          childService?.transporte?.nro_pasajeros ||
          0,
        10,
      ) || 0
    );
  }

  if (typeService.includes("hotel")) {
    return getRoomCapacityByType(
      childService?.tipo_habitacion ||
        childService?.habitacion?.tipo_habitacion ||
        "",
    );
  }

  if (typeService.includes("endose")) {
    return getTourCapacity(childService) || 0;
  }

  return 0;
};

const inferDivisionFlags = (service = {}, assigned = true) => {
  const typeService = String(
    assigned ? resolveServiceType(service) : resolveBaseServiceType(service),
  ).toLowerCase();
  const childService = assigned
    ? getAssignedChildService(service)
    : service.childService || {};

  if (typeService.includes("transporte") || typeService.includes("hotel")) {
    return { precioAdultoDividido: true, capacidadLimite: true };
  }

  if (typeService.includes("guia")) {
    return { precioAdultoDividido: true, capacidadLimite: false };
  }

  if (typeService.includes("endose")) {
    const tourCapacity = getTourCapacity(childService);
    if (tourCapacity != null) {
      return { precioAdultoDividido: true, capacidadLimite: true };
    }

  }

  return { precioAdultoDividido: false, capacidadLimite: false };
};

/**
 * Replica el divisor usado por EdicionCotizacion:
 * - hotel: capacidad de la habitación;
 * - endose con aforo: capacidad del tour;
 * - transporte y guía: beneficiarios adultos cobrables.
 *
 * Los niños con precio explícito no forman parte de `adults`, por lo que no
 * alteran el divisor y se suman únicamente como extras al total.
 */
const getAssignedPricingDivisor = ({
  service = {},
  assigned = true,
  precioAdultoDividido = false,
  capacidadLimite = false,
  adults = [],
}) => {
  const beneficiaryDivisor = Math.max(1, adults.length || 1);
  if (!precioAdultoDividido) return beneficiaryDivisor;

  const typeService = String(
    assigned ? resolveServiceType(service) : resolveBaseServiceType(service),
  ).toLowerCase();

  if (typeService.includes("hotel")) {
    return getCapacityLimitForService(service, assigned) || beneficiaryDivisor;
  }

  if (typeService.includes("endose") && capacidadLimite) {
    return getCapacityLimitForService(service, assigned) || beneficiaryDivisor;
  }

  return beneficiaryDivisor;
};

const buildTariffFromFlatFields = (service = {}, assigned = true) => {
  const precioServicioRaw = assigned
    ? (service.assignedPrecioServicio ??
      service.assignedService?.assignedPrecioServicio ??
      service.assignedService?.precioServicio)
    : service.precioServicio;
  if (precioServicioRaw == null) return null;

  const precioServicio = parseFloat(precioServicioRaw || 0);
  const moneda = assigned
    ? service.assignedMoneda ||
      service.assignedService?.assignedMoneda ||
      service.assignedService?.moneda ||
      "dolares"
    : service.moneda || "dolares";
  const tieneIgv = assigned
    ? Boolean(
        service.assignedIgv ??
          service.assignedService?.assignedIgv ??
          service.assignedService?.igv,
      )
    : Boolean(service.igv);
  const inferredFlags = inferDivisionFlags(service, assigned);
  const assignedPrecioAdultoDividido =
    service.assignedPrecioAdultoDividido ??
    service.assignedService?.assignedPrecioAdultoDividido ??
    service.assignedService?.precioAdultoDividido;
  const precioAdultoDividido = assigned
    ? assignedPrecioAdultoDividido != null
      ? Boolean(assignedPrecioAdultoDividido)
      : inferredFlags.precioAdultoDividido
    : Boolean(service.precioAdultoDividido);
  const assignedCapacidadLimite =
    service.assignedCapacidadLimite ??
    service.assignedService?.assignedCapacidadLimite ??
    service.assignedService?.capacidadLimite;
  const capacidadLimite = assigned
    ? assignedCapacidadLimite != null
      ? Boolean(assignedCapacidadLimite)
      : inferredFlags.capacidadLimite
    : Boolean(service.capacidadLimite);

  const { adults, children } = getBeneficiariosByScope(service, assigned);
  const divisor = getAssignedPricingDivisor({
    service,
    assigned,
    precioAdultoDividido,
    capacidadLimite,
    adults,
  });

  const childExtrasTotal = round2(
    children.reduce(
      (sum, child) => sum + (parseFloat(child?.precio || 0) || 0),
      0,
    ),
  );

  // Usar assignedPrecioTotal/precioTotal cuando venga persistido.
  // Para servicios unitarios tipo ticket/tren/vuelo/restaurante/extra,
  // ese total debe representar precio adulto * adultos + ninos configurados.
  const backendTotalRaw = assigned
    ? (service.assignedPrecioTotal ??
      service.assigned_precio_total ??
      service.assignedService?.assignedPrecioTotal ??
      service.assignedService?.assigned_precio_total)
    : (service.precioTotal ?? service.precio_total);
  const backendTotalWithChildren = parseFloat(backendTotalRaw);
  const hasBackendTotal =
    backendTotalRaw !== null &&
    backendTotalRaw !== undefined &&
    backendTotalRaw !== "" &&
    Number.isFinite(backendTotalWithChildren);

  const adultBeneficiaryCount = Math.max(1, adults.length || 1);
  let precio, precioOriginal;
  if (hasBackendTotal) {
    precioOriginal = round2(
      Math.max(0, backendTotalWithChildren - childExtrasTotal),
    );
    precio = precioAdultoDividido
      ? round2(precioOriginal / divisor)
      : round2(precioServicio);
  } else {
    precio = precioAdultoDividido
      ? round2(precioServicio / divisor)
      : round2(precioServicio);
    precioOriginal = precioAdultoDividido
      ? round2(precioServicio)
      : round2(precioServicio * adultBeneficiaryCount);
  }

  return {
    precio,
    precio_original: precioOriginal,
    childExtrasTotal,
    precio_original_with_child_extras: round2(precioOriginal + childExtrasTotal),
    moneda,
    tieneIgv,
    tiene_igv: tieneIgv,
  };
};

const getAssignedTariff = (service = {}) => {
  const assignedFlatTariff = buildTariffFromFlatFields(service, true);
  if (assignedFlatTariff) return assignedFlatTariff;

  const existing =
    service.assignedTariff || service.assignedService?.tariff || service.tariff;
  if (existing) return existing;

  const baseFlatTariff = buildTariffFromFlatFields(service, false);
  if (baseFlatTariff) return baseFlatTariff;

  return null;
};

// API compartida por contabilidad/facturación. Mantiene una única resolución
// de tarifa y beneficiarios para la lectura cotizada y la asignada.
const getServiceTariff = (service = {}, assigned = true) => {
  if (assigned) return getAssignedTariff(service);

  return service.tariff || buildTariffFromFlatFields(service, false) || null;
};

const getServiceBeneficiaries = (service = {}, assigned = true) =>
  getBeneficiariosByScope(service, assigned);

const resolveServiceType = (service = {}) => {
  const childService = getAssignedChildService(service);
  const parentService = getAssignedParentService(service);

  if (childService?.servicio_extra || childService?.id_servicio_extra) {
    return "extras";
  }

  return (
    service.assignedService?.typeService ||
    service.assignedChildService?.typeService ||
    service.assignedParentService?.typeService ||
    service.typeService ||
    parentService?.typeService ||
    childService?.typeService ||
    null
  );
};

const hasAssignedService = (service = {}) => {
  if (!service?.isAssigned && !service?.assignedService) {
    return false;
  }

  return Boolean(
    getAssignedParentService(service) ||
      getAssignedChildService(service) ||
      service.assignedParentId ||
      service.assignedChildId,
  );
};

const isExternalItineraryDay = (day = {}) =>
  day?.isExternalItinerary === true ||
  day?.sourceItinerary === "external" ||
  day?.refTipo === "cotizacion_externa" ||
  day?.ref_tipo === "cotizacion_externa";

const mergeItineraryDaysByNumber = (itinerary = []) => {
  if (!Array.isArray(itinerary)) return [];

  const byNumber = new Map();

  itinerary.forEach((day, index) => {
    if (!day || typeof day !== "object") return;
    const dayNumber = Number(day.numero || day.day || index + 1) || index + 1;
    const existing = byNumber.get(dayNumber);
    const externalDay = isExternalItineraryDay(day);
    const services = Array.isArray(day.servicios) ? day.servicios : [];
    const normalizedServices = services.map((service) => ({
      ...service,
      ...(externalDay
        ? {
            isExternalItinerary: true,
            sourceItinerary: "external",
            refTipo: service?.refTipo || "cotizacion_externa",
          }
        : {}),
    }));

    if (!existing) {
      byNumber.set(dayNumber, {
        ...day,
        numero: dayNumber,
        servicios: normalizedServices,
      });
      return;
    }

    byNumber.set(dayNumber, {
      ...existing,
      titulo: existing.titulo || day.titulo,
      descripcion: existing.descripcion || day.descripcion,
      ciudades:
        Array.isArray(existing.ciudades) && existing.ciudades.length > 0
          ? existing.ciudades
          : day.ciudades || [],
      servicios: [...(existing.servicios || []), ...normalizedServices],
    });
  });

  return Array.from(byNumber.values()).sort(
    (left, right) => Number(left.numero || 0) - Number(right.numero || 0),
  );
};

const getExtraServiceId = (service = {}) => {
  const childService = getAssignedChildService(service);
  const parentService = getAssignedParentService(service);

  return (
    childService?.id_servicio_extra ||
    childService?.servicio_extra?.id ||
    parentService?.id_servicio_extra ||
    null
  );
};

export {
  getAssignedParentService,
  getAssignedChildService,
  getAssignedTariff,
  getServiceTariff,
  getServiceBeneficiaries,
  resolveServiceType,
  hasAssignedService,
  getExtraServiceId,
  mergeItineraryDaysByNumber,
};
