import { detectServiceType } from "../components/DaysEditor/utils/serviceTypeMapper";
import { getServicePassengerPricingState } from "./passengerPricingState";

const round2 = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

const getTourCapacityFromService = (service = {}) => {
  const raw =
    service?.capacidad ??
    service?.tour?.capacidad ??
    service?.childService?.capacidad ??
    service?.childService?.tour?.capacidad ??
    service?.serviceDetails?.capacidad ??
    service?.serviceDetails?.tour?.capacidad ??
    null;
  const capacidad = Number(raw);
  return Number.isFinite(capacidad) && capacidad >= 1
    ? Math.floor(capacidad)
    : null;
};

const getRuntimeServiceType = (service = {}) =>
  (
    detectServiceType(service) ||
    service.typeService ||
    service.parentService?.typeService ||
    ""
  ).toLowerCase();

const limitIdsByTourCapacity = (service = {}, ids = []) => {
  const serviceType = getRuntimeServiceType(service);
  const tourCapacity =
    serviceType === "endoses" ? getTourCapacityFromService(service) : null;
  const uniqueIds = [...new Set((ids || []).map(String).filter(Boolean))];

  return tourCapacity == null ? uniqueIds : uniqueIds.slice(0, tourCapacity);
};

const ensureNumber = (value) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isPlainObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const isChildPassengerId = (value) =>
  typeof value === "string" && value.startsWith("child:");

const isAdultPassengerId = (value) =>
  typeof value === "string" && value.startsWith("adult:");

const removeDiacritics = (value = "") =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeTicketText = (value) =>
  removeDiacritics(value).trim().toLowerCase();

const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== "");

const getTicketTipoUsuarioFromService = (service = {}) =>
  normalizeTicketText(
    firstDefined(
      service?.ticketTipoUsuarioGroup,
      service?.childService?.ticketTipoUsuarioGroup,
      service?.tipo_usuario,
      service?.tipoUsuario,
      service?.childService?.tipo_usuario,
      service?.childService?.tipoUsuario,
      service?.childService?.ticket?.tipo_usuario,
      service?.assignedService?.childService?.tipo_usuario,
      service?.assignedService?.childService?.ticket?.tipo_usuario,
    ) || "",
  );

const getTicketPassengerTargetGroupFromService = (service = {}) =>
  normalizeTicketText(
    firstDefined(
      service?.ticketPassengerTargetGroup,
      service?.childService?.ticketPassengerTargetGroup,
      service?.ticketTargetGroup,
      service?.childService?.ticketTargetGroup,
      service?.passengerSelection?.ticketPassengerTargetGroup,
      service?.passenger_selection?.ticketPassengerTargetGroup,
    ) || "",
  );

const isTicketStudentPassengerService = (service = {}) => {
  const serviceType = getRuntimeServiceType(service);

  if (serviceType !== "tickets") return false;

  const targetGroup = getTicketPassengerTargetGroupFromService(service);
  const tipoUsuario = getTicketTipoUsuarioFromService(service);

  return (
    targetGroup === "child" ||
    targetGroup === "children" ||
    targetGroup === "nino" ||
    targetGroup === "ninos" ||
    targetGroup === "student" ||
    targetGroup === "estudiante" ||
    tipoUsuario.includes("estudiante") ||
    tipoUsuario.includes("student") ||
    tipoUsuario.includes("nino") ||
    tipoUsuario.includes("nina") ||
    tipoUsuario.includes("menor") ||
    tipoUsuario.includes("child")
  );
};

