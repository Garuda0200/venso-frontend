import test from "node:test";
import assert from "node:assert/strict";
import { calculateDayTotals, calculateDayTotal, changeReservationServiceCurrency, buildAssignedFlatPricingState, getTariffBreakdown } from "../editorHelpers";
import { applyQuotedServiceValidation } from "../validationState";

function service({mode = "privado", adults = 2, children = [10, 0], amount = 40, currency = "dolares"} = {}) {
  const adultIds = Array.from({length: adults}, (_, index) => `adult:${index}:qa`);
  const childIds = children.map((_, index) => `child:${index}:qa`);
  const selection = {selectedIds: [...adultIds, ...childIds], assignedPassengerCount: adults + children.length,
    assignedChildExplicitPriceMap: Object.fromEntries(childIds.map((id, index) => [id, children[index]])),
    assignedChildExplicitCount: children.length, assignedChildExplicitPriceSum: children.reduce((sum, value) => sum + value, 0),
    convertedChildToAdultMap: {}, pricingMode: "fixed"};
  const total = (adults ? mode === "compartido" ? amount : amount * adults : 0) + children.reduce((sum, value) => sum + value, 0);
  const tariff = {moneda: currency, precio: mode === "compartido" ? amount / Math.max(1, adults) : amount,
    precio_original: mode === "compartido" ? amount : amount * adults, precio_original_with_child_extras: total,
    childExtrasTotal: children.reduce((sum, value) => sum + value, 0), passengerSelection: selection};
  const flat = buildAssignedFlatPricingState({tariff, passengerSelection: selection, tipoPrecio: mode});
  return {servicioId: 1, typeService: "transportes", isAssigned: true, tipoPrecio: mode, assignedTipoPrecio: mode,
    tariff: {precio: 999, moneda: "dolares"}, assignedMoneda: currency, assignedTasaCambio: currency === "dolares" ? 1 : 3.75,
    assignedTariff: tariff, assignedPassengerSelection: selection, assignedService: {tariff, passengerSelection: selection}, ...flat};
}

test("day totals preserve the native units and reject an ambiguous scalar", () => {
  const pen = service({adults: 1, children: [], amount: 150, currency: "soles"});
  const usd = service({adults: 1, children: [], amount: 40});
  assert.deepEqual(calculateDayTotals([pen, usd]), {PEN: 150, USD: 40});
  assert.throws(() => calculateDayTotal([pen, usd]), /moneda/);
  assert.equal(calculateDayTotal([pen]), 150);
});

test("currency conversion updates adult, child, total and assigned rate together without changing quoted tariff", () => {
  const original = service();
  const snapshot = JSON.stringify(original);
  const pen = changeReservationServiceCurrency(original, "PEN", {rate: 3.75});
  assert.equal(pen.assignedPrecioServicio, 150);
  assert.equal(pen.assignedPrecioTotal, 337.5);
  assert.equal(pen.assignedBeneficiariosNinos[0].precio, 37.5);
  assert.equal(pen.assignedBeneficiariosNinos[1].precio, 0);
  assert.equal(pen.assigned_tasa_cambio, 3.75);
  assert.equal(pen.assigned_moneda, "soles");
  assert.equal(pen.tariff, original.tariff);
  assert.equal(JSON.stringify(original), snapshot);
  const usd = changeReservationServiceCurrency(pen, "USD", {rate: 3.75});
  assert.equal(usd.assignedPrecioServicio, original.assignedPrecioServicio);
  assert.equal(usd.assignedPrecioTotal, original.assignedPrecioTotal);
  assert.equal(usd.assigned_tasa_cambio, 1);
});

test("shared amount remains one group charge; reversal restores cents including zero", () => {
  const original = service({mode: "compartido", adults: 3, children: [7.31, 0], amount: 120});
  const pen = changeReservationServiceCurrency(original, "PEN", {rate: 3.75});
  assert.equal(pen.assignedPrecioServicio, 450);
  assert.equal(pen.assignedPrecioTotal, 477.41);
  const usd = changeReservationServiceCurrency(pen, "USD", {rate: 3.75});
  assert.equal(usd.assignedPrecioTotal, 127.31);
  assert.equal(usd.assignedBeneficiariosNinos[0].precio, 7.31);
  assert.equal(usd.assignedBeneficiariosNinos[1].precio, 0);
});

test("child-only rows do not invent an adult charge, and zero is not replaced by a fallback", () => {
  const original = service({adults: 0, children: [7.31, 0], amount: 0});
  const pen = changeReservationServiceCurrency(original, "PEN", {rate: 3.75});
  assert.equal(pen.assignedBeneficiariosAdultos.length, 0);
  assert.equal(pen.assignedPrecioTotal, 27.41);
  assert.equal(buildAssignedFlatPricingState({tariff: {precio: 40, precio_original_with_child_extras: 0}, passengerSelection: {selectedIds: ["adult:1"]}}).assignedPrecioTotal, 0);
});

test("committed payments reject currency/rate edits even if legacy request has no ID", () => {
  for (const status of ["pending", "paid"]) {
    assert.throws(() => changeReservationServiceCurrency({...service(), paymentRequest: {}, payment_request: {status}}, "PEN", {rate: 3.75}), /solicitud/);
  }
  assert.throws(() => changeReservationServiceCurrency(service(), "PEN", {rate: 0}), /TC/);
  assert.throws(() => changeReservationServiceCurrency(service(), "PEN", {}), /TC/);
});

test("validation retains child price review metadata instead of silently hiding its source", () => {
  const row = applyQuotedServiceValidation({}, {}, {child_pricing_source: "quoted_currency_conversion", review_required: true, warnings: ["Confirma el precio infantil"]});
  assert.equal(row.validationChildPricingSource, "quoted_currency_conversion");
  assert.equal(row.validationReviewRequired, true);
  assert.deepEqual(row.validationWarnings, ["Confirma el precio infantil"]);
});


test("legacy paid flags and movements protect the same economic snapshot", () => {
  for (const fields of [{isPaid: true}, {is_paid: true}, {assignedService: {isPaid: true}}, {movimiento_id: "movement"}]) {
    assert.throws(() => changeReservationServiceCurrency({...service(), ...fields}, "PEN", {rate: 3.75}), /solicitud/);
  }
});

test("a missing row total is derived, while an explicit zero stays zero", () => {
  const selection = {assignedPassengerCount: 3, assignedChildExplicitCount: 1, assignedChildExplicitPriceSum: 7.31};
  assert.equal(getTariffBreakdown({precio: 20}, selection).total, 47.31);
  assert.equal(getTariffBreakdown({precio: 20, precio_original: 40}, selection).total, 47.31);
  assert.equal(getTariffBreakdown({precio: 20, precio_original_with_child_extras: 0}, selection).total, 0);
});
