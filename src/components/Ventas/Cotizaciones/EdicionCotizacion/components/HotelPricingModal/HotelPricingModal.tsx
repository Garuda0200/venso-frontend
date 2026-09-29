import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import {
  getHotelRoomCapacity,
  isExtraBedRoomType,
} from "../../../../../../utils/hotelRoomTypes";
import { FaChild, FaMapMarkerAlt, FaSearch, FaUser } from "react-icons/fa";
import { MdClose, MdExpandLess, MdExpandMore, MdHotel, MdLock } from "react-icons/md";
import { CAT_LABELS, normalizeCat } from "./HotelSummarySection";
import { formatCurrency } from "../../utils/formatters";
import ChildrenPanel from "../DaysEditor/components/SortableService/ChildrenPanel";
import { getServiceBeneficiarySnapshot } from "../../utils/passengerPricingState";
import {
  autoMixForPax,
  autoMixWithConvertedChildren,
  transferRoomMixToOptions,
} from "../../utils/hotelRoomMix";
import {
  buildHotelPassengerIds,
  syncHotelChildPricingWithPeople,
} from "../../utils/hotelPassengerSync";
import { resolveHotelRoomAssignments } from "../../utils/hotelRoomAssignments";
import { buildPeruvianPassengerIdSet } from "../../utils/igvUtils";
import { normalizeHotelBasePriceAgainstCatalog } from "../../utils/hotelPriceNormalization";
import { aggregatePerRoomPricingByStayGroup } from "../../utils/financialDisplayHelpers";
import "./HotelPricingModal.scss";

const BASE_CATEGORY_ORDER = ["2", "3", "3s", "4", "5"];
const HOTEL_IGV_RATE = 0.18;

const sortHotelCategories = (categories = []) =>
  [...new Set(categories.filter(Boolean))].sort((left, right) => {
    const leftIndex = BASE_CATEGORY_ORDER.indexOf(left);
    const rightIndex = BASE_CATEGORY_ORDER.indexOf(right);
    if (leftIndex >= 0 || rightIndex >= 0) {
      if (leftIndex < 0) return 1;
      if (rightIndex < 0) return -1;
      return leftIndex - rightIndex;
    }
    return String(left).localeCompare(String(right), "es");
  });

const getCategoryLabel = (category, categoryData = {}) =>
  CAT_LABELS[category] ||
  categoryData?.categoryLabel ||
  categoryData?.categoria ||
  String(category || "Hotel").replace(/-/g, " ");

const GROUP_COLORS = [
  "var(--color-primary)",
  "#e67e22",
  "#9b59b6",
  "#2ecc71",
  "#e74c3c",
];

let groupIdCounter = 0;
const nextGroupId = () => `grp-${++groupIdCounter}`;

