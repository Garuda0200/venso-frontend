import {buildReservationSummaryModel} from "../../pages/Reservas/VouchersReserva/utils/reservationSummaryModel";
import {buildHotelAssignmentService} from "../../pages/Reservas/VouchersReserva/utils/hotelAssignmentPricing";
import {buildAssignedFlatPricingState} from "../../pages/Reservas/VouchersReserva/components/ReservaServiceEditor/utils/editorHelpers";
import {canRemoveMovementEvidence} from "../../components/Contabilidad/utils/movementMediaPermissions";
import {groupQuotationHistory,versionPresentation,versionComparisonPair} from "../../pages/Ventas/Cotizaciones/utils/quotationHistoryPresentation";
import {canEditVentasVoucherPdfContent} from "../../utils/permissions";
import {applyConfirmedServicePayments,mergeConfirmedServicePayments} from "../../utils/confirmedServicePayments";
import {createRefreshCoordinator} from "../../utils/refreshCoordinator";
import {readWithRetry} from "../../utils/readWithRetry";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {createRoot} from "react-dom/client";
import {parseHTML} from "linkedom";
import {roomCapacity,defaultRoomCapacity,hotelOccupantId} from "../../utils/roomCapacity";
import {roomTariffPrice} from "../../utils/roomTariff";
import {assignHotelSlots} from "../../pages/Reservas/VouchersReserva/utils/hotelSlotAssignment";
import {hotelDestinationIds,hotelRoomSnapshot} from "../../pages/Reservas/VouchersReserva/utils/hotelAssignmentRooms";
import {normalizeServiceTime,getOperationalTime,updateServiceSchedule} from "../../utils/serviceSchedule";
import {assignmentUpdates} from "../../pages/Reservas/VouchersReserva/components/ServiceAssignmentModal/utils/assignmentSaveQueue";
import {registerFlightCodeDraft,flushFlightCodeDrafts} from "../../utils/flightCodeDrafts";
import ServiceTimeControls from "../../pages/Reservas/VouchersReserva/components/ReservaServiceEditor/components/ServiceTimeControls";
const quoted=(id,people)=>({id,typeService:"hoteles",beneficiariosAdultos:people.map(id=>({id})),beneficiariosNinos:[]});
const room=(people,dest)=>({typeService:"hoteles",childService:{capacidad:2},assignedPassengerSelection:{selectedIds:people},quotedHotelServiceIds:dest});
const hydrate=(quoted,room)=>({...quoted,isAssigned:true,assignedService:room,assignedPassengerSelection:room.assignedPassengerSelection});
test("aforo físico: capacidad histórica nula prevalece sobre catálogo y precio",()=>{
 assert.equal(roomCapacity({capacidad_ocupacion:null,capacidad:4}),null);
 assert.equal(roomCapacity({capacidad_ocupacion:2,capacidad:4}),2);
 assert.equal(roomCapacity({capacidad:2,tipo_unidad:"plaza"}),null);
 assert.equal(defaultRoomCapacity("Suite"),null);assert.equal(defaultRoomCapacity("Doble"),2);
 assert.equal(roomTariffPrice({precio_compartido:100,precio_privado:150},"privado"),150);
 assert.equal(roomTariffPrice({precio_compartido:100,precio_privado:0},"privado"),0);
 assert.equal(hotelOccupantId({id:"adult:0:777"}),"adult:1");
 assert.equal(hotelOccupantId({id:"adult:1",child_origin:"child:0:888"}),"child:1");
});
test("habitaciones: reordenar días conserva el destino por beneficiarios y no cambia lo cotizado",()=>{
 const days=[{servicios:[quoted(101,["adult:1","adult:2"]),quoted(102,["child:1"])]},{servicios:[quoted(202,["child:1"]),quoted(201,["adult:1","adult:2"])]}];
 const destinations=hotelDestinationIds(days,[0,1],101);assert.deepEqual(destinations,{0:"101",1:"201"});
 const updated=assignHotelSlots(days,[0,1],[room(["adult:0:777","adult:1:999"],destinations)],hydrate);
 assert.equal(updated[1].servicios[1].id,201);assert.equal(updated[0].servicios[0].isAssigned,true);
 assert.equal(days[0].servicios[0].isAssigned,undefined);assert.equal(updated[1].servicios[0],days[1].servicios[0]);
 assert.deepEqual(updated[0].servicios[0].beneficiariosAdultos,days[0].servicios[0].beneficiariosAdultos);
});
test("habitaciones: fallos en cualquier día no producen asignaciones parciales",()=>{
 const days=[{servicios:[quoted(101,["adult:1","adult:2"])]},{servicios:[quoted(201,["adult:1"])]}];const before=JSON.stringify(days);
 assert.throws(()=>assignHotelSlots(days,[0,1],[room(["adult:1","adult:2"])],hydrate),/pertenece|destino/);
 assert.equal(JSON.stringify(days),before);
 assert.throws(()=>assignHotelSlots(days,[0],[room(["adult:1","adult:2","adult:3"])],hydrate),/caben/);
});
test("habitaciones: pagos comprometidos, destinos ambiguos y dobles plazas se bloquean",()=>{
 const paid={...quoted(101,["adult:1"]),paymentRequest:{status:"pending"}};
 assert.throws(()=>assignHotelSlots([{servicios:[paid]}],[0],[room(["adult:1"])],hydrate),/pago/);
 assert.throws(()=>assignHotelSlots([{servicios:[quoted(101,["adult:1"]),quoted(102,["adult:1"])]}],[0],[room(["adult:1"])],hydrate),/destino/);
 const assigned={...quoted(103,["adult:1"]),isAssigned:true,assigned_beneficiarios_adultos:[{id:"adult:1"}]};
 assert.throws(()=>assignHotelSlots([{servicios:[assigned,quoted(104,["adult:1"])]}],[0],[room(["adult:1"])],hydrate),/otra habitación/);
 assert.equal(hotelRoomSnapshot({...assigned,assigned_capacidad_ocupacion:null,assignedChildService:{capacidad:4}}).capacity,null);
});
test("horarios: medianoche, borrado explícito y serialización sin campos comerciales",()=>{
 assert.equal(normalizeServiceTime("00:00"),"00:00");assert.equal(normalizeServiceTime("25:00"),null);
 const days=[{servicios:[{id:10,typeService:"trenes",isAssigned:true,hora_posterior:"10:00",assignedService:{hora:"07:00",hora_posterior:"10:00"},precioTotal:999}]}];
 const next=updateServiceSchedule(days,0,0,"hora_posterior",null);
 assert.equal(getOperationalTime(next[0].servicios[0],"hora_posterior"),null);
 const updates=assignmentUpdates(next,()=>({assigned_precio_total:10}));
 assert.equal(updates[0].hora_posterior,null);assert.equal(updates[0].hora,"07:00");assert(!("precioTotal" in updates[0]));
 assert.equal(days[0].servicios[0].hora_posterior,"10:00");
});
test("código de vuelo: el cierre espera los borradores y conserva el editor ante errores",async()=>{
 let calls=0;const unregister=registerFlightCodeDraft(123,async()=>{calls++;return false;});
 assert.equal(await flushFlightCodeDrafts([123,123]),false);assert.equal(calls,1);unregister();
 assert.equal(await flushFlightCodeDrafts([123]),true);
 const dispose=registerFlightCodeDraft(123,async()=>{throw Error("offline");});assert.equal(await flushFlightCodeDrafts([123]),false);dispose();
});
test("interfaz de tren: el interruptor retira la llegada guardada y conserva la partida",async()=>{
 const {window,document}=parseHTML('<html><body><div id="app"></div></body></html>');
 const keys=["window","document","HTMLElement","IS_REACT_ACT_ENVIRONMENT"];const old=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
 Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});const root=createRoot(document.getElementById("app"));
 const changes=[];
 try{
  await React.act(async()=>root.render(<ServiceTimeControls service={{typeService:"trenes",hora:"07:00",hora_posterior:"10:00"}} onChange={(...args)=>changes.push(args)}/>));
  assert(document.querySelector('input[aria-label="Hora de llegada"]'));
  await React.act(async()=>document.querySelector('[role="switch"]').click());
  assert.deepEqual(changes,[["hora_posterior",null]]);assert(!document.querySelector('input[aria-label="Hora de llegada"]'));
  assert.equal(document.querySelector('input[aria-label="Hora de partida"]').value,"07:00");
 }finally{await React.act(async()=>root.unmount());for(const[k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});

test("pago confirmado: una lectura vieja no revierte el estado ni se aplica a otro file",()=>{
 const confirmed={id:"request-1",itinerario_servicio_id:10,voucher_reserva_id:"VR-1",status:"paid",updated_at:"2026-10-28T10:00:00Z"};
 const old={...confirmed,status:"pending",updated_at:"2026-10-28T09:00:00Z"};
 assert.equal(mergeConfirmedServicePayments([confirmed],[old])[0].status,"paid");
 const days=[{servicios:[{id:10,paymentRequest:old}]}];
 assert.equal(applyConfirmedServicePayments(days,[confirmed],{reservationId:"VR-1"})[0].servicios[0].paymentRequest.status,"paid");
 assert.equal(applyConfirmedServicePayments(days,[confirmed],{reservationId:"VR-2"})[0].servicios[0].paymentRequest.status,"pending");
});
test("recargas: eventos simultáneos comparten lectura y ejecutan una actualización posterior",async()=>{
 const coordinate=createRefreshCoordinator();let done;let calls=0;
 const first=coordinate(async()=>{calls++;await new Promise(resolve=>done=resolve);});await Promise.resolve();
 const second=coordinate(async()=>{calls++;});assert.equal(first,second);assert.equal(calls,1);done();await first;assert.equal(calls,2);
});
test("reintentos: sólo GET transitorios; conflictos y cancelaciones no se reintentan",async()=>{
 let count=0;const value=await readWithRetry(async()=>{if(++count<3)throw {response:{status:503}};return 7;},{delay:async()=>{}});
 assert.equal(value,7);assert.equal(count,3);
 count=0;await assert.rejects(readWithRetry(async()=>{count++;throw {response:{status:409}};},{delay:async()=>{}}));assert.equal(count,1);
});

test("PDF: roles de consulta conservan descarga e idioma sin permiso de escritura",()=>{
 for(const role of [1,3,4,5])assert.equal(canEditVentasVoucherPdfContent({role}),false);
 assert.equal(canEditVentasVoucherPdfContent({role:0}),true);assert.equal(canEditVentasVoucherPdfContent({role:"2"}),true);
});
test("historial: anteriores al cierre se consultan y el motivo enlaza respaldo con resultado",()=>{
 const context={reason:"Cambio de hotel",status:"CONSUMED",backup_version_id:2,result_version_id:4};
 const versions=[{id:1,version_number:1,phase:"DRAFT"},{id:2,version_number:2,phase:"POST_SALE",edit_context:context},{id:3,version_number:3,phase:"POST_SALE"},{id:4,version_number:4,phase:"POST_SALE",edit_context:context}];
 const grouped=groupQuotationHistory(versions,true);assert.deepEqual(grouped.preSale.map(r=>r.id),[1]);
 const presentation=versionPresentation(versions[3]);assert.equal(presentation.title,"Cambio de hotel");assert.equal(presentation.result,true);
 const pair=versionComparisonPair(versions[3],versions);assert.equal(pair.before.id,2);assert.equal(pair.after.id,4);
});

test("hotel PEN: tarifa nativa compartida y privada no se reconvierte al asignar",()=>{
 const people={adults:[{id:1},{id:2}],children:[{id:3}]};
 const selection={selectedIds:["adult:0:1","adult:1:2","child:0:3"],convertedChildToAdultMap:{"child:0:3":true},pricingMode:"adult"};
 const tariff={moneda:"soles",tasa_cambio:3,precio_compartido:150,precio_privado:60};
 for (const [mode,unit,total] of [["compartido",50,150],["privado",60,180]]){
  const service=buildHotelAssignmentService({id_hotel:1,typeService:"hoteles"},{id_habitacion:1,capacidad:3},{...tariff,tipoPrecio:mode},people,selection);
  assert.equal(service.assignedMoneda,"soles");assert.equal(service.tariff.precio,unit);assert.equal(service.tariff.precio_original,total);
  const flat=buildAssignedFlatPricingState({tariff:service.tariff,passengerSelection:selection,tipoPrecio:mode});
  assert.equal(flat.assignedPrecioTotal,total);assert.equal(flat.assignedBeneficiariosAdultos.length,3);
  assert.equal(flat.assignedBeneficiariosAdultos[2].child_origin,"child:0:3");
 }
});
test("evidencias: el autor controla retiro en editor especializado sin ampliar otros permisos",()=>{
 const file={existingId:7,created_by:"author"};
 assert.equal(canRemoveMovementEvidence(file,0,"different"),false);
 assert.equal(canRemoveMovementEvidence(file,2,"author"),true);
 assert.equal(canRemoveMovementEvidence(file,2),false);
});

test("resumen de Reservas: USD comercial y PEN operativo quedan separados, sin margen inventado",()=>{
 const quoted={id:91,typeService:"extras",parentService:{typeService:"extras"},childService:{nombre:"QA"},moneda:"dolares",precioServicio:10,precioTotal:20,tipoPrecio:"privado",beneficiariosAdultos:[{id:"adult:1"},{id:"adult:2"}],beneficiariosNinos:[],tariff:{precio:10,precio_original:20,moneda:"dolares"}};
 const assigned={...quoted,isAssigned:true,assigned_parent_id:1,assigned_child_id:1,assignedMoneda:"soles",assigned_moneda:"soles",assignedPrecioServicio:12,assignedPrecioTotal:24,assigned_tipo_precio:"privado",assigned_beneficiarios_adultos:quoted.beneficiariosAdultos,assigned_beneficiarios_ninos:[],assignedTariff:{precio:12,precio_original:24,moneda:"soles"}};
 const model=buildReservationSummaryModel({cotizacion:{titulo:"QA",peopleCount:{adults:2,children:0}},quotedItinerary:[{numero:1,servicios:[quoted]}],assignedItinerary:[{numero:1,servicios:[assigned]}],peopleDetails:{adults:[{id:1},{id:2}],children:[]}});
 assert.equal(model.days[0].services[0].quotedPricing.currency,"USD");
 assert.equal(model.days[0].services[0].assignedPricing.currency,"PEN");
 assert.equal(model.totals.margin,null);assert.equal(model.days[0].services[0].difference,null);
 assert.equal(model.totals.assignedTotalsByCurrency.PEN,24);
});
