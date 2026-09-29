import { getServiceBeneficiarySnapshot } from "./passengerPricingState";

const n = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isChildId = (id) => String(id || "").startsWith("child:");

const collectChildIdsFromAssignments = (assignments = {}, target = new Set()) => {
  if (!assignments || typeof assignments !== "object") return target;

  Object.values(assignments).forEach((ids) => {
    (Array.isArray(ids) ? ids : []).forEach((id) => {
      if (isChildId(id)) target.add(String(id));
    });
  });

  return target;
};

const collectHotelAssignedChildIds = (hotelConfig = {}) => {
  const childIds = collectChildIdsFromAssignments(
    hotelConfig?.roomAssignments,
  );

  (Array.isArray(hotelConfig?.dayGroups) ? hotelConfig.dayGroups : []).forEach(
    (group) => collectChildIdsFromAssignments(group?.roomAssignments, childIds),
  );

  (Array.isArray(hotelConfig?.perRoomPricing)
    ? hotelConfig.perRoomPricing
    : []
  ).forEach((room) => {
    (Array.isArray(room?.passengerIds) ? room.passengerIds : []).forEach(
      (id) => {
        if (isChildId(id)) childIds.add(String(id));
      },
    );
    (Array.isArray(room?.roomDetails) ? room.roomDetails : []).forEach(
      (detail) => {
        (Array.isArray(detail?.passengerIds) ? detail.passengerIds : []).forEach(
          (id) => {
            if (isChildId(id)) childIds.add(String(id));
          },
        );
      },
    );
  });

  return childIds;
};

const hasPersistedHotelSelection = (hotelConfig = {}) =>
  Boolean(
    n(hotelConfig?.hotelTotal) > 0 ||
      n(hotelConfig?.total) > 0 ||
      n(hotelConfig?.perNightSum) > 0 ||
      (hotelConfig?.mix && Object.keys(hotelConfig.mix).length > 0) ||
      (hotelConfig?.roomAssignments &&
        Object.keys(hotelConfig.roomAssignments).length > 0) ||
      (Array.isArray(hotelConfig?.selectedNightIndices) &&
        hotelConfig.selectedNightIndices.length > 0) ||
      (Array.isArray(hotelConfig?.perRoomPricing) &&
        hotelConfig.perRoomPricing.length > 0) ||
      (Array.isArray(hotelConfig?.dayGroups) &&
        hotelConfig.dayGroups.length > 0),
  );

const preserveAssignedFreeChildren = (childPricing, hotelConfig) => {
  const assignedRoomChildIds = collectHotelAssignedChildIds(hotelConfig);
  if (assignedRoomChildIds.size === 0) return childPricing;

  const convertedChildToAdultMap = {
    ...(childPricing?.convertedChildToAdultMap || {}),
  };
  const assignedChildExplicitPriceMap = {
    ...(childPricing?.assignedChildExplicitPriceMap || {}),
  };

  assignedRoomChildIds.forEach((childId) => {
    if (convertedChildToAdultMap[childId]) return;
    if (
      !Object.prototype.hasOwnProperty.call(
        assignedChildExplicitPriceMap,
        childId,
      )
    ) {
      // A child that occupies a saved hotel room but was not persisted as
      // converted is an explicit child beneficiary. Zero is meaningful here:
      // it represents "gratis", not missing pricing data.
      assignedChildExplicitPriceMap[childId] = 0;
    }
  });

  const assignedChildExplicitPriceSum = Object.values(
    assignedChildExplicitPriceMap,
  ).reduce((sum, value) => sum + n(value), 0);
  const convertedCount = Object.values(convertedChildToAdultMap).filter(
    Boolean,
  ).length;

  return {
    ...childPricing,
    assignedChildExplicitPriceMap,
    assignedChildExplicitPriceSum,
    assignedChildExplicitCount: Object.keys(assignedChildExplicitPriceMap)
      .length,
    hasChildExplicitPrices:
      Object.keys(assignedChildExplicitPriceMap).length > 0,
    convertedChildToAdultMap,
    pricingMode:
      convertedCount > 0
        ? childPricing?.pricingMode || "adult"
        : childPricing?.pricingMode === "adult"
          ? "fixed"
          : childPricing?.pricingMode || "fixed",
    treatChildrenAsAdults: convertedCount > 0,
  };
};

