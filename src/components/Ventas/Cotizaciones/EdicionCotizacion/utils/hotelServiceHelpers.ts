import {
  getHotelRoomCapacity,
  isExtraBedRoomType,
} from "../../../../../utils/hotelRoomTypes";
import { getServiceBeneficiarySnapshot } from "./passengerPricingState";

import { resolveHotelRoomAssignments } from "./hotelRoomAssignments";
import { passengerIdMatchesSet } from "./igvUtils";
import {
  isOperationallyAssignedService,
  reconcileHotelServiceRows,
} from "./assignmentProtection";

/* ─── tiny helpers ─── */
import { normalizeHotelDetallePayload as normalizeStructuredHotelDetallePayload } from "./hotelDetallePayload";

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeRoomKey = (value, fallback = "") =>
  normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") ||
  String(fallback || "").trim();

const inferRoomCapacity = (value) => getHotelRoomCapacity(value, 2);

const buildBreakdownKey = (service = {}, fallbackIndex = 0) =>
    service?.roomKey ||
  service?.room_key ||
  service?.tariff?.roomKey ||
  normalizeRoomKey(
    service?.childService?.tipo_habitacion ||
      service?.childService?.habitacion?.tipo_habitacion ||
      service?.child_service?.tipo_habitacion ||
      service?.child_service?.habitacion?.tipo_habitacion ||
      service?.roomType ||
      service?.room_type,
  ) ||
  String(
    service?.childService?.id_habitacion ??
      service?.child_service?.id_habitacion ??
      service?.child_id ??
      service?.assigned_child_id ??
      "",
  ).trim() ||
  service?.id ||
  `room-${fallbackIndex}`;

const buildAdultBeneficiariosPayload = (
  passengerIds = [],
  convertedChildToAdultMap = {},
) =>
  passengerIds
    .filter(
      (id) =>
        String(id).startsWith("adult:") ||
        (String(id).startsWith("child:") &&
          Boolean(convertedChildToAdultMap?.[id])) ||
        // Los hoteles guardados antes de la normalización pueden conservar
        // IDs reales de pasajero. Estos ya representan la asignación adulta
        // del cuarto y no deben desaparecer al guardar de nuevo.
        (!String(id).startsWith("child:") &&
          !String(id).startsWith("adult:") &&
          String(id).trim() !== ""),
    )
    .map((id) =>
      String(id).startsWith("child:") ? { id, child_origin: id } : { id },
    );

const buildChildBeneficiariosPayload = (
  passengerIds = [],
  childPriceMap = {},
  convertedChildToAdultMap = {},
) =>
  passengerIds
    .filter(
      (id) =>
        String(id).startsWith("child:") &&
        !convertedChildToAdultMap?.[id],
    )
    .map((id) => ({
      id,
      precio: num(childPriceMap?.[id]),
    }));

const buildRoomSlotsFromBreakdown = (breakdown = []) => {
  const rows = Array.isArray(breakdown) ? breakdown : [];
  const baseRows = rows.filter((room) => !isExtraBedRoomType(room));
  const extraRows = rows.filter((room) => isExtraBedRoomType(room));

  const slots = baseRows.flatMap((room) =>
    Array.from(
      { length: Math.max(0, parseInt(room?.cnt || 0, 10) || 0) },
      (_, index) => {
        const baseCapacity = getHotelRoomCapacity(room, 1);
        return {
          id: `${room.key}:${index + 1}`,
          key: room.key,
          label:
            Math.max(0, parseInt(room?.cnt || 0, 10) || 0) > 1
              ? `${room.label || room.key} ${index + 1}`
              : room.label || room.key,
          baseLabel: room.label || room.key,
          baseCapacity,
          capacity: baseCapacity,
          unit: num(room.unit),
          id_habitacion: room.id_habitacion || null,
          extraBedCount: 0,
        };
      },
    ),
  );

  // A cama adicional is a +1 pax supplement attached to a physical room.
  // One extra bed is attached per room; surplus legacy rows are ignored for
  // assignment capacity but remain in the pricing breakdown for auditability.
  let slotIndex = 0;
  extraRows.forEach((room) => {
    const count = Math.max(0, parseInt(room?.cnt || 0, 10) || 0);
    for (let index = 0; index < count && slotIndex < slots.length; index += 1) {
      const slot = slots[slotIndex];
      slot.extraBedCount = 1;
      slot.capacity = slot.baseCapacity + 1;
      slot.extraBedKey = room.key;
      slot.extraBedId = room.id_habitacion || null;
      slot.extraBedUnit = num(room.unit);
      slotIndex += 1;
    }
  });

  return slots;
};

const buildRoomBreakdown = (services = []) => {
  const breakdownMap = new Map();

  services.forEach((service, serviceIndex) => {
    const key = buildBreakdownKey(service, serviceIndex);
    const existing = breakdownMap.get(key);
    const cnt = Math.max(
      1,
      parseInt(service?.roomCount ?? service?.tariff?.roomCount ?? 1, 10) || 1,
    );
    const sub = num(
      service?.tariff?.precio_original_with_child_extras ??
        service?.tariff?.precio_original ??
        service?.precioOriginal ??
        service?.precio_servicio ??
        service?.precioServicio ??
        service?.precio_total ??
        service?.precioTotal ??
        service?.tariff?.precio,
    );
    const explicitBaseUnit =
      service?.roomBaseUnitPrice ??
      service?.room_base_unit_price ??
      service?.tariff?.precio_base_sin_igv ??
      service?.tariff?.roomBaseUnitPrice;
    const rawStoredUnit =
      service?.roomUnitPrice ??
      service?.room_unit_price ??
      service?.tariff?.roomUnitPrice ??
      (cnt > 0 ? sub / cnt : sub);
    const roomIgvAmount = num(
      service?.roomIgvAmount ?? service?.tariff?.igvAmount,
    );
    const hasRoomIgv = Boolean(
      service?.roomHasIgv ||
        service?.hasIgv ||
        service?.tieneIgv ||
        service?.tariff?.hasIgv ||
        service?.tariff?.tieneIgv,
    );
    const rawStoredUnitNumber = num(rawStoredUnit);
    const unit = num(
      explicitBaseUnit ??
        (hasRoomIgv &&
        roomIgvAmount > 0 &&
        rawStoredUnitNumber > 0 &&
        Math.abs(rawStoredUnitNumber - (cnt > 0 ? sub / cnt : sub)) < 0.01
          ? rawStoredUnitNumber - roomIgvAmount
          : rawStoredUnit),
    );
    const label =
      service?.childService?.tipo_habitacion ||
      service?.childService?.habitacion?.tipo_habitacion ||
      service?.child_service?.tipo_habitacion ||
      service?.child_service?.habitacion?.tipo_habitacion ||
      service?.roomType ||
      service?.room_type ||
      service?.nombre?.split(" · ").slice(-1)[0] ||
      service?.serviceName?.split(" · ").slice(-1)[0] ||
      "Habitación";

    if (existing) {
      breakdownMap.set(key, {
        ...existing,
        cnt: existing.cnt + cnt,
        sub: existing.sub + sub,
      });
      return;
    }

    breakdownMap.set(key, {
      key,
      label,
      cnt,
      unit,
      sub,
      capacity: getHotelRoomCapacity(
        service?.childService || service?.child_service || label,
        2,
      ),
      isExtraBed:
        service?.habitacion_es_cama_adicional === true ||
        isExtraBedRoomType(service?.childService || service?.child_service || label),
      id_habitacion:
        service?.childService?.id_habitacion ||
        service?.child_service?.id_habitacion ||
        service?.child_id ||
        service?.assigned_child_id ||
        null,
    });
  });

  return [...breakdownMap.values()];
};

const buildMixFromBreakdown = (breakdown = []) =>
  breakdown.reduce((accumulator, room) => {
    const count = Math.max(0, parseInt(room?.cnt || 0, 10) || 0);
    if (!room?.key || count <= 0) {
      return accumulator;
    }

    return {
      ...accumulator,
      [room.key]: count,
    };
  }, {});

const getServiceChildPricing = (service = {}, fallbackChildPricing = null) => {
  const passengerSelection =
    service?.passengerSelection &&
    typeof service.passengerSelection === "object" &&
    !Array.isArray(service.passengerSelection)
      ? service.passengerSelection
      : {};
  const fallback =
    fallbackChildPricing && typeof fallbackChildPricing === "object"
      ? fallbackChildPricing
      : {};

  const fallbackAssignedIds = Array.isArray(fallback?.assignedIds)
    ? fallback.assignedIds
    : Array.isArray(fallback?.selectedIds)
      ? fallback.selectedIds
      : [];

  const snapshot = getServiceBeneficiarySnapshot(
    {
      ...service,
      assignedPassengerIds: Array.isArray(service?.assignedPassengerIds)
        ? service.assignedPassengerIds
        : Array.isArray(passengerSelection?.selectedIds)
          ? passengerSelection.selectedIds
          : fallbackAssignedIds,
      assignedChildExplicitPriceMap:
        service?.assignedChildExplicitPriceMap ??
        passengerSelection?.assignedChildExplicitPriceMap ??
        fallback?.assignedChildExplicitPriceMap ??
        fallback?.preciosNinos,
      convertedChildToAdultMap:
        service?.convertedChildToAdultMap ??
        passengerSelection?.convertedChildToAdultMap ??
        fallback?.convertedChildToAdultMap ??
        fallback?.ninosComoAdulto,
    },
    fallback,
  );

  const assignedIds =
    snapshot.selectedIds.length > 0
      ? snapshot.selectedIds
      : fallbackAssignedIds;
  const assignedChildExplicitPriceMap = { ...snapshot.childPriceMap };
  const assignedChildExplicitPriceSum = Object.values(
    assignedChildExplicitPriceMap,
  ).reduce((sum, value) => sum + num(value), 0);
  const assignedChildExplicitCount = Object.keys(
    assignedChildExplicitPriceMap,
  ).length;
  const convertedChildToAdultMap = snapshot.convertedChildIds.reduce(
    (result, childId) => {
      result[childId] = true;
      return result;
    },
    {},
  );

  return {
    ...fallback,
    assignedIds,
    assignedChildExplicitPriceMap,
    assignedChildExplicitPriceSum,
    assignedChildExplicitCount,
    hasChildExplicitPrices: assignedChildExplicitCount > 0,
    convertedChildToAdultMap,
    pricingMode:
      snapshot.pricingState.pricingMode || fallback?.pricingMode || "fixed",
    uniformPercentage:
      snapshot.pricingState.uniformPercentage ||
      fallback?.uniformPercentage ||
      "",
    treatChildrenAsAdults:
      snapshot.pricingState.treatChildrenAsAdults ||
      snapshot.convertedChildIds.length > 0,
  };
};

