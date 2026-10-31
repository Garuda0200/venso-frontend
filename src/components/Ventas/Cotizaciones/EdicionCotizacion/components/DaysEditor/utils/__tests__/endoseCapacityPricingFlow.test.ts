import test from "node:test";
import assert from "node:assert/strict";
import { createUnifiedService, updateServicePricesForPassengerChange, updateSingleServicePricesForPassengerChange } from "../../../../utils/unifiedServiceManager";
import { getServicePricingSnapshot } from "../../../../utils/servicePricingRuntime";
import { cleanDayForDB, hydrateDayFromDB } from "../../../../utils/itinerarioCleanupUtils";
import { resolveQuotationSavePricing } from "../../../../utils/quotationSavePricing";
import { executeServicePriceEditor, executeServiceChildPricingAction } from "../../../../../../../../tests/contracts/ticketPriceEditorHarness";

const people = { adults: Array.from({ length: 4 }, (_, i) => ({ id: `A${i}`, pais: "Colombia" })), children: [] };
const ids = people.adults.map((person, i) => `adult:${i}:${person.id}`);
const create = (mode, capacity, peopleDetails = people, selectedIds = ids, extra = {}) => createUnifiedService(
  { typeService: "endoses", id_endose: 7, nombre_agencia: "Operador de prueba" },
  { id_tipotour: 19, id_endose: 7, capacidad: capacity, tipo_guiado: "Valle Sagrado" },
  { precio: 25, moneda: "dolares", tipoPrecio: mode }, peopleDetails, "privado",
  { selectedIds, pricingMode: "fixed", ...extra },
);

for (const mode of ["compartido", "privado"]) for (const capacity of [null, 10, 4, 2]) {
  test(`${mode}, capacidad ${capacity}: agregar, recalcular y reabrir cobra beneficiarios, nunca cupos disponibles`, () => {
    const service = create(mode, capacity);
    const count = Math.min(4, capacity ?? 4);
    const expectedTotal = mode === "compartido" ? 25 : 25 * count;
    assert.equal(service.assignedPassengerIds.length, count);
    for (const current of [service, updateSingleServicePricesForPassengerChange(service, 4),
      ...updateServicePricesForPassengerChange([service], people, { preserveExistingSelection: true })]) {
      const snapshot = getServicePricingSnapshot(current);
      assert.equal(snapshot.precioAdult, mode === "compartido" ? 25 / count : 25);
      assert.equal(snapshot.total, expectedTotal);
      const saved = cleanDayForDB({ numero: 1, tipoServicio: "mixto", servicios: [current] });
      assert.equal(saved.servicios[0].precioServicio, 25);
      assert.equal(saved.servicios[0].beneficiariosAdultos.length, count);
      assert.equal(getServicePricingSnapshot(hydrateDayFromDB(saved).servicios[0]).total, expectedTotal);
    }
  });
}

for (const scope of ["main", "external"]) for (const mode of ["compartido", "privado"]) for (const capacity of [null, 10, 2]) {
  test(`${scope}, ${mode}, capacidad ${capacity}: editar a 25 por adulto y cambiar beneficiarios mantiene precio y total`, () => {
    const service = create(mode, capacity);
    const count = Math.min(4, capacity ?? 4);
    const edited = executeServicePriceEditor(service, 25, scope, people);
    assert.equal(getServicePricingSnapshot(edited).precioAdult, 25);
    assert.equal(getServicePricingSnapshot(edited).total, 25 * count);
    assert.equal(edited.precioServicio, mode === "compartido" ? 25 * count : 25);
    const saved = cleanDayForDB({ numero: 1, tipoServicio: "mixto", servicios: [edited] });
    assert.equal(saved.servicios[0].precioServicio, mode === "compartido" ? 25 * count : 25);
    assert.equal(saved.servicios[0].beneficiariosAdultos.length, count);
    const reopened = hydrateDayFromDB(saved);
    assert.equal(getServicePricingSnapshot(reopened.servicios[0]).total, 25 * count);
    const quote = { peopleDetails: people, peopleCount: { adults: 4, children: 0 }, additionalCosts: { fee: "25", feeMode: "percentage" },
      itinerario: scope === "main" ? [saved] : [], itinerario_externo: scope === "external" ? [saved] : [] };
    const shown = resolveQuotationSavePricing({ ...quote, [scope === "main" ? "itinerario" : "itinerario_externo"]: [{ numero: 1, servicios: [edited] }] });
    assert.equal(resolveQuotationSavePricing({ ...quote, [scope === "main" ? "itinerario" : "itinerario_externo"]: [reopened] }).total_final, shown.total_final);
    const smaller = updateSingleServicePricesForPassengerChange({ ...edited, assignedPassengerIds: ids.slice(0, 1) }, 4);
    assert.equal(getServicePricingSnapshot(smaller).total, mode === "compartido" ? 25 * count : 25);
  });
}

for (const mode of ["compartido", "privado"]) test(`${mode}: capacidad 10 con dos adultos y dos niños cobra solo sus importes configurados`, () => {
  const mixed = { adults: people.adults.slice(0, 2), children: [{ id: "C1" }, { id: "C2" }] };
  const mixedIds = [...ids.slice(0, 2), "child:0:C1", "child:1:C2"];
  const service = create(mode, 10, mixed, mixedIds, { childPriceMap: { "child:0:C1": 0, "child:1:C2": 12.5 } });
  assert.equal(service.tariff.precio, mode === "compartido" ? 12.5 : 25);
  const expected = mode === "compartido" ? 37.5 : 62.5;
  assert.equal(getServicePricingSnapshot(service).total, expected);
  for (const scope of ["main", "external"]) {
    const edited = executeServicePriceEditor(service, 20, scope, mixed);
    const total = 52.5;
    assert.equal(getServicePricingSnapshot(edited).total, total);
    const reopened = hydrateDayFromDB(cleanDayForDB({ numero: 1, servicios: [edited] }));
    assert.equal(getServicePricingSnapshot(reopened.servicios[0]).total, total);
  }
});

