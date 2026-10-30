import test from "node:test";
import assert from "node:assert/strict";
import * as pricingRuntime from "../servicePricingRuntime";
import { cleanDayForDB, hydrateDayFromDB } from "../itinerarioCleanupUtils";
import { resolveQuotationSavePricing } from "../quotationSavePricing";
import { executeTicketPriceEditor } from "../../../../../../tests/contracts/ticketPriceEditorHarness";

const people = { adults: Array.from({ length: 5 }, (_, i) => ({ id: `T${i}`, pais: "Colombia" })), children: [] };
const ids = people.adults.map((p, i) => `adult:${i}:${p.id}`);
const ticket = (count = 5, price = 56) => ({
  id: "edited-ticket", typeService: "tickets", tipoPrecio: "privado",
  parentService: { typeService: "tickets" },
  childService: { id_ticket: 2, entrada: "BTG", procedencia: "extranjero", tipo_usuario: "adulto", ticketAdultUnitPrice: 56 },
  ticketAdultUnitPrice: 56, ticketProcedenciaFilter: "extranjero", ticketPassengerTargetGroup: "adult",
  ticketChildPricingMode: "none", assignedPassengerIds: ids.slice(0, count), assignedPassengerCount: count,
  beneficiariosAdultos: ids.slice(0, count).map(id => ({ id })), beneficiariosNinos: [],
  precioServicio: price, precio_servicio: price, precioTotal: price * count, precio_total: price * count,
  passengerSelection: { selectedIds: ids.slice(0, count), ticketProcedenciaFilter: "extranjero", ticketPassengerTargetGroup: "adult" },
  tariff: { precio: price, precio_adult: price, precio_original: price * count, precio_original_with_child_extras: price * count, moneda: "dolares", tipo_precio: "privado" },
});
const runEdit = (service: any, price: number, scope: string) => {
  return executeTicketPriceEditor(service, price, scope, people);
};

for (const scope of ["main", "external"]) for (const price of [15, 25.33, 70, 0]) for (const count of [5, 3]) {
  test(`${scope}: editar ticket a ${price}, con ${count} beneficiarios, sincroniza el guardado`, () => {
    const edited = runEdit(ticket(count), price, scope);
    const total = Math.round(price * count * 100) / 100;
    assert.equal(edited.precioServicio, price, "The editable fare must replace the old persisted base");
    assert.equal(edited.precio_servicio, price);
    assert.equal(edited.tariff.precio_adult, price, "Legacy display caches must follow the edit too");
    assert.equal(edited.precioTotal, total, "An old total must not become a fictitious service charge");
    assert.equal(edited.precio_total, total);
    const itinerary = [{ numero: 1, servicios: [edited] }];
    const quote = { peopleDetails: people, peopleCount: { adults: 5, children: 0 }, additionalCosts: { fee: "25", feeMode: "percentage" },
      itinerario: scope === "main" ? itinerary : [], itinerario_externo: scope === "external" ? itinerary : [] };
    const shown = resolveQuotationSavePricing(quote);
    const saved = cleanDayForDB(itinerary[0]);
    assert.equal(saved.servicios[0].precioServicio, price);
    assert.equal(saved.servicios[0].beneficiariosAdultos.length, count);
    const reopened = hydrateDayFromDB(saved);
    assert.equal(pricingRuntime.getServicePricingSnapshot(reopened.servicios[0]).total, total);
    const after = resolveQuotationSavePricing({ ...quote, [scope === "main" ? "itinerario" : "itinerario_externo"]: [reopened] });
    assert.equal(after.total_final, shown.total_final);
    assert.equal(after.subtotal_final, shown.subtotal_final);
  });
}

test("ticket creado por Biblia a cero: editar varias veces no conserva la base anterior", () => {
  let current = ticket(5, 0);
  for (const price of [15, 0, 25.33, 70]) {
    current = runEdit(current, price, "main");
    assert.equal(current.precioServicio, price);
    current = hydrateDayFromDB(cleanDayForDB({ numero: 1, servicios: [current] })).servicios[0];
  }
});
