import { useEffect, useMemo, useRef, useState } from "react";
import { voucherReservaService } from "../../../../../../services/voucherReservaService";
import { invalidateReservaAssignmentGraphCache } from "../../../../../../utils/cacheInvalidation";
import SecureStorage from "../../../../../../utils/secureStorage";
import { AssignmentSaveQueue, AssignmentSaveState, AssignmentUpdate, assignmentUpdates, readAssignmentDraft } from "../utils/assignmentSaveQueue";

export function useAssignmentAutosave(voucher: any, serialize: (service: any) => Record<string, any>, enabled: boolean) {
  const [state, setState] = useState<AssignmentSaveState>("saved");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<AssignmentUpdate[]>([]);
  const [recovering, setRecovering] = useState(false);
  const [recoveryRevision, setRecoveryRevision] = useState(0);
  const latest = useRef<any[]>([]);
  const mounted = useRef(true);
  const key = `venso:assignment-draft:v1:${SecureStorage.getItem("dniuser") || "session"}:${voucher?.id || ""}`;
  const activeKey = useRef(key);
  activeKey.current = key;
  const recoverySession = useRef<string | null>(null);
  const readDraft = () => {
    try { return readAssignmentDraft(window.localStorage, key); } catch { return []; }
  };
  const queue = useMemo(() => {
    // Una petición anterior conserva la identidad del file que la originó.
    const identity = {
      voucher_venta_id: voucher?.id,
      voucher_reserva_id: voucher?.reservationVoucher?.id,
      voucher_code: voucher?.voucherCode || voucher?.voucher_code,
    };
    return new AssignmentSaveQueue(
    updates => voucherReservaService.assignServicesBatch(updates),
    (nextState, pending, saveError) => {
      try {
        if (pending.length) window.localStorage.setItem(key, JSON.stringify({ version: 1, updatedAt: Date.now(), updates: pending }));
        else window.localStorage.removeItem(key);
      } catch { /* Un navegador restringido no invalida el guardado remoto. */ }
      if (mounted.current && activeKey.current === key) {
        setState(nextState);
        setError(saveError ? (saveError as any)?.response?.data?.message || (saveError as any)?.response?.data?.error || (saveError as any)?.message || "No se pudo guardar" : "");
      }
    }, updates => {
      invalidateReservaAssignmentGraphCache();
      window.dispatchEvent(new CustomEvent("reservationAssignmentsSaved", { detail: {
        ...identity,
        itinerario_servicio_ids: updates.map(row => row.servicio_id),
      } }));
    }, () => typeof navigator === "undefined" || navigator.onLine,
    );
  }, [key]);

  const flush = async () => {
    const saved = await queue.flush();
    if (saved && mounted.current && activeKey.current === key && recoverySession.current === key) {
      recoverySession.current = null;
      setRecoveryRevision(value => value + 1);
    }
    return saved;
  };

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    latest.current = [];
    recoverySession.current = null;
    setDraft(readDraft());
    setRecovering(false); setRecoveryRevision(0);
    setState("saved"); setError("");
  }, [key]);

  useEffect(() => {
    if (!enabled) return;
    const onOnline = () => { if (queue.pending().length) void flush(); };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (queue.pending().length || queue.busy) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("beforeunload", beforeUnload); };
  }, [enabled, queue]);

  return {
    state, error, draft, latest, recovering, recoveryRevision,
    load(itinerary: any[]) {
      if (activeKey.current !== key) return latest.current;
      // Leer antes de load: el estado saved limpia únicamente un draft aceptado.
      const recovered = readDraft();
      if (!queue.load(assignmentUpdates(itinerary, serialize))) return latest.current;
      latest.current = itinerary;
      setRecovering(false);
      if (recovered.length) {
        setDraft(recovered);
        try { window.localStorage.setItem(key, JSON.stringify({ version: 1, updatedAt: Date.now(), updates: recovered })); } catch {}
      }
      return itinerary;
    },
    change(itinerary: any[], persistedServiceId?: number) {
      if (activeKey.current !== key) return Promise.resolve(false);
      latest.current = itinerary;
      queue.change(assignmentUpdates(itinerary, serialize), persistedServiceId);
      // Validaciones ya confirmadas se reconocen; los demás cambios se guardan
      // inmediatamente y se encadenan si hay otra petición en vuelo.
      return queue.flush();
    },
    flush,
    dirty: () => queue.pending().length > 0 || queue.busy,
    discardChanges() {
      if (!queue.discardPending()) return false;
      recoverySession.current = null;
      setDraft([]); setRecovering(true);
      setRecoveryRevision(value => value + 1);
      return true;
    },
    discardDraft() { setDraft([]); try { window.localStorage.removeItem(key); } catch {} },
    async restoreDraft() {
      if (queue.busy || queue.pending().length) return false;
      setRecovering(true);
      recoverySession.current = key;
      queue.restore(draft);
      setDraft([]);
      const saved = await flush();
      return saved;
    },
  };
}
