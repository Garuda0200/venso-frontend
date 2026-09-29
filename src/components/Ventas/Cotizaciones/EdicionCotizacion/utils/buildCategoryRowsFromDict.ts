import { autoMixForPax, transferRoomMixToOptions } from "./hotelRoomMix";
import { calculateAdditionalAmount } from "./quotePricingEngine";

const CAT_LABELS = {
  2: "2\u2605\u2605 Est\u00e1ndar",
  3: "3\u2605\u2605\u2605 Est\u00e1ndar",
  "3s": "3\u2605\u2605\u2605 Superior",
  4: "4\u2605\u2605\u2605\u2605 Estrellas",
  5: "5\u2605\u2605\u2605\u2605\u2605 Estrellas",
};

const ORDERED_CATS = ["2", "3", "3s", "4", "5"];
const normalizeCat = (c) =>
  String(c ?? "")
    .trim()
    .toLowerCase();

export default function buildCategoryRowsFromDict({
  roomOptionsByCategory,
  selectedCategory,
  priceOverrides = {},
  savedMix = null,
  adultsCount = 1,
  selectedNights = 1,
  defaultNights = 1,
  subtotalIndividual = 0,
  additionalCosts = {},
  externalAdultTotal = 0,
  externalChildTotal = 0,
  externalConvertedChildTotal = 0,
  childrenCount = 0,
  baseExplicitChildTotal = null,
  baseConvertedChildTotal = null,
  nonHotelConvertedChildTotal = null,
  baseExplicitChildTotalsById = null,
  baseConvertedChildTotalsById = null,
  hotelExplicitChildTotal = null,
  hotelChildTotal = null,
  hotelConvertedChildTotal = null,
  hotelExplicitChildTotalsById = null,
  hotelConvertedChildTotalsById = null,
  hotelExplicitChildCount = null,
  hotelConvertedChildCount = null,
}) {
  if (!roomOptionsByCategory) return [];

  const n = (v) => Number(v) || 0;
  const round2 = (v) =>
    Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
  const normalizeRoomAlias = (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");
  const getRoomOverrideAliases = (room = {}) => {
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
      const normalized = normalizeRoomAlias(raw);
      if (normalized) {
        aliases.add(normalized);
        aliases.add(normalized.split(":")[0]);
      }
    });

    return [...aliases].filter(Boolean);
  };
  const resolveRoomOverrideValue = (room = {}, overrides = {}) => {
    const normalizedOverrides = overrides || {};
    const aliases = getRoomOverrideAliases(room);
    const matchingAlias = aliases.find((alias) =>
      Object.prototype.hasOwnProperty.call(normalizedOverrides, alias),
    );
    return matchingAlias ? normalizedOverrides[matchingAlias] : undefined;
  };
  const applyRoomPriceOverrides = (roomOptions = [], overrides = {}) =>
    (Array.isArray(roomOptions) ? roomOptions : []).map((option) => {
      const overrideValue = resolveRoomOverrideValue(option, overrides);
      return overrideValue !== undefined
        ? {
            ...option,
            pricePerRoomNight: n(overrideValue),
          }
        : option;
    });

  const resolveObject = (value, fallback = {}) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : fallback;
  const countObjectKeys = (value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value).length
      : 0;
  const sumObjectValues = (value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.values(value).reduce((sum, amount) => sum + n(amount), 0)
      : 0;

  const resolvedBaseExplicitChildTotal = n(
    baseExplicitChildTotal ??
      additionalCosts?.nonHotelExplicitChildTotal ??
      additionalCosts?.baseExplicitChildTotal ??
      additionalCosts?.subtotalNinos ??
      0,
  );
  const resolvedBaseConvertedChildTotal = n(
    baseConvertedChildTotal ??
      additionalCosts?.nonHotelConvertedChildTotal ??
      additionalCosts?.baseConvertedChildTotal ??
      0,
  );
  const resolvedNonHotelConvertedChildTotal = n(
    nonHotelConvertedChildTotal ??
      additionalCosts?.nonHotelConvertedChildTotal ??
      additionalCosts?.baseConvertedChildTotal ??
      resolvedBaseConvertedChildTotal,
  );
  const resolvedBaseExplicitChildTotalsById = resolveObject(
    baseExplicitChildTotalsById ??
      additionalCosts?.nonHotelExplicitChildTotalsById ??
      additionalCosts?.baseExplicitChildTotalsById,
  );
  const resolvedBaseConvertedChildTotalsById = resolveObject(
    baseConvertedChildTotalsById ??
      additionalCosts?.nonHotelConvertedChildTotalsById ??
      additionalCosts?.baseConvertedChildTotalsById,
  );
  const resolvedHotelExplicitChildTotalsById = resolveObject(
    hotelExplicitChildTotalsById ?? additionalCosts?.hotelExplicitChildTotalsById,
  );
  const resolvedHotelExplicitChildTotal = n(
    hotelExplicitChildTotal ??
      additionalCosts?.hotelExplicitChildTotal ??
      additionalCosts?.hotel_child_total ??
      0,
  );
  const resolvedHotelChildTotal = n(
    hotelChildTotal ??
      additionalCosts?.hotelChildTotal ??
      additionalCosts?.hotel_child_total ??
      resolvedHotelExplicitChildTotal,
  );
  const resolvedHotelConvertedChildTotalsById = resolveObject(
    hotelConvertedChildTotalsById ??
      additionalCosts?.hotelConvertedChildTotalsById,
  );
  const resolvedHotelConvertedChildTotal =
    sumObjectValues(resolvedHotelConvertedChildTotalsById) ||
    n(hotelConvertedChildTotal ?? additionalCosts?.hotelConvertedChildTotal ?? 0);
  const resolvedHotelExplicitChildCount = Math.max(
    0,
    n(hotelExplicitChildCount ?? additionalCosts?.hotelExplicitChildCount ?? 0),
    countObjectKeys(resolvedHotelExplicitChildTotalsById),
    resolvedHotelExplicitChildTotal > 0 ? n(childrenCount) : 0,
  );
  const resolvedHotelConvertedChildCount = Math.max(
    0,
    n(hotelConvertedChildCount ?? additionalCosts?.hotelConvertedChildCount ?? 0),
    countObjectKeys(resolvedHotelConvertedChildTotalsById),
  );

  const calcAdicionales = (base, audience = "adult") => {
    return calculateAdditionalAmount(additionalCosts, base, audience).total;
  };

  const adults = Math.max(1, n(adultsCount));
  const selCat = normalizeCat(selectedCategory);
  const selectedPack = roomOptionsByCategory[selCat];
  const selectedOverrides = priceOverrides[selCat] || {};
  const selectedRoomOptions = applyRoomPriceOverrides(
    selectedPack?.roomOptions || [],
    selectedOverrides,
  );

  const rows = [];

  ORDERED_CATS.forEach((cat) => {
    const pack = roomOptionsByCategory[cat];
    if (!pack?.roomOptions?.length) return;

    const isSelected = normalizeCat(cat) === selCat;
    const overrides = priceOverrides[normalizeCat(cat)] || {};
    const roomOpts = applyRoomPriceOverrides(
      pack.roomOptions || [],
      overrides,
    );

    // Determine room mix
    let mix = {};
    if (savedMix && Object.keys(savedMix).length) {
      mix = isSelected
        ? { ...savedMix }
        : transferRoomMixToOptions(savedMix, selectedRoomOptions, roomOpts);
    }
    if (!Object.keys(mix).length) {
      mix = autoMixForPax(roomOpts, adults);
    }

    // costFromMix
    const optMap = new Map(roomOpts.map((o) => [o.key, o]));
    let perNightSum = 0;
    Object.entries(mix).forEach(([k, c]) => {
      const o = optMap.get(k);
      if (o)
        perNightSum +=
          n(o.pricePerRoomNight) * Math.max(0, parseInt(c, 10) || 0);
    });

    // The preview compares hotel categories for the same selected hotel stay.
    // Do not use the itinerary-wide default nights for unselected categories:
    // HotelPricingModal prices every category with the active selected-night count.
    const effNights = Math.max(1, n(selectedNights) || n(defaultNights) || 1);
    const hotelTotal = round2(perNightSum * effNights);
    const hotelPerAdult = round2(hotelTotal / adults);
    const basePerAdult = round2(n(subtotalIndividual) + hotelPerAdult);
    const totalPerAdult = round2(
      basePerAdult + calcAdicionales(basePerAdult) + externalAdultTotal,
    );
    const children = Math.max(0, n(childrenCount));
    const hasCurrentChildren = children > 0;
    const currentBaseExplicitChildTotalsById = hasCurrentChildren
      ? resolvedBaseExplicitChildTotalsById
      : {};
    const currentBaseConvertedChildTotalsById = hasCurrentChildren
      ? resolvedBaseConvertedChildTotalsById
      : {};
    const currentHotelExplicitChildTotalsById = hasCurrentChildren
      ? resolvedHotelExplicitChildTotalsById
      : {};
    const currentHotelConvertedChildTotalsById = hasCurrentChildren
      ? resolvedHotelConvertedChildTotalsById
      : {};
    const currentBaseExplicitChildTotal = hasCurrentChildren
      ? resolvedBaseExplicitChildTotal
      : 0;
    const currentBaseConvertedChildTotal = hasCurrentChildren
      ? resolvedBaseConvertedChildTotal
      : 0;
    const currentHotelExplicitChildTotal = hasCurrentChildren
      ? resolvedHotelExplicitChildTotal
      : 0;
    const currentHotelChildTotal = hasCurrentChildren
      ? resolvedHotelChildTotal
      : 0;
    const currentHotelConvertedChildTotal = hasCurrentChildren
      ? resolvedHotelConvertedChildTotal
      : 0;
    const currentHotelExplicitChildCount = hasCurrentChildren
      ? Math.min(children, resolvedHotelExplicitChildCount)
      : 0;
    const currentHotelConvertedChildCount = hasCurrentChildren
      ? Math.min(children, resolvedHotelConvertedChildCount)
      : 0;

    const childServiceTotal =
      (sumObjectValues(currentBaseExplicitChildTotalsById) ||
        currentBaseExplicitChildTotal) +
      (sumObjectValues(currentBaseConvertedChildTotalsById) ||
        currentBaseConvertedChildTotal);
    const selectedHotelChildTotal =
      isSelected
        ? (sumObjectValues(currentHotelExplicitChildTotalsById) ||
            currentHotelExplicitChildTotal) +
          currentHotelConvertedChildTotal
        : 0;
    const selectedHotelChildUnit =
      children > 0 && selectedHotelChildTotal > 0
        ? round2(selectedHotelChildTotal / children)
        : 0;
    const hotelOccupancy = Math.max(
      1,
      adults + children,
    );
    const fallbackHotelChildUnit =
      children > 0 ? round2(hotelTotal / hotelOccupancy) : 0;
    const hotelPerChild = isSelected && selectedHotelChildUnit > 0
      ? selectedHotelChildUnit
      : fallbackHotelChildUnit;
    const servicePerChild =
      children > 0 ? round2(childServiceTotal / children) : 0;
    const basePerChild = round2(servicePerChild + hotelPerChild);
    const totalPerChild =
      children > 0 &&
      (basePerChild > 0 ||
        n(externalChildTotal) > 0 ||
        n(externalConvertedChildTotal) > 0)
        ? round2(
            basePerChild +
              calcAdicionales(basePerChild, "child") +
              n(externalChildTotal) +
              n(externalConvertedChildTotal),
          )
        : 0;

    rows.push({
      category: cat,
      label: CAT_LABELS[cat] || `${cat} Estrellas`,
      hotelName: pack.hotelName || "Hotel",
      isSelected,
      totalPerAdult,
      totalPerChild,
      totalPerChildIsPerPerson: true,
      pricingEngineVersion: 1,
      hotelPerAdult,
      hotelPerChild,
      hotelTotal,
      perNightSum: round2(perNightSum),
      // nights is used by buildRoomPriceMatrix to recompute hotelPerAdult per room type with correct night count
      nights: effNights,
      roomOptions: roomOpts,
      nonHotelsTotal: n(subtotalIndividual),
      additionalCfg: {
        operationalMode: additionalCosts.operationalMode,
        operationalCosts: additionalCosts.operationalCosts,
        feeMode: additionalCosts.feeMode,
        fee: additionalCosts.fee,
        feeVal: additionalCosts.fee,
        extraFee: additionalCosts.extraFee,
        applyAdditionalCostsToChildren:
          additionalCosts.applyAdditionalCostsToChildren !== false,
        applyOperationalCostsToChildren:
          additionalCosts.applyOperationalCostsToChildren ??
          additionalCosts.applyAdditionalCostsToChildren ??
          true,
        applyFeeToChildren:
          additionalCosts.applyFeeToChildren ??
          additionalCosts.applyAdditionalCostsToChildren ??
          true,
        applyExtraFeeToChildren:
          additionalCosts.applyExtraFeeToChildren ??
          additionalCosts.applyAdditionalCostsToChildren ??
          true,
        childOperationalMode:
          additionalCosts.childOperationalMode || additionalCosts.operationalMode,
        childOperationalCosts:
          additionalCosts.childOperationalCosts ?? additionalCosts.operationalCosts,
        childFeeMode: additionalCosts.childFeeMode || additionalCosts.feeMode,
        childFee: additionalCosts.childFee ?? additionalCosts.fee,
        childExtraFee: additionalCosts.childExtraFee ?? additionalCosts.extraFee,
      },
      explicitChildrenCount: Math.max(0, children),
      convertedChildCount: currentHotelConvertedChildCount,
      hotelExplicitChildCount: currentHotelExplicitChildCount,
      hotelConvertedChildCount: currentHotelConvertedChildCount,
      hotelExplicitChildTotal: isSelected ? currentHotelExplicitChildTotal : 0,
      hotelChildTotal: isSelected ? currentHotelChildTotal : 0,
      hotelConvertedChildTotal: isSelected ? currentHotelConvertedChildTotal : 0,
      baseExplicitChildTotal: currentBaseExplicitChildTotal,
      baseConvertedChildTotal: currentBaseConvertedChildTotal,
      nonHotelConvertedChildTotal: hasCurrentChildren
        ? resolvedNonHotelConvertedChildTotal
        : 0,
      baseExplicitChildTotalsById: currentBaseExplicitChildTotalsById,
      baseConvertedChildTotalsById: currentBaseConvertedChildTotalsById,
      hotelExplicitChildTotalsById: currentHotelExplicitChildTotalsById,
      hotelConvertedChildTotalsById: currentHotelConvertedChildTotalsById,
      mix,
    });
  });

  return rows;
}
