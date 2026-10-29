import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {createRoot} from "react-dom/client";
import {parseHTML} from "linkedom";
import {build} from "esbuild";
import {createRequire} from "node:module";
import {resolve} from "node:path";
import {assignHotelSlots} from "../../pages/Reservas/VouchersReserva/utils/hotelSlotAssignment";

const utils=resolve("src/components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/HotelItinerary/utils.ts").replaceAll("\\","/");
const stubs={
  axiosInstance:`export default {get:async path=>({data:path==='/turismo/hoteles'?globalThis.__rooms.hotels:globalThis.__rooms.fetchRooms?await globalThis.__rooms.fetchRooms(path):globalThis.__rooms.rooms})};`,
  pasajeroService:`export const pasajeroService={getPassengersByVoucherReserva:async()=>({passengers:globalThis.__rooms.passengers || []})}; export default pasajeroService;`,
  HotelItinerary:`export {capacityFromRoom,getAssignedBedCountFromItinerary,isHotelService,getRoomCapacityFromType,formatPrice} from ${JSON.stringify(utils)};
    export const CategorySelection=p=><button onClick={()=>p.onSelectCategory(p.categories[0].name)}>Elegir categoría sintética</button>;
    export const HotelSelection=p=><div>{p.hotels.map((hotel,index)=><button key={hotel.id_hotel} onClick={()=>p.onSelectHotel(hotel)}>{index?'Elegir segundo hotel':'Elegir hotel sintético'}</button>)}</div>;
    export const RoomSelection=p=><div><button onClick={p.onBack}>Volver hoteles de prueba</button>{p.rooms.map(room=><div key={room.id_habitacion}><button onClick={()=>p.onToggleRoom(room,p.selectedHotel,room.tarifas[0])}>{room.tipo_habitacion}</button><button onClick={()=>p.onToggleRoom(room,p.selectedHotel,room.tarifas[0],1)}>Aumentar {room.tipo_habitacion}</button></div>)}</div>;
    export {default as ReviewSelection} from ${JSON.stringify(resolve("src/components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/HotelItinerary/ReviewSelection.tsx").replaceAll("\\","/"))};`,
  ServiceDetailedInfo:`export default ()=>null;`,
};
(async()=>{
const compiled=await build({entryPoints:["src/pages/Reservas/VouchersReserva/components/HotelAssignmentModal/HotelAssignmentModal.tsx"],bundle:true,write:false,format:"cjs",platform:"node",jsx:"automatic",define:{"import.meta.env":"{}"},external:["react","react/jsx-runtime","react-dom"],plugins:[{name:"catalog-boundaries",setup(p){
  p.onResolve({filter:/\.(scss|css)$/},()=>({path:"style",namespace:"stub"}));
  p.onResolve({filter:/.*/},a=>{const name=a.path.split("/").at(-1);if(stubs[name])return {path:name,namespace:"stub"};});
  p.onLoad({filter:/.*/,namespace:"stub"},a=>({contents:stubs[a.path]||"export default {};",loader:"jsx",resolveDir:process.cwd()}));
}}]});
const module={exports:{}};new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(resolve("package.json")),module,module.exports);
const HotelModal=module.exports.default;

test("room catalog form suggests defaults without overwriting manual capacity",async()=>{
  const compiled=await build({entryPoints:["src/pages/Reservas/Servicios/components/habitacion/HabitacionForm.tsx"],bundle:true,write:false,format:"cjs",platform:"node",jsx:"automatic",external:["react","react/jsx-runtime"],plugins:[{name:"form-boundaries",setup(p){
    p.onResolve({filter:/(useAuditInfo|services\/api|ServicePickerVisibilityField)$/},a=>({path:a.path.split('/').pop(),namespace:"stub"}));
    p.onLoad({filter:/.*/,namespace:"stub"},a=>({loader:"jsx",contents:a.path==="useAuditInfo"?'export default ()=>({userId:"fixture"});':a.path==="api"?'export const fetchHabitacionesByHotel=async()=>[];':'export default ()=>null;'}));
  }}]});
  const mod={exports:{}};new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(resolve("package.json")),mod,mod.exports);
  const Form=mod.exports.default;
  const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
  const keys=["window","document","HTMLElement","IS_REACT_ACT_ENVIRONMENT"];
  const previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(document.getElementById("root"));let saved;
  const render=async habitacion=>React.act(async()=>root.render(React.createElement(Form,{habitacion,hotelId:1,onSubmit:value=>saved=value})));
  const change=async(name,value)=>React.act(async()=>{
    const input=document.querySelector(`[name="${name}"]`);assert.ok(input,name);
    input[Object.keys(input).find(key=>key.startsWith("__reactProps"))].onChange({target:{name,value}});
  });
  const submit=async()=>React.act(async()=>{
    const form=document.querySelector('form');form[Object.keys(form).find(key=>key.startsWith("__reactProps"))].onSubmit({preventDefault(){}});
  });
  try{
    await render(undefined);
    await change("tipo_habitacion","Doble / Matrimonial");assert.equal(document.querySelector('[name="capacidad"]').value,"2");
    await change("tipo_habitacion","Triple");assert.equal(document.querySelector('[name="capacidad"]').value,"3");
    await change("tipo_habitacion","Suite");assert.equal(document.querySelector('[name="capacidad"]').value,"");
    await submit();assert.equal(saved,undefined);assert.match(document.body.textContent,/Confirma la capacidad/);
    await change("tipo_habitacion","Doble");await change("capacidad","6");
    await change("tipo_habitacion","Simple");assert.equal(document.querySelector('[name="capacidad"]').value,"6");
    await submit();assert.equal(saved.capacidad,6);
    await render({id_habitacion:7,tipo_habitacion:"Doble",capacidad:4,tipo_unidad:"habitacion"});
    await change("tipo_habitacion","Triple");assert.equal(document.querySelector('[name="capacidad"]').value,"4");
    await render({id_habitacion:8,tipo_habitacion:"Cuádruple",capacidad:null,tipo_unidad:null});
    assert.equal(document.querySelector('[name="capacidad"]').value,"4");
    await change("tipo_unidad","complemento");assert.equal(document.querySelector('[name="capacidad"]').value,"");
  }finally{
    await React.act(async()=>root.unmount());
    for(const[key,value]of Object.entries(previous)) value===undefined?delete globalThis[key]:globalThis[key]=value;
  }
});

