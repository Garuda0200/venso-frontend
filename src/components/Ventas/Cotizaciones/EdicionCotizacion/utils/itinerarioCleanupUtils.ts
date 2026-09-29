import {
  buildPersistedPassengerSelection,
  buildRuntimePassengerSelection,
  getPassengerSlotKey,
  getServicePassengerPricingState,
  mergePassengerPricingIntoTariff,
} from "./passengerPricingState";
import {
  applyServicePricingRuntime,
  getServicePricingSnapshot,
} from "./servicePricingRuntime";
import { getRoomCapacity, getTourCapacity } from "./unifiedServiceManager";
import { expandTicketServiceForPersistence } from "./ticketBeneficiaries";
import {
  getHotelIgvAmount,
  getHotelRuntimePriceWithIgv,
} from "./hotelPriceNormalization";

// ═══════════════════════════════════════════════════════════════════════════
// FLAT DB FIELD CONVERSION
// New schema: moneda, precioServicio, igv, precioAdultoDividido,
// capacidadLimite, beneficiariosAdultos (sin precio), beneficiariosNinos
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute the two division booleans from service type and child metadata.
 * - precioAdultoDividido: the service price represents a shared total that must be
 * divided among adults to get the per-person cost.
 * - capacidadLimite: operational capacity marker. Only hotel room capacity
 * changes the price divisor; transport capacity only triggers conflicts.
 */
const computeDivisionFlags = (service) => {
  const typeService =
    service?.typeService || service?.parentService?.typeService || "";

  if (typeService === "transportes" || typeService === "hoteles") {
    return { precioAdultoDividido: true, capacidadLimite: true };
  }

  if (typeService === "guias") {
    return { precioAdultoDividido: true, capacidadLimite: false };
  }

  if (typeService === "endoses") {
    if (getTourCapacity(service) != null) {
      return { precioAdultoDividido: true, capacidadLimite: true };
    }
  }

  return { precioAdultoDividido: false, capacidadLimite: false };
};

/**
 * Get the capacity limit from the child service (only meaningful when
 * capacidadLimite === true).
 * - Transportes → nro_pasajeros (vehicle seats)
 * - Hoteles → room capacity derived from tipo_habitacion
 */
const getCapacityFromService = (service) => {
  const childSvc = service?.childService || {};
  const typeService =
    service?.typeService || service?.parentService?.typeService || "";

  if (typeService === "transportes") {
    return (
      parseInt(
        childSvc.nro_pasajeros || childSvc.movilidad?.nro_pasajeros || 0,
        10,
      ) || 0
    );
  }

  if (typeService === "hoteles") {
    const tipoHab =
      childSvc.tipo_habitacion || childSvc.habitacion?.tipo_habitacion || "";
    return getRoomCapacity(tipoHab);
  }

  if (typeService === "endoses") {
    return getTourCapacity(service) || 0;
  }

  return 0;
};

const shouldCapacityCapPriceDivisor = (service) => {
  const typeService =
    service?.typeService || service?.parentService?.typeService || "";
  return typeService === "hoteles" || typeService === "endoses";
};

/**
 * Given precioServicio and the two division booleans, compute per-adult price
 * and precio_original (total).
 *
 * - dividido=true → precioServicio IS the total; per-adult = total / divisor
 * - dividido=false → precioServicio IS per-adult; total = per-adult × numAdults
 */
const computePricesFromFlags = (
  precioServicio,
  numAdults,
  dividido,
  capacidadLimite,
  service,
) => {
  if (dividido) {
    let divisor = Math.max(1, numAdults);
    if (capacidadLimite && shouldCapacityCapPriceDivisor(service)) {
      const cap = getCapacityFromService(service);
      if (cap > 0 && cap < divisor) divisor = cap;
    }
    return {
      perPerson: precioServicio / divisor,
      precioOriginal: precioServicio,
    };
  }
  // Not divided: precioServicio = per-person unit
  return {
    perPerson: precioServicio,
    precioOriginal: precioServicio * Math.max(1, numAdults),
  };
};

/**
 * Builds internal tariff object from flat DB fields (new schema).
 *
 * Uses precioAdultoDividido and capacidadLimite booleans to compute
 * tariff.precio (per-person) and tariff.precio_original (total).
 */
