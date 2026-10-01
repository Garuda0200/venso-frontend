import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LanguageFlag from "../../../../../components/common/LanguageFlag/LanguageFlag";

const source = (path: string) => readFileSync(resolve(process.cwd(), "src", path), "utf8");
const voucher = source("pages/Ventas/VouchersVenta/components/VentasSummaryPDFModal/VentasSummaryPDFModal.tsx");
const editor = source("components/Ventas/Cotizaciones/EdicionCotizacion/PdfEditor/PdfEditorView.tsx");

test("resumen de venta no carga ni imprime movimientos, pagos, montos o saldos", () => {
  assert.doesNotMatch(voucher, /contabilidadService|paymentSummary|summarizeVoucherFinancials|filterVoucherPaymentMovements/);
  assert.doesNotMatch(voucher, /renderInfoPagoContent|voucher-amount-row|voucher-payment-system|type: "payment"/);
  assert.match(voucher, /type: "observaciones"/);
  assert.match(voucher, /renderObservacionesContent/);
  assert.match(voucher, /getQuoteTravelDates/);
  assert.match(voucher, /language_versions/);
  assert.match(voucher, /renderItinerarySection/);
});

test("ambos editores utilizan banderas accesibles en lugar de códigos o emojis visibles", () => {
  assert.match(voucher, /<LanguageFlag code=\{language.code\}/);
  assert.match(editor, /<LanguageFlag code=\{lang.code\}/);
  assert.match(voucher, /aria-label=\{language.name\}/);
  assert.match(editor, /aria-label=\{lang.label\}/);
  assert.match(voucher, /aria-pressed=\{currentIdioma === language.code\}/);
  assert.match(editor, /aria-pressed=\{idioma === lang.code\}/);
  assert.doesNotMatch(voucher, /\{language.flag\}|\{language.label\}/);
  assert.doesNotMatch(editor, /\{lang.flag\}|\{lang.label\}\s*<\/button>/);
});

test("las tres banderas se renderizan como SVG diferentes sin depender de fuentes emoji", () => {
  const flags = ["es", "en", "pt"].map((code) => renderToStaticMarkup(React.createElement(LanguageFlag, { code })));
  assert.equal(new Set(flags).size, 3);
  flags.forEach((flag) => { assert.match(flag, /<svg/); assert.match(flag, /aria-hidden="true"/); assert.doesNotMatch(flag, /🇪🇸|🇺🇸|🇧🇷/); });
});

test("pantalla, impresión y Excel comparten las subdivisiones y no exportan nombres genéricos", () => {
  const report = source("components/Contabilidad/AgencyPaymentReportModal.tsx");
  assert.match(report, /<TicketPaymentBreakdown row=\{row\}/);
  assert.match(report, /groupPaymentServiceSections\(dayGroup.rows\)/);
  assert.match(report, /service: \[row.serviceName, ticketPaymentDetailText\(row\)\]/);
  assert.match(report, /reportServiceHtml\(row, !section.isTicket\)/);
  const accounting = source("pages/Contabilidad/Reportes/GestionPagosServicios.tsx");
  assert.match(accounting, /<TicketPaymentBreakdown row=\{row\}/);
  assert.match(accounting, /groupPaymentServiceSections\(selectedProvider.rows\)/);
  assert.match(accounting, /serviceDetailHtml\(row, !section.isTicket\)/);
  assert.match(accounting, /service: \[row.serviceName, ticketPaymentDetailText\(row\)\]/);
});
