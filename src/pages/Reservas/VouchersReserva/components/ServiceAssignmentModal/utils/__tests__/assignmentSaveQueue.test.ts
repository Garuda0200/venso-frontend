import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AssignmentSaveQueue, assignmentUpdates, readAssignmentDraft, ASSIGNMENT_DRAFT_TTL } from "../assignmentSaveQueue";
import { cloneReservationItinerary } from "../../../ReservaServiceEditor/utils/itineraryDraft";

const row = (id = 1, price = 10) => ({ servicio_id: id, is_assigned: true, assigned_precio_total: price, hora: "08:00" });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };

test("abrir o refrescar sin ediciones no genera PUT", async () => {
  let calls = 0;
  const queue = new AssignmentSaveQueue(async () => { calls++; }, () => {});
  queue.load([row()]); await queue.flush(); queue.load([row()]); await queue.flush();
  assert.equal(calls, 0);
});

test("la validación inicial ya confirmada no se vuelve a guardar", async () => {
  let calls = 0; let confirmed = 0;
  const queue = new AssignmentSaveQueue(async () => { calls++; }, () => {}, () => { confirmed++; });
  queue.load([{ servicio_id: 1, is_assigned: false }]);
  queue.change([row()], 1); await queue.flush();
  assert.equal(calls, 0); assert.equal(confirmed, 1); assert.deepEqual(queue.pending(), []);
});

test("encadena cambios de precio, hora y beneficiarios realizados durante el guardado", async () => {
  const gates = [deferred(), deferred(), deferred()];
  const started = [deferred(), deferred(), deferred()];
  const calls: any[] = [];
  const queue = new AssignmentSaveQueue(async updates => {
    const index = calls.push(updates) - 1; started[index].resolve(); await gates[index].promise;
  }, () => {});
  queue.load([row()]); queue.change([row(1, 20)]);
  const operation = queue.flush(); await started[0].promise;
  const newer = { ...row(1, 30), hora: "11:30", assigned_beneficiarios_ninos: [] };
  queue.change([newer]); assert.equal(queue.flush(), operation);
  assert.equal(queue.load([row(1, 20)]), false, "una recarga no pisa cambios en vuelo");
  gates[0].resolve(); await started[1].promise;
  queue.change([{ ...newer, hora: null }]); gates[1].resolve(); await started[2].promise;
  gates[2].resolve(); assert.equal(await operation, true);
  assert.equal(calls.length, 3); assert.equal(calls[0][0].assigned_precio_total, 20);
  assert.equal(calls[1][0].assigned_precio_total, 30); assert.equal(calls[2][0].hora, null);
  assert.deepEqual(queue.pending(), []);
});

test("un fallo conserva el estado más nuevo y el reintento no duplica snapshots antiguos", async () => {
  const gate = deferred(); const started = deferred(); const calls: any[] = []; let fails = true;
  const reports: any[] = [];
  const queue = new AssignmentSaveQueue(async updates => {
    calls.push(updates); if (fails) { started.resolve(); await gate.promise; throw new Error("Red caída"); }
  }, (state, updates) => reports.push({ state, updates }));
  queue.load([row()]); queue.change([row(1, 20)]); const operation = queue.flush(); await started.promise;
  queue.change([row(1, 35)]); gate.resolve(); assert.equal(await operation, false);
  assert.equal(reports.at(-1).state, "error"); assert.equal(reports.at(-1).updates[0].assigned_precio_total, 35);
  fails = false; assert.equal(await queue.flush(), true);
  assert.deepEqual(calls.map(items => items[0].assigned_precio_total), [20, 35]);
});

test("offline protege el borrador sin petición y al reconectar guarda una vez", async () => {
  let online = false; let calls = 0; let state = "";
  const queue = new AssignmentSaveQueue(async () => { calls++; }, value => { state = value; }, undefined, () => online);
  queue.load([row()]); queue.change([row(1, 22)]);
  assert.equal(await queue.flush(), false); assert.equal(state, "offline"); assert.equal(calls, 0);
  online = true; assert.equal(await queue.flush(), true); assert.equal(calls, 1);
});

test("descartar explícitamente no envía cambios y permite recargar, pero nunca interrumpe una escritura", async () => {
  const gate = deferred(); let calls = 0;
  const queue = new AssignmentSaveQueue(async () => { calls++; await gate.promise; }, () => {});
  queue.load([row()]); queue.change([row(1, 20)]);
  assert.equal(queue.discardPending(), true); assert.deepEqual(queue.pending(), []); assert.equal(calls, 0);
  assert.equal(queue.load([row(1, 10)]), true);
  queue.change([row(1, 25)]); const operation = queue.flush();
  assert.equal(queue.discardPending(), false); gate.resolve(); await operation;
  assert.equal(calls, 1); assert.deepEqual(queue.pending(), []);
});

