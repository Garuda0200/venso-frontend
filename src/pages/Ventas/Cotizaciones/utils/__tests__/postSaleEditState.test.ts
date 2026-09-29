import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  POST_SALE_EDIT_STATUSES,
  buildPostSaleCommitPayload,
  canCreateNewRequest,
  canManagePostSaleEditRequests,
  canRequestPostSaleEdit,
  normalizeUserRole,
  getRequestUiState,
  getRemainingApprovalSeconds,
  indexLatestRequestsByCotizacion,
  isApprovedAndUsable,
  isApprovalExpired,
  isApprovalValidForSnapshot,
} from "../postSaleEditState.js";

const NOW = Date.parse("2026-08-09T22:00:00-05:00");
const approved = (overrides = {}) => ({
  id: "11111111-1111-1111-1111-111111111111",
  cotizacion_id: "COT-001",
  status: POST_SALE_EDIT_STATUSES.APPROVED,
  approval_nonce: "22222222-2222-2222-2222-222222222222",
  approved_version: 7,
  requested_at: "2026-08-09T21:55:00-05:00",
  expires_at: "2026-08-09T22:45:00-05:00",
  ...overrides,
});

test("approval is usable only with nonce, version and future expiry", () => {
  assert.equal(isApprovedAndUsable(approved(), NOW), true);
  assert.equal(isApprovedAndUsable(approved({ approval_nonce: null }), NOW), false);
  assert.equal(isApprovedAndUsable(approved({ approved_version: null }), NOW), false);
  assert.equal(isApprovedAndUsable(approved({ approved_version: "" }), NOW), false);
  assert.equal(isApprovedAndUsable(approved({ expires_at: "2026-08-09T21:59:59-05:00" }), NOW), false);
});

test("expired approval is detected deterministically", () => {
  assert.equal(isApprovalExpired(approved(), NOW), false);
  assert.equal(isApprovalExpired(approved({ expires_at: "2026-08-09T22:00:00-05:00" }), NOW), true);
});

test("pending request blocks another request", () => {
  assert.equal(canCreateNewRequest({ status: "PENDING" }, NOW), false);
  assert.equal(getRequestUiState({ status: "PENDING" }, NOW).canEdit, false);
});

test("valid approval enables edit and blocks duplicate request", () => {
  const state = getRequestUiState(approved(), NOW);
  assert.equal(state.canEdit, true);
  assert.equal(state.canRequest, false);
  assert.equal(canCreateNewRequest(approved(), NOW), false);
});

test("terminal states allow a new request", () => {
  for (const status of ["REJECTED", "REVOKED", "CANCELLED", "EXPIRED", "CONSUMED", "CONFLICT"]) {
    assert.equal(canCreateNewRequest({ status }, NOW), true, status);
  }
});

test("remaining approval time never becomes negative", () => {
  assert.equal(getRemainingApprovalSeconds(approved(), NOW), 45 * 60);
  assert.equal(getRemainingApprovalSeconds(approved({ expires_at: "2026-08-09T21:00:00-05:00" }), NOW), 0);
});

test("latest request indexing chooses newest request per quote", () => {
  const result = indexLatestRequestsByCotizacion([
    { cotizacion_id: "A", id: "old", requested_at: "2026-08-09T20:00:00Z" },
    { cotizacion_id: "A", id: "new", requested_at: "2026-08-09T21:00:00Z" },
    { cotizacion_id: "B", id: "b", requested_at: "2026-08-09T19:00:00Z" },
  ]);
  assert.equal(result.A.id, "new");
  assert.equal(result.B.id, "b");
});

test("commit payload is tied to request nonce and approved version", () => {
  const request = approved({ expires_at: new Date(Date.now() + 60_000).toISOString() });
  const payload = buildPostSaleCommitPayload({ request, cotizacion: { titulo: "X" }, passengers: { adults: [{}], children: [] } });
  assert.equal(payload.request_id, request.id);
  assert.equal(payload.nonce, request.approval_nonce);
  assert.equal(payload.expected_version, 7);
});

