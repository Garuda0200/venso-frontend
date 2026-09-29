/**
 * Constructor HTML de la vista comercial de una cotización.
 * Se utiliza en la previsualización y en el flujo PDF; no exporta imágenes.
 */
import { addDaysToDate, formatShortDate } from "./formatters";
import { aggregatePerRoomPricingByStayGroup } from "./financialDisplayHelpers";
import { resolveVisibleSummaryPartsFromAdditionalCosts } from "./visibleSummaryTotals";
import {
  buildSummaryPricingPresentation,
  buildSummaryPricingCore,
  normalizeSummaryPricingRoomKey,
  normalizeSummaryPricingRoomTypeKey,
} from "./summaryPricingCore";

const n = (v) => {
  const x = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};
const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const ceilGeneric = (value) => Math.ceil(n(value));
const ROOM_PRICE_COLUMN_WIDTH = 130;

const sumAmountMap = (value = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  return Object.values(value).reduce((sum, amount) => sum + n(amount), 0);
};

const countAmountMap = (value = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  return Object.keys(value).length;
};

const countPositiveAmountMap = (value = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  return Object.values(value).filter((amount) => n(amount) > 0).length;
};

const resolveChildBeneficiaryCount = (cat = {}, peopleCount = {}) => {
  const serviceExplicitCount = Math.max(
    0,
    countAmountMap(cat?.baseExplicitChildTotalsById),
    countAmountMap(cat?.nonHotelExplicitChildTotalsById),
    n(cat?.explicitChildrenCount),
  );
  const serviceConvertedCount = Math.max(
    0,
    countAmountMap(cat?.baseConvertedChildTotalsById),
    countAmountMap(cat?.nonHotelConvertedChildTotalsById),
    n(cat?.convertedChildCount),
  );
  const hotelChildCount = Math.max(
    0,
    n(cat?.hotelExplicitChildCount),
    n(cat?.hotelConvertedChildCount),
    countAmountMap(cat?.hotelExplicitChildTotalsById),
    countAmountMap(cat?.hotelConvertedChildTotalsById),
    n(cat?.hotelChildTotal) > 0
      ? n(cat?.childrenCount || cat?.explicitChildrenCount)
      : 0,
  );

  return Math.max(
    0,
    n(peopleCount?.children),
    n(cat?.childrenCount),
    serviceExplicitCount,
    serviceConvertedCount,
    hotelChildCount,
  );
};

