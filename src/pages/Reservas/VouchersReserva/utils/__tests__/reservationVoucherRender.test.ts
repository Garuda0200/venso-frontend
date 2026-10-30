import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { formatPaymentMoney } from "../../../../../utils/paymentCurrency";
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReservationVoucherMap,
  buildReservationVoucherPaymentSummary,
  mapReservationVoucherRelation,
} from "../reservationVoucherRender";

test("render usa assigned_itinerary batch y conserva paymentRequest completo", () => {
  const mapped = mapReservationVoucherRelation({
    id: "VR-1",
    voucher_id: 12,
    assigned_itinerary: [{
      numero: 1,
      servicios: [{
        id: 91,
        isAssigned: true,
        assignedParentId: 5,
        paymentRequest: {
          status: "paid",
          amount: "120.50",
          movimiento_id: 44,
          pagado_por: "contabilidad",
        },
      }],
    }],
  });
  assert.equal(mapped.assignedItinerary[0].servicios[0].paymentRequest.movimiento_id, 44);
  assert.equal(mapped.hasAssignedServices, true);
});

test("render prioriza media resuelto entregado por backend", () => {
  const mapped = mapReservationVoucherRelation({
    id: "VR-2",
    voucher_id: 13,
    resolved_voucher_media: { url: "voucher-media/file.pdf", origin: "voucher_reserva_media" },
    voucher_media: { url: "voucher-media/file.pdf" },
    assigned_itinerary: [],
  });
  assert.equal(mapped.resolvedVoucherMedia.url, "voucher-media/file.pdf");
  assert.equal(mapped.voucherMedia.url, "voucher-media/file.pdf");
});

test("map omite reservas recientemente eliminadas", () => {
  const map = buildReservationVoucherMap(
    [
      { id: "VR-1", voucher_id: 1, assigned_itinerary: [] },
      { id: "VR-2", voucher_id: 2, assigned_itinerary: [] },
    ],
    new Set(["VR-2"]),
  );
  assert.ok(map["1"]);
  assert.equal(map["2"], undefined);
});

const paymentService=(id:number,currency:string,total:number,extra:any={})=>({servicioId:id,
  typeService:"transportes",isAssigned:true,assignedParentId:1,
  assignedMoneda:currency,assignedPrecioTotal:total,cantidad:4,...extra});

test("voucher cards preserve PEN and USD totals and payment completion independently",()=>{
 const summary=buildReservationVoucherPaymentSummary([{numero:1,servicios:[
  paymentService(1,"soles",150,{paymentRequest:{id:1,status:"paid",currency:"PEN",amount:"150"}}),
  paymentService(2,"dolares",40,{paymentRequest:{id:2,status:"pending",currency:"USD",amount:"40"}}),
 ]}]);
 assert.deepEqual(summary.rows,[{currency:"PEN",total:150,paid:150,percentage:100},{currency:"USD",total:40,paid:0,percentage:0}]);
 assert.equal(summary.paymentCompleted,false);
 assert.equal(summary.pendingPaymentsCount,1);
});

test("card total does not resuscitate explicit zero or multiply a frozen total by cantidad",()=>{
 const summary=buildReservationVoucherPaymentSummary([{numero:1,servicios:[
  paymentService(1,"PEN",0,{assignedTariff:{precio_original:999}}),
  paymentService(2,"USD",40),
 ]}]);
 assert.equal(summary.rows[0].total,0);
 assert.equal(summary.rows[1].total,40);
 assert.equal(summary.unknownCosts,0);
});

test("paid amount in another native currency cannot complete an unpaid obligation",()=>{
 const summary=buildReservationVoucherPaymentSummary([{numero:1,servicios:[
  paymentService(1,"PEN",150,{paymentRequest:{id:1,status:"paid",currency:"USD",amount:150}}),
 ]}]);
 assert.deepEqual(summary.rows.map(row=>[row.currency,row.total,row.paid]),[["PEN",150,0],["USD",0,150]]);
 assert.equal(summary.paymentCompleted,false);
});

test("unknown assigned cost is pending and a repeated service/request is counted once",()=>{
 const paid=paymentService(1,"PEN",150,{paymentRequest:{id:1,status:"paid",amount:150}});
 const summary=buildReservationVoucherPaymentSummary([{numero:1,servicios:[paid,paid,
  {servicioId:2,typeService:"tickets",isAssigned:true,assignedChildId:3,moneda:"USD",tariff:{precio_original:999}},
 ]}]);
 assert.equal(summary.rows.length,1);
 assert.equal(summary.rows[0].total,150);
 assert.equal(summary.rows[0].paid,150);
 assert.equal(summary.unknownCosts,1);
 assert.equal(summary.paymentCompleted,false);
});

test("rendered card payments show separate currency progress and unknown costs",()=>{
 const source=readFileSync(resolve(process.cwd(),"src/pages/Reservas/VouchersReserva/components/VoucherReservaCard/components/VoucherPaymentInfo.tsx"),"utf8");
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 const loaded={exports:{}} as any;
 const localRequire=(name:string)=>name.endsWith(".scss")?{}:name.endsWith("/paymentCurrency")?{formatPaymentMoney}:require(name);
 new Function("require","module","exports",compiled)(localRequire,loaded,loaded.exports);
 const markup=renderToStaticMarkup(React.createElement(loaded.exports.default,{rows:[
  {currency:"PEN",total:150,paid:150,percentage:100},
  {currency:"USD",total:40,paid:0,percentage:0},
 ],unknownCosts:1}));
 assert.match(markup,/aria-label="Pagos en PEN"/);
 assert.match(markup,/aria-label="Pagos en USD"/);
 assert.match(markup,/Completado · PEN/);
 assert.match(markup,/Pendiente · USD/);
 assert.match(markup,/1 costo\(s\) por confirmar/);
 assert.ok(markup.includes(formatPaymentMoney(150,"PEN")));
 assert.ok(markup.includes(formatPaymentMoney(40,"USD")));
});
