import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { useSourceVoucherPdf } from "../../hooks/useSourceVoucherPdf";

const pdf = "%PDF-1.4\nSynthetic voucher for preview validation\n%%EOF\n";

async function withPreview(run) {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  const names = ["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  const requests: any[] = [], created: any[] = [], revoked: string[] = [];
  Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })) });
  URL.createObjectURL = (blob: any) => { created.push(blob); return `blob:preview-${created.length}`; };
  URL.revokeObjectURL = url => { revoked.push(url); };
  const root = createRoot(document.getElementById("root"));
  function Preview({ source = "/api/upload/tigris/proxy?url=A.pdf", enabled = true }) {
    const state = useSourceVoucherPdf(enabled, source);
    return <><output id="pdf-url">{state.url}</output><output id="pdf-error">{state.error}</output><button onClick={state.retry}>Reintentar</button></>;
  }
  const render = async (props = {}) => React.act(async () => root.render(<Preview {...props} />));
  const settle = async (index, response) => React.act(async () => {
    requests[index].resolve(response);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  const value = selector => document.querySelector(selector)?.textContent;
  try {
    await render();
    await run({ document, requests, created, revoked, render, settle, value });
  } finally {
    await React.act(async () => root.unmount());
    URL.createObjectURL = create; URL.revokeObjectURL = revoke;
    for (const [name, value] of Object.entries(previous)) value === undefined ? delete globalThis[name] : globalThis[name] = value;
  }
}

test("PDF responses denying API framing are fetched into a local PDF blob and revoked on close", async () => {
  await withPreview(async ({ requests, created, revoked, settle, render, value }) => {
    assert.equal(requests[0].options.credentials, "omit");
    assert.equal(value("#pdf-url"), "");
    await settle(0, new Response(pdf, { headers: { "X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'" } }));
    assert.equal(value("#pdf-url"), "blob:preview-1");
    assert.equal(created[0].type, "application/pdf");
    await render({ enabled: false });
    assert.equal(value("#pdf-url"), "");
    assert.equal(requests[0].options.signal.aborted, true);
    assert.deepEqual(revoked, ["blob:preview-1"]);
  });
});

test("a late response from another file cannot display its voucher or allocate a leaked blob", async () => {
  await withPreview(async ({ requests, created, settle, render, value }) => {
    await render({ source: "/api/upload/tigris/proxy?url=B.pdf" });
    assert.equal(requests[0].options.signal.aborted, true);
    await settle(0, new Response(pdf));
    assert.equal(value("#pdf-url"), ""); assert.equal(created.length, 0);
    await settle(1, new Response(pdf));
    assert.equal(value("#pdf-url"), "blob:preview-1"); assert.equal(created.length, 1);
  });
});

test("PDF preview failures offer a retry that loads the document without another upload", async () => {
  await withPreview(async ({ document, requests, settle, value }) => {
    await settle(0, new Response("Unavailable", { status: 503 }));
    assert.match(value("#pdf-error"), /No se pudo cargar/);
    await React.act(async () => document.querySelector("button").click());
    assert.equal(requests.length, 2); assert.equal(value("#pdf-error"), "");
    await settle(1, new Response(pdf));
    assert.equal(value("#pdf-url"), "blob:preview-1");
  });
});

test("an image placeholder or error document is never presented as the source PDF", async () => {
  await withPreview(async ({ created, settle, value }) => {
    await settle(0, new Response("not a PDF", { headers: { "content-type": "image/png" } }));
    assert.match(value("#pdf-error"), /no devolvió un PDF válido/);
    assert.equal(value("#pdf-url"), ""); assert.equal(created.length, 0);
  });
});
