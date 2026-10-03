import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

const mock: any = { data: { success: true, data: [] }, calls: [] };
(globalThis as any).__pendingPaymentTest = mock;
const service = build({ entryPoints: [resolve("src/services/pendingPaymentService.ts")], bundle: true,
  write: false, platform: "node", format: "cjs", plugins: [{ name: "mock-read-only-api", setup(builder) {
    builder.onResolve({ filter: /utils\/axiosInstance$/ }, () => ({ path: "axios", namespace: "mock" }));
    builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: `
      export function invalidateGetCache(path) { globalThis.__pendingPaymentTest.calls.push({ invalidated: path }); }
      export default { get: async (path, options) => {
        const mock = globalThis.__pendingPaymentTest;
        mock.calls.push({ path, options });
        if (mock.error) throw mock.error;
        return { data: mock.data };
      }};`, loader: "js" }));
  } }] }).then((result) => {
    const module = { exports: {} as any };
    new Function("module", "exports", result.outputFiles[0].text)(module, module.exports);
    return module.exports;
  });

test("las consultas omiten la caché GET y respetan la cancelación del observador", async () => {
  const api = await service;
  const signal = new AbortController().signal;
  mock.calls = [];
  mock.data = { success: true, data: [{ id: "a", status: "pending", is_active: true }] };
  assert.equal((await api.getPendingPaymentRequests(signal)).length, 1);
  assert.equal(mock.calls[0].invalidated, api.pendingPaymentsEndpoint);
  assert.equal(mock.calls[1].options._skipDedup, true);
  assert.equal(mock.calls[1].options.signal, signal);
  mock.data = { success: true, data: [{ id: "b", status: "pending" }, { id: "a", status: "paid" }] };
  assert.deepEqual((await api.getPendingPaymentRequests()).map((row) => row.id), ["b"]);
});

test("respuestas inválidas y errores de red no se confunden con una lista vacía", async () => {
  const api = await service;
  for (const data of [{ success: false }, { success: true, data: null }]) {
    mock.data = data;
    await assert.rejects(api.getPendingPaymentRequests());
  }
  mock.error = new Error("Red no disponible");
  await assert.rejects(api.getPendingPaymentRequests(), /Red no disponible/);
  delete mock.error;
});

test("todos los eventos refrescan y el desmontaje retira los listeners", async () => {
  const api = await service;
  const target = new EventTarget();
  let count = 0;
  const unsubscribe = api.subscribePendingPaymentChanges(target, () => count++);
  for (const event of api.pendingPaymentEvents) target.dispatchEvent(new Event(event));
  assert.equal(count, 5);
  unsubscribe();
  target.dispatchEvent(new Event("paymentRequestCreated"));
  assert.equal(count, 5);
});

test("dos lectores comparten la solicitud y se actualizan al crear y completar pagos", async () => {
  const api = await service;
  mock.calls = [];
  mock.data = { success: true, data: [] };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const options = { queryKey: api.pendingPaymentsKey, queryFn: ({ signal }) => api.getPendingPaymentRequests(signal), staleTime: 0 };
  const counts = [0, 0];
  const observers = [0, 1].map((index) => new QueryObserver(client, options).subscribe((state) => {
    counts[index] = (state.data as any[])?.length || 0;
  }));
  const target = new EventTarget();
  let refreshed: Promise<void> = Promise.resolve();
  const unsubscribe = api.subscribePendingPaymentChanges(target, () => {
    refreshed = client.invalidateQueries({ queryKey: api.pendingPaymentsKey }, { cancelRefetch: false });
  });
  try {
    await client.fetchQuery(options);
    assert.equal(mock.calls.filter((call) => call.path).length, 1);
    mock.data = { success: true, data: [{ id: "nueva", amount: "43.80", status: "pending" }] };
    target.dispatchEvent(new Event("paymentRequestCreated"));
    await refreshed;
    assert.deepEqual(counts, [1, 1]);
    mock.data = { success: true, data: [] };
    target.dispatchEvent(new Event("paymentRequestPaid"));
    await refreshed;
    assert.deepEqual(counts, [0, 0]);
  } finally {
    unsubscribe();
    observers.forEach((dispose) => dispose());
    client.clear();
  }
});

test("el formulario comprueba el lote antes de registrar evidencias o movimientos", async () => {
  const api = await service;
  const selected = [{ id: "a", amount: "43.80" }];
  mock.data = { success: true, data: [{ id: "a", amount: "43.80", status: "pending" }] };
  await api.validatePendingPaymentBatch(selected);
  for (const rows of [[], [{ id: "a", amount: "44.00", status: "pending" }], [{ id: "a", amount: "43.80", status: "paid" }]]) {
    mock.data = { success: true, data: rows };
    await assert.rejects(api.validatePendingPaymentBatch(selected), /El lote cambió/);
  }
  await assert.rejects(api.validatePendingPaymentBatch([]), /sin duplicados/);
  await assert.rejects(api.validatePendingPaymentBatch([...selected, ...selected]), /sin duplicados/);
  const form = readFileSync(resolve("src/components/Contabilidad/LiquidacionForm.tsx"), "utf8");
  assert.ok(form.indexOf("await validatePendingPaymentBatch(selectedPayments)") < form.indexOf("await uploadFile("));
  assert.match(form, /\[isOpen, selectedPaymentSignature\]/);
  assert.match(form, /loading \|\| isUploading \|\| pendingValidation/);
});

test("Cuentas, Movimientos, pp-modal y lotes usan el mismo flujo con recuperación", () => {
  const source = (path: string) => readFileSync(resolve("src", path), "utf8");
  for (const page of ["pages/Contabilidad/Caja/Caja.tsx", "pages/Contabilidad/Files/Files.tsx"]) {
    assert.match(source(page), /<PendingPaymentsAccess onPaymentSaved=/);
  }
  const access = source("components/Contabilidad/PendingPaymentsAccess.tsx");
  assert.match(access, /<PendingPaymentsModal isOpen=/);
  assert.match(access, /<MovimientoForm tipo="egreso" isOpen initialData=\{paymentData\}/);
  const modal = source("components/Contabilidad/PendingPaymentsModal.tsx");
  assert.match(modal, /usePendingPaymentRequests\(isOpen\)/);
  assert.match(modal, /await pending.refetch\(\)/);
  assert.match(modal, /if \(!request\)/);
  const batches = source("pages/Contabilidad/Liquidaciones/Liquidaciones.tsx");
  assert.match(batches, /usePendingPaymentRequests\(\)/);
  assert.match(batches, /reconcilePendingPaymentSelection/);
  assert.doesNotMatch(batches, /Excluyendo servicio extra/);
  const hook = source("hooks/usePendingPaymentRequests.ts");
  assert.match(hook, /refetchOnWindowFocus: true/);
  assert.match(hook, /refetchOnReconnect: true/);
  assert.match(hook, /refetchInterval: 30_000/);
  assert.match(source("context/NotificationContext.tsx"), /contextData.type === "pagos_solicitados_batch"/);
  assert.match(source("router/ContabilidadRoutes.tsx"), /path="\/egresos" element=\{<Navigate to="\/contabilidad\/movimientos"/);
});
