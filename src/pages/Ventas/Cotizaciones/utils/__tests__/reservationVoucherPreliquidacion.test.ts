import assert from "node:assert/strict";
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
  defaultPreLiquidacion,
  getRegisteredPreLiquidacionPaymentIds,
  isPreLiquidacionPaymentRegistered,
  normalizePreLiquidacion,
} from "../preliquidacion";

const pdf = normalizeSourceVoucher({
  tigris_url: "reservation-source-vouchers/agencia-001.pdf",
  original_name: "voucher agencia.pdf",
  content_type: "application/pdf",
});
assert.ok(pdf);
assert.equal(pdf?.url, "reservation-source-vouchers/agencia-001.pdf");
assert.equal(normalizeSourceVoucher({ media_asset_id: "asset-1", url: "voucher.pdf" })?.mediaAssetId, "asset-1");
assert.equal(getSourceVoucherKind(pdf), "pdf");
assert.equal(isValidSourceVoucher(pdf), true);
assert.equal(getSourceVoucherKind({ url: "reservation-source-vouchers/foto.jpeg" }), "image");
assert.equal(getSourceVoucherKind({ url: "reservation-source-vouchers/datos.xlsx" }), "document");
assert.equal(validateSourceVoucherFile({ name: "voucher.pdf", size: 1024 } as File), "");
assert.match(
  validateSourceVoucherFile({ name: "voucher.pdf", size: SOURCE_VOUCHER_MAX_BYTES + 1 } as File),
  /25 MB/,
);
assert.match(validateSourceVoucherFile({ name: "voucher.pdf", size: 0 } as File), /vacío/);

const uploaded = buildSourceVoucherMedia(
  {
    tigrisUrl: "reservation-source-vouchers/uploaded.png",
    metadata: {
      originalName: "captura.png",
      contentType: "image/png",
      sizeBytes: 4567,
      uploadedAt: "2026-08-22T12:00:00Z",
    },
  },
  "SARELA",
);
assert.equal(uploaded?.origin, "reservas");
assert.equal(uploaded?.uploadedBy, "SARELA");
assert.equal(uploaded?.sizeBytes, 4567);

const defaults = defaultPreLiquidacion();
assert.equal(defaults.paymentTerms.bankName, "BCP");
assert.equal(defaults.paymentTerms.accountHolder, "VENSO TOURS EIRL");
assert.equal(defaults.paymentTerms.usdAccount, "285-1534246-1-30");
assert.equal(defaults.paymentTerms.cci, "002-28500153424613056");
assert.equal(defaults.paymentTerms.cardSurchargePercent, 5.5);
assert.match(defaults.notes, /NO SE ACEPTAN DOCUMENTOS CADUCADOS/);
assert.match(defaults.notes, /NÚMERO DE CONTACTO/);

const preliquidacion = normalizePreLiquidacion({
  codigo: "0826-0012",
  programa: "ENCANTOS DE CUSCO 5D4N",
  agencia: "VENSO TOURS",
  counter: "Sarela Quispe Huamán",
  line_items: [
    { descripcion: "ADULTO HAB DOBLE", cantidad: 2, costo: 1035 },
    { descripcion: "ADULTO HAB SIMPLE", cantidad: 4, costo: 1278 },
  ],
  payment_schedule: [
    { id: "pago-1", fecha: "2026-09-01", monto: 3000, moneda: "usd", metodo: "Depósito bancario" },
    { id: "pago-2", fecha: "2026-09-15", monto: 4182, moneda: "PEN", metodo: "Tarjeta" },
  ],
});
assert.equal(preliquidacion.code, "0826-0012");
assert.equal(preliquidacion.program, "ENCANTOS DE CUSCO 5D4N");
assert.equal(preliquidacion.counter, "Sarela Quispe Huamán");
assert.equal(preliquidacion.paymentSchedule[0].currency, "USD");
assert.equal(preliquidacion.paymentSchedule[1].currency, "PEN");
assert.equal(calculatePreLiquidacionTotal(preliquidacion), 7182);

const movements = [
  {
    id: 90,
    datos_extra: {
      preliquidacion_payment_id: "pago-1",
    },
  },
  {
    id: 91,
    originalData: {
      datos_extra: {
        preliquidacion_payment_id: "pago-3",
      },
    },
  },
];
const registered = getRegisteredPreLiquidacionPaymentIds(movements);
assert.deepEqual([...registered].sort(), ["pago-1", "pago-3"]);
assert.equal(isPreLiquidacionPaymentRegistered("pago-1", movements), true);
assert.equal(isPreLiquidacionPaymentRegistered("pago-2", movements), false);

console.log("reservationVoucherPreliquidacion.test.ts: PASS");
