import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ExcelJS from "exceljs";

test("payment report shows the endose tour and carries agency visibility into real XLSX and printable PDF HTML", async () => {
  const bundled = await build({
    entryPoints: ["src/components/Contabilidad/AgencyPaymentReportModal.tsx"], bundle: true, write: false,
    format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/jsx-runtime", "react-dom", "exceljs"],
    plugins: [{ name: "report-flow-boundaries", setup(builder) {
      builder.onResolve({ filter: /\.scss$|cotizacionService$|agencyService$|axiosInstance$|file-saver$|UI\/Modal\/Modal$/ }, args => ({ path: args.path.split("/").at(-1), namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "jsx", contents:
        args.path === "cotizacionService" ? 'export const getCotizacionById=async()=>globalThis.__paymentQuote;' :
        args.path === "agencyService" ? 'export const getAgencyById=async()=>globalThis.__paymentAgency;' :
        args.path === "axiosInstance" ? 'export default {get:async()=>({data:{data:[]}})};' :
        args.path === "file-saver" ? 'export const saveAs=(blob,name)=>globalThis.__paymentFiles.push({blob,name});' :
        args.path === "Modal" ? 'import React from "react";export default ({children,actions})=><div>{children}{actions.map(action=><button key={action.label} onClick={action.onClick} disabled={action.disabled}>{action.label}</button>)}</div>;' : 'export default {};'
      }));
    } }],
  });
  const module = { exports: {} as any };
  new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(resolve("package.json")), module, module.exports);
  const Report = module.exports.default;
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  const values: any = { window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
    Image: class { onerror: any; set src(_value) { queueMicrotask(() => this.onerror?.()); } },
    __paymentFiles: [], __paymentQuote: { id: "REPORT-QA", voucher_code: "FILE-QA", titulo: "Viaje de prueba", cantidadpersonas: 2,
      agency_id: 81, fechainicio: "2026-09-01", itinerario: [{ numero: 1, titulo: "Excursión", servicios: [{
        id: 19, typeService: "endoses", parentId: 55, parentService: { nombre: "PROVEEDOR ENDOSANTE OCULTO" },
        childService: { tipo_guiado: "Tour Valle Sagrado" }, precioServicio: 25, precioTotal: 50, tipoPrecio: "privado",
      }] }] }, __paymentAgency: { id: 81, name: "AGENCIA EXCLUSIVA QA", is_primary: false },
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, globalThis[key]]));
  Object.assign(globalThis, values);
  window.getComputedStyle = () => ({ getPropertyValue: () => "#ff007e" });
  let printHtml = "";
  window.open = () => ({ document: { write: (html) => { printHtml = html; }, close() {} } });
  const root = createRoot(document.getElementById("root"));
  const props = element => element[Object.keys(element).find(key => key.startsWith("__reactProps"))];
  const action = async label => React.act(async () => {
    const button = [...document.querySelectorAll("button")].find(button => button.textContent === label);
    assert.ok(button, label); assert.equal(button.disabled, false); await props(button).onClick();
  });
  try {
    for (const primary of [false, true]) {
      globalThis.__paymentAgency = { ...values.__paymentAgency, is_primary: primary };
      await React.act(async () => root.render(<Report key={String(primary)} isOpen onClose={() => {}} cotizacionId="REPORT-QA" />));
      assert.match(document.body.textContent, /Tour Valle Sagrado/);
      assert.doesNotMatch(document.body.textContent, /PROVEEDOR ENDOSANTE OCULTO/);
      for (const visible of [true, false, true]) {
        await React.act(async () => props(document.querySelector('[role="switch"]')).onChange({ target: { checked: visible } }));
        if (!primary) assert.equal(document.body.textContent.includes("AGENCIA EXCLUSIVA QA"), visible);
        await action("Imprimir / PDF");
        assert.match(printHtml, /Tour Valle Sagrado/);
        assert.doesNotMatch(printHtml, /PROVEEDOR ENDOSANTE OCULTO/);
        assert.equal(printHtml.includes("AGENCIA EXCLUSIVA QA"), visible && !primary);
        await action("Exportar Excel");
        const workbook = new ExcelJS.Workbook();
        const saved = globalThis.__paymentFiles.at(-1);
        assert.match(saved.name, /\.xlsx$/);
        await workbook.xlsx.load(Buffer.from(await saved.blob.arrayBuffer()));
        const text = JSON.stringify(workbook.worksheets.map(sheet => sheet.getSheetValues()));
        assert.match(text, /Tour Valle Sagrado/);
        assert.doesNotMatch(text, /PROVEEDOR ENDOSANTE OCULTO/);
        assert.equal(text.includes("AGENCIA EXCLUSIVA QA"), visible && !primary);
        if (!primary && !visible) assert.equal(workbook.getWorksheet("Ingresos&Gastos").getColumn(4).hidden, true);
      }
    }
  } finally {
    await React.act(async () => root.unmount());
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete globalThis[key] : globalThis[key] = value;
  }
});
