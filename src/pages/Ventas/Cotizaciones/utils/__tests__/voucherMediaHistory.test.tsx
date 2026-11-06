import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { normalizeSourceVoucher, resolveVoucherMediaForFile, validateSourceVoucherFile } from "../sourceVoucher";
import { voucherMediaDownloadPath } from "../voucherMediaHistory";
import { buildBibliaActivitiesFromSnapshots, resolveBibliaVoucherTarget } from "../../../../Reservas/Calendario/utils/bibliaActivityMapper";

const ids = {
  first: "4b280a17-d01f-4171-b4bd-e7ed6bfef311",
  second: "4b280a17-d01f-4171-b4bd-e7ed6bfef312",
  upload: "4b280a17-d01f-4171-b4bd-e7ed6bfef313",
};
const quoteId = "COT-QA-MEDIA";
const media = (id, number, name = "voucher.docx") => ({
  version: 1, cotizacionId: quoteId, documentVersionId: id, versionNumber: number,
  mediaRevision: number, mediaAssetId: id, url: `https://test.fly.storage.tigris.dev/voucher-media/${id}.docx`,
  originalName: name, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  sizeBytes: 120, uploadedAt: "2026-11-05T12:00:00Z",
});
const version = (id, number) => ({
  id, versionNumber: number, mediaAssetId: id, media: media(id, number),
  origin: "upload", createdAt: "2026-11-05T12:00:00Z",
});
const initial = () => ({
  cotizacionId: quoteId, revision: 2, currentVersionId: ids.second,
  voucherMedia: media(ids.second, 2), versions: [version(ids.second, 2), version(ids.first, 1)],
  nextBeforeVersion: null, capabilities: { canManage: true, canDownload: true },
});

test("document normalization retains the version identity and a detached head suppresses legacy fallback", () => {
  const normalized = normalizeSourceVoucher(media(ids.first, 1));
  assert.equal(normalized.documentVersionId, ids.first);
  assert.equal(normalized.versionNumber, 1);
  assert.equal(voucherMediaDownloadPath(normalized), `/turismo/cotizaciones/${quoteId}/voucher-media/versions/${ids.first}/download`);
  assert.deepEqual(resolveVoucherMediaForFile({ documentDetached: true, mediaRevision: 3 }, media(ids.first, 1)), { media: null, canonicalLinked: true });
  assert.equal(validateSourceVoucherFile({ name: "voucher.docx", size: 120 }), "");
  assert.match(validateSourceVoucherFile({ name: "../voucher.docx", size: 120 }), /nombre/);
  assert.match(validateSourceVoucherFile({ name: "programa.exe", size: 120 }), /Selecciona/);
});

test("Biblia opens the current file version ahead of legacy media and cached activity snapshots", () => {
  const current = media(ids.second, 2);
  const quote = { id: quoteId, source_voucher: current, voucher_reserva_media: media(ids.first, 1), biblia_actividades: [] };
  const row = { id: "QA-row", cotizacion_id: quoteId, platform: "venso", actividad: { id: "QA-day", dateKey: "2026-11-05", sourceVoucherMedia: media(ids.first, 1) } };
  assert.equal(resolveBibliaVoucherTarget(quote).media.documentVersionId, ids.second);
  assert.equal(buildBibliaActivitiesFromSnapshots([quote], [row])[0].sourceVoucherMedia.documentVersionId, ids.second);
  const detached = { ...quote, source_voucher: { documentDetached: true, mediaRevision: 3 } };
  assert.equal(resolveBibliaVoucherTarget(detached).media, null);
  assert.equal(buildBibliaActivitiesFromSnapshots([detached], [row])[0].sourceVoucherMedia, null);
});