const normalizeChildEntry = (rawValue, fallbackAdultAmount) => {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }

  if (rawValue === true) {
    return {
      amount: round2(fallbackAdultAmount),
      asAdult: true,
    };
  }

  if (typeof rawValue === "number") {
    return {
      amount: round2(rawValue),
      asAdult: false,
    };
  }

  if (typeof rawValue === "string") {
    const normalized = rawValue.trim().toLowerCase();
    if (
      normalized === "adult" ||
      normalized === "adulto" ||
      normalized === "as-adult"
    ) {
      return {
        amount: round2(fallbackAdultAmount),
        asAdult: true,
      };
    }

    const numericValue = Number.parseFloat(rawValue);
    if (Number.isFinite(numericValue)) {
      return {
        amount: round2(numericValue),
        asAdult: false,
      };
    }
  }

  if (!isPlainObject(rawValue)) {
    return null;
  }

  const amount =
    rawValue.amount ?? rawValue.price ?? rawValue.precio ?? rawValue.value;
  const asAdult =
    rawValue.asAdult === true ||
    rawValue.childAsAdult === true ||
    rawValue.as_adult === true ||
    rawValue.mode === "adult" ||
    rawValue.mode === "adulto";

  if (asAdult) {
    return {
      amount: round2(
        Number.isFinite(Number.parseFloat(amount))
          ? Number.parseFloat(amount)
          : fallbackAdultAmount,
      ),
      asAdult: true,
    };
  }

  if (
    amount === null ||
    amount === undefined ||
    amount === "" ||
    !Number.isFinite(Number.parseFloat(amount))
  ) {
    return null;
  }

  return {
    amount: round2(amount),
    asAdult: false,
  };
};

const normalizeChildrenPayload = (children = {}, fallbackAdultAmount = 0) => {
  if (!isPlainObject(children)) return {};

  return Object.entries(children).reduce((result, [childId, rawValue]) => {
    if (!isChildPassengerId(childId)) return result;

    const normalizedEntry = normalizeChildEntry(rawValue, fallbackAdultAmount);
    if (normalizedEntry) {
      result[String(childId)] = normalizedEntry;
    }

    return result;
  }, {});
};

const getLegacyAssignedPassengerIds = (service = {}, pricingState = {}) => {
  const rootIds = Array.isArray(service.assignedPassengerIds)
    ? service.assignedPassengerIds.map(String)
    : [];
  const stateIds = Array.isArray(pricingState.selectedIds)
    ? pricingState.selectedIds.map(String)
    : [];
  const serviceType = getRuntimeServiceType(service);
  const tourCapacity =
    serviceType === "endoses" ? getTourCapacityFromService(service) : null;

  if (tourCapacity != null) {
    const sourceIds = rootIds.length > 0 ? rootIds : stateIds;
    return limitIdsByTourCapacity(service, sourceIds);
  }

  if (stateIds.length >= rootIds.length) {
    return [...new Set(stateIds)];
  }

  return [...new Set(rootIds)];
};

const getConvertedChildIds = (pricingState = {}, assignedIds = [], service = {}) => {
  const convertedChildIds = new Set();
  const convertedMap = isPlainObject(pricingState.convertedChildToAdultMap)
    ? pricingState.convertedChildToAdultMap
    : {};

  Object.entries(convertedMap).forEach(([key, rawValue]) => {
    if (isChildPassengerId(key) && rawValue) {
      convertedChildIds.add(String(key));
    }

    if (typeof rawValue === "string" && isChildPassengerId(rawValue)) {
      convertedChildIds.add(rawValue);
    }
  });

  if (pricingState.treatChildrenAsAdults || isTicketStudentPassengerService(service)) {
    assignedIds.filter(isChildPassengerId).forEach((id) => {
      convertedChildIds.add(id);
    });
  }

  return convertedChildIds;
};

