import assert from "node:assert/strict";
import test from "node:test";
import {
  getSpecializedPaymentGroups,
  getSpecializedServiceType,
} from "../specializedPaymentGroups";

const itinerary = [{
  numero: 2,
  titulo: "Cusco",
  servicios: [
    { id: 1, typeService: "vuelo" },
    { id: 2, assignedService: { typeService: "entradas" } },
    { id: 3, typeService: "hoteles" },
  ],
}];

test("agrupa vuelos y entradas sin mezclar servicios de lote", () => {
  const flights = getSpecializedPaymentGroups(itinerary, "vuelos");
  const tickets = getSpecializedPaymentGroups(itinerary, "tickets");
  assert.equal(flights.length, 1);
  assert.equal(flights[0].services[0].id, 1);
  assert.equal(flights[0].services[0]._sourceServiceIndex, 0);
  assert.equal(tickets[0].services[0].id, 2);
  assert.equal(getSpecializedServiceType(itinerary[0].servicios[2]), "hoteles");
});
