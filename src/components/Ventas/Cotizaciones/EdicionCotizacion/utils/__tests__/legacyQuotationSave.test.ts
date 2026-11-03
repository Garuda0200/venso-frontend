import test from "node:test";
import assert from "node:assert/strict";
import { hydrateItinerarioFromDB, cleanItinerarioForDB } from "../itinerarioCleanupUtils";
import { resolveQuotationSavePricing } from "../quotationSavePricing";
import { getServiceBeneficiarySnapshot } from "../passengerPricingState";
import { isAdultPassengerId, isChildPassengerId } from "../passengerBeneficiaryIdentity";
import { updateServicePricesForPassengerChange } from "../unifiedServiceManager";
import { getPassengerPresentation } from "../passengerPricingPresentation";
import { passengerIdMatchesSet } from "../igvUtils";
import { executeTicketPriceEditor } from "../../../../../../tests/contracts/ticketPriceEditorHarness";

const copy = value => JSON.parse(JSON.stringify(value));
const fixture = (type = "tickets", first = 1, scope = "main") => {
  const ids = [0, 1, 2].map(index => `adult-${index + first}`);
  const peopleDetails = { adults: ids.map((key, index) => ({ id: 101 + index, passenger_key: key })), children: [] };
  const service: any = { id: 34, typeService: type, parentService: { typeService: type },
    childService: { id_ticket: 1, id_tipotour: 1, entrada: "Entrada QA", tipo_usuario: "adulto", procedencia: "extranjero", capacidad: null },
    precioServicio: 47.5, precioTotal: 47.5, tipoPrecio: "compartido", moneda: "dolares",
    beneficiariosAdultos: ids.map(id => ({ id })), beneficiariosNinos: [],
  };
  const days = hydrateItinerarioFromDB([{ numero: 1, titulo: "Día heredado", servicios: [service] }]);
  return { peopleDetails, peopleCount: { adults: 3, children: 0 }, cantidadpersonas: 3, precio_it_adulto: 15.83,
    itinerario: scope === "main" ? days : [], itinerario_externo: scope === "external" ? days : [],
    additionalCosts: { fee: "0", feeMode: "percentage" } };
};
const bases = pricing => pricing.pricing_snapshot.parts.filter(part => part.audience === "adult")
  .reduce((sum, part) => sum + part.services * part.beneficiaries, 0) / pricing.pricing_snapshot.people.adults;

test("legacy keys are classified without rewriting or aliasing their numbering", () => {
  for (const key of ["adult-0", "adult-1", "adult:1", "adult:0:101"]) assert.ok(isAdultPassengerId(key));
  for (const key of ["child-0", "child-1", "child:1", "child:0:201"]) assert.ok(isChildPassengerId(key));
  for (const key of ["adult-", "adult-other", "adult--1", "child-1"]) assert.equal(isAdultPassengerId(key), false);
});

for (const type of ["tickets", "restaurantes", "endoses", "transportes", "guias", "trenes", "vuelos", "extras"]) {
  for (const first of [0, 1]) for (const scope of ["main", "external"]) test(`${type}, legacy base ${first}, ${scope}: no-op keeps all beneficiaries and prices`, () => {
    const quote = fixture(type, first, scope);
    const field = scope === "main" ? "itinerario" : "itinerario_externo";
    const before = resolveQuotationSavePricing(quote);
    assert.equal(before.total_final, 48);
    assert.equal(before.pricing_snapshot.parts.some(part => part.isServiceCharge), false);
    const saved = cleanItinerarioForDB(quote[field]);
    assert.deepEqual(saved[0].servicios[0].beneficiariosAdultos, quote[field][0].servicios[0].beneficiariosAdultos);
    assert.equal(saved[0].servicios[0].precioServicio, 47.5);
    const reopened = { ...quote, [field]: hydrateItinerarioFromDB(saved) };
    assert.deepEqual(resolveQuotationSavePricing(reopened), before);
  });
}

