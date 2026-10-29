import {resolve} from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { build } from "esbuild";
import { createRequire } from "node:module";

const stubs={
  contabilidadService:`export default {
    getMovementCurrencyCorrection:async()=>{const q=globalThis.__mcc;q.reads++;return {success:true,data:q.data};},
    previewMovementCurrencyCorrection:async(id,payload)=>{const q=globalThis.__mcc;q.previews.push({id,payload});await q.previewWait;return {success:true,data:q.preview};},
    correctMovementCurrency:async(id,payload)=>{const q=globalThis.__mcc;q.corrections.push({id,payload});if(q.failOnce&&q.corrections.length===1){const e=new Error('network');if(q.status)e.response={status:q.status,data:{message:'El saldo cambió'}};throw e;}await q.correctWait;return {success:true,data:{movement:{...q.data.movement,moneda:'dolares',monto:193.05,saldo_id:15},idempotent:q.corrections.length>1}};}
  };`,
  Modal:`export default function Modal(p){return <section role="dialog"><h2>{p.title}</h2>{p.children}{p.actions.map(a=><button type="button" key={a.label} disabled={a.disabled} onClick={a.onClick}>{a.label}</button>)}</section>;}`,
  "react-toastify":`export const toast={success:()=>globalThis.__mcc.success++,warning:()=>globalThis.__mcc.warnings++};`,
};
(async()=>{
const bundle=await build({entryPoints:["src/components/Contabilidad/MovementCurrencyCorrection.tsx"],bundle:true,write:false,platform:"node",format:"cjs",jsx:"automatic",external:["react","react/jsx-runtime","react-dom"],plugins:[{name:"test-boundaries",setup(p){
  p.onResolve({filter:/\.(css|scss)$/},()=>({path:"style",namespace:"stub"}));
  p.onResolve({filter:/.*/},a=>{const key=a.path==="react-toastify"?a.path:a.path.split('/').pop();return stubs[key]?{path:key,namespace:"stub"}:null;});
  p.onLoad({filter:/.*/,namespace:"stub"},a=>({loader:"jsx",contents:stubs[a.path]||""}));
}}]});
const mod={exports:{}};new Function("require","module","exports",bundle.outputFiles[0].text)(createRequire(resolve("package.json")),mod,mod.exports);
const Component=mod.exports.default;
const funds=[{id:14,tipo:"cuenta_debito",moneda:"soles",year_saldo:2026,saldo_actual:-579.15},{id:15,tipo:"cuenta_debito",moneda:"dolares",year_saldo:2026,saldo_actual:1000},{id:16,tipo:"efectivo",moneda:"dolares",year_saldo:2026,saldo_actual:500}];
async function withUi(options,verify){
  const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
  const keys=["window","document","HTMLElement","CustomEvent","IS_REACT_ACT_ENVIRONMENT","__mcc"];
  const saved=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
  const movement={id:398,moneda:"soles",tipo_cuenta:"cuenta_debito",monto:579.15,fecha:"2026-10-23",tipo_movimiento:"egreso"};
  const qa={reads:0,previews:[],corrections:[],success:0,warnings:0,failOnce:options.failOnce,status:options.status,data:{movement,funds,obligation:{currency:"USD",amount:"193.05"},eligible:options.eligible!==false,eligibility_reason:"Pago compartido",history:options.history||[]},preview:{expected_hash:"a".repeat(64),destination:{amount:"193.05",moneda:"dolares"},origin_fund:funds[0],destination_fund:funds[1],origin_balance_after:"0",destination_balance_after:"806.95"},...options.qa};
  if(options.delayPreview)qa.previewWait=new Promise(resolve=>qa.resolvePreview=resolve);
  if(options.delayCorrect)qa.correctWait=new Promise(resolve=>qa.resolveCorrect=resolve);
  Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,CustomEvent:window.CustomEvent,IS_REACT_ACT_ENVIRONMENT:true,__mcc:qa});
  const root=createRoot(document.getElementById("root"));
  const buttons=()=>[...document.querySelectorAll('button')];
  const click=async text=>React.act(async()=>{const b=buttons().find(b=>b.textContent===text);assert.ok(b,text);b.click();});
  const change=async(id,value)=>React.act(async()=>{const el=document.getElementById(id);assert.ok(el,id);el[Object.keys(el).find(k=>k.startsWith('__reactProps'))].onChange({target:{value}});});
  const choose=async()=>{await click('Corregir moneda y fondo');await click('$ Dólares');await change('mcc-fund','15');await change('mcc-reason','Se eligió una moneda incorrecta');};
  try {await React.act(async()=>root.render(React.createElement(Component,{movement,role:options.role??0,disabled:options.disabled,onSuccess:options.onSuccess})));await verify({qa,document,click,change,choose,buttons});}
  finally{await React.act(async()=>root.unmount());for(const k of keys){if(saved[k]===undefined)delete globalThis[k];else globalThis[k]=saved[k];}}
}