const fmtExcelMoney = (v) => {
  const x = ceilGeneric(v);
  return `$ ${x.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const DEFAULT_ROOM_PRICE_COLUMNS = [
  {
    key: "simple",
    label: "SIMPLE",
    headerLabel: "HABITACION SIMPLE",
    aliases: ["simple", "single", "individual"],
    capacity: 1,
  },
  {
    key: "doble",
    label: "DOBLE",
    headerLabel: "HABITACION DOBLE",
    aliases: ["doble", "double", "matrimonial", "twin"],
    capacity: 2,
  },
  {
    key: "triple",
    label: "TRIPLE",
    headerLabel: "HABITACION TRIPLE",
    aliases: ["triple"],
    capacity: 3,
  },
  {
    key: "familiar",
    label: "FAMILIAR",
    headerLabel: "HABITACION FAMILIAR",
    aliases: ["familiar", "cuadruple", "cuádruple", "quadruple", "quad"],
    capacity: 4,
  },
];

export const NO_HOTEL_CATEGORY = "sin-hotel";
export const LUXURY_HOTEL_CATEGORY = "5";
const CHILD_NO_HOTEL_COLUMN_KEY = "child-no-hotel";
const CHILD_NO_HOTEL_PRICE_COLUMN = {
  key: CHILD_NO_HOTEL_COLUMN_KEY,
  label: "SIN HOTEL",
  headerLabel: "SIN HOTEL",
  aliases: ["sin hotel", "sin-hotel"],
  capacity: 1,
  selectedCount: 0,
  childNoHotelOnly: true,
};

export const isNoHotelPreviewCategory = (value) =>
  normalizeText(value).replace(/\s+/g, "-") === NO_HOTEL_CATEGORY;

const hasLuxuryHotelMarker = (source = {}) => {
  if (!source || typeof source !== "object") return false;
  if (source.luxuryManual === true) return true;

  const text = normalizeText(
    [
      source.label,
      source.hotelName,
      source.nombre,
      source.categoryLabel,
      source.hotelCategoryLabel,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return text.includes("luxury");
};

export const isLuxuryHotelPreviewSource = (source = {}, rows = []) => {
  const sourceCategory = normalizeText(source?.category);
  if (sourceCategory && sourceCategory !== LUXURY_HOTEL_CATEGORY) return false;
  if (sourceCategory === LUXURY_HOTEL_CATEGORY) return true;
  return (
    hasLuxuryHotelMarker(source) ||
    (Array.isArray(rows) && rows.some((row) => hasLuxuryHotelMarker(row)))
  );
};

export const filterLuxuryHotelCategoryRows = (rows = [], source = {}) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!isLuxuryHotelPreviewSource(source, safeRows)) return safeRows;

  const onlyLuxury = safeRows.filter(
    (row) => normalizeText(row?.category) === LUXURY_HOTEL_CATEGORY,
  );

  return onlyLuxury.length > 0 ? onlyLuxury : safeRows;
};

const isChildNoHotelColumn = (column = {}) =>
  column?.childNoHotelOnly === true ||
  normalizeText(column?.key).replace(/\s+/g, "-") ===
    CHILD_NO_HOTEL_COLUMN_KEY;

const canonicalSummaryRoomKey = (value = "") => {
  const sharedRoomTypeKey = normalizeSummaryPricingRoomTypeKey(value);
  if (
    sharedRoomTypeKey &&
    sharedRoomTypeKey !== "habitacion" &&
    sharedRoomTypeKey !== "sin-hotel"
  ) {
    return sharedRoomTypeKey;
  }
  const text = normalizeText(value)
    .replace(/\(\s*\d+\s*\)/g, " ")
    .replace(/\bninos?\b/g, " ")
    .replace(/\bhabitacion\b/g, " ")
    .replace(/\bhabitaci[oó]n\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";
  if (text.includes("familiar") || text.includes("cuadruple") || text.includes("quad"))
    return "familiar";
  if (text.includes("triple")) return "triple";
  if (
    text.includes("doble") ||
    text.includes("double") ||
    text.includes("matrimonial") ||
    text.includes("twin")
  )
    return "doble";
  if (text.includes("simple") || text.includes("single") || text.includes("individual"))
    return "simple";
  if (text.includes("sin hotel")) return CHILD_NO_HOTEL_COLUMN_KEY;
  return "";
};



const getSummaryRoomInstanceIndex = (value = "") => {
  const text = normalizeText(value)
    .replace(/\(\s*\d+\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = text.match(/(?:^|\s)(\d+)\s*$/);
  const index = Number.parseInt(match?.[1] || "", 10);
  return Number.isInteger(index) && index > 0 ? index : null;
};

const getSummaryRoomIdentity = (value = "", fallbackIndex = null) => {
  const baseKey = canonicalSummaryRoomKey(value);
  if (!baseKey) return "";
  const instanceIndex =
    getSummaryRoomInstanceIndex(value) ||
    (Number.isInteger(fallbackIndex) && fallbackIndex > 0
      ? fallbackIndex
      : null);
  return instanceIndex ? `${baseKey}:${instanceIndex}` : baseKey;
};

const buildVisibleAdultRoomSummaryMap = (parts = []) => {
  const result = new Map();
  const counters = {};

  (Array.isArray(parts) ? parts : []).forEach((part) => {
    const rawLabel = String(part?.label || part?.key || "");
    const normalizedLabel = normalizeText(rawLabel);
    const isChild =
      normalizedLabel.includes("nino") ||
      String(part?.className || "").includes("child");
    if (isChild) return;

    const baseKey = canonicalSummaryRoomKey(rawLabel);
    if (!baseKey || baseKey === CHILD_NO_HOTEL_COLUMN_KEY) return;

    counters[baseKey] = (counters[baseKey] || 0) + 1;
    const identity = getSummaryRoomIdentity(rawLabel, counters[baseKey]);
    const value = n(
      part?.displayValue ??
        part?.roundedValue ??
        part?.value ??
        part?.final ??
        part?.total,
    );
    if (!identity || value <= 0) return;

    result.set(identity, {
      value: roundMoney(value),
      beneficiaries: Math.max(0, n(part?.beneficiaries)),
    });
    if (!result.has(baseKey)) {
      result.set(baseKey, result.get(identity));
    }
  });

  return result;
};

const buildVisibleChildRoomSummaryMap = (parts = []) => {
  const result = new Map();

  (Array.isArray(parts) ? parts : []).forEach((part) => {
    const rawLabel = String(part?.label || part?.key || "");
    const normalizedLabel = normalizeText(rawLabel);
    const isChild =
      part?.audience === "child" ||
      normalizedLabel.includes("nino") ||
      String(part?.className || "").includes("child");
    if (!isChild) return;

    const roomSource =
      part?.roomKey ||
      part?.roomLabel ||
      part?.roomType ||
      rawLabel;
    let roomKey = canonicalSummaryRoomKey(roomSource);
    // Legacy list payloads can expose a child row as "Habitación" even when
    // its canonical hotel amount is zero. That generic word is not a room
    // assignment; it is the old fallback label for a child without hotel.
    if (!roomKey && normalizeText(roomSource).includes("habitacion")) {
      roomKey = CHILD_NO_HOTEL_COLUMN_KEY;
    }
    if (!roomKey) return;

    const beneficiaries = Math.max(0, n(part?.beneficiaries));
    if (beneficiaries <= 0) return;

    const value = roundMoney(
      n(
        part?.displayValue ??
          part?.roundedValue ??
          part?.value ??
          part?.final ??
          part?.total,
      ),
    );
    const current = result.get(roomKey);

    // A room type may appear more than once in the visible summary. Keep the
    // entry with the greatest value, which is the per-person display amount.
    if (!current || value >= current.value) {
      result.set(roomKey, { value, beneficiaries });
    }
  });

  return result;
};

const buildPersistedChildRoomDistributionMap = (
  categoryRows = [],
  selectedCat = null,
) => {
  const rows = Array.isArray(categoryRows) ? categoryRows : [];
  const normalizedSelectedCategory = normalizeText(selectedCat);
  const selectedRow = rows.find(
    (row) =>
      row?.isSelected ||
      row?.selected ||
      (normalizedSelectedCategory &&
        normalizeText(row?.category) === normalizedSelectedCategory),
  );
  const sourceRow =
    selectedRow ||
    rows.find((row) =>
      (Array.isArray(row?.perRoomPricing) ? row.perRoomPricing : []).some(
        (room) => n(room?.convertedChildBeneficiaries) > 0,
      ),
    );
  const distribution = new Map();

  (Array.isArray(sourceRow?.perRoomPricing)
    ? sourceRow.perRoomPricing
    : []
  ).forEach((room) => {
    const roomKey = canonicalSummaryRoomKey(
      room?.sourceRoomKey ||
        room?.roomTypeKey ||
        room?.roomKey ||
        room?.baseLabel ||
        room?.label ||
        room?.key,
    );
    const beneficiaries = Math.max(
      0,
      n(room?.convertedChildBeneficiaries),
    );
    if (!roomKey || beneficiaries <= 0) return;

    const current = distribution.get(roomKey);
    const adultBeneficiaries = Math.max(0, n(room?.adultBeneficiaries));
    const totalBeneficiaries = Math.max(
      adultBeneficiaries + beneficiaries,
      n(room?.beneficiaries),
    );
    const shouldReplaceOccupancy =
      !current || beneficiaries >= n(current?.beneficiaries);

    distribution.set(roomKey, {
      beneficiaries: Math.max(beneficiaries, n(current?.beneficiaries)),
      value: n(current?.value),
      adultBeneficiaries: shouldReplaceOccupancy
        ? adultBeneficiaries
        : n(current?.adultBeneficiaries),
      totalBeneficiaries: shouldReplaceOccupancy
        ? totalBeneficiaries
        : n(current?.totalBeneficiaries),
    });
  });

  return distribution;
};

const mergeChildRoomDistributionMaps = (...maps) => {
  const merged = new Map();

  maps.forEach((source) => {
    if (!(source instanceof Map)) return;
    source.forEach((entry, roomKey) => {
      const beneficiaries = Math.max(0, n(entry?.beneficiaries));
      if (!roomKey || beneficiaries <= 0) return;

      const current = merged.get(roomKey) || {};
      merged.set(roomKey, {
        beneficiaries,
        value: n(entry?.value) || n(current?.value),
        adultBeneficiaries:
          entry?.adultBeneficiaries != null
            ? Math.max(0, n(entry.adultBeneficiaries))
            : current?.adultBeneficiaries,
        totalBeneficiaries:
          entry?.totalBeneficiaries != null
            ? Math.max(0, n(entry.totalBeneficiaries))
            : current?.totalBeneficiaries,
      });
    });
  });

  return merged;
};

const applyVisibleSummaryToSelectedRoomMatrix = (
  matrix = [],
  summaryMap = new Map(),
) => {
  if (!(summaryMap instanceof Map) || summaryMap.size === 0) return matrix;
  const counters = {};

  return (Array.isArray(matrix) ? matrix : []).map((column) => {
    if (isChildNoHotelColumn(column)) return column;
    const baseKey = canonicalSummaryRoomKey(
      column?.baseRoomKey ||
        column?.sourceRoomKey ||
        column?.headerLabel ||
        column?.label ||
        column?.key,
    );
    if (!baseKey) return column;

    counters[baseKey] = (counters[baseKey] || 0) + 1;
    const fallbackIndex =
      Number.isInteger(n(column?.roomPricingIndex))
        ? n(column?.roomPricingIndex) + 1
        : counters[baseKey];
    const identity = getSummaryRoomIdentity(
      column?.headerLabel || column?.label || column?.key,
      fallbackIndex,
    );
    const match = summaryMap.get(identity) || summaryMap.get(baseKey);
    if (!match || match.value <= 0) return column;

    return {
      ...column,
      value: match.value,
      beneficiaryCount:
        match.beneficiaries || column?.beneficiaryCount || 0,
      totalBeneficiaryCount:
        match.beneficiaries || column?.totalBeneficiaryCount || 0,
      adultBeneficiaryCount:
        match.beneficiaries || column?.adultBeneficiaryCount || 0,
      available: true,
      selectedSummaryValueSource: true,
    };
  });
};

const applyVisibleChildDistributionToRoomMatrix = (
  matrix = [],
  summaryMap = new Map(),
) => {
  if (!(summaryMap instanceof Map) || summaryMap.size === 0) return matrix;

  return (Array.isArray(matrix) ? matrix : []).map((column) => {
    const noHotelColumn = isChildNoHotelColumn(column);
    const roomKey = noHotelColumn
      ? CHILD_NO_HOTEL_COLUMN_KEY
      : canonicalSummaryRoomKey(
          column?.baseRoomKey ||
            column?.sourceRoomKey ||
            column?.headerLabel ||
            column?.label ||
            column?.key,
        );
    if (!roomKey) return column;

    const match = summaryMap.get(roomKey);
    const convertedChildren = Math.max(0, n(match?.beneficiaries));
    if (noHotelColumn) {
      return match
        ? {
            ...column,
            beneficiaryCount: convertedChildren,
            totalBeneficiaryCount: convertedChildren,
            adultBeneficiaryCount: 0,
            convertedChildBeneficiaryCount: 0,
          }
        : column;
    }
    const adults =
      match?.adultBeneficiaries != null
        ? Math.max(0, n(match.adultBeneficiaries))
        : Math.max(0, n(column?.adultBeneficiaryCount));
    const totalBeneficiaries =
      match?.totalBeneficiaries != null
        ? Math.max(
            adults + convertedChildren,
            n(match.totalBeneficiaries),
          )
        : adults + convertedChildren;

    return {
      ...column,
      adultBeneficiaryCount: adults,
      convertedChildBeneficiaryCount: convertedChildren,
      totalBeneficiaryCount: totalBeneficiaries,
    };
  });
};

const applyVisibleChildSummaryToSelectedRoomMatrix = (
  matrix = [],
  summaryMap = new Map(),
) => {
  if (!(summaryMap instanceof Map) || summaryMap.size === 0) return matrix;

  return (Array.isArray(matrix) ? matrix : []).map((column) => {
    const noHotelColumn = isChildNoHotelColumn(column);
    const roomKey = noHotelColumn
      ? CHILD_NO_HOTEL_COLUMN_KEY
      : canonicalSummaryRoomKey(
          column?.baseRoomKey ||
            column?.sourceRoomKey ||
            column?.headerLabel ||
            column?.label ||
            column?.key,
        );
    const match = roomKey ? summaryMap.get(roomKey) : null;

    if (!match) {
      return {
        ...column,
        beneficiaryCount: 0,
        convertedChildBeneficiaryCount: 0,
        value: 0,
        available: false,
      };
    }

    return {
      ...column,
      beneficiaryCount: match.beneficiaries,
      convertedChildBeneficiaryCount: noHotelColumn
        ? 0
        : match.beneficiaries,
      totalBeneficiaryCount: match.beneficiaries,
      adultBeneficiaryCount: 0,
      value: match.value,
      available: true,
      selectedChildSummaryValueSource: true,
    };
  });
};

const buildGroupedPreviewMatricesFromVisibleParts = (
  parts = [],
  priceColumns = [],
) => {
  if (!Array.isArray(parts) || parts.length === 0) return null;

  const adultParts = new Map();
  const childParts = new Map();

  parts.forEach((part) => {
    const key = canonicalSummaryRoomKey(part?.label || part?.key || "");
    if (!key) return;

    const isChild =
      normalizeText(part?.label).includes("nino") ||
      String(part?.className || "").includes("child");
    const target = isChild ? childParts : adultParts;
    const nextValue = n(part?.roundedValue ?? part?.value ?? part?.final ?? part?.total);
    const nextBeneficiaries = Math.max(0, n(part?.beneficiaries) || 0);
    const previous = target.get(key);

    if (!previous || nextValue > previous.value) {
      target.set(key, {
        value: nextValue,
        beneficiaries: nextBeneficiaries,
      });
    }
  });

  if (adultParts.size === 0 && childParts.size === 0) return null;

  return {
    adultMatrix: priceColumns.map((column) => {
      const key = canonicalSummaryRoomKey(
        column?.key || column?.headerLabel || column?.label,
      );
      const match = adultParts.get(key);
      return {
        ...column,
        beneficiaryCount: match?.beneficiaries || 0,
        totalBeneficiaryCount: match?.beneficiaries || 0,
        adultBeneficiaryCount: match?.beneficiaries || 0,
        convertedChildBeneficiaryCount: 0,
        value: match?.value || 0,
        externalAdultIncluded: Boolean(match && match.value > 0),
        available: Boolean(match && match.value > 0),
        resolvedFromVisibleSummary: Boolean(match),
      };
    }),
    childMatrix: priceColumns.map((column) => {
      const key = canonicalSummaryRoomKey(
        column?.key || column?.headerLabel || column?.label,
      );
      const match = childParts.get(key);
      return {
        ...column,
        beneficiaryCount: match?.beneficiaries || 0,
        totalBeneficiaryCount: match?.beneficiaries || 0,
        adultBeneficiaryCount: 0,
        convertedChildBeneficiaryCount: match?.beneficiaries || 0,
        value: match?.value || 0,
        available: Boolean(match && match.value > 0),
        resolvedFromVisibleSummary: Boolean(match),
      };
    }),
  };
};

const buildGroupedPreviewMatricesFromCategoryRows = ({
  categoryRows = [],
  peopleCount = {},
  priceColumns = [],
  externalAdultTotal = 0,
  externalChildTotal = 0,
  externalConvertedChildTotal = 0,
  selectedHotel = null,
  additionalCosts = null,
} = {}) => {
  const hotelRows = (Array.isArray(categoryRows) ? categoryRows : []).filter(
    (row) => !row?.noHotel && !isNoHotelPreviewCategory(row?.category),
  );

  const selectedHotelRoomPricing = Array.isArray(selectedHotel?.perRoomPricing)
    ? selectedHotel.perRoomPricing
    : [];
  const rowRoomPricing = hotelRows.flatMap((row) =>
    Array.isArray(row?.perRoomPricing) ? row.perRoomPricing : [],
  );
  const perRoomPricing = selectedHotelRoomPricing.length > 0
    ? selectedHotelRoomPricing
    : rowRoomPricing;
  if (perRoomPricing.length === 0) return null;

  const pricingGroupIdentities = new Set(
    perRoomPricing
      .map((room, index) =>
        getExportPricingGroupIdentity(room, index, { includeFallback: false }),
      )
      .filter(Boolean),
  );
  const hasSeveralHotelGroups =
    hotelRows.length > 1 ||
    pricingGroupIdentities.size > 1 ||
    getSelectedHotelGroupCount(selectedHotel) > 1;
  if (!hasSeveralHotelGroups) return null;

  const aggregatedRoomMap = buildAggregatedRoomPricingMap(perRoomPricing);
  if (!(aggregatedRoomMap instanceof Map) || aggregatedRoomMap.size === 0) return null;

  const referenceRow =
    hotelRows.find((row) => n(row?.nonHotelsTotal) > 0 || row?.additionalCfg) ||
    hotelRows[0] ||
    {};
  const adultServiceBase = n(referenceRow?.nonHotelsTotal);
  const childServiceBase = resolveNonHotelChildBaseUnitPrice(
    referenceRow,
    peopleCount,
  );
  const additionalCfg = referenceRow?.additionalCfg || additionalCosts || {};
  const externalUnifiedChildTotal = roundMoney(
    n(externalChildTotal) + n(externalConvertedChildTotal),
  );

  return {
    adultMatrix: priceColumns.map((column) => {
      const key = canonicalRoomKey(column?.key, column?.label);
      const room = aggregatedRoomMap.get(key);
      const adultBeneficiaries = Math.max(0, n(room?.adultBeneficiaries));
      if (!room || adultBeneficiaries <= 0) {
        return {
          ...column,
          beneficiaryCount: 0,
          totalBeneficiaryCount: 0,
          adultBeneficiaryCount: 0,
          convertedChildBeneficiaryCount: 0,
          value: 0,
          available: false,
        };
      }

      const base = adultServiceBase + n(room?.hotelPerPerson);
      const value = roundMoney(
        base + computeAdicionales(additionalCfg, base, "adult") + n(externalAdultTotal),
      );

      return {
        ...column,
        beneficiaryCount: adultBeneficiaries,
        totalBeneficiaryCount: adultBeneficiaries,
        adultBeneficiaryCount: adultBeneficiaries,
        convertedChildBeneficiaryCount: 0,
        hotelPerAdult: n(room?.hotelPerPerson),
        value,
        externalAdultIncluded: value > 0,
        available: value > 0,
      };
    }),
    childMatrix: priceColumns.map((column) => {
      const key = canonicalRoomKey(column?.key, column?.label);
      const room = aggregatedRoomMap.get(key);
      const childBeneficiaries = Math.max(0, n(room?.convertedChildBeneficiaries));
      if (!room || childBeneficiaries <= 0) {
        return {
          ...column,
          beneficiaryCount: 0,
          totalBeneficiaryCount: 0,
          adultBeneficiaryCount: 0,
          convertedChildBeneficiaryCount: 0,
          value: 0,
          available: false,
        };
      }

      const hotelPerChild =
        n(room?.convertedChildHotelPerPerson) || n(room?.hotelPerPerson);
      const base = childServiceBase + hotelPerChild;
      const childAdditional = shouldApplyAdditionalToChildren(additionalCfg)
        ? computeAdicionales(additionalCfg, base, "child")
        : 0;
      const value = roundMoney(base + childAdditional + externalUnifiedChildTotal);

      return {
        ...column,
        beneficiaryCount: childBeneficiaries,
        totalBeneficiaryCount: childBeneficiaries,
        adultBeneficiaryCount: 0,
        convertedChildBeneficiaryCount: childBeneficiaries,
        hotelPerAdult: hotelPerChild,
        value,
        available: value > 0,
      };
    }),
  };
};

const mergeGroupedPreviewMatrices = (primary = null, fallback = null) => {
  if (!primary) return fallback;
  if (!fallback) return primary;

  const mergeMatrix = (primaryMatrix = [], fallbackMatrix = []) => {
    const fallbackByKey = new Map(
      (Array.isArray(fallbackMatrix) ? fallbackMatrix : []).map((column) => [
        canonicalRoomKey(column?.key, column?.label || column?.headerLabel),
        column,
      ]),
    );

    return (Array.isArray(primaryMatrix) ? primaryMatrix : []).map((column) => {
      const key = canonicalRoomKey(column?.key, column?.label || column?.headerLabel);
      const fallbackColumn = fallbackByKey.get(key);
      if (!fallbackColumn) return column;
      const primaryValue = n(column?.value);
      const fallbackValue = n(fallbackColumn?.value);
      if (fallbackValue <= 0) return column;

      // Incluso un cero explícito es autoritativo: significa "sin precio".
      // No debe ser reemplazado por un fallback de categoría que reparta el
      // hotel de otro niño y termine mostrando una media tarifa.
      if (column?.resolvedFromVisibleSummary) return column;

      // Las partes visibles de AdditionalCosts son la fuente final que ve el
      // usuario en el resumen ($367, $1,234, etc.). Si ya traen valor, no se
      // deben reemplazar por una fila de categoría calculada con una alternativa
      // del tarifario, porque ahí aparecían importes parciales como $217 o $717.
      if (primaryValue > 0) {
        return {
          ...column,
          available: column.available || fallbackColumn.available,
          beneficiaryCount:
            n(column?.beneficiaryCount) || n(fallbackColumn?.beneficiaryCount),
          totalBeneficiaryCount:
            n(column?.totalBeneficiaryCount) ||
            n(fallbackColumn?.totalBeneficiaryCount),
          adultBeneficiaryCount:
            n(column?.adultBeneficiaryCount) ||
            n(fallbackColumn?.adultBeneficiaryCount),
          convertedChildBeneficiaryCount:
            n(column?.convertedChildBeneficiaryCount) ||
            n(fallbackColumn?.convertedChildBeneficiaryCount),
          hotelPerAdult: n(column?.hotelPerAdult) || n(fallbackColumn?.hotelPerAdult),
        };
      }

      return { ...column, ...fallbackColumn };
    });
  };

  return {
    adultMatrix: mergeMatrix(primary.adultMatrix, fallback.adultMatrix),
    childMatrix: mergeMatrix(primary.childMatrix, fallback.childMatrix),
  };
};

export const buildNoHotelPreviewCategoryRows = ({
  totalPerAdult = 0,
  totalPerChild = 0,
  nonHotelsTotal = totalPerAdult,
  additionalCfg = null,
  adultsCount = 1,
  explicitChildrenCount = 0,
  baseExplicitChildTotal = 0,
  convertedChildCount = 0,
  baseConvertedChildTotal = 0,
  nonHotelConvertedChildTotal = baseConvertedChildTotal,
  baseExplicitChildTotalsById = {},
  baseConvertedChildTotalsById = {},
  externalAdultTotal = 0,
} = {}) => [
  {
    category: NO_HOTEL_CATEGORY,
    label: "SIN HOTEL",
    hotelName: "Sin hotel",
    noHotel: true,
    isSelected: true,
    totalPerAdult: n(totalPerAdult),
    totalPerChild: n(totalPerChild),
    totalPerChildIsPerPerson: true,
    pricingEngineVersion: 1,
    nonHotelsTotal: n(nonHotelsTotal),
    additionalCfg,
    adultEquivalentCount: Math.max(
      1,
      n(adultsCount) + n(convertedChildCount) || 1,
    ),
    explicitChildrenCount: Math.max(0, n(explicitChildrenCount)),
    baseExplicitChildTotal: n(baseExplicitChildTotal),
    convertedChildCount: Math.max(0, n(convertedChildCount)),
    baseConvertedChildTotal: n(baseConvertedChildTotal),
    nonHotelConvertedChildTotal: n(nonHotelConvertedChildTotal),
    baseExplicitChildTotalsById,
    baseConvertedChildTotalsById,
    priceByRoomType: {
      [NO_HOTEL_CATEGORY]: Math.max(
        0,
        n(totalPerAdult) - n(externalAdultTotal),
      ),
    },
    roomOptions: [
      {
        key: NO_HOTEL_CATEGORY,
        label: "Sin hotel",
        headerLabel: "SIN HOTEL",
        capacity: 1,
        selectedCount: 1,
      },
    ],
    breakdown: [
      {
        key: NO_HOTEL_CATEGORY,
        label: "Sin hotel",
        headerLabel: "SIN HOTEL",
        cnt: 1,
        capacity: 1,
      },
    ],
  },
];

const ROOM_COLUMN_ORDER = {
  simple: 1,
  doble: 2,
  triple: 3,
  familiar: 4,
};

const roomHeaderLabel = (key, label) => {
  const normalized = normalizeText(`${key || ""} ${label || ""}`);
  if (
    normalized.includes("familiar") ||
    normalized.includes("cuad") ||
    normalized.includes("quad")
  ) {
    return "HABITACION FAMILIAR";
  }
  if (normalized.includes("simple") || normalized.includes("single")) {
    return "HABITACION SIMPLE";
  }
  if (
    normalized.includes("doble") ||
    normalized.includes("double") ||
    normalized.includes("matrimonial") ||
    normalized.includes("twin")
  ) {
    return "HABITACION DOBLE";
  }
  if (normalized.includes("triple")) {
    return "HABITACION TRIPLE";
  }
  return String(label || key || "HABITACION")
    .trim()
    .toUpperCase();
};

const canonicalRoomKey = (key, label) => {
  const normalized = normalizeText(`${key || ""} ${label || ""}`);
  if (
    normalized.includes("familiar") ||
    normalized.includes("cuad") ||
    normalized.includes("quad")
  ) {
    return "familiar";
  }
  if (normalized.includes("simple") || normalized.includes("single")) {
    return "simple";
  }
  if (
    normalized.includes("doble") ||
    normalized.includes("double") ||
    normalized.includes("matrimonial") ||
    normalized.includes("twin")
  ) {
    return "doble";
  }
  if (normalized.includes("triple")) {
    return "triple";
  }
  return normalizeText(key || label || "habitacion");
};

const toRoomColumn = (room = {}) => {
  const rawKey = normalizeText(room?.key || room?.label || "habitacion");
  const label = String(room?.label || room?.key || "Habitacion")
    .trim()
    .toUpperCase();
  const key = canonicalRoomKey(rawKey, label);
  const capacity = Math.max(1, n(room?.capacity) || 1);
  const selectedCount = Math.max(
    0,
    parseInt(room?.cnt ?? room?.count ?? room?.selectedCount ?? 0, 10) || 0,
  );

  return {
    key,
    baseRoomKey: key,
    label,
    headerLabel: room.headerLabel || roomHeaderLabel(key, label),
    aliases: [key, normalizeText(label)].filter(Boolean),
    capacity,
    selectedCount,
  };
};

const getRoomPricingBaseKey = (room = {}) =>
  canonicalRoomKey(
    room?.sourceRoomKey || room?.roomTypeKey || room?.roomKey || room?.key,
    room?.baseLabel || room?.label,
  );

const getRoomPricingInstanceKey = (room = {}, index = 0) =>
  String(
    room?.roomInstanceKey ||
      room?.roomId ||
      room?.key ||
      room?.roomDetails?.[0]?.roomId ||
      `${getRoomPricingBaseKey(room)}:${index + 1}`,
  ).trim();

const getRoomPricingDisplayValue = (room = {}, externalAdultTotal = 0) => {
  const explicitDisplay = [
    room?.displayTotalPerPerson,
    room?.adultDisplayTotalPerPerson,
    room?.adultTotalPerPerson,
  ]
    .map(n)
    .find((value) => value > 0);
  if (explicitDisplay != null) return roundMoney(explicitDisplay);

  const storedTotal = n(room?.totalPerPerson);
  if (storedTotal > 0) {
    const baseWithAdditional = roundMoney(
      n(room?.base) + n(room?.adicionales),
    );
    const external = n(externalAdultTotal);
    const alreadyIncludesExternal =
      external <= 0 || storedTotal >= baseWithAdditional + external - 0.01;
    return roundMoney(
      alreadyIncludesExternal ? storedTotal : storedTotal + external,
    );
  }

  return roundMoney(
    n(room?.base) + n(room?.adicionales) + n(externalAdultTotal),
  );
};

const buildPerRoomPricingColumns = (sourceRow = {}) => {
  const rows = Array.isArray(sourceRow?.perRoomPricing)
    ? sourceRow.perRoomPricing
    : [];
  if (rows.length === 0) return [];

  // Persisted hotel services contain one pricing item per physical room. The
  // quotation table, however, is organized by accommodation type (one Doble
  // column with its quantity), exactly like the first render before saving.
  // Reusing the physical items as columns after reopening caused Doble 1,
  // Doble 2, etc. to appear despite being the same selected accommodation.
  const columnsByBaseKey = rows.reduce((accumulator, room) => {
    const baseKey = getRoomPricingBaseKey(room);
    if (!baseKey) return accumulator;

    const existing = accumulator.get(baseKey);
    const rawLabel = String(
      room?.baseLabel || room?.label || room?.roomLabel || baseKey,
    ).trim();
    const nextCount = Math.max(1, n(room?.roomCount) || 1);

    if (existing) {
      existing.selectedCount += nextCount;
      return accumulator;
    }

    accumulator.set(baseKey, {
      key: baseKey,
      baseRoomKey: baseKey,
      sourceRoomKey: baseKey,
      label: rawLabel.toUpperCase(),
      headerLabel: roomHeaderLabel(baseKey, room?.baseLabel || rawLabel),
      aliases: [
        baseKey,
        normalizeText(rawLabel),
        normalizeText(room?.baseLabel),
      ].filter(Boolean),
      capacity: Math.max(1, n(room?.capacity) || 1),
      selectedCount: nextCount,
    });
    return accumulator;
  }, new Map());

  return Array.from(columnsByBaseKey.values());
};

const mergeRoomColumns = (columns = []) => {
  const map = new Map();

  columns.forEach((column) => {
    const normalized = toRoomColumn(column);
    const existing = map.get(normalized.key);
    if (existing) {
      map.set(normalized.key, {
        ...existing,
        selectedCount: Math.max(
          n(existing.selectedCount),
          n(normalized.selectedCount),
        ),
      });
      return;
    }

    map.set(normalized.key, normalized);
  });

  return Array.from(map.values());
};

const sortRoomColumns = (columns = []) =>
  [...columns].sort((a, b) => {
    const orderA =
      ROOM_COLUMN_ORDER[normalizeText(a.baseRoomKey || a.key)] ?? 99;
    const orderB =
      ROOM_COLUMN_ORDER[normalizeText(b.baseRoomKey || b.key)] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    const capacityDiff =
      Math.max(1, n(a.capacity) || 1) - Math.max(1, n(b.capacity) || 1);
    if (capacityDiff !== 0) return capacityDiff;
    return n(a.roomPricingIndex) - n(b.roomPricingIndex);
  });

const mergePriceColumnsWithSummaryPricingParts = (
  columns = [],
  parts = [],
) => {
  const baseColumns = Array.isArray(columns) ? columns : [];
  const presentation = buildSummaryPricingPresentation(parts);
  if (presentation.columns.length === 0) return baseColumns;

  const merged = new Map();
  baseColumns.forEach((column) => {
    const normalizedColumn = toRoomColumn(column);
    merged.set(normalizedColumn.baseRoomKey || normalizedColumn.key, {
      ...column,
      ...normalizedColumn,
    });
  });

  presentation.columns.forEach((pricingColumn) => {
    const roomKey = normalizeSummaryPricingRoomTypeKey(
      pricingColumn.roomTypeKey || pricingColumn.label,
    );
    const labelRoomKey = normalizeSummaryPricingRoomTypeKey(
      pricingColumn.label,
    );
    // La tarifa infantil sin hotel ya tiene su columna sintética dedicada.
    // También se revisa el label para snapshots antiguos que persistieron la
    // identidad defectuosa `sin` pero conservaron el texto "Sin hotel".
    if (
      !roomKey ||
      roomKey === "sin-hotel" ||
      labelRoomKey === "sin-hotel"
    ) {
      return;
    }

    const existing = merged.get(roomKey);
    const beneficiaries = Math.max(
      0,
      n(pricingColumn.adult?.beneficiaries),
      n(pricingColumn.child?.beneficiaries),
    );
    const capacity = Math.max(
      1,
      n(pricingColumn.capacity) ||
        (roomKey === "simple"
          ? 1
          : roomKey === "triple"
            ? 3
            : roomKey === "familiar"
              ? 4
              : 2),
    );
    const selectedCount = Math.max(
      n(existing?.selectedCount),
      beneficiaries > 0 ? Math.ceil(beneficiaries / capacity) : 0,
    );

    merged.set(roomKey, {
      ...(existing || {}),
      key: roomKey,
      baseRoomKey: roomKey,
      sourceRoomKey: roomKey,
      label: String(pricingColumn.label || roomKey).toUpperCase(),
      headerLabel: roomHeaderLabel(roomKey, pricingColumn.label),
      aliases: [
        roomKey,
        normalizeText(pricingColumn.label),
        ...(Array.isArray(existing?.aliases) ? existing.aliases : []),
      ].filter(Boolean),
      capacity,
      selectedCount,
      summaryContentColumn: true,
    });
  });

  return sortRoomColumns([...merged.values()]);
};

const buildDistributionRoomColumns = (sourceRow = {}) => {
  const breakdownColumns = mergeRoomColumns(
    (sourceRow?.breakdown || [])
      .filter((room) => n(room?.cnt) > 0)
      .map((room) => ({
        ...room,
        selectedCount: n(room.cnt),
      })),
  );
  if (breakdownColumns.length > 0) return sortRoomColumns(breakdownColumns);

  const mixColumns = mergeRoomColumns(
    Object.entries(sourceRow?.mix || {})
      .filter(([, count]) => n(count) > 0)
      .map(([roomKey, count]) => {
        const option = (sourceRow?.roomOptions || []).find(
          (room) => normalizeText(room?.key) === normalizeText(roomKey),
        );
        return {
          ...(option || { key: roomKey, label: roomKey }),
          selectedCount: count,
        };
      }),
  );

  return sortRoomColumns(mixColumns);
};

const buildSelectedRoomColumns = (categoryRows = [], selectedCat = null) => {
  const normalizedSelectedCat = normalizeText(selectedCat);
  const selectedRows = categoryRows.filter((row) => row?.isSelected || row?.selected);
  if (selectedRows.length > 1) {
    const groupedDistributionColumns = sortRoomColumns(
      mergeRoomColumns(
        selectedRows.flatMap((row) => buildDistributionRoomColumns(row)),
      ),
    );
    if (groupedDistributionColumns.length > 0) {
      return groupedDistributionColumns;
    }
  }

  const selectedRow =
    selectedRows[0] ||
    categoryRows.find(
      (row) =>
        normalizedSelectedCat &&
        normalizeText(row?.category) === normalizedSelectedCat,
    );

  const sourceRow =
    selectedRow ||
    categoryRows.find(
      (row) => Array.isArray(row?.breakdown) && row.breakdown.length,
    ) ||
    categoryRows[0];

  const roomInstanceColumns = buildPerRoomPricingColumns(sourceRow);
  if (roomInstanceColumns.length > 0) {
    return sortRoomColumns(roomInstanceColumns);
  }

  const selectedDistributionColumns = buildDistributionRoomColumns(sourceRow);
  if (selectedDistributionColumns.length > 0)
    return selectedDistributionColumns;

  const firstDistributionColumns = categoryRows
    .map((row) => buildDistributionRoomColumns(row))
    .find((columns) => columns.length > 0);
  if (firstDistributionColumns) return firstDistributionColumns;

  const optionColumns = sortRoomColumns(
    mergeRoomColumns(sourceRow?.roomOptions || []),
  );

  return optionColumns.length > 0
    ? optionColumns.slice(0, 1)
    : DEFAULT_ROOM_PRICE_COLUMNS;
};

const sumRoomConvertedChildren = (perRoomPricing = []) =>
  (Array.isArray(perRoomPricing) ? perRoomPricing : []).reduce(
    (sum, row) => sum + Math.max(0, n(row?.convertedChildBeneficiaries)),
    0,
  );

const getHotelChildBeneficiaryCount = (cat = {}) => {
  const explicitCount =
    n(cat?.hotelExplicitChildTotal) > 0 ||
    sumAmountMap(cat?.hotelExplicitChildTotalsById) > 0
      ? Math.max(
          n(cat?.hotelExplicitChildCount),
          countPositiveAmountMap(cat?.hotelExplicitChildTotalsById),
        )
      : 0;
  const convertedCount =
    n(cat?.hotelConvertedChildTotal) > 0 ||
    sumAmountMap(cat?.hotelConvertedChildTotalsById) > 0
      ? Math.max(
          n(cat?.hotelConvertedChildCount),
          countPositiveAmountMap(cat?.hotelConvertedChildTotalsById),
          sumRoomConvertedChildren(cat?.perRoomPricing),
        )
      : sumRoomConvertedChildren(cat?.perRoomPricing);
  const observedCount = Math.max(0, explicitCount + convertedCount);
  if (observedCount > 0) return observedCount;

  // Compatibilidad con snapshots antiguos sin mapas/conteos.
  return n(cat?.hotelChildTotal) > 0
    ? n(cat?.explicitChildrenCount || cat?.childrenCount)
    : 0;
};

const getChildrenWithoutHotelCount = (cat = {}, peopleCount = {}) => {
  const children = resolveChildBeneficiaryCount(cat, peopleCount);
  if (children <= 0 || cat?.noHotel || isNoHotelPreviewCategory(cat?.category)) {
    return 0;
  }

  return Math.max(0, children - getHotelChildBeneficiaryCount(cat));
};

const maybeAppendChildNoHotelColumn = (
  columns = [],
  categoryRows = [],
  peopleCount = {},
) => {
  const safeColumns = Array.isArray(columns) ? columns : [];
  if (
    safeColumns.some(
      (column) =>
        isChildNoHotelColumn(column) ||
        isNoHotelPreviewCategory(column?.key) ||
        isNoHotelPreviewCategory(column?.label),
    )
  ) {
    return safeColumns;
  }

  const needsNoHotelChildColumn = (Array.isArray(categoryRows)
    ? categoryRows
    : []
  ).some((row) => getChildrenWithoutHotelCount(row, peopleCount) > 0);

  return needsNoHotelChildColumn
    ? [...safeColumns, CHILD_NO_HOTEL_PRICE_COLUMN]
    : safeColumns;
};

const buildSelectedAccommodationColumns = (
  categoryRows = [],
  selectedCat = null,
) => {
  const normalizedSelectedCat = normalizeText(selectedCat);
  const selectedRow =
    categoryRows.find((row) => row?.isSelected || row?.selected) ||
    categoryRows.find(
      (row) =>
        normalizedSelectedCat &&
        normalizeText(row?.category) === normalizedSelectedCat,
    ) ||
    categoryRows[0];

  return buildDistributionRoomColumns(selectedRow);
};

const getRowNightCount = (row = {}) => {
  if (
    Array.isArray(row?.selectedNightIndices) &&
    row.selectedNightIndices.length > 0
  ) {
    return row.selectedNightIndices.length;
  }

  return n(row?.nights);
};

const alignCategoryRowsToSelectedNights = (
  categoryRows = [],
  selectedCat = null,
) => {
  if (!Array.isArray(categoryRows) || categoryRows.length === 0) {
    return [];
  }

  const normalizedSelectedCat = normalizeText(selectedCat);
  const selectedRow =
    categoryRows.find((row) => row?.isSelected || row?.selected) ||
    categoryRows.find(
      (row) =>
        normalizedSelectedCat &&
        normalizeText(row?.category) === normalizedSelectedCat,
    );
  const selectedNightCount = getRowNightCount(selectedRow);

  if (selectedNightCount <= 0) return categoryRows;

  return categoryRows.map((row) => ({
    ...row,
    nights: selectedNightCount,
  }));
};

const describeRoomColumns = (
  columns = [],
  fallback = "doble o matrimonial",
) => {
  const parts = columns
    .filter((column) => n(column?.selectedCount) > 0)
    .map((column) => {
      const label = String(column.label || column.key || "")
        .trim()
        .toLowerCase();
      const count = n(column.selectedCount);
      return count > 1 ? `${count} ${label}` : label;
    })
    .filter(Boolean);

  return parts.length > 0 ? parts.join(" + ") : fallback;
};

const additionalFlag = (additionalCfg = {}, field, fallback = true) =>
  (additionalCfg?.[field] ??
    additionalCfg?.[field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] ??
    additionalCfg?.applyAdditionalCostsToChildren ??
    additionalCfg?.apply_additional_costs_to_children ??
    fallback) !== false;

const computeAdicionales = (additionalCfg, basePerAdult, audience = "adult") => {
  const isChild = audience === "child";
  const applyOperationalToChild = additionalFlag(
    additionalCfg,
    "applyOperationalCostsToChildren",
  );
  const applyFeeToChild = additionalFlag(additionalCfg, "applyFeeToChildren");
  const applyExtraToChild = additionalFlag(additionalCfg, "applyExtraFeeToChildren");

  const opMode = String(
    isChild && !applyOperationalToChild
      ? additionalCfg?.childOperationalMode ||
          additionalCfg?.child_operational_mode ||
          additionalCfg?.operationalMode ||
          additionalCfg?.operational_mode ||
          "fixed"
      : additionalCfg?.operationalMode ||
          additionalCfg?.operational_mode ||
          "fixed",
  ).toLowerCase();
  const feeMode = String(
    isChild && !applyFeeToChild
      ? additionalCfg?.childFeeMode ||
          additionalCfg?.child_fee_mode ||
          additionalCfg?.feeMode ||
          additionalCfg?.fee_mode ||
          "fixed"
      : additionalCfg?.feeMode || additionalCfg?.fee_mode || "fixed",
  ).toLowerCase();
  const operationalValue =
    isChild && !applyOperationalToChild
      ? additionalCfg?.childOperationalCosts ??
        additionalCfg?.child_operational_costs ??
        additionalCfg?.operationalCosts ??
        additionalCfg?.operational_costs
      : additionalCfg?.operationalCosts ?? additionalCfg?.operational_costs;
  const feeValue =
    isChild && !applyFeeToChild
      ? additionalCfg?.childFee ??
        additionalCfg?.child_fee ??
        additionalCfg?.feeVal ??
        additionalCfg?.fee ??
        additionalCfg?.fee_val
      : additionalCfg?.feeVal ?? additionalCfg?.fee ?? additionalCfg?.fee_val;
  const extraValue =
    isChild && !applyExtraToChild
      ? additionalCfg?.childExtraFee ??
        additionalCfg?.child_extra_fee ??
        additionalCfg?.extraFee ??
        additionalCfg?.extra_fee
      : additionalCfg?.extraFee ?? additionalCfg?.extra_fee;
  const op =
    opMode === "percentage"
      ? (n(operationalValue) * basePerAdult) / 100
      : n(operationalValue);
  const fee =
    feeMode === "percentage"
      ? (n(feeValue) * basePerAdult) / 100
      : n(feeValue);
  const extra = n(extraValue);
  return op + fee + extra;
};

const hasPerFeeChildPolicy = (additionalCfg = {}) =>
  Object.prototype.hasOwnProperty.call(
    additionalCfg || {},
    "applyOperationalCostsToChildren",
  ) ||
  Object.prototype.hasOwnProperty.call(
    additionalCfg || {},
    "applyFeeToChildren",
  ) ||
  Object.prototype.hasOwnProperty.call(
    additionalCfg || {},
    "applyExtraFeeToChildren",
  );

const shouldApplyAdditionalToChildren = (additionalCfg = {}) =>
  hasPerFeeChildPolicy(additionalCfg) ||
  (additionalCfg?.applyAdditionalCostsToChildren ??
    additionalCfg?.apply_additional_costs_to_children ??
    true) !== false;

const pickWeightedValue = (roomPricing, ...keys) => {
  for (const key of keys) {
    const value = n(roomPricing?.[key]);
    if (value > 0) return value;
  }
  return 0;
};

const getExportPricingGroupIdentity = (row = {}, index = 0, options = {}) => {
  const includeFallback = options?.includeFallback !== false;
  const indices = Array.isArray(row?.groupDayIndices)
    ? row.groupDayIndices
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value))
        .sort((a, b) => a - b)
    : [];
  const explicit = String(row?.groupKey || row?.groupId || "").trim();
  if (explicit && indices.length > 0) return `${explicit}:${indices.join("-")}`;
  if (explicit) return explicit;
  if (indices.length > 0) return `${row?.groupCategory || "group"}:${indices.join("-")}`;
  return includeFallback ? `group-${index + 1}` : "";
};

const resolveExportGroupWeightedShare = (group = {}, valueField, weightField) => {
  const weight = Math.max(0, n(group?.[weightField]));
  if (weight <= 0) return 0;
  return roundMoney(n(group?.[valueField]) / weight);
};

const resolveExportBeneficiariesFromGroups = (groups, field) => {
  if (!groups || groups.size === 0) return 0;
  return Math.max(
    0,
    ...Array.from(groups.values()).map((group) => Math.max(0, n(group?.[field]))),
  );
};

const buildAggregatedRoomPricingMap = (perRoomPricing = []) => {
  const groups = new Map();
  const cohortPricing = aggregatePerRoomPricingByStayGroup(perRoomPricing);
  const rows = cohortPricing.length > 0 ? cohortPricing : perRoomPricing;

  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const key = canonicalRoomKey(
      row?.sourceRoomKey || row?.roomTypeKey || row?.roomKey || row?.key,
      row?.baseLabel || row?.label,
    );
    if (!key) return;

    const adultWeight = Math.max(0, n(row?.adultBeneficiaries));
    const convertedWeight = Math.max(0, n(row?.convertedChildBeneficiaries));
    const totalWeight = Math.max(
      0,
      n(row?.beneficiaries) || adultWeight + convertedWeight,
    );
    const target = groups.get(key) || {
      source: row,
      roomCount: 0,
      beneficiaries: 0,
      adultBeneficiaries: 0,
      convertedChildBeneficiaries: 0,
      hotelTotalRoom: 0,
      baseTotal: 0,
      adicionalesTotal: 0,
      totalPerPersonTotal: 0,
      adultValueTotal: 0,
      convertedValueTotal: 0,
      convertedServiceTotal: 0,
      groupShares: new Map(),
    };

    const groupKey =
      getExportPricingGroupIdentity(row, index, { includeFallback: false }) ||
      "__default_hotel_group__";
    const group = target.groupShares.get(groupKey) || {
      beneficiaries: 0,
      adultBeneficiaries: 0,
      convertedChildBeneficiaries: 0,
      hotelShareTotal: 0,
      hotelShareWeight: 0,
      convertedHotelShareTotal: 0,
      convertedHotelShareWeight: 0,
    };

    const adultDisplayValue = pickWeightedValue(
      row,
      "displayTotalPerPerson",
      "totalPerPerson",
    );
    const convertedDisplayValue = pickWeightedValue(
      row,
      "convertedChildDisplayTotalPerPerson",
      "convertedChildTotalPerPerson",
      "convertedChildHotelPerPerson",
      "hotelPerPerson",
    );
    const convertedHotel = pickWeightedValue(
      row,
      "convertedChildHotelPerPerson",
      "hotelPerPerson",
    );

    group.beneficiaries += totalWeight;
    group.adultBeneficiaries += adultWeight;
    group.convertedChildBeneficiaries += convertedWeight;
    group.hotelShareTotal += n(row?.hotelPerPerson) * Math.max(1, totalWeight);
    group.hotelShareWeight += Math.max(1, totalWeight);
    group.convertedHotelShareTotal += convertedHotel * Math.max(0, convertedWeight);
    group.convertedHotelShareWeight += Math.max(0, convertedWeight);
    target.groupShares.set(groupKey, group);

    target.roomCount += Math.max(0, n(row?.roomCount) || 1);
    target.hotelTotalRoom += n(row?.hotelTotalRoom);
    target.beneficiaries = Math.max(
      target.beneficiaries,
      resolveExportBeneficiariesFromGroups(target.groupShares, "beneficiaries"),
    );
    target.adultBeneficiaries = Math.max(
      target.adultBeneficiaries,
      resolveExportBeneficiariesFromGroups(target.groupShares, "adultBeneficiaries"),
    );
    target.convertedChildBeneficiaries = Math.max(
      target.convertedChildBeneficiaries,
      resolveExportBeneficiariesFromGroups(
        target.groupShares,
        "convertedChildBeneficiaries",
      ),
    );
    target.baseTotal += n(row?.base) * adultWeight;
    target.adicionalesTotal += n(row?.adicionales) * adultWeight;
    target.totalPerPersonTotal += n(row?.totalPerPerson) * adultWeight;
    target.adultValueTotal += adultDisplayValue * adultWeight;
    target.convertedValueTotal += convertedDisplayValue * convertedWeight;
    target.convertedServiceTotal += n(row?.convertedChildServicePerPerson) * convertedWeight;
    groups.set(key, target);
  });

  return new Map(
    Array.from(groups.entries()).map(([key, group]) => {
      const adultWeight = Math.max(1, group.adultBeneficiaries);
      const convertedWeight = Math.max(1, group.convertedChildBeneficiaries);
      const groupEntries = Array.from(group.groupShares.values());
      const hotelPerPerson = groupEntries.reduce(
        (sum, item) =>
          sum +
          resolveExportGroupWeightedShare(
            item,
            "hotelShareTotal",
            "hotelShareWeight",
          ),
        0,
      );
      const convertedChildHotelPerPerson = groupEntries.reduce((sum, item) => {
        const convertedShare = resolveExportGroupWeightedShare(
          item,
          "convertedHotelShareTotal",
          "convertedHotelShareWeight",
        );
        return (
          sum +
          (convertedShare ||
            resolveExportGroupWeightedShare(
              item,
              "hotelShareTotal",
              "hotelShareWeight",
            ))
        );
      }, 0);

      return [
        key,
        {
          ...group.source,
          roomCount: group.roomCount,
          beneficiaries: group.beneficiaries,
          adultBeneficiaries: group.adultBeneficiaries,
          convertedChildBeneficiaries: group.convertedChildBeneficiaries,
          hotelPerPerson: roundMoney(hotelPerPerson),
          hotelTotalRoom: roundMoney(group.hotelTotalRoom),
          base:
            group.adultBeneficiaries > 0 ? group.baseTotal / adultWeight : 0,
          adicionales:
            group.adultBeneficiaries > 0
              ? group.adicionalesTotal / adultWeight
              : 0,
          totalPerPerson:
            group.adultBeneficiaries > 0
              ? group.totalPerPersonTotal / adultWeight
              : 0,
          displayTotalPerPerson:
            group.adultBeneficiaries > 0
              ? group.adultValueTotal / adultWeight
              : 0,
          convertedChildHotelPerPerson:
            group.convertedChildBeneficiaries > 0
              ? roundMoney(convertedChildHotelPerPerson)
              : 0,
          convertedChildDisplayTotalPerPerson:
            group.convertedChildBeneficiaries > 0
              ? group.convertedValueTotal / convertedWeight
              : 0,
          convertedChildTotalPerPerson:
            group.convertedChildBeneficiaries > 0
              ? group.convertedValueTotal / convertedWeight
              : 0,
          convertedChildServicePerPerson:
            group.convertedChildBeneficiaries > 0
              ? group.convertedServiceTotal / convertedWeight
              : 0,
        },
      ];
    }),
  );
};

const findRoomOptionForColumn = (roomOptions = [], column) => {
  const options = Array.isArray(roomOptions) ? roomOptions : [];
  const baseRoomKey = canonicalRoomKey(
    column?.baseRoomKey || column?.sourceRoomKey || column?.key,
    column?.label,
  );

  const byKey = options.find(
    (opt) => normalizeText(opt?.key) === normalizeText(column.key),
  );
  if (byKey) return byKey;

  const byBaseRoomKey = options.find(
    (option) =>
      canonicalRoomKey(option?.key, option?.label) === baseRoomKey,
  );
  if (byBaseRoomKey) return byBaseRoomKey;

  const byAlias = options.find((option) => {
    const label = normalizeText(`${option?.key || ""} ${option?.label || ""}`);
    return column.aliases.some((alias) => label.includes(alias));
  });
  if (byAlias) return byAlias;

  return (
    options.find(
      (option) => Math.max(1, n(option?.capacity)) === column.capacity,
    ) || null
  );
};

const roomMetaForColumn = (cat, column) => {
  const option = findRoomOptionForColumn(cat?.roomOptions, column);
  const unit = option ? n(option.pricePerRoomNight) : 0;
  const countFromMix =
    n(cat?.mix?.[option?.key]) ||
    n(cat?.mix?.[column.baseRoomKey]) ||
    n(cat?.mix?.[column.key]);
  const count =
    (column?.preserveRoomInstance ? 1 : n(column.selectedCount)) ||
    countFromMix ||
    n(option?.cnt) ||
    n(option?.count) ||
    0;

  return {
    option,
    roomUnit: unit,
    roomCount: Math.max(0, count),
    roomCapacity: Math.max(1, n(option?.capacity) || n(column.capacity) || 1),
  };
};

const findPerRoomPricingForColumn = (perRoomPricing = [], column = {}) => {
  const rows = Array.isArray(perRoomPricing) ? perRoomPricing : [];
  if (rows.length === 0) return null;

  if (column?.preserveRoomInstance) {
    const targetInstanceKey = String(column?.roomInstanceKey || "").trim();
    if (targetInstanceKey) {
      const exact = rows.find(
        (row, index) =>
          getRoomPricingInstanceKey(row, index) === targetInstanceKey,
      );
      if (exact) return exact;
    }

    const indexed = rows[n(column?.roomPricingIndex)];
    if (indexed) return indexed;
  }

  const targetBaseKey = canonicalRoomKey(
    column?.baseRoomKey || column?.sourceRoomKey || column?.key,
    column?.label,
  );
  return (
    rows.find((row) => getRoomPricingBaseKey(row) === targetBaseKey) || null
  );
};

const buildRecomputedAlternativeRoomMap = (perRoomPricing = []) => {
  const groups = new Map();

  (Array.isArray(perRoomPricing) ? perRoomPricing : []).forEach((room) => {
    const roomKey = canonicalRoomKey(
      room?.sourceRoomKey || room?.roomTypeKey || room?.roomKey || room?.key,
      room?.baseLabel || room?.label,
    );
    if (!roomKey) return;

    const adultBeneficiaries = Math.max(0, n(room?.adultBeneficiaries));
    const convertedChildBeneficiaries = Math.max(
      0,
      n(room?.convertedChildBeneficiaries),
    );
    const beneficiaries = Math.max(
      adultBeneficiaries + convertedChildBeneficiaries,
      n(room?.beneficiaries),
    );
    const current = groups.get(roomKey) || {
      source: room,
      roomCount: 0,
      beneficiaries: 0,
      adultBeneficiaries: 0,
      convertedChildBeneficiaries: 0,
      hotelTotalRoom: 0,
      adultDisplayTotal: 0,
      adultTotal: 0,
      adultHotelTotal: 0,
      convertedChildBaseTotal: 0,
      convertedChildHotelTotal: 0,
      convertedChildAdditionalTotal: 0,
      convertedChildFinalTotal: 0,
    };

    current.roomCount += Math.max(1, n(room?.roomCount) || 1);
    current.beneficiaries += beneficiaries;
    current.adultBeneficiaries += adultBeneficiaries;
    current.convertedChildBeneficiaries += convertedChildBeneficiaries;
    current.hotelTotalRoom += n(room?.hotelTotalRoom);
    current.adultDisplayTotal +=
      n(room?.displayTotalPerPerson ?? room?.totalPerPerson) *
      adultBeneficiaries;
    current.adultTotal += n(room?.totalPerPerson) * adultBeneficiaries;
    current.adultHotelTotal += n(room?.hotelPerPerson) * adultBeneficiaries;
    current.convertedChildBaseTotal +=
      n(
        room?.convertedChildBasePerPerson ??
          room?.convertedChildDisplayTotalPerPerson ??
          room?.convertedChildTotalPerPerson,
      ) * convertedChildBeneficiaries;
    current.convertedChildHotelTotal +=
      n(room?.convertedChildHotelPerPerson ?? room?.hotelPerPerson) *
      convertedChildBeneficiaries;
    current.convertedChildAdditionalTotal +=
      n(room?.convertedChildAdicionales) * convertedChildBeneficiaries;
    current.convertedChildFinalTotal +=
      n(room?.convertedChildFinalPerPerson) * convertedChildBeneficiaries;
    groups.set(roomKey, current);
  });

  return new Map(
    Array.from(groups.entries()).map(([roomKey, group]) => {
      const adultWeight = Math.max(1, group.adultBeneficiaries);
      const childWeight = Math.max(1, group.convertedChildBeneficiaries);
      return [
        roomKey,
        {
          ...group.source,
          roomCount: group.roomCount,
          beneficiaries: group.beneficiaries,
          adultBeneficiaries: group.adultBeneficiaries,
          convertedChildBeneficiaries:
            group.convertedChildBeneficiaries,
          hotelTotalRoom: roundMoney(group.hotelTotalRoom),
          hotelPerPerson:
            group.adultBeneficiaries > 0
              ? roundMoney(group.adultHotelTotal / adultWeight)
              : n(group.source?.hotelPerPerson),
          totalPerPerson:
            group.adultBeneficiaries > 0
              ? roundMoney(group.adultTotal / adultWeight)
              : 0,
          displayTotalPerPerson:
            group.adultBeneficiaries > 0
              ? roundMoney(group.adultDisplayTotal / adultWeight)
              : 0,
          convertedChildBasePerPerson:
            group.convertedChildBeneficiaries > 0
              ? roundMoney(group.convertedChildBaseTotal / childWeight)
              : 0,
          convertedChildDisplayTotalPerPerson:
            group.convertedChildBeneficiaries > 0
              ? roundMoney(group.convertedChildBaseTotal / childWeight)
              : 0,
          convertedChildTotalPerPerson:
            group.convertedChildBeneficiaries > 0
              ? roundMoney(group.convertedChildBaseTotal / childWeight)
              : 0,
          convertedChildHotelPerPerson:
            group.convertedChildBeneficiaries > 0
              ? roundMoney(group.convertedChildHotelTotal / childWeight)
              : 0,
          convertedChildAdicionales:
            group.convertedChildBeneficiaries > 0
              ? roundMoney(group.convertedChildAdditionalTotal / childWeight)
              : 0,
          convertedChildFinalPerPerson:
            group.convertedChildBeneficiaries > 0
              ? roundMoney(group.convertedChildFinalTotal / childWeight)
              : 0,
        },
      ];
    }),
  );
};

const buildRecomputedAlternativeAdultMatrix = (
  cat = {},
  priceColumns = [],
) => {
  if (cat?.exportPreviewRecomputed !== true) return null;

  const perRoomPricing = Array.isArray(cat?.perRoomPricing)
    ? cat.perRoomPricing
    : [];
  if (perRoomPricing.length === 0) return null;

  const aggregatedRoomPricing =
    buildRecomputedAlternativeRoomMap(perRoomPricing);
  return (Array.isArray(priceColumns) ? priceColumns : []).map((column) => {
    if (isChildNoHotelColumn(column)) {
      return {
        ...column,
        value: 0,
        beneficiaryCount: 0,
        totalBeneficiaryCount: 0,
        adultBeneficiaryCount: 0,
        convertedChildBeneficiaryCount: 0,
        available: false,
      };
    }

    const exactRoomPricing = findPerRoomPricingForColumn(
      perRoomPricing,
      column,
    );
    const roomKey = canonicalRoomKey(
      column?.baseRoomKey || column?.sourceRoomKey || column?.key,
      column?.label,
    );
    const roomPricing = column?.preserveRoomInstance
      ? exactRoomPricing
      : aggregatedRoomPricing.get(roomKey) || exactRoomPricing;
    const adultBeneficiaries = Math.max(
      0,
      n(roomPricing?.adultBeneficiaries),
    );
    const convertedChildBeneficiaries = Math.max(
      0,
      n(roomPricing?.convertedChildBeneficiaries),
    );
    const totalBeneficiaries = Math.max(
      adultBeneficiaries + convertedChildBeneficiaries,
      n(roomPricing?.beneficiaries),
    );
    const value = n(
      roomPricing?.displayTotalPerPerson ?? roomPricing?.totalPerPerson,
    );
    const meta = roomMetaForColumn(cat, column);

    return {
      ...column,
      ...meta,
      value,
      beneficiaryCount: adultBeneficiaries,
      totalBeneficiaryCount: totalBeneficiaries,
      adultBeneficiaryCount: adultBeneficiaries,
      convertedChildBeneficiaryCount: convertedChildBeneficiaries,
      roomCount: n(roomPricing?.roomCount) || meta.roomCount,
      roomCapacity: n(roomPricing?.capacity) || meta.roomCapacity,
      hotelPerAdult: n(roomPricing?.hotelPerPerson),
      hotelTotal: n(roomPricing?.hotelTotalRoom),
      convertedChildHotelPerPerson: n(
        roomPricing?.convertedChildHotelPerPerson,
      ),
      convertedChildTotalPerPerson: n(
        roomPricing?.convertedChildTotalPerPerson,
      ),
      convertedChildDisplayTotalPerPerson: n(
        roomPricing?.convertedChildDisplayTotalPerPerson,
      ),
      convertedChildServicePerPerson: n(
        roomPricing?.convertedChildServicePerPerson,
      ),
      convertedChildAdicionales: n(
        roomPricing?.convertedChildAdicionales,
      ),
      hasIgv: roomPricing?.hasIgv === true || roomPricing?.tieneIgv === true,
      tieneIgv:
        roomPricing?.hasIgv === true || roomPricing?.tieneIgv === true,
      igvPerPerson: n(roomPricing?.igvPerPerson),
      externalAdultIncluded: value > 0,
      available: adultBeneficiaries > 0 && value > 0,
      exportAlternativePricingSource: true,
    };
  });
};

const buildRoomBeneficiarySplitMap = (
  cat,
  priceColumns,
  adultEquivalentCount,
  adultsCount,
  convertedChildCount,
) => {
  if (Array.isArray(cat?.perRoomPricing) && cat.perRoomPricing.length > 0) {
    const totalMap = {};
    const adultMap = {};
    const convertedMap = {};

    if (priceColumns.some((column) => column?.preserveRoomInstance)) {
      priceColumns.forEach((column) => {
        const room = findPerRoomPricingForColumn(cat.perRoomPricing, column);
        const adultCount = Math.max(0, n(room?.adultBeneficiaries));
        const convertedCount = Math.max(
          0,
          n(room?.convertedChildBeneficiaries),
        );
        totalMap[column.key] = Math.max(
          0,
          n(room?.beneficiaries) || adultCount + convertedCount,
        );
        adultMap[column.key] = adultCount;
        convertedMap[column.key] = convertedCount;
      });

      return { totalMap, adultMap, convertedMap };
    }

    cat.perRoomPricing.forEach((row) => {
      const key = canonicalRoomKey(row.roomTypeKey || row.key, row.label);
      if (!key) return;
      totalMap[key] = n(totalMap[key]) + Math.max(0, n(row.beneficiaries));
      adultMap[key] = n(adultMap[key]) + Math.max(0, n(row.adultBeneficiaries));
      convertedMap[key] =
        n(convertedMap[key]) + Math.max(0, n(row.convertedChildBeneficiaries));
    });

    priceColumns.forEach((column) => {
      totalMap[column.key] = Math.max(0, n(totalMap[column.key]));
      adultMap[column.key] = Math.max(0, n(adultMap[column.key]));
      convertedMap[column.key] = Math.max(0, n(convertedMap[column.key]));
    });

    return { totalMap, adultMap, convertedMap };
  }

  const entries = priceColumns.map((column) => {
    const meta = roomMetaForColumn(cat, column);
    const roomCount = Math.max(0, n(column.selectedCount) || n(meta.roomCount));
    const capacity = Math.max(
      1,
      n(meta.roomCapacity) || n(column.capacity) || 1,
    );
    return {
      key: column.key,
      roomCount,
      capacity,
      maxBeneficiaries: roomCount * capacity,
    };
  });
  const totalMap = {};
  const adultMap = {};
  const convertedMap = {};
  let remainingAdults = Math.max(0, n(adultsCount));
  let remainingConverted = Math.max(0, n(convertedChildCount));

  const adultEntries = [...entries].sort((left, right) => {
    const capacityDiff = right.capacity - left.capacity;
    if (capacityDiff !== 0) return capacityDiff;
    return n(right.maxBeneficiaries) - n(left.maxBeneficiaries);
  });
  const childEntries = [...entries].sort((left, right) => {
    const capacityDiff = left.capacity - right.capacity;
    if (capacityDiff !== 0) return capacityDiff;
    return n(left.maxBeneficiaries) - n(right.maxBeneficiaries);
  });

  adultEntries.forEach((entry) => {
    const adultAssigned = Math.min(
      Math.max(0, entry.maxBeneficiaries),
      remainingAdults,
    );
    adultMap[entry.key] = n(adultMap[entry.key]) + adultAssigned;
    remainingAdults = Math.max(0, remainingAdults - adultAssigned);
  });

  childEntries.forEach((entry) => {
    const available = Math.max(
      0,
      entry.maxBeneficiaries - n(adultMap[entry.key]),
    );
    const convertedAssigned = Math.min(available, remainingConverted);
    convertedMap[entry.key] = n(convertedMap[entry.key]) + convertedAssigned;
    remainingConverted = Math.max(0, remainingConverted - convertedAssigned);
  });

  if (remainingAdults > 0 && adultEntries.length > 0) {
    adultMap[adultEntries[0].key] =
      n(adultMap[adultEntries[0].key]) + remainingAdults;
  }

  if (remainingConverted > 0 && childEntries.length > 0) {
    convertedMap[childEntries[0].key] =
      n(convertedMap[childEntries[0].key]) + remainingConverted;
  }

  entries.forEach((entry) => {
    totalMap[entry.key] = n(adultMap[entry.key]) + n(convertedMap[entry.key]);
    adultMap[entry.key] = n(adultMap[entry.key]);
    convertedMap[entry.key] = n(convertedMap[entry.key]);
  });

  return { totalMap, adultMap, convertedMap };
};

const shouldUseCategoryTotalForSingleRoomColumn = (cat = {}, priceColumns = []) => {
  if (!cat || cat?.noHotel || isNoHotelPreviewCategory(cat?.category)) return false;
  const columns = Array.isArray(priceColumns) ? priceColumns : [];
  const hotelColumns = columns.filter((column) => !isChildNoHotelColumn(column));
  if (hotelColumns.length !== 1) return false;
  if (n(cat?.totalPerAdult) <= 0) return false;

  const hasSeveralPricingGroups = new Set(
    (Array.isArray(cat?.perRoomPricing) ? cat.perRoomPricing : [])
      .map((room, index) =>
        getExportPricingGroupIdentity(room, index, { includeFallback: false }),
      )
      .filter(Boolean),
  ).size > 1;

  return !hasSeveralPricingGroups;
};

const resolveSingleRoomCategoryAdultValue = (cat = {}, externalAdultTotal = 0) => {
  const current = roundMoney(n(cat?.totalPerAdult));
  const external = n(externalAdultTotal);
  if (current <= 0 || external <= 0) return current;

  const base = n(cat?.basePerAdult);
  const additional = n(cat?.adicionales ?? cat?.additionalAmount);
  const expectedWithoutExternal = roundMoney(base + additional);
  const looksWithoutExternal =
    expectedWithoutExternal > 0 && Math.abs(current - expectedWithoutExternal) <= 1;

  return looksWithoutExternal ? roundMoney(current + external) : current;
};

const buildSingleRoomCategoryAdultMatrix = (
  cat = {},
  peopleCount = {},
  priceColumns = [],
  externalAdultTotal = 0,
) => {
  const adultCount = Math.max(1, n(peopleCount?.adults) || n(cat?.adultEquivalentCount) || 1);
  const convertedCount = Math.max(
    0,
    n(cat?.convertedChildCount) || n(cat?.hotelConvertedChildCount),
  );
  const perRoomPricing = Array.isArray(cat?.perRoomPricing) ? cat.perRoomPricing : [];
  const adultBeneficiariesFromRooms = perRoomPricing.reduce(
    (sum, room) => sum + Math.max(0, n(room?.adultBeneficiaries)),
    0,
  );
  const convertedBeneficiariesFromRooms = perRoomPricing.reduce(
    (sum, room) => sum + Math.max(0, n(room?.convertedChildBeneficiaries)),
    0,
  );
  const totalBeneficiariesFromRooms = perRoomPricing.reduce(
    (sum, room) =>
      sum + Math.max(0, n(room?.beneficiaries) || n(room?.adultBeneficiaries) + n(room?.convertedChildBeneficiaries)),
    0,
  );

  return (Array.isArray(priceColumns) ? priceColumns : []).map((column) => {
    if (isChildNoHotelColumn(column)) {
      return {
        ...column,
        value: 0,
        hotelPerAdult: 0,
        beneficiaryCount: 0,
        totalBeneficiaryCount: 0,
        adultBeneficiaryCount: 0,
        convertedChildBeneficiaryCount: 0,
        available: false,
      };
    }

    const meta = roomMetaForColumn(cat, column);
    const value = resolveSingleRoomCategoryAdultValue(cat, externalAdultTotal);
    return {
      ...column,
      ...meta,
      value,
      hotelPerAdult: n(cat?.hotelPerAdult),
      hotelTotal: n(cat?.hotelTotal),
      beneficiaryCount: adultBeneficiariesFromRooms || adultCount,
      totalBeneficiaryCount:
        totalBeneficiariesFromRooms || adultBeneficiariesFromRooms || adultCount + convertedCount,
      adultBeneficiaryCount: adultBeneficiariesFromRooms || adultCount,
      convertedChildBeneficiaryCount:
        convertedBeneficiariesFromRooms || convertedCount,
      externalAdultIncluded: n(externalAdultTotal) > 0 && value > 0,
      available: value > 0,
      categoryTotalSource: "category-total-single-room",
    };
  });
};


const buildCanonicalCategoryPricingModel = (
  cat = {},
  peopleCount = {},
  externalAdultTotal = 0,
  externalChildTotal = 0,
  externalConvertedChildTotal = 0,
) => {
  const perRoomPricing = Array.isArray(cat?.perRoomPricing)
    ? cat.perRoomPricing
    : [];
  if (perRoomPricing.length === 0) return null;

  const baseExplicitChildTotal = n(
    cat?.baseExplicitChildTotal ?? cat?.nonHotelExplicitChildTotal,
  );
  const baseConvertedChildTotal = n(
    cat?.baseConvertedChildTotal ?? cat?.nonHotelConvertedChildTotal,
  );
  const hotelExplicitChildTotal = n(cat?.hotelExplicitChildTotal);
  const hotelConvertedChildTotal = n(cat?.hotelConvertedChildTotal);

  return buildSummaryPricingCore(
    {
      peopleCount,
      peoplecount: peopleCount,
      subtotalIndividual: n(cat?.nonHotelsTotal),
      nonHotelsTotal: n(cat?.nonHotelsTotal),
      additionalCosts: cat?.additionalCfg || {},
      perRoomPricing,
      hotelsTotal: n(cat?.hotelAdultTotal ?? cat?.hotelTotal),
      hotelAdultTotal: n(cat?.hotelAdultTotal ?? cat?.hotelTotal),
      hotelChildTotal: n(cat?.hotelChildTotal),
      hotelConvertedChildTotal,
      subtotalNinos: roundMoney(
        baseExplicitChildTotal +
          baseConvertedChildTotal +
          hotelExplicitChildTotal +
          hotelConvertedChildTotal,
      ),
      baseExplicitChildCount: Math.max(
        0,
        n(cat?.baseExplicitChildCount),
        n(cat?.explicitChildrenCount),
        countAmountMap(cat?.baseExplicitChildTotalsById),
        countAmountMap(cat?.nonHotelExplicitChildTotalsById),
      ),
      baseConvertedChildCount: Math.max(
        0,
        n(cat?.baseConvertedChildCount),
        n(cat?.convertedChildCount),
        countAmountMap(cat?.baseConvertedChildTotalsById),
        countAmountMap(cat?.nonHotelConvertedChildTotalsById),
      ),
      hotelExplicitChildCount: Math.max(
        0,
        n(cat?.hotelExplicitChildCount),
        countAmountMap(cat?.hotelExplicitChildTotalsById),
      ),
      hotelConvertedChildCount: Math.max(
        0,
        n(cat?.hotelConvertedChildCount),
        n(cat?.convertedChildCount),
        countAmountMap(cat?.hotelConvertedChildTotalsById),
      ),
      nonHotelExplicitChildTotal: baseExplicitChildTotal,
      nonHotelConvertedChildTotal: baseConvertedChildTotal,
      precio_it_ext_adulto: n(externalAdultTotal),
      precio_it_ext_ninos: roundMoney(
        n(externalChildTotal) + n(externalConvertedChildTotal),
      ),
    },
    { perRoomPricing },
  );
};

const getCanonicalPartCandidatesForColumn = (
  pricingModel,
  column = {},
  audience = "adult",
) => {
  const aliases = [
    column?.key,
    column?.baseRoomKey,
    column?.sourceRoomKey,
    column?.label,
    column?.headerLabel,
    ...(Array.isArray(column?.aliases) ? column.aliases : []),
  ]
    .map(normalizeSummaryPricingRoomKey)
    .filter(Boolean);

  return (pricingModel?.parts || []).filter((part) => {
    if (part?.audience !== audience) return false;
    const partKey = normalizeSummaryPricingRoomKey(part?.roomKey || part?.label);
    if (isChildNoHotelColumn(column)) {
      return /sin-hotel|no-room/.test(`${partKey} ${part?.key || ""}`);
    }
    return aliases.some(
      (alias) =>
        partKey === alias ||
        partKey.includes(alias) ||
        alias.includes(partKey),
    );
  });
};

const findCanonicalPartForColumn = (
  pricingModel,
  column = {},
  audience = "adult",
) => {
  const candidates = getCanonicalPartCandidatesForColumn(
    pricingModel,
    column,
    audience,
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const index = Math.max(
    0,
    n(column?.roomPricingIndex ?? column?.instanceIndex),
  );
  return candidates[Math.min(index, candidates.length - 1)] || candidates[0];
};

const buildCanonicalAdultRoomMatrix = (
  cat = {},
  peopleCount = {},
  priceColumns = [],
  externalAdultTotal = 0,
) => {
  const pricingModel = buildCanonicalCategoryPricingModel(
    cat,
    peopleCount,
    externalAdultTotal,
  );
  if (!pricingModel?.parts?.some((part) => part.audience === "adult")) {
    return null;
  }

  const perRoomPricingMap = buildAggregatedRoomPricingMap(cat?.perRoomPricing);
  return (Array.isArray(priceColumns) ? priceColumns : []).map((column) => {
    if (isChildNoHotelColumn(column)) {
      return {
        ...column,
        value: 0,
        beneficiaryCount: 0,
        totalBeneficiaryCount: 0,
        adultBeneficiaryCount: 0,
        convertedChildBeneficiaryCount: 0,
        available: false,
      };
    }

    const part = findCanonicalPartForColumn(pricingModel, column, "adult");
    const exactRoomPricing = findPerRoomPricingForColumn(
      cat?.perRoomPricing,
      column,
    );
    const roomPricing = column?.preserveRoomInstance
      ? exactRoomPricing
      : perRoomPricingMap.get(
          canonicalRoomKey(
            column?.baseRoomKey || column?.key,
            column?.label,
          ),
        );
    const meta = roomMetaForColumn(cat, column);
    if (!part) {
      return {
        ...column,
        ...meta,
        value: 0,
        beneficiaryCount: 0,
        totalBeneficiaryCount: 0,
        adultBeneficiaryCount: 0,
        convertedChildBeneficiaryCount: 0,
        available: false,
      };
    }

    const adultBeneficiaryCount = Math.max(
      0,
      n(part?.beneficiaries),
      n(roomPricing?.adultBeneficiaries),
    );
    const convertedChildBeneficiaryCount = Math.max(
      0,
      n(roomPricing?.convertedChildBeneficiaries),
    );
    const totalBeneficiaryCount = Math.max(
      adultBeneficiaryCount + convertedChildBeneficiaryCount,
      n(roomPricing?.beneficiaries),
    );

    return {
      ...column,
      ...meta,
      value: n(part?.value),
      beneficiaryCount: adultBeneficiaryCount,
      totalBeneficiaryCount,
      adultBeneficiaryCount,
      convertedChildBeneficiaryCount,
      roomCount: n(roomPricing?.roomCount) || meta.roomCount,
      roomCapacity: n(roomPricing?.capacity) || meta.roomCapacity,
      hotelPerAdult: n(roomPricing?.hotelPerPerson),
      hotelTotal: n(roomPricing?.hotelTotalRoom),
      hasIgv: roomPricing?.hasIgv === true || roomPricing?.tieneIgv === true,
      tieneIgv: roomPricing?.hasIgv === true || roomPricing?.tieneIgv === true,
      igvPerPerson: n(roomPricing?.igvPerPerson),
      externalAdultIncluded: n(externalAdultTotal) > 0,
      available: n(part?.value) > 0,
      summaryContentSource: true,
    };
  });
};

const buildRoomPriceMatrix = (
  cat,
  peopleCount,
  priceColumns,
  externalAdultTotal = 0,
) => {
  const canonicalMatrix = buildCanonicalAdultRoomMatrix(
    cat,
    peopleCount,
    priceColumns,
    externalAdultTotal,
  );
  if (
    cat?.preferCanonicalAdultTotal === true &&
    canonicalMatrix?.some((column) => column.available)
  ) {
    return canonicalMatrix;
  }

  const recomputedAlternativeMatrix = buildRecomputedAlternativeAdultMatrix(
    cat,
    priceColumns,
  );
  if (recomputedAlternativeMatrix?.some((column) => column.available)) {
    return recomputedAlternativeMatrix;
  }

  if (canonicalMatrix?.some((column) => column.available)) {
    return canonicalMatrix;
  }

  if (shouldUseCategoryTotalForSingleRoomColumn(cat, priceColumns)) {
    return buildSingleRoomCategoryAdultMatrix(
      cat,
      peopleCount,
      priceColumns,
      externalAdultTotal,
    );
  }

  const explicit = cat?.priceByRoomType || cat?.roomPriceMatrix;
  if (explicit && typeof explicit === "object") {
    const convertedChildCount = Math.max(0, n(cat?.convertedChildCount));
    const adultEquivalentCount = Math.max(
      1,
      n(cat?.adultEquivalentCount) ||
        n(peopleCount?.adults) + convertedChildCount ||
        1,
    );
    const adultsCount = Math.max(
      0,
      convertedChildCount > 0
        ? adultEquivalentCount - convertedChildCount
        : n(peopleCount?.adults) || adultEquivalentCount,
    );
    const beneficiarySplit = buildRoomBeneficiarySplitMap(
      cat,
      priceColumns,
      adultEquivalentCount,
      adultsCount,
      convertedChildCount,
    );

    return priceColumns.map((column) => {
      if (isChildNoHotelColumn(column)) {
        return {
          ...column,
          value: 0,
          beneficiaryCount: 0,
          totalBeneficiaryCount: 0,
          adultBeneficiaryCount: 0,
          convertedChildBeneficiaryCount: 0,
          available: false,
        };
      }

      const explicitValue = n(
        explicit[column.key] ?? explicit[column.label] ?? cat.totalPerAdult,
      );
      const categoryTotal = n(cat.totalPerAdult);
      const value =
        externalAdultTotal > 0 &&
        categoryTotal > 0 &&
        Math.abs(categoryTotal - explicitValue) <= 1
          ? explicitValue
          : explicitValue + externalAdultTotal;
      const adultBeneficiaryCount = Math.max(
        0,
        n(beneficiarySplit.adultMap[column.key]),
      );
      const convertedChildBeneficiaryCount = Math.max(
        0,
        n(beneficiarySplit.convertedMap[column.key]),
      );
      const totalBeneficiaryCount = Math.max(
        0,
        n(beneficiarySplit.totalMap[column.key]) ||
          adultBeneficiaryCount + convertedChildBeneficiaryCount,
      );

      return {
        ...column,
        ...roomMetaForColumn(cat, column),
        value,
        beneficiaryCount: adultBeneficiaryCount,
        totalBeneficiaryCount,
        adultBeneficiaryCount,
        convertedChildBeneficiaryCount,
        externalAdultIncluded: externalAdultTotal > 0 && value > 0,
        available:
          explicit[column.key] != null || explicit[column.label] != null,
      };
    });
  }

  const roomOptions = Array.isArray(cat?.roomOptions) ? cat.roomOptions : [];
  const convertedChildCount = Math.max(0, n(cat?.convertedChildCount));
  const adultEquivalentCount = Math.max(
    1,
    n(cat?.adultEquivalentCount) ||
      n(peopleCount?.adults) + convertedChildCount ||
      1,
  );
  const adultsCount = Math.max(
    0,
    convertedChildCount > 0
      ? adultEquivalentCount - convertedChildCount
      : n(peopleCount?.adults) || adultEquivalentCount,
  );
  const nights = Math.max(1, n(cat?.nights) || 1);
  const nonHotelsTotal =
    cat?.nonHotelsTotal != null ? n(cat.nonHotelsTotal) : null;
  const beneficiarySplit = buildRoomBeneficiarySplitMap(
    cat,
    priceColumns,
    adultEquivalentCount,
    adultsCount,
    convertedChildCount,
  );
  const perRoomPricingMap = buildAggregatedRoomPricingMap(cat?.perRoomPricing);

  return priceColumns.map((column) => {
    if (isChildNoHotelColumn(column)) {
      return {
        ...column,
        value: 0,
        hotelPerAdult: 0,
        beneficiaryCount: 0,
        totalBeneficiaryCount: 0,
        adultBeneficiaryCount: 0,
        convertedChildBeneficiaryCount: 0,
        available: false,
      };
    }

    const option = findRoomOptionForColumn(roomOptions, column);
    const exactRoomPricing = findPerRoomPricingForColumn(
      cat?.perRoomPricing,
      column,
    );
    const roomPricing = column?.preserveRoomInstance
      ? exactRoomPricing
      : perRoomPricingMap.get(
          canonicalRoomKey(
            column.baseRoomKey || column.key,
            column.label,
          ),
        );

    if ((!option && !roomPricing) || nonHotelsTotal == null) {
      return {
        ...column,
        ...roomMetaForColumn(cat, column),
        value: n(cat?.totalPerAdult),
        hotelPerAdult: n(cat?.hotelPerAdult),
        available: Boolean(option) || n(cat?.totalPerAdult) > 0,
      };
    }

    const capacity = Math.max(
      1,
      n(option?.capacity) || n(roomPricing?.capacity) || column.capacity,
    );
    const roomsNeeded = Math.max(
      1,
      column?.preserveRoomInstance
        ? 1
        : n(column.selectedCount) || Math.ceil(adultEquivalentCount / capacity),
    );
    const hotelTotal =
      roomPricing?.hotelTotalRoom != null
        ? n(roomPricing.hotelTotalRoom)
        : n(option?.pricePerRoomNight) * roomsNeeded * nights;
    const totalBeneficiaryCount = Math.max(
      1,
      n(roomPricing?.beneficiaries) ||
        n(beneficiarySplit.totalMap[column.key]) ||
        adultEquivalentCount,
    );
    const adultBeneficiaryCount = Math.max(
      0,
      roomPricing?.adultBeneficiaries != null
        ? n(roomPricing.adultBeneficiaries)
        : n(beneficiarySplit.adultMap[column.key]),
    );
    const convertedChildBeneficiaryCount = Math.max(
      0,
      roomPricing?.convertedChildBeneficiaries != null
        ? n(roomPricing.convertedChildBeneficiaries)
        : n(beneficiarySplit.convertedMap[column.key]),
    );
    const hotelPerAdult =
      roomPricing?.hotelPerPerson != null
        ? n(roomPricing.hotelPerPerson)
        : hotelTotal / totalBeneficiaryCount;
    const basePerAdult = nonHotelsTotal + hotelPerAdult;
    const computedBaseValue =
      basePerAdult + computeAdicionales(cat.additionalCfg, basePerAdult);
    const authoritativeRoomValue =
      column?.preserveRoomInstance && roomPricing
        ? getRoomPricingDisplayValue(roomPricing, externalAdultTotal)
        : 0;
    // The selected hotel already carries a room-scoped total that includes its
    // own IGV decision. Recomputing every instance only from the shared room
    // option collapses the affected and non-affected rooms into the same value.
    // Alternative categories still use the live calculation below.
    const totalPerAdult =
      authoritativeRoomValue > 0 &&
      (cat?.isSelected || cat?.selected || column?.preserveRoomInstance)
        ? authoritativeRoomValue
        : computedBaseValue + externalAdultTotal;

    return {
      ...column,
      roomUnit:
        n(roomPricing?.hotelPerNight) ||
        n(roomPricing?.roomDetails?.[0]?.unitWithIgv) ||
        n(option?.pricePerRoomNight),
      roomCount: n(roomPricing?.roomCount) || roomsNeeded,
      roomCapacity: capacity,
      beneficiaryCount: adultBeneficiaryCount,
      totalBeneficiaryCount,
      adultBeneficiaryCount,
      convertedChildBeneficiaryCount,
      value: totalPerAdult,
      hotelPerAdult,
      hotelTotal,
      hasIgv:
        roomPricing?.hasIgv === true || roomPricing?.tieneIgv === true,
      tieneIgv:
        roomPricing?.hasIgv === true || roomPricing?.tieneIgv === true,
      igvPerPerson: n(roomPricing?.igvPerPerson),
      convertedChildDisplayTotalPerPerson: n(
        roomPricing?.convertedChildDisplayTotalPerPerson,
      ),
      convertedChildTotalPerPerson: n(
        roomPricing?.convertedChildTotalPerPerson,
      ),
      convertedChildHotelPerPerson: n(
        roomPricing?.convertedChildHotelPerPerson,
      ),
      externalAdultIncluded: externalAdultTotal > 0 && totalPerAdult > 0,
      available:
        Boolean(option || roomPricing) &&
        !(adultBeneficiaryCount === 0 && convertedChildBeneficiaryCount > 0),
    };
  });
};

const resolveStandaloneConvertedChildUnitPrice = (
  cat,
  peopleCount,
  externalChildTotal = 0,
  externalConvertedChildTotal = 0,
) => {
  const children = resolveChildBeneficiaryCount(cat, peopleCount);
  if (children <= 0) return 0;
  const externalUnifiedChildTotal = roundMoney(
    n(externalChildTotal) + n(externalConvertedChildTotal),
  );

  const mappedConvertedTotal =
    sumAmountMap(cat?.baseConvertedChildTotalsById) ||
    sumAmountMap(cat?.nonHotelConvertedChildTotalsById);
  const convertedTotal =
    mappedConvertedTotal > 0
      ? mappedConvertedTotal
      : n(cat?.baseConvertedChildTotal ?? cat?.nonHotelConvertedChildTotal);
  const convertedCount = Math.max(
    0,
    n(cat?.convertedChildCount),
    countAmountMap(cat?.baseConvertedChildTotalsById),
    countAmountMap(cat?.nonHotelConvertedChildTotalsById),
    convertedTotal > 0 ? children : 0,
  );

  if (convertedTotal > 0) {
    return roundMoney(
      convertedTotal / Math.max(1, convertedCount || children) +
        externalUnifiedChildTotal,
    );
  }

  if (externalUnifiedChildTotal > 0) {
    return externalUnifiedChildTotal;
  }

  return 0;
};

const resolveNonHotelChildBaseUnitPrice = (cat, peopleCount) => {
  const children = resolveChildBeneficiaryCount(cat, peopleCount);
  if (children <= 0) return 0;

  const explicitTotal =
    sumAmountMap(cat?.baseExplicitChildTotalsById) ||
    sumAmountMap(cat?.nonHotelExplicitChildTotalsById) ||
    n(cat?.baseExplicitChildTotal || cat?.nonHotelExplicitChildTotal);
  const convertedTotal =
    sumAmountMap(cat?.baseConvertedChildTotalsById) ||
    sumAmountMap(cat?.nonHotelConvertedChildTotalsById) ||
    n(cat?.baseConvertedChildTotal ?? cat?.nonHotelConvertedChildTotal);
  const total = explicitTotal + convertedTotal;

  if (total > 0) return roundMoney(total / children);
  if (
    cat?.totalPerChild != null &&
    (cat?.noHotel || isNoHotelPreviewCategory(cat?.category))
  )
    return n(cat.totalPerChild);
  return 0;
};

const resolveCanonicalChildTotalPerPerson = (
  cat = {},
  calculatedChildValue = 0,
  children = 0,
) => {
  const isCanonicalPerPerson =
    cat?.totalPerChildIsPerPerson === true || cat?.pricingEngineVersion;
  const direct = n(
    isCanonicalPerPerson
      ? (cat?.childTotalPerPerson ??
          cat?.totalPerChild ??
          cat?.pricingSummary?.child?.totalPerPersonRounded ??
          cat?.pricingSummary?.child?.totalPerPerson)
      : (cat?.pricingSummary?.child?.totalPerPersonRounded ??
          cat?.pricingSummary?.child?.totalPerPerson ??
          cat?.childTotalPerPerson ??
          cat?.totalPerChild),
  );
  if (direct <= 0) return 0;

  if (isCanonicalPerPerson) {
    return direct;
  }

  const childCount = Math.max(1, n(children));
  const divided = roundMoney(direct / childCount);
  const calculated = n(calculatedChildValue);
  const looksLikeAggregate =
    calculated > 0 &&
    Math.abs(direct - calculated * childCount) <=
      Math.max(1, Math.abs(calculated) * 0.02);

  if (
    childCount > 1 &&
    calculated > 0 &&
    looksLikeAggregate &&
    Math.abs(divided - calculated) < Math.abs(direct - calculated)
  ) {
    return divided;
  }

  return direct;
};

const getExplicitHotelChildCount = (cat = {}, peopleCount = {}) => {
  const children = resolveChildBeneficiaryCount(cat, peopleCount);
  if (children <= 0) return 0;

  const mappedTotal = sumAmountMap(cat?.hotelExplicitChildTotalsById);
  const directTotal = n(cat?.hotelExplicitChildTotal);
  if (mappedTotal <= 0 && directTotal <= 0) return 0;

  return Math.min(
    children,
    Math.max(
      1,
      n(cat?.hotelExplicitChildCount),
      countPositiveAmountMap(cat?.hotelExplicitChildTotalsById),
    ),
  );
};

const resolveExplicitHotelChildShare = (cat = {}, column = {}, count = 0) => {
  const beneficiaries = Math.max(1, n(count));
  const mappedTotal = sumAmountMap(cat?.hotelExplicitChildTotalsById);
  const directUnit = n(cat?.hotelExplicitChildTotal) || n(cat?.hotelChildTotal);
  const isSelected = Boolean(cat?.isSelected || cat?.selected);

  if (isSelected && mappedTotal > 0)
    return roundMoney(mappedTotal / beneficiaries);
  if (isSelected && directUnit > 0)
    return roundMoney(directUnit / beneficiaries);
  return n(column?.hotelPerAdult) || n(cat?.hotelPerAdult);
};

const buildConvertedChildPriceMatrix = (
  cat,
  adultMatrix,
  peopleCount,
  externalChildTotal = 0,
  externalConvertedChildTotal = 0,
) => {
  const children = resolveChildBeneficiaryCount(cat, peopleCount);
  if (children <= 0) return [];
  const externalUnifiedChildTotal = roundMoney(
    n(externalChildTotal) + n(externalConvertedChildTotal),
  );

  const matrixConvertedCount = (Array.isArray(adultMatrix) ? adultMatrix : [])
    .reduce(
      (sum, column) => sum + Math.max(0, n(column?.convertedChildBeneficiaryCount)),
      0,
    );
  const mappedConvertedCount = Math.max(
    countAmountMap(cat?.baseConvertedChildTotalsById),
    countAmountMap(cat?.nonHotelConvertedChildTotalsById),
    countAmountMap(cat?.hotelConvertedChildTotalsById),
  );
  const observedConvertedCount = Math.max(
    0,
    n(cat?.convertedChildCount),
    n(cat?.hotelConvertedChildCount),
    matrixConvertedCount,
    mappedConvertedCount,
  );
  const hasConvertedMoney =
    n(cat?.hotelConvertedChildTotal) > 0 ||
    n(cat?.baseConvertedChildTotal ?? cat?.nonHotelConvertedChildTotal) > 0;
  const convertedCount =
    observedConvertedCount > 0
      ? Math.min(children, observedConvertedCount)
      : hasConvertedMoney
        ? children
        : 0;
  if (convertedCount <= 0) return [];

  const convertedBaseTotal =
    cat?.baseConvertedChildTotal != null
      ? n(cat.baseConvertedChildTotal)
      : cat?.nonHotelConvertedChildTotal != null
        ? n(cat.nonHotelConvertedChildTotal)
        : n(cat?.explicitChildrenCount) <= 0
          ? n(cat?.baseSubtotalNinos)
          : 0;
  const explicitBaseTotal =
    sumAmountMap(cat?.baseExplicitChildTotalsById) ||
    sumAmountMap(cat?.nonHotelExplicitChildTotalsById) ||
    n(cat?.baseExplicitChildTotal || cat?.nonHotelExplicitChildTotal);
  const convertedBasePerChild =
    (explicitBaseTotal + convertedBaseTotal) /
    Math.max(1, children || convertedCount);
  const hasUnifiedChildServiceBase =
    explicitBaseTotal > 0 || convertedBaseTotal > 0;

  return adultMatrix.map((column) => {
    if (isChildNoHotelColumn(column)) {
      return {
        ...column,
        beneficiaryCount: 0,
        value: 0,
        available: false,
      };
    }

    const convertedBeneficiaries = Math.max(
      0,
      n(column.convertedChildBeneficiaryCount),
    );
    const adultBeneficiaries = Math.max(
      0,
      n(column.adultBeneficiaryCount),
    );
    const hotelAdultShare = n(column.hotelPerAdult || cat?.hotelPerAdult);
    const roomOption = findRoomOptionForColumn(cat?.roomOptions, column);
    const alternativeRoomRate = n(roomOption?.pricePerRoomNight);
    const shouldUseAlternativeRoomRate =
      cat?.exportPreviewRecomputed === true &&
      convertedBeneficiaries > 0 &&
      alternativeRoomRate > 0;
    const persistedConvertedHotelShare = n(
      column.convertedChildHotelPerPerson,
    );
    const alternativeRoomOccupancy = Math.max(
      1,
      n(column.totalBeneficiaryCount),
      adultBeneficiaries + convertedBeneficiaries,
    );
    // A converted child occupies the same priced room as the adults, so its
    // hotel share must be identical to the already-resolved adult share for
    // that column. In AdditionalCosts, alternative categories may not carry
    // perRoomPricing; recalculating from a stale totalBeneficiaryCount can then
    // count the child twice and divide a triple room between four occupants.
    // Keep the raw rate/occupancy calculation only as a last-resort fallback.
    const authoritativeRoomHotelShare =
      persistedConvertedHotelShare || hotelAdultShare;
    const alternativeHotelChildShare = shouldUseAlternativeRoomRate
      ? authoritativeRoomHotelShare ||
        roundMoney(
          (alternativeRoomRate * Math.max(1, n(cat?.nights) || 1)) /
            alternativeRoomOccupancy,
        )
      : 0;
    const hotelChildShare =
      alternativeHotelChildShare ||
      n(column.convertedChildHotelPerPerson) ||
      (n(column.hotelTotal) > 0 && n(column.totalBeneficiaryCount) > 0
        ? roundMoney(n(column.hotelTotal) / n(column.totalBeneficiaryCount))
        : n(column.hotelPerAdult) || n(cat?.hotelPerAdult));
    const canonicalConvertedBase =
      shouldUseAlternativeRoomRate
        ? 0
        : n(column.convertedChildDisplayTotalPerPerson) ||
          n(column.convertedChildTotalPerPerson);
    const fallback = convertedBeneficiaries > 0 ? hotelChildShare : 0;
    const baseValue =
      canonicalConvertedBase > 0
        ? canonicalConvertedBase
        : convertedBeneficiaries > 0 &&
            (hasUnifiedChildServiceBase || hotelChildShare > 0)
          ? convertedBasePerChild + hotelChildShare
          : fallback;
    const value =
      baseValue > 0
        ? roundMoney(baseValue + externalUnifiedChildTotal)
        : 0;

    return {
      ...column,
      hotelPerAdult: hotelChildShare || hotelAdultShare,
      beneficiaryCount: convertedBeneficiaries,
      value,
      available: convertedBeneficiaries > 0 && (column.available || value > 0),
    };
  });
};

const buildSingleRoomCategoryChildMatrix = (
  cat = {},
  adultMatrix = [],
  peopleCount = {},
) => {
  const children = resolveChildBeneficiaryCount(cat, peopleCount);
  const value = n(cat?.totalPerChild);
  if (children <= 0 || value <= 0) return null;
  const matrix = Array.isArray(adultMatrix) ? adultMatrix : [];
  const hotelColumns = matrix.filter((column) => !isChildNoHotelColumn(column));
  if (hotelColumns.length !== 1) return null;

  return matrix.map((column) => {
    if (isChildNoHotelColumn(column)) {
      return {
        ...column,
        value: 0,
        beneficiaryCount: 0,
        totalBeneficiaryCount: 0,
        adultBeneficiaryCount: 0,
        convertedChildBeneficiaryCount: 0,
        available: false,
      };
    }

    return {
      ...column,
      value: roundMoney(value),
      beneficiaryCount: children,
      totalBeneficiaryCount: children,
      adultBeneficiaryCount: 0,
      convertedChildBeneficiaryCount:
        Math.max(0, n(cat?.convertedChildCount) || n(cat?.hotelConvertedChildCount)) || children,
      available: true,
      categoryTotalSource: "category-total-single-room-child",
    };
  });
};


const buildCanonicalChildRoomMatrix = (
  cat = {},
  adultMatrix = [],
  peopleCount = {},
  externalChildTotal = 0,
  externalConvertedChildTotal = 0,
) => {
  const pricingModel = buildCanonicalCategoryPricingModel(
    cat,
    peopleCount,
    0,
    externalChildTotal,
    externalConvertedChildTotal,
  );
  if (!pricingModel?.parts?.some((part) => part.audience === "child")) {
    return null;
  }

  return (Array.isArray(adultMatrix) ? adultMatrix : []).map((column) => {
    const part = findCanonicalPartForColumn(pricingModel, column, "child");
    if (!part) {
      return {
        ...column,
        value: 0,
        beneficiaryCount: 0,
        totalBeneficiaryCount: 0,
        adultBeneficiaryCount: 0,
        convertedChildBeneficiaryCount: 0,
        available: false,
      };
    }

    const beneficiaries = Math.max(1, n(part?.beneficiaries));
    return {
      ...column,
      value: n(part?.value),
      beneficiaryCount: beneficiaries,
      totalBeneficiaryCount: beneficiaries,
      adultBeneficiaryCount: 0,
      convertedChildBeneficiaryCount: beneficiaries,
      available: n(part?.value) > 0,
      summaryContentSource: true,
    };
  });
};

const buildRecomputedAlternativeChildMatrix = (
  cat = {},
  adultMatrix = [],
  externalChildTotal = 0,
  externalConvertedChildTotal = 0,
) => {
  if (cat?.exportPreviewRecomputed !== true) return null;

  const perRoomPricing = Array.isArray(cat?.perRoomPricing)
    ? cat.perRoomPricing
    : [];
  if (perRoomPricing.length === 0) return null;

  const aggregatedRoomPricing =
    buildRecomputedAlternativeRoomMap(perRoomPricing);
  const externalUnifiedChildTotal = roundMoney(
    n(externalChildTotal) + n(externalConvertedChildTotal),
  );

  const matrix = (Array.isArray(adultMatrix) ? adultMatrix : []).map(
    (column) => {
      if (isChildNoHotelColumn(column)) {
        return {
          ...column,
          value: 0,
          beneficiaryCount: 0,
          totalBeneficiaryCount: 0,
          adultBeneficiaryCount: 0,
          convertedChildBeneficiaryCount: 0,
          available: false,
        };
      }

      const exactRoomPricing = findPerRoomPricingForColumn(
        perRoomPricing,
        column,
      );
      const roomKey = canonicalRoomKey(
        column?.baseRoomKey || column?.sourceRoomKey || column?.key,
        column?.label,
      );
      const roomPricing = column?.preserveRoomInstance
        ? exactRoomPricing
        : aggregatedRoomPricing.get(roomKey) || exactRoomPricing;
      const beneficiaries = Math.max(
        0,
        n(roomPricing?.convertedChildBeneficiaries),
        n(column?.convertedChildBeneficiaryCount),
      );
      const convertedChildBase = n(
        roomPricing?.convertedChildBasePerPerson ??
          roomPricing?.convertedChildDisplayTotalPerPerson ??
          roomPricing?.convertedChildTotalPerPerson,
      );
      const childAdditional =
        n(roomPricing?.convertedChildAdicionales) ||
        (convertedChildBase > 0 &&
        shouldApplyAdditionalToChildren(cat?.additionalCfg)
          ? roundMoney(
              computeAdicionales(
                cat?.additionalCfg,
                convertedChildBase,
                "child",
              ),
            )
          : 0);
      const persistedFinalValue = n(
        roomPricing?.convertedChildFinalPerPerson,
      );
      const value =
        persistedFinalValue > 0
          ? persistedFinalValue
          : convertedChildBase > 0
            ? roundMoney(
                convertedChildBase +
                  childAdditional +
                  externalUnifiedChildTotal,
              )
            : 0;

      return {
        ...column,
        value,
        beneficiaryCount: beneficiaries,
        totalBeneficiaryCount: beneficiaries,
        adultBeneficiaryCount: 0,
        convertedChildBeneficiaryCount: beneficiaries,
        hotelPerAdult: n(
          roomPricing?.convertedChildHotelPerPerson ??
            roomPricing?.hotelPerPerson,
        ),
        convertedChildHotelPerPerson: n(
          roomPricing?.convertedChildHotelPerPerson ??
            roomPricing?.hotelPerPerson,
        ),
        available: beneficiaries > 0 && value > 0,
        exportAlternativePricingSource: true,
      };
    },
  );

  return matrix.some((column) => column.available) ? matrix : null;
};

const buildChildPriceMatrix = (
  cat,
  adultMatrix,
  peopleCount,
  externalChildTotal = 0,
  externalConvertedChildTotal = 0,
) => {
  const recomputedAlternativeMatrix = buildRecomputedAlternativeChildMatrix(
    cat,
    adultMatrix,
    externalChildTotal,
    externalConvertedChildTotal,
  );
  if (recomputedAlternativeMatrix) return recomputedAlternativeMatrix;

  const canonicalMatrix = buildCanonicalChildRoomMatrix(
    cat,
    adultMatrix,
    peopleCount,
    externalChildTotal,
    externalConvertedChildTotal,
  );
  if (canonicalMatrix?.some((column) => column.available)) {
    return canonicalMatrix;
  }

  const children = resolveChildBeneficiaryCount(cat, peopleCount);
  if (children <= 0) return [];
  const externalUnifiedChildTotal = roundMoney(
    n(externalChildTotal) + n(externalConvertedChildTotal),
  );
  const singleRoomChildMatrix = shouldUseCategoryTotalForSingleRoomColumn(
    cat,
    adultMatrix,
  )
    ? buildSingleRoomCategoryChildMatrix(cat, adultMatrix, peopleCount)
    : null;
  if (singleRoomChildMatrix) return singleRoomChildMatrix;


  const convertedMatrix = buildConvertedChildPriceMatrix(
    cat,
    adultMatrix,
    peopleCount,
    externalChildTotal,
    externalConvertedChildTotal,
  );
  const hasConvertedColumns = convertedMatrix.some((column) => column.available);
  const firstAvailableColumnIndex = (Array.isArray(adultMatrix) ? adultMatrix : []).findIndex(
    (column) => column.available,
  );
  const standaloneConvertedUnit = hasConvertedColumns
    ? 0
    : resolveStandaloneConvertedChildUnitPrice(
        cat,
        peopleCount,
        externalChildTotal,
        externalConvertedChildTotal,
      );
  const hasNoHotelColumn =
    cat?.noHotel || isNoHotelPreviewCategory(cat?.category);
  const hasChildNoHotelColumn = (Array.isArray(adultMatrix)
    ? adultMatrix
    : []
  ).some((column) => isChildNoHotelColumn(column));
  const hotelChildCountFromMatrix = convertedMatrix.reduce(
    (sum, column) =>
      sum + (column.available ? Math.max(0, n(column.beneficiaryCount)) : 0),
    0,
  );
  const explicitHotelChildCount = getExplicitHotelChildCount(cat, peopleCount);
  const noHotelChildCount = hasNoHotelColumn
    ? 0
    : Math.max(
        0,
        children - hotelChildCountFromMatrix - explicitHotelChildCount,
      );
  const noHotelChildBase = resolveNonHotelChildBaseUnitPrice(cat, peopleCount);
  const hasExplicitData =
    noHotelChildBase > 0 ||
    explicitHotelChildCount > 0 ||
    countAmountMap(cat?.baseExplicitChildTotalsById) > 0 ||
    countAmountMap(cat?.nonHotelExplicitChildTotalsById) > 0 ||
    n(cat?.explicitChildrenCount) > 0 ||
    noHotelChildCount > 0 ||
    hasNoHotelColumn;
  const hasStandaloneConvertedData =
    standaloneConvertedUnit > 0 ||
    countAmountMap(cat?.baseConvertedChildTotalsById) > 0 ||
    countAmountMap(cat?.nonHotelConvertedChildTotalsById) > 0 ||
    n(cat?.baseConvertedChildTotal ?? cat?.nonHotelConvertedChildTotal) > 0;
  const hasResolvedChildServiceBase =
    noHotelChildBase > 0 ||
    countAmountMap(cat?.baseExplicitChildTotalsById) > 0 ||
    countAmountMap(cat?.nonHotelExplicitChildTotalsById) > 0 ||
    n(cat?.baseExplicitChildTotal || cat?.nonHotelExplicitChildTotal) > 0 ||
    n(cat?.totalPerChild) > 0;
  const explicitChildExternalUnit = hasResolvedChildServiceBase
    ? 0
    : n(externalChildTotal);

  if (!hasExplicitData && !hasConvertedColumns && !hasStandaloneConvertedData) {
    return [];
  }

  return adultMatrix.map((column, index) => {
    if (isChildNoHotelColumn(column)) {
      const childAdditional = shouldApplyAdditionalToChildren(cat?.additionalCfg)
        ? computeAdicionales(cat?.additionalCfg, noHotelChildBase, "child")
        : 0;

      return {
        ...column,
        value: roundMoney(
          noHotelChildBase + childAdditional + explicitChildExternalUnit,
        ),
        beneficiaryCount: noHotelChildCount,
        totalBeneficiaryCount: noHotelChildCount,
        adultBeneficiaryCount: 0,
        convertedChildBeneficiaryCount: 0,
        available: noHotelChildCount > 0,
      };
    }

    const convertedColumn = convertedMatrix[index] || {};
    const convertedAvailable = Boolean(convertedColumn.available);
    const convertedValue = convertedAvailable ? n(convertedColumn.value) : 0;
    const explicitHotelAvailable =
      !convertedAvailable && explicitHotelChildCount > 0;
    const explicitHotelShare = explicitHotelAvailable
      ? resolveExplicitHotelChildShare(cat, column, explicitHotelChildCount)
      : 0;
    const standaloneConvertedValue =
      !convertedAvailable && hasStandaloneConvertedData
        ? n(standaloneConvertedUnit)
        : 0;
    const convertedBaseForAdditional = Math.max(
      0,
      convertedValue -
        (convertedAvailable ? externalUnifiedChildTotal : 0),
    );
    const genericChildBase =
      !hasConvertedColumns &&
      !convertedAvailable &&
      (!hasChildNoHotelColumn || explicitHotelAvailable)
        ? Math.max(
            0,
            noHotelChildBase +
              explicitHotelShare +
              Math.max(
                0,
                standaloneConvertedValue - externalUnifiedChildTotal,
              ),
          )
        : 0;
    const explicitExternal =
      genericChildBase > 0 || hasNoHotelColumn ? explicitChildExternalUnit : 0;
    const standaloneConvertedExternal =
      standaloneConvertedValue > 0 ? externalUnifiedChildTotal : 0;
    const explicitBaseForAdditional = Math.max(0, genericChildBase);
    const suppressChildAdditional =
      cat?.childAdditionalIncluded && !convertedAvailable;
    const childAdditional =
      suppressChildAdditional ||
      !shouldApplyAdditionalToChildren(cat?.additionalCfg)
        ? 0
        : computeAdicionales(
            cat?.additionalCfg,
            explicitBaseForAdditional + convertedBaseForAdditional,
            "child",
          );
    const isFirstAvailableColumn = index === firstAvailableColumnIndex;
    const shouldShowInColumn = convertedAvailable
      ? true
      : explicitHotelAvailable ||
        (!hasConvertedColumns &&
          (column.available ||
            hasNoHotelColumn ||
            hasExplicitData) &&
          (!hasStandaloneConvertedData || isFirstAvailableColumn));
    const calculatedChildValue = roundMoney(
      genericChildBase +
        explicitExternal +
        standaloneConvertedExternal +
        convertedValue +
        childAdditional,
    );
    const normalizedCanonicalChildValue = resolveCanonicalChildTotalPerPerson(
      cat,
      calculatedChildValue,
      children,
    );
    const hasChildServiceBreakdown =
      sumAmountMap(cat?.baseExplicitChildTotalsById) > 0 ||
      sumAmountMap(cat?.nonHotelExplicitChildTotalsById) > 0 ||
      sumAmountMap(cat?.baseConvertedChildTotalsById) > 0 ||
      sumAmountMap(cat?.nonHotelConvertedChildTotalsById) > 0 ||
      n(cat?.baseExplicitChildTotal || cat?.nonHotelExplicitChildTotal) > 0 ||
      n(cat?.baseConvertedChildTotal ?? cat?.nonHotelConvertedChildTotal) > 0;
    const hasRoomResolvedChildPricing =
      convertedAvailable ||
      explicitHotelAvailable ||
      n(convertedColumn?.convertedChildBeneficiaryCount) > 0 ||
      n(convertedColumn?.beneficiaryCount) > 0;
    const shouldPreferCanonicalChildTotal =
      cat?.preferCanonicalChildTotal === true &&
      normalizedCanonicalChildValue > 0;
    const shouldUseCanonicalFallback =
      normalizedCanonicalChildValue > 0 &&
      (shouldPreferCanonicalChildTotal ||
        !hasChildServiceBreakdown ||
        calculatedChildValue <= 0);
    const renderedChildValue =
      shouldUseCanonicalFallback
        ? normalizedCanonicalChildValue
        : hasRoomResolvedChildPricing && calculatedChildValue > 0
        ? calculatedChildValue
        : normalizedCanonicalChildValue > 0
          ? normalizedCanonicalChildValue
          : calculatedChildValue;

    return {
      ...column,
      ...convertedColumn,
      value: shouldShowInColumn ? renderedChildValue : 0,
      beneficiaryCount: convertedAvailable
        ? convertedColumn.beneficiaryCount
        : explicitHotelAvailable
          ? explicitHotelChildCount
        : children,
      totalBeneficiaryCount: convertedAvailable
        ? convertedColumn.totalBeneficiaryCount || convertedColumn.beneficiaryCount
        : explicitHotelAvailable
          ? explicitHotelChildCount
        : children,
      available: shouldShowInColumn,
    };
  });
};

const renderPriceValueCell = (cat, column, kind, color = "#1e293b") => {
  const value = column.available ? fmtExcelMoney(column.value) : "&mdash;";
  const baseRoomKey =
    column.baseRoomKey || column.sourceRoomKey || canonicalRoomKey(column.key, column.label);
  return `<div class="hpm-preview-price-cell hpm-preview-price-cell--${kind} hpm-preview-price-cell--${column.key}" data-preview-locked="true" data-preview-price-value="${cat.category}-${column.key}-${kind}" data-hpm-room-key="${column.key}" data-hpm-room-base-key="${baseRoomKey}" data-hpm-room-instance-key="${column.roomInstanceKey || ""}" data-hpm-room-label="${column.headerLabel || column.label || column.key}" data-hpm-room-count="${column.roomCount || column.selectedCount || 0}" data-hpm-room-beneficiaries="${column.beneficiaryCount || 0}" data-hpm-room-total-beneficiaries="${column.totalBeneficiaryCount || column.beneficiaryCount || 0}" data-hpm-room-adult-beneficiaries="${column.adultBeneficiaryCount || 0}" data-hpm-room-converted-beneficiaries="${column.convertedChildBeneficiaryCount || 0}" data-hpm-hotel-share="${column.hotelPerAdult || 0}" data-hpm-has-igv="${column.hasIgv || column.tieneIgv ? "true" : "false"}" data-hpm-igv-per-person="${column.igvPerPerson || 0}" data-hpm-price-includes-external="${column.externalAdultIncluded ? "true" : "false"}" style="padding:12px;font-size:15px;font-weight:900;text-align:right;border-right:2px solid #111827;color:${color};">${value}</div>`;
};

export const buildCotizacionHotelPreviewModel = ({
  categoryRows = [],
  peopleCount = { adults: 2, children: 0 },
  selectedCat = null,
  accommodationType = "doble o matrimonial",
  externalAdultTotal = 0,
  externalChildTotal = 0,
  externalConvertedChildTotal = 0,
} = {}) => {
  const luxuryFilteredRows = filterLuxuryHotelCategoryRows(categoryRows, {
    category: selectedCat,
  });
  const normalizedCategoryRows = alignCategoryRowsToSelectedNights(
    luxuryFilteredRows,
    selectedCat,
  );
  const basePriceColumns = buildSelectedRoomColumns(
    normalizedCategoryRows,
    selectedCat,
  );
  const priceColumns = maybeAppendChildNoHotelColumn(
    basePriceColumns,
    normalizedCategoryRows,
    peopleCount,
  );
  const persistedChildRoomDistributionMap =
    buildPersistedChildRoomDistributionMap(
      normalizedCategoryRows,
      selectedCat,
    );
  const accommodationColumns = buildSelectedAccommodationColumns(
    normalizedCategoryRows,
    selectedCat,
  );

  return {
    priceColumns,
    accommodationType: describeRoomColumns(
      accommodationColumns,
      accommodationType,
    ),
    categories: normalizedCategoryRows.map((cat) => {
      const adultMatrix = buildRoomPriceMatrix(
        cat,
        peopleCount,
        priceColumns,
        externalAdultTotal,
      );
      const childPlacementMatrix = applyVisibleChildDistributionToRoomMatrix(
        adultMatrix,
        persistedChildRoomDistributionMap,
      );
      const childMatrix = buildChildPriceMatrix(
        cat,
        childPlacementMatrix,
        peopleCount,
        externalChildTotal,
        externalConvertedChildTotal,
      );

      return {
        category: cat.category,
        label: CAT_LABELS[cat.category] || cat.category,
        adultMatrix,
        childMatrix,
      };
    }),
  };
};

export const buildCotizacionModernPreviewHtml = (opts = {}) => {
  const model = buildCotizacionHotelPreviewModel(opts);
  const title = String(opts.titulo || "Cotización").toUpperCase();
  const daysCount = Array.isArray(opts.days) ? opts.days.length : 0;
  const nightsCount = opts.nights || Math.max(1, daysCount - 1);
  const pax = Math.max(
    1,
    n(opts.peopleCount?.adults) + n(opts.peopleCount?.children),
  );

  let html = `<section class="hpm-modern-preview" style="width:100%;font-family:Inter,Arial,sans-serif;background:#ffffff;border:1px solid #dbe5ef;border-radius:12px;overflow:hidden;color:#102018;">`;
  html += `<header style="padding:16px 18px;background:#02522f;color:#fff;display:flex;justify-content:space-between;gap:16px;align-items:flex-start;"><div><div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.78;">Vista hotelera</div><div style="font-size:18px;font-weight:900;margin-top:4px;">${title}</div></div><div style="text-align:right;font-size:12px;font-weight:800;">${daysCount}D / ${nightsCount}N<br/>${pax} pasajeros</div></header>`;
  html += `<div style="padding:16px 18px;display:grid;gap:12px;">`;
  model.categories.forEach((cat) => {
    html += `<article style="border:1px solid #d8e2dc;border-radius:10px;overflow:hidden;background:#f8fbf9;"><div style="padding:12px 14px;display:flex;justify-content:space-between;gap:12px;align-items:center;border-bottom:1px solid #d8e2dc;"><strong>${cat.label}</strong><span style="font-size:12px;color:#557064;">${model.accommodationType}</span></div>`;
    html += `<div style="display:grid;grid-template-columns:repeat(${model.priceColumns.length},minmax(120px,1fr));gap:1px;background:#d8e2dc;">`;
    cat.adultMatrix.forEach((column) => {
      html += `<div data-preview-price-value="${cat.category}-${column.key}-adult" style="background:#fff;padding:12px;text-align:right;"><div style="font-size:11px;font-weight:800;color:#5b6b7b;text-transform:uppercase;">${column.headerLabel || column.label}</div><div style="font-size:18px;font-weight:900;color:#052e1d;margin-top:4px;">${column.available ? fmtExcelMoney(column.value) : "&mdash;"}</div></div>`;
    });
    html += `</div></article>`;
  });
  html += `<footer style="padding:12px 18px;background:#f1f6f3;color:#02522f;font-size:12px;font-weight:800;">Tipo de acomodación: ${model.accommodationType}</footer>`;
  html += `</div></section>`;
  return html;
};

