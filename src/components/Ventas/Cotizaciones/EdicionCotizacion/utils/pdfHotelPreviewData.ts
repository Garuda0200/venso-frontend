import { deriveSelectedHotelFromDays } from "./hotelServiceHelpers";
import {
  getHotelDetalleLanguagePayload,
  normalizeHotelDetallePayload,
} from "./hotelDetallePayload";
import { calculateExternalItineraryBreakdown } from "./cotizacionFinancialSummary";
import { getServicePricingSnapshot } from "./servicePricingRuntime";
import { calculateGeneralTotalsDetailed } from "../components/DaysEditor/utils/priceCalculations";
import { buildPeruvianPassengerIdSet } from "./igvUtils";
import {
  autoMixForPax as preferredAutoMixForPax,
  transferRoomMixToOptions,
} from "./hotelRoomMix";
import { resolveHotelRoomAssignments } from "./hotelRoomAssignments";
import {
  buildNoHotelPreviewCategoryRows,
  filterLuxuryHotelCategoryRows,
  isLuxuryHotelPreviewSource,
  LUXURY_HOTEL_CATEGORY,
  NO_HOTEL_CATEGORY,
} from "./cotizacionPreviewHtml";
import { calculateAdditionalAmount } from "./quotePricingEngine";

const ORDERED_CATS = ["2", "3", "3s", "4", "5"];
const HOTEL_IGV_RATE = 0.18;
const CAT_LABELS = {
  2: "2★★ Estándar",
  3: "3★★★ Estándar",
  "3s": "3★★★ Superior",
  4: "4★★★★ Estrellas",
  5: "5★★★★★ Estrellas",
};

const n = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const ceilGeneric = (value) => Math.ceil(n(value));

const countRoomConvertedChildren = (perRoomPricing = []) =>
  (Array.isArray(perRoomPricing) ? perRoomPricing : []).reduce(
    (sum, room) => sum + Math.max(0, n(room?.convertedChildBeneficiaries)),
    0,
  );

const resolveHotelConvertedChildCount = (row = {}) =>
  Math.max(
    0,
    n(row?.hotelConvertedChildCount),
    countRoomConvertedChildren(row?.perRoomPricing),
  );

const parseMaybeJson = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const asArray = (value) => {
  const parsed = parseMaybeJson(value, []);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") return Object.values(parsed);
  return [];
};

const stripText = (value) =>
  String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const firstText = (...values) =>
  values.map(stripText).find((value) => value.length > 0) || "";

const getExternalServiceIdentity = (service = {}, pricing = {}) => {
  const child =
    service.childService || service.child_service || service.child || {};
  const parent =
    service.parentService || service.parent_service || service.parent || {};
  const tariff = service.tariff || service.assignedTariff || {};
  const serviceType = firstText(
    pricing.serviceType,
    service.tipo_servicio,
    service.tipoServicio,
    parent.typeService,
    service.typeService,
  ).toLowerCase();
  const parentId = firstText(
    service.assignedParentId,
    service.assigned_parent_id,
    service.parentId,
    service.parent_id,
    parent.id,
    parent.id_tipotour,
    parent.id_servicio,
  );
  const childId = firstText(
    service.assignedChildId,
    service.assigned_child_id,
    service.childId,
    service.child_id,
    child.id,
    child.id_ticket,
    child.id_movilidad,
    child.id_habitacion,
    child.id_servicio,
  );
  const title = firstText(
    service.displayName,
    service.nombre,
    service.name,
    service.titulo,
    service.title,
    child.nombre,
    child.name,
    child.titulo,
    child.title,
    child.tour_nombre,
    child.descripcion,
    child.servicio_extra?.nombre,
    child.ticket?.entrada,
    child.ticket?.nombre,
    child.restaurante?.nombre,
    child.tipo_tren,
    parent.nombre,
    parent.name,
    parent.titulo,
    parent.title,
    tariff.nombre,
    tariff.name,
    tariff.descripcion,
  );

  return [serviceType, parentId, childId, title.toLowerCase()].join("|");
};

const getExternalServiceAdultUnitPrice = (service = {}) => {
  const pricing = getServicePricingSnapshot(service);
  const candidates = [
    pricing.precioAdult,
    pricing.amountPerAdult,
    service.pricePerPerson,
    service.precioAdult,
    service.precio_adult,
    service.assigned_precio_adulto_dividido,
    service.assignedPrecioAdultoDividido,
    service.assignedPrecioServicio,
    service.assigned_precio_servicio,
    service.tariff?.precio,
    service.tariff?.precio_original,
    service.assignedTariff?.precio,
    service.assignedTariff?.precio_original,
  ];

  return {
    pricing,
    price: candidates.map(n).find((value) => value > 0) || 0,
  };
};

const calculateUniqueExternalAdultTotal = (days = []) => {
  const seen = new Set();
  return round2(
    asArray(days).reduce((total, day) => {
      const services = asArray(day?.servicios);
      return (
        total +
        services.reduce((serviceTotal, service) => {
          const { pricing, price } = getExternalServiceAdultUnitPrice(service);
          if (price <= 0) return serviceTotal;

          const key = `${getExternalServiceIdentity(service, pricing)}|${Math.ceil(
            price,
          )}`;
          if (seen.has(key)) return serviceTotal;
          seen.add(key);

          return serviceTotal + price;
        }, 0)
      );
    }, 0),
  );
};

const normalizeCategory = (value) => String(value ?? "").trim();
const normalizeCat = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
const getHotelGroupCategoryKeys = (hotel = {}) => {
  const groups = Array.isArray(hotel?.dayGroups) ? hotel.dayGroups : [];
  const keys = groups
    .map((group) => normalizeCategory(group?.category || group?.groupCategory))
    .filter(Boolean);
  return Array.from(new Set(keys));
};

const getHotelGroupCount = (hotel = {}) =>
  Array.isArray(hotel?.dayGroups)
    ? hotel.dayGroups.filter((group) => {
        const indices = Array.isArray(group?.selectedNightIndices)
          ? group.selectedNightIndices
          : Array.isArray(group?.groupDayIndices)
            ? group.groupDayIndices
            : [];
        return indices.length > 0 || group?.category || group?.groupCategory;
      }).length
    : 0;
const normalizeRoomText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const roomRank = (room = {}) => {
  const text = normalizeRoomText(`${room.key || ""} ${room.label || ""}`);
  const capacity = Math.max(1, n(room.capacity) || 1);
  if (
    text.includes("familiar") ||
    text.includes("cuad") ||
    text.includes("quad") ||
    capacity === 4
  ) {
    return 1;
  }
  if (text.includes("triple") || capacity === 3) return 2;
  if (
    text.includes("doble") ||
    text.includes("double") ||
    text.includes("matrimonial") ||
    text.includes("twin") ||
    capacity === 2
  ) {
    return 3;
  }
  if (text.includes("simple") || text.includes("single") || capacity === 1) {
    return 4;
  }
  return 10 + capacity;
};

const hasPdfHotelSelection = (hotel = {}) =>
  Boolean(
    normalizeCategory(hotel?.category) ||
      normalizeCategory(hotel?.hotelName) ||
      normalizeCategory(hotel?.id_hotel || hotel?.hotelId) ||
      n(hotel?.hotelTotal || hotel?.hotelAdultTotal || hotel?.total) > 0,
  );

