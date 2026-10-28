import test from "node:test";
import assert from "node:assert/strict";
import { resolveTicketAdultUnitPrice } from "../ticketBeneficiaries";
import { cleanDayForDB, hydrateDayFromDB } from "../itinerarioCleanupUtils";
import { getServicePricingSnapshot, applyServicePricingRuntime } from "../servicePricingRuntime";
import { resolveQuotationSavePricing } from "../quotationSavePricing";

const peopleDetails={adults:Array.from({length:5},(_,i)=>({id:`T${i+1}`,pais:"Colombia"})),children:[]};
const ids=peopleDetails.adults.map((p,i)=>`adult:${i}:${p.id}`);
for(const scope of ["itinerario","itinerario_externo"]) for(const price of [25.33,70,0]) {
 test(`${scope}: entrada editada a ${price} prevalece sobre el catálogo al guardar y reabrir`,()=>{
  let service={id:"edited-ticket",typeService:"tickets",parentService:{id:1,typeService:"tickets"},
   childService:{id:2,entrada:"CIRCUITO 2 RUTA 2-B",procedencia:"extranjero",tipo_usuario:"adulto",ticketAdultUnitPrice:56,ticketAdultRate:{id:2,precio:56}},
   ticketAdultUnitPrice:56,ticketProcedenciaFilter:"extranjero",ticketPassengerTargetGroup:"adult",ticketChildPricingMode:"none",
   assignedPassengerIds:ids,assignedPassengerCount:5,
   beneficiariosAdultos:ids.map(id=>({id})),beneficiariosNinos:[],
   precioServicio:price,precioTotal:Math.round(price*500)/100,tipoPrecio:"privado",
   passengerSelection:{selectedIds:ids,ticketProcedenciaFilter:"extranjero",ticketPassengerTargetGroup:"adult"},
   tariff:{precio:price,precio_original:Math.round(price*500)/100,moneda:"dolares",tipo_precio:"privado"}};
  const quote={peopleDetails,peopleCount:{adults:5,children:0},additionalCosts:{fee:"25",feeMode:"percentage"},itinerario:[],itinerario_externo:[],[scope]:[{numero:1,servicios:[service]}]};
  const before=resolveQuotationSavePricing(quote);
  for(let attempt=0;attempt<3;attempt++){
   assert.equal(resolveTicketAdultUnitPrice(service),price);
   const saved=cleanDayForDB({numero:1,servicios:[service]});
   assert.equal(saved.servicios.length,1);
   assert.equal(saved.servicios[0].precioServicio,price);
   service=hydrateDayFromDB(saved).servicios[0];
   assert.equal(getServicePricingSnapshot(service).total,Math.round(price*500)/100);
   const after=resolveQuotationSavePricing({...quote,[scope]:[{numero:1,servicios:[service]}]});
   assert.equal(after.total_final,before.total_final);
  }
 });
}
test("tarifa estudiantil con edición infantil manual respeta el importe explícito",()=>{
 const service=applyServicePricingRuntime({typeService:"tickets",parentService:{typeService:"tickets"},
   childService:{tipo_usuario:"estudiante"},ticketChildPricingMode:"manual",tipoPrecio:"privado",
   assignedPassengerIds:["child:0:C1"],assignedChildExplicitPriceMap:{"child:0:C1":7},
   passengerSelection:{selectedIds:["child:0:C1"],ticketChildPricingMode:"manual"},
   tariff:{precio:30,precio_original:0,moneda:"dolares"}});
 assert.equal(getServicePricingSnapshot(service).amountPerChild,7);
});
