import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { buildReservationFileInput, canCreateReservationFile, isEmptyReservationFile, reservationFileTitle } from "../reservationFileCreation";
import { matchesCotizacionSearch } from "../cotizacionSearch";

const emptyFile = { id: "COT-EMPTY", voucher_code: "DK0802", titulo: "", cantidadpersonas: 0,
  num_adults: 0, num_children: 0, passengers: [], itinerario: [], itinerario_externo: [], is_active: true };

test("only Reservas and superadmin in Reservas use the empty-file creation flow", () => {
  assert.equal(canCreateReservationFile(3, "/reservas/cotizaciones"), true);
  assert.equal(canCreateReservationFile("3", "/reservas/cotizaciones"), true);
  assert.equal(canCreateReservationFile(0, "/reservas/cotizaciones"), true);
  assert.equal(canCreateReservationFile(0, "/ventas/cotizaciones"), false);
  for (const role of [1, 2, 4, 5, 6, -1, null, undefined, "", " ", false, true])
    assert.equal(canCreateReservationFile(role, "/reservas/cotizaciones"), false, String(role));
});

test("file payload contains no commercial defaults, invented passengers or pricing fields", () => {
  assert.deepEqual(buildReservationFileInput({ voucher_code: " DK0802 ", titulo: " " }), { voucher_code: "DK0802" });
  assert.deepEqual(buildReservationFileInput({ voucher_code: "DK0802", titulo: " Carmen " }), { voucher_code: "DK0802", titulo: "Carmen" });
  assert.throws(() => buildReservationFileInput({ voucher_code: " " }), /código de file/);
  assert.equal(isEmptyReservationFile(emptyFile), true);
  assert.equal(isEmptyReservationFile({ ...emptyFile, passengers: [{ id: 1 }] }), false);
  assert.equal(isEmptyReservationFile({ ...emptyFile, itinerario: [{ numero: 1 }] }), false);
  assert.equal(isEmptyReservationFile({ ...emptyFile, cantidadpersonas: undefined }), false);
});

test("untitled files list and search by their code while named quotations retain their title", () => {
  assert.equal(reservationFileTitle(emptyFile), "DK0802");
  assert.equal(reservationFileTitle({ ...emptyFile, titulo: " Carmen " }), "Carmen");
  assert.equal(matchesCotizacionSearch(emptyFile, "dk0802"), true);
  assert.equal(matchesCotizacionSearch(emptyFile, "DK08020"), false);
});

