import test from "node:test";
import assert from "node:assert/strict";

import { resolveCotizacionPostSaveListState } from "../cotizacionListState";
import { getCotizacionVisibilityScope } from "../../../../../utils/permissions";

test("Reservas vuelve a propias al guardar su primera cotización", () => {
  const state = resolveCotizacionPostSaveListState({
    isReservationFlow: true,
    currentSellerDni: "RES-1",
    savedSellerDni: "RES-1",
    currentSellerScope: "others",
    currentSellerFilter: "VENTAS-1",
    hasVoucher: false,
  });

  assert.deepEqual(state, {
    sellerScope: "mine",
    vendedor: "",
    quotationStatus: "open",
  });
});

test("editar una cotización ajena no fuerza el scope de propias", () => {
  const state = resolveCotizacionPostSaveListState({
    isReservationFlow: true,
    currentSellerDni: "ADMIN-1",
    savedSellerDni: "VENTAS-2",
    currentSellerScope: "others",
    currentSellerFilter: "VENTAS-2",
    hasVoucher: false,
  });

  assert.equal(state.sellerScope, "others");
  assert.equal(state.vendedor, "VENTAS-2");
});

test("una venta cerrada permanece en la pestaña de vendidas tras guardar", () => {
  const state = resolveCotizacionPostSaveListState({
    isReservationFlow: true,
    currentSellerDni: "RES-1",
    savedSellerDni: "RES-1",
    currentSellerScope: "mine",
    hasVoucher: true,
  });

  assert.equal(state.quotationStatus, "sold");
});


test("la query de Reservas queda separada por alcance de plataforma", () => {
  assert.equal(
    getCotizacionVisibilityScope({
      role: 3,
      platform: "venso",
      permissions: { actions: ["view_all_quotes"] },
    }),
    "platform",
  );
  assert.equal(
    getCotizacionVisibilityScope({
      role: 2,
      platform: "venso",
      permissions: { actions: ["view_own_quotes"] },
    }),
    "own",
  );
  assert.equal(
    getCotizacionVisibilityScope({ role: 0, platform: "all" }),
    "all",
  );
});
