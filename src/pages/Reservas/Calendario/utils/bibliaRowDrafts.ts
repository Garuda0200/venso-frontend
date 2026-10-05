import type { BibliaActivity } from "./bibliaActivityMapper";
import { BIBLIA_EMPTY_VALUE } from "./bibliaActivityMapper";
import { getBibliaSaveError } from "./bibliaSyncFeedback";

export type BibliaCellDrafts = Partial<Record<keyof BibliaActivity, string>>;
export interface BibliaRowDraft {
  values: BibliaCellDrafts;
  savedVersion: number;
  saved: boolean;
  error: string;
}
interface BibliaDraftSnapshot {
  rows: Record<string, BibliaRowDraft>;
  savingId: string | null;
}

const comparable = (value: unknown) => {
  const text = String(value ?? "").trim();
  return ["", BIBLIA_EMPTY_VALUE, "Sin hora"].includes(text) ? "" : text;
};

/** Normaliza solo al guardar: un borrador numérico incompleto no se pierde. */
export function buildBibliaRowChanges(activity: BibliaActivity, values: BibliaCellDrafts): Partial<BibliaActivity> {
  const changes: Record<string, unknown> = {};
  for (const [field, text] of Object.entries(values)) {
    if (field === "pax") {
      const pax = Number(text || 0);
      if (!Number.isInteger(pax) || pax < 0) throw new Error("PAX debe ser un número entero mayor o igual a cero.");
      changes[field] = pax;
    } else {
      changes[field] = text.trim() || BIBLIA_EMPTY_VALUE;
    }
  }
  const richText = activity.sourceExcel?.richText;
  if (richText && Object.keys(values).some(field => field in richText)) {
    changes.sourceExcel = {
      ...activity.sourceExcel,
      richText: Object.fromEntries(Object.entries(richText).filter(([field]) => !(field in values))),
    };
  }
  return changes as Partial<BibliaActivity>;
}

/** Borradores separados de los snapshots persistidos y de las exportaciones. */
export function createBibliaRowDraftStore() {
  let snapshot: BibliaDraftSnapshot = { rows: {}, savingId: null };
  const listeners = new Set<() => void>();
  const update = (next: BibliaDraftSnapshot) => {
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const row = (id: string): BibliaRowDraft => snapshot.rows[id]
    || { values: {}, savedVersion: 0, saved: false, error: "" };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    stage(activity: BibliaActivity, field: keyof BibliaActivity, value: string) {
      const current = row(activity.id);
      const values = { ...current.values };
      if (comparable(value) === comparable(activity[field])) delete values[field];
      else values[field] = value;
      update({ ...snapshot, rows: { ...snapshot.rows,
        [activity.id]: { ...current, values, error: "", saved: false } } });
    },
    discardField(id: string, field: keyof BibliaActivity) {
      const current = row(id);
      const values = { ...current.values };
      delete values[field];
      update({ ...snapshot, rows: { ...snapshot.rows, [id]: { ...current, values, error: "" } } });
    },
    discardRow(id: string) {
      if (snapshot.savingId === id) return;
      const rows = { ...snapshot.rows };
      delete rows[id];
      update({ ...snapshot, rows });
    },
    async save(activity: BibliaActivity, persist: (activity: BibliaActivity, changes: Partial<BibliaActivity>) => Promise<void>) {
      if (snapshot.savingId) return false;
      const captured = { ...row(activity.id).values };
      if (!Object.keys(captured).length) return true;
      update({ ...snapshot, savingId: activity.id,
        rows: { ...snapshot.rows, [activity.id]: { ...row(activity.id), error: "", saved: false } } });
      try {
        await persist(activity, buildBibliaRowChanges(activity, captured));
        // Si llega un borrador más nuevo, nunca lo marcamos como ya guardado.
        const current = row(activity.id);
        const values = { ...current.values };
        for (const [field, value] of Object.entries(captured)) {
          if (values[field] === value) delete values[field];
        }
        update({ ...snapshot, savingId: null, rows: { ...snapshot.rows,
          [activity.id]: { values, savedVersion: current.savedVersion + 1,
            saved: !Object.keys(values).length, error: "" } } });
        return true;
      } catch (error) {
        const message = getBibliaSaveError(error, error instanceof Error ? error.message : "No se pudo guardar. Puedes reintentar sin perder los cambios.");
        update({ ...snapshot, savingId: null, rows: { ...snapshot.rows,
          [activity.id]: { ...row(activity.id), saved: false, error: message } } });
        return false;
      }
    },
  };
}
