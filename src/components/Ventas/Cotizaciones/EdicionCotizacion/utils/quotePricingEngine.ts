import { calculateGeneralTotalsDetailed } from "../components/DaysEditor/utils/priceCalculations";

export const round2 = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

export const toMoneyNumber = (value) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const readAdditionalFlag = (additionalCosts = {}, field, fallback = true) =>
  (additionalCosts?.[field] ??
    additionalCosts?.[
      field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    ] ??
    additionalCosts?.applyAdditionalCostsToChildren ??
    additionalCosts?.apply_additional_costs_to_children ??
    fallback) !== false;

export const calculateAdditionalAmount = (
  additionalCosts = {},
  base = 0,
  audience = "adult",
) => {
  const isChild = audience === "child";
  const useAdultOperational =
    !isChild || readAdditionalFlag(additionalCosts, "applyOperationalCostsToChildren");
  const useAdultFee =
    !isChild || readAdditionalFlag(additionalCosts, "applyFeeToChildren");
  const useAdultExtra =
    !isChild || readAdditionalFlag(additionalCosts, "applyExtraFeeToChildren");

  const opMode = String(
    useAdultOperational
      ? additionalCosts?.operationalMode || additionalCosts?.operational_mode
      : additionalCosts?.childOperationalMode ||
          additionalCosts?.child_operational_mode ||
          additionalCosts?.operationalMode ||
          additionalCosts?.operational_mode ||
          "fixed",
  ).toLowerCase();
  const feeMode = String(
    useAdultFee
      ? additionalCosts?.feeMode || additionalCosts?.fee_mode
      : additionalCosts?.childFeeMode ||
          additionalCosts?.child_fee_mode ||
          additionalCosts?.feeMode ||
          additionalCosts?.fee_mode ||
          "fixed",
  ).toLowerCase();
  const opValue = toMoneyNumber(
    useAdultOperational
      ? additionalCosts?.operationalCosts ?? additionalCosts?.operational_costs
      : additionalCosts?.childOperationalCosts ??
          additionalCosts?.child_operational_costs ??
          additionalCosts?.operationalCosts ??
          additionalCosts?.operational_costs,
  );
  const feeValue = toMoneyNumber(
    useAdultFee
      ? additionalCosts?.fee ?? additionalCosts?.feeVal ?? additionalCosts?.fee_val
      : additionalCosts?.childFee ??
          additionalCosts?.child_fee ??
          additionalCosts?.fee ??
          additionalCosts?.feeVal ??
          additionalCosts?.fee_val,
  );
  const extraValue = toMoneyNumber(
    useAdultExtra
      ? additionalCosts?.extraFee ?? additionalCosts?.extra_fee
      : additionalCosts?.childExtraFee ??
          additionalCosts?.child_extra_fee ??
          additionalCosts?.extraFee ??
          additionalCosts?.extra_fee,
  );

  const operational =
    opMode === "percentage" ? round2((opValue * base) / 100) : round2(opValue);
  const fee =
    feeMode === "percentage" ? round2((feeValue * base) / 100) : round2(feeValue);
  const extra = round2(extraValue);

  return {
    operational,
    fee,
    extra,
    // Solo Fee forma parte del subtotal comisionable.
    commissionable: round2(fee),
    total: round2(operational + fee + extra),
  };
};

export const calculateItineraryPricing = (
  days = [],
  { adultsCount = 1, childrenCount = 0, peopleDetails = null } = {},
) => {
  const adults = Math.max(1, toMoneyNumber(adultsCount) || 1);
  const children = Math.max(0, toMoneyNumber(childrenCount));
  const effectivePeopleDetails = peopleDetails || {
    adults: Array.from({ length: adults }, (_, index) => ({ passenger_key: `adult:${index}` })),
    children: Array.from({ length: children }, (_, index) => ({ passenger_key: `child:${index}` })),
  };
  const totals = calculateGeneralTotalsDetailed(
    Array.isArray(days) ? days : [],
    effectivePeopleDetails,
  );

  const serviceChildTotal = round2(
    toMoneyNumber(totals.baseExplicitChildTotal) +
      toMoneyNumber(totals.baseConvertedChildTotal),
  );
  const hotelChildTotal = round2(toMoneyNumber(totals.hotelChildrenTotal));

  return {
    raw: totals,
    adultsCount: adults,
    childrenCount: children,
    servicesAdultPerPerson: round2(totals.totalPerPerson),
    servicesChildPerPerson: children > 0 ? round2(serviceChildTotal / children) : 0,
    hotelAdultPerPerson:
      adults > 0 ? round2(toMoneyNumber(totals.hotelAdultTotal) / adults) : 0,
    hotelChildPerPerson: children > 0 ? round2(hotelChildTotal / children) : 0,
    serviceChildTotal,
    hotelChildTotal,
  };
};

