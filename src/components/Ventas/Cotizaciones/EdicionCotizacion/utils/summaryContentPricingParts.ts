import { getHotelRoomCapacity } from "../../../../../utils/hotelRoomTypes";
import { aggregatePerRoomPricingByStayGroup } from "./financialDisplayHelpers";
import { buildPreviewPerRoomPricing } from "./pdfHotelPreviewData";
import {
  buildSummaryPricingCore,
  parseSummaryPricingArray,
  parseSummaryPricingObject,
} from "./summaryPricingCore";
import { buildQuotationPricingSnapshotFromCotizacion } from "./quotationPricingSnapshot";

const n = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePricingSource = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const normalizeRoomText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

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
      const count = Math.max(1, n(room?.cnt || room?.count || 1) || 1);
      const unit = n(room?.unit) || (n(room?.sub) > 0 ? n(room.sub) / count : 0);
      const key = String(room?.key || normalizeRoomText(room?.label)).trim();
      if (!key || unit <= 0) return null;
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
    const count = Math.max(0, n(room?.cnt || room?.count));
    if (!key || count <= 0) return accumulator;
    accumulator[key] = count;
    return accumulator;
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
    if (!roomKey || !Number.isFinite(parsed) || parsed < 0) return accumulator;
    accumulator[roomKey] = parsed;
    return accumulator;
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
    const existing = parseSummaryPricingArray(group?.perRoomPricing);
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
      dayIndices.length || n(group?.nights || hotel?.nights || 1) || 1,
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
      adultsCount: Math.max(1, n(peopleCount?.adults) || 1),
      childrenCount: Math.max(0, n(peopleCount?.children)),
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

export const resolveSummaryContentPerRoomPricing = (cotizacion = {}) => {
  cotizacion = normalizePricingSource(cotizacion);

  const selectedHotel =
    cotizacion.selectedHotel || cotizacion.selected_hotel || null;
  const peopleDetails =
    cotizacion.peopleDetails ||
    cotizacion.people_details ||
    cotizacion.peopledetails || { adults: [], children: [] };
  const peopleCount =
    cotizacion.peopleCount ||
    cotizacion.peoplecount || {
      adults: n(cotizacion.num_adults ?? cotizacion.numAdults) || 1,
      children: n(cotizacion.num_children ?? cotizacion.numChildren),
    };
  const rawAdditionalCosts = parseSummaryPricingObject(
    cotizacion.additionalCosts ||
      cotizacion.additionalcosts ||
      cotizacion.additional_costs ||
      {},
  );
  const additionalCosts = {
    ...rawAdditionalCosts,
    nonHotelExplicitChildTotalsById:
      rawAdditionalCosts.nonHotelExplicitChildTotalsById ||
      cotizacion.nonHotelExplicitChildTotalsById ||
      cotizacion.baseExplicitChildTotalsById ||
      {},
    nonHotelConvertedChildTotalsById:
      rawAdditionalCosts.nonHotelConvertedChildTotalsById ||
      cotizacion.nonHotelConvertedChildTotalsById ||
      cotizacion.baseConvertedChildTotalsById ||
      {},
    hotelExplicitChildTotalsById:
      rawAdditionalCosts.hotelExplicitChildTotalsById ||
      cotizacion.hotelExplicitChildTotalsById ||
      {},
    hotelConvertedChildTotalsById:
      rawAdditionalCosts.hotelConvertedChildTotalsById ||
      cotizacion.hotelConvertedChildTotalsById ||
      {},
  };
  const subtotalIndividual = n(
    cotizacion.subtotalIndividual ??
      cotizacion.subtotal_individual ??
      cotizacion.nonHotelsTotal ??
      cotizacion.precio_it_adulto ??
      cotizacion.precioItAdulto,
  );
  const externalAdultTotal = n(
    cotizacion.precio_it_ext_adulto ?? cotizacion.precioItExtAdulto,
  );
  const fallbackArgs = {
    hotel: selectedHotel,
    peopleCount,
    subtotalIndividual,
    nonHotelExplicitChildTotal: n(cotizacion.nonHotelExplicitChildTotal),
    nonHotelConvertedChildTotal: n(cotizacion.nonHotelConvertedChildTotal),
    additionalCosts,
    externalAdultTotal,
    peopleDetails,
  };

  const groupedPricing = buildGroupedFallbackPerRoomPricing(fallbackArgs);
  const explicitPricing = [
    cotizacion.perRoomPricing,
    cotizacion.per_room_pricing,
    selectedHotel?.perRoomPricing,
    selectedHotel?.per_room_pricing,
  ]
    .map(parseSummaryPricingArray)
    .find((rows) => rows.length > 0) || [];

  let rawPricing = groupedPricing.length > 0 ? groupedPricing : explicitPricing;
  if (rawPricing.length === 0 && selectedHotel) {
    const selectedRow = getSelectedCategoryRow(selectedHotel);
    const existingPricing = [
      selectedHotel?.perRoomPricing,
      selectedRow?.perRoomPricing,
    ]
      .map(parseSummaryPricingArray)
      .find((rows) => rows.length > 0);
    if (existingPricing?.length) {
      rawPricing = existingPricing;
    } else {
      const breakdown = getHotelPricingBreakdown(selectedHotel);
      const roomOptions = applyRoomPriceOverridesToOptions(
        Array.isArray(selectedHotel?.roomOptions) &&
          selectedHotel.roomOptions.length > 0
          ? selectedHotel.roomOptions
          : Array.isArray(selectedRow?.roomOptions) &&
              selectedRow.roomOptions.length > 0
            ? selectedRow.roomOptions
            : buildRoomOptionsFromBreakdown(breakdown),
        selectedHotel?.priceOverrides || selectedHotel?.price_overrides || {},
      );
      const mix =
        selectedHotel?.mix &&
        typeof selectedHotel.mix === "object" &&
        Object.keys(selectedHotel.mix).length
          ? selectedHotel.mix
          : selectedRow?.mix &&
              typeof selectedRow.mix === "object" &&
              Object.keys(selectedRow.mix).length
            ? selectedRow.mix
            : buildRoomMixFromBreakdown(breakdown);
      if (roomOptions.length > 0 && Object.keys(mix).length > 0) {
        const nights = Array.isArray(selectedHotel?.selectedNightIndices)
          ? selectedHotel.selectedNightIndices.length
          : n(selectedHotel?.nights || selectedRow?.nights || 1) || 1;
        rawPricing = buildPreviewPerRoomPricing({
          hotel: selectedHotel,
          row: {
            category: selectedHotel.category || selectedRow?.category,
            mix,
          },
          roomOptions,
          adultsCount: Math.max(1, n(peopleCount?.adults) || 1),
          childrenCount: Math.max(0, n(peopleCount?.children)),
          nonHotelsTotal: subtotalIndividual,
          nonHotelExplicitChildTotal: n(
            cotizacion.nonHotelExplicitChildTotal,
          ),
          nonHotelConvertedChildTotal: n(
            cotizacion.nonHotelConvertedChildTotal,
          ),
          additionalCfg: additionalCosts,
          nights,
          externalAdultTotal,
          peopleDetails,
        });
      }
    }
  }

  const aggregated = aggregatePerRoomPricingByStayGroup(rawPricing);
  return aggregated.length > 0 ? aggregated : rawPricing;
};