export const formatPdfHotelCategoryChip = (categoryOption = {}) => {
  const category = normalizeCategory(categoryOption?.category);
  const normalized = normalizeCat(category);
  const fullLabel =
    categoryOption?.label ||
    categoryOption?.hotelName ||
    (category ? `${category} Estrellas` : "Hotel");

  const shortLabel =
    normalized === "sin-hotel" || normalized === "sinhotel"
      ? "SIN HOTEL"
      : normalized === "3s"
      ? "3S"
      : /^[0-9]+$/.test(category)
        ? category
        : category
          ? category.toUpperCase()
          : "H";

  return {
    category,
    label: shortLabel,
    title: fullLabel,
  };
};

const normalizePriceOverrideMap = (overrides) => {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return {};
  }

  return Object.entries(overrides).reduce((accumulator, [roomKey, value]) => {
    const parsed = n(value);
    if (!roomKey || !Number.isFinite(parsed) || parsed < 0) {
      return accumulator;
    }

    return {
      ...accumulator,
      [roomKey]: parsed,
    };
  }, {});
};

const normalizeStoredPriceOverrides = (overrides, defaultCategory = null) => {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return {};
  }

  const entries = Object.entries(overrides);
  if (entries.length === 0) return {};

  const looksNested = entries.every(
    ([, value]) => value && typeof value === "object" && !Array.isArray(value),
  );

  if (looksNested) {
    return entries.reduce((accumulator, [category, value]) => {
      const normalizedCategory = normalizeCat(category);
      const normalizedOverrides = normalizePriceOverrideMap(value);

      if (
        !normalizedCategory ||
        Object.keys(normalizedOverrides).length === 0
      ) {
        return accumulator;
      }

      return {
        ...accumulator,
        [normalizedCategory]: normalizedOverrides,
      };
    }, {});
  }

  const normalizedCategory = normalizeCat(defaultCategory);
  const normalizedOverrides = normalizePriceOverrideMap(overrides);

  if (!normalizedCategory || Object.keys(normalizedOverrides).length === 0) {
    return {};
  }

  return {
    [normalizedCategory]: normalizedOverrides,
  };
};

const deriveRoomMixFromPerRoomPricing = (perRoomPricing = []) => {
  if (!Array.isArray(perRoomPricing) || perRoomPricing.length === 0) return null;

  const mix = perRoomPricing.reduce((accumulator, room) => {
    const key = String(
      room?.sourceRoomKey ||
        room?.roomKey ||
        String(room?.key || "").split(":")[0] ||
        "",
    ).trim();
    if (!key) return accumulator;
    const count = Math.max(
      1,
      n(room?.roomCount) ||
        (Array.isArray(room?.roomDetails) ? room.roomDetails.length : 0) ||
        1,
    );
    accumulator[key] = (accumulator[key] || 0) + count;
    return accumulator;
  }, {});

  return Object.keys(mix).length > 0 ? mix : null;
};

const getHotelPreviewMix = (hotel = {}) => {
  const fromRooms = deriveRoomMixFromPerRoomPricing(hotel?.perRoomPricing);
  if (fromRooms) return fromRooms;
  return hotel?.mix && typeof hotel.mix === "object" ? hotel.mix : null;
};

const mergeRoomOptionsByCategory = (baseOptions = {}, ...savedRowGroups) => {
  const merged = {};

  Object.entries(baseOptions || {}).forEach(([category, value]) => {
    const key = normalizeCat(category);
    if (!key || !Array.isArray(value?.roomOptions) || !value.roomOptions.length) {
      return;
    }
    merged[key] = value;
  });

  savedRowGroups.flat().forEach((row) => {
    const key = normalizeCat(row?.category);
    if (!key || merged[key]?.roomOptions?.length) return;
    if (!Array.isArray(row?.roomOptions) || !row.roomOptions.length) return;
    merged[key] = {
      hotelName: row.hotelName || "Hotel",
      id_hotel: row.id_hotel || null,
      roomOptions: row.roomOptions,
    };
  });

  return merged;
};

const normalizeAdditionalCostsForPreview = (value) => {
  let source = value;

  if (typeof source === "string" && source.trim()) {
    try {
      source = JSON.parse(source);
    } catch {
      source = {};
    }
  }

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }

  const cleanSource = Object.entries(source).reduce((accumulator, [key, item]) => {
    if (!/^\d+$/.test(String(key))) {
      accumulator[key] = item;
    }
    return accumulator;
  }, {});

  // `additionalCosts` is configuration only. Hotel snapshots, itinerary
  // totals and external quotation data live in their own root payloads.
  return {
    operationalCosts:
      cleanSource.operationalCosts ?? cleanSource.operational_costs ?? 0,
    operationalMode:
      cleanSource.operationalMode ?? cleanSource.operational_mode ?? "fixed",
    fee: cleanSource.fee ?? cleanSource.feeVal ?? cleanSource.fee_val ?? 0,
    feeVal: cleanSource.feeVal ?? cleanSource.fee ?? cleanSource.fee_val ?? 0,
    feeMode: cleanSource.feeMode ?? cleanSource.fee_mode ?? "fixed",
    extraFee: cleanSource.extraFee ?? cleanSource.extra_fee ?? 0,
    applyAdditionalCostsToChildren:
      cleanSource.applyAdditionalCostsToChildren ??
      cleanSource.apply_additional_costs_to_children ??
      true,
    applyOperationalCostsToChildren:
      cleanSource.applyOperationalCostsToChildren ??
      cleanSource.apply_operational_costs_to_children ??
      cleanSource.applyAdditionalCostsToChildren ??
      cleanSource.apply_additional_costs_to_children ??
      true,
    applyFeeToChildren:
      cleanSource.applyFeeToChildren ??
      cleanSource.apply_fee_to_children ??
      cleanSource.applyAdditionalCostsToChildren ??
      cleanSource.apply_additional_costs_to_children ??
      true,
    applyExtraFeeToChildren:
      cleanSource.applyExtraFeeToChildren ??
      cleanSource.apply_extra_fee_to_children ??
      cleanSource.applyAdditionalCostsToChildren ??
      cleanSource.apply_additional_costs_to_children ??
      true,
    childOperationalMode:
      cleanSource.childOperationalMode ??
      cleanSource.child_operational_mode ??
      cleanSource.operationalMode ??
      cleanSource.operational_mode ??
      "fixed",
    childOperationalCosts:
      cleanSource.childOperationalCosts ??
      cleanSource.child_operational_costs ??
      cleanSource.operationalCosts ??
      cleanSource.operational_costs ??
      0,
    childFeeMode:
      cleanSource.childFeeMode ??
      cleanSource.child_fee_mode ??
      cleanSource.feeMode ??
      cleanSource.fee_mode ??
      "fixed",
    childFee:
      cleanSource.childFee ??
      cleanSource.child_fee ??
      cleanSource.fee ??
      cleanSource.feeVal ??
      cleanSource.fee_val ??
      0,
    childExtraFee:
      cleanSource.childExtraFee ??
      cleanSource.child_extra_fee ??
      cleanSource.extraFee ??
      cleanSource.extra_fee ??
      0,
  };
};

const hasAdditionalCostsPayload = (value) => {
  if (typeof value === "string") return value.trim().length > 0;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).length > 0;
};

const pickAdditionalCostsPayload = (cotizacion = {}) =>
  [
    cotizacion?.additionalCosts,
    cotizacion?.additional_costs,
    cotizacion?.additionalcosts,
  ].find(hasAdditionalCostsPayload) || null;

