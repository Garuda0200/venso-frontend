import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';

test('detalle de pago consulta sólo su ID, incluido si ya fue pagado, sin descargar todos los pendientes',async()=>{
 const calls=[];const fixture={calls,body:{success:true,data:{id:'paid/opaque',status:'paid',currency:'PEN',assigned_tasa_cambio:'3.25',service_data:{assignedMoneda:'soles'}}}};
 globalThis.__vensoPaymentDetailFixture=fixture;
 try{
  const result=await build({entryPoints:[resolve('src/services/paymentRequestService.ts')],bundle:true,write:false,platform:'node',format:'cjs',
   plugins:[{name:'mock-payment-network',setup(plugin){
    plugin.onResolve({filter:/utils\/axiosInstance$/},()=>({path:'axios',namespace:'fixture'}));
    plugin.onResolve({filter:/utils\/cacheInvalidation$/},()=>({path:'cache',namespace:'fixture'}));
    plugin.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='cache'
      ?'export const invalidateReservaAssignmentGraphCache=()=>{}'
      :'export default {get:async(path,options)=>{const f=globalThis.__vensoPaymentDetailFixture;f.calls.push({path,options});return {data:f.body}}}',loader:'js'}));
   }}]});
  const module={exports:{}};new Function('module','exports',result.outputFiles[0].text)(module,module.exports);
  const api=module.exports.paymentRequestService;
  const response=await api.getPendingEnrichedById('paid/opaque');
  assert.equal(calls.length,1);assert.equal(calls[0].path,'/turismo/payment-requests/paid%2Fopaque');
  assert.equal(calls[0].options._skipDedup,true);
  assert.deepEqual(response,{success:true,data:fixture.body.data});
  fixture.body={success:false,data:null};
  assert.equal((await api.getPendingEnrichedById('unavailable')).success,false);
 }finally{delete globalThis.__vensoPaymentDetailFixture;}
});