test("rendered hotel modal preserves native currencies and maps reversed rooms to their quoted passengers",async()=>{
  const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
  const keys=["window","document","HTMLElement","CustomEvent","IS_REACT_ACT_ENVIRONMENT","__rooms","alert"];
  const previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  const people={adults:Array.from({length:5},(_,index)=>({id:index+1,nombre:`Pax sintético ${index+1}`})),children:[]};
  const hotels=[{id_hotel:5,nombre:"Hotel sintético",categoria:"3 estrellas",ciudad:"Cusco"}];
  const rooms=[{id_habitacion:10,id_hotel:5,tipo_habitacion:"Doble",capacidad:2,tarifas:[{tipo_tarifa:"interna",moneda:"soles",tasa_cambio:3,precio_compartido:150}]},
    {id_habitacion:11,id_hotel:5,tipo_habitacion:"Triple",capacidad:3,tarifas:[{tipo_tarifa:"interna",moneda:"dolares",tasa_cambio:3,precio_compartido:70}]}];
  Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,CustomEvent:window.CustomEvent,IS_REACT_ACT_ENVIRONMENT:true,__rooms:{hotels,rooms},alert:message=>{throw Error(message);}});
  window.confirm=()=>true;
  const pax=(...ids)=>ids.map(id=>({id}));
  const days=[{numero:1,titulo:"Día sintético",servicios:[{id:101,typeService:"hoteles",childService:{tipo_habitacion:"Doble"},beneficiariosAdultos:pax("adult:1","adult:2")},
    {id:102,typeService:"hoteles",childService:{tipo_habitacion:"Triple"},beneficiariosAdultos:pax("adult:3","adult:4","adult:5")}]}];
  days.push({...structuredClone(days[0]),numero:2,servicios:[...structuredClone(days[0].servicios)].reverse().map(service=>({...service,id:service.id+100}))});
  let result;
  const root=createRoot(document.getElementById("root"));
  const click=async text=>React.act(async()=>{
    const button=[...document.querySelectorAll("button")].find(node=>node.textContent.trim().includes(text));assert.ok(button,text);button.click();
  });
  const choose=async(label,value)=>React.act(async()=>{
    const select=[...document.querySelectorAll("select")].find(node=>node.parentElement.textContent.startsWith(label));assert.ok(select,label);
    const props=select[Object.keys(select).find(key=>key.startsWith("__reactProps"))];props.onChange({target:{value}});
  });
  try{
    await React.act(async()=>root.render(React.createElement(HotelModal,{isOpen:true,onClose:()=>{},days,totalPassengers:5,peopleDetails:people,onAddHotelToDays:(indices,assigned)=>{result=assignHotelSlots(days,indices,assigned,(source,service)=>({...source,assigned:service}));}})));
    await click("Seleccionar disponibles");await click("Asignar hotel a");
    await click("Elegir categoría sintética");await click("Elegir hotel sintético");
    await click("Triple");await click("Doble");
    assert.match(document.body.textContent,/5\/5 pasajeros asignados/);
    assert.equal(document.querySelectorAll('.ham-room-card.full').length,2);
    assert.equal(document.querySelector('.ham-unassigned-row'),null);
    // An invalid manually supplied selection cannot put triple occupants in a double.
    await choose("Triple · destino cotizado","101");
    await choose("Doble · destino cotizado","102");
    assert.match(document.querySelector('[role="alert"]').textContent,/no caben/);
    await choose("Triple · destino cotizado","102");
    await choose("Doble · destino cotizado","101");
    await click("Revisar selección");
    const total=document.querySelector(".total-value").textContent;
    assert.match(total,/300/);assert.match(total,/140/);assert.match(total,/\+/);
    await click("Guardar asignación");
    assert.equal(document.querySelector('[role="alert"]'),null);
    assert.ok(result,"assignment callback was confirmed");
    assert.equal(result[0].servicios[0].assigned.childService.id_habitacion,10);
    assert.equal(result[0].servicios[1].assigned.childService.id_habitacion,11);
    assert.equal(result[0].servicios[0].assigned.assignedMoneda,"soles");
    assert.equal(result[0].servicios[0].assigned.assignedTasaCambio,3);
    assert.equal(result[0].servicios[1].assigned.assignedMoneda,"dolares");
    assert.equal(result[0].servicios[1].assigned.assignedTasaCambio,1);
    assert.equal(result[1].servicios[0].assigned.childService.id_habitacion,11);
    assert.equal(result[1].servicios[1].assigned.childService.id_habitacion,10);
  }finally{
    await React.act(async()=>root.unmount());
    for(const[key,value]of Object.entries(previous)) value===undefined?delete globalThis[key]:globalThis[key]=value;
  }
});

