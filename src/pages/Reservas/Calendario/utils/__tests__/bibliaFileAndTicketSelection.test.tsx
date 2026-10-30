import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import { buildBibliaFileCopy, getBibliaFileSources } from "../bibliaFileSuggestions";
import { splitBibliaTickets, compactBibliaTickets, addBibliaTicket, joinBibliaTickets } from "../bibliaTicketSelection";
import { createBibliaRowDraftStore, buildBibliaRowChanges } from "../bibliaRowDrafts";
import { buildBibliaEditRecord } from "../bibliaQuotationLinking";
import { buildBibliaActivitiesFromSnapshots } from "../bibliaActivityMapper";
import { BIBLIA_SHEET_COLUMNS, buildBibliaDayExportMatrix } from "../bibliaDayJpegExport";
import { createBibliaMonthExcelWorkbook } from "../bibliaDayExcelExport";
import BibliaFileSuggestions from "../../components/BibliaFileSuggestions";
const row = (extra = {}) => ({ id: "new", sourceType: "standalone", standaloneRecordId: "new", dateKey: "2026-09-30", date: new Date(2026,8,30), file: "DK0802", reservationName: "—", language: "—", nationality: "—", pax: 0, color: "#E7B8AE", overrideRecord: { id: "entry" }, ...extra }) as any;
const source = (extra = {}) => row({ id: "old", dateKey: "2026-09-29", pax: 3, reservationName: "Carmen", language: "ESPAÑOL", nationality: "Perú, México", participantPlan: { version:1, adults:{count:2,nationalities:[{country:"Perú",count:2}]}, children:{count:1,nationalities:[{country:"México",count:1}]} }, ...extra });