const computeAdicionales = (additionalCfg, basePerAdult) => {
  const opMode = String(
    additionalCfg?.operationalMode ||
      additionalCfg?.operational_mode ||
      "fixed",
  ).toLowerCase();
  const feeMode = String(
    additionalCfg?.feeMode || additionalCfg?.fee_mode || "fixed",
  ).toLowerCase();
  const operationalValue =
    additionalCfg?.operationalCosts ?? additionalCfg?.operational_costs;
  const feeValue =
    additionalCfg?.feeVal ??
    additionalCfg?.fee ??
    additionalCfg?.fee_val;
  const op =
    opMode === "percentage"
      ? (n(operationalValue) * basePerAdult) / 100
      : n(operationalValue);
  const fee =
    feeMode === "percentage"
      ? (n(feeValue) * basePerAdult) / 100
      : n(feeValue);
  const extra = n(additionalCfg?.extraFee ?? additionalCfg?.extra_fee);
  return {
    op: round2(op),
    fee: round2(fee),
    extra: round2(extra),
    adicionales: round2(op + fee + extra),
  };
};

const costFromMix = (mix, roomOptions, nightCount) => {
  const map = new Map((roomOptions || []).map((option) => [option.key, option]));
  let perNightSum = 0;
  let roomsCount = 0;
  const breakdown = [];

  Object.entries(mix || {}).forEach(([key, count]) => {
    const opt = map.get(key);
    if (!opt) return;
    const sub = n(opt.pricePerRoomNight) * n(count);
    perNightSum += sub;
    roomsCount += n(count);
    breakdown.push({
      key,
      label: opt.label || key,
      cnt: n(count),
      unit: n(opt.pricePerRoomNight),
      sub,
      capacity: n(opt.capacity) || 0,
    });
  });

  return {
    perNightSum,
    roomsCount,
    breakdown,
    hotelTotal: perNightSum * Math.max(1, n(nightCount)),
  };
};

const withExternalAdultInRoomPricing = (
  perRoomPricing = [],
  externalAdultTotal = 0,
) => {
  if (!Array.isArray(perRoomPricing) || perRoomPricing.length === 0) {
    return [];
  }

  return perRoomPricing.map((room) => {
    const adultBeneficiaries = Math.max(
      0,
      n(room?.adultBeneficiaries ?? room?.beneficiaries),
    );
    if (adultBeneficiaries <= 0 || externalAdultTotal <= 0) return room;

    const currentTotal = n(room?.totalPerPerson);
    const baseWithoutExternal =
      n(room?.base) + n(room?.adicionales) > 0
        ? round2(n(room?.base) + n(room?.adicionales))
        : currentTotal;
    const expectedWithExternal = round2(
      baseWithoutExternal + externalAdultTotal,
    );
    const alreadyHasExternal = currentTotal >= expectedWithExternal - 0.01;

    return {
      ...room,
      totalPerPerson: alreadyHasExternal ? currentTotal : expectedWithExternal,
    };
  });
};

export const buildPreviewPerRoomPricing = ({
  hotel,
  row,
  roomOptions = [],
  adultsCount = 1,
  childrenCount = 0,
  nonHotelsTotal = 0,
  nonHotelExplicitChildTotal = 0,
  nonHotelConvertedChildTotal = 0,
  additionalCfg = {},
  nights = 1,
  externalAdultTotal = 0,
  peopleDetails = {},
}) => {
  if (!row?.mix || !Array.isArray(roomOptions) || roomOptions.length === 0) {
    return [];
  }

  const optionMap = new Map(roomOptions.map((option) => [option.key, option]));
  const slots = Object.entries(row.mix).flatMap(([roomKey, rawCount]) => {
    const option = optionMap.get(roomKey);
    const count = Math.max(0, parseInt(rawCount, 10) || 0);
    if (!option || count <= 0) return [];
    return Array.from({ length: count }, (_, index) => ({
      id: `${roomKey}:${index + 1}`,
      key: roomKey,
      label: option.label || roomKey,
      capacity: Math.max(1, n(option.capacity) || 1),
      unit: n(option.pricePerRoomNight),
      id_habitacion: option.id_habitacion || null,
    }));
  });

  if (slots.length === 0) return [];

  const childPricing = hotel?.childPricing || {};
  const convertedMap = childPricing.convertedChildToAdultMap || {};
  const adultIds = Array.from(
    { length: Math.max(0, n(adultsCount)) },
    (_, index) => `adult:${index + 1}`,
  );
  const rawChildIds = Array.from(
    { length: Math.max(0, n(childrenCount)) },
    (_, index) => `child:${index + 1}`,
  );
  const currentChildIdSet = new Set(rawChildIds);
  const assignedChildIds = new Set(
    Object.values(hotel?.roomAssignments || {})
      .flat()
      .filter(
        (id) =>
          String(id).startsWith("child:") && currentChildIdSet.has(String(id)),
      ),
  );
  // The current roster owns the child slots. Saved room assignments and child
  // pricing only describe how those CURRENT slots are treated; they cannot add
  // passengers that no longer exist in the quotation.
  const convertedChildIds = rawChildIds.filter(
    (id) => convertedMap[id] || assignedChildIds.has(id),
  );
  const assignments = Object.fromEntries(slots.map((slot) => [slot.id, []]));
  const resolvedRoomAssignments = resolveHotelRoomAssignments(
    hotel?.roomAssignments,
    slots,
  );
  const assignableIds = new Set([...adultIds, ...convertedChildIds]);
  const assignedIds = new Set();

  if (resolvedRoomAssignments && typeof resolvedRoomAssignments === "object") {
    slots.forEach((slot) => {
      const savedIds = Array.isArray(resolvedRoomAssignments[slot.id])
        ? resolvedRoomAssignments[slot.id]
        : [];
      savedIds.forEach((id) => {
        if (
          assignableIds.has(id) &&
          !assignedIds.has(id) &&
          assignments[slot.id].length < slot.capacity
        ) {
          assignments[slot.id].push(id);
          assignedIds.add(id);
        }
      });
    });
  }

  const assign = (ids, orderedSlots) => {
    ids.forEach((id) => {
      if (assignedIds.has(id)) return;
      const target = orderedSlots.find(
        (slot) => assignments[slot.id].length < slot.capacity,
      );
      if (!target) return;
      assignments[target.id].push(id);
      assignedIds.add(id);
    });
  };

  assign(
    adultIds,
    [...slots].sort((left, right) => {
      const capacityDiff = right.capacity - left.capacity;
      if (capacityDiff !== 0) return capacityDiff;
      return roomRank(right) - roomRank(left);
    }),
  );
  assign(
    convertedChildIds,
    [...slots].sort((left, right) => {
      const capacityDiff = left.capacity - right.capacity;
      if (capacityDiff !== 0) return capacityDiff;
      return roomRank(left) - roomRank(right);
    }),
  );

  const selectedNights = Math.max(1, n(nights) || 1);
  const childServicesPerPerson =
    n(childrenCount) > 0
      ? round2(
          (n(nonHotelExplicitChildTotal) + n(nonHotelConvertedChildTotal)) /
            Math.max(1, n(childrenCount)),
        )
      : 0;
  const explicitChildServicesPerPerson = childServicesPerPerson;
  const convertedChildServicesPerPerson = childServicesPerPerson;
  const peruvianPassengerIds = buildPeruvianPassengerIdSet(peopleDetails, {
    includeChildren: true,
  });
  const counters = {};

  return slots
    .flatMap((slot) => {
      const passengerIds = assignments[slot.id] || [];
      if (!passengerIds.length) return [];

      const adultPassengerIds = passengerIds.filter((id) =>
        String(id).startsWith("adult:"),
      );
      const convertedChildPassengerIds = passengerIds.filter((id) =>
        String(id).startsWith("child:"),
      );
      counters[slot.key] = (counters[slot.key] || 0) + 1;
      const roomIndex = counters[slot.key];
      const sameTypeCount = slots.filter((item) => item.key === slot.key).length;
      const label =
        sameTypeCount > 1 ? `${slot.label} ${roomIndex}` : slot.label;
      const hasRoomIgv = passengerIds.some((id) =>
        peruvianPassengerIds.has(String(id)),
      );
      const roomBaseUnit = round2(slot.unit);
      const roomIgvAmount = hasRoomIgv ? round2(roomBaseUnit * HOTEL_IGV_RATE) : 0;
      const roomUnitWithIgv = round2(roomBaseUnit + roomIgvAmount);
      const hotelTotalRoom = round2(roomUnitWithIgv * selectedNights);
      const beneficiaries = Math.max(1, passengerIds.length);
      const adultBeneficiaries = adultPassengerIds.length;
      const convertedChildBeneficiaries = convertedChildPassengerIds.length;
      const hotelPerPerson = round2(hotelTotalRoom / beneficiaries);
      const base = round2(n(nonHotelsTotal) + hotelPerPerson);
      const { adicionales } = computeAdicionales(additionalCfg, base);
      const totalPerPerson = round2(base + adicionales);
      const convertedChildBase = round2(
        convertedChildServicesPerPerson + hotelPerPerson,
      );
      const convertedChildAdicionales =
        convertedChildBeneficiaries > 0
          ? calculateAdditionalAmount(
              additionalCfg,
              convertedChildBase,
              "child",
            ).total
          : 0;

      return {
        key: `${slot.key}:${roomIndex}`,
        roomKey: slot.key,
        sourceRoomKey: slot.key,
        label,
        baseLabel: slot.label,
        capacity: slot.capacity,
        roomCount: 1,
        beneficiaries,
        adultBeneficiaries,
        convertedChildBeneficiaries,
        passengerIds,
        adultPassengerIds,
        convertedChildPassengerIds,
        roomDetails: [
          {
            roomId: slot.id,
            label,
            capacity: slot.capacity,
            passengerIds,
            adultPassengerIds,
            convertedChildPassengerIds,
            hasIgv: hasRoomIgv,
            tieneIgv: hasRoomIgv,
            igvRate: hasRoomIgv ? 18 : 0,
            igvAmount: roomIgvAmount,
            baseUnit: roomBaseUnit,
            unit: roomUnitWithIgv,
            unitWithIgv: roomUnitWithIgv,
            hotelTotalRoom,
          },
        ],
        hotelPerNight: roomUnitWithIgv,
        hotelTotalRoom,
        hotelPerPerson,
        hasIgv: hasRoomIgv,
        tieneIgv: hasRoomIgv,
        igvRate: hasRoomIgv ? 18 : 0,
        igvPerPerson: round2(
          (roomIgvAmount * selectedNights) / Math.max(1, beneficiaries),
        ),
        convertedChildHotelPerPerson: hotelPerPerson,
        convertedChildTotalPerPerson:
          convertedChildBeneficiaries > 0 ? convertedChildBase : 0,
        convertedChildDisplayTotalPerPerson:
          convertedChildBeneficiaries > 0 ? convertedChildBase : 0,
        convertedChildBasePerPerson: convertedChildBase,
        convertedChildServicePerPerson: convertedChildServicesPerPerson,
        explicitChildServicePerPerson: explicitChildServicesPerPerson,
        convertedChildAdicionales: round2(convertedChildAdicionales),
        convertedChildAdditionalApplied:
          convertedChildBeneficiaries > 0 && convertedChildAdicionales > 0,
        base,
        adicionales,
        totalPerPerson,
        displayTotalPerPerson: round2(totalPerPerson + externalAdultTotal),
      };
    })
    .sort((left, right) => roomRank(left) - roomRank(right));
};

