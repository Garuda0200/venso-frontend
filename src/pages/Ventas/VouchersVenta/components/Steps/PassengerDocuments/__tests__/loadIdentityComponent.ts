import { build } from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';

// Run the real Venso components in the DOM harness used by Magic. Only
// styles and unused network boundaries are replaced; the injected API remains
// explicit in each test and an accidental external request fails the test.
export async function loadIdentityComponent(name: string) {
  const entry=path.resolve('src/pages/Ventas/VouchersVenta/components/Steps/PassengerDocuments',name+'.tsx');
  const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',
    jsx:'automatic',packages:'external',define:{'import.meta.env':'{}'},plugins:[{
      name:'identity-component-test-boundaries',
      setup(plugin){
        plugin.onResolve({filter:/\.scss$/},args=>({path:args.path,namespace:'styles'}));
        plugin.onLoad({filter:/.*/,namespace:'styles'},()=>({contents:'',loader:'js'}));
        plugin.onResolve({filter:/(?:^|\/)(?:axiosInstance|documentAiService)(?:\.[jt]s)?$/},args=>({path:args.path,namespace:'network'}));
        plugin.onLoad({filter:/.*/,namespace:'network'},args=>({contents:args.path.includes('documentAiService')
          ? 'export async function getDocumentAiService(){throw Error("Tests must inject their API");}'
          : 'export default {get(){throw Error("Unexpected network call in component test");}};',loader:'js'}));
      },
    }]});
  const module={exports:{} as any};
  new Function('require','module','exports',result.outputFiles[0].text)(createRequire(path.resolve('package.json')),module,module.exports);
  return module.exports.default;
}
