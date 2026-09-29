import React, { useEffect } from "react";
import {
  MdCheckCircle,
  MdError,
  MdWarning,
  MdInfo,
  MdClose,
} from "react-icons/md";
import "./NotificationToast.scss";

/**
 * Componente de notificación toast
 * @param {Object} props - Props del componente
 * @param {boolean} props.isVisible - Si la notificación está visible
 * @param {string} props.message - Mensaje de la notificación
 * @param {string} props.type - Tipo: 'success', 'error', 'warning', 'info'
 * @param {number} props.duration - Duración en ms (opcional)
 * @param {function} props.onClose - Función para cerrar la notificación
 */
const NotificationToast = ({
  isVisible,
  message,
  type = "info",
  duration = 3000,
  onClose,
}) => {
  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  if (!isVisible) return null;

  // Configuración por tipo
  const typeConfig = {
    success: {
      icon: MdCheckCircle,
      className: "toast-success",
      iconColor: "#27ae60",
    },
    error: {
      icon: MdError,
      className: "toast-error",
      iconColor: "#dc3545",
    },
    warning: {
      icon: MdWarning,
      className: "toast-warning",
      iconColor: "#f39c12",
    },
    info: {
      icon: MdInfo,
      className: "toast-info",
      iconColor: "#3498db",
    },
  };

  const config = typeConfig[type] || typeConfig.info;
  const IconComponent = config.icon;

  return (
    <div className={`notification-toast ${config.className}`}>
      <div className="toast-content">
        <div className="toast-icon" style={{ color: config.iconColor }}>
          <IconComponent />
        </div>
        <div className="toast-message">{message}</div>
        <button className="toast-close" onClick={onClose} title="Cerrar">
          <MdClose />
        </button>
      </div>

      {/* Barra de progreso animada */}
      {duration > 0 && (
        <div className="toast-progress">
          <div
            className="toast-progress-bar"
            style={{
              animationDuration: `${duration}ms`,
            }}
          />
        </div>
      )}
    </div>
  );
};

export default NotificationToast;
