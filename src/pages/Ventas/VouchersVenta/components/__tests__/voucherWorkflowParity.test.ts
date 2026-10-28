import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { passengerDraftFingerprint, toVoucherPassengerSyncPayload, passengerRowsToDraft, mergeNominalRoster } from "../passengerDraft";
import { documentSnapshot, mergeConfirmedDocuments, persistVoucherDocuments } from "../../../../../services/voucherDocumentPersistence";
import { hydrateDocumentDraft, reconcileDocumentListing } from "../Steps/PassengerDocuments/documentListing";
import { canDeletePassengerDocument, hasPendingDocumentUploads } from "../Steps/PassengerDocuments/documentPermissions";
const draft=()=>({adults:[{id_pasajero:7,nombres:"PAX",nacionalidad:"Perú",correo:"pax@example.test",passenger_key:"adult-1"}],children:[]});
const pending=(id="local-1")=>({id,fileObject:{name:"ficticio.pdf"},filename:"ficticio.pdf",isPending:true,passengerId:7});
const documents=(docs:any[]=[pending()])=>({"adult-0":{passports:docs,idCards:[],otherDocuments:[]}});
const context=(data:any)=>({documentData:data,passengerData:draft(),quote:"fixture",voucher:12,code:"FIXTURE"});
const deps=(overrides:any={})=>({authorize:async()=>true,isCurrent:()=>true,
 legacyUpload:async()=>({tigrisUrl:"https://fixture.invalid/file",metadata:{originalName:"ficticio.pdf"}}),
 legacyFolder:()=>"fixtures",legacyProxy:url=>url,privateProxy:url=>url,legacyPayload:doc=>({filename:doc.filename}),
 legacyRegister:async()=>({success:true,data:{id:22,createdBy:"actor",canDelete:true,proxyUrl:"/fixture/22"}}),...overrides});
