import test from "node:test";
import assert from "node:assert/strict";

import { calculateAndSetDividedPrice } from "../priceCalculations";

const buildEndose = (childService = {}) => ({
  parentService: { typeService: "endoses", id_endose: 7 },
  childService: { id_tipotour: 19, ...childService },
  tariff: { precio: 120, precio_original: 120 },
  tipoPrecio: "privado",
});

test("endose without explicit capacity stays per-person regardless of guiding label", () => {
  const service = buildEndose({ tipo_guiado: "Local Reps" });
  const result = calculateAndSetDividedPrice(service, 4);

  assert.equal(result.tariff.precio, 120);
  assert.equal(result.tariff.precio_original, 120);
});

test("selected shared tariff is divided by beneficiaries, not provider conventions", () => {
  const service = buildEndose({ tipo_guiado: "Compartido", capacidad: 4 });
  service.tipoPrecio = "compartido";
  const result = calculateAndSetDividedPrice(service, 4);

  assert.equal(result.tariff.precio, 30);
  assert.equal(result.tariff.precio_original, 120);
});

test("private price is not divided even for a capacity-limited tour", () => {
  const result = calculateAndSetDividedPrice(buildEndose({ capacidad: 4 }), 2);
  assert.equal(result.tariff.precio, 120);
});
test("shared price without capacity is divided and capacity is not the divisor", () => {
  const service = buildEndose({ capacidad: 8 });
  service.tipoPrecio = "compartido";
  assert.equal(calculateAndSetDividedPrice(service, 2).tariff.precio, 60);
  service.childService = {};
  assert.equal(calculateAndSetDividedPrice(service, 2).tariff.precio, 60);
});
