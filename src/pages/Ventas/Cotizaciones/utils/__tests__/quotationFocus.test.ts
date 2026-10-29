import test from "node:test";
import assert from "node:assert/strict";
import { matchesCotizacionSearch } from "../cotizacionSearch";
import { QUOTATION_FOCUS_PARAM, quotationFocusHref, quotationFocusList } from "../quotationFocus";

test("el código de file se busca sin depender del título, venta o rol", () => {
  const quote = { id: "COT261029-001", titulo: "Familia Saman", voucher_code: "DK01124", tiene_voucher: false };
  assert.equal(matchesCotizacionSearch(quote, " dk01124 "), true);
  assert.equal(matchesCotizacionSearch(quote, "DK011", { allowIdSearch: false }), true);
  assert.equal(matchesCotizacionSearch(quote, "DK999"), false);
});

test("la búsqueda incluye códigos camelCase e históricos de vouchers sin perder título e ID", () => {
  const quote = { id: "COT-123", titulo: "Valle Sagrado", voucherCode: "F-01", voucher_codes: ["V-02", "V-03"] };
  for (const query of ["f-01", "v-02", "V-03", "sagrado", "COT-123", ""]) assert.equal(matchesCotizacionSearch(quote, query), true);
  for (const vouchers of [null, {}, "V-02"]) assert.equal(matchesCotizacionSearch({ ...quote, voucher_codes: vouchers }, "V-02"), false);
});

test("el enlace abre la ruta de Reservas y codifica sólo el ID de la cotización", () => {
  const href = quotationFocusHref(" COT-01 ", 3)!;
  assert.equal(href, "/reservas/cotizaciones?focus_cotizacion=COT-01");
  assert.equal(new URL(href, "https://venso.test").searchParams.get(QUOTATION_FOCUS_PARAM), "COT-01");
  assert.equal(quotationFocusHref("", 3), null);
  assert.equal(quotationFocusHref(null, 3), null);
});

test("Ventas y Superadmin usan su ruta de cotizaciones y el ID no inyecta parámetros", () => {
  for (const role of [0, 1, 2]) {
    const url = new URL(quotationFocusHref("Q&otro=1", role)!, "https://venso.test");
    assert.equal(url.pathname, "/ventas/cotizaciones");
    assert.equal(url.searchParams.get(QUOTATION_FOCUS_PARAM), "Q&otro=1");
    assert.equal(url.searchParams.has("otro"), false);
  }
});

test("el foco recupera un file aunque la lista previa esté filtrada o paginada", () => {
  const quote = { id: "COT-02", is_active: true, createdby: "otro-vendedor", tiene_voucher: true, voucher_code: "DK-2" };
  assert.deepEqual(quotationFocusList("COT-02", quote, [{ id: "otra" }]), [quote]);
});

test("un ID sin acceso o inactivo no muestra otra cotización como sustituta", () => {
  const other = [{ id: "otro", is_active: true }];
  assert.deepEqual(quotationFocusList("Q", null, other), []);
  assert.deepEqual(quotationFocusList("Q", { id: "otro", is_active: true }, other), []);
  assert.deepEqual(quotationFocusList("Q", { id: "Q", is_active: false }, other), []);
  assert.equal(quotationFocusList("", null, other), other);
});