test('sólo role 0 puede abrir la corrección',async()=>{for(const role of [2,3,4])await withUi({role},async({qa,document})=>{assert.equal(document.querySelector('button'),null);assert.equal(qa.reads,0);});});
test('exige elegir moneda y fondo expresamente; USD no pide tasa si la obligación es USD',()=>withUi({},async({qa,document,click,change})=>{
  await click('Corregir moneda y fondo');assert.equal(document.getElementById('mcc-fund').value,'');
  await click('$ Dólares');assert.equal(document.getElementById('mcc-rate'),null);assert.equal(document.getElementById('mcc-fund').value,'');
  await change('mcc-fund','15');await click('Revisar ajuste');assert.equal(qa.previews[0].payload.saldo_id,15);assert.deepEqual(Object.keys(qa.previews[0].payload),['saldo_id']);
  assert.match(document.body.textContent,/806/);assert.equal(qa.corrections.length,0);
}));
test('confirma la operación con motivo y huella, conserva IDs y no envía un monto editable',()=>withUi({},async({qa,choose,click,document})=>{
  await choose();await click('Revisar ajuste');await click('Confirmar corrección');
  assert.equal(qa.corrections.length,1);assert.equal(qa.corrections[0].id,398);assert.equal(qa.corrections[0].payload.expected_hash,'a'.repeat(64));
  assert.equal(qa.corrections[0].payload.monto,undefined);assert.ok(qa.corrections[0].payload.idempotency_key);assert.equal(qa.success,1);assert.equal(document.querySelector('[role="dialog"]'),null);
}));
test('cambiar fondo después de la vista previa exige recalcular',()=>withUi({},async({choose,click,change,document})=>{
  await choose();await click('Revisar ajuste');assert.ok(document.querySelector('[aria-label="Vista previa de corrección"]'));
  await change('mcc-fund','16');assert.equal(document.querySelector('[aria-label="Vista previa de corrección"]'),null);assert.match(document.body.textContent,/Revisar ajuste/);
}));
test('una respuesta incierta se reintenta con el mismo cuerpo y clave',()=>withUi({failOnce:true},async({qa,choose,click,document})=>{
  await choose();await click('Revisar ajuste');await click('Confirmar corrección');assert.ok(document.querySelector('[role="alert"]'));
  assert.equal(document.getElementById('mcc-reason').closest('fieldset').hasAttribute('disabled'),true);
  await click('Reintentar confirmación');assert.deepEqual(qa.corrections[0],qa.corrections[1]);assert.equal(qa.success,1);
}));
test('un conflicto conserva el modal y exige nueva vista previa',()=>withUi({failOnce:true,status:409},async({qa,choose,click,document})=>{
  await choose();await click('Revisar ajuste');await click('Confirmar corrección');assert.equal(qa.success,0);
  assert.match(document.body.textContent,/El saldo cambió/);assert.equal(document.querySelector('[aria-label="Vista previa de corrección"]'),null);assert.ok(document.querySelector('[role="dialog"]'));
}));
test('un doble clic no duplica la confirmación',()=>withUi({delayCorrect:true},async({qa,choose,click,buttons})=>{
  await choose();await click('Revisar ajuste');
  await React.act(async()=>{const b=buttons().find(x=>x.textContent==='Confirmar corrección');b.click();b.click();});assert.equal(qa.corrections.length,1);
  await React.act(async()=>qa.resolveCorrect());assert.equal(qa.success,1);
}));
test('un fallo del refresco posterior no ofrece volver a guardar',()=>withUi({onSuccess:()=>{throw new Error('refresh');}},async({qa,choose,click,document})=>{
  await choose();await click('Revisar ajuste');await click('Confirmar corrección');assert.equal(qa.success,1);assert.equal(qa.warnings,1);assert.equal(document.querySelector('[role="dialog"]'),null);
}));
test('muestra historial y bloquea una corrección no elegible',()=>withUi({eligible:false,history:[{id:'h',actor_id:'admin',motivo:'Moneda equivocada',created_at:'2026-10-26T12:00:00Z',before:{monto:579.15,moneda:'soles'},after:{monto:193.05,moneda:'dolares'}}]},async({document,click,qa})=>{
  await click('Corregir moneda y fondo');assert.match(document.body.textContent,/Pago compartido/);assert.match(document.body.textContent,/Historial de correcciones/);assert.equal(qa.previews.length,0);assert.equal(document.getElementById('mcc-fund'),null);
}));

})().catch(error=>{console.error(error);process.exitCode=1;});
