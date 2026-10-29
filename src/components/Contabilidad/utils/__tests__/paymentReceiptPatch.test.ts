import test from "node:test";
import assert from "node:assert/strict";
import {buildReceiptPatch,buildEvidencePatch,isPaymentReceipt} from "../paymentReceiptPatch";

test("receipt fields are optional and only apply to incoming voucher payments",()=>{
  assert(isPaymentReceipt({referencia_voucher_venta:"1",contexto_pago:{tipo:"PagoCotizacion"}}));
  assert(!isPaymentReceipt({referencia_voucher_venta:"1",contexto_pago:"PagoVuelo"}));
  assert(!isPaymentReceipt({referencia_voucher_venta:"1",tipo_movimiento:"egreso"}));
  assert(!isPaymentReceipt({contexto_pago:"PagoCotizacion"}));
});
test("metadata patch preserves untouched historical values and explicitly clears fields",()=>{
  const original={metodo_pago:null,referencia_pago:"old",monto:500,saldo_id:9};
  assert.deepEqual(buildReceiptPatch(original,{metodo_pago:"",referencia_pago:""}),{
    expected:{metodo_pago:null,referencia_pago:"old"},referencia_pago:null,
  });
  assert.equal(buildReceiptPatch(original,{metodo_pago:"",referencia_pago:"old"}),null);
  const long="x".repeat(100);
  assert.deepEqual(buildReceiptPatch({...original,referencia_pago:long},{metodo_pago:"Efectivo",referencia_pago:long}),{
    expected:{metodo_pago:null,referencia_pago:long},metodo_pago:"Efectivo",
  });
});
test("metadata rejects oversized values without truncating codes",()=>{
  assert.throws(()=>buildReceiptPatch({}, {referencia_pago:"x".repeat(51)}));
  assert.throws(()=>buildReceiptPatch({}, {referencia_pago:"x\ny"}));
  const payload=buildReceiptPatch({}, {metodo_pago:" transferencia ",referencia_pago:"ñ".repeat(50)});
  assert.equal(payload.metodo_pago,"transferencia");assert.equal(payload.referencia_pago.length,50);
  assert(!("monto" in payload));assert(!("saldo_id" in payload));
});
test("media patch sends actual files and evidence ids, never client supplied storage URLs",()=>{
  const blob=new Blob(["%PDF-1.7"],{type:"application/pdf"});
  const payload=buildEvidencePatch([{id:9,tigris_url:"https://untrusted.test/file"}],[9],[{fileObject:blob}]);
  assert.deepEqual(JSON.parse(payload.get("changes")),{expected_ids:[9],remove_ids:[9]});
  assert.equal(payload.getAll("files").length,1);assert(!payload.has("tigris_url"));
});