const n = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getPassengerDisplayName = (passenger = {}, fallback = "Pasajero") => {
  const fullName = [
    passenger?.nombres || passenger?.nombre || passenger?.firstName,
    passenger?.apellidos || passenger?.apellido || passenger?.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fullName || passenger?.name || fallback;
};

const getRoomIgvStayTotal = (room = {}, fallbackNights = 1) =>
  (room.roomDetails || []).reduce((sum, detail) => {
    if (!detail?.hasIgv && !detail?.tieneIgv) return sum;
    const unit = n(detail.unitWithIgv ?? detail.unit ?? detail.baseUnit);
    const nights =
      unit > 0 ? n(detail.hotelTotalRoom) / unit : Number(fallbackNights || 1);
    return sum + n(detail.igvAmount) * Math.max(1, nights || 1);
  }, 0);

const getRoomBeneficiaryCount = (room = {}) =>
  Math.max(
    0,
    Number(room?.beneficiaries || 0) ||
      (Array.isArray(room?.passengerIds) ? room.passengerIds.length : 0) ||
      Number(room?.adultBeneficiaries || 0) +
        Number(room?.convertedChildBeneficiaries || 0),
  );

const getRoomIgvPerPerson = (room = {}, fallbackNights = 1) => {
  const beneficiaries = getRoomBeneficiaryCount(room);
  return beneficiaries > 0
    ? round2(getRoomIgvStayTotal(room, fallbackNights) / beneficiaries)
    : 0;
};

const normalizeRoomText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const getRoomDisplayRank = (room) => {
  if (isExtraBedRoomType(room)) return 100;
  // Higher-capacity physical rooms first; supports quintuple/sextuple catalog
  // entries without treating WB (with breakfast) as occupancy.
  return 20 - Math.min(10, getHotelRoomCapacity(room, 1));
};

const normalizePriceOverrideMap = (overrides) => {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return {};
  }

  return Object.entries(overrides).reduce((accumulator, [roomKey, value]) => {
    const parsed = parseFloat(value);
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
  if (entries.length === 0) {
    return {};
  }

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

const getRoomPriceOverrideAliases = (room = {}) => {
  const details = Array.isArray(room?.roomDetails) ? room.roomDetails : [];
  const rawAliases = [
    room?.key,
    room?.roomKey,
    room?.sourceRoomKey,
    room?.baseKey,
    room?.id_habitacion,
    room?.idHabitacion,
    room?.child_id,
    room?.assigned_child_id,
    room?.label,
    room?.baseLabel,
    room?.roomType,
    room?.room_type,
    room?.tipo_habitacion,
    room?.childService?.id_habitacion,
    room?.childService?.tipo_habitacion,
    room?.child_service?.id_habitacion,
    room?.child_service?.tipo_habitacion,
    ...details.flatMap((detail) => [
      detail?.roomId,
      detail?.roomKey,
      detail?.sourceRoomKey,
      detail?.id_habitacion,
      detail?.label,
      detail?.baseLabel,
    ]),
  ];

  const aliases = new Set();
  rawAliases.forEach((value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return;

    aliases.add(raw);
    aliases.add(raw.split(":")[0]);
    const normalized = normalizeAssignmentRoomText(raw);
    if (normalized) {
      aliases.add(normalized);
      aliases.add(normalized.split(":")[0]);
    }
  });

  return [...aliases].filter(Boolean);
};

const addRoomPriceOverrideAliases = (accumulator, room, unitValue) => {
  const unit = n(unitValue);
  if (unit <= 0) return accumulator;

  getRoomPriceOverrideAliases(room).forEach((alias) => {
    accumulator[alias] = unit;
  });
  return accumulator;
};

const deriveBasePriceOverridesFromPerRoomPricing = (perRoomPricing = []) =>
  (Array.isArray(perRoomPricing) ? perRoomPricing : []).reduce(
    (accumulator, room) => {
      const detail = Array.isArray(room?.roomDetails)
        ? room.roomDetails.find((item) => n(item?.baseUnit) > 0) ||
          room.roomDetails[0]
        : null;
      const baseUnit = n(
        detail?.baseUnit ??
          detail?.roomBaseUnit ??
          detail?.roomUnitPrice ??
          room?.baseUnit ??
          room?.roomBaseUnit ??
          room?.roomUnitPrice ??
          room?.hotelPerNight,
      );
      return addRoomPriceOverrideAliases(accumulator, room, baseUnit);
    },
    {},
  );

const deriveBasePriceOverridesFromBreakdown = (breakdown = []) =>
  (Array.isArray(breakdown) ? breakdown : []).reduce((accumulator, room) => {
    const unit = n(
      room?.unit ??
        room?.baseUnit ??
        room?.roomBaseUnit ??
        room?.roomUnitPrice ??
        room?.pricePerRoomNight ??
        room?.precio_servicio ??
        room?.precioServicio,
    );
    return addRoomPriceOverrideAliases(accumulator, room, unit);
  }, {});

const deriveBasePriceOverridesFromHotelConfig = (hotelConfig = {}) => {
  const perNightBreakdowns = Array.isArray(hotelConfig?.perNightBreakdowns)
    ? hotelConfig.perNightBreakdowns
    : Object.values(hotelConfig?.perNightBreakdowns || {});

  const perNightOverrides = perNightBreakdowns.reduce(
    (accumulator, breakdown) => ({
      ...accumulator,
      ...deriveBasePriceOverridesFromBreakdown(breakdown),
    }),
    {},
  );

  return {
    ...deriveBasePriceOverridesFromPerRoomPricing(hotelConfig?.perRoomPricing),
    ...perNightOverrides,
    ...deriveBasePriceOverridesFromBreakdown(hotelConfig?.breakdown),
  };
};

const clonePriceOverrideMap = (overrides = {}) =>
  overrides && typeof overrides === "object" && !Array.isArray(overrides)
    ? { ...overrides }
    : {};

const mergePriceOverrideMaps = (...maps) =>
  maps.reduce((accumulator, map) => {
    const normalizedMap = clonePriceOverrideMap(map);
    if (Object.keys(normalizedMap).length === 0) return accumulator;

    return {
      ...accumulator,
      ...normalizedMap,
    };
  }, {});

const deriveBasePriceOverridesFromRoomOptions = (roomOptions = []) =>
  (Array.isArray(roomOptions) ? roomOptions : []).reduce((accumulator, room) => {
    const unit = n(
      room?.pricePerRoomNight ??
        room?.roomUnitPrice ??
        room?.precio_servicio ??
        room?.precioServicio,
    );
    return addRoomPriceOverrideAliases(accumulator, room, unit);
  }, {});

const resolveGroupPriceOverrides = (group = {}, fallbackOverrides = {}) => {
  const direct = clonePriceOverrideMap(
    group?.priceOverrides || group?.price_overrides,
  );
  const fromRoomOptions = deriveBasePriceOverridesFromRoomOptions(
    group?.roomOptions,
  );
  const fromConfig = deriveBasePriceOverridesFromHotelConfig(group);

  // La prioridad correcta es: fallback global < config reconstruida <
  // roomOptions persistidos < overrides directos del grupo. Así evitamos que
  // el primer grupo contamine los precios del segundo al reabrir la cotización.
  return mergePriceOverrideMaps(
    fallbackOverrides,
    fromConfig,
    fromRoomOptions,
    direct,
  );
};

const normalizeGroupDayIndices = (dayIndices = []) =>
  [...new Set(Array.isArray(dayIndices) ? dayIndices : [])]
    .map((value) => parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value >= 0)
    .sort((a, b) => a - b);

const enforceUniqueDayGroups = (groups = []) => {
  const usedDays = new Set();

  return (Array.isArray(groups) ? groups : []).map((group) => {
    const dayIndices = normalizeGroupDayIndices(group?.dayIndices).filter(
      (dayIndex) => {
        if (usedDays.has(dayIndex)) return false;
        usedDays.add(dayIndex);
        return true;
      },
    );

    return {
      ...group,
      dayIndices,
    };
  });
};

const resolveRoomPriceOverrideValue = (roomOption = {}, overrides = {}) => {
  const aliases = getRoomPriceOverrideAliases(roomOption);
  const matchingAlias = aliases.find((alias) =>
    Object.prototype.hasOwnProperty.call(overrides || {}, alias),
  );
  return matchingAlias ? overrides[matchingAlias] : undefined;
};

const applyRoomPriceOverridesToOptions = (roomOptions = [], overrides = {}) =>
  (Array.isArray(roomOptions) ? roomOptions : []).map((option) => {
    const overrideValue = resolveRoomPriceOverrideValue(option, overrides);
    return overrideValue !== undefined
      ? {
          ...option,
          pricePerRoomNight: overrideValue,
        }
      : option;
  });

const roomOptionIdentitySet = (room = {}) =>
  new Set(
    getRoomPriceOverrideAliases(room)
      .map((alias) => normalizeRoomText(alias))
      .filter(Boolean),
  );

const roomOptionsMatch = (left = {}, right = {}) => {
  const leftAliases = roomOptionIdentitySet(left);
  const rightAliases = roomOptionIdentitySet(right);
  if (leftAliases.size === 0 || rightAliases.size === 0) return false;

  for (const alias of leftAliases) {
    if (rightAliases.has(alias)) return true;
  }
  return false;
};

const mergePersistedRoomOptionsWithCatalog = (
  catalogRoomOptions = [],
  persistedRoomOptions = [],
) => {
  const catalog = Array.isArray(catalogRoomOptions) ? catalogRoomOptions : [];
  const persisted = Array.isArray(persistedRoomOptions) ? persistedRoomOptions : [];

  if (catalog.length === 0) return persisted;
  if (persisted.length === 0) return catalog;

  const usedPersisted = new Set();
  const merged = catalog.map((catalogOption) => {
    const matchIndex = persisted.findIndex(
      (persistedOption, index) =>
        !usedPersisted.has(index) &&
        roomOptionsMatch(catalogOption, persistedOption),
    );

    if (matchIndex < 0) return catalogOption;
    usedPersisted.add(matchIndex);
    const persistedOption = persisted[matchIndex];
    const persistedPrice = n(
      persistedOption?.pricePerRoomNight ??
        persistedOption?.roomBaseUnitPrice ??
        persistedOption?.roomUnitPrice ??
        persistedOption?.precio_base_sin_igv ??
        persistedOption?.precio_servicio ??
        persistedOption?.precioServicio,
    );
    const catalogPrice = n(
      catalogOption?.pricePerRoomNight ??
        catalogOption?.roomBaseUnitPrice ??
        catalogOption?.roomUnitPrice ??
        catalogOption?.precio_servicio ??
        catalogOption?.precioServicio,
    );
    const canonicalBasePrice = normalizeHotelBasePriceAgainstCatalog(
      persistedPrice,
      catalogPrice,
    );

    return {
      ...catalogOption,
      ...persistedOption,
      key: catalogOption.key || persistedOption.key,
      label: catalogOption.label || persistedOption.label,
      capacity: catalogOption.capacity || persistedOption.capacity,
      id_habitacion:
        catalogOption.id_habitacion || persistedOption.id_habitacion,
      pricePerRoomNight: canonicalBasePrice,
      roomBaseUnitPrice: canonicalBasePrice,
      roomUnitPrice: canonicalBasePrice,
      precio_base_sin_igv: canonicalBasePrice,
    };
  });

  persisted.forEach((persistedOption, index) => {
    if (usedPersisted.has(index)) return;
    if (merged.some((option) => roomOptionsMatch(option, persistedOption))) return;
    merged.push(persistedOption);
  });

  return merged.sort((left, right) => {
    const rankDiff = getRoomDisplayRank(left) - getRoomDisplayRank(right);
    if (rankDiff !== 0) return rankDiff;
    return String(left?.label || left?.key || "").localeCompare(
      String(right?.label || right?.key || ""),
      "es",
    );
  });
};

const sanitizePersistedPriceOverridesAgainstRoomOptions = (
  overrides = {},
  roomOptions = [],
) =>
  Object.entries(clonePriceOverrideMap(overrides)).reduce(
    (accumulator, [overrideKey, rawValue]) => {
      const matchingRoom = (Array.isArray(roomOptions) ? roomOptions : []).find(
        (room) => getRoomPriceOverrideAliases(room).includes(overrideKey),
      );
      const catalogBasePrice = matchingRoom
        ? n(
            matchingRoom?.pricePerRoomNight ??
              matchingRoom?.roomBaseUnitPrice ??
              matchingRoom?.roomUnitPrice ??
              matchingRoom?.precio_servicio ??
              matchingRoom?.precioServicio,
          )
        : 0;
      accumulator[overrideKey] = normalizeHotelBasePriceAgainstCatalog(
        rawValue,
        catalogBasePrice,
      );
      return accumulator;
    },
    {},
  );

const getHotelOptionKey = (option = {}) =>
  String(
    option?.key ||
      option?.id_hotel ||
      option?.id ||
      option?.hotelName ||
      option?.nombre ||
      "",
  );

const resolveCategoryHotelOption = (
  categoryData = {},
  { selectedKey = null, hotelConfig = null } = {},
) => {
  const options = Array.isArray(categoryData?.hotelOptions)
    ? categoryData.hotelOptions
    : [];
  if (options.length === 0) return null;

  const normalizedSelectedKey = String(selectedKey || "");
  const normalizedHotelId = String(hotelConfig?.id_hotel || "");
  const normalizedHotelName = normalizeRoomText(hotelConfig?.hotelName || "");
  const normalizedCity = normalizeRoomText(
    hotelConfig?.ciudad || hotelConfig?.city || "",
  );

  return (
    options.find((option) => getHotelOptionKey(option) === normalizedSelectedKey) ||
    options.find(
      (option) =>
        normalizedHotelId &&
        String(option?.id_hotel || "") === normalizedHotelId,
    ) ||
    options.find(
      (option) =>
        normalizedHotelName &&
        normalizeRoomText(option?.hotelName || "") === normalizedHotelName,
    ) ||
    options.find(
      (option) =>
        normalizedCity && normalizeRoomText(option?.ciudad || "") === normalizedCity,
    ) ||
    options[0]
  );
};

const costFromMix = (mix, roomOptions) => {
  const optionsMap = new Map(
    (roomOptions || []).map((option) => [option.key, option]),
  );
  let perNightSum = 0;
  let roomsCount = 0;
  let extraBedsCount = 0;
  const breakdown = [];

  Object.entries(mix || {}).forEach(([roomKey, rawCount]) => {
    const option = optionsMap.get(roomKey);
    if (!option) return;

    const count = Math.max(0, parseInt(rawCount, 10) || 0);
    const unit = n(option.pricePerRoomNight);
    const subtotal = unit * count;
    const isExtraBed = option?.isExtraBed === true || isExtraBedRoomType(option);
    perNightSum += subtotal;
    if (isExtraBed) extraBedsCount += count;
    else roomsCount += count;
    breakdown.push({
      key: roomKey,
      label: option.label || roomKey,
      cnt: count,
      unit,
      sub: subtotal,
      capacity: getHotelRoomCapacity(option, 1),
      isExtraBed,
      id_habitacion: option.id_habitacion || null,
    });
  });

  breakdown.sort((a, b) => {
    const rankDiff = getRoomDisplayRank(a) - getRoomDisplayRank(b);
    if (rankDiff !== 0) return rankDiff;
    return n(a.unit) - n(b.unit);
  });

  return { perNightSum, roomsCount, extraBedsCount, breakdown };
};

const buildRoomSlots = (breakdown = []) => {
  const rows = Array.isArray(breakdown) ? breakdown : [];
  const baseRows = rows.filter((room) => !isExtraBedRoomType(room));
  const extraRows = rows.filter((room) => isExtraBedRoomType(room));

  const slots = baseRows.flatMap((room) =>
    Array.from({ length: Math.max(0, n(room.cnt)) }, (_, index) => {
      const baseCapacity = getHotelRoomCapacity(room, 1);
      return {
        id: `${room.key}:${index + 1}`,
        key: room.key,
        label:
          Math.max(0, n(room.cnt)) > 1
            ? `${room.label || room.key} ${index + 1}`
            : room.label || room.key,
        baseLabel: room.label || room.key,
        baseCapacity,
        capacity: baseCapacity,
        unit: n(room.unit),
        id_habitacion: room.id_habitacion || null,
        extraBedCount: 0,
      };
    }),
  );

  let slotIndex = 0;
  extraRows.forEach((room) => {
    const count = Math.max(0, parseInt(room?.cnt || 0, 10) || 0);
    for (let index = 0; index < count && slotIndex < slots.length; index += 1) {
      const slot = slots[slotIndex];
      slot.extraBedCount = 1;
      slot.capacity = slot.baseCapacity + 1;
      slot.extraBedKey = room.key;
      slot.extraBedId = room.id_habitacion || null;
      slot.extraBedUnit = n(room.unit);
      slotIndex += 1;
    }
  });

  return slots;
};

const normalizeAssignmentRoomText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const isHotelModalService = (service = {}) =>
  String(
    service?.typeService ||
      service?.tipoServicio ||
      service?.tipo_servicio ||
      service?.parentService?.typeService ||
      service?.parentService?.tipo_servicio ||
      "",
  )
    .toLowerCase()
    .includes("hotel");

const getHotelServiceCategory = (service = {}) =>
  normalizeCat(
    service?.hotelCategory ||
      service?.hotel_categoria ||
      service?.parentService?.categoria ||
      service?.parentService?.nombre ||
      "",
  );

const getHotelServicePassengerIds = (service = {}) => {
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
      service?.assignedBeneficiariosAdultos ||
      service?.assigned_beneficiarios_adultos,
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

const getHotelServiceRoomAliases = (service = {}) => {
  const child = service?.childService || service?.child_service || {};
  const roomText = normalizeAssignmentRoomText(
    child?.tipo_habitacion ||
      child?.habitacion?.tipo_habitacion ||
      service?.roomType ||
      service?.room_type ||
      service?.roomKey ||
      service?.tariff?.roomKey ||
      "",
  );
  return [
    child?.id_habitacion,
    service?.child_id,
    service?.assigned_child_id,
    service?.roomKey,
    service?.tariff?.roomKey,
    roomText,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
};

const deriveRoomAssignmentsFromHotelServices = ({
  days = [],
  dayIndices = [],
  category = null,
} = {}) => {
  const selectedDayIndex =
    (Array.isArray(dayIndices) ? dayIndices : []).find((idx) =>
      Number.isInteger(Number(idx)),
    ) ?? 0;
  const day = Array.isArray(days) ? days[Number(selectedDayIndex)] : null;
  const services = Array.isArray(day?.servicios) ? day.servicios : [];
  const normalizedCategory = normalizeCat(category);
  const counters = {};
  const assignments = {};
  let genericRoomCounter = 0;

  services
    .filter(isHotelModalService)
    .filter((service) => {
      const serviceCategory = getHotelServiceCategory(service);
      return (
        !normalizedCategory ||
        !serviceCategory ||
        serviceCategory === normalizedCategory
      );
    })
    .forEach((service) => {
      const passengerIds = getHotelServicePassengerIds(service);
      if (passengerIds.length === 0) return;

      const aliases = getHotelServiceRoomAliases(service);
      // Detect if the only aliases available are numeric IDs (e.g. child_id = 18)
      // with no real room-key text. In that case use generic sequential room:N keys
      // so resolveHotelRoomAssignments can map them to available slots in order.
      const hasRealRoomKey = aliases.some((alias) => {
        const text = normalizeAssignmentRoomText(alias);
        return text && !/^\d+$/.test(text);
      });

      if (!hasRealRoomKey) {
        genericRoomCounter += 1;
        assignments[`room:${genericRoomCounter}`] = passengerIds;
        return;
      }

      aliases.forEach((alias) => {
        counters[alias] = (counters[alias] || 0) + 1;
        assignments[`${alias}:${counters[alias]}`] = passengerIds;
      });
    });

  return assignments;
};

const pickInitialRoomAssignments = ({
  savedAssignments,
  days,
  dayIndices,
  category,
} = {}) => {
  const fromServices = deriveRoomAssignmentsFromHotelServices({
    days,
    dayIndices,
    category,
  });

  return Object.keys(fromServices).length > 0
    ? fromServices
    : savedAssignments || {};
};

const sortRoomSlotsByCapacity = (roomSlots = [], direction = "desc") =>
  [...roomSlots].sort((left, right) => {
    const capacityDiff =
      direction === "asc"
        ? n(left.capacity) - n(right.capacity)
        : n(right.capacity) - n(left.capacity);
    if (capacityDiff !== 0) return capacityDiff;

    const unitDiff =
      direction === "asc"
        ? n(left.unit) - n(right.unit)
        : n(right.unit) - n(left.unit);
    if (unitDiff !== 0) return unitDiff;

    return String(left.label || left.id).localeCompare(
      String(right.label || right.id),
    );
  });

const autoFillRoomAssignments = (
  nextAssignments,
  assignedIds,
  roomSlots,
  assignablePassengerIds,
) => {
  const adults = assignablePassengerIds.filter(
    (id) => !String(id).startsWith("child:") && !assignedIds.has(id),
  );
  const convertedChildren = assignablePassengerIds.filter(
    (id) => String(id).startsWith("child:") && !assignedIds.has(id),
  );

  const assignToSlots = (ids, slotOrder, { preferEmpty = false } = {}) => {
    ids.forEach((id) => {
      const candidates = slotOrder.filter(
        (slot) =>
          (nextAssignments[slot.id] || []).length <
          Math.max(1, slot.capacity || 1),
      );
      if (candidates.length === 0) return;

      const target =
        (preferEmpty
          ? candidates.find(
              (slot) => (nextAssignments[slot.id] || []).length === 0,
            )
          : null) || candidates[0];
      if (!target) return;

      nextAssignments[target.id].push(id);
      assignedIds.add(id);
    });
  };

  // Adults first in larger rooms, converted children afterwards in smaller rooms.
  assignToSlots(adults, sortRoomSlotsByCapacity(roomSlots, "desc"));
  assignToSlots(convertedChildren, sortRoomSlotsByCapacity(roomSlots, "asc"), {
    preferEmpty: true,
  });
};

const normalizeRoomAssignments = (
  rawAssignments,
  roomSlots,
  assignablePassengerIds,
  { fillMissing = true } = {},
) => {
  const slotIds = new Set(roomSlots.map((slot) => slot.id));
  const allowedIds = new Set(assignablePassengerIds);
  const next = {};
  const assigned = new Set();
  const resolvedAssignments = resolveHotelRoomAssignments(rawAssignments, roomSlots);

  // Build id_habitacion:N → slotId map to remap keys from DB-loaded services
  // where child_id is used instead of the room option key.

  const assign = (slotId, ids = []) => {
    if (!slotIds.has(slotId)) return;
    const slot = roomSlots.find((item) => item.id === slotId);
    const limit = Math.max(1, slot?.capacity || 1);
    next[slotId] = [];
    ids.forEach((id) => {
      if (!allowedIds.has(id) || assigned.has(id)) return;
      if (next[slotId].length >= limit) return;
      next[slotId].push(id);
      assigned.add(id);
    });
  };

  if (Array.isArray(rawAssignments)) {
    Object.entries(resolvedAssignments).forEach(([slotId, ids]) => {
      assign(slotId, Array.isArray(ids) ? ids : []);
    });
  } else if (rawAssignments && typeof rawAssignments === "object") {
    Object.entries(resolvedAssignments).forEach(([slotId, ids]) => {
      assign(slotId, Array.isArray(ids) ? ids : []);
    });
  }

  roomSlots.forEach((slot) => {
    if (!next[slot.id]) next[slot.id] = [];
  });

  if (fillMissing) {
    autoFillRoomAssignments(next, assigned, roomSlots, assignablePassengerIds);
  }

  return next;
};

const hasRoomAssignmentPassengers = (assignments = {}) =>
  Object.values(assignments || {}).some(
    (ids) => Array.isArray(ids) && ids.length > 0,
  );

const areRoomAssignmentsEqual = (left = {}, right = {}) => {
  const leftKeys = Object.keys(left || {});
  const rightKeys = Object.keys(right || {});
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => {
    const leftIds = Array.isArray(left?.[key]) ? left[key] : [];
    const rightIds = Array.isArray(right?.[key]) ? right[key] : [];
    if (leftIds.length !== rightIds.length) return false;
    return leftIds.every((id, index) => id === rightIds[index]);
  });
};

const stableStateKey = (value) => {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "";
  }
};

const summarizeRoomAssignments = (
  roomSlots,
  roomAssignments,
  adultIds = [],
  convertedChildIds = [],
) => {
  const adultSet = new Set(adultIds);
  const convertedSet = new Set(convertedChildIds);

  return roomSlots.reduce((accumulator, slot) => {
    const passengerIds = Array.isArray(roomAssignments?.[slot.id])
      ? roomAssignments[slot.id]
      : [];
    const adultPassengerIds = passengerIds.filter((id) => adultSet.has(id));
    const convertedChildPassengerIds = passengerIds.filter((id) =>
      convertedSet.has(id),
    );

    accumulator[slot.id] = {
      ...slot,
      passengerIds,
      adultPassengerIds,
      convertedChildPassengerIds,
      occupants: passengerIds.length,
      beneficiaries:
        adultPassengerIds.length + convertedChildPassengerIds.length,
      adultBeneficiaries: adultPassengerIds.length,
      convertedChildBeneficiaries: convertedChildPassengerIds.length,
    };
    return accumulator;
  }, {});
};

const buildAdultBeneficiariosPayload = (passengerIds = []) =>
  passengerIds.map((id) =>
    String(id).startsWith("child:") ? { id, child_origin: id } : { id },
  );

const getChildAdditionalPolicy = (cfg, field) =>
  cfg?.[field] ?? cfg?.applyAdditionalCostsToChildren ?? true;

const resolveAdditionalCfgForAudience = (cfg, audience = "adult") => {
  const isChild = audience === "child";
  const useAdultOperational =
    !isChild || getChildAdditionalPolicy(cfg, "applyOperationalCostsToChildren");
  const useAdultFee =
    !isChild || getChildAdditionalPolicy(cfg, "applyFeeToChildren");
  const useAdultExtra =
    !isChild || getChildAdditionalPolicy(cfg, "applyExtraFeeToChildren");

  return {
    operationalMode: String(
      useAdultOperational
        ? cfg?.operationalMode || "fixed"
        : cfg?.childOperationalMode || cfg?.operationalMode || "fixed",
    ).toLowerCase(),
    feeMode: String(
      useAdultFee
        ? cfg?.feeMode || "fixed"
        : cfg?.childFeeMode || cfg?.feeMode || "fixed",
    ).toLowerCase(),
    operationalCosts: useAdultOperational
      ? n(cfg?.operationalCosts)
      : n(cfg?.childOperationalCosts ?? cfg?.operationalCosts),
    feeVal: useAdultFee ? n(cfg?.feeVal ?? cfg?.fee) : n(cfg?.childFee ?? cfg?.feeVal ?? cfg?.fee),
    extraFee: useAdultExtra ? n(cfg?.extraFee) : n(cfg?.childExtraFee ?? cfg?.extraFee),
    hasAnyChildPolicy:
      getChildAdditionalPolicy(cfg, "applyOperationalCostsToChildren") ||
      getChildAdditionalPolicy(cfg, "applyFeeToChildren") ||
      getChildAdditionalPolicy(cfg, "applyExtraFeeToChildren"),
  };
};

const buildAdicLabel = (cfg, audience = "adult") => {
  const resolved = resolveAdditionalCfgForAudience(cfg, audience);
  const parts = [];
  if (resolved.feeVal > 0) {
    parts.push(
      resolved.feeMode === "percentage"
        ? `Fee (${resolved.feeVal}%)`
        : `Fee`,
    );
  }
  if (resolved.operationalCosts > 0) {
    parts.push(
      resolved.operationalMode === "percentage"
        ? `G.Adm (${resolved.operationalCosts}%)`
        : `G.Adm`,
    );
  }
  if (resolved.extraFee > 0) parts.push(`Cont.`);
  return parts.join(" + ") || (audience === "child" ? "Adic. niño" : "Adic.");
};

const computeAdicionales = (additionalCfg, basePerAdult, audience = "adult") => {
  const resolved = resolveAdditionalCfgForAudience(additionalCfg, audience);
  const safeBase = round2(basePerAdult);
  const op =
    resolved.operationalMode === "percentage"
      ? (resolved.operationalCosts * safeBase) / 100
      : resolved.operationalCosts;
  const fee =
    resolved.feeMode === "percentage"
      ? (resolved.feeVal * safeBase) / 100
      : resolved.feeVal;
  const extra = resolved.extraFee;
  const rounded = {
    op: round2(op),
    fee: round2(fee),
    extra: round2(extra),
  };
  return {
    ...rounded,
    adicionales: round2(rounded.op + rounded.fee + rounded.extra),
    applied: audience !== "child" || resolved.hasAnyChildPolicy,
  };
};

const shouldApplyAdditionalToChildren = (additionalCfg) =>
  getChildAdditionalPolicy(additionalCfg, "applyOperationalCostsToChildren") ||
  getChildAdditionalPolicy(additionalCfg, "applyFeeToChildren") ||
  getChildAdditionalPolicy(additionalCfg, "applyExtraFeeToChildren");

const resolveUnifiedChildServicesPerPerson = ({
  explicitTotal = 0,
  convertedTotal = 0,
  childrenCount = 0,
  fallbackExplicitCount = 0,
  fallbackConvertedCount = 0,
}) => {
  const total = round2(n(explicitTotal) + n(convertedTotal));
  if (total <= 0) return 0;

  const denominator = Math.max(
    1,
    n(childrenCount) ||
      n(fallbackExplicitCount) ||
      n(fallbackConvertedCount) ||
      1,
  );

  return round2(total / denominator);
};

const pluralizePassengerLabel = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const buildCategoryRoomDisplayRows = ({
  row,
  roomPricing,
  selectedNightsCount,
  fallbackNonHotelsTotal = 0,
  fallbackAdditionalCfg = null,
  externalAdultTotal = 0,
  externalChildTotal = 0,
  externalConvertedChildTotal = 0,
  childrenCount = 0,
}) => {
  const cfg = row?.additionalCfg || fallbackAdditionalCfg;
  const nonHotelServices = n(row?.nonHotelsTotal ?? fallbackNonHotelsTotal);
  const externalUnifiedChildTotal = round2(
    Number(externalChildTotal || 0) + Number(externalConvertedChildTotal || 0),
  );
  const roomIgvPerPerson = getRoomIgvPerPerson(roomPricing, selectedNightsCount);
  const adultBeneficiaries = Math.max(
    0,
    Number(roomPricing?.adultBeneficiaries ?? roomPricing?.beneficiaries ?? 0),
  );
  const convertedChildBeneficiaries = Math.max(
    0,
    Number(roomPricing?.convertedChildBeneficiaries || 0),
  );
  const displayRows = [];

  if (adultBeneficiaries > 0) {
    displayRows.push({
      key: `${roomPricing?.key || "room"}-adult`,
      tone: "adult",
      icon: MdHotel,
      label: roomPricing?.label || "Habitación",
      paxLabel: pluralizePassengerLabel(adultBeneficiaries, "adulto"),
      total: round2(
        Number(roomPricing?.displayTotalPerPerson) > 0
          ? Number(roomPricing.displayTotalPerPerson)
          : Number(roomPricing?.totalPerPerson || 0) + Number(externalAdultTotal || 0),
      ),
      breakdown: [
        { label: "Servicios", value: nonHotelServices },
        {
          label: "Hotel",
          value: Math.max(
            0,
            round2(Number(roomPricing?.hotelPerPerson || 0) - roomIgvPerPerson),
          ),
        },
        ...(roomIgvPerPerson > 0
          ? [{ label: "IGV hotel", value: roomIgvPerPerson }]
          : []),
        ...(Number(roomPricing?.adicionales || 0) > 0
          ? [{ label: buildAdicLabel(cfg), value: Number(roomPricing?.adicionales || 0) }]
          : []),
        ...(Number(externalAdultTotal || 0) > 0
          ? [{ label: "Ext.", value: Number(externalAdultTotal || 0) }]
          : []),
      ],
    });
  }

  if (convertedChildBeneficiaries > 0) {
    const childHotelPerPerson = Number(
      roomPricing?.convertedChildHotelPerPerson || roomPricing?.hotelPerPerson || 0,
    );
    const explicitChildCount = Math.max(
      0,
      Number(row?.explicitChildrenCount || 0),
    );
    const convertedChildCount = Math.max(
      convertedChildBeneficiaries,
      Number(row?.convertedChildCount || 0),
    );
    const unifiedChildServices = resolveUnifiedChildServicesPerPerson({
      explicitTotal: row?.baseExplicitChildTotal,
      convertedTotal:
        row?.nonHotelConvertedChildTotal ?? row?.baseConvertedChildTotal,
      childrenCount,
      fallbackExplicitCount: explicitChildCount,
      fallbackConvertedCount: convertedChildCount,
    });
    const childBase = round2(
      Number(
        roomPricing?.convertedChildDisplayTotalPerPerson ||
          roomPricing?.convertedChildTotalPerPerson ||
          unifiedChildServices + childHotelPerPerson ||
          childHotelPerPerson ||
          0,
      ),
    );
    const childServicesValue = Math.max(
      0,
      round2(
        Number(roomPricing?.convertedChildServicePerPerson) > 0
          ? Number(roomPricing.convertedChildServicePerPerson)
          : childBase - childHotelPerPerson,
      ),
    );
    displayRows.push({
      key: `${roomPricing?.key || "room"}-child`,
      tone: "child",
      icon: FaChild,
      label: `Niños ${roomPricing?.label || "Habitación"}`,
      paxLabel: pluralizePassengerLabel(convertedChildBeneficiaries, "niño"),
      total: round2(
        childBase +
          Number(roomPricing?.convertedChildAdicionales || 0) +
          externalUnifiedChildTotal,
      ),
      breakdown: [
        { label: "Servicios", value: childServicesValue },
        {
          label: "Hotel",
          value: Math.max(0, round2(childHotelPerPerson - roomIgvPerPerson)),
        },
        ...(roomIgvPerPerson > 0
          ? [{ label: "IGV hotel", value: roomIgvPerPerson }]
          : []),
        {
          label: roomPricing?.convertedChildAdditionalApplied
            ? buildAdicLabel(cfg, "child")
            : "Adic. niños no aplicado",
          value: Number(roomPricing?.convertedChildAdicionales || 0),
        },
        ...(externalUnifiedChildTotal > 0
          ? [{ label: "Ext. niño", value: externalUnifiedChildTotal }]
          : []),
      ],
    });
  }

  return displayRows;
};

const buildModalChildPricingState = (existingConfig, adults, children) => {
  const baseConfig =
    existingConfig &&
    typeof existingConfig === "object" &&
    !Array.isArray(existingConfig)
      ? existingConfig
      : {};
  // Always build fresh IDs from the CURRENT cotización passenger counts
  const freshIds = buildHotelPassengerIds(adults, children);
  const savedIds = Array.isArray(baseConfig.assignedIds)
    ? baseConfig.assignedIds
    : Array.isArray(baseConfig.selectedIds)
      ? baseConfig.selectedIds
      : [];

  // Detect if passengers changed (added/removed adults or children)
  const freshAdultCount = freshIds.filter((id) =>
    id.startsWith("adult:"),
  ).length;
  const freshChildCount = freshIds.filter((id) =>
    id.startsWith("child:"),
  ).length;
  const savedAdultCount = savedIds.filter((id) =>
    id.startsWith("adult:"),
  ).length;
  const savedChildCount = savedIds.filter((id) =>
    id.startsWith("child:"),
  ).length;
  const passengersChanged =
    savedIds.length === 0 ||
    freshAdultCount !== savedAdultCount ||
    freshChildCount !== savedChildCount;

  // Detect if this is a truly "first time" with no child pricing configured
  // (no saved config at all, or no child pricing data saved)
  const isFirstTimeWithChildren =
    freshChildCount > 0 &&
    savedIds.length === 0 &&
    !existingConfig?.convertedChildToAdultMap &&
    !existingConfig?.assignedChildExplicitPriceMap &&
    !existingConfig?.preciosNinos &&
    !existingConfig?.ninosComoAdulto;

  const snapshot = getServiceBeneficiarySnapshot(
    {
      assignedPassengerIds: savedIds.length > 0 ? savedIds : freshIds,
      passengerSelection: baseConfig,
      assignedChildExplicitPriceMap:
        baseConfig.assignedChildExplicitPriceMap ?? baseConfig.preciosNinos,
      convertedChildToAdultMap:
        baseConfig.convertedChildToAdultMap ?? baseConfig.ninosComoAdulto,
    },
    baseConfig,
  );

  // If passenger counts changed, always use fresh IDs so the modal
  // reflects the current cotización; preserve child pricing settings
  // (converted map, explicit prices) for children that still exist.
  const assignedIds = passengersChanged
    ? freshIds
    : snapshot.selectedIds.length > 0
      ? snapshot.selectedIds
      : freshIds;

  // Re-map converted children: keep only those present in the new child set
  const freshChildIdSet = new Set(
    freshIds.filter((id) => id.startsWith("child:")),
  );
  const reconciledConvertedMap = {};

  if (isFirstTimeWithChildren) {
    // AUTO-CONVERT: When children are added for the first time with no prior
    // hotel config, treat ALL children as adults by default (not free).
    freshChildIdSet.forEach((childId) => {
      reconciledConvertedMap[childId] = true;
    });
  } else {
    snapshot.convertedChildIds.forEach((childId) => {
      if (freshChildIdSet.has(childId)) {
        reconciledConvertedMap[childId] = true;
      }
    });
  }

  // Re-map explicit child prices: keep only those present in the new child set.
  // For first-time children, prices will be resolved later from the adult rate
  // once rooms are configured (handled in the modal's perNightCost useMemo).
  const reconciledChildPriceMap = {};
  if (!isFirstTimeWithChildren) {
    Object.entries(snapshot.childPriceMap || {}).forEach(([childId, price]) => {
      if (freshChildIdSet.has(childId)) {
        reconciledChildPriceMap[childId] = price;
      }
    });
  }

  const assignedChildExplicitPriceSum = Object.values(
    reconciledChildPriceMap,
  ).reduce((sum, value) => sum + n(value), 0);

  // Determine effective pricingMode
  const effectivePricingMode = isFirstTimeWithChildren
    ? "adult"
    : snapshot.pricingState.pricingMode || baseConfig.pricingMode || "fixed";

  return {
    assignedIds,
    assignedChildExplicitPriceMap: reconciledChildPriceMap,
    assignedChildExplicitPriceSum,
    assignedChildExplicitCount: Object.keys(reconciledChildPriceMap).length,
    hasChildExplicitPrices: Object.keys(reconciledChildPriceMap).length > 0,
    convertedChildToAdultMap: reconciledConvertedMap,
    pricingMode: effectivePricingMode,
    uniformPercentage:
      snapshot.pricingState.uniformPercentage ||
      baseConfig.uniformPercentage ||
      "",
    treatChildrenAsAdults:
      isFirstTimeWithChildren ||
      snapshot.pricingState.treatChildrenAsAdults ||
      snapshot.convertedChildIds.length > 0,
  };
};

const buildInitialChildPricing = (
  existingConfig,
  adults,
  children,
  { defaultMissingChildrenAsFree = false } = {},
) => {
  const normalizedConfig =
    existingConfig &&
    typeof existingConfig === "object" &&
    !Array.isArray(existingConfig)
      ? existingConfig
      : {};

  return syncHotelChildPricingWithPeople(
    defaultMissingChildrenAsFree
      ? {
          ...normalizedConfig,
          defaultMissingChildrenAsFree: true,
        }
      : normalizedConfig,
    adults,
    children,
  );
};

const hasPersistedHotelSelection = (hotelConfig = {}) => {
  if (!hotelConfig || typeof hotelConfig !== "object") return false;

  return Boolean(
    n(hotelConfig.hotelTotal) > 0 ||
      n(hotelConfig.total) > 0 ||
      n(hotelConfig.perNightSum) > 0 ||
      (hotelConfig.mix && Object.keys(hotelConfig.mix || {}).length > 0) ||
      (hotelConfig.roomAssignments &&
        Object.keys(hotelConfig.roomAssignments || {}).length > 0) ||
      (Array.isArray(hotelConfig.selectedNightIndices) &&
        hotelConfig.selectedNightIndices.length > 0) ||
      (Array.isArray(hotelConfig.perRoomPricing) &&
        hotelConfig.perRoomPricing.length > 0) ||
      (Array.isArray(hotelConfig.breakdown) && hotelConfig.breakdown.length > 0)
  );
};

const shouldDefaultMissingHotelChildrenAsFree = (hotelConfig, childrenCount) =>
  Math.max(0, Number(childrenCount) || 0) > 0 &&
  hasPersistedHotelSelection(hotelConfig);

const buildInitialSelectedDays = (
  dayCount,
  hotelConfig,
  defaultNights,
  { preferStayNights = false } = {},
) => {
  const safeDayCount = Math.max(1, dayCount || defaultNights || 1);
  const explicit = Array.isArray(hotelConfig?.selectedNightIndices)
    ? hotelConfig.selectedNightIndices
        .map((value) => parseInt(value, 10))
        .filter(
          (value) =>
            Number.isInteger(value) && value >= 0 && value < safeDayCount,
        )
    : [];

  if (explicit.length > 0) {
    return [...new Set(explicit)].sort((a, b) => a - b);
  }

  if (preferStayNights && !hasPersistedHotelSelection(hotelConfig)) {
    const stayNightsCount = Math.max(0, safeDayCount - 1);
    return Array.from({ length: stayNightsCount }, (_, idx) => idx);
  }

  const fallbackCount = Math.min(
    safeDayCount,
    Math.max(1, Number(hotelConfig?.nights || defaultNights || 1)),
  );
  return Array.from({ length: fallbackCount }, (_, idx) => idx);
};

const buildChildPriceMapWithPreset = (
  childIds,
  adultPrice,
  priceType,
  customValue,
) => {
  const nextMap = {};
  let pricingMode = "fixed";
  let uniformPercentage = "";

  switch (priceType) {
    case "zero":
      childIds.forEach((childId) => {
        nextMap[childId] = 0;
      });
      break;
    case "adult":
      childIds.forEach((childId) => {
        nextMap[childId] = adultPrice;
      });
      pricingMode = "adult";
      break;
    case "percentage": {
      const percentage = parseFloat(customValue) || 50;
      const childPrice = (percentage / 100) * adultPrice;
      childIds.forEach((childId) => {
        nextMap[childId] = childPrice;
      });
      pricingMode = "percentage";
      uniformPercentage = percentage.toString();
      break;
    }
    case "fixed": {
      const fixedPrice = parseFloat(customValue) || 0;
      childIds.forEach((childId) => {
        nextMap[childId] = fixedPrice;
      });
      break;
    }
    default:
      break;
  }

  return { nextMap, pricingMode, uniformPercentage };
};

const HotelPricingModal = ({
  isOpen,
  onClose,
  cotizacion,
  roomOptionsByCategory,
  defaultNights = 1,
  additionalCfg,
  initialSelectedHotel,
  isNewCotizacion = false,
  adultCount: adultCountProp,
  childrenCount: childrenCountProp,
  peopleDetails: peopleDetailsProp,
  onSaveSelection,
  externalAdultTotal = 0,
  externalChildTotal = 0,
  externalConvertedChildTotal = 0,
  lockedHotelDayIndices = [],
}) => {
  const days = cotizacion?.itinerario || cotizacion?.dias || [];
  const dayCount = Math.max(1, days.length || defaultNights || 1);
  const availableDayOptions = Array.from({ length: dayCount }, (_, idx) => ({
    index: idx,
    label: `Día ${idx + 1}`,
  }));

  const lockedHotelDayIndexSet = useMemo(
    () =>
      new Set(
        (Array.isArray(lockedHotelDayIndices) ? lockedHotelDayIndices : [])
          .map((value) => parseInt(value, 10))
          .filter(
            (value) =>
              Number.isInteger(value) && value >= 0 && value < dayCount,
          ),
      ),
    [dayCount, lockedHotelDayIndices],
  );

  const storedRoomOptionsByCategory = useMemo(() => {
    const rows = Array.isArray(initialSelectedHotel?.allCategoryRows)
      ? initialSelectedHotel.allCategoryRows
      : [];

    return rows.reduce((accumulator, row) => {
      const category = normalizeCat(row?.category);
      if (
        !category ||
        !Array.isArray(row?.roomOptions) ||
        row.roomOptions.length === 0
      ) {
        return accumulator;
      }

      accumulator[category] = {
        hotelName: row.hotelName || "Hotel",
        id_hotel: row.id_hotel || null,
        ciudad: row.ciudad || row.city || null,
        roomOptions: row.roomOptions,
      };
      return accumulator;
    }, {});
  }, [initialSelectedHotel?.allCategoryRows]);

  const effectiveRoomOptionsByCategory = useMemo(() => {
    const merged = { ...storedRoomOptionsByCategory };
    Object.entries(roomOptionsByCategory || {}).forEach(([category, value]) => {
      const normalizedCategory = normalizeCat(category);
      if (
        normalizedCategory &&
        Array.isArray(value?.roomOptions) &&
        value.roomOptions.length > 0
      ) {
        merged[normalizedCategory] = value;
      }
    });
    return merged;
  }, [roomOptionsByCategory, storedRoomOptionsByCategory]);

  const availableCategories = useMemo(
    () =>
      sortHotelCategories(
        Object.entries(effectiveRoomOptionsByCategory || {})
          .filter(([, categoryData]) =>
            Array.isArray(categoryData?.roomOptions) &&
            categoryData.roomOptions.length > 0,
          )
          .map(([category]) => normalizeCat(category)),
      ),
    [effectiveRoomOptionsByCategory],
  );

  const packageType =
    initialSelectedHotel?.packageType ||
    cotizacion?.packageType ||
    "compartido";
  const fechaInicio =
    cotizacion?.fechainicio || cotizacion?.fechaInicio || null;
  const titulo = cotizacion?.titulo || "Cotización";
  const peopleCountSource =
    cotizacion?.peopleCount || cotizacion?.peoplecount || {};
  const peopleDetailsSource =
    peopleDetailsProp || cotizacion?.peopleDetails || cotizacion?.people_details || {};
  const peopleDetailsAdultCount = Array.isArray(peopleDetailsSource?.adults)
    ? peopleDetailsSource.adults.length
    : 0;
  const peopleDetailsChildrenCount = Array.isArray(peopleDetailsSource?.children)
    ? peopleDetailsSource.children.length
    : 0;
  const hotelAssignedChildCount = useMemo(() => {
    const ids = new Set();
    Object.values(initialSelectedHotel?.roomAssignments || {})
      .flat()
      .forEach((id) => {
        if (String(id).startsWith("child:")) ids.add(id);
      });
    Object.keys(
      initialSelectedHotel?.childPricing?.convertedChildToAdultMap || {},
    ).forEach((id) => {
      if (String(id).startsWith("child:")) ids.add(id);
    });
    return ids.size;
  }, [
    initialSelectedHotel?.childPricing?.convertedChildToAdultMap,
      initialSelectedHotel?.roomAssignments,
  ]);
  const childrenCount = Math.max(
    0,
    n(childrenCountProp),
    n(peopleCountSource.children),
    peopleDetailsChildrenCount,
    hotelAssignedChildCount,
  );
  const totalPaxFallback =
    n(cotizacion?.cantidadPersonas) || n(cotizacion?.cantidadpersonas);
  const explicitAdultCount =
    n(adultCountProp) ||
    n(peopleCountSource.adults) ||
    peopleDetailsAdultCount;
  const adultsCount = Math.max(
    1,
    explicitAdultCount ||
      (totalPaxFallback > 0
        ? Math.max(1, totalPaxFallback - childrenCount)
        : 1),
  );
  const peopleCount = { adults: adultsCount, children: childrenCount };
  const peruvianPassengerIds = useMemo(
    () =>
      buildPeruvianPassengerIdSet(peopleDetailsSource, {
        includeChildren: true,
      }),
    [peopleDetailsSource],
  );
  const nonHotelsTotal = n(cotizacion?.nonHotelsTotal);
  const totalSubtotalNinos = n(
    cotizacion?.subtotal_ninos || cotizacion?.subtotalNinos,
  );
  const currentHotelChildTotal = n(
    cotizacion?.hotelChildTotal || cotizacion?.hotel_child_total,
  );
  const baseSubtotalNinos = Math.max(
    0,
    totalSubtotalNinos - currentHotelChildTotal,
  );
  const nonHotelConvertedChildTotal = n(
    cotizacion?.nonHotelConvertedChildTotal ||
      cotizacion?.baseConvertedChildTotal,
  );
  const nonHotelExplicitChildTotal = Math.max(
    0,
    n(cotizacion?.nonHotelExplicitChildTotal) ||
      baseSubtotalNinos - nonHotelConvertedChildTotal,
  );

  const [selectedCat, setSelectedCat] = useState(null);
  const [selectedDayIndices, setSelectedDayIndices] = useState([]);
  const [roomMix, setRoomMix] = useState({});
  const [roomAssignments, setRoomAssignments] = useState({});
  const [draggedRoomPassengerId, setDraggedRoomPassengerId] = useState(null);

  const [dayGroups, setDayGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [showChildPanel, setShowChildPanel] = useState(false);
  const [childPricing, setChildPricing] = useState(
    buildInitialChildPricing(null, adultsCount, childrenCount),
  );
  const [priceOverrides, setPriceOverrides] = useState({});
  const [selectedHotelOptionByCategory, setSelectedHotelOptionByCategory] =
    useState({});
  const [hotelSearchTerm, setHotelSearchTerm] = useState("");
  const initSignatureRef = useRef("");
  const roomAssignmentsDirtyRef = useRef(false);
  const hasInitializedForThisOpenRef = useRef(false);
  const hasPersistedInitialHotel = hasPersistedHotelSelection(initialSelectedHotel);

  const getCategoryData = useCallback(
    (category, selectedOptionKey = null) => {
      const normalizedCategory = normalizeCat(category);
      const categoryData = normalizedCategory
        ? effectiveRoomOptionsByCategory?.[normalizedCategory] || {}
        : {};
      const hotelOption = resolveCategoryHotelOption(categoryData, {
        selectedKey:
          selectedOptionKey ??
          selectedHotelOptionByCategory?.[normalizedCategory],
        hotelConfig:
          normalizedCategory === normalizeCat(initialSelectedHotel?.category)
            ? initialSelectedHotel
            : null,
      });

      return {
        ...categoryData,
        ...(hotelOption || {}),
        roomOptions:
          hotelOption?.roomOptions || categoryData?.roomOptions || [],
        hotelOptions: categoryData?.hotelOptions || [],
        luxuryManual:
          categoryData?.luxuryManual === true ||
          hotelOption?.hasManualPrices === true,
      };
    },
    [
      effectiveRoomOptionsByCategory,
      initialSelectedHotel,
      selectedHotelOptionByCategory,
    ],
  );

  const activeGroup = useMemo(
    () => dayGroups.find((group) => group.id === activeGroupId) || null,
    [activeGroupId, dayGroups],
  );

  const activeGroupHasLockedHotelDays = useMemo(() => {
    const groupDays = Array.isArray(activeGroup?.dayIndices)
      ? activeGroup.dayIndices
      : selectedDayIndices;

    return groupDays.some((dayIndex) =>
      lockedHotelDayIndexSet.has(Number(dayIndex)),
    );
  }, [activeGroup?.dayIndices, lockedHotelDayIndexSet, selectedDayIndices]);

  const selectedCategoryData = selectedCat
    ? getCategoryData(selectedCat, activeGroup?.hotelOptionKey)
    : {};
  const selectedHotelOptionKey = getHotelOptionKey(selectedCategoryData);
  const visibleHotelOptions = useMemo(() => {
    const options = Array.isArray(selectedCategoryData?.hotelOptions)
      ? selectedCategoryData.hotelOptions
      : [];
    const search = normalizeRoomText(hotelSearchTerm);
    if (!search) return options;

    return options.filter((option) =>
      normalizeRoomText(
        `${option?.hotelName || ""} ${option?.ciudad || ""} ${option?.categoria || ""}`,
      ).includes(search),
    );
  }, [hotelSearchTerm, selectedCategoryData?.hotelOptions]);

  useEffect(() => {
    setHotelSearchTerm("");
  }, [selectedCat]);

  const baseRoomOptions = useMemo(
    () =>
      mergePersistedRoomOptionsWithCatalog(
        selectedCategoryData?.roomOptions || [],
        activeGroup?.roomOptions || [],
      ),
    [activeGroup?.roomOptions, selectedCategoryData?.roomOptions],
  );

  const selectedCategoryPriceOverrides = useMemo(() => {
    const normalizedCategory = normalizeCat(selectedCat);
    const groupOverrides = clonePriceOverrideMap(activeGroup?.priceOverrides);
    if (Object.keys(groupOverrides).length > 0) return groupOverrides;
    return normalizedCategory ? priceOverrides[normalizedCategory] || {} : {};
  }, [activeGroup?.priceOverrides, priceOverrides, selectedCat]);
  const selectedCategoryPriceOverridesKey = useMemo(
    () => stableStateKey(selectedCategoryPriceOverrides),
    [selectedCategoryPriceOverrides],
  );

  const selectedRoomOptions = useMemo(
    () =>
      applyRoomPriceOverridesToOptions(
        baseRoomOptions,
        selectedCategoryPriceOverrides,
      ),
    [baseRoomOptions, selectedCategoryPriceOverrides],
  );
  const selectedRoomOptionsKey = useMemo(
    () => stableStateKey(selectedRoomOptions),
    [selectedRoomOptions],
  );

  const handleRoomPriceChange = useCallback(
    (roomKey, rawValue) => {
      if (activeGroupHasLockedHotelDays) return;

      const normalizedCategory = normalizeCat(selectedCat);
      if (!normalizedCategory) return;

      const parsed = parseFloat(rawValue);
      const nextValue =
        rawValue === "" ? "" : Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;

      if (activeGroupId) {
        setDayGroups((prev) =>
          prev.map((group) =>
            group.id === activeGroupId
              ? {
                  ...group,
                  priceOverrides: {
                    ...(group.priceOverrides || {}),
                    [roomKey]: nextValue,
                  },
                }
              : group,
          ),
        );
        return;
      }

      setPriceOverrides((prev) => ({
        ...prev,
        [normalizedCategory]: {
          ...(prev[normalizedCategory] || {}),
          [roomKey]: nextValue,
        },
      }));
    },
    [activeGroupHasLockedHotelDays, activeGroupId, selectedCat],
  );

  useLayoutEffect(() => {
    if (!isOpen) {
      initSignatureRef.current = "";
      roomAssignmentsDirtyRef.current = false;
      hasInitializedForThisOpenRef.current = false;
      setSelectedHotelOptionByCategory({});
      return;
    }

    // Prevent re-initialization while the modal is already open.
    // External prop changes (e.g. from canonicalHotelConfigForCurrentPeople
    // recalculating in the Cost step) should not reset the user's edits.
    if (hasInitializedForThisOpenRef.current) return;

    const nextCategory = normalizeCat(initialSelectedHotel?.category);
    const safeCategory =
      availableCategories.length === 0 && nextCategory
        ? nextCategory
        : availableCategories.includes(nextCategory)
          ? nextCategory
          : null;
    const nextSelectedDays = [
      ...new Set([
        ...buildInitialSelectedDays(
          dayCount,
          initialSelectedHotel,
          defaultNights,
          {
            preferStayNights: isNewCotizacion && !hasPersistedInitialHotel,
          },
        ),
        ...lockedHotelDayIndexSet,
      ]),
    ].sort((a, b) => a - b);
    const initialCategoryData = safeCategory
      ? effectiveRoomOptionsByCategory?.[safeCategory] || {}
      : {};
    const initialHotelOption = safeCategory
      ? resolveCategoryHotelOption(initialCategoryData, {
          hotelConfig: initialSelectedHotel,
        })
      : null;
    const initialPersistedRoomOptions = Array.isArray(
      initialSelectedHotel?.roomOptions,
    )
      ? initialSelectedHotel.roomOptions
      : [];
    const initialDictionaryRoomOptions =
      initialHotelOption?.roomOptions || initialCategoryData?.roomOptions || [];
    const nextRoomOptions = safeCategory
      ? mergePersistedRoomOptionsWithCatalog(
          initialDictionaryRoomOptions,
          initialPersistedRoomOptions,
        )
      : [];
    if (nextCategory && nextRoomOptions.length === 0) {
      return;
    }

    const initSignature = JSON.stringify({
      adultsCount,
      childrenCount,
      isNewCotizacion,
      hasPersistedInitialHotel,
      category: safeCategory,
      hotelOptionKey: initialHotelOption
        ? getHotelOptionKey(initialHotelOption)
        : null,
      peopleDetails: {
        adults: peopleDetailsAdultCount,
        children: peopleDetailsChildrenCount,
      },
      days: nextSelectedDays,
      roomOptions: nextRoomOptions.map((option) => ({
        key: option.key,
        id_habitacion: option.id_habitacion || null,
        capacity: option.capacity || null,
        pricePerRoomNight: option.pricePerRoomNight || null,
      })),
      mix: initialSelectedHotel?.mix || null,
      roomAssignments: initialSelectedHotel?.roomAssignments || null,
      childPricing: initialSelectedHotel?.childPricing || null,
      dayGroups: Array.isArray(initialSelectedHotel?.dayGroups)
        ? initialSelectedHotel.dayGroups.map((group) => ({
            category: group?.category || null,
            dayIndices: group?.dayIndices || [],
            hotelOptionKey: group?.hotelOptionKey || group?.id_hotel || null,
            roomMix: group?.roomMix || null,
            roomAssignments: group?.roomAssignments || null,
            priceOverrides:
              group?.priceOverrides || group?.price_overrides || null,
          }))
        : null,
    });
    if (initSignatureRef.current === initSignature) return;
    initSignatureRef.current = initSignature;
    roomAssignmentsDirtyRef.current = false;

    const freshIds = buildHotelPassengerIds(adultsCount, childrenCount);
    const savedIds = Array.isArray(
      initialSelectedHotel?.childPricing?.assignedIds,
    )
      ? initialSelectedHotel.childPricing.assignedIds
      : Array.isArray(initialSelectedHotel?.childPricing?.selectedIds)
        ? initialSelectedHotel.childPricing.selectedIds
        : [];
    const freshAdultCount = freshIds.filter((id) =>
      id.startsWith("adult:"),
    ).length;
    const freshChildCount = freshIds.filter((id) =>
      id.startsWith("child:"),
    ).length;
    const savedAdultCount = savedIds.filter((id) =>
      id.startsWith("adult:"),
    ).length;
    const savedChildCount = savedIds.filter((id) =>
      id.startsWith("child:"),
    ).length;

    // Fix: Only treat as changed when actual pax counts differ.
    // savedIds.length===0 alone does NOT mean passengers changed.
    const passengersChanged =
      savedIds.length > 0 &&
      (freshAdultCount !== savedAdultCount ||
        freshChildCount !== savedChildCount);
    const hasSavedMix =
      initialSelectedHotel?.mix &&
      Object.keys(initialSelectedHotel.mix).length > 0;
    const shouldAutoRefreshRoomMix =
      (passengersChanged && !hasSavedMix) ||
      initialSelectedHotel?.roomMixNeedsAutoRefresh === true;

    const initialChildPricing = buildInitialChildPricing(
      initialSelectedHotel?.childPricing,
      adultsCount,
      childrenCount,
      {
        defaultMissingChildrenAsFree: shouldDefaultMissingHotelChildrenAsFree(
          initialSelectedHotel,
          childrenCount,
        ),
      },
    );
    const convertedCount = Object.keys(
      initialChildPricing.convertedChildToAdultMap || {},
    ).length;

    setSelectedHotelOptionByCategory(
      safeCategory && initialHotelOption
        ? { [safeCategory]: getHotelOptionKey(initialHotelOption) }
        : {},
    );
    setSelectedCat(safeCategory);
    setSelectedDayIndices(nextSelectedDays);

    let mainRoomMix = {};
    if (safeCategory) {
      if (shouldAutoRefreshRoomMix || !initialSelectedHotel?.mix) {
        mainRoomMix = autoMixWithConvertedChildren(
          nextRoomOptions,
          adultsCount,
          convertedCount,
        );
      } else {
        mainRoomMix = { ...(initialSelectedHotel?.mix || {}) };
      }
    }
    setRoomMix(mainRoomMix);

    const mainSavedRoomAssignments = pickInitialRoomAssignments({
      savedAssignments: initialSelectedHotel?.roomAssignments,
      days,
      dayIndices: nextSelectedDays,
      category: safeCategory,
    });
    const mainHasSavedRoomAssignments = hasRoomAssignmentPassengers(
      mainSavedRoomAssignments,
    );
    const assignedChildrenFromRooms = [
      ...new Set(
        Object.values(mainSavedRoomAssignments || {})
          .flat()
          .filter((id) => String(id).startsWith("child:")),
      ),
    ];
    const initialConvertedMap = {
      ...(initialChildPricing.convertedChildToAdultMap || {}),
    };
    const initialChildPriceMap = {
      ...(initialChildPricing.assignedChildExplicitPriceMap || {}),
    };
    assignedChildrenFromRooms.forEach((childId) => {
      if (initialConvertedMap[childId]) return;
      if (!Object.prototype.hasOwnProperty.call(initialChildPriceMap, childId)) {
        // A saved child inside a room without an adult-conversion marker is a
        // real child beneficiary. Keep the explicit zero rate used for
        // "Gratis" instead of silently turning it into an adult on reopen.
        initialChildPriceMap[childId] = 0;
      }
    });
    const initialConvertedCount = Object.values(initialConvertedMap).filter(
      Boolean,
    ).length;
    const effectiveInitialChildPricing = {
      ...initialChildPricing,
      assignedIds: [
        ...freshIds,
        ...assignedChildrenFromRooms,
      ].filter((id, index, array) => array.indexOf(id) === index),
      selectedIds: [
        ...freshIds,
        ...assignedChildrenFromRooms,
      ].filter((id, index, array) => array.indexOf(id) === index),
      assignedChildExplicitPriceMap: initialChildPriceMap,
      assignedChildExplicitPriceSum: Object.values(initialChildPriceMap).reduce(
        (sum, value) => sum + n(value),
        0,
      ),
      assignedChildExplicitCount: Object.keys(initialChildPriceMap).length,
      hasChildExplicitPrices: Object.keys(initialChildPriceMap).length > 0,
      convertedChildToAdultMap: initialConvertedMap,
      pricingMode:
        initialConvertedCount > 0
          ? initialChildPricing.pricingMode || "adult"
          : initialChildPricing.pricingMode === "adult"
            ? "fixed"
            : initialChildPricing.pricingMode || "fixed",
      treatChildrenAsAdults: initialConvertedCount > 0,
    };
    setChildPricing(effectiveInitialChildPricing);
    const initialAssignablePassengerIds = [
      ...freshIds.filter((id) => id.startsWith("adult:")),
      ...assignedChildrenFromRooms,
      ...Object.keys(
        effectiveInitialChildPricing.convertedChildToAdultMap || {},
      ).filter((id) => id.startsWith("child:")),
    ].filter((id, index, array) => array.indexOf(id) === index);
    setRoomAssignments(
      normalizeRoomAssignments(
        mainSavedRoomAssignments,
        buildRoomSlots(costFromMix(mainRoomMix, nextRoomOptions).breakdown),
        initialAssignablePassengerIds,
        { fillMissing: !mainHasSavedRoomAssignments },
      ),
    );

    setShowChildPanel(childrenCount > 0);
    const storedPriceOverrides = normalizeStoredPriceOverrides(
      initialSelectedHotel?.priceOverrides,
      safeCategory,
    );
    const basePriceOverrides =
      deriveBasePriceOverridesFromHotelConfig(initialSelectedHotel);
    const canonicalBasePriceOverrides =
      sanitizePersistedPriceOverridesAgainstRoomOptions(
        basePriceOverrides,
        nextRoomOptions,
      );
    const canonicalStoredCategoryOverrides = safeCategory
      ? sanitizePersistedPriceOverridesAgainstRoomOptions(
          storedPriceOverrides[safeCategory] || {},
          nextRoomOptions,
        )
      : {};
    const initialGroupPriceOverrides = safeCategory
      ? {
          ...canonicalBasePriceOverrides,
          ...canonicalStoredCategoryOverrides,
        }
      : {};
    setPriceOverrides(
      safeCategory
        ? {
            ...storedPriceOverrides,
            [safeCategory]: initialGroupPriceOverrides,
          }
        : storedPriceOverrides,
    );

    const savedGroups = initialSelectedHotel?.dayGroups;
    if (Array.isArray(savedGroups) && savedGroups.length > 0) {
      const restoredBase = enforceUniqueDayGroups(savedGroups.map((g) => {
        const groupCat = normalizeCat(g.category) || null;
        let groupMix = {};
        const groupCategoryData = groupCat
          ? effectiveRoomOptionsByCategory?.[groupCat] || {}
          : {};
        const groupHotelOption = groupCat
          ? resolveCategoryHotelOption(groupCategoryData, {
              selectedKey: g.hotelOptionKey || g.id_hotel,
              hotelConfig: g,
            })
          : null;
        const persistedGroupOptions = Array.isArray(g.roomOptions)
          ? g.roomOptions
          : [];
        const dictionaryGroupOptions =
          groupHotelOption?.roomOptions || groupCategoryData?.roomOptions || [];
        const groupOptions = mergePersistedRoomOptionsWithCatalog(
          dictionaryGroupOptions,
          persistedGroupOptions,
        );
        const rawGroupPriceOverrides = resolveGroupPriceOverrides(
          g,
          groupCat
            ? {
                ...(groupCat === safeCategory
                  ? canonicalBasePriceOverrides
                  : {}),
                ...sanitizePersistedPriceOverridesAgainstRoomOptions(
                  storedPriceOverrides[groupCat] || {},
                  groupOptions,
                ),
              }
            : {},
        );
        const groupPriceOverrides =
          sanitizePersistedPriceOverridesAgainstRoomOptions(
            rawGroupPriceOverrides,
            groupOptions,
          );
        const pricedGroupOptions = applyRoomPriceOverridesToOptions(
          groupOptions,
          groupPriceOverrides,
        );

        if (
          shouldAutoRefreshRoomMix ||
          (!g.roomMix && !initialSelectedHotel?.mix)
        ) {
          groupMix = autoMixWithConvertedChildren(
            pricedGroupOptions,
            adultsCount,
            convertedCount,
          );
        } else {
          groupMix =
            g.roomMix && Object.keys(g.roomMix).length > 0
              ? { ...g.roomMix }
              : initialSelectedHotel?.mix &&
                  Object.keys(initialSelectedHotel.mix).length > 0
                ? { ...initialSelectedHotel.mix }
                : {};
        }

        const groupSavedRoomAssignments = pickInitialRoomAssignments({
          savedAssignments:
            g.roomAssignments || initialSelectedHotel?.roomAssignments,
          days,
          dayIndices: Array.isArray(g.dayIndices)
            ? g.dayIndices
            : nextSelectedDays,
          category: groupCat || safeCategory,
        });
        const groupHasSavedRoomAssignments = hasRoomAssignmentPassengers(
          groupSavedRoomAssignments,
        );

        return {
          id: nextGroupId(),
          dayIndices: Array.isArray(g.dayIndices) ? [...g.dayIndices] : [],
          category: groupCat,
          hotelOptionKey: groupHotelOption
            ? getHotelOptionKey(groupHotelOption)
            : g.hotelOptionKey || null,
          hotelName: groupHotelOption?.hotelName || g.hotelName || null,
          id_hotel: groupHotelOption?.id_hotel || g.id_hotel || null,
          ciudad: groupHotelOption?.ciudad || g.ciudad || null,
          roomMix: groupMix,
          priceOverrides: groupPriceOverrides,
          roomOptions: pricedGroupOptions,
          roomAssignments: normalizeRoomAssignments(
            groupSavedRoomAssignments,
            buildRoomSlots(costFromMix(groupMix, pricedGroupOptions).breakdown),
            initialAssignablePassengerIds,
            { fillMissing: !groupHasSavedRoomAssignments },
          ),
        };
      }));
      const assignedLockedDays = new Set(
        restoredBase.flatMap((group) => group.dayIndices || []),
      );
      const missingLockedDays = [...lockedHotelDayIndexSet].filter(
        (dayIndex) => !assignedLockedDays.has(dayIndex),
      );
      const restored =
        missingLockedDays.length > 0 && restoredBase.length > 0
          ? restoredBase.map((group, index) =>
              index === 0
                ? {
                    ...group,
                    dayIndices: [
                      ...new Set([
                        ...(group.dayIndices || []),
                        ...missingLockedDays,
                      ]),
                    ].sort((a, b) => a - b),
                  }
                : group,
            )
          : restoredBase;
      setDayGroups(restored);
      setActiveGroupId(restored[0]?.id || null);
      if (restored[0]) {
        setSelectedCat(restored[0].category);
        setSelectedDayIndices(restored[0].dayIndices);
        setRoomMix(restored[0].roomMix);
        setRoomAssignments(restored[0].roomAssignments || {});
      }
    } else if (nextSelectedDays.length > 0) {
      const defaultId = nextGroupId();
      setDayGroups([
        {
          id: defaultId,
          dayIndices: nextSelectedDays,
          category: safeCategory,
          hotelOptionKey: initialHotelOption
            ? getHotelOptionKey(initialHotelOption)
            : null,
          hotelName: initialHotelOption?.hotelName || null,
          id_hotel: initialHotelOption?.id_hotel || null,
          ciudad: initialHotelOption?.ciudad || null,
          roomMix: { ...mainRoomMix },
          priceOverrides: initialGroupPriceOverrides,
          roomOptions: applyRoomPriceOverridesToOptions(
            nextRoomOptions,
            initialGroupPriceOverrides,
          ),
          roomAssignments: normalizeRoomAssignments(
            mainSavedRoomAssignments,
            buildRoomSlots(costFromMix(mainRoomMix, nextRoomOptions).breakdown),
            initialAssignablePassengerIds,
            { fillMissing: !mainHasSavedRoomAssignments },
          ),
        },
      ]);
      setActiveGroupId(defaultId);
    } else {
      setDayGroups([]);
      setActiveGroupId(null);
      setRoomAssignments({});
    }

    hasInitializedForThisOpenRef.current = true;
  }, [
    adultsCount,
    availableCategories,
    childrenCount,
    cotizacion?.hotelDetalle,
    cotizacion?.hotel_detalle,
    days,
    dayCount,
    defaultNights,
    initialSelectedHotel,
    isNewCotizacion,
    hasPersistedInitialHotel,
    isOpen,
    effectiveRoomOptionsByCategory,
    lockedHotelDayIndexSet,
  ]);

  const perNightCost = useMemo(
    () => costFromMix(roomMix, selectedRoomOptions),
    [roomMix, selectedRoomOptions],
  );
  const roomSlots = useMemo(
    () => buildRoomSlots(perNightCost.breakdown),
    [perNightCost.breakdown],
  );
  const roomSlotsKey = useMemo(() => stableStateKey(roomSlots), [roomSlots]);

  // Each group owns its own nights and room prices. Totals for the active group
  // must not use nights selected by other groups.
  const selectedNightsCount = Math.max(0, selectedDayIndices.length);
  const childPricingSnapshot = useMemo(
    () =>
      getServiceBeneficiarySnapshot(
        {
          assignedPassengerIds: childPricing.assignedIds || [],
          passengerSelection: childPricing,
          assignedChildExplicitPriceMap:
            childPricing.assignedChildExplicitPriceMap,
          convertedChildToAdultMap: childPricing.convertedChildToAdultMap,
        },
        childPricing,
      ),
    [childPricing],
  );
  const assignedIds =
    childPricingSnapshot.selectedIds.length > 0
      ? childPricingSnapshot.selectedIds
      : childPricing.assignedIds || [];
  const adultIds = childPricingSnapshot.adultIds;
  const allChildIds = childPricingSnapshot.allChildIds;
  const convertedChildIds = childPricingSnapshot.convertedChildIds;
  const childIds = childPricingSnapshot.childIds;
  const childPriceMap = childPricingSnapshot.childPriceMap;
  const convertedChildToAdultMap = convertedChildIds.reduce(
    (result, childId) => {
      result[childId] = true;
      return result;
    },
    {},
  );
  const adultEquivalentCount = Math.max(
    1,
    adultIds.length + convertedChildIds.length,
  );
  const assignedOptionalChildIds = useMemo(
    () =>
      [
        ...new Set(
          Object.values(roomAssignments || {})
            .flat()
            .filter(
              (id) =>
                String(id).startsWith("child:") &&
                !convertedChildToAdultMap[id],
            ),
        ),
      ],
    [convertedChildToAdultMap, roomAssignments],
  );
  const assignableHotelPassengerIds = useMemo(
    () =>
      [...adultIds, ...convertedChildIds, ...assignedOptionalChildIds].filter(
        (id, index, array) => array.indexOf(id) === index,
      ),
    [adultIds, assignedOptionalChildIds, convertedChildIds],
  );
  const assignableHotelPassengerIdsKey = useMemo(
    () => stableStateKey(assignableHotelPassengerIds),
    [assignableHotelPassengerIds],
  );
  const savedRoomAssignmentsForCurrentState = useMemo(
    () =>
      pickInitialRoomAssignments({
        savedAssignments: initialSelectedHotel?.roomAssignments,
        days,
        dayIndices: selectedDayIndices,
        category: selectedCat,
      }),
    [
      days,
      initialSelectedHotel?.roomAssignments,
      selectedCat,
      selectedDayIndices,
    ],
  );
  const savedRoomAssignmentsForCurrentStateKey = useMemo(
    () => stableStateKey(savedRoomAssignmentsForCurrentState),
    [savedRoomAssignmentsForCurrentState],
  );
  const savedAssignedChildIdsForCurrentState = useMemo(
    () =>
      [
        ...new Set(
          Object.values(savedRoomAssignmentsForCurrentState || {})
            .flat()
            .filter((id) => String(id).startsWith("child:")),
        ),
      ],
    [savedRoomAssignmentsForCurrentState],
  );
  const assignablePassengerIdsForSavedRooms = useMemo(
    () =>
      [
        ...assignableHotelPassengerIds,
        ...savedAssignedChildIdsForCurrentState,
      ].filter((id, index, array) => array.indexOf(id) === index),
    [assignableHotelPassengerIds, savedAssignedChildIdsForCurrentState],
  );
  const assignablePassengerIdsForSavedRoomsKey = useMemo(
    () => stableStateKey(assignablePassengerIdsForSavedRooms),
    [assignablePassengerIdsForSavedRooms],
  );
  const hasSavedRoomAssignmentsForCurrentState = useMemo(
    () => hasRoomAssignmentPassengers(savedRoomAssignmentsForCurrentState),
    [savedRoomAssignmentsForCurrentState],
  );
  const normalizedSavedRoomAssignments = useMemo(
    () =>
      normalizeRoomAssignments(
        savedRoomAssignmentsForCurrentState,
        roomSlots,
        assignablePassengerIdsForSavedRooms,
        { fillMissing: !hasSavedRoomAssignmentsForCurrentState },
      ),
    [
      assignablePassengerIdsForSavedRooms,
      hasSavedRoomAssignmentsForCurrentState,
      roomSlots,
      savedRoomAssignmentsForCurrentState,
    ],
  );
  const normalizedCurrentRoomAssignments = useMemo(
    () =>
      normalizeRoomAssignments(
        roomAssignments,
        roomSlots,
        assignableHotelPassengerIds,
        {
          fillMissing:
            !roomAssignmentsDirtyRef.current &&
            !hasSavedRoomAssignmentsForCurrentState,
        },
      ),
    [
      assignableHotelPassengerIds,
      hasSavedRoomAssignmentsForCurrentState,
      roomAssignments,
      roomSlots,
    ],
  );
  const displayRoomAssignments =
    !roomAssignmentsDirtyRef.current && hasSavedRoomAssignmentsForCurrentState
      ? normalizedSavedRoomAssignments
      : normalizedCurrentRoomAssignments;
  const roomMixKey = useMemo(() => stableStateKey(roomMix), [roomMix]);
  const displayRoomAssignmentsKey = useMemo(
    () => stableStateKey(displayRoomAssignments),
    [displayRoomAssignments],
  );
  const roomAssignmentSummary = useMemo(
    () =>
      summarizeRoomAssignments(
        roomSlots,
        displayRoomAssignments,
        adultIds,
        convertedChildIds,
      ),
    [
      adultIds,
      convertedChildIds,
      displayRoomAssignments,
      roomSlots,
    ],
  );
  const hotelPassengerLabelMap = useMemo(() => {
    const labels = {};
    const adults = Array.isArray(peopleDetailsSource?.adults)
      ? peopleDetailsSource.adults
      : [];
    const children = Array.isArray(peopleDetailsSource?.children)
      ? peopleDetailsSource.children
      : [];

    adultIds.forEach((id, index) => {
      labels[id] = getPassengerDisplayName(adults[index], `Adulto ${index + 1}`);
    });
    [...new Set([
      ...convertedChildIds,
      ...assignedOptionalChildIds,
      ...savedAssignedChildIdsForCurrentState,
      ...childIds,
    ])].forEach((id) => {
      const childIndex = Math.max(0, Number(String(id).split(":")[1] || 1) - 1);
      labels[id] = getPassengerDisplayName(
        children[childIndex],
        `Niño ${childIndex + 1}`,
      );
    });
    return labels;
  }, [
    adultIds,
    assignedOptionalChildIds,
    childIds,
    convertedChildIds,
    peopleDetailsSource,
    savedAssignedChildIdsForCurrentState,
  ]);
  const assignedRoomPassengerIds = useMemo(
    () =>
      new Set(
        Object.values(displayRoomAssignments || {})
          .flat()
          .filter(Boolean),
      ),
    [displayRoomAssignments],
  );
  const unassignedHotelPassengerIds = useMemo(
    () =>
      assignableHotelPassengerIds.filter(
        (id) => !assignedRoomPassengerIds.has(id),
      ),
    [assignableHotelPassengerIds, assignedRoomPassengerIds],
  );
  const hasUnassignedHotelPassengers = unassignedHotelPassengerIds.length > 0;

  useEffect(() => {
    if (!isOpen) return;
    setRoomAssignments((prev) => {
      const shouldFillMissing =
        !roomAssignmentsDirtyRef.current &&
        !hasSavedRoomAssignmentsForCurrentState;
      const next = normalizeRoomAssignments(
        prev,
        roomSlots,
        assignablePassengerIdsForSavedRooms,
        { fillMissing: shouldFillMissing },
      );
      return areRoomAssignmentsEqual(prev, next) ? prev : next;
    });
  }, [
    assignablePassengerIdsForSavedRoomsKey,
    hasSavedRoomAssignmentsForCurrentState,
    isOpen,
    roomSlotsKey,
  ]);

  const roomCapacityTotal = useMemo(
    () => roomSlots.reduce((sum, slot) => sum + Math.max(1, n(slot.capacity)), 0),
    [roomSlots],
  );

  useEffect(() => {
    if (!isOpen || !selectedCat || selectedRoomOptions.length === 0) return;
    if (Object.keys(roomMix || {}).length > 0) return;

    const nextMix =
      convertedChildIds.length > 0
        ? autoMixWithConvertedChildren(
            selectedRoomOptions,
            adultsCount,
            convertedChildIds.length,
          )
        : autoMixForPax(selectedRoomOptions, adultEquivalentCount);
    const nextSlots = buildRoomSlots(
      costFromMix(nextMix, selectedRoomOptions).breakdown,
    );
    const nextAssignments = normalizeRoomAssignments(
      hasSavedRoomAssignmentsForCurrentState
        ? savedRoomAssignmentsForCurrentState
        : {},
      nextSlots,
      hasSavedRoomAssignmentsForCurrentState
        ? assignablePassengerIdsForSavedRooms
        : assignableHotelPassengerIds,
      { fillMissing: !hasSavedRoomAssignmentsForCurrentState },
    );

    setRoomMix((prev) =>
      stableStateKey(prev) === stableStateKey(nextMix) ? prev : nextMix,
    );
    setRoomAssignments((prev) =>
      areRoomAssignmentsEqual(prev, nextAssignments) ? prev : nextAssignments,
    );
    if (activeGroupId) {
      setDayGroups((prev) => {
        let changed = false;
        const next = prev.map((group) => {
          if (group.id !== activeGroupId) return group;
          const sameCategory = group.category === selectedCat;
          const sameMix =
            stableStateKey(group.roomMix || {}) === stableStateKey(nextMix);
          const sameAssignments = areRoomAssignmentsEqual(
            group.roomAssignments || {},
            nextAssignments,
          );
          const sameRoomOptions =
            stableStateKey(group.roomOptions || []) === selectedRoomOptionsKey;
          if (sameCategory && sameMix && sameAssignments && sameRoomOptions) {
            return group;
          }
          changed = true;
          return {
            ...group,
            category: selectedCat,
            roomMix: nextMix,
            roomAssignments: nextAssignments,
            roomOptions: selectedRoomOptions,
          };
        });
        return changed ? next : prev;
      });
    }
  }, [
    activeGroupId,
    adultEquivalentCount,
    adultsCount,
    assignableHotelPassengerIdsKey,
    assignablePassengerIdsForSavedRoomsKey,
    convertedChildIds.length,
    hasSavedRoomAssignmentsForCurrentState,
    isOpen,
    roomMixKey,
    savedRoomAssignmentsForCurrentStateKey,
    selectedCat,
    selectedRoomOptions,
    selectedRoomOptionsKey,
  ]);

  const hotelPerAdultEquivalentPerNight = useMemo(
    () => round2(perNightCost.perNightSum / adultEquivalentCount),
    [adultEquivalentCount, perNightCost.perNightSum],
  );
  const hotelChildBreakdown = useMemo(
    () =>
      childIds.map((childId, idx) => {
        const isConvertedToAdult = Boolean(convertedChildToAdultMap[childId]);
        const basePerNight = isConvertedToAdult
          ? hotelPerAdultEquivalentPerNight
          : Number(childPriceMap[childId] || 0);
        const hasIgv =
          !isConvertedToAdult &&
          basePerNight > 0 &&
          peruvianPassengerIds.has(String(childId));
        const igvPerNight = hasIgv
          ? round2(basePerNight * HOTEL_IGV_RATE)
          : 0;
        const perNight = round2(basePerNight + igvPerNight);

        return {
          id: childId,
          label:
            hotelPassengerLabelMap[childId] || `Niño ${idx + 1}`,
          basePerNight,
          igvPerNight,
          perNight,
          baseTotal: round2(basePerNight * selectedNightsCount),
          igvTotal: round2(igvPerNight * selectedNightsCount),
          total: round2(perNight * selectedNightsCount),
          hasIgv,
          asAdult: isConvertedToAdult,
        };
      }),
    [
      childIds,
      childPriceMap,
      convertedChildToAdultMap,
      hotelPassengerLabelMap,
      hotelPerAdultEquivalentPerNight,
      peruvianPassengerIds,
      selectedNightsCount,
    ],
  );
  const childExtrasPerNight = useMemo(
    () =>
      hotelChildBreakdown.reduce(
        (sum, child) => (child.asAdult ? sum : sum + Number(child.perNight || 0)),
        0,
      ),
    [hotelChildBreakdown],
  );
  const chargedHotelChildren = useMemo(
    () =>
      hotelChildBreakdown.filter((child) => child.total > 0 || child.asAdult),
    [hotelChildBreakdown],
  );
  const hotelPerAdultPerNight = useMemo(
    () => hotelPerAdultEquivalentPerNight,
    [hotelPerAdultEquivalentPerNight],
  );
  const hotelPerChildPerNight = useMemo(
    () =>
      chargedHotelChildren.length > 0
        ? round2(
            chargedHotelChildren.reduce(
              (sum, child) => sum + child.perNight,
              0,
            ) / chargedHotelChildren.length,
          )
        : 0,
    [chargedHotelChildren],
  );
  const hotelGrandTotal = useMemo(
    () =>
      round2(
        perNightCost.perNightSum * selectedNightsCount +
          childExtrasPerNight * selectedNightsCount,
      ),
    [childExtrasPerNight, perNightCost.perNightSum, selectedNightsCount],
  );

  // Per-room-type pricing breakdown.
  // When multiple room types are selected (e.g., 1 Doble + 1 Simple for 3 pax),
  // each beneficiary's cost depends on which room they occupy.
  const perRoomPricing = useMemo(() => {
    if (roomSlots.length === 0 || selectedNightsCount === 0) return [];

    const sameTypeCounters = {};
    return roomSlots.flatMap((slot) => {
      const summary = roomAssignmentSummary[slot.id] || {};
      const passengerIds = summary.passengerIds || [];
      const adultPassengerIds = summary.adultPassengerIds || [];
      const convertedChildPassengerIds =
        summary.convertedChildPassengerIds || [];
      const adultBeneficiaries = Math.max(0, summary.adultBeneficiaries || 0);
      const convertedChildBeneficiaries = Math.max(
        0,
        summary.convertedChildBeneficiaries || 0,
      );
      const beneficiaries = adultBeneficiaries + convertedChildBeneficiaries;
      if (beneficiaries <= 0) return [];

      const hasRoomIgv = passengerIds.some((id) =>
        peruvianPassengerIds.has(String(id)),
      );
      sameTypeCounters[slot.key] = (sameTypeCounters[slot.key] || 0) + 1;
      const roomIndex = sameTypeCounters[slot.key];
      const sameTypeCount = roomSlots.filter(
        (item) => item.key === slot.key,
      ).length;
      const baseLabel = slot.baseLabel || slot.label;
      const displayLabel =
        sameTypeCount > 1 ? `${baseLabel} ${roomIndex}` : baseLabel;
      const roomBaseUnit = round2(slot.unit);
      const roomIgvAmount = hasRoomIgv
        ? round2(roomBaseUnit * HOTEL_IGV_RATE)
        : 0;
      const roomUnitWithIgv = round2(roomBaseUnit + roomIgvAmount);
      const hotelTotalSlot = round2(roomUnitWithIgv * selectedNightsCount);
      const hotelPerPerson = round2(
        hotelTotalSlot / Math.max(1, beneficiaries),
      );
      const base = round2(nonHotelsTotal + hotelPerPerson);
      const { adicionales } = computeAdicionales(additionalCfg, base);
      const totalPerPerson = round2(base + adicionales);
      const displayTotalPerPerson = round2(totalPerPerson + externalAdultTotal);
      const unifiedChildServicesPerPerson =
        resolveUnifiedChildServicesPerPerson({
          explicitTotal: nonHotelExplicitChildTotal,
          convertedTotal: nonHotelConvertedChildTotal,
          childrenCount,
          fallbackExplicitCount: childIds.length,
          fallbackConvertedCount: convertedChildIds.length,
        });
      const convertedChildBase = round2(
        unifiedChildServicesPerPerson + hotelPerPerson,
      );
      const convertedChildAdditional =
        convertedChildBeneficiaries > 0
          ? computeAdicionales(additionalCfg, convertedChildBase, "child")
          : { adicionales: 0, applied: false };
      const convertedChildAdicionales = convertedChildAdditional.adicionales;
      const roomDetails = [
        {
          roomId: slot.id,
          label: displayLabel,
          capacity: slot.capacity,
          passengerIds,
          adultPassengerIds,
          convertedChildPassengerIds,
          hasIgv: hasRoomIgv,
          tieneIgv: hasRoomIgv,
          igvRate: hasRoomIgv ? 18 : 0,
          igvAmount: roomIgvAmount,
          roomBaseUnit,
          unit: roomUnitWithIgv,
          unitWithIgv: roomUnitWithIgv,
          baseUnit: roomBaseUnit,
          hotelTotalRoom: hotelTotalSlot,
        },
      ];

      return [
        {
          key: `${slot.key}:${roomIndex}`,
          roomKey: slot.key,
          sourceRoomKey: slot.key,
          label: displayLabel,
          baseLabel,
          capacity: Math.max(1, slot.capacity || 1),
          roomCount: 1,
          beneficiaries,
          adultBeneficiaries,
          convertedChildBeneficiaries,
          passengerIds: [...new Set(passengerIds)],
          adultPassengerIds: [...new Set(adultPassengerIds)],
          convertedChildPassengerIds: [...new Set(convertedChildPassengerIds)],
          beneficiarios_adulto: buildAdultBeneficiariosPayload([
            ...new Set([
              ...adultPassengerIds,
              ...convertedChildPassengerIds,
            ]),
          ]),
          roomDetails,
          hotelPerNight: roomUnitWithIgv,
          hotelTotalRoom: hotelTotalSlot,
          hotelPerPerson,
          hasIgv: hasRoomIgv,
          tieneIgv: hasRoomIgv,
          igvRate: hasRoomIgv ? 18 : 0,
          igvPerPerson: round2(
            (roomIgvAmount * selectedNightsCount) /
              Math.max(1, beneficiaries),
          ),
          convertedChildHotelPerPerson: hotelPerPerson,
          convertedChildTotalPerPerson:
            convertedChildBeneficiaries > 0
              ? convertedChildBase
              : 0,
          convertedChildDisplayTotalPerPerson:
            convertedChildBeneficiaries > 0
              ? convertedChildBase
              : 0,
          convertedChildBasePerPerson: convertedChildBase,
          convertedChildServicePerPerson: unifiedChildServicesPerPerson,
          convertedChildAdicionales: round2(convertedChildAdicionales),
          convertedChildAdditionalApplied: convertedChildAdditional.applied,
          base,
          adicionales: round2(adicionales),
          totalPerPerson,
          displayTotalPerPerson,
        },
      ];
    });
  }, [
    additionalCfg,
    childIds.length,
    childrenCount,
    convertedChildIds.length,
    externalAdultTotal,
    externalConvertedChildTotal,
    nonHotelsTotal,
    nonHotelConvertedChildTotal,
    nonHotelExplicitChildTotal,
    roomAssignmentSummary,
    roomSlots,
    selectedNightsCount,
    peruvianPassengerIds,
  ]);

  const hotelPassengerPricingRows = useMemo(() => {
    const rows = [];
    const roomPassengerIds = new Set();

    perRoomPricing.forEach((room) => {
      const roomIgvPerPerson = round2(room?.igvPerPerson || 0);
      const roomTotalPerPerson = round2(room?.hotelPerPerson || 0);
      const roomBasePerPerson = round2(
        Math.max(0, roomTotalPerPerson - roomIgvPerPerson),
      );
      const chargedPassengerIds = [
        ...(room?.adultPassengerIds || []),
        ...(room?.convertedChildPassengerIds || []),
      ];

      chargedPassengerIds.forEach((passengerId) => {
        roomPassengerIds.add(passengerId);
        const isChild = String(passengerId).startsWith("child:");
        const isNational = peruvianPassengerIds.has(String(passengerId));
        rows.push({
          id: `${room?.key || room?.label}:${passengerId}`,
          passengerId,
          passenger: hotelPassengerLabelMap[passengerId] || passengerId,
          passengerType: isChild ? "Niño · tarifa adulto" : "Adulto",
          nationality: isNational ? "Nacional" : "Extranjero",
          room: room?.label || "Habitación",
          base: roomBasePerPerson,
          igv: roomIgvPerPerson,
          total: roomTotalPerPerson,
          roomHasIgv: Boolean(room?.hasIgv || room?.tieneIgv),
        });
      });
    });

    hotelChildBreakdown.forEach((child) => {
      if (child?.asAdult || roomPassengerIds.has(child?.id)) return;
      const isNational = peruvianPassengerIds.has(String(child?.id));
      rows.push({
        id: `child-price:${child?.id}`,
        passengerId: child?.id,
        passenger: hotelPassengerLabelMap[child?.id] || child?.label,
        passengerType: "Niño · tarifa propia",
        nationality: isNational ? "Nacional" : "Extranjero",
        room: "Tarifa infantil",
        base: round2(child?.baseTotal ?? child?.total ?? 0),
        igv: round2(child?.igvTotal || 0),
        total: round2(child?.total || 0),
        roomHasIgv: Boolean(child?.hasIgv),
      });
    });

    return rows;
  }, [
    hotelChildBreakdown,
    hotelPassengerLabelMap,
    perRoomPricing,
    peruvianPassengerIds,
  ]);

  const buildPerRoomPricingForGroup = useCallback(
    (group = {}, groupIndex = 0) => {
      const category = normalizeCat(group?.category || selectedCat);
      const dayIndices = normalizeGroupDayIndices(group?.dayIndices);
      const nightsCount = Math.max(0, dayIndices.length);
      if (!category || nightsCount <= 0) return [];

      const groupData = getCategoryData(category, group?.hotelOptionKey);
      const rawGroupOptions = Array.isArray(group?.roomOptions)
        ? group.roomOptions
        : groupData?.roomOptions || [];
      const groupOverrides =
        Object.keys(clonePriceOverrideMap(group?.priceOverrides)).length > 0
          ? clonePriceOverrideMap(group?.priceOverrides)
          : priceOverrides?.[category] || {};
      const groupRoomOptions = applyRoomPriceOverridesToOptions(
        rawGroupOptions,
        groupOverrides,
      );
      const groupCost = costFromMix(group?.roomMix || {}, groupRoomOptions);
      const groupRoomSlots = buildRoomSlots(groupCost.breakdown);
      if (groupRoomSlots.length === 0) return [];

      const groupAssignments = normalizeRoomAssignments(
        group?.roomAssignments || {},
        groupRoomSlots,
        assignableHotelPassengerIds,
        { fillMissing: !hasRoomAssignmentPassengers(group?.roomAssignments) },
      );
      const groupSummary = summarizeRoomAssignments(
        groupRoomSlots,
        groupAssignments,
        adultIds,
        convertedChildIds,
      );
      const sameTypeCounters = {};
      const groupLabel = group?.label || `Grupo ${groupIndex + 1}`;
      const groupKey = group?.id || `${category || "hotel"}-${dayIndices.join("-")}`;
      const groupHotelName =
        group?.hotelName || groupData?.hotelName || selectedCategoryData?.hotelName || "Hotel";
      const groupCity =
        group?.ciudad || group?.city || groupData?.ciudad || groupData?.city || null;
      const unifiedChildServicesPerPerson = resolveUnifiedChildServicesPerPerson({
        explicitTotal: nonHotelExplicitChildTotal,
        convertedTotal: nonHotelConvertedChildTotal,
        childrenCount,
        fallbackExplicitCount: childIds.length,
        fallbackConvertedCount: convertedChildIds.length,
      });

      return groupRoomSlots.flatMap((slot) => {
        const summary = groupSummary[slot.id] || {};
        const passengerIds = summary.passengerIds || [];
        const adultPassengerIds = summary.adultPassengerIds || [];
        const convertedChildPassengerIds =
          summary.convertedChildPassengerIds || [];
        const adultBeneficiaries = Math.max(0, summary.adultBeneficiaries || 0);
        const convertedChildBeneficiaries = Math.max(
          0,
          summary.convertedChildBeneficiaries || 0,
        );
        const beneficiaries = adultBeneficiaries + convertedChildBeneficiaries;
        if (beneficiaries <= 0) return [];

        const hasRoomIgv = passengerIds.some((id) =>
          peruvianPassengerIds.has(String(id)),
        );
        sameTypeCounters[slot.key] = (sameTypeCounters[slot.key] || 0) + 1;
        const roomIndex = sameTypeCounters[slot.key];
        const sameTypeCount = groupRoomSlots.filter(
          (item) => item.key === slot.key,
        ).length;
        const baseLabel = slot.baseLabel || slot.label;
        const displayLabel =
          sameTypeCount > 1 ? `${baseLabel} ${roomIndex}` : baseLabel;
        const roomBaseUnit = round2(slot.unit);
        const roomIgvAmount = hasRoomIgv
          ? round2(roomBaseUnit * HOTEL_IGV_RATE)
          : 0;
        const roomUnitWithIgv = round2(roomBaseUnit + roomIgvAmount);
        const hotelTotalSlot = round2(roomUnitWithIgv * nightsCount);
        const hotelPerPerson = round2(
          hotelTotalSlot / Math.max(1, beneficiaries),
        );
        const base = round2(nonHotelsTotal + hotelPerPerson);
        const { adicionales } = computeAdicionales(additionalCfg, base);
        const totalPerPerson = round2(base + adicionales);
        const displayTotalPerPerson = round2(totalPerPerson + externalAdultTotal);
        const convertedChildBase = round2(
          unifiedChildServicesPerPerson + hotelPerPerson,
        );
        const convertedChildAdditional =
          convertedChildBeneficiaries > 0
            ? computeAdicionales(additionalCfg, convertedChildBase, "child")
            : { adicionales: 0, applied: false };
        const convertedChildAdicionales = convertedChildAdditional.adicionales;
        const roomDetails = [
          {
            roomId: slot.id,
            label: displayLabel,
            capacity: slot.capacity,
            passengerIds,
            adultPassengerIds,
            convertedChildPassengerIds,
            hasIgv: hasRoomIgv,
            tieneIgv: hasRoomIgv,
            igvRate: hasRoomIgv ? 18 : 0,
            igvAmount: roomIgvAmount,
            roomBaseUnit,
            unit: roomUnitWithIgv,
            unitWithIgv: roomUnitWithIgv,
            baseUnit: roomBaseUnit,
            hotelTotalRoom: hotelTotalSlot,
          },
        ];

        return [
          {
            key: `${groupKey}:${slot.key}:${roomIndex}`,
            roomKey: slot.key,
            sourceRoomKey: slot.key,
            label: displayLabel,
            baseLabel,
            capacity: Math.max(1, slot.capacity || 1),
            roomCount: 1,
            beneficiaries,
            adultBeneficiaries,
            convertedChildBeneficiaries,
            passengerIds: [...new Set(passengerIds)],
            adultPassengerIds: [...new Set(adultPassengerIds)],
            convertedChildPassengerIds: [...new Set(convertedChildPassengerIds)],
            beneficiarios_adulto: buildAdultBeneficiariosPayload([
              ...new Set([
                ...adultPassengerIds,
                ...convertedChildPassengerIds,
              ]),
            ]),
            roomDetails,
            hotelPerNight: roomUnitWithIgv,
            hotelTotalRoom: hotelTotalSlot,
            hotelPerPerson,
            hasIgv: hasRoomIgv,
            tieneIgv: hasRoomIgv,
            igvRate: hasRoomIgv ? 18 : 0,
            igvPerPerson: round2(
              (roomIgvAmount * nightsCount) / Math.max(1, beneficiaries),
            ),
            convertedChildHotelPerPerson: hotelPerPerson,
            convertedChildTotalPerPerson:
              convertedChildBeneficiaries > 0 ? convertedChildBase : 0,
            convertedChildDisplayTotalPerPerson:
              convertedChildBeneficiaries > 0 ? convertedChildBase : 0,
            convertedChildBasePerPerson: convertedChildBase,
            convertedChildServicePerPerson: unifiedChildServicesPerPerson,
            convertedChildAdicionales: round2(convertedChildAdicionales),
            convertedChildAdditionalApplied: convertedChildAdditional.applied,
            base,
            adicionales: round2(adicionales),
            totalPerPerson,
            displayTotalPerPerson,
            groupId: groupKey,
            groupKey,
            groupLabel,
            groupCategory: category,
            groupDayIndices: dayIndices,
            hotelName: groupHotelName,
            ciudad: groupCity,
          },
        ];
      });
    },
    [
      additionalCfg,
      adultIds,
      assignableHotelPassengerIds,
      childIds.length,
      childrenCount,
      convertedChildIds,
      externalAdultTotal,
      getCategoryData,
      nonHotelConvertedChildTotal,
      nonHotelExplicitChildTotal,
      nonHotelsTotal,
      peruvianPassengerIds,
      priceOverrides,
      selectedCat,
      selectedCategoryData,
    ],
  );

  const selectedRow = useMemo(() => {
    if (
      !selectedCat ||
      !selectedRoomOptions.length ||
      selectedNightsCount === 0
    ) {
      return null;
    }

    const rawHotelTotal = round2(
      perNightCost.perNightSum * selectedNightsCount,
    );
    const hasRoomTypePricing = perRoomPricing.length > 0;
    const resolvedHotelTotal = hasRoomTypePricing
      ? round2(
          perRoomPricing.reduce((sum, room) => sum + n(room.hotelTotalRoom), 0),
        )
      : rawHotelTotal;
    const resolvedPerNightSum = round2(
      resolvedHotelTotal / Math.max(1, selectedNightsCount),
    );
    const hotelPerAdult = round2(resolvedHotelTotal / adultEquivalentCount);
    const basePerAdult = round2(nonHotelsTotal + hotelPerAdult);
    const { adicionales } = computeAdicionales(additionalCfg, basePerAdult);
    const totalPerAdult = round2(
      basePerAdult + adicionales + externalAdultTotal,
    );
    const childExtrasTotalStay = round2(
      childExtrasPerNight * selectedNightsCount,
    );
    const convertedChildHotelTotalStay = round2(
      hotelPerAdult * convertedChildIds.length,
    );
    const adultFinalPortion = hasRoomTypePricing
      ? perRoomPricing.reduce(
          (sum, r) =>
            sum +
            (r.displayTotalPerPerson ??
              round2((r.totalPerPerson || 0) + externalAdultTotal)) *
              Math.max(0, r.adultBeneficiaries ?? r.beneficiaries ?? 0),
          0,
        )
      : totalPerAdult * adultsCount;
    const convertedChildHotelPortion = hasRoomTypePricing
      ? perRoomPricing.reduce(
          (sum, r) =>
            sum +
            (r.convertedChildHotelPerPerson || r.hotelPerPerson || 0) *
              Math.max(0, r.convertedChildBeneficiaries || 0),
          0,
        )
      : convertedChildHotelTotalStay;

    const explicitChildrenCount = Math.max(0, childIds.length);
    const totalFinalAll = round2(
      adultFinalPortion +
        baseSubtotalNinos +
        childExtrasTotalStay +
        convertedChildHotelPortion +
        externalChildTotal * explicitChildrenCount,
    );
    const totalPerChild =
      explicitChildrenCount > 0
        ? round2(
            (nonHotelExplicitChildTotal + childExtrasTotalStay) /
              explicitChildrenCount,
          ) + externalChildTotal
        : 0;
    const explicitChildPriceMap = hotelChildBreakdown.reduce(
      (accumulator, child) => {
        if (!child.asAdult) {
          accumulator[child.id] = child.perNight;
        }

        return accumulator;
      },
      {},
    );

    return {
      category: selectedCat,
      label: getCategoryLabel(selectedCat, selectedCategoryData),
      hotelName: selectedCategoryData?.hotelName || "Hotel",
      id_hotel: selectedCategoryData?.id_hotel || null,
      ciudad: selectedCategoryData?.ciudad || selectedCategoryData?.city || null,
      luxuryManual:
        selectedCategoryData?.luxuryManual === true,
      nights: selectedNightsCount,
      selectedNightIndices: [...selectedDayIndices],
      mix: { ...roomMix },
      roomAssignments: { ...displayRoomAssignments },
      roomAssignmentSummary,
      roomOptions: selectedRoomOptions,
      perNightSum: resolvedPerNightSum,
      roomsCount: perNightCost.roomsCount,
      hotelTotal: resolvedHotelTotal,
      hotelPerAdult,
      adultEquivalentCount,
      basePerAdult,
      adicionales,
      totalPerAdult,
      totalPerChild,
      totalFinalAll,
      hotelChildTotal: childExtrasTotalStay,
      hotelConvertedChildTotal: convertedChildHotelPortion,
      breakdown: perNightCost.breakdown,
      perRoomPricing,
      peruvianPassengerIds: Array.from(peruvianPassengerIds),
      priceOverrides: { ...selectedCategoryPriceOverrides },
      nonHotelsTotal,
      additionalCfg,
      baseSubtotalNinos,
      baseExplicitChildTotal: nonHotelExplicitChildTotal,
      baseConvertedChildTotal: nonHotelConvertedChildTotal,
      nonHotelConvertedChildTotal,
      explicitChildrenCount,
      convertedChildCount: convertedChildIds.length,
      childPricing: {
        ...childPricing,
        assignedIds: [...assignedIds],
        assignedChildExplicitPriceMap: explicitChildPriceMap,
        assignedChildExplicitPriceSum: childExtrasPerNight,
        hasChildExplicitPrices: Object.keys(explicitChildPriceMap).length > 0,
        assignedChildExplicitCount: Object.keys(explicitChildPriceMap).length,
        convertedChildToAdultMap: { ...convertedChildToAdultMap },
      },
      childExtrasTotalStay,
      convertedChildHotelTotalStay: convertedChildHotelPortion,
    };
  }, [
    additionalCfg,
    perRoomPricing,
    displayRoomAssignments,
    roomAssignmentSummary,
    adultEquivalentCount,
    adultsCount,
    assignedIds,
    baseSubtotalNinos,
    childExtrasPerNight,
    childPricing,
    childIds.length,
    convertedChildToAdultMap,
    convertedChildIds.length,
    hotelChildBreakdown,
    nonHotelsTotal,
    nonHotelConvertedChildTotal,
    nonHotelExplicitChildTotal,
    perNightCost,
    peruvianPassengerIds,
    roomMix,
    selectedCategoryData,
    selectedCategoryPriceOverrides,
    selectedCat,
    selectedDayIndices,
    selectedNightsCount,
    selectedRoomOptions,
    externalAdultTotal,
    externalChildTotal,
  ]);

  const categoryRows = useMemo(() => {
    const effectiveNights = Math.max(
      1,
      selectedNightsCount || defaultNights || 1,
    );

    return availableCategories
      .map((category) => {
        if (category === selectedCat && selectedRow) {
          return {
            ...selectedRow,
            category,
            label: getCategoryLabel(category, selectedCategoryData),
            hotelName:
              selectedCategoryData?.hotelName ||
              selectedRow.hotelName ||
              "Hotel",
            id_hotel: selectedCategoryData?.id_hotel || selectedRow.id_hotel || null,
            ciudad: selectedCategoryData?.ciudad || selectedRow.ciudad || null,
            roomOptions: selectedRoomOptions,
            priceOverrides: { ...selectedCategoryPriceOverrides },
            isSelected: true,
          };
        }

        const rowCategoryData = getCategoryData(category);
        const baseRoomOptions = rowCategoryData?.roomOptions || [];
        if (!baseRoomOptions.length) return null;

        const categoryPriceOverrides =
          priceOverrides[normalizeCat(category)] || {};
        const roomOptions = applyRoomPriceOverridesToOptions(
          baseRoomOptions,
          categoryPriceOverrides,
        );

        const transferredMix = transferRoomMixToOptions(
          roomMix,
          selectedRoomOptions,
          roomOptions,
        );
        const mix =
          Object.keys(transferredMix).length > 0
            ? transferredMix
            : convertedChildIds.length > 0
              ? autoMixWithConvertedChildren(
                  roomOptions,
                  adultsCount,
                  convertedChildIds.length,
                )
              : autoMixForPax(roomOptions, adultEquivalentCount);
        const cost = costFromMix(mix, roomOptions);
        const hotelTotal = round2(cost.perNightSum * effectiveNights);
        const hotelPerAdult = round2(hotelTotal / adultEquivalentCount);
        const convertedChildHotelTotalStay = round2(
          hotelPerAdult * convertedChildIds.length,
        );
        const basePerAdult = round2(nonHotelsTotal + hotelPerAdult);
        const { adicionales } = computeAdicionales(additionalCfg, basePerAdult);
        const totalPerAdult = round2(
          basePerAdult + adicionales + externalAdultTotal,
        );
        const explicitChildrenCount = Math.max(0, childIds.length);
        const totalFinalAll = round2(
          totalPerAdult * adultsCount +
            baseSubtotalNinos +
            convertedChildHotelTotalStay +
            externalChildTotal * explicitChildrenCount,
        );
        const totalPerChild =
          explicitChildrenCount > 0
            ? round2(nonHotelExplicitChildTotal / explicitChildrenCount) +
              externalChildTotal
            : 0;

        return {
          category,
          label: getCategoryLabel(category, rowCategoryData),
          hotelName: rowCategoryData?.hotelName || "Hotel",
          id_hotel: rowCategoryData?.id_hotel || null,
          ciudad: rowCategoryData?.ciudad || rowCategoryData?.city || null,
          luxuryManual: rowCategoryData?.luxuryManual === true,
          totalPerAdult,
          totalPerChild,
          totalFinalAll,
          perNightSum: round2(cost.perNightSum),
          roomsCount: cost.roomsCount,
          hotelTotal,
          hotelPerAdult,
          adultEquivalentCount,
          basePerAdult,
          adicionales,
          hotelChildTotal: 0,
          hotelConvertedChildTotal: convertedChildHotelTotalStay,
          roomOptions,
          mix,
          priceOverrides: { ...categoryPriceOverrides },
          nonHotelsTotal,
          additionalCfg,
          baseSubtotalNinos,
          baseExplicitChildTotal: nonHotelExplicitChildTotal,
          baseConvertedChildTotal: nonHotelConvertedChildTotal,
          nonHotelConvertedChildTotal,
          explicitChildrenCount,
          convertedChildCount: convertedChildIds.length,
          breakdown: cost.breakdown,
          isSelected: false,
        };
      })
      .filter(Boolean);
  }, [
    additionalCfg,
    adultEquivalentCount,
    adultsCount,
    availableCategories,
    baseSubtotalNinos,
    childExtrasPerNight,
    childIds.length,
    convertedChildIds.length,
    defaultNights,
    externalAdultTotal,
    externalChildTotal,
    nonHotelsTotal,
    nonHotelConvertedChildTotal,
    nonHotelExplicitChildTotal,
    priceOverrides,
    getCategoryData,
    roomMix,
    selectedCategoryPriceOverrides,
    selectedCategoryData,
    selectedCat,
    selectedNightsCount,
    selectedRow,
    selectedRoomOptions,
  ]);

  const getCategoryRoomFinalRows = useCallback(
    (row, refPerRoomPricing = null) => {
      if (Array.isArray(row?.perRoomPricing) && row.perRoomPricing.length > 0) {
        return row.perRoomPricing;
      }

      const activeRooms = (row?.breakdown || []).filter((room) => room.cnt > 0);
      if (activeRooms.length === 0) return [];

      let remainingPax = Math.max(
        1,
        n(row?.adultEquivalentCount) || adultEquivalentCount,
      );
      let remainingAdults = Math.max(0, n(adultsCount));
      let remainingConverted = Math.max(0, n(row?.convertedChildCount));
      const nights = Math.max(
        1,
        n(row?.nights) || selectedNightsCount || defaultNights || 1,
      );
      const baseServices = n(row?.nonHotelsTotal) || nonHotelsTotal;
      const cfg = row?.additionalCfg || additionalCfg;
      const unifiedChildServicesPerPerson =
        resolveUnifiedChildServicesPerPerson({
          explicitTotal: row?.baseExplicitChildTotal,
          convertedTotal:
            row?.nonHotelConvertedChildTotal ?? row?.baseConvertedChildTotal,
          childrenCount,
          fallbackExplicitCount: childIds.length,
          fallbackConvertedCount: n(row?.convertedChildCount) || remainingConverted,
        });

      const refDistMap = new Map();
      if (Array.isArray(refPerRoomPricing) && refPerRoomPricing.length > 0) {
        refPerRoomPricing.forEach((rp) => {
          const sourceKey =
            rp?.roomKey ||
            rp?.sourceRoomKey ||
            String(rp?.key || "").split(":")[0];
          if (sourceKey) {
            const list = refDistMap.get(sourceKey) || [];
            list.push({
              adultBeneficiaries: rp.adultBeneficiaries || 0,
              convertedChildBeneficiaries: rp.convertedChildBeneficiaries || 0,
              hasIgv: (rp.roomDetails || []).some((detail) =>
                Boolean(detail?.hasIgv || detail?.tieneIgv),
              ),
            });
            refDistMap.set(sourceKey, list);
          }
        });
      }

      return activeRooms.flatMap((room) => {
        const capacity = Math.max(1, n(room.capacity) || 1);
        const roomCount = Math.max(1, n(room.cnt) || 1);
        const unit =
          n(room.unit) || (roomCount > 0 ? n(room.sub) / roomCount : 0);
        const refs = refDistMap.get(room.key) || [];

        return Array.from({ length: roomCount }, (_, slotIndex) => {
          const ref = refs[slotIndex] || null;
          let adultBeneficiaries;
          let convertedChildBeneficiaries;
          if (ref) {
            adultBeneficiaries = Math.min(
              Math.max(0, n(ref.adultBeneficiaries)),
              remainingAdults,
            );
            convertedChildBeneficiaries = Math.min(
              Math.max(0, n(ref.convertedChildBeneficiaries)),
              remainingConverted,
            );
          } else {
            const availableForSlot = Math.min(capacity, remainingPax);
            adultBeneficiaries = Math.min(availableForSlot, remainingAdults);
            convertedChildBeneficiaries = Math.min(
              Math.max(0, availableForSlot - adultBeneficiaries),
              remainingConverted,
            );
          }
          let beneficiaries = adultBeneficiaries + convertedChildBeneficiaries;
          if (beneficiaries <= 0) {
            beneficiaries = Math.min(capacity, Math.max(1, remainingPax));
          }

          remainingPax = Math.max(0, remainingPax - beneficiaries);
          remainingAdults = Math.max(0, remainingAdults - adultBeneficiaries);
          remainingConverted = Math.max(
            0,
            remainingConverted - convertedChildBeneficiaries,
          );

          const hasIgv = Boolean(ref?.hasIgv);
          const roomIgvAmount = hasIgv ? round2(unit * HOTEL_IGV_RATE) : 0;
          const roomUnitWithIgv = round2(unit + roomIgvAmount);
          const hotelTotalRoom = round2(roomUnitWithIgv * nights);
          const hotelPerPerson = round2(hotelTotalRoom / beneficiaries);
          const base = round2(baseServices + hotelPerPerson);
          const { adicionales } = computeAdicionales(cfg, base);
          const totalPerPerson = round2(base + adicionales);
          const convertedChildBase = round2(
            unifiedChildServicesPerPerson + hotelPerPerson,
          );
          const convertedChildAdditional =
            convertedChildBeneficiaries > 0
              ? computeAdicionales(cfg, convertedChildBase, "child")
              : { adicionales: 0, applied: false };
          const convertedChildAdicionales = convertedChildAdditional.adicionales;
          const label =
            roomCount > 1 ? `${room.label} ${slotIndex + 1}` : room.label;
          const roomDetails = [
            {
              roomId: `${room.key}:${slotIndex + 1}`,
              label,
              capacity,
              passengerIds: [],
              adultPassengerIds: [],
              convertedChildPassengerIds: [],
              hasIgv,
              tieneIgv: hasIgv,
              igvRate: hasIgv ? 18 : 0,
              igvAmount: roomIgvAmount,
              baseUnit: unit,
              unit: roomUnitWithIgv,
              unitWithIgv: roomUnitWithIgv,
              hotelTotalRoom,
            },
          ];

          return {
            key: `${room.key}:${slotIndex + 1}`,
            roomKey: room.key,
            sourceRoomKey: room.key,
            label,
            baseLabel: room.label,
            roomCount: 1,
            roomDetails,
            beneficiaries,
            adultBeneficiaries,
            convertedChildBeneficiaries,
            hotelPerNight: roomUnitWithIgv,
            hotelTotalRoom,
            convertedChildHotelPerPerson: hotelPerPerson,
            convertedChildTotalPerPerson:
              convertedChildBeneficiaries > 0
                ? convertedChildBase
                : 0,
            convertedChildDisplayTotalPerPerson:
              convertedChildBeneficiaries > 0
                ? convertedChildBase
                : 0,
            convertedChildBasePerPerson: convertedChildBase,
            convertedChildServicePerPerson: unifiedChildServicesPerPerson,
            convertedChildAdicionales: round2(convertedChildAdicionales),
            convertedChildAdditionalApplied: convertedChildAdditional.applied,
            hotelPerPerson,
            base,
            adicionales: round2(adicionales),
            totalPerPerson,
            displayTotalPerPerson: round2(totalPerPerson + externalAdultTotal),
          };
        });
      });
    },
    [
      additionalCfg,
      adultEquivalentCount,
      adultsCount,
      defaultNights,
      nonHotelsTotal,
      selectedNightsCount,
      externalAdultTotal,
      externalConvertedChildTotal,
      childIds.length,
      childrenCount,
    ],
  );

  // Datos de categorías que se persisten con la selección de hotel.
  const resolvedCategoryRows = useMemo(
    () =>
      categoryRows.map((row) => ({
        ...row,
        perRoomPricing: getCategoryRoomFinalRows(
          row,
          row.isSelected ? null : selectedRow?.perRoomPricing,
        ),
      })),
    [categoryRows, getCategoryRoomFinalRows, selectedRow],
  );

  const adultPrice = selectedRow?.hotelPerAdult || 0;

  const syncChildPricing = useCallback((updater) => {
    setChildPricing((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const nextMap = next.assignedChildExplicitPriceMap || {};
      const nextConvertedMap = next.convertedChildToAdultMap || {};
      const explicitChildCount = Object.keys(nextMap).filter(
        (childId) => !nextConvertedMap[childId],
      ).length;
      return {
        ...next,
        assignedIds: Array.isArray(next.assignedIds)
          ? [...new Set(next.assignedIds)]
          : [],
        assignedChildExplicitPriceMap: nextMap,
        assignedChildExplicitPriceSum: Object.entries(nextMap).reduce(
          (sum, [childId, value]) => {
            if (nextConvertedMap[childId]) return sum;
            return sum + (parseFloat(value) || 0);
          },
          0,
        ),
        assignedChildExplicitCount: explicitChildCount,
        hasChildExplicitPrices: explicitChildCount > 0,
      };
    });
  }, []);

  const handleCategoryToggle = useCallback(
    (category) => {
      if (activeGroupHasLockedHotelDays) return;

      if (selectedCat === category) {
        roomAssignmentsDirtyRef.current = false;
        setSelectedCat(null);
        setRoomMix({});
        setRoomAssignments({});
        if (activeGroupId) {
          setDayGroups((prev) =>
            prev.map((g) =>
              g.id === activeGroupId
                ? {
                    ...g,
                    category: null,
                    roomMix: {},
                    roomAssignments: {},
                    priceOverrides: {},
                    roomOptions: [],
                  }
                : g,
            ),
          );
        }
        return;
      }

      const categoryData = getCategoryData(category);
      const roomOptions = categoryData?.roomOptions || [];
      const hotelOptionKey = getHotelOptionKey(categoryData) || null;
      const nextGroupPriceOverrides =
        normalizeCat(activeGroup?.category) === normalizeCat(category)
          ? clonePriceOverrideMap(activeGroup?.priceOverrides)
          : {};
      const pricedRoomOptions = applyRoomPriceOverridesToOptions(
        roomOptions,
        nextGroupPriceOverrides,
      );
      roomAssignmentsDirtyRef.current = false;
      const transferredMix = transferRoomMixToOptions(
        roomMix,
        selectedRoomOptions,
        pricedRoomOptions,
      );
      const newMix =
        Object.keys(transferredMix).length > 0
          ? transferredMix
          : convertedChildIds.length > 0
            ? autoMixWithConvertedChildren(
                pricedRoomOptions,
                adultsCount,
                convertedChildIds.length,
              )
            : autoMixForPax(pricedRoomOptions, adultEquivalentCount);
      const nextRoomSlots = buildRoomSlots(
        costFromMix(newMix, pricedRoomOptions).breakdown,
      );
      const nextRoomAssignments = normalizeRoomAssignments(
        roomAssignments,
        nextRoomSlots,
        assignableHotelPassengerIds,
        { fillMissing: true },
      );
      setSelectedCat(category);
      if (hotelOptionKey) {
        setSelectedHotelOptionByCategory((prev) => ({
          ...prev,
          [normalizeCat(category)]: hotelOptionKey,
        }));
      }
      setRoomMix(newMix);
      setRoomAssignments(nextRoomAssignments);

      if (activeGroupId) {
        setDayGroups((prev) =>
          prev.map((g) =>
            g.id === activeGroupId
              ? {
                  ...g,
                  category,
                  hotelOptionKey,
                  hotelName: categoryData?.hotelName || g.hotelName || null,
                  id_hotel: categoryData?.id_hotel || g.id_hotel || null,
                  ciudad: categoryData?.ciudad || g.ciudad || null,
                  roomMix: newMix,
                  roomAssignments: nextRoomAssignments,
                  priceOverrides: nextGroupPriceOverrides,
                  roomOptions: pricedRoomOptions,
                }
              : g,
          ),
        );
      }
    },
    [
      activeGroupHasLockedHotelDays,
      activeGroupId,
      activeGroup?.category,
      activeGroup?.priceOverrides,
      adultEquivalentCount,
      adultsCount,
      convertedChildIds.length,
      getCategoryData,
      roomAssignments,
      roomMix,
      assignableHotelPassengerIds,
      selectedCat,
      selectedRoomOptions,
    ],
  );

  const toggleDayChip = useCallback(
    (dayIndex) => {
      if (lockedHotelDayIndexSet.has(dayIndex)) return;

      const ownerGroupId = dayGroups.find((group) =>
        (group.dayIndices || []).includes(dayIndex),
      )?.id;
      if (ownerGroupId && ownerGroupId !== activeGroupId) return;

      setSelectedDayIndices((prev) => {
        const isAdding = !prev.includes(dayIndex);
        const next = prev.includes(dayIndex)
          ? prev.filter((value) => value !== dayIndex)
          : [...prev, dayIndex].sort((a, b) => a - b);
        if (activeGroupId) {
          setDayGroups((groups) =>
            groups.map((g) => {
              if (g.id === activeGroupId) {
                return { ...g, dayIndices: next };
              }
              if (isAdding && (g.dayIndices || []).includes(dayIndex)) {
                return {
                  ...g,
                  dayIndices: g.dayIndices.filter((d) => d !== dayIndex),
                };
              }
              return g;
            }),
          );
        }
        return next;
      });
    },
    [activeGroupId, dayGroups, lockedHotelDayIndexSet],
  );

  const dayToGroupMap = useMemo(() => {
    const map = {};
    dayGroups.forEach((g) => {
      (g.dayIndices || []).forEach((di) => {
        map[di] = g.id;
      });
    });
    return map;
  }, [dayGroups]);

  // Group color by id
  const groupColorMap = useMemo(() => {
    const map = {};
    dayGroups.forEach((g, idx) => {
      map[g.id] = GROUP_COLORS[idx % GROUP_COLORS.length];
    });
    return map;
  }, [dayGroups]);

  // Sync roomMix/passenger assignment changes back to the active group
  useEffect(() => {
    if (!activeGroupId) return;
    setDayGroups((prev) => {
      let changed = false;
      const next = prev.map((g) => {
        if (g.id !== activeGroupId) return g;
        const sameMix =
          stableStateKey(g.roomMix || {}) === roomMixKey;
        const sameAssignments = areRoomAssignmentsEqual(
          g.roomAssignments || {},
          displayRoomAssignments || {},
        );
        const samePriceOverrides =
          stableStateKey(g.priceOverrides || {}) ===
          selectedCategoryPriceOverridesKey;
        const sameRoomOptions =
          stableStateKey(g.roomOptions || []) === selectedRoomOptionsKey;
        if (sameMix && sameAssignments && samePriceOverrides && sameRoomOptions) {
          return g;
        }
        changed = true;
        return {
          ...g,
          roomMix: { ...roomMix },
          roomAssignments: { ...displayRoomAssignments },
          priceOverrides: { ...selectedCategoryPriceOverrides },
          roomOptions: selectedRoomOptions,
        };
      });
      return changed ? next : prev;
    });
  }, [
    activeGroupId,
    displayRoomAssignmentsKey,
    roomMixKey,
    selectedCategoryPriceOverridesKey,
    selectedRoomOptions,
    selectedRoomOptionsKey,
  ]);

  const handleAddGroup = useCallback(() => {
    const id = nextGroupId();
    setDayGroups((prev) => [
      ...prev,
      {
        id,
        dayIndices: [],
        category: null,
        roomMix: {},
        roomAssignments: {},
        priceOverrides: {},
        roomOptions: [],
      },
    ]);
    setActiveGroupId(id);
    setSelectedCat(null);
    setSelectedDayIndices([]);
    setRoomMix({});
    setRoomAssignments({});
  }, []);

  const handleRemoveGroup = useCallback(
    (groupId) => {
      const targetGroup = dayGroups.find((group) => group.id === groupId);
      if (
        targetGroup?.dayIndices?.some((dayIndex) =>
          lockedHotelDayIndexSet.has(dayIndex),
        )
      ) {
        return;
      }

      setDayGroups((prev) => {
        const next = prev.filter((g) => g.id !== groupId);
        if (activeGroupId === groupId) {
          const first = next[0];
          if (first) {
            setActiveGroupId(first.id);
            setSelectedCat(first.category);
            setSelectedDayIndices(first.dayIndices || []);
            setRoomMix(first.roomMix || {});
            setRoomAssignments(first.roomAssignments || {});
          } else {
            setActiveGroupId(null);
            setSelectedCat(null);
            setSelectedDayIndices([]);
            setRoomMix({});
            setRoomAssignments({});
          }
        }
        return next;
      });
    },
    [activeGroupId, dayGroups, lockedHotelDayIndexSet],
  );

  const handleSwitchGroup = useCallback(
    (groupId) => {
      // Save current state to active group first
      if (activeGroupId) {
        setDayGroups((prev) =>
          prev.map((g) =>
            g.id === activeGroupId
              ? {
                  ...g,
                  category: selectedCat,
                  roomMix: { ...roomMix },
                  roomAssignments: { ...displayRoomAssignments },
                  dayIndices: [...selectedDayIndices],
                  priceOverrides: { ...selectedCategoryPriceOverrides },
                  roomOptions: selectedRoomOptions,
                }
              : g,
          ),
        );
      }
      // Switch to the new group
      const target = dayGroups.find((g) => g.id === groupId);
      if (target) {
        setActiveGroupId(groupId);
        setSelectedCat(target.category);
        setSelectedDayIndices(target.dayIndices || []);
        setRoomMix(target.roomMix || {});
        setRoomAssignments(target.roomAssignments || {});
      }
    },
    [
      activeGroupId,
      dayGroups,
      displayRoomAssignments,
      roomMix,
      selectedCat,
      selectedCategoryPriceOverrides,
      selectedDayIndices,
      selectedRoomOptions,
    ],
  );

  const updateRoomCount = useCallback((roomKey, nextValue) => {
    if (activeGroupHasLockedHotelDays) return;
    roomAssignmentsDirtyRef.current = true;
    setRoomMix((prev) => {
      const optionByKey = new Map(
        (selectedRoomOptions || []).map((option) => [option.key, option]),
      );
      const targetOption = optionByKey.get(roomKey);
      const targetIsExtraBed = isExtraBedRoomType(targetOption);

      const normalizeRequested = () => {
        if (nextValue === "") return "";
        return Math.max(0, parseInt(nextValue, 10) || 0);
      };
      const requested = normalizeRequested();
      if (requested === "") return { ...prev, [roomKey]: "" };

      const physicalRoomCount = Object.entries(prev || {}).reduce(
        (sum, [key, rawCount]) => {
          if (key === roomKey && !targetIsExtraBed) {
            return sum + requested;
          }
          const option = optionByKey.get(key);
          if (isExtraBedRoomType(option)) return sum;
          return sum + Math.max(0, parseInt(rawCount, 10) || 0);
        },
        0,
      );

      const normalizedValue = targetIsExtraBed
        ? Math.min(requested, physicalRoomCount)
        : requested;
      let next = { ...prev };
      if (normalizedValue <= 0) delete next[roomKey];
      else next[roomKey] = normalizedValue;

      // One additional bed per physical room. If base rooms are reduced, clamp
      // any existing extra-bed rows so the mix can never contain orphan beds.
      const maxExtraBeds = Object.entries(next).reduce((sum, [key, rawCount]) => {
        const option = optionByKey.get(key);
        return isExtraBedRoomType(option)
          ? sum
          : sum + Math.max(0, parseInt(rawCount, 10) || 0);
      }, 0);
      Object.entries(next).forEach(([key, rawCount]) => {
        if (!isExtraBedRoomType(optionByKey.get(key))) return;
        const clamped = Math.min(
          Math.max(0, parseInt(rawCount, 10) || 0),
          maxExtraBeds,
        );
        if (clamped <= 0) delete next[key];
        else next[key] = clamped;
      });
      return next;
    });
  }, [activeGroupHasLockedHotelDays, selectedRoomOptions]);

  const handleAssignPassengerToRoom = useCallback(
    (roomId, passengerId) => {
      if (activeGroupHasLockedHotelDays || !roomId || !passengerId) return;
      const wasDirty = roomAssignmentsDirtyRef.current;
      const visibleAssignments = displayRoomAssignments;
      roomAssignmentsDirtyRef.current = true;
      const slot = roomSlots.find((item) => item.id === roomId);
      const capacity = Math.max(1, slot?.capacity || 1);

      setRoomAssignments((prev) => {
        const source = wasDirty ? prev : visibleAssignments;
        const next = {};
        Object.entries(source || {}).forEach(([slotId, ids]) => {
          next[slotId] = (Array.isArray(ids) ? ids : []).filter(
            (id) => id !== passengerId,
          );
        });
        next[roomId] = [...(next[roomId] || []), passengerId].slice(
          0,
          capacity,
        );
        return normalizeRoomAssignments(
          next,
          roomSlots,
          assignableHotelPassengerIds,
          { fillMissing: false },
        );
      });
    },
    [assignableHotelPassengerIds, displayRoomAssignments, roomSlots],
  );

  const handleRemovePassengerFromRoom = useCallback(
    (roomId, passengerId) => {
      if (!roomId || !passengerId) return;
      const wasDirty = roomAssignmentsDirtyRef.current;
      const visibleAssignments = displayRoomAssignments;
      roomAssignmentsDirtyRef.current = true;
      setRoomAssignments((prev) => {
        const source = wasDirty ? prev : visibleAssignments;
        const next = {
          ...(source || {}),
          [roomId]: (source?.[roomId] || []).filter((id) => id !== passengerId),
        };
        return normalizeRoomAssignments(
          next,
          roomSlots,
          assignableHotelPassengerIds,
          { fillMissing: false },
        );
      });
    },
    [assignableHotelPassengerIds, displayRoomAssignments, roomSlots],
  );

  const handleAutoRoomAssignments = useCallback(() => {
    roomAssignmentsDirtyRef.current = true;
    setRoomAssignments(
      normalizeRoomAssignments({}, roomSlots, assignableHotelPassengerIds),
    );
  }, [assignableHotelPassengerIds, roomSlots]);

  const handleDropPassengerToRoom = useCallback(
    (roomId, passengerId) => {
      setDraggedRoomPassengerId(null);
      handleAssignPassengerToRoom(roomId, passengerId);
    },
    [activeGroupHasLockedHotelDays, handleAssignPassengerToRoom],
  );

  const handleAutoMix = useCallback(() => {
    if (activeGroupHasLockedHotelDays || !selectedRoomOptions.length) return;
    roomAssignmentsDirtyRef.current = true;
    let nextMix = {};
    if (convertedChildIds.length > 0) {
      nextMix = autoMixWithConvertedChildren(
        selectedRoomOptions,
        adultsCount,
        convertedChildIds.length,
      );
    } else {
      nextMix = autoMixForPax(selectedRoomOptions, adultEquivalentCount);
    }
    setRoomMix(nextMix);
    setRoomAssignments(
      normalizeRoomAssignments(
        {},
        buildRoomSlots(costFromMix(nextMix, selectedRoomOptions).breakdown),
        assignableHotelPassengerIds,
      ),
    );
  }, [
    activeGroupHasLockedHotelDays,
    adultEquivalentCount,
    adultsCount,
    assignableHotelPassengerIds,
    convertedChildIds.length,
    selectedRoomOptions,
  ]);

  const handleHotelOptionChange = useCallback(
    (hotelOptionKey) => {
      if (activeGroupHasLockedHotelDays || !selectedCat) return;
      const nextCategoryData = getCategoryData(selectedCat, hotelOptionKey);
      const nextRoomOptions = nextCategoryData?.roomOptions || [];
      if (nextRoomOptions.length === 0) return;

      setSelectedHotelOptionByCategory((prev) => ({
        ...prev,
        [selectedCat]: hotelOptionKey,
      }));

      roomAssignmentsDirtyRef.current = false;
      const transferredMix = transferRoomMixToOptions(
        roomMix,
        selectedRoomOptions,
        nextRoomOptions,
      );
      const nextMix =
        Object.keys(transferredMix).length > 0
          ? transferredMix
          : convertedChildIds.length > 0
            ? autoMixWithConvertedChildren(
                nextRoomOptions,
                adultsCount,
                convertedChildIds.length,
              )
            : autoMixForPax(nextRoomOptions, adultEquivalentCount);
      const nextAssignments = normalizeRoomAssignments(
        roomAssignments,
        buildRoomSlots(costFromMix(nextMix, nextRoomOptions).breakdown),
        assignableHotelPassengerIds,
        { fillMissing: true },
      );

      setRoomMix(nextMix);
      setRoomAssignments(nextAssignments);
      if (activeGroupId) {
        setDayGroups((prev) =>
          prev.map((group) =>
            group.id === activeGroupId
              ? {
                  ...group,
                  category: selectedCat,
                  hotelOptionKey,
                  hotelName: nextCategoryData?.hotelName || null,
                  id_hotel: nextCategoryData?.id_hotel || null,
                  ciudad: nextCategoryData?.ciudad || null,
                  roomMix: nextMix,
                  roomAssignments: nextAssignments,
                }
              : group,
          ),
        );
      }
    },
    [
      activeGroupHasLockedHotelDays,
      activeGroupId,
      adultEquivalentCount,
      adultsCount,
      assignableHotelPassengerIds,
      convertedChildIds.length,
      getCategoryData,
      roomAssignments,
      roomMix,
      selectedCat,
      selectedRoomOptions,
    ],
  );

  const applyUniformChildPrice = useCallback(
    (priceType, customValue = null) => {
      if (!allChildIds.length) return;

      if (priceType === "adult") {
        const nextConverted = Object.fromEntries(
          allChildIds.map((id) => [id, true]),
        );
        const newConvertedCount = allChildIds.length;
        if (selectedRoomOptions.length > 0) {
          roomAssignmentsDirtyRef.current = true;
          const nextMix = autoMixWithConvertedChildren(
            selectedRoomOptions,
            adultsCount,
            newConvertedCount,
          );
          setRoomMix(nextMix);
          setRoomAssignments(
            normalizeRoomAssignments(
              {},
              buildRoomSlots(
                costFromMix(nextMix, selectedRoomOptions).breakdown,
              ),
              [...adultIds, ...allChildIds],
            ),
          );
        }
        syncChildPricing((prev) => ({
          ...prev,
          pricingMode: "adult",
          uniformPercentage: "",
          assignedChildExplicitPriceMap: {},
          convertedChildToAdultMap: nextConverted,
        }));
        return;
      }

      const { nextMap, pricingMode, uniformPercentage } =
        buildChildPriceMapWithPreset(
          allChildIds,
          adultPrice,
          priceType,
          customValue,
        );
      syncChildPricing((prev) => ({
        ...prev,
        pricingMode,
        uniformPercentage,
        assignedChildExplicitPriceMap: nextMap,
        convertedChildToAdultMap: {},
      }));
    },
    [
      adultIds,
      adultPrice,
      adultsCount,
      allChildIds,
      selectedRoomOptions,
      syncChildPricing,
    ],
  );

  const applyIndividualChildPrice = useCallback(
    (childId, priceType, customValue) => {
      if (!childId) return;

      let nextPrice = 0;
      switch (priceType) {
        case "zero":
          nextPrice = 0;
          break;
        case "adult":
          nextPrice = adultPrice;
          break;
        case "percentage":
          nextPrice = ((parseFloat(customValue) || 0) / 100) * adultPrice;
          break;
        case "fixed":
          nextPrice = parseFloat(customValue) || 0;
          break;
        default:
          return;
      }

      syncChildPricing((prev) => ({
        ...prev,
        assignedChildExplicitPriceMap: {
          ...(prev.assignedChildExplicitPriceMap || {}),
          [childId]: nextPrice,
        },
        convertedChildToAdultMap: {
          ...(prev.convertedChildToAdultMap || {}),
          [childId]: priceType === "adult",
        },
      }));
    },
    [adultPrice, syncChildPricing],
  );

  const handleConvertChildToAdult = useCallback(
    (childIdToConvert) => {
      if (activeGroupHasLockedHotelDays || !childIdToConvert) return;

      syncChildPricing((prev) => {
        const nextConverted = {
          ...(prev.convertedChildToAdultMap || {}),
          [childIdToConvert]: true,
        };
        const newConvertedCount = Object.keys(nextConverted).length;
        if (selectedRoomOptions.length > 0) {
          roomAssignmentsDirtyRef.current = true;
          const nextMix = autoMixWithConvertedChildren(
            selectedRoomOptions,
            adultsCount,
            newConvertedCount,
          );
          setRoomMix(nextMix);
          setRoomAssignments(
            normalizeRoomAssignments(
              {},
              buildRoomSlots(
                costFromMix(nextMix, selectedRoomOptions).breakdown,
              ),
              [...adultIds, ...Object.keys(nextConverted)],
            ),
          );
        }
        return {
          ...prev,
          assignedChildExplicitPriceMap: {
            ...(prev.assignedChildExplicitPriceMap || {}),
            [childIdToConvert]: adultPrice,
          },
          convertedChildToAdultMap: nextConverted,
        };
      });
    },
    [activeGroupHasLockedHotelDays, adultPrice, adultsCount, selectedRoomOptions, syncChildPricing],
  );

  const handleRevertAdultToChild = useCallback(
    (childId) => {
      if (activeGroupHasLockedHotelDays || !childId) return;

      syncChildPricing((prev) => {
        const converted = { ...(prev.convertedChildToAdultMap || {}) };
        if (!converted[childId]) return prev;
        delete converted[childId];

        const nextMap = { ...(prev.assignedChildExplicitPriceMap || {}) };
        if (prev.pricingMode === "adult") {
          nextMap[childId] = adultPrice;
        } else if (
          prev.pricingMode === "percentage" &&
          parseFloat(prev.uniformPercentage) > 0
        ) {
          nextMap[childId] =
            (parseFloat(prev.uniformPercentage) / 100) * adultPrice;
        } else {
          nextMap[childId] = 0;
        }

        const hasRemainingConversions = Object.keys(converted).length > 0;
        const newConvertedCount = Object.keys(converted).length;
        if (selectedRoomOptions.length > 0) {
          roomAssignmentsDirtyRef.current = true;
          const nextMix = autoMixWithConvertedChildren(
            selectedRoomOptions,
            adultsCount,
            newConvertedCount,
          );
          setRoomMix(nextMix);
          setRoomAssignments(
            normalizeRoomAssignments(
              {},
              buildRoomSlots(
                costFromMix(nextMix, selectedRoomOptions).breakdown,
              ),
              [...adultIds, ...Object.keys(converted)],
            ),
          );
        }

        return {
          ...prev,
          assignedChildExplicitPriceMap: nextMap,
          convertedChildToAdultMap: hasRemainingConversions ? converted : {},
          treatChildrenAsAdults:
            prev.pricingMode === "adult" || hasRemainingConversions,
        };
      });
    },
    [activeGroupHasLockedHotelDays, adultIds, adultPrice, adultsCount, selectedRoomOptions, syncChildPricing],
  );

  const handleSave = useCallback(() => {
    const hasRealSelection =
      selectedRow ||
      dayGroups.some((g) => g.category && g.dayIndices.length > 0);
    if (!hasRealSelection) {
      onSaveSelection?.(null);
      return;
    }
    if (hasUnassignedHotelPassengers) return;

    // Save current active group state first
    const finalGroups = enforceUniqueDayGroups(
      dayGroups.map((g) =>
        g.id === activeGroupId
          ? {
              ...g,
              category: selectedCat,
              hotelOptionKey:
                getHotelOptionKey(selectedCategoryData) ||
                g.hotelOptionKey ||
                null,
              hotelName: selectedCategoryData?.hotelName || g.hotelName || null,
              id_hotel: selectedCategoryData?.id_hotel || g.id_hotel || null,
              ciudad: selectedCategoryData?.ciudad || g.ciudad || null,
              roomMix: { ...roomMix },
              roomAssignments: { ...displayRoomAssignments },
              dayIndices: [...selectedDayIndices],
              priceOverrides: { ...selectedCategoryPriceOverrides },
              roomOptions: selectedRoomOptions,
            }
          : g,
      ),
    );

    const clonedPriceOverrides = Object.entries(priceOverrides || {}).reduce(
      (accumulator, [category, overrides]) => ({
        ...accumulator,
        [category]: { ...(overrides || {}) },
      }),
      {},
    );

    const finalPriceOverrides = finalGroups.reduce(
      (accumulator, group) => {
        const category = normalizeCat(group?.category);
        const groupOverrides = clonePriceOverrideMap(group?.priceOverrides);
        if (!category || Object.keys(groupOverrides).length === 0) {
          return accumulator;
        }

        return {
          ...accumulator,
          [category]: {
            ...(accumulator[category] || {}),
            ...groupOverrides,
          },
        };
      },
      { ...clonedPriceOverrides },
    );

    // Build per-group data for multi-category support
    const dayGroupsPayload = finalGroups
      .filter((g) => g.category && g.dayIndices.length > 0)
      .map((g) => {
        const category = normalizeCat(g.category);
        const groupData = getCategoryData(category, g.hotelOptionKey);
        const persistedGroupOptions = Array.isArray(g.roomOptions)
          ? g.roomOptions
          : [];
        const groupOptions =
          persistedGroupOptions.length > 0
            ? persistedGroupOptions
            : groupData?.roomOptions || [];
        const groupPriceOverrides =
          Object.keys(clonePriceOverrideMap(g.priceOverrides)).length > 0
            ? clonePriceOverrideMap(g.priceOverrides)
            : finalPriceOverrides?.[category] || {};

        return {
          id: g.id || `${category || "group"}-${g.dayIndices.join("-")}`,
          label: g.label || null,
          dayIndices: g.dayIndices,
          category,
          hotelOptionKey: g.hotelOptionKey || getHotelOptionKey(groupData) || null,
          roomMix: g.roomMix || {},
          roomAssignments: g.roomAssignments || {},
          hotelName: groupData?.hotelName || "Hotel",
          id_hotel: groupData?.id_hotel || null,
          ciudad: groupData?.ciudad || groupData?.city || null,
          luxuryManual: groupData?.luxuryManual === true,
          priceOverrides: groupPriceOverrides,
          roomOptions: applyRoomPriceOverridesToOptions(
            groupOptions,
            groupPriceOverrides,
          ),
        };
      });

    const enrichedDayGroupsPayload = dayGroupsPayload.map((group, index) => {
      const groupPerRoomPricing = buildPerRoomPricingForGroup(group, index);
      const groupHotelTotal = round2(
        groupPerRoomPricing.reduce(
          (sum, room) => sum + n(room?.hotelTotalRoom),
          0,
        ),
      );
      const groupNights = Math.max(1, group.dayIndices?.length || 1);

      return {
        ...group,
        perRoomPricing: groupPerRoomPricing,
        hotelTotal: groupHotelTotal,
        perNightSum: round2(groupHotelTotal / groupNights),
        peruvianPassengerIds: Array.from(peruvianPassengerIds),
      };
    });
    const mergedPerRoomPricing = enrichedDayGroupsPayload.flatMap((group) =>
      Array.isArray(group.perRoomPricing) ? group.perRoomPricing : [],
    );
    const aggregatedStayPricing =
      aggregatePerRoomPricingByStayGroup(mergedPerRoomPricing);
    const groupedHotelTotal = round2(
      mergedPerRoomPricing.reduce(
        (sum, room) => sum + n(room?.hotelTotalRoom),
        0,
      ),
    );
    const groupedAdultHotelTotal = round2(
      mergedPerRoomPricing.reduce(
        (sum, room) =>
          sum +
          n(room?.hotelPerPerson) *
            Math.max(0, n(room?.adultBeneficiaries)),
        0,
      ),
    );
    const groupedHotelPerAdult =
      adultsCount > 0
        ? round2(groupedAdultHotelTotal / adultsCount)
        : round2(aggregatedStayPricing?.[0]?.hotelPerPerson || 0);
    const groupedBasePerAdult = round2(nonHotelsTotal + groupedHotelPerAdult);
    const groupedAdditional = computeAdicionales(
      additionalCfg,
      groupedBasePerAdult,
    ).adicionales;
    const groupedTotalPerAdult = round2(
      groupedBasePerAdult + groupedAdditional + externalAdultTotal,
    );

    // Merged selectedNightIndices: all days across all groups
    const mergedNightIndices = [
      ...new Set(finalGroups.flatMap((g) => g.dayIndices || [])),
    ].sort((a, b) => a - b);

    const representativeGroup =
      enrichedDayGroupsPayload.find((group) => group.dayIndices?.length > 0) ||
      null;

    onSaveSelection?.({
      ...selectedRow,
      // Los escalares superiores solo existen por compatibilidad. En una
      // selección agrupada deben describir toda la estancia, no el tab activo.
      category: representativeGroup?.category || selectedRow?.category,
      label:
        CAT_LABELS[representativeGroup?.category] ||
        representativeGroup?.category ||
        selectedRow?.label,
      luxuryManual:
        enrichedDayGroupsPayload.length > 0 &&
        enrichedDayGroupsPayload.every(
          (group) => normalizeCat(group?.category) === "5",
        ),
      hotelName: representativeGroup?.hotelName || selectedRow?.hotelName,
      id_hotel: representativeGroup?.id_hotel ?? selectedRow?.id_hotel ?? null,
      ciudad: representativeGroup?.ciudad || selectedRow?.ciudad || null,
      nights: mergedNightIndices.length,
      hotelTotal:
        groupedHotelTotal > 0 ? groupedHotelTotal : selectedRow?.hotelTotal || 0,
      total:
        groupedHotelTotal > 0 ? groupedHotelTotal : selectedRow?.hotelTotal || 0,
      hotelPerAdult:
        groupedHotelPerAdult > 0
          ? groupedHotelPerAdult
          : selectedRow?.hotelPerAdult || 0,
      basePerAdult:
        groupedHotelPerAdult > 0
          ? groupedBasePerAdult
          : selectedRow?.basePerAdult || 0,
      adicionales:
        groupedHotelPerAdult > 0
          ? round2(groupedAdditional)
          : selectedRow?.adicionales || 0,
      totalPerAdult:
        groupedHotelPerAdult > 0
          ? groupedTotalPerAdult
          : selectedRow?.totalPerAdult || 0,
      perNightSum:
        mergedNightIndices.length > 0 && groupedHotelTotal > 0
          ? round2(groupedHotelTotal / mergedNightIndices.length)
          : selectedRow?.perNightSum || 0,
      mix: representativeGroup?.roomMix || selectedRow?.mix || {},
      roomMix: representativeGroup?.roomMix || selectedRow?.roomMix || {},
      roomOptions:
        representativeGroup?.roomOptions || selectedRow?.roomOptions || [],
      roomAssignments:
        representativeGroup?.roomAssignments || displayRoomAssignments,
      selectedNightIndices: mergedNightIndices,
      priceOverrides: finalPriceOverrides,
      allCategoryRows: resolvedCategoryRows,
      perRoomPricing:
        mergedPerRoomPricing.length > 0
          ? mergedPerRoomPricing
          : selectedRow?.perRoomPricing || [],
      dayGroups: enrichedDayGroupsPayload,
      peruvianPassengerIds: Array.from(peruvianPassengerIds),
      dayGroupsAuthoritative: true,
      groupedHotelSelection: enrichedDayGroupsPayload.length > 1,
      roomAssignmentSummary,
      childPricing,
      roomMixNeedsAutoRefresh: false,
    });
  }, [
    activeGroupId,
    adultsCount,
    additionalCfg,
    dayGroups,
    externalAdultTotal,
    childPricing,
    hasUnassignedHotelPassengers,
    onSaveSelection,
    nonHotelsTotal,
    resolvedCategoryRows,
    priceOverrides,
    displayRoomAssignments,
    roomAssignmentSummary,
    roomMix,
    buildPerRoomPricingForGroup,
    peruvianPassengerIds,
    getCategoryData,
    selectedCat,
    selectedCategoryPriceOverrides,
    selectedDayIndices,
    selectedCategoryData,
    selectedRow,
  ]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="hpm-overlay">
      <div className="hpm-modal">
        <div className="hpm-header">
          <div className="hpm-header-main">
            <div className="hpm-title">
              <MdHotel />
              <div>
                <div className="hpm-title-top">Tarifario de hoteles</div>
                <div className="hpm-title-sub">Grupos, noches, tarifas y asignación por habitación</div>
              </div>
            </div>

            <button className="hpm-close" onClick={onClose} type="button">
              <MdClose />
            </button>
          </div>

          <div className="hpm-meta-bar">
          <div className="hpm-meta-pill">
            <span className="hpm-meta-label">Pasajeros</span>
            <strong>{adultsCount}</strong> adultos
            {childrenCount > 0 ? ` · ${childrenCount} niños` : ""}
          </div>
          <div className="hpm-meta-pill">
            <span className="hpm-meta-label">Paquete</span>
            <strong>{packageType}</strong>
          </div>
          {lockedHotelDayIndexSet.size > 0 && (
            <div
              className="hpm-meta-pill hpm-meta-pill--locked"
              title="Estas noches ya tienen hotel asignado en el voucher y no se modificarán al guardar."
            >
              <MdLock />
              <strong>{lockedHotelDayIndexSet.size}</strong> noche
              {lockedHotelDayIndexSet.size === 1 ? "" : "s"} protegida
              {lockedHotelDayIndexSet.size === 1 ? "" : "s"}
            </div>
          )}

          {/* Group tabs for multi-category support */}
          <div className="hpm-group-bar">
            {dayGroups.map((g, idx) => (
              <button
                key={g.id}
                type="button"
                className={`hpm-group-tab ${g.id === activeGroupId ? "active" : ""}`}
                style={{
                  "--group-color": groupColorMap[g.id],
                  borderColor:
                    g.id === activeGroupId ? groupColorMap[g.id] : undefined,
                }}
                onClick={() => handleSwitchGroup(g.id)}
              >
                <span
                  className="hpm-group-dot"
                  style={{ background: groupColorMap[g.id] }}
                />
                {`Grupo ${idx + 1}`}
                {g.category
                  ? ` · ${getCategoryLabel(g.category, effectiveRoomOptionsByCategory?.[g.category])}`
                  : " · sin categoría"}
                {g.dayIndices.length > 0
                  ? ` (${g.dayIndices.length} día${g.dayIndices.length > 1 ? "s" : ""})`
                  : ""}
                {dayGroups.length > 1 &&
                  ((g.dayIndices || []).some((dayIndex) =>
                    lockedHotelDayIndexSet.has(dayIndex),
                  ) ? (
                    <span
                      className="hpm-group-remove hpm-group-remove--locked"
                      title="El grupo contiene noches ya asignadas al voucher"
                      aria-label="Grupo protegido por asignaciones"
                    >
                      <MdLock />
                    </span>
                  ) : (
                    <span
                      className="hpm-group-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveGroup(g.id);
                      }}
                      role="button"
                      tabIndex={-1}
                      aria-label="Eliminar grupo"
                    >
                      ×
                    </span>
                  ))}
              </button>
            ))}
            <button
              type="button"
              className="hpm-group-add"
              onClick={handleAddGroup}
              title="Agregar grupo de días"
            >
              + Grupo
            </button>
          </div>

          <div className="hpm-day-chip-group">
          {availableDayOptions.map((day) => {
              const groupId = dayToGroupMap[day.index];
              const color = groupId ? groupColorMap[groupId] : undefined;
              const isActive = selectedDayIndices.includes(day.index);
              const isLockedByOtherGroup =
                Boolean(groupId) && groupId !== activeGroupId;
              const isOperationallyLocked = lockedHotelDayIndexSet.has(
                day.index,
              );
              return (
                <button
                  key={day.index}
                  type="button"
                  className={`hpm-day-chip ${isActive ? "active" : ""} ${
                    isLockedByOtherGroup ? "locked" : ""
                  } ${isOperationallyLocked ? "operational-locked" : ""}`}
                  style={
                    groupId
                      ? {
                          borderColor: color,
                          background: isActive ? color : `${color}18`,
                          color: isActive ? "#fff" : color,
                        }
                      : undefined
                  }
                  onClick={() => toggleDayChip(day.index)}
                  disabled={isLockedByOtherGroup || isOperationallyLocked}
                  title={
                    isOperationallyLocked
                      ? "Noche protegida: el hotel ya está asignado en el voucher"
                      : groupId
                        ? (() => {
                          const groupIndex = dayGroups.findIndex(
                            (g) => g.id === groupId,
                          );
                          const grp = dayGroups[groupIndex];
                          const groupLabel =
                            groupIndex >= 0 ? `Grupo ${groupIndex + 1}` : "Grupo";
                          return grp?.category
                            ? `${groupLabel} · ${getCategoryLabel(grp.category, effectiveRoomOptionsByCategory?.[grp.category])}`
                            : `${groupLabel} sin categoría`;
                        })()
                      : "Sin grupo"
                  }
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          </div>
        </div>

        <div className="hpm-body">
          <div className="hpm-body-panels">
            <div className="hpm-panel-left">
              <div className="hpm-section-label">Categoría sugerida</div>
              <div className="hpm-cat-cards">
                {categoryRows.map((row) => {
                  const isActive = selectedCat === row.category;
                  const roomFinalRows = getCategoryRoomFinalRows(
                    row,
                    row.isSelected ? null : selectedRow?.perRoomPricing,
                  );
                  const rowIgvTotal = roomFinalRows.reduce(
                    (sum, rp) =>
                      sum + getRoomIgvStayTotal(rp, selectedNightsCount),
                    0,
                  );
                  const rowIgvPerPersonValues = roomFinalRows
                    .map((rp) => getRoomIgvPerPerson(rp, selectedNightsCount))
                    .filter((value) => value > 0);
                  const rowIgvPaxLabel =
                    rowIgvPerPersonValues.length > 0
                      ? (() => {
                          const min = Math.min(...rowIgvPerPersonValues);
                          const max = Math.max(...rowIgvPerPersonValues);
                          return Math.abs(max - min) < 0.01
                            ? formatCurrency(max)
                            : `${formatCurrency(min)} - ${formatCurrency(max)}`;
                        })()
                      : "";

                  const roomDisplayRows = roomFinalRows.flatMap((rp) =>
                    buildCategoryRoomDisplayRows({
                      row,
                      roomPricing: rp,
                      selectedNightsCount,
                      fallbackNonHotelsTotal: nonHotelsTotal,
                      fallbackAdditionalCfg: additionalCfg,
                      externalAdultTotal,
                      externalChildTotal,
                      externalConvertedChildTotal,
                      childrenCount,
                    }),
                  );

                  return (
                    <button
                      key={row.category}
                      type="button"
                      className={`hpm-cat-card ${isActive ? "active" : ""}${activeGroupHasLockedHotelDays ? " is-locked" : ""}`}
                      onClick={() => handleCategoryToggle(row.category)}
                      disabled={activeGroupHasLockedHotelDays}
                      title={
                        activeGroupHasLockedHotelDays
                          ? "Categoría protegida: este grupo contiene noches ya asignadas"
                          : undefined
                      }
                    >
                      <span className="hpm-cat-head">
                        <span className="hpm-stars">
                          {row.label || getCategoryLabel(row.category, row)}
                        </span>
                        {isActive && (
                          <span className="hpm-cat-active-pill">actual</span>
                        )}
                        {rowIgvTotal > 0 && (
                          <span className="hpm-cat-active-pill hpm-cat-igv-pill">
                            IGV pax {rowIgvPaxLabel}
                          </span>
                        )}
                      </span>
                      <span className="hpm-cat-name">{row.hotelName}</span>

                      <div className="hpm-cat-rooms">
                        {roomDisplayRows.length > 0 ? (
                          roomDisplayRows.map((displayRow) => {
                            const RoomIcon = displayRow.icon || MdHotel;
                            return (
                              <div
                                className={`hpm-cat-room-row${
                                  displayRow.tone === "child"
                                    ? " hpm-cat-room-row--child"
                                    : ""
                                }`}
                                key={`cat-final-${row.category}-${displayRow.key}`}
                              >
                                <div className="hpm-cat-room-left">
                                  <RoomIcon
                                    className={`hpm-cat-room-icon${
                                      displayRow.tone === "child"
                                        ? " hpm-cat-room-icon--child"
                                        : ""
                                    }`}
                                  />
                                  <div className="hpm-cat-room-info">
                                    <span className="hpm-cat-room-type">
                                      {displayRow.label}
                                    </span>
                                    <span className="hpm-cat-room-pax">
                                      {displayRow.paxLabel}
                                    </span>
                                  </div>
                                </div>
                                <div className="hpm-cat-room-right">
                                  <div
                                    className={`hpm-cat-room-total${
                                      displayRow.tone === "child"
                                        ? " hpm-cat-room-total--child"
                                        : ""
                                    }`}
                                  >
                                    {formatCurrency(displayRow.total)}
                                  </div>
                                  <div
                                    className={`hpm-cat-room-breakdown${
                                      displayRow.tone === "child"
                                        ? " hpm-cat-room-breakdown--child"
                                        : ""
                                    }`}
                                  >
                                    {displayRow.breakdown.map((item) => (
                                      <span
                                        key={`${displayRow.key}-${item.label}`}
                                      >
                                        {item.label}{" "}
                                        {formatCurrency(item.value)}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="hpm-cat-room-row hpm-cat-room-row--ref">
                            <div className="hpm-cat-room-left">
                              <MdHotel className="hpm-cat-room-icon" />
                              <div className="hpm-cat-room-info">
                                <span className="hpm-cat-room-type">
                                  Referencia
                                </span>
                                <span className="hpm-cat-room-pax">
                                  {adultEquivalentCount} pax
                                </span>
                              </div>
                            </div>
                            <div className="hpm-cat-room-right">
                              <div className="hpm-cat-room-total">
                                {formatCurrency(row.totalPerAdult || 0)}
                              </div>
                              <div className="hpm-cat-room-breakdown">
                                <span>
                                  Servicios{" "}
                                  {formatCurrency(
                                    row.nonHotelsTotal || nonHotelsTotal || 0,
                                  )}
                                </span>
                                <span>Hotel por adulto</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="hpm-panel-right">
              {/* Multi-group summary */}
              {dayGroups.length > 1 && (
                <div className="hpm-groups-summary">
                  {dayGroups.map((g, idx) => {
                    const color = groupColorMap[g.id];
                    const opts =
                      g.category &&
                      effectiveRoomOptionsByCategory?.[g.category]?.roomOptions
                        ? effectiveRoomOptionsByCategory[g.category].roomOptions
                        : [];
                    const mix = g.id === activeGroupId ? roomMix : g.roomMix;
                    const mixEntries = Object.entries(mix || {}).filter(
                      ([, cnt]) => cnt > 0,
                    );
                    return (
                      <div
                        key={g.id}
                        className={`hpm-group-summary-row ${g.id === activeGroupId ? "active" : ""}`}
                        style={{ borderLeftColor: color }}
                        onClick={() => handleSwitchGroup(g.id)}
                        role="button"
                        tabIndex={0}
                      >
                        <span
                          className="hpm-group-dot"
                          style={{ background: color }}
                        />
                        <span className="hpm-gs-label">
                          {`Grupo ${idx + 1}`}
                          {g.category
                            ? ` · ${getCategoryLabel(g.category, effectiveRoomOptionsByCategory?.[g.category])}`
                            : " · sin categoría"}
                        </span>
                        <span className="hpm-gs-days">
                          {g.dayIndices.length > 0
                            ? g.dayIndices.map((d) => `D${d + 1}`).join(", ")
                            : "sin días"}
                        </span>
                        {mixEntries.length > 0 && (
                          <span className="hpm-gs-mix">
                            {mixEntries
                              .map(([k, cnt]) => `${cnt}× ${k}`)
                              .join(", ")}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Distinguish between "dict still loading" and "no category chosen yet" */}
              {selectedCat && selectedRoomOptions.length > 0 ? (
                <>
                  {Array.isArray(selectedCategoryData?.hotelOptions) &&
                    selectedCategoryData.hotelOptions.length > 0 && (
                      <section className="hpm-hotel-selector" aria-label="Selección de hotel">
                        <div className="hpm-selection-steps" aria-label="Flujo hotelero">
                          <span className="is-complete"><b>1</b> Categoría</span>
                          <span className="is-active"><b>2</b> Hotel</span>
                          <span><b>3</b> Habitaciones</span>
                        </div>

                        <div className="hpm-hotel-selector__head">
                          <div>
                            <strong>Elige el alojamiento</strong>
                            <small>
                              {getCategoryLabel(selectedCat, selectedCategoryData)} · {selectedCategoryData.hotelOptions.length} opción{selectedCategoryData.hotelOptions.length === 1 ? "" : "es"}
                            </small>
                          </div>
                          <label className="hpm-hotel-search">
                            <FaSearch aria-hidden="true" />
                            <input
                              type="search"
                              value={hotelSearchTerm}
                              onChange={(event) => setHotelSearchTerm(event.target.value)}
                              placeholder="Buscar hotel o ciudad"
                              aria-label="Buscar hotel o ciudad"
                            />
                          </label>
                        </div>

                        <div className="hpm-hotel-options" role="listbox" aria-label="Hoteles disponibles">
                          {visibleHotelOptions.map((option) => {
                            const optionKey = getHotelOptionKey(option);
                            const isSelected = optionKey === selectedHotelOptionKey;
                            const manualRooms = (option.roomOptions || []).filter(
                              (room) => room.manualPricing,
                            ).length;
                            return (
                              <button
                                key={optionKey}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                className={`hpm-hotel-option${isSelected ? " is-selected" : ""}${activeGroupHasLockedHotelDays ? " is-locked" : ""}`}
                                onClick={() => handleHotelOptionChange(optionKey)}
                                disabled={activeGroupHasLockedHotelDays}
                                title={
                                  activeGroupHasLockedHotelDays
                                    ? "Hotel protegido: crea un grupo nuevo para cambiar de alojamiento"
                                    : undefined
                                }
                              >
                                <span className="hpm-hotel-option__icon"><MdHotel /></span>
                                <span className="hpm-hotel-option__content">
                                  <strong>{option.hotelName}</strong>
                                  <small>
                                    <FaMapMarkerAlt aria-hidden="true" />
                                    {option.ciudad || "Ciudad no registrada"}
                                  </small>
                                </span>
                                <span className="hpm-hotel-option__meta">
                                  <b>{option.roomOptions?.length || 0}</b> habitaciones
                                  {manualRooms > 0 && <em>{manualRooms} manual{manualRooms === 1 ? "" : "es"}</em>}
                                </span>
                              </button>
                            );
                          })}
                          {visibleHotelOptions.length === 0 && (
                            <div className="hpm-hotel-options__empty">
                              No hay hoteles que coincidan con la búsqueda.
                            </div>
                          )}
                        </div>

                        <div className="hpm-hotel-selector__status">
                          <span>
                            <MdHotel aria-hidden="true" />
                            <strong>{selectedCategoryData.hotelName || "Hotel"}</strong>
                            {selectedCategoryData.ciudad ? ` · ${selectedCategoryData.ciudad}` : ""}
                          </span>
                          <small>
                            {selectedRoomOptions.some((option) => option.manualPricing)
                              ? "Hay habitaciones sin tarifa para esta agencia: completa su precio manualmente."
                              : `${selectedRoomOptions.length} habitación${selectedRoomOptions.length === 1 ? "" : "es"} disponibles para esta agencia.`}
                          </small>
                        </div>
                      </section>
                    )}

                  <div
                    className={`hpm-room-config${
                      activeGroupHasLockedHotelDays ? " hpm-room-config--locked" : ""
                    }`}
                  >
                    <div className="hpm-room-header">
                      <div className="hpm-room-title">
                        Configuración de habitaciones
                      </div>
                      <button
                        className="btn btn-sm"
                        onClick={handleAutoMix}
                        type="button"
                        disabled={activeGroupHasLockedHotelDays}
                        title={
                          activeGroupHasLockedHotelDays
                            ? "Distribución protegida por asignaciones existentes"
                            : undefined
                        }
                      >
                        Auto distribuir
                      </button>
                    </div>

                    {activeGroupHasLockedHotelDays && (
                      <div className="hpm-room-price-lock-notice" role="status">
                        <MdLock aria-hidden="true" />
                        <span>
                          Grupo protegido: contiene noches ya asignadas en la venta
                          cerrada. El hotel, las habitaciones, la distribución y las
                          tarifas se conservan. Usa un grupo nuevo para noches nuevas.
                        </span>
                      </div>
                    )}

                    <div className="hpm-rooms-compact">
                      {selectedRoomOptions.map((roomOption) => {
                        const roomOverrideValue = resolveRoomPriceOverrideValue(
                          roomOption,
                          selectedCategoryPriceOverrides,
                        );
                        const roomCount = roomMix[roomOption.key] ?? "";
                        const isExtraBed = isExtraBedRoomType(roomOption);
                        const physicalRoomCount = Object.entries(roomMix || {}).reduce(
                          (sum, [key, value]) => {
                            const option = selectedRoomOptions.find((item) => item.key === key);
                            return isExtraBedRoomType(option)
                              ? sum
                              : sum + Math.max(0, parseInt(value, 10) || 0);
                          },
                          0,
                        );
                        const numericRoomCount = Math.max(
                          0,
                          parseInt(roomCount, 10) || 0,
                        );
                        const roomUnit =
                          roomOverrideValue !== undefined
                            ? n(roomOverrideValue)
                            : n(roomOption.pricePerRoomNight);
                        const roomPersonStayTotal =
                          numericRoomCount > 0
                            ? round2(
                                (roomUnit *
                                  numericRoomCount *
                                  selectedNightsCount) /
                                  adultEquivalentCount,
                              )
                            : 0;
                        return (
                          <div className="hpm-room-row" key={roomOption.key}>
                            <div className="room-label">
                              {roomOption.label}
                              <small>
                                {isExtraBed
                                  ? " · suplemento +1 pax"
                                  : ` · cap. ${getHotelRoomCapacity(roomOption, 1)}`}
                              </small>
                            </div>

                            <div className="room-controls">
                              <button
                                className="pill-btn"
                                onClick={() =>
                                  updateRoomCount(
                                    roomOption.key,
                                    numericRoomCount - 1,
                                  )
                                }
                                type="button"
                                disabled={activeGroupHasLockedHotelDays}
                                title={
                                  activeGroupHasLockedHotelDays
                                    ? "Distribución protegida por asignaciones existentes"
                                    : undefined
                                }
                              >
                                -
                              </button>
                              <input
                                className="room-cnt"
                                min="0"
                                onChange={(event) =>
                                  updateRoomCount(
                                    roomOption.key,
                                    event.target.value,
                                  )
                                }
                                type="number"
                                value={roomCount}
                                disabled={activeGroupHasLockedHotelDays}
                                aria-readonly={activeGroupHasLockedHotelDays}
                              />
                              <button
                                className="pill-btn"
                                onClick={() =>
                                  updateRoomCount(
                                    roomOption.key,
                                    numericRoomCount + 1,
                                  )
                                }
                                type="button"
                                disabled={
                                  activeGroupHasLockedHotelDays ||
                                  (isExtraBed && numericRoomCount >= physicalRoomCount)
                                }
                                title={
                                  isExtraBed && physicalRoomCount <= 0
                                    ? "Primero agrega una habitación física"
                                    : undefined
                                }
                              >
                                +
                              </button>
                            </div>

                            <div
                              className={`room-price-wrap${
                                activeGroupHasLockedHotelDays ? " locked" : ""
                              }`}
                            >
                              <span className="muted-sm room-price-label">
                                {activeGroupHasLockedHotelDays && (
                                  <MdLock aria-hidden="true" />
                                )}
                                tarifa
                              </span>
                              <input
                                className="room-price"
                                type="number"
                                min="0"
                                step="0.01"
                                disabled={activeGroupHasLockedHotelDays}
                                aria-readonly={activeGroupHasLockedHotelDays}
                                title={
                                  activeGroupHasLockedHotelDays
                                    ? "Tarifa protegida: el grupo contiene noches ya asignadas"
                                    : "Editar tarifa por habitación y noche"
                                }
                                value={
                                  roomOverrideValue !== undefined
                                    ? roomOverrideValue
                                    : n(roomOption.pricePerRoomNight).toFixed(2)
                                }
                                onChange={(e) =>
                                  handleRoomPriceChange(
                                    roomOption.key,
                                    e.target.value,
                                  )
                                }
                                onWheel={(e) => e.currentTarget.blur()}
                                onKeyDown={(e) => {
                                  if (
                                    e.key === "ArrowUp" ||
                                    e.key === "ArrowDown"
                                  ) {
                                    e.preventDefault();
                                  }
                                }}
                              />
                              <span
                                className={`room-person-total${
                                  numericRoomCount > 0 ? " active" : ""
                                }`}
                                title="Aporte de esta habitación al total hotelero por persona"
                              >
                                {numericRoomCount > 0
                                  ? `${formatCurrency(roomPersonStayTotal)} pax`
                                  : "sin uso"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {roomSlots.length > 0 && (
                      <div className="hpm-room-assignments">
                        <div className="hpm-room-assignments__head">
                          <div>
                            <strong>Asignación por habitación</strong>
                            <span>
                              Define en qué habitación entra cada adulto y niño
                              con tarifa adulta.
                            </span>
                          </div>
                          <button
                            className="btn btn-sm"
                            onClick={handleAutoRoomAssignments}
                            type="button"
                          >
                            Reasignar
                          </button>
                        </div>

                          {unassignedHotelPassengerIds.length > 0 && (
                            <div className="hpm-room-passenger-pool">
                              {unassignedHotelPassengerIds.map((passengerId) => (
                                <button
                                  className={`hpm-room-passenger-tag ${
                                    passengerId.startsWith("child:")
                                      ? "is-child"
                                      : "is-adult"
                                  }`}
                                  draggable
                                  key={`pool-${passengerId}`}
                                  onDragStart={() => setDraggedRoomPassengerId(passengerId)}
                                  type="button"
                                >
                                  {passengerId.startsWith("child:") ? (
                                    <FaChild />
                                  ) : (
                                    <FaUser />
                                  )}
                                  <span>
                                    {hotelPassengerLabelMap[passengerId] ||
                                      passengerId}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="hpm-room-assignment-grid">
                            {roomSlots.map((slot) => {
                              const summary =
                                roomAssignmentSummary[slot.id] || {};
                              const passengerIds = summary.passengerIds || [];
                              const roomHasAdultIgv = passengerIds.some((id) =>
                                peruvianPassengerIds.has(String(id)),
                              );
                              const hasCapacity =
                                passengerIds.length < Math.max(1, slot.capacity);

                              return (
                                <div
                                  className={`hpm-room-assignment-card ${
                                    hasCapacity ? "can-drop" : "is-full"
                                  }`}
                                  key={slot.id}
                                  onDragOver={(e) => {
                                    if (!activeGroupHasLockedHotelDays && hasCapacity) e.preventDefault();
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    if (!activeGroupHasLockedHotelDays && draggedRoomPassengerId && hasCapacity) {
                                      handleDropPassengerToRoom(slot.id, draggedRoomPassengerId);
                                    }
                                  }}
                                >
                                <div className="hpm-room-assignment-card__top">
                                  <strong>{slot.label}</strong>
                                  <span>
                                    {passengerIds.length}/{slot.capacity} pax
                                  </span>
                                  {roomHasAdultIgv && (
                                    <span
                                      className="hpm-room-igv-pill"
                                      title="IGV 18% aplicado porque la habitación incluye al menos un pasajero nacional"
                                    >
                                      IGV 18%
                                    </span>
                                  )}
                                </div>

                                <div className="hpm-room-assignment-tags">
                                  {passengerIds.length > 0 ? (
                                    passengerIds.map((passengerId) => (
                                      <button
                                      className={`hpm-room-passenger-tag ${
                                        passengerId.startsWith("child:")
                                          ? "is-child"
                                          : "is-adult"
                                      }`}
                                      draggable={!activeGroupHasLockedHotelDays}
                                      disabled={activeGroupHasLockedHotelDays}
                                      key={passengerId}
                                      onClick={() =>
                                        handleRemovePassengerFromRoom(
                                          slot.id,
                                          passengerId,
                                        )
                                      }
                                      onDragStart={() => setDraggedRoomPassengerId(passengerId)}
                                      type="button"
                                    >
                                      {passengerId.startsWith("child:") ? (
                                        <FaChild />
                                      ) : (
                                        <FaUser />
                                      )}
                                      <span>
                                        {hotelPassengerLabelMap[
                                          passengerId
                                        ] || passengerId}
                                      </span>
                                    </button>
                                    ))
                                  ) : (
                                    <span className="hpm-room-empty">
                                      Sin pasajeros
                                    </span>
                                  )}
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        {hasUnassignedHotelPassengers && (
                          <div className="hpm-room-unassigned">
                            Sin habitación:{" "}
                            {unassignedHotelPassengerIds
                              .map(
                                (passengerId) =>
                                  hotelPassengerLabelMap[passengerId] ||
                                  passengerId,
                              )
                              .join(", ")}
                          </div>
                        )}
                      </div>
                    )}

                    {hotelPassengerPricingRows.length > 0 && (
                      <div className="hpm-passenger-pricing">
                        <div className="hpm-passenger-pricing__head">
                          <div>
                            <strong>Precio hotelero por pasajero</strong>
                            <span>
                              La habitación se reparte entre adultos y niños con
                              tarifa adulta. Los niños con tarifa propia no reducen ese divisor y el IGV se detalla aparte.
                            </span>
                          </div>
                          <small>{selectedNightsCount} noche{selectedNightsCount === 1 ? "" : "s"}</small>
                        </div>
                        <div className="hpm-passenger-pricing__table" role="table">
                          <div className="hpm-passenger-pricing__row hpm-passenger-pricing__row--header" role="row">
                            <span>Pasajero</span>
                            <span>Habitación</span>
                            <span>Base</span>
                            <span>IGV</span>
                            <span>Total hotel</span>
                          </div>
                          {hotelPassengerPricingRows.map((row) => (
                            <div className="hpm-passenger-pricing__row" role="row" key={row.id}>
                              <span className="hpm-passenger-pricing__passenger">
                                <strong>{row.passenger}</strong>
                                <small>
                                  {row.passengerType} · {row.nationality}
                                </small>
                              </span>
                              <span>
                                {row.room}
                                {row.roomHasIgv && (
                                  <small className="hpm-passenger-pricing__igv-note">
                                    Habitación con IGV
                                  </small>
                                )}
                              </span>
                              <strong>{formatCurrency(row.base)}</strong>
                              <strong className={row.igv > 0 ? "has-igv" : ""}>
                                {formatCurrency(row.igv)}
                              </strong>
                              <strong className="is-total">
                                {formatCurrency(row.total)}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="hpm-totals-compact">
                      <span>
                        Habitaciones: <b>{perNightCost.roomsCount}</b>
                      </span>
                      {perNightCost.extraBedsCount > 0 && (
                        <span>
                          Camas adicionales: <b>{perNightCost.extraBedsCount}</b>
                        </span>
                      )}
                      <span>
                        Capacidad:{" "}
                        <b>
                          {roomCapacityTotal}/{adultEquivalentCount} pax
                        </b>
                      </span>
                      <span>
                        Días seleccionados: <b>{selectedNightsCount}</b>
                      </span>
                      <span className="total-highlight">
                        Total por noche:{" "}
                        <b>
                          {formatCurrency(
                            selectedRow?.perNightSum ||
                              perNightCost.perNightSum,
                          )}
                        </b>
                      </span>
                      <span className="grand-highlight">
                        Hotel total:{" "}
                        <b>{formatCurrency(selectedRow?.hotelTotal || 0)}</b>
                      </span>
                    </div>
                  </div>

                  {!activeGroupHasLockedHotelDays &&
                    (childIds.length > 0 || convertedChildIds.length > 0) && (
                    <div className="hpm-room-config">
                      <div className="hpm-room-header">
                        <div className="hpm-room-title">
                          Configuración de niños
                        </div>
                      </div>

                      <div className="sr__pax">
                        {adultIds.length > 0 && (
                          <span
                            className="sr__pax-tag sr__pax-tag--adult"
                            title={
                              convertedChildIds.length > 0
                                ? `${adultIds.length} adultos (${convertedChildIds.length} niño${convertedChildIds.length > 1 ? "s" : ""} con tarifa de adulto)`
                                : `${adultIds.length} adultos`
                            }
                          >
                            <FaUser /> {adultIds.length}
                            {convertedChildIds.length > 0 && (
                              <span className="sr__pax-converted">
                                +{convertedChildIds.length} eq
                              </span>
                            )}
                          </span>
                        )}

                        <button
                          type="button"
                          className={`sr__pax-tag sr__pax-tag--child ${showChildPanel ? "active" : ""}`}
                          onClick={() => setShowChildPanel((prev) => !prev)}
                          title={
                            convertedChildIds.length > 0
                              ? `${childIds.length + convertedChildIds.length} niño${childIds.length + convertedChildIds.length === 1 ? "" : "s"}; ${convertedChildIds.length} con tarifa adulto`
                              : "Gestionar niños"
                          }
                        >
                          <FaChild />
                          <span>{childIds.length + convertedChildIds.length}</span>
                          <span className="sr__pax-label">
                            {childIds.length + convertedChildIds.length === 1
                              ? "niño"
                              : "niños"}
                          </span>
                          {showChildPanel ? <MdExpandLess /> : <MdExpandMore />}
                        </button>
                      </div>

                      {showChildPanel && (
                        <ChildrenPanel
                          key={selectedCat || "none"}
                          childIds={childIds}
                          convertedEntries={convertedChildIds.map((id) => ({
                            childId: id,
                            revertKey: id,
                          }))}
                          childPriceMap={childPriceMap}
                          adultPrice={adultPrice}
                          onApplyUniform={applyUniformChildPrice}
                          onConvertChild={handleConvertChildToAdult}
                          onRevertChild={handleRevertAdultToChild}
                          onApplyIndividual={applyIndividualChildPrice}
                        />
                      )}
                    </div>
                  )}
                </>
              ) : selectedCat &&
                Object.keys(effectiveRoomOptionsByCategory || {}).length ===
                  0 ? (
                /* Dict is still fetching; category is known, rooms not available yet */
                <div className="hpm-summary-block">
                  <div className="hpm-summary-title">Cargando opciones...</div>
                  <p>
                    Recuperando disponibilidad de habitaciones para la categoría
                    seleccionada.
                  </p>
                </div>
              ) : (
                <div className="hpm-summary-block">
                  <div className="hpm-summary-title">
                    Selecciona una categoría
                  </div>
                  <p>
                    Elige una categoría y al menos un día para generar el
                    resumen hotelero.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="hpm-footer">
          <span className="hpm-note">
            La selección se guarda en los servicios automáticos del itinerario y
            conserva el detalle editable del hotel.
          </span>

          <div className="hpm-footer-right">
            <button className="btn" onClick={onClose} type="button">
              Cancelar
            </button>
            <button
              className="btn primary"
              disabled={
                (!selectedRow &&
                  !dayGroups.some((g) => g.category && g.dayIndices.length > 0) &&
                  !initialSelectedHotel) ||
                (hasUnassignedHotelPassengers &&
                  (selectedRow ||
                    dayGroups.some(
                      (g) => g.category && g.dayIndices.length > 0,
                    )))
              }
              onClick={handleSave}
              type="button"
            >
              {!selectedRow &&
              !dayGroups.some((g) => g.category && g.dayIndices.length > 0) &&
              initialSelectedHotel
                ? "Quitar hotel"
                : "Guardar selección"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default HotelPricingModal;
