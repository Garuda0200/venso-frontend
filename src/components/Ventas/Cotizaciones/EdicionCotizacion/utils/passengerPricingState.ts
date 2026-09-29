const isPlainObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const hasOwn = (source, key) =>
  isPlainObject(source) && Object.prototype.hasOwnProperty.call(source, key);

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
};

const isAdultPassengerId = (value) =>
  typeof value === "string" && value.startsWith("adult:");

const isChildPassengerId = (value) =>
  typeof value === "string" && value.startsWith("child:");

const getServiceType = (service = {}) =>
  (
    service.typeService ||
    service.parentService?.typeService ||
    service.parentService?.tipo_servicio ||
    service.tipo_servicio ||
    ""
  ).toLowerCase();

const getTourCapacity = (service = {}) => {
  const raw =
    service?.capacidad ??
    service?.tour?.capacidad ??
    service?.childService?.capacidad ??
    service?.childService?.tour?.capacidad ??
    service?.serviceDetails?.capacidad ??
    service?.serviceDetails?.tour?.capacidad ??
    null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : null;
};

const limitSelectedIdsByServiceCapacity = (service = {}, ids = []) => {
  const normalizedIds = normalizeSelectedIds(ids);
  if (getServiceType(service) !== "endoses") return normalizedIds;

  const capacidad = getTourCapacity(service);
  return capacidad == null ? normalizedIds : normalizedIds.slice(0, capacidad);
};

export const getPassengerSlotKey = (value) => {
  const parts = String(value || "").split(":");
  if (
    (parts[0] === "adult" || parts[0] === "child") &&
    parts[1] !== undefined &&
    parts[1] !== ""
  ) {
    return `${parts[0]}:${parts[1]}`;
  }
  return String(value || "");
};

const dedupeByPassengerSlot = (ids = []) => {
  const bySlot = new Map();
  ids.filter(Boolean).forEach((rawId) => {
    const id = String(rawId);
    const slot = getPassengerSlotKey(id);
    if (!slot) return;

    const previous = bySlot.get(slot);
    // Prefer the richer/current row id when the same passenger slot appears
    // with old and new DB ids (child:1:285 vs child:1:391).
    if (!previous || id.split(":").length >= previous.split(":").length) {
      bySlot.set(slot, id);
    }
  });
  return [...bySlot.values()];
};

const normalizeAdultBeneficiaries = (value = []) => {
  if (!Array.isArray(value)) return [];

  return value.reduce((result, entry) => {
    const id = String(entry?.id ?? "").trim();
    if (!id) return result;

    result.push({
      id,
      ...(isChildPassengerId(entry?.child_origin)
        ? { child_origin: String(entry.child_origin) }
        : {}),
    });

    return result;
  }, []);
};

const normalizeChildBeneficiaries = (value = []) => {
  if (!Array.isArray(value)) return [];

  return value.reduce((result, entry) => {
    const id = String(entry?.id ?? "").trim();
    if (!id) return result;

    result.push({
      id,
      precio: toFiniteNumber(entry?.precio) ?? 0,
    });

    return result;
  }, []);
};

const readBeneficiaryState = (source = {}) => {
  if (!isPlainObject(source)) return {};

  const adultBeneficiaries = normalizeAdultBeneficiaries(
    source.beneficiariosAdultos,
  );
  const childBeneficiaries = normalizeChildBeneficiaries(
    source.beneficiariosNinos,
  );

  if (adultBeneficiaries.length === 0 && childBeneficiaries.length === 0) {
    return {};
  }

  const selectedIds = dedupeByPassengerSlot([
    ...adultBeneficiaries,
    ...childBeneficiaries,
  ].map((entry) => entry.id));

  const assignedChildExplicitPriceMap = childBeneficiaries.reduce(
    (result, child) => {
      result[child.id] = child.precio;
      return result;
    },
    {},
  );

  const convertedChildToAdultMap = adultBeneficiaries.reduce(
    (result, adult) => {
      const childId =
        adult.child_origin || (isChildPassengerId(adult.id) ? adult.id : null);
      if (childId) {
        result[childId] = true;
      }
      return result;
    },
    {},
  );
  const convertedChildSlots = new Set(
    Object.keys(convertedChildToAdultMap).map(getPassengerSlotKey),
  );
  Object.keys(assignedChildExplicitPriceMap).forEach((childId) => {
    if (convertedChildSlots.has(getPassengerSlotKey(childId))) {
      delete assignedChildExplicitPriceMap[childId];
    }
  });

  return {
    selectedIds,
    assignedPassengerCount: selectedIds.length,
    assignedChildExplicitPriceMap,
    assignedChildExplicitPriceSum: Object.values(
      assignedChildExplicitPriceMap,
    ).reduce((sum, value) => sum + (Number(value) || 0), 0),
    assignedChildExplicitCount: Object.keys(assignedChildExplicitPriceMap)
      .length,
    hasChildExplicitPrices:
      Object.keys(assignedChildExplicitPriceMap).length > 0,
    convertedChildToAdultMap,
  };
};

