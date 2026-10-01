import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildVoucherTitleBlocks, packMeasuredVoucherFlow } from "../voucherPdfLayout";

test("un solo bloque por día aunque existan descripciones editoriales muy extensas", () => {
  const days = [{ title: "Valle Sagrado", content: "Descripción histórica\n".repeat(300) }, { title: "Machu Picchu", content: "Texto" }];
  const snapshot = JSON.stringify(days);
  const blocks = buildVoucherTitleBlocks(days, [{ numero: 3 }, { numero: 4 }], (index) => `Fecha ${index}`);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks.map((block) => block.title), ["Valle Sagrado", "Machu Picchu"]);
  assert.equal(blocks[0].day.numero, 3);
  assert.equal(blocks[1].dayDate, "Fecha 1");
  assert.equal(blocks[0].totalChunks, 1);
  assert.equal("content" in blocks[0], false);
  assert.equal(JSON.stringify(days), snapshot);
});

test("días sin metadata conservan orden y títulos completos", () => {
  const longTitle = "Excursión muy extensa ".repeat(50);
  const blocks = buildVoucherTitleBlocks([{ title: longTitle }, {}], [], () => "");
  assert.equal(blocks[0].title, longTitle);
  assert.equal(blocks[1].day.numero, 2);
  assert.equal(blocks[1].title, "");
});

test("el espacio restante de la hoja introductoria admite bloques completos", () => {
  const result = packMeasuredVoucherFlow(["tour", "incluye", "términos"], [40, 100, 160], { introHeight: 146, pageHeight: 200 });
  assert.deepEqual(result.introItems, ["tour", "incluye"]);
  assert.deepEqual(result.pages, [{ items: ["términos"] }]);
});

test("un bloque que no cabe pasa íntegro a la página siguiente sin adelantar otros", () => {
  const result = packMeasuredVoucherFlow(["vuelos", "tour", "extras"], [100, 20, 20], { introHeight: 40, pageHeight: 140 });
  assert.deepEqual(result.introItems, []);
  assert.deepEqual(result.pages, [{ items: ["vuelos", "tour"] }, { items: ["extras"] }]);
});

test("página llena y márgenes mantienen todos los bloques sin duplicarlos", () => {
  const items = Array.from({ length: 80 }, (_, i) => i);
  const result = packMeasuredVoucherFlow(items, items.map(() => 30), { introHeight: 66, pageHeight: 102 });
  assert.deepEqual([...result.introItems, ...result.pages.flatMap((page) => page.items)], items);
  assert.ok(result.pages.every((page) => page.items.length === 3));
});

test("sin espacio introductorio o sin datos no se inventan páginas vacías", () => {
  assert.deepEqual(packMeasuredVoucherFlow([], []), { introItems: [], pages: [] });
  assert.deepEqual(packMeasuredVoucherFlow(["día"], [30], { introHeight: -10 }).introItems, []);
  assert.deepEqual(packMeasuredVoucherFlow(["día"], [NaN]), { introItems: [], pages: [{ items: ["día"] }] });
});

test("la vista y exportación no incluyen contenido diario ni fechas redundantes", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Ventas/VouchersVenta/components/VentasSummaryPDFModal/VentasSummaryPDFModal.tsx"), "utf8");
  assert.doesNotMatch(source, /className="day-content editable-field"|className="voucher-itinerary-dates?"/);
  assert.match(source, /className="day-title editable-field"/);
  assert.match(source, /buildVoucherTitleBlocks\(itineraryDays, allDays/);
  assert.match(source, /introFlowStartRef/);
  assert.match(source, /renderPdfFlowContent\(\{ items: introPdfFlowItems \}/);
  assert.match(source, /introHasItinerary/);
  assert.match(source, /hasObservacionesText \|\| showObservacionesEditor \? \[\{/);
});