/**
 * Normalize a raw hotel category (e.g. "3 Estrellas Superior", "3s", "4")
 * to the short key used by HPM: "2", "3", "3s", "4", "5".
 * Returns the original string (lowercased) if no mapping matches.
 */
const normalizeCategoryKey = (raw) => {
  if (!raw) return "";
  const s = String(raw)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Already a short key
  if (/^[2-5]s?$/.test(s)) return s;

  // Count Unicode star U+2B50. Some hotel categories are stored as "Hotel <stars>".
  const starCount = (String(raw).match(/\u2B50/g) || []).length;
  if (starCount >= 2 && starCount <= 5) {
    // "Hotel <three stars>*" or "Hotel <three stars> Superior" maps to 3s.
    if (
      starCount === 3 &&
      (s.includes("superior") ||
        s.includes("sup") ||
        String(raw).trim().endsWith("*"))
    )
      return "3s";
    return String(starCount);
  }

  if (s.includes("3") && (s.includes("superior") || s.includes("sup")))
    return "3s";
  if (s.includes("2")) return "2";
  if (s.includes("3")) return "3";
  if (s.includes("4")) return "4";
  if (s.includes("5")) return "5";

  return s;
};

/* Detection */
const HOTEL_SERVICE_TYPES = new Set([
  "hotel",
  "hoteles",
  "hospedaje",
  "alojamiento",
  "hoteleria",
]);

const isKnownHotelCategoryKey = (value) => /^(2|3|3s|4|5)$/.test(String(value || ""));

export const getServiceType = (service = {}) => {
  const candidates = [
    service?.parentService?.typeService,
    service?.parentService?.tipo_servicio,
    service?.parent_service?.typeService,
    service?.parent_service?.tipo_servicio,
    service?.tipoServicio,
    service?.tipo_servicio,
    service?.typeService,
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);

  return candidates.find((value) => value !== "service") || candidates[0] || "";
};

export const isHotelService = (service = {}) => {
  const serviceType = normalizeText(getServiceType(service));
  if (HOTEL_SERVICE_TYPES.has(serviceType)) return true;
  if (serviceType && serviceType !== "service" && serviceType !== "otros") {
    return false;
  }

  const hasAutoHotelMarker = Boolean(
    service?.autoHotel ||
      service?.autoAddedHotel ||
      (typeof service?.id === "string" && service.id.startsWith("auto-hotel-")),
  );
  if (hasAutoHotelMarker) return true;

  const category = getHotelCategoryFromService(service);
  if (!isKnownHotelCategoryKey(category)) return false;

  const name = normalizeText(getHotelNameFromService(service));
  const roomLabel = normalizeText(getRoomLabelFromService(service));

  const hasHotelIdentity = Boolean(
    service?.hotelName ||
      service?.hotel_name ||
      service?.nombre_hotel ||
      service?.hotel_nombre ||
      service?.id_hotel ||
      service?.hotelId ||
      service?.parentService?.id_hotel ||
      service?.parentService?.nombre_hotel ||
      service?.parent_service?.id_hotel ||
      service?.parent_service?.nombre_hotel,
  );
  const hasRoomIdentity = Boolean(
    service?.childService?.id_habitacion ||
      service?.childService?.habitacion ||
      service?.childService?.tipo_habitacion ||
      service?.child_service?.id_habitacion ||
      service?.child_service?.habitacion ||
      service?.child_service?.tipo_habitacion ||
      service?.roomKey ||
      service?.room_key ||
      service?.roomType ||
      service?.room_type,
  );
  const hasRoomText =
    roomLabel.includes("habitacion") ||
    roomLabel.includes("simple") ||
    roomLabel.includes("doble") ||
    roomLabel.includes("matrimonial") ||
    roomLabel.includes("triple") ||
    roomLabel.includes("familiar") ||
    roomLabel.includes("single") ||
    roomLabel.includes("twin") ||
    roomLabel.includes("double");

  return Boolean(
    hasHotelIdentity || hasRoomIdentity || name.includes("hotel") || hasRoomText,
  );
};

export const isAutoHotelService = (s) => {
  if (s?.autoHotel || s?.autoAddedHotel) return true;
  if (typeof s?.id === "string" && s.id.startsWith("auto-hotel-")) return true;
  return false;
};

const getHotelNameFromService = (service = {}) =>
  service?.hotelName ||
  service?.hotel_name ||
  service?.parentService?.nombre_hotel ||
  service?.parentService?.nombre ||
  service?.parentService?.name ||
  service?.parent_service?.nombre_hotel ||
  service?.parent_service?.nombre ||
  service?.parent_service?.name ||
  service?.nombre_hotel ||
  service?.hotel_nombre ||
  "";

const getHotelCityFromService = (service = {}) =>
  service?.ciudad ||
  service?.city ||
  service?.parentService?.ciudad ||
  service?.parentService?.city ||
  service?.parent_service?.ciudad ||
  service?.parent_service?.city ||
  null;

const getHotelIdFromService = (service = {}) =>
  service?.id_hotel ||
  service?.hotelId ||
  service?.parentService?.id_hotel ||
  service?.parent_service?.id_hotel ||
  service?.parent_id ||
  service?.parentId ||
  null;

const getHotelCategoryFromService = (service = {}) =>
  normalizeCategoryKey(service?.hotelCategory) ||
  normalizeCategoryKey(service?.hotel_categoria) ||
  normalizeCategoryKey(service?.parentService?.categoria) ||
  normalizeCategoryKey(service?.parentService?.nombre) ||
  normalizeCategoryKey(service?.parentService?.name) ||
  normalizeCategoryKey(service?.parent_service?.categoria) ||
  normalizeCategoryKey(service?.parent_service?.nombre) ||
  normalizeCategoryKey(service?.parent_service?.name) ||
  "";

const getRoomLabelFromService = (service = {}) =>
  service?.childService?.tipo_habitacion ||
  service?.childService?.habitacion?.tipo_habitacion ||
  service?.child_service?.tipo_habitacion ||
  service?.child_service?.habitacion?.tipo_habitacion ||
  service?.roomType ||
  service?.room_type ||
  service?.nombre?.split(" · ").slice(-1)[0] ||
  service?.serviceName?.split(" · ").slice(-1)[0] ||
  "";

const getRoomIdFromService = (service = {}) =>
  service?.childService?.id_habitacion ||
  service?.child_service?.id_habitacion ||
  service?.child_id ||
  service?.childId ||
  service?.assigned_child_id ||
  service?.assignedChildId ||
  null;

const getRoomKeyFromService = (service = {}, fallbackIndex = 0) =>
  service?.roomKey ||
  service?.room_key ||
  service?.tariff?.roomKey ||
  normalizeRoomKey(getRoomLabelFromService(service), getRoomIdFromService(service)) ||
  `room-${fallbackIndex + 1}`;

const getRoomCountFromService = (service = {}) =>
  Math.max(
    1,
    parseInt(
      service?.roomCount ?? service?.room_count ?? service?.tariff?.roomCount ?? 1,
      10,
    ) || 1,
  );

const getRoomSubTotalFromService = (service = {}) => {
  const count = getRoomCountFromService(service);
  const subtotal = num(
    service?.tariff?.precio_original_with_child_extras ??
      service?.tariff?.precio_original ??
      service?.precioOriginal ??
      service?.precio_servicio ??
      service?.precioServicio ??
      service?.precio_total ??
      service?.precioTotal ??
      service?.tariff?.precio,
  );
  if (subtotal > 0) return subtotal;
  return getRoomUnitFromService(service) * count;
};

const getRoomUnitFromService = (service = {}) => {
  const count = getRoomCountFromService(service);
  const subtotal = num(
    service?.tariff?.precio_original ??
      service?.precioOriginal ??
      service?.precio_servicio ??
      service?.precioServicio ??
      service?.precio_total ??
      service?.precioTotal ??
      service?.tariff?.precio ??
      service?.roomUnitPrice ??
      service?.room_unit_price ??
      service?.hotelAdultUnitPrice ??
      service?.hotel_adult_unit_price ??
      service?.precio_adult ??
      service?.precioAdult,
  );
  const explicitBaseUnit =
    service?.roomBaseUnitPrice ??
    service?.room_base_unit_price ??
    service?.tariff?.precio_base_sin_igv ??
    service?.tariff?.roomBaseUnitPrice;
  const rawUnit =
    service?.roomUnitPrice ??
    service?.room_unit_price ??
    service?.tariff?.roomUnitPrice ??
    (count > 0 ? subtotal / count : subtotal);
  return num(explicitBaseUnit ?? rawUnit);
};

const getRoomBeneficiaryIdsFromService = (service = {}) => {
  const normalizeIds = (list) =>
    (Array.isArray(list) ? list : [])
      .map((item) => (item && typeof item === "object" ? item.id : item))
      .filter(Boolean);

  const roomPassengerIds = normalizeIds(service?.roomPassengerIds);
  if (roomPassengerIds.length > 0) return roomPassengerIds;

  const assignedPassengerIds = normalizeIds(service?.assignedPassengerIds);
  if (assignedPassengerIds.length > 0) return assignedPassengerIds;

  const adultBeneficiaries = normalizeIds(
    service?.beneficiariosAdultos ||
      service?.beneficiarios_adultos ||
      service?.beneficiarios_adulto ||
      service?.beneficiariosAdulto,
  );
  const childBeneficiaries = normalizeIds(
    service?.beneficiariosNinos ||
      service?.beneficiarios_ninos ||
      service?.assignedBeneficiariosNinos ||
      service?.assigned_beneficiarios_ninos,
  );
  const persistedBeneficiaries = [
    ...adultBeneficiaries,
    ...childBeneficiaries,
  ].filter((id, index, array) => array.indexOf(id) === index);
  if (persistedBeneficiaries.length > 0) return persistedBeneficiaries;

  return normalizeIds(service?.passengerSelection?.selectedIds);
};

