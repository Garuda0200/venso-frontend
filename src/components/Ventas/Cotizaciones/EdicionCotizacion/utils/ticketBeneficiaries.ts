/**
 * Utilidades compartidas para tickets.
 *
 * Reglas de negocio implementadas:
 * - Cada entrada se trabaja por procedencia: nacional y extranjero.
 * - En cada procedencia conviven adultos y niños como beneficiarios del mismo
 *   itinerario_servicio; no se genera una fila separada por tipo_usuario.
 * - Perú se considera nacional. Cualquier valor vacío, null, placeholder o país
 *   diferente a Perú se considera extranjero.
 * - Los niños usan la tarifa estudiante/niño si existe y aplica por edad; si no
 *   existe o no aplica, usan la tarifa adulto de la misma procedencia.
 */

const removeDiacritics = (value = "") =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const normalizeTicketText = (value) =>
  removeDiacritics(value).trim().toLowerCase();

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== "");

const asArray = (value) => (Array.isArray(value) ? value : []);

const round2 = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const normalizeTarifas = (item = {}) =>
  asArray(
    item?.tarifas ||
      item?.ticket?.tarifas ||
      item?.childService?.tarifas ||
      item?.childService?.ticket?.tarifas ||
      item?.assignedService?.childService?.tarifas ||
      item?.assignedService?.childService?.ticket?.tarifas,
  );

const readTicketSource = (source = {}) => {
  if (!isPlainObject(source)) return {};

  return (
    source?.ticket ||
    source?.childService?.ticket ||
    source?.childService ||
    source?.assignedService?.childService?.ticket ||
    source?.assignedService?.childService ||
    source?.cotizacionService?.childService?.ticket ||
    source?.cotizacionService?.childService ||
    source
  );
};

export const getTicketEntrada = (source = {}) => {
  const ticket = readTicketSource(source);
  const value = firstDefined(
    ticket?.entrada,
    ticket?.nombre_entrada,
    ticket?.nombre,
    source?.entrada,
    source?.ticketEntryGroup,
    source?.ticketEntrada,
    source?.childService?.entrada,
    source?.childService?.ticketEntryGroup,
    source?.childService?.ticketEntrada,
    source?.childService?.ticket?.entrada,
    source?.assignedService?.childService?.entrada,
    source?.assignedService?.childService?.ticket?.entrada,
  );

  return String(value || "Ticket").trim();
};

export const getTicketProcedencia = (source = {}) => {
  const ticket = readTicketSource(source);
  return String(
    firstDefined(
      source?.ticketProcedenciaGroup,
      ticket?.ticketProcedenciaGroup,
      ticket?.procedencia,
      ticket?.procedence,
      ticket?.origen,
      source?.procedencia,
      source?.childService?.ticketProcedenciaGroup,
      source?.childService?.procedencia,
      source?.childService?.ticket?.procedencia,
      source?.assignedService?.childService?.ticketProcedenciaGroup,
      source?.assignedService?.childService?.procedencia,
      source?.assignedService?.childService?.ticket?.procedencia,
    ) || "",
  ).trim();
};

export const normalizeTicketProcedencia = (value) => {
  const normalized = normalizeTicketText(value);
  if (!normalized) return "";

  if (
    normalized.includes("nacional") ||
    normalized.includes("peru") ||
    normalized.includes("peruano") ||
    normalized.includes("peruana") ||
    normalized === "pe" ||
    normalized === "per"
  ) {
    return "nacional";
  }

  if (
    normalized.includes("extranj") ||
    normalized.includes("foreign") ||
    normalized.includes("internacional") ||
    normalized.includes("exterior")
  ) {
    return "extranjero";
  }

  return "";
};

export const getTicketTipoUsuario = (source = {}) => {
  const ticket = readTicketSource(source);
  return String(
    firstDefined(
      source?.ticketTipoUsuarioGroup,
      ticket?.tipo_usuario,
      ticket?.tipoUsuario,
      ticket?.usuario,
      source?.tipo_usuario,
      source?.childService?.tipo_usuario,
      source?.childService?.ticket?.tipo_usuario,
      source?.assignedService?.childService?.tipo_usuario,
      source?.assignedService?.childService?.ticket?.tipo_usuario,
    ) || "",
  ).trim();
};

const getTicketTargetGroup = (source = {}) => {
  const explicitTarget = normalizeTicketText(
    firstDefined(
      source?.ticketPassengerTargetGroup,
      source?.childService?.ticketPassengerTargetGroup,
      source?.ticketTargetGroup,
      source?.childService?.ticketTargetGroup,
      source?.passengerSelection?.ticketPassengerTargetGroup,
    ) || "",
  );

  if (["adult", "adulto", "adults", "adultos"].includes(explicitTarget)) {
    return "adult";
  }
  if (["child", "children", "nino", "ninos", "niño", "niños", "student", "estudiante"].includes(explicitTarget)) {
    return "child";
  }
  if (["all", "todos", "mixto"].includes(explicitTarget)) {
    return "all";
  }

  const groupedByProcedencia = Boolean(
    source?.ticketProcedenciaGroup ||
      source?.childService?.ticketProcedenciaGroup ||
      source?.ticketTarifasByUserType ||
      source?.childService?.ticketTarifasByUserType ||
      source?.ticketAdultRate ||
      source?.childService?.ticketAdultRate,
  );

  if (groupedByProcedencia) return "all";

  const tipoUsuario = normalizeTicketText(getTicketTipoUsuario(source));

  if (
    tipoUsuario.includes("nino") ||
    tipoUsuario.includes("nina") ||
    tipoUsuario.includes("menor") ||
    tipoUsuario.includes("child") ||
    tipoUsuario.includes("estudiante") ||
    tipoUsuario.includes("student")
  ) {
    return "child";
  }

  return "adult";
};

export const getTicketPassengerTargetGroup = (source = {}) =>
  getTicketTargetGroup(source);

