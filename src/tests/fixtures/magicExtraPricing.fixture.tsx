import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import SortableService from "../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/SortableService/SortableService.tsx";
import {
  createUnifiedService,
  updateSingleServicePricesForPassengerChange,
  updateServicePricesForPassengerChange,
} from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/unifiedServiceManager.ts";
import { repriceItineraryForPassengerContext } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/passengerAwareServiceRepricing.ts";
import { buildAdultServiceRows, setAdultServiceBeneficiary } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/adultServiceBeneficiaries.ts";
import { cleanItinerarioForDB, hydrateItinerarioFromDB, hydrateServiceFromDB } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/itinerarioCleanupUtils.ts";
import { getServiceAdultUnitPrice, getServicePricingSnapshot } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/servicePricingRuntime.ts";
import { getServiceBeneficiarySnapshot } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/passengerPricingState.ts";
import { buildServiceBeneficiaryPricingLedger } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/serviceBeneficiaryPricingLedger.ts";
import { buildSummaryPricingCore } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/summaryPricingCore.ts";
import { resolveQuotationSavePricing } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/quotationSavePricing.ts";
import { convertTarifaToDollars } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/tariffCurrency.ts";
import { calculateDaySubtotalDetailed } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/utils/priceCalculations.ts";

const cents = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const people = (count = 3, children = []) => ({
  adults: Array.from({ length: count }, (_, index) => ({ id: 101 + index, pais: "Perú" })),
  children,
});
const adultIds = (count = 3) => people(count).adults.map((person, index) => `adult:${index}:${person.id}`);
const day = service => [{ numero: 1, servicios: [service] }];
const extra = ({ name = "HILARIO ESTACION-HOTEL", selected = adultIds(), unit = 1.29,
  children = [], converted = [], grouped = false } = {}) => hydrateServiceFromDB({
  id: "synthetic-extra-regression",
  typeService: "extras",
  parentService: { typeService: "extras", nombre: name },
  childService: { nombre: name },
  moneda: "dolares", tasaCambio: 3,
  precioServicio: grouped ? cents(unit * (selected.length + converted.length)) : unit,
  precioTotal: cents(unit * (selected.length + converted.length) + children.reduce((sum, child) => sum + child.precio, 0)),
  tipoPrecio: grouped ? "compartido" : "privado",
  capacidadLimite: false,
  beneficiariosAdultos: [
    ...selected.map(id => ({ id })),
    ...converted.map(id => ({ id, child_origin: id })),
  ],
  beneficiariosNinos: children,
});

const updatePaths = {
  individual: (service, roster) => updateSingleServicePricesForPassengerChange(service, roster.adults.length + roster.children.length),
  editor: (service, roster) => updateServicePricesForPassengerChange([service], roster, { preserveExistingSelection: true })[0],
};

const assertPricing = (service, roster, { unit = 1.29, total, amounts }) => {
  assert.equal(cents(getServiceAdultUnitPrice(service)), unit, "el precio unitario del extra no cambia por su nombre");
  assert.equal(cents(getServicePricingSnapshot(service).total), total, "el total runtime cobra sólo a sus beneficiarios");
  assert.equal(cents(calculateDaySubtotalDetailed([service], roster).totalSubtotal), total, "el subtotal del día usa el mismo total");
  const ledger = buildServiceBeneficiaryPricingLedger({ days: day(service), peopleDetails: roster });
  assert.equal(ledger.complete, true);
  assert.deepEqual(ledger.unallocated, []);
  assert.deepEqual([...ledger.byPassenger.values()].map(rows => cents(rows.reduce((sum, row) => sum + row.amount, 0))), amounts);
};

for (const [pathName, update] of Object.entries(updatePaths)) {
  test(`extra individual ${pathName}: HILARIO ESTACION-HOTEL cobra USD 1.29 a tres adultos, total USD 3.87`, () => {
    const service = extra(), original = structuredClone(service), roster = people();
    const result = update(service, roster);
    assert.deepEqual(service, original, "conservar el estado React anterior");
    assertPricing(result, roster, { total: 3.87, amounts: [1.29, 1.29, 1.29] });
    assert.equal(cents(result.tariff.precio_original), 3.87);
  });

  test(`extra individual ${pathName}: excluir y reinsertar adultos actualiza el total sin conservar el importe anterior`, () => {
    const roster = people(), rows = buildAdultServiceRows(roster.adults);
    let result = extra();
    for (const [index, included, total, amounts] of [
      [1, false, 2.58, [1.29, 0, 1.29]],
      [0, false, 1.29, [0, 0, 1.29]],
      [2, false, 0, [0, 0, 0]],
      [1, true, 1.29, [0, 1.29, 0]],
    ]) {
      result = update(setAdultServiceBeneficiary(result, rows[index], included), roster);
      assertPricing(result, roster, { total, amounts });
      assert.equal(cents(result.tariff.precio_original), total);
    }
  });

  test(`extra individual ${pathName}: niños con tarifa propia, gratis y como adulto conservan sus importes`, () => {
    const roster = people(3, [{ id: 201 }, { id: 202 }, { id: 203 }]);
    const result = update(extra({ children: [{ id: "child:0:201", precio: 0.5 }, { id: "child:1:202", precio: 0 }],
      converted: ["child:2:203"] }), roster);
    assertPricing(result, roster, { total: 5.66, amounts: [1.29, 1.29, 1.29, 0.5, 0, 1.29] });
    assert.equal(getServiceBeneficiarySnapshot(result).convertedEntries.length, 1);
  });

  test(`extra grupal ${pathName}: un total explícito sigue dividido entre sus beneficiarios`, () => {
    const roster = people(), result = update(extra({ grouped: true }), roster);
    assertPricing(result, roster, { total: 3.87, amounts: [1.29, 1.29, 1.29] });
    assert.equal(result.tipoPrecio, "compartido");
  });
}