export const buildHotelPassengerIds = (adults, children) => {
  const adultIds = Array.from(
    { length: Math.max(0, Number(adults) || 0) },
    (_, idx) => `adult:${idx + 1}`,
  );
  const childIds = Array.from(
    { length: Math.max(0, Number(children) || 0) },
    (_, idx) => `child:${idx + 1}`,
  );

  return [...adultIds, ...childIds];
};

export const getHotelConvertedChildCount = (childPricing = {}) => {
  if (!childPricing || typeof childPricing !== "object") return 0;

  const convertedIds = new Set();
  const convertedList = Array.isArray(childPricing.convertedChildIds)
    ? childPricing.convertedChildIds
    : [];

  convertedList.forEach((id) => {
    if (isChildId(id)) convertedIds.add(id);
  });

  Object.entries(
    childPricing.convertedChildToAdultMap || childPricing.ninosComoAdulto || {},
  ).forEach(([key, value]) => {
    if (isChildId(key) && value) convertedIds.add(key);
    if (isChildId(value)) convertedIds.add(value);
  });

  return convertedIds.size;
};

export const syncHotelChildPricingWithPeople = (
  existingConfig,
  adults,
  children,
) => {
  const baseConfig =
    existingConfig &&
    typeof existingConfig === "object" &&
    !Array.isArray(existingConfig)
      ? existingConfig
      : {};

  const freshIds = buildHotelPassengerIds(adults, children);
  const freshChildIds = freshIds.filter(isChildId);

  if (freshChildIds.length === 0) {
    return {
      ...baseConfig,
      assignedIds: freshIds,
      selectedIds: freshIds,
      assignedChildExplicitPriceMap: {},
      assignedChildExplicitPriceSum: 0,
      assignedChildExplicitCount: 0,
      hasChildExplicitPrices: false,
      convertedChildToAdultMap: {},
      convertedChildIds: [],
      ninosComoAdulto: {},
      preciosNinos: {},
      pricingMode: "fixed",
      uniformPercentage: "",
      treatChildrenAsAdults: false,
    };
  }

  const freshChildIdSet = new Set(freshChildIds);
  const savedIds = Array.isArray(baseConfig.assignedIds)
    ? baseConfig.assignedIds
    : Array.isArray(baseConfig.selectedIds)
      ? baseConfig.selectedIds
      : [];
  const savedChildIdSet = new Set(savedIds.filter(isChildId));

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

  const previousChildPriceMap = snapshot.childPriceMap || {};
  const convertedChildToAdultMap = {};
  const missingChildrenDefaultFree =
    baseConfig.defaultMissingChildrenAsFree === true ||
    baseConfig.preserveMissingChildrenAsFree === true ||
    baseConfig.hotelChildrenDefaultFree === true;
  const missingFreeChildIds = new Set();

  snapshot.convertedChildIds.forEach((childId) => {
    if (freshChildIdSet.has(childId)) {
      convertedChildToAdultMap[childId] = true;
    }
  });

  freshChildIds.forEach((childId) => {
    const existedBefore =
      savedChildIdSet.has(childId) ||
      Object.prototype.hasOwnProperty.call(previousChildPriceMap, childId);

    if (!existedBefore) {
      if (missingChildrenDefaultFree) {
        missingFreeChildIds.add(childId);
      } else {
        convertedChildToAdultMap[childId] = true;
      }
    }
  });

  const assignedChildExplicitPriceMap = {};
  freshChildIds.forEach((childId) => {
    if (convertedChildToAdultMap[childId]) return;
    if (Object.prototype.hasOwnProperty.call(previousChildPriceMap, childId)) {
      assignedChildExplicitPriceMap[childId] = n(
        previousChildPriceMap[childId],
      );
    } else if (missingFreeChildIds.has(childId)) {
      assignedChildExplicitPriceMap[childId] = 0;
    }
  });

  const assignedChildExplicitPriceSum = Object.values(
    assignedChildExplicitPriceMap,
  ).reduce((sum, value) => sum + n(value), 0);
  const convertedCount = Object.keys(convertedChildToAdultMap).length;

  return {
    ...baseConfig,
    assignedIds: freshIds,
    selectedIds: freshIds,
    assignedChildExplicitPriceMap,
    assignedChildExplicitPriceSum,
    assignedChildExplicitCount: Object.keys(assignedChildExplicitPriceMap)
      .length,
    hasChildExplicitPrices:
      Object.keys(assignedChildExplicitPriceMap).length > 0,
    convertedChildToAdultMap,
    pricingMode:
      convertedCount > 0
        ? "adult"
        : snapshot.pricingState.pricingMode ||
          baseConfig.pricingMode ||
          "fixed",
    uniformPercentage:
      snapshot.pricingState.uniformPercentage ||
      baseConfig.uniformPercentage ||
      "",
    treatChildrenAsAdults:
      convertedCount > 0 ||
      snapshot.pricingState.treatChildrenAsAdults ||
      baseConfig.treatChildrenAsAdults === true,
  };
};