export const normalizeSelectedIds = (value) =>
  Array.isArray(value) ? dedupeByPassengerSlot(value) : [];

export const normalizeNumericMap = (value = {}) => {
  if (!isPlainObject(value)) return {};

  return Object.entries(value).reduce((result, [key, rawValue]) => {
    if (
      !key ||
      rawValue === null ||
      rawValue === undefined ||
      rawValue === ""
    ) {
      return result;
    }

    const numberValue = Number(rawValue);
    if (Number.isFinite(numberValue)) {
      result[String(key)] = numberValue;
    }

    return result;
  }, {});
};

const normalizePlainObject = (value = {}) => {
  if (!isPlainObject(value)) return {};

  return Object.entries(value).reduce((result, [key, rawValue]) => {
    if (!key) return result;
    result[String(key)] = rawValue;
    return result;
  }, {});
};

const collectConvertedChildIds = (convertedChildToAdultMap = {}) => {
  const convertedChildIds = new Set();

  if (!isPlainObject(convertedChildToAdultMap)) return convertedChildIds;

  Object.entries(convertedChildToAdultMap).forEach(([key, rawValue]) => {
    if (String(key).startsWith("child:") && rawValue) {
      convertedChildIds.add(String(key));
    }

    if (typeof rawValue === "string" && rawValue.startsWith("child:")) {
      convertedChildIds.add(rawValue);
    }
  });

  return convertedChildIds;
};

const sanitizeExplicitChildPriceMap = (
  childPriceMap = {},
  convertedChildToAdultMap = {},
) => {
  const normalizedChildPriceMap = normalizeNumericMap(childPriceMap);
  const convertedChildIds = collectConvertedChildIds(convertedChildToAdultMap);
  const convertedChildSlots = new Set(
    [...convertedChildIds].map(getPassengerSlotKey),
  );

  if (convertedChildIds.size === 0) return normalizedChildPriceMap;

  return Object.entries(normalizedChildPriceMap).reduce(
    (result, [key, value]) => {
      if (
        !convertedChildIds.has(String(key)) &&
        !convertedChildSlots.has(getPassengerSlotKey(key))
      ) {
        result[String(key)] = value;
      }

      return result;
    },
    {},
  );
};

const pickDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null);

