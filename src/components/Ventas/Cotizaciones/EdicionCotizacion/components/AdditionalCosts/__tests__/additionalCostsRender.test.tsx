import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSync } from "esbuild";
import { parseHTML } from "linkedom";
import { formatCurrency } from "../../../utils/formatters";

// Exercise the actual cost panel, including its financial ledger. Styles do
// not affect SSR, and React stays external to share the renderer instance.
const compiled = buildSync({
  entryPoints: [path.resolve("src/components/Ventas/Cotizaciones/EdicionCotizacion/components/AdditionalCosts/AdditionalCosts.tsx")],
  bundle: true, write: false, platform: "node", format: "cjs",
  packages: "external", loader: { ".scss": "empty" },
  define: { "import.meta.env.VITE_EXCHANGE_RATE": "undefined" },
});
const componentModule = { exports: {} as any };
new Function("module", "exports", "require", compiled.outputFiles[0].text)(
  componentModule, componentModule.exports, createRequire(path.resolve("package.json")),
);
const AdditionalCosts = componentModule.exports.default;
const adult = { id: 101, nacionalidad: "Perú" };
const child = { id: 201, age: 8, nacionalidad: "Perú" };
const adultId = "adult:0:101";
const render = (props: any = {}) => {
  const html = renderToStaticMarkup(<AdditionalCosts
    additionalCosts={{ fee: "0", feeMode: "percentage", childFeeMode: "percentage", operationalCosts: "0", extraFee: "0" }}
    setAdditionalCosts={() => {}} formatCurrency={formatCurrency}
    adultsCount={1} peopleDetails={{ adults: [adult], children: [] }}
    {...props}
  />);
  return parseHTML(html).document;
};
const pills = (doc: any) => Array.from(doc.querySelectorAll(".ac__summary-total-formula .ac__summary-total-pill")) as any[];

test("costos sin servicios conserva la presentación del adulto sin hotel", () => {
  const doc = render();
  const rows = pills(doc);
  assert.equal(rows.length, 1);
  assert.match(rows[0].textContent, /Sin hotel/);
  assert.match(rows[0].textContent, /\$0/);
  assert.ok(rows[0].querySelector("svg"));
  assert.doesNotMatch(rows[0].className, /undefined/);
});

test("el niño sin servicios conserva su audiencia e icono al reconciliar el costo del adulto", () => {
  const service = { id: "transport-adult", typeService: "transportes", parentService: { typeService: "transportes" },
    childService: { capacidad: 3 }, tipoPrecio: "compartido", precioServicio: 30, precioTotal: 30,
    beneficiariosAdultos: [{ id: adultId }], beneficiariosNinos: [], assignedPassengerIds: [adultId] };
  const doc = render({ peopleDetails: { adults: [adult], children: [child] }, childrenCount: 1,
    days: [{ numero: 1, servicios: [service] }], subtotalIndividual: 30 });
  const rows = pills(doc);
  assert.equal(rows.length, 2);
  assert.ok(rows.some(row => row.classList.contains("ac__summary-total-pill--adult")));
  assert.ok(rows.some(row => row.classList.contains("ac__summary-total-pill--child")));
  for (const row of rows) assert.ok(row.querySelector("svg"));
});

test("un cargo compartido sin beneficiarios se renderiza y conserva su importe", () => {
  const service = { id: "transport-charge", typeService: "transportes", parentService: { typeService: "transportes" },
    childService: { capacidad: 3 }, tipoPrecio: "compartido", precioServicio: 30, precioTotal: 30,
    beneficiariosAdultos: [], beneficiariosNinos: [], assignedPassengerIds: [] };
  const doc = render({ days: [{ numero: 1, servicios: [service] }] });
  const rows = pills(doc);
  const charge = rows.find(row => row.textContent.includes("Cargo del servicio"));
  assert.ok(charge, "El cargo conserva su fila en el resumen");
  assert.match(charge.textContent, /\$30/);
  assert.ok(charge.querySelector("svg"));
  assert.doesNotMatch(charge.className, /undefined/);
});