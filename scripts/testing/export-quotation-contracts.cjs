/* Deferred test helper. Bundles only when explicitly invoked in the final test phase. */
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const MAX_INPUT = 64 * 1024;
async function generate(catalog) {
  const esbuild = require(path.join(root, "node_modules/esbuild"));
  const result = await esbuild.build({
    entryPoints: [path.join(root, "src/tests/contracts/quotationFrontendContracts.ts")],
    bundle: true, write: false, platform: "node", format: "cjs", logLevel: "silent", external: ["esbuild"],
    define: { "import.meta.env": "{}" }, plugins: [{ name: "contract-http-boundary", setup(build) {
      build.onLoad({ filter: /[\\/]utils[\\/]apiUtils\.ts$/ }, () => ({ loader: "ts", contents: `
        const capture = async (_path, payload) => ({ data: { success: true, data: JSON.parse(JSON.stringify(payload)) } });
        export const createApiInstance = () => ({post:capture, put:capture});
        export const isRequestCanceled = () => false;` }));
      build.onLoad({ filter: /[\\/]utils[\\/]secureStorage\.ts$/ }, () => ({ loader: "ts", contents: `export default {getItem:()=>null};` }));
      build.onLoad({ filter: /[\\/]utils[\\/]cacheInvalidation\.ts$/ }, () => ({ loader: "ts", contents: `export const invalidateCotizacionGraphCache=()=>{};` }));
    } }],
  });
  const module = {exports:{}};
  new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
  return module.exports.quotationFrontendContractCases(catalog);
}
module.exports = { generate };
if (require.main === module) {
  let raw="";process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk=>{raw+=chunk;if(raw.length>MAX_INPUT)process.stdin.destroy(new Error("Input too large"));});
  process.stdin.on("end", async()=>{
    const originalLog=console.log; console.log=(...values)=>console.error(...values);
    try { const cases=await generate(JSON.parse(raw)); process.stdout.write(JSON.stringify(cases)); }
    catch(error) { console.error(error.message);process.exitCode=1; }
    finally {console.log=originalLog;}
  });
}