/**
 * Read-only hotel previews must never invent hotel beneficiaries. When a
 * quotation contains children but the persisted hotel payload has no child
 * mapping, those children stay outside the hotel until an explicit room
 * assignment or child tariff says otherwise.
 */
export const syncHotelChildPricingForPreview = (
  existingConfig,
  adults,
  children,
) =>
  syncHotelChildPricingWithPeople(
    {
      ...(existingConfig && typeof existingConfig === "object"
        ? existingConfig
        : {}),
      defaultMissingChildrenAsFree: true,
      preserveMissingChildrenAsFree: true,
    },
    adults,
    children,
  );

const zeroHotelChildFields = (row = {}) => ({
  ...row,
  totalPerChild: 0,
  hotelChildTotal: 0,
  hotelConvertedChildTotal: 0,
  baseSubtotalNinos: 0,
  baseExplicitChildTotal: 0,
  baseConvertedChildTotal: 0,
  nonHotelConvertedChildTotal: 0,
  explicitChildrenCount: 0,
  convertedChildCount: 0,
  childExtrasTotalStay: 0,
  convertedChildHotelTotalStay: 0,
});

export const clearHotelRoomCalculationCache = (
  hotelConfig,
  { resetRows = true, resetMix = false, markForAutoRefresh = false } = {},
) => {
  if (!hotelConfig || typeof hotelConfig !== "object") return hotelConfig;

  const cleared = {
    ...hotelConfig,
    breakdown: [],
    perNightBreakdowns: [],
    perNightMixes: [],
    perNightSums: [],
    perNightSum: 0,
    hotelTotal: 0,
    total: 0,
    roomMixNeedsAutoRefresh: Boolean(markForAutoRefresh),
  };

  if (resetRows) {
    cleared.allCategoryRows = null;
    cleared.categoryRows = null;
  }

  if (resetMix) {
    cleared.mix = null;
    cleared.dayGroups = null;
  }

  return cleared;
};

export const sanitizeHotelConfigForPeople = (hotelConfig, adults, children) => {
  if (!hotelConfig || typeof hotelConfig !== "object") return hotelConfig;

  const childPricing = preserveAssignedFreeChildren(
    syncHotelChildPricingWithPeople(
      hasPersistedHotelSelection(hotelConfig)
        ? {
            ...(hotelConfig.childPricing || {}),
            // When reopening a saved quote, an absent child rate means the
            // child was free / outside the hotel, never "adult by default".
            defaultMissingChildrenAsFree: true,
          }
        : hotelConfig.childPricing,
      adults,
      children,
    ),
    hotelConfig,
  );

  const hasChildren = Math.max(0, Number(children) || 0) > 0;
  if (hasChildren) {
    return {
      ...hotelConfig,
      childPricing,
    };
  }

  const sanitized = {
    ...hotelConfig,
    childPricing,
    hotelChildTotal: 0,
    hotelConvertedChildTotal: 0,
    totalPerChild: 0,
    baseSubtotalNinos: 0,
    baseExplicitChildTotal: 0,
    baseConvertedChildTotal: 0,
    nonHotelConvertedChildTotal: 0,
    explicitChildrenCount: 0,
    convertedChildCount: 0,
    childExtrasTotalStay: 0,
    convertedChildHotelTotalStay: 0,
  };

  if (Array.isArray(sanitized.allCategoryRows)) {
    sanitized.allCategoryRows =
      sanitized.allCategoryRows.map(zeroHotelChildFields);
  }

  if (Array.isArray(sanitized.categoryRows)) {
    sanitized.categoryRows = sanitized.categoryRows.map(zeroHotelChildFields);
  }

  return sanitized;
};

export const resetHotelRoomsForPassengerChange = (
  hotelConfig,
  adults,
  children,
) =>
  sanitizeHotelConfigForPeople(
    clearHotelRoomCalculationCache(hotelConfig, {
      resetRows: true,
      resetMix: true,
      markForAutoRefresh: true,
    }),
    adults,
    children,
  );
