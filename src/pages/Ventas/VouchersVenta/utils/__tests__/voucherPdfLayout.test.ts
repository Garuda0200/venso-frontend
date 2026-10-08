import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildVoucherTitleBlocks, packMeasuredVoucherFlow, buildVoucherFlightRows, groupVoucherFlightCards } from "../voucherPdfLayout";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import VoucherFlightsTable, { VOUCHER_FLIGHT_FIELDS } from "../../components/VentasSummaryPDFModal/VoucherFlightsTable";

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

test("cada vuelo ocupa una fila aunque haya vuelos internos e internacionales",()=>{
 const intl=[{id:1},{id:2}],nat=[{id:3},{id:4},{id:5}];
 const cards=[{type:"internacional",key:"intl",flights:intl},{type:"nacional",key:"nat",flights:nat}];
 const snapshot=JSON.stringify(cards),rows=buildVoucherFlightRows(cards);
 assert.equal(rows.length,5);assert.ok(rows.every(row=>row.cards.length===1 && row.cards[0].flights.length===1));
 assert.deepEqual(rows.map(row=>row.cards[0].flights[0].id),[1,2,3,4,5]);
 const grouped=groupVoucherFlightCards(rows.flatMap(row=>row.cards));
 assert.equal(grouped.length,2);assert.equal(grouped[1].flights[2],nat[2]);
 assert.equal(JSON.stringify(cards),snapshot);
});

test("los encabezados se comparten y cada vuelo contiene ocho celdas, no dos filas",()=>{
 const headers=Object.fromEntries(VOUCHER_FLIGHT_FIELDS.map(field=>[field,field]));
 const html=renderToStaticMarkup(React.createElement(VoucherFlightsTable,{type:"nacional",title:"Vuelos internos",
  flights:[{id:1},{id:2},{id:3}],headers,renderCell:(flight,field)=>`${field}-${flight.id}`}));
 assert.equal((html.match(/class="flight-title"/g)||[]).length,1);
 assert.equal((html.match(/scope="col"/g)||[]).length,8);
 assert.equal((html.match(/data-voucher-flight-row="true"/g)||[]).length,3);
 assert.equal((html.match(/<td /g)||[]).length,24);
 assert.doesNotMatch(html,/flight-edit-row|flight-sep|class="label"/);
});

test("la continuación medida reserva encabezados sin cambiar ni duplicar vuelos",()=>{
 const items=buildVoucherFlightRows([{type:"nacional",key:"nat",flights:[{id:1},{id:2},{id:3},{id:4}]}]);
 const result=packMeasuredVoucherFlow(items,[50,25,25,25],{introHeight:50,pageHeight:65,gap:0,pageStartExtraHeights:[0,25,25,25]});
 assert.deepEqual(result.introItems,[items[0]]);
 assert.deepEqual(result.pages.map(page=>page.items),[[items[1]],[items[2]],[items[3]]]);
 assert.deepEqual([...result.introItems,...result.pages.flatMap(page=>page.items)],items);
});

test("las filas de medición pueden omitir cabecera; los controles conservan la identidad del vuelo",()=>{
 const html=renderToStaticMarkup(React.createElement(VoucherFlightsTable,{type:"nacional",title:"Vuelos internos",showHeader:false,
  headers:Object.fromEntries(VOUCHER_FLIGHT_FIELDS.map(field=>[field,field])),flights:[{__externalIndex:7}],
  renderCell:(flight,field)=>React.createElement("input",{defaultValue:`${field}-${flight.__externalIndex}`,"aria-label":field}),
  renderAction:flight=>React.createElement("button",{"aria-label":`Eliminar ${flight.__externalIndex}`},"Quitar")}));
 assert.doesNotMatch(html,/<thead|class="flight-title"/);assert.match(html,/Eliminar 7/);
 const source=readFileSync(resolve(process.cwd(),"src/pages/Ventas/VouchersVenta/components/VentasSummaryPDFModal/VentasSummaryPDFModal.tsx"),"utf8");
 assert.match(source,/buildVoucherFlightRows\(flightPageCards\)/);
 assert.match(source,/inlineFlightRows.flatMap\(row=>row.cards\)/);
 assert.match(source,/flightsBuffer.flatMap\(item=>item.cards\)/);
 assert.match(source,/handleFlightFieldBlur/);assert.match(source,/handleRemoveFlight\(flight\)/);
});
