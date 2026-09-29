import { useState, useCallback } from "react";

export const useNotifications = () => {
  // Estado para modal de confirmación
  const [confirmationModal, setConfirmationModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "warning",
    confirmText: "Confirmar",
    cancelText: "Cancelar",
    onConfirm: null,
    loading: false,
  });

  // Estado para notificaciones tipo toast
  const [notification, setNotification] = useState({
    isVisible: false,
    message: "",
    type: "info", // 'success', 'error', 'warning', 'info'
    duration: 3000,
  });

  /**
   * Mostrar modal de confirmación
   * @param {Object} config - Configuración del modal
   * @returns {Promise} Promise que se resuelve con true/false según la acción del usuario
   */
  const showConfirmation = useCallback((config) => {
    return new Promise((resolve) => {
      setConfirmationModal({
        isOpen: true,
        title: config.title || "Confirmar Acción",
        message: config.message || "¿Está seguro que desea continuar?",
        type: config.type || "warning",
        confirmText: config.confirmText || "Confirmar",
        cancelText: config.cancelText || "Cancelar",
        loading: false,
        onConfirm: () => {
          if (config.onConfirm) {
            // Si se proporciona onConfirm, mostrar loading y ejecutar
            setConfirmationModal((prev) => ({ ...prev, loading: true }));

            const result = config.onConfirm();

            // Si onConfirm retorna una Promise, esperarla
            if (result && typeof result.then === "function") {
              result
                .then(() => {
                  closeConfirmation();
                  resolve(true);
                })
                .catch((error) => {
                  closeConfirmation();
                  showNotification({
                    message: error.message || "Error al ejecutar la acción",
                    type: "error",
                  });
                  resolve(false);
                });
            } else {
              closeConfirmation();
              resolve(true);
            }
          } else {
            // Solo confirmación simple
            closeConfirmation();
            resolve(true);
          }
        },
      });
    });
  }, []);

  /**
   * Cerrar modal de confirmación
   */
  const closeConfirmation = useCallback(() => {
    setConfirmationModal((prev) => ({
      ...prev,
      isOpen: false,
      loading: false,
    }));
  }, []);

  /**
   * Mostrar notificación toast
   * @param {Object} config - Configuración de la notificación
   */
  const showNotification = useCallback((config) => {
    setNotification({
      isVisible: true,
      message: config.message || "Notificación",
      type: config.type || "info",
      duration: config.duration || 3000,
    });

    // Auto-hide después del tiempo especificado
    setTimeout(() => {
      setNotification((prev) => ({ ...prev, isVisible: false }));
    }, config.duration || 3000);
  }, []);

  /**
   * Cerrar notificación manualmente
   */
  const closeNotification = useCallback(() => {
    setNotification((prev) => ({ ...prev, isVisible: false }));
  }, []);

  /**
   * Función de conveniencia para confirmar eliminación
   * @param {Object} config - Configuración específica para eliminación
   * @returns {Promise<boolean>}
   */
  const confirmDelete = useCallback(
    (config) => {
      return showConfirmation({
        title: config.title || "Confirmar Eliminación",
        message:
          config.message ||
          "¿Está seguro que desea eliminar este elemento? Esta acción no se puede deshacer.",
        type: "danger",
        confirmText: config.confirmText || "Eliminar",
        cancelText: config.cancelText || "Cancelar",
        onConfirm: config.onConfirm,
      });
    },
    [showConfirmation],
  );

  /**
   * Función de conveniencia para mostrar éxito
   * @param {string} message - Mensaje de éxito
   */
  const showSuccess = useCallback(
    (message) => {
      showNotification({
        message,
        type: "success",
      });
    },
    [showNotification],
  );

  /**
   * Función de conveniencia para mostrar error
   * @param {string} message - Mensaje de error
   */
  const showError = useCallback(
    (message) => {
      showNotification({
        message,
        type: "error",
        duration: 5000, // Errores se muestran más tiempo
      });
    },
    [showNotification],
  );

  /**
   * Función de conveniencia para mostrar información
   * @param {string} message - Mensaje informativo
   */
  const showInfo = useCallback(
    (message) => {
      showNotification({
        message,
        type: "info",
        duration: 3000,
      });
    },
    [showNotification],
  );

  /**
   * Función de conveniencia para mostrar advertencia
   * @param {string} message - Mensaje de advertencia
   */
  const showWarning = useCallback(
    (message) => {
      showNotification({
        message,
        type: "warning",
        duration: 4000,
      });
    },
    [showNotification],
  );

  return {
    // Estados
    confirmationModal,
    notification,

    // Funciones principales
    showConfirmation,
    closeConfirmation,
    showNotification,
    closeNotification,

    // Funciones de conveniencia
    confirmDelete,
    showSuccess,
    showError,
    showInfo,
    showWarning,
  };
};
