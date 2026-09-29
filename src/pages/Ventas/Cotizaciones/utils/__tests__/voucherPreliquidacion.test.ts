import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SOURCE_VOUCHER_MAX_BYTES,
  buildSourceVoucherMedia,
  getSourceVoucherKind,
  isValidSourceVoucher,
  normalizeSourceVoucher,
  resolveVoucherMediaForFile,
  validateSourceVoucherFile,
} from "../sourceVoucher";
import {
  calculatePreLiquidacionTotal,
  calculateScheduledPaymentsByCurrency,
  defaultPreLiquidacion,
  getRegisteredPreLiquidacionPaymentIds,
  isPreLiquidacionPaymentRegistered,
  normalizePreLiquidacion,
} from "../preliquidacion";

const source = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

const pdf = normalizeSourceVoucher({
  tigris_url: "https://fly.storage.tigris.dev/venso/reservation-source-vouchers/agencia.pdf",
  original_name: "agencia.pdf",
  content_type: "application/pdf",
});
assert.ok(pdf);
assert.equal(pdf?.url.includes("agencia.pdf"), true);
assert.equal(pdf?.tigrisUrl, pdf?.url);
assert.equal(getSourceVoucherKind(pdf), "pdf");
assert.equal(isValidSourceVoucher(pdf), true);
assert.equal(
  getSourceVoucherKind({ url: "https://example.test/voucher.JPG" }),
  "image",
);
assert.equal(
  getSourceVoucherKind({ url: "https://example.test/contrato.docx" }),
  "document",
);
assert.equal(isValidSourceVoucher({}), false);

const resolvedCanonicalMedia = resolveVoucherMediaForFile(
  { url: "voucher-media/canonical.pdf" },
  { url: "voucher-media/legacy.pdf" },
);
assert.equal(resolvedCanonicalMedia.canonicalLinked, true);
assert.equal(resolvedCanonicalMedia.media?.url, "voucher-media/canonical.pdf");
const resolvedLegacyMedia = resolveVoucherMediaForFile(null, { url: "voucher-media/legacy.pdf" });
assert.equal(resolvedLegacyMedia.canonicalLinked, false);
assert.equal(resolvedLegacyMedia.media?.url, "voucher-media/legacy.pdf");

assert.equal(
  validateSourceVoucherFile({ name: "voucher.pdf", size: 1024 } as File),
  "",
);
assert.match(
  validateSourceVoucherFile({
    name: "demasiado-grande.pdf",
    size: SOURCE_VOUCHER_MAX_BYTES + 1,
  } as File),
  /25 MB/,
);

const built = buildSourceVoucherMedia(
  {
    tigrisUrl: "https://fly.storage.tigris.dev/venso/reservation-source-vouchers/voucher.png",
    metadata: {
      originalName: "voucher.png",
      contentType: "image/png",
      sizeBytes: 4000,
      uploadedAt: "2026-08-22T10:00:00Z",
    },
  },
  "70001111",
);
assert.equal(built?.origin, "reservas");
assert.equal(built?.uploadedBy, "70001111");
assert.equal(getSourceVoucherKind(built), "image");

const defaults = defaultPreLiquidacion({ counter: "Sarela Quispe Huamán" });
assert.equal(defaults.paymentTerms.bankName, "BCP");
assert.equal(defaults.paymentTerms.accountHolder, "VENSO TOURS EIRL");
assert.equal(defaults.paymentTerms.usdAccount, "285-1534246-1-30");
assert.equal(defaults.paymentTerms.cci, "002-28500153424613056");
assert.equal(defaults.paymentTerms.cardSurchargePercent, 5.5);
assert.match(defaults.notes, /NO SE ACEPTAN DOCUMENTOS CADUCADOS/);
assert.match(defaults.notes, /NÚMERO DE CONTACTO/);

const preliquidacion = normalizePreLiquidacion({
  codigo: "0626-0006",
  fecha: "2026-06-24",
  programa: "ENCANTOS DE CUSCO 5D4N",
  agencia: "VENSO TOURS",
  counter: "SARELA",
  traslados: "IN - OUT",
  tipo_habitacion: "01 HABITACIÓN DOBLE TWIN",
  alimentacion: "DESAYUNO POR NOCHE DE PERNOCTE",
  no_incluye: "EXTRAS",
  moneda: "USD",
  line_items: [
    { descripcion: "ADULTO EXTRANJERO - HAB DOBLE", cantidad: 2, costo: 1035 },
    { descripcion: "ADULTO EXTRANJERO - HAB SIMPLE", cantidad: 4, costo: 1278 },
    { descripcion: "ADULTO NACIONAL - HAB SIMPLE", cantidad: 1, costo: 1308 },
  ],
  payment_schedule: [
    { id: "p1", fecha: "2026-06-29", monto: 4000, moneda: "USD", metodo: "Depósito bancario" },
    { id: "p2", fecha: "2026-07-10", monto: 4490, moneda: "USD", metodo: "Tarjeta" },
    { id: "p3", fecha: "2026-07-11", monto: 120, moneda: "PEN", metodo: "Depósito bancario" },
  ],
});
assert.equal(preliquidacion.code, "0626-0006");
assert.equal(preliquidacion.program, "ENCANTOS DE CUSCO 5D4N");
assert.equal(preliquidacion.roomType, "01 HABITACIÓN DOBLE TWIN");
assert.equal(calculatePreLiquidacionTotal(preliquidacion), 8490);
assert.deepEqual(calculateScheduledPaymentsByCurrency(preliquidacion), {
  USD: 8490,
  PEN: 120,
});

