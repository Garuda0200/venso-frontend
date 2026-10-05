import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createBibliaRowDraftStore } from "../utils/bibliaRowDrafts";

export function useBibliaRowDrafts() {
  const store = useMemo(createBibliaRowDraftStore, []);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const hasDrafts = Object.values(snapshot.rows).some(row => Object.keys(row.values).length > 0);
  useEffect(() => {
    if (!hasDrafts) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasDrafts]);
  return { ...snapshot, store, hasDrafts };
}
