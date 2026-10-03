import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AgencyGroups, { AgencyGroupLabel } from "../../components/common/AgencyGroups/AgencyGroups";
import { getQuotationAgency, groupByQuotationAgency, paginateQuotationAgencyGroups } from "../quotationAgencyGroups";
import type { Agency } from "../../services/agencyService";

const agencies = [
  { id: 1, name: "Venso Tours", is_primary: true, active: true },
  { id: 2, name: "DIKA TRAVEL", is_primary: false, active: true },
  { id: 3, name: "SPECIAL TRAVEL SAC", is_primary: false, active: true },
  { id: 4, name: "Agencia histórica", is_primary: false, active: false },
] as Agency[];

test("agrupa cotizaciones por ID comercial sin modificar el orden interno ni el input", () => {
  const rows = [{ id: "s1", agency_id: 3 }, { id: "d1", agency_id: 2 }, { id: "s2", agency_id: 3 }, { id: "v1", agency_id: 1 }];
  const before = JSON.stringify(rows);
  const groups = groupByQuotationAgency(rows, agencies);
  assert.deepEqual(groups.map((group) => group.name), ["Venso Tours", "DIKA TRAVEL", "SPECIAL TRAVEL SAC"]);
  assert.deepEqual(groups[2].items.map((row) => row.id), ["s1", "s2"]);
  assert.equal(JSON.stringify(rows), before);
});

test("vouchers heredan la agencia de su cotización en todas las variantes de contrato", () => {
  for (const field of ["cotizacion_data", "cotizacionData", "cotizacion"]) {
    const row = { id: "voucher", agency_id: 1, agency_name: "Proveedor ajeno", [field]: { agency_id: 3 } };
    assert.equal(getQuotationAgency(row, agencies).name, "SPECIAL TRAVEL SAC");
  }
  const vouchers = [{ id: "venta", cotizacion_data: { agency_id: 2 } }, { id: "reserva", cotizacionData: { agency_id: "2" } }];
  assert.equal(groupByQuotationAgency(vouchers, agencies)[0].items.length, 2);
});

test("el catálogo actual prima sobre el nombre antiguo y no oculta agencias inactivas", () => {
  assert.equal(getQuotationAgency({ agency_id: 3, agency_name: "Nombre antiguo" }, agencies).name, "SPECIAL TRAVEL SAC");
  assert.equal(getQuotationAgency({ agency_id: 4 }, agencies).name, "Agencia histórica");
});

test("IDs distintos no se fusionan aunque tengan el mismo nombre", () => {
  const duplicateNames = [{ ...agencies[1], name: "Travel" }, { ...agencies[2], name: "Travel" }];
  assert.equal(groupByQuotationAgency([{ agency_id: 2 }, { agency_id: 3 }], duplicateNames).length, 2);
});

test("fallbacks legacy mantienen nombres, claves y registros sin agencia", () => {
  const rows = [{ id: 1, agency_name: "Perú Travel" }, { id: 2, agencyName: "  PERU TRAVEL " }, { id: 3 }, { id: 4, agency_id: 88 }];
  const groups = groupByQuotationAgency(rows);
  assert.equal(groups.find((group) => group.key.startsWith("name:"))?.items.length, 2);
  assert.equal(groups.find((group) => group.key === "agency:88")?.name, "Agencia 88");
  assert.equal(groups.at(-1)?.name, "Sin agencia registrada");
  assert.equal(groups.flatMap((group) => group.items).length, rows.length);
});

test("agrupar antes de paginar conserva todas las filas y los totales de agencia", () => {
  const rows = [{ id: "s1", agency_id: 3 }, { id: "d1", agency_id: 2 }, { id: "s2", agency_id: 3 }, { id: "d2", agency_id: 2 }, { id: "s3", agency_id: 3 }];
  const pages = [1, 2, 3].map((page) => paginateQuotationAgencyGroups(rows, agencies, page, 2));
  assert.deepEqual(pages.flat(1).flatMap((group) => group.items.map((row) => row.id)), ["d1", "d2", "s1", "s2", "s3"]);
  assert.equal(pages[2][0].totalCount, 3);
  assert.equal(pages[2][0].items.length, 1);
});

test("el componente lista cada voucher una vez con nombre y contador accesibles", () => {
  const html = renderToStaticMarkup(<AgencyGroups agencies={agencies} items={[
    { id: "v1", cotizacion_data: { agency_id: 3 } }, { id: "v2", cotizacion_data: { agency_id: 2 } },
  ]} listClassName="vouchers-grid" renderItem={(row) => <article key={row.id}>{row.id}</article>} />);
  assert.equal((html.match(/<article/g) || []).length, 2);
  assert.match(html, /aria-label="SPECIAL TRAVEL SAC"/);
  assert.match(html, /aria-label="DIKA TRAVEL"/);
  assert.equal((html.match(/1 voucher</g) || []).length, 2);
  assert.equal((html.match(/<h3>/g) || []).length, 2);
  const partial = renderToStaticMarkup(<AgencyGroupLabel name="Travel" count={1} totalCount={3} noun="cotizaciones" />);
  assert.match(partial, /1 de 3.*cotizaciones/);
  assert.equal(renderToStaticMarkup(<AgencyGroups agencies={agencies} items={[]} listClassName="vouchers-grid" renderItem={() => null} />).includes("<section"), false);
});

test("los tres listados consumen la misma agrupación y las mutaciones actualizan el catálogo", () => {
  const source = (path: string) => readFileSync(resolve(process.cwd(), "src", path), "utf8");
  for (const path of ["pages/Ventas/VouchersVenta/VouchersVenta.tsx", "pages/Reservas/VouchersReserva/VouchersReserva.tsx"]) {
    assert.match(source(path), /<AgencyGroups items=\{monthGroup.vouchers\} agencies=\{agencies\}/);
    assert.match(source(path), /useAgencyDirectory\(\)/);
  }
  assert.match(source("pages/Ventas/Cotizaciones/components/CotizacionesTable.tsx"), /paginateQuotationAgencyGroups\(visibleCotizaciones, agencies, page, pageSize\)/);
  const biblia = source("pages/Reservas/Calendario/services/bibliaActivityService.ts");
  assert.match(biblia, /async createQuotationFromStandaloneActivity[\s\S]*?invalidateAgenciesCache\(\);[\s\S]*?invalidateCotizacionGraphCache\(\)/);
  assert.match(source("services/agencyService.ts"), /api\(\)\.post\("\/turismo\/agencias", input\);\s*invalidateAgenciesCache\(\)/);
  assert.match(source("hooks/useAgencyDirectory.ts"), /getAgencies\(true\)/);
});
