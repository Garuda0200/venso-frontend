import test from "node:test";
import assert from "node:assert/strict";

import { calculateAndSetDividedPrice } from "../priceCalculations";

const buildEndose = (childService = {}) => ({
  parentService: { typeService: "endoses", id_endose: 7 },
  childService: { id_tipotour: 19, ...childService },
  tariff: { precio: 120, precio_original: 120 },
});

test("endose without explicit capacity stays per-person regardless of guiding label", () => {
  const service = buildEndose({ tipo_guiado: "Local Reps" });
  const result = calculateAndSetDividedPrice(service, 4);

  assert.equal(result.tariff.precio, 120);
  assert.equal(result.tariff.precio_original, 120);
});

test("endose with explicit capacity can use shared price by capacity", () => {
  const service = buildEndose({ tipo_guiado: "Compartido", capacidad: 4 });
  const result = calculateAndSetDividedPrice(service, 4);

  assert.equal(result.tariff.precio, 30);
  assert.equal(result.tariff.precio_original, 120);
});