(async () => {
  const bundled = await build({
    entryPoints: ["src/pages/Ventas/Cotizaciones/components/ReservationFileModal.tsx"], bundle: true, write: false,
    format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/jsx-runtime", "react-dom"],
    plugins: [{ name: "reservation-file-boundaries", setup(builder) {
      builder.onResolve({ filter: /\.(scss|css)$|useFileUpload$|hooks\/cotizacionService$/ }, args => ({ path: args.path.split("/").at(-1), namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "jsx", contents:
        args.path === "useFileUpload" ? 'export const useFileUpload=()=>({uploadFile:(...args)=>globalThis.__reservationFileHarness.upload(...args),isUploading:false,uploadProgress:0});' :
        args.path === "cotizacionService" ? 'export default {createReservationFile:(...args)=>globalThis.__reservationFileHarness.create(...args),upsertVoucherMedia:(...args)=>globalThis.__reservationFileHarness.upsert(...args)};' : 'export default {};'
      }));
    } }],
  });
  const module = { exports: {} as any };
  new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(resolve("package.json")), module, module.exports);
  const ReservationFileModal = module.exports.default;

  async function withForm(run, overrides: Record<string, any> = {}) {
    const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
    const keys = ["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT", "__reservationFileHarness"];
    const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
    const calls = { create: [] as any[], upload: [] as any[], upsert: [] as any[], order: [] as string[] };
    const media = { mediaAssetId: "487ff8dd-d2a6-4618-8679-e0725ee0ef9c", tigrisUrl: "https://media.example/voucher.pdf",
      metadata: { originalName: "voucher.pdf", contentType: "application/pdf", sizeBytes: 100 } };
    const harness = {
      create: async input => { calls.create.push(input); calls.order.push("create"); return overrides.create ? overrides.create(input) : { quotation: { ...emptyFile }, reused: false }; },
      upload: async (...args) => { calls.upload.push(args); calls.order.push("upload"); return overrides.upload ? overrides.upload(...args) : media; },
      upsert: async (...args) => { calls.upsert.push(args); calls.order.push("upsert"); return overrides.upsert ? overrides.upsert(...args) : { voucherMedia: { ...media, url: media.tigrisUrl } }; },
    };
    Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true, __reservationFileHarness: harness });
    if (!window.HTMLElement.prototype.focus) window.HTMLElement.prototype.focus = function () {};
    const root = createRoot(document.getElementById("root"));
    const results: any[] = [];
    let closes = 0;
    const props = element => element[Object.keys(element).find(key => key.startsWith("__reactProps"))];
    const change = async (selector, value) => React.act(async () => props(document.querySelector(selector)).onChange({ target: { value } }));
    const choose = async () => React.act(async () => props(document.querySelector('input[type="file"]')).onChange({ target: { files: [{ name: "voucher.pdf", size: 100, type: "application/pdf" }] } }));
    const submit = async () => React.act(async () => props(document.querySelector("form")).onSubmit({ preventDefault() {} }));
    const click = async text => React.act(async () => {
      const button = [...document.querySelectorAll("button")].find(button => button.textContent.trim() === text);
      assert.ok(button, text); button.click();
    });
    try {
      await React.act(async () => root.render(<ReservationFileModal isOpen uploadedBy="qa-reservas" onClose={() => { closes++; }} onCreated={result => { results.push(result); }} />));
      await run({ document, calls, results, change, choose, submit, click, closes: () => closes });
    } finally {
      await React.act(async () => root.unmount());
      for (const [key, value] of Object.entries(previous)) value === undefined ? delete globalThis[key] : globalThis[key] = value;
    }
  }

  test("Reservas creates a code-only file without fee, services, title or passenger steps", async () => {
    await withForm(async ({ document, calls, results, change, submit }) => {
      assert.equal(document.querySelectorAll('input:not([type="file"])').length, 2);
      await submit(); assert.equal(calls.create.length, 0);
      assert.match(document.querySelector('[role="alert"]').textContent, /código de file/);
      await change('[name="voucher_code"]', " DK0802 "); await submit();
      assert.deepEqual(calls.create, [{ voucher_code: "DK0802" }]);
      assert.equal(calls.upload.length, 0); assert.equal(calls.upsert.length, 0);
      assert.equal(results.length, 1); assert.equal(results[0].quotation.cantidadpersonas, 0);
      assert.deepEqual(results[0].quotation.itinerario, []); assert.equal(results[0].reused, false);
    });
  });

  test("optional voucher is uploaded after saving the file and linked by its media asset", async () => {
    await withForm(async ({ calls, results, change, choose, submit }) => {
      await change('[name="voucher_code"]', "DK0802"); await change('[name="titulo"]', " Carmen ");
      await choose(); await submit();
      assert.deepEqual(calls.order, ["create", "upload", "upsert"]);
      assert.deepEqual(calls.create[0], { voucher_code: "DK0802", titulo: "Carmen" });
      assert.equal(calls.upload[0][1], "voucher-media");
      assert.equal(calls.upsert[0][0], emptyFile.id);
      assert.equal(calls.upsert[0][1].mediaAssetId, "487ff8dd-d2a6-4618-8679-e0725ee0ef9c");
      assert.equal(results[0].quotation.source_voucher.url, "https://media.example/voucher.pdf");
    });
  });

  test("storage failure preserves the file and allows finishing without attachment", async () => {
    await withForm(async ({ document, calls, results, change, choose, submit, click }) => {
      await change('[name="voucher_code"]', "DK0802"); await choose(); await submit();
      assert.equal(calls.create.length, 1); assert.equal(results.length, 0);
      assert.match(document.querySelector('[role="alert"]').textContent, /está guardado.*Falta adjuntar.*Storage no disponible/);
      assert.equal(document.querySelector('[name="voucher_code"]').hasAttribute("readonly"), true);
      await click("Terminar sin adjunto");
      assert.equal(results.length, 1); assert.equal(results[0].attachmentPending, true);
      assert.equal(calls.create.length, 1);
    }, { upload: async () => { throw new Error("Storage no disponible"); } });
  });

  test("retrying upload does not create another quotation", async () => {
    let attempts = 0;
    await withForm(async ({ calls, results, change, choose, submit }) => {
      await change('[name="voucher_code"]', "DK0802"); await choose(); await submit(); await submit();
      assert.equal(calls.create.length, 1); assert.equal(calls.upload.length, 2); assert.equal(calls.upsert.length, 1);
      assert.equal(results.length, 1);
    }, { upload: async () => {
      if (++attempts === 1) throw new Error("Interrupción temporal");
      return { mediaAssetId: "487ff8dd-d2a6-4618-8679-e0725ee0ef9c", tigrisUrl: "https://media.example/voucher.pdf", metadata: { originalName: "voucher.pdf" } };
    } });
  });

  test("retrying attachment retains its uploaded asset instead of uploading another object", async () => {
    let attempts = 0;
    await withForm(async ({ calls, results, change, choose, submit }) => {
      await change('[name="voucher_code"]', "DK0802"); await choose(); await submit(); await submit();
      assert.equal(calls.create.length, 1); assert.equal(calls.upload.length, 1); assert.equal(calls.upsert.length, 2);
      assert.equal(results.length, 1);
    }, { upsert: async (_id, media) => { if (++attempts === 1) throw new Error("Reintenta el vínculo"); return { voucherMedia: media }; } });
  });

  test("an existing file is focused without replacing its voucher or reporting a new quotation", async () => {
    await withForm(async ({ calls, results, change, choose, submit }) => {
      await change('[name="voucher_code"]', "DK0802"); await choose(); await submit();
      assert.deepEqual(calls.order, ["create"]); assert.equal(results[0].reused, true);
      assert.equal(results[0].attachmentPending, true);
    }, { create: async () => ({ quotation: { ...emptyFile }, reused: true }) });
  });

  test("a conflicting file displays the server message and never uploads or announces success", async () => {
    await withForm(async ({ document, calls, results, change, choose, submit }) => {
      await change('[name="voucher_code"]', "DK0802"); await choose(); await submit();
      assert.match(document.querySelector('[role="alert"]').textContent, /código corresponde a más de una/);
      assert.equal(results.length, 0); assert.equal(calls.upload.length, 0);
    }, { create: async () => { throw { response: { status: 409, data: { message: "El código corresponde a más de una cotización" } } }; } });
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