const stripFlightFareFromTitle = (value) =>
  String(value || "")
    .replace(/\s*\|\s*Vuelos?\s*:\s*\$?\s*[\d.,]+/gi, " | Vuelo")
    .replace(/\s*\|\s*Flights?\s*:\s*\$?\s*[\d.,]+/gi, " | Vuelo")
    .trim();

const isGenericDayTitle = (value) =>
  /^d[ií]a\s*#?\s*\d+$/i.test(
    stripFlightFareFromTitle(value).replace(/\s+/g, " ").trim(),
  );

const firstText = (...values) =>
  values.find((value) => typeof value === "string" && value.trim().length > 0);

const resolvePreviewDayTitle = (day, idx, ciudades, dayTitles = []) => {
  const dayTitleFromList = Array.isArray(dayTitles)
    ? dayTitles[idx]?.titulo || dayTitles[idx]?.title || dayTitles[idx]
    : null;
  const nestedDay =
    day?.itinerarioDia ||
    day?.itinerario_dia ||
    day?.dia ||
    day?.raw ||
    day?.source ||
    {};
  const serviceTitleCandidates = (day?.servicios || [])
    .flatMap((service) => [
      service?.dayTitle,
      service?.tituloDia,
      service?.titulo_dia,
      service?.itinerarioDia?.titulo,
      service?.itinerario_dia?.titulo,
      service?.dia?.titulo,
    ])
    .filter((value) => typeof value === "string" && value.trim().length > 0);
  const candidates = [
    day?.titulo,
    day?.title,
    day?.dayTitle,
    day?.tituloDia,
    day?.titulo_dia,
    day?.nombreDia,
    day?.nombre_dia,
    day?.itineraryTitle,
    day?.itinerarioTitulo,
    day?.itinerario_titulo,
    day?.displayTitle,
    dayTitleFromList,
    nestedDay?.titulo,
    nestedDay?.title,
    nestedDay?.dayTitle,
    nestedDay?.tituloDia,
    nestedDay?.titulo_dia,
    ...serviceTitleCandidates,
  ].filter((value) => typeof value === "string" && value.trim().length > 0);

  const specificTitle = candidates.find((value) => !isGenericDayTitle(value));
  return stripFlightFareFromTitle(
    firstText(specificTitle, candidates[0], ciudades, `Día ${idx + 1}`),
  );
};

