import test from "node:test";
import assert from "node:assert/strict";
import { buildBibliaPublicationRecords } from "../bibliaPublication";
import { buildBibliaActivitiesFromSnapshots } from "../bibliaActivityMapper";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const quote = () => ({ id:"COT-QA",voucher_code:"QA-FILE",biblia_visible:false,current_version:1,
  fechainicio:"2026-11-01",titulo:"Reserva QA",cantidadpersonas:3,
  passengers:[{nombres:"QA",nacionalidad:"Perú",tipo_pasajero:"adult"},{nombres:"QA",nacionalidad:"Italia",tipo_pasajero:"adult"},{nombres:"QA",nacionalidad:"Italia",tipo_pasajero:"child"}],
  agency_name:"Agencia QA",biblia_actividades:[],itinerario:[
    {id:11,numero:1,titulo:"City Tour",servicios:[{typeService:"tickets",parentService:{entrada:"BTG"}}]},
    {id:12,numero:2,titulo:"Valle Sagrado",servicios:[{typeService:"restaurantes",parentService:{nombre:"Restaurante QA"}}]}
  ] });

test("publication projects each real day with its file, passengers and services",()=>{
  const records=buildBibliaPublicationRecords(quote());
  assert.equal(records.length,2);assert.deepEqual(records.map(r=>r.dateKey),["2026-11-01","2026-11-02"]);
  assert.deepEqual(records.map(r=>r.excursion),["City Tour","Valle Sagrado"]);
  assert.ok(records.every(r=>r.file==="QA-FILE"&&r.pax===3&&r.syncQuotation===false));
  assert.match(records[0].tickets,/BTG/);assert.match(records[1].restaurant,/Restaurante QA/);
  assert.equal(records[0].agency,"Agencia QA");
});
test("empty operational files never invent passengers or dates",()=>{
  assert.deepEqual(buildBibliaPublicationRecords({...quote(),fechainicio:null,itinerario:[],passengers:[],cantidadpersonas:0}),[]);
  assert.throws(()=>buildBibliaPublicationRecords({...quote(),fechainicio:null}),/fecha de inicio/);
});
test("republishing refreshes automatic days but preserves manual edits, colors and deleted rows",()=>{
  const first=buildBibliaPublicationRecords(quote());
  const edited={...first[0],snapshotEdited:true,excursion:"Edición operativa",color:"#FFFF00",participantPlan:{version:1,adults:{count:1,nationalities:[{country:"Perú",count:1}]},children:{count:0,nationalities:[]}}};
  const deleted={...first[1],isDeleted:true};
  const extra={...first[1],id:"manual-extra",dayNumber:3,dateKey:"2026-11-03",snapshotEdited:true};
  const changed={...quote(),biblia_actividades:[edited,deleted,extra]};
  changed.itinerario[0].titulo="Tour cambiado";
  const records=buildBibliaPublicationRecords(changed);
  assert.deepEqual(records,[edited,deleted,extra]);
  const auto=buildBibliaPublicationRecords({...changed,biblia_actividades:first});
  assert.equal(auto[0].excursion,"Tour cambiado");
  assert.deepEqual(buildBibliaPublicationRecords({...changed,biblia_actividades:records}),records);
});
test("linked operational rows keep their day and publication does not create a second copy",()=>{
  const row={id:"row-id",cotizacion_id:"COT-QA",is_active:true,actividad:{id:"linked",dateKey:"2026-11-01",file:"QA-FILE",pax:2}};
  const records=buildBibliaPublicationRecords(quote(),[row]);
  assert.equal(records.length,1);assert.equal(records[0].dateKey,"2026-11-02");
});
test("hidden files exclude snapshots and linked rows; showing restores their identities",()=>{
  const records=buildBibliaPublicationRecords(quote());
  const q={...quote(),biblia_actividades:records};
  const linked={id:"linked-db",cotizacion_id:q.id,is_active:true,actividad:{id:"linked",dateKey:"2026-11-03",pax:1}};
  assert.deepEqual(buildBibliaActivitiesFromSnapshots([q],[linked]),[]);
  const visible=buildBibliaActivitiesFromSnapshots([{...q,biblia_visible:true}],[linked]);
  assert.equal(visible.length,3);assert.ok(visible.some(r=>r.standaloneRecordId==="linked-db"));
});
test("publication preserves a legacy JSON snapshot and rejects unreadable previous data",()=>{
  const rows=buildBibliaPublicationRecords(quote());
  rows[0].snapshotEdited=true;rows[0].observations="Conservar esta nota";
  assert.deepEqual(buildBibliaPublicationRecords({...quote(),biblia_actividades:JSON.stringify(rows)}),rows);
  assert.throws(()=>buildBibliaPublicationRecords({...quote(),biblia_actividades:{broken:true}}),/registros anteriores/);
});