test("extra individual: HOTEL, EXTRA y transporte en el nombre no cambian su categoría ni tarifa", () => {
  for (const name of ["HILARIO ESTACION-HOTEL", "RECOJO HOTEL", "EXTRA EQUIPAJE", "TRASLADO AEROPUERTO", "Entrada cultural"]) {
    assertPricing(updatePaths.editor(extra({ name }), people()), people(), { total: 3.87, amounts: [1.29, 1.29, 1.29] });
  }
});

test("extra individual: USD y PEN ya convertido conservan el mismo unitario en USD", () => {
  for (const source of [
    { moneda: "dolares", tasa_cambio: 1, precio: 1.29 },
    { moneda: "soles", tasa_cambio: 3, precio: 3.87 },
  ]) {
    const converted = convertTarifaToDollars(source);
    const service = extra({ unit: converted.precio });
    Object.assign(service.tariff, { moneda_original: converted.moneda_original, tasa_cambio_original: converted.tasa_cambio_original });
    const result = updatePaths.editor(service, people());
    assertPricing(result, people(), { total: 3.87, amounts: [1.29, 1.29, 1.29] });
    assert.equal(result.tariff.moneda, "dolares");
  }
});

test("extra individual: cambio 3 → 5 → 2 adultos conserva exclusiones y recalcula total", () => {
  let days = day(extra({ selected: [adultIds()[0], adultIds()[2]] }));
  days = repriceItineraryForPassengerContext(days, people(5), { previousAdultsCount: 3, previousChildrenCount: 0 });
  assertPricing(days[0].servicios[0], people(5), { total: 5.16, amounts: [1.29, 0, 1.29, 1.29, 1.29] });
  days = repriceItineraryForPassengerContext(days, people(2), { previousAdultsCount: 5, previousChildrenCount: 0 });
  assertPricing(days[0].servicios[0], people(2), { total: 1.29, amounts: [1.29, 0] });
});

test("extra individual: guardar y reabrir tres veces preserva unitario, selección, resumen y base del guardado", () => {
  const roster = people();
  let days = day(extra({ selected: [adultIds()[0], adultIds()[2]] }));
  let savedTotal;
  for (let cycle = 0; cycle < 3; cycle++) {
    days = repriceItineraryForPassengerContext(days, roster, { preserveExistingSelection: true });
    assertPricing(days[0].servicios[0], roster, { total: 2.58, amounts: [1.29, 0, 1.29] });
    const quotation = { peopleDetails: roster, peopleCount: { adults: 3, children: 0 },
      itinerario: days, itinerario_externo: [], additionalCosts: { fee: "0", feeMode: "percentage" } };
    const core = buildSummaryPricingCore(quotation);
    assert.deepEqual(core.parts.filter(part => part.audience === "adult").map(part => [part.beneficiaries, part.services]), [[2, 1.29], [1, 0]]);
    const saved = resolveQuotationSavePricing(quotation);
    if (cycle === 0) savedTotal = saved.total_final;
    assert.equal(saved.total_final, savedTotal);
    const flat = cleanItinerarioForDB(days);
    assert.equal(flat[0].servicios[0].precioServicio, 1.29);
    assert.equal(flat[0].servicios[0].tipoPrecio, "privado");
    assert.equal(flat[0].servicios[0].beneficiariosAdultos.length, 2);
    days = hydrateItinerarioFromDB(flat);
  }
});

