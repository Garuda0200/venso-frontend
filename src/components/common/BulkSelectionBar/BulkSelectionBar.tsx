import React, { useEffect, useRef } from "react";
import { MdClose } from "react-icons/md";
import { BULK_SELECTION_LIMIT } from "../../../hooks/useBulkSelection";
import "./BulkSelectionBar.scss";

/**
 * Barra de acciones por lote. `visibleCount`/`visibleSelectedCount` controlan
 * el checkbox "seleccionar visibles"; `selectedCount` es el total entre páginas.
 */
export default function BulkSelectionBar({
  visibleCount,
  visibleSelectedCount,
  selectedCount,
  onToggleVisible,
  onClear,
  children,
  limit = BULK_SELECTION_LIMIT,
  itemLabel = "elementos",
}: {
  visibleCount: number;
  visibleSelectedCount: number;
  selectedCount: number;
  onToggleVisible: () => void;
  onClear: () => void;
  children?: React.ReactNode;
  limit?: number;
  itemLabel?: string;
}) {
  const checkbox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (checkbox.current) {
      checkbox.current.indeterminate =
        visibleSelectedCount > 0 && visibleSelectedCount < visibleCount;
    }
  }, [visibleSelectedCount, visibleCount]);

  return (
    <div className={`bulk-selection-bar${selectedCount ? " is-active" : ""}`} aria-label="Acciones por lote">
      <label className="bulk-selection-bar__all">
        <input
          ref={checkbox}
          type="checkbox"
          checked={visibleCount > 0 && visibleSelectedCount === visibleCount}
          disabled={visibleCount === 0}
          onChange={onToggleVisible}
        />
        <span>Seleccionar visibles ({visibleCount})</span>
      </label>

      <div className="bulk-selection-bar__summary" aria-live="polite">
        <strong>{selectedCount}</strong> {itemLabel} seleccionados
        {selectedCount > 0 && (
          <button type="button" className="bulk-selection-bar__clear" onClick={onClear}>
            <MdClose /> Limpiar
          </button>
        )}
      </div>

      {selectedCount > 0 && <div className="bulk-selection-bar__actions">{children}</div>}

      {selectedCount > limit && (
        <small className="bulk-selection-bar__warning" role="alert">
          Selecciona como máximo {limit} {itemLabel} por lote.
        </small>
      )}
    </div>
  );
}
