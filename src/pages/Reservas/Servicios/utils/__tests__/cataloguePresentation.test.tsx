import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import TarifaPriceSummary from "../../components/tarifa/TarifaPriceSummary";
import EntidadIconView from "../../components/EntidadIconView";

const renderPrice = (tarifa: any) => renderToStaticMarkup(<TarifaPriceSummary tarifa={tarifa} />);
const source = (path: string) => readFileSync(resolve(process.cwd(), "src/pages/Reservas/Servicios", path), "utf8");

test("tarifa dual identifica compartido y privado sin reordenar sus precios", () => {
  const html = renderPrice({ precio_unico: false, precio_compartido: "80", precio_privado: "40", moneda: "dolares" });
  assert.match(html, /Compartido<\/span><strong>\$ 80.00/);
  assert.match(html, /Privado<\/span><strong>\$ 40.00/);
});

test("precio único no muestra un segundo precio ni cambia la moneda", () => {
  const html = renderPrice({ precio_unico: true, precio_compartido: "125.50", precio_privado: "600", moneda: "soles" });
  assert.match(html, /Precio único/);
  assert.match(html, /S\/ 125.50/);
  assert.doesNotMatch(html, /Privado|600/);
});

test("ausencia de precio no se transforma en cero, NaN ni un importe inventado", () => {
  const html = renderPrice({ precio_unico: false, precio_compartido: null, precio_privado: "incorrecto" });
  assert.equal((html.match(/Sin precio/g) || []).length, 2);
  assert.doesNotMatch(html, /NaN|0.00/);
  assert.match(renderPrice({ precio_unico: true, precio_compartido: 0 }), /\$ 0.00/);
});

test("los catálogos se abren desde botones nativos accesibles por teclado", () => {
  const html = renderToStaticMarkup(<EntidadIconView entidades={[{ id: "trenes", name: "Trenes", description: "Empresas y vagones", icon: <span /> }]} onSelectEntidad={() => {}} />);
  assert.match(html, /<button type="button"/);
  assert.match(html, /Trenes/);
  assert.match(html, /Empresas y vagones/);
});

test("la reorganización conserva agencias, claves por catálogo y operaciones protegidas", () => {
  const page = source("Servicios.tsx");
  assert.match(page, /setServiciosAgencyScope\(selectedAgencyId\)/);
  assert.match(page, /key=\{scopedKey\}/);
  assert.match(page, /aria-current=/);
  const renderer = source("components/tarifa/TarifasCellRenderer.tsx");
  assert.match(renderer, /<TarifaPriceSummary tarifa=\{tarifa\}/);
  assert.match(renderer, /createTarifa|updateTarifa|deleteTarifa/);
  assert.match(renderer, /disabled=\{!canManage \|\| isSubmitting \|\| isProtected\}/);
  assert.match(renderer, /tarifa.temporada : "Estándar"/);
  const form = source("components/tarifa/TarifaForm.tsx");
  assert.match(form, /fetchTarifasByServicio/);
  assert.match(form, /agency_ids: formData.agency_ids.map\(Number\)/);
  assert.match(form, /aria-pressed=\{formData.precio_unico\}/);
});
