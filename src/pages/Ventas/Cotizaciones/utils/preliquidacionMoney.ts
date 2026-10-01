/** Largest-remainder allocation, as in Magic's MIL daily quotation export.
 * Allocate cents, not independently rounded rows, so no money is lost.
 */
export const allocatePreLiquidacionMoney = (target: number, weights: number[]) => {
  if (!weights.length) return [];
  const cents = Number.isFinite(Number(target)) ? Math.max(0, Math.round(Number(target) * 100)) : 0;
  let safeWeights = weights.map((value) => Number.isFinite(value) ? Math.max(0, value) : 0);
  if (!safeWeights.some((value) => value > 0)) safeWeights = safeWeights.map(() => 1);
  const weightSum = safeWeights.reduce((sum, value) => sum + value, 0);
  const raw = safeWeights.map((value) => cents * value / weightSum);
  const allocated = raw.map(Math.floor);
  const remainder = cents - allocated.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < remainder; index += 1) allocated[order[index % order.length].index] += 1;
  return allocated.map((value) => value / 100);
};

export interface PreLiquidacionQuotationSummary {
  currency: "USD";
  total: number;
  days: Array<{ id: string; dayNumber: number; title: string; total: number }>;
}

export const normalizePreLiquidacionQuotationSummary = (value: any): PreLiquidacionQuotationSummary | null => {
  if (!value || !Array.isArray(value.days) || value.total == null || value.total === "") return null;
  const total = Number(value.total);
  if (!Number.isFinite(total) || total < 0) return null;
  const money = (amount: any) => Number.isFinite(Number(amount)) ? Math.max(0, Math.round(Number(amount) * 100) / 100) : 0;
  const weights = value.days.map((day: any) => money(day?.total));
  const amounts = allocatePreLiquidacionMoney(total, weights);
  return {
    currency: "USD",
    total: money(total),
    days: value.days.map((day: any, index: number) => ({
      id: String(day?.id || `quote-day-${index + 1}`),
      dayNumber: Math.max(1, Math.trunc(Number(day?.dayNumber) || index + 1)),
      title: String(day?.title || "").trim(),
      total: amounts[index],
    })),
  };
};