const buildTariffFromFlatFields = (service) => {
  const storedPrecioServicio = parseFloat(service.precioServicio || 0);
  const moneda = service.moneda || "dolares";
  const igv = Boolean(service.igv);
  const dividido = Boolean(service.precioAdultoDividido);
  const capacidadLimite = Boolean(service.capacidadLimite);
  const typeService = String(
    service?.typeService ||
      service?.parentService?.typeService ||
      service?.tipo_servicio ||
      "",
  ).toLowerCase();
  const isHotelService = typeService === "hoteles" || typeService === "hotel";

  // Hotel precioServicio is canonical BASE tariff (without IGV). Runtime
  // calculations still use the tax-inclusive amount when igv=true, but the
  // base value is never overwritten. This prevents 70 -> 82.60 -> 97.47 on
  // successive edit/save cycles.
  const runtimePrecioServicio = isHotelService
    ? getHotelRuntimePriceWithIgv(storedPrecioServicio, igv)
    : storedPrecioServicio;
  const hotelIgvAmount = isHotelService
    ? getHotelIgvAmount(storedPrecioServicio, igv)
    : 0;

  const beneficiariosAdultos = Array.isArray(service.beneficiariosAdultos)
    ? service.beneficiariosAdultos
    : [];
  const beneficiariosNinos = Array.isArray(service.beneficiariosNinos)
    ? service.beneficiariosNinos
    : [];

  const numAdults = beneficiariosAdultos.length || 1;

  // precioTotal returned by the backend follows precioServicio. For hotels we
  // deliberately rebuild the runtime total from the canonical base + igv flag.
  let perPerson, precioOriginal;
  if (!isHotelService && service.precioTotal != null) {
    precioOriginal = parseFloat(service.precioTotal);
    perPerson = dividido
      ? (() => {
          let divisor = Math.max(1, numAdults);
          if (capacidadLimite && shouldCapacityCapPriceDivisor(service)) {
            const cap = getCapacityFromService(service);
            if (cap > 0 && cap < divisor) divisor = cap;
          }
          return precioOriginal / divisor;
        })()
      : storedPrecioServicio;
  } else {
    ({ perPerson, precioOriginal } = computePricesFromFlags(
      runtimePrecioServicio,
      numAdults,
      dividido,
      capacidadLimite,
      service,
    ));
  }

  const childExtrasTotal = beneficiariosNinos.reduce(
    (sum, child) => sum + parseFloat(child.precio || 0),
    0,
  );

  return {
    precio: perPerson,
    precio_original: precioOriginal,
    moneda,
    tieneIgv: igv,
    tiene_igv: igv,
    childExtrasTotal,
    precio_original_with_child_extras: precioOriginal + childExtrasTotal,
    ...(isHotelService
      ? {
          precio_base_sin_igv: storedPrecioServicio,
          roomBaseUnitPrice: storedPrecioServicio,
          roomUnitPrice: storedPrecioServicio,
          roomUnitPriceWithIgv: runtimePrecioServicio,
          igvAmount: hotelIgvAmount,
          hasIgv: igv,
        }
      : {}),
  };
};
/**
 * Builds internal passengerSelection from beneficiarios arrays (new schema).
 */
const buildPassengerSelectionFromBeneficiarios = (
  beneficiariosAdultos = [],
  beneficiariosNinos = [],
) => {
  const convertedChildToAdultMap = {};
  const ninosComoAdulto = {};
  for (const adult of beneficiariosAdultos) {
    if (adult.child_origin) {
      convertedChildToAdultMap[adult.child_origin] = true;
      ninosComoAdulto[adult.child_origin] = true;
    }
  }
  const convertedSlots = new Set(
    Object.keys(convertedChildToAdultMap).map(getPassengerSlotKey),
  );

  const selectedBySlot = new Map();
  [...beneficiariosAdultos, ...beneficiariosNinos].forEach((b) => {
    if (!b?.id) return;
    const slot = getPassengerSlotKey(b.id);
    if (!slot) return;
    selectedBySlot.set(slot, b.id);
  });
  const selectedIds = [...selectedBySlot.values()];

  const preciosNinos = {};
  for (const child of beneficiariosNinos) {
    if (
      child.id &&
      child.precio != null &&
      !convertedSlots.has(getPassengerSlotKey(child.id))
    ) {
      preciosNinos[child.id] = parseFloat(child.precio);
    }
  }

  const result = { selectedIds };
  if (Object.keys(preciosNinos).length > 0) result.preciosNinos = preciosNinos;
  if (Object.keys(convertedChildToAdultMap).length > 0) {
    result.convertedChildToAdultMap = convertedChildToAdultMap;
    result.ninosComoAdulto = ninosComoAdulto;
  }

  return result;
};

