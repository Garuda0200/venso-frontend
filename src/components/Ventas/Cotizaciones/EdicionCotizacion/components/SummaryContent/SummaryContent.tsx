import { useMemo, memo, Fragment } from "react";
import {
  MdPerson,
  MdChildCare,
  MdLocationOn,
  MdReceipt,
  MdRoomService,
  MdHotel,
  MdDirectionsCar,
  MdRestaurant,
  MdLocalActivity,
  MdFlight,
  MdTrain,
  MdAssignment,
  MdCalendarToday,
  MdCode,
  MdPeopleOutline,
  MdMonetizationOn,
  MdWarning,
} from "react-icons/md";
import { formatCurrency, formatDateRangeLong } from "../../utils/formatters";
import { getHotelRoomCapacity } from "../../../../../../utils/hotelRoomTypes";
import ServiceDetailedInfo from "../DaysEditor/components/ServiceDetailedInfo";
import PassengerPriceVerification from "../PassengerPriceVerification/PassengerPriceVerification";
import "./SummaryContent.scss";
import "../AdditionalCosts/AdditionalCosts.scss";
import { detectServiceType } from "../DaysEditor/utils/serviceTypeMapper";
import {
  calculateExternalItineraryBreakdown,
  calculateCotizacionFinancialSummary,
  ensureNumber,
} from "../../utils/cotizacionFinancialSummary";
import {
  aggregatePerRoomPricingByStayGroup,
  buildFinancialSummaryParts,
  buildRoomBasedFinancialSummaryParts,
  calculateAdditionalCostForAudience,
  resolveConvertedChildRoomFinancials,
  resolveChildChargeSummary,
} from "../../utils/financialDisplayHelpers";
import { buildPreviewPerRoomPricing } from "../../utils/pdfHotelPreviewData";
import { buildSummaryContentPricingModel } from "../../utils/summaryContentPricingParts";
import {
  resolveQuotationPricingSnapshot,
  resolveVisibleSummaryTotalFromAdditionalCosts,
} from "../../utils/visibleSummaryTotals";
import {
  getTicketEntrada,
  getTicketProcedencia,
  getTicketTipoUsuario,
  normalizeTicketProcedencia,
} from "../../utils/ticketBeneficiaries";
import {
  isPeruvianPassenger,
  passengerIdMatchesSet,
} from "../../utils/igvUtils";
import {
  aggregateDayChildPricingRows,
  aggregateServiceAdultPricingRows,
  buildChildPricingRows,
  buildServiceAdultPricingRows,
  buildServiceChildPricingRows,
  enrichPassengerPricePartsWithRoomImpact,
  getPassengerPresentation,
  getRoomPassengerIds,
  resolveRoomNationalityImpact,
  resolveServiceAdultUnitPriceForPresentation,
} from "../../utils/passengerPricingPresentation";
import { resolveCanonicalChildServicePrice } from "../../utils/childServicePricingReconciliation";

// Helpers
const validateServiceStructure = (service) =>
  service &&
  typeof service === "object" &&
  service.tariff &&
  typeof service.tariff === "object";

const ORDERED_HOTEL_KEYS = ["2", "3", "3s", "4", "5"];
const round2 = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const resolveFormulaPartBeneficiaryCount = (part = {}) => {
  const direct = Number(part?.beneficiaries ?? part?.count ?? part?.pax ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const label = String(part?.label || "");
  const match = label.match(/\((\d+)\)/);
  if (match) {
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return 1;
};

const normalizeRoomText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const isTicketSummaryService = (service = {}) => {
  const type = String(detectServiceType(service) || service?.typeService || "").toLowerCase();
  return type === "tickets" || Boolean(service?.childService?.ticket || service?.ticket);
};

const groupTicketServicesForSummary = (services = []) => {
  const result = [];
  const groups = new Map();

  (Array.isArray(services) ? services : []).forEach((service) => {
    if (!isTicketSummaryService(service)) {
      result.push(service);
      return;
    }

    const entrada = getTicketEntrada(service);
    const key = normalizeRoomText(entrada) || `ticket-${groups.size + 1}`;
    if (!groups.has(key)) {
      const group = {
        __ticketGroup: true,
        key,
        entrada,
        services: [],
      };
      groups.set(key, group);
      result.push(group);
    }
    groups.get(key).services.push(service);
  });

  return result;
};

const parseSummaryBeneficiaries = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseSummaryBeneficiaries(entry));
  }

  if (value && typeof value === "object") {
    return [value];
  }

  if (typeof value === "number") return [{ id: String(value) }];
  if (typeof value !== "string") return [];
  const normalized = value.trim();
  if (!normalized) return [];

  try {
    return parseSummaryBeneficiaries(JSON.parse(normalized));
  } catch {
    // Some legacy quotations persist a beneficiary directly as "adult:1"
    // instead of wrapping it in an object. Keep it as an id so the room
    // occupancy still follows itinerario_servicio.
    return [{ id: normalized }];
  }
};

const getSummaryBeneficiaryId = (entry) => {
  if (entry == null) return "";
  if (typeof entry === "string" || typeof entry === "number") {
    return String(entry).trim();
  }
  return String(
    entry?.id ||
      entry?.passengerId ||
      entry?.passenger_id ||
      entry?.beneficiaryId ||
      entry?.beneficiary_id ||
      "",
  ).trim();
};

const mergeSummaryBeneficiaries = (...sources) => {
  const merged = new Map();

  sources.flatMap(parseSummaryBeneficiaries).forEach((entry) => {
    const id = getSummaryBeneficiaryId(entry);
    const childOrigin = String(
      entry?.child_origin || entry?.childOrigin || "",
    ).trim();
    const key = childOrigin || id;
    if (!key) return;

    const normalizedEntry =
      entry && typeof entry === "object"
        ? { ...entry, ...(id ? { id } : {}) }
        : { id };
    merged.set(key, {
      ...(merged.get(key) || {}),
      ...normalizedEntry,
      ...(childOrigin ? { child_origin: childOrigin } : {}),
    });
  });

  return [...merged.values()];
};

const getSummaryServiceType = (service = {}) =>
  String(
    detectServiceType(service) ||
      service?.typeService ||
      service?.tipo_servicio ||
      service?.categoria ||
      service?.type ||
      "",
  ).toLowerCase();

const isHotelSummaryService = (service = {}) => {
  const type = getSummaryServiceType(service);
  return (
    type === "hotel" ||
    type === "hoteles" ||
    Boolean(
      service?.childService?.tipo_habitacion ||
        service?.childService?.habitacion?.tipo_habitacion ||
        service?.tipo_habitacion,
    )
  );
};

const getTruthyConvertedChildIds = (service = {}) => {
  const convertedIds = new Set();
  const addConvertedMap = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    Object.entries(value).forEach(([id, enabled]) => {
      if (enabled && String(id || "").startsWith("child:")) {
        convertedIds.add(String(id).trim());
      }
    });
  };
  const addConvertedList = (value) => {
    parseSummaryBeneficiaries(value).forEach((entry) => {
      const id = getSummaryBeneficiaryId(entry);
      const childOrigin = String(
        entry?.child_origin || entry?.childOrigin || "",
      ).trim();
      const convertedId = childOrigin || (id.startsWith("child:") ? id : "");
      if (convertedId) convertedIds.add(convertedId);
    });
  };

  addConvertedMap(service?.convertedChildToAdultMap);
  addConvertedMap(service?.ninosComoAdulto);
  addConvertedMap(service?.passengerSelection?.convertedChildToAdultMap);
  addConvertedMap(service?.passengerSelection?.ninosComoAdulto);
  addConvertedList(service?.roomConvertedChildPassengerIds);
  addConvertedList(service?.beneficiariosAdultos);
  addConvertedList(service?.beneficiarios_adultos);
  addConvertedList(service?.beneficiarios_adulto);

  return convertedIds;
};

const getHotelServiceBeneficiaries = (service = {}) => {
  const convertedChildIds = getTruthyConvertedChildIds(service);
  const persistedAdults = mergeSummaryBeneficiaries(
    service?.beneficiariosAdultos,
    service?.beneficiarios_adultos,
    service?.beneficiarios_adulto,
    service?.beneficiariosAdulto,
    service?.assignedBeneficiariosAdultos,
    service?.assigned_beneficiarios_adultos,
  );
  const persistedChildren = mergeSummaryBeneficiaries(
    service?.beneficiariosNinos,
    service?.beneficiarios_ninos,
    service?.beneficiarios_nino,
    service?.beneficiariosNino,
    service?.assignedBeneficiariosNinos,
    service?.assigned_beneficiarios_ninos,
  );
  const runtimeIds = mergeSummaryBeneficiaries(
    service?.roomPassengerIds,
    service?.assignedPassengerIds,
    service?.passengerSelection?.selectedIds,
  );
  const runtimeAdultIds = mergeSummaryBeneficiaries(
    service?.roomAdultPassengerIds,
  );
  const runtimeConvertedChildren = [...convertedChildIds].map((id) => ({
    id,
    child_origin: id,
  }));

  const adults = mergeSummaryBeneficiaries(
    persistedAdults,
    runtimeAdultIds,
    runtimeIds.filter((entry) => {
      const id = getSummaryBeneficiaryId(entry);
      return id.startsWith("adult:");
    }),
    runtimeConvertedChildren,
  );
  const children = mergeSummaryBeneficiaries(
    persistedChildren,
    runtimeIds.filter((entry) => {
      const id = getSummaryBeneficiaryId(entry);
      return id.startsWith("child:") && !convertedChildIds.has(id);
    }),
  );

  return { adults, children };
};

const readFirstPositiveNumber = (...values) => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
};

const getHotelServiceRoomType = (service = {}) =>
  String(
    service?.childService?.tipo_habitacion ||
      service?.childService?.habitacion?.tipo_habitacion ||
      service?.tipo_habitacion ||
      service?.roomType ||
      "Habitación",
  ).trim();

const getHotelServiceName = (service = {}) =>
  String(
    service?.parentService?.nombre_hotel ||
      service?.parentService?.nombre ||
      service?.nombre_hotel ||
      service?.hotelName ||
      "Hotel",
  ).trim();

const getHotelServiceCategoryLabel = (service = {}, fallback = "") => {
  const direct =
    service?.parentService?.categoria ||
    service?.parentService?.estrellas ||
    service?.categoria_hotel ||
    service?.hotelCategory ||
    service?.category;
  if (direct != null && String(direct).trim()) {
    const normalized = String(direct).trim().toLowerCase();
    return HOTEL_CATEGORY_GROUP_LABELS[normalized] || String(direct).trim();
  }

  const name = getHotelServiceName(service);
  const match = name.match(/(\d)\s*estrellas?(?:\s+superior)?/i);
  return match ? match[0] : fallback || "Categoría hotelera";
};

const inferRoomCapacity = (room = {}) => getHotelRoomCapacity(room, 2);

const getHotelPricingBreakdown = (hotel = {}) => {
  const perNightBreakdown = Array.isArray(hotel?.perNightBreakdowns)
    ? hotel.perNightBreakdowns.find(
        (items) => Array.isArray(items) && items.length > 0,
      )
    : null;
  if (Array.isArray(perNightBreakdown) && perNightBreakdown.length > 0) {
    return perNightBreakdown;
  }
  return Array.isArray(hotel?.breakdown) ? hotel.breakdown : [];
};

const buildRoomOptionsFromBreakdown = (breakdown = []) =>
  (Array.isArray(breakdown) ? breakdown : [])
    .map((room) => {
      const count = Math.max(1, Number(room?.cnt || room?.count || 1) || 1);
      const unit =
        Number(room?.unit) ||
        (Number(room?.sub) > 0 ? Number(room.sub) / count : 0);
      const key = String(room?.key || normalizeRoomText(room?.label)).trim();
      if (!key || !Number.isFinite(unit) || unit <= 0) return null;

      return {
        key,
        label: room?.label || key,
        capacity: inferRoomCapacity(room),
        pricePerRoomNight: unit,
        id_habitacion: room?.id_habitacion || null,
      };
    })
    .filter(Boolean);

const buildRoomMixFromBreakdown = (breakdown = []) =>
  (Array.isArray(breakdown) ? breakdown : []).reduce((accumulator, room) => {
    const key = String(room?.key || normalizeRoomText(room?.label)).trim();
    const count = Math.max(0, Number(room?.cnt || room?.count || 0) || 0);
    if (!key || count <= 0) return accumulator;
    return {
      ...accumulator,
      [key]: count,
    };
  }, {});

const getSelectedCategoryRow = (hotel = {}) => {
  const rows = Array.isArray(hotel?.allCategoryRows)
    ? hotel.allCategoryRows
    : Array.isArray(hotel?.categoryRows)
      ? hotel.categoryRows
      : [];
  if (rows.length === 0) return null;

  const category = String(hotel?.category || hotel?.key || "").toLowerCase();
  return (
    rows.find((row) => row?.isSelected) ||
    rows.find(
      (row) => String(row?.category || "").toLowerCase() === category,
    ) ||
    null
  );
};

const normalizePriceOverrideMap = (overrides = {}) => {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return {};
  }

  return Object.entries(overrides).reduce((accumulator, [roomKey, value]) => {
    const parsed = Number.parseFloat(value);
    if (!roomKey || !Number.isFinite(parsed) || parsed < 0) {
      return accumulator;
    }

    return { ...accumulator, [roomKey]: parsed };
  }, {});
};

const getRoomAliases = (room = {}) => {
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
    const normalized = normalizeRoomText(raw);
    if (normalized) {
      aliases.add(normalized);
      aliases.add(normalized.split(":")[0]);
    }
  });
  return [...aliases].filter(Boolean);
};

const applyRoomPriceOverridesToOptions = (roomOptions = [], overrides = {}) => {
  const normalizedOverrides = normalizePriceOverrideMap(overrides);
  if (Object.keys(normalizedOverrides).length === 0) {
    return Array.isArray(roomOptions) ? roomOptions : [];
  }

  return (Array.isArray(roomOptions) ? roomOptions : []).map((room) => {
    const overrideKey = getRoomAliases(room).find((alias) =>
      Object.prototype.hasOwnProperty.call(normalizedOverrides, alias),
    );
    if (!overrideKey) return room;
    const nextPrice = normalizedOverrides[overrideKey];
    return {
      ...room,
      pricePerRoomNight: nextPrice,
      roomUnitPrice: nextPrice,
      precio_servicio: nextPrice,
      precioServicio: nextPrice,
    };
  });
};

const getGroupNightIndices = (group = {}) => {
  const source = Array.isArray(group?.dayIndices)
    ? group.dayIndices
    : Array.isArray(group?.selectedNightIndices)
      ? group.selectedNightIndices
      : [];
  return [...new Set(source)]
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value >= 0)
    .sort((a, b) => a - b);
};

const prefixGroupPricingRows = (rows = [], group = {}, groupIndex = 0) => {
  const dayIdentity = getGroupNightIndices(group).join("-");
  const groupKey =
    group?.id ||
    group?.groupKey ||
    `${group?.category || "group"}-${groupIndex + 1}${dayIdentity ? `:${dayIdentity}` : ""}`;
  const groupLabel = group?.label || `Grupo ${groupIndex + 1}`;
  return (Array.isArray(rows) ? rows : []).map((room) => {
    if (room?.groupKey) return room;

    return {
      ...room,
      key: `${groupKey}:${room.key}`,
      groupKey,
      groupLabel,
      groupCategory: group?.category || null,
      groupDayIndices: getGroupNightIndices(group),
      roomDetails: Array.isArray(room?.roomDetails)
        ? room.roomDetails.map((detail) => ({
            ...detail,
            roomId: `${groupKey}:${detail.roomId}`,
          }))
        : room.roomDetails,
    };
  });
};

