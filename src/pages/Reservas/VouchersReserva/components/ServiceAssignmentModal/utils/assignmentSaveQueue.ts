export type AssignmentUpdate = { servicio_id: number; is_assigned: boolean; [key: string]: any };
export type AssignmentSaveState = "saved" | "pending" | "saving" | "offline" | "error";
type Serialize = (service: any) => Record<string, any>;

/** Solo serializa assigned_*; la tarifa comercial nunca es una alternativa. */
export function assignmentUpdates(itinerary: any[], pricing: Serialize): AssignmentUpdate[] {
  return (itinerary || []).flatMap(day => (day.servicios || []).flatMap((service: any) => {
    const id = Number(service.servicioId ?? service.id);
    if (!Number.isInteger(id) || id <= 0) return [];
    if (!service.isAssigned) return [{ servicio_id: id, is_assigned: false }];
    const wrapper = service.assignedService || {};
    const hour = Object.prototype.hasOwnProperty.call(wrapper, "hora") ? wrapper.hora
      : service.assignedHora ?? service.assigned_hora ?? service.hora;
    return [{ servicio_id: id, ...pricing(service),
      assigned_parent_id: null, assigned_child_id: null,
      hora: hour === "" ? null : hour ?? null, is_assigned: true }];
  }));
}

const snapshot = (updates: AssignmentUpdate[]) => JSON.parse(JSON.stringify(updates)) as AssignmentUpdate[];

/** Una sola escritura en vuelo. Cada confirmación reconoce su snapshot, no el
 * estado más nuevo: las ediciones realizadas durante un PUT se encadenan. */
export class AssignmentSaveQueue {
  private baseline = new Map<number, string>();
  private current: AssignmentUpdate[] = [];
  private inFlight: Promise<boolean> | null = null;
  private ready = false;

  constructor(private readonly send: (updates: AssignmentUpdate[]) => Promise<unknown>,
    private readonly report: (state: AssignmentSaveState, updates: AssignmentUpdate[], error?: unknown) => void,
    private readonly confirmed: (updates: AssignmentUpdate[]) => void = () => {},
    private readonly online: () => boolean = () => true) {}

  get initialized() { return this.ready; }
  get busy() { return this.inFlight !== null; }
  pending() { return snapshot(this.current.filter(row => this.baseline.get(row.servicio_id) !== JSON.stringify(row))); }

  load(updates: AssignmentUpdate[]) {
    if (this.ready && (this.busy || this.pending().length)) return false;
    this.current = snapshot(updates);
    this.baseline = new Map(this.current.map(row => [row.servicio_id, JSON.stringify(row)]));
    this.ready = true;
    this.report("saved", []);
    return true;
  }

  change(updates: AssignmentUpdate[], persistedServiceId?: number) {
    if (!this.ready) throw new Error("El itinerario todavía no está listo para guardar");
    const ids = new Set(updates.map(row => row.servicio_id));
    // Quitar una fila del editor también retira su validación persistida.
    const removed = this.current.filter(row => !ids.has(row.servicio_id))
      .map(row => ({ servicio_id: row.servicio_id, is_assigned: false }));
    this.current = snapshot([...updates, ...removed]);
    if (persistedServiceId) {
      const persisted = this.current.find(row => row.servicio_id === persistedServiceId);
      if (persisted) { this.baseline.set(persistedServiceId, JSON.stringify(persisted)); this.confirmed([persisted]); }
    }
    const pending = this.pending();
    this.report(this.busy ? "saving" : pending.length ? (this.online() ? "pending" : "offline") : "saved", pending);
  }

  restore(updates: AssignmentUpdate[]) {
    const restored = new Map(updates.map(row => [row.servicio_id, row]));
    this.change(this.current.map(row => restored.get(row.servicio_id) || row));
  }

  discardPending() {
    if (this.busy) return false;
    this.current = [...this.baseline.values()].map(row => JSON.parse(row));
    this.report("saved", []);
    return true;
  }

  flush(): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    // Se registra la promesa antes de entrar al send, incluso si es síncrono.
    this.inFlight = Promise.resolve().then(async () => {
      while (this.pending().length) {
        const allPending = this.pending();
        if (!this.online()) { this.report("offline", allPending); return false; }
        const sent = allPending.slice(0, 100);
        this.report("saving", allPending);
        try {
          await this.send(sent);
        } catch (error) {
          this.report("error", this.pending(), error);
          return false;
        }
        sent.forEach(row => this.baseline.set(row.servicio_id, JSON.stringify(row)));
        this.confirmed(sent);
      }
      this.report("saved", []);
      return true;
    }).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
}

export const ASSIGNMENT_DRAFT_TTL = 24 * 60 * 60 * 1000;
export function readAssignmentDraft(storage: Storage, key: string, now = Date.now()): AssignmentUpdate[] {
  try {
    const draft = JSON.parse(storage.getItem(key) || "null");
    if (!draft || draft.version !== 1 || !Number.isFinite(draft.updatedAt)
      || now - draft.updatedAt > ASSIGNMENT_DRAFT_TTL || draft.updatedAt > now
      || !Array.isArray(draft.updates) || draft.updates.some((row: any) =>
        !Number.isInteger(row?.servicio_id) || row.servicio_id <= 0 || typeof row.is_assigned !== "boolean")) {
      storage.removeItem(key); return [];
    }
    return draft.updates;
  } catch { return []; }
}
