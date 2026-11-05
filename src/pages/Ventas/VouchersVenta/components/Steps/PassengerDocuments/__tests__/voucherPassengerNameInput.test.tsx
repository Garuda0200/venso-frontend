import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {createRoot} from "react-dom/client";
import {parseHTML} from "linkedom";
import {build} from "esbuild";
import {createRequire} from "node:module";

// Keep the real VoucherModal, PassengerStep and draft/sync helpers. Only API
// boundaries and unrelated step interfaces are synthetic.
const mocks = {
  secureStorage:'export default {getItem:key=>key==="userRole"?2:"fixture"};',
  axiosInstance:'export default {post:async()=>({data:{}})};',
  useFileUpload:'export default ()=>({uploadFile:async()=>{throw Error("Unexpected upload")}});',
  presignedUrlService:'export const makeProxyUrlAbsolute=x=>x;export const getProxyUrl=x=>x;',
  documentAiService:'export const getDocumentAiService=()=>({capabilities:async()=>({enabled:false})});',
  voucherDocumentService:'const service={getDocumentsByVoucherId:async()=>({success:true,data:{passports:[],idCards:[],otherDocuments:[]}})};export {service as voucherDocumentService};export default service;',
  cotizacionService:'export const getCotizacionById=async()=>f.quote;',
  pasajeroService:`export default {getPassengersByCotizacion:async()=>f.rows,getPassengersByVoucherVenta:async()=>f.rows,syncPassengersByVoucherVenta:async(id,payload)=>{f.syncs.push({id,payload});f.rows=[...payload.adults.map((p,i)=>({...p,id_pasajero:p.id_pasajero||i+1,tipo_pasajero:'adult'})),...payload.children.map((p,i)=>({...p,id_pasajero:p.id_pasajero||i+10,tipo_pasajero:'child'}))];return f.rows;}};`,
  voucherVentaService:`export const voucherVentaService={getVoucherWithCotizacionById:async()=>({success:true,data:{id:7,voucher_code:'NAME-FILE',cotizacion_id:f.quote.id,cotizacion_data:f.quote,status:'draft'}}),createVoucher:async payload=>{f.creates.push(payload);return {success:true,data:{id:7,voucher_code:payload.voucher_code}}},updateVoucher:async()=>({success:true,data:{id:7}})};`,
  userService:'export const getUsers=async()=>({accounts:[]});',
  PassengerDocuments:'export default ()=> <div data-test-documents="true">Documentos de prueba</div>;',
  PaymentStep:'export default ()=> <div>Pagos de prueba</div>;',
  ConfirmationStep:'export default ()=> <div>Confirmación de prueba</div>;',
};
async function loadVoucherModal() {
const bundle=await build({entryPoints:["src/pages/Ventas/VouchersVenta/components/VoucherModal/VoucherModal.tsx"],bundle:true,write:false,format:"cjs",platform:"node",jsx:"automatic",packages:"external",define:{"import.meta.env":"{}"},plugins:[{name:"passenger-name-fixtures",setup(p){
  p.onResolve({filter:/\.(scss|css)$/},()=>({path:"style",namespace:"fixture"}));
  p.onResolve({filter:/.*/},a=>{const key=a.path.split('/').pop().replace(/\.(jsx?|tsx?|mjs)$/,'');return mocks[key]?{path:key,namespace:"fixture"}:null;});
  p.onLoad({filter:/.*/,namespace:"fixture"},a=>({loader:"jsx",resolveDir:process.cwd(),contents:`const f=new Proxy({},{get:(_,key)=>globalThis.__passengerNameFixture[key],set:(_,key,value)=>(globalThis.__passengerNameFixture[key]=value,true)});\n${mocks[a.path] || "export default {};"}`}));
}}]});
const mod={exports:{}};new Function("require","module","exports",bundle.outputFiles[0].text)(createRequire(process.cwd() + '/package.json'),mod,mod.exports);
return mod.exports.default;
}

async function withVoucher({edit=false,names="",rows=null}={},verify){
  const VoucherModal=await loadVoucherModal();
  const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
  const keys=["window","document","HTMLElement","CustomEvent","IS_REACT_ACT_ENVIRONMENT","__passengerNameFixture"];
  const old=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  const f={quote:{id:"SYNTHETIC-QUOTE",platform:"venso",business_type:"B2C",total_final:100},rows:[{id_pasajero:1,tipo_pasajero:"adult",nombres:names,apellido_paterno:"Prueba",edad:30},{id_pasajero:2,tipo_pasajero:"child",nombres:"",edad:8}],syncs:[],creates:[],closed:0};
  if (rows) {
    f.rows = structuredClone(rows);
    f.quote.cantidadpersonas = rows.length;
  }
  Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,CustomEvent:window.CustomEvent,IS_REACT_ACT_ENVIRONMENT:true,__passengerNameFixture:f});
  const root=createRoot(document.getElementById("root"));const previousLog=console.log;console.log=()=>{};
  const change=async(selector,value)=>React.act(async()=>{const input=document.querySelector(selector);assert(input,selector);input[Object.keys(input).find(k=>k.startsWith("__reactProps"))].onChange({target:{value}});});
  const click=async element=>React.act(async()=>{assert(element);element.click();});
  try{
    await React.act(async()=>root.render(React.createElement(VoucherModal,{isOpen:true,onClose:()=>f.closed++,onSave:()=>{},cotizacionData:f.quote,voucherData:edit?{id:7,voucher_code:"NAME-FILE"}:null,isEditMode:edit,isPassengerInfoEditMode:edit})));
    await verify({document,f,change,click});
  }finally{await React.act(async()=>root.unmount());console.log=previousLog;for(const key of keys){if(old[key]===undefined)delete globalThis[key];else globalThis[key]=old[key];}}
}