/**
 * Detects whether a service uses the new flat DB schema (has precioServicio
 * but no tariff sub-object).
 */
const usesNewFlatSchema = (service) =>
  !service.tariff && service.precioServicio != null;

/**
 * Converts internal tariff + pricingState to flat DB fields for saving.
 *
 * - precioAdultoDividido/capacidadLimite → read from service or computed from type
 * - precioServicio → precio_original if dividido; precio if not
 * - beneficiariosAdultos → [{id}, {id, child_origin}] (NO precio)
 * - beneficiariosNinos → [{id, precio}]
 */
const buildFlatPricingFields = (tariff, pricingState, service = {}) => {
  const moneda = tariff?.moneda || service.moneda || "dolares";
  const igv = Boolean(tariff?.tieneIgv || tariff?.tiene_igv || service.igv);
  const typeService =
    service?.typeService ||
    service?.parentService?.typeService ||
    service?.tipo_servicio ||
    "";
  const isHotelService = typeService === "hoteles";
  const existingPrecioServicio =
    service?.precioServicio != null || service?.precio_servicio != null
      ? parseFloat(service?.precioServicio ?? service?.precio_servicio ?? 0)
      : NaN;

  // Division flags: prefer explicit values on service, else compute from type
  const flags =
    service.precioAdultoDividido != null
      ? {
          precioAdultoDividido: Boolean(service.precioAdultoDividido),
          capacidadLimite: Boolean(service.capacidadLimite),
        }
      : computeDivisionFlags(service);

  // precioServicio: the value stored in DB
  // For divided: precio_original (total); for non-divided: precio (per-person)
  let precioServicio = flags.precioAdultoDividido
    ? parseFloat(tariff?.precio_original || tariff?.precio || 0)
    : parseFloat(tariff?.precio || tariff?.precio_original || 0);

  if (isHotelService) {
    const canonicalHotelBasePrice = parseFloat(
      service?.roomBaseUnitPrice ??
        service?.roomUnitPrice ??
        tariff?.precio_base_sin_igv ??
        tariff?.roomBaseUnitPrice ??
        tariff?.roomUnitPrice ??
        existingPrecioServicio ??
        0,
    );
    if (Number.isFinite(canonicalHotelBasePrice) && canonicalHotelBasePrice > 0) {
      precioServicio = canonicalHotelBasePrice;
    }
  }

  // On persisted hotels the room tariff is edited/stored on the itinerary
  // service itself. Saving from Pasajeros must not replace it with a catalog
  // default tariff that may be present in service.tariff.
  if (
    isHotelService &&
    Number.isFinite(existingPrecioServicio) &&
    !service?.autoHotel &&
    !service?.autoAddedHotel &&
    !Number.isFinite(
      parseFloat(
        service?.roomBaseUnitPrice ??
          service?.roomUnitPrice ??
          tariff?.precio_base_sin_igv ??
          tariff?.roomBaseUnitPrice,
      ),
    )
  ) {
    precioServicio = existingPrecioServicio;
  }

  // Fallback: If tariff didn't provide a valid price, use existing flat field
  if (
    !precioServicio &&
    (service.precioServicio != null || service.precio_servicio != null)
  ) {
    precioServicio = parseFloat(
      service.precioServicio ?? service.precio_servicio ?? 0,
    );
  }

  const selectedIds =
    pricingState.selectedIds || pricingState.assignedPassengerIds || [];
  const convertedMap = pricingState.convertedChildToAdultMap || {};
  const childPriceMap =
    pricingState.preciosNinos ||
    pricingState.assignedChildExplicitPriceMap ||
    {};

  // Build a set of child IDs that are treated as adults (c/a).
  // Handles both map formats:
  // DaysEditor: { "adult:2": "child:0" } (value is the child origin)
  // HotelModal: { "child:1": true } (key is the child ID)
  const convertedChildIdSet = new Set();
  for (const [key, value] of Object.entries(convertedMap)) {
    if (key.startsWith("child:") && value) convertedChildIdSet.add(key);
    if (typeof value === "string" && value.startsWith("child:"))
      convertedChildIdSet.add(value);
  }
  const convertedChildSlotSet = new Set(
    [...convertedChildIdSet].map(getPassengerSlotKey),
  );
  const getChildPriceBySlot = (childId) => {
    if (Object.prototype.hasOwnProperty.call(childPriceMap, childId)) {
      return childPriceMap[childId];
    }
    const slot = getPassengerSlotKey(childId);
    const fallbackKey = Object.keys(childPriceMap).find(
      (key) => getPassengerSlotKey(key) === slot,
    );
    return fallbackKey ? childPriceMap[fallbackKey] : 0;
  };

  let beneficiariosAdultos = selectedIds
    .filter((id) => id.startsWith("adult:"))
    .map((id) => {
      const entry = { id };
      const childOrigin = convertedMap[id];
      if (childOrigin) entry.child_origin = childOrigin;
      return entry;
    });

  // Also include child IDs that are marked as converted (hotel modal format)
  selectedIds
    .filter(
      (id) =>
        id.startsWith("child:") &&
        (convertedChildIdSet.has(id) ||
          convertedChildSlotSet.has(getPassengerSlotKey(id))),
    )
    .forEach((childId) => {
      // Avoid duplicates if already added
      if (!beneficiariosAdultos.some((b) => b.id === childId)) {
        beneficiariosAdultos.push({ id: childId, child_origin: childId });
      }
    });

  let beneficiariosNinos = selectedIds
    .filter(
      (id) =>
        id.startsWith("child:") &&
        !convertedChildIdSet.has(id) &&
        !convertedChildSlotSet.has(getPassengerSlotKey(id)),
    )
    .map((id) => ({
      id,
      precio: parseFloat(getChildPriceBySlot(id) || 0),
    }));

  // Remove fallbacks that re-inject deleted beneficiaries.
  // If the count is zero, it's because they were removed in the UI.

  return {
    moneda,
    precioServicio,
    igv,
    precioAdultoDividido: flags.precioAdultoDividido,
    capacidadLimite: flags.capacidadLimite,
    beneficiariosAdultos,
    beneficiariosNinos,
  };
};

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const buildPersistedHotelTariffState = (service = {}) => {
  const typeService =
    service?.typeService ||
    service?.parentService?.typeService ||
    service?.tipo_servicio;
  if (typeService !== "hoteles") {
    return {};
  }
  const storedPrecioServicio =
    service?.precioServicio ?? service?.precio_servicio ?? undefined;

  // Persist roomCount and roomUnitPrice — needed for correct per-room price
  // display when re-editing a saved cotización in HotelPricingModal
  const roomCount = Number.parseInt(
    service?.roomCount ?? service?.tariff?.roomCount ?? 1,
    10,
  );

  const roomBaseUnitPrice = parseFloat(
    service?.roomBaseUnitPrice ??
      service?.tariff?.precio_base_sin_igv ??
      service?.tariff?.roomBaseUnitPrice ??
      service?.roomUnitPrice ??
      service?.tariff?.roomUnitPrice ??
      storedPrecioServicio ??
      0,
  );
  const roomUnitPriceWithIgv = parseFloat(
    service?.roomUnitPriceWithIgv ??
      service?.tariff?.roomUnitPriceWithIgv ??
      storedPrecioServicio ??
      service?.tariff?.precio_original ??
      service?.tariff?.precio ??
      roomBaseUnitPrice ??
      0,
  );
  const roomIgvAmount = parseFloat(
    service?.roomIgvAmount ?? service?.tariff?.igvAmount ?? 0,
  );
  const roomHasIgv = Boolean(
    service?.roomHasIgv ||
      service?.hasIgv ||
      service?.tieneIgv ||
      service?.tariff?.hasIgv ||
      service?.tariff?.tieneIgv,
  );

  return {
    ...(Number.isFinite(roomCount) && roomCount > 0 ? { roomCount } : {}),
    ...(Number.isFinite(roomBaseUnitPrice) && roomBaseUnitPrice > 0
      ? { roomUnitPrice: roomBaseUnitPrice, roomBaseUnitPrice }
      : {}),
    ...(Number.isFinite(roomUnitPriceWithIgv) && roomUnitPriceWithIgv > 0
      ? { roomUnitPriceWithIgv }
      : {}),
    ...(Number.isFinite(roomIgvAmount) && roomIgvAmount > 0
      ? { roomIgvAmount }
      : {}),
    ...(roomHasIgv ? { roomHasIgv: true } : {}),
  };
};