for (const scope of ["main", "external"]) test(`${scope}: editing a legacy ticket through the real price callback persists the same adult base`, () => {
  const quote = fixture("tickets", 1, scope);
  const field = scope === "main" ? "itinerario" : "itinerario_externo";
  for (const amount of [15, 0, 25.33]) {
    const service = executeTicketPriceEditor(quote[field][0].servicios[0], amount, scope, quote.peopleDetails);
    const selected = getServiceBeneficiarySnapshot(service).adultIds;
    assert.equal(selected.length, 3);
    quote.peopleDetails.adults.forEach((person, index) => {
      assert.ok(selected.some(id => passengerIdMatchesSet(id, getPassengerPresentation(person, "adult", index).aliases)));
    });
    const days = [{ ...quote[field][0], servicios: [service] }];
    const pricing = resolveQuotationSavePricing({ ...quote, [field]: days });
    assert.equal(pricing.pricing_snapshot.parts.some(part => part.isServiceCharge), false);
    const saved = cleanItinerarioForDB(days);
    assert.equal(saved[0].servicios[0].beneficiariosAdultos.length, 3);
    assert.equal(resolveQuotationSavePricing({ ...quote, [field]: hydrateItinerarioFromDB(saved) }).total_final, pricing.total_final);
  }
});

test("adding a current service to a legacy file adds its price instead of an invented charge", () => {
  const quote = fixture();
  const added = { typeService: "endoses", parentService: { typeService: "endoses" }, childService: { capacidad: null },
    tipoPrecio: "privado", moneda: "dolares", precioServicio: 4.17, precioTotal: 12.51,
    beneficiariosAdultos: [1, 2, 3].map(index => ({ id: `adult:${index}` })), beneficiariosNinos: [] };
  quote.itinerario[0].servicios.push(...hydrateItinerarioFromDB([{ numero: 1, servicios: [added] }])[0].servicios);
  const pricing = resolveQuotationSavePricing(quote);
  assert.equal(bases(pricing), 20);
  assert.equal(pricing.total_final, 60);
  assert.equal(pricing.pricing_snapshot.parts.some(part => part.isServiceCharge), false);
  assert.equal(cleanItinerarioForDB(quote.itinerario)[0].servicios[0].beneficiariosAdultos.length, 3);
});

for (const first of [0, 1]) test(`recalculating a legacy subset based at ${first} keeps its exact roster members`, () => {
  const quote = fixture("restaurantes", first);
  const selected = quote.itinerario[0].servicios[0];
  selected.beneficiariosAdultos = [selected.beneficiariosAdultos[2]];
  delete selected.assignedPassengerIds; delete selected.passengerSelection;
  const repriced = updateServicePricesForPassengerChange([selected], quote.peopleDetails, { preserveExistingSelection: true })[0];
  const ids = getServiceBeneficiarySnapshot(repriced).adultIds;
  assert.equal(ids.length, 1);
  assert.ok(passengerIdMatchesSet(ids[0], getPassengerPresentation(quote.peopleDetails.adults[2], "adult", 2).aliases));
});

test("legacy children, explicit fares and child-as-adult conversions survive saving and recalculation", () => {
  const quote = fixture("restaurantes");
  const service = cleanItinerarioForDB(quote.itinerario)[0].servicios[0];
  quote.peopleDetails.children = [{ id: 201, passenger_key: "child-1" }, { id: 202, passenger_key: "child-2" }] as any;
  quote.peopleCount.children = 2; quote.cantidadpersonas = 5;
  service.beneficiariosAdultos.push({ id: "child-1", child_origin: "child-1" });
  service.beneficiariosNinos = [{ id: "child-2", precio: 7 }];
  service.precioServicio = 80; service.precioTotal = 87; delete service.tariff;
  const days = hydrateItinerarioFromDB([{ numero: 1, servicios: [service] }]);
  const pricing = resolveQuotationSavePricing({ ...quote, itinerario: days });
  const saved = cleanItinerarioForDB(days);
  assert.equal(saved[0].servicios[0].beneficiariosAdultos.length, 4);
  assert.deepEqual(saved[0].servicios[0].beneficiariosNinos, [{ id: "child-2", precio: 7 }]);
  assert.equal(resolveQuotationSavePricing({ ...quote, itinerario: hydrateItinerarioFromDB(saved) }).total_final, pricing.total_final);
  const repriced = updateServicePricesForPassengerChange(copy(days[0].servicios), quote.peopleDetails, { preserveExistingSelection: true })[0];
  assert.equal(getServiceBeneficiarySnapshot(repriced).convertedEntries.length, 1);
  assert.equal(getServiceBeneficiarySnapshot(repriced).childIds.length, 1);
  assert.equal(getServiceBeneficiarySnapshot(repriced).selectedIds.filter(isChildPassengerId).length, 2);
});
