import test from "node:test";
import assert from "node:assert/strict";

import { groupTicketsByEntrada } from "../ticketBeneficiaries";

const year = new Date().getFullYear();

test("ticket groups keep agency-scoped tariffs as separate ServicePicker choices", () => {
  const groups = groupTicketsByEntrada([
    {
      id_ticket: 1,
      entrada: "Boleto Turístico",
      procedencia: "nacional",
      tipo_usuario: "adulto",
      _tariff_agency_ids: [1],
      tarifas: [{ id_tarifa: 10, anio: year, agency_ids: [1] }],
    },
    {
      id_ticket: 1,
      entrada: "Boleto Turístico",
      procedencia: "nacional",
      tipo_usuario: "adulto",
      _tariff_agency_ids: [2],
      tarifas: [{ id_tarifa: 11, anio: year, agency_ids: [2] }],
    },
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.agencyIds), [[1], [2]]);
});

test("adult and child ticket rows with same year and agencies stay together", () => {
  const groups = groupTicketsByEntrada([
    {
      id_ticket: 1,
      entrada: "Machu Picchu",
      procedencia: "extranjero",
      tipo_usuario: "adulto",
      _tariff_agency_ids: [1, 3],
      tarifas: [{ id_tarifa: 20, anio: year, agency_ids: [1, 3] }],
    },
    {
      id_ticket: 2,
      entrada: "Machu Picchu",
      procedencia: "extranjero",
      tipo_usuario: "estudiante",
      _tariff_agency_ids: [3, 1],
      tarifas: [{ id_tarifa: 21, anio: year, agency_ids: [3, 1] }],
    },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  assert.deepEqual(groups[0].agencyIds, [1, 3]);
});
