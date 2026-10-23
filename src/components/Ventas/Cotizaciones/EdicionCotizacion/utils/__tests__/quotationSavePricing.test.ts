import test from "node:test";
import assert from "node:assert/strict";
import { buildQuotationSavePricing, resolveQuotationSavePricing, requiresSoldPriceConfirmation } from "../quotationSavePricing.js";
import { buildQuotationPricingSnapshotFromCotizacion } from "../quotationPricingSnapshot";
import { cleanItinerarioForDB, hydrateItinerarioFromDB } from "../itinerarioCleanupUtils.js";

const peopleDetails = { adults: [{id:101},{id:102},{id:103}], children: [] };
const service = (price=428.76, ids=[101,102,103]) => ({ id:1,typeService:"tickets",parentService:{typeService:"tickets"},childService:{},precioServicio:price,precioTotal:price*ids.length,precioAdultoDividido:false,beneficiariosAdultos:ids.map((id,i)=>({id:`adult:${i}:${id}`})),beneficiariosNinos:[],moneda:"dolares" });
const quote = (fee="9.1") => ({ peopleDetails,peopleCount:{adults:3,children:0},itinerario:[{numero:1,servicios:[service()]}],itinerario_externo:[],additionalCosts:{fee,feeMode:"percentage"},precio_it_adulto:428.76 });
const proof = q => buildQuotationSavePricing({parts:buildQuotationPricingSnapshotFromCotizacion(q).parts,peopleCount:q.peopleCount,additionalCosts:q.additionalCosts});

test("guardar incluye fee y redondea por pasajero; cero no equivale a 0.1",()=>{
  for(const [fee,total] of [["0",1287],["0.1",1290],["9.1",1404]]) assert.equal(resolveQuotationSavePricing(quote(fee)).total_final,total);
});
test("ignora todos los snapshots viejos en additionalCosts y el total explicito obsoleto",()=>{
  const q=quote();q.total_final=1290;q.subtotal_final=1290;
  q.additionalCosts={...q.additionalCosts,visibleSummaryGrandTotal:1290,summaryVisibleParts:proof(quote("0.1")).pricing_snapshot.parts};
  const saved=resolveQuotationSavePricing(q);assert.equal(saved.total_final,1404);assert.equal(saved.subtotal_final,1404);
});
test("rechaza snapshot directo incompatible con el fee actual",()=>{
  const q={...quote(),...proof(quote("0.1"))};assert.throws(()=>resolveQuotationSavePricing(q),/desactualizado/);
});
test("rechaza roster cambiado y version desconocida",()=>{
  const q={...quote(),...proof(quote())};q.peopleCount={adults:2,children:0};assert.throws(()=>resolveQuotationSavePricing(q),/pasajeros cambiaron/);
  q.pricing_snapshot.version=2;assert.throws(()=>resolveQuotationSavePricing(q),/Actualiza/);
});
test("no reconstruye un precio parcial cuando faltan contexto y total",()=>{
  assert.throws(()=>resolveQuotationSavePricing({precio_it_adulto:428.76,additionalcosts:{fee:"9.1",feeMode:"percentage"}}),/contexto/);
});
test("fee fijo y porcentual equivalente mantienen precio al guardar",()=>{
  const q=quote("39.02");q.additionalCosts.feeMode="fixed";assert.equal(resolveQuotationSavePricing(q).total_final,1404);
});
test("un precio cero explicito no resucita un total visual anterior",()=>{
  const q=quote("0");q.itinerario[0].servicios=[service(0)];q.precio_it_adulto=0;q.additionalCosts.visibleSummaryGrandTotal=999;
  assert.equal(resolveQuotationSavePricing(q).total_final,0);
});
test("hotel participa en fee; extras sin fee no participan",()=>{
  const result=buildQuotationSavePricing({peopleCount:{adults:2,children:0},additionalCosts:{fee:"25",feeMode:"percentage"},parts:[{audience:"adult",beneficiaries:2,services:100,hotel:20,external:50,additional:30,value:200,commissionableValue:150}]});
  assert.equal(result.total_final,400);assert.equal(result.subtotal_final,300);
});
test("niños con fee propio y gratuitos conservan identidad infantil",()=>{
  const result=buildQuotationSavePricing({peopleCount:{adults:1,children:2},additionalCosts:{fee:"25",feeMode:"percentage",applyFeeToChildren:false,childFee:"0",childFeeMode:"fixed"},parts:[{audience:"adult",beneficiaries:1,services:100,hotel:0,external:0,additional:25,value:125},{audience:"child",beneficiaries:1,services:20,hotel:0,external:0,additional:0,value:20},{audience:"child",beneficiaries:1,services:0,hotel:0,external:0,additional:0,value:0}]});
  assert.equal(result.total_final,145);assert.equal(result.pricing_snapshot.people.children,2);
});
test("beneficiarios parciales no se multiplican por todo el grupo",()=>{
  const q=quote("25");q.itinerario[0].servicios=[service(100,[101])];
  Object.assign(q.itinerario[0].servicios[0],{typeService:"guias",parentService:{typeService:"guias"},precioAdultoDividido:true});
  assert.equal(resolveQuotationSavePricing(q).total_final,125);
});
test("costos fijos y porcentuales se calculan sobre cada cohorte",()=>{
  const result=buildQuotationSavePricing({peopleCount:{adults:2,children:0},additionalCosts:{fee:10,feeMode:"fixed",operationalCosts:5,operationalMode:"percentage",extraFee:3},parts:[{audience:"adult",beneficiaries:1,services:100,hotel:0,external:20,additional:18,value:138},{audience:"adult",beneficiaries:1,services:200,hotel:0,external:0,additional:23,value:223}]});assert.equal(result.total_final,361);
});
test("cargos de servicio se suman una vez, sin inventar beneficiarios",()=>{
  const p=proof(quote());p.pricing_snapshot.parts.push({audience:"charge",isServiceCharge:true,beneficiaries:0,value:2.5,commissionableValue:2.5});assert.equal(resolveQuotationSavePricing({...quote(),...p}).total_final,1407);
});
test("rechaza NaN, negativos, modos y distribuciones invalidas",()=>{
  for(const fee of ["NaN",-1,Infinity]) assert.throws(()=>resolveQuotationSavePricing(quote(fee)));
  const q=quote();q.additionalCosts.feeMode="other";assert.throws(()=>resolveQuotationSavePricing(q));
  const p=proof(quote());p.pricing_snapshot.parts[0].beneficiaries=2.5;assert.throws(()=>resolveQuotationSavePricing({...quote(),...p}));
  const invalid=quote();invalid.additionalCosts=[];assert.throws(()=>resolveQuotationSavePricing(invalid));
  invalid.additionalCosts="9.1";assert.throws(()=>resolveQuotationSavePricing(invalid));
});
test("normaliza feeVal legado sin perderlo aunque fee sea null",()=>{
  const q=quote();q.additionalCosts={fee:null,feeVal:"9.1",feeMode:"percentage"};assert.equal(resolveQuotationSavePricing(q).total_final,1404);
});
test("crear, limpiar, reabrir y volver a guardar no altera el total",()=>{
  for(const fee of ["0","0.1","9.1","25"]){
    const q=quote(fee),first=proof(q);
    const reopened={...q,...first,itinerario:hydrateItinerarioFromDB(cleanItinerarioForDB(q.itinerario))};
    delete reopened.pricing_snapshot;
    assert.equal(resolveQuotationSavePricing(reopened).total_final,first.total_final);
  }
});

