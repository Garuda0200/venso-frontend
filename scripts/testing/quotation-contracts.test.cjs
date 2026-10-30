const test=require("node:test"),assert=require("node:assert/strict");
const {generate}=require("./export-quotation-contracts.cjs");
const catalog={agency:1,transport:{provider:2,service:3},ticket:4,tours:[{provider:5,service:6},{provider:5,service:7}]};
test("the production frontend pipeline emits a complete synthetic contract matrix",async()=>{
 const cases=await generate(catalog);
 assert.equal(cases.length,29);
 assert.equal(new Set(cases.map(item=>item.name)).size,29);
 for(const item of cases){
  const p=item.payload;
  assert.equal(p.agency_id,catalog.agency);
  assert.equal(p.pricing_snapshot.people.adults,item.people.adults.length);
  assert.equal(p.pricing_snapshot.people.children,item.people.children.length);
  assert.equal(p.total_final,item.reopenedPricing.total_final,item.name);
  assert.equal(p.subtotal_final,item.reopenedPricing.subtotal_final,item.name);
  assert.ok(Number.isFinite(p.total_final)&&p.total_final>=0,item.name);
  for(const day of p.itinerario) for(const service of day.servicios){
   assert.ok(!service.assignedParentId&&!service.isAssigned,item.name);
   assert.equal(service.moneda,"dolares",item.name);
   if(service.typeService==="tickets") assert.equal(service.tipoPrecio,"privado",item.name);
  }
  if(item.name.includes("days-2")){
   assert.equal(p.itinerario.length,2);
   const reduced=p.itinerario[1].servicios[0];
   assert.equal(reduced.beneficiariosAdultos.length,1);
   assert.equal(reduced.beneficiariosNinos.length,1);
  }
 }
});
test("free adults never erase a positive child price or resuscitate the free child",async()=>{
 const cases=await generate(catalog);
 for(const item of cases.filter(row=>row.name.includes("adult-free"))){
  const ticket=item.payload.itinerario[0].servicios.find(row=>row.typeService==="tickets");
  assert.equal(ticket.precioServicio,0,item.name);
  const prices=ticket.beneficiariosNinos.map(row=>Number(row.precio)).sort((a,b)=>a-b);
  assert.deepEqual(prices,[0,7.31],item.name);
  assert.ok(item.payload.total_final>0,item.name);
 }
});

test("focused contracts preserve external scope, child-only roster, package fee and manual courtesy",async()=>{
 const cases=await generate(catalog),byName=name=>cases.find(row=>row.name===name);
 const external=byName("external-without-fee").payload;
 assert.ok(external.total_final>external.subtotal_final);
 assert.equal(external.itinerario_externo.length,1);
 const children=byName("children-only-own-prices").payload;
 assert.equal(children.pricing_snapshot.people.adults,0);
 assert.equal(children.pricing_snapshot.people.children,2);
 assert.ok(children.total_final>0);
 assert.equal(byName("manual-zero-entire-service").payload.total_final,0);
 const imported=byName("package-import-current-roster-and-fee").payload;
 assert.equal(imported.additionalcosts.fee,"0.1");
 assert.equal(byName("two-tours-one-day").payload.itinerario[0].servicios.length,2);
});
