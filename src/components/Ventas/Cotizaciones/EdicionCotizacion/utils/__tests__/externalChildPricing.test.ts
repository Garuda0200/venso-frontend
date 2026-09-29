import test from "node:test";
import assert from "node:assert/strict";

import { calculateCotizacionFinancialSummary } from "../cotizacionFinancialSummary";

test("external adult-rate child overlaps explicit child pricing exactly once", () => {
  const result = calculateCotizacionFinancialSummary({
    subtotalIndividual: 100,
    adultsCount: 2,
    childrenCount: 1,
    subtotalNinos: 10,
    nonHotelExplicitChildTotal: 10,
    baseExplicitChildCount: 1,
    externalAdultTotal: 20,
    externalChildTotal: 0,
    externalConvertedChildTotal: 30,
    externalExplicitChildCount: 0,
    externalConvertedChildCount: 1,
    additionalCosts: { operationalCosts: 0, fee: 0, extraFee: 0 },
  });

  assert.equal(result.externalItineraryTotal, 70);
  assert.equal(result.explicitChildCount, 1);
  assert.equal(result.convertedChildCount, 1);
  assert.equal(result.overlapChildCount, 1);
  assert.equal(result.childVisibleGrandTotal, 40);
  assert.equal(result.grandTotal, 280);
});