for (const mode of ["compartido", "privado"]) test(`${mode}: un niño gratuito ocupa cupo sin multiplicar el importe adulto`, () => {
  const mixed = { adults: people.adults.slice(0, 1), children: [{ id: "C1" }, { id: "C2" }] };
  const service = create(mode, 2, mixed, [ids[0], "child:0:C1", "child:1:C2"], { childPriceMap: { "child:0:C1": 0, "child:1:C2": 12.5 } });
  assert.deepEqual(service.assignedPassengerIds, [ids[0], "child:0:C1"]);
  assert.equal(service.tariff.precio, 25);
  assert.equal(getServicePricingSnapshot(service).total, 25);
  const empty = create(mode, 10, people, []);
  assert.equal(empty.assignedPassengerIds.length, 0);
  assert.equal(getServicePricingSnapshot(empty).total, 0);
});

for (const scope of ["main", "external"]) for (const mode of ["compartido", "privado"]) test(`${scope}, ${mode}: editar a cero y volver a ingresar precio no restaura el importe anterior`, () => {
  let service = create(mode, 10);
  for (const price of [0, 10.25, 0, 25]) {
    service = executeServicePriceEditor(service, price, scope, people);
    assert.equal(getServicePricingSnapshot(service).total, price * 4);
    service = hydrateDayFromDB(cleanDayForDB({ numero: 1, servicios: [service] })).servicios[0];
    assert.equal(getServicePricingSnapshot(service).total, price * 4);
  }
});

for (const capacity of [null, 10]) test(`capacidad ${capacity}: ausencia de selección usa los cuatro pax y una selección envuelta conserva el subconjunto`, () => {
  const args = [{ typeService: "endoses" }, { id_tipotour: 19, capacidad: capacity }, { precio: 25, moneda: "dolares", tipoPrecio: "privado" }, people, "privado"] as const;
  assert.equal(getServicePricingSnapshot(createUnifiedService(...args, null)).total, 100);
  const subset = createUnifiedService(...args, { passengerSelection: { selectedIds: ids.slice(0, 2) } });
  assert.deepEqual(subset.assignedPassengerIds, ids.slice(0, 2));
  assert.equal(getServicePricingSnapshot(subset).total, 50);
});

for (const mode of ["compartido", "privado"]) test(`${mode}: el porcentaje infantil se calcula sobre la tarifa adulta, no sobre los cupos`, () => {
  const mixed = { adults: people.adults.slice(0, 2), children: [{ id: "C1" }, { id: "C2" }] };
  const service = create(mode, 10, mixed, [...ids.slice(0, 2), "child:0:C1", "child:1:C2"], { pricingMode: "percentage", childPercentageMap: { "child:0:C1": 0, "child:1:C2": 50 } });
  const total = mode === "compartido" ? 31.25 : 62.5;
  assert.equal(getServicePricingSnapshot(service).total, total);
  assert.equal(service.tariff.precio, mode === "compartido" ? 12.5 : 25);
  const next = updateSingleServicePricesForPassengerChange(service, 4);
  assert.equal(getServicePricingSnapshot(next).total, total);
});

for (const scope of ["main", "external"]) for (const mode of ["compartido", "privado"]) for (const capacity of [null, 10]) {
  test(`${scope}, ${mode}, capacidad ${capacity}: tarifa adulta y gratuidad infantil respetan la modalidad al guardar`, () => {
    const mixed = { adults: people.adults.slice(0, 2), children: [{ id: "C1" }, { id: "C2" }] };
    let service = create(mode, capacity, mixed, [...ids.slice(0, 2), "child:0:C1", "child:1:C2"], { childPriceMap: { "child:0:C1": 0, "child:1:C2": 12.5 } });
    const assertTotal = (expected) => {
      assert.equal(getServicePricingSnapshot(service).total, expected);
      const reopened = hydrateDayFromDB(cleanDayForDB({ numero: 1, servicios: [service] })).servicios[0];
      assert.equal(getServicePricingSnapshot(reopened).total, expected);
      assert.equal(reopened.tipoPrecio, mode);
      assert.equal(getServicePricingSnapshot(reopened).assignedIds.length, 4);
    };
    service = executeServiceChildPricingAction(service, "applyUniformChildPrice", scope, mixed, "adult");
    assertTotal(mode === "compartido" ? 25 : 100);
    service = executeServiceChildPricingAction(service, "applyUniformChildPrice", scope, mixed, "zero");
    assertTotal(mode === "compartido" ? 25 : 50);
    service = executeServiceChildPricingAction(service, "handleConvertChildToAdult", scope, mixed, "child:0:C1");
    assertTotal(mode === "compartido" ? 25 : 75);
    service = executeServiceChildPricingAction(service, "handleConvertChildToAdult", scope, mixed, "child:1:C2");
    assertTotal(mode === "compartido" ? 25 : 100);
    service = executeServiceChildPricingAction(service, "handleRevertAdultToChild", scope, mixed, "child:0:C1");
    assertTotal(mode === "compartido" ? 25 : 75);
    service = executeServiceChildPricingAction(service, "handleRevertAdultToChild", scope, mixed, "child:1:C2");
    assertTotal(mode === "compartido" ? 25 : 50);
  });
}
