import test from "node:test";
import assert from "node:assert/strict";
import { normalizePricingType, normalizeServicePricingContract, sharedPriceFlag, tariffPriceOptions, cataloguePricingOptions } from "../servicePricingType";
import { createUnifiedService, updateServicesForPackageTypeChange, updateSingleServicePricesForPassengerChange, updateServicePricesForPassengerChange } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/unifiedServiceManager";
import { cleanDayForDB, hydrateServiceFromDB } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/itinerarioCleanupUtils";
import { buildAssignedFlatPricingState, syncTariffWithReservationPricing } from "../../pages/Reservas/VouchersReserva/components/ReservaServiceEditor/utils/editorHelpers";
import { getServiceTariff } from "../../pages/Reservas/VouchersReserva/utils/serviceAssignment";

test("private is false for calculations, null remains unassigned, old booleans import without ambiguity", () => {
  assert.equal(sharedPriceFlag("privado"), false);
  assert.equal(sharedPriceFlag("compartido"), true);
  assert.equal(normalizePricingType(null), null);
  assert.equal(normalizePricingType(false), "privado");
  assert.equal(normalizePricingType(true), "compartido");
  const imported = normalizeServicePricingContract({precioAdultoDividido:true, assignedTipoPrecio:null, assignedPrecioAdultoDividido:true});
  assert.equal(imported.tipoPrecio, "compartido");
  assert.equal(imported.assignedTipoPrecio, null);
  assert.ok(!Object.prototype.hasOwnProperty.call(imported, "assignedPrecioAdultoDividido"));
});
test("day controls available prices; mixed exposes both, including legitimate zero prices", () => {
  const tariff = { precio_compartido:0, precio_privado:30 };
  assert.deepEqual(tariffPriceOptions(tariff,"mixto").map(p=>p.amount), [0,30]);
  assert.deepEqual(tariffPriceOptions(tariff,"privado").map(p=>p.tipoPrecio), ["privado"]);
  assert.deepEqual(tariffPriceOptions(tariff,"compartido").map(p=>p.tipoPrecio), ["compartido"]);
  assert.deepEqual(tariffPriceOptions({...tariff,precio_compartido:null},"compartido"), []);
  assert.deepEqual(tariffPriceOptions({...tariff,precio_compartido:null},"mixto").map(p=>p.tipoPrecio), ["privado"]);
});

test("private-only prices remain per person and agency tariff type is independent of day mode", () => {
  const service = createUnifiedService(
    {typeService:"restaurantes"}, {},
    {precio_compartido:null,precio_privado:60,tipoPrecio:"privado",tipo_tarifa:"interna",moneda:"dolares"},
    {adults:[{id:1},{id:2}],children:[]}, "compartido",
    {selectedIds:["adult:0:1","adult:1:2"],pricingMode:"fixed"},
  );
  assert.equal(service.tipoPrecio, "privado");
  assert.equal(service.tariff.tipo_tarifa, "interna");
  assert.equal(service.tariff.precio, 60);
  assert.equal(service.tariff.precio_original, 120);
});

test("children-only shared tickets distribute their group amount once", () => {
  const service = createUnifiedService(
    {typeService:"tickets"},
    {tipo_usuario:"estudiante",procedencia:"extranjero",ticketPassengerTargetGroup:"child"},
    {precio:121.01,tipoPrecio:"compartido",moneda:"dolares"},
    {adults:[],children:[{id:1,nationality:"Estados Unidos"},{id:2,nationality:"México"}]}, "compartido",
    {selectedIds:["child:0:1","child:1:2"],ticketPassengerTargetGroup:"child",pricingMode:"fixed"},
  );
  const day = cleanDayForDB({numero:1,servicios:[service]});
  const persisted = day.servicios[0];
  assert.equal(persisted.tipoPrecio, "compartido");
  assert.equal(persisted.beneficiariosAdultos.length, 2);
  assert.ok(persisted.beneficiariosAdultos.every(passenger => passenger.child_origin));
  assert.equal(persisted.beneficiariosNinos.length, 0);
  assert.equal(Math.round(persisted.precioServicio * 100), 12101);
  assert.equal(Math.round(hydrateServiceFromDB(persisted).tariff.precio_original * 100), 12101);
});

