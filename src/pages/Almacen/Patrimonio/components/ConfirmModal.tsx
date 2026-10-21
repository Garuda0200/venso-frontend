import { FaExclamationTriangle, FaTimes } from "react-icons/fa";
import { itemName } from "../utils";

/** Confirma la desactivación de un bien (`item`) o de un lote (`items`). */
export default function ConfirmModal({ item = null, items = null, onClose, onConfirm, busy = false }) {
  const isBatch = Array.isArray(items);
  return (
    <div className="patrimonio-modal-backdrop" onClick={onClose}>
      <div
        className="patrimonio-modal patrimonio-confirm"
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="patrimonio-confirm-header">
          <div className="patrimonio-modal-title">
            <span className="patrimonio-modal-icon"><FaExclamationTriangle /></span>
            <h3>{isBatch ? `Desactivar ${items.length} bienes` : "Desactivar bien patrimonial"}</h3>
          </div>
          <button className="patrimonio-icon-btn" onClick={onClose} type="button">
            <FaTimes />
          </button>
        </header>
        <div className="patrimonio-confirm-body">
          {isBatch ? (
            <>
              <p>Se desactivarán los siguientes bienes. Cada uno conserva su historial.</p>
              <div className="patrimonio-batch-codes">
                {items.map((selected) => (
                  <span key={selected.id} className="patrimonio-code-chip">{selected.codigo}</span>
                ))}
              </div>
            </>
          ) : (
            <p>
              Se desactivará <strong>{itemName(item)}</strong>. El historial se conserva.
            </p>
          )}
        </div>
        <footer>
          <button type="button" className="patrimonio-secondary-btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="patrimonio-primary-btn danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Desactivando..." : "Desactivar"}
          </button>
        </footer>
      </div>
    </div>
  );
}