test("solo manda servicios modificados y divide lotes grandes en bloques permitidos", async () => {
  const calls: any[] = [];
  const queue = new AssignmentSaveQueue(async updates => { calls.push(updates); }, () => {});
  queue.load(Array.from({ length: 205 }, (_, index) => row(index + 1)));
  queue.change(Array.from({ length: 205 }, (_, index) => row(index + 1, 20)));
  await queue.flush(); assert.deepEqual(calls.map(items => items.length), [100, 100, 5]);
  queue.change(Array.from({ length: 205 }, (_, index) => row(index + 1, index === 7 ? 30 : 20)));
  await queue.flush(); assert.deepEqual(calls[3].map(item => item.servicio_id), [8]);
});

test("precio cero, desvalidación y eliminación de la hora conservan su significado", () => {
  const itinerary = [{ servicios: [{ servicioId: 1, isAssigned: true, precioTotal: 900,
    assignedPrecioTotal: 0, assignedService: { hora: "" }, hora: "10:00" }, { servicioId: 2, isAssigned: false }] }];
  const updates = assignmentUpdates(itinerary, service => ({ assigned_precio_total: service.assignedPrecioTotal }));
  assert.equal(updates[0].assigned_precio_total, 0); assert.equal(updates[0].hora, null);
  assert.equal(updates[0].assigned_parent_id, null); assert.equal(updates[1].is_assigned, false);
  assert.equal("precioTotal" in updates[0], false);
});

test("borradores caducados o corruptos no se aplican; recuperar respeta IDs vigentes", async () => {
  const storage: any = { value: "", getItem() { return this.value; }, removeItem() { this.value = ""; } };
  storage.value = JSON.stringify({ version: 1, updatedAt: 1000, updates: [row()] });
  assert.equal(readAssignmentDraft(storage, "k", 1001).length, 1);
  assert.deepEqual(readAssignmentDraft(storage, "k", 1001 + ASSIGNMENT_DRAFT_TTL), []);
  storage.value = JSON.stringify({ version: 1, updatedAt: 1000, updates: [{ servicio_id: -1, is_assigned: true }] });
  assert.deepEqual(readAssignmentDraft(storage, "k", 1001), []);
  const calls: any[] = []; const queue = new AssignmentSaveQueue(async updates => { calls.push(updates); }, () => {});
  queue.load([row(1)]); queue.restore([row(1, 25), row(999, 90)]); await queue.flush();
  assert.deepEqual(calls[0].map(item => item.servicio_id), [1]);
});

test("la salida espera el guardado y propaga el resultado de crear la reserva", () => {
  const source = (path: string) => readFileSync(resolve("src/pages/Reservas/VouchersReserva", path), "utf8");
  const modal = source("components/ServiceAssignmentModal/ServiceAssignmentModal.tsx");
  assert.match(modal, /await autosave.flush\(\)/);
  assert.match(modal, /created === false/);
  assert.match(modal, /onBeforeValidation=\{autosave.flush\}/);
  assert.match(modal, /if \(validationInProgress\)/);
  assert.doesNotMatch(modal, /Autoguardado per-service|setTimeout\(async \(\) =>/);
  assert.match(source("VouchersReserva.tsx"), /return handleSaveServiceAssignments\(voucherId, serviceAssignments\)/);
  assert.match(source("components/PaymentManagementModal/PaymentManagementModal.tsx"), /"reservationAssignmentsSaved"/);
});

test("retirar una fila validada del editor también persiste su desvalidación", async () => {
  const calls: any[] = [];
  const queue = new AssignmentSaveQueue(async rows => { calls.push(rows); }, () => {});
  queue.load([row(1), row(2)]); queue.change([row(1)]);
  await queue.flush(); queue.change([row(1, 15)]); await queue.flush();
  assert.deepEqual(calls[0], [{ servicio_id: 2, is_assigned: false }]);
  assert.deepEqual(calls[1].map((row: any) => row.servicio_id), [1]);
});

test("editar precio/hora o retirar una fila no muta el itinerario original", () => {
  const original = [{ numero: 1, servicios: [{ servicioId: 1, hora: "08:00", assignedService: { hora: "08:00" } }, { servicioId: 2 }] }];
  const copy = cloneReservationItinerary(original);
  copy[0].servicios[0].hora = "10:00";
  copy[0].servicios[0].assignedService = { hora: "10:00" };
  copy[0].servicios.splice(1, 1);
  assert.equal(original[0].servicios.length, 2);
  assert.equal(original[0].servicios[0].hora, "08:00");
  assert.equal(original[0].servicios[0].assignedService?.hora, "08:00");
});

test("la recuperación online recarga el editor y una sesión vieja no altera el file abierto", () => {
  const source = (path: string) => readFileSync(resolve("src/pages/Reservas/VouchersReserva/components/ServiceAssignmentModal", path), "utf8");
  const hook = source("hooks/useAssignmentAutosave.ts");
  assert.match(hook, /activeKey.current === key/);
  assert.match(hook, /if \(activeKey.current !== key\)/);
  assert.match(hook, /\.\.\.identity/);
  assert.match(hook, /setRecoveryRevision\(value => value \+ 1\)/);
  assert.match(hook, /const onOnline = .*void flush\(\)/);
  assert.match(source("ServiceAssignmentModal.tsx"), /\[autosave.recoveryRevision\]/);
  assert.match(source("ServiceAssignmentModal.tsx"), /return \(\) => \{ disposed = true; \}/);
});
