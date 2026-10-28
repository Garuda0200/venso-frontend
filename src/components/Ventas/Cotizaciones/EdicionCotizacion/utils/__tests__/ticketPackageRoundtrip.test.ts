import test from 'node:test';
import assert from 'node:assert/strict';
import {hydrateItinerarioFromDB,cleanItinerarioForDB} from '../itinerarioCleanupUtils';
import {buildServiceBeneficiaryPricingLedger} from '../serviceBeneficiaryPricingLedger';

const people={adults:[{id:1},{id:2}],children:[{id:101,age:8},{id:102,age:10}]};
for(const tipoUsuario of ['adulto','estudiante']) for(const childPrice of [0,7,12]) {
 test(`entrada ${tipoUsuario}: el importe infantil manual ${childPrice} sobrevive al guardado`,()=>{
  const days=hydrateItinerarioFromDB([{numero:1,servicios:[{
   id:300,typeService:'tickets',parentService:{typeService:'tickets'},
   childService:{ticket:{id_ticket:1,entrada:'Entrada de prueba',procedencia:'extranjero',tipo_usuario:tipoUsuario}},
   precioServicio:24,precioTotal:(tipoUsuario==='adulto'?48:0)+childPrice,tipoPrecio:'privado',
   beneficiariosAdultos:tipoUsuario==='adulto'?[{id:'adult:0:1'},{id:'adult:1:2'}]:[],
   beneficiariosNinos:[{id:'child:0:101',precio:childPrice}]
  }]}]);
  days[0].servicios[0].ticketChildPricingMode='manual';
  days[0].servicios[0].ticketChildrenUseStudentTariffAsAdult=false;
  const before=buildServiceBeneficiaryPricingLedger({days,peopleDetails:people});
  const total=(ledger,id)=>(ledger.byPassenger.get(id)||[]).reduce((sum,item)=>sum+item.amount,0);
  assert.equal(total(before,'child:1'),childPrice);
  const flat=cleanItinerarioForDB(days);
  const childPool=flat[0].servicios.reduce((sum,s)=>sum+
   s.beneficiariosAdultos.filter(b=>b.child_origin).length*s.precioServicio+
   s.beneficiariosNinos.reduce((subtotal,b)=>subtotal+b.precio,0),0);
  assert.equal(childPool,childPrice);
  const after=buildServiceBeneficiaryPricingLedger({days:hydrateItinerarioFromDB(flat),peopleDetails:people});
  assert.equal(after.complete,true);
  for(const id of ['adult:1','adult:2','child:1','child:2']) assert.equal(total(after,id),total(before,id));
 });
}
test('separar entrada adulta y estudiante crea una identidad nueva sin heredar el pago',()=>{
 const service={id:333,versionUid:'00000000-0000-4000-8000-000000000333',typeService:'tickets',
  parentService:{id:1,typeService:'tickets'},childService:{id_ticket:2,entrada:'Entrada',procedencia:'extranjero',tipo_usuario:'adulto',
   ticketAdultRate:{id_ticket:2,entrada:'Entrada',procedencia:'extranjero',tipo_usuario:'adulto',precio:24},
   ticketChildRate:{id_ticket:3,entrada:'Entrada',procedencia:'extranjero',tipo_usuario:'estudiante',precio:12}},
  tipoPrecio:'privado',tariff:{precio:24,precio_original:48,moneda:'dolares'},
  assignedPassengerIds:['adult:0:1','adult:1:2','child:0:101'],
  assignedChildExplicitPriceMap:{'child:0:101':12},
  passengerSelection:{selectedIds:['adult:0:1','adult:1:2','child:0:101'],preciosNinos:{'child:0:101':12}},
  beneficiariosAdultos:[{id:'adult:0:1'},{id:'adult:1:2'}],beneficiariosNinos:[{id:'child:0:101',precio:12}],
  isAssigned:true,assignedParentId:77,assignedTariff:{precio:777,precio_original:777,moneda:'soles'},
  assignedTipoPrecio:'privado',assignedService:{id:77},paymentRequest:{id:'historical'},isPaid:true};
 const flat=cleanItinerarioForDB([{numero:1,servicios:[service]}])[0].servicios;
 assert.equal(flat.length,2);
 assert.equal(flat[0].id,333);assert.equal(flat[0].isAssigned,true);
 assert.equal(flat[1].id,undefined);assert.equal(flat[1].versionUid,undefined);
 assert.equal(flat[1].isAssigned,false);assert.equal(flat[1].assignedParentId,undefined);
 assert.equal(flat[1].assignedPrecioServicio,undefined);
 const after=buildServiceBeneficiaryPricingLedger({days:hydrateItinerarioFromDB([{numero:1,servicios:flat}]),peopleDetails:people});
 assert.equal(after.byPassenger.get('child:1')[0].amount,12);
});
