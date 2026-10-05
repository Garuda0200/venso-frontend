const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const tmpDir = path.join(root, ".tmp-feature-tests");

const testSuites = [
  {
    name: "shared infrastructure",
    tests: [
      "src/components/common/__tests__/backendStatusBanner.test.js",
      "src/tests/envExamples.test.js",
      "src/utils/__tests__/csrfToken.test.js",
      "src/utils/__tests__/idempotency.test.js",
      "src/utils/__tests__/packageFeeUtils.test.js",
      "src/utils/__tests__/pendingPayments.test.js",
      "src/utils/__tests__/quotationAgencyGroups.test.js",
      "src/components/common/Sidebar/__tests__/sidebarAccess.test.js",
      "src/pages/Admin/Users/components/__tests__/commissionUiVisibility.test.js",
    ],
  },
  {
    name: "ventas / cotizaciones",
    tests: [
      "src/pages/Ventas/Cotizaciones/utils/__tests__/preliquidacionQuotation.test.js",
      "src/pages/Ventas/Cotizaciones/utils/__tests__/cotizacionIgv.test.js",
      "src/pages/Ventas/Cotizaciones/utils/__tests__/cotizacionListState.test.js",
      "src/pages/Ventas/Cotizaciones/utils/__tests__/postSaleEditState.test.js",
      "src/pages/Ventas/Cotizaciones/utils/__tests__/preliquidacionDocumentExport.test.js",
      "src/pages/Ventas/Cotizaciones/utils/__tests__/reservationVoucherPreliquidacion.test.js",
      "src/pages/Ventas/Cotizaciones/utils/__tests__/voucherPreliquidacion.test.js",
      "src/components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/utils/__tests__/endosePricingPolicy.test.js",
      "src/components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/utils/__tests__/ticketChildPricing.test.js",
      "src/components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/SortableService/__tests__/ticketBeneficiarySummary.test.js",
      "src/components/Ventas/Cotizaciones/EdicionCotizacion/components/ServicePicker/utils/__tests__/tariffContext.test.js",
      "src/components/Ventas/Cotizaciones/EdicionCotizacion/components/ServicePicker/utils/__tests__/catalogueFilters.test.js",
      "src/components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/utils/__tests__/endoseCapacityFlow.test.js",
      "src/components/Ventas/Cotizaciones/EdicionCotizacion/utils/__tests__/editorRenderOptimization.test.js",
      "src/components/Ventas/Cotizaciones/EdicionCotizacion/utils/__tests__/externalChildPricing.test.js",
      "src/components/Ventas/Cotizaciones/EdicionCotizacion/utils/__tests__/groupedHotelPersistence.test.js",
      "src/components/Ventas/Cotizaciones/EdicionCotizacion/utils/__tests__/passengerPricingPresentation.test.js",
      "src/components/Ventas/Cotizaciones/EdicionCotizacion/utils/__tests__/pdfCanvaCopy.test.js",
      "src/components/Ventas/Cotizaciones/EdicionCotizacion/utils/__tests__/serviceExchangeRate.test.js",
      "src/components/Ventas/Cotizaciones/EdicionCotizacion/utils/__tests__/ticketTariffGrouping.test.js",
      "src/components/Ventas/Cotizaciones/EdicionCotizacion/utils/__tests__/vensoPdfCanvaDesign.test.js",
      "src/pages/Ventas/VouchersVenta/utils/__tests__/voucherFinancials.test.js",
      "src/pages/Ventas/VouchersVenta/utils/__tests__/salesPdfPresentation.test.js",
      "src/pages/Ventas/VouchersVenta/utils/__tests__/voucherPdfLayout.test.js",
    ],
  },
  {
    name: "reservas",
    tests: [
      "src/pages/Reservas/Servicios/utils/__tests__/cataloguePresentation.test.js",
      "src/pages/Reservas/Calendario/utils/__tests__/bibliaActivityMapper.test.js",
      "src/pages/Reservas/Calendario/utils/__tests__/bibliaEditableValueSource.test.js",
      "src/pages/Reservas/Calendario/utils/__tests__/bibliaFileLinkPlacementSource.test.js",
      "src/pages/Reservas/Calendario/utils/__tests__/bibliaPopoverPosition.test.js",
      "src/pages/Reservas/Calendario/utils/__tests__/bibliaQuotationCreation.test.js",
      "src/pages/Reservas/Calendario/utils/__tests__/bibliaSyncFeedback.test.js",
      "src/pages/Reservas/Calendario/utils/__tests__/bibliaQuotationLinking.test.js",
      "src/pages/Reservas/Calendario/utils/__tests__/bibliaRowDrafts.test.js",
      "src/pages/Reservas/Calendario/utils/__tests__/bibliaResponsiveSource.test.js",
      "src/pages/Reservas/Calendario/utils/__tests__/bibliaSingleDayViewSource.test.js",
      "src/pages/Reservas/VouchersReserva/components/ReservaServiceEditor/utils/__tests__/assignedBeneficiaries.test.js",
      "src/pages/Reservas/VouchersReserva/components/ReservaServiceEditor/utils/__tests__/validationState.test.js",
      "src/pages/Reservas/VouchersReserva/components/ServiceAssignmentModal/utils/__tests__/assignmentSaveQueue.test.js",
      "src/pages/Reservas/VouchersReserva/utils/__tests__/reservationVoucherRender.test.js",
      "src/pages/Reservas/VouchersReserva/utils/__tests__/specializedPaymentGroups.test.js",
      "src/pages/Reservas/VouchersReserva/utils/__tests__/reservationPaymentManagement.test.js",
    ],
  },
  {
    name: "contabilidad e integración",
    tests: [
      "src/services/__tests__/pendingPaymentService.test.js",
      "src/pages/Contabilidad/Files/domain/__tests__/movementFiles.test.js",
      "src/pages/Contabilidad/Liquidaciones/domain/__tests__/pendingPaymentGroups.test.js",
      "src/pages/Contabilidad/Reportes/utils/__tests__/paymentReportUtils.test.js",
      "src/pages/Contabilidad/Reportes/utils/__tests__/ticketPaymentPresentation.test.js",
      "src/tests/magicParityVenso.test.js",
    ],
  },
];

const run = (command, args, label) => {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label || command} terminó con código ${result.status}`);
  }
};

try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  run(
    process.execPath,
    [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.feature-tests.json"],
    "TypeScript feature build",
  );

  // Node 22 interpreta un CommonJS emitido que conserva `import.meta` como ESM.
  // Solo ajustamos el artefacto temporal de tests: el código fuente/Vite conserva
  // import.meta.env y su comportamiento de producción sin cambios.
  const constantsPath = path.join(tmpDir, "src", "utils", "constants.js");
  if (fs.existsSync(constantsPath)) {
    const envLiteral = process.env.VITE_EXCHANGE_RATE
      ? JSON.stringify(process.env.VITE_EXCHANGE_RATE)
      : "undefined";
    const source = fs.readFileSync(constantsPath, "utf8");
    fs.writeFileSync(
      constantsPath,
      source.replace(/import\.meta\.env\.VITE_EXCHANGE_RATE/g, envLiteral),
      "utf8",
    );
  }

  for (const suite of testSuites) {
    console.log(`\n## ${suite.name}`);
    for (const test of suite.tests) {
      console.log(`\n==> ${test}`);
      run(process.execPath, [path.join(tmpDir, test)], test);
    }
  }
  console.log("\nFeature suite: PASS");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
