import { useCallback, useMemo, useState } from "react";

export const BULK_SELECTION_LIMIT = 100;

/**
 * Selección múltiple que sobrevive a la paginación: guarda el item completo
 * por id para poder operar (o imprimir) sin volver a pedirlo al backend.
 */
export default function useBulkSelection<T>(getId: (item: T) => string | number) {
  const [selected, setSelected] = useState<Map<string | number, T>>(() => new Map());

  const isSelected = useCallback(
    (item: T) => selected.has(getId(item)),
    [getId, selected],
  );

  const toggle = useCallback(
    (item: T) =>
      setSelected((current) => {
        const next = new Map(current);
        const id = getId(item);
        if (next.has(id)) next.delete(id);
        else next.set(id, item);
        return next;
      }),
    [getId],
  );

  /** Si todos los visibles están seleccionados los quita; si no, los agrega. */
  const toggleAll = useCallback(
    (visible: T[]) =>
      setSelected((current) => {
        const next = new Map(current);
        const allSelected =
          visible.length > 0 && visible.every((item) => next.has(getId(item)));
        visible.forEach((item) => {
          if (allSelected) next.delete(getId(item));
          else next.set(getId(item), item);
        });
        return next;
      }),
    [getId],
  );

  /** Refresca los items guardados con su versión más reciente y descarta los que ya no cumplen `keep`. */
  const sync = useCallback(
    (fresh: T[], keep: (item: T) => boolean = () => true) =>
      setSelected((current) => {
        if (current.size === 0) return current;
        const freshById = new Map(fresh.map((item) => [getId(item), item]));
        const next = new Map<string | number, T>();
        current.forEach((item, id) => {
          const latest = freshById.get(id) ?? item;
          if (keep(latest)) next.set(id, latest);
        });
        return next;
      }),
    [getId],
  );

  const clear = useCallback(() => setSelected(new Map()), []);

  const items = useMemo(() => [...selected.values()], [selected]);

  return {
    items,
    ids: useMemo(() => [...selected.keys()], [selected]),
    count: selected.size,
    overLimit: selected.size > BULK_SELECTION_LIMIT,
    isSelected,
    toggle,
    toggleAll,
    sync,
    clear,
  };
}