const buildGroupedFallbackPerRoomPricing = ({
  hotel,
  peopleCount,
  subtotalIndividual,
  nonHotelExplicitChildTotal,
  nonHotelConvertedChildTotal,
  additionalCosts,
  externalAdultTotal,
  peopleDetails,
}) => {
  const groups = Array.isArray(hotel?.dayGroups) ? hotel.dayGroups : [];
  if (groups.length === 0) return [];

  return groups.flatMap((group, groupIndex) => {
    const existing = Array.isArray(group?.perRoomPricing)
      ? group.perRoomPricing
      : [];
    if (existing.length > 0) {
      return prefixGroupPricingRows(existing, group, groupIndex);
    }

    const breakdown = getHotelPricingBreakdown(group);
    const rawRoomOptions =
      Array.isArray(group?.roomOptions) && group.roomOptions.length > 0
        ? group.roomOptions
        : Array.isArray(hotel?.roomOptions) && hotel.roomOptions.length > 0
          ? hotel.roomOptions
          : buildRoomOptionsFromBreakdown(breakdown);
    const roomOptions = applyRoomPriceOverridesToOptions(
      rawRoomOptions,
      group?.priceOverrides || group?.price_overrides || {},
    );
    const mix =
      group?.roomMix &&
      typeof group.roomMix === "object" &&
      Object.keys(group.roomMix).length
        ? group.roomMix
        : group?.mix &&
            typeof group.mix === "object" &&
            Object.keys(group.mix).length
          ? group.mix
          : buildRoomMixFromBreakdown(breakdown);
    if (!roomOptions.length || !Object.keys(mix).length) return [];

    const dayIndices = getGroupNightIndices(group);
    const nights = Math.max(
      1,
      dayIndices.length || Number(group?.nights || hotel?.nights || 1) || 1,
    );
    const rows = buildPreviewPerRoomPricing({
      hotel: {
        ...hotel,
        ...group,
        roomAssignments: group.roomAssignments || hotel.roomAssignments || {},
        childPricing: group.childPricing || hotel.childPricing || {},
      },
      row: { category: group.category || hotel.category, mix },
      roomOptions,
      adultsCount: Math.max(1, Number(peopleCount?.adults || 0) || 1),
      childrenCount: Math.max(0, Number(peopleCount?.children || 0) || 0),
      nonHotelsTotal: subtotalIndividual,
      nonHotelExplicitChildTotal,
      nonHotelConvertedChildTotal,
      additionalCfg: additionalCosts,
      nights,
      externalAdultTotal,
      peopleDetails,
    });

    return prefixGroupPricingRows(rows, group, groupIndex);
  });
};

const buildFallbackPerRoomPricing = ({
  hotel,
  peopleCount,
  subtotalIndividual,
  nonHotelExplicitChildTotal,
  nonHotelConvertedChildTotal,
  additionalCosts,
  externalAdultTotal,
  peopleDetails,
}) => {
  if (!hotel || typeof hotel !== "object") return [];

  const groupedPricing = buildGroupedFallbackPerRoomPricing({
    hotel,
    peopleCount,
    subtotalIndividual,
    nonHotelExplicitChildTotal,
    nonHotelConvertedChildTotal,
    additionalCosts,
    externalAdultTotal,
    peopleDetails,
  });
  if (groupedPricing.length > 0) return groupedPricing;

  const selectedRow = getSelectedCategoryRow(hotel);
  const existingPricing = [
    hotel?.perRoomPricing,
    selectedRow?.perRoomPricing,
  ].find((items) => Array.isArray(items) && items.length > 0);
  if (existingPricing) return existingPricing;

  const breakdown = getHotelPricingBreakdown(hotel);
  const roomOptions = applyRoomPriceOverridesToOptions(
    Array.isArray(hotel?.roomOptions) && hotel.roomOptions.length > 0
      ? hotel.roomOptions
      : Array.isArray(selectedRow?.roomOptions) &&
          selectedRow.roomOptions.length > 0
        ? selectedRow.roomOptions
        : buildRoomOptionsFromBreakdown(breakdown),
    hotel?.priceOverrides || hotel?.price_overrides || {},
  );
  const mix =
    hotel?.mix && typeof hotel.mix === "object" && Object.keys(hotel.mix).length
      ? hotel.mix
      : selectedRow?.mix &&
          typeof selectedRow.mix === "object" &&
          Object.keys(selectedRow.mix).length
        ? selectedRow.mix
        : buildRoomMixFromBreakdown(breakdown);

  if (!roomOptions.length || !Object.keys(mix).length) return [];

  const nights = Array.isArray(hotel?.selectedNightIndices)
    ? hotel.selectedNightIndices.length
    : Number(hotel?.nights || selectedRow?.nights || 1) || 1;

  return buildPreviewPerRoomPricing({
    hotel,
    row: { category: hotel.category || selectedRow?.category, mix },
    roomOptions,
    adultsCount: Math.max(1, Number(peopleCount?.adults || 0) || 1),
    childrenCount: Math.max(0, Number(peopleCount?.children || 0) || 0),
    nonHotelsTotal: subtotalIndividual,
    nonHotelExplicitChildTotal,
    nonHotelConvertedChildTotal,
    additionalCfg: additionalCosts,
    nights,
    externalAdultTotal,
    peopleDetails,
  });
};

const getRoomIgvStayTotal = (room = {}) =>
  (room.roomDetails || []).reduce((sum, detail) => {
    if (!detail?.hasIgv && !detail?.tieneIgv) return sum;
    const unit = Number(
      detail.unitWithIgv ?? detail.unit ?? detail.roomUnitPrice ?? 0,
    );
    const nights =
      unit > 0
        ? Number(detail.hotelTotalRoom || 0) / unit
        : Number(room.nights || 1);
    return (
      sum + Number(detail.igvAmount || 0) * Math.max(1, Number(nights || 1))
    );
  }, 0);

const getRoomBeneficiaryCount = (room = {}) =>
  Math.max(
    0,
    Number(room?.beneficiaries || 0) ||
      (Array.isArray(room?.passengerIds) ? room.passengerIds.length : 0) ||
      Number(room?.adultBeneficiaries || 0) +
        Number(room?.convertedChildBeneficiaries || 0),
  );

const getRoomIgvPerPerson = (room = {}) => {
  const beneficiaries = getRoomBeneficiaryCount(room);
  return beneficiaries > 0
    ? round2(getRoomIgvStayTotal(room) / beneficiaries)
    : 0;
};


const HOTEL_CATEGORY_GROUP_LABELS = {
  2: "2 Estándar",
  3: "3 Estándar",
  "3s": "3 Superior",
  4: "4 Estrellas",
  5: "5 Estrellas",
  ["sin-hotel"]: "Sin hotel",
};

const normalizeHotelGroupCategory = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeRoomLabelForGroup = (value) =>
  String(value || "Habitación")
    .replace(/^HABITACION\s+/i, "")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatHotelGroupCategoryLabel = (category, group = {}) => {
  const normalized = normalizeHotelGroupCategory(category || group?.category);
  const base =
    HOTEL_CATEGORY_GROUP_LABELS[normalized] ||
    group?.label ||
    group?.categoryLabel ||
    (normalized ? `${String(normalized).toUpperCase()} Estrellas` : "Hotel");
  const city = String(group?.ciudad || group?.city || group?.hotelCity || "").trim();
  return normalized === "5" && city ? `${base} · ${city.toUpperCase()}` : base;
};

const formatHotelGroupDaysLabel = (indices = []) =>
  [...new Set(Array.isArray(indices) ? indices : [])]
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value >= 0)
    .sort((a, b) => a - b)
    .map((value) => `D${value + 1}`)
    .join(", ");

const sameHotelGroupDays = (left = [], right = []) => {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => Number(value) === Number(right[index]));
};

const resolveHotelGroupMeta = (room = {}, selectedHotel = {}, index = 0) => {
  const groups = Array.isArray(selectedHotel?.dayGroups) ? selectedHotel.dayGroups : [];
  const roomDays = getGroupNightIndices(room);
  const roomGroupKey = String(room?.groupKey || room?.groupId || "").trim();
  const roomCategory = normalizeHotelGroupCategory(room?.groupCategory || room?.category);
  const matchedIndex = groups.findIndex((group, groupIndex) => {
    const groupDays = getGroupNightIndices(group);
    const groupKey = String(group?.id || group?.groupKey || "").trim();
    const generatedKey = `${normalizeHotelGroupCategory(group?.category)}-${groupIndex + 1}`;
    const groupCategory = normalizeHotelGroupCategory(group?.category);
    if (groupKey && roomGroupKey && groupKey === roomGroupKey) return true;
    if (roomGroupKey && generatedKey === roomGroupKey) return true;
    return (
      roomCategory &&
      groupCategory === roomCategory &&
      roomDays.length > 0 &&
      sameHotelGroupDays(groupDays, roomDays)
    );
  });
  const matchedGroup = matchedIndex >= 0 ? groups[matchedIndex] : null;
  const order = matchedIndex >= 0 ? matchedIndex : index;
  const category =
    roomCategory ||
    normalizeHotelGroupCategory(matchedGroup?.category) ||
    normalizeHotelGroupCategory(selectedHotel?.category);
  const dayIndices = roomDays.length > 0 ? roomDays : getGroupNightIndices(matchedGroup);

  return {
    key: [roomGroupKey || `${category || "hotel"}-${order + 1}`, dayIndices.join("-")]
      .filter(Boolean)
      .join(":"),
    order,
    label: room?.groupLabel || matchedGroup?.label || `Grupo ${order + 1}`,
    category,
    categoryLabel: formatHotelGroupCategoryLabel(category, matchedGroup || room),
    daysLabel: formatHotelGroupDaysLabel(dayIndices),
  };
};

const buildHotelRoomGroupBreakdown = (
  perRoomPricing = [],
  selectedHotel = {},
  peopleDetails = {},
) => {
  const groups = new Map();

  (Array.isArray(perRoomPricing) ? perRoomPricing : []).forEach((room, index) => {
    const adultBeneficiaries = Number(room?.adultBeneficiaries || 0);
    const convertedChildBeneficiaries = Number(room?.convertedChildBeneficiaries || 0);
    if (adultBeneficiaries <= 0 && convertedChildBeneficiaries <= 0) return;

    const meta = resolveHotelGroupMeta(room, selectedHotel, index);
    const target = groups.get(meta.key) || { ...meta, rooms: [] };
    const roomLabel = normalizeRoomLabelForGroup(room?.label || room?.baseLabel);
    const nationalityImpact = resolveRoomNationalityImpact(room, peopleDetails);

    if (adultBeneficiaries > 0) {
      target.rooms.push({
        key: `${room?.key || index}-adult`,
        label: roomLabel,
        value: Number(room?.hotelPerPerson || 0),
        beneficiaries: adultBeneficiaries,
        ...nationalityImpact,
      });
    }

    if (convertedChildBeneficiaries > 0) {
      target.rooms.push({
        key: `${room?.key || index}-child`,
        label: `Niños ${roomLabel}`,
        value: Number(room?.convertedChildHotelPerPerson || room?.hotelPerPerson || 0),
        beneficiaries: convertedChildBeneficiaries,
        child: true,
        ...nationalityImpact,
      });
    }

    groups.set(meta.key, target);
  });

  return Array.from(groups.values()).sort((left, right) => left.order - right.order);
};

