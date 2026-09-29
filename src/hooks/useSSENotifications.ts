import { useState, useEffect, useCallback, useMemo } from "react";
import { useNotificationContext } from "../context/NotificationContext";

export const useSSENotifications = (options = {}) => {
  const {
    // Filtros por defecto
    autoMarkAsRead = false,
    maxVisible = 50,
    sortBy = "created_at",
    sortOrder = "desc",
    filterType = null,
    showOnlyUnread = false,
    enableSound = true,
    enableDesktopNotifications = false,
  } = options;

  const context = useNotificationContext();
  const [localFilters, setLocalFilters] = useState({
    type: filterType,
    unreadOnly: showOnlyUnread,
    searchTerm: "",
    dateRange: null,
  });

  // Estados locales para UX
  const [soundEnabled, setSoundEnabled] = useState(enableSound);
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] =
    useState(enableDesktopNotifications);
  const [lastNotificationTime, setLastNotificationTime] = useState(null);

  // Solicitar permisos para notificaciones de escritorio
  useEffect(() => {
    if (
      desktopNotificationsEnabled &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission();
    }
  }, [desktopNotificationsEnabled]);

  // Filtrar y ordenar notificaciones (igual que en Leptos)
  const filteredNotifications = useMemo(() => {
    let filtered = [...context.notifications];

    // Filtro por tipo
    if (localFilters.type) {
      filtered = filtered.filter((n) => n.tipo === localFilters.type);
    }

    // Filtro por leídas/no leídas
    if (localFilters.unreadOnly) {
      filtered = filtered.filter((n) => !n.leida);
    }

    // Filtro por término de búsqueda
    if (localFilters.searchTerm) {
      const term = localFilters.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (n) =>
          n.titulo.toLowerCase().includes(term) ||
          n.mensaje.toLowerCase().includes(term),
      );
    }

    // Filtro por rango de fechas
    if (localFilters.dateRange) {
      filtered = filtered.filter((n) => {
        const notificationDate = new Date(n.created_at);
        return (
          notificationDate >= localFilters.dateRange.start &&
          notificationDate <= localFilters.dateRange.end
        );
      });
    }

    // Ordenamiento
    filtered.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      if (sortBy === "created_at" || sortBy === "updated_at") {
        aValue = new Date(aValue);
        bValue = new Date(bValue);
      }

      if (sortOrder === "desc") {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });

    // Limitar cantidad visible
    return filtered.slice(0, maxVisible);
  }, [context.notifications, localFilters, sortBy, sortOrder, maxVisible]);

  // Notificaciones por tipo (utilidades como en Leptos)
  const notificationsByType = useMemo(() => {
    return {
      info: context.getNotificationsByType("INFO"),
      warning: context.getNotificationsByType("WARNING"),
      error: context.getNotificationsByType("ERROR"),
      success: context.getNotificationsByType("SUCCESS"),
    };
  }, [context]);

  // Estadísticas de notificaciones
  const stats = useMemo(
    () => ({
      total: context.notifications.length,
      unread: context.unreadCount,
      byType: {
        info: notificationsByType.info.length,
        warning: notificationsByType.warning.length,
        error: notificationsByType.error.length,
        success: notificationsByType.success.length,
      },
      unreadByType: {
        info: notificationsByType.info.filter((n) => !n.leida).length,
        warning: notificationsByType.warning.filter((n) => !n.leida).length,
        error: notificationsByType.error.filter((n) => !n.leida).length,
        success: notificationsByType.success.filter((n) => !n.leida).length,
      },
    }),
    [context.notifications, context.unreadCount, notificationsByType],
  );

  // Marcar como leída con auto-marcado opcional
  const markAsRead = useCallback(
    async (notificationId, autoMark = autoMarkAsRead) => {
      if (autoMark) {
        await context.markAsRead(notificationId);
      }
    },
    [autoMarkAsRead, context],
  );

  // Marcar múltiples como leídas
  const markMultipleAsRead = useCallback(
    async (notificationIds) => {
      for (const id of notificationIds) {
        await context.markAsRead(id);
      }
    },
    [context],
  );

  // Obtener notificación por ID con verificación
  const getNotification = useCallback(
    (id) => {
      return context.getNotificationById(id);
    },
    [context],
  );

  // Filtros dinámicos
  const setTypeFilter = useCallback((type) => {
    setLocalFilters((prev) => ({ ...prev, type }));
  }, []);

  const setUnreadOnlyFilter = useCallback((unreadOnly) => {
    setLocalFilters((prev) => ({ ...prev, unreadOnly }));
  }, []);

  const setSearchTerm = useCallback((searchTerm) => {
    setLocalFilters((prev) => ({ ...prev, searchTerm }));
  }, []);

  const setDateRangeFilter = useCallback((start, end) => {
    setLocalFilters((prev) => ({
      ...prev,
      dateRange: start && end ? { start, end } : null,
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setLocalFilters({
      type: null,
      unreadOnly: false,
      searchTerm: "",
      dateRange: null,
    });
  }, []);

  // Reproducir sonido de notificación
  const playNotificationSound = useCallback(() => {
    if (soundEnabled && "Audio" in window) {
      try {
        // Puedes agregar tu propio archivo de sonido aquí
        const audio = new Audio("/sounds/notification.mp3");
        audio.volume = 0.3;
        audio
          .play()
          .catch((e) => console.log("No se pudo reproducir sonido:", e));
      } catch (error) {
        console.log("Audio no disponible:", error);
      }
    }
  }, [soundEnabled]);

  // Mostrar notificación de escritorio
  const showDesktopNotification = useCallback(
    (notification) => {
      if (
        desktopNotificationsEnabled &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        const options = {
          body: notification.mensaje,
          icon: "/favicon.ico",
          tag: notification.id,
          requireInteraction: notification.tipo === "ERROR",
        };

        const desktopNotification = new Notification(
          notification.titulo,
          options,
        );

        desktopNotification.onclick = () => {
          window.focus();
          markAsRead(notification.id);
          desktopNotification.close();
        };

        // Auto-cerrar después de 5 segundos (excepto errores)
        if (notification.tipo !== "ERROR") {
          setTimeout(() => {
            desktopNotification.close();
          }, 5000);
        }
      }
    },
    [desktopNotificationsEnabled, markAsRead],
  );

  // Detectar nuevas notificaciones para efectos de sonido/desktop
  useEffect(() => {
    if (context.notifications.length > 0) {
      const latestNotification = context.notifications[0];
      const notificationTime = new Date(
        latestNotification.created_at,
      ).getTime();

      if (lastNotificationTime && notificationTime > lastNotificationTime) {
        // Nueva notificación recibida
        playNotificationSound();
        showDesktopNotification(latestNotification);
      }

      setLastNotificationTime(
        Math.max(notificationTime, lastNotificationTime || 0),
      );
    }
  }, [
    context.notifications,
    lastNotificationTime,
    playNotificationSound,
    showDesktopNotification,
  ]);

  // Funciones de utilidad adicionales
  const hasUnreadOfType = useCallback(
    (type) => {
      return stats.unreadByType[type.toLowerCase()] > 0;
    },
    [stats],
  );

  const getOldestUnread = useCallback(() => {
    const unread = context.getUnreadNotifications();
    return unread.sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at),
    )[0];
  }, [context]);

  const getNewestUnread = useCallback(() => {
    const unread = context.getUnreadNotifications();
    return unread.sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at),
    )[0];
  }, [context]);

  // Conectar usuario (wrapper para facilitar uso)
  const connectUser = useCallback(
    (dni, role) => {
      context.setUserAndConnect(dni, role);
    },
    [context],
  );

  return {
    // Estado principal
    notifications: filteredNotifications,
    unreadCount: context.unreadCount,
    isConnected: context.isConnected,
    connectionError: context.connectionError,
    stats,

    // Notificaciones categorizadas
    notificationsByType,

    // Funciones principales
    markAsRead,
    markAllAsRead: context.markAllAsRead,
    markMultipleAsRead,
    getNotification,
    connectUser,

    // Filtros
    setTypeFilter,
    setUnreadOnlyFilter,
    setSearchTerm,
    setDateRangeFilter,
    clearFilters,
    currentFilters: localFilters,

    // Configuración
    soundEnabled,
    setSoundEnabled,
    desktopNotificationsEnabled,
    setDesktopNotificationsEnabled,

    // Utilidades avanzadas
    hasUnreadOfType,
    getOldestUnread,
    getNewestUnread,
    playNotificationSound,
    showDesktopNotification,

    // Estado de conexión
    reconnect: context.connectToSse,
    disconnect: context.disconnectFromSse,
  };
};

export default useSSENotifications;
