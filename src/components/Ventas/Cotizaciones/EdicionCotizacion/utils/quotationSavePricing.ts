import { sanitizeAdditionalCostsConfig } from "./quotePricingEngine.js";
import { calculateAdditionalCostForAudience } from "./financialDisplayHelpers.js";
import { buildVisibleSummaryPayload } from "./visibleSummaryTotals.js";
import { buildQuotationPricingSnapshotFromCotizacion } from "./quotationPricingSnapshot.js";

const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const amount = value => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || !Number.isFinite(money(parsed)) || parsed < 0) throw new Error("Hay importes de cotización inválidos. Revisa los costos antes de guardar.");
  return money(parsed);
};
const sameMoney = (a, b) => Math.abs(amount(a) - amount(b)) < 0.011;

export const normalizeQuotationSaveCosts = value => {
  const source = typeof value === "string" ? JSON.parse(value) : value;
  if (source != null && (typeof source !== "object" || Array.isArray(source))) throw new Error("La configuración de adicionales no es válida.");
  const config = sanitizeAdditionalCostsConfig(source ?? {});
  for (const key of ["fee", "operationalCosts", "extraFee", "childFee", "childOperationalCosts", "childExtraFee"]) {
    if (config[key] !== undefined) { amount(config[key]); config[key] = String(Number(config[key])); }
  }
  for (const key of ["feeMode", "operationalMode", "childFeeMode", "childOperationalMode"]) {
    if (config[key] !== undefined && !["percentage", "fixed"].includes(config[key])) throw new Error("El modo de los adicionales no es válido.");
  }
  return config;
};

/** Request-only reconciliation: never persist this derived snapshot in JSONB. */
export const buildQuotationSavePricing = ({ parts, peopleCount, additionalCosts }: { parts: any[]; peopleCount: any; additionalCosts: any }) => {
  const config = normalizeQuotationSaveCosts(additionalCosts);
  const people = { adults: Number(peopleCount?.adults ?? 0), children: Number(peopleCount?.children ?? 0) };
  if (!Object.values(people).every(n => Number.isSafeInteger(n) && n >= 0) || people.adults + people.children < 1 || people.adults + people.children > 10000) {
    throw new Error("No se puede conciliar el precio sin la composición de pasajeros.");
  }
  if (!Array.isArray(parts) || parts.length === 0) throw new Error("No se pudo reconstruir el precio. Vuelve al itinerario antes de guardar.");
  const counts = { adult: 0, child: 0 };
  const rows = parts.map(part => {
    if (part.isServiceCharge) {
      const value = amount(part.value);
      return { audience: "charge", isServiceCharge: true, beneficiaries: 0, value, commissionableValue: amount(part.commissionableValue ?? value) };
    }
    const audience = part.audience === "child" ? "child" : "adult";
    const beneficiaries = Number(part.beneficiaries);
    if (!Number.isInteger(beneficiaries) || beneficiaries < 1) throw new Error("La distribución del precio por pasajeros no es válida.");
    counts[audience] += beneficiaries;
    const services = amount(part.services), hotel = amount(part.hotel), external = amount(part.external);
    const additional = calculateAdditionalCostForAudience(money(services + hotel), config, audience);
    const value = money(services + hotel + additional.total + external);
    if (!sameMoney(part.additional, additional.total) || !sameMoney(part.value, value)) {
      throw new Error("El resumen de precios está desactualizado respecto del fee o de los servicios. Recalcula antes de guardar.");
    }
    return { audience, beneficiaries, services, hotel, external, additional: amount(additional.total), value, commissionableValue: amount(part.commissionableValue ?? value - external) };
  });
  if (counts.adult !== people.adults || counts.child !== people.children) throw new Error("El precio no cubre exactamente a todos los pasajeros.");
  const visible = buildVisibleSummaryPayload(rows);
  return { total_final: visible.grandTotal, subtotal_final: visible.commissionableGrandTotal, pricing_snapshot: { version: 1, people, parts: rows } };
};

/** The hook ignores delayed/legacy totals embedded in additionalCosts. */
export const resolveQuotationSavePricing = data => {
  const config = normalizeQuotationSaveCosts(data.additionalCosts ?? data.additionalcosts ?? {});
  const snapshot = data.pricing_snapshot;
  const peopleCount = data.peopleCount ?? (snapshot ? snapshot.people : undefined);
  if (snapshot) {
    if (snapshot.version !== 1) throw new Error("Actualiza la interfaz para guardar esta cotización.");
    if (peopleCount && (Number(peopleCount.adults) !== snapshot.people.adults || Number(peopleCount.children) !== snapshot.people.children)) throw new Error("Los pasajeros cambiaron después del cálculo del precio.");
    return buildQuotationSavePricing({ parts: snapshot.parts, peopleCount, additionalCosts: config });
  }
  if (!data.peopleDetails || !Array.isArray(data.itinerario)) throw new Error("Falta el contexto para calcular el precio completo; no se guardará un total parcial.");
  const rebuilt = buildQuotationPricingSnapshotFromCotizacion({ ...data, additionalCosts: config, additionalcosts: config });
  return buildQuotationSavePricing({ parts: rebuilt.parts, peopleCount: peopleCount ?? { adults: data.peopleDetails.adults?.length ?? 0, children: data.peopleDetails.children?.length ?? 0 }, additionalCosts: config });
};

export const requiresSoldPriceConfirmation = (quote, total) => Boolean(quote?.tiene_voucher && quote?.total_final != null && !sameMoney(quote.total_final, total));