const isLuxuryStoredHotelService = (service = {}) => {
  if (!isHotelService(service)) return false;
  const category = getHotelCategoryFromService(service);
  const rawText = [
    getHotelNameFromService(service),
    service?.parentService?.categoria,
    service?.parent_service?.categoria,
    service?.hotelCategory,
    service?.hotel_categoria,
  ]
    .filter(Boolean)
    .join(" ");
  const text = normalizeText(rawText);
  return (
    category === "5" &&
    (text.includes("hotel 5 estrella") ||
      text.includes("luxury") ||
      rawText.includes("⭐⭐⭐⭐⭐"))
  );
};

const sortRoomOptions = (rooms = []) =>
  [...rooms].sort((left, right) => {
    const capacityDiff =
      (right.capacity || inferRoomCapacity(right.label)) -
      (left.capacity || inferRoomCapacity(left.label));
    if (capacityDiff !== 0) return capacityDiff;
    return String(left.label || "").localeCompare(String(right.label || ""));
  });

const buildRoomOptionsFromBreakdown = (breakdown = []) => {
  const byKey = new Map();

  (Array.isArray(breakdown) ? breakdown : []).forEach((room, index) => {
    const key = String(room?.key || `room-${index + 1}`).trim();
    if (!key || byKey.has(key)) return;

    const label = room?.label || key;
    byKey.set(key, {
      key,
      label,
      baseLabel: label,
      capacity: getHotelRoomCapacity(room, inferRoomCapacity(label)),
      isExtraBed: room?.isExtraBed === true || isExtraBedRoomType(room),
      id_habitacion: room?.id_habitacion || null,
      pricePerRoomNight: num(room?.unit),
    });
  });

  return sortRoomOptions([...byKey.values()]);
};

const buildPriceOverridesFromBreakdown = (breakdown = []) =>
  (Array.isArray(breakdown) ? breakdown : []).reduce((accumulator, room) => {
    if (!room?.key) return accumulator;
    const unit = num(room?.unit);
    if (unit <= 0) return accumulator;

    accumulator[room.key] = unit;
    if (room.id_habitacion) accumulator[String(room.id_habitacion)] = unit;
    if (room.label) accumulator[String(room.label)] = unit;
    return accumulator;
  }, {});

const buildHotelGroupSignature = ({
  category,
  hotelName,
  idHotel,
  ciudad,
  roomMix,
  breakdown,
}) => {
  const priceSignature = (Array.isArray(breakdown) ? breakdown : [])
    .map((room) =>
      [
        room?.key || "",
        room?.id_habitacion || "",
        num(room?.unit),
        num(room?.cnt),
        num(room?.sub),
      ].join(":"),
    )
    .sort()
    .join("|");
  const mixSignature = Object.entries(roomMix || {})
    .map(([key, value]) => `${key}:${num(value)}`)
    .sort()
    .join("|");

  return [
    category || "unknown",
    idHotel || normalizeText(hotelName || ""),
    normalizeText(ciudad || ""),
    priceSignature || mixSignature,
  ].join("::");
};

const buildLuxuryRoomOptionFromService = (service = {}, fallbackIndex = 0) => {
  const label = getRoomLabelFromService(service);
  const key = getRoomKeyFromService(service, fallbackIndex);
  return {
    key,
    label,
    baseLabel: label,
    capacity: getHotelRoomCapacity(
      service?.childService || service?.child_service || label,
      num(service?.capacity || 0) || 2,
    ),
    isExtraBed:
      service?.habitacion_es_cama_adicional === true ||
      isExtraBedRoomType(service?.childService || service?.child_service || label),
    id_habitacion: getRoomIdFromService(service),
    pricePerRoomNight: getRoomUnitFromService(service),
  };
};

const buildLuxuryPerRoomPricing = (groups = []) =>
  groups.flatMap((group) => {
    const optionMap = new Map(
      (group.roomOptions || []).map((option) => [option.key, option]),
    );
    const sameTypeCounters = {};
    const nights = Math.max(1, (group.dayIndices || []).length || 1);

    return Object.entries(group.roomAssignments || {}).flatMap(
      ([slotId, passengerIds]) => {
        const [roomKey] = String(slotId).split(":");
        const option = optionMap.get(roomKey);
        const ids = Array.isArray(passengerIds) ? passengerIds.filter(Boolean) : [];
        if (!option || ids.length === 0) return [];

        sameTypeCounters[roomKey] = (sameTypeCounters[roomKey] || 0) + 1;
        const roomIndex = sameTypeCounters[roomKey];
        const sameTypeCount = Object.keys(group.roomAssignments || {}).filter((key) =>
          key.startsWith(`${roomKey}:`),
        ).length;
        const label =
          sameTypeCount > 1
            ? `${option.label || roomKey} ${roomIndex}`
            : option.label || roomKey;
        const hotelTotalRoom = num(option.pricePerRoomNight) * nights;
        const beneficiaries = Math.max(1, ids.length);
        const adultPassengerIds = ids.filter((id) => String(id).startsWith("adult:"));
        const convertedChildPassengerIds = ids.filter((id) =>
          String(id).startsWith("child:"),
        );

        return {
          key: `${roomKey}:${roomIndex}`,
          sourceRoomKey: roomKey,
          roomKey,
          label,
          baseLabel: option.label || roomKey,
          capacity: option.capacity,
          roomCount: 1,
          beneficiaries,
          adultBeneficiaries: adultPassengerIds.length,
          convertedChildBeneficiaries: convertedChildPassengerIds.length,
          passengerIds: ids,
          adultPassengerIds,
          convertedChildPassengerIds,
          hotelPerNight: num(option.pricePerRoomNight),
          hotelTotalRoom,
          hotelPerPerson: hotelTotalRoom / beneficiaries,
          convertedChildHotelPerPerson: hotelTotalRoom / beneficiaries,
          roomDetails: [
            {
              roomId: slotId,
              passengerIds: ids,
              roomBaseUnit: num(option.pricePerRoomNight),
              baseUnit: num(option.pricePerRoomNight),
              unit: num(option.pricePerRoomNight),
              unitWithIgv: num(option.pricePerRoomNight),
              roomUnitPrice: num(option.pricePerRoomNight),
              hotelTotalRoom,
              id_habitacion: option.id_habitacion || null,
            },
          ],
        };
      },
    );
  });

const buildLuxuryDayGroupsFromDays = (servicesByDay) => {
  if (!servicesByDay || servicesByDay.size === 0) return null;
  const groupMap = new Map();

  servicesByDay.forEach((services, dayIndex) => {
    const luxuryServices = (services || []).filter(isLuxuryStoredHotelService);
    if (luxuryServices.length === 0) return;

    const firstService = luxuryServices[0];
    const hotelId = getHotelIdFromService(firstService);
    const hotelName = getHotelNameFromService(firstService) || "Hotel";
    const ciudad = getHotelCityFromService(firstService);
    const breakdown = buildRoomBreakdown(luxuryServices);
    const roomMix = buildMixFromBreakdown(breakdown);
    const key = buildHotelGroupSignature({
      category: "5",
      hotelName,
      idHotel: hotelId,
      ciudad,
      roomMix,
      breakdown,
    });

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        category: "5",
        dayIndices: [],
        hotelName,
        id_hotel: hotelId,
        ciudad,
        servicesByDay: new Map(),
      });
    }

    const group = groupMap.get(key);
    group.dayIndices.push(dayIndex);
    group.servicesByDay.set(dayIndex, luxuryServices);
  });

  const groups = [...groupMap.values()].map((group) => {
    const dayIndices = [...new Set(group.dayIndices)].sort((a, b) => a - b);
    const firstDayIndex = dayIndices[0];
    const representativeServices = group.servicesByDay.get(firstDayIndex) || [];
    const roomOptionsMap = new Map();
    const roomMix = {};
    const roomAssignments = {};
    const slotCounters = {};
    const perNightSums = [];

    dayIndices.forEach((dayIndex) => {
      const dayServices = group.servicesByDay.get(dayIndex) || [];
      perNightSums[dayIndex] = dayServices.reduce(
        (sum, service) => sum + getRoomSubTotalFromService(service),
        0,
      );
    });

    representativeServices.forEach((service, serviceIndex) => {
      const option = buildLuxuryRoomOptionFromService(service, serviceIndex);
      if (!roomOptionsMap.has(option.key)) {
        roomOptionsMap.set(option.key, option);
      }

      const count = getRoomCountFromService(service);
      for (let index = 0; index < count; index += 1) {
        slotCounters[option.key] = (slotCounters[option.key] || 0) + 1;
        const slotId = `${option.key}:${slotCounters[option.key]}`;
        roomMix[option.key] = (roomMix[option.key] || 0) + 1;
        roomAssignments[slotId] = getRoomBeneficiaryIdsFromService(service);
      }
    });

    const roomOptions = sortRoomOptions([...roomOptionsMap.values()]);
    const priceOverrides = buildPriceOverridesFromBreakdown(
      buildRoomBreakdown(representativeServices),
    );
    const perNightSum =
      num(perNightSums[firstDayIndex]) ||
      representativeServices.reduce(
        (sum, service) => sum + getRoomSubTotalFromService(service),
        0,
      );
    const hotelTotal = dayIndices.reduce(
      (sum, dayIndex) => sum + num(perNightSums[dayIndex]),
      0,
    );

    return {
      category: "5",
      dayIndices,
      hotelName: group.hotelName,
      id_hotel: group.id_hotel,
      ciudad: group.ciudad,
      roomMix,
      roomAssignments,
      roomOptions,
      priceOverrides,
      perNightSum,
      perNightSums,
      hotelTotal,
    };
  });

  if (groups.length === 0) return null;

  return groups.map((group) => ({
    ...group,
    perRoomPricing: buildLuxuryPerRoomPricing([group]),
  }));
};