async function withHotelFixture(options,run) {
  const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
  const keys=["window","document","HTMLElement","CustomEvent","IS_REACT_ACT_ENVIRONMENT","__rooms","alert"];
  const previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  const people=options.people || {adults:Array.from({length:5},(_,index)=>({id:index+1,nombre:`Persona ${index+1}`})),children:[]};
  const hotels=options.hotels || [{id_hotel:5,nombre:"Hotel de prueba",categoria:"3 estrellas",ciudad:"Cusco"}];
  const rooms=options.rooms || [{id_habitacion:10,id_hotel:5,tipo_habitacion:"Doble",capacidad:2,tarifas:[{tipo_tarifa:"interna",moneda:"soles",tasa_cambio:3,precio_compartido:150}]},
    {id_habitacion:11,id_hotel:5,tipo_habitacion:"Triple",capacidad:3,tarifas:[{tipo_tarifa:"interna",moneda:"dolares",precio_compartido:70}]}];
  Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,CustomEvent:window.CustomEvent,IS_REACT_ACT_ENVIRONMENT:true,
    __rooms:{hotels,rooms,passengers:options.passengers,fetchRooms:options.fetchRooms},alert:message=>{throw Error(message);}});
  window.confirm=()=>true;
  const root=createRoot(document.getElementById("root"));let saved;
  const click=async text=>React.act(async()=>{
    const button=[...document.querySelectorAll("button")].find(node=>node.textContent.trim()===text || node.textContent.trim().includes(text));
    assert.ok(button,text);button.click();
  });
  try {
    await React.act(async()=>root.render(React.createElement(HotelModal,{isOpen:true,onClose:()=>{},days:options.days,peopleDetails:people,
      totalPassengers:people.adults.length+people.children.length,voucherReservaId:options.passengers?"fixture":null,
      ...(options.omitContext ? {days:undefined,peopleDetails:undefined,totalPassengers:undefined} : {}),
      onAddHotelToDays:(indices,rooms)=>{saved={indices,rooms};return options.save?.(indices,rooms);}})));
    await run({document,click,getSaved:()=>saved});
  } finally {
    await React.act(async()=>root.unmount());
    for(const[key,value]of Object.entries(previous)) value===undefined?delete globalThis[key]:globalThis[key]=value;
  }
}
const fixturePax=(...ids)=>ids.map(id=>({id}));
const fixtureRoom=(id,type,ids)=>({id,typeService:"hoteles",parentService:{nombre:"Hotel cotizado"},
  childService:{tipo_habitacion:type},beneficiariosAdultos:fixturePax(...ids)});
