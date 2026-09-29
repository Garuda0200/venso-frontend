import React from "react";
import {
  MdCheckCircle,
  MdClose,
  MdDelete,
  MdInfo,
  MdWarning,
} from "react-icons/md";
import "./ConfirmationModal.scss";

const TYPE_CONFIG = {
  danger: {
    icon: MdDelete,
    tone: "danger",
    eyebrow: "Accion irreversible",
    helper: "Se eliminara el registro seleccionado del sistema.",
  },
  warning: {
    icon: MdWarning,
    tone: "warning",
    eyebrow: "Confirmacion requerida",
    helper: "Revisa los datos antes de continuar.",
  },
  info: {
    icon: MdInfo,
    tone: "info",
    eyebrow: "Confirmacion",
    helper: "La accion se ejecutara al confirmar.",
  },
  success: {
    icon: MdCheckCircle,
    tone: "success",
    eyebrow: "Listo para confirmar",
    helper: "Puedes continuar con esta accion.",
  },
};

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirmar accion",
  message = "Esta seguro que desea continuar?",
  type = "warning",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  loading = false,
}) => {
  if (!isOpen) return null;

  const config = TYPE_CONFIG[type] || TYPE_CONFIG.warning;
  const Icon = config.icon;
  const loadingText = type === "danger" ? "Eliminando..." : "Procesando...";

  const handleConfirm = () => {
    if (!loading) onConfirm?.();
  };

  const handleCancel = () => {
    if (!loading) onClose?.();
  };

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget && !loading) {
      onClose?.();
    }
  };

  return (
    <div className="confirmation-modal-overlay" onClick={handleOverlayClick}>
      <section
        className={`confirmation-modal confirmation-modal--${config.tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
        aria-describedby="confirmation-modal-message"
      >
        <div className="confirmation-modal__accent" />

        <header className="confirmation-modal__header">
          <div className="confirmation-modal__icon-shell" aria-hidden="true">
            <Icon />
          </div>

          <div className="confirmation-modal__heading">
            <span className="confirmation-modal__eyebrow">
              {config.eyebrow}
            </span>
            <h3 id="confirmation-modal-title">{title}</h3>
          </div>

          {!loading && (
            <button
              className="confirmation-modal__close"
              onClick={handleCancel}
              title="Cerrar"
              type="button"
            >
              <MdClose />
            </button>
          )}
        </header>

        <div className="confirmation-modal__body">
          <p id="confirmation-modal-message">{message}</p>
          <div className="confirmation-modal__note">{config.helper}</div>
        </div>

        <footer className="confirmation-modal__footer">
          <button
            className="confirmation-modal__button confirmation-modal__button--ghost"
            disabled={loading}
            onClick={handleCancel}
            type="button"
          >
            {cancelText}
          </button>

          <button
            className="confirmation-modal__button confirmation-modal__button--confirm"
            disabled={loading}
            onClick={handleConfirm}
            type="button"
          >
            {loading ? (
              <span className="confirmation-modal__loader" aria-hidden="true" />
            ) : (
              <Icon aria-hidden="true" />
            )}
            <span>{loading ? loadingText : confirmText}</span>
          </button>
        </footer>
      </section>
    </div>
  );
};

export default ConfirmationModal;
