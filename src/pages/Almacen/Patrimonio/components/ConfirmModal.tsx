import { FaExclamationTriangle, FaTimes } from "react-icons/fa";
import { itemName } from "../utils";

export default function ConfirmModal({ item, onClose, onConfirm }) {
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
            <h3>Desactivar bien patrimonial</h3>
          </div>
          <button className="patrimonio-icon-btn" onClick={onClose} type="button">
            <FaTimes />
          </button>
        </header>
        <div className="patrimonio-confirm-body">
          <p>
            Se desactivará <strong>{itemName(item)}</strong>. El historial se conserva.
          </p>
        </div>
        <footer>
          <button type="button" className="patrimonio-secondary-btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="patrimonio-primary-btn danger" onClick={onConfirm}>
            Desactivar
          </button>
        </footer>
      </div>
    </div>
  );
}
