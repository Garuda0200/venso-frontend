import test from "node:test";
import assert from "node:assert/strict";
import { buildBibliaActivitiesFromSnapshots, materializeQuotationBibliaRecords, resolveBibliaVoucherTarget } from "../bibliaActivityMapper";
import { getBibliaLinkRecommendations, getBibliaLinkUnavailableReason } from "../bibliaQuotationLinking";
import { savedStandaloneBibliaRecord } from "../bibliaStandalonePersistence";

const quotation = (extra = {}) => ({ id: "COT-EMPTY", voucher_code: "DK0802", titulo: "", cantidadpersonas: 0,
  num_adults: 0, num_children: 0, passengers: [], itinerario: [], itinerario_externo: [], biblia_actividades: [],
  fechainicio: null, fechafin: null, is_active: true, platform: "venso",
  source_voucher: { mediaAssetId: "487ff8dd-d2a6-4618-8679-e0725ee0ef9c", url: "https://media.example/voucher.pdf", originalName: "voucher.pdf", contentType: "application/pdf" }, ...extra });
const record = (extra = {}) => ({ id: "row-1", file: "DK0802", dateKey: "2026-10-31", pax: 0, reservationName: "", excursion: "—", ...extra });
const activity = (extra = {}) => ({ ...record(), id: "standalone:row-1", sourceQuotationId: "", sourceType: "standalone", platform: "venso", ...extra }) as any;

test("an empty reservation file never materializes a day, passenger or automatic Biblia row", () => {
  const empty = quotation();
  assert.deepEqual(materializeQuotationBibliaRecords(empty), []);
  assert.deepEqual(buildBibliaActivitiesFromSnapshots([empty], []), []);
  assert.equal(empty.cantidadpersonas, 0); assert.deepEqual(empty.passengers, []);
  assert.equal(resolveBibliaVoucherTarget(empty).kind, "source");
});

test("server-resolved autolink survives a save requested with null quotation id", () => {
  const before = { id: "row-1", cotizacion_id: null, actividad: record() };
  const serverRecord = record({ quotationLinkPending: true });
  const saved = savedStandaloneBibliaRecord(before, { cotizacion_id: "COT-EMPTY", actividad: serverRecord }, record(), null);
  assert.equal(saved.cotizacion_id, "COT-EMPTY"); assert.equal(saved.actividad.quotationLinkPending, true);
  assert.equal(savedStandaloneBibliaRecord(saved, { cotizacion_id: null }, record(), "COT-EMPTY").cotizacion_id, null);
  assert.equal(savedStandaloneBibliaRecord(saved, {}, record(), "COT-EMPTY").cotizacion_id, "COT-EMPTY");
});

test("a linked zero-pax operational row opens its source voucher before any sale, day or service exists", () => {
  const saved = savedStandaloneBibliaRecord({ id: "row-1" }, { cotizacion_id: "COT-EMPTY", actividad: record({ quotationLinkPending: true }) }, record(), null);
  const rows = buildBibliaActivitiesFromSnapshots([quotation()], [saved]);
  assert.equal(rows.length, 1); assert.equal(rows[0].sourceQuotationId, "COT-EMPTY");
  assert.equal(rows[0].pax, 0); assert.equal(rows[0].sourceSalesVoucherId, null);
  assert.equal(rows[0].sourceVoucherMedia.url, "https://media.example/voucher.pdf");
  assert.deepEqual(materializeQuotationBibliaRecords(quotation(), [], [saved]), []);
});

test("an empty file is recommended only by an exact unique active code in the same platform", () => {
  assert.equal(getBibliaLinkRecommendations(activity({ file: " dk0802 " }), [], [quotation()]).length, 1);
  for (const value of ["DK08020", "DK-0802", "—", ""]) assert.deepEqual(getBibliaLinkRecommendations(activity({ file: value }), [], [quotation()]), []);
  assert.deepEqual(getBibliaLinkRecommendations(activity(), [], [quotation(), quotation({ id: "COT-DUP" })]), []);
  assert.deepEqual(getBibliaLinkRecommendations(activity(), [], [quotation({ is_active: false })]), []);
  assert.deepEqual(getBibliaLinkRecommendations(activity(), [], [quotation({ platform: "magic" })]), []);
});

test("an empty file accepts its first real date and later participants while closed sales remain protected", () => {
  assert.equal(getBibliaLinkUnavailableReason(activity(), quotation()), "");
  assert.equal(getBibliaLinkUnavailableReason(activity({ pax: 2 }), quotation()), "");
  assert.match(getBibliaLinkUnavailableReason(activity(), quotation({ tiene_voucher: true })), /Venta cerrada/);
  assert.match(getBibliaLinkUnavailableReason(activity(), quotation({ is_active: false })), /inactiva/);
  assert.match(getBibliaLinkUnavailableReason(activity({ dateKey: "2026-02-30" }), quotation()), /inválida/);
  assert.match(getBibliaLinkUnavailableReason(activity({ pax: 2 }), quotation({ cantidadpersonas: 2 })), /fecha de inicio/);
});
