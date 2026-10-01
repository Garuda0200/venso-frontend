import { calculateDaySubtotalDetailed } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/utils/priceCalculations";
import { sumItineraryTotal } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/cotizacionFinancialSummary";
import { buildQuotationPeopleDetails } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/quotationPricingSnapshot";
import { buildSummaryContentPricingModel } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/summaryContentPricingParts";
import { hydrateItinerarioFromDB } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/itinerarioCleanupUtils";
import { parseSummaryPricingArray, parseSummaryPricingObject } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/summaryPricingCore";
import { calculateVisibleSummaryGrandTotal, resolveQuotationPricingSnapshot } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/visibleSummaryTotals";
import { allocatePreLiquidacionMoney, type PreLiquidacionQuotationSummary } from "./preliquidacionMoney";

const amount = (value: any) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** A commercial daily summary, never an assigned-provider payment report.
 * Use the same final quotation/summary amount, distribute its components over
 * the quoted days, then reconcile rounding exactly as Magic's daily export does.
 */
export const buildPreLiquidacionQuotationSummary = (quotation: any): PreLiquidacionQuotationSummary => {
  const mainDays = hydrateItinerarioFromDB(parseSummaryPricingArray(quotation.itinerario ?? quotation.dias ?? quotation.itinerary));
  const externalDays = hydrateItinerarioFromDB(parseSummaryPricingArray(quotation.itinerario_externo ?? quotation.itinerarioExterno ?? quotation.externalDays));
  const people = buildQuotationPeopleDetails(quotation);
  const pricing = buildSummaryContentPricingModel(quotation);
  const parts = Array.isArray(pricing.parts) ? pricing.parts : [];
  const storedTotal = quotation.total_final ?? quotation.totalFinal ?? quotation.grandTotal;
  const additionalCosts = parseSummaryPricingObject(quotation.additionalCosts ?? quotation.additionalcosts ?? quotation.additional_costs);
  // SummaryContent and AdditionalCosts ceil each final passenger price BEFORE
  // multiplying its beneficiaries. Ceil(groupTotal), a stored decimal total,
  // or a persisted visible-parts snapshot can disagree with that live amount.
  const total = round(amount(parts.length > 0
    ? calculateVisibleSummaryGrandTotal(parts)
    : resolveQuotationPricingSnapshot({
      additionalCosts,
      previewTotal: pricing.roundedTotal,
      fallbackAdditionalTotal: [additionalCosts.finalTotal, additionalCosts.final_total, additionalCosts.grandTotal, additionalCosts.grand_total]
        .map(amount).find((value) => value > 0) || 0,
      fallbackTotal: amount(storedTotal),
    }).grandTotal));
  const grouped = new Map<number, { titles: string[]; services: number; hotel: number; external: number }>();
  const addDays = (days: any[], external: boolean) => days.forEach((day, index) => {
    const dayNumber = Math.max(1, Math.trunc(Number(day.numero ?? day.dayNumber) || index + 1));
    const row = grouped.get(dayNumber) || { titles: [], services: 0, hotel: 0, external: 0 };
    const title = String(day.titulo ?? day.title ?? day.nombre ?? "").trim();
    if (title && !row.titles.some((existing) => existing.toLocaleLowerCase() === title.toLocaleLowerCase())) row.titles.push(title);
    if (external) row.external += amount(sumItineraryTotal([day], people));
    else {
      const costs = calculateDaySubtotalDetailed(day.servicios || [], people);
      row.services += amount(costs.totalSubtotal);
      row.hotel += amount(costs.hotelsTotal);
    }
    grouped.set(dayNumber, row);
  });
  addDays(mainDays, false);
  addDays(externalDays, true);
  const entries = [...grouped.entries()].sort(([a], [b]) => a - b);
  const componentTarget = (key: string) => parts.reduce((sum: number, part: any) =>
    sum + amount(part[key]) * amount(part.beneficiaries), 0);
  const serviceWeights = entries.map(([, day]) => day.services);
  const hotelWeights = entries.map(([, day]) => day.hotel);
  // Hotels selected outside DaysEditor may have no itinerary hotel service.
  // In that case use their actual stay-night indices, not every tour day.
  if (!hotelWeights.some((value) => value > 0)) {
    const rooms = pricing.canonicalPricingSnapshot?.perRoomPricing || pricing.perRoomPricing || [];
    rooms.forEach((room: any) => {
      const indices = [...new Set<number>((room.groupDayIndices || [])
        .map(Number).filter((index: number) => Number.isInteger(index) && index >= 0 && index < mainDays.length))];
      const roomCost = amount(room.hotelPerPerson) * amount(room.beneficiaries);
      indices.forEach((index) => {
        const number = Math.max(1, Math.trunc(Number(mainDays[index].numero ?? mainDays[index].dayNumber) || index + 1));
        const position = entries.findIndex(([dayNumber]) => dayNumber === number);
        if (position >= 0) hotelWeights[position] += roomCost / indices.length;
      });
    });
  }
  const externalWeights = entries.map(([, day]) => day.external);
  const services = allocatePreLiquidacionMoney(componentTarget("services"), serviceWeights);
  const hotels = allocatePreLiquidacionMoney(componentTarget("hotel"), hotelWeights);
  const external = allocatePreLiquidacionMoney(componentTarget("external"), externalWeights);
  const additional = allocatePreLiquidacionMoney(componentTarget("additional"), entries.map((_, index) => services[index] + hotels[index]));
  let finalWeights = entries.map((_, index) => services[index] + hotels[index] + external[index] + additional[index]);
  if (!finalWeights.some((value) => value > 0)) finalWeights = entries.map(([, day]) => day.services + day.hotel + day.external);
  const dailyAmounts = allocatePreLiquidacionMoney(total, finalWeights);
  return {
    currency: "USD",
    total,
    days: entries.map(([dayNumber, day], index) => ({
      id: `quote-day-${dayNumber}`,
      dayNumber,
      title: day.titles.join(", "),
      total: dailyAmounts[index],
    })),
  };
};