for(const edit of [false,true])test(`VoucherModal ${edit?"edición":"creación"}: escribir espacio entre nombres y apellidos conserva el borrador`,async()=>withVoucher({edit},async({document,change})=>{
  for(const value of ["Juan","Juan ","Juan C","Juan Carlos"]){
    await change('[placeholder="Nombres"]',value);assert.equal(document.querySelector('[placeholder="Nombres"]').value,value);
  }
  for(const field of ["Apellido paterno","Apellido materno"]){
    for(const value of ["De","De ","De La","De La ","De La Cruz"]){
      await change(`[placeholder="${field}"]`,value);assert.equal(document.querySelector(`[placeholder="${field}"]`).value,value);
    }
  }
}));

test("los niños admiten nombres compuestos y cambiar de pasajero conserva lo escrito",async()=>withVoucher({},async({document,change,click})=>{
  await change('[placeholder="Nombres"]',"Juan ");await click(document.querySelector('.passenger-list-item.child'));
  for(const value of ["María","María ","María José"]){await change('[placeholder="Nombres"]',value);assert.equal(document.querySelector('[placeholder="Nombres"]').value,value);}
  await click(document.querySelector('.passenger-list-item.adult'));assert.equal(document.querySelector('[placeholder="Nombres"]').value,"Juan ");
}));

for(const edit of [false,true])test(`guardar al ${edit?"editar":"crear"} conserva palabras y limpia sólo bordes`,async()=>withVoucher({edit},async({document,f,change,click})=>{
  await change('[placeholder="Nombres"]',"  José Luis  ");await change('[placeholder="Apellido paterno"]',"  De La Cruz  ");
  await change('[placeholder="Apellido materno"]',"  Del Río  ");
  if(edit){
    const save=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Guardar información de pasajeros'));await click(save);
  }else{
    await change('#voucher-code-header',"SPACE-FILE");await click(document.querySelector('.voucher-modal-footer .next-button'));
    assert(document.querySelector('[data-test-documents="true"]'));
    await click(document.querySelector('.voucher-modal-footer .prev-button'));
    assert.equal(document.querySelector('[placeholder="Nombres"]').value,"José Luis");
  }
  assert.equal(f.syncs.length,1);const saved=f.syncs[0].payload.adults[0];assert.equal(saved.nombres,"José Luis");
  assert.equal(saved.apellidos,"De La Cruz Del Río");
  assert.equal(saved.id_pasajero,1);
}));

test("espacios de borde no crean avisos falsos de cambios y revertir el nombre quita Guardar",async()=>withVoucher({edit:true,names:"Juan Carlos"},async({document,change,click,f})=>{
  const save=()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Guardar información de pasajeros'));
  assert.equal(save(),undefined);await change('[placeholder="Nombres"]',"Juan Carlos Alberto");assert(save());
  await change('[placeholder="Nombres"]',"Juan Carlos ");assert.equal(document.querySelector('[placeholder="Nombres"]').value,"Juan Carlos ");assert.equal(save(),undefined);
  await click(document.querySelector('.voucher-modal-header .close-button'));assert.equal(f.closed,1);assert.equal(document.querySelector('.unsaved-changes-warning'),null);
}));


for (const kind of ["adult", "child"]) {
  test(`postventa: la ficha real muestra el ${kind} agregado aunque el resumen anterior tenía dos pasajeros`, async () => {
    const rows = [
      {id_pasajero:1,tipo_pasajero:"adult",passenger_key:"adult-1",voucher_venta_id:7,nombres:"Primera",edad:"30"},
      {id_pasajero:2,tipo_pasajero:"adult",passenger_key:"adult-2",voucher_venta_id:7,nombres:"Segunda",edad:"40"},
      {id_pasajero:3,tipo_pasajero:kind,passenger_key:kind === "adult" ? "adult-3" : "child-1",cotizacion_id:"SYNTHETIC-QUOTE",voucher_venta_id:null,edad:kind === "adult" ? "35" : "8"},
    ];
    await withVoucher({edit:true,rows}, async ({document,f,click,change}) => {
      const cards = document.querySelectorAll(".passenger-list-item");
      assert.equal(cards.length, 3);
      assert.equal(document.querySelectorAll(".passenger-list-item.adult").length, kind === "adult" ? 3 : 2);
      await click(cards[2]);
      await change('[placeholder="Nombres"]', "Pasajero agregado");
      await click([...document.querySelectorAll("button")].find(button => button.textContent.includes("Guardar información de pasajeros")));
      assert.equal(f.syncs.length, 1);
      assert.equal(f.syncs[0].payload.adults.length + f.syncs[0].payload.children.length, 3);
      const added = [...f.syncs[0].payload.adults, ...f.syncs[0].payload.children].find(passenger => passenger.id_pasajero === 3);
      assert.equal(added.nombres, "Pasajero agregado");
    });
  });
}