test("campos vaciados son cambios reales; revertirlos elimina el pendiente",()=>{
 const a=draft(),b=structuredClone(a);b.adults[0].correo="";
 assert.notEqual(passengerDraftFingerprint(a),passengerDraftFingerprint(b));
 b.adults[0].correo=a.adults[0].correo;assert.equal(passengerDraftFingerprint(a),passengerDraftFingerprint(b));
 const payload=toVoucherPassengerSyncPayload({adults:[{...a.adults[0],nombres:"",firstName:"antiguo"}],children:[]},"fixture");
 assert.equal(payload.adults[0].nombres,null);assert.equal(payload.adults[0].id_pasajero,7);
});
test("la respuesta nominal conserva identidades de adultos y niños",()=>{
 const data=passengerRowsToDraft([{id_pasajero:3,tipo_pasajero:"child"},{id_pasajero:4,tipo_pasajero:"adult"}]);
 assert.equal(data.children[0].id_pasajero,3);assert.equal(data.adults[0].id_pasajero,4);
 const legacy=passengerRowsToDraft([{id_pasajero:5,tipo_pasajero:null,passenger_key:"child-3"}]);
 assert.equal(legacy.children[0].id_pasajero,5);
});
test("vouchers antiguos recuperan el padrón completo sin inferir beneficiarios ni reemplazar identidades",()=>{
 const full=mergeNominalRoster([{id_pasajero:7,tipo_pasajero:"adult",nombres:"COTIZADO"},{id_pasajero:9,tipo_pasajero:"child",nombres:"NIÑO"}],draft());
 assert.equal(full.adults[0].nombres,"PAX");assert.equal(full.adults[0].id_pasajero,7);
 assert.equal(full.children[0].id_pasajero,9);assert.equal(full.children[0].nombres,"NIÑO");
});
test("el borrado guardado requiere canDelete confirmado; originales pendientes son retirables",()=>{
 for(const canDelete of [false,undefined,null]) assert.equal(canDeletePassengerDocument({dbId:3,canDelete}),false);
 assert.equal(canDeletePassengerDocument({dbId:3,canDelete:true}),true);
 assert.equal(canDeletePassengerDocument({dbId:3,documentAssetId:"protected",canDelete:true}),false);
 assert.equal(canDeletePassengerDocument(pending()),true);
});
test("carga confirmada conserva autoría y permiso y recién entonces libera el original",async()=>{
 const data=documents();assert.equal(hasPendingDocumentUploads(data),true);
 await persistVoucherDocuments(context(data),deps());const doc:any=data["adult-0"].passports[0];
 assert.equal(doc.dbId,22);assert.equal(doc.clientId,"local-1");assert.equal(doc.createdBy,"actor");assert.equal(doc.canDelete,true);
 assert.equal(doc.fileObject,undefined);assert.equal(hasPendingDocumentUploads(data),false);
});
test("autorización fallida no envía bytes ni registra documentos",async()=>{
 let uploads=0;const data=documents();await assert.rejects(persistVoucherDocuments(context(data),deps({authorize:async()=>false,legacyUpload:async()=>{uploads++;}})));
 assert.equal(uploads,0);assert.ok(data["adult-0"].passports[0].fileObject);
});
test("fallo del registro conserva el original y reintenta sin duplicar el upload",async()=>{
 let uploads=0,registrations=0;const data=documents();const services=deps({legacyUpload:async()=>{uploads++;return {tigrisUrl:"fixture-url",metadata:{originalName:"fixture"}};},
 legacyRegister:async()=>{registrations++;return registrations===1?{success:false}:{success:true,data:{id:22}};}});
 await assert.rejects(persistVoucherDocuments(context(data),services));assert.ok(data["adult-0"].passports[0].fileObject);
 await persistVoucherDocuments(context(data),services);assert.equal(uploads,1);assert.equal(registrations,2);
});
test("volver a pagos o documentos no vuelve a registrar documentos guardados",async()=>{
 let calls=0;await persistVoucherDocuments(context(documents([{dbId:3,isFromDatabase:true}])),deps({authorize:async()=>{calls++;}}));assert.equal(calls,0);
});
test("seis archivos sólo ejecutan dos cargas simultáneas",async()=>{
 let active=0,peak=0;const data=documents(Array.from({length:6},(_,i)=>pending(`file-${i}`)));
 await persistVoucherDocuments(context(data),deps({legacyUpload:async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;
 return {tigrisUrl:"fixture-url",metadata:{originalName:"fixture"}};}}));assert.equal(peak,2);assert.equal(hasPendingDocumentUploads(data),false);
});
test("cambiar de file durante el upload no registra la respuesta en otro modal",async()=>{
 let current=true,registered=0;const data=documents();await assert.rejects(persistVoucherDocuments(context(data),deps({isCurrent:()=>current,
 legacyUpload:async()=>{current=false;return {tigrisUrl:"fixture-url",metadata:{originalName:"fixture"}};},legacyRegister:async()=>{registered++;}})));
 assert.equal(registered,0);assert.ok(data["adult-0"].passports[0].fileObject);
});
test("una confirmación conserva los archivos añadidos durante el guardado",()=>{
 const current=documents([pending("a"),pending("b")]),processed=documentSnapshot(documents([pending("a")]));
 Object.assign(processed["adult-0"].passports[0],{dbId:22,id:22,clientId:"a",isFromDatabase:true});
 const merged=mergeConfirmedDocuments(current,processed);assert.equal(merged["adult-0"].passports.length,2);
 assert.equal(merged["adult-0"].passports[0].fileObject,undefined);assert.ok(merged["adult-0"].passports[1].fileObject);
});
test("el dueño explícito prevalece sobre la posición histórica",()=>{
 const roster=[{id_pasajero:7,passengerKey:"adult-0"}];const current=hydrateDocumentDraft(roster,{"adult-99":{passports:[{dbId:22,passengerId:7,proxyUrl:"/fixture"}]}},url=>url,url=>url);
 assert.equal(current.get("adult-0").passports.length,1);
 const result=reconcileDocumentListing(roster,current,{data:{passports:[{id:22,passengerId:7,canDelete:true,proxyUrl:"/fixture"}]}},url=>url);
 assert.equal(result.documents.get("adult-0").passports[0].canDelete,true);
});
test("gestiones dedicadas cierran sin guardado comercial ni sync de pasajeros",()=>{
 const source=readFileSync(resolve(process.cwd(),"src/pages/Ventas/VouchersVenta/components/VoucherModal/VoucherModal.tsx"),"utf8");
 assert.match(source,/if\(isPaymentsOnlyMode\)\{onSave\?\.\(\);onClose\(\);return;\}/);assert.match(source,/if\(isDedicatedManagement\) return;/);
 assert.match(source,/syncPassengersByVoucherVenta/);assert.match(source,/Guardar información de pasajeros/);assert.doesNotMatch(source,/passengersPayload.map|window.confirm/);
 const docs=readFileSync(resolve(process.cwd(),"src/pages/Ventas/VouchersVenta/components/Steps/PassengerDocuments/PassengerDocuments.tsx"),"utf8");
 assert.match(docs,/onDocumentsAdded\?\.\(\)/);assert.match(docs,/DocumentDeletePopover/);assert.doesNotMatch(docs,/window.confirm|useFileUpload/);
 assert.match(docs,/isDocumentAiUiEnabled\(import\.meta\.env\) && <PassengerIdentityModal/);
});
