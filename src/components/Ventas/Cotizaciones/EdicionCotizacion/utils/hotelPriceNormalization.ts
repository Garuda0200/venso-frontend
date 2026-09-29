const HOTEL_IGV_MULTIPLIER = 1.18;

const toNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value) =>
  Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const approximatelyEqual = (left, right) => {
  const a = toNumber(left);
  const b = toNumber(right);
  if (a <= 0 || b <= 0) return false;

  const absoluteTolerance = 0.03;
  const relativeTolerance = Math.max(a, b) * 0.001;
  return Math.abs(a - b) <= Math.max(absoluteTolerance, relativeTolerance);
};

/**
 * Returns the catalog/base room price when a persisted value is exactly the
 * catalog price with IGV applied one or more times. This repairs quotations
 * saved by older frontend versions that wrote the tax-inclusive amount back
 * into precio_servicio and then applied IGV again on every edit/save cycle.
 *
 * Genuine manual prices are preserved unless they match the characteristic
 * 1.18^n inflation pattern of the catalog tariff.
 */
export const normalizeHotelBasePriceAgainstCatalog = (
  persistedPrice,
  catalogPrice,
) => {
  const persisted = round2(persistedPrice);
  const catalog = round2(catalogPrice);

  if (persisted <= 0) return catalog;
  if (catalog <= 0) return persisted;
  if (approximatelyEqual(persisted, catalog)) return catalog;

  let taxInflatedCatalog = catalog;
  for (let application = 1; application <= 4; application += 1) {
    taxInflatedCatalog = round2(taxInflatedCatalog * HOTEL_IGV_MULTIPLIER);
    if (approximatelyEqual(persisted, taxInflatedCatalog)) {
      return catalog;
    }
  }

  return persisted;
};

export const getHotelRuntimePriceWithIgv = (basePrice, hasIgv) => {
  const base = round2(basePrice);
  return hasIgv ? round2(base * HOTEL_IGV_MULTIPLIER) : base;
};

export const getHotelIgvAmount = (basePrice, hasIgv) => {
  const base = round2(basePrice);
  return hasIgv ? round2(getHotelRuntimePriceWithIgv(base, true) - base) : 0;
};

export const HOTEL_IGV_FACTOR = HOTEL_IGV_MULTIPLIER;
