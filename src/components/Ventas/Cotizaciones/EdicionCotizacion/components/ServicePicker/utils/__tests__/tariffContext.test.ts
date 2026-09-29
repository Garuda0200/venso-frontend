import test from "node:test";
import assert from "node:assert/strict";

import { buildServicePickerTariffRequestParams, filterTariffsForContext, prepareServicePickerCatalogRows } from "../tariffContext";

const currentYear = new Date().getFullYear();

test("ServicePicker keeps current-year tariffs from every agency when agency scope is open", () => {
  const rows = [
    {
      id_tipotour: 10,
      tarifas: [
        { id_tarifa: 1, tipo_tarifa: "externa", anio: currentYear, agency_ids: [1], precio_compartido: 10 },
        { id_tarifa: 2, tipo_tarifa: "externa", anio: currentYear, agency_ids: [2, 3], precio_compartido: 20 },
        { id_tarifa: 3, tipo_tarifa: "externa", anio: currentYear - 1, agency_ids: [1], precio_compartido: 30 },
        { id_tarifa: 4, tipo_tarifa: "interna", anio: currentYear, agency_ids: [1], precio_compartido: 40 },
      ],
    },
  ];

  const filtered = filterTariffsForContext(rows, null, "externa", currentYear);

  assert.equal(filtered.length, 2);
  assert.deepEqual(
    filtered.map((row) => row.tarifas[0].id_tarifa).sort(),
    [1, 2],
  );
  assert.deepEqual(filtered[0]._tariff_agency_ids, [1]);
  assert.deepEqual(filtered[1]._tariff_agency_ids, [2, 3]);
});

test("ServicePicker year selection excludes tariffs from other years", () => {
  const rows = [
    {
      id_tipotour: 10,
      tarifas: [
        { id_tarifa: 10, tipo_tarifa: "externa", anio: currentYear, agency_ids: [1] },
        { id_tarifa: 11, tipo_tarifa: "externa", anio: currentYear + 1, agency_ids: [2] },
      ],
    },
  ];

  const filtered = filterTariffsForContext(rows, null, "externa", currentYear + 1);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].tarifas[0].id_tarifa, 11);
});


test("ServicePicker preserves an imported service when only an internal tariff exists", () => {
  const rows = [{
    id_vagon: 81,
    tarifas: [{ id_tarifa: 81, tipo_tarifa: "interna", anio: currentYear, agency_ids: [1], precio_compartido: 150 }],
  }];

  const prepared = prepareServicePickerCatalogRows(rows, null, "externa", currentYear);
  assert.equal(prepared.length, 1);
  assert.deepEqual(prepared[0].tarifas, []);
  assert.equal(prepared[0]._servicepicker_tariff_missing, true);
  assert.equal(prepared[0]._servicepicker_has_alternate_tariff, true);
  assert.deepEqual(prepared[0]._servicepicker_alternate_tariff_types, ["interna"]);
  assert.notEqual(prepared[0].tarifas[0]?.precio_compartido, 150);
});

test("ServicePicker preserves a catalog service without a tariff", () => {
  const rows = [{ id_vagon: 504, tarifas: [] }];
  const prepared = prepareServicePickerCatalogRows(rows, null, "externa", currentYear);

  assert.equal(prepared.length, 1);
  assert.deepEqual(prepared[0].tarifas, []);
  assert.equal(prepared[0]._servicepicker_tariff_missing, true);
});

test("ServicePicker still prefers the exact commercial tariff when available", () => {
  const rows = [{
    id_vagon: 301,
    tarifas: [
      { id_tarifa: 1, tipo_tarifa: "interna", anio: currentYear, agency_ids: [1], precio_compartido: 100 },
      { id_tarifa: 2, tipo_tarifa: "externa", anio: currentYear, agency_ids: [1], precio_compartido: 200 },
    ],
  }];

  const prepared = prepareServicePickerCatalogRows(rows, 1, "externa", currentYear);
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].tarifas.length, 1);
  assert.equal(prepared[0].tarifas[0].id_tarifa, 2);
  assert.equal(prepared[0]._servicepicker_tariff_missing, false);
  assert.equal(prepared[0]._servicepicker_has_alternate_tariff, false);
  assert.deepEqual(prepared[0]._servicepicker_alternate_tariff_types, ["interna"]);
});

test("ServicePicker keeps an imported service visible when its exact tariff belongs to another year", () => {
  const rows = [{
    habitacion: { id_habitacion: 62, tipo_habitacion: "Doble Twin" },
    tarifas: [
      { id_tarifa: 620, tipo_tarifa: "externa", anio: currentYear - 1, agency_ids: [1], precio_compartido: 180 },
    ],
  }];

  const prepared = prepareServicePickerCatalogRows(rows, 1, "externa", currentYear);
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].habitacion.id_habitacion, 62);
  assert.deepEqual(prepared[0].tarifas, []);
  assert.equal(prepared[0]._servicepicker_tariff_missing, true);
});

test("ServicePicker does not send tipo_tarifa to catalog endpoints", () => {
  const params = buildServicePickerTariffRequestParams(7, currentYear);
  assert.deepEqual(params, { agency_id: 7, anio: currentYear });
  assert.equal(Object.prototype.hasOwnProperty.call(params, "tipo_tarifa"), false);
});
