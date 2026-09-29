export const COMMISSION_RATES = [
  { fee: 25, rate: 1.2 },
  { fee: 30, rate: 1.4 },
  { fee: 35, rate: 1.6 },
  { fee: 40, rate: 1.7 },
  { fee: 45, rate: 1.8 },
];

export const COMMISSION_TIERS = [
  { total: 15000, condition: "Meta mínima" },
  { total: 20000, condition: "Buen desempeño" },
  { total: 25000, condition: "Buen desempeño" },
  { total: 30000, condition: "Buen desempeño" },
  { total: 35000, condition: "Buen desempeño" },
  { total: 40000, condition: "Alto rendimiento" },
  { total: 45000, condition: "Alto rendimiento" },
  { total: 50000, condition: "Alto rendimiento" },
  { total: 55000, condition: "Alto rendimiento" },
  { total: 60000, condition: "Alto rendimiento" },
  { total: 70000, condition: "Alto rendimiento" },
  { total: 75000, condition: "Alto rendimiento" },
  { total: 80000, condition: "Alto rendimiento" },
  { total: 85000, condition: "Alto rendimiento" },
  { total: 90000, condition: "Alto rendimiento" },
  { total: 100000, condition: "Meta top" },
  { total: 120000, condition: "META TOP" },
];

export const normalizeCommissionNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getCommissionSaleTotal = (row = {}) =>
  normalizeCommissionNumber(
    row.venta_total ?? row.total_final,
  );

export const getCommissionableSaleTotal = (row = {}) =>
  normalizeCommissionNumber(
    row.venta_comisionable ?? row.subtotal_final ?? row.total_final,
  );

export const commissionRateForFee = (feePercent) => {
  const normalizedFee = Math.max(
    25,
    Math.round(normalizeCommissionNumber(feePercent) / 5) * 5,
  );
  const configuredRate = COMMISSION_RATES.find(
    (item) => item.fee === normalizedFee,
  )?.rate;
  if (configuredRate) return configuredRate;
  if (normalizedFee > 45) {
    return 1.8 + Math.floor((normalizedFee - 45) / 5) * 0.1;
  }
  return 1.2;
};

export const calculateCommissionAmount = (saleAmount, commissionRatePercent) =>
  Math.round(
    ((normalizeCommissionNumber(saleAmount) *
      normalizeCommissionNumber(commissionRatePercent)) /
      100) *
      100,
  ) / 100;

export const tierClassForCondition = (condition = "") => {
  const normalized = String(condition).toLowerCase();
  if (normalized.includes("meta top")) return "top";
  if (normalized.includes("alto")) return "high";
  if (normalized.includes("buen")) return "good";
  if (normalized.includes("minima") || normalized.includes("mínima")) {
    return "minimum";
  }
  return "pending";
};

export const tierKeyForCondition = (condition = "") =>
  tierClassForCondition(condition);

export const tierForTotal = (total) => {
  const amount = normalizeCommissionNumber(total);
  const achieved = [...COMMISSION_TIERS]
    .filter((tier) => amount >= tier.total)
    .sort((a, b) => b.total - a.total)[0];

  if (!achieved) {
    const next = COMMISSION_TIERS[0];
    return {
      total: 0,
      nextTotal: next.total,
      condition: "Meta no alcanzada",
      level: "pending",
      label: "Pendiente",
      progressBase: next.total,
    };
  }

  const nextTier = COMMISSION_TIERS.find((tier) => tier.total > achieved.total);
  return {
    ...achieved,
    nextTotal: nextTier?.total || achieved.total,
    level: tierClassForCondition(achieved.condition),
    label: achieved.condition,
    progressBase: nextTier?.total || achieved.total,
  };
};

export const conditionForTotal = (total) => tierForTotal(total).condition;

export const progressForGoal = (value, goal) => {
  const target = normalizeCommissionNumber(goal);
  if (target <= 0) return 0;
  return Math.max(
    0,
    Math.min(
      100,
      Math.round((normalizeCommissionNumber(value) / target) * 100),
    ),
  );
};