const mergeLuxuryRoomOptions = (groups = []) => {
  const byKey = new Map();
  groups.forEach((group) => {
    (group.roomOptions || []).forEach((room) => {
      if (!room?.key || byKey.has(room.key)) return;
      byKey.set(room.key, room);
    });
  });
  return sortRoomOptions([...byKey.values()]);
};

const mergeLuxuryRoomMix = (groups = []) =>
  groups.reduce((accumulator, group) => {
    Object.entries(group.roomMix || {}).forEach(([key, value]) => {
      accumulator[key] = Math.max(num(accumulator[key]), num(value));
    });
    return accumulator;
  }, {});

/* Hotel detail payload normalization */
export const normalizeHotelDetallePayload = (value) =>
  normalizeStructuredHotelDetallePayload(value);

/* ─── normalizeSelectedHotelConfig ─── */
export const normalizeSelectedHotelConfig = (
  value,
  fallbackHotelDetalle = null,
) => {
  let selectedHotel = null;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        selectedHotel = parsed;
      }
    } catch {
      selectedHotel = null;
    }
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    selectedHotel = value;
  }

  const normalizedHotelDetalle = normalizeHotelDetallePayload(
    selectedHotel?.hotelDetalle ||
      selectedHotel?.hotelDetalleJson ||
      selectedHotel?.hotelDetalleHtml ||
      fallbackHotelDetalle ||
      null,
  );

  if (!selectedHotel) {
    return normalizedHotelDetalle
      ? {
          ...normalizedHotelDetalle,
          hotelDetalle: normalizedHotelDetalle,
          hotelDetalleHtml: normalizedHotelDetalle?.fullHtml || "",
        }
      : null;
  }

  const normalizedCategory =
    normalizeCategoryKey(selectedHotel?.category) ||
    normalizeCategoryKey(selectedHotel?.hotelCategory) ||
    normalizeCategoryKey(selectedHotel?.hotel_categoria) ||
    normalizeCategoryKey(selectedHotel?.categoryLabel) ||
    normalizeCategoryKey(selectedHotel?.hotelCategoryLabel) ||
    normalizeCategoryKey(selectedHotel?.label) ||
    normalizeCategoryKey(selectedHotel?.hotelName) ||
    normalizeCategoryKey(selectedHotel?.nombre);

  return {
    ...selectedHotel,
    category: normalizedCategory,
    selectedNightIndices: Array.isArray(selectedHotel?.selectedNightIndices)
      ? selectedHotel.selectedNightIndices
          .map((nightIndex) => parseInt(nightIndex, 10))
          .filter(
            (nightIndex) => Number.isInteger(nightIndex) && nightIndex >= 0,
          )
      : [],
    dayGroups: Array.isArray(selectedHotel?.dayGroups)
      ? selectedHotel.dayGroups.map((g) => ({
          dayIndices: Array.isArray(g.dayIndices)
            ? g.dayIndices
                .map((v) => parseInt(v, 10))
                .filter((v) => Number.isInteger(v) && v >= 0)
            : [],
          category: normalizeCategoryKey(g.category) || null,
          roomMix:
            g.roomMix && typeof g.roomMix === "object" ? { ...g.roomMix } : {},
          roomAssignments:
            g.roomAssignments &&
            typeof g.roomAssignments === "object" &&
            Object.keys(g.roomAssignments).length > 0
              ? { ...g.roomAssignments }
              : null,
          priceOverrides:
            g.priceOverrides &&
            typeof g.priceOverrides === "object" &&
            !Array.isArray(g.priceOverrides)
              ? { ...g.priceOverrides }
              : {},
          hotelOptionKey: g.hotelOptionKey || g.id_hotel || null,
          hotelName: g.hotelName || null,
          id_hotel: g.id_hotel ?? null,
          ciudad: g.ciudad || g.city || null,
          roomOptions: Array.isArray(g.roomOptions) ? g.roomOptions : [],
          perRoomPricing: Array.isArray(g.perRoomPricing)
            ? g.perRoomPricing
            : [],
          perNightSum: num(g.perNightSum),
          hotelTotal: num(g.hotelTotal),
        }))
      : null,
    hotelDetalle: normalizedHotelDetalle,
    hotelDetalleHtml:
      selectedHotel?.hotelDetalleHtml || normalizedHotelDetalle?.fullHtml || "",
  };
};

const buildRoomAssignmentsFromServices = (services = []) => {
  const assignments = {};
  const slotCounters = {};
  const aliasCounters = {};

  (Array.isArray(services) ? services : []).forEach((service, serviceIndex) => {
    const roomKey =
      String(
        service?.childService?.id_habitacion ??
          service?.child_id ??
          service?.assigned_child_id ??
          "",
      ).trim() ||
      service?.roomKey ||
      service?.tariff?.roomKey ||
      buildBreakdownKey(service, serviceIndex);
    const aliasKey = buildBreakdownKey(service, serviceIndex);
    if (!roomKey) return;

    if (slotCounters[roomKey] === undefined) slotCounters[roomKey] = 0;
    if (aliasCounters[aliasKey] === undefined) aliasCounters[aliasKey] = 0;

    const roomCount = Math.max(1, parseInt(service?.roomCount || 1, 10));
    // Los servicios automáticos de hotel se persisten una fila por habitación.
    // Si llega una fila legacy agregada, no inventamos asignaciones de pasajeros
    // para habitaciones que no pueden distinguirse individualmente.
    if (roomCount !== 1) return;

    const passengerIds = getRoomBeneficiaryIdsFromService(service);
    const slotId = `${roomKey}:${slotCounters[roomKey] + 1}`;
    assignments[slotId] = passengerIds;
    slotCounters[roomKey] += 1;

    if (aliasKey) {
      const aliasSlotId = `${aliasKey}:${aliasCounters[aliasKey] + 1}`;
      if (aliasSlotId !== slotId) assignments[aliasSlotId] = passengerIds;
      aliasCounters[aliasKey] += 1;
    }
  });

  return assignments;
};

/**
 * Reconstruct dayGroups from the per-day hotel services.
 * A group is defined by category + hotel + room mix/prices. Same stars with
 * different room prices must stay as separate day groups.
 *
 * The persisted itinerary is the durable hotel snapshot. Rehydration therefore
 * recovers not only category/mix but also room beneficiaries and the monetary
 * total of every group, so a mixed stay cannot collapse to one active category.
 */
const deriveDayGroupsFromDays = (servicesByDay) => {
  if (!servicesByDay || servicesByDay.size === 0) return null;

  const groupMap = new Map();

  servicesByDay.forEach((services, dayIndex) => {
    if (!services.length) return;
    const firstService = services[0];
    const cat =
      normalizeCategoryKey(firstService?.hotelCategory) ||
      normalizeCategoryKey(firstService?.parentService?.categoria) ||
      normalizeCategoryKey(firstService?.parentService?.nombre) ||
      "unknown";
    const breakdown = buildRoomBreakdown(services);
    const storedMix =
      firstService?.hotelMix && typeof firstService.hotelMix === "object"
        ? { ...firstService.hotelMix }
        : null;
    const derivedMix = storedMix || buildMixFromBreakdown(breakdown);
    const hotelName =
      firstService?.hotelName || firstService?.parentService?.nombre || "Hotel";
    const idHotel =
      firstService?.parentService?.id_hotel || firstService?.id_hotel || null;
    const ciudad = firstService?.ciudad || firstService?.city || null;
    const groupKey = buildHotelGroupSignature({
      category: cat,
      hotelName,
      idHotel,
      ciudad,
      roomMix: derivedMix,
      breakdown,
    });
    const dayHotelTotal = services.reduce(
      (sum, service) => sum + getRoomSubTotalFromService(service),
      0,
    );

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        dayIndices: [],
        category: cat,
        hotelName,
        id_hotel: idHotel,
        ciudad,
        roomMix: derivedMix,
        roomAssignments: buildRoomAssignmentsFromServices(services),
        roomOptions: buildRoomOptionsFromBreakdown(breakdown),
        priceOverrides: buildPriceOverridesFromBreakdown(breakdown),
        perNightSums: [],
        perNightSum: dayHotelTotal,
        hotelTotal: 0,
      });
    }

    const group = groupMap.get(groupKey);
    group.dayIndices.push(dayIndex);
    group.perNightSums[dayIndex] = dayHotelTotal;
    group.hotelTotal += dayHotelTotal;
  });

  if (groupMap.size === 0) return null;
  groupMap.forEach((group) => {
    group.dayIndices.sort((a, b) => a - b);
    group.perRoomPricing = buildLuxuryPerRoomPricing([group]);
  });
  return [...groupMap.values()];
};