const buildChildrenPayloadFromLegacy = (
  service = {},
  pricingState = {},
  fallbackAdultAmount = 0,
) => {
  const assignedIds = getLegacyAssignedPassengerIds(service, pricingState);
  const convertedChildIds = getConvertedChildIds(pricingState, assignedIds, service);
  const explicitChildPriceMap = isPlainObject(
    pricingState.assignedChildExplicitPriceMap,
  )
    ? pricingState.assignedChildExplicitPriceMap
    : {};

  const derivedChildren = {};

  assignedIds.filter(isChildPassengerId).forEach((childId) => {
    if (convertedChildIds.has(childId)) {
      derivedChildren[childId] = {
        amount: round2(fallbackAdultAmount),
        asAdult: true,
      };
      return;
    }

    if (Object.prototype.hasOwnProperty.call(explicitChildPriceMap, childId)) {
      derivedChildren[childId] = {
        amount: round2(explicitChildPriceMap[childId]),
        asAdult: false,
      };
    } else {
      // Child in assignedIds without explicit price — include with amount 0
      derivedChildren[childId] = {
        amount: 0,
        asAdult: false,
      };
    }
  });

  Object.entries(explicitChildPriceMap).forEach(([childId, amount]) => {
    if (!isChildPassengerId(childId) || convertedChildIds.has(childId)) return;

    if (!derivedChildren[childId]) {
      derivedChildren[childId] = {
        amount: round2(amount),
        asAdult: false,
      };
    }
  });

  convertedChildIds.forEach((childId) => {
    if (!derivedChildren[childId]) {
      derivedChildren[childId] = {
        amount: round2(fallbackAdultAmount),
        asAdult: true,
      };
    }
  });

  return derivedChildren;
};

export const getServiceAdultUnitPrice = (service = {}) => {
  const pricingState = getServicePassengerPricingState(service);
  const assignedIds = getLegacyAssignedPassengerIds(service, pricingState);
  const serviceType = getRuntimeServiceType(service);
  const adultRatedTotal = round2(
    service.tariff?.precio_original ??
      service.assignedTariff?.precio_original ??
      service.tariff?.precio ??
      service.assignedTariff?.precio ??
      service.precio_original ??
      service.precio ??
      0,
  );

  const convertedChildCount = getConvertedChildIds(
    pricingState,
    assignedIds,
    service,
  ).size;
  const explicitChildCount = Object.keys(
    pricingState.assignedChildExplicitPriceMap || {},
  ).length;
  const actualAdultCount = assignedIds.filter(isAdultPassengerId).length;
  const adultEquivalentCount = Math.max(
    1,
    actualAdultCount + convertedChildCount,
  );
  const hasAdultDividedPrice =
    service?.precio_adulto_dividido === true ||
    service?.precioAdultoDividido === true ||
    service?.tariff?.precio_adulto_dividido === true ||
    service?.assignedTariff?.precio_adulto_dividido === true ||
    service?.passengerSelection?.precio_adulto_dividido === true;

  if (assignedIds.length > 0 && adultRatedTotal > 0) {
    const tourCapacity =
      serviceType === "endoses" ? getTourCapacityFromService(service) : null;
    if (tourCapacity != null && hasAdultDividedPrice) {
      return round2(adultRatedTotal / tourCapacity);
    }

    if (serviceType === "hoteles" || hasAdultDividedPrice) {
      return round2(adultRatedTotal / adultEquivalentCount);
    }

    const assignedAdultRatedCount = Math.max(
      1,
      assignedIds.length - explicitChildCount,
    );
    if (service?.capacidad_limite === true && assignedAdultRatedCount > 0) {
      return round2(adultRatedTotal / assignedAdultRatedCount);
    }
  }

  return round2(
    service.precio_adult ??
      service.hotelAdultUnitPrice ??
      service.tariff?.precio_adult ??
      service.tariff?.precio ??
      service.assignedTariff?.precio ??
      service.precio ??
      0,
  );
};

export const getServiceAssignedPassengerIds = (service = {}) => {
  const pricingState = getServicePassengerPricingState(service);
  return getLegacyAssignedPassengerIds(service, pricingState);
};

export const getServiceChildrenPayload = (service = {}) => {
  const adultUnitAmount = getServiceAdultUnitPrice(service);
  const runtimeChildren = normalizeChildrenPayload(
    service.children,
    adultUnitAmount,
  );

  const pricingState = getServicePassengerPricingState(service);
  const legacyChildren = buildChildrenPayloadFromLegacy(
    service,
    pricingState,
    adultUnitAmount,
  );

  return {
    ...runtimeChildren,
    ...legacyChildren,
  };
};

