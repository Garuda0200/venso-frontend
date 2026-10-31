import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";

test("duplicating a tariff for other agencies preserves its internal standard context without inventing a season", async () => {
  const bundled = await build({
    entryPoints: ["src/pages/Reservas/Servicios/components/tarifa/TarifaClonePopover.tsx"], bundle: true, write: false,
    format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/jsx-runtime", "react-dom"],
    plugins: [{ name: "clone-agency-boundaries", setup(builder) {
      builder.onResolve({ filter: /\.scss$|agencyService$/ }, args => ({ path: args.path.split("/").at(-1), namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "jsx", contents:
        args.path === "agencyService" ? 'export const getAgencies=async()=>[1,2,3].map(id=>({id,name:"Agencia QA "+id,active:true}));' : 'export default {};'
      }));
    } }],
  });
  const module = { exports: {} as any };
  new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(resolve("package.json")), module, module.exports);
  const Clone = module.exports.default;
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  const values: any = { window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, globalThis[key]]));
  Object.assign(globalThis, values);
  window.innerWidth = 1200; window.innerHeight = 800;
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ top: 50, left: 100, bottom: 80, right: 140, width: 40, height: 30 });
  const root = createRoot(document.getElementById("root"));
  const saved: any[] = [];
  const source = { id_tarifa: 41, agency_ids: [1], id_servicio: 81, tipo_servicio: "movilidad", tipo_tarifa: "interna", anio: 2026,
    tiene_temporada: false, temporada: null, precio_compartido: 120, precio_privado: 25, moneda: "soles", tasa_cambio: 3.75 };
  const click = async (selector, text?) => React.act(async () => {
    const elements = [...document.querySelectorAll(selector)];
    const button = text ? elements.find(el => el.textContent.trim() === text) : elements[0];
    assert.ok(button, `${selector} ${text || ""}`); assert.equal(button.disabled, false); button.click();
  });
  try {
    await React.act(async () => root.render(<Clone sourceTarifa={source} existingTarifas={[source]} onClone={row => saved.push(row)} />));
    await click(".tarifa-clone-trigger");
    await click(".tac-trigger");
    await click(".tac-menu button", "Agencia QA 2");
    await click(".tac-menu button", "Agencia QA 3");
    await click('button[aria-label="Quitar Agencia QA 1"]');
    await click(".clone-option.tipo", "Interna");
    await click(".clone-btn-generate");
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0].agency_ids, [2, 3]);
    assert.equal(saved[0].tipo_tarifa, "interna");
    assert.equal(saved[0].tiene_temporada, false);
    assert.equal(saved[0].temporada, null);
    assert.equal(saved[0].precio_compartido, 120); assert.equal(saved[0].precio_privado, 25);
  } finally {
    await React.act(async () => root.unmount());
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete globalThis[key] : globalThis[key] = value;
  }
});
