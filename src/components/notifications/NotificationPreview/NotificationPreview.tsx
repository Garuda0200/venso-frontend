import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNotificationContext } from "../../../context/NotificationContext";
import "./NotificationPreview.scss";

// Estados y tipos idénticos a Leptos
const NotificationPreviewType = {
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
  SSE: "sse",
};

// Componente individual de preview - idéntico a Leptos
const NotificationPreviewItem = ({ notification, onRemove }) => {
  const [isEntering, setIsEntering] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const [showCloseBtn, setShowCloseBtn] = useState(false);

  // Auto-eliminación igual que Leptos (5 segundos) - SIN CANCELAR POR INTERACCIONES
  useEffect(() => {
    let entryTimeout, autoRemoveTimeout, exitTimeout;

    // Animación de entrada
    entryTimeout = setTimeout(() => {
      setIsEntering(false);
      setShowCloseBtn(true);
    }, 600);

    // Auto-eliminación después de 5 segundos - SIEMPRE ejecutar (como Leptos)
    autoRemoveTimeout = setTimeout(() => {
      setIsExiting(true);

      // Esperar animación de salida
      exitTimeout = setTimeout(() => {
        onRemove(notification.id);
      }, 500);
    }, 5000);

    return () => {
      clearTimeout(entryTimeout);
      clearTimeout(autoRemoveTimeout);
      clearTimeout(exitTimeout);
    };
  }, [notification.id, onRemove]);

  // Manejar cierre manual - NO cancelar timers automáticos
  const handleClose = useCallback(
    (e) => {
      e.stopPropagation();

      setIsExiting(true);

      setTimeout(() => {
        onRemove(notification.id);
      }, 500);
    },
    [notification.id, onRemove],
  );

  // Determinar tipo CSS e ícono
  const getTypeInfo = () => {
    const type = notification.notification_type || NotificationPreviewType.INFO;

    switch (type) {
      case NotificationPreviewType.SSE:
        return { className: "type-sse", icon: "" };
      case NotificationPreviewType.SUCCESS:
        return { className: "type-success", icon: "" };
      case NotificationPreviewType.ERROR:
        return { className: "type-error", icon: "" };
      case NotificationPreviewType.WARNING:
        return { className: "type-warning", icon: "" };
      default:
        return { className: "type-info", icon: "" };
    }
  };

  const { className: typeClass, icon } = getTypeInfo();

  const previewClasses = [
    "notification-preview",
    typeClass,
    isEntering ? "entering" : "",
    isExiting ? "exiting" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={previewClasses} data-preview-id={notification.id}>
      <div className="preview-content">
        <div className="preview-icon">{icon}</div>

        <div className="preview-text">
          <h4 className="preview-title">
            {notification.title || notification.titulo}
          </h4>
          <p className="preview-message">
            {notification.message || notification.mensaje}
          </p>
          {notification.timestamp && (
            <div className="preview-timestamp">
              {new Date(notification.timestamp).toLocaleTimeString()}
            </div>
          )}
        </div>

        {showCloseBtn && (
          <button
            className="preview-close-btn"
            onClick={handleClose}
            title="Cerrar notificación"
          >
            ×
          </button>
        )}
      </div>

      {/* Barra de progreso para mostrar tiempo restante */}
      <div className="preview-progress"></div>
    </div>
  );
};

// Componente contenedor principal - idéntico a Leptos
const NotificationPreviewContainer = () => {
  const [previews, setPreviews] = useState([]);
  const { notifications } = useNotificationContext();
  const processedIds = useRef(new Set());

  // Efecto para crear previews de nuevas notificaciones SSE
  useEffect(() => {
    if (!notifications || notifications.length === 0) {
      return;
    }

    // CORREGIDO: Solo procesar notificaciones muy recientes (últimos 10 segundos)
    const now = new Date().getTime();
    const recentThreshold = 10000; // 10 segundos
    const newNotifications = notifications.filter((notification) => {
      const id = notification.id || notification.sse_id;
      if (!id || processedIds.current.has(id)) return false;

      // CRÍTICO: NO crear preview si ya está leída
      if (notification.leida) {
        return false;
      }

      // Solo crear preview si la notificación es muy reciente
      const notificationTime = new Date(
        notification.created_at || notification.timestamp || new Date(),
      ).getTime();
      const isRecent = now - notificationTime < recentThreshold;

      return isRecent;
    });

    if (newNotifications.length > 0) {
      newNotifications.forEach((notification) => {
        const previewId =
          notification.id || notification.sse_id || Date.now().toString();

        // Marcar como procesada ANTES de crear el preview
        processedIds.current.add(previewId);

        // Crear preview - idéntico a Leptos
        const preview = {
          id: previewId,
          title:
            notification.titulo || notification.title || "Nueva notificación",
          message: notification.mensaje || notification.message || "",
          action_url: notification.url_accion || notification.action_url,
          notification_type: NotificationPreviewType.SSE,
          timestamp:
            notification.created_at ||
            notification.timestamp ||
            new Date().toISOString(),
          leida: notification.leida || false,
        };

        setPreviews((prev) => {
          // Agregar al principio y mantener máximo 2 (igual que Leptos)
          const newPreviews = [preview, ...prev];
          if (newPreviews.length > 2) {
            const removed = newPreviews.length - 2;
            return newPreviews.slice(0, 2);
          }
          return newPreviews;
        });
      });
    }
  }, [notifications]);

  // Función para remover preview
  const removePreview = useCallback((previewId) => {
    setPreviews((prev) => {
      const beforeCount = prev.length;
      const filtered = prev.filter((p) => p.id !== previewId);
      const afterCount = filtered.length;
      return filtered;
    });
  }, []);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      processedIds.current.clear();
    };
  }, []);

  if (!previews.length) {
    return null;
  }

  return (
    <div className="notification-previews-container">
      {previews.map((preview, index) => {
        const priorityClass = index === 0 ? "priority-high" : "priority-low";

        return (
          <div key={preview.id} className={`preview-wrapper ${priorityClass}`}>
            <NotificationPreviewItem
              notification={preview}
              onRemove={removePreview}
            />
          </div>
        );
      })}
    </div>
  );
};

// Hooks de utilidad para usar desde otros componentes - igual que Leptos
export const useNotificationPreview = () => {
  const showPreview = useCallback((notification) => {
    // El preview se creará automáticamente en NotificationPreviewContainer
    // cuando se actualice el contexto de notificaciones
  }, []);

  return showPreview;
};

export default NotificationPreviewContainer;
