import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {transformSync} from 'esbuild';
import * as passengerState from '../passengerPricingState';
import {cleanServiceForDB, hydrateServiceFromDB} from '../itinerarioCleanupUtils';
import {resolveTicketChildUnitPrice} from '../ticketBeneficiaries';
import {detectServiceType} from '../../components/DaysEditor/utils/serviceTypeMapper';
import {getServicePricingSnapshot} from '../servicePricingRuntime';
import {calculateDaySubtotalDetailed} from '../../components/DaysEditor/utils/priceCalculations';
import {updateServicePricesForPassengerChange} from '../unifiedServiceManager';
import {isOperationallyAssignedService, preserveOperationallyAssignedServices} from '../assignmentProtection';
import {pruneEmptyMutableTicketCohorts} from '../passengerPricingReconciliation';

// Execute the actual editor callbacks rather than a second implementation of
// conversion/reversion. Transpilation also removes the old commented callbacks.
const editorPath=path.resolve(process.cwd(),'src/components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/DaysEditor');
const editor=transformSync(readFileSync(editorPath+(existsSync(editorPath+'.tsx')?'.tsx':'.jsx'),'utf8'),{loader:'tsx',jsx:'preserve'}).code;
const externalPath=path.resolve(process.cwd(),'src/components/Ventas/Cotizaciones/EdicionCotizacion/components/ExternalItineraryEditor/ExternalItineraryEditor');
const external=transformSync(readFileSync(externalPath+(existsSync(externalPath+'.tsx')?'.tsx':'.jsx'),'utf8'),{loader:'tsx',jsx:'preserve'}).code;
const declaration=(source,name)=>{
 const start=new RegExp('^([ \\t]*)const '+name+' =','m').exec(source);
 assert.ok(start,'Missing callback '+name);
 const tail=source.slice(start.index+start[0].length);
 const end=new RegExp('^'+start[1]+'(?:const |return |\\};)','m').exec(tail);
 assert.ok(end,'Missing end of '+name);
 const closing=end[0].endsWith('};')?end[0].length:0;
 return source.slice(start.index,start.index+start[0].length+end.index+closing);
};
const helpers=['isChildPassengerId','isAdultPassengerId','dedupePassengerIdsBySlot','findPassengerIdBySlot',
 'removeChildSlotFromConvertedMap','removeChildSlotFromPriceMap','upsertChildPriceBySlot',
 'materializeChildInAssignedIds','cleanLegacyChildBeneficiaries'].map(name=>declaration(editor,name)).join('\n');
const adults=Array.from({length:4},(_,i)=>`adult:${i}:A${i+1}`);
const child='child:0:C1', otherChild='child:1:C2';
const ids=[...adults,child,otherChild];
const people={adults:adults.map(id=>({id,passenger_key:id})),children:[child,otherChild].map(id=>({id,passenger_key:id}))};
const fixture=()=>({id:'reversion-demo',typeService:'transportes',parentService:{typeService:'transportes',id:1},childService:{id:1,nro_pasajeros:8,capacidad:8},assignedPassengerIds:[...ids],assignedPassengerCount:6,
 assignedChildExplicitPriceMap:{[child]:0,[otherChild]:0},convertedChildToAdultMap:{},pricingMode:'fixed',precioAdultoDividido:true,precioServicio:79.70,
 pricingMetadata:{policy:'nominal_v2'},passengerSelection:{selectedIds:[...ids],preciosNinos:{[child]:0,[otherChild]:0}},
 tariff:{precio:19.925,precio_original:79.70,precio_original_with_child_extras:79.70,precio_adulto_dividido:true,moneda:'dolares'}});
