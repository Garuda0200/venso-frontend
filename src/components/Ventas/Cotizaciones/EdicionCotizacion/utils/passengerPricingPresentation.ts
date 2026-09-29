import {
  getPassengerIdAliases,
  isPeruvianPassenger,
  passengerIdMatchesSet,
} from "./igvUtils";
import {
  getPassengerSlotKey,
  getServiceBeneficiarySnapshot,
} from "./passengerPricingState";
import {
  getServiceAdultUnitPrice,
  getServicePricingSnapshot,
} from "./servicePricingRuntime";
import { childServiceTotalMatchesCanonical } from "./childServicePricingReconciliation";

const round2 = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const uniqueStrings = (values = []) => [
  ...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)),
];

const readPassengerExplicitIds = (passenger = {}) => [
  passenger?.id,
  passenger?.id_pasajero,
  passenger?.idPasajero,
  passenger?.passengerId,
  passenger?.passenger_id,
  passenger?.pasajeroId,
  passenger?.uid,
  passenger?.passenger_key,
  passenger?.passengerKey,
];

export const getPassengerPresentation = (
  passenger = {},
  prefix = "adult",
  index = 0,
) => {
  // El slot corto con dos puntos es siempre base uno. passenger_key se añade
  // después como identidad exacta porque en datos históricos el guion puede
  // ser base cero o base uno.
  const aliases = new Set([`${prefix}:${index + 1}`]);
  const explicitIds = uniqueStrings(readPassengerExplicitIds(passenger));

  explicitIds.forEach((id) => {
    getPassengerIdAliases(id).forEach((alias) => aliases.add(alias));
  });

  const numericId = String(
    passenger?.id_pasajero || passenger?.idPasajero || passenger?.id || "",
  ).trim();
  if (numericId) {
    aliases.add(`${prefix}:${index}:${numericId}`);
    aliases.add(`${prefix}:${index + 1}:${numericId}`);
  }

  const fullName = [
    passenger?.nombres || passenger?.nombre || passenger?.firstName,
    passenger?.apellidos || passenger?.apellido || passenger?.lastName,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

  return {
    passenger,
    prefix,
    index,
    aliases,
    label: fullName || `${prefix === "child" ? "Niño" : "Adulto"} ${index + 1}`,
    isNational: isPeruvianPassenger(passenger),
  };
};

export const buildPassengerPresentations = (peopleDetails = {}) => [
  ...(Array.isArray(peopleDetails?.adults) ? peopleDetails.adults : []).map(
    (passenger, index) => getPassengerPresentation(passenger, "adult", index),
  ),
  ...(Array.isArray(peopleDetails?.children) ? peopleDetails.children : []).map(
    (passenger, index) => getPassengerPresentation(passenger, "child", index),
  ),
];

const readIds = (...sources) =>
  uniqueStrings(
    sources.flatMap((source) => {
      if (!Array.isArray(source)) return [];
      return source.map((entry) =>
        typeof entry === "object" && entry !== null
          ? entry.id || entry.passengerId || entry.passenger_id
          : entry,
      );
    }),
  );

export const getRoomPassengerIds = (room = {}) =>
  readIds(
    room?.passengerIds,
    room?.roomPassengerIds,
    room?.adultPassengerIds,
    room?.convertedChildPassengerIds,
    room?.explicitChildPassengerIds,
    ...(Array.isArray(room?.roomDetails)
      ? room.roomDetails.flatMap((detail) => [
          detail?.passengerIds,
          detail?.roomPassengerIds,
          detail?.adultPassengerIds,
          detail?.convertedChildPassengerIds,
          detail?.explicitChildPassengerIds,
        ])
      : []),
  );

export const getRoomChildPassengerIds = (room = {}) =>
  readIds(
    room?.convertedChildPassengerIds,
    room?.explicitChildPassengerIds,
    room?.childPassengerIds,
    ...(Array.isArray(room?.roomDetails)
      ? room.roomDetails.flatMap((detail) => [
          detail?.convertedChildPassengerIds,
          detail?.explicitChildPassengerIds,
          detail?.childPassengerIds,
          (Array.isArray(detail?.passengerIds)
            ? detail.passengerIds
            : []
          ).filter((id) =>
            String(id || "")
              .toLowerCase()
              .startsWith("child"),
          ),
        ])
      : []),
    (Array.isArray(room?.passengerIds) ? room.passengerIds : []).filter((id) =>
      String(id || "")
        .toLowerCase()
        .startsWith("child"),
    ),
  );

const roomHasIgvFlag = (room = {}) =>
  Boolean(
    room?.hasIgv ||
    room?.tieneIgv ||
    toNumber(room?.igvPerPerson) > 0 ||
    (Array.isArray(room?.roomDetails) &&
      room.roomDetails.some(
        (detail) =>
          detail?.hasIgv ||
          detail?.tieneIgv ||
          detail?.roomHasIgv ||
          toNumber(detail?.igvAmount) > 0,
      )),
  );

export const getRoomBeneficiaryCountForDisplay = (room = {}) =>
  Math.max(
    0,
    toNumber(room?.beneficiaries) ||
      toNumber(room?.totalBeneficiaryCount) ||
      getRoomPassengerIds(room).length ||
      toNumber(room?.adultBeneficiaries) +
        toNumber(room?.convertedChildBeneficiaries) +
        toNumber(room?.explicitChildBeneficiaries),
  );

export const getRoomIgvPerPersonForDisplay = (room = {}) => {
  const direct = toNumber(room?.igvPerPerson);
  if (direct > 0) return round2(direct);

  const details = Array.isArray(room?.roomDetails) ? room.roomDetails : [];
  const stayIgv = details.reduce((sum, detail) => {
    if (
      !detail?.hasIgv &&
      !detail?.tieneIgv &&
      !detail?.roomHasIgv &&
      toNumber(detail?.igvAmount) <= 0
    ) {
      return sum;
    }
    const unit = toNumber(
      detail?.unitWithIgv ?? detail?.unit ?? detail?.roomUnitPrice,
    );
    const nights =
      unit > 0
        ? toNumber(detail?.hotelTotalRoom) / unit
        : Math.max(1, toNumber(room?.nights) || 1);
    return sum + toNumber(detail?.igvAmount) * Math.max(1, nights || 1);
  }, 0);
  const beneficiaries = getRoomBeneficiaryCountForDisplay(room);
  return beneficiaries > 0 ? round2(stayIgv / beneficiaries) : 0;
};

export const resolveRoomNationalityImpact = (room = {}, peopleDetails = {}) => {
  const roomIds = getRoomPassengerIds(room);
  const passengers = buildPassengerPresentations(peopleDetails);
  const nationalPassengers = passengers.filter(
    (entry) =>
      entry.isNational &&
      roomIds.some((id) => passengerIdMatchesSet(id, entry.aliases)),
  );
  const igvPerPerson = getRoomIgvPerPersonForDisplay(room);
  const hasIgv = roomHasIgvFlag(room) || igvPerPerson > 0;

  return {
    hasIgv,
    isNationalRoom: nationalPassengers.length > 0 || hasIgv,
    igvPerPerson,
    affectedPaxCount: getRoomBeneficiaryCountForDisplay(room),
    nationalPassengerLabels: nationalPassengers.map((entry) => entry.label),
  };
};

const normalizeRoomIdentity = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^ninos?\s+/, "")
    .replace(/^habitacion\s+/, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const getPartRoomKeyCandidates = (part = {}) => {
  const raw = String(part?.roomKey || part?.key || "").trim();
  if (!raw) return [];

  return uniqueStrings([
    raw,
    raw.replace(/^(summary-)?adult-room-/, ""),
    raw.replace(/^(summary-)?room-converted-/, ""),
    raw.replace(/^(summary-)?converted-room-/, ""),
    raw.replace(/^(summary-)?room-/, ""),
  ]);
};

/**
 * Adds the authoritative room/IGV context to the rounded per-passenger rows.
 * Both SummaryContent and AdditionalCosts use this before rendering the
 * reconciliation component, so the verification explains the same national
 * room rule as the detailed calculation cards.
 */
export const enrichPassengerPricePartsWithRoomImpact = ({
  parts = [],
  perRoomPricing = [],
  peopleDetails = {},
} = {}) => {
  const rooms = Array.isArray(perRoomPricing) ? perRoomPricing : [];

  return (Array.isArray(parts) ? parts : []).map((part) => {
    const keyCandidates = getPartRoomKeyCandidates(part);
    const labelIdentity = normalizeRoomIdentity(part?.roomLabel || part?.label);
    const room = rooms.find((candidate) => {
      const roomKeys = uniqueStrings([
        candidate?.key,
        candidate?.roomKey,
        candidate?.baseKey,
      ]);
      if (keyCandidates.some((key) => roomKeys.includes(key))) return true;

      const roomIdentity = normalizeRoomIdentity(
        candidate?.label || candidate?.baseLabel || candidate?.roomLabel,
      );
      return Boolean(labelIdentity && roomIdentity && labelIdentity === roomIdentity);
    });

    if (!room) return part;

    const childPart =
      String(part?.key || "").includes("converted") ||
      normalizeRoomIdentity(part?.label).startsWith("nino") ||
      String(part?.className || "").toLowerCase().includes("child");
    const hotelPerPerson = round2(
      childPart
        ? toNumber(
            room?.convertedChildHotelPerPerson ||
              room?.explicitChildHotelPerPerson ||
              room?.childHotelPerPerson ||
              room?.hotelPerPerson,
          )
        : toNumber(room?.hotelPerPerson),
    );
    const impact = resolveRoomNationalityImpact(room, peopleDetails);

    return {
      ...part,
      roomKey: room?.key || room?.roomKey || part?.roomKey,
      roomLabel:
        room?.label || room?.baseLabel || part?.roomLabel || part?.label,
      roomCapacity:
        toNumber(room?.capacity || room?.roomCapacity) ||
        part?.roomCapacity ||
        null,
      hotelPerPerson,
      hotelBasePerPerson: Math.max(
        0,
        round2(hotelPerPerson - toNumber(impact.igvPerPerson)),
      ),
      ...impact,
    };
  });
};

const hasMapEntries = (map) =>
  map && typeof map === "object" && Object.keys(map).length > 0;

const findAmountForAliases = (map, aliases) => {
  if (!hasMapEntries(map)) return { found: false, value: 0 };

  const matchingEntry = Object.entries(map).find(([key]) =>
    passengerIdMatchesSet(key, aliases),
  );
  if (!matchingEntry) return { found: false, value: 0 };

  return { found: true, value: round2(toNumber(matchingEntry[1])) };
};

const sumMappedAmounts = (maps, aliases) =>
  maps.reduce(
    (result, map) => {
      const match = findAmountForAliases(map, aliases);
      return {
        found: result.found || match.found,
        value: round2(result.value + match.value),
      };
    },
    { found: false, value: 0 },
  );

const firstPopulatedMap = (...maps) => maps.find(hasMapEntries) || null;

const sumMapValues = (maps = []) =>
  round2(
    maps.reduce(
      (total, map) =>
        total +
        Object.values(hasMapEntries(map) ? map : {}).reduce(
          (mapTotal, value) => mapTotal + toNumber(value),
          0,
        ),
      0,
    ),
  );

const reconcileServiceMapsWithAuthoritativeFallback = ({
  maps = [],
  children = [],
  count = 0,
  fallbackPerChild = 0,
  authoritative = false,
} = {}) => {
  if (!authoritative || !maps.some(hasMapEntries)) return maps;

  const fallback = Number(fallbackPerChild);
  if (!Number.isFinite(fallback) || fallback < 0) return maps;

  const mappedTotal = sumMapValues(maps);
  const totalsMatch = childServiceTotalMatchesCanonical({
    candidateTotal: mappedTotal,
    canonicalPerChild: fallback,
    childrenCount: count,
  });
  const identitiesMatch = maps.every((map) =>
    Object.keys(hasMapEntries(map) ? map : {}).every((id) =>
      children.some((child) => passengerIdMatchesSet(id, child.aliases)),
    ),
  );

  // Los mapas detallados pueden sobrevivir a una hidratacion parcial. Si su
  // suma o sus pasajeros ya no corresponden al scalar canonico guardado, se
  // omiten para que todos los consumidores usen el mismo precio por nino.
  return totalsMatch && identitiesMatch ? maps : [];
};

const readChildMaps = (source = {}) => ({
  serviceMaps: [
    firstPopulatedMap(
      source?.nonHotelExplicitChildTotalsById,
      source?.baseExplicitChildTotalsById,
      source?.non_hotel_explicit_child_totals_by_id,
    ),
    firstPopulatedMap(
      source?.nonHotelConvertedChildTotalsById,
      source?.baseConvertedChildTotalsById,
      source?.non_hotel_converted_child_totals_by_id,
    ),
  ].filter(Boolean),
  hotelMaps: [
    firstPopulatedMap(
      source?.hotelExplicitChildTotalsById,
      source?.hotel_explicit_child_totals_by_id,
    ),
    firstPopulatedMap(
      source?.hotelConvertedChildTotalsById,
      source?.hotel_converted_child_totals_by_id,
    ),
  ].filter(Boolean),
});

export const buildChildPricingRows = ({
  peopleDetails = {},
  childrenCount = 0,
  additionalCosts = {},
  pricingSource = {},
  perRoomPricing = [],
  serviceFallbackPerChild = 0,
  authoritativeServiceFallback = false,
  hotelFallbackPerChild = 0,
  externalPerChild = 0,
  calculateAdditional,
} = {}) => {
  const count = Math.max(
    0,
    Number(childrenCount || 0),
    Array.isArray(peopleDetails?.children) ? peopleDetails.children.length : 0,
  );
  if (count <= 0) return [];

  const children = Array.from({ length: count }, (_, index) =>
    getPassengerPresentation(
      peopleDetails?.children?.[index] || {},
      "child",
      index,
    ),
  );
  const primaryMaps = readChildMaps(additionalCosts);
  const fallbackMaps = readChildMaps(pricingSource);
  const candidateServiceMaps = primaryMaps.serviceMaps.some(hasMapEntries)
    ? primaryMaps.serviceMaps
    : fallbackMaps.serviceMaps;
  const serviceMaps = reconcileServiceMapsWithAuthoritativeFallback({
    maps: candidateServiceMaps,
    children,
    count,
    fallbackPerChild: serviceFallbackPerChild,
    authoritative: authoritativeServiceFallback,
  });
  const hotelMaps = primaryMaps.hotelMaps.some(hasMapEntries)
    ? primaryMaps.hotelMaps
    : fallbackMaps.hotelMaps;
  const hasServiceMaps = serviceMaps.some(hasMapEntries);
  const hasHotelMaps = hotelMaps.some(hasMapEntries);
  const rooms = Array.isArray(perRoomPricing) ? perRoomPricing : [];
  const hasRoomChildIdentities = rooms.some(
    (room) => getRoomChildPassengerIds(room).length > 0,
  );

  return children.map((entry) => {
    const mappedServices = sumMappedAmounts(serviceMaps, entry.aliases);
    const mappedHotel = sumMappedAmounts(hotelMaps, entry.aliases);
    const matchingRooms = rooms.filter((room) =>
      getRoomChildPassengerIds(room).some((id) =>
        passengerIdMatchesSet(id, entry.aliases),
      ),
    );
    const roomHotel = round2(
      matchingRooms.reduce(
        (sum, room) =>
          sum +
          toNumber(
            room?.convertedChildHotelPerPerson ||
              room?.explicitChildHotelPerPerson ||
              room?.childHotelPerPerson ||
              room?.hotelPerPerson,
          ),
        0,
      ),
    );
    const roomIgv = round2(
      matchingRooms.reduce(
        (sum, room) => sum + getRoomIgvPerPersonForDisplay(room),
        0,
      ),
    );
    const roomLabels = uniqueStrings(
      matchingRooms.map(
        (room) => room?.label || room?.baseLabel || "Habitación",
      ),
    );
    const nationalRoom = matchingRooms.some(
      (room) =>
        resolveRoomNationalityImpact(room, peopleDetails).isNationalRoom,
    );

    const services = mappedServices.found
      ? mappedServices.value
      : hasServiceMaps
        ? 0
        : round2(serviceFallbackPerChild);
    const hotel =
      matchingRooms.length > 0
        ? roomHotel
        : mappedHotel.found
          ? mappedHotel.value
          : hasRoomChildIdentities || hasHotelMaps
            ? 0
            : round2(hotelFallbackPerChild);
    const base = round2(services + hotel);
    const additional =
      typeof calculateAdditional === "function"
        ? calculateAdditional(base, additionalCosts, "child")
        : { operational: 0, fee: 0, extra: 0, total: 0 };
    const external = round2(externalPerChild);
    const total = round2(base + toNumber(additional?.total) + external);

    return {
      key: `child-price-${entry.index + 1}`,
      index: entry.index,
      label: entry.label,
      passenger: entry.passenger,
      aliases: entry.aliases,
      isNational: entry.isNational,
      services,
      hotel,
      hotelBase: Math.max(0, round2(hotel - roomIgv)),
      igv: roomIgv,
      nationalRoom,
      roomLabels,
      external,
      additional: {
        operational: round2(toNumber(additional?.operational)),
        fee: round2(toNumber(additional?.fee)),
        extra: round2(toNumber(additional?.extra)),
        total: round2(toNumber(additional?.total)),
      },
      total,
      isFree: total <= 0,
    };
  });
};

const getChildPresentationById = (
  childId,
  peopleDetails = {},
  fallbackIndex = 0,
) => {
  const children = Array.isArray(peopleDetails?.children)
    ? peopleDetails.children
    : [];
  const presentations = children.map((child, index) =>
    getPassengerPresentation(child, "child", index),
  );
  const matched = presentations.find((entry) =>
    passengerIdMatchesSet(childId, entry.aliases),
  );
  if (matched) return matched;

  const parts = String(childId || "").split(":");
  const parsedIndex = Number.parseInt(parts[1], 10);
  const index = Number.isInteger(parsedIndex) && parsedIndex >= 0
    ? parts.length > 2
      ? parsedIndex
      : Math.max(0, parsedIndex - 1)
    : fallbackIndex;
  return getPassengerPresentation(children[index] || {}, "child", index);
};

const parseBeneficiaryArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeServiceForChildPricing = (service = {}) => {
  const unitPrice =
    service?.precioServicio ??
    service?.precio_servicio ??
    service?.tariff?.precio ??
    service?.precio;
  const totalPrice =
    service?.precioTotal ??
    service?.precio_total ??
    service?.tariff?.precio_original ??
    service?.precio_original ??
    unitPrice;
  const dividedAdultPrice =
    service?.precioAdultoDividido ??
    service?.precio_adulto_dividido ??
    service?.tariff?.precio_adulto_dividido;
  const hasFlatPrice =
    unitPrice !== undefined ||
    totalPrice !== undefined ||
    dividedAdultPrice !== undefined;
  const tariff = hasFlatPrice
    ? {
        ...(service?.tariff || {}),
        ...(service?.tariff?.precio == null && unitPrice !== undefined
          ? { precio: unitPrice }
          : {}),
        ...(service?.tariff?.precio_original == null && totalPrice !== undefined
          ? { precio_original: totalPrice }
          : {}),
        ...(service?.tariff?.precio_adulto_dividido == null &&
        dividedAdultPrice !== undefined
          ? { precio_adulto_dividido: dividedAdultPrice }
          : {}),
      }
    : service?.tariff;

  return {
    ...service,
    typeService: service?.typeService || service?.tipo_servicio,
    ...(tariff ? { tariff } : {}),
    beneficiariosAdultos: parseBeneficiaryArray(
      service?.beneficiariosAdultos || service?.beneficiarios_adultos || [],
    ),
    beneficiariosNinos: parseBeneficiaryArray(
      service?.beneficiariosNinos || service?.beneficiarios_ninos || [],
    ),
    precioServicio: unitPrice,
    precioTotal: totalPrice,
    precioAdultoDividido: dividedAdultPrice,
  };
};

export const resolveServiceAdultUnitPriceForPresentation = (service = {}) =>
  round2(getServiceAdultUnitPrice(normalizeServiceForChildPricing(service)));

const hasOwnBeneficiaryField = (service = {}) =>
  [
    "beneficiariosAdultos",
    "beneficiarios_adultos",
    "beneficiariosNinos",
    "beneficiarios_ninos",
    "assignedBeneficiariosAdultos",
    "assigned_beneficiarios_adultos",
    "assignedBeneficiariosNinos",
    "assigned_beneficiarios_ninos",
  ].some((field) => Object.prototype.hasOwnProperty.call(service, field));

const isHotelServiceForPricing = (service = {}) => {
  const type = String(
    service?.typeService ||
      service?.tipo_servicio ||
      service?.parentService?.typeService ||
      service?.parentService?.tipo_servicio ||
      "",
  ).toLowerCase();

  return (
    type === "hotel" ||
    type === "hoteles" ||
    Boolean(
      service?.childService?.tipo_habitacion ||
        service?.childService?.habitacion?.tipo_habitacion,
    )
  );
};

const getAuthoritativeHotelChildEntries = (service = {}) => {
  const adultEntries = parseBeneficiaryArray(
    service?.beneficiariosAdultos ??
      service?.beneficiarios_adultos ??
      service?.assignedBeneficiariosAdultos ??
      service?.assigned_beneficiarios_adultos ??
      [],
  );
  const childEntries = parseBeneficiaryArray(
    service?.beneficiariosNinos ??
      service?.beneficiarios_ninos ??
      service?.assignedBeneficiariosNinos ??
      service?.assigned_beneficiarios_ninos ??
      [],
  );

  const rows = [];
  adultEntries.forEach((entry) => {
    const id = String(entry?.id || entry?.passengerId || entry?.passenger_id || "");
    const childId = String(entry?.child_origin || entry?.childOrigin || "");
    const authoritativeChildId = childId || (id.startsWith("child:") ? id : "");
    if (!authoritativeChildId) return;
    rows.push({ childId: authoritativeChildId, asAdult: true });
  });
  childEntries.forEach((entry) => {
    const childId = String(
      entry?.id || entry?.passengerId || entry?.passenger_id || "",
    );
    if (!childId.startsWith("child:")) return;
    rows.push({
      childId,
      asAdult: Boolean(
        entry?.asAdult ||
          entry?.as_adult ||
          entry?.childAsAdult ||
          entry?.child_as_adult,
      ),
      amount: entry?.precio ?? entry?.price ?? entry?.amount,
    });
  });

  const bySlot = new Map();
  rows.forEach((row) => {
    const slot = getPassengerSlotKey(row.childId);
    if (!slot) return;
    const current = bySlot.get(slot);
    bySlot.set(slot, {
      ...(current || {}),
      ...row,
      asAdult: Boolean(current?.asAdult || row.asAdult),
    });
  });
  return [...bySlot.values()];
};

const resolveHotelChildUnitFallback = (service = {}, adultUnitFallback = 0) => {
  const adultEntries = parseBeneficiaryArray(
    service?.beneficiariosAdultos ?? service?.beneficiarios_adultos ?? [],
  );
  const childEntries = parseBeneficiaryArray(
    service?.beneficiariosNinos ?? service?.beneficiarios_ninos ?? [],
  );
  const beneficiaryCount = adultEntries.length + childEntries.length;
  const divided = Boolean(
    service?.precioAdultoDividido ??
      service?.precio_adulto_dividido ??
      service?.tariff?.precio_adulto_dividido,
  );
  const roomTotal = toNumber(
    service?.precioTotal ??
      service?.precio_total ??
      service?.precioServicio ??
      service?.precio_servicio ??
      service?.tariff?.precio_original ??
      service?.tariff?.precio,
  );

  if (divided && roomTotal > 0 && beneficiaryCount > 0) {
    return round2(roomTotal / beneficiaryCount);
  }

  return round2(adultUnitFallback);
};

/**
 * Returns the children who actually benefit from one service and the amount
 * charged to each of them. Zero-priced beneficiaries are intentionally kept
 * so the UI can state "Gratis" instead of silently hiding them.
 */
export const buildServiceChildPricingRows = ({
  service = {},
  peopleDetails = {},
  adultUnitFallback = 0,
} = {}) => {
  if (!service || typeof service !== "object") return [];

  const normalizedService = normalizeServiceForChildPricing(service);
  const pricing = getServicePricingSnapshot(normalizedService);
  const beneficiaries = getServiceBeneficiarySnapshot(normalizedService);
  const hotelUsesPersistedBeneficiaries =
    isHotelServiceForPricing(service) && hasOwnBeneficiaryField(service);
  const authoritativeHotelChildren = hotelUsesPersistedBeneficiaries
    ? getAuthoritativeHotelChildEntries(service)
    : [];
  const convertedSlots = new Set(
    (hotelUsesPersistedBeneficiaries
      ? authoritativeHotelChildren.filter((entry) => entry.asAdult)
      : beneficiaries?.convertedEntries || []
    ).map((entry) => getPassengerSlotKey(entry?.childId)),
  );
  const childIds = hotelUsesPersistedBeneficiaries
    ? authoritativeHotelChildren.map((entry) => entry.childId)
    : uniqueStrings([
        ...Object.keys(pricing?.children || {}),
        ...(beneficiaries?.allChildIds || []),
        ...(beneficiaries?.convertedEntries || []).map((entry) => entry?.childId),
      ]);
  const hotelChildUnitFallback = resolveHotelChildUnitFallback(
    service,
    adultUnitFallback,
  );

  const rowsBySlot = new Map();
  childIds.forEach((childId, sourceIndex) => {
    const slot = getPassengerSlotKey(childId);
    if (!slot) return;

    const childData = pricing?.children?.[childId];
    const childPriceMap = beneficiaries?.childPriceMap || {};
    const mappedPriceEntry = Object.entries(childPriceMap).find(
      ([mappedId]) => getPassengerSlotKey(mappedId) === slot,
    );
    const authoritativeHotelEntry = authoritativeHotelChildren.find(
      (entry) => getPassengerSlotKey(entry.childId) === slot,
    );
    const isConverted = Boolean(
      authoritativeHotelEntry?.asAdult ||
        childData?.asAdult ||
        convertedSlots.has(slot),
    );
    const rawAmount =
      authoritativeHotelEntry?.amount ?? childData?.amount ?? mappedPriceEntry?.[1] ?? 0;
    const convertedFallback = hotelUsesPersistedBeneficiaries
      ? hotelChildUnitFallback
      : toNumber(adultUnitFallback);
    const amount = round2(
      isConverted && toNumber(rawAmount) <= 0
        ? convertedFallback
        : toNumber(rawAmount),
    );
    const presentation = getChildPresentationById(
      childId,
      peopleDetails,
      sourceIndex,
    );
    const row = {
      key: `${slot}-${sourceIndex}`,
      childId,
      slot,
      index: presentation.index,
      label: presentation.label,
      passenger: presentation.passenger,
      amount,
      isFree: amount <= 0,
      asAdult: isConverted,
      pricingLabel: isConverted ? "Tarifa adulto" : "Tarifa niño",
    };

    const existing = rowsBySlot.get(slot);
    if (!existing || String(childId).split(":").length >= String(existing.childId).split(":").length) {
      rowsBySlot.set(slot, row);
    }
  });

  return [...rowsBySlot.values()].sort((left, right) => {
    if (left.index !== right.index) return left.index - right.index;
    return left.label.localeCompare(right.label, "es");
  });
};

const getPassengerFallbackIndex = (
  passengerId,
  prefix,
  fallbackIndex = 0,
  hyphenZeroBased = false,
) => {
  const raw = String(passengerId || "").trim();
  const colonMatch = raw.match(
    new RegExp(`^${prefix}:(\\d+)(?::.+)?$`, "i"),
  );
  if (colonMatch) {
    const parsed = Number.parseInt(colonMatch[1], 10);
    return raw.split(":").length > 2
      ? Math.max(0, parsed)
      : Math.max(0, parsed - 1);
  }

  const hyphenMatch = raw.match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
  if (hyphenMatch) {
    const parsed = Number.parseInt(hyphenMatch[1], 10);
    return hyphenZeroBased ? Math.max(0, parsed) : Math.max(0, parsed - 1);
  }

  return Math.max(0, Number(fallbackIndex) || 0);
};

/**
 * Builds the adult beneficiaries of one service using the same adult unit
 * price resolved by EdicionCotizacion. Converted children remain in the child
 * rows and are therefore not duplicated as adults in the presentation.
 */
export const buildServiceAdultPricingRows = ({
  service = {},
  peopleDetails = {},
  adultUnitFallback,
} = {}) => {
  if (!service || typeof service !== "object") return [];

  const normalizedService = normalizeServiceForChildPricing(service);
  const beneficiaries = getServiceBeneficiarySnapshot(normalizedService);
  const adults = Array.isArray(peopleDetails?.adults)
    ? peopleDetails.adults
    : [];
  const presentations = adults.map((adult, index) =>
    getPassengerPresentation(adult, "adult", index),
  );
  const adultUnitAmount = round2(
    adultUnitFallback == null
      ? resolveServiceAdultUnitPriceForPresentation(normalizedService)
      : toNumber(adultUnitFallback),
  );
  const rowsByPassenger = new Map();
  const adultIds = beneficiaries?.adultIds || [];
  const hyphenZeroBased = adultIds.some((adultId) =>
    /^adult-0$/i.test(String(adultId || "").trim()),
  );

  adultIds.forEach((adultId, sourceIndex) => {
    const matched = presentations.find((entry) =>
      passengerIdMatchesSet(adultId, entry.aliases),
    );
    const fallbackIndex = getPassengerFallbackIndex(
      adultId,
      "adult",
      sourceIndex,
      hyphenZeroBased,
    );
    const presentation =
      matched ||
      getPassengerPresentation(
        adults[fallbackIndex] || {},
        "adult",
        fallbackIndex,
      );
    const passengerKey = `adult:${presentation.index + 1}`;

    rowsByPassenger.set(passengerKey, {
      key: passengerKey,
      adultId,
      slot: passengerKey,
      index: presentation.index,
      label: presentation.label,
      passenger: presentation.passenger,
      amount: adultUnitAmount,
      isFree: adultUnitAmount <= 0,
      pricingLabel: "Tarifa adulto",
    });
  });

  return [...rowsByPassenger.values()].sort((left, right) => {
    if (left.index !== right.index) return left.index - right.index;
    return left.label.localeCompare(right.label, "es");
  });
};

export const aggregateServiceAdultPricingRows = ({
  services = [],
  peopleDetails = {},
  getAdultUnitPrice,
} = {}) => {
  const totalsByPassenger = new Map();

  (Array.isArray(services) ? services : []).forEach((service) => {
    const adultUnitFallback =
      typeof getAdultUnitPrice === "function"
        ? toNumber(getAdultUnitPrice(service))
        : undefined;
    buildServiceAdultPricingRows({
      service,
      peopleDetails,
      adultUnitFallback,
    }).forEach((row) => {
      const current = totalsByPassenger.get(row.slot) || {
        ...row,
        amount: 0,
        serviceCount: 0,
      };
      current.amount = round2(current.amount + row.amount);
      current.serviceCount += 1;
      current.isFree = current.amount <= 0;
      totalsByPassenger.set(row.slot, current);
    });
  });

  return [...totalsByPassenger.values()].sort((left, right) => {
    if (left.index !== right.index) return left.index - right.index;
    return left.label.localeCompare(right.label, "es");
  });
};

/** Aggregates each child's service costs for one itinerary day. */
export const aggregateDayChildPricingRows = ({
  services = [],
  peopleDetails = {},
  getAdultUnitPrice,
} = {}) => {
  const totalsBySlot = new Map();

  (Array.isArray(services) ? services : []).forEach((service) => {
    const adultUnitFallback =
      typeof getAdultUnitPrice === "function"
        ? toNumber(getAdultUnitPrice(service))
        : 0;
    buildServiceChildPricingRows({
      service,
      peopleDetails,
      adultUnitFallback,
    }).forEach((row) => {
      const current = totalsBySlot.get(row.slot) || {
        ...row,
        amount: 0,
        serviceCount: 0,
        convertedServiceCount: 0,
      };
      current.amount = round2(current.amount + row.amount);
      current.serviceCount += 1;
      current.convertedServiceCount += row.asAdult ? 1 : 0;
      current.isFree = current.amount <= 0;
      current.asAdult = current.asAdult || row.asAdult;
      totalsBySlot.set(row.slot, current);
    });
  });

  return [...totalsBySlot.values()].sort((left, right) => {
    if (left.index !== right.index) return left.index - right.index;
    return left.label.localeCompare(right.label, "es");
  });
};
