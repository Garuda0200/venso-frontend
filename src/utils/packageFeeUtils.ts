export const DEFAULT_VENSO_FEE_PERCENT = 25;
export const STANDARD_VENSO_FEE_OPTIONS = [25, 30, 35, 40, 45];

const roundPercent = (value: unknown) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export const normalizeNullablePackageFee = (value: unknown): number | null => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const numeric = Number.parseFloat(String(value));
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return null;
  return roundPercent(numeric);
};

export const resolveImportedPackageFee = (
  value: unknown,
  fallback = DEFAULT_VENSO_FEE_PERCENT,
) => normalizeNullablePackageFee(value) ?? fallback;

export const buildImportedPackageFeeState = (
  current: Record<string, any> = {},
  packageFee: unknown,
) => {
  const fee = resolveImportedPackageFee(packageFee);
  return {
    ...current,
    fee: String(fee),
    feeVal: String(fee),
    feeMode: "percentage",
    childFee: String(fee),
    childFeeMode: "percentage",
    applyAdditionalCostsToChildren: true,
    applyOperationalCostsToChildren:
      current?.applyOperationalCostsToChildren ?? true,
    applyFeeToChildren: true,
    applyExtraFeeToChildren: current?.applyExtraFeeToChildren ?? true,
  };
};

export const buildVensoFeeSelectOptions = (currentFee: unknown): number[] => {
  const current = normalizeNullablePackageFee(currentFee);
  if (current === null || STANDARD_VENSO_FEE_OPTIONS.includes(current)) {
    return [...STANDARD_VENSO_FEE_OPTIONS];
  }
  return [...STANDARD_VENSO_FEE_OPTIONS, current];
};