const startHotelSelection=async click=>{
  await click("Seleccionar disponibles");await click("Asignar hotel a");
  await click("Elegir categoría sintética");await click("Elegir hotel sintético");
};

test("hotel modal waits for optional quotation context without repeated renders",async()=>{
  await withHotelFixture({omitContext:true},async({document})=>{
    assert.match(document.querySelector('.modal-subtitle').textContent,/0 pasajeros/);
    assert.equal(document.querySelectorAll('.day-card').length,0);
    assert.equal(document.querySelector('.confirm-btn').disabled,true);
  });
});

test("quoted hotel cards show only the room, category and beneficiary names in their compact content",async()=>{
  const room={...fixtureRoom(101,"Doble / Matrimonial",["adult:1","adult:2"]),parentService:{nombre:"Nombre comercial extenso",categoria:"Hotel ⭐⭐⭐*"}};
  await withHotelFixture({days:[{servicios:[room]}]},async({document})=>{
    const quoted=document.querySelector('.hotel-room-fact.quoted');
    assert.match(quoted.textContent,/Doble \/ Matrimonial/);
    assert.match(quoted.textContent,/3★ Sup\./);
    assert.match(quoted.textContent,/Persona 1, Persona 2/);
    assert.doesNotMatch(quoted.textContent,/Nombre comercial|pasajeros|capacidad|registrada/);
    assert.equal(document.querySelectorAll('.hotel-assignment-toolbar .progress-steps .step').length,5);
    assert.equal(document.querySelector('[aria-current="step"] .step-label').textContent,"Días");
  });
});

test("a late room catalog response cannot replace the newly selected hotel's rooms",async()=>{
  const hotels=[{id_hotel:5,nombre:"Primer hotel",categoria:"3 estrellas"},{id_hotel:6,nombre:"Segundo hotel",categoria:"3 estrellas"}];
  const room=id=>({id_habitacion:id,id_hotel:id,tipo_habitacion:`Habitación hotel ${id}`,capacidad:2,tarifas:[{tipo_tarifa:"interna",moneda:"dolares",precio_compartido:50}]});
  const reads={};let finishOld;
  await withHotelFixture({hotels,days:[{servicios:[fixtureRoom(101,"Doble",["adult:1","adult:2"])]}],fetchRooms:async path=>{
    const hotelId=Number(path.match(/hotel\/(\d+)/)[1]);reads[hotelId]=(reads[hotelId] || 0)+1;
    if(hotelId===5 && reads[hotelId]===2) return new Promise(resolve=>{finishOld=()=>resolve([room(5)]);});
    return [room(hotelId)];
  }},async({document,click})=>{
    await startHotelSelection(click);assert.ok(finishOld);
    await click("Volver hoteles de prueba");await click("Elegir segundo hotel");
    assert.match(document.body.textContent,/Habitación hotel 6/);
    await React.act(async()=>finishOld());
    assert.match(document.body.textContent,/Habitación hotel 6/);
    assert.doesNotMatch(document.body.textContent,/Habitación hotel 5/);
  });
});