// ===============================
// Component
// ===============================
const SummaryContent = memo(({ cotizacion, readonly = false }) => {
  // Normalización de estructura (acepta snake_case y camelCase)
  const normalizedCotizacion = useMemo(() => {
    if (!cotizacion) return {};
    const peopleDetails = cotizacion.peopleDetails || {
      adults: [],
      children: [],
    };
    const peopleCount = cotizacion.peopleCount || { adults: 1, children: 0 };
    const rawAdditionalCosts =
      cotizacion.additionalCosts ||
      cotizacion.additionalcosts ||
      cotizacion.additional_costs ||
      {};
    const additionalCosts = {
      ...rawAdditionalCosts,
      nonHotelExplicitChildTotalsById:
        rawAdditionalCosts?.nonHotelExplicitChildTotalsById ||
        cotizacion.nonHotelExplicitChildTotalsById ||
        cotizacion.baseExplicitChildTotalsById ||
        {},
      nonHotelConvertedChildTotalsById:
        rawAdditionalCosts?.nonHotelConvertedChildTotalsById ||
        cotizacion.nonHotelConvertedChildTotalsById ||
        cotizacion.baseConvertedChildTotalsById ||
        {},
      hotelExplicitChildTotalsById:
        rawAdditionalCosts?.hotelExplicitChildTotalsById ||
        cotizacion.hotelExplicitChildTotalsById ||
        {},
      hotelConvertedChildTotalsById:
        rawAdditionalCosts?.hotelConvertedChildTotalsById ||
        cotizacion.hotelConvertedChildTotalsById ||
        {},
    };
    const selectedHotel = cotizacion.selectedHotel ?? null;
    const externalItinerary =
      cotizacion.itinerario_externo ?? cotizacion.itinerarioExterno ?? [];
    const subtotalIndividual =
      cotizacion.subtotalIndividual ??
      cotizacion.subtotal_individual ??
      cotizacion.nonHotelsTotal ??
      0;
    const nonHotelConvertedChildTotal =
      cotizacion.nonHotelConvertedChildTotal ?? 0;
    const externalBreakdown = calculateExternalItineraryBreakdown(
      externalItinerary,
      peopleDetails,
    );
    const backendChildServicePerPerson = resolveCanonicalChildServicePrice(
      cotizacion.precio_it_ninos,
      cotizacion.precioItNinos,
    );
    const hasBackendChildServicePrice =
      backendChildServicePerPerson !== null;
    const backendExternalAdultPerPerson = ensureNumber(
      cotizacion.precio_it_ext_adulto ?? cotizacion.precioItExtAdulto ?? 0,
    );
    const backendExternalChildPerPerson = ensureNumber(
      cotizacion.precio_it_ext_ninos ?? cotizacion.precioItExtNinos ?? 0,
    );
    const fallbackPerRoomPricing = buildFallbackPerRoomPricing({
      hotel: selectedHotel,
      peopleCount,
      subtotalIndividual: ensureNumber(subtotalIndividual),
      nonHotelExplicitChildTotal: ensureNumber(
        cotizacion.nonHotelExplicitChildTotal ??
          additionalCosts?.nonHotelExplicitChildTotal ??
          additionalCosts?.baseExplicitChildTotal ??
          0,
      ),
      nonHotelConvertedChildTotal: ensureNumber(nonHotelConvertedChildTotal),
      additionalCosts,
      externalAdultTotal:
        Array.isArray(externalItinerary) && externalItinerary.length > 0
          ? externalBreakdown.adultTotal
          : backendExternalAdultPerPerson,
      peopleDetails,
    });
    const explicitPerRoomPricing = [
      cotizacion.perRoomPricing,
      selectedHotel?.perRoomPricing,
    ].find((items) => Array.isArray(items) && items.length > 0);
    const hasGroupedHotelPricing =
      Array.isArray(selectedHotel?.dayGroups) && selectedHotel.dayGroups.length > 0;
    const rawPerRoomPricing =
      hasGroupedHotelPricing && fallbackPerRoomPricing.length > 0
        ? fallbackPerRoomPricing
        : explicitPerRoomPricing || fallbackPerRoomPricing;
    const aggregatedPerRoomPricing = aggregatePerRoomPricingByStayGroup(
      rawPerRoomPricing,
    );
    const perRoomPricing =
      aggregatedPerRoomPricing.length > 0
        ? aggregatedPerRoomPricing
        : rawPerRoomPricing;

    return {
      ...cotizacion,
      peopleDetails,
      peopleCount,
      additionalCosts,
      packageType:
        cotizacion.packagetype || cotizacion.packageType || "compartido",

      // Totales clave
      totalServicios:
        cotizacion.precio_it_adulto ??
        cotizacion.precioItAdulto ??
        cotizacion.totalServicios ??
        0,
      nonHotelsUnitTotal: cotizacion.nonHotelsTotal ?? 0,
      servicesGroupTotal:
        cotizacion.precio_it_adulto ??
        cotizacion.precioItAdulto ??
        cotizacion.totalServicios ??
        0,
      storedAdditionalTotal:
        cotizacion.total_adicionales ?? cotizacion.totalAdicionales ?? 0,

      // Hoteles
      selectedHotel,
      hotelsTotal:
        cotizacion.hotelsTotal ??
        cotizacion.hotelTotal ??
        0,
      hotelsByCategory: cotizacion.hotelsByCategory || {},
      externalItinerary,

      // Totales finales
      grandTotal:
        cotizacion.grandTotal ??
        cotizacion.totalFinal ??
        cotizacion.total_final ??
        0,
      subtotalFinal:
        cotizacion.subtotalFinal ??
        cotizacion.subtotal_final ??
        additionalCosts?.subtotalFinal ??
        additionalCosts?.subtotal_final ??
        additionalCosts?.commissionableSubtotal ??
        additionalCosts?.commissionable_subtotal ??
        0,
      subtotalIndividual,
      subtotalNinos: hasBackendChildServicePrice
        ? backendChildServicePerPerson
        : cotizacion.subtotal_ninos ??
          cotizacion.subtotalNinos ??
          cotizacion.subtotal_nino ??
          0,
      hasBackendChildServicePrice,
      backendChildServicePerPerson,
      backendExternalAdultPerPerson,
      backendExternalChildPerPerson,
      hotelFullTotal: cotizacion.hotelFullTotal ?? 0,
      hotelAdultTotal:
        cotizacion.hotelAdultTotal ?? cotizacion.hotel_adult_total ?? 0,
      hotelChildTotal:
        cotizacion.hotelChildTotal ?? cotizacion.hotel_child_total ?? 0,
      hotelConvertedChildTotal:
        cotizacion.hotelConvertedChildTotal ??
        cotizacion.hotel_converted_child_total ??
        0,

      // Unique passenger counts
      baseExplicitChildCount: cotizacion.baseExplicitChildCount ?? 0,
      baseConvertedChildCount: cotizacion.baseConvertedChildCount ?? 0,
      hotelExplicitChildCount: cotizacion.hotelExplicitChildCount ?? 0,
      hotelConvertedChildCount: cotizacion.hotelConvertedChildCount ?? 0,
      nonHotelExplicitChildTotal: cotizacion.nonHotelExplicitChildTotal ?? 0,
      nonHotelConvertedChildTotal,

      // (legacy/fallback)
      selectedHotelCategory:
        cotizacion.selectedHotelCategoryForTotals ??
        cotizacion.selectedHotelCategory ??
        null,

      // Per-room-type pricing breakdown (when multiple room types selected)
      rawPerRoomPricing: Array.isArray(rawPerRoomPricing)
        ? rawPerRoomPricing
        : [],
      perRoomPricing: Array.isArray(perRoomPricing) ? perRoomPricing : [],
    };
  }, [cotizacion]);

  // Una sola fuente comercial para SummaryContent, PDF y
  // el resumen de ventas/pagos. Los bloques detallados pueden conservar sus
  // ayudas visuales, pero el precio por grupo y el total salen de este core.
  const canonicalSummaryPricingModel = useMemo(
    () => buildSummaryContentPricingModel(normalizedCotizacion),
    [normalizedCotizacion],
  );

  // Días / itinerario
  const processedDays = useMemo(() => {
    const itinerario = normalizedCotizacion.itinerario || [];
    if (Array.isArray(itinerario)) return itinerario;
    if (typeof itinerario === "object" && itinerario) {
      return Object.values(itinerario).filter(
        (day) => day && typeof day === "object",
      );
    }
    return [];
  }, [normalizedCotizacion.itinerario]);

  const externalItineraryDays = useMemo(() => {
    const itinerario = normalizedCotizacion.externalItinerary || [];
    if (Array.isArray(itinerario)) return itinerario;
    if (typeof itinerario === "object" && itinerario) {
      return Object.values(itinerario).filter(
        (day) => day && typeof day === "object",
      );
    }
    return [];
  }, [normalizedCotizacion.externalItinerary]);

  const mergedSummaryDays = useMemo(() => {
    const dayMap = new Map();

    processedDays.forEach((day, index) => {
      const dayNumber = Number(day?.numero || index + 1);
      dayMap.set(dayNumber, {
        ...day,
        numero: dayNumber,
        titulo: day?.titulo || `Día ${dayNumber}`,
        mainServices: Array.isArray(day?.servicios) ? day.servicios : [],
        externalServices: [],
        externalOnly: false,
      });
    });

    externalItineraryDays.forEach((day, index) => {
      const dayNumber = Number(day?.numero || processedDays.length + index + 1);
      const externalServices = Array.isArray(day?.servicios)
        ? day.servicios
        : [];
      if (externalServices.length === 0) return;

      if (dayMap.has(dayNumber)) {
        const currentDay = dayMap.get(dayNumber);
        dayMap.set(dayNumber, {
          ...currentDay,
          externalServices: [
            ...currentDay.externalServices,
            ...externalServices,
          ],
        });
        return;
      }

      dayMap.set(dayNumber, {
        ...day,
        numero: dayNumber,
        titulo: day?.titulo || `Día ${dayNumber}`,
        mainServices: [],
        externalServices,
        externalOnly: true,
      });
    });

    return Array.from(dayMap.values()).sort(
      (left, right) => Number(left.numero || 0) - Number(right.numero || 0),
    );
  }, [externalItineraryDays, processedDays]);

  // Conteo de personas efectivo
  const effectivePeopleCount = useMemo(() => {
    const pc = normalizedCotizacion.peopleCount || {};
    const adults = Number(pc.adults) || 0;
    const children = Number(pc.children) || 0;
    if (adults + children > 0) return { adults, children };

    const cantidadPersonas =
      normalizedCotizacion.cantidadpersonas ||
      normalizedCotizacion.cantidadPersonas;
    if (cantidadPersonas)
      return { adults: Number(cantidadPersonas) || 0, children: 0 };
    return { adults: 1, children: 0 };
  }, [
    normalizedCotizacion.peopleCount,
    normalizedCotizacion.cantidadpersonas,
    normalizedCotizacion.cantidadPersonas,
  ]);

  // Cálculos financieros principales
  const financialData = useMemo(() => {
    const subtotalIndividual = ensureNumber(
      normalizedCotizacion.subtotalIndividual ||
        normalizedCotizacion.nonHotelsUnitTotal,
    );
    const persistedGrandTotal = ensureNumber(normalizedCotizacion.grandTotal);
    const adultsCount = Math.max(1, Number(effectivePeopleCount.adults || 0));

    // Preferimos SIEMPRE el hotel seleccionado explícitamente
    let appliedHotel = null;
    let appliedHotelTotal = 0;

    if (normalizedCotizacion.selectedHotel) {
      appliedHotel = { ...normalizedCotizacion.selectedHotel };
      appliedHotelTotal = ensureNumber(
        normalizedCotizacion.hotelsTotal ??
          normalizedCotizacion.selectedHotel.total ??
          normalizedCotizacion.selectedHotel.hotelTotal,
      );
    } else if (
      normalizedCotizacion.selectedHotelCategory &&
      normalizedCotizacion.hotelsByCategory?.[
        normalizedCotizacion.selectedHotelCategory
      ]
    ) {
      const r =
        normalizedCotizacion.hotelsByCategory[
          normalizedCotizacion.selectedHotelCategory
        ];
      appliedHotel = { key: normalizedCotizacion.selectedHotelCategory, ...r };
      appliedHotelTotal = ensureNumber(r?.total);
    }

    const ac = normalizedCotizacion.additionalCosts || {};
    const externalBreakdown = calculateExternalItineraryBreakdown(
      normalizedCotizacion.externalItinerary,
      normalizedCotizacion.peopleDetails,
    );
    const hasExternalItineraryEntries =
      Array.isArray(normalizedCotizacion.externalItinerary) &&
      normalizedCotizacion.externalItinerary.length > 0;
    const externalAdultTotal = hasExternalItineraryEntries
      ? ensureNumber(externalBreakdown.adultTotal)
      : ensureNumber(normalizedCotizacion.backendExternalAdultPerPerson);
    const externalChildTotal = hasExternalItineraryEntries
      ? ensureNumber(externalBreakdown.childTotal)
      : ensureNumber(normalizedCotizacion.backendExternalChildPerPerson);
    const externalConvertedChildTotal = ensureNumber(
      externalBreakdown.convertedChildTotal,
    );
    const externalExplicitChildCount = hasExternalItineraryEntries
      ? ensureNumber(externalBreakdown.explicitChildCount)
      : ensureNumber(
          normalizedCotizacion.externalExplicitChildCount ??
            normalizedCotizacion.external_explicit_child_count ??
            ac.externalExplicitChildCount ??
            ac.external_explicit_child_count,
        );
    const externalConvertedChildCount = hasExternalItineraryEntries
      ? ensureNumber(externalBreakdown.convertedChildCount)
      : ensureNumber(
          normalizedCotizacion.externalConvertedChildCount ??
            normalizedCotizacion.external_converted_child_count ??
            ac.externalConvertedChildCount ??
            ac.external_converted_child_count,
        );
    const externalUnifiedChildTotal = round2(
      externalChildTotal + externalConvertedChildTotal,
    );
    const hotelGroupTotal =
      appliedHotelTotal || ensureNumber(normalizedCotizacion.hotelsTotal);
    const summaryTotals = calculateCotizacionFinancialSummary({
      subtotalIndividual,
      adultsCount,
      childrenCount: effectivePeopleCount.children,
      hotelsTotal: hotelGroupTotal,
      hotelAdultTotal:
        ensureNumber(normalizedCotizacion.hotelAdultTotal) ||
        Math.max(
          0,
          hotelGroupTotal -
            ensureNumber(normalizedCotizacion.hotelConvertedChildTotal),
        ),
      hotelChildTotal: ensureNumber(normalizedCotizacion.hotelChildTotal),
      hotelConvertedChildTotal: ensureNumber(
        normalizedCotizacion.hotelConvertedChildTotal,
      ),
      subtotalNinos: ensureNumber(normalizedCotizacion.subtotalNinos),
      externalAdultTotal,
      externalChildTotal,
      externalConvertedChildTotal,
      externalExplicitChildCount,
      externalConvertedChildCount,
      baseExplicitChildCount: normalizedCotizacion.baseExplicitChildCount || 0,
      baseConvertedChildCount:
        normalizedCotizacion.baseConvertedChildCount || 0,
      hotelExplicitChildCount:
        normalizedCotizacion.hotelExplicitChildCount || 0,
      hotelConvertedChildCount:
        normalizedCotizacion.hotelConvertedChildCount || 0,
      nonHotelExplicitChildTotal:
        normalizedCotizacion.nonHotelExplicitChildTotal || 0,
      nonHotelConvertedChildTotal:
        normalizedCotizacion.nonHotelConvertedChildTotal || 0,
      additionalCosts: ac,
    });
    const roomPricingRows = Array.isArray(normalizedCotizacion.perRoomPricing)
      ? normalizedCotizacion.perRoomPricing
      : [];
    const childRoomSummary = resolveChildChargeSummary({
      childrenCount: effectivePeopleCount.children,
      baseExplicitChildCount: normalizedCotizacion.baseExplicitChildCount || 0,
      baseConvertedChildCount:
        normalizedCotizacion.baseConvertedChildCount || 0,
      hotelExplicitChildCount:
        normalizedCotizacion.hotelExplicitChildCount || 0,
      hotelConvertedChildCount:
        normalizedCotizacion.hotelConvertedChildCount || 0,
      nonHotelExplicitChildTotal:
        normalizedCotizacion.nonHotelExplicitChildTotal || 0,
      nonHotelConvertedChildTotal:
        normalizedCotizacion.nonHotelConvertedChildTotal || 0,
      hotelExplicitChildTotal: summaryTotals.hotelExplicitChildTotal,
      hotelConvertedChildTotal: summaryTotals.hotelConvertedChildTotal,
    });
    const childAdditionalPerPerson = Math.max(
      0,
      ensureNumber(summaryTotals.perUnifiedChildTotal) -
        ensureNumber(childRoomSummary.unifiedPerChild),
    );
    const calculateTypedAdditional = (base, audience = "adult") => {
      const isChild = audience === "child";
      const pick = (...values) =>
        values.find((value) => value !== undefined && value !== null);
      const policy = (field) =>
        pick(
          ac?.[field],
          ac?.[
            field === "applyOperationalCostsToChildren"
              ? "apply_operational_costs_to_children"
              : field === "applyFeeToChildren"
                ? "apply_fee_to_children"
                : field === "applyExtraFeeToChildren"
                  ? "apply_extra_fee_to_children"
                  : field
          ],
          ac?.applyAdditionalCostsToChildren,
          ac?.apply_additional_costs_to_children,
          true,
        );
      const useAdultOperational =
        !isChild || policy("applyOperationalCostsToChildren");
      const useAdultFee = !isChild || policy("applyFeeToChildren");
      const useAdultExtra = !isChild || policy("applyExtraFeeToChildren");
      const operationalModeValue = pick(
        ac?.operationalMode,
        ac?.operational_mode,
        "fixed",
      );
      const feeModeValue = pick(ac?.feeMode, ac?.fee_mode, "fixed");
      const opMode = String(
        useAdultOperational
          ? operationalModeValue
          : pick(
              ac?.childOperationalMode,
              ac?.child_operational_mode,
              operationalModeValue,
            ),
      ).toLowerCase();
      const feeMode = String(
        useAdultFee
          ? feeModeValue
          : pick(ac?.childFeeMode, ac?.child_fee_mode, feeModeValue),
      ).toLowerCase();
      const operationalCosts = pick(
        ac?.operationalCosts,
        ac?.operational_costs,
        0,
      );
      const baseFeeValue = pick(ac?.fee, ac?.feeVal, ac?.fee_val, 0);
      const extraFeeValue = pick(ac?.extraFee, ac?.extra_fee, 0);
      const opValue = ensureNumber(
        useAdultOperational
          ? operationalCosts
          : pick(
              ac?.childOperationalCosts,
              ac?.child_operational_costs,
              operationalCosts,
            ),
      );
      const resolvedFeeValue = ensureNumber(
        useAdultFee
          ? baseFeeValue
          : pick(ac?.childFee, ac?.child_fee, baseFeeValue),
      );
      const extraValue = ensureNumber(
        useAdultExtra
          ? extraFeeValue
          : pick(ac?.childExtraFee, ac?.child_extra_fee, extraFeeValue),
      );
      const safeBase = round2(base);
      const operational =
        opMode === "percentage" ? round2((opValue * safeBase) / 100) : opValue;
      const fee =
        feeMode === "percentage"
          ? round2((resolvedFeeValue * safeBase) / 100)
          : resolvedFeeValue;
      const extra = round2(extraValue);

      return {
        operational,
        fee,
        extra,
        total: round2(operational + fee + extra),
      };
    };
    const primaryAdultRoom = roomPricingRows.find(
      (room) => ensureNumber(room?.adultBeneficiaries) > 0,
    );
    const primaryAdultBase =
      primaryAdultRoom != null
        ? round2(
            subtotalIndividual +
              ensureNumber(
                primaryAdultRoom?.hotelPerPerson ??
                  primaryAdultRoom?.value ??
                  primaryAdultRoom?.hotelBasePerPerson ??
                  0,
              ),
          )
        : summaryTotals.percentageBase;
    const displayAdultAdditional =
      primaryAdultRoom != null
        ? calculateTypedAdditional(primaryAdultBase, "adult")
        : {
            operational: summaryTotals.operationalAmount,
            fee: summaryTotals.feeAmount,
            extra: summaryTotals.extraFeeAmount,
            total: summaryTotals.totalAdditionalPerAdult,
          };
    const primaryChildRoom = roomPricingRows.find(
      (room) => ensureNumber(room?.convertedChildBeneficiaries) > 0,
    );
    const primaryChildFinancials =
      primaryChildRoom != null
        ? resolveConvertedChildRoomFinancials(
            primaryChildRoom,
            childRoomSummary,
            0,
            0,
          )
        : null;
    const displayChildAdditional =
      primaryChildFinancials != null
        ? calculateTypedAdditional(primaryChildFinancials.basePerChild, "child")
        : {
            operational: summaryTotals.childOperationalAmount || 0,
            fee: summaryTotals.childFeeAmount || 0,
            extra: summaryTotals.childExtraFeeAmount || 0,
            total: summaryTotals.totalAdditionalPerChild || 0,
          };
    const roomBasedGrandTotal =
      roomPricingRows.length > 0
        ? ensureNumber(
              roomPricingRows.reduce((sum, room) => {
              const base = ensureNumber(room.totalPerPerson);
                const totalPP = base + externalAdultTotal;
              return (
                sum +
                Math.ceil(totalPP) *
                  Math.max(
                    0,
                    ensureNumber(
                      room.adultBeneficiaries ?? room.beneficiaries ?? 0,
                    ),
                  )
              );
            }, 0) +
              (roomPricingRows.some(
                (room) => ensureNumber(room.convertedChildBeneficiaries || 0) > 0,
              )
                ? 0
                : childRoomSummary.explicitCount > 0
                  ? Math.ceil(
                      childRoomSummary.explicitPerChild +
                        summaryTotals.totalAdditionalPerChild +
                        externalUnifiedChildTotal,
                    ) * childRoomSummary.explicitCount
                  : 0) +
              (roomPricingRows.reduce(
                (sum, room) => {
                  const childRoomFinancials =
                    resolveConvertedChildRoomFinancials(
                      room,
                      childRoomSummary,
                      childAdditionalPerPerson,
                      externalUnifiedChildTotal,
                    );
                  return (
                    sum +
                    Math.ceil(childRoomFinancials.totalPerChild) *
                    Math.max(
                      0,
                      ensureNumber(room.convertedChildBeneficiaries || 0),
                    )
                  );
                },
                0,
              ) ||
                (childRoomSummary.convertedCount > 0
                  ? Math.ceil(
                      childRoomSummary.convertedPerChild +
                        summaryTotals.totalAdditionalPerChild +
                        externalUnifiedChildTotal,
                    ) * childRoomSummary.convertedCount
                  : 0)),
          )
        : 0;
    const additionalCostsFinalTotal = ensureNumber(
      ac?.finalTotal ?? ac?.final_total ?? ac?.grandTotal ?? ac?.grand_total,
    );
    const computedGrandTotal =
      roomBasedGrandTotal > 0 ? roomBasedGrandTotal : summaryTotals.grandTotal;
    const visibleSummaryGrandTotal =
      resolveVisibleSummaryTotalFromAdditionalCosts(ac);
    const pricingSnapshot = resolveQuotationPricingSnapshot({
      additionalCosts: ac,
      previewTotal: computedGrandTotal,
      fallbackAdditionalTotal:
        visibleSummaryGrandTotal > 0
          ? visibleSummaryGrandTotal
          : additionalCostsFinalTotal,
      fallbackTotal:
        persistedGrandTotal > 0 ? persistedGrandTotal : summaryTotals.grandTotal,
    });
    const grandTotal = pricingSnapshot.grandTotal;

    const storedSubtotalFinal = ensureNumber(
      normalizedCotizacion.subtotalFinal ??
        ac?.subtotalFinal ??
        ac?.subtotal_final ??
        ac?.commissionableSubtotal ??
        ac?.commissionable_subtotal,
    );
    const fallbackSubtotalFinal = Math.max(
      0,
      grandTotal - ensureNumber(summaryTotals.externalItineraryTotal),
    );
    const subtotalFinal =
      storedSubtotalFinal > 0
        ? storedSubtotalFinal
        : fallbackSubtotalFinal > 0
          ? fallbackSubtotalFinal
          : grandTotal;

    const baseWithHotel = summaryTotals.percentageBase;

    const totalPeople =
      (effectivePeopleCount.adults || 0) + (effectivePeopleCount.children || 0);
    const perPerson = totalPeople > 0 ? grandTotal / totalPeople : grandTotal;
    const roomPricingHotelTotal = roomPricingRows.reduce(
      (sum, room) => sum + ensureNumber(room?.hotelTotalRoom),
      0,
    );
    const inferredHotelDisplayTotal = round2(
      appliedHotelTotal + ensureNumber(summaryTotals.hotelChildTotal),
    );

    return {
      subtotalIndividual,
      servicesAdultsTotal: summaryTotals.servicesAdultsTotal,
      hotelGroupTotal: summaryTotals.hotelGroupTotal,
      externalItineraryTotal: summaryTotals.externalItineraryTotal,
      externalAdultTotal,
      externalChildTotal,
      externalConvertedChildTotal,
      externalExplicitChildCount,
      externalConvertedChildCount,
      operationalAmount: displayAdultAdditional.operational,
      feeAmount: displayAdultAdditional.fee,
      extraFeeAmount: displayAdultAdditional.extra,
      operationalTotal: summaryTotals.operationalTotal,
      feeTotal: summaryTotals.feeTotal,
      extraFeeTotal: summaryTotals.extraFeeTotal,
      additionalTotal: summaryTotals.additionalTotal,
      additionalChildTotal: summaryTotals.additionalChildTotal,
      totalAdditionalPerAdult: displayAdultAdditional.total,
      adultOperationalWithAdditionalTotal: ensureNumber(
        summaryTotals.servicesAdultsTotal +
          summaryTotals.hotelAdultTotal +
          summaryTotals.additionalTotal,
      ),
      perAdultVisibleTotal: summaryTotals.perAdultVisibleTotal,
      childVisibleTotal: summaryTotals.perExplicitChildVisibleTotal,
      convertedChildVisibleTotal: summaryTotals.perConvertedChildVisibleTotal,
      unifiedChildVisibleTotal: summaryTotals.perUnifiedChildVisibleTotal,
      perUnifiedChildTotal: summaryTotals.perUnifiedChildTotal,
      totalAdditionalPerChild: displayChildAdditional.total,
      childOperationalAmount: displayChildAdditional.operational,
      childFeeAmount: displayChildAdditional.fee,
      childExtraFeeAmount: displayChildAdditional.extra,
      baseWithHotel,
      grandTotal,
      subtotalFinal,
      perPerson,
      totalPeople,
      subtotalNinos: summaryTotals.subtotalNinos,

      // hotel aplicado y métricas
      appliedHotel,
      appliedHotelTotal,
      // Full hotel total (adults + children) for display; appliedHotelTotal is adult-portion only
      hotelDisplayTotal: ensureNumber(
        roomPricingHotelTotal ||
          inferredHotelDisplayTotal ||
          normalizedCotizacion.hotelFullTotal,
      ),
      hotelPerAdult: summaryTotals.hotelPerAdult,
      hotelAdultTotal: summaryTotals.hotelAdultTotal,
      hotelChildTotal: summaryTotals.hotelChildTotal,
      hotelConvertedChildTotal: summaryTotals.hotelConvertedChildTotal,
      nonHotelChildTotal: summaryTotals.nonHotelChildTotal,
      hotelExplicitChildTotal: summaryTotals.hotelExplicitChildTotal,

      // Unique passenger counts
      baseExplicitChildCount: normalizedCotizacion.baseExplicitChildCount || 0,
      baseConvertedChildCount:
        normalizedCotizacion.baseConvertedChildCount || 0,
      hotelExplicitChildCount:
        normalizedCotizacion.hotelExplicitChildCount || 0,
      hotelConvertedChildCount:
        normalizedCotizacion.hotelConvertedChildCount || 0,
      nonHotelExplicitChildTotal:
        normalizedCotizacion.nonHotelExplicitChildTotal || 0,
      nonHotelConvertedChildTotal:
        normalizedCotizacion.nonHotelConvertedChildTotal || 0,

      // aún conservamos hotelsByCategory como fallback si NO hay selectedHotel
      hotelsByCategory: normalizedCotizacion.hotelsByCategory || {},
    };
  }, [normalizedCotizacion, effectivePeopleCount]);

  const legacyTotalFormulaParts = useMemo(() => {
    const adultsCount = Math.max(1, Number(effectivePeopleCount.adults || 0));
    const totalChildrenCount = Math.max(
      0,
      Number(effectivePeopleCount.children || 0),
    );
    const totalConvertedChildCount = Math.min(
      totalChildrenCount,
      Math.max(
        financialData.baseConvertedChildCount || 0,
        financialData.hotelConvertedChildCount || 0,
      ),
    );
    const explicitAmount =
      (financialData.nonHotelExplicitChildTotal || 0) +
      (financialData.hotelExplicitChildTotal || 0);
    const convertedAmount =
      (financialData.nonHotelConvertedChildTotal || 0) +
      (financialData.hotelConvertedChildTotal || 0);
    const totalExplicitChildCount =
      explicitAmount > 0 || convertedAmount > 0 ? totalChildrenCount : 0;

    const adultLabel =
      adultsCount > 1
        ? `Por adulto (${adultsCount})`
        : "Por adulto";

    const childLabel =
      totalExplicitChildCount > 0
        ? `Niños (${totalExplicitChildCount})`
        : "Niños";

    return [
      {
        key: "adult-per-person",
        icon: MdPerson,
        label: adultLabel,
        value: financialData.perAdultVisibleTotal,
        className: "financial-summary__pill--adult",
      },
      totalExplicitChildCount > 0
        ? {
            key: "child-per-person",
            icon: MdChildCare,
            label: childLabel,
            value:
              financialData.unifiedChildVisibleTotal ||
              (financialData.childVisibleTotal || 0) +
                (financialData.convertedChildVisibleTotal || 0),
            className: "financial-summary__pill--child",
          }
        : null,
    ].filter(Boolean);
  }, [financialData, effectivePeopleCount]);

  const childChargeSummary = useMemo(
    () =>
      resolveChildChargeSummary({
        childrenCount: effectivePeopleCount.children,
        baseExplicitChildCount: financialData.baseExplicitChildCount,
        baseConvertedChildCount: financialData.baseConvertedChildCount,
        hotelExplicitChildCount: financialData.hotelExplicitChildCount,
        hotelConvertedChildCount: financialData.hotelConvertedChildCount,
        nonHotelExplicitChildTotal: financialData.nonHotelExplicitChildTotal,
        nonHotelConvertedChildTotal: financialData.nonHotelConvertedChildTotal,
        hotelExplicitChildTotal: financialData.hotelExplicitChildTotal,
        hotelConvertedChildTotal: financialData.hotelConvertedChildTotal,
      }),
    [effectivePeopleCount.children, financialData],
  );
  const persistedVisibleFormulaParts = useMemo(() => {
    const ac = normalizedCotizacion.additionalCosts || {};
    const parts =
      ac.summaryVisibleParts ||
      ac.visibleSummaryParts ||
      ac.acSummaryParts ||
      ac.summary_visible_parts ||
      [];

    if (!Array.isArray(parts) || parts.length === 0) return [];

    return parts
      .map((part, index) => {
        const label = String(part?.label || "");
        const isChild =
          label.toLowerCase().includes("niñ") ||
          String(part?.className || "").includes("child");
        const isRoom =
          label.toLowerCase().includes("triple") ||
          label.toLowerCase().includes("doble") ||
          label.toLowerCase().includes("simple") ||
          label.toLowerCase().includes("habit");

        return {
          key: part?.key || `persisted-visible-${index}`,
          icon: isChild ? MdChildCare : isRoom ? MdHotel : MdPerson,
          label,
          value: ensureNumber(part?.value ?? part?.roundedValue),
          commissionableValue: ensureNumber(
            part?.commissionableValue ??
              part?.subtotalValue ??
              part?.baseWithoutExternal ??
              part?.value ??
              part?.roundedValue,
          ),
          beneficiaries: ensureNumber(part?.beneficiaries) || 1,
          className:
            part?.className ||
            (isChild
              ? "financial-summary__pill--child"
              : isRoom
                ? "financial-summary__pill--room"
                : "financial-summary__pill--adult"),
        };
      })
      .filter(
        (part) =>
          ensureNumber(part.value) > 0 ||
          (ensureNumber(part.beneficiaries) > 0 &&
            String(part.label || "").toLowerCase().includes("sin hotel")),
      );
  }, [normalizedCotizacion.additionalCosts]);


  const roomBasedFormulaParts = useMemo(
    () =>
      buildRoomBasedFinancialSummaryParts({
        adultIcon: MdPerson,
        childIcon: MdChildCare,
        hotelIcon: MdHotel,
        adultsCount: effectivePeopleCount.adults,
        childrenCount: effectivePeopleCount.children,
        subtotalIndividual: financialData.subtotalIndividual,
        additionalCosts: normalizedCotizacion.additionalCosts || {},
        childSummary: childChargeSummary,
        perRoomPricing: normalizedCotizacion.perRoomPricing,
        adultClassName: "financial-summary__pill--adult",
        childClassName: "financial-summary__pill--child",
        roomClassName: "financial-summary__pill--room",
        externalAdultTotal: financialData.externalAdultTotal || 0,
        externalChildTotal: financialData.externalChildTotal || 0,
        externalConvertedChildTotal:
          financialData.externalConvertedChildTotal || 0,
      }),
    [
      childChargeSummary,
      effectivePeopleCount.adults,
      effectivePeopleCount.children,
      financialData,
      normalizedCotizacion.additionalCosts,
      normalizedCotizacion.perRoomPricing,
    ],
  );

  const canonicalFormulaParts = useMemo(
    () =>
      (Array.isArray(canonicalSummaryPricingModel?.parts)
        ? canonicalSummaryPricingModel.parts
        : []
      ).map((part, index) => {
        const isChild = part?.audience === "child";
        const roomKey = String(part?.roomKey || "").toLowerCase();
        const isWithoutHotel =
          roomKey === "sin-hotel" || ensureNumber(part?.hotel) <= 0;
        return {
          ...part,
          key: part?.key || `canonical-summary-${index}`,
          icon: isChild ? MdChildCare : isWithoutHotel ? MdPerson : MdHotel,
          className:
            part?.className ||
            (isChild
              ? "financial-summary__pill--child"
              : isWithoutHotel
                ? "financial-summary__pill--adult"
                : "financial-summary__pill--room"),
          beneficiaries: Math.max(
            1,
            ensureNumber(part?.beneficiaries ?? part?.count ?? part?.pax),
          ),
          value: ensureNumber(part?.value),
        };
      }),
    [canonicalSummaryPricingModel],
  );

  const totalFormulaParts = useMemo(
    () =>
      canonicalFormulaParts.length > 0
        ? canonicalFormulaParts
        : roomBasedFormulaParts.length > 0
          ? roomBasedFormulaParts
          : persistedVisibleFormulaParts.length > 0
            ? persistedVisibleFormulaParts
            : buildFinancialSummaryParts({
            adultIcon: MdPerson,
            childIcon: MdChildCare,
            hotelIcon: MdHotel,
            adultsCount: effectivePeopleCount.adults,
            adultTotal: financialData.perAdultVisibleTotal,
            childTotal: financialData.childVisibleTotal,
            convertedChildTotal:
              financialData.convertedChildVisibleTotal ||
              childChargeSummary.convertedPerChild,
            unifiedChildTotal:
              financialData.perUnifiedChildTotal ||
              financialData.unifiedChildVisibleTotal,
            childSummary: childChargeSummary,
            perRoomPricing: normalizedCotizacion.perRoomPricing,
            adultClassName: "financial-summary__pill--adult",
            childClassName: "financial-summary__pill--child",
            convertedChildClassName: "financial-summary__pill--child",
            roomClassName: "financial-summary__pill--room",
            adultLabelWithConverted: true,
            externalAdultTotal: financialData.externalAdultTotal || 0,
            externalChildTotal: financialData.externalChildTotal || 0,
            externalConvertedChildTotal:
              financialData.externalConvertedChildTotal || 0,
          }) || legacyTotalFormulaParts,
    [
      canonicalFormulaParts,
      childChargeSummary,
      effectivePeopleCount.adults,
      financialData,
      normalizedCotizacion.perRoomPricing,
      legacyTotalFormulaParts,
      persistedVisibleFormulaParts,
      roomBasedFormulaParts,
    ],
  );

  const summaryVerificationParts = useMemo(
    () =>
      enrichPassengerPricePartsWithRoomImpact({
        parts: totalFormulaParts,
        perRoomPricing:
          normalizedCotizacion.perRoomPricing?.length > 0
            ? normalizedCotizacion.perRoomPricing
            : normalizedCotizacion.rawPerRoomPricing,
        peopleDetails: normalizedCotizacion.peopleDetails,
      }),
    [
      normalizedCotizacion.peopleDetails,
      normalizedCotizacion.perRoomPricing,
      normalizedCotizacion.rawPerRoomPricing,
      totalFormulaParts,
    ],
  );

  const summaryFormulaRoundedTotal = useMemo(
    () =>
      totalFormulaParts.reduce((sum, part) => {
        const value = Math.ceil(ensureNumber(part?.value));
        if (value <= 0) return sum;
        return sum + value * resolveFormulaPartBeneficiaryCount(part);
      }, 0),
    [totalFormulaParts],
  );

  const summaryFinalTotal =
    totalFormulaParts.length > 0
      ? summaryFormulaRoundedTotal
      : financialData.grandTotal;

  const summaryGroupHotelBreakdown = useMemo(
    () =>
      buildHotelRoomGroupBreakdown(
        normalizedCotizacion.rawPerRoomPricing,
        normalizedCotizacion.selectedHotel,
        normalizedCotizacion.peopleDetails,
      ),
    [
      normalizedCotizacion.peopleDetails,
      normalizedCotizacion.rawPerRoomPricing,
      normalizedCotizacion.selectedHotel,
    ],
  );

  const summaryRoomHotelParts = useMemo(() => {
    if (!Array.isArray(normalizedCotizacion.perRoomPricing)) return [];

    return normalizedCotizacion.perRoomPricing
      .map((room, index) => {
        const beneficiaries = Number(room?.adultBeneficiaries || 0);
        if (beneficiaries <= 0) return null;
        const igvPerPerson = getRoomIgvPerPerson(room);
        const nationalityImpact = resolveRoomNationalityImpact(
          room,
          normalizedCotizacion.peopleDetails,
        );

        return {
          key: `summary-room-${room?.key || index}`,
          label: room?.label || "Habitación",
          value: Number(room?.hotelPerPerson || 0),
          beneficiaries,
          igvTotal: round2(getRoomIgvStayTotal(room)),
          igvPerPerson,
          hotelBasePerPerson: Math.max(
            0,
            round2(Number(room?.hotelPerPerson || 0) - igvPerPerson),
          ),
          passengerIds: getRoomPassengerIds(room),
          capacity: Number(room?.capacity || room?.roomCapacity || 0) || null,
          ...nationalityImpact,
        };
      })
      .filter(Boolean);
  }, [
    normalizedCotizacion.peopleDetails,
    normalizedCotizacion.perRoomPricing,
  ]);

  const summaryRoomConvertedParts = useMemo(() => {
    if (!Array.isArray(normalizedCotizacion.perRoomPricing)) return [];

    return normalizedCotizacion.perRoomPricing
      .map((room, index) => {
        const beneficiaries = Number(room?.convertedChildBeneficiaries || 0);
        if (beneficiaries <= 0) return null;
        const igvPerPerson = getRoomIgvPerPerson(room);
        const hotelPerPerson = Number(
          room?.convertedChildHotelPerPerson || room?.hotelPerPerson || 0,
        );
        const nationalityImpact = resolveRoomNationalityImpact(
          room,
          normalizedCotizacion.peopleDetails,
        );

        return {
          key: `summary-room-converted-${room?.key || index}`,
          label: room?.label || "Habitación",
          value: hotelPerPerson,
          beneficiaries,
          igvTotal: round2(getRoomIgvStayTotal(room)),
          igvPerPerson,
          hotelBasePerPerson: Math.max(
            0,
            round2(hotelPerPerson - igvPerPerson),
          ),
          passengerIds: getRoomPassengerIds(room),
          capacity: Number(room?.capacity || room?.roomCapacity || 0) || null,
          ...nationalityImpact,
        };
      })
      .filter(Boolean);
  }, [
    normalizedCotizacion.peopleDetails,
    normalizedCotizacion.perRoomPricing,
  ]);

  const summaryChildPriceRows = useMemo(
    () =>
      buildChildPricingRows({
        peopleDetails: normalizedCotizacion.peopleDetails,
        childrenCount: effectivePeopleCount.children,
        additionalCosts: normalizedCotizacion.additionalCosts,
        pricingSource: normalizedCotizacion,
        perRoomPricing:
          normalizedCotizacion.perRoomPricing?.length > 0
            ? normalizedCotizacion.perRoomPricing
            : normalizedCotizacion.rawPerRoomPricing,
        serviceFallbackPerChild:
          normalizedCotizacion.hasBackendChildServicePrice
            ? ensureNumber(normalizedCotizacion.backendChildServicePerPerson)
            : ensureNumber(childChargeSummary.nonHotelUnifiedPerChild),
        authoritativeServiceFallback:
          normalizedCotizacion.hasBackendChildServicePrice,
        hotelFallbackPerChild: ensureNumber(
          childChargeSummary.hotelUnifiedPerChild,
        ),
        externalPerChild: round2(
          ensureNumber(financialData.externalChildTotal) +
            ensureNumber(financialData.externalConvertedChildTotal),
        ),
        calculateAdditional: calculateAdditionalCostForAudience,
      }),
    [
      childChargeSummary.hotelUnifiedPerChild,
      childChargeSummary.nonHotelUnifiedPerChild,
      effectivePeopleCount.children,
      financialData.externalChildTotal,
      financialData.externalConvertedChildTotal,
      normalizedCotizacion,
    ],
  );

  const nationalSummaryRoomCount = summaryRoomHotelParts.filter(
    (part) => part.isNationalRoom && part.igvPerPerson > 0,
  ).length;

  // Helpers UI
  const getServiceIcon = (service) => {
    if (!service) return <MdLocalActivity />;
    const type =
      validateServiceStructure(service) ||
      service.parentService ||
      service.typeService
        ? detectServiceType(service)
        : (service.categoria || service.type || "").toLowerCase();
    switch (type) {
      case "hoteles":
      case "hotel":
        return <MdHotel />;
      case "transportes":
      case "transporte":
        return <MdDirectionsCar />;
      case "vuelos":
      case "vuelo":
        return <MdFlight />;
      case "trenes":
      case "tren":
        return <MdTrain />;
      case "restaurantes":
      case "restaurante":
        return <MdRestaurant />;
      case "tickets":
        return <MdLocalActivity />;
      case "endoses":
        return <MdAssignment />;
      case "guias":
        return <MdPerson />;
      default:
        return <MdLocalActivity />;
    }
  };

  const getServiceName = (service) => {
    if (!service) return "Servicio sin nombre";
    if (
      validateServiceStructure(service) ||
      service.parentService ||
      service.childService
    ) {
      const parentName =
        service.parentService?.nombre_hotel ||
        service.parentService?.nombre_transporte ||
        service.parentService?.aerolinea ||
        service.parentService?.nombre ||
        service.parentService?.nombre_empresa ||
        service.parentService?.nombre_agencia ||
        service.childService?.restaurante?.nombre ||
        service.childService?.ticket?.entrada ||
        service.childService?.servicio_extra?.nombre ||
        (service.parentService?.persona
          ? `${service.parentService?.persona?.nombres} ${service.parentService?.persona?.apellidos}`
          : "") ||
        "";
      const childName =
        service.childService?.tipo_habitacion ||
        service.childService?.tipo_auto ||
        service.childService?.tipo_vuelo?.tipovuelo ||
        service.childService?.nombre ||
        service.childService?.tipo_tren ||
        service.childService?.ruta?.tour_nombre ||
        service.parentService?.tipo_tour ||
        "";
      return parentName && childName
        ? `${parentName} - ${childName}`
        : parentName || childName || "Servicio sin nombre";
    }
    return service.nombre || service.title || "Servicio sin nombre";
  };

  const getServiceCity = (service) => {
    if (!service || typeof service !== "object") return "";
    const type =
      validateServiceStructure(service) ||
      service.parentService ||
      service.typeService
        ? detectServiceType(service)
        : (service.categoria || service.type || "").toLowerCase();
    if (type !== "hoteles" && type !== "hotel") return "";

    return (
      service.ciudad ||
      service.hotelCity ||
      service.city ||
      service.parentService?.ciudad ||
      service.parentService?.zona ||
      service.parentService?.city ||
      service.childService?.ciudad ||
      service.childService?.zona ||
      ""
    );
  };

  // Total passengers for transport capacity conflict check
  const totalPassengers = useMemo(() => {
    return (
      (effectivePeopleCount.adults || 0) +
        (effectivePeopleCount.children || 0) || 1
    );
  }, [effectivePeopleCount]);

  const hasTransportCapacityConflict = (service) => {
    if (!service || typeof service !== "object") return false;
    const type =
      validateServiceStructure(service) ||
      service.parentService ||
      service.typeService
        ? detectServiceType(service)
        : "";
    if (type !== "transportes") return false;
    const capacity = parseInt(service.childService?.nro_pasajeros) || 0;
    return capacity > 0 && capacity < totalPassengers;
  };

  const getServiceDisplayPrice = (service) => {
    if (!service) return 0;
    return resolveServiceAdultUnitPriceForPresentation(service);
  };

  const getServiceAdultPricingRows = (service) =>
    buildServiceAdultPricingRows({
      service,
      peopleDetails: normalizedCotizacion.peopleDetails,
      adultUnitFallback: getServiceDisplayPrice(service),
    });

  const getServiceChildPricingRows = (service) =>
    buildServiceChildPricingRows({
      service,
      peopleDetails: normalizedCotizacion.peopleDetails,
      adultUnitFallback: getServiceDisplayPrice(service),
    });

  const renderChildPricingRows = (
    rows = [],
    { className = "", label = "Niños beneficiarios" } = {},
  ) => {
    if (!Array.isArray(rows) || rows.length === 0) return null;

    return (
      <div className={`service-child-pricing ${className}`.trim()}>
        <span className="service-child-pricing__label">
          <MdChildCare />
          {label}
        </span>
        <div className="service-child-pricing__items">
          {rows.map((row) => (
            <span
              className={`service-child-price ${
                row.isFree ? "service-child-price--free" : ""
              } ${row.asAdult ? "service-child-price--adult" : ""}`.trim()}
              key={row.key || row.childId}
              title={
                row.asAdult
                  ? `${row.label}: aplica la tarifa de adulto`
                  : `${row.label}: tarifa propia de niño`
              }
            >
              <span className="service-child-price__identity">
                <MdChildCare />
                <span>{row.label}</span>
                {row.asAdult && <em>Adulto</em>}
              </span>
              <strong>
                {row.isFree ? "Gratis" : formatCurrency(row.amount)}
              </strong>
            </span>
          ))}
        </div>
      </div>
    );
  };

  const renderAdultPricingRows = (
    rows = [],
    { className = "", label = "Adultos beneficiarios" } = {},
  ) => {
    if (!Array.isArray(rows) || rows.length === 0) return null;

    return (
      <div
        className={`service-child-pricing service-adult-pricing ${className}`.trim()}
      >
        <span className="service-child-pricing__label service-adult-pricing__label">
          <MdPerson />
          {label}
        </span>
        <div className="service-child-pricing__items">
          {rows.map((row) => (
            <span
              className={`service-child-price service-adult-price ${
                row.isFree ? "service-child-price--free" : ""
              }`.trim()}
              key={row.key || row.adultId}
              title={`${row.label}: tarifa de adulto`}
            >
              <span className="service-child-price__identity">
                <MdPerson />
                <span>{row.label}</span>
              </span>
              <strong>
                {row.isFree ? "Gratis" : formatCurrency(row.amount)}
              </strong>
            </span>
          ))}
        </div>
      </div>
    );
  };

  const renderServicePassengerPricing = (
    service,
    { className = "", adultRows, childRows } = {},
  ) => (
    <>
      {renderAdultPricingRows(
        adultRows ?? getServiceAdultPricingRows(service),
        { className },
      )}
      {renderChildPricingRows(
        childRows ?? getServiceChildPricingRows(service),
        { className },
      )}
    </>
  );

  const summaryPassengerPresentations = useMemo(
    () => [
      ...(Array.isArray(normalizedCotizacion.peopleDetails?.adults)
        ? normalizedCotizacion.peopleDetails.adults
        : []
      ).map((passenger, index) =>
        getPassengerPresentation(passenger, "adult", index),
      ),
      ...(Array.isArray(normalizedCotizacion.peopleDetails?.children)
        ? normalizedCotizacion.peopleDetails.children
        : []
      ).map((passenger, index) =>
        getPassengerPresentation(passenger, "child", index),
      ),
    ],
    [normalizedCotizacion.peopleDetails],
  );

  const resolveSummaryPassenger = (passengerId, fallbackKind = "adult") => {
    const id = String(passengerId || "").trim();
    const matched = summaryPassengerPresentations.find((entry) =>
      passengerIdMatchesSet(id, entry.aliases),
    );
    if (matched) return matched;

    const parts = id.split(":");
    const parsed = Number.parseInt(parts[1], 10);
    const index = Number.isInteger(parsed)
      ? parts.length > 2
        ? Math.max(0, parsed)
        : Math.max(0, parsed - 1)
      : 0;
    return {
      aliases: new Set([id]),
      index,
      isNational: false,
      label: `${fallbackKind === "child" ? "Niño" : "Adulto"} ${index + 1}`,
      prefix: fallbackKind,
      passenger: {},
    };
  };

  const buildDayHotelOverview = (day = {}, dayIndex = 0) => {
    const hotelServices = [
      ...(Array.isArray(day?.mainServices) ? day.mainServices : []),
      ...(Array.isArray(day?.externalServices) ? day.externalServices : []),
    ].filter(isHotelSummaryService);
    if (hotelServices.length === 0) return [];

    const configuredGroups = Array.isArray(
      normalizedCotizacion.selectedHotel?.dayGroups,
    )
      ? normalizedCotizacion.selectedHotel.dayGroups
      : [];
    const configuredGroupIndex = configuredGroups.findIndex((group) =>
      getGroupNightIndices(group).includes(dayIndex),
    );
    const configuredGroup =
      configuredGroupIndex >= 0 ? configuredGroups[configuredGroupIndex] : null;
    const fallbackGroupLabel =
      configuredGroup?.label ||
      (configuredGroupIndex >= 0
        ? `Grupo ${configuredGroupIndex + 1}`
        : `Grupo hotelero del día ${dayIndex + 1}`);
    const fallbackCategoryLabel = formatHotelGroupCategoryLabel(
      configuredGroup?.category || normalizedCotizacion.selectedHotel?.category,
      configuredGroup || normalizedCotizacion.selectedHotel || {},
    );
    const groups = new Map();

    hotelServices.forEach((service, serviceIndex) => {
      const beneficiaries = getHotelServiceBeneficiaries(service);
      const childPricingRows = getServiceChildPricingRows(service);
      const occupantMap = new Map();

      beneficiaries.adults.forEach((entry) => {
        const rawId = getSummaryBeneficiaryId(entry);
        const childOrigin = String(
          entry?.child_origin || entry?.childOrigin || "",
        );
        const childId = childOrigin || (rawId.startsWith("child:") ? rawId : "");
        const id = childId || rawId;
        if (!id) return;
        const kind = childId ? "child" : "adult";
        const presentation = resolveSummaryPassenger(id, kind);
        const childPrice = childPricingRows.find((row) =>
          passengerIdMatchesSet(row.childId, presentation.aliases),
        );
        occupantMap.set(`${kind}:${presentation.index}`, {
          id,
          kind,
          label: presentation.label,
          isNational: presentation.isNational,
          asAdult: Boolean(childId),
          amount: childPrice?.amount ?? null,
        });
      });

      beneficiaries.children.forEach((entry) => {
        const id = getSummaryBeneficiaryId(entry);
        if (!id) return;
        const presentation = resolveSummaryPassenger(id, "child");
        const childPrice = childPricingRows.find((row) =>
          passengerIdMatchesSet(row.childId, presentation.aliases),
        );
        occupantMap.set(`child:${presentation.index}`, {
          id,
          kind: "child",
          label: presentation.label,
          isNational: presentation.isNational,
          asAdult: Boolean(childPrice?.asAdult),
          amount: childPrice?.amount ?? entry?.precio ?? entry?.price ?? null,
        });
      });

      const occupants = [...occupantMap.values()];
      const beneficiaryCount = occupants.length;
      const nationalOccupants = occupants.filter((occupant) => occupant.isNational);
      const persistedIgvValue =
        service?.igv ??
        service?.assignedIgv ??
        service?.assigned_igv ??
        service?.tariff?.igv ??
        false;
      const persistedHasIgv =
        persistedIgvValue === true ||
        persistedIgvValue === 1 ||
        String(persistedIgvValue).toLowerCase() === "true";
      const hasIgv = persistedHasIgv || nationalOccupants.length > 0;
      const roomBase = readFirstPositiveNumber(
        service?.roomBaseUnitPrice,
        service?.room_base_unit_price,
        service?.tariff?.precio_base_sin_igv,
        service?.tariff?.roomBaseUnitPrice,
        service?.precioTotal,
        service?.precio_total,
        service?.assignedPrecioTotal,
        service?.assigned_precio_total,
        service?.precioServicio,
        service?.precio_servicio,
        service?.assignedPrecioServicio,
        service?.assigned_precio_servicio,
        service?.tariff?.precio_original,
        service?.tariff?.precio,
      );
      const storedRoomPrice = readFirstPositiveNumber(
        service?.roomUnitPriceWithIgv,
        service?.room_unit_price_with_igv,
        service?.tariff?.roomUnitPriceWithIgv,
        service?.tariff?.precio,
        service?.precioServicio,
        service?.precio_servicio,
        service?.assignedPrecioServicio,
        service?.assigned_precio_servicio,
      );
      const calculatedRoomTotal = hasIgv
        ? round2(roomBase * 1.18)
        : roomBase;
      const fallbackRoomTotal =
        roomBase > 0 || storedRoomPrice > 0
          ? 0
          : getServiceDisplayPrice(service) * Math.max(1, beneficiaryCount);
      const roomTotal = round2(
        Math.max(calculatedRoomTotal, storedRoomPrice, roomBase, fallbackRoomTotal),
      );
      const igvAmount = hasIgv ? Math.max(0, round2(roomTotal - roomBase)) : 0;
      const divided = Boolean(
        service?.precioAdultoDividido ??
          service?.precio_adulto_dividido ??
          service?.tariff?.precio_adulto_dividido ??
          true,
      );
      const pricePerPax =
        divided && beneficiaryCount > 0
          ? round2(roomTotal / beneficiaryCount)
          : round2(roomTotal);
      const pricedOccupants = occupants.map((occupant) => ({
        ...occupant,
        amount:
          occupant.kind === "adult" || occupant.asAdult
            ? pricePerPax
            : occupant.amount,
      }));
      const adultOccupants = pricedOccupants.filter(
        (occupant) => occupant.kind === "adult",
      );
      const childOccupants = pricedOccupants.filter(
        (occupant) => occupant.kind === "child",
      );
      const roomType = getHotelServiceRoomType(service);
      const hotelName = getHotelServiceName(service);
      const categoryLabel = getHotelServiceCategoryLabel(
        service,
        fallbackCategoryLabel,
      );
      const groupLabel = fallbackGroupLabel;
      const groupKey = `${groupLabel}|${categoryLabel}|${hotelName}`;
      const group = groups.get(groupKey) || {
        key: groupKey,
        groupLabel,
        categoryLabel,
        hotelName,
        rooms: [],
      };
      const sameTypeCount = group.rooms.filter(
        (room) => normalizeRoomText(room.roomType) === normalizeRoomText(roomType),
      ).length;

      group.rooms.push({
        key: service?.id || service?.serviceId || `${groupKey}-${serviceIndex}`,
        roomType,
        roomLabel: `${roomType}${sameTypeCount > 0 ? ` ${sameTypeCount + 1}` : ""}`,
        occupants: pricedOccupants,
        beneficiaryCount,
        adultOccupants,
        childOccupants,
        nationalOccupants,
        hasIgv: hasIgv || nationalOccupants.length > 0,
        igvAmount,
        roomBase,
        roomTotal,
        pricePerPax,
      });
      groups.set(groupKey, group);
    });

    return [...groups.values()];
  };

  const renderDayHotelOverview = (day = {}, dayIndex = 0) => {
    const hotelGroups = buildDayHotelOverview(day, dayIndex);
    if (hotelGroups.length === 0) return null;

    const roomCount = hotelGroups.reduce(
      (sum, group) => sum + group.rooms.length,
      0,
    );
    const nationalRoomCount = hotelGroups.reduce(
      (sum, group) =>
        sum + group.rooms.filter((room) => room.hasIgv && room.igvAmount > 0).length,
      0,
    );
    const childRoomCount = hotelGroups.reduce(
      (sum, group) =>
        sum + group.rooms.filter((room) => room.childOccupants.length > 0).length,
      0,
    );

    return (
      <section className="day-hotel-overview">
        <div className="day-hotel-overview__header">
          <div className="day-hotel-overview__title">
            <span className="day-hotel-overview__icon">
              <MdHotel />
            </span>
            <div>
              <strong>Hospedaje del día</strong>
              <small>Distribución real según beneficiarios del servicio</small>
            </div>
          </div>
          <div className="day-hotel-overview__stats">
            <span>{roomCount} habitación{roomCount !== 1 ? "es" : ""}</span>
            {nationalRoomCount > 0 && (
              <span className="day-hotel-overview__stat--national">
                {nationalRoomCount} con IGV nacional
              </span>
            )}
            {childRoomCount > 0 && (
              <span className="day-hotel-overview__stat--child">
                {childRoomCount} con niño
              </span>
            )}
          </div>
        </div>

        <div className="day-hotel-overview__groups">
          {hotelGroups.map((group) => (
            <div className="day-hotel-group" key={group.key}>
              <div className="day-hotel-group__head">
                <div>
                  <strong>{group.groupLabel}</strong>
                  <span>{group.categoryLabel}</span>
                  <small>{group.hotelName}</small>
                </div>
                <em>{group.rooms.length} hab.</em>
              </div>

              <div className="day-hotel-group__rooms">
                {group.rooms.map((room) => (
                  <article
                    className={`day-hotel-room ${
                      room.hasIgv && room.igvAmount > 0
                        ? "day-hotel-room--national"
                        : ""
                    } ${
                      room.childOccupants.length > 0
                        ? "day-hotel-room--child"
                        : ""
                    }`.trim()}
                    key={room.key}
                  >
                    <div className="day-hotel-room__head">
                      <div className="day-hotel-room__identity">
                        <MdHotel />
                        <strong>{room.roomLabel}</strong>
                      </div>
                      <span className="day-hotel-room__price">
                        <small>Total habitación</small>
                        <strong>{formatCurrency(room.roomTotal)}</strong>
                      </span>
                    </div>

                    <div className="day-hotel-room__meta">
                      {room.beneficiaryCount > 0 ? (
                        <>
                          {room.adultOccupants.length > 0 && (
                            <span>
                              {room.adultOccupants.length} adulto
                              {room.adultOccupants.length !== 1 ? "s" : ""}
                            </span>
                          )}
                          {room.childOccupants.length > 0 && (
                            <em className="day-hotel-room__child-badge">
                              {room.childOccupants.length} niño
                              {room.childOccupants.length !== 1 ? "s" : ""}
                            </em>
                          )}
                          <span>{formatCurrency(room.pricePerPax)} / pax</span>
                        </>
                      ) : (
                        <span className="day-hotel-room__empty-beneficiaries">
                          Sin beneficiarios registrados
                        </span>
                      )}
                      {room.hasIgv && room.igvAmount > 0 && (
                        <em>Nacional · IGV 18%</em>
                      )}
                    </div>

                    {room.hasIgv && room.igvAmount > 0 && (
                      <div className="day-hotel-room__tax">
                        <span>
                          Base {formatCurrency(room.roomBase)} + IGV {formatCurrency(room.igvAmount)}
                        </span>
                        <small>
                          Afecta a todos los ocupantes de esta habitación
                          {room.nationalOccupants.length > 0
                            ? ` · ${room.nationalOccupants
                                .map((occupant) => occupant.label)
                                .join(", ")}`
                            : ""}
                        </small>
                      </div>
                    )}

                    {room.occupants.length > 0 && (
                      <div className="day-hotel-room__occupants">
                        {room.occupants.map((occupant, occupantIndex) => (
                        <span
                          className={`day-hotel-occupant ${
                            occupant.kind === "child"
                              ? "day-hotel-occupant--child"
                              : ""
                          } ${
                            occupant.isNational
                              ? "day-hotel-occupant--national"
                              : ""
                          }`.trim()}
                          key={`${room.key}-${occupant.id}-${occupantIndex}`}
                        >
                          {occupant.kind === "child" ? <MdChildCare /> : <MdPerson />}
                          <span>{occupant.label}</span>
                          {occupant.isNational && <em>Nacional</em>}
                          {occupant.asAdult && <em>Tarifa adulto</em>}
                          {occupant.amount != null && (
                            <strong>
                              {Number(occupant.amount || 0) <= 0
                                ? "Gratis"
                                : formatCurrency(occupant.amount)}
                            </strong>
                          )}
                        </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const summaryAdditionalCostRows = useMemo(() => {
    const ac = normalizedCotizacion.additionalCosts || {};
    const pick = (...values) =>
      values.find((value) => value !== undefined && value !== null);
    const normalizeMode = (...values) => {
      const selected = String(pick(...values, "fixed") || "fixed").toLowerCase();
      return selected === "percentage" ? "percentage" : "fixed";
    };
    const formatConfiguredValue = (mode, value) => {
      const numeric = ensureNumber(value);
      if (mode === "percentage") {
        return `${numeric % 1 === 0 ? numeric : numeric.toFixed(2)}%`;
      }
      return formatCurrency(numeric);
    };
    const buildCalcLabel = (baseLabel, mode, value) => {
      const numeric = ensureNumber(value);
      if (mode === "percentage" && numeric > 0) {
        return `${baseLabel} (${numeric % 1 === 0 ? numeric : numeric.toFixed(2)}%)`;
      }
      return baseLabel;
    };

    const buildSummaryCalcLabel = (type, mode, value) => {
      const numeric = ensureNumber(value);
      if (type === "fee") {
        return mode === "percentage" && numeric > 0
          ? `Fee (${numeric % 1 === 0 ? numeric : numeric.toFixed(2)}%)`
          : "Fee";
      }
      if (type === "operational") {
        return mode === "percentage" && numeric > 0
          ? `G.Adm (${numeric % 1 === 0 ? numeric : numeric.toFixed(2)}%)`
          : "G.Adm";
      }
      if (type === "contingency") return "Cont.";
      return buildCalcLabel(type, mode, value);
    };

    const childrenCount = Math.max(0, Number(effectivePeopleCount.children || 0));
    const operationalMode = normalizeMode(ac.operationalMode, ac.operational_mode);
    const feeMode = normalizeMode(ac.feeMode, ac.fee_mode);
    const operationalValue = pick(ac.operationalCosts, ac.operational_costs, 0);
    const feeValue = pick(ac.fee, ac.feeVal, ac.fee_val, 0);
    const contingencyValue = pick(ac.extraFee, ac.extra_fee, 0);

    const rows = [
      {
        key: "fee",
        className: "fee-row",
        icon: MdMonetizationOn,
        concept: "Fee",
        calcLabel: buildSummaryCalcLabel("fee", feeMode, feeValue),
        mode: feeMode,
        modeLabel: feeMode === "percentage" ? "Porcentual" : "Fijo",
        configured: formatConfiguredValue(feeMode, feeValue),
        adultAmount: ensureNumber(financialData.feeAmount),
        childAmount: childrenCount > 0 ? ensureNumber(financialData.childFeeAmount) : 0,
        configuredNumber: ensureNumber(feeValue),
      },
      {
        key: "operational",
        className: "operational-row",
        icon: MdAssignment,
        concept: "Gastos operativos",
        calcLabel: buildSummaryCalcLabel("operational", operationalMode, operationalValue),
        mode: operationalMode,
        modeLabel: operationalMode === "percentage" ? "Porcentual" : "Fijo",
        configured: formatConfiguredValue(operationalMode, operationalValue),
        adultAmount: ensureNumber(financialData.operationalAmount),
        childAmount: childrenCount > 0 ? ensureNumber(financialData.childOperationalAmount) : 0,
        configuredNumber: ensureNumber(operationalValue),
      },
      {
        key: "contingency",
        className: "extra-fee-row",
        icon: MdCode,
        concept: "Contingencia",
        calcLabel: buildSummaryCalcLabel("contingency", "fixed", contingencyValue),
        mode: "fixed",
        modeLabel: "Fijo",
        configured: formatConfiguredValue("fixed", contingencyValue),
        adultAmount: ensureNumber(financialData.extraFeeAmount),
        childAmount: childrenCount > 0 ? ensureNumber(financialData.childExtraFeeAmount) : 0,
        configuredNumber: ensureNumber(contingencyValue),
      },
    ];

    return rows.filter(
      (row) =>
        row.configuredNumber > 0 ||
        ensureNumber(row.adultAmount) > 0 ||
        ensureNumber(row.childAmount) > 0,
    );
  }, [
    effectivePeopleCount.children,
    financialData.childExtraFeeAmount,
    financialData.childFeeAmount,
    financialData.childOperationalAmount,
    financialData.extraFeeAmount,
    financialData.feeAmount,
    financialData.operationalAmount,
    normalizedCotizacion.additionalCosts,
  ]);

  // Render
  const fallbackSummaryFinancialCalcCards = useMemo(() => {
    const cards = [];
    const adultsCount = Math.max(0, Number(effectivePeopleCount.adults || 0));
    const childrenCount = Math.max(0, Number(effectivePeopleCount.children || 0));

    const ac = normalizedCotizacion.additionalCosts || {};
    const pick = (...values) =>
      values.find((value) => value !== undefined && value !== null);
    const calculateAdditionalForBase = (base, audience = "adult") => {
      const isChild = audience === "child";
      const policy = (field) =>
        pick(
          ac?.[field],
          ac?.[
            field === "applyOperationalCostsToChildren"
              ? "apply_operational_costs_to_children"
              : field === "applyFeeToChildren"
                ? "apply_fee_to_children"
                : field === "applyExtraFeeToChildren"
                  ? "apply_extra_fee_to_children"
                  : field
          ],
          ac?.applyAdditionalCostsToChildren,
          ac?.apply_additional_costs_to_children,
          true,
        );
      const useAdultOperational =
        !isChild || policy("applyOperationalCostsToChildren");
      const useAdultFee = !isChild || policy("applyFeeToChildren");
      const useAdultExtra = !isChild || policy("applyExtraFeeToChildren");
      const operationalMode = String(
        useAdultOperational
          ? pick(ac?.operationalMode, ac?.operational_mode, "fixed")
          : pick(
              ac?.childOperationalMode,
              ac?.child_operational_mode,
              ac?.operationalMode,
              ac?.operational_mode,
              "fixed",
            ),
      ).toLowerCase();
      const feeMode = String(
        useAdultFee
          ? pick(ac?.feeMode, ac?.fee_mode, "fixed")
          : pick(
              ac?.childFeeMode,
              ac?.child_fee_mode,
              ac?.feeMode,
              ac?.fee_mode,
              "fixed",
            ),
      ).toLowerCase();
      const operationalValue = ensureNumber(
        useAdultOperational
          ? pick(ac?.operationalCosts, ac?.operational_costs, 0)
          : pick(
              ac?.childOperationalCosts,
              ac?.child_operational_costs,
              ac?.operationalCosts,
              ac?.operational_costs,
              0,
            ),
      );
      const feeValue = ensureNumber(
        useAdultFee
          ? pick(ac?.fee, ac?.feeVal, ac?.fee_val, 0)
          : pick(
              ac?.childFee,
              ac?.child_fee,
              ac?.fee,
              ac?.feeVal,
              ac?.fee_val,
              0,
            ),
      );
      const extraValue = ensureNumber(
        useAdultExtra
          ? pick(ac?.extraFee, ac?.extra_fee, 0)
          : pick(
              ac?.childExtraFee,
              ac?.child_extra_fee,
              ac?.extraFee,
              ac?.extra_fee,
              0,
            ),
      );
      const safeBase = round2(base);
      const operational =
        operationalMode === "percentage"
          ? round2((operationalValue * safeBase) / 100)
          : round2(operationalValue);
      const fee =
        feeMode === "percentage"
          ? round2((feeValue * safeBase) / 100)
          : round2(feeValue);
      const extra = round2(extraValue);

      return {
        operational,
        fee,
        extra,
        total: round2(operational + fee + extra),
      };
    };

    const buildAdditionalLines = (additional = {}) =>
      summaryAdditionalCostRows
        .map((row) => {
          const value =
            row.key === "operational"
              ? additional.operational
              : row.key === "fee"
                ? additional.fee
                : row.key === "contingency"
                  ? additional.extra
                  : 0;
          return {
            key: row.key,
            label: row.calcLabel || row.concept,
            value,
          };
        })
        .filter((line) => ensureNumber(line.value) > 0);

    const buildLines = ({
      services = 0,
      hotel = 0,
      igv = 0,
      external = 0,
      audience = "adult",
      baseOverride = null,
    }) => {
      const base =
        baseOverride != null
          ? round2(baseOverride)
          : round2(ensureNumber(services) + ensureNumber(hotel));
      const additional = calculateAdditionalForBase(base, audience);
      const lines = [
        { key: "services", label: "Servicios", value: services },
        {
          key: "hotel",
          label: ensureNumber(igv) > 0 ? "Hotel base" : "Hotel",
          value: hotel,
        },
        {
          key: "igv",
          label: "IGV hotel 18% · todos los pax",
          value: igv,
        },
        ...buildAdditionalLines(additional),
        { key: "external", label: "Ext. Itinerario", value: external },
      ].filter(
        (line) =>
          !["igv", "external"].includes(line.key) ||
          ensureNumber(line.value) > 0,
      );
      return { lines, additional, base };
    };

    const adultRoomParts = summaryRoomHotelParts.length > 0
      ? summaryRoomHotelParts
      : [
          {
            key: "adult-no-room",
            label: financialData.hotelPerAdult > 0 ? "Adulto" : "Sin hotel",
            value: ensureNumber(financialData.hotelPerAdult),
            beneficiaries: adultsCount,
          },
        ];

    adultRoomParts.forEach((part, index) => {
      if (adultsCount <= 0 && ensureNumber(part?.beneficiaries) <= 0) return;
      const hotel = ensureNumber(part?.value);
      const igv = ensureNumber(part?.igvPerPerson);
      const hotelBase =
        part?.hotelBasePerPerson != null
          ? ensureNumber(part.hotelBasePerPerson)
          : Math.max(0, round2(hotel - igv));
      const { lines, additional } = buildLines({
        services: financialData.subtotalIndividual,
        hotel: hotelBase,
        igv,
        external: financialData.externalAdultTotal,
        audience: "adult",
        baseOverride: round2(financialData.subtotalIndividual + hotel),
      });
      const total = round2(
        ensureNumber(financialData.subtotalIndividual) +
          hotel +
          ensureNumber(additional.total) +
          ensureNumber(financialData.externalAdultTotal),
      );

      cards.push({
        key: `adult-${part?.key || index}`,
        icon: part?.key === "adult-no-room" && hotel <= 0 ? MdHotel : MdPerson,
        label: part?.label || "Adulto",
        audience: "adult",
        beneficiaries: ensureNumber(part?.beneficiaries) || adultsCount,
        className: `ac__summary-calc-card--adult ${
          hotel <= 0 ? "ac__summary-calc-card--no-hotel" : ""
        } ${
          part?.isNationalRoom && igv > 0
            ? "ac__summary-calc-card--national"
            : ""
        }`.trim(),
        isNationalRoom: Boolean(part?.isNationalRoom && igv > 0),
        nationalPassengerLabels: part?.nationalPassengerLabels || [],
        affectedPaxCount:
          ensureNumber(part?.affectedPaxCount) ||
          ensureNumber(part?.beneficiaries) ||
          adultsCount,
        passengerIds: Array.isArray(part?.passengerIds)
          ? part.passengerIds
          : [],
        capacity: part?.capacity || null,
        lines,
        total,
      });
    });

    if (childrenCount > 0) {
      summaryChildPriceRows.forEach((childRow) => {
        const lines = [
          { key: "services", label: "Servicios", value: childRow.services },
          {
            key: "hotel",
            label: childRow.igv > 0 ? "Hotel base" : "Hotel",
            value: childRow.hotelBase,
          },
          {
            key: "igv",
            label: "IGV hotel 18% · todos los pax",
            value: childRow.igv,
          },
          ...buildAdditionalLines(childRow.additional),
          {
            key: "external",
            label: "Ext. Itinerario",
            value: childRow.external,
          },
        ].filter(
          (line) =>
            !["igv", "external"].includes(line.key) ||
            ensureNumber(line.value) > 0,
        );

        cards.push({
          key: childRow.key,
          icon: MdChildCare,
          label: childRow.label,
          audience: "child",
          beneficiaries: 1,
          className: `ac__summary-calc-card--child ${
            childRow.hotel <= 0 ? "ac__summary-calc-card--no-hotel" : ""
          } ${
            childRow.nationalRoom && childRow.igv > 0
              ? "ac__summary-calc-card--national"
              : ""
          } ${childRow.isFree ? "ac__summary-calc-card--free" : ""}`.trim(),
          lines,
          total: childRow.total,
          isFree: childRow.isFree,
          isNationalRoom: childRow.nationalRoom && childRow.igv > 0,
          roomLabels: childRow.roomLabels,
        });
      });
    }

    return cards.filter((card) => ensureNumber(card.total) > 0 || card.lines.length > 0);
  }, [
    childChargeSummary,
    effectivePeopleCount.adults,
    effectivePeopleCount.children,
    financialData,
    normalizedCotizacion.additionalCosts,
    summaryAdditionalCostRows,
    summaryChildPriceRows,
    summaryRoomHotelParts,
  ]);

  const canonicalSummaryFinancialCalcCards = useMemo(
    () =>
      canonicalFormulaParts
        .map((part, index) => {
          const isChild = part?.audience === "child";
          const hotel = ensureNumber(part?.hotel);
          const detailedAdditionalLines = summaryAdditionalCostRows
            .map((row) => ({
              key: row.key,
              label: row.calcLabel || row.concept,
              value:
                row.key === "operational"
                  ? part?.operational
                  : row.key === "fee"
                    ? part?.fee
                    : row.key === "contingency"
                      ? part?.contingency
                      : 0,
            }))
            .map((line) => ({ ...line, value: ensureNumber(line.value) }))
            .filter((line) => line.value > 0);
          const fallbackAdditionalLine =
            detailedAdditionalLines.length === 0 &&
            ensureNumber(part?.additional) > 0
              ? [
                  {
                    key: "additional",
                    label: "Adicionales",
                    value: ensureNumber(part?.additional),
                  },
                ]
              : [];
          const lines = [
            { key: "services", label: "Servicios", value: part?.services },
            { key: "hotel", label: "Hotel", value: hotel },
            ...detailedAdditionalLines,
            ...fallbackAdditionalLine,
            { key: "external", label: "Ext. Itinerario", value: part?.external },
          ]
            .map((line) => ({ ...line, value: ensureNumber(line.value) }))
            .filter(
              (line) =>
                line.key === "services" ||
                line.key === "hotel" ||
                line.value > 0,
            );

          return {
            key: part?.key || `canonical-card-${index}`,
            icon: isChild ? MdChildCare : MdPerson,
            label:
              part?.roomLabel || part?.label || (isChild ? "Niño" : "Adulto"),
            audience: isChild ? "child" : "adult",
            beneficiaries: Math.max(1, ensureNumber(part?.beneficiaries)),
            className: `${
              isChild
                ? "ac__summary-calc-card--child"
                : "ac__summary-calc-card--adult"
            } ${hotel <= 0 ? "ac__summary-calc-card--no-hotel" : ""} ${
              part?.isFree ? "ac__summary-calc-card--free" : ""
            }`.trim(),
            passengerIds: Array.isArray(part?.passengerIds)
              ? part.passengerIds
              : [],
            capacity: part?.capacity || null,
            lines,
            total: ensureNumber(part?.value),
            isFree: Boolean(part?.isFree),
            roomLabels: part?.roomLabel ? [part.roomLabel] : [],
          };
        })
        .filter((card) => card.total > 0 || card.isFree),
    [canonicalFormulaParts, summaryAdditionalCostRows],
  );

  const summaryFinancialCalcCards =
    canonicalSummaryFinancialCalcCards.length > 0
      ? canonicalSummaryFinancialCalcCards
      : fallbackSummaryFinancialCalcCards;

  const summaryAdultPassengerPriceRows = useMemo(() => {
    const adults = Array.isArray(normalizedCotizacion.peopleDetails?.adults)
      ? normalizedCotizacion.peopleDetails.adults
      : [];
    const adultCards = summaryFinancialCalcCards.filter(
      (card) => card.audience === "adult",
    );
    const usageByCard = new Map();

    return adults.map((adult, index) => {
      const presentation = getPassengerPresentation(adult, "adult", index);
      let matchedCard = adultCards.find((card) =>
        (card.passengerIds || []).some((id) =>
          passengerIdMatchesSet(id, presentation.aliases),
        ),
      );

      if (!matchedCard) {
        matchedCard = adultCards.find(
          (card) =>
            (usageByCard.get(card.key) || 0) <
            Math.max(1, Number(card.beneficiaries || 1)),
        );
      }

      if (matchedCard) {
        usageByCard.set(
          matchedCard.key,
          (usageByCard.get(matchedCard.key) || 0) + 1,
        );
      }

      return {
        key: `adult-passenger-price-${index}`,
        roomLabel: matchedCard?.label || "Tarifa adulto",
        capacity: matchedCard?.capacity || null,
        total: Math.ceil(ensureNumber(matchedCard?.total)),
        hasPrice: ensureNumber(matchedCard?.total) > 0,
      };
    });
  }, [
    normalizedCotizacion.peopleDetails?.adults,
    summaryFinancialCalcCards,
  ]);

  const renderPeopleDetailsSection = () => {
    const peopleDetails = normalizedCotizacion.peopleDetails;
    if (!peopleDetails) return null;

    const adults = Array.isArray(peopleDetails.adults)
      ? peopleDetails.adults
      : [];
    const children = Array.isArray(peopleDetails.children)
      ? peopleDetails.children
      : [];
    if (adults.length === 0 && children.length === 0) return null;

    return (
      <div className="people-details-section people-details-section--after-financial">
        <div className="people-details-section__heading">
          <h4>
            <MdPeopleOutline className="section-icon" />
            Pasajeros y tarifa final
          </h4>
          <small>Precios redondeados según la habitación asignada</small>
        </div>

        {adults.length > 0 && (
          <div className="people-group">
            <h5>Adultos</h5>
            {adults.map((adult, index) => {
              const isNational = isPeruvianPassenger(adult);
              const price = summaryAdultPassengerPriceRows[index];
              return (
                <div
                  key={`adult-detail-${index}`}
                  className={`person-detail ${
                    isNational ? "person-detail--national" : ""
                  }`.trim()}
                >
                  <MdPerson className="person-icon" />
                  <div className="person-detail__identity">
                    <strong>Adulto {index + 1}</strong>
                    <small>
                      Edad: {adult.age ?? adult.edad ?? "—"} · {
                        adult.nacionalidad || adult.pais || "No especificado"
                      }
                    </small>
                  </div>
                  <div
                    className={`person-detail__pricing ${
                      isNational ? "person-detail__pricing--national" : ""
                    }`.trim()}
                  >
                    {isNational && (
                      <span className="person-status-badge person-status-badge--national">
                        Nacional
                      </span>
                    )}
                    {price?.roomLabel && (
                      <span className="person-room-badge">
                        <span className="person-room-badge__icon">
                          <MdHotel />
                        </span>
                        <span className="person-room-badge__copy">
                          <small>Habitación</small>
                          <strong>{price.roomLabel}</strong>
                        </span>
                      </span>
                    )}
                    {price?.hasPrice && (
                      <span className="person-price-badge">
                        <small>Tarifa final</small>
                        <strong>{formatCurrency(price.total, "dolares", 0)}</strong>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {children.length > 0 && (
          <div className="people-group people-group--children">
            <h5>Niños</h5>
            {children.map((child, index) => {
              const childPrice = summaryChildPriceRows[index];
              const isNational = isPeruvianPassenger(child);
              return (
                <div
                  key={`child-detail-${index}`}
                  className={`person-detail person-detail--child ${
                    isNational ? "person-detail--national" : ""
                  }`.trim()}
                >
                  <MdChildCare className="person-icon" />
                  <div className="person-detail__identity">
                    <strong>Niño {index + 1}</strong>
                    <small>
                      Edad: {child.age ?? child.edad ?? "—"} · {
                        child.nacionalidad || child.pais || "No especificado"
                      }
                    </small>
                  </div>
                  <div
                    className={`person-detail__pricing ${
                      isNational ? "person-detail__pricing--national" : ""
                    }`.trim()}
                  >
                    {isNational && (
                      <span className="person-status-badge person-status-badge--national">
                        Nacional
                      </span>
                    )}
                    {childPrice?.roomLabels?.length > 0 && (
                      <span className="person-room-badge">
                        <span className="person-room-badge__icon">
                          <MdHotel />
                        </span>
                        <span className="person-room-badge__copy">
                          <small>Habitación</small>
                          <strong>{childPrice.roomLabels.join(" · ")}</strong>
                        </span>
                      </span>
                    )}
                    {childPrice && (
                      <span
                        className={`person-price-badge ${
                          childPrice.isFree ? "person-price-badge--free" : ""
                        }`.trim()}
                      >
                        <small>Tarifa final</small>
                        <strong>
                          {childPrice.isFree
                            ? "Gratis"
                            : formatCurrency(
                                Math.ceil(childPrice.total),
                                "dolares",
                                0,
                              )}
                        </strong>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="summary-content">
      {/* Header */}
      <div className="summary-header">
        <div className="quotation-info">
          <h3>
            <MdCode className="header-icon" />
            {normalizedCotizacion.id || "Sin ID"}
          </h3>
          <p className="quotation-title">{normalizedCotizacion.titulo}</p>
          <p className="quotation-dates">
            {normalizedCotizacion.fechainicio &&
              normalizedCotizacion.fechafin && (
                <>
                  <MdCalendarToday className="info-icon" />
                  {formatDateRangeLong(
                    normalizedCotizacion.fechainicio,
                    normalizedCotizacion.fechafin,
                  )}
                </>
              )}
          </p>
        </div>

        <div className="package-info">
          <div className="package-type">
            <MdAssignment className="info-icon" />
            {normalizedCotizacion.packageType === "privado"
              ? "Paquete Privado"
              : "Paquete Compartido"}
          </div>
          <div className="people-count">
            <MdPerson className="info-icon" />
            {effectivePeopleCount.adults} Adulto
            {effectivePeopleCount.adults !== 1 ? "s" : ""}
            {effectivePeopleCount.children > 0 && (
              <>
                {" "}
                + <MdChildCare className="info-icon" />
                {effectivePeopleCount.children} Niño
                {effectivePeopleCount.children !== 1 ? "s" : ""}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Itinerario */}
      <div className="itinerary-section">
        <h4>
          <MdLocationOn className="section-icon" />
          Itinerario ({mergedSummaryDays.length} día
          {mergedSummaryDays.length !== 1 ? "s" : ""})
        </h4>

        {mergedSummaryDays.map((day, dayIndex) => (
          <div key={dayIndex} className="day-summary">
            <div className="day-header">
              <h5>
                <MdCalendarToday className="day-icon" />
                {day.titulo || `Día ${day.numero || dayIndex + 1}`}
              </h5>
              {day.externalServices?.length > 0 && (
                <span className="day-external-badge">
                  {day.externalOnly ? "Día externo" : "Con itinerario externo"}
                </span>
              )}
            </div>

            {(day.mainServices?.length > 0 ||
              day.externalServices?.length > 0) && (
              <div className="day-services">
                {renderDayHotelOverview(day, dayIndex)}
                {groupTicketServicesForSummary(
                  (Array.isArray(day.mainServices) ? day.mainServices : []).filter(
                    (service) => !isHotelSummaryService(service),
                  ),
                ).map((service, serviceIndex) => {
                  if (service?.__ticketGroup) {
                    const total = (service.services || []).reduce(
                      (sum, item) => sum + getServiceDisplayPrice(item),
                      0,
                    );
                    const ticketChildRows = aggregateDayChildPricingRows({
                      services: service.services || [],
                      peopleDetails: normalizedCotizacion.peopleDetails,
                      getAdultUnitPrice: getServiceDisplayPrice,
                    });
                    const ticketAdultRows = aggregateServiceAdultPricingRows({
                      services: service.services || [],
                      peopleDetails: normalizedCotizacion.peopleDetails,
                      getAdultUnitPrice: getServiceDisplayPrice,
                    });
                    return (
                      <div
                        key={`ticket-group-${service.key}-${serviceIndex}`}
                        className="service-summary enhanced service-summary--ticket-group"
                      >
                        <div className="service-info">
                          <div className="service-header">
                            <div className="service-icon-name">
                              <MdLocalActivity />
                              <span className="service-name">{service.entrada}</span>
                              <span className="service-city-badge">Tickets agrupados</span>
                            </div>
                            <span className="service-price">
                              <small>Tarifa adulta</small>
                              {formatCurrency(total)}
                            </span>
                          </div>
                          <div className="ticket-summary-lines">
                            {(service.services || []).map((ticketService, ticketIndex) => {
                              const procedencia = normalizeTicketProcedencia(
                                getTicketProcedencia(ticketService),
                              );
                              const tipoUsuario = getTicketTipoUsuario(ticketService);
                              const paxCount =
                                ticketService?.passengerSelection?.selectedIds?.length ||
                                ticketService?.assignedPassengerIds?.length ||
                                0;
                              return (
                                <span
                                  key={`${service.key}-${ticketIndex}`}
                                  className={`ticket-summary-line ticket-summary-line--${procedencia || "none"}`}
                                >
                                  <span>
                                    {procedencia || "sin procedencia"} · {tipoUsuario} · {paxCount} pax
                                  </span>
                                  <strong>
                                    {formatCurrency(
                                      getServiceDisplayPrice(ticketService),
                                    )}
                                  </strong>
                                </span>
                              );
                            })}
                          </div>
                          {renderServicePassengerPricing(
                            {},
                            {
                              className: "service-child-pricing--ticket",
                              adultRows: ticketAdultRows,
                              childRows: ticketChildRows,
                            },
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={serviceIndex}
                      className={`service-summary enhanced${hasTransportCapacityConflict(service) ? " service-summary--capacity-warning" : ""}`}
                    >
                      <div className="service-info">
                        <div className="service-header">
                          <div className="service-icon-name">
                            {getServiceIcon(service)}
                            <span className="service-name">
                              {getServiceName(service)}
                            </span>
                            {getServiceCity(service) && (
                              <span className="service-city-badge">
                                <MdLocationOn />
                                {getServiceCity(service)}
                              </span>
                            )}
                            {hasTransportCapacityConflict(service) && (
                              <span className="capacity-warning-badge">
                                <MdWarning />{" "}
                                {parseInt(service.childService?.nro_pasajeros) ||
                                  0}
                                /{totalPassengers} pax
                              </span>
                            )}
                          </div>
                          <span className="service-price">
                            <small>Por adulto</small>
                            {formatCurrency(getServiceDisplayPrice(service))}
                          </span>
                        </div>

                        {/* Detalle compacto */}
                        <ServiceDetailedInfo
                          service={service}
                          className="compact"
                        />
                        {renderServicePassengerPricing(service)}
                      </div>
                    </div>
                  );
                })}

                {(Array.isArray(day.externalServices)
                  ? day.externalServices
                  : []
                )
                  .filter((service) => !isHotelSummaryService(service))
                  .map((service, serviceIndex) => (
                  <div
                    key={`external-${serviceIndex}`}
                    className="service-summary enhanced service-summary--external"
                  >
                    <div className="service-info">
                      <div className="service-header">
                        <div className="service-icon-name">
                          {getServiceIcon(service)}
                          <span className="service-name">
                            {getServiceName(service)}
                          </span>
                          {getServiceCity(service) && (
                            <span className="service-city-badge">
                              <MdLocationOn />
                              {getServiceCity(service)}
                            </span>
                          )}
                          <span className="service-origin-badge">
                            Itinerario externo
                          </span>
                        </div>
                        <span className="service-price service-price--external">
                          <small>Por adulto</small>
                          {formatCurrency(getServiceDisplayPrice(service))}
                        </span>
                      </div>

                      <ServiceDetailedInfo
                        service={service}
                        className="compact"
                      />
                      {renderServicePassengerPricing(service, {
                        className: "service-child-pricing--external",
                      })}
                    </div>
                  </div>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Resumen Financiero */}
      <div className="financial-summary">
        <h4>
          <MdMonetizationOn className="section-icon" />
          Resumen Financiero
        </h4>

        <div className="financial-details">
          {/* Fallback comparativo solo si no hay selectedHotel */}
          {!financialData.appliedHotel &&
            financialData.hotelsByCategory &&
            Object.keys(financialData.hotelsByCategory).length > 0 && (
              <div className="hotel-table-section">
                <h4>
                  <MdHotel /> Hoteles por categoría (comparativa)
                </h4>
                <table className="hotel-table">
                  <thead>
                    <tr>
                      <th>Cat.</th>
                      <th>Hotel</th>
                      <th>Tipo</th>
                      <th>Cap.</th>
                      <th>Rooms</th>
                      <th>$/hab/noche</th>
                      <th>Noches</th>
                      <th>Total Hotel</th>
                      <th>$/persona (estancia)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ORDERED_HOTEL_KEYS.filter(
                      (k) => financialData.hotelsByCategory[k],
                    ).map((cat) => {
                      const r = financialData.hotelsByCategory[cat];
                      return (
                        <tr key={cat}>
                          <td>{r.category?.replace("Hotel ", "") || cat}</td>
                          <td>{r.hotelName || "—"}</td>
                          <td>{r.roomType || "—"}</td>
                          <td style={{ textAlign: "center" }}>
                            {r.capacityPerNight ?? r.capacity ?? "-"}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {r.roomsNeeded ?? "-"}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {formatCurrency(r.perNightPrice || 0)}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {r.nights || "-"}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {formatCurrency(r.total || 0)}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {formatCurrency(r.pricePerPersonForStay || 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

          {summaryAdditionalCostRows.length > 0 && (
            <div className="additional-costs-section summary-content__additional-costs-section">
              <h4>
                <MdReceipt className="section-icon" />
                Costos adicionales de la cotización
              </h4>
              <table className="costs-table">
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th>Modo</th>
                    <th>Valor configurado</th>
                    <th>Monto adulto</th>
                    <th>Monto niño</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryAdditionalCostRows.map((row) => {
                    const Icon = row.icon;
                    return (
                      <tr className={row.className} key={row.key}>
                        <td className="concept-cell">
                          <Icon className="concept-icon" />
                          <span>{row.concept}</span>
                        </td>
                        <td className="mode-cell">
                          <span
                            className={`mode-badge ${
                              row.mode === "percentage" ? "percentage" : "fixed"
                            }`}
                          >
                            {row.modeLabel}
                          </span>
                        </td>
                        <td className="configured-cell">{row.configured}</td>
                        <td className="total-cell">
                          {formatCurrency(row.adultAmount || 0)}
                        </td>
                        <td className="total-cell total-cell--child">
                          {effectivePeopleCount.children > 0
                            ? formatCurrency(row.childAmount || 0)
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="ac__summary summary-content__ac-summary">
            {nationalSummaryRoomCount > 0 && (
              <div className="ac__national-note" role="note">
                <div>
                  <strong>Tarifa nacional en hotel</strong>
                  <span>
                    La habitación que aloja a un pasajero peruano incluye IGV
                    para todos sus ocupantes.
                  </span>
                </div>
                <small>
                  {nationalSummaryRoomCount} habitación
                  {nationalSummaryRoomCount !== 1 ? "es" : ""} afectada
                  {nationalSummaryRoomCount !== 1 ? "s" : ""}
                </small>
              </div>
            )}
            <div className="ac__summary-breakdown">
              <div className="ac__summary-breakdown-row">
                <span className="ac__summary-breakdown-label">
                  <MdRoomService /> Servicios
                </span>
                <span className="ac__summary-breakdown-item">
                  <MdPerson className="icon-adult" />
                  <strong>{formatCurrency(financialData.subtotalIndividual)}</strong>
                  <small>/adulto</small>
                </span>
                {childChargeSummary.nonHotelUnifiedPerChild > 0 && (
                  <span className="ac__summary-breakdown-item ac__breakdown-item--child">
                    <MdChildCare className="icon-child" />
                    <strong>
                      {formatCurrency(childChargeSummary.nonHotelUnifiedPerChild)}
                    </strong>
                    <small>
                      niños ({Math.max(0, Number(effectivePeopleCount.children || 0))})
                    </small>
                  </span>
                )}
              </div>

              <div className="ac__summary-breakdown-row">
                <span className="ac__summary-breakdown-label">
                  <MdHotel /> Hoteles
                </span>
                {summaryGroupHotelBreakdown.length > 0 && (
                  <div className="ac__hotel-group-breakdown">
                    {summaryGroupHotelBreakdown.map((group) => (
                      <div className="ac__hotel-group-card" key={group.key}>
                        <div className="ac__hotel-group-card-head">
                          <strong>{group.label}</strong>
                          <span>{group.categoryLabel}</span>
                          {group.daysLabel && <small>{group.daysLabel}</small>}
                        </div>
                        <div className="ac__hotel-group-card-rooms">
                          {group.rooms.map((room) => (
                            <span
                              className={`ac__hotel-group-room ${
                                room.child ? "ac__hotel-group-room--child" : ""
                              } ${
                                room.isNationalRoom && room.igvPerPerson > 0
                                  ? "ac__hotel-group-room--national"
                                  : ""
                              }`.trim()}
                              key={room.key}
                            >
                              <span className="ac__hotel-group-room-label">
                                {room.label}
                                {room.beneficiaries > 0
                                  ? ` (${room.beneficiaries})`
                                  : ""}
                              </span>
                              {room.isNationalRoom && room.igvPerPerson > 0 && (
                                <em className="ac__national-badge">
                                  Nacional · IGV 18%
                                </em>
                              )}
                              <strong>{formatCurrency(room.value)}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {summaryRoomHotelParts.length > 0 ? (
                  <>
                    <span className="ac__summary-breakdown-item ac__summary-breakdown-item--room ac__summary-breakdown-item--room-total-label">
                      <MdHotel className="icon-room" />
                      <strong>Total</strong>
                      <small>por habitación / persona</small>
                    </span>
                    {summaryRoomHotelParts.map((part) => (
                      <span
                        className={`ac__summary-breakdown-item ac__summary-breakdown-item--room ac__summary-breakdown-item--room-total ${
                          part.isNationalRoom && part.igvPerPerson > 0
                            ? "ac__summary-breakdown-item--national"
                            : ""
                        }`.trim()}
                        key={part.key}
                      >
                        <MdHotel className="icon-room" />
                        <div className="ac__room-total-copy">
                          <small>
                            {part.label}
                            {part.beneficiaries > 0
                              ? ` (${part.beneficiaries} pax)`
                              : ""}
                          </small>
                          {part.isNationalRoom && part.igvPerPerson > 0 && (
                            <span className="ac__room-tax-note">
                              Base {formatCurrency(part.hotelBasePerPerson)} + IGV{" "}
                              {formatCurrency(part.igvPerPerson)}
                            </span>
                          )}
                        </div>
                        {part.isNationalRoom && part.igvPerPerson > 0 && (
                          <em className="ac__national-badge">Nacional</em>
                        )}
                        <strong>{formatCurrency(part.value)}</strong>
                      </span>
                    ))}
                  </>
                ) : financialData.hotelPerAdult > 0 ? (
                  <span className="ac__summary-breakdown-item">
                    <MdPerson className="icon-adult" />
                    <strong>{formatCurrency(financialData.hotelPerAdult)}</strong>
                    <small>/adulto</small>
                  </span>
                ) : (
                  <span className="ac__summary-breakdown-item ac__summary-breakdown-item--room ac__summary-breakdown-item--no-hotel">
                    <MdHotel className="icon-room" />
                    <strong>{formatCurrency(0)}</strong>
                    <small>
                      Sin hotel
                      {effectivePeopleCount.adults > 0
                        ? ` (${effectivePeopleCount.adults})`
                        : ""}
                    </small>
                  </span>
                )}
                {childChargeSummary.hotelUnifiedPerChild > 0 && (
                  <span className="ac__summary-breakdown-item ac__breakdown-item--child">
                    <MdChildCare className="icon-child" />
                    <strong>{formatCurrency(childChargeSummary.hotelUnifiedPerChild)}</strong>
                    <small>
                      niños ({Math.max(0, Number(effectivePeopleCount.children || 0))})
                    </small>
                  </span>
                )}
              </div>

              {(financialData.totalAdditionalPerAdult > 0 ||
                financialData.totalAdditionalPerChild > 0) && (
                <div className="ac__summary-breakdown-row">
                  <span className="ac__summary-breakdown-label">
                    <MdReceipt /> Adicionales
                  </span>
                  {financialData.totalAdditionalPerAdult > 0 && (
                    <span className="ac__summary-breakdown-item">
                      <MdPerson className="icon-adult" />
                      <strong>
                        {formatCurrency(financialData.totalAdditionalPerAdult)}
                      </strong>
                      <small>/adulto</small>
                    </span>
                  )}
                  {financialData.totalAdditionalPerChild > 0 &&
                    effectivePeopleCount.children > 0 && (
                      <span className="ac__summary-breakdown-item ac__breakdown-item--child">
                        <MdChildCare className="icon-child" />
                        <strong>
                          {formatCurrency(financialData.totalAdditionalPerChild)}
                        </strong>
                        <small>/niño</small>
                      </span>
                    )}
                </div>
              )}
            </div>

            <div className="ac__summary-calc" data-summary-calculation tabIndex={-1}>
              <div className="ac__summary-calc-header">
                <span>Cálculo por persona</span>
                <small>Servicios + hotel + adicionales</small>
              </div>

              {summaryFinancialCalcCards.length > 0 ? (
                <div className="ac__summary-calc-grid">
                  {summaryFinancialCalcCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <div
                        className={`ac__summary-calc-card ${card.className || ""}`.trim()}
                        key={card.key}
                      >
                        <div className="ac__summary-calc-card-head">
                          <span className="ac__summary-calc-card-icon">
                            <Icon />
                          </span>
                          <div className="ac__summary-calc-card-identity">
                            <small>
                              {card.audience === "child"
                                ? "Tarifa infantil"
                                : "Tarifa por adulto"}
                            </small>
                            <span>{card.label}</span>
                          </div>
                          <div className="ac__summary-calc-card-meta">
                            {card.isNationalRoom && (
                              <em className="ac__national-badge">Nacional</em>
                            )}
                            {card.isFree && (
                              <em className="ac__free-badge">Gratis</em>
                            )}
                            {card.beneficiaries > 0 && (
                              <small>{card.beneficiaries} pax</small>
                            )}
                          </div>
                        </div>
                        {(card.isNationalRoom || card.roomLabels?.length > 0) && (
                          <div className="ac__summary-calc-card-context">
                            {card.isNationalRoom && (
                              <div className="ac__national-room-caption">
                                {card.affectedPaxCount
                                  ? `IGV aplicado a los ${card.affectedPaxCount} ocupantes`
                                  : "Comparte la tarifa nacional de la habitación"}
                                {card.nationalPassengerLabels?.length
                                  ? ` · ${card.nationalPassengerLabels.join(", ")}`
                                  : ""}
                              </div>
                            )}
                            {card.roomLabels?.length > 0 && (
                              <div className="ac__child-room-caption">
                                {card.roomLabels.join(" · ")}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="ac__summary-calc-card-body">
                          {card.lines.map((line) => (
                            <div
                              className={`ac__summary-calc-line ${
                                line.key === "igv"
                                  ? "ac__summary-calc-line--igv"
                                  : ""
                              }`}
                              key={`${card.key}-${line.key}`}
                            >
                              <span>{line.label}</span>
                              <strong>{formatCurrency(line.value || 0)}</strong>
                            </div>
                          ))}
                        </div>
                        <div className="ac__summary-calc-line ac__summary-calc-line--final">
                          <span>Total</span>
                          <strong>
                            {card.isFree
                              ? "Gratis"
                              : formatCurrency(card.total || 0)}
                          </strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  {financialData.baseWithHotel > 0 && (
                    <div className="ac__summary-calc-row">
                      <span>= Costos operativos + hotel / adulto:</span>
                      <span>{formatCurrency(financialData.baseWithHotel)}</span>
                    </div>
                  )}

                  {summaryAdditionalCostRows
                    .filter((row) => ensureNumber(row.adultAmount) > 0)
                    .map((row) => (
                      <div className="ac__summary-calc-row" key={`adult-${row.key}`}>
                        <span>+ {row.calcLabel || row.concept} / adulto:</span>
                        <span>{formatCurrency(row.adultAmount)}</span>
                      </div>
                    ))}

                  {effectivePeopleCount.children > 0 &&
                    summaryAdditionalCostRows
                      .filter((row) => ensureNumber(row.childAmount) > 0)
                      .map((row) => (
                        <div className="ac__summary-calc-row" key={`child-${row.key}`}>
                          <span>+ {row.calcLabel || row.concept} / niño:</span>
                          <span>{formatCurrency(row.childAmount)}</span>
                        </div>
                      ))}

                  {childChargeSummary.unifiedPerChild > 0 && (
                    <div className="ac__summary-calc-row">
                      <span>
                        + Tarifa / niño
                        {childChargeSummary.unifiedCount > 1
                          ? ` (${childChargeSummary.unifiedCount})`
                          : ""}
                        :
                      </span>
                      <span>{formatCurrency(childChargeSummary.unifiedPerChild)}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="ac__summary-row ac__summary-row--total summary-content__ac-total-row">
              <div className="ac__summary-total-main">
                <span className="ac__summary-total-label">RESUMEN</span>
                {totalFormulaParts.length > 0 && (
                  <div className="ac__summary-total-formula">
                    {totalFormulaParts.map((part) => {
                      const Icon = part.icon;
                      const className = String(part.className || "")
                        .replace(/financial-summary__pill/g, "ac__summary-total-pill")
                        .replace(/financial-summary-pill/g, "ac__summary-total-pill");
                      return (
                        <Fragment key={part.key}>
                          <span
                            className={`ac__summary-total-pill ${className || "ac__summary-total-pill--adult"}`}
                          >
                            <Icon />
                            <strong>
                              {formatCurrency(
                                Math.ceil(ensureNumber(part.value)),
                                "dolares",
                                0,
                              )}
                            </strong>
                            <small>{part.label}</small>
                          </span>
                        </Fragment>
                      );
                    })}
                    {summaryFormulaRoundedTotal > 0 && (
                      <span className="ac__summary-total-pill summary-content__formula-total-pill">
                        <MdAssignment />
                        <strong>{formatCurrency(summaryFormulaRoundedTotal)}</strong>
                        <small>Total fórmula</small>
                      </span>
                    )}
                    <span className="ac__summary-total-pill summary-content__grand-total-pill">
                      <MdMonetizationOn />
                      <strong>{formatCurrency(summaryFinalTotal)}</strong>
                      <small>Total final</small>
                    </span>
                    {financialData.subtotalFinal > 0 &&
                      financialData.subtotalFinal < summaryFinalTotal && (
                        <span className="ac__summary-total-pill summary-content__subtotal-final-pill">
                          <MdAssignment />
                          <strong>{formatCurrency(financialData.subtotalFinal)}</strong>
                          <small>Sin itinerario externo</small>
                        </span>
                      )}
                  </div>
                )}
              </div>
            </div>

            <PassengerPriceVerification
              parts={summaryVerificationParts}
              total={summaryFinalTotal}
              title="Comprobación del total por pasajeros"
              description="Precio redondeado por tipo de habitación × cantidad de pasajeros"
            />
          </div>
        </div>
      </div>

      {renderPeopleDetailsSection()}
    </div>
  );
});

SummaryContent.displayName = "SummaryContent";
export default SummaryContent;
