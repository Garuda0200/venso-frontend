import test from "node:test";
import assert from "node:assert/strict";
import { paymentCurrency, assignedPaymentExchangeRate, requestAssignedExchangeRate, paymentExchangeRatePrefill, convertPaymentAmount, convertPaymentPricing, paymentConversionContext, sumPaymentCurrencies } from "../paymentCurrency";

test("four conversion directions preserve the currency of the obligation", () => {
  for (const [value, from, to, expected] of [[150,"PEN","PEN",150],[40,"USD","USD",40],[40,"USD","PEN",150],[150,"PEN","USD",40]] as const) {
    assert.equal(convertPaymentAmount(value,from,to,3.75),expected);
  }
  assert.equal(paymentCurrency(" dólares "), "USD");
  assert.throws(() => paymentCurrency("EUR"));
  assert.throws(() => convertPaymentAmount(40,"USD","PEN",0));
});
test("unknown historical PEN rates are not invented and frozen rates win", () => {
  assert.equal(assignedPaymentExchangeRate({assignedMoneda:"soles"}),null);
  assert.equal(requestAssignedExchangeRate({currency:"PEN",assigned_tasa_cambio:null,service_data:{assigned_tasa_cambio:4}}),null);
  assert.equal(requestAssignedExchangeRate({currency:"PEN",assigned_tasa_cambio:3.75}),3.75);
  assert.equal(requestAssignedExchangeRate({currency:"USD"}),1);
  assert.equal(paymentExchangeRatePrefill({currency:"USD"}),3);
});
test("reversing an unedited conversion restores adult and child cents including zero", () => {
  const draft={currency:"USD",adultUnitPrice:21.9,childRows:[{id:"c1",precio:7.31},{id:"c2",precio:0}]};
  const pen=convertPaymentPricing(draft,"PEN",3.75);
  const usd=convertPaymentPricing(pen,"USD",3.75);
  assert.equal(usd.adultUnitPrice,21.9);
  assert.equal(usd.childRows[0].precio,7.31);
  assert.equal(usd.childRows[1].precio,0);
});
test("totals never add soles to dollars and conversion snapshots keep both amounts", () => {
  assert.deepEqual(sumPaymentCurrencies([{amount:20,currency:"USD"},{amount:75,currency:"PEN"},{amount:10,currency:"USD"}]),{USD:30,PEN:75});
  assert.equal(paymentConversionContext({amount:150,from:"PEN",to:"USD",rate:3.75,saldoId:1}).monto_convertido,40);
});
