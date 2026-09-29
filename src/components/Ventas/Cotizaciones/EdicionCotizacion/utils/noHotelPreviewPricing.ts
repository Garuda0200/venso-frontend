const n = (value) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value) =>
  Math.round((n(value) + Number.EPSILON) * 100) / 100;

const mapTotal = (value = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  return round2(
    Object.values(value).reduce((sum, amount) => sum + n(amount), 0),
  );
};

/**
 * Resolves the live child service base used by the no-hotel JPG preview.
 *
 * During quote creation, freshly selected services can already expose the
 * correct aggregate `subtotalninos` while their per-beneficiary child maps are
 * still being normalised. AdditionalCosts correctly prices from that aggregate,
 * so the export must use it as the fallback source instead of rendering `—`.
 *
 * Persisted/itemised totals remain preferred whenever available.
 */
export const resolveNoHotelPreviewChildBreakdown = ({
  childrenCount = 0,
  subtotalNinos = 0,
  hotelChildTotal = 0,
  nonHotelExplicitChildTotal = 0,
  nonHotelConvertedChildTotal = 0,
  baseExplicitChildCount = 0,
  baseConvertedChildCount = 0,
  nonHotelExplicitChildTotalsById = {},
  nonHotelConvertedChildTotalsById = {},
} = {}) => {
  const children = Math.max(0, Math.floor(n(childrenCount)));
  const explicitMapTotal = mapTotal(nonHotelExplicitChildTotalsById);
  const convertedMapTotal = mapTotal(nonHotelConvertedChildTotalsById);
  const explicitDirect = Math.max(
    0,
    explicitMapTotal || n(nonHotelExplicitChildTotal),
  );
  const convertedDirect = Math.max(
    0,
    convertedMapTotal || n(nonHotelConvertedChildTotal),
  );
  const itemizedTotal = round2(explicitDirect + convertedDirect);
  const liveNonHotelChildSubtotal = Math.max(
    0,
    round2(n(subtotalNinos) - n(hotelChildTotal)),
  );

  let explicitTotal = explicitDirect;
  let convertedTotal = convertedDirect;
  let explicitCount = Math.max(0, Math.floor(n(baseExplicitChildCount)));
  let convertedCount = Math.max(0, Math.floor(n(baseConvertedChildCount)));
  let usedAggregateFallback = false;

  if (
    children > 0 &&
    itemizedTotal > 0 &&
    liveNonHotelChildSubtotal > 0 &&
    Math.abs(itemizedTotal - liveNonHotelChildSubtotal) > 0.01
  ) {
    // The aggregate produced by DaysEditor is the live commercial truth. A
    // just-added ServicePicker row may have only part of its child ID maps
    // materialised yet. Preserve the known explicit/converted proportion but
    // reconcile the amount to the aggregate instead of exporting a partial row.
    const ratio = liveNonHotelChildSubtotal / itemizedTotal;
    explicitTotal = round2(explicitDirect * ratio);
    convertedTotal = round2(liveNonHotelChildSubtotal - explicitTotal);
    usedAggregateFallback = true;
  }

  if (children > 0 && itemizedTotal <= 0 && liveNonHotelChildSubtotal > 0) {
    usedAggregateFallback = true;
    const knownCount = explicitCount + convertedCount;

    if (knownCount > 0) {
      if (explicitCount > 0 && convertedCount > 0) {
        explicitTotal = round2(
          liveNonHotelChildSubtotal * (explicitCount / knownCount),
        );
        convertedTotal = round2(liveNonHotelChildSubtotal - explicitTotal);
      } else if (convertedCount > 0) {
        convertedTotal = liveNonHotelChildSubtotal;
      } else {
        explicitTotal = liveNonHotelChildSubtotal;
      }
    } else {
      // We only need one unified child row for the no-hotel preview. Treat the
      // aggregate as explicit until the richer per-beneficiary breakdown is
      // available; this does not mutate the service or persisted pricing mode.
      explicitTotal = liveNonHotelChildSubtotal;
      explicitCount = children;
    }
  }

  if (children <= 0) {
    return {
      children: 0,
      explicitTotal: 0,
      convertedTotal: 0,
      explicitCount: 0,
      convertedCount: 0,
      unifiedBaseTotal: 0,
      usedAggregateFallback: false,
    };
  }

  explicitCount = Math.min(children, explicitCount);
  convertedCount = Math.min(children, convertedCount);

  if (explicitTotal > 0 && explicitCount === 0 && convertedTotal <= 0) {
    explicitCount = children;
  }
  if (convertedTotal > 0 && convertedCount === 0 && explicitTotal <= 0) {
    convertedCount = children;
  }

  return {
    children,
    explicitTotal: round2(explicitTotal),
    convertedTotal: round2(convertedTotal),
    explicitCount,
    convertedCount,
    unifiedBaseTotal: round2(explicitTotal + convertedTotal),
    usedAggregateFallback,
  };
};