const malformed = normalizePreLiquidacion({ lineItems: {}, paymentSchedule: "bad" });
assert.deepEqual(malformed.lineItems, []);
assert.deepEqual(malformed.paymentSchedule, []);

const registered = getRegisteredPreLiquidacionPaymentIds([
  { datos_extra: { preliquidacion_payment_id: "p1" } },
  { originalData: { datosExtra: { preliquidacion_payment_id: "p2" } } },
]);
assert.equal(registered.has("p1"), true);
assert.equal(registered.has("p2"), true);
assert.equal(isPreLiquidacionPaymentRegistered("p2", [{ originalData: { datosExtra: { preliquidacion_payment_id: "p2" } } }]), true);
assert.equal(isPreLiquidacionPaymentRegistered("p3", []), false);

const quotesPage = source("src/pages/Ventas/Cotizaciones/Cotizaciones.tsx");
const quoteEditor = source("src/components/Ventas/Cotizaciones/EdicionCotizacion/EdicionCotizacion.tsx");
const quoteHook = source("src/pages/Ventas/Cotizaciones/hooks/useCotizaciones.ts");
const paymentStep = source("src/pages/Ventas/VouchersVenta/components/Steps/PaymentStep/PaymentStep.tsx");
const reservasRoutes = source("src/router/ReservasRoutes.tsx");
const previewModal = source("src/pages/Ventas/Cotizaciones/components/SourceVoucherPreviewModal.tsx");
const voucherMediaManager = source("src/pages/Ventas/Cotizaciones/components/VoucherMediaManagerModal.tsx");
const quoteRow = source("src/pages/Ventas/Cotizaciones/components/CotizacionTableRow.tsx");
const salesVoucherPage = source("src/pages/Ventas/VouchersVenta/VouchersVenta.tsx");
const reservationVoucherPage = source("src/pages/Reservas/VouchersReserva/VouchersReserva.tsx");
const quotationService = source("src/pages/Ventas/Cotizaciones/hooks/cotizacionService.ts");

assert.doesNotMatch(quotesPage, /SourceVoucherUploadModal/);
assert.match(quotesPage, /isReservasQuotationFlow/);
assert.match(quotesPage, /Reservas puede iniciar la cotización sin archivo de origen/);
assert.match(quoteEditor, /Archivo del voucher/);
assert.match(quoteEditor, /PreLiquidacionModal/);
assert.match(quoteEditor, /source_voucher: effectiveSourceVoucher/);
assert.match(quoteEditor, /preliquidacion,/);
assert.match(quoteHook, /source_voucher/);
assert.match(quoteHook, /preliquidacion/);
assert.match(paymentStep, /preliquidacion_payment_id/);
assert.match(paymentStep, /Programado no significa cobrado/);
assert.match(reservasRoutes, /path="\/cotizaciones"/);
assert.match(previewModal, /kind === "pdf"/);
assert.match(previewModal, /kind === "image"/);

assert.equal(
  normalizeSourceVoucher({ mediaAssetId: "asset-001", url: "voucher-media/file.pdf" })?.mediaAssetId,
  "asset-001",
);
assert.match(quoteRow, /Archivo del voucher/);
assert.match(salesVoucherPage, /VoucherMediaManagerModal/);
assert.match(reservationVoucherPage, /VoucherMediaManagerModal/);
assert.match(reservationVoucherPage, /legacyMedia=/);
assert.match(voucherMediaManager, /Adjunto opcional y único por file/);
assert.match(voucherMediaManager, /Usar en todo el file/);
assert.match(voucherMediaManager, /legacyMedia/);
assert.match(voucherMediaManager, /getCotizacionById/);
assert.match(quotationService, /\/voucher-media/);
assert.match(previewModal, /Archivo del voucher/);

console.log("voucherPreliquidacion.test.ts: PASS");