export const getPdfItineraryDays = (cotizacion = {}) =>
  asArray(cotizacion?.dias ?? cotizacion?.itinerario ?? []);

export const getPdfExternalItineraryDays = (cotizacion = {}) =>
  (() => {
    const candidates = [
      asArray(cotizacion?.externalItineraryItems),
      asArray(cotizacion?.itinerario_externo),
      asArray(cotizacion?.itinerarioExterno),
      asArray(cotizacion?.externalDays),
    ];
    return candidates.find((days) => days.length > 0) || [];
  })();

export const getPdfHotelDetalle = (cotizacion = {}, override = null) =>
  normalizeHotelDetallePayload(
    getHotelDetalleLanguagePayload(
      override ??
        cotizacion?.hotel_detalle ??
        cotizacion?.hotelDetalle ??
        cotizacion?.hotel?.hotelDetalle ??
        cotizacion?.selectedHotel?.hotelDetalle ??
        null,
      cotizacion?.idioma || "es",
    ),
  );

export const getPdfSelectedHotelInput = (cotizacion = {}) =>
  cotizacion?.selectedHotel ||
  cotizacion?.selected_hotel ||
  cotizacion?.hotel ||
  null;

export const resolvePdfSelectedHotel = (
  cotizacion = {},
  hotelDetalleOverride = null,
) =>
  deriveSelectedHotelFromDays(
    getPdfItineraryDays(cotizacion),
    getPdfHotelDetalle(cotizacion, hotelDetalleOverride),
    getPdfSelectedHotelInput(cotizacion),
  );

export const getPdfHotelCategoryRows = (
  cotizacion = {},
  resolvedHotel = resolvePdfSelectedHotel(cotizacion),
) => {
  const candidates = [
    resolvedHotel?.allCategoryRows,
    resolvedHotel?.categoryRows,
    cotizacion?.selectedHotel?.allCategoryRows,
    cotizacion?.selected_hotel?.allCategoryRows,
    cotizacion?.hotel?.allCategoryRows,
    cotizacion?.allCategoryRows,
    cotizacion?.categoryRows,
  ];

  const rows =
    candidates.find(
      (candidate) => Array.isArray(candidate) && candidate.length > 0,
    ) || candidates.find((candidate) => Array.isArray(candidate));
  return filterLuxuryHotelCategoryRows(rows || [], resolvedHotel);
};

