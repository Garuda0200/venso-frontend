import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { QueryObserver } from "@tanstack/react-query";

const CHANGED_EVENT = "venso:agencies-changed";
const bundle = build({
  stdin: {
    contents: `export * from './src/services/agencyService';
      export { queryClient, queryKeys } from './src/config/queryClient';
      export { setTurismoCachedData, getTurismoCachedData, TURISMO_ENTITY_TYPES } from './src/hooks/useTurismoCache';
      export { bibliaCatalogService } from './src/pages/Reservas/Calendario/services/bibliaCatalogService';`,
    resolveDir: process.cwd(), loader: "ts",
  },
  bundle: true, write: false, platform: "node", format: "cjs",
  external: ["react", "@tanstack/react-query"], define: { "import.meta.env": "{}" },
  plugins: [{
    name: "agency-http-boundary",
    setup(builder) {
      builder.onLoad({ filter: /[\\/]axiosInstance\.ts$/ }, () => ({ contents: `
        export const createAxiosInstance = () => globalThis.__agencyCacheHarness.api;
        export const invalidateGetCache = pattern => globalThis.__agencyCacheHarness.invalidated.push(pattern);`, loader: "js",
      }));
      builder.onLoad({ filter: /[\\/]apiUtils\.ts$/ }, () => ({
        contents: "export const createApiInstance = () => globalThis.__agencyCacheHarness.api;", loader: "js",
      }));
    },
  }],
});

async function fixture(run) {
  const previous = { window: globalThis.window, harness: globalThis.__agencyCacheHarness };
  const window = new EventTarget();
  let notifications = 0;
  window.addEventListener(CHANGED_EVENT, () => { notifications++; });
  const state = {
    rows: [
      { id: 1, name: "Venso Tours", active: true, is_primary: true },
      { id: 2, name: "Agencia anterior", active: true, is_primary: false },
    ],
    invalidated: [], reads: [], failMutation: false,
    api: {
      async get(path, config = {}) {
        state.reads.push({ path, config });
        let data;
        if (path.endsWith("/primary")) data = state.rows[0];
        else if (/\/agencias\/\d+$/.test(path)) data = state.rows.find(row => path.endsWith(`/${row.id}`));
        else data = state.rows.filter(row => config.params?.include_inactive || row.active);
        return { data: { success: true, data: structuredClone(data) } };
      },
      async post(_path, body) { return mutate(3, body); },
      async put(path, body) { return mutate(Number(path.split("/").at(-1)), body); },
      async delete(path) { return mutate(Number(path.split("/").at(-1)), { active: false }); },
    },
  };
  function mutate(id, body) {
    if (state.failMutation) throw new Error("HTTP 403");
    const row = { ...state.rows.find(item => item.id === id), id, ...body };
    state.rows = [...state.rows.filter(item => item.id !== id), row].sort((a, b) => a.id - b.id);
    return { data: { success: true, data: structuredClone(row) } };
  }
  Object.assign(globalThis, { window, __agencyCacheHarness: state });
  const result = await bundle;
  const module = { exports: {} as any };
  const intervals = [];
  new Function("require", "module", "exports", "setInterval", result.outputFiles[0].text)(
    createRequire(resolve("package.json")), module, module.exports,
    (callback, delay) => {
      const timer = setInterval(callback, delay);
      intervals.push(timer);
      timer.unref();
      return timer;
    },
  );
  const service = module.exports;
  service.queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity, staleTime: Infinity } });
  try {
    await run({ state, service, notifications: () => notifications });
  } finally {
    service.queryClient.clear();
    intervals.forEach(clearInterval);
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    if (previous.harness === undefined) delete globalThis.__agencyCacheHarness;
    else globalThis.__agencyCacheHarness = previous.harness;
  }
}