test("el mismo file se busca por codigo completo, excluye propio dia, borrados y pax vacios",()=>{
 const a=row(); const old=source();
 assert.deepEqual(getBibliaFileSources(a," dk0802 ",[a,old,source({id:"same",dateKey:a.dateKey}),source({id:"other",file:"DK0802A"}),source({id:"deleted",isDeleted:true}),source({id:"empty",pax:0})]).map(x=>x.id),["old"]);
 assert.deepEqual(getBibliaFileSources(a,"—",[old]),[]);
 assert.deepEqual(getBibliaFileSources(a,"",[old]),[]);
});
test("prioriza el dia anterior cercano y permite elegir un dia con menos beneficiarios",()=>{
 const rows=[source({id:"older",dateKey:"2026-09-27",pax:7}),source({id:"next",dateKey:"2026-10-02",pax:7}),source({id:"near",pax:3})];
 assert.deepEqual(getBibliaFileSources(row(),"DK0802",rows).map(x=>x.id),["near","older","next"]);
});
test("copia adultos y ninos con sus paises sin copiar servicios, vinculos, fecha ni codigo",()=>{
 const a=source(); const copied=buildBibliaFileCopy(a);
 assert.equal(copied.pax,"3"); assert.equal(copied.reservationName,"Carmen"); assert.equal(copied.language,"ESPAÑOL");
 assert.deepEqual(JSON.parse(copied.participantPlan),a.participantPlan);
 assert.equal(copied.nationality,"Perú, México");
 assert.deepEqual(Object.keys(copied).sort(),["language","nationality","participantPlan","pax","reservationName"]);
 JSON.parse(copied.participantPlan).adults.count=99;assert.equal(a.participantPlan.adults.count,2);
});
test("historico de un pais hereda adultos; una nacionalidad mixta sin reparto no inventa cantidades",()=>{
 const one=buildBibliaFileCopy(source({participantPlan:null,pax:2,nationality:"USA"}));
 assert.equal(JSON.parse(one.participantPlan).adults.count,2);assert.equal(one.nationality,"Estados Unidos");
 const mixed=buildBibliaFileCopy(source({participantPlan:null,nationality:"Perú, USA"}));
 assert.equal(mixed.participantPlan,"null");assert.equal(mixed.nationality,"Perú, Estados Unidos");
});
test("usar datos y varias entradas se guardan en una escritura y reaparecen al recargar",async()=>{
 const a=row();const store=createBibliaRowDraftStore(); const copied=buildBibliaFileCopy(source());
 Object.entries(copied).forEach(([k,v])=>store.stage(a,k as any,v));store.stage(a,"tickets",addBibliaTicket("BTG","QORI"));
 let calls=0;let record:any;
 assert.equal(await store.save(a,async(a,changes)=>{calls++;record=buildBibliaEditRecord(a,changes);}),true);assert.equal(calls,1);
 const saved=buildBibliaActivitiesFromSnapshots([],[{id:"new",is_active:true,actividad:record}])[0];
 assert.equal(saved.pax,3);assert.equal(saved.language,"ESPAÑOL");assert.deepEqual(saved.participantPlan,source().participantPlan);
 assert.equal(saved.tickets,"BTG + QORICANCHA");assert.equal(saved.sourceQuotationId,"");assert.equal(saved.dateKey,"2026-09-30");
 assert.deepEqual(store.getSnapshot().rows[a.id].values,{});
});
test("un fallo mantiene el paquete completo de datos para reintentar",async()=>{
 const a=row();const store=createBibliaRowDraftStore();Object.entries(buildBibliaFileCopy(source())).forEach(([k,v])=>store.stage(a,k as any,v));
 assert.equal(await store.save(a,async()=>{throw new Error("Sin conexión");}),false);
 assert.equal(store.getSnapshot().rows[a.id].values.pax,"3");assert.ok(store.getSnapshot().rows[a.id].values.participantPlan);
 assert.equal(await store.save(a,async()=>{}),true);
});
test("copiar un historico sin reparto elimina el plan anterior para no conservar paises obsoletos",()=>{
 const a=source();const changes=buildBibliaRowChanges(a,buildBibliaFileCopy(source({participantPlan:null,nationality:"Perú, USA"})));
 const record=buildBibliaEditRecord(a,changes);assert.equal(record.participantPlan,null);
});
test("recomendaciones muestran la fecha, pax y reserva elegidos sin enviar escrituras",()=>{
 let calls=0;const html=renderToStaticMarkup(<BibliaFileSuggestions activity={row()} code="DK0802" activities={[source()]} quotations={[]} onApply={()=>calls++} />);
 assert.match(html,/2026-09-29/);assert.match(html,/3 pax/);assert.match(html,/Carmen/);assert.match(html,/Guardar/);assert.equal(calls,0);
 assert.equal(renderToStaticMarkup(<BibliaFileSuggestions activity={row()} code="otro" activities={[source()]} quotations={[]} onApply={()=>{}} />),"");
});
test("agregar entradas deduplica alias y quitar una conserva las restantes",()=>{
 const value=addBibliaTicket(addBibliaTicket("BTG","QORICANCHA"),"QORI + CATEDRAL");
 assert.equal(value,"BTG + QORICANCHA + CATEDRAL");assert.equal(compactBibliaTickets(value),"BTG + QORI + CATE");
 assert.equal(joinBibliaTickets(splitBibliaTickets(value).filter(x=>x!=="QORICANCHA")),"BTG + CATEDRAL");
 assert.deepEqual(splitBibliaTickets("BTG [MAYOR 60+] + QORI"),["BTG [MAYOR 60+]","QORICANCHA"]);
 assert.equal(compactBibliaTickets("Entrada especial desconocida"),"Entrada especial desconocida");
});
test("JPG y Excel mensual comparten abreviaturas, no el rich text importado anterior",async()=>{
 const a=source({date:new Date(2026,8,29),tickets:"BTG + QORICANCHA + CATEDRAL",sourceExcel:{richText:{tickets:[{text:"Texto anterior"}]}}});
 const index=BIBLIA_SHEET_COLUMNS.findIndex(([f])=>f==="tickets");
 assert.equal(buildBibliaDayExportMatrix([a]).rows[0][index],"BTG + QORI + CATE");
 const {workbook,worksheets}=createBibliaMonthExcelWorkbook({month:new Date(2026,8,1),activities:[a,{...a,dateKey:"2026-09-30",date:new Date(2026,8,30)}]});
 assert.equal(worksheets.length,2);for(const sheet of worksheets)assert.equal(sheet.getRow(4).getCell(index+1).value,"BTG + QORI + CATE");
 assert.ok((await workbook.xlsx.writeBuffer()).byteLength>0);
});
test("selector real renderiza chips de multiples entradas con acciones de quitar",async()=>{
 const b=await build({entryPoints:["src/pages/Reservas/Calendario/components/BibliaTicketPicker.tsx"],bundle:true,write:false,platform:"node",format:"cjs",loader:{".scss":"empty"},external:["react","react-dom","react/jsx-runtime"]});
 const m={exports:{} as any};new Function("require","module","exports",b.outputFiles[0].text)(createRequire(path.resolve("package.json")),m,m.exports);
 const C=m.exports.default;const html=renderToStaticMarkup(<C value="BTG + QORICANCHA" options={[]} onChange={()=>{}} />);
 assert.match(html,/Quitar BTG/);assert.match(html,/Quitar QORICANCHA/);assert.match(html,/QORI/);assert.match(html,/Agregar entrada/);
});
