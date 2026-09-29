import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getServiceObservations } from "../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/utils/serviceObservations";
import { matchesCotizacionSearch } from "../pages/Ventas/Cotizaciones/utils/cotizacionSearch";
import { canSearchCotizacionById } from "../utils/permissions";
import {
  extractDayTitleOptions,
  mergeDayTitleOptions,
  normalizeDayTitleOptions,
} from "../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/utils/dayTitleOptions";
import { filterSmartComboBoxOptions } from "../components/common/SmartComboBox/smartComboBoxSearch";
import {
  canRemoveMovementEvidence,
  getPendingMovementEvidences,
} from "../components/Contabilidad/utils/movementMediaPermissions";
import {
  countCanonicalReservationPassengers,
  getCanonicalReservationPassengerType,
} from "../pages/Reservas/VouchersReserva/utils/passengerClassification";
import { resolveNoHotelPreviewChildBreakdown } from "../components/Ventas/Cotizaciones/EdicionCotizacion/utils/noHotelPreviewPricing";
import {
  normalizeChildRoomLabel,
  resolveHotelRoomChildBeneficiaryCount,
} from "../components/Ventas/Cotizaciones/EdicionCotizacion/utils/childHotelAccommodation";
import {
  getAuthoritativePassengerCounts,
  pruneEmptyMutableTicketCohorts,
  reconcilePricingSnapshotToPassengerRoster,
} from "../components/Ventas/Cotizaciones/EdicionCotizacion/utils/passengerPricingReconciliation";
import {
  buildChildPricingRows,
  getChildSlotKey,
} from "../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/SortableService/childrenPanelRows";

const source = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

test("observaciones de endose leen el tour hijo y no otras categorías", () => {
  assert.equal(
    getServiceObservations({
      typeService: "endoses",
      childService: { id_tipotour: 21, observaciones: "Llevar pasaporte." },
    }),
    "Llevar pasaporte.",
  );
  assert.equal(
    getServiceObservations({
      typeService: "transportes",
      observaciones: "No debe mostrarse",
    }),
    "",
  );
});

test("capacidad UI de búsqueda por ID conserva sus permisos", () => {
  assert.equal(canSearchCotizacionById({ role: 0, platform: "all" }), true);
  assert.equal(canSearchCotizacionById({ role: 3, platform: "venso" }), false);
  assert.equal(canSearchCotizacionById({ role: 2, platform: "venso" }), false);
});

test("búsqueda de cotizaciones usa título o ID relacional", () => {
  const quote = {
    id: "COT260818-731",
    titulo: "Cusco y Valle Sagrado",
  };
  assert.equal(matchesCotizacionSearch(quote, "valle"), true);
  assert.equal(matchesCotizacionSearch(quote, "0818-731"), true);
});

test("títulos de día deduplican tildes/caso y combinan catálogo con itinerario", () => {
  assert.deepEqual(
    normalizeDayTitleOptions([
      " Valle   Sagrado ",
      "valle sagrado",
      "Montaña de 7 Colores",
      "montana de 7 colores",
    ]),
    ["Montaña de 7 Colores", "Valle Sagrado"],
  );
  const current = extractDayTitleOptions([
    { titulo: "City Tour Cusco" },
    { titulo: "Valle Sagrado" },
  ]);
  assert.deepEqual(
    mergeDayTitleOptions(current, ["CITY TOUR CUSCO", "Maras y Moray"]),
    ["City Tour Cusco", "Maras y Moray", "Valle Sagrado"],
  );
});

test("SmartComboBox busca sin tildes y por palabras no contiguas", () => {
  const options = [
    "City Tour Cusco",
    "Valle Sagrado de los Incas",
    "Montaña de 7 Colores",
  ];
  assert.deepEqual(filterSmartComboBoxOptions(options, "montana"), [
    "Montaña de 7 Colores",
  ]);
  assert.deepEqual(filterSmartComboBoxOptions(options, "tour cusco"), [
    "City Tour Cusco",
  ]);
});

test("evidencias persistidas solo se eliminan con role 0 y solo se suben pendientes", () => {
  const persisted = { existingId: 9, filename: "voucher.pdf" };
  const pending = { isPending: true, fileObject: {}, filename: "nuevo.jpg" };
  assert.equal(canRemoveMovementEvidence(persisted, 0), true);
  assert.equal(canRemoveMovementEvidence(persisted, 2), false);
  assert.equal(canRemoveMovementEvidence(pending, 2), true);
  assert.deepEqual(getPendingMovementEvidences([persisted, pending]), [pending]);
});

test("clasificación de Reservas prioriza tipo canónico sobre edad", () => {
  const rows = [
    { edad: 17, tipo_pasajero: "adult", passenger_key: "adult-3" },
    { edad: 21, tipo_pasajero: "child", passenger_key: "child-1" },
  ];
  assert.equal(getCanonicalReservationPassengerType(rows[0]), "adult");
  assert.equal(getCanonicalReservationPassengerType(rows[1]), "child");
  assert.deepEqual(countCanonicalReservationPassengers(rows), {
    adults: 1,
    children: 1,
    infants: 0,
    total: 2,
  });
});