test("create, edit and delete invalidate both query key generations and all dependent catalog caches", async () => {
  await fixture(async ({ service, state, notifications }) => {
    const keys = [
      ["turismo", "agencias", "directory"], ["agencies", "quotation-editor"],
      ["turismo", "hoteles", 2], ["cotizaciones", "list"], ["vouchers-venta", "list"],
      ["vouchers-reserva", "list"], ["payment-requests"], ["paquetes", "list"],
    ];
    const unrelated = ["unrelated", "keep"];
    const entities = Object.values(service.TURISMO_ENTITY_TYPES);
    const warm = () => {
      for (const key of keys) service.queryClient.setQueryData(key, ["old"]);
      service.queryClient.setQueryData(unrelated, ["keep"]);
      for (const entity of entities) service.setTurismoCachedData(entity, ["old"], "agency:2");
    };
    const assertInvalidated = () => {
      for (const key of keys) assert.equal(service.queryClient.getQueryState(key).isInvalidated, true, String(key));
      for (const entity of entities) assert.equal(service.getTurismoCachedData(entity, "agency:2"), null, String(entity));
      assert.deepEqual(service.queryClient.getQueryData(unrelated), ["keep"]);
      for (const path of ["/agencias", "/tarifas", "/hoteles", "/movilidades", "/tickets", "/servicios-extras", "/paquetes-turisticos"]) {
        assert.ok(state.invalidated.includes(path), path);
      }
    };
    warm();
    const created = await service.createAgency({ name: "Agencia nueva", active: true });
    assert.equal(created.id, 3);
    assertInvalidated();
    warm();
    const edited = await service.updateAgency(2, { name: "Agencia renombrada" });
    assert.equal(edited.name, "Agencia renombrada");
    assertInvalidated();
    warm();
    const deleted = await service.deleteAgency(2);
    assert.equal(deleted.active, false);
    assertInvalidated();
    assert.equal(notifications(), 3);
  });
});

test("failed mutations preserve the cache and do not notify mounted consumers", async () => {
  await fixture(async ({ service, state, notifications }) => {
    const key = ["turismo", "agencias", "directory"];
    service.queryClient.setQueryData(key, state.rows);
    service.setTurismoCachedData("tarifa", ["keep"]);
    state.failMutation = true;
    await assert.rejects(service.createAgency({ name: "Nueva" }), /403/);
    await assert.rejects(service.updateAgency(2, { name: "Nueva" }), /403/);
    await assert.rejects(service.deleteAgency(2), /403/);
    assert.equal(service.queryClient.getQueryState(key).isInvalidated, false);
    assert.deepEqual(service.getTurismoCachedData("tarifa"), ["keep"]);
    assert.deepEqual(state.invalidated, []);
    assert.equal(notifications(), 0);
  });
});

test("Biblia field cache reloads renamed agencies and retains historical records only in the directory", async () => {
  await fixture(async ({ service }) => {
    assert.deepEqual(await service.bibliaCatalogService.getOptions("agency"), ["Agencia anterior", "Venso Tours"]);
    await service.updateAgency(2, { name: "Nombre nuevo" });
    assert.deepEqual(await service.bibliaCatalogService.getOptions("agency"), ["Nombre nuevo", "Venso Tours"]);
    await service.deleteAgency(2);
    assert.deepEqual(await service.bibliaCatalogService.getOptions("agency"), ["Venso Tours"]);
    assert.equal((await service.getAgencies()).length, 1);
    assert.equal((await service.getAgencies(true)).length, 2);
    assert.equal((await service.getAgencyById(2)).name, "Nombre nuevo");
  });
});

test("an in-flight directory query is cancelled so its old response cannot repopulate the cache", async () => {
  await fixture(async ({ service }) => {
    const key = ["turismo", "agencias", "directory"];
    let reads = 0;
    let resolveOld;
    let oldSignal;
    const observer = new QueryObserver(service.queryClient, {
      queryKey: key,
      queryFn: ({ signal }) => {
        reads++;
        if (reads === 1) {
          oldSignal = signal;
          return new Promise(resolve => { resolveOld = resolve; });
        }
        return service.getAgencies(true, { signal });
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      await service.updateAgency(2, { name: "Nombre definitivo" });
      assert.equal(oldSignal.aborted, true);
      await new Promise(done => setImmediate(done));
      assert.equal(reads, 2);
      resolveOld([{ id: 2, name: "Nombre obsoleto" }]);
      await new Promise(done => setImmediate(done));
      assert.equal(service.queryClient.getQueryData(key)[1].name, "Nombre definitivo");
    } finally {
      unsubscribe();
    }
  });
});

test("agency reads forward the AbortSignal and successful mutations survive a failed dependent refetch", async () => {
  await fixture(async ({ service, state }) => {
    const controller = new AbortController();
    await service.getAgencies(true, { signal: controller.signal });
    await service.getPrimaryAgency(controller.signal);
    assert.equal(state.reads[0].config.signal, controller.signal);
    assert.equal(state.reads[0].config.params.include_inactive, true);
    assert.equal(state.reads[1].config.signal, controller.signal);
    const key = ["agencies", "quotation-editor"];
    service.queryClient.setQueryData(key, ["previous"]);
    const observer = new QueryObserver(service.queryClient, {
      queryKey: key, retry: false, queryFn: async () => { throw new Error("read failed"); },
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      const updated = await service.updateAgency(2, { name: "Guardado correctamente" });
      assert.equal(updated.name, "Guardado correctamente");
      await new Promise(done => setImmediate(done));
      assert.equal(service.queryClient.getQueryState(key).status, "error");
    } finally {
      unsubscribe();
    }
  });
});