test("reapertura mixta: niño como adulto en guía, tarifa propia en ticket y extra sin fee",()=>{
  const adults=[{id:"adult:0:101"},{id:"adult:1:102"}], child={id:"child:0:201",precio:7};
  const q={peopleDetails:{adults:[{id:101},{id:102}],children:[{id:201,age:8}]},peopleCount:{adults:2,children:1},additionalCosts:{fee:"25",feeMode:"percentage"},precio_it_adulto:60,precio_it_ninos:47,precio_it_ext_adulto:40,precio_it_ext_ninos:20,
    itinerario:[{numero:1,servicios:[
      {id:1,typeService:"guias",parentService:{typeService:"guias"},precioServicio:120,precioAdultoDividido:true,beneficiariosAdultos:[...adults,{id:child.id,child_origin:child.id}],beneficiariosNinos:[]},
      {id:2,typeService:"tickets",parentService:{typeService:"tickets"},precioServicio:20,precioAdultoDividido:false,beneficiariosAdultos:adults,beneficiariosNinos:[child]}]}],
    itinerario_externo:[{numero:1,servicios:[{id:3,typeService:"vuelos",parentService:{typeService:"vuelos"},precioServicio:40,precioAdultoDividido:false,beneficiariosAdultos:adults,beneficiariosNinos:[{...child,precio:20}]}]}]};
  const first=resolveQuotationSavePricing(q);
  assert.equal(first.total_final,309);assert.equal(first.subtotal_final,209);
  const reopened={...q,...first,itinerario:hydrateItinerarioFromDB(cleanItinerarioForDB(q.itinerario)),itinerario_externo:hydrateItinerarioFromDB(cleanItinerarioForDB(q.itinerario_externo))};
  delete reopened.pricing_snapshot;
  assert.equal(resolveQuotationSavePricing(reopened).total_final,309);
});
test("crear no pide reconciliacion; venta cerrada pide confirmacion sólo si cambia",()=>{
  assert.equal(requiresSoldPriceConfirmation({tiene_voucher:false,total_final:1290},1404),false);
  assert.equal(requiresSoldPriceConfirmation({tiene_voucher:true,total_final:1290},1404),true);
  assert.equal(requiresSoldPriceConfirmation({tiene_voucher:true,total_final:1290},1290),false);
});

test("cotización sólo infantil no inventa un adulto al reconstruir sus precios", () => {
  const q = {
    peopleDetails: { adults: [], children: [{ id: 201, age: 8 }, { id: 202, age: 9 }] },
    peopleCount: { adults: 0, children: 2 }, cantidadpersonas: 2,
    additionalCosts: { fee: "25", feeMode: "percentage" },
    itinerario: [{ numero: 1, servicios: [{ ...service(0, []),
      beneficiariosNinos: [{ id: "child:0:201", precio: 20 }, { id: "child:1:202", precio: 0 }] }] }],
  };
  const saved = resolveQuotationSavePricing(q);
  assert.equal(saved.total_final, 25);
  assert.equal(saved.pricing_snapshot.people.adults, 0);
  assert.equal(saved.pricing_snapshot.people.children, 2);
});
