import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { act as legacyAct } from "react-dom/test-utils";
import { parseHTML } from "linkedom";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Exercise the real component and pricing helpers; replace only the default
// network boundary. Vite environment variables do not exist in the Node runner.
(async()=>{
const compiled = await build({
  entryPoints: [require("node:path").resolve("src/pages/Contabilidad/Reportes/ReporteVuelosVendidos.tsx")],
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
  plugins: [{ name: "report-network-boundary", setup(plugin) {
    plugin.onResolve({ filter: /axiosInstance$/ }, () => ({ path: "api", namespace: "fixture" }));
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export default {};", loader: "js" }));
    plugin.onResolve({ filter: /\.scss$/ }, (args) => ({ path: args.path, namespace: "empty" }));
    plugin.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
  }}],
});
const componentModule = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(require("node:path").resolve("package.json")), componentModule, componentModule.exports);
const { ReporteVuelosVendidos } = componentModule.exports;
const act=React.act || legacyAct;
const button=(doc,text)=>[...doc.querySelectorAll("button")].find(b=>b.textContent.includes(text));
const fixture=()=>({total:26,quotes:20,assigned:0,unassigned:26,paid:0,partial:0,totals:[],rows:[{
  quote_id:"QUOTE-TEST",quote_title:"Viaje de prueba",service_id:1,day_number:2,source:"cotizacion_externa",travel_start:"2026-10-12",vouchers:[{id:1,code:"FILE-TEST",initialized:false}],
  quoted_catalog:{provider:"Vuelos",origin:"Internacional",type:"Otro"},is_assigned:false,moneda:"dolares",people_labels:{adults:[{nombres:"Persona",apellidos:"Prueba"}],children:[]},
  quoted_pricing:{total:250,count:2,uniform:false,average:125,warnings:[],beneficiaries:[{id:"adult:1",passenger_type:"adult",tariff:"adult",amount:100},{id:"adult:2",passenger_type:"adult",tariff:"adult",amount:150}]},
  payments:[],request_count:0,payment_status:"no_request"
}]});
async function mounted(api,verify) {
  const {window,document}=parseHTML('<html><body><div id="app"></div></body></html>');
  const old=Object.fromEntries(["window","document","HTMLElement","IS_REACT_ACT_ENVIRONMENT"].map(k=>[k,globalThis[k]]));
  Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(document.getElementById("app"));
  try {await act(async()=>root.render(React.createElement(ReporteVuelosVendidos,{api}))); await verify(document);} finally {await act(async()=>root.unmount()); for(const[k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
}
test("renders unassigned and unrequested sold flights with heterogeneous beneficiary amounts",async()=>{
  await mounted({get:async()=>({data:{data:fixture()}})},async doc=>{
    assert.match(doc.body.textContent,/QUOTE-TEST/); assert.match(doc.body.textContent,/Sin asignar/); assert.match(doc.body.textContent,/Sin solicitud/);
    assert.match(doc.body.textContent,/Extras sin fee/); assert.match(doc.body.textContent,/Persona Prueba/);
    assert.match(doc.body.textContent,/100[.,]00/); assert.match(doc.body.textContent,/150[.,]00/); assert.match(doc.body.textContent,/Promedio informativo/);
    assert.match(doc.body.textContent,/Origen sin registrar/); assert.match(doc.body.textContent,/No hay solicitud/);
  });
});
test("pagination and refresh always fetch live bounded results without cached deduplication",async()=>{
  const calls=[];await mounted({get:async(url,config)=>{calls.push({url,config});return {data:{data:fixture()}};}},async doc=>{
    await act(async()=>button(doc,"Siguiente").click()); assert.equal(calls.at(-1).config.params.page,2);
    await act(async()=>button(doc,"Actualizar").click()); assert.equal(calls.length,3);
    assert.equal(calls.at(-1).config._skipDedup,true);assert.equal(calls.at(-1).config.params.page_size,25);
    assert.equal(calls[0].config.signal.aborted,true);
  });
});
test("applying source filters resets pagination and sends the selected filter",async()=>{
  const calls=[]; await mounted({get:async(_,c)=>{calls.push(c);return {data:{data:fixture()}};}},async doc=>{
    await act(async()=>button(doc,"Siguiente").click());
    const select=doc.querySelector('[name="source"]');
    const props=select[Object.keys(select).find(k=>k.startsWith("__reactProps$"))];
    await act(async()=>props.onChange({target:{name:"source",value:"cotizacion_externa"}}));
    await act(async()=>doc.querySelector("form").dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true})));
    assert.equal(calls.at(-1).params.page,1); assert.equal(calls.at(-1).params.source,"cotizacion_externa");
  });
});
test("permission errors do not display old financial rows",async()=>{
  await mounted({get:async()=>{throw {response:{status:403}};}},async doc=>{
    assert.match(doc.querySelector('[role="alert"]').textContent,/No tienes permiso/); assert.equal(doc.querySelector("table"),null);
  });
});
test("unmount aborts pending read without starting any financial writes",async()=>{
  let signal; await mounted({get:(_,config)=>{signal=config.signal;return new Promise(()=>{});}},async doc=>{
    assert.match(doc.body.textContent,/Cargando vuelos/);
  }); assert.equal(signal.aborted,true);
});

test("summary-style cards keep original and assigned flight data and amounts separate",async()=>{
  const data=fixture(); const row=data.rows[0];
  row.is_assigned=true; row.assigned_moneda="PEN";
  row.assigned_catalog={provider:"Proveedor operativo",origin:"Nacional",type:"Económica",departure:"Lima",destination:"Cusco"};
  row.assigned_pricing={...row.quoted_pricing,total:900,uniform:true,beneficiaries:row.quoted_pricing.beneficiaries.map(p=>({...p,amount:450}))};
  await mounted({get:async()=>({data:{data}})},async doc=>{
    const card=doc.querySelector("article.sold-flight-card--external"); assert.ok(card); assert.equal(doc.querySelector("table"),null);
    const quoted=card.querySelector('[aria-label="Vuelo cotizado"]'); const assigned=card.querySelector('[aria-label="Vuelo asignado"]');
    assert.match(quoted.textContent,/Internacional/); assert.match(quoted.textContent,/USD 250/); assert.doesNotMatch(quoted.textContent,/Proveedor operativo/);
    assert.match(assigned.textContent,/Proveedor operativo/); assert.match(assigned.textContent,/Nacional/); assert.match(assigned.textContent,/PEN 900/);
    assert.equal(card.querySelectorAll(".sold-flight-card__beneficiary-items .sold-flights__person").length,2);
  });
});
test("large beneficiary lists have a compact preview without losing the full breakdown",async()=>{
  const data=fixture();const row=data.rows[0];
  row.quoted_pricing.beneficiaries=Array.from({length:7},(_,i)=>({id:`child:${i+1}`,passenger_type:"child",tariff:i===0?"child_as_adult":"child",amount:50}));
  row.quoted_pricing.count=7;
  await mounted({get:async()=>({data:{data}})},async doc=>{
    const card=doc.querySelector("article");assert.equal(card.querySelectorAll(".sold-flight-card__beneficiary-items .sold-flights__person").length,4);
    assert.match(card.querySelector(".sold-flight-card__more").textContent,/\+3/);
    assert.equal(card.querySelectorAll('.sold-flights__people [role="listitem"]').length,7);
    assert.ok(card.querySelector(".sold-flights__person--child"));assert.match(card.textContent,/Niño con tarifa adulto/);
    assert.ok(card.querySelector("details summary"));
  });
});

})().catch(error=>{console.error(error);process.exitCode=1;});