const runMain=(initial,actions)=>{
 let days=[{numero:1,servicios:[structuredClone(initial)]}];
 const context={...passengerState,setDays:updater=>{days=updater(days)},exchangeRate:3.25,baseTcRef:{current:3.25},resolveTicketChildUnitPrice,detectServiceType,isSharedServicePrice:s=>Boolean(s.precioAdultoDividido??s.tariff?.precio_adulto_dividido)};
 for(const [name,id] of actions){
  const handler=new Function(...Object.keys(context),helpers+'\n'+declaration(editor,name)+'\nreturn '+name+';')(...Object.values(context));
  handler(0,0,id);
 }
 return days[0].servicios[0];
};
const roundTrip=service=>hydrateServiceFromDB(cleanServiceForDB(service));
const runExternal=(initial,actions)=>{
 let days=[{numero:1,servicios:[structuredClone(initial)]}];
 const context={...passengerState,useCallback:f=>f,setDays:updater=>{days=updater(days)},allPassengerIds:ids,
  normalizedPeopleDetails:people,updateServicePricesForPassengerChange,isOperationallyAssignedService,
  preserveOperationallyAssignedServices,pruneEmptyMutableTicketCohorts,detectServiceType,
  isSharedServicePrice:s=>Boolean(s.precioAdultoDividido??s.tariff?.precio_adulto_dividido)};
 const shared=['parseMoney','normalizeServicesForPeople','syncServicePassengerState','normalizeServiceForDisplay','updateServiceByIndex'].map(name=>declaration(external,name)).join('\n');
 for(const [name,id] of actions){
  const handler=new Function(...Object.keys(context),shared+'\n'+declaration(external,name)+'\nreturn '+name+';')(...Object.values(context));
  handler(0,0,id);
 }
 return days[0].servicios[0];
};
const assertRecipients=service=>{
 const quoted={...service,assignedPassengerIds:undefined,passengerSelection:undefined};
 const snapshot=passengerState.getServiceBeneficiarySnapshot(quoted);
 assert.equal(snapshot.adultIds.length,4,'All real adults must remain quoted beneficiaries');
 assert.equal(snapshot.childIds.length,2,'Both children must remain beneficiaries after reverting');
 assert.equal(snapshot.convertedEntries.length,0);
 const pricing=getServicePricingSnapshot(service);
 assert.equal(pricing.actualAdultCount,4);
 assert.equal(pricing.convertedChildCount,0);
 assert.equal(pricing.explicitChildTotal,0);
 assert.ok(Math.abs(pricing.total-79.70)<0.011);
};

test('DaysEditor: convertir y revertir mantiene los cuatro adultos y ambos niños gratis',()=>{
 const original=fixture(),before=JSON.stringify(original);
 const result=runMain(original,[['handleConvertChildToAdult',child],['handleRevertAdultToChild',child]]);
 assertRecipients(result);
 assert.equal(JSON.stringify(original),before,'No mutation of previous React state');
});

test('DaysEditor: tres conversiones y reversiones no acumulan ni pierden beneficiarios',()=>{
 const actions=Array.from({length:3},()=>[['handleConvertChildToAdult',child],['handleRevertAdultToChild',child]]).flat();
 const result=runMain(fixture(),actions);
 assertRecipients(result);assertRecipients(roundTrip(result));
});

test('DaysEditor: los precios diarios y los beneficiarios sobreviven guardar y recargar',()=>{
 const result=runMain(fixture(),[['handleConvertChildToAdult',child],['handleRevertAdultToChild',child]]);
 const saved=roundTrip(result);
 for(const service of [result,saved]){
  const totals=calculateDaySubtotalDetailed([service],people);
  assert.ok(Math.abs(totals.totalSubtotal-79.70)<0.011);
  assert.ok(totals.subtotalPerPerson>0,'Adult price cannot become entirely a service charge');
 }
});

test('itinerario externo: convertir, revertir y recargar conserva todos los beneficiarios',()=>{
 const result=runExternal(fixture(),[['handleConvertChildToAdult',child],['handleRevertAdultToChild',child]]);
 assertRecipients(result);assertRecipients(roundTrip(result));
});

test('itinerario principal y externo: revertir un niño respeta al otro que conserva tarifa adulta',()=>{
 for(const run of [runMain,runExternal]){
  const result=run(fixture(),[['handleConvertChildToAdult',child],['handleConvertChildToAdult',otherChild],['handleRevertAdultToChild',child]]);
  const snapshot=passengerState.getServiceBeneficiarySnapshot({...result,assignedPassengerIds:undefined,passengerSelection:undefined});
  assert.equal(snapshot.adultIds.length,4);assert.equal(snapshot.convertedEntries.length,1);
  assert.equal(snapshot.convertedEntries[0].childId,otherChild);assert.deepEqual(snapshot.childIds,[child]);
 }
});

test('sincronizar una edición no inventa adultos ni altera las asignaciones operativas',()=>{
 const operational=[{id:adults[0]}];
 const original={...fixture(),assignedPassengerIds:[],passengerSelection:{selectedIds:[]},assignedChildExplicitPriceMap:{},assignedBeneficiariosAdultos:operational};
 const result=passengerState.syncQuotedBeneficiariesFromRuntime(original);
 assert.deepEqual(result.beneficiariosAdultos,[]);assert.deepEqual(result.beneficiariosNinos,[]);
 assert.strictEqual(result.assignedBeneficiariosAdultos,operational);
 assert.equal(original.beneficiariosAdultos,undefined);
});
