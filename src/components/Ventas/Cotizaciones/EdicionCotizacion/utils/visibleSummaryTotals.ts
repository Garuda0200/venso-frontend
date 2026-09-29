const ensureNumber = (value) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value) =>
  Math.round((ensureNumber(value) + Number.EPSILON) * 100) / 100;

const ceilMoney = (value) => Math.ceil(ensureNumber(value));

const inferBeneficiaryCount = (part = {}) => {
  const direct =
    ensureNumber(part.beneficiaries) ||
    ensureNumber(part.beneficiaryCount) ||
    ensureNumber(part.count) ||
    ensureNumber(part.passengers) ||
    ensureNumber(part.pax);

  if (direct > 0) return Math.max(1, direct);

  const label = String(part.label || "");
  const match = label.match(/\((\d+)\)/);
  if (match) {
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return 1;
};

export const normalizeVisibleSummaryPart = (part = {}) => {
  const rawValue = ensureNumber(
    part.value ?? part.final ?? part.total ?? part.totalPerPerson,
  );
  const rawCommissionableValue = ensureNumber(
    part.commissionableValue ??
      part.subtotalValue ??
      part.baseWithoutExternal ??
      rawValue,
  );
  const beneficiaries = inferBeneficiaryCount(part);

  return {
    ...part,
    value: round2(rawValue),
    roundedValue: ceilMoney(rawValue),
    beneficiaries,
    lineTotal: ceilMoney(rawValue) * beneficiaries,
    commissionableValue: round2(rawCommissionableValue),
    commissionableRoundedValue: ceilMoney(rawCommissionableValue),
    commissionableLineTotal: ceilMoney(rawCommissionableValue) * beneficiaries,
  };
};

export const calculateVisibleSummaryGrandTotal = (parts = []) => {
  if (!Array.isArray(parts) || parts.length === 0) return 0;

  const total = parts.reduce((sum, part) => {
    const normalized = normalizeVisibleSummaryPart(part);
    if (normalized.roundedValue <= 0) return sum;
    return sum + normalized.lineTotal;
  }, 0);

  return round2(total);
};

export const calculateCommissionableSummaryGrandTotal = (parts = []) => {
  if (!Array.isArray(parts) || parts.length === 0) return 0;

  const total = parts.reduce((sum, part) => {
    const normalized = normalizeVisibleSummaryPart(part);
    if (normalized.commissionableRoundedValue <= 0) return sum;
    return sum + normalized.commissionableLineTotal;
  }, 0);

  return round2(total);
};

export const buildVisibleSummaryPayload = (parts = []) => {
  const normalizedParts = (Array.isArray(parts) ? parts : [])
    .map(normalizeVisibleSummaryPart)
    // Una parte con beneficiarios y valor cero también es información de
    // negocio: representa pasajeros explícitamente "sin precio". Se conserva
    // para que PDF no reconstruyan una tarifa mediante fallbacks.
    .filter((part) => part.roundedValue > 0 || part.beneficiaries > 0);
  const grandTotal = calculateVisibleSummaryGrandTotal(normalizedParts);
  const commissionableGrandTotal = calculateCommissionableSummaryGrandTotal(normalizedParts);

  return {
    parts: normalizedParts.map((part) => {
      const serializableMetadata = [
        "services",
        "hotel",
        "additional",
        "external",
        "audience",
        "kind",
        "type",
        "roomKey",
        "roomLabel",
        "category",
        "groupKey",
        "isChild",
        "isConvertedChild",
      ].reduce((metadata, key) => {
        if (["string", "number", "boolean"].includes(typeof part?.[key])) {
          metadata[key] = part[key];
        }
        return metadata;
      }, {});

      return {
        key: part.key,
        label: part.label,
        value: part.value,
        roundedValue: part.roundedValue,
        beneficiaries: part.beneficiaries,
        lineTotal: part.lineTotal,
        commissionableValue: part.commissionableValue,
        commissionableRoundedValue: part.commissionableRoundedValue,
        commissionableLineTotal: part.commissionableLineTotal,
        className: part.className,
        ...serializableMetadata,
      };
    }),
    grandTotal,
    commissionableGrandTotal,
  };
};

export const resolveVisibleSummaryTotalFromAdditionalCosts = (
  additionalCosts = {},
) => {
  const sources = [
    additionalCosts?.visibleSummaryGrandTotal,
    additionalCosts?.summaryVisibleGrandTotal,
    additionalCosts?.acSummaryGrandTotal,
    additionalCosts?.visible_summary_grand_total,
    additionalCosts?.summary_visible_grand_total,
    additionalCosts?.ac_summary_grand_total,
  ];

  for (const value of sources) {
    const parsed = ensureNumber(value);
    if (parsed > 0) return round2(parsed);
  }

  const parts =
    additionalCosts?.summaryVisibleParts ||
    additionalCosts?.visibleSummaryParts ||
    additionalCosts?.acSummaryParts ||
    additionalCosts?.summary_visible_parts ||
    additionalCosts?.visible_summary_parts ||
    [];

  return calculateVisibleSummaryGrandTotal(parts);
};

export const resolveAuthoritativeQuotationTotal = ({
  additionalCosts = {},
  visibleParts = [],
  previewTotal = 0,
  fallbackAdditionalTotal = 0,
  fallbackTotal = 0,
} = {}) => {
  const partsTotal = calculateVisibleSummaryGrandTotal(visibleParts);
  if (partsTotal > 0) return partsTotal;

  // Las partes visibles calculadas en memoria son la fuente canónica. Los
  // valores embebidos en additionalCosts se conservan solo como compatibilidad
  // durante la misma sesión y nunca son requisito para reconstruir la cotización.
  const storedVisibleTotal =
    resolveVisibleSummaryTotalFromAdditionalCosts(additionalCosts);
  if (storedVisibleTotal > 0) return storedVisibleTotal;

  const parsedPreviewTotal = ensureNumber(previewTotal);
  if (parsedPreviewTotal > 0) return round2(parsedPreviewTotal);

  const parsedAdditionalTotal = ensureNumber(fallbackAdditionalTotal);
  if (parsedAdditionalTotal > 0) return round2(parsedAdditionalTotal);

  const parsedFallbackTotal = ensureNumber(fallbackTotal);
  return parsedFallbackTotal > 0 ? round2(parsedFallbackTotal) : 0;
};


const parseVisibleSummaryPartsCandidate = (candidate) => {
  if (Array.isArray(candidate)) return candidate;
  if (typeof candidate !== "string" || !candidate.trim()) return [];

  try {
    const parsed = JSON.parse(candidate);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const resolveVisibleSummaryPartsFromAdditionalCosts = (
  additionalCosts = {},
  directParts = [],
) => {
  const candidates = [
    directParts,
    additionalCosts?.summaryVisibleParts,
    additionalCosts?.visibleSummaryParts,
    additionalCosts?.acSummaryParts,
    additionalCosts?.summary_visible_parts,
    additionalCosts?.visible_summary_parts,
    additionalCosts?.ac_summary_parts,
  ];
  const source = candidates
    .map(parseVisibleSummaryPartsCandidate)
    .find((candidate) => candidate.length > 0);
  return Array.isArray(source) ? source.map(normalizeVisibleSummaryPart) : [];
};

const inferPricingAudience = (part = {}) => {
  const text = `${part.key || ""} ${part.label || ""} ${part.className || ""} ${part.audience || ""}`
    .toLowerCase();
  if (part.isChild === true || /child|niñ|nino|menor/.test(text)) return "child";
  return "adult";
};

export const resolveQuotationPricingSnapshot = ({
  additionalCosts = {},
  visibleParts = [],
  previewTotal = 0,
  fallbackAdditionalTotal = 0,
  fallbackTotal = 0,
} = {}) => {
  const parts = resolveVisibleSummaryPartsFromAdditionalCosts(
    additionalCosts,
    visibleParts,
  );
  const grandTotal = resolveAuthoritativeQuotationTotal({
    additionalCosts,
    visibleParts: parts,
    previewTotal,
    fallbackAdditionalTotal,
    fallbackTotal,
  });
  const commissionableGrandTotal = calculateCommissionableSummaryGrandTotal(parts);
  const perPerson = parts.map((part) => ({
    ...part,
    audience: inferPricingAudience(part),
    displayValue: part.roundedValue,
  }));

  return {
    parts,
    perPerson,
    adults: perPerson.filter((part) => part.audience === "adult"),
    children: perPerson.filter((part) => part.audience === "child"),
    grandTotal,
    commissionableGrandTotal,
  };
};

export { ensureNumber as ensureVisibleNumber, round2 as roundVisible2 };
