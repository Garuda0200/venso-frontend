import test from "node:test";
import assert from "node:assert/strict";
import { createUnifiedService, updateSingleServicePricesForPassengerChange, updateServicePricesForPassengerChange } from "../../../../utils/unifiedServiceManager";
import { getServiceCapacity } from "../serviceTypeMapper";

const people = { adults: [{ id: "A" }, { id: "B" }], children: [{ id: "C" }, { id: "D" }] };
const ids = ["adult:0:A", "child:0:C", "adult:1:B", "child:1:D"];
const quiet = (callback: () => any) => {
  const previous = console.log;
  console.log = () => {};
  try { return callback(); } finally { console.log = previous; }
};
const create = (capacity: number | null, selectedIds = ids) => quiet(() => createUnifiedService(
  { typeService: "endoses", id_endose: 7, nombre_agencia: "Andina" },
  { id_tipotour: 19, id_endose: 7, capacidad: capacity, tipo_guiado: "Tour" },
  { precio: 120, precio_original: 120, moneda: "dolares" }, people, "compartido",
  { selectedIds, childPriceMap: { "child:0:C": 0, "child:1:D": 15 } },
));

test("crear endose respeta cupos físicos aunque el niño sea gratis", () => {
  const service = create(2);
  assert.deepEqual(service.assignedPassengerIds, ids.slice(0, 2));
  assert.equal(service.assignedPassengerCount, 2);
  assert.ok(!Object.hasOwn(service.assignedChildExplicitPriceMap, "child:1:D"));
  assert.equal(service.capacidadLimite, true);
  assert.equal(getServiceCapacity(service), 2);
});
test("edición de beneficiarios nunca excede el endose y purga precios de niños excluidos", () => {
  const service = create(2);
  const updated = quiet(() => updateSingleServicePricesForPassengerChange({ ...service, assignedPassengerIds: ids, assignedChildExplicitPriceMap: { "child:0:C": 0, "child:1:D": 15 } }, 4));
  assert.equal(updated.assignedPassengerIds.length, 2);
  assert.ok(!Object.hasOwn(updated.assignedChildExplicitPriceMap, "child:1:D"));
});
test("reconciliación del itinerario conserva IDs y límite al cambiar pasajeros", () => {
  const service = create(2);
  const updated = quiet(() => updateServicePricesForPassengerChange([service], people));
  assert.equal(updated[0].assignedPassengerIds.length, 2);
  assert.deepEqual(updated[0].assignedPassengerIds, service.assignedPassengerIds);
});
test("endose sin capacidad sigue por persona y selección vacía sigue vacía", () => {
  const service = create(null);
  assert.equal(service.assignedPassengerIds.length, 4);
  assert.equal(service.capacidadLimite, false);
  assert.equal(getServiceCapacity(service), null);
  assert.deepEqual(create(2, []).assignedPassengerIds, []);
});
