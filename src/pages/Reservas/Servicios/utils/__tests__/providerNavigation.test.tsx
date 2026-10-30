import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { catalogueProviders, filterCatalogueProviders, isProviderCategory, PROVIDER_CATALOGUES } from "../providerCatalogue";

const records = {
  hoteles: [{ id_hotel: 1, nombre: "Hotel Andino", ciudad: "Cusco" }, { id_hotel: 2, nombre: "Hotel Valle" }],
  transportes: [{ id_transporte: 1, nombre_transporte: "Transportes Andino", zona: "Cusco" }, { id_transporte: 2, nombre_transporte: "Transportes Valle" }],
  vuelos: [{ id_vuelo: 1, nombre: "Aerolínea Andina" }, { id_vuelo: 2, nombre: "Aerolínea Valle" }],
  trenes: [{ id_tren: 1, nombre_empresa: "Tren Andino" }, { id_tren: 2, nombre_empresa: "Tren Valle" }],
  endoses: [{ id_endose: 1, nombre_agencia: "Operador Andino" }, { id_endose: 2, nombre_agencia: "Operador Valle" }],
  guias: [{ guia: { id_guia: 1, idioma: ["Español", "Inglés"] }, persona: { nombres: "José", apellidos: "Andino" } }, { id_guia: 2, nombres: "Ana", apellidos: "Valle" }],
};

test("solo los seis catálogos padre muestran proveedores; los servicios directos no crean un nivel artificial", () => {
  for (const category of Object.keys(records)) assert.equal(isProviderCategory(category), true);
  for (const category of [null, "tickets", "restaurantes", "extras", "agencias", "toString"]) assert.equal(isProviderCategory(category), false);
  const guides = catalogueProviders("guias", records.guias);
  assert.equal(guides.find(guide => guide.id === "1")?.name, "José Andino");
  assert.equal(guides.find(guide => guide.id === "1")?.detail, "Español · Inglés");
});

test("la búsqueda de proveedores reconoce tildes, nombre y ubicación sin modificar sus registros", () => {
  const providers = catalogueProviders("hoteles", [{ id_hotel: 3, nombre: "Ñusta", ciudad: "Písac" }, ...records.hoteles]);
  assert.deepEqual(filterCatalogueProviders(providers, "nusta").map(row => row.id), ["3"]);
  assert.deepEqual(filterCatalogueProviders(providers, "pisac").map(row => row.id), ["3"]);
  assert.equal(filterCatalogueProviders(providers, "  ").length, 3);
  assert.equal(filterCatalogueProviders(providers, "inexistente").length, 0);
});