export const calculateQuotePricingSummary = ({
  days = [],
  externalDays = [],
  adultsCount = 1,
  childrenCount = 0,
  additionalCosts = {},
  peopleDetails = null,
} = {}) => {
  const main = calculateItineraryPricing(days, { adultsCount, childrenCount, peopleDetails });
  const external = calculateItineraryPricing(externalDays, {
    adultsCount,
    childrenCount,
    peopleDetails,
  });
  const adultBase = round2(main.servicesAdultPerPerson + main.hotelAdultPerPerson);
  const childBase = round2(main.servicesChildPerPerson + main.hotelChildPerPerson);
  const adultAdditional = calculateAdditionalAmount(additionalCosts, adultBase, "adult");
  const childAdditional = calculateAdditionalAmount(additionalCosts, childBase, "child");

  return {
    main,
    external,
    adult: {
      services: main.servicesAdultPerPerson,
      hotel: main.hotelAdultPerPerson,
      additional: adultAdditional.total,
      external: round2(
        external.servicesAdultPerPerson + external.hotelAdultPerPerson,
      ),
      commissionablePerPerson: round2(
        adultBase + (adultAdditional.commissionable ?? adultAdditional.fee ?? 0),
      ),
      totalPerPerson: round2(
        adultBase +
          adultAdditional.total +
          external.servicesAdultPerPerson +
          external.hotelAdultPerPerson,
      ),
    },
    child: {
      services: main.servicesChildPerPerson,
      hotel: main.hotelChildPerPerson,
      additional: childAdditional.total,
      external: round2(
        external.servicesChildPerPerson + external.hotelChildPerPerson,
      ),
      commissionablePerPerson: round2(
        childBase + (childAdditional.commissionable ?? childAdditional.fee ?? 0),
      ),
      totalPerPerson: round2(
        childBase +
          childAdditional.total +
          external.servicesChildPerPerson +
          external.hotelChildPerPerson,
      ),
    },
  };
};

const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null);