export const buildPdfHotelPreviewRows = ({
  cotizacion = {},
  resolvedHotel = resolvePdfSelectedHotel(cotizacion),
  roomOptionsByCategory = {},
  packageType = null,
} = {}) => {
  const days = getPdfItineraryDays(cotizacion);
  const hotel = resolvedHotel || {};
  const additionalCfgRaw = pickAdditionalCostsPayload(cotizacion);
  const additionalCfg = normalizeAdditionalCostsForPreview(additionalCfgRaw);

  let itineraryTotals = null;
  if (days.length > 0) {
    try {
      itineraryTotals = calculateGeneralTotalsDetailed(
        days,
        cotizacion?.peopleDetails || cotizacion?.people_details || null,
      );
    } catch {
      itineraryTotals = null;
    }
  }

  const pc = cotizacion?.peoplecount || cotizacion?.peopleCount || {};
  const hasExplicitAdultCount =
    pc &&
    typeof pc === "object" &&
    Object.prototype.hasOwnProperty.call(pc, "adults") &&
    Number.isFinite(Number(pc.adults));
  const hasExplicitChildCount =
    pc &&
    typeof pc === "object" &&
    Object.prototype.hasOwnProperty.call(pc, "children") &&
    Number.isFinite(Number(pc.children));
  const hotelAssignedChildCount = (() => {
    const ids = new Set();
    Object.values(hotel?.roomAssignments || {})
      .flat()
      .forEach((id) => {
        if (String(id).startsWith("child:")) ids.add(id);
      });
    Object.entries(hotel?.childPricing?.convertedChildToAdultMap || {}).forEach(
      ([id, isConverted]) => {
        if (isConverted && String(id).startsWith("child:")) ids.add(id);
      },
    );
    return ids.size;
  })();
  const adultsCount = hasExplicitAdultCount
    ? Math.max(1, n(pc.adults))
    : Math.max(
        1,
        (itineraryTotals?.hotelAdultCount > 0
          ? itineraryTotals.hotelAdultCount
          : 0) ||
          n(cotizacion?.cantidadpersonas || cotizacion?.cantidadPersonas) ||
          (itineraryTotals?.baseAdultCount > 0
            ? itineraryTotals.baseAdultCount
            : 0) ||
          1,
      );
  // A persisted peopleCount is authoritative, including an explicit zero.
  // Historical roomAssignments/assigned service snapshots can legitimately
  // keep former child IDs after post-sale changes and must not recreate them
  // in the commercial hotel preview.
  const childrenCount = hasExplicitChildCount
    ? Math.max(0, n(pc.children))
    : Math.max(
        0,
        hotelAssignedChildCount,
        itineraryTotals
          ? Math.max(
              itineraryTotals.baseExplicitChildCount,
              itineraryTotals.baseConvertedChildCount,
              itineraryTotals.hotelExplicitChildCount,
              itineraryTotals.hotelConvertedChildCount,
            )
          : 0,
      );
  const peopleCount = { adults: adultsCount, children: n(childrenCount) };
  const nonHotelExplicitChildTotalsById =
    (itineraryTotals != null ? itineraryTotals.baseExplicitChildTotalsById : null) ||
    cotizacion?.nonHotelExplicitChildTotalsById ||
    cotizacion?.baseExplicitChildTotalsById ||
    {};
  const nonHotelConvertedChildTotalsById =
    (itineraryTotals != null
      ? itineraryTotals.baseConvertedChildTotalsById
      : null) ||
    cotizacion?.nonHotelConvertedChildTotalsById ||
    cotizacion?.baseConvertedChildTotalsById ||
    {};
  const hotelExplicitChildTotalsById =
    (itineraryTotals != null ? itineraryTotals.hotelExplicitChildTotalsById : null) ||
    cotizacion?.hotelExplicitChildTotalsById ||
    {};
  const hotelConvertedChildTotalsById =
    (itineraryTotals != null ? itineraryTotals.hotelConvertedChildTotalsById : null) ||
    cotizacion?.hotelConvertedChildTotalsById ||
    {};

  const externalDays = getPdfExternalItineraryDays(cotizacion);
  const externalBreakdown = calculateExternalItineraryBreakdown(
    externalDays,
    cotizacion?.peopleDetails || cotizacion?.people_details || null,
  );
  const rawExternalAdultTotal = n(externalBreakdown?.adultTotal);
  const uniqueExternalAdultTotal = calculateUniqueExternalAdultTotal(externalDays);
  const externalAdultTotal =
    uniqueExternalAdultTotal ||
    rawExternalAdultTotal;
  const externalChildTotal = n(externalBreakdown?.childTotal);
  const externalConvertedChildTotal = n(
    externalBreakdown?.convertedChildTotal,
  );

  const nonHotelsTotal = (() => {
    const stored = n(
      cotizacion?.nonHotelsTotal ??
        cotizacion?.subtotal_individual ??
        cotizacion?.subtotalIndividual ??
        hotel?.nonHotelsTotal,
    );
    if (stored > 0) return stored;
    if (itineraryTotals && itineraryTotals.totalPerPerson > 0) {
      return round2(itineraryTotals.totalPerPerson);
    }
    return 0;
  })();

  const subtotalNinos = (() => {
    const stored = n(
      cotizacion?.subtotal_ninos ||
        cotizacion?.subtotalNinos,
    );
    if (stored > 0) return stored;
    return days.reduce((total, day) => {
      return (
        total +
        (day?.servicios || []).reduce((serviceTotal, service) => {
          const tariff = service?.tariff || {};
          const childExtras =
            n(tariff.childExtrasTotal || tariff.assignedChildExplicitPriceSum) ||
            (Array.isArray(service?.beneficiariosNinos)
              ? service.beneficiariosNinos.reduce(
                  (sum, child) => sum + n(child.precio),
                  0,
                )
              : 0);
          return serviceTotal + childExtras;
        }, 0)
      );
    }, 0);
  })();

  const nonHotelConvertedChildTotal = itineraryTotals != null
    ? n(itineraryTotals.baseConvertedChildTotal)
    : n(
        cotizacion?.nonHotelConvertedChildTotal ||
          cotizacion?.baseConvertedChildTotal ||
          hotel?.nonHotelConvertedChildTotal ||
          hotel?.baseConvertedChildTotal,
      );
  const nonHotelExplicitChildTotal = Math.max(
    0,
    itineraryTotals != null
      ? n(itineraryTotals.baseExplicitChildTotal)
      : n(
          cotizacion?.nonHotelExplicitChildTotal ||
            hotel?.baseExplicitChildTotal,
        ) ||
          subtotalNinos - nonHotelConvertedChildTotal,
  );
  const calculateChildTotalForCategory = ({
    isSelected = false,
    hotelTotal = 0,
    selectedHotelChildTotal = 0,
  } = {}) => {
    const children = Math.max(0, n(childrenCount));
    if (children <= 0) return 0;

    const serviceTotal =
      n(nonHotelExplicitChildTotal) + n(nonHotelConvertedChildTotal);
    const servicePerChild = round2(serviceTotal / children);
    const selectedHotelPerChild =
      isSelected && n(selectedHotelChildTotal) > 0
        ? round2(n(selectedHotelChildTotal) / children)
        : 0;
    const fallbackHotelPerChild =
      !isSelected && n(hotelTotal) > 0
        ? round2(n(hotelTotal) / Math.max(1, n(adultsCount) + children))
        : 0;
    const basePerChild = round2(
      servicePerChild + (selectedHotelPerChild || fallbackHotelPerChild),
    );

    if (
      basePerChild <= 0 &&
      n(externalChildTotal) <= 0 &&
      n(externalConvertedChildTotal) <= 0
    ) {
      return 0;
    }

    return round2(
      basePerChild +
        calculateAdditionalAmount(additionalCfg, basePerChild, "child").total +
        n(externalChildTotal) +
        n(externalConvertedChildTotal),
    );
  };

  if (!hasPdfHotelSelection(hotel)) {
    const { adicionales } = computeAdicionales(additionalCfg, nonHotelsTotal);
    const explicitChildrenCount = Math.max(0, n(childrenCount));
    const convertedChildCount = Math.max(
      0,
      n(
        cotizacion?.baseConvertedChildCount ||
          cotizacion?.convertedChildCount ||
          hotel?.baseConvertedChildCount ||
          hotel?.convertedChildCount,
      ),
    );
    const chargedChildCount = explicitChildrenCount;
    const totalPerChild = calculateChildTotalForCategory();

    return {
      categoryRows: buildNoHotelPreviewCategoryRows({
        totalPerAdult: round2(
          nonHotelsTotal + adicionales + externalAdultTotal,
        ),
        totalPerChild,
        nonHotelsTotal,
        additionalCfg,
        adultsCount,
        explicitChildrenCount:
          chargedChildCount > 0
            ? chargedChildCount
            : explicitChildrenCount > 0
              ? 1
              : 0,
        baseExplicitChildTotal: nonHotelExplicitChildTotal,
        convertedChildCount,
        baseConvertedChildTotal: nonHotelConvertedChildTotal,
        nonHotelConvertedChildTotal,
        baseExplicitChildTotalsById: nonHotelExplicitChildTotalsById,
        baseConvertedChildTotalsById: nonHotelConvertedChildTotalsById,
        externalAdultTotal,
      }),
      peopleCount,
      externalAdultTotal,
      externalChildTotal,
      externalConvertedChildTotal,
      nonHotelsTotal,
      packageType: packageType || cotizacion?.packagetype || "compartido",
    };
  }

  const nights =
    n(hotel?.nights) || Math.max(1, (Array.isArray(days) ? days.length : 1) - 1);
  const normalizedPriceOverrides = normalizeStoredPriceOverrides(
    hotel?.priceOverrides,
    hotel?.category,
  );
  const saved = getPdfHotelCategoryRows(cotizacion, hotel);
  const isLuxuryHotelPreview = isLuxuryHotelPreviewSource(hotel, saved);
  const effectiveRoomOptionsByCategory = mergeRoomOptionsByCategory(
    roomOptionsByCategory,
    saved,
    hotel?.allCategoryRows || [],
    hotel?.categoryRows || [],
    cotizacion?.selectedHotel?.allCategoryRows || [],
    cotizacion?.selected_hotel?.allCategoryRows || [],
    cotizacion?.allCategoryRows || [],
    cotizacion?.categoryRows || [],
  );

  const roomOptionCategoryCount = Object.keys(
    effectiveRoomOptionsByCategory || {},
  ).length;
  const hasSavedHotelTotals =
    Array.isArray(saved) &&
    saved.length > 0 &&
    saved[0]?.hotelTotal != null &&
    roomOptionCategoryCount === 0;

  if (hasSavedHotelTotals) {
    return {
      categoryRows: saved.map((row) => {
        const hotelPerAdult = n(row.hotelPerAdult);
        const basePerAdult = round2(nonHotelsTotal + hotelPerAdult);
        const { adicionales } = computeAdicionales(additionalCfg, basePerAdult);
        const totalPerAdult = round2(
          basePerAdult + adicionales + externalAdultTotal,
        );
        const category = normalizeCat(row.category);
        const storedHotelChildTotal = n(row.hotelChildTotal);
        const baseSubtotalNinos = Math.max(
          0,
          subtotalNinos - storedHotelChildTotal,
        );
        const rowHotelConvertedChildCount =
          resolveHotelConvertedChildCount(row);
        const explicitChildrenCount = Math.max(
          0,
          n(childrenCount) - rowHotelConvertedChildCount,
        );
        const isSelected =
          normalizeCat(row.category) === normalizeCat(hotel?.category);
        const totalPerChild = calculateChildTotalForCategory({
          isSelected,
          hotelTotal: n(row.hotelTotal),
          selectedHotelChildTotal:
            storedHotelChildTotal +
            n(row.hotelConvertedChildTotal) +
            n(row.hotelConvertedChildTotalStay),
        });
        const oldTotalPerAdult = n(row.totalPerAdult);
        const totalFinalAll =
          oldTotalPerAdult > 0
            ? round2(
                n(row.totalFinalAll) +
                  (totalPerAdult - oldTotalPerAdult) * adultsCount,
              )
            : n(row.totalFinalAll);
        return {
          ...row,
          category: row.category,
          label:
            row.label || CAT_LABELS[row.category] || `${row.category} Estrellas`,
          hotelName: row.hotelName || `Hotel ${row.category}`,
          isSelected,
          totalPerAdult,
          totalPerChild,
          totalPerChildIsPerPerson: true,
          pricingEngineVersion: 1,
          totalFinalAll,
          hotelPerAdult,
          hotelChildTotal: storedHotelChildTotal,
          adultEquivalentCount: row.adultEquivalentCount || adultsCount,
          basePerAdult,
          adicionales,
          nights: row.nights || hotel?.nights || nights,
          roomOptions:
            row.roomOptions ||
            effectiveRoomOptionsByCategory?.[category]?.roomOptions ||
            [],
          priceOverrides: row.priceOverrides || {},
          nonHotelsTotal,
          additionalCfg,
          baseSubtotalNinos,
          baseExplicitChildTotal: nonHotelExplicitChildTotal,
          baseConvertedChildTotal: nonHotelConvertedChildTotal,
          nonHotelConvertedChildTotal,
          baseExplicitChildTotalsById: nonHotelExplicitChildTotalsById,
          baseConvertedChildTotalsById: nonHotelConvertedChildTotalsById,
          hotelExplicitChildTotalsById,
          hotelConvertedChildTotalsById,
          explicitChildrenCount,
          convertedChildCount: rowHotelConvertedChildCount,
          hotelExplicitChildCount: n(row.hotelExplicitChildCount),
          hotelConvertedChildCount: rowHotelConvertedChildCount,
          perRoomPricing: withExternalAdultInRoomPricing(
            row.perRoomPricing,
            externalAdultTotal,
          ),
          breakdown: row.breakdown || [],
        };
      }),
      peopleCount,
      externalAdultTotal,
      externalChildTotal,
      externalConvertedChildTotal,
      nonHotelsTotal,
    };
  }

  const list = [];
  const selectedCategory = normalizeCat(hotel?.category);
  const savedNightCount =
    Array.isArray(hotel?.selectedNightIndices) &&
    hotel.selectedNightIndices.length > 0
      ? hotel.selectedNightIndices.length
      : Math.max(1, n(hotel?.nights) || nights);
  const savedChildPricing = hotel?.childPricing || {};
  const savedAssignedIds = Array.isArray(savedChildPricing?.assignedIds)
    ? savedChildPricing.assignedIds
    : [];
  const savedChildIds = savedAssignedIds.filter((id) =>
    String(id).startsWith("child:"),
  );
  const savedConvertedChildToAdultMap = {
    ...(savedChildPricing?.convertedChildToAdultMap || {}),
  };
  const assignedRoomChildIds = new Set(
    Object.values(hotel?.roomAssignments || {})
      .flat()
      .filter((id) => String(id).startsWith("child:")),
  );
  const savedConvertedChildCount = new Set([
    ...Object.keys(savedConvertedChildToAdultMap).filter(
      (childId) => savedConvertedChildToAdultMap[childId],
    ),
    ...Array.from(assignedRoomChildIds),
  ]).size;
  const savedChildExtrasPerNight = Object.entries(
    savedChildPricing?.assignedChildExplicitPriceMap || {},
  ).reduce((sum, [childId, value]) => {
    if (savedConvertedChildToAdultMap[childId]) return sum;
    return sum + n(value);
  }, 0);
  const storedHotelChildTotal =
    n(cotizacion?.hotel_child_total || cotizacion?.hotelChildTotal || hotel?.hotelChildTotal) ||
    savedChildExtrasPerNight * savedNightCount;
  const baseSubtotalNinos = Math.max(0, subtotalNinos - storedHotelChildTotal);

  const groupCategoryKeys = getHotelGroupCategoryKeys(hotel);
  const shouldUseGroupedHotelCategories =
    getHotelGroupCount(hotel) > 1 && groupCategoryKeys.length > 0;
  const visibleCategories = isLuxuryHotelPreview
    ? [LUXURY_HOTEL_CATEGORY]
    : shouldUseGroupedHotelCategories
      ? groupCategoryKeys
      : ORDERED_CATS;

  visibleCategories.forEach((category) => {
    const pack = effectiveRoomOptionsByCategory?.[category];
    if (!pack?.roomOptions?.length) return;

    const isSelectedCategory = normalizeCat(category) === selectedCategory;
    const categoryPriceOverrides =
      normalizedPriceOverrides[normalizeCat(category)] || {};
    const roomOptions = (pack.roomOptions || []).map((option) => ({
      ...option,
        pricePerRoomNight:
          categoryPriceOverrides[option.key] !== undefined
            ? n(categoryPriceOverrides[option.key])
            : n(option.pricePerRoomNight),
      capacity: n(option.capacity) || 1,
    }));
    const selectedRoomOptions =
      effectiveRoomOptionsByCategory?.[selectedCategory]?.roomOptions ||
      roomOptions;
    const selectedMix = getHotelPreviewMix(hotel);
    const transferredMix =
      selectedMix && !isSelectedCategory
        ? transferRoomMixToOptions(selectedMix, selectedRoomOptions, roomOptions)
        : null;
    const mix =
      isSelectedCategory && selectedMix && Object.keys(selectedMix).length > 0
        ? selectedMix
        : transferredMix && Object.keys(transferredMix).length > 0
          ? transferredMix
          : preferredAutoMixForPax(
              roomOptions,
              Math.max(1, adultsCount + savedConvertedChildCount),
            );
    const effectiveNights = savedNightCount;
    const { perNightSum, roomsCount, hotelTotal, breakdown } = costFromMix(
      mix,
      roomOptions,
      effectiveNights,
    );
    const adultEquivalentCount = Math.max(
      1,
      adultsCount + savedConvertedChildCount,
    );
    const hotelPerAdult = round2(hotelTotal / adultEquivalentCount);
    const convertedChildHotelTotalStay =
      savedConvertedChildCount > 0
        ? round2(hotelPerAdult * savedConvertedChildCount)
        : 0;
    const basePerAdult = round2(nonHotelsTotal + hotelPerAdult);
    const { adicionales } = computeAdicionales(additionalCfg, basePerAdult);
    const totalPerAdult = round2(basePerAdult + adicionales + externalAdultTotal);
    const childExtrasTotalStay = isSelectedCategory
      ? round2(savedChildExtrasPerNight * effectiveNights)
      : 0;
    const explicitChildrenCount = Math.max(
      0,
      n(childrenCount) - savedConvertedChildCount,
    );
    const totalPerChild = calculateChildTotalForCategory({
      isSelected: isSelectedCategory,
      hotelTotal,
      selectedHotelChildTotal:
        childExtrasTotalStay + convertedChildHotelTotalStay,
    });

    list.push({
      category,
      label: CAT_LABELS[category] || category,
      hotelName: pack.hotelName,
      isSelected: isSelectedCategory,
      totalPerAdult,
      totalPerChild,
      totalPerChildIsPerPerson: true,
      pricingEngineVersion: 1,
      totalFinalAll: round2(
        totalPerAdult * adultsCount +
          baseSubtotalNinos +
          childExtrasTotalStay +
          convertedChildHotelTotalStay,
      ),
      perNightSum: round2(perNightSum),
      roomsCount,
      hotelTotal: round2(hotelTotal),
      hotelPerAdult,
      adultEquivalentCount,
      basePerAdult,
      adicionales,
      nights: effectiveNights,
      nonHotelsTotal,
      additionalCfg,
      baseSubtotalNinos,
      baseExplicitChildTotal: nonHotelExplicitChildTotal,
      baseConvertedChildTotal: nonHotelConvertedChildTotal,
      nonHotelConvertedChildTotal,
      baseExplicitChildTotalsById: nonHotelExplicitChildTotalsById,
      baseConvertedChildTotalsById: nonHotelConvertedChildTotalsById,
      hotelExplicitChildTotalsById,
      hotelConvertedChildTotalsById,
      explicitChildrenCount,
      convertedChildCount: savedConvertedChildCount,
      hotelExplicitChildCount: 0,
      hotelConvertedChildCount: savedConvertedChildCount,
      hotelChildTotal: childExtrasTotalStay,
      hotelConvertedChildTotal: convertedChildHotelTotalStay,
      mix,
      roomOptions,
      priceOverrides: { ...categoryPriceOverrides },
      perRoomPricing: buildPreviewPerRoomPricing({
        hotel,
        row: { category, mix },
        roomOptions,
        adultsCount,
        childrenCount,
        nonHotelsTotal,
        nonHotelExplicitChildTotal,
        nonHotelConvertedChildTotal,
        additionalCfg,
        nights: effectiveNights,
        externalAdultTotal,
        peopleDetails:
          cotizacion?.peopleDetails || cotizacion?.people_details || {},
      }),
      breakdown,
    });
  });

  if (list.length === 0 && Array.isArray(saved) && saved.length > 0) {
    return {
      categoryRows: saved.map((row) => {
        const hotelPerAdult = n(row.hotelPerAdult);
        const basePerAdult = round2(nonHotelsTotal + hotelPerAdult);
        const { adicionales } = computeAdicionales(additionalCfg, basePerAdult);
        const category = normalizeCat(row.category);
        const rowHotelConvertedChildCount =
          resolveHotelConvertedChildCount(row);
        const explicitChildrenCount = Math.max(
          0,
          n(childrenCount) - rowHotelConvertedChildCount,
        );
        const storedHotelChildTotal = n(row.hotelChildTotal);
        const isSelected =
          normalizeCat(row.category) === normalizeCat(hotel?.category);
        const totalPerChild = calculateChildTotalForCategory({
          isSelected,
          hotelTotal: n(row.hotelTotal),
          selectedHotelChildTotal:
            storedHotelChildTotal + n(row.hotelConvertedChildTotal),
        });

        return {
          ...row,
          category: row.category,
          isSelected,
          label:
            row.label || CAT_LABELS[row.category] || `${row.category} Estrellas`,
          hotelName: row.hotelName || `Hotel ${row.category}`,
          totalPerAdult: round2(basePerAdult + adicionales + externalAdultTotal),
          totalPerChild,
          totalPerChildIsPerPerson: true,
          pricingEngineVersion: 1,
          nights: row.nights || hotel?.nights || nights,
          roomOptions:
            row.roomOptions ||
            effectiveRoomOptionsByCategory?.[category]?.roomOptions ||
            [],
          nonHotelsTotal,
          additionalCfg,
          explicitChildrenCount,
          baseSubtotalNinos: Math.max(0, subtotalNinos - storedHotelChildTotal),
          baseExplicitChildTotal: nonHotelExplicitChildTotal,
          baseConvertedChildTotal: nonHotelConvertedChildTotal,
          nonHotelConvertedChildTotal,
          baseExplicitChildTotalsById: nonHotelExplicitChildTotalsById,
          baseConvertedChildTotalsById: nonHotelConvertedChildTotalsById,
          hotelExplicitChildTotalsById,
          hotelConvertedChildTotalsById,
          hotelChildTotal: storedHotelChildTotal,
          convertedChildCount: rowHotelConvertedChildCount,
          hotelExplicitChildCount: n(row.hotelExplicitChildCount),
          hotelConvertedChildCount: rowHotelConvertedChildCount,
          perRoomPricing: (row.perRoomPricing || []).map((room) => ({
            ...room,
            totalPerPerson: round2(
              n(room.base) + n(room.adicionales) + externalAdultTotal,
            ),
          })),
        };
      }),
      peopleCount,
      externalAdultTotal,
      externalChildTotal,
      externalConvertedChildTotal,
      nonHotelsTotal,
    };
  }

  if (list.length === 0 && hotel?.category) {
    const hotelConvertedChildCount = resolveHotelConvertedChildCount(hotel);
    const explicitChildrenCount = Math.max(
      0,
      n(childrenCount) - hotelConvertedChildCount,
    );
    list.push({
      category: hotel.category,
      isSelected: true,
      label: CAT_LABELS[hotel.category] || `${hotel.category} Estrellas`,
      hotelName: hotel.hotelName || `Hotel ${hotel.category}`,
      totalPerAdult:
        hotel?.basePerAdult != null && hotel?.adicionales != null
          ? round2(n(hotel.basePerAdult) + n(hotel.adicionales) + externalAdultTotal)
          : n(hotel.totalPerAdult),
      totalPerChild: calculateChildTotalForCategory({
        isSelected: true,
        hotelTotal: n(hotel?.hotelTotal),
        selectedHotelChildTotal:
          n(hotel?.hotelChildTotal) + n(hotel?.hotelConvertedChildTotal),
      }),
      totalPerChildIsPerPerson: true,
      pricingEngineVersion: 1,
      totalFinalAll: n(hotel.totalFinalAll),
      nights: hotel?.nights || nights,
      roomOptions:
        hotel?.roomOptions ||
        effectiveRoomOptionsByCategory?.[normalizeCat(hotel.category)]
          ?.roomOptions ||
        [],
      nonHotelsTotal,
      additionalCfg,
      explicitChildrenCount,
      baseSubtotalNinos: subtotalNinos,
      baseExplicitChildTotal: nonHotelExplicitChildTotal,
      baseConvertedChildTotal: nonHotelConvertedChildTotal,
      nonHotelConvertedChildTotal,
      baseExplicitChildTotalsById: nonHotelExplicitChildTotalsById,
      baseConvertedChildTotalsById: nonHotelConvertedChildTotalsById,
      hotelExplicitChildTotalsById,
      hotelConvertedChildTotalsById,
      hotelChildTotal: n(hotel?.hotelChildTotal),
      convertedChildCount: hotelConvertedChildCount,
      hotelExplicitChildCount: n(hotel?.hotelExplicitChildCount),
      hotelConvertedChildCount,
      perRoomPricing: (hotel?.perRoomPricing || []).map((room) => ({
        ...room,
        totalPerPerson: round2(
          n(room.base) + n(room.adicionales) + externalAdultTotal,
        ),
      })),
    });
  }

  return {
    categoryRows: list,
    peopleCount,
    externalAdultTotal,
    externalChildTotal,
    externalConvertedChildTotal,
    nonHotelsTotal,
    packageType:
      packageType || hotel?.packageType || cotizacion?.packagetype || "compartido",
  };
};