(async()=>{
  const compiled=await build({entryPoints:["src/pages/Reservas/Calendario/services/bibliaActivityService.ts"],bundle:true,write:false,format:"cjs",platform:"node",
    plugins:[{name:"api-boundary",setup(b){b.onResolve({filter:/apiUtils$|cacheInvalidation$/},a=>({path:a.path,namespace:"fake"}));
      b.onLoad({filter:/.*/,namespace:"fake"},a=>({loader:"js",contents:a.path.endsWith("apiUtils")
        ? "export const createApiInstance=()=>globalThis.__bibliaPublicationApi.client;"
        : "export const invalidateCotizacionGraphCache=()=>globalThis.__bibliaPublicationApi.invalidations++;export const invalidateAgenciesCache=()=>{};"}));}}]});
  const module={exports:{} as any};new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(resolve("package.json")),module,module.exports);
  const api=module.exports.bibliaActivityService;
  async function run(visible,source=quote(),failure=false){
    const calls=[];const old=globalThis.__bibliaPublicationApi;
    const harness={invalidations:0,client:{get:async(url,options)=>{calls.push({method:"get",url,options});return {data:{data:{quotations:[source],standalone:[]}}};},
      patch:async(url,payload)=>{calls.push({method:"patch",url,payload});if(failure)throw Error("Conflicto de publicación");return {data:{data:{id:source.id,biblia_visible:visible}}};}}};
    globalThis.__bibliaPublicationApi=harness;
    try{return {result:await api.setQuotationVisibility(source.id,visible),calls,invalidations:harness.invalidations};}
    catch(error){return {error,calls,invalidations:harness.invalidations};}
    finally{old===undefined?delete globalThis.__bibliaPublicationApi:globalThis.__bibliaPublicationApi=old;}
  }
  test("publication API fetches the selected file and sends its version and untouched snapshot",async()=>{
    const result=await run(true);
    assert.deepEqual(result.calls[0].options.params,{quote_id:"COT-QA"});
    assert.equal(result.calls[1].url,"/turismo/cotizaciones/COT-QA/biblia-visibilidad");
    assert.equal(result.calls[1].payload.expected_version,1);
    assert.deepEqual(result.calls[1].payload.expected_records,[]);
    assert.equal(result.calls[1].payload.records.length,2);
    assert.equal(result.invalidations,1);
  });
  test("hide API changes only visibility without replacing the stored records",async()=>{
    const result=await run(false);
    assert.equal(result.calls.length,1);assert.equal(result.calls[0].method,"patch");
    assert.deepEqual(result.calls[0].payload,{visible:false});
  });
  test("failed publication and undated itinerary never invalidate caches as a successful change",async()=>{
    const conflict=await run(true,quote(),true);assert.match(conflict.error.message,/Conflicto/);assert.equal(conflict.invalidations,0);
    const undated=await run(true,{...quote(),fechainicio:null});assert.match(undated.error.message,/fecha de inicio/);assert.equal(undated.calls.length,1);assert.equal(undated.invalidations,0);
  });
})();