test("preview sin hotel usa subtotal infantil vivo cuando no hay breakdown por IDs", () => {
  const result = resolveNoHotelPreviewChildBreakdown({
    childrenCount: 2,
    subtotalNinos: 381.34,
    hotelChildTotal: 0,
    nonHotelExplicitChildTotal: 0,
    nonHotelConvertedChildTotal: 0,
    baseExplicitChildCount: 0,
    baseConvertedChildCount: 0,
  });
  assert.equal(result.unifiedBaseTotal, 381.34);
  assert.equal(result.explicitTotal, 381.34);
  assert.equal(result.explicitCount, 2);
  assert.equal(result.usedAggregateFallback, true);
});

test("habitación infantil vacía significa Sin hotel y la ocupación usa identidades", () => {
  assert.equal(normalizeChildRoomLabel("Habitación"), "Sin hotel");
  assert.equal(normalizeChildRoomLabel("HABITACIÓN TRIPLE"), "TRIPLE");
  assert.equal(
    resolveHotelRoomChildBeneficiaryCount([
      {
        passengerIds: ["adult:0:10", "child:0:20"],
        childPassengerIds: ["child:0:20"],
        explicitChildBeneficiaries: 4,
      },
    ]),
    1,
  );
});

test("postventa reconcilia snapshots históricos sin recrear niños eliminados", () => {
  const roster = {
    adults: [
      { id: 1119, tipo_pasajero: "adult" },
      { id: 1120, tipo_pasajero: "adult" },
      { id: 1121, tipo_pasajero: "adult" },
      { id: 1122, tipo_pasajero: "adult" },
    ],
    children: [],
  };
  const pricing = {
    amountPerAdult: 460,
    amountPerChild: 442,
    children: {
      "child:0:1121": { amount: 221, asAdult: false },
      "child:1:1122": { amount: 221, asAdult: false },
    },
  };
  assert.deepEqual(getAuthoritativePassengerCounts(roster), {
    authoritative: true,
    adults: 4,
    children: 0,
  });
  const reconciled = reconcilePricingSnapshotToPassengerRoster(pricing, roster);
  assert.equal(reconciled.amountPerAdult, 460);
  assert.equal(reconciled.amountPerChild, 0);
  assert.equal(reconciled.droppedStaleChildTotal, 442);
  assert.deepEqual(reconciled.childEntries, []);
});

test("ticket mutable sin beneficiarios se poda pero un assigned histórico se conserva", () => {
  const mutableEmpty = {
    parentService: { typeService: "tickets" },
    ticketPassengerTargetGroup: "child",
    passengerSelection: { selectedIds: [] },
  };
  const assignedHistorical = {
    ...mutableEmpty,
    is_assigned: true,
    assigned_parent_id: 77,
    assigned_child_id: 88,
  };
  const adult = {
    parentService: { typeService: "tickets" },
    ticketPassengerTargetGroup: "adult",
    passengerSelection: { selectedIds: ["adult:0:1119"] },
  };
  assert.deepEqual(
    pruneEmptyMutableTicketCohorts([mutableEmpty, assignedHistorical, adult]),
    [assignedHistorical, adult],
  );
});

test("gestor infantil conserva el slot al convertir niño a tarifa adulta", () => {
  const rows = buildChildPricingRows(
    ["child:0:451", "child:2:453"],
    [{ childId: "child:1:452", revertKey: "child:1:452" }],
  );
  assert.deepEqual(
    rows.map((row) => row.childId),
    ["child:0:451", "child:1:452", "child:2:453"],
  );
  assert.equal(rows[1].isConverted, true);
  assert.equal(getChildSlotKey("child:4:987"), "child:4");
});

test("integración Venso conserva fixes críticos y excluye exportCotizacionJpg", () => {
  const assignmentModal = source(
    "src/pages/Reservas/VouchersReserva/components/ServiceAssignmentModal/ServiceAssignmentModal.tsx",
  );
  const ticketHelpers = source(
    "src/components/Ventas/Cotizaciones/EdicionCotizacion/utils/ticketBeneficiaries.ts",
  );
  const quoteEditor = source(
    "src/components/Ventas/Cotizaciones/EdicionCotizacion/EdicionCotizacion.tsx",
  );
  const pdfPreview = source(
    "src/components/Ventas/Cotizaciones/EdicionCotizacion/utils/pdfHotelPreviewData.ts",
  );
  const movementForm = source("src/components/Contabilidad/MovimientoForm.tsx");
  const movementModal = source(
    "src/pages/Ventas/VouchersVenta/components/FlightPaymentModal/FlightPaymentModal.tsx",
  );

  assert.match(assignmentModal, /getAssignedTariff, resolveServiceType/);
  assert.match(assignmentModal, /hasIncompatiblePersistedTicketAssignment/);
  assert.match(ticketHelpers, /agencyIds|agency_ids|agencyId|agency_id/);
  assert.match(quoteEditor, /resolveNoHotelPreviewChildBreakdown/);
  assert.match(quoteEditor, /superadmin-creation-panel--footer-popover/);
  assert.match(pdfPreview, /const hasExplicitChildCount =/);
  assert.match(pdfPreview, /from "\.\/cotizacionPreviewHtml"/);
  assert.doesNotMatch(pdfPreview, /exportCotizacionJpg/);
  assert.match(movementForm, /canRemoveMovementEvidence/);
  assert.match(movementModal, /resolveByPaymentRequest/);
});