test("DaysEditor visible: extra HOTEL muestra USD 2.58, tres adultos y USD 7.74; los chips actualizan el total", async () => {
  const { window, document } = parseHTML('<html><body><div id="app"></div></body></html>');
  const globalKeys = ["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"];
  const previousGlobals = Object.fromEntries(globalKeys.map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById("app"));
  const roster = people(), adultRows = buildAdultServiceRows(roster.adults);
  function Editor() {
    const [service, setService] = React.useState(() => updatePaths.editor(extra({ unit: 2.58 }), roster));
    return React.createElement(SortableService, {
      service, dayIndex: 0, serviceIndex: 0, totalPassengers: 3, adultPassengers: adultRows,
      childPassengers: [], editingPrice: {}, removeService: () => {}, togglePriceAdjustment: () => {},
      onToggleAdultBeneficiary: (_, __, row, included) => setService(current =>
        updatePaths.individual(setAdultServiceBeneficiary(current, row, included), roster)),
    });
  }
  const click = async element => {
    assert.ok(element, "existe el control visible");
    await React.act(async () => element.dispatchEvent(new window.Event("click", { bubbles: true })));
  };
  try {
    await React.act(async () => root.render(React.createElement(Editor)));
    assert.match(document.querySelector(".sr__price-value").textContent, /^\$2\.58/);
    assert.equal(document.querySelector(".sr__total-value").textContent, "$7.74");
    assert.match(document.querySelector(".sr__pax-tag--adult").getAttribute("aria-label"), /Adultos beneficiarios: 3\./);
    await click(document.querySelector(".sr__pax-tag--adult"));
    await click(document.querySelectorAll(".sr__adults-chip")[1]);
    assert.equal(document.querySelector(".sr__total-value").textContent, "$5.16");
    assert.match(document.querySelector(".sr__pax-tag--adult").getAttribute("aria-label"), /Adultos beneficiarios: 2\./);
    await click(document.querySelectorAll(".sr__adults-chip")[1]);
    assert.equal(document.querySelector(".sr__total-value").textContent, "$7.74");
  } finally {
    await React.act(async () => root.unmount());
    for (const key of globalKeys) {
      if (previousGlobals[key] === undefined) delete globalThis[key];
      else globalThis[key] = previousGlobals[key];
    }
  }
});

test("crear extra individual sin hidratar: tres adultos peruanos pagan USD 3.87 sin IGV de hotel", () => {
  const roster = people();
  const service = createUnifiedService(
    { typeService: "extras", nombre: "HILARIO ESTACION-HOTEL", id_servicio_extra: 1 },
    { nombre: "HILARIO ESTACION-HOTEL", id_servicio_extra: 1 },
    { tipoPrecio: "privado", precio: 1.29, precio_original: 3.87, moneda: "dolares" },
    roster,
    "compartido",
    { selectedIds: adultIds(), pricingMode: "fixed", assignedChildExplicitPriceMap: {} },
  );
  assert.equal(service.typeService, "extras");
  assert.equal(service.tipoPrecio, "privado");
  assert.equal(service.igv, false);
  assert.equal(service.tariff.tieneIgv, false);
  assertPricing(service, roster, { total: 3.87, amounts: [1.29, 1.29, 1.29] });
});

test("extra grupal explícito: pasar de dos a tres beneficiarios conserva USD 3.87 y reparte el unitario", () => {
  const roster = people(), rows = buildAdultServiceRows(roster.adults);
  for (const update of Object.values(updatePaths)) {
    const initial = extra({ selected: adultIds().slice(0, 2), unit: 1.935, grouped: true });
    const two = update(initial, roster);
    assertPricing(two, roster, { unit: 1.94, total: 3.87, amounts: [1.94, 1.94, 0] });
    const three = update(setAdultServiceBeneficiary(two, rows[2], true), roster);
    assertPricing(three, roster, { total: 3.87, amounts: [1.29, 1.29, 1.29] });
    assert.equal(three.tipoPrecio, "compartido");
  }
});

test("captura: un extra con total anterior de dos adultos se actualiza a los tres beneficiarios", () => {
  const roster = people();
  for (const update of Object.values(updatePaths)) {
    const service = extra();
    service.precioTotal = 2.58;
    service.tariff.precio_original = 2.58;
    service.tariff.precio_original_with_child_extras = 2.58;
    assertPricing(update(service, roster), roster, { total: 3.87, amounts: [1.29, 1.29, 1.29] });
  }
});

test("extra individual: el porcentaje infantil parte del unitario y se conserva al recalcular y reabrir", () => {
  const roster = people(3, [{ id: 201 }]);
  const selectedIds = [...adultIds(), "child:0:201"];
  const service = createUnifiedService(
    { typeService: "extras", nombre: "HILARIO ESTACION-HOTEL" }, { nombre: "Extra" },
    { tipoPrecio: "privado", precio: 1.29, moneda: "dolares" }, roster, "compartido",
    { selectedIds, pricingMode: "percentage", childPercentageMap: { "child:0:201": 50 }, uniformPercentage: "50" },
  );
  assertPricing(service, roster, { total: 4.52, amounts: [1.29, 1.29, 1.29, 0.65] });
  for (const update of Object.values(updatePaths)) {
    const changed = update(service, roster);
    assertPricing(changed, roster, { total: 4.52, amounts: [1.29, 1.29, 1.29, 0.65] });
    const reopened = hydrateItinerarioFromDB(cleanItinerarioForDB(day(changed)));
    assertPricing(update(reopened[0].servicios[0], roster), roster,
      { total: 4.52, amounts: [1.29, 1.29, 1.29, 0.65] });
  }
});
