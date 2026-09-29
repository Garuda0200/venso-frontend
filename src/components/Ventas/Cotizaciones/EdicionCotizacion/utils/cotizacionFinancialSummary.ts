import { updateServicePricesForPassengerChange } from "./unifiedServiceManager";
import { getServicePricingSnapshot } from "./servicePricingRuntime";
import { resolveChildChargeSummary } from "./financialDisplayHelpers";
import { preserveOperationallyAssignedServices } from "./assignmentProtection";
import {
  pruneEmptyMutableTicketCohorts,
  reconcilePricingSnapshotToPassengerRoster,
} from "./passengerPricingReconciliation";

const round2 = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

/**
 * Redondeo hacia arriba (ceil) para montos genéricos por persona (adulto/niño)
 * Si hay cualquier decimal >= 0.01, redondea al siguiente entero.
 */
const ceilGeneric = (value) => Math.ceil(ensureNumber(value));

export const ensureNumber = (value) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null);

const getPeopleChildrenCount = (peopleDetails = null) => {
  if (Array.isArray(peopleDetails?.children) && peopleDetails.children.length > 0) {
    return peopleDetails.children.length;
  }

  if (Array.isArray(peopleDetails?.details)) {
    return peopleDetails.details.filter((passenger) => {
      const type = String(
        passenger?.tipo_pasajero ||
          passenger?.tipoPasajero ||
          passenger?.passenger_type ||
          "",
      ).toLowerCase();
      const key = String(
        passenger?.passenger_key ||
          passenger?.passengerKey ||
          passenger?.id ||
          "",
      ).toLowerCase();
      return type === "child" || key.startsWith("child");
    }).length;
  }

  return 0;
};

const normalizeServicesForPassengerRoster = (services, peopleDetails) => {
  if (!Array.isArray(services)) return [];
  const hasPassengerContext =
    Array.isArray(peopleDetails?.adults) ||
    Array.isArray(peopleDetails?.children) ||
    Array.isArray(peopleDetails?.details);
  if (!hasPassengerContext) return services;
  const repriced = updateServicePricesForPassengerChange(services, peopleDetails, {
    preserveExistingSelection: true,
  });
  return pruneEmptyMutableTicketCohorts(
    preserveOperationallyAssignedServices(services, repriced),
  );
};

export const sumItineraryTotal = (itinerary, peopleDetails = null) => {
  const days = Array.isArray(itinerary)
    ? itinerary
    : itinerary && typeof itinerary === "object"
      ? Object.values(itinerary)
      : [];

  const hasPassengerContext =
    Array.isArray(peopleDetails?.adults) ||
    Array.isArray(peopleDetails?.children) ||
    Array.isArray(peopleDetails?.details);

  return round2(
    days.reduce((dayAcc, day) => {
      const services = Array.isArray(day?.servicios) ? day.servicios : [];
      const normalizedServices = hasPassengerContext
        ? normalizeServicesForPassengerRoster(services, peopleDetails)
        : services;

      return (
        dayAcc +
        normalizedServices.reduce((svcAcc, service) => {
          return svcAcc + getServicePricingSnapshot(service).total;
        }, 0)
      );
    }, 0),
  );
};

