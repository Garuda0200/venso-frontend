import React, { useEffect, useRef } from "react";
import { MdAttachMoney } from "react-icons/md";

export default function PaymentBatchBar({ count, selectedCount, total, formatAmount, onSelectAll, onRequest, disabled = false }: {
  count: number; selectedCount: number; total: number; formatAmount: (value: number) => string;
  onSelectAll: () => void; onRequest: () => void; disabled?: boolean;
}) {
  const checkbox = useRef<HTMLInputElement>(null);
  useEffect(() => { if (checkbox.current) checkbox.current.indeterminate = selectedCount > 0 && selectedCount < count; }, [selectedCount, count]);
  return <footer className="batch-request-bar" aria-label="Solicitudes de pago por lote">
    <label className="batch-select-all">
      <input ref={checkbox} type="checkbox" checked={count > 0 && selectedCount === count}
        disabled={disabled || count === 0} onChange={onSelectAll} />
      <span>{count > 0 ? `Seleccionar disponibles (${count})` : "Sin servicios disponibles para solicitar"}</span>
    </label>
    <div className="batch-selection-summary" aria-live="polite">
      <span>{selectedCount} seleccionados</span><strong>{formatAmount(total)}</strong>
    </div>
    <button type="button" className="batch-request-button" onClick={onRequest}
      disabled={disabled || selectedCount === 0 || selectedCount > 100}>
      <MdAttachMoney /> Solicitar en lote
    </button>
    {selectedCount > 100 && <small role="alert">Selecciona como máximo 100 servicios por lote.</small>}
  </footer>;
}