// Función para asegurar que los días tengan el campo ciudades
export const ensureDaysHaveCiudades = (days) => {
  if (!Array.isArray(days)) return days;

  return days.map((day) => ({
    ...day,
    ciudades: day.ciudades || [], // Asegurar que cada día tenga un array de ciudades
  }));
};

/**
 * Hidrata un servicio cargado de la DB restaurando datos de passengerSelection al nivel raíz
 * Esto es necesario porque cleanServiceForDB guarda todo en passengerSelection pero
 * los componentes esperan los datos a nivel raíz del servicio
 * @param {Object} service - Servicio desde la DB
 * @returns {Object} - Servicio con datos restaurados a nivel raíz
 */
export const hydrateServiceFromDB = (service) => {
  if (!service) return null;

  // Convert new flat DB fields to internal tariff/passengerSelection format
  if (usesNewFlatSchema(service)) {
    service = {
      ...service,
      tariff: buildTariffFromFlatFields(service),
      passengerSelection: buildPassengerSelectionFromBeneficiarios(
        service.beneficiariosAdultos || [],
        service.beneficiariosNinos || [],
      ),
      ...(service.assignedPrecioServicio != null
        ? (() => {
            const assignedTotal = parseFloat(
              service.assignedPrecioServicio || 0,
            );
            const assignedAdultos = Array.isArray(
              service.assignedBeneficiariosAdultos,
            )
              ? service.assignedBeneficiariosAdultos
              : [];
            const assignedDividido = Boolean(
              service.assignedPrecioAdultoDividido,
            );
            const assignedCapLimite = Boolean(service.assignedCapacidadLimite);
            const numAssignedAdults = assignedAdultos.length || 1;
            const {
              perPerson: assignedPerPerson,
              precioOriginal: assignedPrecioOriginal,
            } = computePricesFromFlags(
              assignedTotal,
              numAssignedAdults,
              assignedDividido,
              assignedCapLimite,
              service,
            );
            return {
              assignedTariff: {
                precio: assignedPerPerson,
                precio_original: assignedPrecioOriginal,
                moneda: service.assignedMoneda || "dolares",
                tieneIgv: Boolean(service.assignedIgv),
                tiene_igv: Boolean(service.assignedIgv),
              },
              assignedPassengerSelection:
                buildPassengerSelectionFromBeneficiarios(
                  assignedAdultos,
                  service.assignedBeneficiariosNinos || [],
                ),
            };
          })()
        : {}),
    };
  }

  const pricingState = getServicePassengerPricingState(service);
  const tariff = service.tariff || {};
  const typeService =
    service.typeService || service.parentService?.typeService || "service";
  const childExtrasTotal = parseFloat(
    tariff.childExtrasTotal ?? pricingState.assignedChildExplicitPriceSum ?? 0,
  );

  // Generar ID si no existe (servicios cargados desde tablas normalizadas)
  const id =
    service.id ||
    `${typeService}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const passengerSelection = buildRuntimePassengerSelection(
    service.passengerSelection || {},
    pricingState,
  );

  return applyServicePricingRuntime({
    ...service,
    // ID y tipo de servicio (generados si faltan desde backend normalizado)
    id,
    typeService,
    // Datos de pasajeros a nivel raíz
    assignedPassengerIds: pricingState.selectedIds,
    assignedPassengerCount: pricingState.assignedPassengerCount,
    // Datos de precios de niños a nivel raíz
    hasChildExplicitPrices: pricingState.hasChildExplicitPrices,
    assignedChildExplicitCount: pricingState.assignedChildExplicitCount,
    assignedChildExplicitPriceMap: pricingState.assignedChildExplicitPriceMap,
    assignedChildExplicitPriceSum: pricingState.assignedChildExplicitPriceSum,
    // Modo de precio y porcentajes a nivel raíz
    pricingMode: pricingState.pricingMode,
    uniformPercentage: pricingState.uniformPercentage,
    childPercentageMap: pricingState.childPercentageMap,
    treatChildrenAsAdults: pricingState.treatChildrenAsAdults,
    // Mapa de conversión niño→adulto
    convertedChildToAdultMap: pricingState.convertedChildToAdultMap || {},
    ...(typeService === "hoteles"
      ? (() => {
          // Derive hotel room metadata from childService (enriched via child_id JOIN)
          // rather than from stored tariff fields (which are no longer persisted).
          const roomCount =
            tariff.roomCount != null ? parseInt(tariff.roomCount, 10) || 1 : 1;
          const childSvc = service.childService || {};
          const roomKeyFromChildText = normalizeText(
            childSvc.tipo_habitacion ||
              childSvc.habitacion?.tipo_habitacion ||
              service.roomType,
          );
          const roomKey =
            roomKeyFromChildText ||
            (tariff.roomKey ? String(tariff.roomKey) : undefined) ||
            (childSvc.id_habitacion != null
              ? String(childSvc.id_habitacion)
              : service.child_id != null
                ? String(service.child_id)
                : undefined);
          const precio = parseFloat(
            tariff.precio_original || tariff.precio || 0,
          );
          const roomUnitPrice =
            tariff.precio_base_sin_igv != null
              ? parseFloat(tariff.precio_base_sin_igv) || 0
              : tariff.roomBaseUnitPrice != null
                ? parseFloat(tariff.roomBaseUnitPrice) || 0
                : tariff.roomUnitPrice != null
                  ? parseFloat(tariff.roomUnitPrice) || 0
                  : roomCount > 0
                    ? precio / roomCount
                    : precio;
          return {
            roomCount,
            ...(roomKey ? { roomKey } : {}),
            roomUnitPrice,
            ...(roomUnitPrice > 0 ? { roomBaseUnitPrice: roomUnitPrice } : {}),
            ...(tariff.roomUnitPriceWithIgv != null
              ? {
                  roomUnitPriceWithIgv:
                    parseFloat(tariff.roomUnitPriceWithIgv) || 0,
                }
              : {}),
            ...(tariff.igvAmount != null
              ? { roomIgvAmount: parseFloat(tariff.igvAmount) || 0 }
              : {}),
            ...(tariff.hasIgv || tariff.tieneIgv ? { roomHasIgv: true } : {}),
            // Backward-compat: restore legacy positional fields if still present in old records
            ...(tariff.hotelNight != null
              ? { hotelNight: parseInt(tariff.hotelNight, 10) || 0 }
              : {}),
            ...(tariff.hotelNights != null
              ? { hotelNights: parseInt(tariff.hotelNights, 10) || 0 }
              : {}),
            ...(tariff.hotelPerNightSum != null
              ? { hotelPerNightSum: parseFloat(tariff.hotelPerNightSum) || 0 }
              : {}),
            ...(tariff.selectedNightPosition != null
              ? {
                  selectedNightPosition:
                    parseInt(tariff.selectedNightPosition, 10) || 0,
                }
              : {}),
            ...(tariff.hotelMix && typeof tariff.hotelMix === "object"
              ? { hotelMix: tariff.hotelMix }
              : {}),
          };
        })()
      : {}),
    passengerSelection,
    // Actualizar tariff con metadata canónica de pricing
    tariff: mergePassengerPricingIntoTariff(
      {
        ...tariff,
        childExtrasTotal,
        precio_original_with_child_extras:
          parseFloat(tariff.precio_original || 0) + childExtrasTotal,
      },
      pricingState,
    ),
  });
};

/**
 * Hidrata un día completo restaurando los servicios
 * @param {Object} day - Día desde la DB
 * @returns {Object} - Día con servicios restaurados
 */
export const hydrateDayFromDB = (day) => {
  if (!day || day.is_active === false || day.isActive === false) return null;

  return {
    ...day,
    servicios: (day.servicios || [])
      .filter(
        (service) =>
          service?.is_active !== false && service?.isActive !== false,
      )
      .map(hydrateServiceFromDB)
      .filter(Boolean),
    ciudades: day.ciudades || [],
  };
};

/**
 * Hidrata un itinerario completo desde la DB
 * @param {Array} itinerario - Array de días desde la DB
 * @returns {Array} - Itinerario con datos restaurados
 */
export const hydrateItinerarioFromDB = (itinerario) => {
  if (!Array.isArray(itinerario)) return [];

  return itinerario.map(hydrateDayFromDB).filter(Boolean);
};

export const cleanServiceForDB = (service) => {
  if (
    !service ||
    service.is_active === false ||
    service.isActive === false
  ) {
    return null;
  }

  const shouldClean =
    service &&
    typeof service === "object" &&
    (service.parentService ||
      service.childService ||
      service.tariff ||
      service.precioServicio != null);

  if (!shouldClean) {
    return service;
  }

  const pricingState = getServicePassengerPricingState(service);
  const persistedHotelTariffState = buildPersistedHotelTariffState(service);
  const canonicalTariff = mergePassengerPricingIntoTariff(
    {
      ...(service.tariff || {}),
      ...persistedHotelTariffState,
    },
    pricingState,
  );

  // Convert to flat DB fields (new schema: no tariff/passengerSelection sub-objects)
  const flatPricing = buildFlatPricingFields(
    canonicalTariff,
    pricingState,
    service,
  );

  const cleaned = {
    // Identidad relacional estable. `id` conserva la PK viva y `versionUid`
    // permite reconciliar el mismo registro aunque una vista intermedia no
    // transporte la PK numérica.
    id: service.id,
    versionUid: service.versionUid || service.version_uid,
    orden: service.orden,
    // Mantener typeService a nivel raíz para fácil acceso
    typeService: service.typeService,

    // Estructura simplificada
    parentService: cleanParentService(service.parentService),
    childService: cleanChildService(service.childService),
    // Flat pricing fields (replace tariff + passengerSelection)
    ...flatPricing,
    // Hotel room unit price — needed for correct display in HotelPricingModal on re-edit
    ...(persistedHotelTariffState.roomUnitPrice > 0
      ? { roomUnitPrice: persistedHotelTariffState.roomUnitPrice }
      : {}),
    ...(persistedHotelTariffState.roomBaseUnitPrice > 0
      ? { roomBaseUnitPrice: persistedHotelTariffState.roomBaseUnitPrice }
      : {}),
    ...(persistedHotelTariffState.roomUnitPriceWithIgv > 0
      ? { roomUnitPriceWithIgv: persistedHotelTariffState.roomUnitPriceWithIgv }
      : {}),
    ...(persistedHotelTariffState.roomIgvAmount > 0
      ? { roomIgvAmount: persistedHotelTariffState.roomIgvAmount }
      : {}),
    ...(persistedHotelTariffState.roomHasIgv
      ? { roomHasIgv: true, hasIgv: true, tieneIgv: true }
      : {}),
    ...(persistedHotelTariffState.roomCount > 0
      ? { roomCount: persistedHotelTariffState.roomCount }
      : {}),
  };

  // Preservar información operativa
  if (service.hora !== undefined) {
    cleaned.hora = service.hora;
  }
  if (service.isAssigned !== undefined) {
    cleaned.isAssigned = Boolean(service.isAssigned);
  }
  if (service.assignedParentId !== undefined) {
    cleaned.assignedParentId = service.assignedParentId;
  }
  if (service.assignedChildId !== undefined) {
    cleaned.assignedChildId = service.assignedChildId;
  }
  // Assigned pricing converted to flat format
  if (service.assignedTariff) {
    const at = service.assignedTariff;
    cleaned.assignedMoneda = at.moneda || flatPricing.moneda;
    cleaned.assignedIgv = Boolean(at.tieneIgv || at.tiene_igv);

    // Division flags for assigned: same as main unless explicitly different
    const assignedFlags =
      service.assignedPrecioAdultoDividido != null
        ? {
            precioAdultoDividido: Boolean(service.assignedPrecioAdultoDividido),
            capacidadLimite: Boolean(service.assignedCapacidadLimite),
          }
        : computeDivisionFlags(service);

    cleaned.assignedPrecioAdultoDividido = assignedFlags.precioAdultoDividido;
    cleaned.assignedCapacidadLimite = assignedFlags.capacidadLimite;

    // precioServicio for assigned: total if dividido, per-person if not
    cleaned.assignedPrecioServicio = assignedFlags.precioAdultoDividido
      ? parseFloat(at.precio_original || at.precio || 0)
      : parseFloat(at.precio || at.precio_original || 0);

    const aps = service.assignedPassengerSelection || {};
    const assignedSelectedIds =
      aps.selectedIds || pricingState.selectedIds || [];
    const assignedConvertedMap = aps.convertedChildToAdultMap || {};
    const assignedChildPrices = aps.preciosNinos || {};
    const assignedConvertedChildIds = new Set();
    Object.entries(assignedConvertedMap).forEach(([key, value]) => {
      if (String(key).startsWith("child:") && value) {
        assignedConvertedChildIds.add(String(key));
      }
      if (typeof value === "string" && value.startsWith("child:")) {
        assignedConvertedChildIds.add(value);
      }
    });

    cleaned.assignedBeneficiariosAdultos = assignedSelectedIds
      .filter((id) => id.startsWith("adult:"))
      .map((id) => {
        const entry = { id };
        const childOrigin = assignedConvertedMap[id];
        if (childOrigin) entry.child_origin = childOrigin;
        return entry;
      });
    assignedSelectedIds
      .filter((id) => id.startsWith("child:") && assignedConvertedChildIds.has(id))
      .forEach((childId) => {
        if (
          !cleaned.assignedBeneficiariosAdultos.some((entry) => entry.id === childId)
        ) {
          cleaned.assignedBeneficiariosAdultos.push({
            id: childId,
            child_origin: childId,
          });
        }
      });

    cleaned.assignedBeneficiariosNinos = assignedSelectedIds
      .filter((id) => id.startsWith("child:") && !assignedConvertedChildIds.has(id))
      .map((id) => ({
        id,
        precio: parseFloat(assignedChildPrices[id] || 0),
      }));
  }

  return cleaned;
};

const cleanParentService = (parentService) => {
  if (!parentService) return null;

  // VERIFICAR LA ESTRUCTURA REAL del parentService
  // Del debug vemos que la data real está en objetos anidados como hotel, transporte, etc.

  let actualParentData = null;

  // Si hay hotel anidado
  if (parentService.hotel) {
    actualParentData = { ...parentService.hotel };
  }
  // Si hay transporte anidado
  else if (parentService.transporte) {
    actualParentData = { ...parentService.transporte };
  }
  // Si tiene datos directos sin anidación
  else {
    actualParentData = { ...parentService };
  }

  // Remover referencias circulares
  if (actualParentData) {
    delete actualParentData.childService;
    delete actualParentData.parentService;
    delete actualParentData.children;
    delete actualParentData.habitaciones;
    delete actualParentData.movilidades;
    delete actualParentData.tarifas;
  }

  return actualParentData;
};

const cleanChildService = (childService) => {
  if (!childService) return null;

  // VERIFICAR LA ESTRUCTURA REAL del childService
  // Del debug vemos que la data real está en objetos anidados como habitacion, movilidad, etc.

  let actualChildData = null;

  // Si hay habitacion anidada (hoteles)
  if (childService.habitacion) {
    actualChildData = { ...childService.habitacion };
  }
  // Si hay movilidad anidada (transportes)
  else if (childService.movilidad) {
    actualChildData = { ...childService.movilidad };
  }
  // Si hay vagon anidado (trenes)
  else if (childService.vagon) {
    actualChildData = { ...childService.vagon };
  }
  // Si hay servicio_extra anidado (extras cargados desde DB)
  else if (childService.servicio_extra) {
    const se = childService.servicio_extra;
    actualChildData = {
      nombre: se.nombre,
      descripcion: se.descripcion || "",
      id_servicio_extra: se.id,
      packageType: childService.packageType,
    };
  }
  // Si tiene datos directos sin anidación
  else {
    actualChildData = { ...childService };
  }

  // Remover referencias circulares
  if (actualChildData) {
    delete actualChildData.childService;
    delete actualChildData.parentService;
    delete actualChildData.parent;
    delete actualChildData.tarifas;
  }

  return actualChildData;
};

export const cleanDayForDB = (day) => {
  if (!day || day.is_active === false || day.isActive === false) return null;

  return {
    id: day.id,
    versionUid: day.versionUid || day.version_uid,
    numero: day.numero,
    orden: day.orden,
    titulo: day.titulo,
    descripcion: day.descripcion || day.description || "",
    ciudades: day.ciudades || [], // Preserve ciudades field
    servicios: (day.servicios || [])
      .flatMap((service) => expandTicketServiceForPersistence(service))
      .map(cleanServiceForDB)
      .filter(Boolean),
  };
};

export const cleanItinerarioForDB = (itinerario) => {
  if (!Array.isArray(itinerario)) {
    return [];
  }

  const cleaned = itinerario.map(cleanDayForDB).filter(Boolean);

  return cleaned;
};

export default {
  cleanServiceForDB,
  cleanDayForDB,
  cleanItinerarioForDB,
  hydrateServiceFromDB,
  hydrateDayFromDB,
  hydrateItinerarioFromDB,
  computeDivisionFlags,
  computePricesFromFlags,
};
