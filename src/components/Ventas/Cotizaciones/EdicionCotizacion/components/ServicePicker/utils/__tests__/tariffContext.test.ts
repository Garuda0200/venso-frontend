import test from "node:test";
import assert from "node:assert/strict";

import { buildServicePickerTariffRequestParams, filterTariffsForContext, prepareServicePickerCatalogRows } from "../tariffContext";

for (const kind of ["habitacion", "movilidad", "ruta", "tour", "vagones", "tipo_vuelo", "tickets", "restaurante", "servicio_extra"]) {
  test(`${kind}: a quotation sees its own and explicitly shared prices only`, () => {
    const year = new Date().getFullYear();
    const own = { id_tarifa: 1, tipo_tarifa: "externa", anio: year, agency_ids: [7], precio_privado: 0 };
    const other = { ...own, id_tarifa: 2, agency_ids: [8], precio_privado: 999 };
    const shared = { ...own, id_tarifa: 3, agency_ids: [7, 8], tiene_temporada: true, temporada: "alta", precio_privado: 50 };
    const internal = { ...own, id_tarifa: 4, tipo_tarifa: "interna", precio_privado: 10 };
    const old = { ...own, id_tarifa: 5, anio: year - 1, precio_privado: 888 };
    const rows = [{ typeService: kind, tarifas: [own, other, shared, internal, old] }];
    assert.deepEqual(prepareServicePickerCatalogRows(rows, 7, "externa", year).flatMap(row => row.tarifas.map(tariff => tariff.id_tarifa)), [1, 3]);
    assert.deepEqual(prepareServicePickerCatalogRows(rows, 8, "externa", year).flatMap(row => row.tarifas.map(tariff => tariff.id_tarifa)), [2, 3]);
    const missing = prepareServicePickerCatalogRows(rows, 9, "externa", year);
    assert.equal(missing.length, 1);
    assert.deepEqual(missing[0].tarifas, []);
    assert.equal(missing[0]._servicepicker_tariff_missing, true);
    assert.equal(missing[0]._servicepicker_has_alternate_tariff, false);
    assert.equal(rows[0].tarifas.length, 5);
  });
}

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


test("ServicePicker presenta por separado los modos de una agencia sin mezclar sus monedas", () => {
  const shared={ id_tarifa:700, tipo_tarifa:"interna", anio:currentYear, agency_ids:[7], precio_compartido:130, precio_privado:null, moneda:"soles", tasa_cambio:3.25 };
  const privatePrice={ id_tarifa:701, tipo_tarifa:"interna", anio:currentYear, agency_ids:[7], precio_compartido:null, precio_privado:65, moneda:"dolares", tasa_cambio:1 };
  const rows=prepareServicePickerCatalogRows([{id_ruta:8,tarifas:[shared,privatePrice]}],7,"interna",currentYear);
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(row=>row.tarifas[0]),[shared,privatePrice]);
  assert.notEqual(rows[0]._tariff_variant_key,rows[1]._tariff_variant_key);
  assert.deepEqual(rows.map(row=>row._tariff_agency_ids),[[7],[7]]);
});