export const getServicePricingSnapshot = (service = {}) => {
  const pricingState = getServicePassengerPricingState(service);
  const assignedIds = getLegacyAssignedPassengerIds(service, pricingState);
  const convertedMap = isPlainObject(pricingState.convertedChildToAdultMap)
    ? pricingState.convertedChildToAdultMap
    : {};
  const convertedChildIdSet = getConvertedChildIds(pricingState, assignedIds, service);
  const adultUnitAmount = getServiceAdultUnitPrice(service);
  const children = getServiceChildrenPayload(service);
  const childEntries = Object.entries(children);
  const explicitChildEntries = childEntries.filter(
    ([, childData]) => !childData?.asAdult,
  );
  const convertedChildEntries = childEntries.filter(
    ([, childData]) => childData?.asAdult,
  );
  const explicitChildTotal = round2(
    explicitChildEntries.reduce(
      (sum, [, childData]) => sum + ensureNumber(childData?.amount),
      0,
    ),
  );
  const convertedChildTotal = round2(
    convertedChildEntries.reduce(
      (sum, [, childData]) =>
        sum +
        ensureNumber(
          childData?.amount == null ? adultUnitAmount : childData.amount,
        ),
      0,
    ),
  );
  const explicitAdultRatedTotal = firstDefined(
    service.tariff?.precio_original,
    service.assignedTariff?.precio_original,
    service.amount_per_adult,
    service.precio_original,
  );
  const selectedAdultCount = assignedIds.filter(isAdultPassengerId).length;
  const selectedConvertedChildCount = convertedChildIdSet.size;
  const effectiveAdultEquivalentCount = Math.max(
    1,
    selectedAdultCount + selectedConvertedChildCount,
  );
  const hasUndividedAdultPrice =
    service?.precio_adulto_dividido === false ||
    service?.precioAdultoDividido === false ||
    service?.tariff?.precio_adulto_dividido === false ||
    service?.passengerSelection?.precio_adulto_dividido === false;
  const adultRatedTotal = round2(
    explicitAdultRatedTotal ??
      (hasUndividedAdultPrice
        ? adultUnitAmount * effectiveAdultEquivalentCount
        : firstDefined(
            service.tariff?.precio,
            service.assignedTariff?.precio,
            service.precio_adult,
            service.precio,
            0,
          )),
  );
  const fallbackChildAmount = round2(
    service.tariff?.childExtrasTotal ??
      service.assignedChildExplicitPriceSum ??
      service.amount_per_child ??
      0,
  );
  const amountPerAdult = round2(
    Math.max(0, adultRatedTotal - convertedChildTotal),
  );
  const amountPerChild = childEntries.length
    ? round2(explicitChildTotal + convertedChildTotal)
    : fallbackChildAmount;
  const total = round2(amountPerAdult + amountPerChild);
  const actualAdultIds = assignedIds.filter(
    (id) => isAdultPassengerId(id) && !convertedMap[id],
  );
  const serviceType = getRuntimeServiceType(service);

  return {
    serviceType,
    isHotel: serviceType === "hoteles",
    // Un ticket de estudiante se persiste operativamente como niño-as-adulto
    // para conservar sus beneficiarios, pero su tarifa continúa siendo la de
    // estudiante; los resúmenes no deben sustituirla por la tarifa adulto.
    isTicketStudentTariff: isTicketStudentPassengerService(service),
    assignedIds,
    actualAdultIds,
    childIds: childEntries.map(([childId]) => childId),
    children,
    precioAdult: adultUnitAmount,
    amountPerAdult,
    amountPerChild,
    explicitChildTotal,
    convertedChildTotal,
    explicitChildCount: explicitChildEntries.length,
    convertedChildCount: convertedChildEntries.length,
    actualAdultCount: actualAdultIds.length,
    total,
  };
};

export const applyServicePricingRuntime = (service = {}) => {
  if (!service || typeof service !== "object") return service;

  const pricing = getServicePricingSnapshot(service);

  return {
    ...service,
    precio_adult: pricing.precioAdult,
    children: pricing.children,
    amount_per_adult: pricing.amountPerAdult,
    amount_per_child: pricing.amountPerChild,
  };
};