export const getPdfHotelCategoryOptionsFromCotizacion = (
  cotizacion = {},
  roomOptionsByCategory = {},
  packageType = null,
) => {
  const resolvedHotel = resolvePdfSelectedHotel(cotizacion);
  const rows = buildPdfHotelPreviewRows({
    cotizacion,
    resolvedHotel,
    roomOptionsByCategory,
    packageType,
  }).categoryRows;
  const byCategory = new Map();

  const groupCategoryKeys = getHotelGroupCategoryKeys(resolvedHotel);
  const selectedGroupCategorySet = new Set(groupCategoryKeys);
  const shouldOnlyShowGroupedCategories =
    getHotelGroupCount(resolvedHotel) > 1 && selectedGroupCategorySet.size > 0;

  rows.forEach((row) => {
    const category = normalizeCategory(row?.category);
    if (!category || byCategory.has(category)) return;
    if (shouldOnlyShowGroupedCategories && !selectedGroupCategorySet.has(category)) {
      return;
    }
    byCategory.set(category, {
      category,
      label: row?.label || `${category} Estrellas`,
      isSelected:
        selectedGroupCategorySet.has(category) ||
        row?.isSelected === true ||
        row?.selected === true ||
        category === normalizeCategory(resolvedHotel?.category),
    });
  });

  groupCategoryKeys.forEach((category) => {
    const existing = byCategory.get(category);
    byCategory.set(category, {
      ...(existing || {}),
      category,
      label:
        existing?.label ||
        CAT_LABELS[normalizeCat(category)] ||
        `${category} Estrellas`,
      isSelected: true,
    });
  });

  const selectedCategory = normalizeCategory(resolvedHotel?.category);
  if (selectedCategory && !byCategory.has(selectedCategory)) {
    byCategory.set(selectedCategory, {
      category: selectedCategory,
      label:
        resolvedHotel?.label ||
        resolvedHotel?.hotelCategoryLabel ||
        `${selectedCategory} Estrellas`,
      isSelected: true,
    });
  }

  if (byCategory.has(NO_HOTEL_CATEGORY)) {
    const noHotel = byCategory.get(NO_HOTEL_CATEGORY);
    byCategory.set(NO_HOTEL_CATEGORY, {
      ...noHotel,
      label: "Sin hotel",
      isSelected: true,
    });
  }

  return Array.from(byCategory.values());
};

