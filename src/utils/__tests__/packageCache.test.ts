import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";

async function client() {
  const result = await build({ entryPoints: [resolve("src/utils/axiosInstance.ts")], bundle: true,
    write: false, platform: "node", format: "cjs", external: ["axios"],
    define: { "import.meta.env.VITE_API_TIMEOUT": '"15000"' },
    plugins: [{ name: "isolated-http-environment", setup(builder) {
      builder.onResolve({ filter: /(?:apiUtils|csrfToken|backendStatus|config\/queryClient)$/ }, args => ({ path: args.path, namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, args => ({ contents:
        args.path.endsWith("apiUtils") ? `export const getApiUrl=()=>"http://127.0.0.1:1"; export const normalizeApiRequestUrl=x=>x; export const isRequestCanceled=()=>false;`
        : args.path.endsWith("csrfToken") ? `export const clearCsrfToken=()=>{}; export const getCsrfToken=()=>"test"; export const ensureCsrfToken=async()=>"test"; export const refreshCsrfToken=async()=>"test"; export const isCsrfMismatchResponse=()=>false;`
        : args.path.endsWith("backendStatus") ? `export const reportBackendAvailable=()=>{}; export const reportBackendUnavailable=()=>{};`
        : `export const queryClient={ cancelQueries:async()=>{}, invalidateQueries:async()=>{} }; export const queryKeys={paquetes:{all:["packages"]}};`, loader: "js" }));
    }}] });
  const module = { exports: {} as any };
  new Function("module", "exports", "require", result.outputFiles[0].text)(module, module.exports, require);
  const api = module.exports.default, calls: any[] = [];
  api.defaults.adapter = config => new Promise(resolve => calls.push({ config, resolve: data => resolve({ config, data, status: 200, statusText: "OK", headers: {} }) }));
  return { api, calls, invalidate: module.exports.invalidateGetCache };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test("respuesta anterior a una invalidación no repuebla la caché ni elimina la lectura nueva", async () => {
  const { api, calls, invalidate } = await client();
  const path = "/turismo/paquetes-turisticos";
  const old = api.get(path); await tick();
  invalidate(path);
  const fresh = api.get(path); await tick();
  calls[0].resolve({ name: "old" }); await old;
  const joined = api.get(path); await tick();
  assert.equal(calls.length, 2);
  calls[1].resolve({ name: "fresh" });
  assert.equal((await fresh).data.name, "fresh");
  assert.equal((await joined).data.name, "fresh");
  assert.equal((await api.get(path)).data.name, "fresh");
  assert.equal(calls.length, 2);
});

test("editar un paquete con ID de texto invalida su lista y detalle, no solo rutas numéricas", async () => {
  const { api, calls } = await client();
  const path = "/turismo/paquetes-turisticos";
  const list = api.get(path); await tick(); calls[0].resolve({ name: "list-before" }); await list;
  const detail = api.get(`${path}/PKG-TEXT`); await tick(); calls[1].resolve({ name: "detail-before" }); await detail;
  const mutation = api.put(`${path}/PKG-TEXT/precio`, { precio: 100 }); await tick(); calls[2].resolve({ success: true }); await mutation;
  const nextList = api.get(path), nextDetail = api.get(`${path}/PKG-TEXT`); await tick();
  assert.equal(calls.length, 5);
  calls[3].resolve({ name: "list-after" }); calls[4].resolve({ name: "detail-after" });
  assert.equal((await nextList).data.name, "list-after");
  assert.equal((await nextDetail).data.name, "detail-after");
});
