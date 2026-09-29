import assert from "node:assert/strict";
import { FRONTEND_FEATURES } from "../../../../../config/frontendFeatures";
import { AREA_ROUTES, SPECIAL_ACTIONS } from "../permissionsConfig";

assert.equal(
  FRONTEND_FEATURES.commissionsManagement,
  false,
  "la gestión de comisiones debe estar deshabilitada visualmente",
);

const commissionsRoute = AREA_ROUTES.admin.find(
  (route) => route.path === "/admin/comisiones",
);
assert.ok(commissionsRoute, "la ruta debe conservarse para una futura reactivación");
assert.equal(commissionsRoute.hidden, true, "la ruta debe ocultarse del UserForm");

for (const key of ["view_commissions", "view_all_commissions", "manage_sales_goals"]) {
  const action = SPECIAL_ACTIONS.find((item) => item.key === key);
  assert.ok(action, `el permiso ${key} debe conservarse para reactivación futura`);
  assert.equal(action.hidden, true, `el permiso ${key} debe permanecer oculto`);
}

console.log("commissionUiVisibility.test.ts PASS");
