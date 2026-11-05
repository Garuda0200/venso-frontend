import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {createRoot} from "react-dom/client";
import {parseHTML} from "linkedom";
import {build} from "esbuild";
import {createRequire} from "node:module";
import {resolve} from "node:path";

async function fixture(run, callback=async()=>{}) {
  const bundle=await build({entryPoints:["src/pages/Ventas/Cotizaciones/components/BibliaVisibilitySwitch.tsx"],bundle:true,write:false,platform:"node",format:"cjs",jsx:"automatic",
    external:["react","react/jsx-runtime","react-dom"],plugins:[{name:"styles",setup(b){b.onLoad({filter:/\.scss$/},()=>({contents:"",loader:"js"}));}}]});
  const module={exports:{} as any};
  new Function("require","module","exports",bundle.outputFiles[0].text)(createRequire(resolve("package.json")),module,module.exports);
  const Switch=module.exports.default;
  const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
  const before={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
  Object.assign(globalThis,{window,document,IS_REACT_ACT_ENVIRONMENT:true});
  let focused=null,calls=[];
  window.HTMLElement.prototype.focus=function(){focused=this;};
  window.HTMLElement.prototype.showModal=function(){this.open=true;};
  window.HTMLElement.prototype.close=function(){this.open=false;};
  const root=createRoot(document.getElementById('root'));
  function Wrapper(){const [visible,setVisible]=React.useState(false);return <Switch fileCode="QA-FILE" checked={visible} onConfirm={async value=>{calls.push(value);await callback(value);setVisible(value);}}/>;}
  const button=text=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text);
  const props=el=>el[Object.keys(el).find(key=>key.startsWith('__reactProps'))];
  const click=async target=>React.act(async()=>{const el=typeof target==='string'?button(target):target;assert.ok(el,String(target));el.click();});
  try{await React.act(async()=>root.render(<Wrapper/>));await run({document,calls,click,props,focus:()=>focused});}
  finally{await React.act(async()=>root.unmount());for(const [key,value] of Object.entries(before))value===undefined?delete globalThis[key]:globalThis[key]=value;}
}

test("switch waits for confirmation, cancellation keeps state and returns focus",async()=>{
  await fixture(async({document,calls,click,focus})=>{
    const toggle=document.querySelector('[role="switch"]');
    await click(toggle);assert.equal(calls.length,0);assert.equal(toggle.getAttribute('aria-checked'),'false');
    assert.match(document.querySelector('dialog').textContent,/Mostrar en la Biblia/);
    await click('Cancelar');assert.equal(document.querySelector('dialog'),null);assert.equal(focus(),toggle);
  });
});
test("confirm show and hide use the same switch and only change checked state after saving",async()=>{
  await fixture(async({document,calls,click})=>{
    const toggle=document.querySelector('[role="switch"]');
    await click(toggle);await click('Mostrar en Biblia');assert.deepEqual(calls,[true]);assert.equal(toggle.getAttribute('aria-checked'),'true');
    await click(toggle);assert.match(document.querySelector('dialog').textContent,/datos y vínculos se conservarán/);
    await click('Ocultar registros');assert.deepEqual(calls,[true,false]);assert.equal(toggle.getAttribute('aria-checked'),'false');
  });
});
test("failed saves preserve visibility and allow retry inside the confirmation",async()=>{
  let attempt=0;
  await fixture(async({document,calls,click})=>{
    const toggle=document.querySelector('[role="switch"]');
    await click(toggle);await click('Mostrar en Biblia');assert.match(document.querySelector('[role="alert"]').textContent,/El file cambió/);
    assert.equal(toggle.getAttribute('aria-checked'),'false');
    await click('Mostrar en Biblia');assert.deepEqual(calls,[true,true]);assert.equal(toggle.getAttribute('aria-checked'),'true');
  },async()=>{if(!attempt++)throw new Error('El file cambió');});
});
test("Escape cancels only the confirmation without confirming a visibility change",async()=>{
  await fixture(async({document,calls,click,props})=>{
    await click(document.querySelector('[role="switch"]'));
    let stopped=false,prevented=false;
    const events=props(document.querySelector('dialog'));
    events.onKeyDown({key:'Escape',stopPropagation(){stopped=true;}});
    await React.act(async()=>events.onCancel({preventDefault(){prevented=true;},stopPropagation(){stopped=true;}}));
    assert.ok(stopped&&prevented);assert.equal(calls.length,0);assert.equal(document.querySelector('dialog'),null);
  });
});
