import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flightBeneficiaryLabel, flightMoney, flightOrigin, flightRoute, flightSource, normalizeReportCurrency, pricingCaption, reportDate, summarizeFlightCurrencies } from "../utils/soldFlightReport";

test("currencies remain separate and missing values are never reported as zero", () => {
  assert.equal(normalizeReportCurrency("soles"), "PEN"); assert.equal(normalizeReportCurrency("dólares"), "USD");
  assert.equal(flightMoney(null, "USD"), "Sin importe"); assert.match(flightMoney(0,"USD"), /0[.,]00/);
  const totals=summarizeFlightCurrencies([{scope:"quoted",currency:"dolares",amount:100},{scope:"quoted",currency:"USD",amount:25},{scope:"quoted",currency:"soles",amount:300},{scope:"assigned",currency:"USD",amount:90}],"quoted");
  assert.deepEqual(totals,[{currency:"USD",amount:125,missing:0},{currency:"PEN",amount:300,missing:0}]);
});
test("procedencia and route missing values are explicit, never guessed from airline", () => {
  assert.equal(flightOrigin({provider:"LATAM"}),"Sin procedencia");
  assert.equal(flightRoute({departure:"Lima",destination:"Cusco"}),"Lima → Cusco");
  assert.match(flightRoute({}), /sin registrar/); assert.equal(flightSource("cotizacion_externa"),"Extras sin fee");
});
test("uniform and heterogeneous pricing have distinct captions", () => {
  assert.match(pricingCaption({count:2,uniform:true,beneficiaries:[{amount:100}]},"USD"), /100/);
  assert.match(pricingCaption({count:2,uniform:false,average:100},"USD"),/distintas/);
  assert.match(pricingCaption({count:0},"USD"), /Sin beneficiarios/);
});
test("beneficiaries map to their real passenger type including adult-tariff children", () => {
  const people={adults:[{id:1,nombres:"Adulto",apellidos:"Prueba"}],children:[{id:2,nombres:"Niño",apellidos:"Prueba"}]};
  assert.equal(flightBeneficiaryLabel({id:"adult:1",passenger_type:"adult"},people),"Adulto Prueba");
  assert.equal(flightBeneficiaryLabel({id:"child:1",passenger_type:"child",tariff:"child_as_adult"},people),"Niño Prueba");
  assert.equal(flightBeneficiaryLabel({id:"child:0:999",passenger_type:"child"},{}),"Niño 1");
});
test("dates are displayed dd/mm/yyyy without UTC date shifts", () => {
  assert.equal(reportDate("2026-10-12"),"12/10/2026"); assert.equal(reportDate(null),"Sin fecha");
});
test("accounting navigation keeps provider payments and adds sold flights", () => {
  const source=readFileSync(require("node:path").resolve("src/pages/Contabilidad/Reportes/Reportes.tsx"),"utf8");
  assert.match(source,/ReporteVuelosVendidos/); assert.match(source,/GestionPagosServicios/);
});
test("report uses dedicated paginated API with cancellation and separate amounts", () => {
  const source=readFileSync(require("node:path").resolve("src/pages/Contabilidad/Reportes/ReporteVuelosVendidos.tsx"),"utf8");
  assert.match(source,/\/turismo\/reports\/sold-flights/); assert.match(source,/page_size: 25/);
  assert.match(source,/controller.abort/); assert.match(source,/row.quoted_pricing/); assert.match(source,/row.assigned_pricing/);
  assert.match(source,/Promedio informativo/); assert.match(source,/p.allocations/);
  assert.doesNotMatch(source,/payment-requests\/all/);
});
