import assert from "node:assert/strict";
import { applyQuotedServiceValidation } from "../validationState";

const quoted = {
  servicioId: 55,
  parentService: { id: 10, nombre: "Proveedor cotizado" },
  childService: { id: 20, nombre: "Servicio cotizado" },
  tariff: { precio: 80 },
  isAssigned: false,
};

const internal = applyQuotedServiceValidation(
  quoted,
  {
    assignedService: {
      parentService: quoted.parentService,
      childService: quoted.childService,
      tariff: { precio: 45 },
    },
  },
  { source: "internal", tariff_id: 900, tariff_year: 2026 },
);

assert.equal(internal.isAssigned, true);
assert.equal(internal.assignedParentService, quoted.parentService);
assert.equal(internal.assignedChildService, quoted.childService);
assert.equal(internal.assignedTariff.precio, 45);
assert.equal(internal.validationSource, "internal");
assert.equal(internal.validationTariffId, 900);
assert.equal(internal.validationTariffYear, 2026);

const fallback = applyQuotedServiceValidation(
  quoted,
  {
    assignedService: {
      parentService: quoted.parentService,
      childService: quoted.childService,
      tariff: quoted.tariff,
    },
  },
  { source: "quoted_fallback", tariff_id: null, tariff_year: 2026 },
);
assert.equal(fallback.assignedTariff.precio, 80);
assert.equal(fallback.validationSource, "quoted_fallback");
assert.equal(fallback.validationTariffId, null);

console.log("validationState.test.ts: PASS");