(async () => {
  const bundled = await build({
    stdin: { contents: `import React from 'react';
      import Workspace from './src/pages/Reservas/Servicios/components/common/ServiciosWorkspace';
      import { useProviderCatalogue } from './src/pages/Reservas/Servicios/context/ServiciosProviderContext';
      import { providerId } from './src/pages/Reservas/Servicios/utils/providerCatalogue';
      function Child({ category, provider }) { const [draft, setDraft] = React.useState(''); return <section data-provider={providerId(category, provider)}><input aria-label="Borrador de servicio" value={draft} onChange={e => setDraft(e.target.value)} /></section>; }
      function Parent({ category, rows, loading=false, error=null }) { const nav=useProviderCatalogue(category, rows, loading, error);
        return nav.provider ? <><Child key={providerId(category,nav.provider)} category={category} provider={nav.provider} /><button onClick={nav.closeProvider}>Volver a proveedores</button></> : <div data-management="true">{rows.map(row => <button key={providerId(category,row)} onClick={()=>nav.openProvider(row)}>Abrir desde tabla {providerId(category,row)}</button>)}</div>;
      }
      export default function Harness({category, rows, loading, error, scope='agency1'}) { return <Workspace key={category} category={category}><Parent key={scope} category={category} rows={rows} loading={loading} error={error} /></Workspace>; }`,
      resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/jsx-runtime", "react-dom"],
    plugins: [{ name: "style-boundary", setup(builder) { builder.onLoad({ filter: /\.scss$/ }, () => ({ contents: "", loader: "js" })); } }],
  });
  const module = { exports: {} as any };
  new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(resolve("package.json")), module, module.exports);
  const Harness = module.exports.default;

  async function withWorkspace(category, run) {
    const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
    const previous = Object.fromEntries(["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, globalThis[key]]));
    Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
    const root = createRoot(document.getElementById("root"));
    let state = { category, rows: records[category] || [], loading: false, error: null, scope: "agency1" };
    const props = element => element[Object.keys(element).find(key => key.startsWith("__reactProps"))];
    const render = async patch => { state = { ...state, ...patch }; await React.act(async () => root.render(<Harness {...state} />)); };
    const click = async selector => { const element = document.querySelector(selector); assert.ok(element, selector); await React.act(async () => element.click()); };
    const change = async (selector, value) => { const element = document.querySelector(selector); assert.ok(element, selector); await React.act(async () => props(element).onChange({ target: { value } })); };
    try { await render({}); await run({ document, render, click, change }); }
    finally { await React.act(async () => root.unmount()); for (const [key, value] of Object.entries(previous)) value === undefined ? delete globalThis[key] : globalThis[key] = value; }
  }

  for (const category of Object.keys(records)) test(`${category}: el panel y la tabla comparten selección; cambiar de proveedor reinicia su editor`, async () => {
    await withWorkspace(category, async ({ document, click, change }) => {
      assert.ok(document.querySelector('[data-management="true"]'));
      const firstName = catalogueProviders(category as any, records[category]).find(row => row.id === "1")!.name;
      await click(`[aria-label="Ver ${PROVIDER_CATALOGUES[category].services.toLowerCase()} de ${firstName}"]`);
      assert.equal(document.querySelector('[data-provider]')?.getAttribute("data-provider"), "1");
      await change('[aria-label="Borrador de servicio"]', "Solo proveedor uno");
      const secondName = catalogueProviders(category as any, records[category]).find(row => row.id === "2")!.name;
      await click(`[aria-label="Ver ${PROVIDER_CATALOGUES[category].services.toLowerCase()} de ${secondName}"]`);
      assert.equal(document.querySelector('[data-provider]')?.getAttribute("data-provider"), "2");
      assert.equal(document.querySelector<HTMLInputElement>('[aria-label="Borrador de servicio"]')!.value, "");
      await click('.services-provider-sidebar__manage');
      assert.ok(document.querySelector('[data-management="true"]'));
      await React.act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === "Abrir desde tabla 1")!.click());
      assert.equal(document.querySelector('.services-provider-sidebar__item[aria-current="page"]')?.getAttribute("aria-label"), `Ver ${PROVIDER_CATALOGUES[category].services.toLowerCase()} de ${firstName}`);
    });
  });

  test("cambiar de agencia conserva el proveedor; quitarlo o cambiar de categoría vuelve a su gestión", async () => {
    await withWorkspace("hoteles", async ({ document, render, change }) => {
      await change('[aria-label="Proveedor"]', "2");
      await render({ scope: "agency2" });
      assert.equal(document.querySelector('[data-provider]')?.getAttribute("data-provider"), "2");
      await render({ rows: [records.hoteles[0]] });
      assert.ok(document.querySelector('[data-management="true"]'));
      await change('[aria-label="Proveedor"]', "1");
      await render({ category: "transportes", rows: records.transportes });
      assert.ok(document.querySelector('[data-management="true"]'));
      assert.equal(document.querySelector('.services-provider-sidebar__item[aria-current]'), null);
    });
  });

  test("el panel refleja altas y cambios del padre y mantiene búsqueda independiente de los filtros del servicio", async () => {
    await withWorkspace("hoteles", async ({ document, render, change }) => {
      await change('[aria-label="Buscar proveedor"]', "nuevo");
      assert.match(document.body.textContent, /Sin coincidencias/);
      await render({ rows: [...records.hoteles, { id_hotel: 3, nombre: "Nuevo Hotel" }] });
      assert.equal(document.querySelectorAll('.services-provider-sidebar__item').length, 1);
      await change('[aria-label="Proveedor"]', "3");
      assert.equal(document.querySelector('[data-provider]')?.getAttribute("data-provider"), "3");
    });
  });

  test("la carga, los errores y el catálogo vacío tienen estados accesibles", async () => {
    await withWorkspace("hoteles", async ({ document, render }) => {
      await render({ loading: true, rows: [] });
      assert.equal(document.querySelector('aside')?.getAttribute("aria-busy"), "true");
      assert.ok(document.querySelector('[role="status"][aria-label="Cargando proveedores"]'));
      await render({ loading: false, error: "No se pudieron cargar los proveedores" });
      assert.match(document.querySelector('[role="alert"]')!.textContent, /No se pudieron cargar/);
      await render({ error: null });
      assert.match(document.querySelector('[role="status"]')!.textContent, /Sin proveedores registrados/);
    });
  });

  test("entradas, restaurantes, extras y agencias aprovechan todo el espacio sin panel ficticio", async () => {
    await withWorkspace("tickets", async ({ document, render }) => {
      for (const category of ["tickets", "restaurantes", "extras", "agencias"]) {
        await render({ category, rows: [] });
        assert.equal(document.querySelector('aside'), null);
        assert.equal(document.querySelector('.services-workspace--providers'), null);
      }
    });
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
