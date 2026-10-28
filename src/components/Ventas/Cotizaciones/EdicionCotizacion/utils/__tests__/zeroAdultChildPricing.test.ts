import test from "node:test";
import assert from "node:assert/strict";
import { hydrateServiceFromDB, cleanItinerarioForDB, hydrateItinerarioFromDB } from "../itinerarioCleanupUtils.js";
import { applyServicePricingRuntime } from "../servicePricingRuntime.js";
import { buildServiceBeneficiaryPricingLedger, buildServicePricingGroups } from "../serviceBeneficiaryPricingLedger.js";
import { buildSummaryPricingCore } from "../summaryPricingCore.js";
import { resolveQuotationSavePricing } from "../quotationSavePricing.js";

const peopleDetails = {
  adults: [{ id: 101 }],
  children: [{ id: 201, age: 8 }, { id: 202, age: 10 }],
};
const currentIds = ["adult:0:101", "child:0:201", "child:1:202"];

// A reopened quotation keeps the original beneficiary IDs, while its editor
// remaps runtime IDs to the current roster. Both identify the same two slots.
const reopenedService = (type, childPrice, adultPrice = 0) => {
  const hydrated = hydrateServiceFromDB({
    id: `reopened-${type}`, typeService: type,
    parentService: { typeService: type },
    childService: type === "endoses" ? { tour: { tipo_guiado: "LOCAL REPS (1-3 PAX)" } } : {},
    precioServicio: adultPrice, precioTotal: adultPrice + childPrice * 2,
    tipoPrecio: "compartido", moneda: "dolares",
    beneficiariosAdultos: [{ id: "adult:0:old-adult" }],
    beneficiariosNinos: [
      { id: "child:0:child-0", precio: childPrice },
      { id: "child:1:child-1", precio: childPrice },
    ],
  });
  return applyServicePricingRuntime({
    ...hydrated,
    assignedPassengerIds: currentIds,
    assignedChildExplicitPriceMap: { [currentIds[1]]: childPrice, [currentIds[2]]: childPrice },
    passengerSelection: { ...hydrated.passengerSelection, selectedIds: currentIds },
    children: undefined,
  });
};

for (const [type, childPrice] of [["transportes", 13.34], ["endoses", 23.34]]) {
  for (const scope of ["main", "external"]) {
    test(`${scope}/${type}: adulto gratis conserva la tarifa de cada niño al reabrir`, () => {
      const service = reopenedService(type, childPrice);
      const before = JSON.stringify(service);
      const ledger = buildServiceBeneficiaryPricingLedger({
        [scope === "main" ? "days" : "externalDays"]: [{ numero: 1, servicios: [service] }],
        peopleDetails,
      });
      assert.equal(ledger.complete, true);
      assert.deepEqual(ledger.unallocated, [], "La tarifa infantil no es un cargo fijo del servicio");
      assert.deepEqual([...ledger.byPassenger.values()].map(rows => rows.reduce((sum, row) => sum + row.amount, 0)), [0, childPrice, childPrice]);
      assert.equal(JSON.stringify(service), before, "El cálculo no modifica el estado del editor");
      if (scope === "main") {
        assert.deepEqual(buildServicePricingGroups(ledger).map(group => [group.audience, group.beneficiaries, group.value]), [["adult", 1, 0], ["child", 2, childPrice]]);
      }
    });
  }
}

test("resumen y guardado conservan las bases infantiles al guardar y reabrir varias veces", () => {
  let quote = {
    peopleDetails, peopleCount: { adults: 1, children: 2 },
    additionalCosts: { fee: "25", feeMode: "percentage" },
    itinerario: [{ numero: 1, servicios: [reopenedService("transportes", 13.34), reopenedService("endoses", 23.34)] }],
    itinerario_externo: [{ numero: 1, servicios: [reopenedService("vuelos", 10)] }],
  };
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const core = buildSummaryPricingCore(quote);
    const childParts = core.parts.filter(part => part.audience === "child");
    assert.equal(core.parts.some(part => part.isServiceCharge), false);
    assert.equal(childParts.reduce((sum, part) => sum + part.services * part.beneficiaries, 0), 73.36);
    assert.equal(childParts.reduce((sum, part) => sum + part.external * part.beneficiaries, 0), 20);
    const saved = resolveQuotationSavePricing(quote);
    assert.equal(saved.total_final, 112);
    assert.equal(saved.subtotal_final, 92);
    const cleaned = cleanItinerarioForDB(quote.itinerario);
    assert.equal(cleaned[0].servicios.reduce((sum, service) => sum + service.beneficiariosNinos.reduce((n, child) => n + child.precio, 0), 0), 73.36);
    quote = { ...quote, ...saved, itinerario: hydrateItinerarioFromDB(cleaned), itinerario_externo: hydrateItinerarioFromDB(cleanItinerarioForDB(quote.itinerario_externo)) };
    delete quote.pricing_snapshot;
  }
});

test("cero infantil explícito permanece gratis y los importes positivos no dependen del orden de los alias", () => {
  for (const price of [0, 13.34]) {
    const service = reopenedService("transportes", price);
    service.children = Object.fromEntries(Object.entries(service.children).reverse());
    const ledger = buildServiceBeneficiaryPricingLedger({ days: [{ servicios: [service] }], peopleDetails });
    assert.deepEqual(ledger.unallocated, []);
    assert.deepEqual([...ledger.byPassenger.values()].map(rows => rows[0]?.amount), [0, price, price]);
  }
});

test("la edición infantil vigente prevalece sobre el precio guardado sin modificar la asignación de reservas", () => {
  const original = reopenedService("transportes", 13.34);
  const assigned = [{ id: "child:0:reservation-pax", precio: 99 }];
  const edited = applyServicePricingRuntime({
    ...original,
    precioTotal: 7,
    assignedChildExplicitPriceMap: { [currentIds[1]]: 0, [currentIds[2]]: 7 },
    assignedBeneficiariosAdultos: [], assignedBeneficiariosNinos: assigned,
    children: undefined,
  });
  const ledger = buildServiceBeneficiaryPricingLedger({ days: [{ servicios: [edited] }], peopleDetails });
  assert.equal(ledger.complete, true);
  assert.deepEqual(ledger.unallocated, []);
  assert.deepEqual([...ledger.byPassenger.values()].map(rows => rows[0]?.amount), [0, 0, 7]);
  assert.deepEqual(edited.assignedBeneficiariosNinos, assigned);
  const persisted = cleanItinerarioForDB([{ servicios: [edited] }])[0].servicios[0];
  assert.deepEqual(persisted.beneficiariosNinos.map(child => child.precio), [0, 7]);
});
