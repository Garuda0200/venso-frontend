import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { buildBibliaTransportOptions } from "../bibliaTransportCatalog";

const providers = [{ id_transporte: 10, nombre_transporte: "Transportes Paul" }];
const vehicle = (overrides = {}) => ({ id_movilidad: 1, id_transporte: 10, tipo_auto: "Auto", nro_pasajeros: 3,
  ruta: "Hotel - Estación Ollantaytambo", estado: "ACTIVO", ...overrides });

test("ofrece proveedor automático y ruta/clase explícitas sin asumir cuál se usará", () => {
  const options = buildBibliaTransportOptions(providers, [vehicle(), vehicle({ tipo_auto: "Camioneta", nro_pasajeros: 4 })], 2);
  assert.deepEqual(options, ["Transportes Paul", "Transportes Paul · Hotel - Estación Ollantaytambo · Auto",
    "Transportes Paul · Hotel - Estación Ollantaytambo · Camioneta"]);
});

test("sugiere sólo clases que albergan a todos los pax de ese día, incluidos niños", () => {
  const rows = [vehicle(), vehicle({ tipo_auto: "Van", nro_pasajeros: 7 })];
  assert.deepEqual(buildBibliaTransportOptions(providers, rows, 5), ["Transportes Paul", "Transportes Paul · Hotel - Estación Ollantaytambo · Van"]);
  assert.equal(buildBibliaTransportOptions(providers, rows, 7).length, 2);
  assert.deepEqual(buildBibliaTransportOptions(providers, rows, 8), ["Transportes Paul"]);
  assert.equal(buildBibliaTransportOptions(providers, rows, 2).length, 3, "el PAX de otro día no queda cacheado en las opciones");
});

test("no sugiere movilidades ocultas, inactivas, sin ruta ni capacidad confirmada", () => {
  const rows = [vehicle({ mostrar_en_servicepicker: false }), vehicle({ estado: " Inactivo " }),
    vehicle({ ruta: null }), vehicle({ nro_pasajeros: 0 }), vehicle({ nro_pasajeros: null }),
    vehicle({ nro_pasajeros: "desconocida" }), vehicle({ id_transporte: 999 })];
  assert.deepEqual(buildBibliaTransportOptions(providers, rows, 2), ["Transportes Paul"]);
  assert.deepEqual(buildBibliaTransportOptions([{ ...providers[0], mostrar_en_servicepicker: false }], [vehicle()], 2), []);
});

test("normaliza catálogo directo/enriquecido, deduplica y preserva sentido de ruta", () => {
  const original = { movilidad: vehicle() };
  const before = JSON.stringify(original);
  const options = buildBibliaTransportOptions(providers, [original, vehicle(), vehicle({ ruta: "Estación Ollantaytambo - Hotel" })], 2);
  assert.equal(options.length, 3);
  assert.ok(options.includes("Transportes Paul · Estación Ollantaytambo - Hotel · Auto"));
  assert.equal(JSON.stringify(original), before);
});

test("no ofrece unidades en mantenimiento, no disponibles, deshabilitadas o canceladas", () => {
  for (const estado of ["mantenimiento", "no disponible", "deshabilitado", "cancelado", "maintenance", "unavailable", "disabled", "cancelled"]) {
    assert.deepEqual(buildBibliaTransportOptions(providers, [vehicle({ estado: ` ${estado.toUpperCase()} ` })], 2), ["Transportes Paul"], estado);
  }
  assert.deepEqual(buildBibliaTransportOptions(providers, [vehicle({ estado: " No\t  disponible " })], 2), ["Transportes Paul"]);
});

test("el editor no reintroduce transporte histórico sin validar ni borra el valor guardado/manual", () => {
  const source = readFileSync(resolve("src/pages/Reservas/Calendario/Calendario.tsx"), "utf8");
  assert.match(source, /extraOptions=\{field === "transport"\s*\? \[\]/,
    "las sugerencias históricas de otras filas no eluden capacidad, estado o visibilidad");
  assert.match(source, /const value = draftValue \?\? String\(rawValue \?\? ""\)/,
    "el valor guardado o escrito se conserva, aunque ya no exista como sugerencia válida");
  assert.match(source, /value=\{value === BIBLIA_EMPTY_VALUE \? "" : value\}[\s\S]*?onChange=\{setValue\}/,
    "el selector sigue permitiendo editar texto manual sin forzar una selección nueva");
});

test("no construye selección detallada ambigua si el origen contiene el separador del contrato", () => {
  assert.deepEqual(buildBibliaTransportOptions(providers, [vehicle({ ruta: "Hotel · Ollantaytambo" })], 2), ["Transportes Paul"]);
});

async function catalog() {
  const result = await build({ entryPoints: [resolve("src/pages/Reservas/Calendario/services/bibliaCatalogService.ts")],
    bundle: true, platform: "node", format: "cjs", write: false,
    plugins: [{ name: "isolated-biblia-catalog-http", setup(builder) {
      builder.onResolve({ filter: /utils\/apiUtils$/ }, () => ({ path: "http", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents:
        "export const createApiInstance = () => globalThis.__bibliaCatalogHttp__;", loader: "js" }));
    }}] });
  const calls: Array<{ path: string; resolve: (rows: any[]) => void }> = [];
  (globalThis as any).__bibliaCatalogHttp__ = { get: path => new Promise(resolve => calls.push({ path, resolve: rows => resolve({ data: { data: rows } }) })) };
  const module = { exports: {} as any };
  new Function("module", "exports", "require", result.outputFiles[0].text)(module, module.exports, require);
  return { service: module.exports.bibliaCatalogService, calls };
}

test("carga las movilidades una vez y recalcula sugerencias por cada día sin compartir PAX", async () => {
  const { service, calls } = await catalog();
  const small = service.getOptions("transport", { pax: 2 });
  const large = service.getOptions("transport", { pax: 5 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].path, "/turismo/transportes");
  assert.equal(calls[1].path, "/turismo/movilidades");
  calls[0].resolve(providers); calls[1].resolve([vehicle()]);
  assert.equal((await small).length, 2);
  assert.deepEqual(await large, ["Transportes Paul"]);
  assert.equal((await service.getOptions("transport", { pax: 3 })).length, 2);
  assert.equal(calls.length, 2);
});

test("actualizar invalida el catálogo y una respuesta anterior no reemplaza la lectura nueva", async () => {
  const { service, calls } = await catalog();
  const old = service.getOptions("transport");
  service.clear();
  const fresh = service.getOptions("transport");
  calls[0].resolve(providers); calls[1].resolve([vehicle()]); await old;
  const joined = service.getOptions("transport");
  assert.equal(calls.length, 4);
  const nextProviders = [{ id_transporte: 20, nombre_transporte: "Nuevo proveedor" }];
  calls[2].resolve(nextProviders); calls[3].resolve([]);
  assert.deepEqual(await fresh, ["Nuevo proveedor"]);
  assert.deepEqual(await joined, ["Nuevo proveedor"]);
  assert.deepEqual(await service.getOptions("transport"), ["Nuevo proveedor"]);
  assert.equal(calls.length, 4);
});
