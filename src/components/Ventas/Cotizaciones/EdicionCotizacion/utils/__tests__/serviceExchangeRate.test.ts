import test from "node:test";
import assert from "node:assert/strict";

import {
  SERVICE_PICKER_QUOTATION_BASE_TC,
  applyQuotationExchangeRateToDayServices,
  applyQuotationExchangeRateToService,
  collectPendingQuotationExchangeRateServices,
  markServicePickerQuotationExchangeRate,
  resolveServiceExchangeRate,
  serviceNeedsQuotationExchangeRate,
} from "../serviceExchangeRate.js";
import { convertTarifaToDollars, convertToDollars } from "../tariffCurrency.js";
import { getServicePricingSnapshot } from "../servicePricingRuntime.js";

test("ServicePicker conserva una tarifa originalmente USD", () => {
  assert.equal(convertToDollars(100, "dolares", 1), 100);

  const tariff = convertTarifaToDollars({
    moneda: "dolares",
    tasa_cambio: 1,
    precio: 100,
  });

  assert.equal(tariff.precio, 100);
  assert.equal(tariff.tasa_cambio, 1);
});

test("ServicePicker convierte PEN a USD usando la TC propia de la tarifa", () => {
  const tariff = convertTarifaToDollars({
    moneda: "soles",
    tasa_cambio: 3,
    precio: 300,
  });

  assert.equal(tariff.precio, 100);
  assert.equal(tariff.moneda, "dolares");
  assert.equal(tariff.moneda_original, "soles");
  assert.equal(tariff.tasa_cambio_original, 3);
});

test("ServicePicker marca TC comercial base sin alterar la TC técnica", () => {
  const usdService = markServicePickerQuotationExchangeRate({
    tariff: { moneda: "dolares", tasa_cambio: 1, precio: 100 },
  });
  const penService = markServicePickerQuotationExchangeRate({
    tariff: {
      moneda: "dolares",
      moneda_original: "soles",
      tasa_cambio_original: 3,
      precio: 100,
    },
  });

  assert.equal(usdService.tariff.tasa_cambio, 1);
  assert.equal(usdService.tasaCambio, SERVICE_PICKER_QUOTATION_BASE_TC);
  assert.equal(penService.tasaCambio, SERVICE_PICKER_QUOTATION_BASE_TC);
  assert.equal(resolveServiceExchangeRate(usdService), 3);
  assert.equal(resolveServiceExchangeRate(penService), 3);
});

test("resuelve la TC de origen preservada cuando no existe snapshot raíz", () => {
  const service = {
    tariff: {
      moneda: "dolares",
      moneda_original: "soles",
      tasa_cambio: 3,
      tasa_cambio_original: 3,
      precio: 100,
    },
  };

  assert.equal(resolveServiceExchangeRate(service), 3);
});

test("tarifa USD pura sin snapshot conserva TC técnica 1", () => {
  assert.equal(
    resolveServiceExchangeRate({ tariff: { moneda: "dolares", tasa_cambio: 1 } }),
    1,
  );
});

test("detecta desalineación sin convertir automáticamente", () => {
  const service = { tasaCambio: 3, tariff: { precio: 100 } };
  assert.equal(serviceNeedsQuotationExchangeRate(service, 3.2), true);
  assert.equal(service.tariff.precio, 100);
});

test("TC 3 -> 3.2 actualiza unitario, niños y total sin tocar Reservas", () => {
  const service = {
    typeService: "tickets",
    tasaCambio: 3,
    tasa_cambio: 3,
    tariff: {
      precio: 100,
      precio_original: 200,
      childExtrasTotal: 30,
      precio_original_with_child_extras: 230,
      moneda: "dolares",
    },
    precioServicio: 100,
    precio_servicio: 100,
    precioTotal: 230,
    precio_total: 230,
    precio_adult: 100,
    amount_per_adult: 200,
    amount_per_child: 30,
    assignedPassengerIds: ["adult:0", "adult:1", "child:0"],
    assignedChildExplicitPriceMap: { "child:0": 30 },
    assignedChildExplicitPriceSum: 30,
    passengerSelection: {
      selectedIds: ["adult:0", "adult:1", "child:0"],
      assignedChildExplicitPriceMap: { "child:0": 30 },
      preciosNinos: { "child:0": 30 },
      assignedChildExplicitPriceSum: 30,
    },
    beneficiariosNinos: [{ id: "child:0", precio: 30 }],
    children: { "child:0": { amount: 30, asAdult: false } },
    assignedPrecioServicio: 77,
    assigned_precio_servicio: 77,
  };

  const next = applyQuotationExchangeRateToService(service, 3.2);
  const pricing = getServicePricingSnapshot(next);

  assert.equal(next.tariff.precio, 93.75);
  assert.equal(next.precioServicio, 93.75);
  assert.equal(next.precio_servicio, 93.75);
  assert.equal(next.precio_adult, 93.75);
  assert.equal(next.assignedChildExplicitPriceMap["child:0"], 28.13);
  assert.equal(next.beneficiariosNinos[0].precio, 28.13);
  assert.equal(next.passengerSelection.preciosNinos["child:0"], 28.13);
  assert.equal(pricing.total, 215.63);
  assert.equal(next.precioTotal, 215.63);
  assert.equal(next.precio_total, 215.63);
  assert.equal(next.tasaCambio, 3.2);
  assert.equal(next.tasa_cambio, 3.2);
  assert.equal(next.assignedPrecioServicio, 77);
  assert.equal(next.assigned_precio_servicio, 77);
  assert.equal(service.tariff.precio, 100);
});

test("reaplicar la misma TC no cambia precios", () => {
  const service = { tasaCambio: 3.2, tariff: { precio: 93.75 } };
  const next = applyQuotationExchangeRateToService(service, 3.2);

  assert.equal(next.tariff.precio, 93.75);
  assert.equal(next.tasaCambio, 3.2);
});

test("aplica TC pendiente solo sobre servicios desbloqueados", () => {
  const editable = {
    id: "svc-editable",
    nombre: "Consettur",
    tasaCambio: 3,
    tariff: { precio: 100, moneda: "dolares" },
  };
  const locked = {
    id: "svc-locked",
    nombre: "Guía vendido",
    tasaCambio: 3,
    tariff: { precio: 50, moneda: "dolares" },
    assignedPrecioServicio: 50,
  };
  const aligned = {
    id: "svc-ok",
    nombre: "Servicio alineado",
    tasaCambio: 3.2,
    tariff: { precio: 80, moneda: "dolares" },
  };

  const days = [
    { numero: 1, titulo: "Cusco", servicios: [editable, locked, aligned] },
  ];
  const isLocked = (service) => Boolean(service.assignedPrecioServicio);

  const grouped = collectPendingQuotationExchangeRateServices(days, 3.2, {
    isLocked,
  });

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].services.length, 1);
  assert.equal(grouped[0].services[0].service.id, "svc-editable");

  const convertedIds = [];
  const result = applyQuotationExchangeRateToDayServices(days, 3.2, {
    isLocked,
    onServiceConverted: (converted) => convertedIds.push(converted.id),
  });

  assert.equal(result.mutated, true);
  assert.deepEqual(convertedIds, ["svc-editable"]);
  assert.equal(result.days[0].servicios[0].tariff.precio, 93.75);
  assert.equal(result.days[0].servicios[1], locked);
  assert.equal(result.days[0].servicios[2], aligned);
});