export const calculateExternalItineraryBreakdown = (
  itinerary,
  peopleDetails = null,
) => {
  const days = Array.isArray(itinerary)
    ? itinerary
    : itinerary && typeof itinerary === "object"
      ? Object.values(itinerary)
      : [];

  const hasPassengerContext =
    Array.isArray(peopleDetails?.adults) ||
    Array.isArray(peopleDetails?.children) ||
    Array.isArray(peopleDetails?.details);

  const addToMap = (target, key, amount) => {
    if (!key) return;
    target[key] = round2((target[key] || 0) + ensureNumber(amount));
  };
  const averageMap = (value = {}) => {
    const entries = Object.entries(value || {}).filter(
      ([, amount]) => ensureNumber(amount) > 0,
    );
    if (entries.length === 0) return 0;

    // External itinerary prices are cohort prices. Dividing by every child in
    // the quote dilutes a tariff that only belongs to one explicit/converted
    // child and later causes the UI to multiply the diluted value again.
    return round2(
      entries.reduce((sum, [, amount]) => sum + ensureNumber(amount), 0) /
        entries.length,
    );
  };

  const breakdown = days.reduce(
    (acc, day) => {
      const services = Array.isArray(day?.servicios) ? day.servicios : [];
      const normalizedServices = hasPassengerContext
        ? normalizeServicesForPassengerRoster(services, peopleDetails)
        : services;

      normalizedServices.forEach((service) => {
        const pricing = getServicePricingSnapshot(service);
        const reconciledPricing = reconcilePricingSnapshotToPassengerRoster(
          pricing,
          peopleDetails,
        );
        acc.adultTotal += ensureNumber(pricing.precioAdult);
        reconciledPricing.explicitChildEntries.forEach(([childId, data]) => {
          addToMap(acc.explicitChildTotalsById, childId, data?.amount);
        });
        reconciledPricing.convertedChildEntries.forEach(([childId, data]) => {
          addToMap(acc.convertedChildTotalsById, childId, data?.amount);
        });
      });

      return acc;
    },
    {
      adultTotal: 0,
      explicitChildTotalsById: {},
      convertedChildTotalsById: {},
    },
  );

  const adultTotal = round2(breakdown.adultTotal);
  const childTotal = averageMap(breakdown.explicitChildTotalsById);
  const convertedChildTotal = averageMap(breakdown.convertedChildTotalsById);

  return {
    adultTotal,
    childTotal,
    convertedChildTotal,
    explicitChildTotalsById: breakdown.explicitChildTotalsById,
    convertedChildTotalsById: breakdown.convertedChildTotalsById,
    explicitChildCount: Object.keys(breakdown.explicitChildTotalsById).length,
    convertedChildCount: Object.keys(breakdown.convertedChildTotalsById).length,
    grandTotal: round2(adultTotal + childTotal + convertedChildTotal),
  };
};

