const round2 = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const isPopulatedMap = (value) =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0,
  );

const sumMap = (value) =>
  round2(
    Object.values(isPopulatedMap(value) ? value : {}).reduce((sum, amount) => {
      const parsed = Number(amount);
      return Number.isFinite(parsed) ? sum + parsed : sum;
    }, 0),
  );

const normalizeChildrenCount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export const resolveCanonicalChildServicePrice = (...values) => {
  for (const value of values) {
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && !value.trim())
    ) {
      continue;
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return round2(parsed);
  }
  return null;
};

export const childServiceTotalMatchesCanonical = ({
  candidateTotal = 0,
  canonicalPerChild,
  childrenCount = 0,
} = {}) => {
  const canonicalValue = resolveCanonicalChildServicePrice(canonicalPerChild);
  if (canonicalValue === null) return false;

  const count = normalizeChildrenCount(childrenCount);
  const canonicalTotal = round2(canonicalValue * count);
  const toleranceCents = Math.max(1, Math.ceil(count / 2));
  return (
    Math.abs(
      Math.round(Number(candidateTotal || 0) * 100) -
        Math.round(canonicalTotal * 100),
    ) <= toleranceCents
  );
};

const buildMapCandidate = (explicitTotalsById, convertedTotalsById) => {
  const hasExplicit = isPopulatedMap(explicitTotalsById);
  const hasConverted = isPopulatedMap(convertedTotalsById);
  if (!hasExplicit && !hasConverted) return null;

  const explicitTotal = sumMap(explicitTotalsById);
  const convertedTotal = sumMap(convertedTotalsById);
  return {
    explicitTotalsById: hasExplicit ? explicitTotalsById : {},
    convertedTotalsById: hasConverted ? convertedTotalsById : {},
    explicitTotal,
    convertedTotal,
    total: round2(explicitTotal + convertedTotal),
  };
};

const allocateCanonicalTotal = ({
  canonicalTotal,
  explicitChildCount,
  convertedChildCount,
}) => {
  const explicitCount = normalizeChildrenCount(explicitChildCount);
  const convertedCount = normalizeChildrenCount(convertedChildCount);
  const classifiedCount = explicitCount + convertedCount;
  const explicitShare =
    classifiedCount > 0 ? explicitCount / classifiedCount : 1;
  const explicitTotal = round2(canonicalTotal * explicitShare);

  return {
    explicitTotal,
    convertedTotal: round2(canonicalTotal - explicitTotal),
  };
};

/**
 * Concilia los mapas infantiles derivados del itinerario con el precio
 * canónico persistido. Si los mapas no suman el mismo total, se eliminan para
 * que el núcleo compartido use el precio canónico por niño.
 */
export const reconcileCanonicalChildServicePricing = ({
  canonicalPerChild,
  childrenCount = 0,
  hydratedExplicitTotalsById = {},
  hydratedConvertedTotalsById = {},
  persistedExplicitTotalsById = {},
  persistedConvertedTotalsById = {},
  fallbackExplicitTotal = 0,
  fallbackConvertedTotal = 0,
  explicitChildCount = 0,
  convertedChildCount = 0,
} = {}) => {
  const canonicalValue = resolveCanonicalChildServicePrice(canonicalPerChild);
  const hasCanonical = canonicalValue !== null;
  const resolvedChildrenCount = normalizeChildrenCount(childrenCount);
  const canonicalTotal = hasCanonical
    ? round2(canonicalValue * resolvedChildrenCount)
    : null;
  const candidates = [
    buildMapCandidate(
      hydratedExplicitTotalsById,
      hydratedConvertedTotalsById,
    ),
    buildMapCandidate(
      persistedExplicitTotalsById,
      persistedConvertedTotalsById,
    ),
  ].filter(Boolean);
  const selectedCandidate = hasCanonical
    ? candidates.find((candidate) =>
        childServiceTotalMatchesCanonical({
          candidateTotal: candidate.total,
          canonicalPerChild: canonicalValue,
          childrenCount: resolvedChildrenCount,
        }),
      ) || null
    : candidates[0] || null;

  if (selectedCandidate) {
    const fallbackPerChild = hasCanonical
      ? canonicalValue
      : resolvedChildrenCount > 0
        ? round2(selectedCandidate.total / resolvedChildrenCount)
        : 0;
    return {
      hasCanonical,
      fallbackPerChild,
      explicitTotal: selectedCandidate.explicitTotal,
      convertedTotal: selectedCandidate.convertedTotal,
      total: selectedCandidate.total,
      explicitTotalsById: selectedCandidate.explicitTotalsById,
      convertedTotalsById: selectedCandidate.convertedTotalsById,
    };
  }

  if (hasCanonical) {
    const allocation = allocateCanonicalTotal({
      canonicalTotal,
      explicitChildCount,
      convertedChildCount,
    });
    return {
      hasCanonical: true,
      fallbackPerChild: canonicalValue,
      explicitTotal: allocation.explicitTotal,
      convertedTotal: allocation.convertedTotal,
      total: canonicalTotal,
      explicitTotalsById: {},
      convertedTotalsById: {},
    };
  }

  const explicitTotal = round2(fallbackExplicitTotal);
  const convertedTotal = round2(fallbackConvertedTotal);
  const total = round2(explicitTotal + convertedTotal);
  return {
    hasCanonical: false,
    fallbackPerChild:
      resolvedChildrenCount > 0 ? round2(total / resolvedChildrenCount) : 0,
    explicitTotal,
    convertedTotal,
    total,
    explicitTotalsById: {},
    convertedTotalsById: {},
  };
};

export default reconcileCanonicalChildServicePricing;