/* ─── deriveSelectedHotelFromDays ─── */
export const deriveSelectedHotelFromDays = (
  daysArr,
  fallbackHotelDetalle = null,
  fallbackSelectedHotel = null,
) => {
  const normalizedSelectedHotel = normalizeSelectedHotelConfig(
    fallbackSelectedHotel,
    fallbackHotelDetalle,
  );

  if (!Array.isArray(daysArr)) return normalizedSelectedHotel;

  const uniqueHotelDays = new Set();
  let firstHotelService = null;
  let hotelTotal = 0;
  const servicesByDay = new Map();
  const fallbackChildPricing = normalizedSelectedHotel?.childPricing || null;
  let derivedChildPricing = fallbackChildPricing;

  daysArr.forEach((day, dayIndex) => {
    (day?.servicios || []).forEach((service) => {
      if (!isHotelService(service)) return;
      uniqueHotelDays.add(dayIndex);
      if (!firstHotelService) firstHotelService = service;
      hotelTotal += Number(
        service?.tariff?.precio_original_with_child_extras ??
          service?.tariff?.precio_original ??
          service?.tariff?.precio ??
          service?.precio_total ??
          service?.precioTotal ??
          service?.precio_servicio ??
          service?.precioServicio ??
          0,
      );

      const currentServices = servicesByDay.get(dayIndex) || [];
      currentServices.push(service);
      servicesByDay.set(dayIndex, currentServices);

      if (
        !derivedChildPricing ||
        Object.keys(derivedChildPricing?.assignedChildExplicitPriceMap || {})
          .length === 0
      ) {
        derivedChildPricing = getServiceChildPricing(
          service,
          fallbackChildPricing,
        );
      }
    });
  });

  if (!firstHotelService) return normalizedSelectedHotel;

  const normalizedHotelDetalle = normalizeHotelDetallePayload(
    fallbackHotelDetalle || normalizedSelectedHotel?.hotelDetalle || null,
  );
  const selectedNightIndices =
    uniqueHotelDays.size > 0
      ? [...uniqueHotelDays].sort((a, b) => a - b)
      : normalizedSelectedHotel?.selectedNightIndices || [];
  const firstSelectedNightIndex = selectedNightIndices[0] ?? 0;
  const representativeServices = servicesByDay.get(firstSelectedNightIndex) || [
    firstHotelService,
  ];
  const breakdown = buildRoomBreakdown(representativeServices);
  const derivedMixSource = representativeServices.find(
    (service) =>
      (service?.hotelMix && typeof service.hotelMix === "object") ||
      (service?.tariff?.hotelMix &&
        typeof service.tariff.hotelMix === "object"),
  );
  const derivedMixFromService =
    derivedMixSource?.hotelMix || derivedMixSource?.tariff?.hotelMix || null;
  const perNightBreakdowns = [];
  const perNightMixes = [];
  const perNightSums = [];

  selectedNightIndices.forEach((dayIndex) => {
    const hotelServices = servicesByDay.get(dayIndex) || [];
    const nightBreakdown = buildRoomBreakdown(hotelServices);
    const storedNightMixSource = hotelServices.find(
      (service) =>
        (service?.hotelMix && typeof service.hotelMix === "object") ||
        (service?.tariff?.hotelMix &&
          typeof service.tariff.hotelMix === "object"),
    );
    const storedNightMix =
      storedNightMixSource?.hotelMix ||
      storedNightMixSource?.tariff?.hotelMix ||
      null;
    const computedNightMix =
      storedNightMix || buildMixFromBreakdown(nightBreakdown);
    const storedPerNightService = hotelServices.find(
      (service) =>
        service?.hotelPerNightSum != null ||
        service?.tariff?.hotelPerNightSum != null,
    );
    const storedPerNightSum =
      storedPerNightService?.hotelPerNightSum ??
      storedPerNightService?.tariff?.hotelPerNightSum;

    if (nightBreakdown.length > 0) {
      perNightBreakdowns[dayIndex] = nightBreakdown;
    }

    if (Object.keys(computedNightMix).length > 0) {
      perNightMixes[dayIndex] = computedNightMix;
    }

    perNightSums[dayIndex] =
      storedPerNightSum != null
        ? num(storedPerNightSum)
        : nightBreakdown.reduce((total, room) => total + num(room?.sub), 0);
  });

  const normalizedCategory =
    normalizeCategoryKey(firstHotelService?.parentService?.categoria) ||
    normalizeCategoryKey(firstHotelService?.parentService?.nombre) ||
    normalizeCategoryKey(firstHotelService?.parentService?.name) ||
    normalizeCategoryKey(firstHotelService?.hotelCategory) ||
    normalizeCategoryKey(firstHotelService?.hotel_categoria) ||
    normalizeCategoryKey(normalizedSelectedHotel?.category) ||
    "";
  const savedDayGroups = normalizedSelectedHotel?.dayGroups;
  const hasSavedDayGroups =
    Array.isArray(savedDayGroups) &&
    savedDayGroups.length > 0 &&
    savedDayGroups.some(
      (g) => g.roomMix && Object.keys(g.roomMix).length > 0,
    );
  const derivedServiceDayGroups = deriveDayGroupsFromDays(servicesByDay);
  const hasAuthoritativeSavedDayGroups =
    hasSavedDayGroups &&
    (normalizedSelectedHotel?.dayGroupsAuthoritative === true ||
      normalizedSelectedHotel?.groupedHotelSelection === true);
  const shouldPreferSavedDayGroups =
    hasAuthoritativeSavedDayGroups ||
    (hasSavedDayGroups &&
      Array.isArray(derivedServiceDayGroups) &&
      savedDayGroups.length > derivedServiceDayGroups.length);
  const derivedLuxuryDayGroups = buildLuxuryDayGroupsFromDays(servicesByDay);
  const hasDerivedLuxuryDayGroups =
    Array.isArray(derivedLuxuryDayGroups) && derivedLuxuryDayGroups.length > 0;
  const luxuryDayGroups =
    hasDerivedLuxuryDayGroups
      ? derivedLuxuryDayGroups
      : hasSavedDayGroups && normalizedSelectedHotel?.luxuryManual === true
        ? savedDayGroups
        : null;
  const derivedCategorySet = new Set(
    (Array.isArray(derivedServiceDayGroups) ? derivedServiceDayGroups : [])
      .map((group) => normalizeCategoryKey(group?.category))
      .filter(Boolean),
  );
  const hasMixedDerivedHotelCategories = derivedCategorySet.size > 1;
  const allDerivedGroupsAreLuxury =
    hasDerivedLuxuryDayGroups &&
    Array.isArray(derivedServiceDayGroups) &&
    derivedServiceDayGroups.length > 0 &&
    derivedServiceDayGroups.every(
      (group) => normalizeCategoryKey(group?.category) === "5",
    );
  // Un solo día 5★ dentro de una estancia 3★/4★/5★ no convierte toda la
  // selección en Luxury. Incluso un luxuryManual legacy se ignora cuando el
  // itinerario persistido demuestra que existen categorías mixtas.
  const isLuxuryHotel =
    (!hasMixedDerivedHotelCategories &&
      normalizedSelectedHotel?.luxuryManual === true) ||
    allDerivedGroupsAreLuxury ||
    (!hasMixedDerivedHotelCategories &&
      derivedCategorySet.size <= 1 &&
      isLuxuryStoredHotelService(firstHotelService));
  const derivedGroupedPerRoomPricing = (
    Array.isArray(derivedServiceDayGroups) ? derivedServiceDayGroups : []
  ).flatMap((group) =>
    Array.isArray(group?.perRoomPricing) ? group.perRoomPricing : [],
  );
  const firstLuxuryGroup = Array.isArray(luxuryDayGroups)
    ? luxuryDayGroups[0]
    : null;
  const luxuryRoomOptions = firstLuxuryGroup
    ? mergeLuxuryRoomOptions(luxuryDayGroups)
    : [];
  const luxuryRoomMix = firstLuxuryGroup
    ? mergeLuxuryRoomMix(luxuryDayGroups)
    : null;
  const luxuryPerRoomPricing = firstLuxuryGroup
    ? luxuryDayGroups.flatMap((group) =>
        Array.isArray(group.perRoomPricing) && group.perRoomPricing.length > 0
          ? group.perRoomPricing
          : buildLuxuryPerRoomPricing([group]),
      )
    : [];
  const luxuryPassengerIds = new Set(
    luxuryPerRoomPricing.flatMap((room) =>
      Array.isArray(room?.passengerIds) ? room.passengerIds : [],
    ),
  );
  const luxuryHotelTotal =
    Array.isArray(luxuryDayGroups) && luxuryDayGroups.length > 0
      ? luxuryDayGroups.reduce((sum, group) => sum + num(group?.hotelTotal), 0)
      : hotelTotal;
  const luxuryPriceOverrides =
    firstLuxuryGroup && luxuryRoomOptions.length > 0
      ? {
          5: luxuryRoomOptions.reduce((accumulator, room) => {
            accumulator[room.key] = num(room.pricePerRoomNight);
            return accumulator;
          }, {}),
        }
      : null;
  const luxuryCategoryRow =
    isLuxuryHotel && firstLuxuryGroup
      ? {
          luxuryManual: true,
          category: "5",
          label: "5★★★★★ Luxury",
          isSelected: true,
          selected: true,
          hotelName: firstLuxuryGroup.hotelName || "Hotel",
          id_hotel: firstLuxuryGroup.id_hotel || null,
          ciudad: firstLuxuryGroup.ciudad || null,
          roomOptions: luxuryRoomOptions,
          mix: luxuryRoomMix || firstLuxuryGroup.roomMix || {},
          roomAssignments: firstLuxuryGroup.roomAssignments || {},
          breakdown: luxuryRoomOptions.map((room) => ({
            key: room.key,
            label: room.label,
            cnt: num(luxuryRoomMix?.[room.key] || firstLuxuryGroup.roomMix?.[room.key]),
            unit: num(room.pricePerRoomNight),
            sub:
              num(room.pricePerRoomNight) *
              num(luxuryRoomMix?.[room.key] || firstLuxuryGroup.roomMix?.[room.key]),
            capacity: room.capacity,
            id_habitacion: room.id_habitacion || null,
          })),
          selectedNightIndices,
          nights: selectedNightIndices.length,
          perNightSum: num(firstLuxuryGroup.perNightSum),
          hotelTotal: luxuryHotelTotal,
          hotelPerAdult:
            luxuryPassengerIds.size > 0
              ? luxuryHotelTotal / luxuryPassengerIds.size
              : luxuryHotelTotal,
          adultEquivalentCount: Math.max(1, luxuryPassengerIds.size || 1),
          perRoomPricing: luxuryPerRoomPricing,
          priceOverrides: luxuryPriceOverrides?.[5] || {},
        }
      : null;
  const derivedMix =
    derivedMixFromService && typeof derivedMixFromService === "object"
      ? buildMixFromBreakdown(
          Object.entries(derivedMixFromService).map(([key, value]) => ({
            key,
            cnt: value,
          })),
        )
      : buildMixFromBreakdown(breakdown);
  const normalizedExistingPriceOverrides =
    normalizedSelectedHotel?.priceOverrides &&
    typeof normalizedSelectedHotel.priceOverrides === "object" &&
    !Array.isArray(normalizedSelectedHotel.priceOverrides)
      ? normalizedSelectedHotel.priceOverrides
      : {};
  const derivedPriceOverrides = breakdown.reduce((accumulator, room) => {
    if (!room?.key) return accumulator;

    return {
      ...accumulator,
      [room.key]: num(room?.unit),
    };
  }, {});
  const priceOverrides = isLuxuryHotel && luxuryPriceOverrides
    ? {
        ...normalizedExistingPriceOverrides,
        ...luxuryPriceOverrides,
      }
    : normalizedCategory
    ? {
        ...normalizedExistingPriceOverrides,
        [normalizedCategory]: {
          ...(normalizedExistingPriceOverrides[normalizedCategory] || {}),
          ...derivedPriceOverrides,
        },
      }
    : normalizedExistingPriceOverrides;
  const roomOptionsFromBreakdown = buildRoomOptionsFromBreakdown(breakdown);
  let currentChildPricing = derivedChildPricing || fallbackChildPricing;

  // Recover convertedChildToAdultMap from beneficiarios_adultos[].child_origin
  // for DB-loaded services where convertedChildToAdultMap is not persisted as a column.
  if (
    Object.keys(currentChildPricing?.convertedChildToAdultMap || {}).length === 0
  ) {
    const recoveredConvertedMap = {};
    servicesByDay.forEach((services) => {
      services.forEach((svc) => {
        // Prefer passengerSelection.convertedChildToAdultMap already built by hydrateServiceFromDB
        const psConverted =
          svc.passengerSelection?.convertedChildToAdultMap ||
          svc.passengerSelection?.ninosComoAdulto ||
          {};
        Object.entries(psConverted).forEach(([id, val]) => {
          if (val && typeof id === "string" && id.startsWith("child:")) {
            recoveredConvertedMap[id] = true;
          }
        });
        // Also scan beneficiariosAdultos (camelCase from API) or snake_case fallbacks
        const bList =
          svc.beneficiariosAdultos ||
          svc.beneficiarios_adultos ||
          svc.beneficiarios_adulto ||
          [];
        if (Array.isArray(bList)) {
          bList.forEach((b) => {
            if (
              b?.child_origin &&
              typeof b.id === "string" &&
              b.id.startsWith("child:")
            ) {
              recoveredConvertedMap[b.id] = true;
            }
          });
        }
      });
    });
    if (Object.keys(recoveredConvertedMap).length > 0) {
      currentChildPricing = {
        ...(currentChildPricing || {}),
        convertedChildToAdultMap: recoveredConvertedMap,
        treatChildrenAsAdults: true,
        pricingMode: "adult",
      };
    }
  }

  const derivedRoomAssignments = buildRoomAssignmentsFromServices(
    representativeServices,
  );

  return {
    ...normalizedSelectedHotel,
    luxuryManual: isLuxuryHotel,
    label:
      normalizedSelectedHotel?.label || (isLuxuryHotel ? "5★★★★★ Luxury" : null),
    roomAssignments:
      isLuxuryHotel && firstLuxuryGroup?.roomAssignments
        ? firstLuxuryGroup.roomAssignments
        : Object.keys(derivedRoomAssignments).length > 0
        ? derivedRoomAssignments
        : normalizedSelectedHotel?.roomAssignments || {},
    category: isLuxuryHotel ? "5" : normalizedCategory,
    hotelName:
      (isLuxuryHotel && firstLuxuryGroup?.hotelName) ||
      firstHotelService?.parentService?.nombre_hotel ||
      firstHotelService?.parentService?.nombre ||
      firstHotelService?.parentService?.name ||
      firstHotelService?.hotelName ||
      normalizedSelectedHotel?.hotelName ||
      "",
    id_hotel:
      (isLuxuryHotel && firstLuxuryGroup?.id_hotel) ||
      firstHotelService?.parentService?.id_hotel ||
      normalizedSelectedHotel?.id_hotel ||
      null,
    ciudad:
      (isLuxuryHotel && firstLuxuryGroup?.ciudad) ||
      getHotelCityFromService(firstHotelService) ||
      normalizedSelectedHotel?.ciudad ||
      normalizedSelectedHotel?.city ||
      null,
    roomType:
      normalizedSelectedHotel?.roomType ||
      representativeServices?.[0]?.childService?.tipo_habitacion ||
      firstHotelService?.childService?.tipo_habitacion ||
      "",
    nights: uniqueHotelDays.size || normalizedSelectedHotel?.nights || 0,
    selectedNightIndices,
    mix:
      isLuxuryHotel && luxuryRoomMix && Object.keys(luxuryRoomMix).length > 0
        ? luxuryRoomMix
        : Object.keys(derivedMix).length > 0
        ? derivedMix
        : normalizedSelectedHotel?.mix || {},
    breakdown:
      breakdown.length > 0
        ? breakdown
        : normalizedSelectedHotel?.breakdown || [],
    perNightBreakdowns:
      perNightBreakdowns.length > 0
        ? perNightBreakdowns
        : normalizedSelectedHotel?.perNightBreakdowns || [],
    perNightMixes:
      perNightMixes.length > 0
        ? perNightMixes
        : normalizedSelectedHotel?.perNightMixes || [],
    perNightSums:
      perNightSums.length > 0
        ? perNightSums
        : normalizedSelectedHotel?.perNightSums || [],
    perNightSum:
      num(perNightSums[firstSelectedNightIndex]) ||
      normalizedSelectedHotel?.perNightSum ||
      0,
    hotelTotal:
      (isLuxuryHotel ? luxuryHotelTotal : hotelTotal) ||
      normalizedSelectedHotel?.hotelTotal ||
      normalizedSelectedHotel?.total ||
      0,
    total:
      (isLuxuryHotel ? luxuryHotelTotal : hotelTotal) ||
      normalizedSelectedHotel?.total ||
      normalizedSelectedHotel?.hotelTotal ||
      0,
    priceOverrides,
    childPricing: currentChildPricing,
    packageType:
      normalizedSelectedHotel?.packageType ||
      firstHotelService?.packageType ||
      normalizedSelectedHotel?.package_type ||
      "compartido",
    hotelDetalle: normalizedHotelDetalle,
    hotelDetalleHtml:
      normalizedSelectedHotel?.hotelDetalleHtml ||
      normalizedHotelDetalle?.fullHtml ||
      "",
    roomOptions:
      isLuxuryHotel && luxuryRoomOptions.length > 0
        ? luxuryRoomOptions
        : roomOptionsFromBreakdown.length > 0
          ? roomOptionsFromBreakdown
          : normalizedSelectedHotel?.roomOptions || [],
    allCategoryRows:
      normalizedSelectedHotel?.allCategoryRows ||
      (luxuryCategoryRow ? [luxuryCategoryRow] : null),
    perRoomPricing:
      isLuxuryHotel && luxuryPerRoomPricing.length > 0
        ? luxuryPerRoomPricing
        : derivedGroupedPerRoomPricing.length > 0
          ? derivedGroupedPerRoomPricing
          : normalizedSelectedHotel?.perRoomPricing || [],
    roomMixNeedsAutoRefresh:
      normalizedSelectedHotel?.roomMixNeedsAutoRefresh === true,
    // For luxury, the persisted itinerary services are the authority. selectedHotel
    // can contain stale dayGroups from previous UI state and must not override DB.
    dayGroups: (() => {
      if (isLuxuryHotel && hasDerivedLuxuryDayGroups) {
        return derivedLuxuryDayGroups;
      }
      if (shouldPreferSavedDayGroups) {
        return savedDayGroups;
      }
      if (
        Array.isArray(derivedServiceDayGroups) &&
        derivedServiceDayGroups.length > 0
      ) {
        return derivedServiceDayGroups;
      }
      if (hasSavedDayGroups) {
        return savedDayGroups;
      }
      if (isLuxuryHotel && Array.isArray(derivedLuxuryDayGroups)) {
        return derivedLuxuryDayGroups;
      }
      return derivedServiceDayGroups;
    })(),
    dayGroupsAuthoritative:
      normalizedSelectedHotel?.dayGroupsAuthoritative === true,
    groupedHotelSelection: normalizedSelectedHotel?.groupedHotelSelection === true,
  };
};