export const getDefaultPdfHotelCategories = (
  cotizacion = {},
  options = getPdfHotelCategoryOptionsFromCotizacion(cotizacion),
) => {
  const normalizedOptions = Array.isArray(options)
    ? options
        .map((option) => normalizeCategory(option?.category))
        .filter(Boolean)
    : [];

  const resolvedHotel = resolvePdfSelectedHotel(cotizacion);
  const selectedGroupCategories = getHotelGroupCategoryKeys(resolvedHotel).filter(
    (category) => normalizedOptions.includes(category),
  );
  if (selectedGroupCategories.length > 0) return selectedGroupCategories;

  const selectedOptionCategories = (Array.isArray(options) ? options : [])
    .filter((option) => option?.isSelected)
    .map((option) => normalizeCategory(option?.category))
    .filter(Boolean);
  if (selectedOptionCategories.length > 1) {
    return Array.from(new Set(selectedOptionCategories));
  }

  const selected =
    normalizeCategory(resolvedHotel?.category) || selectedOptionCategories[0];
  if (selected) return [selected];

  const stored =
    cotizacion?.pdf_excel_preview_categories ||
    cotizacion?.excelPreviewCategories ||
    cotizacion?.previewCategories ||
    [];

  if (Array.isArray(stored) && stored.length > 0) {
    const normalizedStored = stored.map(normalizeCategory).filter(Boolean);
    const allCategoriesSelected =
      normalizedOptions.length > 1 &&
      normalizedStored.length >= normalizedOptions.length &&
      normalizedOptions.every((category) =>
        normalizedStored.includes(category),
      );
    if (!allCategoriesSelected && normalizedStored.length > 0) {
      return normalizedStored;
    }
  }

  return normalizedOptions[0] ? [normalizedOptions[0]] : [];
};