const CAT_LABELS = {
  2: "2** ESTÁNDAR",
  3: "3 *** ESTÁNDAR",
  "3s": "3 *** SUPERIOR",
  4: "4 **** ESTRELLAS",
  5: "5 ***** ESTRELLAS",
  [NO_HOTEL_CATEGORY]: "SIN HOTEL",
};

const escapePreviewHtml = (value = "") =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const normalizePreviewCategoryKey = (value = "") =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

const resolvePreviewCategoryLabel = (category, fallback = "") => {
  const key = normalizePreviewCategoryKey(category);
  const label =
    CAT_LABELS[key] ||
    CAT_LABELS[String(category ?? "").trim()] ||
    fallback ||
    (category ? `${category} ESTRELLAS` : "HOTEL");
  return String(label).trim().toUpperCase();
};

const getPreviewRowCategoryCandidate = (row = {}) =>
  row?.category || row?.hotelCategory || row?.hotel_categoria || row?.groupCategory || "";

const collectPreviewHotelCategoryEntries = (categoryRows = []) => {
  const entries = [];
  const seen = new Set();

  const pushEntry = (category, fallbackLabel = "") => {
    const key = normalizePreviewCategoryKey(category || fallbackLabel);
    if (!key || key === NO_HOTEL_CATEGORY) return;
    const label = resolvePreviewCategoryLabel(category || key, fallbackLabel);
    const dedupeKey = `${key}:${normalizeText(label)}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    entries.push({ key, label });
  };

  (Array.isArray(categoryRows) ? categoryRows : [])
    .filter((row) => !row?.noHotel && !isNoHotelPreviewCategory(row?.category))
    .forEach((row) => {
      pushEntry(
        getPreviewRowCategoryCandidate(row),
        row?.label || row?.categoryLabel || row?.hotelCategoryLabel || row?.hotelName,
      );

      (Array.isArray(row?.perRoomPricing) ? row.perRoomPricing : []).forEach(
        (room) => {
          pushEntry(
            room?.groupCategory ||
              room?.category ||
              room?.hotelCategory ||
              room?.hotel_categoria ||
              row?.category,
            room?.groupCategoryLabel ||
              room?.categoryLabel ||
              room?.hotelCategoryLabel ||
              row?.label,
          );
        },
      );
    });

  return entries;
};

const resolvePreviewHotelCategoryText = (categoryRows = []) => {
  const entries = collectPreviewHotelCategoryEntries(categoryRows);
  return entries.length > 0
    ? entries.map((entry) => entry.label).join(" / ")
    : "SEGÚN GRUPOS";
};

const collectSelectedHotelGroupCategoryEntries = (selectedHotel = null) => {
  const entries = [];
  const seen = new Set();
  const pushEntry = (category, fallbackLabel = "") => {
    const key = normalizePreviewCategoryKey(category || fallbackLabel);
    if (!key || key === NO_HOTEL_CATEGORY || seen.has(key)) return;
    seen.add(key);
    entries.push({
      key,
      label: resolvePreviewCategoryLabel(category || key, fallbackLabel),
    });
  };

  const groups = Array.isArray(selectedHotel?.dayGroups)
    ? selectedHotel.dayGroups
    : [];

  groups.forEach((group) => {
    pushEntry(
      group?.category || group?.groupCategory || group?.hotelCategory,
      group?.label || group?.categoryLabel || group?.hotelCategoryLabel,
    );
  });

  if (entries.length > 0) return entries;

  (Array.isArray(selectedHotel?.perRoomPricing)
    ? selectedHotel.perRoomPricing
    : []
  ).forEach((room) => {
    pushEntry(
      room?.groupCategory || room?.category || room?.hotelCategory,
      room?.groupCategoryLabel || room?.categoryLabel || room?.hotelCategoryLabel,
    );
  });

  return entries;
};

const getSelectedHotelGroupCount = (selectedHotel = null) => {
  const groups = Array.isArray(selectedHotel?.dayGroups)
    ? selectedHotel.dayGroups.filter((group) => {
        const indices = Array.isArray(group?.selectedNightIndices)
          ? group.selectedNightIndices
          : Array.isArray(group?.groupDayIndices)
            ? group.groupDayIndices
            : [];
        return indices.length > 0 || group?.category || group?.groupCategory;
      })
    : [];
  if (groups.length > 0) return groups.length;

  const identities = new Set(
    (Array.isArray(selectedHotel?.perRoomPricing)
      ? selectedHotel.perRoomPricing
      : []
    )
      .map((room, index) =>
        getExportPricingGroupIdentity(room, index, { includeFallback: false }),
      )
      .filter(Boolean),
  );
  return identities.size;
};

const filterRowsToPreviewGroupCategories = (
  rows = [],
  groupEntries = [],
  shouldApply = false,
) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!shouldApply || !Array.isArray(groupEntries) || groupEntries.length === 0) {
    return safeRows;
  }

  const groupKeys = new Set(groupEntries.map((entry) => entry.key).filter(Boolean));
  const filtered = safeRows.filter((row) =>
    groupKeys.has(
      normalizePreviewCategoryKey(
        getPreviewRowCategoryCandidate(row) || row?.category || row?.label,
      ),
    ),
  );

  return filtered.length > 0
    ? filtered.map((row) => ({ ...row, isSelected: true, selected: true }))
    : safeRows;
};

const resolveGroupedPreviewCategoryEntries = (
  selectedHotel = null,
  categoryRows = [],
) => {
  const explicitEntries = collectSelectedHotelGroupCategoryEntries(selectedHotel);
  if (explicitEntries.length > 0) return explicitEntries;
  return collectPreviewHotelCategoryEntries(categoryRows);
};

const resolveGroupedPreviewHotelCategoryText = (
  selectedHotel = null,
  categoryRows = [],
) => {
  const entries = resolveGroupedPreviewCategoryEntries(selectedHotel, categoryRows);
  return entries.length > 0
    ? entries.map((entry) => entry.label).join(" / ")
    : "SEGÚN GRUPOS";
};

const buildGroupedPreviewCategoryAttrs = (entries = []) => {
  const keys = entries.map((entry) => entry.key).filter(Boolean);
  const label = entries.map((entry) => entry.label).join(" / ");
  const attrs = [];
  if (keys.length > 0) {
    attrs.push(`data-preview-price-categories="${escapePreviewHtml(keys.join(","))}"`);
  }
  if (label) {
    attrs.push(
      `data-preview-hotel-categories-label="${escapePreviewHtml(label)}"`,
    );
  }
  return attrs.join(" ");
};

const shouldRecomputeSingleGroupAlternativeRow = (row = {}, selectedCat = null) => {
  if (!row || row?.noHotel || isNoHotelPreviewCategory(row?.category)) return false;
  if (row?.isSelected || row?.selected) return false;
  if (
    selectedCat &&
    normalizeText(row?.category) === normalizeText(selectedCat)
  ) {
    return false;
  }
  if (!Array.isArray(row?.roomOptions) || row.roomOptions.length === 0) return false;

  const groupIdentityCount = new Set(
    (Array.isArray(row?.perRoomPricing) ? row.perRoomPricing : [])
      .map((room, index) =>
        getExportPricingGroupIdentity(room, index, { includeFallback: false }),
      )
      .filter(Boolean),
  ).size;
  return groupIdentityCount <= 1;
};

const collectConvertedChildIdsForAlternativePreview = (
  selectedHotel = null,
) => {
  const convertedIds = new Set();
  const childPricing = selectedHotel?.childPricing || {};

  (Array.isArray(childPricing?.convertedChildIds)
    ? childPricing.convertedChildIds
    : []
  ).forEach((id) => {
    if (String(id || "").startsWith("child:")) {
      convertedIds.add(String(id));
    }
  });

  Object.entries(
    childPricing?.convertedChildToAdultMap ||
      childPricing?.ninosComoAdulto ||
      {},
  ).forEach(([key, value]) => {
    if (value && String(key || "").startsWith("child:")) {
      convertedIds.add(String(key));
    }
    if (String(value || "").startsWith("child:")) {
      convertedIds.add(String(value));
    }
  });

  return convertedIds;
};

const resolveAlternativeRoomAssignment = (
  assignments = {},
  room = {},
  roomIndex = 0,
) => {
  if (!assignments || typeof assignments !== "object") return [];

  const sourceKey = String(
    room?.sourceRoomKey || room?.roomKey || room?.key || "",
  ).trim();
  const baseKey = sourceKey.split(":")[0];
  const label = String(room?.baseLabel || room?.label || "").trim();
  const canonicalKey = canonicalRoomKey(sourceKey, label);
  const index = Math.max(1, roomIndex + 1);
  const candidates = [
    room?.key,
    room?.roomId,
    room?.roomInstanceKey,
    `${sourceKey}:${index}`,
    `${baseKey}:${index}`,
    `${canonicalKey}:${index}`,
    sourceKey,
    baseKey,
    canonicalKey,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const value = assignments[candidate];
    if (Array.isArray(value) && value.length > 0) return [...value];
  }

  const normalizedCandidates = new Set(candidates.map(normalizeText));
  const matchedKey = Object.keys(assignments).find((key) =>
    normalizedCandidates.has(normalizeText(key)),
  );

  return matchedKey && Array.isArray(assignments[matchedKey])
    ? [...assignments[matchedKey]]
    : [];
};

const expandAlternativeReferenceRoomRows = (rows = []) => {
  const counters = {};

  return (Array.isArray(rows) ? rows : []).flatMap((room) => {
    const roomKey = canonicalRoomKey(
      room?.sourceRoomKey || room?.roomKey || room?.key,
      room?.baseLabel || room?.label,
    );
    const details = Array.isArray(room?.roomDetails)
      ? room.roomDetails.filter(Boolean)
      : [];
    const count = Math.max(1, n(room?.roomCount) || details.length || 1);
    let remainingAdults = Math.max(0, n(room?.adultBeneficiaries));
    let remainingConverted = Math.max(
      0,
      n(room?.convertedChildBeneficiaries),
    );

    return Array.from({ length: count }, (_, localIndex) => {
      counters[roomKey] = (counters[roomKey] || 0) + 1;
      const instanceIndex = counters[roomKey];
      const detail = details[localIndex] || details[0] || {};
      const passengerIds = Array.isArray(detail?.passengerIds)
        ? detail.passengerIds
        : Array.isArray(room?.passengerIds)
          ? room.passengerIds
          : [];
      const adultPassengerIds = Array.isArray(detail?.adultPassengerIds)
        ? detail.adultPassengerIds
        : Array.isArray(room?.adultPassengerIds)
          ? room.adultPassengerIds
          : passengerIds.filter((id) => String(id).startsWith("adult:"));
      const convertedChildPassengerIds = Array.isArray(
        detail?.convertedChildPassengerIds,
      )
        ? detail.convertedChildPassengerIds
        : Array.isArray(room?.convertedChildPassengerIds)
          ? room.convertedChildPassengerIds
          : [];
      const capacity = Math.max(1, n(room?.capacity) || 1);
      const detailAdultCount = adultPassengerIds.length;
      const detailConvertedCount = convertedChildPassengerIds.length;
      const adultBeneficiaries =
        detailAdultCount > 0
          ? detailAdultCount
          : Math.min(capacity, remainingAdults);
      const convertedChildBeneficiaries =
        detailConvertedCount > 0
          ? detailConvertedCount
          : Math.min(
              Math.max(0, capacity - adultBeneficiaries),
              remainingConverted,
            );
      remainingAdults = Math.max(0, remainingAdults - adultBeneficiaries);
      remainingConverted = Math.max(
        0,
        remainingConverted - convertedChildBeneficiaries,
      );

      return {
        ...room,
        key:
          detail?.roomId ||
          detail?.key ||
          `${room?.sourceRoomKey || room?.roomKey || room?.key || roomKey}:${instanceIndex}`,
        roomKey: room?.roomKey || room?.sourceRoomKey || roomKey,
        sourceRoomKey: room?.sourceRoomKey || room?.roomKey || roomKey,
        label:
          detail?.label ||
          (count > 1
            ? `${room?.baseLabel || room?.label || "Habitación"} ${instanceIndex}`
            : room?.label || room?.baseLabel || "Habitación"),
        baseLabel: room?.baseLabel || room?.label || detail?.label,
        roomCount: 1,
        roomDetails: detail && Object.keys(detail).length > 0 ? [detail] : [],
        passengerIds: [...passengerIds],
        adultPassengerIds: [...adultPassengerIds],
        convertedChildPassengerIds: [...convertedChildPassengerIds],
        capacity,
        adultBeneficiaries,
        convertedChildBeneficiaries,
        beneficiaries: adultBeneficiaries + convertedChildBeneficiaries,
      };
    });
  });
};

const buildAlternativeReferenceRowsFromBreakdown = (
  selectedRow = null,
  { adults = 1, convertedChildren = 0 } = {},
) => {
  const rooms = getAlternativeRoomBreakdown(selectedRow || {});
  if (rooms.length === 0) return [];

  let remainingAdults = Math.max(0, n(adults));
  let remainingConverted = Math.max(0, n(convertedChildren));
  const counters = {};

  return rooms.flatMap((room) =>
    Array.from({ length: Math.max(1, n(room?.count) || 1) }, () => {
      const roomKey = canonicalRoomKey(room?.key, room?.label);
      counters[roomKey] = (counters[roomKey] || 0) + 1;
      const capacity = Math.max(1, n(room?.capacity) || 1);
      const adultBeneficiaries = Math.min(capacity, remainingAdults);
      const convertedChildBeneficiaries = Math.min(
        Math.max(0, capacity - adultBeneficiaries),
        remainingConverted,
      );
      remainingAdults = Math.max(0, remainingAdults - adultBeneficiaries);
      remainingConverted = Math.max(
        0,
        remainingConverted - convertedChildBeneficiaries,
      );

      return {
        key: `${room?.key || roomKey}:${counters[roomKey]}`,
        roomKey: room?.key || roomKey,
        sourceRoomKey: room?.key || roomKey,
        label:
          n(room?.count) > 1
            ? `${room?.label || "Habitación"} ${counters[roomKey]}`
            : room?.label || "Habitación",
        baseLabel: room?.label || "Habitación",
        capacity,
        roomCount: 1,
        adultBeneficiaries,
        convertedChildBeneficiaries,
        beneficiaries: adultBeneficiaries + convertedChildBeneficiaries,
        passengerIds: [],
        adultPassengerIds: [],
        convertedChildPassengerIds: [],
        roomDetails: [],
      };
    }),
  );
};

const resolveAlternativePreviewConvertedCount = ({
  selectedRow = null,
  selectedHotel = null,
  referenceRows = [],
  children = 0,
  pricingParts = [],
} = {}) => {
  const roomCount = (Array.isArray(referenceRows) ? referenceRows : []).reduce(
    (sum, room) =>
      sum + Math.max(0, n(room?.convertedChildBeneficiaries)),
    0,
  );
  const convertedIds = collectConvertedChildIdsForAlternativePreview(
    selectedHotel,
  );
  const presentation = buildSummaryPricingPresentation(pricingParts);
  const pricedRoomChildren = (presentation?.columns || []).reduce(
    (sum, column) =>
      column?.roomTypeKey === "sin-hotel"
        ? sum
        : sum + Math.max(0, n(column?.child?.beneficiaries)),
    0,
  );

  return Math.min(
    Math.max(0, n(children)),
    Math.max(
      roomCount,
      convertedIds.size,
      pricedRoomChildren,
      n(selectedRow?.convertedChildCount),
      n(selectedRow?.hotelConvertedChildCount),
      n(selectedHotel?.convertedChildCount),
      n(selectedHotel?.hotelConvertedChildCount),
    ),
  );
};

const resolveAlternativeReferenceRoomCount = (
  roomTypeKey,
  selectedRow = null,
  selectedHotel = null,
) => {
  const sources = [selectedRow, selectedHotel].filter(Boolean);
  let count = 0;

  sources.forEach((source) => {
    Object.entries(source?.mix || {}).forEach(([key, value]) => {
      if (canonicalRoomKey(key, key) === roomTypeKey) {
        count = Math.max(count, Math.max(0, n(value)));
      }
    });
    (Array.isArray(source?.breakdown) ? source.breakdown : []).forEach(
      (room) => {
        if (
          canonicalRoomKey(
            room?.key || room?.roomKey,
            room?.label,
          ) === roomTypeKey
        ) {
          count = Math.max(
            count,
            Math.max(0, n(room?.cnt ?? room?.count ?? room?.selectedCount)),
          );
        }
      },
    );
  });

  return Math.max(0, count);
};

const resolveAlternativeReferenceRoomOption = (
  roomTypeKey,
  selectedRow = null,
  selectedHotel = null,
) => {
  const options = [
    ...(Array.isArray(selectedRow?.roomOptions) ? selectedRow.roomOptions : []),
    ...(Array.isArray(selectedHotel?.roomOptions)
      ? selectedHotel.roomOptions
      : []),
  ];
  return (
    options.find(
      (option) =>
        canonicalRoomKey(option?.key, option?.label) === roomTypeKey,
    ) || null
  );
};

const mergeAlternativeReferenceRowsWithPricingParts = (
  referenceRows = [],
  pricingParts = [],
  selectedRow = null,
  selectedHotel = null,
) => {
  const rows = (Array.isArray(referenceRows) ? referenceRows : []).map(
    (room) => ({ ...room }),
  );
  const presentation = buildSummaryPricingPresentation(pricingParts);

  (presentation?.columns || []).forEach((column) => {
    const roomTypeKey = canonicalRoomKey(
      column?.roomTypeKey || column?.key,
      column?.label,
    );
    if (!roomTypeKey || roomTypeKey === "sin-hotel") return;

    const desiredAdults = Math.max(0, n(column?.adult?.beneficiaries));
    const desiredChildren = Math.max(0, n(column?.child?.beneficiaries));
    const desiredBeneficiaries = desiredAdults + desiredChildren;
    if (desiredBeneficiaries <= 0) return;

    const option = resolveAlternativeReferenceRoomOption(
      roomTypeKey,
      selectedRow,
      selectedHotel,
    );
    const capacity = Math.max(
      1,
      n(option?.capacity) || n(column?.capacity) ||
        (roomTypeKey === "familiar"
          ? 4
          : roomTypeKey === "triple"
            ? 3
            : roomTypeKey === "doble"
              ? 2
              : 1),
    );
    let matchingRows = rows.filter(
      (room) =>
        canonicalRoomKey(
          room?.sourceRoomKey || room?.roomKey || room?.key,
          room?.baseLabel || room?.label,
        ) === roomTypeKey,
    );
    const persistedRoomCount = resolveAlternativeReferenceRoomCount(
      roomTypeKey,
      selectedRow,
      selectedHotel,
    );
    const desiredRoomCount = Math.max(
      matchingRows.length,
      persistedRoomCount,
      Math.ceil(desiredBeneficiaries / capacity),
    );

    while (matchingRows.length < desiredRoomCount) {
      const roomIndex = matchingRows.length + 1;
      const room = {
        key: `${option?.key || roomTypeKey}:${roomIndex}`,
        roomKey: option?.key || roomTypeKey,
        sourceRoomKey: option?.key || roomTypeKey,
        label:
          desiredRoomCount > 1
            ? `${option?.label || column?.label || "Habitación"} ${roomIndex}`
            : option?.label || column?.label || "Habitación",
        baseLabel: option?.label || column?.label || "Habitación",
        capacity,
        roomCount: 1,
        beneficiaries: 0,
        adultBeneficiaries: 0,
        convertedChildBeneficiaries: 0,
        passengerIds: [],
        adultPassengerIds: [],
        convertedChildPassengerIds: [],
        roomDetails: [],
      };
      rows.push(room);
      matchingRows.push(room);
    }

    reconcileAlternativeRoomTypeBeneficiaries(matchingRows, {
      desiredAdults,
      desiredChildren,
      defaultCapacity: capacity,
    });

  });

  return rows;
};

const reconcileAlternativeRoomTypeBeneficiaries = (
  matchingRows = [],
  { desiredAdults = 0, desiredChildren = 0, defaultCapacity = 1 } = {},
) => {
  const rows = Array.isArray(matchingRows) ? matchingRows : [];
  rows.forEach((room) => {
    const passengerIds = Array.isArray(room?.passengerIds)
      ? [...room.passengerIds]
      : [];
    const adultPassengerIds = Array.isArray(room?.adultPassengerIds)
      ? [...room.adultPassengerIds]
      : passengerIds.filter((id) => String(id).startsWith("adult:"));
    const convertedChildPassengerIds = Array.isArray(
      room?.convertedChildPassengerIds,
    )
      ? [...room.convertedChildPassengerIds]
      : [];

    room.passengerIds = passengerIds;
    room.adultPassengerIds = adultPassengerIds;
    room.convertedChildPassengerIds = convertedChildPassengerIds;
    room.capacity = Math.max(
      1,
      n(room?.capacity) || n(defaultCapacity) || 1,
    );
    room.adultBeneficiaries = Math.max(
      adultPassengerIds.length,
      Math.max(0, n(room?.adultBeneficiaries)),
    );
    room.convertedChildBeneficiaries = Math.max(
      convertedChildPassengerIds.length,
      Math.max(0, n(room?.convertedChildBeneficiaries)),
    );
  });

  const sumAdults = () =>
    rows.reduce(
      (sum, room) => sum + Math.max(0, n(room?.adultBeneficiaries)),
      0,
    );
  const sumChildren = () =>
    rows.reduce(
      (sum, room) =>
        sum + Math.max(0, n(room?.convertedChildBeneficiaries)),
      0,
    );
  const roomOccupied = (room) =>
    Math.max(0, n(room?.adultBeneficiaries)) +
    Math.max(0, n(room?.convertedChildBeneficiaries));

  // Persisted quotations created before the canonical hotel snapshot often
  // stored the converted child as an extra adult beneficiary. The assignment
  // still contains `child:*`, so restore that identity before repricing the
  // alternative categories.
  let missingChildren = Math.max(0, n(desiredChildren) - sumChildren());
  rows.forEach((room) => {
    if (missingChildren <= 0) return;
    const knownConverted = new Set(
      (room.convertedChildPassengerIds || []).map(String),
    );
    const candidates = (room.passengerIds || []).filter(
      (id) =>
        String(id).startsWith("child:") && !knownConverted.has(String(id)),
    );

    candidates.forEach((id) => {
      if (missingChildren <= 0) return;
      room.convertedChildPassengerIds.push(id);
      room.convertedChildBeneficiaries += 1;

      // A full room with a newly recovered child normally contains one stale
      // synthetic adult. Remove only that synthetic beneficiary; real
      // `adult:*` passengers remain untouched.
      if (
        roomOccupied(room) > room.capacity &&
        room.adultBeneficiaries > room.adultPassengerIds.length
      ) {
        room.adultBeneficiaries -= 1;
      }
      missingChildren -= 1;
    });
  });

  // Match the canonical selected-category presentation exactly. Prefer
  // removing synthetic adults (beneficiaries without an `adult:*` id), which
  // is the shape produced by the old edit hydration path.
  let excessAdults = Math.max(0, sumAdults() - Math.max(0, n(desiredAdults)));
  const adultReductionOrder = [...rows].sort((left, right) => {
    const leftSynthetic = Math.max(
      0,
      n(left?.adultBeneficiaries) - (left?.adultPassengerIds || []).length,
    );
    const rightSynthetic = Math.max(
      0,
      n(right?.adultBeneficiaries) - (right?.adultPassengerIds || []).length,
    );
    if (rightSynthetic !== leftSynthetic) return rightSynthetic - leftSynthetic;
    return n(right?.convertedChildBeneficiaries) - n(left?.convertedChildBeneficiaries);
  });
  adultReductionOrder.forEach((room) => {
    if (excessAdults <= 0) return;
    const removable = Math.max(
      0,
      n(room?.adultBeneficiaries) - (room?.adultPassengerIds || []).length,
    );
    const reduction = Math.min(removable, excessAdults);
    room.adultBeneficiaries -= reduction;
    excessAdults -= reduction;
  });

  // If a historical row has no passenger ids, the canonical pricing parts are
  // still authoritative for the count. Reduce the remaining overflow without
  // affecting the selected-category core itself (these are cloned reference
  // rows used only by alternative categories).
  rows.forEach((room) => {
    if (excessAdults <= 0) return;
    const removable = Math.max(0, n(room?.adultBeneficiaries));
    const reduction = Math.min(removable, excessAdults);
    room.adultBeneficiaries -= reduction;
    if (room.adultPassengerIds.length > room.adultBeneficiaries) {
      room.adultPassengerIds = room.adultPassengerIds.slice(
        0,
        room.adultBeneficiaries,
      );
    }
    excessAdults -= reduction;
  });

  // Add a missing converted child to the room that actually contains its id.
  // When ids were not persisted, use a free slot; if every room is full,
  // reclassify a synthetic adult so the total occupancy stays unchanged.
  missingChildren = Math.max(0, n(desiredChildren) - sumChildren());
  while (missingChildren > 0) {
    let target = rows.find((room) => roomOccupied(room) < room.capacity);
    if (!target) {
      target = rows.find(
        (room) =>
          n(room?.adultBeneficiaries) >
          (room?.adultPassengerIds || []).length,
      );
      if (target) target.adultBeneficiaries -= 1;
    }
    if (!target) break;
    target.convertedChildBeneficiaries += 1;
    missingChildren -= 1;
  }

  let missingAdults = Math.max(0, n(desiredAdults) - sumAdults());
  rows.forEach((room) => {
    if (missingAdults <= 0) return;
    const free = Math.max(0, room.capacity - roomOccupied(room));
    const addition = Math.min(free, missingAdults);
    room.adultBeneficiaries += addition;
    missingAdults -= addition;
  });

  // Drop only synthetic excess children. Explicit child ids are retained.
  let excessChildren = Math.max(0, sumChildren() - Math.max(0, n(desiredChildren)));
  [...rows].reverse().forEach((room) => {
    if (excessChildren <= 0) return;
    const removable = Math.max(
      0,
      n(room?.convertedChildBeneficiaries) -
        (room?.convertedChildPassengerIds || []).length,
    );
    const reduction = Math.min(removable, excessChildren);
    room.convertedChildBeneficiaries -= reduction;
    excessChildren -= reduction;
  });

  rows.forEach((room) => {
    // Last defensive normalization: never let a cloned alternative reference
    // exceed the room capacity.
    const overflow = Math.max(0, roomOccupied(room) - room.capacity);
    if (overflow > 0) {
      const syntheticAdults = Math.max(
        0,
        n(room?.adultBeneficiaries) - (room?.adultPassengerIds || []).length,
      );
      const reduction = Math.min(overflow, syntheticAdults);
      room.adultBeneficiaries -= reduction;
    }
    room.beneficiaries = roomOccupied(room);
  });

  return rows;
};

const applyAlternativeReferenceAssignments = (
  referenceRows = [],
  selectedHotel = null,
) => {
  const assignments = selectedHotel?.roomAssignments || {};
  const convertedIds = collectConvertedChildIdsForAlternativePreview(
    selectedHotel,
  );
  const counters = {};

  return (Array.isArray(referenceRows) ? referenceRows : []).map((room) => {
    const roomKey = canonicalRoomKey(
      room?.sourceRoomKey || room?.roomKey || room?.key,
      room?.baseLabel || room?.label,
    );
    counters[roomKey] = (counters[roomKey] || 0) + 1;
    const assignedPassengerIds = resolveAlternativeRoomAssignment(
      assignments,
      room,
      counters[roomKey] - 1,
    );
    const passengerIds =
      assignedPassengerIds.length > 0
        ? assignedPassengerIds
        : Array.isArray(room?.passengerIds)
          ? room.passengerIds
          : [];
    const adultPassengerIds = passengerIds.filter((id) =>
      String(id).startsWith("adult:"),
    );
    const convertedChildPassengerIds = passengerIds.filter(
      (id) =>
        String(id).startsWith("child:") && convertedIds.has(String(id)),
    );

    return {
      ...room,
      passengerIds: [...passengerIds],
      adultPassengerIds:
        adultPassengerIds.length > 0
          ? adultPassengerIds
          : room?.adultPassengerIds || [],
      convertedChildPassengerIds:
        convertedChildPassengerIds.length > 0
          ? convertedChildPassengerIds
          : room?.convertedChildPassengerIds || [],
      adultBeneficiaries: Math.max(
        0,
        adultPassengerIds.length,
        n(room?.adultBeneficiaries),
      ),
      convertedChildBeneficiaries: Math.max(
        0,
        convertedChildPassengerIds.length,
        n(room?.convertedChildBeneficiaries),
      ),
    };
  });
};

const fillMissingAlternativeConvertedChildren = (
  referenceRows = [],
  convertedCount = 0,
) => {
  const rows = (Array.isArray(referenceRows) ? referenceRows : []).map(
    (room) => ({ ...room }),
  );
  let remaining = Math.max(
    0,
    n(convertedCount) -
      rows.reduce(
        (sum, room) =>
          sum + Math.max(0, n(room?.convertedChildBeneficiaries)),
        0,
      ),
  );

  while (remaining > 0) {
    let target = rows.find((room) => {
      const capacity = Math.max(1, n(room?.capacity) || 1);
      const occupied =
        Math.max(0, n(room?.adultBeneficiaries)) +
        Math.max(0, n(room?.convertedChildBeneficiaries));
      return occupied < capacity;
    });

    if (!target) {
      target = rows.find(
        (room) =>
          Math.max(0, n(room?.adultBeneficiaries)) >
          (Array.isArray(room?.adultPassengerIds)
            ? room.adultPassengerIds.length
            : 0),
      );
      if (target) {
        target.adultBeneficiaries = Math.max(
          0,
          n(target.adultBeneficiaries) - 1,
        );
      }
    }

    if (!target) break;
    target.convertedChildBeneficiaries =
      Math.max(0, n(target.convertedChildBeneficiaries)) + 1;
    target.beneficiaries =
      Math.max(0, n(target.adultBeneficiaries)) +
      Math.max(0, n(target.convertedChildBeneficiaries));
    remaining -= 1;
  }

  return rows;
};

const resolveAlternativeReferenceRows = (
  selectedRow = null,
  selectedHotel = null,
  context = {},
) => {
  const selectedRows = Array.isArray(selectedRow?.perRoomPricing)
    ? selectedRow.perRoomPricing
    : [];
  const hotelRows = Array.isArray(selectedHotel?.perRoomPricing)
    ? selectedHotel.perRoomPricing
    : [];
  const sourceRows = selectedRows.length > 0 ? selectedRows : hotelRows;
  let referenceRows = applyAlternativeReferenceAssignments(
    expandAlternativeReferenceRoomRows(sourceRows),
    selectedHotel,
  );
  referenceRows = mergeAlternativeReferenceRowsWithPricingParts(
    referenceRows,
    context?.pricingParts,
    selectedRow,
    selectedHotel,
  );
  const convertedCount = resolveAlternativePreviewConvertedCount({
    selectedRow,
    selectedHotel,
    referenceRows,
    children: context?.children,
    pricingParts: context?.pricingParts,
  });

  if (referenceRows.length === 0) {
    referenceRows = buildAlternativeReferenceRowsFromBreakdown(selectedRow, {
      adults: context?.adults,
      convertedChildren: convertedCount,
    });
  }

  return fillMissingAlternativeConvertedChildren(
    referenceRows,
    convertedCount,
  );
};

const buildAlternativeRoomPlanFromReference = (
  row = {},
  referenceRows = [],
) => {
  const options = Array.isArray(row?.roomOptions) ? row.roomOptions : [];
  if (options.length === 0 || referenceRows.length === 0) return [];

  return referenceRows
    .map((reference, index) => {
      const baseRoomKey = canonicalRoomKey(
        reference?.sourceRoomKey || reference?.roomKey || reference?.key,
        reference?.baseLabel || reference?.label,
      );
      const option = findRoomOptionForColumn(options, {
        key: reference?.sourceRoomKey || reference?.roomKey || baseRoomKey,
        baseRoomKey,
        label: reference?.baseLabel || reference?.label,
        aliases: [
          baseRoomKey,
          normalizeText(reference?.baseLabel),
          normalizeText(reference?.label),
        ].filter(Boolean),
        capacity: Math.max(1, n(reference?.capacity) || 1),
      });
      if (!option) return null;

      return {
        key: option?.key || baseRoomKey,
        label:
          option?.label ||
          reference?.baseLabel ||
          reference?.label ||
          "Habitación",
        capacity: Math.max(
          1,
          n(option?.capacity) || n(reference?.capacity) || 1,
        ),
        count: 1,
        unit: roundMoney(n(option?.pricePerRoomNight)),
        id_habitacion: option?.id_habitacion ?? null,
        reference,
        referenceIndex: index,
      };
    })
    .filter(Boolean);
};

const getAlternativeRoomBreakdown = (row = {}) => {
  const explicitBreakdown = (Array.isArray(row?.breakdown) ? row.breakdown : [])
    .map((room) => {
      const count = Math.max(
        0,
        Number.parseInt(
          room?.cnt ?? room?.count ?? room?.selectedCount ?? 0,
          10,
        ) || 0,
      );
      if (count <= 0) return null;

      const key = room?.key || room?.roomKey || room?.sourceRoomKey;
      const option = findRoomOptionForColumn(row?.roomOptions, {
        key,
        baseRoomKey: canonicalRoomKey(key, room?.label),
        label: room?.label,
        aliases: [normalizeText(room?.label), normalizeText(key)].filter(Boolean),
        capacity: Math.max(1, n(room?.capacity) || 1),
      });
      const unit =
        n(room?.unit) ||
        n(room?.pricePerRoomNight) ||
        (count > 0 ? n(room?.sub) / count : 0) ||
        n(option?.pricePerRoomNight);

      return {
        key: key || option?.key,
        label: room?.label || option?.label || key || "Habitación",
        capacity: Math.max(
          1,
          n(room?.capacity) || n(option?.capacity) || 1,
        ),
        count,
        unit: roundMoney(unit),
        id_habitacion:
          room?.id_habitacion ?? option?.id_habitacion ?? null,
      };
    })
    .filter(Boolean);

  if (explicitBreakdown.length > 0) return explicitBreakdown;

  const roomOptions = Array.isArray(row?.roomOptions) ? row.roomOptions : [];
  return Object.entries(row?.mix || {})
    .map(([roomKey, rawCount]) => {
      const count = Math.max(0, Number.parseInt(rawCount, 10) || 0);
      const option = roomOptions.find(
        (candidate) =>
          normalizeText(candidate?.key) === normalizeText(roomKey),
      );
      if (!option || count <= 0) return null;

      return {
        key: option.key || roomKey,
        label: option.label || roomKey,
        capacity: Math.max(1, n(option?.capacity) || 1),
        count,
        unit: roundMoney(n(option?.pricePerRoomNight)),
        id_habitacion: option?.id_habitacion ?? null,
      };
    })
    .filter(Boolean);
};

const getRoomPassengerDistribution = (room = {}) => {
  const detail = Array.isArray(room?.roomDetails)
    ? room.roomDetails.find((item) => item && typeof item === "object") || {}
    : {};
  const passengerIds = Array.isArray(room?.passengerIds)
    ? room.passengerIds
    : Array.isArray(detail?.passengerIds)
      ? detail.passengerIds
      : [];
  const adultPassengerIds = Array.isArray(room?.adultPassengerIds)
    ? room.adultPassengerIds
    : Array.isArray(detail?.adultPassengerIds)
      ? detail.adultPassengerIds
      : passengerIds.filter((id) => String(id).startsWith("adult:"));
  const convertedChildPassengerIds = Array.isArray(
    room?.convertedChildPassengerIds,
  )
    ? room.convertedChildPassengerIds
    : Array.isArray(detail?.convertedChildPassengerIds)
      ? detail.convertedChildPassengerIds
      : passengerIds.filter((id) => String(id).startsWith("child:"));

  const adultBeneficiaries = Math.max(
    0,
    n(room?.adultBeneficiaries),
    adultPassengerIds.length,
  );
  const convertedChildBeneficiaries = Math.max(
    0,
    n(room?.convertedChildBeneficiaries),
    convertedChildPassengerIds.length,
  );
  const beneficiaries = Math.max(
    0,
    n(room?.beneficiaries),
    adultBeneficiaries + convertedChildBeneficiaries,
    passengerIds.length,
  );

  return {
    passengerIds: [...passengerIds],
    adultPassengerIds: [...adultPassengerIds],
    convertedChildPassengerIds: [...convertedChildPassengerIds],
    adultBeneficiaries,
    convertedChildBeneficiaries,
    beneficiaries,
    hasIgv:
      room?.hasIgv === true ||
      room?.tieneIgv === true ||
      detail?.hasIgv === true ||
      detail?.tieneIgv === true,
  };
};

const buildAlternativeCategoryPerRoomPricing = (
  row = {},
  selectedRow = null,
  {
    adults = 1,
    children = 0,
    externalAdultTotal = 0,
    externalChildTotal = 0,
    externalConvertedChildTotal = 0,
    selectedHotel = null,
    pricingParts = [],
  } = {},
) => {
  const referenceRows = resolveAlternativeReferenceRows(
    selectedRow,
    selectedHotel,
    { adults, children, pricingParts },
  );
  const activeRoomsFromReference = buildAlternativeRoomPlanFromReference(
    row,
    referenceRows,
  );
  const activeRooms =
    activeRoomsFromReference.length > 0
      ? activeRoomsFromReference
      : getAlternativeRoomBreakdown(row);
  if (activeRooms.length === 0) return [];

  const referencesByRoom = new Map();
  referenceRows.forEach((room) => {
    const roomKey = canonicalRoomKey(
      room?.sourceRoomKey || room?.roomTypeKey || room?.roomKey || room?.key,
      room?.baseLabel || room?.label,
    );
    const entries = referencesByRoom.get(roomKey) || [];
    entries.push({
      room,
      distribution: getRoomPassengerDistribution(room),
    });
    referencesByRoom.set(roomKey, entries);
  });

  const selectedAdultBeneficiaries = referenceRows.reduce(
    (sum, room) => sum + getRoomPassengerDistribution(room).adultBeneficiaries,
    0,
  );
  const selectedConvertedBeneficiaries = referenceRows.reduce(
    (sum, room) =>
      sum + getRoomPassengerDistribution(room).convertedChildBeneficiaries,
    0,
  );
  let remainingAdults = Math.max(
    0,
    selectedAdultBeneficiaries || n(adults),
  );
  let remainingConverted = Math.max(
    0,
    selectedConvertedBeneficiaries ||
      n(row?.convertedChildCount) ||
      n(row?.hotelConvertedChildCount),
  );
  let remainingBeneficiaries = Math.max(
    remainingAdults + remainingConverted,
    n(row?.adultEquivalentCount),
  );

  const nights = Math.max(1, n(row?.nights) || n(selectedRow?.nights) || 1);
  const nonHotelsTotal = n(row?.nonHotelsTotal);
  const additionalCfg = row?.additionalCfg || {};
  const mappedChildServiceTotal =
    sumAmountMap(row?.baseExplicitChildTotalsById) +
    sumAmountMap(row?.baseConvertedChildTotalsById);
  const directChildServiceTotal =
    n(row?.baseExplicitChildTotal ?? row?.nonHotelExplicitChildTotal) +
    n(row?.baseConvertedChildTotal ?? row?.nonHotelConvertedChildTotal);
  const childServiceTotal =
    mappedChildServiceTotal > 0
      ? mappedChildServiceTotal
      : directChildServiceTotal;
  const childServicePerPerson =
    n(children) > 0
      ? roundMoney(childServiceTotal / Math.max(1, n(children)))
      : 0;
  const externalUnifiedChildTotal = roundMoney(
    n(externalChildTotal) + n(externalConvertedChildTotal),
  );
  const roomCounters = {};

  return activeRooms.flatMap((room) => {
    const roomKey = canonicalRoomKey(room?.key, room?.label);
    const references = referencesByRoom.get(roomKey) || [];

    return Array.from({ length: room.count }, (_, slotIndex) => {
      const reference = room?.reference
        ? {
            room: room.reference,
            distribution: getRoomPassengerDistribution(room.reference),
          }
        : references[slotIndex] || null;
      const referenceDistribution = reference?.distribution || null;
      const capacity = Math.max(1, n(room?.capacity) || 1);
      let adultBeneficiaries = 0;
      let convertedChildBeneficiaries = 0;
      let passengerIds = [];
      let adultPassengerIds = [];
      let convertedChildPassengerIds = [];

      if (referenceDistribution) {
        adultBeneficiaries = Math.max(
          0,
          n(referenceDistribution.adultBeneficiaries),
        );
        convertedChildBeneficiaries = Math.max(
          0,
          n(referenceDistribution.convertedChildBeneficiaries),
        );
        passengerIds = [...referenceDistribution.passengerIds];
        adultPassengerIds = [...referenceDistribution.adultPassengerIds];
        convertedChildPassengerIds = [
          ...referenceDistribution.convertedChildPassengerIds,
        ];
      } else {
        const beneficiariesForRoom = Math.min(
          capacity,
          Math.max(0, remainingBeneficiaries),
        );
        adultBeneficiaries = Math.min(
          beneficiariesForRoom,
          remainingAdults,
        );
        convertedChildBeneficiaries = Math.min(
          Math.max(0, beneficiariesForRoom - adultBeneficiaries),
          remainingConverted,
        );
      }

      let beneficiaries = Math.max(
        0,
        adultBeneficiaries + convertedChildBeneficiaries,
        referenceDistribution?.beneficiaries || 0,
        passengerIds.length,
      );
      if (beneficiaries <= 0) {
        beneficiaries = Math.min(
          capacity,
          Math.max(1, remainingBeneficiaries || 1),
        );
        adultBeneficiaries = Math.min(beneficiaries, remainingAdults);
        convertedChildBeneficiaries = Math.min(
          Math.max(0, beneficiaries - adultBeneficiaries),
          remainingConverted,
        );
      }

      remainingAdults = Math.max(0, remainingAdults - adultBeneficiaries);
      remainingConverted = Math.max(
        0,
        remainingConverted - convertedChildBeneficiaries,
      );
      remainingBeneficiaries = Math.max(
        0,
        remainingBeneficiaries - beneficiaries,
      );

      roomCounters[roomKey] = (roomCounters[roomKey] || 0) + 1;
      const roomIndex = roomCounters[roomKey];
      const sameTypeCount = activeRooms
        .filter(
          (candidate) =>
            canonicalRoomKey(candidate?.key, candidate?.label) === roomKey,
        )
        .reduce((sum, candidate) => sum + candidate.count, 0);
      const label =
        sameTypeCount > 1 ? `${room.label} ${roomIndex}` : room.label;
      const hasIgv = Boolean(referenceDistribution?.hasIgv);
      const roomBaseUnit = roundMoney(n(room?.unit));
      const roomIgvAmount = hasIgv
        ? roundMoney(roomBaseUnit * 0.18)
        : 0;
      const roomUnitWithIgv = roundMoney(roomBaseUnit + roomIgvAmount);
      const hotelTotalRoom = roundMoney(roomUnitWithIgv * nights);
      const hotelPerPerson = roundMoney(
        hotelTotalRoom / Math.max(1, beneficiaries),
      );
      const base = roundMoney(nonHotelsTotal + hotelPerPerson);
      const adicionales = roundMoney(
        computeAdicionales(additionalCfg, base, "adult"),
      );
      const totalPerPerson = roundMoney(base + adicionales);
      const convertedChildBase = roundMoney(
        childServicePerPerson + hotelPerPerson,
      );
      const convertedChildAdicionales =
        convertedChildBeneficiaries > 0 &&
        shouldApplyAdditionalToChildren(additionalCfg)
          ? roundMoney(
              computeAdicionales(
                additionalCfg,
                convertedChildBase,
                "child",
              ),
            )
          : 0;

      const roomDetails = [
        {
          roomId: `${room.key}:${roomIndex}`,
          id_habitacion: room?.id_habitacion ?? null,
          label,
          capacity,
          passengerIds,
          adultPassengerIds,
          convertedChildPassengerIds,
          hasIgv,
          tieneIgv: hasIgv,
          igvRate: hasIgv ? 18 : 0,
          igvAmount: roomIgvAmount,
          baseUnit: roomBaseUnit,
          unit: roomUnitWithIgv,
          unitWithIgv: roomUnitWithIgv,
          hotelTotalRoom,
        },
      ];

      return {
        key: `${room.key}:${roomIndex}`,
        roomKey: room.key,
        sourceRoomKey: room.key,
        label,
        baseLabel: room.label,
        capacity,
        roomCount: 1,
        beneficiaries,
        adultBeneficiaries,
        convertedChildBeneficiaries,
        passengerIds,
        adultPassengerIds,
        convertedChildPassengerIds,
        roomDetails,
        hotelPerNight: roomUnitWithIgv,
        hotelTotalRoom,
        hotelPerPerson,
        hasIgv,
        tieneIgv: hasIgv,
        igvRate: hasIgv ? 18 : 0,
        igvPerPerson: roundMoney(
          (roomIgvAmount * nights) / Math.max(1, beneficiaries),
        ),
        convertedChildHotelPerPerson: hotelPerPerson,
        convertedChildTotalPerPerson:
          convertedChildBeneficiaries > 0 ? convertedChildBase : 0,
        convertedChildDisplayTotalPerPerson:
          convertedChildBeneficiaries > 0 ? convertedChildBase : 0,
        convertedChildBasePerPerson: convertedChildBase,
        convertedChildServicePerPerson: childServicePerPerson,
        convertedChildAdicionales,
        convertedChildAdditionalApplied:
          convertedChildBeneficiaries > 0 && convertedChildAdicionales > 0,
        base,
        adicionales,
        totalPerPerson,
        displayTotalPerPerson: roundMoney(
          totalPerPerson + n(externalAdultTotal),
        ),
        convertedChildFinalPerPerson:
          convertedChildBeneficiaries > 0
            ? roundMoney(
                convertedChildBase +
                  convertedChildAdicionales +
                  externalUnifiedChildTotal,
              )
            : 0,
      };
    });
  });
};

const recomputeSingleGroupAlternativeHotelRow = (
  row = {},
  {
    adults = 1,
    children = 0,
    externalAdultTotal = 0,
    externalChildTotal = 0,
    externalConvertedChildTotal = 0,
  } = {},
) => {
  if (!shouldRecomputeSingleGroupAlternativeRow(row)) return row;

  const repricedRooms = Array.isArray(row?.perRoomPricing)
    ? row.perRoomPricing
    : [];
  const perNightFromRooms = repricedRooms.reduce(
    (sum, room) => sum + n(room?.hotelPerNight),
    0,
  );
  const perNightFromBreakdown = getAlternativeRoomBreakdown(row).reduce(
    (sum, room) => sum + n(room?.unit) * Math.max(0, n(room?.count)),
    0,
  );
  const perNightSum = roundMoney(
    perNightFromRooms || perNightFromBreakdown,
  );

  // A category can be fully quotable even when its hotel tariff is zero
  // (for example a promotional 5-star row). In that case the per-person
  // amount still contains services, fees and external items, so keep the
  // reconstructed room distribution and recompute the row instead of falling
  // back to the stale persisted snapshot.
  if (perNightSum <= 0 && repricedRooms.length === 0) return row;

  const nights = Math.max(1, n(row?.nights) || 1);
  const convertedChildCount = Math.max(
    0,
    n(row?.convertedChildCount) || n(row?.hotelConvertedChildCount),
  );
  const adultEquivalentCount = Math.max(
    1,
    n(row?.adultEquivalentCount) || n(adults) + convertedChildCount || 1,
  );
  const hotelTotalFromRooms = repricedRooms.reduce(
    (sum, room) => sum + n(room?.hotelTotalRoom),
    0,
  );
  const hotelTotal = roundMoney(
    hotelTotalFromRooms || perNightSum * nights,
  );
  const hotelPerAdult = roundMoney(hotelTotal / adultEquivalentCount);
  const nonHotelsTotal = n(row?.nonHotelsTotal);
  const basePerAdult = roundMoney(nonHotelsTotal + hotelPerAdult);
  const adicionales = roundMoney(
    computeAdicionales(row?.additionalCfg, basePerAdult),
  );
  const totalPerAdult = roundMoney(
    basePerAdult + adicionales + n(externalAdultTotal),
  );

  const childCount = Math.max(0, n(children));
  const childServiceTotal =
    sumAmountMap(row?.baseExplicitChildTotalsById) +
    sumAmountMap(row?.baseConvertedChildTotalsById) ||
    n(row?.baseExplicitChildTotal) + n(row?.baseConvertedChildTotal);
  const childServicePerPerson = childCount > 0 ? roundMoney(childServiceTotal / childCount) : 0;
  const convertedRoomRows = repricedRooms.filter(
    (room) => n(room?.convertedChildBeneficiaries) > 0,
  );
  const convertedRoomBeneficiaries = convertedRoomRows.reduce(
    (sum, room) => sum + Math.max(0, n(room?.convertedChildBeneficiaries)),
    0,
  );
  const convertedHotelPerChild =
    convertedRoomBeneficiaries > 0
      ? roundMoney(
          convertedRoomRows.reduce(
            (sum, room) =>
              sum +
              n(
                room?.convertedChildHotelPerPerson ?? room?.hotelPerPerson,
              ) * Math.max(0, n(room?.convertedChildBeneficiaries)),
            0,
          ) / convertedRoomBeneficiaries,
        )
      : 0;
  const explicitHotelChildCount = getExplicitHotelChildCount(row, {
    children: childCount,
  });
  const explicitHotelChildTotal = roundMoney(
    sumAmountMap(row?.hotelExplicitChildTotalsById) ||
      n(row?.hotelExplicitChildTotal ?? row?.hotelChildTotal),
  );
  const explicitHotelPerChild =
    explicitHotelChildCount > 0 && explicitHotelChildTotal > 0
      ? roundMoney(explicitHotelChildTotal / explicitHotelChildCount)
      : 0;
  // Las categorías alternativas solo deben agregar hotel a los niños que
  // realmente ocupan una habitación. Antes se prorrateaba el hotel completo
  // entre todos los pasajeros, haciendo que niños "sin hotel" aparecieran en
  // la columna de habitación con una tarifa distinta en cada categoría.
  const fallbackHotelPerChild =
    convertedRoomBeneficiaries > 0
      ? convertedHotelPerChild
      : explicitHotelPerChild;
  const basePerChild = roundMoney(childServicePerPerson + fallbackHotelPerChild);
  const childAdditional =
    childCount > 0 && basePerChild > 0 && shouldApplyAdditionalToChildren(row?.additionalCfg)
      ? roundMoney(computeAdicionales(row?.additionalCfg, basePerChild, "child"))
      : 0;
  const repricedConvertedChildTotal = convertedRoomRows.reduce(
    (sum, room) =>
      sum +
      n(room?.convertedChildFinalPerPerson) *
        Math.max(0, n(room?.convertedChildBeneficiaries)),
    0,
  );
  const totalPerChild =
    convertedRoomBeneficiaries > 0 && repricedConvertedChildTotal > 0
      ? roundMoney(
          repricedConvertedChildTotal / convertedRoomBeneficiaries,
        )
      : childCount > 0 &&
          (basePerChild > 0 ||
            n(externalChildTotal) > 0 ||
            n(externalConvertedChildTotal) > 0)
        ? roundMoney(
            basePerChild +
              childAdditional +
              n(externalChildTotal) +
              n(externalConvertedChildTotal),
          )
        : n(row?.totalPerChild);

  const repricedConvertedChildCount = Math.max(
    0,
    convertedRoomBeneficiaries,
    convertedChildCount,
  );

  return {
    ...row,
    hotelTotal,
    perNightSum: roundMoney(perNightSum),
    hotelPerAdult,
    basePerAdult,
    adicionales,
    totalPerAdult,
    totalPerChild,
    totalPerChildIsPerPerson: true,
    convertedChildCount: repricedConvertedChildCount,
    hotelConvertedChildCount: repricedConvertedChildCount,
    adultEquivalentCount: Math.max(
      1,
      n(adults) + repricedConvertedChildCount,
    ),
    pricingEngineVersion: row?.pricingEngineVersion || 1,
    exportPreviewRecomputed: true,
  };
};

const normalizeSingleGroupAlternativeRowsForPreview = (
  rows = [],
  context = {},
) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const selectedCat = context?.selectedCat;
  const hotelRows = safeRows.filter(
    (row) => row && !row?.noHotel && !isNoHotelPreviewCategory(row?.category),
  );
  if (hotelRows.length <= 1) return safeRows;

  const hasSeveralGroups = hotelRows.some((row) => {
    const groupIdentityCount = new Set(
      (Array.isArray(row?.perRoomPricing) ? row.perRoomPricing : [])
        .map((room, index) =>
          getExportPricingGroupIdentity(room, index, { includeFallback: false }),
        )
        .filter(Boolean),
    ).size;
    return groupIdentityCount > 1;
  });
  if (hasSeveralGroups) return safeRows;

  const normalizedSelectedCategory = normalizeText(selectedCat);
  const selectedRow =
    safeRows.find((row) => row?.isSelected || row?.selected) ||
    safeRows.find(
      (row) =>
        normalizedSelectedCategory &&
        normalizeText(row?.category) === normalizedSelectedCategory,
    ) ||
    null;

  return safeRows.map((row) => {
    if (!shouldRecomputeSingleGroupAlternativeRow(row, selectedCat)) {
      return row;
    }

    const perRoomPricing = buildAlternativeCategoryPerRoomPricing(
      row,
      selectedRow,
      context,
    );
    return recomputeSingleGroupAlternativeHotelRow(
      {
        ...row,
        perRoomPricing:
          perRoomPricing.length > 0 ? perRoomPricing : row?.perRoomPricing,
      },
      context,
    );
  });
};

export function buildCotizacionPreviewHtml(opts) {
  const {
    titulo = "Cotización",
    days = [],
    fechaInicio = null,
    nights = 0,
    breakfasts = 0,
    packageType = "compartido",
    categoryRows: rawCategoryRows = [],
    peopleCount = { adults: 2, children: 0 },
    accommodationType = "doble o matrimonial",
    mealsIncluded = 0,
    selectedCat = null,
    selectedHotel = null,
    additionalCosts = null,
    previewCategories = null,
    externalAdultTotal = 0,
    externalChildTotal = 0,
    externalConvertedChildTotal = 0,
    dayTitles = [],
    noHotel = false,
    noHotelTotalPerAdult = 0,
    noHotelTotalPerChild = 0,
    noHotelBaseExplicitChildTotal = noHotelTotalPerChild,
    noHotelNonHotelsTotal = noHotelTotalPerAdult,
    noHotelAdditionalCfg = null,
    noHotelExplicitChildCount = null,
    noHotelConvertedChildTotal = 0,
    noHotelConvertedChildCount = 0,
    baseExplicitChildTotalsById = {},
    baseConvertedChildTotalsById = {},
  } = opts;

  const persistedNoHotelRows = (Array.isArray(rawCategoryRows)
    ? rawCategoryRows
    : []
  ).filter(
    (row) => row?.noHotel || isNoHotelPreviewCategory(row?.category),
  );
  const inputCategoryRows = noHotel
    ? persistedNoHotelRows.length > 0
      ? persistedNoHotelRows
      : buildNoHotelPreviewCategoryRows({
          totalPerAdult: noHotelTotalPerAdult,
          totalPerChild: noHotelTotalPerChild,
          nonHotelsTotal: noHotelNonHotelsTotal,
          additionalCfg: noHotelAdditionalCfg,
          adultsCount: peopleCount?.adults,
          explicitChildrenCount:
            noHotelExplicitChildCount == null
              ? peopleCount?.children
              : noHotelExplicitChildCount,
          baseExplicitChildTotal: noHotelBaseExplicitChildTotal,
          convertedChildCount: noHotelConvertedChildCount,
          baseConvertedChildTotal: noHotelConvertedChildTotal,
          nonHotelConvertedChildTotal: noHotelConvertedChildTotal,
          baseExplicitChildTotalsById,
          baseConvertedChildTotalsById,
          externalAdultTotal,
        })
    : filterLuxuryHotelCategoryRows(rawCategoryRows, { category: selectedCat });

  const selectedHotelGroupEntries = resolveGroupedPreviewCategoryEntries(
    selectedHotel,
    inputCategoryRows,
  );
  const selectedHotelGroupCount = getSelectedHotelGroupCount(selectedHotel);
  const shouldForceGroupedHotelPreview = selectedHotelGroupCount > 1;
  const groupedInputCategoryRows = filterRowsToPreviewGroupCategories(
    inputCategoryRows,
    selectedHotelGroupEntries,
    shouldForceGroupedHotelPreview,
  );

  // When previewCategories is an array, filter to only show the selected categories.
  // In multi-group hotel quotations, the Excel preview must keep the real group
  // categories together; otherwise it renders all tariff alternatives as if they
  // were selected hotels.
  const effectivePreviewCategories = shouldForceGroupedHotelPreview
    ? selectedHotelGroupEntries.map((entry) => entry.key).filter(Boolean)
    : previewCategories;

  const filteredCategoryRows = (() => {
    if (
      !Array.isArray(effectivePreviewCategories) ||
      effectivePreviewCategories.length === 0 ||
      groupedInputCategoryRows.length <= 1
    ) {
      return groupedInputCategoryRows;
    }
    const norm = (v) =>
      String(v ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");
    const selectedNorms = effectivePreviewCategories.map(norm);
    const filtered = groupedInputCategoryRows.filter((r) =>
      selectedNorms.includes(norm(r.category)),
    );
    return filtered.length > 0 ? filtered : groupedInputCategoryRows;
  })();
  const alignedCategoryRows = alignCategoryRowsToSelectedNights(
    filteredCategoryRows,
    selectedCat,
  );

  const adults = Math.max(1, n(peopleCount.adults) || 1);
  const children = Math.max(0, n(peopleCount.children));
  const categoryRows = normalizeSingleGroupAlternativeRowsForPreview(
    alignedCategoryRows,
    {
      selectedCat,
      selectedHotel,
      pricingParts:
        Array.isArray(opts?.pricingModel?.parts) &&
        opts.pricingModel.parts.length > 0
          ? opts.pricingModel.parts
          : Array.isArray(opts?.summaryVisibleParts)
            ? opts.summaryVisibleParts
            : [],
      adults,
      children,
      externalAdultTotal,
      externalChildTotal,
      externalConvertedChildTotal,
    },
  );
  const pax = Math.max(1, adults + children);
  const serviceLabel =
    packageType === "privado" ? "PRIVADO" : "GRUPAL - PRIVADO";
  const daysCount = days.length || 1;
  const nightsCount = nights || Math.max(1, daysCount - 1);
  const previewModel = buildCotizacionHotelPreviewModel({
    categoryRows,
    peopleCount,
    selectedCat,
    accommodationType,
    externalAdultTotal,
    externalChildTotal,
    externalConvertedChildTotal,
  });
  let priceColumns = previewModel.priceColumns;
  const isNoHotelPreview =
    categoryRows.length > 0 &&
    categoryRows.every(
      (row) => row?.noHotel || isNoHotelPreviewCategory(row?.category),
    );
  const hotelPricingGroupIdentities = new Set(
    categoryRows
      .flatMap((row) => (Array.isArray(row?.perRoomPricing) ? row.perRoomPricing : []))
      .map((room, index) =>
        getExportPricingGroupIdentity(room, index, { includeFallback: false }),
      )
      .filter(Boolean),
  );
  const hasGroupedHotelPricing =
    shouldForceGroupedHotelPreview || hotelPricingGroupIdentities.size > 1;
  const groupedHotelCategoryEntries = resolveGroupedPreviewCategoryEntries(
    selectedHotel,
    categoryRows,
  );
  const groupedHotelCategoryText = resolveGroupedPreviewHotelCategoryText(
    selectedHotel,
    categoryRows,
  );
  const groupedPreviewCategoryAttrs = buildGroupedPreviewCategoryAttrs(
    groupedHotelCategoryEntries,
  );
  const groupedPreviewPrimaryCategory =
    groupedHotelCategoryEntries[0]?.key || "grouped";
  const explicitSummaryParts =
    opts?.summaryVisibleParts ||
    opts?.visibleSummaryParts ||
    opts?.acSummaryParts ||
    [];
  // La fila seleccionada se recalcula con el mismo núcleo que alimenta
  // ac__summary-calc y pax-price-check. Las partes recibidas por props quedan
  // solo como respaldo para documentos antiguos o vistas sin perRoomPricing.
  const selectedCategoryRowForPricing =
    categoryRows.find((row) => row?.isSelected || row?.selected) ||
    categoryRows.find(
      (row) =>
        selectedCat &&
        normalizeText(row?.category) === normalizeText(selectedCat),
    ) ||
    categoryRows[0] ||
    {};
  const selectedCategoryPricingModel = buildCanonicalCategoryPricingModel(
    selectedCategoryRowForPricing,
    peopleCount,
    externalAdultTotal,
    externalChildTotal,
    externalConvertedChildTotal,
  );
  const canonicalSummaryParts = selectedCategoryPricingModel?.parts || [];
  const selectedPerRoomPricing = Array.isArray(
    selectedCategoryRowForPricing?.perRoomPricing,
  )
    ? selectedCategoryRowForPricing.perRoomPricing
    : [];
  const suppliedPricingModel =
    opts?.pricingModel && Array.isArray(opts.pricingModel?.parts)
      ? opts.pricingModel
      : null;
  const liveCotizacionPricingModel = suppliedPricingModel || (opts?.cotizacion
    ? buildSummaryPricingCore(
        {
          ...opts.cotizacion,
          peopleCount:
            opts.cotizacion.peopleCount ||
            opts.cotizacion.peoplecount ||
            peopleCount,
          selectedHotel:
            opts.selectedHotel ||
            opts.cotizacion.selectedHotel ||
            opts.cotizacion.selected_hotel ||
            null,
          additionalCosts:
            opts.additionalCosts ||
            opts.cotizacion.additionalCosts ||
            opts.cotizacion.additionalcosts ||
            {},
          additionalcosts:
            opts.additionalCosts ||
            opts.cotizacion.additionalcosts ||
            opts.cotizacion.additionalCosts ||
            {},
          perRoomPricing:
            selectedPerRoomPricing.length > 0
              ? selectedPerRoomPricing
              : opts.cotizacion.perRoomPricing || [],
          subtotalIndividual:
            opts.cotizacion.subtotalIndividual ??
            opts.cotizacion.subtotal_individual ??
            opts.cotizacion.nonHotelsTotal ??
            selectedCategoryRowForPricing?.nonHotelsTotal ??
            selectedCategoryRowForPricing?.nonHotelsUnitTotal ??
            selectedCategoryRowForPricing?.subtotalIndividual ??
            0,
          precio_it_ext_adulto:
            opts.cotizacion.precio_it_ext_adulto ??
            opts.cotizacion.precioItExtAdulto ??
            externalAdultTotal,
          precio_it_ext_ninos:
            opts.cotizacion.precio_it_ext_ninos ??
            opts.cotizacion.precioItExtNinos ??
            roundMoney(externalChildTotal + externalConvertedChildTotal),
        },
        {
          perRoomPricing:
            selectedPerRoomPricing.length > 0
              ? selectedPerRoomPricing
              : undefined,
        },
      )
    : null);
  const liveCotizacionSummaryParts =
    liveCotizacionPricingModel?.parts || [];
  // The caller (hotel pricing/PDF editor) can already provide the exact
  // live parts produced from the same hydrated cotización used by
  // SummaryContent.  Those parts must win over a category-row reconstruction,
  // because alternative grid rows do not preserve the full passenger/external
  // itinerary context of the selected quotation.
  const directSummaryParts = Array.isArray(explicitSummaryParts)
    ? explicitSummaryParts
    : [];
  const visibleSummaryPartsForPreview = resolveVisibleSummaryPartsFromAdditionalCosts(
    opts?.additionalCosts || {},
    directSummaryParts.length > 0
      ? directSummaryParts
      : liveCotizacionSummaryParts.length > 0
        ? liveCotizacionSummaryParts
        : canonicalSummaryParts,
  );
  // Las columnas también deben salir del mismo modelo visible. Antes se
  // derivaban únicamente de categoryRows; si esa fila histórica conservaba
  // solo Triple, Doble/Matrimonial desaparecía aunque ac__summary-calc la
  // mostrara correctamente.
  priceColumns = mergePriceColumnsWithSummaryPricingParts(
    priceColumns,
    visibleSummaryPartsForPreview,
  );
  const previewWidth = Math.max(
    780,
    560 + priceColumns.length * ROOM_PRICE_COLUMN_WIDTH,
  );
  const resolvedAccommodationType = describeRoomColumns(
    priceColumns,
    previewModel.accommodationType || accommodationType,
  );
  const visibleAdultRoomSummaryMap = buildVisibleAdultRoomSummaryMap(
    visibleSummaryPartsForPreview,
  );
  const visibleChildRoomSummaryMap = buildVisibleChildRoomSummaryMap(
    visibleSummaryPartsForPreview,
  );
  const persistedChildRoomDistributionMap =
    buildPersistedChildRoomDistributionMap(categoryRows, selectedCat);
  const childRoomDistributionMap = mergeChildRoomDistributionMaps(
    persistedChildRoomDistributionMap,
    visibleChildRoomSummaryMap,
  );
  const groupedPreviewMatricesFromParts =
    hasGroupedHotelPricing
      ? buildGroupedPreviewMatricesFromVisibleParts(
          visibleSummaryPartsForPreview,
          priceColumns,
        )
      : null;
  const groupedPreviewMatricesFromHotel =
    hasGroupedHotelPricing
      ? buildGroupedPreviewMatricesFromCategoryRows({
          categoryRows,
          peopleCount,
          priceColumns,
          externalAdultTotal,
          externalChildTotal,
          externalConvertedChildTotal,
          selectedHotel,
          additionalCosts,
        })
      : null;
  const groupedPreviewMatrices = mergeGroupedPreviewMatrices(
    groupedPreviewMatricesFromParts,
    groupedPreviewMatricesFromHotel,
  );
  const shouldRenderGroupedPreviewRows = Boolean(
    hasGroupedHotelPricing &&
      groupedPreviewMatrices &&
      groupedPreviewMatrices.adultMatrix.some((column) => column.available),
  );

  const itinRows = days.map((day, idx) => {
    const ciudades = Array.isArray(day?.ciudades)
      ? day.ciudades.filter(Boolean).join(" / ")
      : "";

    const fecha = fechaInicio
      ? formatShortDate(addDaysToDate(fechaInicio, idx), "es-PE")
      : "";

    let hasFlight = false;
    (day?.servicios || []).forEach((s) => {
      const ts = (
        s?.parentService?.typeService ||
        s?.typeService ||
        ""
      ).toLowerCase();
      if (ts === "vuelos") hasFlight = true;
    });

    let tituloBase = resolvePreviewDayTitle(
      day,
      idx,
      ciudades,
      dayTitles,
    ).toUpperCase();
    if (hasFlight && !normalizeText(tituloBase).includes("vuelo")) {
      tituloBase += " | VUELO";
    }

    return {
      destino: (ciudades || "—").toUpperCase(),
      fecha,
      dia: `DÍA ${idx + 1}`,
      titulo: tituloBase,
    };
  });

  const groups = [];
  itinRows.forEach((row) => {
    const last = groups.length > 0 ? groups[groups.length - 1] : null;
    if (last && last.destino === row.destino) {
      last.count++;
    } else {
      groups.push({ destino: row.destino, count: 1 });
    }
  });

  const nochesLabel = `${String(nightsCount).padStart(
    2,
    "0",
  )} NOCHES + ${String(nightsCount).padStart(
    2,
    "0",
  )} DESAYUNOS O BOX BREAKFAST`;

  const fontStack = "Arial, Helvetica, sans-serif";
  const headerBg = "#d9ead3";
  const subHeaderBg = "#e2f0d9";
  const thBg = "#ffc000";
  const thColor = "#111111";
  const border = "#111111";
  const cellStyle =
    "border:2px solid " +
    border +
    ";padding:9px 8px;text-align:center;font-family:" +
    fontStack +
    ";";

  let html = `<div class="hpm-preview-html hpm-preview-html--quotation" data-hpm-preview-columns="${priceColumns.length}" style="width:${previewWidth}px;background:#fff;font-family:${fontStack};border:2px solid ${border};box-shadow:0 10px 30px rgba(0,0,0,0.05);overflow:hidden;">`;

  html += `<div class="hpm-preview-header" data-preview-block-id="header" style="background:${headerBg};color:#111;text-align:left;padding:8px 12px;font-size:14px;font-weight:900;letter-spacing:0.02em;border-bottom:2px solid ${border};">
 ${titulo.toUpperCase()} ${daysCount}D - ${String(nightsCount).padStart(2, "0")}N EN SERV. ${serviceLabel} DESDE <span style="color:#c00000;">${pax} PASAJEROS</span>
 </div>`;

  html += `<div class="hpm-preview-subheader" style="background:${subHeaderBg};color:#111;text-align:center;padding:7px 20px;font-size:12px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;border-bottom:2px solid ${border};">
 DESDE ${pax} PASAJEROS
 </div>`;

  html += `<table class="hpm-preview-itinerary" data-preview-block-id="main" style="width:100%;border-collapse:collapse;margin:0;">`;
  html += `<thead><tr>
 <th style="${cellStyle}background:${thBg};color:${thColor};font-size:11px;width:110px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;">N° NOCHES</th>
 <th style="${cellStyle}background:${thBg};color:${thColor};font-size:11px;width:150px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;">DESTINO</th>
 <th style="${cellStyle}background:${thBg};color:${thColor};font-size:11px;width:80px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;">FECHA</th>
 <th style="${cellStyle}background:${thBg};color:${thColor};font-size:11px;width:60px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;">DÍAS</th>
 <th style="${cellStyle}background:${thBg};color:${thColor};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;text-align:left;">ITINERARIO DE TOUR</th>
 </tr></thead>`;

  html += `<tbody>`;

  let groupIdx = 0;
  let groupRowCount = 0;

  itinRows.forEach((row, idx) => {
    html += `<tr>`;
    if (idx === 0) {
      html += `<td data-preview-column="noches" rowspan="${itinRows.length}" style="${cellStyle}background:#fff;color:#1e293b;font-size:13px;font-weight:800;vertical-align:middle;text-align:center;">
 ${nochesLabel}
 </td>`;
    }

    if (groupRowCount === 0) {
      const g = groups[groupIdx];
      html += `<td data-preview-column="destino" rowspan="${g.count}" style="${cellStyle}background:#fff;color:#475569;font-size:12px;font-weight:700;vertical-align:middle;">
 ${row.destino}
 </td>`;
      groupRowCount = g.count - 1;
      groupIdx++;
    } else {
      groupRowCount--;
    }

    html += `<td data-preview-column="fecha" style="${cellStyle}background:#fff;color:#1e293b;font-size:11px;font-weight:900;">${row.fecha}</td>`;
    html += `<td data-preview-column="dias" style="${cellStyle}background:#fff;color:#1e293b;font-size:12px;font-weight:800;">${row.dia}</td>`;
    html += `<td data-preview-column="titulo" style="${cellStyle}background:#fff;color:#1e293b;font-size:12px;text-align:left;line-height:1.4;">${row.titulo}</td>`;
    html += `</tr>`;
  });

  html += `</tbody></table>`;

  html += `<div class="hpm-preview-prices" data-preview-block-id="prices" style="width:100%;border-top:0;">`;

  html += `<div class="hpm-preview-price-header" data-preview-locked="true" style="display:grid;grid-template-columns:minmax(0,1fr) repeat(${priceColumns.length}, ${ROOM_PRICE_COLUMN_WIDTH}px);align-items:stretch;background:#fff;">`;
  html += `<div class="hpm-preview-price-header__spacer" style="min-height:44px;border-right:2px solid #111827;border-bottom:2px solid #111827;background:#fff;"></div>`;
  priceColumns.forEach((column) => {
    html += `<div class="hpm-preview-room-header hpm-preview-room-header--${column.key}" data-hpm-room-key="${column.key}" style="background:#ffff00;color:#111827;border-right:2px solid #111827;border-bottom:2px solid #111827;padding:12px 8px;text-align:center;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0.05em;">${column.headerLabel || column.label}</div>`;
  });
  html += `</div>`;

  if (shouldRenderGroupedPreviewRows) {
    const genericHotelLabel = ` + HOTEL ${escapePreviewHtml(groupedHotelCategoryText)}`;
    const adultLabel = `PRECIO POR ADULTO / TOTAL PQT + ENTRADAS${genericHotelLabel}:`;
    const childLabel = `PRECIO POR NIÑO / TOTAL PQT + ENTRADAS${genericHotelLabel}:`;
    const groupedAdultMatrix = groupedPreviewMatrices?.adultMatrix || [];
    const groupedChildMatrix = groupedPreviewMatrices?.childMatrix || [];
    const groupedPreviewAttrs = groupedPreviewCategoryAttrs
      ? ` ${groupedPreviewCategoryAttrs}`
      : "";

    html += `<div class="hpm-preview-price-row hpm-preview-price-row--adult hpm-preview-price-row--grouped" data-preview-price-row="${groupedPreviewPrimaryCategory}"${groupedPreviewAttrs} data-preview-price-kind="adult" data-preview-selected-row="true" style="display:grid;grid-template-columns:minmax(0,1fr) repeat(${priceColumns.length}, ${ROOM_PRICE_COLUMN_WIDTH}px);align-items:stretch;background:#ead1dc;color:#1e293b;border-bottom:2px solid #111827;">`;
    html += `<div class="hpm-preview-price-label" data-preview-editable-block="true" data-preview-block-id="price-label-grouped-adult" style="padding:12px 20px;font-size:11px;font-weight:800;text-align:left;border-right:2px solid #111827;line-height:1.2;">${adultLabel}</div>`;
    groupedAdultMatrix.forEach((column) => {
      html += renderPriceValueCell(
        { category: "grouped", isSelected: true },
        column,
        "adult",
        "#1e293b",
      );
    });
    html += `</div>`;

    if (groupedChildMatrix.some((column) => column.available)) {
      html += `<div class="hpm-preview-price-row hpm-preview-price-row--child hpm-preview-price-row--grouped" data-preview-price-row="${groupedPreviewPrimaryCategory}-child"${groupedPreviewAttrs} style="display:grid;grid-template-columns:minmax(0,1fr) repeat(${priceColumns.length}, ${ROOM_PRICE_COLUMN_WIDTH}px);align-items:stretch;background:#fff;color:#475569;border-bottom:2px solid #111827;">`;
      html += `<div class="hpm-preview-price-label hpm-preview-price-label--child" data-preview-editable-block="true" data-preview-block-id="price-label-grouped-child" style="padding:10px 20px;font-size:10px;font-weight:700;text-align:left;border-right:2px solid #111827;font-style:italic;">${childLabel}</div>`;
      groupedChildMatrix.forEach((column) => {
        html += renderPriceValueCell(
          { category: "grouped" },
          column,
          "child",
          "#64748b",
        );
      });
      html += `</div>`;
    }
  } else {
    categoryRows.forEach((cat, index) => {
      const priceRowBgs = ["#ead1dc", "#d9d2e9", "#cfe2f3", "#fff2cc", "#e2f0d9"];
      let bg = priceRowBgs[index % priceRowBgs.length];

      const rowLabel = resolvePreviewCategoryLabel(cat.category, cat.label);
      const hotelLabel =
        cat?.noHotel || isNoHotelPreviewCategory(cat?.category)
          ? " SIN HOTEL"
          : ` + HOTEL ${rowLabel}`;
      const adultLabel = `PRECIO POR ADULTO / TOTAL PQT + ENTRADAS${hotelLabel}:`;
      const childLabel = `PRECIO POR NIÑO / TOTAL PQT + ENTRADAS${hotelLabel}:`;

      const computedMatrix = buildRoomPriceMatrix(
        cat,
        peopleCount,
        priceColumns,
        externalAdultTotal,
      );
      const isSelectedPriceRow =
        cat?.isSelected ||
        cat?.selected ||
        (selectedCat &&
          normalizeText(cat?.category) === normalizeText(selectedCat));
      const matrix = isSelectedPriceRow
        ? applyVisibleSummaryToSelectedRoomMatrix(
            computedMatrix,
            visibleAdultRoomSummaryMap,
          )
        : computedMatrix;
      const childPlacementMatrix = applyVisibleChildDistributionToRoomMatrix(
        matrix,
        childRoomDistributionMap,
      );
      const computedChildMatrix = buildChildPriceMatrix(
        cat,
        childPlacementMatrix,
        peopleCount,
        externalChildTotal,
        externalConvertedChildTotal,
      );
      const childMatrix = isSelectedPriceRow
        ? applyVisibleChildSummaryToSelectedRoomMatrix(
            computedChildMatrix,
            visibleChildRoomSummaryMap,
          )
        : computedChildMatrix;

      html += `<div class="hpm-preview-price-row hpm-preview-price-row--adult hpm-preview-price-row--cat-${cat.category}${cat.isSelected ? " hpm-preview-price-row--selected" : ""}" data-preview-price-row="${cat.category}" data-preview-price-kind="adult" data-preview-selected-row="${cat.isSelected ? "true" : "false"}" style="display:grid;grid-template-columns:minmax(0,1fr) repeat(${priceColumns.length}, ${ROOM_PRICE_COLUMN_WIDTH}px);align-items:stretch;background:${bg};color:#1e293b;border-bottom:2px solid #111827;">`;
      html += `<div class="hpm-preview-price-label" data-preview-editable-block="true" data-preview-block-id="price-label-${cat.category}" style="padding:12px 20px;font-size:11px;font-weight:800;text-align:left;border-right:2px solid #111827;line-height:1.2;">${adultLabel}</div>`;
      matrix.forEach((column) => {
        html += renderPriceValueCell(cat, column, "adult", "#1e293b");
      });
      html += `</div>`;

      if (childMatrix.length > 0) {
        html += `<div class="hpm-preview-price-row hpm-preview-price-row--child hpm-preview-price-row--cat-${cat.category}" data-preview-price-row="${cat.category}-child" style="display:grid;grid-template-columns:minmax(0,1fr) repeat(${priceColumns.length}, ${ROOM_PRICE_COLUMN_WIDTH}px);align-items:stretch;background:#fff;color:#475569;border-bottom:2px solid #111827;">`;
        html += `<div class="hpm-preview-price-label hpm-preview-price-label--child" data-preview-editable-block="true" data-preview-block-id="price-label-${cat.category}-child" style="padding:10px 20px;font-size:10px;font-weight:700;text-align:left;border-right:2px solid #111827;font-style:italic;">${childLabel}</div>`;
        childMatrix.forEach((column) => {
          html += renderPriceValueCell(cat, column, "child", "#64748b");
        });
        html += `</div>`;
      }
    });
  }
  html += `</div>`;

  const notaText = isNoHotelPreview
    ? "NOTA: Cotización sin hotel asignado."
    : `NOTA: ${String(breakfasts || nightsCount).padStart(2, "0")} desayunos en hotel elegido${mealsIncluded > 0 ? ` + ${mealsIncluded} ALMUERZO TIPO BUFFET` : ""}. // Tipo de acomodación en ${resolvedAccommodationType}.`;

  html += `<div class="hpm-preview-note" data-preview-editable-block="true" data-preview-block-id="note" style="background:#7f7f7f;color:#ffff00;padding:10px 12px;font-size:12px;font-style:italic;font-weight:900;border-top:2px solid #111;line-height:1.35;">
 ${notaText}
 </div>`;

  html += `</div>`;
  return html;
}