/* ─── stripAutoHotelsFromDays ─── */
export const stripAutoHotelsFromDays = (daysArr = []) =>
  (daysArr || []).map((d) => ({
    ...d,
    servicios: (d.servicios || []).filter(
      (service) =>
        !isHotelService(service) || isOperationallyAssignedService(service),
    ),
  }));

const replaceHotelServicesForDay = (day, originalDay, generatedHotels) => {
  const originalServices = Array.isArray(originalDay?.servicios)
    ? originalDay.servicios
    : [];
  const existingHotels = originalServices.filter(isHotelService);
  const nonHotelServices = originalServices.filter(
    (service) => !isHotelService(service),
  );
  const reconciledHotels = reconcileHotelServiceRows(
    existingHotels,
    generatedHotels,
  );

  return {
    ...(day || originalDay || {}),
    servicios: [...nonHotelServices, ...reconciledHotels],
  };
};

/* ─── buildHotelServicesForNight ─── */
export const buildHotelServicesForNight = (
  row,
  nightIndex,
  selectedNightPosition = nightIndex,
) => {
  // Build breakdown from mix+roomOptions if row.breakdown is absent/null (multi-group path)
  let mixBreakdown = null;
  if (row?.mix && row?.roomOptions?.length > 0) {
    const optMap = new Map((row.roomOptions || []).map((o) => [o.key, o]));
    const entries = Object.entries(row.mix).filter(
      ([, cnt]) => parseInt(cnt, 10) > 0,
    );
    if (entries.length > 0) {
      mixBreakdown = entries.map(([key, rawCnt]) => {
        const opt = optMap.get(key);
        const cnt = Math.max(0, parseInt(rawCnt, 10) || 0);
        const unit = opt ? num(opt.pricePerRoomNight) : 0;
        return {
          key,
          label: opt?.label || key,
          cnt,
          unit,
          sub: unit * cnt,
          capacity: opt ? getHotelRoomCapacity(opt, 1) : 0,
          isExtraBed: opt?.isExtraBed === true || isExtraBedRoomType(opt),
          id_habitacion: opt?.id_habitacion || null,
        };
      });
    }
  }

  const breakdown =
    Array.isArray(row?.perNightBreakdowns?.[nightIndex]) &&
    row.perNightBreakdowns[nightIndex].length > 0
      ? row.perNightBreakdowns[nightIndex]
      : mixBreakdown && mixBreakdown.length > 0
        ? mixBreakdown
        : Array.isArray(row?.breakdown) && row.breakdown.length > 0
          ? row.breakdown
          : [
              {
                key: "total",
                label: "Habitaciones",
                cnt: 1,
                unit: num(row?.perNightSum),
                sub: num(row?.perNightSum),
              },
            ];
  const roomSlots = buildRoomSlotsFromBreakdown(breakdown);
  const resolvedRoomAssignments = resolveHotelRoomAssignments(
    row?.roomAssignments,
    roomSlots,
  );

  const roomIdMap = {};
  (row?.roomOptions || []).forEach((o) => {
    if (o.key && o.id_habitacion) roomIdMap[o.key] = o.id_habitacion;
  });

  const childPricing = row?.childPricing || null;
  const assignedIds = Array.isArray(childPricing?.assignedIds)
    ? childPricing.assignedIds
    : [];
  const convertedChildToAdultMap = {
    ...(childPricing?.convertedChildToAdultMap || {}),
  };
  const convertedChildIds = assignedIds.filter(
    (id) =>
      typeof id === "string" &&
      id.startsWith("child:") &&
      convertedChildToAdultMap[id],
  );
  const hotelRoomPassengerIds = assignedIds.filter(
    (id) =>
      (typeof id === "string" && id.startsWith("adult:")) ||
      convertedChildToAdultMap[id],
  );
  const childPriceMap = {
    ...(childPricing?.assignedChildExplicitPriceMap || {}),
  };
  const explicitChildIds = Object.keys(childPriceMap);
  const childExtrasTotal = num(
    childPricing?.assignedChildExplicitPriceSum || 0,
  );
  const adultEquivalentCount = Math.max(
    1,
    assignedIds.filter(
      (id) => typeof id === "string" && id.startsWith("adult:"),
    ).length + convertedChildIds.length,
  );

  const peruvianPassengerIds = new Set(
    Array.isArray(row?.peruvianPassengerIds)
      ? row.peruvianPassengerIds.map(String)
      : [],
  );

  const extraBedPassengerIds = roomSlots.flatMap((slot) => {
    if (!slot?.extraBedCount) return [];
    const ids = Array.isArray(resolvedRoomAssignments?.[slot.id])
      ? resolvedRoomAssignments[slot.id].filter(Boolean)
      : [];
    return ids.slice(
      Math.max(0, Number(slot.baseCapacity || 0)),
      Math.max(0, Number(slot.baseCapacity || 0)) +
        Math.max(0, Number(slot.extraBedCount || 0)),
    );
  });
  let extraBedPassengerCursor = 0;

  const sharedPassengerSelection = {
    selectedIds: assignedIds,
    assignedPassengerCount: assignedIds.length,
    pricingMode: childPricing?.pricingMode || "fixed",
    uniformPercentage: childPricing?.uniformPercentage || "",
    treatChildrenAsAdults: Boolean(childPricing?.treatChildrenAsAdults),
    ...(explicitChildIds.length > 0
      ? {
          hasChildExplicitPrices: true,
          assignedChildExplicitCount: explicitChildIds.length,
          assignedChildExplicitPriceMap: childPriceMap,
          assignedChildExplicitPriceSum: childExtrasTotal,
          preciosNinos: childPriceMap,
        }
      : {}),
    ...(convertedChildIds.length > 0
      ? { convertedChildToAdultMap, ninosComoAdulto: convertedChildToAdultMap }
      : {}),
  };

  return breakdown.flatMap((b, bIdx) => {
    const isExtraBed = b?.isExtraBed === true || isExtraBedRoomType(b);
    const rooms = Math.max(0, parseInt(b.cnt || 0, 10) || 0);
    const unit = num(b.unit);
    const sub = num(b.sub);
    const roomPricingList = Array.isArray(row?.perRoomPricing)
      ? row.perRoomPricing.filter(
          (rp) =>
            (rp?.roomKey || rp?.sourceRoomKey || rp?.key) === b.key ||
            String(rp?.key || "").split(":")[0] === String(b.key),
        )
      : [];
    const fallbackRoomPricing = roomPricingList[0] || null;
    const roomDetailsList = roomPricingList.flatMap((rp) =>
      Array.isArray(rp?.roomDetails) ? rp.roomDetails : [],
    );
    const isChildPricingHostGroup = bIdx === 0;

    // We generate one service per room slot
    const slotCount = Math.max(
      rooms,
      roomDetailsList.length > 0 ? roomDetailsList.length : rooms,
    );

    // Si slotCount = 0 pero breakdown existe, retornamos array vacío
    if (slotCount === 0) return [];

    return Array.from({ length: slotCount }).map((_, slotIndex) => {
      const roomDetail = roomDetailsList[slotIndex] || {};
      const roomPricing = roomPricingList[slotIndex] || fallbackRoomPricing;
      const slotId = `${b.key}:${slotIndex + 1}`;
      const assignedSlotPassengerIds = isExtraBed
        ? (() => {
            const passengerId = extraBedPassengerIds[extraBedPassengerCursor];
            extraBedPassengerCursor += 1;
            return passengerId ? [passengerId] : [];
          })()
        : Array.isArray(resolvedRoomAssignments?.[slotId])
          ? resolvedRoomAssignments[slotId].filter(Boolean)
          : null;
      const hasAssignedSlotPassengers = Array.isArray(assignedSlotPassengerIds);
      // hpm-room-assignments is the authority. roomDetail/roomPricing can be
      // stale after changing a room distribution and must be fallback only.
      const slotPassengerIds = hasAssignedSlotPassengers
        ? assignedSlotPassengerIds
        : roomDetail.passengerIds ||
          roomPricing?.passengerIds ||
          hotelRoomPassengerIds;
      const isChildPricingHost = isChildPricingHostGroup && slotIndex === 0;

      const knownConvertedChildIds = new Set([
        ...(roomDetail.convertedChildPassengerIds || []),
        ...(roomPricing?.convertedChildPassengerIds || []),
        ...Object.keys(convertedChildToAdultMap || {}).filter(
          (id) => convertedChildToAdultMap?.[id],
        ),
      ].map(String));
      const isConvertedChildInRoom = (id) => {
        const value = String(id);
        return (
          knownConvertedChildIds.has(value) ||
          (value.startsWith("child:") &&
            Boolean(convertedChildToAdultMap?.[id]))
        );
      };

      const roomAdultPassengerIds = hasAssignedSlotPassengers
        ? slotPassengerIds.filter((id) => !isConvertedChildInRoom(id))
        : roomDetail.adultPassengerIds || roomPricing?.adultPassengerIds || [];
      const roomConvertedChildPassengerIds = hasAssignedSlotPassengers
        ? slotPassengerIds.filter(isConvertedChildInRoom)
        : roomDetail.convertedChildPassengerIds ||
          roomPricing?.convertedChildPassengerIds ||
          [];

      const roomBeneficiaries = slotPassengerIds.length;
      const roomAdultBeneficiaries = roomAdultPassengerIds.length;
      const roomConvertedChildBeneficiaries =
        roomConvertedChildPassengerIds.length;

      const roomBaseUnit = num(
        roomDetail.baseUnit ?? roomDetail.roomBaseUnit ?? unit,
      );
      const hasPassengerDerivedIgv = slotPassengerIds.some((id) =>
        passengerIdMatchesSet(id, peruvianPassengerIds),
      );
      const hasRoomIgv =
        peruvianPassengerIds.size > 0
          ? hasPassengerDerivedIgv
          : Boolean(
              roomDetail.hasIgv ||
                roomDetail.tieneIgv ||
                roomDetail.roomHasIgv ||
                roomPricing?.hasIgv ||
                roomPricing?.tieneIgv,
            );
      const storedUnitWithIgv = num(
        roomDetail.unitWithIgv ??
          roomDetail.roomUnitWithIgv ??
          roomDetail.unit ??
          roomDetail.roomUnitPrice ??
          unit,
      );
      const roomUnitWithIgv = hasRoomIgv
        ? Math.round(roomBaseUnit * 1.18 * 100) / 100
        : roomBaseUnit || storedUnitWithIgv;
      const roomIgvAmount = hasRoomIgv
        ? Math.max(0, Math.round((roomUnitWithIgv - roomBaseUnit) * 100) / 100)
        : 0;
      const divisor = roomBeneficiaries || 1;
      const hotelAdultUnitPrice = roomUnitWithIgv;

      const matchedHabitacionId = roomIdMap[b.key] || null;
      const childService = matchedHabitacionId
        ? {
            id_habitacion: matchedHabitacionId,
            tipo_habitacion: b.label,
            capacidad: getHotelRoomCapacity(b, 1),
          }
        : null;

      const slotChildPriceMap = {};
      const slotExplicitChildIds = [];
      let slotChildExtrasTotal = 0;

      slotPassengerIds.forEach((id) => {
        if (childPriceMap[id] !== undefined) {
          slotChildPriceMap[id] = childPriceMap[id];
          slotExplicitChildIds.push(id);
          slotChildExtrasTotal += childPriceMap[id];
        }
      });

      const hasChildExplicitPrices = slotExplicitChildIds.length > 0;
      const assignedChildExplicitCount = slotExplicitChildIds.length;

      const slotSharedPassengerSelection = {
        selectedIds: slotPassengerIds,
        assignedPassengerCount: slotPassengerIds.length,
        pricingMode: childPricing?.pricingMode || "fixed",
        uniformPercentage: childPricing?.uniformPercentage || "",
        treatChildrenAsAdults: Boolean(childPricing?.treatChildrenAsAdults),
        ...(roomConvertedChildPassengerIds.length > 0
          ? { convertedChildToAdultMap }
          : {}),
      };
      const hostKeepsGlobalChildPricing =
        isChildPricingHost &&
        (explicitChildIds.length > 0 || convertedChildIds.length > 0);
      const servicePassengerSelectionBase = hostKeepsGlobalChildPricing
        ? sharedPassengerSelection
        : hasChildExplicitPrices
          ? {
              ...slotSharedPassengerSelection,
              hasChildExplicitPrices,
              assignedChildExplicitCount,
              assignedChildExplicitPriceMap: slotChildPriceMap,
              assignedChildExplicitPriceSum: slotChildExtrasTotal,
            }
          : slotSharedPassengerSelection;
      const servicePassengerSelection = {
        ...servicePassengerSelectionBase,
        selectedIds: slotPassengerIds,
        assignedPassengerCount: slotPassengerIds.length,
      };
      const serviceConvertedMap = hostKeepsGlobalChildPricing
        ? convertedChildToAdultMap
        : roomConvertedChildPassengerIds.length > 0
          ? convertedChildToAdultMap
          : null;
      const serviceChildPriceMap = hostKeepsGlobalChildPricing
        ? childPriceMap
        : hasChildExplicitPrices
          ? slotChildPriceMap
          : null;
      const serviceChildPriceSum = hostKeepsGlobalChildPricing
        ? childExtrasTotal
        : slotChildExtrasTotal;
      const serviceChildPriceCount = hostKeepsGlobalChildPricing
        ? explicitChildIds.length
        : assignedChildExplicitCount;

      return {
        id: `auto-hotel-${row.category}-${b.key}-r${slotIndex + 1}-n${nightIndex + 1}`,
        typeService: "hoteles",
        nombre: `${row.hotelName} · ${b.label}`,
        serviceName: `${row.hotelName} · ${b.label}`,
        descripcion: `Noche ${nightIndex + 1} · Habitación ${slotIndex + 1} · ${roomUnitWithIgv} c/u`,
        parentService: {
          typeService: "hoteles",
          nombre: row.hotelName,
          name: row.hotelName,
          categoria: row.category,
          ...(row.ciudad || row.city ? { ciudad: row.ciudad || row.city } : {}),
          ...(row.id_hotel ? { id_hotel: row.id_hotel } : {}),
        },
        ...(childService ? { childService } : {}),
        tariff: {
          precio: roomUnitWithIgv,
          precio_original: roomUnitWithIgv,
          precio_base_sin_igv: roomBaseUnit,
          roomBaseUnitPrice: roomBaseUnit,
          roomUnitPrice: roomBaseUnit,
          roomUnitPriceWithIgv: roomUnitWithIgv,
          moneda: "dolares",
          ...(hasChildExplicitPrices
            ? {
                childExtrasTotal: slotChildExtrasTotal,
                precio_original_with_child_extras:
                  roomUnitWithIgv + slotChildExtrasTotal,
              }
            : { precio_original_with_child_extras: roomUnitWithIgv }),
          tieneIgv: hasRoomIgv,
          hasIgv: hasRoomIgv,
          igvRate: hasRoomIgv ? 18 : 0,
          igvAmount: roomIgvAmount,
        },
        assignedPassengerIds: slotPassengerIds,
        assignedPassengerCount: slotPassengerIds.length,
        pricingMode: childPricing?.pricingMode || "fixed",
        uniformPercentage: childPricing?.uniformPercentage || "",
        treatChildrenAsAdults: Boolean(childPricing?.treatChildrenAsAdults),
        ...(serviceConvertedMap && Object.keys(serviceConvertedMap).length > 0
          ? { convertedChildToAdultMap: serviceConvertedMap }
          : {}),
        ...(serviceChildPriceMap && Object.keys(serviceChildPriceMap).length > 0
          ? {
              assignedChildExplicitPriceMap: serviceChildPriceMap,
              assignedChildExplicitPriceSum: serviceChildPriceSum,
              assignedChildExplicitCount: serviceChildPriceCount,
              hasChildExplicitPrices: true,
            }
          : {}),
        passengerSelection: servicePassengerSelection,
        autoHotel: true,
        autoAddedHotel: true,
        // Persist the canonical room tariff WITHOUT IGV. The runtime tariff
        // above remains tax-inclusive for totals, while the igv boolean is the
        // sole authority for applying the 18% charge after reloading.
        precioServicio: roomBaseUnit,
        precioAdultoDividido: true,
        capacidadLimite: true,
        igv: hasRoomIgv,
        precio_adult: hotelAdultUnitPrice,
        hotelAdultUnitPrice,
        hotelAdultEquivalentCount: adultEquivalentCount,
        hotelCategory: row.category,
        hotelName: row.hotelName,
        ...(row.ciudad || row.city ? { ciudad: row.ciudad || row.city } : {}),
        roomKey: b.key,
        habitacion_capacidad: getHotelRoomCapacity(b, 1),
        habitacion_es_cama_adicional: isExtraBed,
        roomCount: 1,
        roomUnitPrice: roomBaseUnit,
        roomUnitPriceWithIgv: roomUnitWithIgv,
        roomBaseUnitPrice: roomBaseUnit,
        roomHasIgv: hasRoomIgv,
        tieneIgv: hasRoomIgv,
        hasIgv: hasRoomIgv,
        roomIgvAmount,
        roomBeneficiaries,
        roomAdultBeneficiaries,
        roomConvertedChildBeneficiaries,
        roomPassengerIds: slotPassengerIds,
        roomAdultPassengerIds,
        roomConvertedChildPassengerIds,
        beneficiarios_adulto: buildAdultBeneficiariosPayload(
          slotPassengerIds,
          convertedChildToAdultMap,
        ),
        beneficiarios_ninos: buildChildBeneficiariosPayload(
          slotPassengerIds,
          childPriceMap,
          convertedChildToAdultMap,
        ),
        hotelNight: nightIndex + 1,
        hotelNights: Math.max(1, Number(row?.nights || 1)),
        hotelPerNightSum: num(
          row?.perNightSums?.[nightIndex] ?? row?.perNightSum,
        ),
        hotelTotalFacturado: num(row?.hotelTotal),
        hotelMix: row?.perNightMixes?.[nightIndex] || row?.mix || {},
        selectedNightPosition,
      };
    });
  });
};

