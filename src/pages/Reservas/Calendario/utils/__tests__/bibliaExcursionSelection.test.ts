import test from "node:test";
import assert from "node:assert/strict";
import { buildBibliaRowChanges, bibliaTourDraftContext, bibliaTourRecommendationPayload } from "../bibliaRowDrafts";
import { materializeBibliaOverride } from "../bibliaActivityMapper";
import { tariffPriceOptions } from "../../../../../utils/servicePricingType";
const activity:any={id:"standalone:one",sourceType:"standalone",agency:"Venso Tours",agencyId:1,excursion:"Valle Sagrado",tourSelections:[],overrideRecord:{}};
test("tours elegidos se guardan por ID, excursión y agencia sin convertirse en texto de la celda",()=>{
 const selections=[{excursionKey:"valle sagrado",tourId:7,agencyId:1}];
 const changes=buildBibliaRowChanges(activity,{tourSelections:JSON.stringify(selections)});
 assert.deepEqual(changes.tourSelections,selections);
 assert.deepEqual(materializeBibliaOverride(activity,changes).tourSelections,selections);
 assert.equal(materializeBibliaOverride(activity,{agency:"Otra"}).agencyId,null);
 assert.throws(()=>buildBibliaRowChanges(activity,{tourSelections:'[{"tourId":0}]'}));
});
test("entradas conservan privado por persona en días SIC, PRIV o mixtos incluso con precio cero",()=>{
 for(const mode of ["compartido","privado","mixto"]){
  const options=tariffPriceOptions({tipo_servicio:"tickets",precio_compartido:999,precio_privado:0},mode);
  assert.deepEqual(options.map(row=>[row.tipoPrecio,row.amount]),[["privado",0]]);
  assert.equal(tariffPriceOptions({precio_compartido:null,precio_privado:20},mode,"tickets")[0].amount,20);
  assert.deepEqual(tariffPriceOptions({precio_compartido:20,precio_privado:null},mode,"tickets"),[]);
 }
 assert.equal(tariffPriceOptions({precio_compartido:100,precio_privado:20},"compartido","movilidad")[0].amount,100);
});

test("recomendaciones usan agencia, idioma y pax pendientes sin alterar el snapshot guardado", () => {
 const original = {...activity, pax: 4, language: "ES", serviceMode: "PRIV"};
 const preview = bibliaTourDraftContext(original, {agency: "Otra", language: "EN", pax: "2", serviceMode: "SIC"});
 assert.equal(preview.agencyId, null);
 assert.equal(preview.pax, 2);
 assert.equal(preview.language, "EN");
 assert.equal(preview.serviceMode, "SIC");
 assert.equal(original.agencyId, 1);
 assert.equal(original.pax, 4);
 assert.equal(bibliaTourDraftContext(original, {pax: "-"}).pax, 4);
});

test("recomendaciones dependen de Excursión y conservan su agencia, sin filtrar por Endose", () => {
 const original = {...activity, pax: 4, language: "ES", dateKey: "2026-09-01", serviceMode: "PRIV", endorse: "Otro operador"};
 const payload = bibliaTourRecommendationPayload(original, "VALLE SAGRADO + CONEXION 16:36");
 assert.equal(payload.excursion, "VALLE SAGRADO + CONEXION 16:36");
 assert.equal(payload.agencyId, 1);
 assert.equal(payload.pax, 4);
 assert.equal("endorse" in payload, false);
 for (const endorse of ["Venso", "Venso Tours", "vensotours", "No registrado", "—", ""]) {
  assert.deepEqual(bibliaTourRecommendationPayload({...original, endorse}, payload.excursion), payload);
 }
 assert.equal(original.endorse, "Otro operador");
});

test("el selector envía los tours pendientes con la excursión y contexto de tarifa actuales", () => {
 const original = {...activity, pax: 4, language: "ES", serviceMode: "PRIV"};
 const preview = bibliaTourDraftContext(original, {agency: "Otra agencia", pax: "2", language: "EN", serviceMode: "SIC"});
 const selected = [{excursionKey: "valle sagrado", tourId: 7, agencyId: 2}];
 const payload = bibliaTourRecommendationPayload(preview, "Valle Sagrado", JSON.stringify(selected));
 assert.equal(payload.agencyId, null);
 assert.equal(payload.agency, "Otra agencia");
 assert.equal(payload.pax, 2);
 assert.equal(payload.language, "EN");
 assert.equal(payload.serviceMode, "SIC");
 assert.deepEqual(payload.tourSelections, selected);
 assert.deepEqual(original.tourSelections, []);
});
