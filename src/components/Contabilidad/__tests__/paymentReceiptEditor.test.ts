import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {createRoot} from "react-dom/client";
import {parseHTML} from "linkedom";
import {build} from "esbuild";
import {createRequire} from "node:module";
const act=React.act;
(async()=>{
const bundle=await build({entryPoints:["src/components/Contabilidad/PaymentReceiptEditor.tsx"],bundle:true,write:false,format:"cjs",platform:"node",jsx:"automatic",loader:{'.scss':'empty'},external:["react","react/jsx-runtime","react-dom"],plugins:[{name:"receipt-boundaries",setup(p){
  p.onResolve({filter:/MovementCurrencyCorrection$/},()=>({path:"currency",namespace:"currency-stub"}));
  p.onLoad({filter:/.*/,namespace:"currency-stub"},()=>({loader:"jsx",contents:"export default function Currency(){return null;}"}));
  p.onResolve({filter:/(contabilidadService|vouchersPagosService|FileDropZone|PaymentReceiptFields|\/Modal)$/},a=>({path:a.path.split("/").pop(),namespace:"stub"}));
  p.onResolve({filter:/^react-toastify$/},()=>({path:"toast",namespace:"stub"}));
p.onLoad({filter:/.*/,namespace:"stub"},a=>({loader:"jsx",contents:a.path==="toast"?'export const toast={success:()=>{}};':a.path==="contabilidadService"?'export default {patchPaymentReceipt:async(id,patch)=>{globalThis.__receiptQa.metadata.push({id,patch});return {success:true,data:{...globalThis.__receiptQa.movement,metodo_pago:patch.metodo_pago??null,referencia_pago:patch.referencia_pago??null}};}};':a.path==="vouchersPagosService"?'export default {getByMovimientoId:async()=>globalThis.__receiptQa.load(),patchMovementEvidence:async(id,payload)=>{globalThis.__receiptQa.media.push({id,payload});return globalThis.__receiptQa.saveMedia();}};':a.path==="Modal"?'export default function Modal(p){return <div><button onClick={p.onClose}>Cerrar header</button>{p.children}{p.actions.map(a=><button key={a.label} onClick={a.onClick}>{a.label}</button>)}</div>;}':a.path==="PaymentReceiptFields"?'export default function Fields(p){return <div><input name="metodo_pago" value={p.values.metodo_pago} readOnly/><button type="button" onClick={()=>p.onChange({target:{name:"metodo_pago",value:"Transferencia"}})}>Cambiar método</button></div>;}':'export default function Files(p){return <div>{p.files.map((f,i)=><div key={i}>{f.filename}{p.canRemoveFile(f)&&<button type="button" onClick={()=>p.onFileRemove(i)}>Retirar {f.filename}</button>}</div>)}<button type="button" disabled={p.disabled} onClick={()=>p.onFilesAdded([{id:"pending",filename:"nuevo.pdf",fileObject:new Blob(["%PDF-"]),isPending:true}])}>Agregar archivo</button></div>;}'}));
}}]});
const mod={exports:{}};new Function("require","module","exports",bundle.outputFiles[0].text)(createRequire(require("node:path").resolve("package.json")),mod,mod.exports);
const Editor=mod.exports.default;
async function dom(role,run,load=async()=>({success:true,data:[{id:7,filename:"old.pdf",created_by:"00000000"}]})){
  const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
  const keys=["window","document","HTMLElement","CustomEvent","IS_REACT_ACT_ENVIRONMENT","__receiptQa"];
  const old=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
  const qa={metadata:[],media:[],closed:0,saved:[],load,saveMedia:async()=>({success:true,data:[{id:8,filename:"nuevo.pdf"}]}),movement:{id:42,metodo_pago:null,referencia_pago:null,referencia_voucher_venta:"1",monto:100}};
  Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,CustomEvent:window.CustomEvent,IS_REACT_ACT_ENVIRONMENT:true,__receiptQa:qa});
  const root=createRoot(document.getElementById("root"));
  try {
    await act(async()=>root.render(React.createElement(Editor,{isOpen:true,movement:qa.movement,role,actorId:role===0?'00000000':'22222222',onClose:()=>qa.closed++,onSuccess:v=>qa.saved.push(v)})));
    const click=async text=>act(async()=>[...document.querySelectorAll("button")].find(b=>b.textContent===text).click());
    await run(document,qa,click);
  }finally{await act(async()=>root.unmount());for(const[k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
}
test("editing receipt calls only metadata PATCH, preserves pending media, and does not close",async()=>{
  await dom(2,async(document,qa,click)=>{
    await click("Agregar archivo");await click("Cambiar método");
    await act(async()=>document.querySelector("form").dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true})));
    assert.equal(qa.metadata.length,1);assert.equal(qa.metadata[0].patch.metodo_pago,"Transferencia");
    assert(!("monto" in qa.metadata[0].patch));assert.equal(qa.media.length,0);assert.equal(qa.closed,0);
    assert.match(document.body.textContent,/nuevo.pdf/);
  });
});
test("author removal is staged and confirmed, cancel never deletes persisted evidence",async()=>{
  await dom(0,async(document,qa,click)=>{
    await click("Retirar old.pdf");assert.equal(qa.media.length,0);
    await click("Cancelar");assert.match(document.body.textContent,/old.pdf/);
    await click("Retirar old.pdf");await click("Confirmar retiro");assert.equal(qa.media.length,0);
    await click("Cerrar header");assert.equal(qa.closed,0);await click("Seguir editando");
    await click("Guardar evidencias");assert.equal(qa.media.length,1);
    assert.deepEqual(JSON.parse(qa.media[0].payload.get("changes")),{expected_ids:[7],remove_ids:[7]});
    assert.equal(qa.closed,0);
  });
});
test("sales cannot remove persisted evidence and failed loads keep media saving disabled",async()=>{
  await dom(2,async(document)=>assert(!document.body.textContent.includes("Retirar old.pdf")));
  await dom(2,async(document)=>{
    assert.match(document.body.textContent,/No se pudieron cargar/);
    assert([...document.querySelectorAll("button")].find(b=>b.textContent==="Guardar evidencias").disabled);
  },async()=>({success:false}));
});

})().catch(error=>{console.error(error);process.exitCode=1;});