const readPricingStateSource = (source) => {
  if (!isPlainObject(source)) return {};

  // Support both new lean format (preciosNinos / ninosComoAdulto)
  // and legacy fat format (assignedChildExplicitPriceMap / convertedChildToAdultMap)
  const assignedChildExplicitPriceMap = hasOwn(
    source,
    "assignedChildExplicitPriceMap",
  )
    ? normalizeNumericMap(source.assignedChildExplicitPriceMap)
    : hasOwn(source, "preciosNinos")
      ? normalizeNumericMap(source.preciosNinos)
      : undefined;

  const convertedChildToAdultMap = hasOwn(source, "convertedChildToAdultMap")
    ? normalizePlainObject(source.convertedChildToAdultMap)
    : hasOwn(source, "ninosComoAdulto")
      ? normalizePlainObject(source.ninosComoAdulto)
      : undefined;

  return {
    selectedIds: hasOwn(source, "selectedIds")
      ? normalizeSelectedIds(source.selectedIds)
      : undefined,
    // Legacy derived fields — read for backward compat, recalculated in normalizePassengerPricingState
    assignedPassengerCount: hasOwn(source, "assignedPassengerCount")
      ? toFiniteNumber(source.assignedPassengerCount)
      : undefined,
    assignedChildExplicitPriceMap,
    assignedChildExplicitPriceSum: hasOwn(
      source,
      "assignedChildExplicitPriceSum",
    )
      ? toFiniteNumber(source.assignedChildExplicitPriceSum)
      : undefined,
    assignedChildExplicitCount: hasOwn(source, "assignedChildExplicitCount")
      ? toFiniteNumber(source.assignedChildExplicitCount)
      : undefined,
    hasChildExplicitPrices: hasOwn(source, "hasChildExplicitPrices")
      ? Boolean(source.hasChildExplicitPrices)
      : undefined,
    pricingMode:
      hasOwn(source, "pricingMode") && typeof source.pricingMode === "string"
        ? source.pricingMode
        : undefined,
    uniformPercentage: hasOwn(source, "uniformPercentage")
      ? String(source.uniformPercentage ?? "")
      : undefined,
    childPercentageMap: hasOwn(source, "childPercentageMap")
      ? normalizeNumericMap(source.childPercentageMap)
      : undefined,
    treatChildrenAsAdults: hasOwn(source, "treatChildrenAsAdults")
      ? Boolean(source.treatChildrenAsAdults)
      : undefined,
    convertedChildToAdultMap,
  };
};

const readRootPricingState = (service = {}) => {
  if (!isPlainObject(service)) return {};

  const beneficiaryState = readBeneficiaryState(service);
  const hasRootRuntimePassengerState =
    hasOwn(service, "convertedChildToAdultMap") ||
    hasOwn(service, "assignedChildExplicitPriceMap") ||
    hasOwn(service, "pricingMode") ||
    hasOwn(service, "treatChildrenAsAdults");
  const hasSelectionRuntimePassengerState =
    hasOwn(service?.passengerSelection, "convertedChildToAdultMap") ||
    hasOwn(service?.passengerSelection, "ninosComoAdulto") ||
    hasOwn(service?.passengerSelection, "assignedChildExplicitPriceMap") ||
    hasOwn(service?.passengerSelection, "preciosNinos") ||
    hasOwn(service?.passengerSelection, "pricingMode") ||
    hasOwn(service?.passengerSelection, "treatChildrenAsAdults");

  return {
    selectedIds: Array.isArray(service.assignedPassengerIds)
      ? normalizeSelectedIds(service.assignedPassengerIds)
      : beneficiaryState.selectedIds,
    assignedPassengerCount: hasOwn(service, "assignedPassengerCount")
      ? toFiniteNumber(service.assignedPassengerCount)
      : beneficiaryState.assignedPassengerCount,
    assignedChildExplicitPriceMap: hasOwn(
      service,
      "assignedChildExplicitPriceMap",
    )
      ? normalizeNumericMap(service.assignedChildExplicitPriceMap)
      : beneficiaryState.assignedChildExplicitPriceMap,
    assignedChildExplicitPriceSum: hasOwn(
      service,
      "assignedChildExplicitPriceSum",
    )
      ? toFiniteNumber(service.assignedChildExplicitPriceSum)
      : beneficiaryState.assignedChildExplicitPriceSum,
    assignedChildExplicitCount: hasOwn(service, "assignedChildExplicitCount")
      ? toFiniteNumber(service.assignedChildExplicitCount)
      : beneficiaryState.assignedChildExplicitCount,
    hasChildExplicitPrices: hasOwn(service, "hasChildExplicitPrices")
      ? Boolean(service.hasChildExplicitPrices)
      : beneficiaryState.hasChildExplicitPrices,
    pricingMode:
      hasOwn(service, "pricingMode") && typeof service.pricingMode === "string"
        ? service.pricingMode
        : undefined,
    uniformPercentage: hasOwn(service, "uniformPercentage")
      ? String(service.uniformPercentage ?? "")
      : undefined,
    childPercentageMap: hasOwn(service, "childPercentageMap")
      ? normalizeNumericMap(service.childPercentageMap)
      : undefined,
    treatChildrenAsAdults: hasOwn(service, "treatChildrenAsAdults")
      ? Boolean(service.treatChildrenAsAdults)
      : hasRootRuntimePassengerState
        ? false
        : hasSelectionRuntimePassengerState
          ? undefined
          : beneficiaryState.treatChildrenAsAdults,
    convertedChildToAdultMap: hasOwn(service, "convertedChildToAdultMap")
      ? normalizePlainObject(service.convertedChildToAdultMap)
      : hasRootRuntimePassengerState
        ? {}
        : hasSelectionRuntimePassengerState
          ? undefined
          : beneficiaryState.convertedChildToAdultMap,
  };
};