test("commit payload refuses non-approved requests", () => {
  assert.throws(
    () => buildPostSaleCommitPayload({ request: { status: "PENDING" }, cotizacion: {}, passengers: {} }),
    /no está vigente/,
  );
});


test("only role 0 can manage post-sale edit requests", () => {
  assert.equal(canManagePostSaleEditRequests(0), true);
  assert.equal(canManagePostSaleEditRequests("0"), true);
  for (const role of [1, 2, 3, 4, null, undefined, "admin"]) {
    assert.equal(canManagePostSaleEditRequests(role), false, String(role));
  }
});
test("normaliza el rol sin convertir ausencia en superadmin", () => {
  assert.equal(normalizeUserRole(0), 0);
  assert.equal(normalizeUserRole("2"), 2);
  assert.equal(normalizeUserRole(null), null);
  assert.equal(normalizeUserRole(undefined), null);
  assert.equal(normalizeUserRole(""), null);
  assert.equal(normalizeUserRole("admin"), null);
});

test("solo vendedor propietario o role 0 puede solicitar edición postventa", () => {
  assert.equal(canRequestPostSaleEdit({ role: 0, actorDni: "00000000", ownerDni: "12345678" }), true);
  assert.equal(canRequestPostSaleEdit({ role: 2, actorDni: "12345678", ownerDni: "12345678" }), true);
  assert.equal(canRequestPostSaleEdit({ role: 2, actorDni: "87654321", ownerDni: "12345678" }), false);
  assert.equal(canRequestPostSaleEdit({ role: 1, actorDni: "12345678", ownerDni: "12345678" }), false);
  assert.equal(canRequestPostSaleEdit({ role: 3, actorDni: "12345678", ownerDni: "12345678" }), false);
  assert.equal(canRequestPostSaleEdit({ role: null, actorDni: "12345678", ownerDni: "12345678" }), false);
});



test("la edición solo abre sobre el snapshot exactamente autorizado", () => {
  const request = approved();
  assert.equal(
    isApprovalValidForSnapshot(request, { current_version: 7 }, NOW),
    true,
  );
  assert.equal(
    isApprovalValidForSnapshot(request, { current_version: 8 }, NOW),
    false,
  );
  assert.equal(
    isApprovalValidForSnapshot(request, { current_version: null }, NOW),
    false,
  );
});

test("el menú de Venso expone el mismo estado postventa visible de Magic", () => {
  const rowSource = readFileSync(
    resolve(process.cwd(), "src/pages/Ventas/Cotizaciones/components/CotizacionTableRow.tsx"),
    "utf8",
  );
  const actionsSource = readFileSync(
    resolve(process.cwd(), "src/components/common/ExpandableActions/ExpandableActions.tsx"),
    "utf8",
  );

  assert.match(
    rowSource,
    /post-sale-permission-status--\$\{postSaleUi\.tone\}[\s\S]*?postSaleUi\.label/,
    "una venta cerrada debe mostrar el estado de su permiso dentro de acciones",
  );
  assert.match(
    rowSource,
    /postSaleUi\.canEdit[\s\S]*?Vence en[\s\S]*?formatRemainingApprovalTime/,
    "una aprobación vigente debe comunicar su vencimiento",
  );
  assert.match(
    rowSource,
    /review_reason[\s\S]*?postSaleUi\.key === "REJECTED"/,
    "un rechazo debe conservar visible el motivo de revisión",
  );
  assert.match(
    rowSource,
    /revoke_reason[\s\S]*?postSaleUi\.key === "REVOKED"/,
    "una revocación debe conservar visible el motivo",
  );
  assert.match(
    rowSource,
    /postSaleUi\.canEdit[\s\S]*?Editar venta[\s\S]*?formatRemainingApprovalTime/,
    "solo el permiso vigente debe presentar la edición de venta",
  );
  assert.match(
    actionsSource,
    /panelHeader\?: ReactNode[\s\S]*?expandable-actions__panel-header/,
    "el encabezado de permisos debe mostrarse dentro del menú expandible",
  );
});