test("hotel days compare each quoted room and its actual occupants, without inventing pending guests on non-hotel days",async()=>{
  const assigned={...fixtureRoom(102,"Triple",["adult:3","adult:4","adult:5"]),is_assigned:true,
    assignedChildService:{tipo_habitacion:"Suite real",capacidad_ocupacion:4},assignedParentService:{nombre:"Hotel reservado"},
    assigned_beneficiarios_adultos:fixturePax("adult:2:3","adult:3:4","adult:4:5"),assignedMoneda:"soles",assignedPrecioTotal:210,assignedTasaCambio:3};
  await withHotelFixture({days:[{titulo:"Sin alojamiento",servicios:[]},{numero:2,titulo:"Noche parcial",servicios:[fixtureRoom(101,"Doble",["adult:1","adult:2"]),assigned]}]},async({document,click})=>{
    const cards=[...document.querySelectorAll('.day-card')];
    assert.match(cards[0].textContent,/No requiere hotel/);assert.doesNotMatch(cards[0].textContent,/pendientes/);
    assert.match(cards[1].textContent,/3\/5 pax cotizados/);assert.match(cards[1].textContent,/2 pax pendientes/);
    const record=document.querySelector('[data-quoted-room="102"]');
    assert.match(record.querySelector('.quoted').textContent,/Triple/);assert.doesNotMatch(record.querySelector('.quoted').textContent,/Suite real/);
    assert.match(record.querySelector('.assigned').textContent,/Suite real/);assert.ok(record.querySelector('.assigned [title="Capacidad 4"]'));
    assert.match(record.querySelector('.assigned').textContent,/Persona 3, Persona 4, Persona 5/);
    assert.equal(document.querySelector('.selected-hotel-destinations'),null);
    await startHotelSelection(click);await click("Doble");
    assert.match(document.querySelector('.ham-assignment-head').textContent,/2\/2 pasajeros asignados/);
    assert.equal(document.querySelectorAll('.ham-room-card .ham-passenger-chip').length,2);
    await click("Revisar selección");await click("Guardar asignación");
  });
});

test("hotel manual passenger removal survives adding rooms and can explicitly reset to quotation cohorts",async()=>{
  await withHotelFixture({days:[{servicios:[fixtureRoom(101,"Doble",["adult:1","adult:2"]),fixtureRoom(102,"Triple",["adult:3","adult:4","adult:5"])]}]},async({document,click})=>{
    await startHotelSelection(click);await click("Doble");
    await React.act(async()=>document.querySelector('.ham-room-card .ham-passenger-chip').click());
    await click("Triple");
    assert.match(document.querySelector('.ham-assignment-head').textContent,/4\/5 pasajeros asignados/);
    await click("Distribuir según cotización");
    assert.match(document.querySelector('.ham-assignment-head').textContent,/5\/5 pasajeros asignados/);
    await click("Aumentar Doble");await click("Revisar selección");await click("Guardar asignación");
    assert.match(document.querySelector('[role="alert"]').textContent,/sin pasajeros/);
  });
});