(async () => {
  const bundled = await build({
    entryPoints: ["src/pages/Ventas/Cotizaciones/components/VoucherMediaManagerModal.tsx"],
    bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic",
    external: ["react", "react/jsx-runtime", "react-dom"],
    plugins: [{ name: "voucher-media-boundaries", setup(builder) {
      builder.onResolve({ filter: /\.scss$|useFileUpload$|hooks\/voucherMediaService$|\.\/voucherMediaService$|SourceVoucherPreviewModal$/ }, args => ({
        path: args.path.split("/").at(-1), namespace: "fixture",
      }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => {
        const contents = args.path === "useFileUpload"
          ? "export const useFileUpload=()=>({uploadFile:(...args)=>globalThis.__media.upload(...args),deleteFile:async()=>{},isUploading:false,uploadProgress:0});"
          : args.path === "voucherMediaService"
            ? "export const VOUCHER_MEDIA_CHANGED='venso:voucher-media-changed';export const voucherMediaService=new Proxy({}, {get:(_,method)=>(...args)=>globalThis.__media[method](...args)});"
            : args.path === "SourceVoucherPreviewModal"
              ? "export default function Preview({isOpen}) { return isOpen ? <div data-preview='open'/> : null; }"
              : "export default {};";
        return { loader: "jsx", contents };
      });
    } }],
  });
  const module = { exports: {} as any };
  new Function("require", "module", "exports", bundled.outputFiles[0].text)(
    createRequire(resolve("package.json")), module, module.exports,
  );
  const Modal = module.exports.default;

  async function withModal(run, overrides: any = {}) {
    const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
    const keys = ["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT", "__media"];
    const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
    const calls = { uploads: [] as any[], publishes: [] as any[], operations: [] as any[], changes: [] as any[], downloads: [] as string[], histories: [] as (number | null)[], closes: 0 };
    const f = {
      state: initial(),
      history: async (_id, before) => {
        calls.histories.push(before ?? null);
        return overrides.history ? overrides.history(f, before, calls) : structuredClone(f.state);
      },
      upload: async (file, folder) => {
        calls.uploads.push({ file, folder });
        return { mediaAssetId: ids.upload, tigrisUrl: media(ids.upload, 3).url, metadata: { originalName: file.name, sizeBytes: file.size, contentType: file.type } };
      },
      publish: async (_id, request) => {
        calls.publishes.push(structuredClone(request));
        if (overrides.publish) return overrides.publish(f, request, calls);
        const next = version(ids.upload, f.state.versions.length + 1);
        next.media.originalName = "editado.docx";
        f.state = { ...f.state, revision: f.state.revision + 1, currentVersionId: next.id, voucherMedia: next.media, versions: [next, ...f.state.versions] };
        return { ...f.state, operationId: request.operationId, resultVersionId: next.id };
      },
      operation: async (_id, operationId) => {
        calls.operations.push(operationId);
        if (overrides.operation) return overrides.operation(f, operationId);
        throw { response: { status: 404 } };
      },
      download: async path => { calls.downloads.push(path); return new Blob(["word"]); },
      detach: async (_id, request) => {
        f.state = { ...f.state, revision: f.state.revision + 1, currentVersionId: null, voucherMedia: null };
        return { ...f.state, operationId: request.operationId, resultVersionId: null };
      },
      restore: async (_id, sourceId, request) => {
        const source = f.state.versions.find(row => row.id === sourceId);
        const restored = { ...source, id: ids.upload, versionNumber: 3, origin: "restore", media: { ...source.media, documentVersionId: ids.upload, versionNumber: 3 } };
        f.state = { ...f.state, revision: f.state.revision + 1, currentVersionId: restored.id, voucherMedia: restored.media, versions: [restored, ...f.state.versions] };
        return { ...f.state, operationId: request.operationId, resultVersionId: restored.id };
      },
    };
    if (overrides.state) f.state = { ...f.state, ...overrides.state };
    if (overrides.readOnly) f.state.capabilities.canManage = false;
    Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true, __media: f });
    window.HTMLElement.prototype.showModal = function () { this.open = true; };
    window.HTMLElement.prototype.close = function () { this.open = false; };
    const root = createRoot(document.getElementById("root"));
    const props = element => element[Object.keys(element).find(key => key.startsWith("__reactProps"))];
    const click = async text => React.act(async () => {
      const button = [...document.querySelectorAll("button")].find(button => button.textContent.trim() === text || button.getAttribute("aria-label") === text);
      assert.ok(button, text);
      assert.equal(button.disabled, false, text);
      button.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    const choose = async () => React.act(async () => {
      const element = document.querySelector('input[type="file"]');
      props(element).onChange({ target: { value: "", files: [{ name: "editado.docx", size: 120, type: media(ids.first, 1).contentType }] } });
    });
    const change = async (selector, value) => React.act(async () => props(document.querySelector(selector)).onChange({ target: { value } }));
    try {
      await React.act(async () => {
        root.render(<Modal isOpen cotizacionId={quoteId} voucherCode="DK-QA" onClose={() => { calls.closes++; }} onChanged={value => { calls.changes.push(value); }} />);
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      await run({ document, f, calls, click, choose, change });
    } finally {
      await React.act(async () => root.unmount());
      for (const [key, value] of Object.entries(previous)) value === undefined ? delete globalThis[key] : globalThis[key] = value;
    }
  }

  test("history displays versions and read-only users can download without modification actions", async () => {
    await withModal(async ({ document, calls, click }) => {
      assert.equal(document.querySelector('input[type="file"]'), null);
      await click("Ver historial");
      assert.equal(document.querySelectorAll(".voucher-media-manager__history li").length, 2);
      assert.equal(document.querySelector('[aria-label="Restaurar versión 1"]'), null);
      await click("Descargar versión 1");
      assert.match(calls.downloads[0], new RegExp(ids.first));
    }, { readOnly: true });
  });

  test("loading older versions refreshes the first page when another writer changes the head", async () => {
    await withModal(async ({ document, calls, click }) => {
      await click("Ver historial");
      await click("Ver versiones anteriores");
      const list = document.querySelector(".voucher-media-manager__history");
      assert.match(list.textContent, /Versión 3/);
      assert.deepEqual(calls.histories, [null, 2, null]);
      assert.ok(document.querySelector('[aria-label="Descargar versión 3"]'));
    }, {
      state: { versions: [version(ids.second, 2)], nextBeforeVersion: 2 },
      history: async (f, before) => {
        if (before) {
          f.state = { ...f.state, revision: 3, currentVersionId: ids.upload,
            voucherMedia: media(ids.upload, 3), versions: [version(ids.upload, 3), version(ids.second, 2)] };
          return { ...f.state, versions: [version(ids.first, 1)], nextBeforeVersion: null };
        }
        return structuredClone(f.state);
      },
    });
  });

  test("edited Word creates a version with its actual base and retains the previous rows", async () => {
    await withModal(async ({ document, calls, click, choose, change }) => {
      await choose();
      await change("select", ids.first);
      await change('.voucher-media-manager__upload-form input', "Cambio de horario");
      await click("Guardar nueva versión");
      assert.equal(calls.uploads.length, 1);
      assert.equal(calls.publishes[0].expectedRevision, 2);
      assert.equal(calls.publishes[0].baseVersionId, ids.first);
      assert.equal(calls.publishes[0].origin, "external_edit");
      assert.equal(calls.publishes[0].note, "Cambio de horario");
      await click("Ver historial");
      assert.equal(document.querySelectorAll(".voucher-media-manager__history li").length, 3);
      assert.equal(calls.changes.length, 1);
    });
  });

  test("a revision conflict preserves the selected file and retries against the refreshed head", async () => {
    await withModal(async ({ document, calls, click, choose }) => {
      await choose();
      await click("Guardar nueva versión");
      assert.match(document.querySelector('[role="alert"]').textContent, /Otra persona/);
      assert.match(document.querySelector(".voucher-media-manager__dropzone").textContent, /editado.docx/);
      await click("Guardar nueva versión");
      assert.equal(calls.uploads.length, 1);
      assert.equal(calls.publishes[1].expectedRevision, 3);
      assert.notEqual(calls.publishes[1].operationId, calls.publishes[0].operationId);
    }, { publish: async (f, request, calls) => {
      if (calls.publishes.length === 1) {
        f.state.revision = 3;
        throw { response: { status: 409, data: { message: "Otra persona actualizó el archivo. Revisa la versión vigente." } } };
      }
      return { ...f.state, operationId: request.operationId, resultVersionId: ids.upload };
    } });
  });

  test("an interrupted response retries the same operation without uploading the Word again", async () => {
    await withModal(async ({ calls, click, choose }) => {
      await choose();
      await click("Guardar nueva versión");
      await click("Recuperar guardado");
      assert.equal(calls.uploads.length, 1);
      assert.equal(calls.publishes.length, 2);
      assert.deepEqual(calls.publishes[0], calls.publishes[1]);
      assert.equal(calls.changes.length, 1);
    }, { publish: async (f, request, calls) => {
      if (calls.publishes.length === 1) throw { response: { status: 503 } };
      return { ...f.state, operationId: request.operationId, resultVersionId: ids.upload, replayed: true };
    } });
  });

  test("detach requires confirmation and history can restore the original as a new version", async () => {
    await withModal(async ({ document, f, calls, click }) => {
      await click("Desvincular");
      assert.equal(f.state.currentVersionId, ids.second);
      await click("Confirmar");
      assert.equal(f.state.currentVersionId, null);
      assert.match(document.querySelector(".voucher-media-manager__empty").textContent, /sin archivo vigente/);
      await click("Ver historial");
      await click("Restaurar versión 1");
      await click("Confirmar");
      assert.equal(f.state.versions.length, 3);
      assert.equal(f.state.versions[0].origin, "restore");
      assert.equal(calls.changes.length, 2);
    });
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