const getCandidateIdFromPerson = (person = {}, index = 0) =>
  firstDefined(
    person?.id,
    person?.id_pasajero,
    person?.pasajero_id,
    person?.documentNumber,
    person?.document_number,
    person?.dni,
    person?.passport,
    person?.pasaporte,
    person?.passenger_key,
    person?.passengerKey,
    person?.email,
    person?.correo,
    person?.phone,
    person?.telefono,
  ) || `pax-${index}`;

const makePassengerRowId = (person = {}, index = 0, group = "adult") => {
  const existing = firstDefined(
    person?.rowId,
    person?.row_id,
    person?.passengerRowId,
    person?.passenger_row_id,
    person?.passenger_key,
    person?.passengerKey,
  );

  if (typeof existing === "string" && existing.startsWith(`${group}:`)) {
    return existing;
  }

  return `${group}:${index}:${getCandidateIdFromPerson(person, index)}`;
};

const getPassengerType = (person = {}, fallback = "adult") => {
  const text = normalizeTicketText(
    firstDefined(
      person?.tipo_pasajero,
      person?.tipoPasajero,
      person?.passenger_type,
      person?.passengerType,
      person?.type,
      person?.tipo,
    ) || "",
  );
  const key = normalizeTicketText(
    firstDefined(person?.passenger_key, person?.passengerKey, person?.rowId) || "",
  );

  if (text.includes("child") || text.includes("nino") || text.includes("nina")) {
    return "child";
  }
  if (key.startsWith("child")) return "child";
  if (text.includes("adult") || text.includes("adulto")) return "adult";
  if (key.startsWith("adult")) return "adult";
  return fallback;
};

const getPeopleByTicketTarget = (peopleDetails = {}, targetGroup = "adult") => {
  if (targetGroup === "child") {
    if (Array.isArray(peopleDetails?.children)) return peopleDetails.children;
    if (Array.isArray(peopleDetails?.ninos)) return peopleDetails.ninos;
    if (Array.isArray(peopleDetails?.childrenDetails)) return peopleDetails.childrenDetails;
  } else if (targetGroup === "adult") {
    if (Array.isArray(peopleDetails?.adults)) return peopleDetails.adults;
    if (Array.isArray(peopleDetails?.adultos)) return peopleDetails.adultos;
    if (Array.isArray(peopleDetails?.adultDetails)) return peopleDetails.adultDetails;
  }

  const flatPassengers = [
    ...asArray(peopleDetails?.details),
    ...asArray(peopleDetails?.passengers),
    ...asArray(peopleDetails?.pasajeros),
  ];

  if (flatPassengers.length === 0) return [];

  if (targetGroup === "all") return flatPassengers;

  return flatPassengers.filter(
    (person) => getPassengerType(person, targetGroup) === targetGroup,
  );
};

const getAdultPeople = (peopleDetails = {}) =>
  getPeopleByTicketTarget(peopleDetails, "adult");

const getChildPeople = (peopleDetails = {}) =>
  getPeopleByTicketTarget(peopleDetails, "child");

const getPassengerNationalityText = (person = {}) =>
  normalizeTicketText(
    firstDefined(
      person?.pais,
      person?.pais_nacionalidad,
      person?.paisNacionalidad,
      person?.nacionalidad,
      person?.nationality,
      person?.country,
      person?.pais_origen,
      person?.countryCode,
      person?.pais_documento,
      person?.documentCountry,
      person?.document_country,
    ) || "",
  );

export const isTicketPeruvianPassenger = (person = {}) => {
  const nationality = getPassengerNationalityText(person);
  return (
    nationality === "pe" ||
    nationality === "per" ||
    nationality === "peru" ||
    nationality.includes("peruano") ||
    nationality.includes("peruana")
  );
};

export const getPassengerTicketProcedencia = (person = {}) =>
  isTicketPeruvianPassenger(person) ? "nacional" : "extranjero";

const matchesProcedencia = (person = {}, procedencia = "") => {
  if (procedencia === "nacional") return isTicketPeruvianPassenger(person);
  if (procedencia === "extranjero") return !isTicketPeruvianPassenger(person);
  return true;
};

