/** The native tariff currency and its identified rate travel together. */
export function catalogCurrency(value: unknown): "USD" | "PEN" | null {
  const normalized = String(value ?? "USD").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (["", "USD", "DOLARES", "$"].includes(normalized)) return "USD";
  if (["PEN", "SOLES", "SOL", "S/"].includes(normalized)) return "PEN";
  return null;
}

export function identifiedCatalogRate(value: unknown): number | null {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 && rate < 1_000_000 ? rate : null;
}

export function catalogAmountInDollars(amount: unknown, currency: unknown, rate: unknown): number | null {
  if (amount == null || amount === "") return null;
  const value = Number(amount), money = catalogCurrency(currency);
  if (!Number.isFinite(value) || value < 0 || money == null) return null;
  if (money === "USD") return value;
  const exchangeRate = identifiedCatalogRate(rate);
  return exchangeRate == null ? null : value / exchangeRate;
}

export function tariffConversionPending(tariff: any): boolean {
  if (!tariff) return false;
  const currency = catalogCurrency(tariff.moneda);
  return currency == null || (currency === "PEN" && identifiedCatalogRate(tariff.tasa_cambio) == null);
}