const normalizePassengerPricingState = (state = {}) => {
  const selectedIds = normalizeSelectedIds(state.selectedIds);
  const childPercentageMap = normalizeNumericMap(state.childPercentageMap);
  const convertedChildToAdultMap = normalizePlainObject(
    state.convertedChildToAdultMap,
  );
  const assignedChildExplicitPriceMap = sanitizeExplicitChildPriceMap(
    state.assignedChildExplicitPriceMap,
    convertedChildToAdultMap,
  );
  const pricingMode =
    typeof state.pricingMode === "string" && state.pricingMode
      ? state.pricingMode
      : "percentage";
  const treatChildrenAsAdults =
    pricingMode === "adult" || state.treatChildrenAsAdults === true;
  const assignedPassengerCount =
    toFiniteNumber(state.assignedPassengerCount) ?? selectedIds.length;
  const assignedChildExplicitCount = Object.keys(
    assignedChildExplicitPriceMap,
  ).length;
  const assignedChildExplicitPriceSum = Object.values(
    assignedChildExplicitPriceMap,
  ).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const hasChildExplicitPrices = assignedChildExplicitCount > 0;
  const uniformPercentage =
    state.uniformPercentage != null ? String(state.uniformPercentage) : "";

  return {
    selectedIds,
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
};

export const getServicePassengerPricingState = (
  service = {},
  selection = undefined,
) => {
  const rootState = readRootPricingState(service);
  const tariffState = readPricingStateSource(service?.tariff || {});
  const selectionState = readPricingStateSource(
    selection === undefined
      ? service?.passengerSelection || {}
      : selection || {},
  );

  const selectedIds = limitSelectedIdsByServiceCapacity(
    service,
    pickDefined(
      rootState.selectedIds,
      tariffState.selectedIds,
      selectionState.selectedIds,
    ) || [],
  );

  const assignedChildExplicitPriceMap =
    pickDefined(
      rootState.assignedChildExplicitPriceMap,
      tariffState.assignedChildExplicitPriceMap,
      selectionState.assignedChildExplicitPriceMap,
    ) || {};

  const childPercentageMap =
    pickDefined(
      rootState.childPercentageMap,
      tariffState.childPercentageMap,
      selectionState.childPercentageMap,
    ) || {};

  const convertedChildToAdultMap =
    pickDefined(
      rootState.convertedChildToAdultMap,
      tariffState.convertedChildToAdultMap,
      selectionState.convertedChildToAdultMap,
    ) || {};

  const pricingMode =
    pickDefined(
      rootState.pricingMode,
      tariffState.pricingMode,
      selectionState.pricingMode,
      "percentage",
    ) || "percentage";

  const treatChildrenAsAdults =
    pricingMode === "adult" ||
    Boolean(
      pickDefined(
        rootState.treatChildrenAsAdults,
        tariffState.treatChildrenAsAdults,
        selectionState.treatChildrenAsAdults,
        false,
      ),
    );

  const rawAssignedPassengerCount =
    pickDefined(
      rootState.assignedPassengerCount,
      tariffState.assignedPassengerCount,
      selectionState.assignedPassengerCount,
      selectedIds.length,
    ) ?? selectedIds.length;
  const assignedPassengerCount =
    getServiceType(service) === "endoses" && getTourCapacity(service) != null
      ? selectedIds.length
      : rawAssignedPassengerCount;

  const assignedChildExplicitCount =
    pickDefined(
      rootState.assignedChildExplicitCount,
      tariffState.assignedChildExplicitCount,
      selectionState.assignedChildExplicitCount,
      Object.keys(assignedChildExplicitPriceMap).length,
    ) ?? Object.keys(assignedChildExplicitPriceMap).length;

  const assignedChildExplicitPriceSum =
    pickDefined(
      rootState.assignedChildExplicitPriceSum,
      tariffState.assignedChildExplicitPriceSum,
      selectionState.assignedChildExplicitPriceSum,
      0,
    ) ?? 0;

  const hasChildExplicitPrices = Boolean(
    pickDefined(
      rootState.hasChildExplicitPrices,
      tariffState.hasChildExplicitPrices,
      selectionState.hasChildExplicitPrices,
      assignedChildExplicitCount > 0,
    ),
  );

  const uniformPercentage =
    pickDefined(
      rootState.uniformPercentage,
      tariffState.uniformPercentage,
      selectionState.uniformPercentage,
      "",
    ) ?? "";

  return {
    selectedIds,
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
};

export const getServiceBeneficiarySnapshot = (
  service = {},
  selection = undefined,
) => {
  const pricingState = getServicePassengerPricingState(service, selection);
  const adultBeneficiaries = normalizeAdultBeneficiaries(
    service?.beneficiariosAdultos,
  );
  const childBeneficiaries = normalizeChildBeneficiaries(
    service?.beneficiariosNinos,
  );
  const runtimeChildren = isPlainObject(service?.children)
    ? service.children
    : {};
  const hasAuthoritativeConvertedState =
    hasOwn(service, "convertedChildToAdultMap") ||
    hasOwn(service, "assignedChildExplicitPriceMap") ||
    hasOwn(service?.passengerSelection, "convertedChildToAdultMap") ||
    hasOwn(service?.passengerSelection, "ninosComoAdulto") ||
    hasOwn(service?.passengerSelection, "assignedChildExplicitPriceMap") ||
    hasOwn(service?.passengerSelection, "preciosNinos");
  const selectedIdBySlot = pricingState.selectedIds.reduce((result, id) => {
    const slot = getPassengerSlotKey(id);
    if (slot) result.set(slot, id);
    return result;
  }, new Map());
  const canonicalizeToSelectedSlot = (id) =>
    selectedIdBySlot.get(getPassengerSlotKey(id)) || id;

  const convertedEntries = [];
  const convertedChildIdSet = new Set();
  const convertedAdultIdSet = new Set();
  const convertedChildSlotSet = new Set();
  const convertedAdultSlotSet = new Set();

  const pushConvertedEntry = (childId, revertKey) => {
    const normalizedChildId = canonicalizeToSelectedSlot(childId);
    const slot = getPassengerSlotKey(normalizedChildId);
    if (
      !isChildPassengerId(normalizedChildId) ||
      convertedChildSlotSet.has(slot)
    ) {
      return;
    }

    convertedChildSlotSet.add(slot);
    convertedChildIdSet.add(normalizedChildId);
    const normalizedRevertKey = isChildPassengerId(revertKey)
      ? canonicalizeToSelectedSlot(revertKey)
      : revertKey || normalizedChildId;
    convertedEntries.push({
      childId: normalizedChildId,
      revertKey: normalizedRevertKey,
    });
  };

  Object.entries(pricingState.convertedChildToAdultMap || {}).forEach(
    ([key, rawValue]) => {
      const normalizedKey = String(key);

      if (isChildPassengerId(normalizedKey) && rawValue) {
        pushConvertedEntry(normalizedKey, normalizedKey);
      }

      if (typeof rawValue === "string" && isChildPassengerId(rawValue)) {
        pushConvertedEntry(rawValue, normalizedKey);
        if (isAdultPassengerId(normalizedKey)) {
          convertedAdultIdSet.add(normalizedKey);
          convertedAdultSlotSet.add(getPassengerSlotKey(normalizedKey));
        }
      }
    },
  );

  if (!hasAuthoritativeConvertedState) {
    adultBeneficiaries.forEach((adult) => {
      if (!adult.child_origin) return;

      pushConvertedEntry(adult.child_origin, adult.id);
      if (isAdultPassengerId(adult.id)) {
        convertedAdultIdSet.add(adult.id);
        convertedAdultSlotSet.add(getPassengerSlotKey(adult.id));
      }
    });
  }

  // Detect whether pricingState.selectedIds already carries passenger data
  // (from assignedPassengerIds / passengerSelection). When it does, the IDs
  // use the long format ("child:0:abc") while beneficiarios use the short
  // format ("child:0"). Mixing both causes duplicate entries downstream.
  const selectedHasAdults = pricingState.selectedIds.some(isAdultPassengerId);
  const selectedHasChildren = pricingState.selectedIds.some(isChildPassengerId);

  const childPriceMap = {
    ...Object.entries(pricingState.assignedChildExplicitPriceMap || {}).reduce(
      (result, [childId, price]) => {
        const slot = getPassengerSlotKey(childId);
        const selectedChildId = pricingState.selectedIds.find(
          (id) => isChildPassengerId(id) && getPassengerSlotKey(id) === slot,
        );
        result[selectedChildId || childId] = price;
        return result;
      },
      {},
    ),
  };

  // Only merge beneficiary child prices when selectedIds has no children —
  // avoids duplicate entries from ID-format mismatch.
  if (!selectedHasChildren) {
    childBeneficiaries.forEach((child) => {
      if (!(child.id in childPriceMap)) {
        childPriceMap[child.id] = child.precio;
      }
    });
  }

  Object.entries(runtimeChildren).forEach(([childId, rawValue]) => {
    if (!isChildPassengerId(childId)) return;

    const asAdult =
      rawValue === true ||
      (isPlainObject(rawValue) &&
        (rawValue.asAdult === true ||
          rawValue.childAsAdult === true ||
          rawValue.as_adult === true ||
          rawValue.mode === "adult" ||
          rawValue.mode === "adulto"));

    // When the service already has an explicit passenger-pricing state
    // (convertedChildToAdultMap / preciosNinos), that state is authoritative.
    // Older payloads can still carry `children.{childId}.asAdult`; do not let
    // that legacy field re-convert a child after the user reverted it.
    if (asAdult) {
      if (!hasAuthoritativeConvertedState) {
        pushConvertedEntry(childId, childId);
      }
      return;
    }

    const amount = isPlainObject(rawValue)
      ? toFiniteNumber(
          rawValue.amount ??
            rawValue.price ??
            rawValue.precio ??
            rawValue.value,
        )
      : toFiniteNumber(rawValue);

    if (amount !== undefined && !(childId in childPriceMap)) {
      childPriceMap[childId] = amount;
    }
  });

  const adultIds = [];
  const adultIdSet = new Set();
  const adultSlotSet = new Set();
  const pushAdultId = (id) => {
    const slot = getPassengerSlotKey(id);
    if (
      !isAdultPassengerId(id) ||
      convertedAdultIdSet.has(id) ||
      convertedAdultSlotSet.has(slot) ||
      adultSlotSet.has(slot)
    ) {
      return;
    }

    adultSlotSet.add(slot);
    adultIdSet.add(id);
    adultIds.push(id);
  };

  pricingState.selectedIds.forEach(pushAdultId);
  // Only add from beneficiarios if selectedIds had no adults —
  // the two sources use different ID formats (long vs short)
  // and exact-match dedup won't catch them.
  if (!selectedHasAdults) {
    adultBeneficiaries.forEach((adult) => {
      if (!adult.child_origin) {
        pushAdultId(adult.id);
      }
    });
  }

  const allChildIds = [];
  const childIdSet = new Set();
  const childSlotSet = new Set();
  const pushChildId = (id) => {
    const normalizedId = canonicalizeToSelectedSlot(id);
    const slot = getPassengerSlotKey(normalizedId);
    if (!isChildPassengerId(normalizedId) || childSlotSet.has(slot)) return;
    childSlotSet.add(slot);
    childIdSet.add(normalizedId);
    allChildIds.push(normalizedId);
  };

  pricingState.selectedIds.forEach(pushChildId);
  Object.keys(childPriceMap).forEach(pushChildId);
  // Only add from beneficiarios if selectedIds had no children (same
  // ID-format mismatch reason as adult dedup above).
  if (!selectedHasChildren) {
    childBeneficiaries.forEach((child) => pushChildId(child.id));
  }
  convertedEntries.forEach(({ childId }) => pushChildId(childId));
  if (!selectedHasChildren) {
    if (!hasAuthoritativeConvertedState) {
      adultBeneficiaries.forEach((adult) => {
        if (adult.child_origin) {
          pushChildId(adult.child_origin);
        }
      });
    }
  }
  Object.keys(runtimeChildren).forEach(pushChildId);

  return {
    pricingState,
    selectedIds: [...adultIds, ...allChildIds],
    adultIds,
    allChildIds,
    childIds: allChildIds.filter(
      (id) => !convertedChildSlotSet.has(getPassengerSlotKey(id)),
    ),
    convertedEntries,
    convertedChildIds: [...convertedChildIdSet],
    childPriceMap,
  };
};

/**
 * Merges price data into a tariff object.
 * Passenger-selection state is NO LONGER injected into tariff;
 * it lives exclusively in the passenger_selection column.
 * This function is kept for backward-compat call sites — it simply
 * returns a clean copy of the tariff with no passenger fields added.
 */
export const mergePassengerPricingIntoTariff = (tariff = {}) => {
  // Strip any lingering passenger-state fields that may have been saved
  // by an older version of this code, keeping tariff as pure price data.
  const {
    selectedIds: _s,
    assignedPassengerCount: _ac,
    assignedChildExplicitPriceMap: _m,
    assignedChildExplicitPriceSum: _sum,
    assignedChildExplicitCount: _cnt,
    hasChildExplicitPrices: _h,
    pricingMode: _pm,
    uniformPercentage: _up,
    childPercentageMap: _cp,
    treatChildrenAsAdults: _ta,
    convertedChildToAdultMap: _cc,
    ...cleanTariff
  } = tariff;
  return cleanTariff;
};

export const buildRuntimePassengerSelection = (
  baseSelection = {},
  state = {},
) => {
  const normalizedState = normalizePassengerPricingState(state);
  const {
    preciosNinos: _legacyChildPrices,
    ninosComoAdulto: _legacyConvertedChildren,
    ...runtimeBaseSelection
  } = isPlainObject(baseSelection) ? baseSelection : {};

  return {
    ...runtimeBaseSelection,
    selectedIds: normalizedState.selectedIds,
    assignedPassengerCount: normalizedState.assignedPassengerCount,
    assignedChildExplicitPriceMap:
      normalizedState.assignedChildExplicitPriceMap,
    assignedChildExplicitPriceSum:
      normalizedState.assignedChildExplicitPriceSum,
    assignedChildExplicitCount: normalizedState.assignedChildExplicitCount,
    hasChildExplicitPrices: normalizedState.hasChildExplicitPrices,
    pricingMode: normalizedState.pricingMode,
    uniformPercentage: normalizedState.uniformPercentage,
    childPercentageMap: normalizedState.childPercentageMap,
    treatChildrenAsAdults: normalizedState.treatChildrenAsAdults,
    convertedChildToAdultMap: normalizedState.convertedChildToAdultMap,
    ...(Object.keys(normalizedState.assignedChildExplicitPriceMap).length > 0
      ? { preciosNinos: normalizedState.assignedChildExplicitPriceMap }
      : {}),
    ...(Object.keys(normalizedState.convertedChildToAdultMap).length > 0
      ? { ninosComoAdulto: normalizedState.convertedChildToAdultMap }
      : {}),
  };
};

/**
 * Builds the lean object that is stored in the passenger_selection DB column.
 * Shape: { selectedIds, preciosNinos?, ninosComoAdulto? }
 * Omits empty maps to keep the JSON compact.
 */
export const buildPersistedPassengerSelection = (state = {}) => {
  const normalizedState = normalizePassengerPricingState(state);

  const persisted = {
    selectedIds: normalizedState.selectedIds,
  };

  if (Object.keys(normalizedState.assignedChildExplicitPriceMap).length > 0) {
    persisted.preciosNinos = normalizedState.assignedChildExplicitPriceMap;
  }

  if (Object.keys(normalizedState.convertedChildToAdultMap).length > 0) {
    persisted.ninosComoAdulto = normalizedState.convertedChildToAdultMap;
  }

  return persisted;
};