export const normalizeAdditionalCostsAliases = (additionalCosts = {}) => {
  if (!additionalCosts || typeof additionalCosts !== "object" || Array.isArray(additionalCosts)) {
    return {};
  }

  const source = Object.entries(additionalCosts).reduce((accumulator, [key, value]) => {
    if (!/^\d+$/.test(String(key))) accumulator[key] = value;
    return accumulator;
  }, {});

  return {
    ...source,
    operationalCosts: firstDefined(source.operationalCosts, source.operational_costs),
    operationalMode: firstDefined(source.operationalMode, source.operational_mode),
    fee: firstDefined(source.fee, source.feeVal, source.fee_val),
    feeVal: firstDefined(source.feeVal, source.fee, source.fee_val),
    feeMode: firstDefined(source.feeMode, source.fee_mode),
    extraFee: firstDefined(source.extraFee, source.extra_fee),
    applyAdditionalCostsToChildren: firstDefined(
      source.applyAdditionalCostsToChildren,
      source.apply_additional_costs_to_children,
    ),
    applyOperationalCostsToChildren: firstDefined(
      source.applyOperationalCostsToChildren,
      source.apply_operational_costs_to_children,
      source.applyAdditionalCostsToChildren,
      source.apply_additional_costs_to_children,
    ),
    applyFeeToChildren: firstDefined(
      source.applyFeeToChildren,
      source.apply_fee_to_children,
      source.applyAdditionalCostsToChildren,
      source.apply_additional_costs_to_children,
    ),
    applyExtraFeeToChildren: firstDefined(
      source.applyExtraFeeToChildren,
      source.apply_extra_fee_to_children,
      source.applyAdditionalCostsToChildren,
      source.apply_additional_costs_to_children,
    ),
    childOperationalCosts: firstDefined(
      source.childOperationalCosts,
      source.child_operational_costs,
    ),
    childOperationalMode: firstDefined(
      source.childOperationalMode,
      source.child_operational_mode,
    ),
    childFee: firstDefined(source.childFee, source.child_fee),
    childFeeMode: firstDefined(source.childFeeMode, source.child_fee_mode),
    childExtraFee: firstDefined(source.childExtraFee, source.child_extra_fee),
    finalTotal: firstDefined(source.finalTotal, source.final_total),
    final_total: firstDefined(source.final_total, source.finalTotal),
    grandTotal: firstDefined(source.grandTotal, source.grand_total),
    grand_total: firstDefined(source.grand_total, source.grandTotal),
    subtotalFinal: firstDefined(source.subtotalFinal, source.subtotal_final),
    subtotal_final: firstDefined(source.subtotal_final, source.subtotalFinal),
    commissionableSubtotal: firstDefined(
      source.commissionableSubtotal,
      source.commissionable_subtotal,
    ),
    commissionable_subtotal: firstDefined(
      source.commissionable_subtotal,
      source.commissionableSubtotal,
    ),
    feeOnlySubtotalFinal: firstDefined(
      source.feeOnlySubtotalFinal,
      source.fee_only_subtotal_final,
    ),
    fee_only_subtotal_final: firstDefined(
      source.fee_only_subtotal_final,
      source.feeOnlySubtotalFinal,
    ),
    commissionableFeeSubtotal: firstDefined(
      source.commissionableFeeSubtotal,
      source.commissionable_fee_subtotal,
    ),
    commissionable_fee_subtotal: firstDefined(
      source.commissionable_fee_subtotal,
      source.commissionableFeeSubtotal,
    ),
    visibleSummaryGrandTotal: firstDefined(
      source.visibleSummaryGrandTotal,
      source.visible_summary_grand_total,
      source.summaryVisibleGrandTotal,
      source.summary_visible_grand_total,
      source.acSummaryGrandTotal,
      source.ac_summary_grand_total,
    ),
    summaryVisibleGrandTotal: firstDefined(
      source.summaryVisibleGrandTotal,
      source.summary_visible_grand_total,
      source.visibleSummaryGrandTotal,
      source.visible_summary_grand_total,
      source.acSummaryGrandTotal,
      source.ac_summary_grand_total,
    ),
    acSummaryGrandTotal: firstDefined(
      source.acSummaryGrandTotal,
      source.ac_summary_grand_total,
      source.visibleSummaryGrandTotal,
      source.visible_summary_grand_total,
      source.summaryVisibleGrandTotal,
      source.summary_visible_grand_total,
    ),
    summaryVisibleParts: firstDefined(
      source.summaryVisibleParts,
      source.summary_visible_parts,
      source.visibleSummaryParts,
      source.visible_summary_parts,
      source.acSummaryParts,
      source.ac_summary_parts,
    ),
    visibleSummaryParts: firstDefined(
      source.visibleSummaryParts,
      source.visible_summary_parts,
      source.summaryVisibleParts,
      source.summary_visible_parts,
      source.acSummaryParts,
      source.ac_summary_parts,
    ),
    acSummaryParts: firstDefined(
      source.acSummaryParts,
      source.ac_summary_parts,
      source.summaryVisibleParts,
      source.summary_visible_parts,
      source.visibleSummaryParts,
      source.visible_summary_parts,
    ),
  };
};

export const sanitizeAdditionalCostsConfig = (additionalCosts = {}) => {
  const normalizedAdditionalCosts = normalizeAdditionalCostsAliases(additionalCosts);
  const keys = [
    "operationalCosts",
    "operationalMode",
    "fee",
    "feeVal",
    "feeMode",
    "extraFee",
    "applyAdditionalCostsToChildren",
    "applyOperationalCostsToChildren",
    "applyFeeToChildren",
    "applyExtraFeeToChildren",
    "childOperationalCosts",
    "childOperationalMode",
    "childFee",
    "childFeeMode",
    "childExtraFee",
  ];

  // El snapshot es estado derivado del frontend. Al backend se envía solamente
  // la configuración necesaria para volver a calcularlo desde itinerarios y
  // pasajeros en cualquier vista.
  return keys.reduce((result, key) => {
    if (normalizedAdditionalCosts?.[key] !== undefined) {
      result[key] = normalizedAdditionalCosts[key];
    }
    return result;
  }, {});
};
