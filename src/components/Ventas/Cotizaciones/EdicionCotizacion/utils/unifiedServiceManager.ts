import {
  getHotelRoomCapacity,
  isExtraBedRoomType,
} from "../../../../../utils/hotelRoomTypes";
import { serviceHasPeruvianBeneficiary } from "./igvUtils";
import {
  detectServiceType,
  getServiceName,
  getServiceCapacity,
} from "../components/DaysEditor/utils/serviceTypeMapper";
import {
  buildPersistedPassengerSelection,
  buildRuntimePassengerSelection,
  getPassengerSlotKey,
  getServicePassengerPricingState,
  mergePassengerPricingIntoTariff,
} from "./passengerPricingState";
import { applyServicePricingRuntime } from "./servicePricingRuntime";
import {
  buildTicketProcedenciaPassengerSelection as buildTicketProcedenciaPassengerSelectionShared,
  expandTicketServiceForPersistence,
  prepareTicketServicesForRuntime,
} from "./ticketBeneficiaries";


export const getTourCapacity = (service = {}) => {
  const raw =
    service?.capacidad ??
    service?.tour?.capacidad ??
    service?.childService?.capacidad ??
    service?.childService?.tour?.capacidad ??
    null;
  const capacidad = Number(raw);
  return Number.isFinite(capacidad) && capacidad >= 1
    ? Math.floor(capacidad)
    : null;
};

const limitIdsToCapacity = (ids = [], capacidad = null) => {
  if (!capacidad || capacidad < 1 || !Array.isArray(ids)) return ids;
  return [...new Set(ids.map(String).filter(Boolean))].slice(0, capacidad);
};

/**
 * Para transportes, nro_pasajeros es capacidad maxima. No divide precio.
 * El divisor real son los beneficiarios cobrables del servicio.
 */
const getTransportDivisor = (baseDivisor) =>
  Math.max(1, Number(baseDivisor) || 1);

export const determineServiceCategory = (parentService, childService) => {
  // Primero verificar typeService explícito en parentService
  if (parentService?.typeService && parentService.typeService !== "otros") {
    return parentService.typeService;
  }

  // Detectar servicios extras explícitamente
  if (
    parentService?.typeService === "extras" ||
    (parentService?.nombre &&
      childService?.nombre &&
      !parentService.id_hotel &&
      !parentService.id_transporte &&
      !parentService.nombre_transporte &&
      !parentService.tipo_tour)
  ) {
    return "extras";
  }

  // Mapeo de campos clave a categorías basado en la estructura real de datos
  if (parentService) {
    // Hoteles
    if (
      parentService.nombre &&
      (parentService.categoria?.toLowerCase().includes("hotel") ||
        parentService.id_hotel)
    ) {
      return "hoteles";
    }

    // Transportes
    if (parentService.nombre_transporte || parentService.id_transporte) {
      return "transportes";
    }

    // Trenes - identificar por nombre_empresa + childService con id_vagon (directo o anidado)
    if (
      parentService.nombre_empresa &&
      (childService?.id_vagon || childService?.vagon?.id_vagon)
    ) {
      return "trenes";
    }

    // Endoses - identificar por tipo_tour o id_endose
    if (parentService.tipo_tour || parentService.id_endose) {
      return "endoses";
    }

    // Guías - identificar por estructura guia/persona
    if (parentService.guia?.id_guia || parentService.persona?.id_persona) {
      return "guias";
    }

    // Vuelos
    if (parentService.aerolinea || parentService.id_vuelo) {
      return "vuelos";
    }
  }

  // Si no hay parentService o no se pudo determinar, revisar childService
  if (childService) {
    // Restaurantes (servicios independientes)
    if (childService.nombre_restaurante || childService.tipo_cocina) {
      return "restaurantes";
    }

    // Tickets (servicios independientes)
    if (
      childService.entrada ||
      childService.tipo_usuario ||
      childService.procedencia
    ) {
      return "tickets";
    }
  }

  return "otros";
};

const normalizeTicketText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const isTicketPeruvianPassenger = (passenger = {}) => {
  const country = normalizeTicketText(
    passenger?.pais ||
      passenger?.pais_nacionalidad ||
      passenger?.nacionalidad ||
      passenger?.country ||
      passenger?.nationality ||
      passenger?.documentCountry ||
      passenger?.document_country ||
      "",
  );
  return country === "peru" || country === "peruano" || country === "peruana" || country === "pe";
};

const getTicketProcedencia = (childService = {}) =>
  childService?.ticket?.procedencia ||
  childService?.procedencia ||
  childService?.procedence ||
  "";

const normalizeTicketProcedencia = (value) => {
  const normalized = normalizeTicketText(value);
  if (!normalized) return "";
  if (
    normalized.includes("nacional") ||
    normalized.includes("peru") ||
    normalized.includes("peruano") ||
    normalized.includes("peruana")
  ) {
    return "nacional";
  }
  if (
    normalized.includes("extranj") ||
    normalized.includes("foreign") ||
    normalized.includes("internacional")
  ) {
    return "extranjero";
  }
  return "";
};

const getTicketUserTargetGroup = (childService = {}) => {
  const tipoUsuario = normalizeTicketText(
    childService?.ticket?.tipo_usuario || childService?.tipo_usuario || "",
  );

  if (
    tipoUsuario.includes("nino") ||
    tipoUsuario.includes("nina") ||
    tipoUsuario.includes("menor") ||
    tipoUsuario.includes("child")
  ) {
    return "child";
  }

  return "adult";
};

const getPeopleByTicketTarget = (peopleDetails = {}, targetGroup = "adult") => {
  if (targetGroup === "child") {
    if (Array.isArray(peopleDetails?.children)) return peopleDetails.children;
    if (Array.isArray(peopleDetails?.details)) {
      return peopleDetails.details.filter((passenger) => {
        const type = normalizeTicketText(
          passenger?.tipo_pasajero ||
            passenger?.tipoPasajero ||
            passenger?.passenger_type ||
            passenger?.type ||
            "",
        );
        const key = String(
          passenger?.passenger_key || passenger?.passengerKey || "",
        ).toLowerCase();
        return type === "child" || type.includes("nino") || key.startsWith("child");
      });
    }
    return [];
  }

  if (Array.isArray(peopleDetails?.adults)) return peopleDetails.adults;
  if (Array.isArray(peopleDetails?.details)) {
    return peopleDetails.details.filter((passenger) => {
      const type = normalizeTicketText(
        passenger?.tipo_pasajero ||
          passenger?.tipoPasajero ||
          passenger?.passenger_type ||
          passenger?.type ||
          "",
      );
      const key = String(
        passenger?.passenger_key || passenger?.passengerKey || "",
      ).toLowerCase();
      return type !== "child" && !type.includes("nino") && !key.startsWith("child");
    });
  }
  return [];
};

const buildTicketProcedenciaPassengerSelection = ({
  childService = {},
  peopleDetails = {},
  passengerSelection = null,
} = {}) => {
  const procedencia = normalizeTicketProcedencia(getTicketProcedencia(childService));
  if (!procedencia) return passengerSelection;

  const targetGroup = getTicketUserTargetGroup(childService);
  const passengers = getPeopleByTicketTarget(peopleDetails, targetGroup);
  const selectedIds = passengers
    .map((passenger, index) => ({
      passenger,
      id: makeRowId(passenger, index, targetGroup),
    }))
    .filter(({ passenger }) => {
      const isPeruvian = isTicketPeruvianPassenger(passenger);
      return procedencia === "nacional" ? isPeruvian : !isPeruvian;
    })
    .map(({ id }) => id);

  const baseSelection =
    passengerSelection &&
    typeof passengerSelection === "object" &&
    !Array.isArray(passengerSelection)
      ? passengerSelection
      : {};

  return {
    ...baseSelection,
    selectedIds,
    ids: selectedIds,
    assignedPassengerCount: selectedIds.length,
    forcedPaxForDivision: selectedIds.length,
    preventFallbackPassengerCount: true,
    ticketProcedenciaFilter: procedencia,
    ticketPassengerTargetGroup: targetGroup,
  };
};

export const getTotalPassengerCount = (peopleDetails) => {
  if (!peopleDetails) return 1;

  if (
    Array.isArray(peopleDetails.details) &&
    peopleDetails.details.length > 0
  ) {
    return Math.max(1, peopleDetails.details.length);
  }

  const adults = Array.isArray(peopleDetails.adults)
    ? peopleDetails.adults.length
    : 0;
  const children = Array.isArray(peopleDetails.children)
    ? peopleDetails.children.length
    : 0;
  const infants = Array.isArray(peopleDetails.infants)
    ? peopleDetails.infants.length
    : 0;

  return Math.max(1, adults + children + infants);
};

export const getRoomCapacity = (roomOrType) =>
  getHotelRoomCapacity(roomOrType, 2);

export const shouldApplyIGV = (
  service,
  peopleDetails,
  passengerSelection = null,
) => {
  const parentService = service.parentService || service;
  const typeService = (parentService.typeService || "").toLowerCase();

  const isHotel =
    typeService === "hoteles" ||
    typeService.includes("hotel") ||
    (parentService.nombre &&
      parentService.nombre.toLowerCase().includes("hotel"));

  if (!isHotel) return false;

  // IGV is room/service scoped. The presence of a Peruvian passenger in the
  // quote must not add IGV to unrelated rooms occupied only by foreigners.
  return serviceHasPeruvianBeneficiary(
    service,
    peopleDetails,
    passengerSelection,
  );
};

export const calculateBasePrice = (
  service,
  peopleDetails,
  packageType = "compartido",
) => {
  const parentService = service.parentService || service;
  const childService = service.childService || service;
  const tariff = service.tariff || {};

  let basePrice = 0;

  // Si el tariff tiene precio directo, usarlo
  if (tariff.precio_original || tariff.precio) {
    basePrice = parseFloat(tariff.precio_original || tariff.precio || 0);
  }
  // Si es del ServicePicker, buscar en childService.tarifas
  else if (childService.tarifas && childService.tarifas.length > 0) {
    const serviceTariff = childService.tarifas[0]; // Usar la primera tarifa
    const priceField =
      packageType === "privado" ? "precio_privado" : "precio_compartido";
    basePrice = parseFloat(
      serviceTariff[priceField] || serviceTariff.precio_compartido || 0,
    );
  }
  // Si es del ServicePicker con habitacion anidada
  else if (childService.habitacion && childService.habitacion.tarifas) {
    const serviceTariff = childService.habitacion.tarifas[0];
    const priceField =
      packageType === "privado" ? "precio_privado" : "precio_compartido";
    basePrice = parseFloat(
      serviceTariff[priceField] || serviceTariff.precio_compartido || 0,
    );
  }

  // Si es hotel, calcular precio por capacidad de habitación
  if (parentService.typeService === "hoteles" && basePrice > 0) {
    const roomCapacity = getHotelRoomCapacity(childService, 2);
    // Dividir precio base entre la capacidad real de la habitación.
    basePrice = basePrice / roomCapacity;
  }

  return basePrice;
};

export const calculateFinalPrice = (basePrice, applyIGV = false) => {
  let finalPrice = basePrice;

  // Aplicar IGV si corresponde
  if (applyIGV) {
    finalPrice = finalPrice * 1.18; // 18% IGV
  }

  return Math.round(finalPrice * 100) / 100; // Redondear a 2 decimales
};