test("el editor muestra el banner postventa en el pie y permite completar la agencia", () => {
  const editorSource = readFileSync(
    resolve(
      process.cwd(),
      "src/components/Ventas/Cotizaciones/EdicionCotizacion/EdicionCotizacion.tsx",
    ),
    "utf8",
  );
  const editorStyles = readFileSync(
    resolve(
      process.cwd(),
      "src/components/Ventas/Cotizaciones/EdicionCotizacion/EdicionCotizacion.scss",
    ),
    "utf8",
  );
  const sidebarStart = editorSource.indexOf('<aside className="quotation-step-sidebar"');
  const sidebarEnd = editorSource.indexOf("</aside>", sidebarStart);
  const sidebarSource = editorSource.slice(sidebarStart, sidebarEnd);
  const footerStart = editorSource.indexOf('<div className="cotizacion-footer">');
  const footerSource = editorSource.slice(footerStart);

  assert.ok(sidebarStart >= 0 && sidebarEnd > sidebarStart, "el editor debe conservar su barra lateral");
  assert.ok(footerStart >= 0, "el editor debe conservar su pie de acciones");
  assert.match(
    footerSource,
    /post-sale-authorization-banner post-sale-authorization-banner--footer[\s\S]*?is-valid[\s\S]*?Vence en\s*\$\{[\s\S]*?formatRemainingApprovalTime\([\s\S]*?postSaleEditRequest,[\s\S]*?postSaleClock,[\s\S]*?\)/,
    "el pie debe usar el banner postventa válido y mostrar el tiempo restante",
  );
  assert.match(
    footerSource,
    /post-sale-authorization-details__trigger[\s\S]*?aria-controls="post-sale-authorization-details-popover"[\s\S]*?Aprobado por[\s\S]*?Motivo/,
    "los datos de aprobación deben abrirse desde un popover de detalles",
  );
  assert.doesNotMatch(
    footerSource,
    /Solicitud\s*\{postSaleEditRequest\.id\}/,
    "el banner resumido no debe exponer el UUID de la solicitud",
  );
  assert.match(
    sidebarSource,
    /getAgencies\(false\)|handleQuotationAgencyChange|Cambiar agencia de la cotización/,
    "el panel debe permitir elegir la agencia que provee el catálogo",
  );
  assert.match(
    editorSource,
    /createAgency\(\{[\s\S]*?name,[\s\S]*?queryClient\.setQueryData[\s\S]*?setSelectedAgencyId\(created\.id\)/,
    "una agencia creada debe aparecer de inmediato como la agencia seleccionada",
  );
  assert.match(
    sidebarSource,
    /quotation-sidebar-agency__create-form[\s\S]*?Nueva agencia[\s\S]*?Nombre de agencia/,
    "el selector debe ofrecer el formulario para agregar una agencia inexistente",
  );
  assert.match(
    editorSource,
    /agency_id: effectiveAgencyId[\s\S]*?tariff_type: tariffType/,
    "la agencia seleccionada debe formar parte del payload que se guarda",
  );
  assert.doesNotMatch(
    sidebarSource,
    />\s*Modalidad\s*</,
    "el panel lateral no debe presentar una modalidad ajena al contexto comercial",
  );
  assert.doesNotMatch(
    sidebarSource,
    /quotation-sidebar-agency__hint/,
    "el selector no debe reservar espacio para una ayuda irrelevante",
  );
  assert.doesNotMatch(
    editorStyles,
    /\.quotation-sidebar-context\s*\{\s*display:\s*none/,
    "en responsive la agencia debe seguir disponible para editarse",
  );
});
