// HTTP is captured; database access is owned by the explicit Rust test fixture.
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
async function generate(input) {
  const result = await require(path.join(root, "node_modules/esbuild")).build({
    entryPoints: [path.join(root, "src/tests/contracts/quotationReopenContracts.ts")], bundle: true, write: false,
    platform: "node", format: "cjs", logLevel: "silent", external: ["esbuild"], define: { "import.meta.env": "{}" },
    plugins: [{ name: "quotation-save-http-capture", setup(build) {
      build.onLoad({ filter: /[\\/]utils[\\/]apiUtils\.ts$/ }, () => ({ loader: "ts", contents: `
        export const createApiInstance=()=>({put:async(_path,payload)=>({data:{success:true,data:JSON.parse(JSON.stringify(payload))}})});
        export const isRequestCanceled=()=>false;` }));
      build.onLoad({ filter: /[\\/]utils[\\/]secureStorage\.ts$/ }, () => ({ loader: "ts", contents: `export default {getItem:()=>null};` }));
      build.onLoad({ filter: /[\\/]utils[\\/]cacheInvalidation\.ts$/ }, () => ({ loader: "ts", contents: `export const invalidateCotizacionGraphCache=()=>{};` }));
    } }],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
  return module.exports.quotationReopenContract(input);
}
module.exports = { generate };
if (require.main === module) {
  let raw = ""; process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => { raw += chunk; if (raw.length > 1024 * 1024) process.stdin.destroy(new Error("Input too large")); });
  process.stdin.on("end", async () => {
    const original = console.log; console.log = (...values) => console.error(...values);
    try { process.stdout.write(JSON.stringify(await generate(JSON.parse(raw)))); }
    catch (error) { console.error(error.stack || error); process.exitCode = 1; }
    finally { console.log = original; }
  });
}