const getPersonAge = (person = {}) => {
  const raw = firstDefined(person?.age, person?.edad, person?.years, person?.edad_actual);
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

const getTicketRatePrice = (rate = {}) => {
  if (!rate || typeof rate !== "object") return null;
  const value = firstDefined(
    rate?.precio,
    rate?.price,
    rate?.precio_compartido,
    rate?.precio_privado,
    rate?.tariff?.precio,
    rate?.tarifa?.precio,
  );
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const getTicketRateMinAge = (rate = {}) => {
  const value = firstDefined(
    rate?.edad_estudiante_min,
    rate?.edad_min,
    rate?.minAge,
    rate?.edadMin,
    rate?.ticket?.edad_estudiante_min,
  );
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const getTicketRateMaxAge = (rate = {}) => {
  const value = firstDefined(
    rate?.edad_estudiante_max,
    rate?.edad_max,
    rate?.maxAge,
    rate?.edadMax,
    rate?.ticket?.edad_estudiante_max,
  );
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const isAgeAllowedForRate = (person = {}, rate = {}) => {
  const min = getTicketRateMinAge(rate);
  const max = getTicketRateMaxAge(rate);
  if (min == null && max == null) return true;
  const age = getPersonAge(person);
  if (age == null) return true;
  if (min != null && age < min) return false;
  if (max != null && age > max) return false;
  return true;
};

const getTicketAdultRate = (source = {}) =>
  source?.ticketAdultRate ||
  source?.childService?.ticketAdultRate ||
  source?.ticketTarifasByUserType?.adult ||
  source?.childService?.ticketTarifasByUserType?.adult ||
  null;

const getTicketChildRate = (source = {}) =>
  source?.ticketChildRate ||
  source?.childService?.ticketChildRate ||
  source?.ticketTarifasByUserType?.child ||
  source?.childService?.ticketTarifasByUserType?.child ||
  null;

export const resolveTicketAdultUnitPrice = (source = {}) => {
  const direct = firstDefined(
    source?.ticketAdultUnitPrice,
    source?.childService?.ticketAdultUnitPrice,
    source?.tariff?.precio,
    source?.precio,
    source?.precioServicio,
  );
  const directNumber = Number(direct);
  if (Number.isFinite(directNumber)) return directNumber;
  return getTicketRatePrice(getTicketAdultRate(source));
};

export const resolveTicketChildUnitPrice = (source = {}, child = {}) => {
  const adultPrice = resolveTicketAdultUnitPrice(source);
  const childRate = getTicketChildRate(source);
  const childPrice = getTicketRatePrice(childRate);

  if (childPrice != null && isAgeAllowedForRate(child, childRate)) {
    return childPrice;
  }

  const direct = firstDefined(
    source?.ticketChildUnitPrice,
    source?.childService?.ticketChildUnitPrice,
  );
  const directNumber = Number(direct);
  if (Number.isFinite(directNumber) && isAgeAllowedForRate(child, childRate || {})) {
    return directNumber;
  }

  return Number.isFinite(Number(adultPrice)) ? adultPrice : 0;
};

const normalizeSelectedIds = (value = []) =>
  Array.isArray(value)
    ? [...new Set(value.map((id) => String(id || "").trim()).filter(Boolean))]
    : [];

export const buildTicketProcedenciaPassengerSelection = ({
  childService = {},
  peopleDetails = {},
  passengerSelection = null,
} = {}) => {
  const procedencia = normalizeTicketProcedencia(getTicketProcedencia(childService));
  if (!procedencia) return passengerSelection;

  const targetGroup = getTicketTargetGroup(childService);
  const baseSelection = isPlainObject(passengerSelection) ? passengerSelection : {};

  const adultRows = getAdultPeople(peopleDetails)
    .map((person, index) => ({
      person,
      id: makePassengerRowId(person, index, "adult"),
    }))
    .filter(({ person }) => matchesProcedencia(person, procedencia));

  const childRows = getChildPeople(peopleDetails)
    .map((person, index) => ({
      person,
      id: makePassengerRowId(person, index, "child"),
    }))
    .filter(({ person }) => matchesProcedencia(person, procedencia));

  const rows =
    targetGroup === "all"
      ? [...adultRows, ...childRows]
      : targetGroup === "child"
        ? childRows
        : adultRows;

  const selectedIds = rows.map(({ id }) => id);
  const selectedChildIds = selectedIds.filter((id) => String(id).startsWith("child:"));
  const isStudentTarget = targetGroup === "child";
  const forcedPaxForDivision =
    isStudentTarget
      ? selectedChildIds.length
      : targetGroup === "all"
        ? adultRows.length
        : selectedIds.length;

  const childPriceMapFromTicket = {};
  if (targetGroup === "all") {
    childRows.forEach(({ person, id }) => {
      childPriceMapFromTicket[id] = round2(
        resolveTicketChildUnitPrice(childService, person),
      );
    });
  }

  const existingChildMap = isPlainObject(baseSelection.assignedChildExplicitPriceMap)
    ? baseSelection.assignedChildExplicitPriceMap
    : {};
  const ticketChildPricingMode =
    baseSelection.ticketChildPricingMode ||
    baseSelection.ticket_child_pricing_mode ||
    "student_tariff";
  const preserveManualChildPrices = ticketChildPricingMode === "manual";
  const selectedIdSet = new Set(selectedIds);
  const mergedChildPriceMap = preserveManualChildPrices
    ? { ...childPriceMapFromTicket, ...existingChildMap }
    : { ...existingChildMap, ...childPriceMapFromTicket };
  const convertedChildToAdultMap = isStudentTarget
    ? buildChildConvertedMap(selectedChildIds)
    : {};
  const assignedChildExplicitPriceMap = isStudentTarget
    ? {}
    : Object.entries(mergedChildPriceMap).reduce(
        (result, [id, value]) => {
          if (!selectedIdSet.has(id)) return result;
          if (!String(id).startsWith("child:")) return result;
          const price = Number(value);
          result[id] = Number.isFinite(price) ? round2(price) : 0;
          return result;
        },
        {},
      );
  const assignedChildExplicitPriceSum = round2(
    Object.values(assignedChildExplicitPriceMap).reduce(
      (sum, value) => sum + Number(value || 0),
      0,
    ),
  );

  return {
    ...baseSelection,
    selectedIds,
    ids: selectedIds,
    assignedPassengerCount: selectedIds.length,
    forcedPaxForDivision,
    preventFallbackPassengerCount: true,
    ticketProcedenciaFilter: procedencia,
    ticketPassengerTargetGroup: targetGroup,
    pricingMode: "fixed",
    treatChildrenAsAdults: isStudentTarget,
    ticketChildPricingMode,
    ticketChildrenUseStudentTariffAsAdult:
      isStudentTarget && !preserveManualChildPrices,
    ticketDefaultChildPriceMap: childPriceMapFromTicket,
    convertedChildToAdultMap,
    ninosComoAdulto: convertedChildToAdultMap,
    assignedChildExplicitPriceMap,
    assignedChildExplicitPriceSum,
    assignedChildExplicitCount: Object.keys(assignedChildExplicitPriceMap).length,
    hasChildExplicitPrices: Object.keys(assignedChildExplicitPriceMap).length > 0,
  };
};

export const formatTicketPassengerLabel = (id) => {
  const parts = String(id || "").split(":");
  const group = parts[0];
  const index = Number(parts[1]);
  const number = Number.isFinite(index) ? index + 1 : "";

  if (group === "child") return `Niño ${number}`.trim();
  if (group === "adult") return `Adulto ${number}`.trim();
  return String(id || "Pasajero");
};

export const groupTicketsByEntrada = (items = []) => {
  const groups = new Map();

  asArray(items).forEach((item) => {
    const entrada = getTicketEntrada(item);
    const normalizedEntry = normalizeTicketText(entrada) || `ticket-${groups.size + 1}`;
    const tarifas = normalizeTarifas(item);
    const firstTariff = tarifas[0] || {};
    const agencyIds = Array.isArray(item?._tariff_agency_ids)
      ? item._tariff_agency_ids.map(Number).filter(Number.isInteger).sort((a, b) => a - b)
      : Array.isArray(firstTariff?.agency_ids)
        ? firstTariff.agency_ids.map(Number).filter(Number.isInteger).sort((a, b) => a - b)
        : [];
    const anio = Number(firstTariff?.anio || new Date().getFullYear());
    // ServicePicker puede traer la misma entrada varias veces porque cada
    // tarifa de agencia es una opción independiente. Agrupamos adulto/niño
    // solo cuando comparten exactamente el mismo alcance de agencias y año.
    const scopeKey = agencyIds.length ? agencyIds.join(",") : "all";
    const key = `${normalizedEntry}::${anio}::${scopeKey}`;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        entrada,
        anio,
        agencyIds,
        items: [],
      });
    }

    groups.get(key).items.push({
      ...item,
      tarifas,
    });
  });

  return [...groups.values()].sort((a, b) => {
    const byEntry = String(a.entrada || "").localeCompare(
      String(b.entrada || ""),
      "es",
      { sensitivity: "base" },
    );
    if (byEntry !== 0) return byEntry;
    return String(a.key).localeCompare(String(b.key), "es");
  });
};

export const summarizeTicketGroup = (group = {}) => {
  const counters = {
    nacionalAdulto: 0,
    nacionalChild: 0,
    extranjeroAdulto: 0,
    extranjeroChild: 0,
    total: 0,
  };

  asArray(group?.items).forEach((item) => {
    const procedencia = normalizeTicketProcedencia(getTicketProcedencia(item));
    const targetGroup = getTicketTargetGroup(item);
    const key = `${procedencia}${targetGroup === "child" ? "Child" : "Adulto"}`;

    if (Object.prototype.hasOwnProperty.call(counters, key)) {
      counters[key] += 1;
    }
    counters.total += 1;
  });

  return counters;
};

export const getServiceType = (service = {}) =>
  String(
    service?.parentService?.typeService ||
      service?.typeService ||
      service?.tipoServicio ||
      service?.tipo_servicio ||
      "",
  ).toLowerCase();

const getPassengerSelectionFromService = (service = {}) =>
  service?.passengerSelection || service?.passenger_selection || {};

const getServiceSelectedIds = (service = {}) =>
  normalizeSelectedIds(
    service?.assignedPassengerIds ||
      getPassengerSelectionFromService(service)?.selectedIds ||
      getPassengerSelectionFromService(service)?.ids ||
      [],
  );

const getServiceChildPriceMap = (service = {}) =>
  service?.assignedChildExplicitPriceMap ||
  getPassengerSelectionFromService(service)?.assignedChildExplicitPriceMap ||
  service?.tariff?.assignedChildExplicitPriceMap ||
  {};

const getTicketServiceTargetGroup = (service = {}) =>
  service?.ticketPassengerTargetGroup ||
  getPassengerSelectionFromService(service)?.ticketPassengerTargetGroup ||
  getTicketTargetGroup(service?.childService || service);

const isTicketStudentService = (service = {}) => {
  const targetGroup = getTicketServiceTargetGroup(service);
  const tipoUsuario = normalizeTicketText(getTicketTipoUsuario(service));
  return (
    targetGroup === "child" ||
    tipoUsuario.includes("estudiante") ||
    tipoUsuario.includes("nino") ||
    tipoUsuario.includes("nina") ||
    tipoUsuario.includes("menor") ||
    tipoUsuario.includes("child") ||
    tipoUsuario.includes("student")
  );
};

const getTicketConvertedChildMap = (service = {}) => {
  const selection = getPassengerSelectionFromService(service) || {};
  const converted =
    service?.convertedChildToAdultMap ||
    selection?.convertedChildToAdultMap ||
    selection?.ninosComoAdulto ||
    service?.tariff?.convertedChildToAdultMap ||
    service?.tariff?.ninosComoAdulto ||
    {};

  return isPlainObject(converted) ? converted : {};
};

const getConvertedChildIdsFromService = (service = {}) => {
  const converted = getTicketConvertedChildMap(service);
  const childIds = new Set();

  Object.entries(converted).forEach(([key, value]) => {
    if (String(key).startsWith("child:") && value) childIds.add(String(key));
    if (typeof value === "string" && value.startsWith("child:")) {
      childIds.add(value);
    }
  });

  getServiceSelectedIds(service).forEach((id) => {
    if (String(id).startsWith("child:")) childIds.add(String(id));
  });

  return [...childIds];
};

const buildChildConvertedMap = (childIds = []) =>
  normalizeSelectedIds(childIds).reduce((acc, childId) => {
    acc[childId] = true;
    return acc;
  }, {});

const buildZeroChildPriceMap = (childIds = []) =>
  normalizeSelectedIds(childIds).reduce((acc, childId) => {
    acc[childId] = 0;
    return acc;
  }, {});

const buildGroupedTicketChildService = ({ entrada, procedencia, adultService, childService }) => {
  const baseService = adultService || childService || {};
  const baseChild = baseService.childService || baseService || {};
  const adultChild = adultService?.childService || adultService || baseChild;
  const childChild = childService?.childService || childService || null;
  const adultRate = {
    ...(adultChild || {}),
    precio: resolveTicketAdultUnitPrice(adultService || baseService),
  };
  const childRate = childChild
    ? {
        ...(childChild || {}),
        precio: resolveTicketAdultUnitPrice(childService || childChild),
      }
    : null;
  const adultUnitPrice = resolveTicketAdultUnitPrice(adultService || baseService);
  const childUnitPrice = childService
    ? resolveTicketAdultUnitPrice(childService)
    : adultUnitPrice;

  return {
    ...baseChild,
    ...(adultChild || {}),
    entrada,
    ticketEntryGroup: entrada,
    ticketEntrada: entrada,
    procedencia,
    ticketProcedenciaGroup: procedencia,
    tipo_usuario: "adulto",
    ticketTipoUsuarioGroup: "adulto + niños",
    ticketAdultRate: adultRate,
    ticketChildRate: childRate,
    ticketTarifasByUserType: {
      adult: adultRate,
      child: childRate,
    },
    ticketAdultUnitPrice: round2(adultUnitPrice || 0),
    ticketChildUnitPrice: round2(childUnitPrice || adultUnitPrice || 0),
  };
};

const hasTicketStudentTariff = (service = {}) => {
  const childRate = getTicketChildRate(service);
  return Boolean(
    childRate && normalizeTicketText(getTicketTipoUsuario(childRate)).includes("estudiante"),
  );
};

const buildTicketServiceCloneForTarget = ({
  service = {},
  targetGroup = "adult",
  unitPrice = 0,
  childRate = null,
  adultRate = null,
  childPriceMap = {},
  selectedIds = [],
  procedencia = "",
}) => {
  const normalizedTarget = targetGroup === "child" ? "child" : targetGroup === "all" ? "all" : "adult";
  const childIds = normalizeSelectedIds(selectedIds).filter((id) => String(id).startsWith("child:"));
  const adultIds = normalizeSelectedIds(selectedIds).filter((id) => String(id).startsWith("adult:"));
  const ids = normalizedTarget === "child" ? childIds : normalizedTarget === "adult" ? adultIds : normalizeSelectedIds(selectedIds);
  const explicitChildMap = normalizedTarget === "all"
    ? childIds.reduce((acc, childId) => {
        const raw = childPriceMap?.[childId];
        const price = Number(raw);
        acc[childId] = Number.isFinite(price) ? round2(price) : 0;
        return acc;
      }, {})
    : {};
  const convertedChildToAdultMap = normalizedTarget === "child"
    ? buildChildConvertedMap(childIds)
    : {};
  const childExplicitSum = round2(
    Object.values(explicitChildMap).reduce((sum, value) => sum + Number(value || 0), 0),
  );
  const targetTipoUsuario = normalizedTarget === "child" ? "estudiante" : "adulto";
  const baseChildService = {
    ...(normalizedTarget === "child" ? childRate || service.childService || service : adultRate || service.childService || service),
    entrada: getTicketEntrada(service),
    ticketEntryGroup: getTicketEntrada(service),
    ticketEntrada: getTicketEntrada(service),
    procedencia,
    ticketProcedenciaGroup: procedencia,
    tipo_usuario: targetTipoUsuario,
    ticketTipoUsuarioGroup: targetTipoUsuario,
    ticketPassengerTargetGroup: normalizedTarget,
    ticketTargetGroup: normalizedTarget,
    ticketAdultRate: normalizedTarget === "child" ? childRate || adultRate : adultRate || childRate,
    ticketChildRate: normalizedTarget === "all" ? childRate : null,
    ticketTarifasByUserType: {
      adult: adultRate || null,
      child: childRate || null,
    },
    ticketAdultUnitPrice: round2(unitPrice || 0),
    ticketChildUnitPrice: normalizedTarget === "all"
      ? round2(getTicketRatePrice(childRate) || 0)
      : 0,
  };

  const passengerSelection = {
    ...(service.passengerSelection || {}),
    selectedIds: ids,
    ids,
    assignedPassengerCount: ids.length,
    forcedPaxForDivision: normalizedTarget === "child" ? childIds.length : adultIds.length,
    preventFallbackPassengerCount: true,
    ticketProcedenciaFilter: procedencia,
    ticketPassengerTargetGroup: normalizedTarget,
    pricingMode: "fixed",
    treatChildrenAsAdults: normalizedTarget === "child",
    ticketChildPricingMode: normalizedTarget === "child" ? "student_tariff" : normalizedTarget === "all" ? "manual" : "none",
    ticketChildrenUseStudentTariffAsAdult: normalizedTarget === "child",
    assignedChildExplicitPriceMap: explicitChildMap,
    assignedChildExplicitPriceSum: childExplicitSum,
    assignedChildExplicitCount: Object.keys(explicitChildMap).length,
    hasChildExplicitPrices: Object.keys(explicitChildMap).length > 0,
    convertedChildToAdultMap,
    ninosComoAdulto: convertedChildToAdultMap,
  };

  return {
    ...service,
    childService: baseChildService,
    ticketProcedenciaFilter: procedencia,
    ticketPassengerTargetGroup: normalizedTarget,
    ticketChildPricingMode: passengerSelection.ticketChildPricingMode,
    ticketChildrenUseStudentTariffAsAdult: passengerSelection.ticketChildrenUseStudentTariffAsAdult,
    assignedPassengerIds: ids,
    assignedPassengerCount: ids.length,
    assignedChildExplicitPriceMap: explicitChildMap,
    assignedChildExplicitPriceSum: childExplicitSum,
    assignedChildExplicitCount: Object.keys(explicitChildMap).length,
    hasChildExplicitPrices: Object.keys(explicitChildMap).length > 0,
    pricingMode: "fixed",
    treatChildrenAsAdults: normalizedTarget === "child",
    convertedChildToAdultMap,
    passengerSelection,
    tariff: {
      ...(service.tariff || {}),
      precio: round2(unitPrice || 0),
      precio_original: round2((unitPrice || 0) * (normalizedTarget === "child" ? childIds.length : adultIds.length)),
      childExtrasTotal: childExplicitSum,
      precio_original_with_child_extras: round2(
        (unitPrice || 0) * (normalizedTarget === "child" ? childIds.length : adultIds.length) + childExplicitSum,
      ),
    },
  };
};

export const splitTicketServiceByUserTypeForRuntime = (service = {}) => {
  if (getServiceType(service) !== "tickets") return [service];

  const procedencia = normalizeTicketProcedencia(
    service?.ticketProcedenciaFilter ||
      getPassengerSelectionFromService(service)?.ticketProcedenciaFilter ||
      getTicketProcedencia(service),
  );
  if (!procedencia) return [service];

  const targetGroup = getTicketServiceTargetGroup(service);
  if (targetGroup === "adult" || targetGroup === "child") return [service];

  const selectedIds = getServiceSelectedIds(service);
  const adultIds = selectedIds.filter((id) => String(id).startsWith("adult:"));
  const childIds = selectedIds.filter((id) => String(id).startsWith("child:"));
  const adultRate = getTicketAdultRate(service) || service.childService || service;
  const childRate = getTicketChildRate(service);
  const hasStudentTariff = hasTicketStudentTariff(service);
  const adultUnitPrice = resolveTicketAdultUnitPrice({ ...service, ticketAdultRate: adultRate });
  const childUnitPrice = childRate ? getTicketRatePrice(childRate) ?? resolveTicketChildUnitPrice(service, {}) : 0;
  const services = [];

  if (adultIds.length > 0 || (!hasStudentTariff && childIds.length > 0)) {
    services.push(buildTicketServiceCloneForTarget({
      service,
      targetGroup: hasStudentTariff ? "adult" : "all",
      unitPrice: adultUnitPrice,
      childRate: hasStudentTariff ? null : { ...(adultRate || {}), precio: 0, tipo_usuario: "gratis" },
      adultRate,
      childPriceMap: buildZeroChildPriceMap(childIds),
      selectedIds: hasStudentTariff ? adultIds : [...adultIds, ...childIds],
      procedencia,
    }));
  }

  if (hasStudentTariff && childIds.length > 0) {
    services.push(buildTicketServiceCloneForTarget({
      service,
      targetGroup: "child",
      unitPrice: childUnitPrice,
      childRate,
      adultRate: childRate,
      selectedIds: childIds,
      procedencia,
    }));
  }

  return services.length > 0 ? services : [service];
};

export const prepareTicketServicesForRuntime = (services = []) =>
  asArray(services).flatMap((service) => splitTicketServiceByUserTypeForRuntime(service));

export const expandTicketServiceForPersistence = (service = {}) => {
  if (getServiceType(service) !== "tickets") return [service];

  const childService = service?.childService || service;
  const selection = getPassengerSelectionFromService(service) || {};
  const procedencia = normalizeTicketProcedencia(
    service?.ticketProcedenciaFilter ||
      selection?.ticketProcedenciaFilter ||
      getTicketProcedencia(service),
  );

  if (!procedencia) return [service];

  const selectedIds = getServiceSelectedIds(service);
  const adultIds = selectedIds.filter((id) => String(id).startsWith("adult:"));
  const childIds = selectedIds.filter((id) => String(id).startsWith("child:"));
  const childPriceMapForService = getServiceChildPriceMap(service);
  const convertedChildIds = new Set(getConvertedChildIdsFromService(service));
  const ticketChildPricingMode =
    service?.ticketChildPricingMode ||
    selection?.ticketChildPricingMode ||
    (Object.keys(childPriceMapForService).length > 0 ? "student_tariff" : "student_tariff");
  const persistChildrenAsStudentAdults = ticketChildPricingMode !== "manual";

  const makeTicketChildService = ({
    ids,
    unitPrice,
    tipoUsuario = "estudiante",
    asAdultEquivalent = true,
    explicitPriceMap = {},
  }) => {
    if (!ids.length) return null;

    const explicitSum = round2(
      Object.values(explicitPriceMap).reduce(
        (sum, value) => sum + Number(value || 0),
        0,
      ),
    );
    const convertedChildToAdultMap = asAdultEquivalent
      ? buildChildConvertedMap(ids)
      : {};
    const passengerSelection = {
      selectedIds: ids,
      ids,
      assignedPassengerCount: ids.length,
      forcedPaxForDivision: asAdultEquivalent ? ids.length : 0,
      preventFallbackPassengerCount: true,
      ticketProcedenciaFilter: procedencia,
      ticketPassengerTargetGroup: "child",
      ticketChildPricingMode: asAdultEquivalent ? "student_tariff" : "manual",
      ticketChildrenUseStudentTariffAsAdult: asAdultEquivalent,
      pricingMode: asAdultEquivalent ? "fixed" : "manual",
      treatChildrenAsAdults: asAdultEquivalent,
      convertedChildToAdultMap,
      ninosComoAdulto: convertedChildToAdultMap,
      assignedChildExplicitPriceMap: asAdultEquivalent ? {} : explicitPriceMap,
      assignedChildExplicitPriceSum: asAdultEquivalent ? 0 : explicitSum,
      assignedChildExplicitCount: asAdultEquivalent ? 0 : Object.keys(explicitPriceMap).length,
      hasChildExplicitPrices: !asAdultEquivalent && Object.keys(explicitPriceMap).length > 0,
    };

    return {
      ...service,
      childService: {
        ...(getTicketChildRate(service) || childService || {}),
        entrada: getTicketEntrada(service),
        ticketEntryGroup: getTicketEntrada(service),
        ticketEntrada: getTicketEntrada(service),
        procedencia,
        ticketProcedenciaGroup: procedencia,
        tipo_usuario: tipoUsuario,
        ticketTipoUsuarioGroup: tipoUsuario,
      },
      ticketProcedenciaFilter: procedencia,
      ticketPassengerTargetGroup: "child",
      ticketChildPricingMode: asAdultEquivalent ? "student_tariff" : "manual",
      ticketChildrenUseStudentTariffAsAdult: asAdultEquivalent,
      assignedPassengerIds: ids,
      assignedPassengerCount: ids.length,
      assignedChildExplicitPriceMap: asAdultEquivalent ? {} : explicitPriceMap,
      assignedChildExplicitPriceSum: asAdultEquivalent ? 0 : explicitSum,
      assignedChildExplicitCount: asAdultEquivalent ? 0 : Object.keys(explicitPriceMap).length,
      hasChildExplicitPrices: !asAdultEquivalent && Object.keys(explicitPriceMap).length > 0,
      pricingMode: asAdultEquivalent ? "fixed" : "manual",
      treatChildrenAsAdults: asAdultEquivalent,
      convertedChildToAdultMap,
      passengerSelection,
      tariff: {
        ...(service?.tariff || {}),
        precio: asAdultEquivalent ? round2(unitPrice || 0) : 0,
        precio_original: asAdultEquivalent ? round2((unitPrice || 0) * ids.length) : 0,
        childExtrasTotal: asAdultEquivalent ? 0 : explicitSum,
        precio_original_with_child_extras: asAdultEquivalent
          ? round2((unitPrice || 0) * ids.length)
          : explicitSum,
      },
    };
  };

  // Si el servicio ya representa una tarifa estudiante individual, se persiste
  // según su modo actual: por defecto como niños-as-adultos; si fue configurado
  // manualmente desde sr__children, como beneficiarios_ninos con precio explícito.
  if (isTicketStudentService(service)) {
    const studentIds = childIds.length > 0 ? childIds : getConvertedChildIdsFromService(service);
    if (studentIds.length === 0) return [];

    const studentUnitPrice = resolveTicketAdultUnitPrice(service);
    const manualMap = studentIds.reduce((acc, childId) => {
      const mapped = childPriceMapForService[childId];
      acc[childId] = round2(Number.isFinite(Number(mapped)) ? Number(mapped) : studentUnitPrice || 0);
      return acc;
    }, {});

    const studentService = makeTicketChildService({
      ids: studentIds,
      unitPrice: studentUnitPrice,
      tipoUsuario: "estudiante",
      asAdultEquivalent: persistChildrenAsStudentAdults,
      explicitPriceMap: manualMap,
    });
    return studentService ? [studentService] : [];
  }

  const adultUnitPrice = resolveTicketAdultUnitPrice(service);
  const childRate = getTicketChildRate(service);
  const childUnitPrice = childRate
    ? getTicketRatePrice(childRate) ?? resolveTicketChildUnitPrice(service, {})
    : null;
  const hasStudentTariff = Boolean(
    childRate && normalizeTicketText(getTicketTipoUsuario(childRate)).includes("estudiante"),
  );

  const expanded = [];
  const childIdsWithAdultTariff = childIds.filter((id) => convertedChildIds.has(id));
  const childIdsForStudentTariff = childIds.filter((id) => !convertedChildIds.has(id));

  if (adultIds.length > 0 || (!hasStudentTariff && childIds.length > 0) || childIdsWithAdultTariff.length > 0) {
    const adultSelectedIds = hasStudentTariff
      ? [...adultIds, ...childIdsWithAdultTariff]
      : [...adultIds, ...childIds];
    const zeroChildPriceMap = hasStudentTariff ? {} : buildZeroChildPriceMap(childIdsForStudentTariff);
    const adultConvertedMap = buildChildConvertedMap(childIdsWithAdultTariff);
    const adultPassengerSelection = {
      ...(selection || {}),
      selectedIds: adultSelectedIds,
      ids: adultSelectedIds,
      assignedPassengerCount: adultSelectedIds.length,
      forcedPaxForDivision: adultIds.length + childIdsWithAdultTariff.length,
      preventFallbackPassengerCount: true,
      ticketProcedenciaFilter: procedencia,
      ticketPassengerTargetGroup: "adult",
      ticketChildPricingMode,
      ticketChildrenUseStudentTariffAsAdult: persistChildrenAsStudentAdults,
      pricingMode: "fixed",
      treatChildrenAsAdults: childIdsWithAdultTariff.length > 0,
      convertedChildToAdultMap: adultConvertedMap,
      ninosComoAdulto: adultConvertedMap,
      assignedChildExplicitPriceMap: zeroChildPriceMap,
      assignedChildExplicitPriceSum: 0,
      assignedChildExplicitCount: Object.keys(zeroChildPriceMap).length,
      hasChildExplicitPrices: Object.keys(zeroChildPriceMap).length > 0,
    };

    expanded.push({
      ...service,
      childService: {
        ...(getTicketAdultRate(service) || childService || {}),
        entrada: getTicketEntrada(service),
        ticketEntryGroup: getTicketEntrada(service),
        ticketEntrada: getTicketEntrada(service),
        procedencia,
        ticketProcedenciaGroup: procedencia,
        tipo_usuario: "adulto",
        ticketTipoUsuarioGroup: "adulto",
      },
      ticketProcedenciaFilter: procedencia,
      ticketPassengerTargetGroup: "adult",
      ticketChildPricingMode,
      ticketChildrenUseStudentTariffAsAdult: persistChildrenAsStudentAdults,
      assignedPassengerIds: adultSelectedIds,
      assignedPassengerCount: adultSelectedIds.length,
      assignedChildExplicitPriceMap: zeroChildPriceMap,
      assignedChildExplicitPriceSum: 0,
      assignedChildExplicitCount: Object.keys(zeroChildPriceMap).length,
      hasChildExplicitPrices: Object.keys(zeroChildPriceMap).length > 0,
      pricingMode: "fixed",
      treatChildrenAsAdults: childIdsWithAdultTariff.length > 0,
      convertedChildToAdultMap: adultConvertedMap,
      passengerSelection: adultPassengerSelection,
      tariff: {
        ...(service?.tariff || {}),
        precio: round2(adultUnitPrice || 0),
        precio_original: round2((adultUnitPrice || 0) * (adultIds.length + childIdsWithAdultTariff.length)),
        childExtrasTotal: 0,
        precio_original_with_child_extras: round2(
          (adultUnitPrice || 0) * (adultIds.length + childIdsWithAdultTariff.length),
        ),
      },
    });
  }

  if (childIdsForStudentTariff.length > 0 && hasStudentTariff) {
    const fallbackStudentPrice = Number.isFinite(Number(childUnitPrice))
      ? Number(childUnitPrice)
      : resolveTicketChildUnitPrice(service, {});
    const childMap = childIdsForStudentTariff.reduce((acc, childId) => {
      const value = childPriceMapForService[childId];
      acc[childId] = round2(Number.isFinite(Number(value)) ? Number(value) : fallbackStudentPrice || 0);
      return acc;
    }, {});

    if (persistChildrenAsStudentAdults) {
      const groupsByPrice = childIdsForStudentTariff.reduce((acc, childId) => {
        const price = childMap[childId];
        const key = price.toFixed(2);
        if (!acc[key]) acc[key] = [];
        acc[key].push(childId);
        return acc;
      }, {});

      Object.entries(groupsByPrice).forEach(([price, ids]) => {
        const studentService = makeTicketChildService({
          ids,
          unitPrice: Number(price),
          tipoUsuario: "estudiante",
          asAdultEquivalent: true,
        });
        if (studentService) expanded.push(studentService);
      });
    } else {
      const studentService = makeTicketChildService({
        ids: childIdsForStudentTariff,
        unitPrice: 0,
        tipoUsuario: "estudiante",
        asAdultEquivalent: false,
        explicitPriceMap: childMap,
      });
      if (studentService) expanded.push(studentService);
    }
  }

  return expanded.length > 0 ? expanded : [service];
};

export const consolidateTicketServicesByEntradaProcedencia = (
  services = [],
) => {
  const result = [];
  const groups = new Map();

  asArray(services).forEach((service, index) => {
    if (getServiceType(service) !== "tickets") {
      result.push({ type: "service", service, index });
      return;
    }

    const entrada = getTicketEntrada(service);
    const procedencia = normalizeTicketProcedencia(
      service?.ticketProcedenciaFilter ||
        getPassengerSelectionFromService(service)?.ticketProcedenciaFilter ||
        getTicketProcedencia(service),
    );

    if (!entrada || !procedencia) {
      result.push({ type: "service", service, index });
      return;
    }

    const key = `${normalizeTicketText(entrada)}::${procedencia}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        entrada,
        procedencia,
        firstIndex: index,
        adultService: null,
        childService: null,
        services: [],
      });
      result.push({ type: "group", key, index });
    }

    const group = groups.get(key);
    group.services.push(service);
    if (isTicketStudentService(service)) {
      group.childService = service;
    } else if (!group.adultService) {
      group.adultService = service;
    }
  });

  const buildMergedService = (group) => {
    const adultService = group.adultService || group.services[0];
    const childService = group.childService || null;
    const selectedIds = [];
    const childPriceMap = {};

    group.services.forEach((service) => {
      getServiceSelectedIds(service).forEach((id) => {
        if (!selectedIds.includes(id)) selectedIds.push(id);
      });
      Object.entries(getServiceChildPriceMap(service) || {}).forEach(([id, price]) => {
        childPriceMap[id] = price;
      });
    });

    // Cuando la cotización viene de BD puede existir un servicio ticket
    // estudiante separado. En ese caso los niños pueden venir como
    // beneficiarios_adultos con child_origin/ninosComoAdulto (modo estudiante
    // como adulto para persistencia), o como beneficiarios_ninos si el precio
    // fue configurado manualmente desde sr__children. Se reconstruye un único
    // estado runtime para que DaysEditor siga mostrando una fila por entrada +
    // procedencia, pero preservando el precio de estudiante.
    const childServiceConvertedIds = childService
      ? getConvertedChildIdsFromService(childService)
      : [];
    const childServiceExplicitMap = childService
      ? getServiceChildPriceMap(childService)
      : {};
    if (childService) {
      const childTicketUnitPrice = resolveTicketAdultUnitPrice(childService);
      childServiceConvertedIds.forEach((childId) => {
        if (!selectedIds.includes(childId)) selectedIds.push(childId);
        childPriceMap[childId] = round2(childTicketUnitPrice || 0);
      });
      Object.entries(childServiceExplicitMap).forEach(([childId, price]) => {
        if (!selectedIds.includes(childId)) selectedIds.push(childId);
        childPriceMap[childId] = round2(price || 0);
      });
    }
    const ticketChildPricingMode =
      childService &&
      Object.keys(childServiceExplicitMap).length > 0 &&
      childServiceConvertedIds.length === 0
        ? "manual"
        : "student_tariff";

    const mergedChildService = buildGroupedTicketChildService({
      entrada: group.entrada,
      procedencia: group.procedencia,
      adultService,
      childService,
    });
    const adultUnitPrice = resolveTicketAdultUnitPrice(adultService || {});
    const childExplicitSum = Object.values(childPriceMap).reduce(
      (sum, value) => sum + Number(value || 0),
      0,
    );
    const adultIds = selectedIds.filter((id) => String(id).startsWith("adult:"));
    const passengerSelection = {
      ...(getPassengerSelectionFromService(adultService) || {}),
      selectedIds,
      ids: selectedIds,
      assignedPassengerCount: selectedIds.length,
      forcedPaxForDivision: adultIds.length,
      preventFallbackPassengerCount: true,
      ticketProcedenciaFilter: group.procedencia,
      ticketPassengerTargetGroup: "all",
      pricingMode: "fixed",
      treatChildrenAsAdults: false,
      ticketChildPricingMode,
      ticketChildrenUseStudentTariffAsAdult: ticketChildPricingMode !== "manual",
      assignedChildExplicitPriceMap: childPriceMap,
      assignedChildExplicitPriceSum: round2(childExplicitSum),
      assignedChildExplicitCount: Object.keys(childPriceMap).length,
      hasChildExplicitPrices: Object.keys(childPriceMap).length > 0,
    };

    return {
      ...adultService,
      childService: mergedChildService,
      ticketProcedenciaFilter: group.procedencia,
      ticketPassengerTargetGroup: "all",
      assignedPassengerIds: selectedIds,
      assignedPassengerCount: selectedIds.length,
      assignedChildExplicitPriceMap: childPriceMap,
      assignedChildExplicitPriceSum: round2(childExplicitSum),
      assignedChildExplicitCount: Object.keys(childPriceMap).length,
      hasChildExplicitPrices: Object.keys(childPriceMap).length > 0,
      pricingMode: "fixed",
      treatChildrenAsAdults: false,
      ticketChildPricingMode,
      ticketChildrenUseStudentTariffAsAdult: ticketChildPricingMode !== "manual",
      passengerSelection,
      tariff: {
        ...(adultService?.tariff || {}),
        precio: round2(adultUnitPrice || adultService?.tariff?.precio || 0),
        precio_original: round2((adultUnitPrice || 0) * adultIds.length),
        childExtrasTotal: round2(childExplicitSum),
        precio_original_with_child_extras: round2(
          (adultUnitPrice || 0) * adultIds.length + childExplicitSum,
        ),
      },
    };
  };

  return result.map((entry) => {
    if (entry.type === "service") return entry.service;
    const group = groups.get(entry.key);
    return buildMergedService(group);
  });
};
