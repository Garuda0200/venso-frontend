import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDocxBytesFromPageCaptures,
  dataUrlToBytes,
} from "../../../../../utils/pageImageDocumentExport";
import {
  calculatePreLiquidacionTotal,
  defaultPreLiquidacion,
  normalizePreLiquidacion,
} from "../preliquidacion";

const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9Z0AAAAASUVORK5CYII=";

const decoded = dataUrlToBytes(PNG_1X1);
assert.equal(decoded[0], 0x89);
assert.equal(decoded[1], 0x50);
assert.equal(decoded[2], 0x4e);
assert.equal(decoded[3], 0x47);

const docx = buildDocxBytesFromPageCaptures(
  [
    { dataUrl: PNG_1X1, format: "png", layout: { pdfWidth: 595.28, pdfHeight: 841.89 } },
    { dataUrl: PNG_1X1, format: "png", layout: { pdfWidth: 842, pdfHeight: 595 } },
  ],
  { title: "Preliquidación Venso" },
);
assert.equal(docx[0], 0x50);
assert.equal(docx[1], 0x4b);
const zipText = new TextDecoder().decode(docx);
assert.match(zipText, /\[Content_Types\]\.xml/);
assert.match(zipText, /word\/document\.xml/);
assert.match(zipText, /word\/media\/image1\.png/);
assert.match(zipText, /word\/media\/image2\.png/);
assert.match(zipText, /docProps\/core\.xml/);
assert.match(zipText, /Preliquidaci.n Venso/);
assert.match(zipText, /w:orient="landscape"/);

const defaults = defaultPreLiquidacion();
assert.equal(defaults.version, 2);
assert.equal(defaults.paymentTerms.depositNote, "Enviar voucher de depósito escaneado");
assert.match(defaults.paymentTerms.visaRequirements, /Número tarjeta de crédito/);
assert.match(defaults.paymentTerms.cardBrandsRequirements, /Datos del titular/);
assert.match(defaults.paymentTerms.cardBrandsInformation, /crédito o débito/);

const normalized = normalizePreLiquidacion({
  codigo: "0626-0006",
  passengers_snapshot: [
    {
      passengerId: "pax-7",
      nombres: "Tamara",
      apellidos: "Test",
      tipo_documento: "PA",
      numero_documento: "K123",
      nacionalidad: "SINGAPUR",
      fecha_nacimiento: "1981-12-01",
    },
  ],
  payment_terms: {
    deposit_note: "Voucher por correo",
    visa_requirements: "Tarjeta y pasaporte",
    visa_procedure: "Cobro online",
    visa_restriction: "Solo USD",
    card_brands_requirements: "Datos titular",
    card_brands_procedure: "Link de pago",
    card_brands_information: "Crédito o débito",
    card_brands_restriction: "No soles",
  },
  line_items: [
    { descripcion: "DOBLE", cantidad: 2, costo: 1035 },
    { descripcion: "SIMPLE", cantidad: 4, costo: 1278 },
    { descripcion: "NACIONAL", cantidad: 1, costo: 1308 },
  ],
});
assert.equal(normalized.paymentTerms.depositNote, "Voucher por correo");
assert.equal(normalized.paymentTerms.cardBrandsProcedure, "Link de pago");
assert.equal(calculatePreLiquidacionTotal(normalized), 8490);
assert.deepEqual(normalized.passengersSnapshot[0], {
  id: "pax-7",
  name: "Tamara Test",
  documentType: "PA",
  document: "K123",
  nationality: "SINGAPUR",
  birthDate: "1981-12-01",
});

const source = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

const documentSource = source("src/pages/Ventas/Cotizaciones/components/PreLiquidacionDocument.tsx");
const modalSource = source("src/pages/Ventas/Cotizaciones/components/PreLiquidacionModal.tsx");
const pdfCotizacionSource = source("src/components/Ventas/Cotizaciones/EdicionCotizacion/PdfCotizacion/PdfCotizacion.tsx");
const pdfPreviewSource = source("src/components/Ventas/Cotizaciones/PdfPreviewModal/PdfPreviewModal.tsx");
const preliqScss = source("src/pages/Ventas/Cotizaciones/components/styles/PreLiquidacionModal.scss");

assert.equal((documentSource.match(/data-preliquidacion-page=/g) || []).length, 3);
assert.match(documentSource, /pages\.slice\(1\)/);
assert.match(documentSource, /Nº PAX/);
assert.match(documentSource, /DNI \/ PASSPORT/);
assert.match(documentSource, /TIPO HABITACIÓN/);
assert.match(documentSource, /TOTAL, A PAGAR/);
assert.match(documentSource, /bcp-logo\.png/);
assert.match(documentSource, /TARJETAS VISA, MASTER CARD O AMERICAN EXPRESS/);
assert.match(modalSource, /exportPreLiquidacionPdf/);
assert.match(modalSource, /exportPreLiquidacionWord/);
assert.match(modalSource, /preparePreLiquidacionExports/);
assert.match(modalSource, /Sincronizar pax/);
assert.match(modalSource, /updatePassenger/);
assert.match(modalSource, /Descargar PDF/);
assert.match(modalSource, /Descargar Word/);
assert.match(preliqScss, /width: 794px/);
assert.match(preliqScss, /height: 1123px/);
assert.match(pdfCotizacionSource, /exportCotizacionToWord/);
assert.match(pdfCotizacionSource, /__vensoPageCaptures/);
assert.match(pdfCotizacionSource, /buildDocxFromPageCaptures/);
assert.match(pdfPreviewSource, /handleDownloadWord/);
assert.match(pdfPreviewSource, /className="download-button word"/);

console.log("preliquidacionDocumentExport.test.ts: PASS");