test("two identical rooms receive distinct quoted groups automatically on increasing quantity",async()=>{
  const people={adults:Array.from({length:4},(_,i)=>({id:i+1,nombre:`Persona ${i+1}`})),children:[]};
  await withHotelFixture({people,days:[{servicios:[fixtureRoom(101,"Doble",["adult:1","adult:2"]),fixtureRoom(102,"Doble",["adult:3","adult:4"])]}]},async({document,click,getSaved})=>{
    await startHotelSelection(click);await click("Doble");await click("Aumentar Doble");
    assert.equal(document.querySelectorAll('.ham-room-card.full').length,2);
    assert.deepEqual([...document.querySelectorAll('.ham-room-destination select')].map(node=>node.value),["101","102"]);
    await click("Revisar selección");await click("Guardar asignación");
    assert.equal(getSaved().rooms.length,2);
    assert.deepEqual(getSaved().rooms.map(room=>room.quotedHotelServiceIds[0]),["101","102"]);
    assert.deepEqual(getSaved().rooms.map(room=>room.assignedPassengerCount),[2,2]);
  });
});

test("fetching passengers cannot reorder quote identity or turn a commercial adult into a child",async()=>{
  const people={adults:[{id:1,nombre:"Adulto comercial",edad:12},{id:2,nombre:"Segundo adulto"}],children:[{id:3,nombre:"Menor"}]};
  const passengers=[{id:2,nombre:"Segundo actualizado",edad:40,tipo_pasajero:"adult"},{id:3,nombre:"Menor actualizado",edad:8,tipo_pasajero:"child"},
    {id:1,nombre:"Comercial actualizado",edad:12,tipo_pasajero:"adult"}];
  const service={...fixtureRoom(101,"Triple",["adult:1","adult:2"]),beneficiariosNinos:fixturePax("child:1")};
  await withHotelFixture({people,passengers,days:[{servicios:[service]}]},async({document,click,getSaved})=>{
    const record=document.querySelector('.hotel-room-passengers');
    assert.equal(record.textContent,"Comercial actualizado, Segundo actualizado, Menor actualizado");
    await startHotelSelection(click);await click("Triple");
    assert.match(document.querySelector('.ham-assignment-head').textContent,/3\/3 pasajeros asignados/);
    await click("Revisar selección");await click("Guardar asignación");
    assert.deepEqual(getSaved().rooms[0].assignedPassengerIds,["adult:0:1","adult:1:2","child:0:3"]);
  });
});

test("guardar habitaciones espera confirmación y conserva selección ante rechazo",async()=>{
 let attempts=0;
 await withHotelFixture({people:{adults:[{id:1},{id:2}],children:[]},days:[{servicios:[fixtureRoom(101,"Doble",["adult:1","adult:2"])]}],save:async()=>{if(++attempts===1)throw Error("No se pudo confirmar QA");return true;}},async({document,click})=>{
  await startHotelSelection(click);await click("Doble");await click("Revisar selección");await click("Guardar asignación");
  assert.match(document.querySelector('[role="alert"]').textContent,/No se pudo confirmar QA/);
  assert.match(document.body.textContent,/Confirmar Selección/);
  await click("Guardar asignación");assert.equal(attempts,2);assert.equal(document.querySelector('[role="alert"]'),null);
 });
});
test("hotel privado: la revisión cobra por ocupante y conserva soles",async()=>{
 const rooms=[{id_habitacion:10,id_hotel:5,tipo_habitacion:"Doble",capacidad:2,tarifas:[{tipo_tarifa:"interna",tipoPrecio:"privado",moneda:"soles",tasa_cambio:3,precio_privado:60}]}];
 await withHotelFixture({rooms,people:{adults:[{id:1},{id:2}],children:[]},days:[{servicios:[fixtureRoom(101,"Doble",["adult:1","adult:2"])]}]},async({document,click,getSaved})=>{
  await startHotelSelection(click);await click("Doble");await click("Revisar selección");
  assert.match(document.querySelector('.total-value').textContent,/120/);
  assert.match(document.querySelector('.total-value').textContent,/S\//);
  await click("Guardar asignación");assert.equal(getSaved().rooms[0].precioTotal,120);assert.equal(getSaved().rooms[0].assignedMoneda,"soles");
 });
});

})().catch(error=>{console.error(error);process.exitCode=1;});