const parseNumber = (v) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

const extractSelectionInfo = (selectionArg, peopleDetails) => {
  console.log("extractSelectionInfo >>>", { selectionArg, peopleDetails });
  // --- 1) normaliza el shape: directo o envuelto ---
  const sel = (() => {
    const s = selectionArg ?? {};
    if (Array.isArray(s.selectedIds) || Array.isArray(s.selectedPassengers))
      return s;
    if (Array.isArray(s.ids)) return s;
    if (s.passengerSelection) return s.passengerSelection; // <-- tu caso
    if (s.selection) return s.selection;
    if (s.data) return s.data;
    if (s.ids) return s.ids;
    return s;
  })();
  console.log("Normalized selection object:", sel);

  // --- helpers seguros ---
  const toNum = (v) => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
      const cleaned = v.replace(/[^\d.,-]/g, "").replace(",", ".");
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const isChildId = (id) => String(id).startsWith("child:");

  const toArray = (v) => {
    if (Array.isArray(v)) return v;
    if (!v) return [];
    if (typeof v === "string") {
      try {
        const j = JSON.parse(v);
        if (Array.isArray(j)) return j;
      } catch (_) {}
      return v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return typeof v[Symbol.iterator] === "function" ? [...v] : [];
  };

  // Usa selectedIds si existe; si no, cae a selectedPassengers.map(p => p.id)
  const paxObjs = Array.isArray(sel.selectedPassengers)
    ? sel.selectedPassengers
    : Array.isArray(sel.chosen)
      ? sel.chosen
      : [];

  // 1 Primero: selectedIds (formato del modal)
  let idsRaw = toArray(sel.selectedIds);

  // 2 Segundo: ids (formato que manda DaysEditor cuando auto-selecciona adultos)
  if (!idsRaw.length) {
    idsRaw = toArray(sel.ids);
  }

  // 3 Si aún no hay IDs, reconstruimos algo desde los pasajeros
  if (!idsRaw.length && paxObjs.length) {
    // Si en algún momento les pones rowId en el modal, esto lo respetaría.
    idsRaw = paxObjs.map((p) => String(p.rowId || p.id || ""));
  }

  idsRaw = idsRaw.filter(Boolean);
  const ids = [...new Set(idsRaw.map(String))];

  console.log({ idsRaw, ids, paxObjs });

  const childMap =
    sel.childPriceMap ??
    sel.assignedChildExplicitPriceMap ??
    sel.assigned_child_explicit_price_map ??
    {};

  // NUEVO: Extraer información de porcentajes y modo de tratamiento de niños
  // Modos: 'adult' = niños como adultos (incluidos en división), 'percentage' = % del adulto, 'fixed' = precio fijo
  const pricingMode = sel.pricingMode || "percentage";
  // Determinar treatChildrenAsAdults: verdadero si el pricingMode es 'adult' O si está explícitamente configurado
  const treatChildrenAsAdults =
    pricingMode === "adult" || sel.treatChildrenAsAdults === true;
  const childPercentageMap = sel.childPercentageMap || {};
  const uniformPercentage = sel.uniformPercentage || "";

  const priceOfChild = (id) => {
    let v = childMap[id];
    if (v === undefined) {
      const p = paxObjs.find((pp) => pp.id === id);
      v = p?.childPrice;
    }
    return toNum(v);
  };

  const forcedPaxForDivision = toNum(
    sel.forcedPaxForDivision ?? sel.forcePaxForDivision,
  );
  const preventFallbackPassengerCount =
    sel.preventFallbackPassengerCount === true;

  const explicitChildIds = ids.filter(
    (id) => isChildId(id) && priceOfChild(id) != null,
  );
  const explicitChildCount = explicitChildIds.length;
  const childExtrasTotal = explicitChildIds.reduce(
    (sum, id) => sum + (priceOfChild(id) ?? 0),
    0,
  );

  const excludeAllChildren = !!sel.excludeAllChildrenFromDivision;

  // MODIFICADO: divisor real considerando tratamiento de niños
  const paxForDivision = (() => {
    if (forcedPaxForDivision !== null) {
      return Math.max(0, forcedPaxForDivision);
    }

    if (ids.length) {
      const filtered = ids.filter((id) => {
        // Adultos siempre cuentan para la división
        if (!isChildId(id)) return true;
        // Si tratamos niños como adultos, también cuentan
        if (treatChildrenAsAdults) return true;
        // Excluir niños según configuración
        if (excludeAllChildren) return false;
        // Excluir TODOS los niños cuando estamos en modo porcentaje
        if (pricingMode === "percentage") return false;
        // Excluir si tiene precio explícito
        if (priceOfChild(id) != null) return false;
        return true;
      });
      return Math.max(1, filtered.length);
    }
    if (preventFallbackPassengerCount) return 0;

    // fallback a peopleDetails cuando no hay selección
    const adults = Number(peopleDetails?.adults?.length || 0);
    const children = Number(peopleDetails?.children?.length || 0);
    const infants = Number(peopleDetails?.infants?.length || 0);

    // Si tratamos niños como adultos, contarlos
    if (treatChildrenAsAdults) {
      return Math.max(1, adults + children + infants);
    }
    // En modo porcentaje, solo contar adultos
    if (pricingMode === "percentage") {
      return Math.max(1, adults);
    }
    return Math.max(1, adults + (excludeAllChildren ? 0 : children) + infants);
  })();

  const paxAssigned =
    ids.length ||
    (forcedPaxForDivision !== null ? forcedPaxForDivision : null) ||
    (preventFallbackPassengerCount
      ? 0
      : Number(peopleDetails?.adults?.length || 0) +
        Number(peopleDetails?.children?.length || 0) +
        Number(peopleDetails?.infants?.length || 0));

  // Logs útiles para depurar (quítalos en prod)
  // console.log({ sel, ids, explicitChildIds, explicitChildCount, paxForDivision, paxAssigned, childExtrasTotal });

  console.log(" Percentage data extracted:", {
    pricingMode,
    childPercentageMap,
    uniformPercentage,
    selectedChildIds: ids.filter(isChildId),
  });

  return {
    ids,
    paxAssigned,
    explicitChildCount,
    paxForDivision,
    childExtrasTotal,
    childMap,
    explicitChildIds,
    nonExplicitChildIds: ids.filter(
      (id) => isChildId(id) && !explicitChildIds.includes(id),
    ),
    adultCount: ids.filter((id) => !isChildId(id)).length,
    // NUEVO: información de porcentajes para cálculo posterior
    pricingMode,
    childPercentageMap,
    uniformPercentage,
    treatChildrenAsAdults,
    convertedChildToAdultMap: sel.convertedChildToAdultMap || {},
    selectedChildIds: ids.filter(isChildId),
    forcedPaxForDivision,
    preventFallbackPassengerCount,
    ticketProcedenciaFilter: sel.ticketProcedenciaFilter || "",
    ticketPassengerTargetGroup: sel.ticketPassengerTargetGroup || "",
  };
};

export const createUnifiedService = (
  parentService,
  childService,
  tariff,
  peopleDetails,
  packageType = "compartido",
  // NUEVO
  passengerSelection = null,
) => {
  const typeService = determineServiceCategory(parentService, childService);
  const serviceId = `${typeService}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(passengerSelection);

  const effectivePassengerSelection =
    typeService === "tickets"
      ? buildTicketProcedenciaPassengerSelectionShared({
          childService,
          peopleDetails,
          passengerSelection,
        })
      : passengerSelection;
  const tourCapacity =
    typeService === "endoses" ? getTourCapacity(childService) : null;
  const capacityAwarePassengerSelection =
    tourCapacity != null
      ? limitPassengerSelectionToCapacity(
          effectivePassengerSelection,
          tourCapacity,
          peopleDetails,
        )
      : effectivePassengerSelection;

  // Selección (pax exactos + niños con precio)
  const sel = extractSelectionInfo(capacityAwarePassengerSelection, peopleDetails);
  const totalPassengers = getTotalPassengerCount(peopleDetails); // fallback general
  console.log("Extracted selection info:", sel);

  // IGV is applied only when this exact hotel service/room contains a
  // Peruvian beneficiary.
  const applyIGV = shouldApplyIGV(
    { parentService, passengerSelection: capacityAwarePassengerSelection },
    peopleDetails,
    capacityAwarePassengerSelection,
  );

  // Precio base desde tarifa
  let originalPrice = 0;
  if (tariff) {
    if (tariff.precio != null) {
      originalPrice = parseFloat(tariff.precio);
    } else {
      const priceField =
        packageType === "privado" ? "precio_privado" : "precio_compartido";
      originalPrice = parseFloat(
        tariff[priceField] ||
          tariff.precio_compartido ||
          tariff.precio_privado ||
          0,
      );
    }
  }
  const isTicketChildTarget =
    typeService === "tickets" && sel.ticketPassengerTargetGroup === "child";

  // NUEVO: Calcular precios de niños basados en porcentaje si el modo es 'percentage'
  let childExtrasFromPercentage = 0;
  let childPriceMapFromPercentage = {};

  if (sel.pricingMode === "percentage" && sel.selectedChildIds.length > 0) {
    const adultUnitPrice = originalPrice / Math.max(1, sel.adultCount || 1);

    sel.selectedChildIds.forEach((childId) => {
      // Obtener porcentaje individual o uniforme (si no hay, el niño tiene precio 0)
      const percentValue = parseFloat(
        sel.childPercentageMap[childId] || sel.uniformPercentage || 0,
      );

      // Solo asignar precio si hay un porcentaje configurado
      if (percentValue > 0) {
        const childPrice = (percentValue / 100) * adultUnitPrice;
        childPriceMapFromPercentage[childId] =
          Math.round(childPrice * 100) / 100;
        childExtrasFromPercentage += childPrice;
      } else {
        // Sin porcentaje = precio 0 para el niño
        childPriceMapFromPercentage[childId] = 0;
      }
    });

    console.log("Child prices from percentage:", {
      adultUnitPrice,
      childPriceMapFromPercentage,
      childExtrasFromPercentage,
      uniformPercentage: sel.uniformPercentage,
    });
  }

  if (isTicketChildTarget && sel.selectedChildIds.length > 0) {
    childPriceMapFromPercentage = sel.selectedChildIds.reduce((acc, childId) => {
      acc[childId] = Math.round(originalPrice * 100) / 100;
      return acc;
    }, {});
    childExtrasFromPercentage =
      Math.round(originalPrice * sel.selectedChildIds.length * 100) / 100;
  }

  // Usar childExtrasTotal del modal si es modo fijo, o el calculado si es porcentaje
  const effectiveChildExtrasTotal =
    sel.pricingMode === "percentage"
      ? childExtrasFromPercentage
      : sel.childExtrasTotal;

  let adjustedOriginalPrice = originalPrice; // base "total" del servicio
  let finalPrice = originalPrice; // precio mostrado (por persona / unitario)

  // Lógica por categoría usando paxForDivision (excluye niños con precio)
  if (typeService === "transportes" || typeService === "guias") {
    // precio total = tarifa del proveedor; precio unitario = total / divisor
    adjustedOriginalPrice = originalPrice;
    const effectiveDivisor =
      typeService === "transportes"
        ? getTransportDivisor(sel.paxForDivision, childService)
        : sel.paxForDivision;
    finalPrice = originalPrice / effectiveDivisor;
  } else if (typeService === "hoteles") {
    // hoteles: dividir por capacidad de habitación
    const capacity = getHotelRoomCapacity(childService, 2);
    adjustedOriginalPrice = originalPrice; // total por habitación/noche (como llega de API)
    finalPrice = originalPrice / Math.max(1, capacity);
  } else if (typeService === "endoses") {
    if (tourCapacity != null) {
      adjustedOriginalPrice = originalPrice;
      finalPrice = originalPrice / Math.max(1, tourCapacity);
    } else {
      // Venso trata los endoses sin capacidad como tarifas por persona.
      finalPrice = originalPrice;
      adjustedOriginalPrice = originalPrice * sel.paxForDivision;
    }
  } else if (
    typeService === "trenes" ||
    typeService === "vuelos" ||
    typeService === "restaurantes" ||
    typeService === "tickets"
  ) {
    // por persona: total = precio * beneficiarios.
    // Tickets con procedencia pueden tener 0 beneficiarios nacionales/extranjeros.
    const paxMultiplier =
      typeService === "tickets"
        ? Math.max(0, Number(sel.paxForDivision || 0))
        : sel.paxForDivision;
    finalPrice = originalPrice;
    adjustedOriginalPrice = isTicketChildTarget
      ? 0
      : originalPrice * paxMultiplier;
  } else if (typeService === "extras") {
    // extras: unitario; no se multiplica ni divide
    finalPrice = originalPrice;
    adjustedOriginalPrice = originalPrice;
  } else {
    // otros: por persona
    finalPrice = originalPrice;
    adjustedOriginalPrice = originalPrice * sel.paxForDivision;
  }

  // IGV (solo a base del proveedor, no a "extras niño" fijos)
  const originalWithIGV = applyIGV
    ? Math.round(adjustedOriginalPrice * 1.18 * 100) / 100
    : Math.round(adjustedOriginalPrice * 100) / 100;

  // Sumar precio de niños (fijo o calculado por porcentaje) SOLO al total, no al unitario
  const precioOriginalWithExtras = originalWithIGV + effectiveChildExtrasTotal;

  // Determinar mapa de precios de niños efectivo
  const effectiveChildPriceMap =
    sel.pricingMode === "percentage"
      ? childPriceMapFromPercentage
      : sel.childMap;

  const passengerPricingState = {
    selectedIds: sel.ids,
    assignedPassengerCount: sel.paxAssigned,
    assignedChildExplicitPriceMap: effectiveChildPriceMap,
    assignedChildExplicitPriceSum: effectiveChildExtrasTotal,
    assignedChildExplicitCount:
      sel.pricingMode === "percentage"
        ? Object.keys(childPriceMapFromPercentage).length
        : sel.explicitChildCount,
    hasChildExplicitPrices: Object.keys(effectiveChildPriceMap).length > 0,
    pricingMode: sel.pricingMode,
    childPercentageMap: sel.childPercentageMap,
    uniformPercentage: sel.uniformPercentage,
    treatChildrenAsAdults: sel.treatChildrenAsAdults,
    convertedChildToAdultMap: sel.convertedChildToAdultMap,
    ticketProcedenciaFilter: sel.ticketProcedenciaFilter,
    ticketPassengerTargetGroup: sel.ticketPassengerTargetGroup,
  };

  const unifiedTariff = mergePassengerPricingIntoTariff(
    {
      precio_original: originalWithIGV, // base "pura" (con IGV si aplica)
      precio: Math.round(finalPrice * 100) / 100, // unitario / por persona
      tieneIgv: applyIGV,
      tiene_igv: applyIGV,
      // NUEVO: usar el total efectivo (fijo o por porcentaje)
      childExtrasTotal: effectiveChildExtrasTotal,
      moneda: tariff.moneda,
      precio_original_with_child_extras:
        Math.round(precioOriginalWithExtras * 100) / 100,
      tipo_tarifa: packageType,
      precio_interno: tariff.precio_interno,
    },
    passengerPricingState,
  );

  const runtimePassengerSelection = buildRuntimePassengerSelection(
    capacityAwarePassengerSelection || {},
    passengerPricingState,
  );

  const finalParentService = parentService
    ? {
        ...parentService,
        typeService: typeService,
      }
    : { typeService: typeService };
  console.log(unifiedTariff);

  // Devolvemos todo con la asignación de pax para que DaysEditor pueda reusar
  return applyServicePricingRuntime({
    id: serviceId,
    typeService,
    parentService: finalParentService,
    childService: { ...childService, packageType },
    ...(typeService === "hoteles"
      ? {
          habitacion_capacidad: getHotelRoomCapacity(childService, 2),
          habitacion_es_cama_adicional: isExtraBedRoomType(childService),
        }
      : {}),
    tariff: unifiedTariff,
    hasProcessedIGV: false,
    passengerSelection: runtimePassengerSelection,
    // Flat pricing fields (available immediately, same as DB schema)
    precioServicio: originalPrice,
    moneda: tariff?.moneda || "dolares",
    igv: applyIGV,
    // Division flags for DB persistence (determined by service type)
    precioAdultoDividido:
      typeService === "transportes" ||
      typeService === "hoteles" ||
      typeService === "guias" ||
      (typeService === "endoses" && tourCapacity != null),
    capacidadLimite:
      typeService === "transportes" ||
      typeService === "hoteles" ||
      (typeService === "endoses" && tourCapacity != null),
    // NUEVO: guardamos asignación exacta
    assignedPassengerIds: sel.ids,
    assignedPassengerCount: sel.paxAssigned,
    assignedChildExplicitPriceMap: effectiveChildPriceMap,
    assignedChildExplicitPriceSum: effectiveChildExtrasTotal,
    assignedChildExplicitCount:
      passengerPricingState.assignedChildExplicitCount,
    hasChildExplicitPrices: passengerPricingState.hasChildExplicitPrices,
    // NUEVO: guardar información de porcentaje para futuras recalculaciones
    pricingMode: sel.pricingMode,
    childPercentageMap: sel.childPercentageMap,
    uniformPercentage: sel.uniformPercentage,
    treatChildrenAsAdults: sel.treatChildrenAsAdults,
    convertedChildToAdultMap: sel.convertedChildToAdultMap,
    ticketProcedenciaFilter: sel.ticketProcedenciaFilter,
    ticketPassengerTargetGroup: sel.ticketPassengerTargetGroup,
  });
};

export const updateSingleServicePricesForPassengerChange = (
  service,
  totalPassengers = 0,
) => {
  console.log("updateSingleServicePricesForPassengerChange >>>", {
    service,
    totalPassengers,
  });

  if (!service || typeof service !== "object") return service;

  const hasTariffStructure =
    service.tariff && typeof service.tariff === "object";
  if (!hasTariffStructure) return service;

  const parentService = service.parentService || service;
  const childService = service.childService || service;
  const typeService = (
    parentService.typeService || service.typeService || ""
  ).toLowerCase();
  const isEndose = typeService === "endoses";
  const tourCapacity = isEndose ? getTourCapacity(childService) : null;

  // =========================
  // 1. LEER passengerSelection + TOP-LEVEL (priorizar top-level)
  // =========================
  const selectionFromDB = buildRuntimePassengerSelection(
    service.passengerSelection || {},
    getServicePassengerPricingState(service),
  );
  const usesTicketProcedenciaFilter =
    typeService === "tickets" &&
    Boolean(
      service.ticketProcedenciaFilter ||
        service.passengerSelection?.ticketProcedenciaFilter ||
        selectionFromDB.ticketProcedenciaFilter,
    );
  const convertedChildToAdultMap = normalizeConvertedChildMapForCurrentPeople(
    service.convertedChildToAdultMap ||
      selectionFromDB.convertedChildToAdultMap ||
      {},
  );
  const convertedChildIdSet = new Set(Object.keys(convertedChildToAdultMap));

  // IDs seleccionados
  const topLevelIds = Array.isArray(service.assignedPassengerIds)
    ? [...service.assignedPassengerIds]
    : null;
  const dbIds = Array.isArray(selectionFromDB.selectedIds)
    ? [...selectionFromDB.selectedIds]
    : null;

  // PRIORIDAD: lo que viene actualizado desde el UI (top-level) > BD
  let assignedPassengerIds = topLevelIds ?? dbIds ?? [];
  assignedPassengerIds = limitIdsToCapacity(assignedPassengerIds, tourCapacity);

  // Mapa bruto de precios de niños (puede tener basura: null, string vacío, etc.)
  const rawChildMap = {
    ...(service.assignedChildExplicitPriceMap ||
      selectionFromDB.assignedChildExplicitPriceMap ||
      {}),
  };

  // =========================
  // 1.b NORMALIZAR MAPA DE PRECIOS DE NIÑOS
  // =========================
  const assignedChildExplicitPriceMap = {};

  assignedPassengerIds.forEach((id) => {
    if (!rawChildMap.hasOwnProperty(id)) return;
    if (convertedChildIdSet.has(id)) return;

    const v = rawChildMap[id];
    if (v === null || v === undefined || v === "") {
      // sin precio → NO se considera explícito, se tratará como niño normal
      return;
    }

    const n = Number(v);
    if (!Number.isNaN(n)) {
      // solo guardamos valores numéricos (incluye 0 como explícito, ej. niño free)
      assignedChildExplicitPriceMap[id] = n;
    }
  });

  const explicitValues = Object.values(assignedChildExplicitPriceMap);
  const assignedChildExplicitCount = explicitValues.length;
  const assignedChildExplicitPriceSum = explicitValues.reduce(
    (sum, v) => sum + v,
    0,
  );
  const hasChildExplicitPrices = assignedChildExplicitCount > 0;
  const pricingMode =
    service.pricingMode || selectionFromDB.pricingMode || "percentage";
  const treatChildrenAsAdults =
    pricingMode === "adult" ||
    service.treatChildrenAsAdults === true ||
    selectionFromDB.treatChildrenAsAdults === true;
  const childPercentageMap =
    service.childPercentageMap || selectionFromDB.childPercentageMap || {};
  const uniformPercentage =
    service.uniformPercentage || selectionFromDB.uniformPercentage || "";

  // Fallback general cuando no hay selección pero pasan totalPassengers
  const fallbackCount =
    typeof totalPassengers === "number" && totalPassengers > 0
      ? totalPassengers
      : 0;

  const assignedPassengerCount =
    assignedPassengerIds.length ||
    (usesTicketProcedenciaFilter ? 0 : fallbackCount || 1);

  // =========================
  // 1.c DIVISOR REAL (adultos + niños SIN precio explícito)
  // =========================
  const shouldExcludeChild = (id) => {
    if (!String(id).startsWith("child:")) return false;
    if (convertedChildIdSet.has(id)) return false;
    if (treatChildrenAsAdults) return false;
    if (pricingMode === "percentage") return true;
    return id in assignedChildExplicitPriceMap;
  };

  const getDivisor = () => {
    // Caso normal: tenemos IDs
    if (assignedPassengerIds.length > 0) {
      const idsSinPrecioExplicito = assignedPassengerIds.filter((id) => {
        if (!String(id).startsWith("child:")) return true;
        return !shouldExcludeChild(id);
      });
      // Si todos tienen precio explícito (caso raro) igual aseguramos mínimo 1,
      // excepto tickets filtrados por procedencia, donde puede ser 0.
      return usesTicketProcedenciaFilter
        ? Math.max(0, idsSinPrecioExplicito.length || 0)
        : Math.max(1, idsSinPrecioExplicito.length || 1);
    }

    // Fallback cuando no hay IDs (modo antiguo). Tickets con filtro de
    // procedencia pueden tener 0 beneficiarios y no deben cobrarse como 1 pax.
    const divisorFallback = assignedPassengerCount - assignedChildExplicitCount;
    if (usesTicketProcedenciaFilter) return Math.max(0, divisorFallback || 0);
    return Math.max(1, divisorFallback || 1);
  };

  const divisor = getDivisor();

  // =========================
  // 2. CLASIFICACIÓN DEL SERVICIO
  // =========================
  const isHotel =
    typeService === "hoteles" ||
    typeService.includes("hotel") ||
    (parentService.nombre &&
      parentService.nombre.toLowerCase().includes("hotel"));

  const isExtra =
    typeService === "extras" ||
    (parentService.nombre &&
      parentService.nombre.toLowerCase().includes("extra"));

  const isCapacityLimitedEndose = tourCapacity != null;

  let newTariff = { ...service.tariff };

  // =========================
  // 3. REGLAS POR TIPO DE SERVICIO
  // =========================

  // 3.a) TRANSPORTES / GUÍAS / ENDOS CON CAPACIDAD → total compartido.
  if (
    typeService === "transportes" ||
    typeService === "guias" ||
    isCapacityLimitedEndose
  ) {
    const originalPrice = parseFloat(newTariff.precio_original || 0) || 0;

    const effectiveDivisor =
      isCapacityLimitedEndose
        ? tourCapacity
        : typeService === "transportes"
        ? getTransportDivisor(divisor, childService)
        : divisor;
    const newPrice = originalPrice / effectiveDivisor;

    newTariff = {
      ...newTariff,
      precio: round2(newPrice),
      childExtrasTotal: round2(assignedChildExplicitPriceSum),
      precio_original_with_child_extras: round2(
        originalPrice + assignedChildExplicitPriceSum,
      ),
    };
  }

  // 3.b) ENDOS SIN CAPACIDAD → tarifa unitaria por persona
  else if (isEndose && !isCapacityLimitedEndose && !isHotel && !isExtra) {
    // precio actual lo consideramos "por persona"
    const basePricePerPerson = parseFloat(newTariff.precio || 0) || 0;

    const paxMultiplier =
      usesTicketProcedenciaFilter ? Math.max(0, divisor) : Math.max(1, divisor);
    const baseOriginal = basePricePerPerson * paxMultiplier;
    const childExtrasTotal =
      !treatChildrenAsAdults && pricingMode === "percentage"
        ? assignedPassengerIds.reduce((sum, id) => {
            if (!String(id).startsWith("child:")) return sum;
            if (convertedChildIdSet.has(id)) return sum;
            const percentValue = parseFloat(
              childPercentageMap[id] || uniformPercentage || 0,
            );
            return percentValue > 0
              ? sum + (percentValue / 100) * basePricePerPerson
              : sum;
          }, 0)
        : assignedChildExplicitPriceSum;
    const precioOriginalWithExtras = baseOriginal + childExtrasTotal;

    newTariff = {
      ...newTariff,
      precio_original: round2(baseOriginal),
      childExtrasTotal: round2(childExtrasTotal),
      precio_original_with_child_extras: round2(precioOriginalWithExtras),
    };
  }

  // 3.c) OTROS SERVICIOS (no hoteles, no extras)
  else if (!isHotel && !isExtra) {
    const basePricePerPerson = parseFloat(newTariff.precio || 0) || 0;

    const paxMultiplier =
      usesTicketProcedenciaFilter ? Math.max(0, divisor) : Math.max(1, divisor);
    const baseOriginal = basePricePerPerson * paxMultiplier;
    const childExtrasTotal =
      !treatChildrenAsAdults && pricingMode === "percentage"
      ? assignedPassengerIds.reduce((sum, id) => {
          if (!String(id).startsWith("child:")) return sum;
          if (convertedChildIdSet.has(id)) return sum;
          const percentValue = parseFloat(
              childPercentageMap[id] || uniformPercentage || 0,
            );
            return percentValue > 0
              ? sum + (percentValue / 100) * basePricePerPerson
              : sum;
          }, 0)
        : assignedChildExplicitPriceSum;
    const precioOriginalWithExtras = baseOriginal + childExtrasTotal;

    newTariff = {
      ...newTariff,
      precio_original: round2(baseOriginal),
      childExtrasTotal: round2(childExtrasTotal),
      precio_original_with_child_extras: round2(precioOriginalWithExtras),
    };
  }

  // 3.d) EXTRAS → precio fijo; solo sumamos extras de niños al total
  if (isExtra) {
    newTariff = {
      ...newTariff,
      childExtrasTotal: round2(assignedChildExplicitPriceSum),
      precio_original_with_child_extras: round2(
        (parseFloat(newTariff.precio_original || 0) || 0) +
          assignedChildExplicitPriceSum,
      ),
    };
  }

  // 3.e) HOTELES → lógica por habitación (no depende de selección)
  if (isHotel) {
    try {
      const storedPrecioServicio =
        service.precioServicio != null || service.precio_servicio != null
          ? parseFloat(service.precioServicio ?? service.precio_servicio ?? 0)
          : NaN;
      const tipoHabitacion =
        childService.tipo_habitacion ||
        childService.habitacion?.tipo_habitacion ||
        "";
      const capacity = getRoomCapacity(tipoHabitacion);

      let basePrice = 0;
      if (Number.isFinite(storedPrecioServicio)) {
        basePrice = service.tariff.tieneIgv
          ? storedPrecioServicio / 1.18
          : storedPrecioServicio;
      } else if (service.tariff?.basePrice) {
        basePrice = parseFloat(service.tariff.basePrice) || 0;
      } else {
        const currentOriginal =
          parseFloat(service.tariff.precio_original || 0) || 0;
        basePrice = service.tariff.tieneIgv
          ? currentOriginal / 1.18
          : currentOriginal;
      }

      const shouldApplyIGVNow = !!service.tariff.tieneIgv;

      const finalPrecioOriginal = shouldApplyIGVNow
        ? round2(basePrice * 1.18)
        : round2(basePrice);

      const finalPrecio = round2(finalPrecioOriginal / Math.max(1, capacity));

      newTariff = {
        ...newTariff,
        basePrice,
        precio_original: finalPrecioOriginal,
        precio: finalPrecio,
        tieneIgv: shouldApplyIGVNow,
        tiene_igv: shouldApplyIGVNow,
        hasProcessedIGV: true,
      };
    } catch (e) {
      console.warn(
        "Error recalculando hotel en updateSingleServicePricesForPassengerChange:",
        e,
      );
    }
  }

  // =========================
  // 4. RECONSTRUIR passengerSelection (coherente con top-level)
  // =========================
  const passengerPricingState = {
    selectedIds: assignedPassengerIds,
    assignedPassengerCount,
    assignedChildExplicitPriceMap,
    assignedChildExplicitPriceSum,
    assignedChildExplicitCount,
    hasChildExplicitPrices,
    pricingMode,
    uniformPercentage,
    childPercentageMap,
    treatChildrenAsAdults,
    convertedChildToAdultMap,
  };

  const passengerSelection = buildRuntimePassengerSelection(
    selectionFromDB,
    passengerPricingState,
  );
  newTariff = mergePassengerPricingIntoTariff(newTariff, passengerPricingState);

  // =========================
  // 5. DEVOLVER SERVICIO ACTUALIZADO
  // =========================
  return applyServicePricingRuntime({
    ...service,
    // FIX: Limpiar campos runtime obsoletos (mismo fix que updateServicePricesForPassengerChange)
    precio_adult: undefined,
    amount_per_adult: undefined,
    amount_per_child: undefined,
    children: undefined,
    assignedPassengerIds,
    assignedPassengerCount,
    assignedChildExplicitPriceMap,
    assignedChildExplicitPriceSum,
    assignedChildExplicitCount,
    hasChildExplicitPrices,
    pricingMode,
    uniformPercentage,
    childPercentageMap,
    treatChildrenAsAdults,
    convertedChildToAdultMap:
      passengerPricingState.convertedChildToAdultMap || {},
    passengerSelection,
    tariff: newTariff,
  });
};

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// === helpers copiados del modal ===

// OJO: usa la misma lógica del PassengerSelectorModal
const getCandidateIdFromPerson = (p, idx) =>
  p?.id ??
  p?.documentNumber ??
  p?.dni ??
  p?.passport ??
  p?.email ??
  p?.phone ??
  `pax-${idx}`;

/**
 * Arma el rowId EXACTAMENTE igual que en PassengerSelectorModal:
 * rowId = `${group}:${idx}:${sourceId}`
 * group = 'adult' | 'child'
 */
const makeRowId = (p, idx, group) => {
  const sourceId = getCandidateIdFromPerson(p, idx);
  return `${group}:${idx}:${sourceId}`;
};

const buildPassengerIdsFromPeopleDetails = (peopleDetails = {}) => {
  const adults = Array.isArray(peopleDetails?.adults) ? peopleDetails.adults : [];
  const children = Array.isArray(peopleDetails?.children)
    ? peopleDetails.children
    : [];

  return [
    ...adults.map((passenger, index) => makeRowId(passenger, index, "adult")),
    ...children.map((passenger, index) => makeRowId(passenger, index, "child")),
  ];
};

const limitPassengerSelectionToCapacity = (
  selectionArg,
  capacidad,
  peopleDetails,
) => {
  if (!capacidad || capacidad < 1) return selectionArg;

  const base =
    selectionArg && typeof selectionArg === "object" && !Array.isArray(selectionArg)
      ? { ...selectionArg }
      : {};

  const inputIds = Array.isArray(base.selectedIds)
    ? base.selectedIds
    : Array.isArray(base.ids)
      ? base.ids
      : buildPassengerIdsFromPeopleDetails(peopleDetails);

  const limitedIds = [...new Set(inputIds.map(String).filter(Boolean))].slice(
    0,
    capacidad,
  );
  const allowed = new Set(limitedIds);
  const filterPriceMap = (map = {}) =>
    Object.fromEntries(
      Object.entries(map || {}).filter(([id]) => allowed.has(String(id))),
    );

  return {
    ...base,
    selectedIds: limitedIds,
    ids: limitedIds,
    childPriceMap: filterPriceMap(base.childPriceMap),
    assignedChildExplicitPriceMap: filterPriceMap(
      base.assignedChildExplicitPriceMap,
    ),
    childPercentageMap: filterPriceMap(base.childPercentageMap),
    assignedPassengerCount: limitedIds.length,
    forcedPaxForDivision: limitedIds.length,
    endoseCapacityLimit: capacidad,
  };
};

/**
 * Devuelve listas de IDs de pasajeros con el MISMO formato que usa el modal:
 *
 * {
 * adultIds: ['adult:0:XYZ', 'adult:1:ABC', ...],
 * childIds: ['child:0:123', ...],
 * allPassengerIds: [...adultIds, ...childIds],
 * }
 *
 * Usa primero peopleDetails.adults / children (estructura nueva),
 * y si no existen, cae al array plano `passengers` con p.type.
 */
export const getPassengerIdsByType = (peopleDetails = {}, passengers = []) => {
  const adultIds = [];
  const childIds = [];

  // Caso 1: estructura nueva con peopleDetails.adults / .children
  if (
    Array.isArray(peopleDetails.adults) ||
    Array.isArray(peopleDetails.children)
  ) {
    const adults = peopleDetails.adults || [];
    const children = peopleDetails.children || [];

    adults.forEach((p, idx) => {
      const rowId = makeRowId(p, idx, "adult");
      adultIds.push(rowId);
    });

    children.forEach((p, idx) => {
      const rowId = makeRowId(p, idx, "child");
      childIds.push(rowId);
    });
  } else if (Array.isArray(passengers) && passengers.length > 0) {
    // Caso 2: fallback a passengers plano (mismo criterio que el modal)
    passengers.forEach((p, idx) => {
      const group = p?.type === "child" ? "child" : "adult";
      const rowId = makeRowId(p, idx, group);
      if (group === "adult") adultIds.push(rowId);
      else childIds.push(rowId);
    });
  }

  return {
    adultIds,
    childIds,
    allPassengerIds: [...adultIds, ...childIds],
  };
};

const buildCurrentPassengerIdMap = (adultIds = [], childIds = []) =>
  [...adultIds, ...childIds].reduce((result, id) => {
    result[getPassengerSlotKey(id)] = id;
    return result;
  }, {});

const canonicalizePassengerIdForCurrentPeople = (
  id,
  currentPassengerIdMap = {},
) => currentPassengerIdMap[getPassengerSlotKey(id)] || id;

const dedupeCurrentPassengerIds = (ids = [], currentPassengerIdMap = {}) => {
  const bySlot = new Map();
  ids.filter(Boolean).forEach((rawId) => {
    const id = canonicalizePassengerIdForCurrentPeople(
      String(rawId),
      currentPassengerIdMap,
    );
    const slot = getPassengerSlotKey(id);
    if (!slot) return;
    bySlot.set(slot, id);
  });
  return [...bySlot.values()];
};

const normalizeConvertedChildMapForCurrentPeople = (
  convertedMap = {},
  currentPassengerIdMap = {},
) => {
  if (!convertedMap || typeof convertedMap !== "object") return {};

  return Object.entries(convertedMap).reduce((result, [key, rawValue]) => {
    let childId = null;
    if (String(key).startsWith("child:") && rawValue) {
      childId = String(key);
    } else if (typeof rawValue === "string" && rawValue.startsWith("child:")) {
      childId = rawValue;
    }

    if (!childId) return result;
    const canonicalChildId = canonicalizePassengerIdForCurrentPeople(
      childId,
      currentPassengerIdMap,
    );
    result[canonicalChildId] = true;
    return result;
  }, {});
};

const normalizeChildPriceMapForCurrentPeople = (
  childPriceMap = {},
  currentPassengerIdMap = {},
) => {
  if (!childPriceMap || typeof childPriceMap !== "object") return {};

  return Object.entries(childPriceMap).reduce((result, [childId, value]) => {
    const canonicalChildId = canonicalizePassengerIdForCurrentPeople(
      childId,
      currentPassengerIdMap,
    );
    result[canonicalChildId] = value;
    return result;
  }, {});
};

/**
 * Actualiza los precios de los servicios cuando cambian los pasajeros
 * @param {Array} services - Lista de servicios
 * @param {Object} peopleDetails - Detalles de pasajeros (adults, children)
 * @param {Object} options - Opciones de configuración
 * @param {boolean} options.preserveExistingSelection - Si true, no añade nuevos pasajeros automáticamente
 * Útil para carga inicial de cotización guardada donde no queremos modificar la selección
 */
export const updateServicePricesForPassengerChange = (
  services,
  peopleDetails,
  options = {},
) => {
  const { preserveExistingSelection = false } = options;
  const isShortHotelPassengerId = (value) =>
    /^(adult|child):\d+$/.test(String(value || ""));

  const totalPassengers = getTotalPassengerCount(peopleDetails);

  // IDs de pasajeros actuales (adultos / niños) según peopleDetails
  const { adultIds, childIds, allPassengerIds } =
    getPassengerIdsByType(peopleDetails);
  const validIdSet = new Set(allPassengerIds);
  const currentPassengerIdMap = buildCurrentPassengerIdMap(adultIds, childIds);
  const servicesForUpdate = prepareTicketServicesForRuntime(services);

  return servicesForUpdate.map((service) => {
    if (!service || typeof service !== "object") return service;

    const hasTariffStructure =
      service.tariff && typeof service.tariff === "object";
    if (!hasTariffStructure) return service;

    const parentService = service.parentService || service;
    const childService = service.childService || service;
    const typeService = (
      parentService.typeService || service.typeService || ""
    ).toLowerCase();
    const isEndose = typeService === "endoses";
    const tourCapacity = isEndose ? getTourCapacity(childService) : null;
    const ticketProcedenciaSelection =
      typeService === "tickets"
        ? buildTicketProcedenciaPassengerSelectionShared({
            childService,
            peopleDetails,
            passengerSelection:
              service.passengerSelection || service.passenger_selection || null,
          })
        : null;
    const usesTicketProcedenciaFilter = Boolean(
      ticketProcedenciaSelection?.ticketProcedenciaFilter,
    );
    const persistedSelectedIds = Array.isArray(
      service.passengerSelection?.selectedIds,
    )
      ? service.passengerSelection.selectedIds
      : Array.isArray(service.assignedPassengerIds)
        ? service.assignedPassengerIds
        : [];
    const usesHotelModalShortIds =
      typeService === "hoteles" &&
      persistedSelectedIds.some((id) => isShortHotelPassengerId(id));

    // Auto-hotel services have their passenger data managed by HotelPricingModal
    // with short-format IDs ("adult:1", "child:1") that don't match the long-format
    // validIdSet IDs ("adult:0:abc"). Skip the general passenger sync for these.
    if (service.autoHotel || service.autoAddedHotel || usesHotelModalShortIds) {
      return service;
    }

    // =========================
    // 1. LECTURA SEGURA de selección previa (BD ó memoria)
    // =========================
    const selectionFromDB = buildRuntimePassengerSelection(
      service.passengerSelection || {},
      getServicePassengerPricingState(service),
    );
    const isTicketChildTargetRuntime =
      typeService === "tickets" &&
      (service.ticketPassengerTargetGroup ||
        selectionFromDB.ticketPassengerTargetGroup) === "child";
    const ticketChildPricingModeRuntime =
      service.ticketChildPricingMode ||
      selectionFromDB.ticketChildPricingMode ||
      "student_tariff";
    const rawConvertedMap =
      isTicketChildTargetRuntime && ticketChildPricingModeRuntime !== "manual"
        ? {}
        : service.convertedChildToAdultMap ||
          selectionFromDB.convertedChildToAdultMap ||
          {};
    const convertedChildToAdultMap = normalizeConvertedChildMapForCurrentPeople(
      rawConvertedMap,
      currentPassengerIdMap,
    );
    Object.keys(convertedChildToAdultMap).forEach((childId) => {
      if (!validIdSet.has(childId)) {
        delete convertedChildToAdultMap[childId];
      }
    });
    const convertedChildIdSet = new Set(
      Object.keys(convertedChildToAdultMap),
    );

    // selectedIds puede venir desde:
    // - service.passengerSelection.selectedIds (formato BD)
    // - service.assignedPassengerIds (formato antiguo / runtime)
    let assignedPassengerIds = Array.isArray(selectionFromDB.selectedIds)
      ? [...selectionFromDB.selectedIds]
      : Array.isArray(service.assignedPassengerIds)
        ? [...service.assignedPassengerIds]
        : [];
    assignedPassengerIds = assignedPassengerIds.map((id) => {
      const mappedLegacyChild = rawConvertedMap?.[id];
      if (mappedLegacyChild && String(mappedLegacyChild).startsWith("child:")) {
        return canonicalizePassengerIdForCurrentPeople(
          mappedLegacyChild,
          currentPassengerIdMap,
        );
      }
      return canonicalizePassengerIdForCurrentPeople(
        id,
        currentPassengerIdMap,
      );
    });
    assignedPassengerIds = dedupeCurrentPassengerIds(
      assignedPassengerIds,
      currentPassengerIdMap,
    );

    // Filtrar IDs que ya no existen en peopleDetails.
    assignedPassengerIds = assignedPassengerIds.filter((id) =>
      validIdSet.has(id),
    );

    if (usesTicketProcedenciaFilter) {
      assignedPassengerIds = Array.isArray(ticketProcedenciaSelection.selectedIds)
        ? [...ticketProcedenciaSelection.selectedIds]
        : [];
    }

    // LIMPIEZA: Si NO hay niños en peopleDetails, purgar TODO lo relativo a niños
    const noChildrenExist = childIds.length === 0;
    if (noChildrenExist) {
      // Remover IDs de niños
      assignedPassengerIds = assignedPassengerIds.filter((id) => {
        if (id.startsWith("child:")) return false;
        return true;
      });
    }

    // Si NO había selección previa, asumimos que el servicio aplica a TODOS los pasajeros actuales
    // (esto es clave para el caso sin niños, donde nunca se abrió el modal).
    if (
      !usesTicketProcedenciaFilter &&
      assignedPassengerIds.length === 0 &&
      allPassengerIds.length > 0
    ) {
      assignedPassengerIds = [...allPassengerIds];
    }
    assignedPassengerIds = limitIdsToCapacity(assignedPassengerIds, tourCapacity);

    const hadAdultSelected = assignedPassengerIds.some((id) =>
      id.startsWith("adult:"),
    );
    const hadChildSelected = assignedPassengerIds.some((id) =>
      id.startsWith("child:"),
    );

    // Mapa de precios explícitos de niños puede venir desde:
    // - passengerSelection.assignedChildExplicitPriceMap
    // - service.assignedChildExplicitPriceMap
    const rawChildPriceMap = {
      ...(selectionFromDB.assignedChildExplicitPriceMap ||
        service.assignedChildExplicitPriceMap ||
        {}),
      ...(usesTicketProcedenciaFilter
        ? ticketProcedenciaSelection?.assignedChildExplicitPriceMap || {}
        : {}),
    };
    const canonicalRawChildPriceMap = normalizeChildPriceMapForCurrentPeople(
      rawChildPriceMap,
      currentPassengerIdMap,
    );

    // NORMALIZAR MAPA: Filtrar IDs que ya no existen y convertir a números
    let assignedChildExplicitPriceMap = {};
    Object.keys(canonicalRawChildPriceMap).forEach((id) => {
      // IMPORTANTE: Si el ID ya no es válido (niño eliminado), no incluirlo en el mapa
      // Esto asegura que al quitar niños, sus ajustes ("ajustes niños") se reestablezcan a cero
      if (!validIdSet.has(id)) return;
      if (convertedChildIdSet.has(id)) return;

      const v = canonicalRawChildPriceMap[id];
      if (v === null || v === undefined || v === "") return;
      const n = parseFloat(v);
      if (!Number.isNaN(n)) {
        assignedChildExplicitPriceMap[id] = n;
      }
    });

    // NUEVO: Leer información de porcentaje y modo de tratamiento de niños
    let pricingMode =
      service.pricingMode || selectionFromDB.pricingMode || "percentage";
    // Determinar treatChildrenAsAdults: verdadero si el pricingMode es 'adult' O si está explícitamente configurado
    let treatChildrenAsAdults =
      pricingMode === "adult" ||
      service.treatChildrenAsAdults === true ||
      selectionFromDB.treatChildrenAsAdults === true;
    let childPercentageMap =
      service.childPercentageMap || selectionFromDB.childPercentageMap || {};
    childPercentageMap = normalizeChildPriceMapForCurrentPeople(
      childPercentageMap,
      currentPassengerIdMap,
    );
    let uniformPercentage =
      service.uniformPercentage || selectionFromDB.uniformPercentage || "";

    // LIMPIEZA TOTAL: Si no hay niños, resetear TODOS los datos de niños
    if (noChildrenExist) {
      assignedChildExplicitPriceMap = {};
      treatChildrenAsAdults = false;
      childPercentageMap = {};
      uniformPercentage = "";
      pricingMode = "percentage";
    }

    // MODIFICADO: Determinar si un niño debe excluirse de la división
    const shouldExcludeChild = (id) => {
      if (convertedChildIdSet.has(id)) return false;
      // Si tratamos niños como adultos, INCLUIR en división (no excluir)
      if (treatChildrenAsAdults) return false;
      // En modo porcentaje, SIEMPRE excluir niños
      if (pricingMode === "percentage") return true;
      // En modo fijo, excluir solo si tienen precio en el mapa
      return id in assignedChildExplicitPriceMap;
    };

    // =========================
    // 1.b LIMPIAR Y ACTUALIZAR assignedPassengerIds
    // =========================
    // NOTA: El filtrado ya se hizo arriba (línea ~909) preservando adultos convertidos
    // NO volver a filtrar aquí para evitar perder los IDs convertidos

    // Si preserveExistingSelection = true, NO añadir nuevos pasajeros automáticamente
    // Esto es útil cuando cargamos una cotización guardada y queremos preservar la selección exacta
    if (!preserveExistingSelection && !usesTicketProcedenciaFilter) {
      // Detectar si el servicio aplicaba a "todos los pasajeros disponibles"
      // Esto sucede cuando TODOS los adultos (y niños, si había) estaban seleccionados
      const allPreviousAdultsWereSelected =
        hadAdultSelected &&
        adultIds.every(
          (id) => assignedPassengerIds.includes(id) || !validIdSet.has(id),
        );

      // Si el servicio aplicaba a todos los adultos, debería aplicar también a los nuevos pasajeros
      const shouldIncludeAllNewPassengers = allPreviousAdultsWereSelected;

      // Si había adultos seleccionados, agregar nuevos adultos automáticamente
      if (hadAdultSelected) {
        adultIds.forEach((id) => {
          if (!assignedPassengerIds.includes(id)) assignedPassengerIds.push(id);
        });
      }

      // Si había niños seleccionados O el servicio aplicaba a todos los pasajeros,
      // agregar nuevos niños automáticamente
      if (hadChildSelected || shouldIncludeAllNewPassengers) {
        childIds.forEach((id) => {
          // No re-agregar niños que fueron convertidos a adulto
          if (convertedChildIdSet.has(id)) return;
          if (!assignedPassengerIds.includes(id)) assignedPassengerIds.push(id);
        });
      }
    }

    assignedPassengerIds = limitIdsToCapacity(assignedPassengerIds, tourCapacity);

    const assignedPassengerCount = assignedPassengerIds.length;

    // =========================
    // 2. ACTUALIZAR MAPA DE PRECIOS EXPLÍCITOS DE NIÑOS
    // =========================

    // Eliminar entradas de niños que ya no están asignados
    Object.keys(assignedChildExplicitPriceMap).forEach((id) => {
      if (!assignedPassengerIds.includes(id)) {
        delete assignedChildExplicitPriceMap[id];
      }
    });

    // Ver qué precios explícitos ya existen
    const explicitPricesExistentes = Object.values(
      assignedChildExplicitPriceMap,
    ).filter((v) => typeof v === "number" && !Number.isNaN(v));
    const defaultChildExplicitPrice =
      explicitPricesExistentes.length > 0 ? explicitPricesExistentes[0] : null;

    // Si ya teníamos niños con precio explícito, y se agregan nuevos niños, asignarles ese precio por defecto
    // PERO no hacer esto si estamos preservando la selección existente (carga inicial)
    if (
      !preserveExistingSelection &&
      defaultChildExplicitPrice != null &&
      hadChildSelected
    ) {
      childIds.forEach((id) => {
        if (
          assignedPassengerIds.includes(id) &&
          !convertedChildIdSet.has(id) &&
          !(id in assignedChildExplicitPriceMap)
        ) {
          assignedChildExplicitPriceMap[id] = defaultChildExplicitPrice;
        }
      });
    }

    // FIXED: Parse string values to numbers before filtering/summing
    const explicitValues = Object.values(assignedChildExplicitPriceMap)
      .map((v) => parseFloat(v))
      .filter((v) => !Number.isNaN(v) && v !== null && v !== undefined);
    let assignedChildExplicitCount = explicitValues.length;
    let assignedChildExplicitPriceSum = explicitValues.reduce(
      (sum, v) => sum + v,
      0,
    );
    let hasChildExplicitPrices = assignedChildExplicitCount > 0;

    // =========================
    // 3. REGLAS POR TIPO DE SERVICIO
    // =========================
    const isHotel =
      typeService === "hoteles" ||
      typeService.includes("hotel") ||
      (parentService.nombre &&
        parentService.nombre.toLowerCase().includes("hotel"));

    const isExtra =
      typeService === "extras" ||
      (parentService.nombre &&
        parentService.nombre.toLowerCase().includes("extra"));

    const isCapacityLimitedEndose = tourCapacity != null;
    const isTicketChildTarget =
      typeService === "tickets" &&
      (service.ticketPassengerTargetGroup ||
        selectionFromDB.ticketPassengerTargetGroup) === "child";

    let newTariff = { ...service.tariff };

    // === 3.a) TRANSPORTES / GUÍAS / ENDOS CON CAPACIDAD ===
    if (
      typeService === "transportes" ||
      typeService === "guias" ||
      isCapacityLimitedEndose
    ) {
      // For divided services (precioAdultoDividido=true OR transportes which are always divided),
      // precio_original is the fixed total cost that gets divided among passengers.
      // For per-person services (precioAdultoDividido=false, e.g. old migrated guias),
      // precio is the fixed per-person cost and total scales with passenger count.
      const isServiceDivided =
        service.precioAdultoDividido !== false || typeService === "transportes";

      const originalPrice = parseFloat(newTariff.precio_original || 0) || 0;
      const basePricePerPerson = parseFloat(newTariff.precio || 0) || 0;

      // MODIFICADO: Calcular divisor considerando el modo de tratamiento de niños
      let divisor =
        usesTicketProcedenciaFilter ? assignedPassengerCount : assignedPassengerCount || 1;

      // Si tratamos niños como adultos, contar todos los pasajeros
      if (treatChildrenAsAdults) {
        divisor = usesTicketProcedenciaFilter
          ? assignedPassengerIds.length
          : assignedPassengerIds.length || 1;
      } else if (hasChildExplicitPrices || pricingMode === "percentage") {
        const idsSinPrecioExplicito = assignedPassengerIds.filter((id) => {
          // Siempre incluir adultos
          if (!id.startsWith("child:")) return true;
          // Usar la función shouldExcludeChild para determinar si excluir
          return !shouldExcludeChild(id);
        });
        divisor = usesTicketProcedenciaFilter
          ? idsSinPrecioExplicito.length
          : idsSinPrecioExplicito.length || 1;
      }

      // Para transportes: capacidad solo valida conflicto; no divide precio.
      const effectiveDivisor =
        isCapacityLimitedEndose
          ? tourCapacity
          : typeService === "transportes"
          ? getTransportDivisor(divisor, childService)
          : divisor;

      // Compute per-person and total based on division mode
      const newPrice = isServiceDivided
        ? originalPrice / effectiveDivisor
        : basePricePerPerson;
      const newOriginalPrice = isServiceDivided
        ? originalPrice
        : round2(basePricePerPerson * Math.max(1, effectiveDivisor));

      // MODIFICADO: Solo recalcular precios de niños si NO tratamos como adultos
      let effectiveChildExtrasSum = treatChildrenAsAdults
        ? 0
        : assignedChildExplicitPriceSum;
      let effectiveChildPriceMap = treatChildrenAsAdults
        ? {}
        : { ...assignedChildExplicitPriceMap };

      // Solo recalcular precios desde porcentajes si:
      // 1. NO tratamos niños como adultos
      // 2. El pricingMode es 'percentage'
      // 3. NO estamos preservando la selección existente (carga inicial) O no hay precios guardados
      const shouldRecalculateFromPercentage =
        !treatChildrenAsAdults &&
        pricingMode === "percentage" &&
        (!preserveExistingSelection || !hasChildExplicitPrices);

      if (shouldRecalculateFromPercentage) {
        effectiveChildExtrasSum = 0;
        assignedPassengerIds.forEach((id) => {
          if (!id.startsWith("child:")) return;
          if (convertedChildIdSet.has(id)) return;
          // Obtener porcentaje individual o uniforme (si no hay, el niño tiene precio 0)
          const percentValue = parseFloat(
            childPercentageMap[id] || uniformPercentage || 0,
          );
          if (percentValue > 0) {
            const childPrice = (percentValue / 100) * newPrice;
            effectiveChildPriceMap[id] = round2(childPrice);
            effectiveChildExtrasSum += childPrice;
          } else {
            // Sin porcentaje = precio 0 para el niño
            effectiveChildPriceMap[id] = 0;
          }
        });
      } else if (preserveExistingSelection && hasChildExplicitPrices) {
        // preserving existing child prices
      }

      newTariff = {
        ...newTariff,
        precio: round2(newPrice),
        precio_original: newOriginalPrice,
        childExtrasTotal: round2(effectiveChildExtrasSum),
        precio_original_with_child_extras: round2(
          newOriginalPrice + effectiveChildExtrasSum,
        ),
      };
    }

    // === 3.b) ENDOS SIN CAPACIDAD (misma lógica que servicios por persona) ===
    else if (isEndose && !isCapacityLimitedEndose && !isHotel && !isExtra) {
      const basePricePerPerson = parseFloat(newTariff.precio || 0) || 0;

      let divisor =
        usesTicketProcedenciaFilter ? assignedPassengerCount : assignedPassengerCount || 1;
      if (treatChildrenAsAdults) {
        divisor = usesTicketProcedenciaFilter
          ? assignedPassengerIds.length
          : assignedPassengerIds.length || 1;
      } else if (hasChildExplicitPrices || pricingMode === "percentage") {
        const idsSinPrecioExplicito = assignedPassengerIds.filter((id) => {
          if (!id.startsWith("child:")) return true;
          return !shouldExcludeChild(id);
        });
        divisor = usesTicketProcedenciaFilter
          ? idsSinPrecioExplicito.length
          : idsSinPrecioExplicito.length || 1;
      }

      const paxMultiplier =
        usesTicketProcedenciaFilter ? Math.max(0, divisor) : Math.max(1, divisor);
      let baseOriginal = basePricePerPerson * paxMultiplier;
      let childExtrasTotal =
        !treatChildrenAsAdults && pricingMode === "percentage"
          ? assignedPassengerIds.reduce((sum, id) => {
              if (!id.startsWith("child:")) return sum;
              if (convertedChildIdSet.has(id)) return sum;
              const percentValue = parseFloat(
                childPercentageMap[id] || uniformPercentage || 0,
              );
              return percentValue > 0
                ? sum + (percentValue / 100) * basePricePerPerson
                : sum;
            }, 0)
          : assignedChildExplicitPriceSum;

      if (isTicketChildTarget) {
        const ticketChildIds = assignedPassengerIds.filter((id) =>
          String(id).startsWith("child:"),
        );
        const useStudentAsAdult = ticketChildPricingModeRuntime !== "manual";
        if (useStudentAsAdult) {
          assignedChildExplicitPriceMap = {};
          assignedChildExplicitCount = 0;
          assignedChildExplicitPriceSum = 0;
          hasChildExplicitPrices = false;
          baseOriginal = round2(basePricePerPerson * ticketChildIds.length);
          childExtrasTotal = 0;
          treatChildrenAsAdults = false;
        } else {
          assignedChildExplicitPriceMap = ticketChildIds.reduce((acc, childId) => {
            acc[childId] = round2(basePricePerPerson);
            return acc;
          }, {});
          assignedChildExplicitCount = ticketChildIds.length;
          assignedChildExplicitPriceSum = round2(
            basePricePerPerson * ticketChildIds.length,
          );
          hasChildExplicitPrices = assignedChildExplicitCount > 0;
          baseOriginal = 0;
          childExtrasTotal = assignedChildExplicitPriceSum;
        }
      }
      const precioOriginalWithExtras = baseOriginal + childExtrasTotal;

      newTariff = {
        ...newTariff,
        precio_original: round2(baseOriginal),
        childExtrasTotal: round2(childExtrasTotal),
        precio_original_with_child_extras: round2(precioOriginalWithExtras),
      };
    }

    // === 3.c) OTROS SERVICIOS (no hoteles, no extras) ===
    else if (!isHotel && !isExtra) {
      const basePricePerPerson = parseFloat(newTariff.precio || 0) || 0;

      let divisor =
        usesTicketProcedenciaFilter ? assignedPassengerCount : assignedPassengerCount || 1;
      if (treatChildrenAsAdults) {
        divisor = usesTicketProcedenciaFilter
          ? assignedPassengerIds.length
          : assignedPassengerIds.length || 1;
      } else if (hasChildExplicitPrices || pricingMode === "percentage") {
        const idsSinPrecioExplicito = assignedPassengerIds.filter((id) => {
          if (!id.startsWith("child:")) return true;
          return !shouldExcludeChild(id);
        });
        divisor = usesTicketProcedenciaFilter
          ? idsSinPrecioExplicito.length
          : idsSinPrecioExplicito.length || 1;
      }

      const paxMultiplier =
        usesTicketProcedenciaFilter ? Math.max(0, divisor) : Math.max(1, divisor);
      let baseOriginal = basePricePerPerson * paxMultiplier;
      let childExtrasTotal =
        !treatChildrenAsAdults && pricingMode === "percentage"
          ? assignedPassengerIds.reduce((sum, id) => {
              if (!id.startsWith("child:")) return sum;
              if (convertedChildIdSet.has(id)) return sum;
              const percentValue = parseFloat(
                childPercentageMap[id] || uniformPercentage || 0,
              );
              return percentValue > 0
                ? sum + (percentValue / 100) * basePricePerPerson
                : sum;
            }, 0)
          : assignedChildExplicitPriceSum;

      if (isTicketChildTarget) {
        const ticketChildIds = assignedPassengerIds.filter((id) =>
          String(id).startsWith("child:"),
        );
        const useStudentAsAdult = ticketChildPricingModeRuntime !== "manual";
        if (useStudentAsAdult) {
          assignedChildExplicitPriceMap = {};
          assignedChildExplicitCount = 0;
          assignedChildExplicitPriceSum = 0;
          hasChildExplicitPrices = false;
          baseOriginal = round2(basePricePerPerson * ticketChildIds.length);
          childExtrasTotal = 0;
          treatChildrenAsAdults = false;
        } else {
          assignedChildExplicitPriceMap = ticketChildIds.reduce((acc, childId) => {
            acc[childId] = round2(basePricePerPerson);
            return acc;
          }, {});
          assignedChildExplicitCount = ticketChildIds.length;
          assignedChildExplicitPriceSum = round2(
            basePricePerPerson * ticketChildIds.length,
          );
          hasChildExplicitPrices = assignedChildExplicitCount > 0;
          baseOriginal = 0;
          childExtrasTotal = assignedChildExplicitPriceSum;
        }
      }
      const precioOriginalWithExtras = baseOriginal + childExtrasTotal;

      newTariff = {
        ...newTariff,
        precio_original: round2(baseOriginal),
        childExtrasTotal: round2(childExtrasTotal),
        precio_original_with_child_extras: round2(precioOriginalWithExtras),
      };
    }

    // === 3.d) EXTRAS: precio por servicio con soporte de niños
    else if (isExtra) {
      const basePricePerPerson = parseFloat(newTariff.precio || 0) || 0;

      let divisor =
        usesTicketProcedenciaFilter ? assignedPassengerCount : assignedPassengerCount || 1;
      if (treatChildrenAsAdults) {
        divisor = usesTicketProcedenciaFilter
          ? assignedPassengerIds.length
          : assignedPassengerIds.length || 1;
      } else if (hasChildExplicitPrices || pricingMode === "percentage") {
        const idsSinPrecioExplicito = assignedPassengerIds.filter((id) => {
          if (!id.startsWith("child:")) return true;
          return !shouldExcludeChild(id);
        });
        divisor = usesTicketProcedenciaFilter
          ? idsSinPrecioExplicito.length
          : idsSinPrecioExplicito.length || 1;
      }

      const paxMultiplier =
        usesTicketProcedenciaFilter ? Math.max(0, divisor) : Math.max(1, divisor);
      const baseOriginal = basePricePerPerson * paxMultiplier;

      let effectiveChildExtrasSum = treatChildrenAsAdults
        ? 0
        : assignedChildExplicitPriceSum;
      let effectiveChildPriceMap = treatChildrenAsAdults
        ? {}
        : { ...assignedChildExplicitPriceMap };

      const shouldRecalculateFromPercentage =
        !treatChildrenAsAdults &&
        pricingMode === "percentage" &&
        (!preserveExistingSelection || !hasChildExplicitPrices);

      if (shouldRecalculateFromPercentage) {
        effectiveChildExtrasSum = 0;
        assignedPassengerIds.forEach((id) => {
          if (!id.startsWith("child:")) return;
          if (convertedChildIdSet.has(id)) return;
          const percentValue = parseFloat(
            childPercentageMap[id] || uniformPercentage || 0,
          );
          if (percentValue > 0) {
            const childPrice = (percentValue / 100) * basePricePerPerson;
            effectiveChildPriceMap[id] = round2(childPrice);
            effectiveChildExtrasSum += childPrice;
          } else {
            effectiveChildPriceMap[id] = 0;
          }
        });
      }

      newTariff = {
        ...newTariff,
        precio_original: round2(baseOriginal),
        childExtrasTotal: round2(effectiveChildExtrasSum),
        precio_original_with_child_extras: round2(
          baseOriginal + effectiveChildExtrasSum,
        ),
      };
    }

    // === 3.e) HOTELES (misma lógica de IGV que ya tenías) ===
    if (isHotel) {
      const storedPrecioServicio =
        service.precioServicio != null || service.precio_servicio != null
          ? parseFloat(service.precioServicio ?? service.precio_servicio ?? 0)
          : NaN;
      let basePrice = 0;
      if (Number.isFinite(storedPrecioServicio)) {
        basePrice = service.tariff.tieneIgv
          ? storedPrecioServicio / 1.18
          : storedPrecioServicio;
      } else if (service.tariff?.basePrice) {
        basePrice = parseFloat(service.tariff.basePrice);
      } else {
        const currentOriginal = parseFloat(service.tariff.precio_original || 0);
        basePrice = service.tariff.tieneIgv
          ? currentOriginal / 1.18
          : currentOriginal;
      }

      const shouldApplyIGVNow = shouldApplyIGV(service, peopleDetails);

      const tipoHabitacion =
        childService.tipo_habitacion ||
        childService.habitacion?.tipo_habitacion ||
        "";
      const capacity = getRoomCapacity(tipoHabitacion);

      const finalPrecioOriginal = shouldApplyIGVNow
        ? round2(basePrice * 1.18)
        : round2(basePrice);

      const finalPrecio = round2(finalPrecioOriginal / Math.max(1, capacity));

      newTariff = {
        ...newTariff,
        basePrice,
        precio_original: finalPrecioOriginal,
        precio: finalPrecio,
        moneda: service.tariff.moneda,
        tieneIgv: shouldApplyIGVNow,
        tiene_igv: shouldApplyIGVNow,
        hasProcessedIGV: true,
      };
    }

    // =========================
    // 4. ARMAR passengerSelection NUEVO (compatibilidad BD)
    // =========================
    const passengerPricingState = {
      selectedIds: assignedPassengerIds,
      assignedPassengerCount,
      assignedChildExplicitPriceMap,
      assignedChildExplicitPriceSum,
      assignedChildExplicitCount,
      hasChildExplicitPrices,
      pricingMode,
      uniformPercentage,
      childPercentageMap,
      treatChildrenAsAdults,
      convertedChildToAdultMap: noChildrenExist ? {} : convertedChildToAdultMap,
      ticketProcedenciaFilter:
        ticketProcedenciaSelection?.ticketProcedenciaFilter ||
        service.ticketProcedenciaFilter ||
        selectionFromDB.ticketProcedenciaFilter ||
        "",
      ticketPassengerTargetGroup:
        ticketProcedenciaSelection?.ticketPassengerTargetGroup ||
        service.ticketPassengerTargetGroup ||
        selectionFromDB.ticketPassengerTargetGroup ||
        "",
    };

    const passengerSelection = {
      ...buildRuntimePassengerSelection(
        selectionFromDB,
        passengerPricingState,
      ),
      ...(typeService === "tickets"
        ? {
            ticketChildPricingMode: ticketChildPricingModeRuntime,
            ticketChildrenUseStudentTariffAsAdult:
              isTicketChildTargetRuntime && ticketChildPricingModeRuntime !== "manual",
            ticketPassengerTargetGroup: passengerPricingState.ticketPassengerTargetGroup,
            ticketProcedenciaFilter: passengerPricingState.ticketProcedenciaFilter,
          }
        : {}),
    };
    newTariff = mergePassengerPricingIntoTariff(
      newTariff,
      passengerPricingState,
    );

    // =========================
    // 5. DEVOLVER SERVICIO ACTUALIZADO
    // =========================
    return applyServicePricingRuntime({
      ...service,
      // FIX: Limpiar campos runtime obsoletos para que applyServicePricingRuntime
      // los recalcule desde el tariff fresco. Sin esto, precio_adult se queda
      // "pegado" al valor anterior porque ?? (nullish coalescing) no pasa
      // de 0 a tariff.precio.
      precio_adult: undefined,
      amount_per_adult: undefined,
      amount_per_child: undefined,
      children: undefined,
      // Campos top-level (por si otros componentes los usan aún)
      assignedPassengerIds,
      assignedPassengerCount,
      assignedChildExplicitPriceMap,
      assignedChildExplicitPriceSum,
      assignedChildExplicitCount,
      hasChildExplicitPrices,
      // Nuevo bloque coherente para guardar en BD
      passengerSelection,
      tariff: newTariff,
      // NUEVO: Preservar información de porcentaje
      pricingMode,
      childPercentageMap,
      uniformPercentage,
      treatChildrenAsAdults,
      convertedChildToAdultMap:
        passengerPricingState.convertedChildToAdultMap || {},
      ticketProcedenciaFilter: passengerPricingState.ticketProcedenciaFilter,
      ticketPassengerTargetGroup: passengerPricingState.ticketPassengerTargetGroup,
      ...(typeService === "tickets"
        ? {
            ticketChildPricingMode: ticketChildPricingModeRuntime,
            ticketChildrenUseStudentTariffAsAdult:
              isTicketChildTargetRuntime && ticketChildPricingModeRuntime !== "manual",
          }
        : {}),
    });
  });
};

export const normalizeServiceForDB = (service) => {
  const pricingState = getServicePassengerPricingState(service);

  const cleanService = {
    parentService: service.parentService,
    childService: service.childService,
    tariff: mergePassengerPricingIntoTariff(
      {
        precio_original: parseFloat(service.tariff?.precio_original || 0),
        moneda: service.tariff?.moneda || "dolares",
        precio: parseFloat(service.tariff?.precio || 0),
        tieneIgv: Boolean(service.tariff?.tieneIgv),
        descuentoFijo: parseFloat(service.tariff?.descuentoFijo || 0),
        descuentoPorcentual: parseFloat(
          service.tariff?.descuentoPorcentual || 0,
        ),
        aumentoFijo: parseFloat(service.tariff?.aumentoFijo || 0),
        aumentoPorcentual: parseFloat(service.tariff?.aumentoPorcentual || 0),
        childExtrasTotal: parseFloat(service.tariff?.childExtrasTotal || 0),
        precio_original_with_child_extras: parseFloat(
          service.tariff?.precio_original_with_child_extras || 0,
        ),
      },
      pricingState,
    ),
    passengerSelection: buildPersistedPassengerSelection(pricingState),
  };

  return cleanService;
};

export const updateServiceIGV = (days, peopleDetails) => {
  if (!Array.isArray(days)) return days;

  return days.map((day) => ({
    ...day,
    servicios: updateServicePricesForPassengerChange(
      day.servicios || [],
      peopleDetails,
    ),
  }));
};

export const normalizeDayForDB = (day) => {
  return {
    numero: day.numero,
    titulo: day.titulo,
    ciudades: day.ciudades || [],
    servicios: (day.servicios || [])
      .flatMap((service) => expandTicketServiceForPersistence(service))
      .map(normalizeServiceForDB),
  };
};

export const normalizeItineraryForDB = (days) => {
  console.log("Normalizing itinerary for DB:", days);
  if (!Array.isArray(days)) return [];

  return days.map(normalizeDayForDB);
};

export const calculateDayTotal = (day) => {
  if (!day || !Array.isArray(day.servicios)) return 0;

  return day.servicios.reduce((total, service) => {
    // Usar precio_original como base para cálculos de paquetes
    const precio = parseFloat(
      service.tariff?.precio_original ||
        service.precio_original ||
        service.tariff?.precio ||
        service.precio ||
        0,
    );
    const cantidad = parseInt(service.cantidad) || 1;
    return total + precio * cantidad;
  }, 0);
};

export const calculateItineraryTotal = (days) => {
  if (!Array.isArray(days)) return 0;

  return days.reduce((total, day) => {
    return total + calculateDayTotal(day);
  }, 0);
};

export const getHotelOccupancyInfo = (days, totalPassengers) => {
  const occupancyInfo = [];

  days.forEach((day, dayIndex) => {
    // Usar el sistema unificado de detección de servicios
    const hotels =
      day.servicios?.filter((service) => {
        const serviceType = detectServiceType(service);
        return serviceType === "hoteles";
      }) || [];

    let accommodatedPassengers = 0;
    const hotelDetails = [];

    hotels.forEach((hotel) => {
      const hotelName = getServiceName(hotel);
      const roomCapacity = getServiceCapacity(hotel);

      // Obtener tipo de habitación desde diferentes estructuras
      let roomType = "No especificado";
      if (hotel.childService?.tipo_habitacion) {
        roomType = hotel.childService.tipo_habitacion;
      } else if (hotel.childService?.habitacion?.tipo_habitacion) {
        roomType = hotel.childService.habitacion.tipo_habitacion;
      } else if (hotel.tipo_habitacion) {
        roomType = hotel.tipo_habitacion;
      }

      accommodatedPassengers += roomCapacity;

      hotelDetails.push({
        serviceId: hotel.id,
        hotelName: hotelName,
        roomType: roomType,
        capacity: roomCapacity,
      });
    });

    occupancyInfo.push({
      dayNumber: day.numero,
      dayTitle: day.titulo,
      totalCapacity: accommodatedPassengers,
      missingCapacity: Math.max(0, totalPassengers - accommodatedPassengers),
      hotels: hotelDetails,
      isFullyAccommodated: accommodatedPassengers >= totalPassengers,
    });
  });

  return occupancyInfo;
};

export const updateServicesForPackageTypeChange = (
  days,
  newPackageType,
  totalPassengers,
) => {
  console.log(days);
  if (!Array.isArray(days) || !newPackageType) {
    return days;
  }

  return days.map((day) => {
    if (!day.servicios || !Array.isArray(day.servicios)) {
      return day;
    }

    const updatedServicios = day.servicios.map((service) => {
      // Actualizar el packageType en la estructura del servicio
      const updatedService = {
        ...service,
        packageType: newPackageType,
      };

      // Si tiene tariff, actualizar también ahí
      if (service.tariff) {
        updatedService.tariff = {
          ...service.tariff,
          tipo_tarifa: newPackageType,
        };
      }

      // Si tiene childService, actualizar también ahí
      if (service.childService) {
        updatedService.childService = {
          ...service.childService,
          packageType: newPackageType,
        };
      }

      // Recalcular precios con el nuevo packageType
      return updateSingleServicePricesForPassengerChange(
        updatedService,
        totalPassengers,
      );
    });

    return {
      ...day,
      servicios: updatedServicios,
    };
  });
};

export const applyImportPriceAdjustments = (
  service,
  totalPassengers,
  targetPackageType,
) => {
  // Primero actualizar el packageType si es diferente
  console.log("Applying import price adjustments...", { totalPassengers });
  let adjustedService = service;

  if (targetPackageType && service.tariff?.tipo_tarifa !== targetPackageType) {
    adjustedService = {
      ...service,
      packageType: targetPackageType,
    };

    if (service.tariff) {
      adjustedService.tariff = {
        ...service.tariff,
        tipo_tarifa: targetPackageType,
      };
    }

    if (service.childService) {
      adjustedService.childService = {
        ...service.childService,
        packageType: targetPackageType,
      };
    }
  }

  // LÓGICA ESPECIAL PARA HOTELES EN IMPORTACIÓN
  const parentService = adjustedService.parentService || adjustedService;
  const typeService = (parentService.typeService || "").toLowerCase();

  if (
    typeService.includes("alojamiento") ||
    typeService.includes("hotel") ||
    typeService === "hoteles"
  ) {
    // Para hoteles, durante importación NO aplicamos la lógica de multiplicación por pasajeros
    // Solo mantenemos el precio base por habitación y calculamos habitaciones necesarias
    try {
      const childService = adjustedService.childService || adjustedService;
      const tipoHabitacion =
        childService.tipo_habitacion ||
        childService.habitacion?.tipo_habitacion ||
        "";
      const capacity = getRoomCapacity(tipoHabitacion);
      const roomsNeeded = Math.ceil(totalPassengers / capacity);
      const totalNights = parseInt(childService.noches) || 1;

      const hasTariffStructure =
        adjustedService.tariff && typeof adjustedService.tariff === "object";

      if (hasTariffStructure) {
        // En importación, preservamos la lógica de distribución ya existente
        // precio_original = precio base total por habitación por noche
        // precio = precio por persona (precio_original / capacidad)
        const precioOriginalExistente =
          parseFloat(adjustedService.tariff.precio_original) || 0;
        const precioExistente = parseFloat(adjustedService.tariff.precio) || 0;

        // Si ya tiene la estructura correcta (precio diferente a precio_original), preservarla
        if (Math.abs(precioExistente - precioOriginalExistente) > 0.01) {
          // Ya tiene distribución correcta, mantener valores existentes
          const result = {
            ...adjustedService,
            tariff: {
              ...adjustedService.tariff,
              precio: precioExistente,
              precio_original: precioOriginalExistente,
            },
          };

          return result;
        } else {
          // Aplicar distribución por capacidad
          const precioPorPersona = precioOriginalExistente / capacity;

          const result = {
            ...adjustedService,
            tariff: {
              ...adjustedService.tariff,
              precio: Math.round(precioPorPersona * 100) / 100,
              precio_original: precioOriginalExistente,
            },
          };

          return result;
        }
      } else {
        // Estructura simple sin tariff - preservar distribución existente
        const precioOriginalExistente =
          parseFloat(adjustedService.originalPrecio) ||
          parseFloat(adjustedService.precio) ||
          0;
        const precioExistente = parseFloat(adjustedService.precio) || 0;

        // Si ya tiene distribución correcta, preservarla
        if (Math.abs(precioExistente - precioOriginalExistente) > 0.01) {
          const result = {
            ...adjustedService,
            precio: precioExistente,
            originalPrecio: precioOriginalExistente,
          };

          return result;
        } else {
          // Aplicar distribución por capacidad
          const precioPorPersona = precioOriginalExistente / capacity;

          const result = {
            ...adjustedService,
            precio: Math.round(precioPorPersona * 100) / 100,
            originalPrecio: precioOriginalExistente,
          };

          return result;
        }
      }
    } catch (error) {
      console.warn("Error aplicando ajustes de importación para hotel:", error);
      return adjustedService;
    }
  }

  // Para todos los otros servicios (NO hoteles), aplicar la lógica normal de ajuste por pasajeros
  return updateSingleServicePricesForPassengerChange(
    adjustedService,
    totalPassengers,
  );
};

export default {
  getRoomCapacity,
  shouldApplyIGV,
  calculateBasePrice,
  calculateFinalPrice,
  createUnifiedService,
  updateServicePricesForPassengerChange,
  updateSingleServicePricesForPassengerChange,
  updateServicesForPackageTypeChange,
  applyImportPriceAdjustments,
  updateServiceIGV,
  normalizeServiceForDB,
  normalizeDayForDB,
  normalizeItineraryForDB,
  calculateDayTotal,
  calculateItineraryTotal,
  getHotelOccupancyInfo,
};