test("shared adult tickets preserve the group amount instead of multiplying rounded units", () => {
  const service = createUnifiedService(
    {typeService:"tickets"}, {tipo_usuario:"adulto",procedencia:"extranjero",ticketPassengerTargetGroup:"adult"},
    {precio:121.01,tipoPrecio:"compartido",moneda:"dolares"},
    {adults:[{id:1,nationality:"Estados Unidos"},{id:2,nationality:"México"}],children:[]}, "compartido",
    {selectedIds:["adult:0:1","adult:1:2"],ticketPassengerTargetGroup:"adult",pricingMode:"fixed"},
  );
  const day = cleanDayForDB({numero:1,servicios:[service]});
  assert.equal(day.servicios[0].tipoPrecio, "compartido");
  assert.equal(day.servicios[0].precioServicio, 121.01);
});
test("quote → persist → reload uses selected tariff, not guide/transport/endose conventions", () => {
  const people = { adults: [{id:1},{id:2},{id:3},{id:4}], children:[] };
  const selection = { selectedIds:["adult:0:1","adult:1:2","adult:2:3","adult:3:4"], pricingMode:"fixed" };
  for (const kind of ["guias","transportes","endoses","extras"]) {
    for (const mode of ["compartido","privado"]) {
      const service = createUnifiedService({typeService:kind}, { capacidad:8 }, {precio:120,moneda:"dolares",tipoPrecio:mode},people,"privado",selection);
      assert.equal(service.tipoPrecio,mode);
      assert.equal(service.tariff.precio,mode==="compartido"?30:120);
      const day = cleanDayForDB({numero:1,titulo:"Tour",tipoServicio:"mixto",servicios:[service]});
      assert.equal(day.tipoServicio,"mixto");
      assert.equal(day.servicios[0].tipoPrecio,mode);
      const hydrated = hydrateServiceFromDB(day.servicios[0]);
      assert.equal(hydrated.tariff.precio,mode==="compartido"?30:120);
      assert.ok(!JSON.stringify(day).includes("precioAdultoDividido"));
    }
  }
});
test("reservation autosave retains quoted mode with fewer beneficiaries", () => {
  const passengerSelection = {selectedIds:["adult:0:1","adult:1:2"]};
  for (const mode of ["compartido","privado"]) {
    const tariff = syncTariffWithReservationPricing({ tariff:{precio:120,precio_original:240}, serviceType:"guias", unitPrice:120, passengerSelection, tipoPrecio:mode, preserveGroupedTotal:true });
    const flat = buildAssignedFlatPricingState({tariff,passengerSelection,tipoPrecio:mode});
    assert.equal(flat.assignedPrecioTotal,240);
    assert.equal(flat.assignedPrecioServicio,mode==="compartido"?240:120);
  }
});

test("an assignment without a price-mode override inherits shared mode without erasing NULL", () => {
  const assigned = {
    typeService: "restaurantes",
    tipoPrecio: "compartido",
    assignedTipoPrecio: null,
    assignedPrecioServicio: 120,
    assignedBeneficiariosAdultos: [{id:"adult:0:1"},{id:"adult:1:2"}],
    assignedBeneficiariosNinos: [],
  };
  assert.equal(getServiceTariff(assigned).precio, 60);
  assert.equal(getServiceTariff(assigned).precio_original, 120);
  const service = createUnifiedService(
    {typeService:"restaurantes"}, {}, {precio:120,moneda:"dolares",tipoPrecio:"compartido"},
    {adults:[{id:1},{id:2}],children:[]}, "privado",
    {selectedIds:["adult:0:1","adult:1:2"],pricingMode:"fixed"},
  );
  const day = cleanDayForDB({numero:1,servicios:[{
    ...service, assignedTipoPrecio:null, assignedTariff:service.tariff,
    assignedPassengerSelection:service.passengerSelection,
  }]});
  assert.equal(day.servicios[0].assignedTipoPrecio, null);
});

test("global package cannot overwrite daily selection or tariff visibility", () => {
  const days = [{tipoServicio:"mixto",servicios:[{tipoPrecio:"privado",tariff:{tipo_tarifa:"interna",precio:30}}]}];
  assert.equal(updateServicesForPackageTypeChange(days,"compartido",4), days);
});
test("price filters use the selected day mode, currencies and tariff type", () => {
  const service = { tarifas:[
    {tipo_tarifa:"interna",precio_compartido:90,precio_privado:60,moneda:"PEN",tasa_cambio:3},
    {tipo_tarifa:"externa",precio_compartido:120,precio_privado:70,moneda:"USD"},
  ] };
  assert.deepEqual(cataloguePricingOptions(service,"privado","interna").map(p=>p.amount),[20]);
  assert.deepEqual(cataloguePricingOptions(service,"mixto","externa").map(p=>p.amount),[120,70]);
});
test("beneficiary edits do not divide private transport or guide prices", () => {
  const people = {adults:[{id:1},{id:2},{id:3},{id:4}],children:[]};
  for (const kind of ["transportes","guias","endoses"]) {
    for (const mode of ["compartido","privado"]) {
      const service = createUnifiedService({typeService:kind},{capacidad:8},{precio:120,moneda:"dolares",tipoPrecio:mode},people,"compartido",{selectedIds:["adult:0:1","adult:1:2"],pricingMode:"fixed"});
      const updated = updateSingleServicePricesForPassengerChange(service,2);
      assert.equal(updated.tariff.precio,mode==="compartido"?60:120);
      assert.equal(updated.tariff.precio_original,mode==="compartido"?120:240);
    }
  }
});