/* ─── injectHotelIntoDays (pure — returns new array) ─── */
export const injectHotelIntoDaysPure = (prevDays, row) => {
  const originalDays = Array.isArray(prevDays) ? prevDays : [];
  const next = stripAutoHotelsFromDays(originalDays);
  if (!row) return next;

  // Multi-category support: if dayGroups is present, inject per group
  const dayGroupsPayload = Array.isArray(row?.dayGroups) ? row.dayGroups : null;
  if (dayGroupsPayload && dayGroupsPayload.length > 0) {
    dayGroupsPayload.forEach((g) => {
      if (
        !g.category ||
        !Array.isArray(g.dayIndices) ||
        g.dayIndices.length === 0
      )
        return;
      const groupNightIndices = [...new Set(g.dayIndices)]
        .map((v) => parseInt(v, 10))
        .filter((v) => Number.isInteger(v) && v >= 0)
        .sort((a, b) => a - b);
      const maxNightIndex = Math.max(...groupNightIndices, 0);
      while (next.length <= maxNightIndex) {
        next.push({ numero: next.length + 1, servicios: [], ciudades: [] });
      }
      // Build a per-group row that mirrors the original row structure
      const groupRow = {
        ...row,
        category: g.category,
        hotelName: g.hotelName || row.hotelName,
        id_hotel: g.id_hotel ?? row.id_hotel,
        ciudad: g.ciudad || g.city || row.ciudad || row.city || null,
        mix: g.roomMix || {},
        roomAssignments: g.roomAssignments || row.roomAssignments || null,
        roomOptions:
          g.roomOptions?.length > 0 ? g.roomOptions : row.roomOptions,
        priceOverrides: g.priceOverrides || row.priceOverrides || {},
        peruvianPassengerIds:
          g.peruvianPassengerIds || row.peruvianPassengerIds || [],
        perRoomPricing: Array.isArray(g?.perRoomPricing)
          ? g.perRoomPricing
          : Array.isArray(row?.perRoomPricing)
            ? row.perRoomPricing
            : [],
        perNightSum: num(g?.perNightSum || row?.perNightSum),
        hotelTotal: num(g?.hotelTotal || row?.hotelTotal),
        selectedNightIndices: groupNightIndices,
        nights: groupNightIndices.length,
        breakdown: null, // will be re-derived from costFromMix equivalent in buildHotelServicesForNight
      };
      groupNightIndices.forEach((dayIndex, selectedNightPosition) => {
        const day = next[dayIndex] || {
          numero: dayIndex + 1,
          servicios: [],
          ciudades: [],
        };
        const hotelNightServices = buildHotelServicesForNight(
          groupRow,
          dayIndex,
          selectedNightPosition,
        );
        next[dayIndex] = replaceHotelServicesForDay(
          day,
          originalDays[dayIndex],
          hotelNightServices,
        );
      });
    });
    return next;
  }

  const explicitNightIndices = Array.isArray(row?.selectedNightIndices)
    ? row.selectedNightIndices
        .map((v) => parseInt(v, 10))
        .filter((v) => Number.isInteger(v) && v >= 0)
    : [];

  const selectedNightIndices =
    explicitNightIndices.length > 0
      ? [...new Set(explicitNightIndices)].sort((a, b) => a - b)
      : Array.from(
          { length: Math.max(1, Number(row?.nights || 1)) },
          (_, idx) => idx,
        );

  const maxNightIndex = Math.max(...selectedNightIndices, 0);

  while (next.length <= maxNightIndex) {
    next.push({ numero: next.length + 1, servicios: [], ciudades: [] });
  }

  selectedNightIndices.forEach((dayIndex, selectedNightPosition) => {
    const day = next[dayIndex] || {
      numero: dayIndex + 1,
      servicios: [],
      ciudades: [],
    };
    const hotelNightServices = buildHotelServicesForNight(
      row,
      dayIndex,
      selectedNightPosition,
    );
    next[dayIndex] = replaceHotelServicesForDay(
      day,
      originalDays[dayIndex],
      hotelNightServices,
    );
  });

  return next;
};