/**
 * Reproduce la fuente visible de SummaryContent (ac__summary-calc,
 * ac__summary-total-main y pax-price-check) sin leer un snapshot persistido.
 */
export const buildSummaryContentPricingModel = (cotizacion = {}) => {
  cotizacion = normalizePricingSource(cotizacion);

  const perRoomPricing = resolveSummaryContentPerRoomPricing(cotizacion);
  const rawAdditionalCosts = parseSummaryPricingObject(
    cotizacion.additionalCosts ||
      cotizacion.additionalcosts ||
      cotizacion.additional_costs ||
      {},
  );
  const additionalCosts = {
    ...rawAdditionalCosts,
    nonHotelExplicitChildTotalsById:
      rawAdditionalCosts.nonHotelExplicitChildTotalsById ||
      cotizacion.nonHotelExplicitChildTotalsById ||
      cotizacion.baseExplicitChildTotalsById ||
      {},
    nonHotelConvertedChildTotalsById:
      rawAdditionalCosts.nonHotelConvertedChildTotalsById ||
      cotizacion.nonHotelConvertedChildTotalsById ||
      cotizacion.baseConvertedChildTotalsById ||
      {},
    hotelExplicitChildTotalsById:
      rawAdditionalCosts.hotelExplicitChildTotalsById ||
      cotizacion.hotelExplicitChildTotalsById ||
      {},
    hotelConvertedChildTotalsById:
      rawAdditionalCosts.hotelConvertedChildTotalsById ||
      cotizacion.hotelConvertedChildTotalsById ||
      {},
  };

  const hydratedPricingSource = {
    ...cotizacion,
    additionalCosts,
    additionalcosts: additionalCosts,
    perRoomPricing,
  };
  const core = buildSummaryPricingCore(hydratedPricingSource, {
    perRoomPricing,
  });
  const liveSnapshot = buildQuotationPricingSnapshotFromCotizacion(
    hydratedPricingSource,
  );

  if (!Array.isArray(liveSnapshot?.parts) || liveSnapshot.parts.length === 0) {
    return core;
  }

  return {
    ...core,
    parts: liveSnapshot.parts,
    roundedTotal: liveSnapshot.grandTotal,
    canonicalPricingSnapshot: liveSnapshot,
  };
};

export const buildSummaryContentPerPersonParts = (cotizacion = {}) =>
  buildSummaryContentPricingModel(cotizacion).parts;

export default buildSummaryContentPerPersonParts;
