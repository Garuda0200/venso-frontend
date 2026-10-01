import React, { useId } from "react";
import { FiArrowRight, FiLock, FiRefreshCw, FiShield, FiWifiOff } from "react-icons/fi";
import { BRAND } from "../../config/brand";

interface BackendStatusCardProps {
  isAuthenticated: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  retryButtonRef?: React.Ref<HTMLButtonElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
}

/** Presentation only: activation remains in the shared wake workflow. */
const BackendStatusCard = ({
  isAuthenticated,
  isRetrying,
  onRetry,
  retryButtonRef,
  onKeyDown,
}: BackendStatusCardProps) => {
  const id = useId();
  return (
    <section
      className="backend-status-banner__card"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description ${id}-session`}
      onKeyDown={onKeyDown}
    >
      <header className="backend-status-banner__header">
        <div className="backend-status-banner__brand-row">
          <img className="backend-status-banner__brand" src={BRAND.assets.wordmarkWhite} alt={BRAND.name} width="100" height="30" />
          <span className={`backend-status-banner__state${isRetrying ? " is-retrying" : ""}`} role="status" aria-live="polite">
            <span className="backend-status-banner__dot" aria-hidden="true" />
            {isRetrying ? "Reconectando" : "En pausa"}
          </span>
        </div>
        <div className="backend-status-banner__heading">
          <span className="backend-status-banner__icon" aria-hidden="true"><FiWifiOff /></span>
          <div>
            <span className="backend-status-banner__eyebrow">ESTADO DEL SERVICIO</span>
            <h2 id={`${id}-title`}>Conexión en pausa</h2>
          </div>
        </div>
      </header>

      <div className="backend-status-banner__content">
        <p className="backend-status-banner__description" id={`${id}-description`}>
          El servidor no responde por el momento. Puedes intentar reconectar sin salir de esta pantalla.
        </p>
        <div className="backend-status-banner__session" id={`${id}-session`}>
          {isAuthenticated ? <FiShield aria-hidden="true" /> : <FiLock aria-hidden="true" />}
          <span>{isAuthenticated ? "Tu sesión se mantiene abierta" : "El acceso estará disponible al reconectar"}</span>
        </div>
        <button
          ref={retryButtonRef}
          className={`backend-status-banner__retry${isRetrying ? " is-retrying" : ""}`}
          type="button"
          aria-disabled={isRetrying}
          aria-busy={isRetrying}
          onClick={() => { if (!isRetrying) onRetry(); }}
        >
          <FiRefreshCw className="backend-status-banner__refresh" aria-hidden="true" />
          <span>{isRetrying ? "Intentando reconectar…" : "Reconectar ahora"}</span>
          {!isRetrying && <FiArrowRight className="backend-status-banner__arrow" aria-hidden="true" />}
        </button>
        <p className="backend-status-banner__hint">
          También reintentamos cuando vuelves a la aplicación o recuperas tu conexión.
        </p>
      </div>
    </section>
  );
};

export default BackendStatusCard;
