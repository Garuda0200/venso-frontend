import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { buildTariffCurrencyInput } from "../tariffCurrencyInput";

test("native PEN and USD amounts require their explicit rate without defaulting to one", () => {
  for (const [moneda, expected] of [["soles", "soles"], ["PEN", "soles"], ["USD", "dolares"], ["dólares", "dolares"]]) {
    assert.deepEqual(buildTariffCurrencyInput({ moneda, tasa_cambio: "3.7512" }), { moneda: expected, tasa_cambio: 3.7512 });
    for (const rate of [undefined, null, "", 0, -1, NaN, Infinity, "incorrecto", 1_000_000]) {
      assert.throws(() => buildTariffCurrencyInput({ moneda, tasa_cambio: rate }), /tipo de cambio/);
    }
  }
  for (const moneda of [null, "", "EUR"]) assert.throws(() => buildTariffCurrencyInput({ moneda, tasa_cambio: 3.75 }), /soles o dólares/);
});

(async () => {
  const bundled = await build({
    entryPoints: ["src/pages/Reservas/Servicios/components/tarifa/TarifaForm.tsx"], bundle: true, write: false,
    format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/jsx-runtime", "react-dom"],
    plugins: [{ name: "tariff-form-boundaries", setup(builder) {
      builder.onResolve({ filter: /\.(scss|css)$|useAuditInfo$|services\/api$|agencyService$/ }, args => ({ path: args.path.split("/").at(-1), namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "jsx", contents:
        args.path === "useAuditInfo" ? 'export default ()=>({userId:"qa"});' :
        args.path === "api" ? 'export const fetchTarifasByServicio=async()=>[];' :
        args.path === "agencyService" ? 'export const getAgencies=async()=>[{id:1,name:"Agencia QA",active:true}];' : 'export default {};'
      }));
    } }],
  });
  const module = { exports: {} as any };
  new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(resolve("package.json")), module, module.exports);
  const TarifaForm = module.exports.default;

  async function withForm(kind, tarifa, run, disabled = false) {
    const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
    const keys = ["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"];
    const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
    Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
    const root = createRoot(document.getElementById("root"));
    const saved: any[] = [];
    const props = element => element[Object.keys(element).find(key => key.startsWith("__reactProps"))];
    const change = async (selector, value) => React.act(async () => {
      const element = document.querySelector(selector); assert.ok(element, selector);
      props(element).onChange({ target: { value } });
    });
    const currency = async label => React.act(async () => {
      const button = [...document.querySelectorAll('[aria-label="Moneda de la tarifa"] button')].find(el => el.textContent.includes(label));
      assert.ok(button, label); button.click();
    });
    const submit = async () => React.act(async () => props(document.querySelector("form")).onSubmit({ preventDefault() {} }));
    try {
      await React.act(async () => root.render(<TarifaForm tarifa={tarifa} idServicio={10} tipoServicio={kind}
        agencyId={1} isSubmitting={disabled} existingTarifasData={[]} onSubmit={value => saved.push(value)} />));
      await run({ document, saved, change, currency, submit });
    } finally {
      await React.act(async () => root.unmount());
      for (const [key, value] of Object.entries(previous)) value === undefined ? delete globalThis[key] : globalThis[key] = value;
    }
  }

  for (const kind of ["habitacion", "movilidad", "ruta", "tour", "vagones", "tipo_vuelo", "tickets", "restaurante", "servicio_extra"]) {
    for (const [label, expected] of [["Soles", "soles"], ["Dólares", "dolares"]]) {
      test(`${kind}: creates ${expected} with the entered exchange rate and native price`, async () => {
        await withForm(kind, null, async ({ document, saved, change, currency, submit }) => {
          await currency(label);
          await change('[aria-label="Tipo de cambio: soles por dólar"]', "3.7512");
          await change('.tf__price-field input', "25.50");
          await submit();
          assert.equal(saved.length, 1, document.body.textContent);
          assert.equal(saved[0].moneda, expected); assert.equal(saved[0].tasa_cambio, 3.7512);
          assert.equal(saved[0].precio_privado, 25.5); assert.equal(saved[0].precio_compartido, null);
          assert.deepEqual(saved[0].agency_ids, [1]);
          if (kind === "tickets") assert.equal(document.querySelectorAll('.tf__mode-chip').length, 1);
        });
      });
    }
  }

  for (const label of ["Soles", "Dólares"]) test(`${label}: missing or invalid exchange rate blocks saving`, async () => {
    await withForm("restaurante", null, async ({ document, saved, change, currency, submit }) => {
      await currency(label); await change('.tf__price-field input', "0");
      for (const value of ["", "0", "-3", "1000000"]) {
        await change('[aria-label="Tipo de cambio: soles por dólar"]', value); await submit();
        assert.equal(saved.length, 0); assert.match(document.querySelector('[role="alert"]').textContent, /tipo de cambio/);
      }
      await change('[aria-label="Tipo de cambio: soles por dólar"]', "3.75"); await submit();
      assert.equal(saved[0].precio_privado, 0);
    });
  });

  test("editing a USD tariff retains its associated rate instead of replacing it with one", async () => {
    await withForm("tour", { id_tarifa: 1, agency_ids: [1], tipo_tarifa: "externa", precio_privado: 40, moneda: "dolares", tasa_cambio: 3.78 }, async ({ document, saved, submit }) => {
      assert.equal(document.querySelector('[aria-label="Tipo de cambio: soles por dólar"]').value, "3.78");
      await submit(); assert.equal(saved[0].tasa_cambio, 3.78); assert.equal(saved[0].precio_privado, 40);
    });
  });

  test("changing the price currency clears amounts while retaining the explicitly entered exchange rate", async () => {
    await withForm("movilidad", null, async ({ document, saved, change, currency, submit }) => {
      await change('[aria-label="Tipo de cambio: soles por dólar"]', "3.75"); await change('.tf__price-field input', "40");
      await currency("Soles"); assert.equal(document.querySelector('.tf__price-field input').value, "");
      assert.equal(document.querySelector('[aria-label="Tipo de cambio: soles por dólar"]').value, "3.75");
      await submit(); assert.equal(saved.length, 0);
      await change('.tf__price-field input', "150"); await submit();
      assert.equal(saved[0].precio_privado, 150); assert.equal(saved[0].moneda, "soles");
    });
  });

  test("saving disables both currencies and the exchange-rate input", async () => {
    await withForm("tickets", null, async ({ document }) => {
      assert.equal(document.querySelectorAll('[aria-label="Moneda de la tarifa"] button:disabled').length, 2);
      assert.equal(document.querySelector('[aria-label="Tipo de cambio: soles por dólar"]').disabled, true);
    }, true);
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
