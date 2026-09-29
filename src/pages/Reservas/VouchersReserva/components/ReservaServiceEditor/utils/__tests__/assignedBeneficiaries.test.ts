import assert from "node:assert/strict";
import {
  buildAssignedFlatPricingState,
  selectAssignedBeneficiaries,
  syncTariffWithReservationPricing,
} from "../editorHelpers";

const originalSelection = {
  selectedIds: ["adult:0:100", "adult:1:101", "child:0:200", "child:1:201"],
  assignedPassengerCount: 4,
  assignedChildExplicitPriceMap: {
    "child:0:200": 30,
    "child:1:201": 45,
  },
  childPercentageMap: {
    "child:0:200": 50,
    "child:1:201": 75,
  },
  convertedChildToAdultMap: { "child:1:201": true },
};

const reducedSelection = selectAssignedBeneficiaries(originalSelection, [
  "adult:0:100",
  "child:0:200",
  "child:1:201",
  "adult:9:should-not-be-added",
]);

assert.deepEqual(reducedSelection.selectedIds, [
  "adult:0:100",
  "child:0:200",
  "child:1:201",
]);
assert.equal(reducedSelection.assignedPassengerCount, 3);
assert.deepEqual(reducedSelection.assignedChildExplicitPriceMap, {
  "child:0:200": 30,
});
assert.deepEqual(reducedSelection.convertedChildToAdultMap, {
  "child:1:201": true,
});

const withoutFirstChild = selectAssignedBeneficiaries(reducedSelection, [
  "adult:0:100",
  "child:1:201",
]);
assert.deepEqual(withoutFirstChild.assignedChildExplicitPriceMap, {});
assert.deepEqual(withoutFirstChild.childPercentageMap, {});
assert.deepEqual(withoutFirstChild.convertedChildToAdultMap, {
  "child:1:201": true,
});

const tariff = syncTariffWithReservationPricing({
  tariff: { precio: 100, precio_original: 200 },
  serviceType: "tickets",
  passengerSelection: withoutFirstChild,
  unitPrice: 100,
  fallbackTotal: 4,
  precioAdultoDividido: false,
  preserveGroupedTotal: true,
});
const flat = buildAssignedFlatPricingState({
  tariff,
  passengerSelection: tariff.passengerSelection,
  precioAdultoDividido: false,
});

assert.deepEqual(flat.assignedBeneficiariosAdultos, [
  { id: "adult:0:100" },
  { id: "child:1:201", child_origin: "child:1:201" },
]);
assert.deepEqual(flat.assignedBeneficiariosNinos, []);
assert.equal(flat.assignedPrecioTotal, 200);

console.log("assignedBeneficiaries.test.ts: PASS");
