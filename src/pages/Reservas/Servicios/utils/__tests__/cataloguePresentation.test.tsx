import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import TarifaPriceSummary from "../../components/tarifa/TarifaPriceSummary";
import EntidadIconView from "../../components/EntidadIconView";
import { initialTariffModes, validateTariffModePrices, buildTariffModePrices } from "../tariffPriceModes";
import { buildInlineTariffPricePatch, saveInlineTariffPrice } from "../tariffInlinePrice";

const renderPrice = (tarifa: any) => renderToStaticMarkup(<TarifaPriceSummary tarifa={tarifa} />);
const source = (path: string) => readFileSync(resolve(process.cwd(), "src/pages/Reservas/Servicios", path), "utf8");

test("tarifa dual identifica compartido y privado sin reordenar sus precios", () => {
  const html = renderPrice({ precio_compartido: "80", precio_privado: "40", moneda: "dolares" });
  assert.match(html, /Compartido/);
  assert.match(html, /\$ 80.00/);
  assert.match(html, /Privado/);
  assert.match(html, /\$ 40.00/);
  assert.equal((html.match(/<button /g) || []).length, 2);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-pressed="false"/);
});

test("una modalidad desactivada no muestra chip ni cambia la moneda", () => {
  const html = renderPrice({ precio_compartido: null, precio_privado: "125.50", moneda: "soles" });
  assert.match(html, /Privado/);
  assert.match(html, /S\/ 125.50/);
  assert.doesNotMatch(html, /Compartido/);
});

test("ausencia de precio no se transforma en cero, NaN ni un importe inventado", () => {
  const html = renderPrice({ precio_compartido: null, precio_privado: "incorrecto" });
  assert.equal((html.match(/Sin precio/g) || []).length, 1);
  assert.doesNotMatch(html, /NaN|0.00/);
  assert.match(renderPrice({ precio_privado: 0 }), /\$ 0.00/);
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
  assert.match(form, /aria-pressed=\{enabledModes\[mode\]\}/);
  assert.match(form, /buildTariffModePrices/);
});

test("activar y desactivar modalidades conserva importes independientes y acepta cero", () => {
  assert.deepEqual(initialTariffModes(null), {compartido:false,privado:true});
  assert.deepEqual(initialTariffModes({precio_compartido:0,precio_privado:null}), {compartido:true,privado:false});
  const prices = {precio_compartido:"0",precio_privado:"75.50"};
  assert.deepEqual(buildTariffModePrices(prices,{compartido:true,privado:true}), {precio_compartido:0,precio_privado:75.5});
  assert.deepEqual(buildTariffModePrices(prices,{compartido:false,privado:true}), {precio_compartido:null,precio_privado:75.5});
  assert.ok(validateTariffModePrices(prices,{compartido:false,privado:false}).modalidades);
  assert.ok(validateTariffModePrices({precio_privado:""},{compartido:false,privado:true}).precio_privado);
  assert.ok(validateTariffModePrices({precio_privado:"-1"},{compartido:false,privado:true}).precio_privado);
});

test("el formulario y la clonación mantienen modalidades sin el campo retirado", () => {
  const form = source("components/tarifa/TarifaForm.tsx");
  assert.match(form, /aria-label="Modalidades disponibles"/);
  assert.match(form, /disabled=\{isSubmitting\}/);
  assert.match(form, /tf__mode-chip/);
  assert.doesNotMatch(form, /precio_unico|toggleUniquePrice/);
  const clone = source("components/tarifa/TarifaClonePopover.tsx");
  assert.match(clone, /sourceTarifa.precio_compartido == null \? null/);
  assert.match(clone, /sourceTarifa.precio_privado == null \? null/);
  assert.doesNotMatch(clone, /precio_unico/);
});

test("cada importe permite edición directa sin abrir el popover del formulario", () => {
  const html = renderToStaticMarkup(<TarifaPriceSummary tarifa={{precio_compartido:25,precio_privado:25}}
    onPriceSave={async () => {}} />);
  assert.match(html, /aria-label="Editar precio compartido: \$ 25.00"/);
  assert.match(html, /aria-label="Editar precio privado: \$ 25.00"/);
  assert.doesNotMatch(html, /<form/);
  const renderer = source("components/tarifa/TarifasCellRenderer.tsx");
  assert.match(renderer, /onPriceSave=\{canManage/);
  assert.match(renderer, /updateTarifaPrice\(tarifa.id_tarifa, patch\)/);
  const editor = source("components/tarifa/InlineTariffPrice.tsx");
  assert.match(editor, /autoFocus inputMode="decimal"/);
  assert.match(editor, /event.key === "Escape"/);
  assert.match(editor, /inFlight.current/);
  assert.match(editor, /Guardar \$\{label\}/);
  assert.match(editor, /role="alert"/);
  const api = source("services/api.ts");
  const partialEndpoint = api.slice(api.indexOf("export const updateTarifaPrice"),api.indexOf("export const deleteTarifa"));
  assert.doesNotMatch(partialEndpoint, /buildTariffPayload/);
  assert.match(partialEndpoint, /withUpdateAuditFields\(patch\)/);
});

test("el patch de un monto preserva agencia, tipo, temporada, moneda y el otro precio", () => {
  assert.deepEqual(buildInlineTariffPricePatch("compartido"," 12,50 "),{precio_compartido:12.5});
  assert.deepEqual(buildInlineTariffPricePatch("privado","0"),{precio_privado:0});
  for(const value of ["", " ", "-1", "Infinity", "NaN", "1e2", "1.234", "12abc", "1,2,3"]){
    assert.throws(() => buildInlineTariffPricePatch("privado",value));
  }
  assert.throws(() => buildInlineTariffPricePatch("unico" as any,"20"));
});

test("el flujo de edición guarda solo el precio elegido en cada tarifa/agencia", async () => {
  const tariffs = ["interna","externa","cotizacion"].flatMap((tipo_tarifa,index) => [1,2].map(agency => ({
    id_tarifa: index*10+agency, agency_ids:[agency], tipo_tarifa, anio:2026, moneda:"soles",
    temporada:"alta", precio_compartido:25, precio_privado:25,
  })));
  for(const tariff of tariffs){
    const before = {...tariff};
    const persist = async patch => {Object.assign(tariff,patch);};
    assert.equal(await saveInlineTariffPrice("compartido","40.25",25,persist),true);
    assert.deepEqual(tariff,{...before,precio_compartido:40.25});
    assert.equal(await saveInlineTariffPrice("privado","0",25,persist),true);
    assert.deepEqual(tariff,{...before,precio_compartido:40.25,precio_privado:0});
  }
});

test("errores y valores idénticos no simulan guardados ni pierden el borrador", async () => {
  let calls=0;
  const persist = async () => {calls++; throw new Error("Sin conexión");};
  assert.equal(await saveInlineTariffPrice("privado","25.00",25,persist),false);
  assert.equal(calls,0);
  await assert.rejects(saveInlineTariffPrice("privado","-1",25,persist));
  assert.equal(calls,0);
  await assert.rejects(saveInlineTariffPrice("privado","30",25,persist),/Sin conexión/);
  assert.equal(calls,1);
});