export const calculateCotizacionFinancialSummary = ({
  subtotalIndividual = 0,
  adultsCount = 1,
  hotelsTotal = 0,
  hotelAdultTotal = null,
  hotelChildTotal = 0,
  hotelConvertedChildTotal = 0,
  subtotalNinos = 0,
  childrenCount = 0,
  externalItineraryTotal = 0,
  externalAdultTotal = null,
  externalChildTotal = null,
  externalConvertedChildTotal = null,
  externalExplicitChildCount = 0,
  externalConvertedChildCount = 0,
  baseExplicitChildCount = 0,
  baseConvertedChildCount = 0,
  hotelExplicitChildCount = 0,
  hotelConvertedChildCount = 0,
  nonHotelExplicitChildTotal = null,
  nonHotelConvertedChildTotal = null,
  additionalCosts = {},
}) => {
  const adults = Math.max(1, ensureNumber(adultsCount) || 1);
  const subtotalPerAdult = round2(subtotalIndividual);
  const hotelGroupTotal = ensureNumber(hotelsTotal);
  const convertedChildHotelTotal = ensureNumber(hotelConvertedChildTotal);
  const resolvedHotelAdultTotal =
    hotelAdultTotal == null
      ? Math.max(0, hotelGroupTotal - convertedChildHotelTotal)
      : ensureNumber(hotelAdultTotal);
  const resolvedHotelChildTotal = ensureNumber(hotelChildTotal);
  const children = Math.max(0, ensureNumber(childrenCount));
  const childrenSubtotal = ensureNumber(subtotalNinos);

  const hasExplicitExternalBreakdown =
    externalAdultTotal != null ||
    externalChildTotal != null ||
    externalConvertedChildTotal != null;
  const resolvedExternalAdultTotal = hasExplicitExternalBreakdown
    ? round2(externalAdultTotal)
    : 0;
  const resolvedExternalChildTotal = hasExplicitExternalBreakdown
    ? ensureNumber(externalChildTotal)
    : ensureNumber(externalItineraryTotal);
  const resolvedExternalExplicitChildCount = Math.max(
    0,
    ensureNumber(externalExplicitChildCount),
  );
  const resolvedExternalConvertedChildCount = Math.max(
    0,
    ensureNumber(externalConvertedChildCount),
  );

  const hotelPerAdult =
    adults > 0 ? round2(resolvedHotelAdultTotal / adults) : 0;
  const percentageBase = round2(subtotalPerAdult + hotelPerAdult);

  const operationalMode = String(
    firstDefined(
      additionalCosts?.operationalMode,
      additionalCosts?.operational_mode,
      "fixed",
    ),
  ).toLowerCase();
  const feeMode = String(
    firstDefined(additionalCosts?.feeMode, additionalCosts?.fee_mode, "fixed"),
  ).toLowerCase();
  const applyAdditionalCostsToChildren =
    firstDefined(
      additionalCosts?.applyAdditionalCostsToChildren,
      additionalCosts?.apply_additional_costs_to_children,
      true,
    ) !== false;
  const applyOperationalCostsToChildren =
    firstDefined(
      additionalCosts?.applyOperationalCostsToChildren,
      additionalCosts?.apply_operational_costs_to_children,
      additionalCosts?.applyAdditionalCostsToChildren,
      additionalCosts?.apply_additional_costs_to_children,
      true,
    );
  const applyFeeToChildren = firstDefined(
    additionalCosts?.applyFeeToChildren,
    additionalCosts?.apply_fee_to_children,
    additionalCosts?.applyAdditionalCostsToChildren,
    additionalCosts?.apply_additional_costs_to_children,
    true,
  );
  const applyExtraFeeToChildren = firstDefined(
    additionalCosts?.applyExtraFeeToChildren,
    additionalCosts?.apply_extra_fee_to_children,
    additionalCosts?.applyAdditionalCostsToChildren,
    additionalCosts?.apply_additional_costs_to_children,
    true,
  );
  const hasPerFeeChildPolicy =
    Object.prototype.hasOwnProperty.call(
      additionalCosts || {},
      "applyOperationalCostsToChildren",
    ) ||
    Object.prototype.hasOwnProperty.call(
      additionalCosts || {},
      "apply_operational_costs_to_children",
    ) ||
    Object.prototype.hasOwnProperty.call(
      additionalCosts || {},
      "applyFeeToChildren",
    ) ||
    Object.prototype.hasOwnProperty.call(
      additionalCosts || {},
      "apply_fee_to_children",
    ) ||
    Object.prototype.hasOwnProperty.call(
      additionalCosts || {},
      "applyExtraFeeToChildren",
    ) ||
    Object.prototype.hasOwnProperty.call(
      additionalCosts || {},
      "apply_extra_fee_to_children",
    );
  const childOperationalMode = String(
    firstDefined(
      additionalCosts?.childOperationalMode,
      additionalCosts?.child_operational_mode,
      operationalMode,
    ),
  ).toLowerCase();
  const childFeeMode = String(
    firstDefined(additionalCosts?.childFeeMode, additionalCosts?.child_fee_mode, feeMode),
  ).toLowerCase();
  const operationalCosts = firstDefined(
    additionalCosts?.operationalCosts,
    additionalCosts?.operational_costs,
    0,
  );
  const childOperationalCosts = firstDefined(
    additionalCosts?.childOperationalCosts,
    additionalCosts?.child_operational_costs,
    operationalCosts,
  );
  const baseFeeValue = firstDefined(
    additionalCosts?.fee,
    additionalCosts?.feeVal,
    additionalCosts?.fee_val,
    0,
  );
  const childFeeValue = firstDefined(
    additionalCosts?.childFee,
    additionalCosts?.child_fee,
    baseFeeValue,
  );
  const extraFeeValue = firstDefined(
    additionalCosts?.extraFee,
    additionalCosts?.extra_fee,
    0,
  );
  const childExtraFeeValue = firstDefined(
    additionalCosts?.childExtraFee,
    additionalCosts?.child_extra_fee,
    extraFeeValue,
  );

  const calculateTypedAdditional = (base, audience = "adult") => {
    const safeBase = round2(base);
    const useChild = audience === "child";
    const opMode = String(
      useChild && !applyOperationalCostsToChildren
        ? childOperationalMode
        : operationalMode,
    ).toLowerCase();
    const feeCalcMode = String(
      useChild && !applyFeeToChildren ? childFeeMode : feeMode,
    ).toLowerCase();
    const opValue = ensureNumber(
      useChild && !applyOperationalCostsToChildren
        ? childOperationalCosts
        : operationalCosts,
    );
    const resolvedFeeValue = ensureNumber(
      useChild && !applyFeeToChildren ? childFeeValue : baseFeeValue,
    );
    const extraValue = ensureNumber(
      useChild && !applyExtraFeeToChildren
        ? childExtraFeeValue
        : extraFeeValue,
    );

    const operational =
      opMode === "percentage"
        ? round2((opValue * safeBase) / 100)
        : round2(opValue);
    const fee =
      feeCalcMode === "percentage"
        ? round2((resolvedFeeValue * safeBase) / 100)
        : round2(resolvedFeeValue);
    const extra = round2(extraValue);

    return {
      operational,
      fee,
      extra,
      total: round2(operational + fee + extra),
    };
  };

  const calculateAdditionalForBase = (base) =>
    calculateTypedAdditional(base, "adult");
  const calculateChildAdditionalForBase = (base) =>
    calculateTypedAdditional(base, "child");

  const adultAdditional = calculateAdditionalForBase(percentageBase);
  const operationalAmount = adultAdditional.operational;
  const feeAmount = adultAdditional.fee;
  const extraFeeAmount = adultAdditional.extra;
  const totalAdditionalPerAdult = round2(
    operationalAmount + feeAmount + extraFeeAmount,
  );

  const servicesAdultsTotal = round2(subtotalPerAdult * adults);
  const nonHotelChildTotal = round2(
    Math.max(0, childrenSubtotal - resolvedHotelChildTotal),
  );
  const hotelExplicitChildTotal = round2(
    Math.max(0, resolvedHotelChildTotal - convertedChildHotelTotal),
  );
  const resolvedNonHotelConvertedChildTotal =
    nonHotelConvertedChildTotal == null
      ? 0
      : round2(ensureNumber(nonHotelConvertedChildTotal));
  const resolvedNonHotelExplicitChildTotal =
    nonHotelExplicitChildTotal == null
      ? round2(
          Math.max(0, nonHotelChildTotal - resolvedNonHotelConvertedChildTotal),
        )
      : round2(ensureNumber(nonHotelExplicitChildTotal));
  const explicitTotalWithoutExternal = round2(
    resolvedNonHotelExplicitChildTotal + hotelExplicitChildTotal,
  );
  const convertedChildTotalResolved = round2(
    resolvedNonHotelConvertedChildTotal + convertedChildHotelTotal,
  );
  const childCohorts = resolveChildChargeSummary({
    childrenCount: children,
    // Un niño puede pagar sus servicios con tarifa propia y un itinerario
    // externo como adulto. Los conteos del externo deben participar en las
    // cohortes para que su importe se agregue una vez, pero el fee se siga
    // calculando únicamente sobre servicios y hotel.
    baseExplicitChildCount: Math.max(
      ensureNumber(baseExplicitChildCount),
      resolvedExternalExplicitChildCount,
    ),
    baseConvertedChildCount: Math.max(
      ensureNumber(baseConvertedChildCount),
      resolvedExternalConvertedChildCount,
    ),
    hotelExplicitChildCount,
    hotelConvertedChildCount,
    nonHotelExplicitChildTotal: resolvedNonHotelExplicitChildTotal,
    nonHotelConvertedChildTotal: resolvedNonHotelConvertedChildTotal,
    hotelExplicitChildTotal,
    hotelConvertedChildTotal: convertedChildHotelTotal,
  });
  const explicitCount = Math.max(0, childCohorts.explicitCount);
  const convertedCount = Math.max(0, childCohorts.convertedCount);
  const orphanExternalChildTotal = 0;
  const explicitChildTotalResolved = round2(
    explicitTotalWithoutExternal + resolvedExternalChildTotal * explicitCount,
  );
  const convertedChildTotalWithExternal = round2(
    convertedChildTotalResolved +
      ensureNumber(externalConvertedChildTotal) * convertedCount,
  );

  const perAdultTotal = round2(
    percentageBase + totalAdditionalPerAdult + resolvedExternalAdultTotal,
  );
  const perAdultVisibleTotal = ceilGeneric(perAdultTotal);

  const hotelPerChild =
    children > 0 ? round2(resolvedHotelChildTotal / children) : 0;
  const nonHotelPerChild =
    children > 0 ? round2(nonHotelChildTotal / children) : 0;
  const perChildTotal = round2(
    nonHotelPerChild +
      hotelPerChild +
      (children > 0 ? resolvedExternalChildTotal / children : 0) +
      (children > 0 ? ensureNumber(externalConvertedChildTotal) / children : 0),
  );
  const perChildVisibleTotal = ceilGeneric(perChildTotal);
  const perExplicitChildTotal =
    explicitCount > 0 ? round2(explicitChildTotalResolved / explicitCount) : 0;
  const perConvertedChildTotal =
    convertedCount > 0
      ? round2(convertedChildTotalWithExternal / convertedCount)
      : 0;
  const perExplicitChildBase =
    explicitCount > 0 ? round2(explicitTotalWithoutExternal / explicitCount) : 0;
  const perConvertedChildBase =
    convertedCount > 0
      ? round2(convertedChildTotalResolved / convertedCount)
      : 0;
  const childAdditionalBase = round2(
    perExplicitChildBase + perConvertedChildBase,
  );
  const childAdditional =
    hasPerFeeChildPolicy || applyAdditionalCostsToChildren
      ? calculateChildAdditionalForBase(childAdditionalBase)
      : { operational: 0, fee: 0, extra: 0, total: 0 };
  const totalAdditionalPerChild = round2(childAdditional.total);
  const perUnifiedChildTotal = round2(
    perExplicitChildTotal + perConvertedChildTotal + totalAdditionalPerChild,
  );
  const perExplicitChildVisibleTotal = ceilGeneric(perExplicitChildTotal);
  const perConvertedChildVisibleTotal = ceilGeneric(perConvertedChildTotal);
  const perUnifiedChildVisibleTotal = ceilGeneric(perUnifiedChildTotal);

  // Explicit and converted cohorts may be different children. Only the overlap
  // receives both bases. This prevents multiplying both child subtotals by the
  // complete children count (the former source of duplicated child totals).
  const overlapChildCount = Math.max(
    0,
    explicitCount + convertedCount - children,
  );
  const explicitOnlyChildCount = Math.max(0, explicitCount - overlapChildCount);
  const convertedOnlyChildCount = Math.max(
    0,
    convertedCount - overlapChildCount,
  );
  const calculatePolicyChildAdditional = (base) =>
    hasPerFeeChildPolicy || applyAdditionalCostsToChildren
      ? calculateChildAdditionalForBase(base)
      : { operational: 0, fee: 0, extra: 0, total: 0 };
  const explicitOnlyAdditional = calculatePolicyChildAdditional(
    perExplicitChildBase,
  );
  const convertedOnlyAdditional = calculatePolicyChildAdditional(
    perConvertedChildBase,
  );
  const overlapAdditional = calculatePolicyChildAdditional(
    round2(perExplicitChildBase + perConvertedChildBase),
  );
  const childVisibleGrandTotal = round2(
    ceilGeneric(perExplicitChildTotal + explicitOnlyAdditional.total) *
      explicitOnlyChildCount +
      ceilGeneric(perConvertedChildTotal + convertedOnlyAdditional.total) *
        convertedOnlyChildCount +
      ceilGeneric(
        perExplicitChildTotal +
          perConvertedChildTotal +
          overlapAdditional.total,
      ) * overlapChildCount,
  );
  const fallbackChildVisibleGrandTotal = round2(
    perChildVisibleTotal * children,
  );
  const finalGrandTotal = round2(
    perAdultVisibleTotal * adults +
      (childVisibleGrandTotal > 0
        ? childVisibleGrandTotal
        : fallbackChildVisibleGrandTotal),
  );

  const externalTotal = round2(
    resolvedExternalAdultTotal * adults +
      resolvedExternalChildTotal * explicitCount +
      ensureNumber(externalConvertedChildTotal) * convertedCount,
  );

  return {
    adultsCount: adults,
    subtotalIndividual: subtotalPerAdult,
    hotelGroupTotal,
    hotelAdultTotal: round2(resolvedHotelAdultTotal),
    hotelChildTotal: round2(resolvedHotelChildTotal),
    hotelConvertedChildTotal: round2(convertedChildHotelTotal),
    hotelExplicitChildTotal,
    hotelPerAdult,
    percentageBase,
    operationalAmount,
    feeAmount,
    extraFeeAmount,
    totalAdditionalPerAdult,
    operationalTotal: round2(operationalAmount * adults),
    feeTotal: round2(feeAmount * adults),
    extraFeeTotal: round2(extraFeeAmount * adults),
    additionalTotal: round2(totalAdditionalPerAdult * adults),
    applyAdditionalCostsToChildren,
    applyOperationalCostsToChildren,
    applyFeeToChildren,
    applyExtraFeeToChildren,
    childOperationalAmount: childAdditional.operational,
    childFeeAmount: childAdditional.fee,
    childExtraFeeAmount: childAdditional.extra,
    totalAdditionalPerChild,
    additionalChildTotal: round2(totalAdditionalPerChild * children),
    additionalGrandTotal: round2(
      totalAdditionalPerAdult * adults + totalAdditionalPerChild * children,
    ),
    servicesAdultsTotal,
    subtotalNinos: round2(childrenSubtotal),
    nonHotelChildTotal,
    nonHotelExplicitChildTotal: resolvedNonHotelExplicitChildTotal,
    nonHotelConvertedChildTotal: resolvedNonHotelConvertedChildTotal,
    externalAdultTotal: resolvedExternalAdultTotal,
    externalChildTotal: resolvedExternalChildTotal,
    externalConvertedChildTotal: ensureNumber(externalConvertedChildTotal),
    externalExplicitChildCount: resolvedExternalExplicitChildCount,
    externalConvertedChildCount: resolvedExternalConvertedChildCount,
    externalItineraryTotal: externalTotal,
    explicitChildCount: explicitCount,
    convertedChildCount: convertedCount,
    overlapChildCount,
    explicitOnlyChildCount,
    convertedOnlyChildCount,
    childVisibleGrandTotal,
    explicitChildTotal: explicitChildTotalResolved,
    convertedChildTotal: convertedChildTotalWithExternal,
    perExplicitChildBase,
    perConvertedChildBase,
    childAdditionalBase,
    perExplicitChildTotal,
    perConvertedChildTotal,
    perUnifiedChildTotal,
    perExplicitChildVisibleTotal,
    perConvertedChildVisibleTotal,
    perUnifiedChildVisibleTotal,
    orphanExternalChildTotal,
    perAdultVisibleTotal,
    perChildVisibleTotal,
    grandTotal: finalGrandTotal,
  };
};
