import React, {
  useState,
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { getApiUrl, createApiInstance } from "../utils/apiUtils";
import {
  reportBackendAvailable,
  reportBackendUnavailable,
} from "../utils/backendStatus";
import { queryClient, queryKeys } from "../config/queryClient";
import { invalidateCotizacionGraphCache } from "../utils/cacheInvalidation";
import { isNotificationVisibleForRole } from "../utils/notificationNavigation";

// Estado inicial del contexto
const initialState = {
  notifications: [],
  unreadCount: 0,
  isConnected: false,
  connectionError: null,
  sseConnection: null,
  userDni: null,
  userRole: null,
  lastEventId: null,
  connectionRetries: 0,
  maxRetries: 5,
  retryDelay: 1000,
  globalNotifications: true,
};

// Acciones del reducer (igual que Leptos)
const NotificationActions = {
  SET_CONNECTION_STATUS: "SET_CONNECTION_STATUS",
  SET_CONNECTION_ERROR: "SET_CONNECTION_ERROR",
  ADD_NOTIFICATION: "ADD_NOTIFICATION",
  UPDATE_NOTIFICATION: "UPDATE_NOTIFICATION",
  REMOVE_NOTIFICATION: "REMOVE_NOTIFICATION",
  MARK_AS_READ: "MARK_AS_READ",
  MARK_ALL_AS_READ: "MARK_ALL_AS_READ",
  SET_NOTIFICATIONS: "SET_NOTIFICATIONS",
  SET_UNREAD_COUNT: "SET_UNREAD_COUNT",
  SET_USER_INFO: "SET_USER_INFO",
  CLEAR_USER_INFO: "CLEAR_USER_INFO",
  SET_SSE_CONNECTION: "SET_SSE_CONNECTION",
  RESET_CONNECTION_RETRIES: "RESET_CONNECTION_RETRIES",
  INCREMENT_CONNECTION_RETRIES: "INCREMENT_CONNECTION_RETRIES",
};

// Reducer para manejar el estado de notificaciones (igual que en Leptos)
function notificationReducer(state, action) {
  switch (action.type) {
    case NotificationActions.SET_CONNECTION_STATUS:
      return {
        ...state,
        isConnected: action.payload,
        connectionError: action.payload ? null : state.connectionError,
      };

    case NotificationActions.SET_CONNECTION_ERROR:
      return {
        ...state,
        connectionError: action.payload,
        isConnected: false,
      };

    case NotificationActions.ADD_NOTIFICATION:
      const newNotification = action.payload;
      const existingNotification = state.notifications.find(
        (notification) => notification.id === newNotification.id,
      );
      // SSE y el refetch HTTP pueden entregar el mismo ID. Se reemplaza la
      // versión existente en vez de duplicarla y alterar el contador.
      const updatedNotifications = [
        existingNotification
          ? { ...existingNotification, ...newNotification }
          : newNotification,
        ...state.notifications.filter(
          (notification) => notification.id !== newNotification.id,
        ),
      ].slice(0, 150);
      return {
        ...state,
        notifications: updatedNotifications,
        unreadCount: updatedNotifications.filter((item) => !item.leida).length,
      };

    case NotificationActions.UPDATE_NOTIFICATION:
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.payload.id ? { ...n, ...action.payload } : n,
        ),
      };

    case NotificationActions.MARK_AS_READ:
      const notificationId = action.payload;
      const wasUnreadForRead = state.notifications.find(
        (n) => n.id === notificationId && !n.leida,
      );
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === notificationId
            ? { ...n, leida: true, fecha_lectura: new Date().toISOString() }
            : n,
        ),
        unreadCount: wasUnreadForRead
          ? Math.max(0, state.unreadCount - 1)
          : state.unreadCount,
      };

    case NotificationActions.MARK_ALL_AS_READ:
      return {
        ...state,
        notifications: state.notifications.map((n) => ({ ...n, leida: true })),
        unreadCount: 0,
      };

    case NotificationActions.SET_NOTIFICATIONS:
      return {
        ...state,
        notifications: action.payload,
      };

    case NotificationActions.SET_UNREAD_COUNT:
      return {
        ...state,
        unreadCount: action.payload,
      };

    case NotificationActions.SET_USER_INFO:
      return {
        ...state,
        userDni: action.payload.dni,
        userRole: action.payload.role,
      };

    case NotificationActions.CLEAR_USER_INFO:
      return {
        ...state,
        userDni: null,
        userRole: null,
        sseConnection: null,
        isConnected: false,
        connectionError: null,
        connectionRetries: 0,
      };

    case NotificationActions.SET_SSE_CONNECTION:
      return {
        ...state,
        sseConnection: action.payload,
      };

    case NotificationActions.RESET_CONNECTION_RETRIES:
      return {
        ...state,
        connectionRetries: 0,
      };

    case NotificationActions.INCREMENT_CONNECTION_RETRIES:
      return {
        ...state,
        connectionRetries: state.connectionRetries + 1,
      };

    case NotificationActions.REMOVE_NOTIFICATION:
      // Exacto comportamiento como Leptos - eliminar notificación por ID
      const notificationToRemove = state.notifications.find(
        (n) => n.id === action.payload,
      );
      const newNotifications = state.notifications.filter(
        (notification) => notification.id !== action.payload,
      );
      const wasUnreadForRemove =
        notificationToRemove && !notificationToRemove.leida;

      return {
        ...state,
        notifications: newNotifications,
        unreadCount: wasUnreadForRemove
          ? Math.max(0, state.unreadCount - 1)
          : state.unreadCount,
      };

    default:
      return state;
  }
}

// Contexto de notificaciones
const NotificationContext = createContext();

// Provider de notificaciones SSE (replicando funcionalidad de Leptos)
export const NotificationProvider = ({ children, apiBaseUrl }) => {
  // Usar apiUtils para obtener la URL base correcta (manteniendo /api)
  const baseUrl = apiBaseUrl || getApiUrl();
  const [state, dispatch] = useReducer(notificationReducer, initialState);

  // Ref para almacenar el timeout de reconexión SSE (evitar memory leak)
  const sseRetryTimeoutRef = useRef(null);
  const sseConnectionRef = useRef(null);
  const sseConnectingRef = useRef(false);
  const notificationsCacheRef = useRef(new Map());
  const unreadCountCacheRef = useRef(new Map());
  const notificationDebug = () => {};

  const getCachedValue = useCallback((cacheRef, key) => {
    if (!key) {
      return null;
    }

    const entry = cacheRef.current.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.ts > 30000) {
      cacheRef.current.delete(key);
      return null;
    }

    return entry.value;
  }, []);

  const setCachedValue = useCallback((cacheRef, key, value) => {
    if (!key) {
      return;
    }

    cacheRef.current.set(key, { value, ts: Date.now() });
  }, []);

  const invalidateNotificationCache = useCallback(
    (dniuser = state.userDni) => {
      if (!dniuser) {
        return;
      }

      notificationsCacheRef.current.delete(dniuser);
      unreadCountCacheRef.current.delete(dniuser);
    },
    [state.userDni],
  );

  // Conectar a SSE stream - cada usuario tiene su propia conexión basada en sesión
  const connectToSse = useCallback(async () => {
    if (
      !state.userDni ||
      state.userRole === undefined ||
      sseConnectionRef.current ||
      sseConnectingRef.current
    ) {
      return;
    }

    sseConnectingRef.current = true;
    try {
      const api = createApiInstance();
      const ticketResponse = await api.get("/notifications/sse-ticket");
      const sseTicket = ticketResponse.data?.ticket;

      if (!sseTicket) {
        throw new Error("No se pudo obtener ticket SSE");
      }

      const normalizedBaseUrl = String(baseUrl || getApiUrl()).replace(/\/+$/, "");
      const sseUrl = new URL(
        `${normalizedBaseUrl}/notifications/stream`,
        window.location.origin,
      );
      sseUrl.searchParams.append("ticket", sseTicket);
      // El ticket es efímero y de un solo uso. Gestionamos la reconexión
      // manualmente para pedir uno nuevo y enviamos credenciales cuando la API
      // vive en otro origen/subdominio.
      const eventSource = new EventSource(sseUrl.toString(), {
        withCredentials: true,
      });
      sseConnectionRef.current = eventSource;

      eventSource.onopen = () => {
        reportBackendAvailable("sse");
        dispatch({
          type: NotificationActions.SET_CONNECTION_STATUS,
          payload: true,
        });
        dispatch({ type: NotificationActions.RESET_CONNECTION_RETRIES });
      };

      // Handler para todos los mensajes SSE (igual que en Leptos)
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Verificar si es heartbeat y ignorar (igual que en Leptos)
          if (data.type === "heartbeat") {
            return;
          }

          // Manejar evento de notificación
          handleSseEvent(data).catch(console.error);
        } catch (error) {
          console.error(" Error parseando evento SSE:", error);
        }
      };

      eventSource.onerror = (error) => {
        // EventSource intentaría reconectar automáticamente reutilizando el
        // mismo ticket ya consumido. Cerramos primero y solicitamos un ticket
        // nuevo en el reintento controlado por la aplicación.
        eventSource.close();
        if (sseConnectionRef.current === eventSource) {
          sseConnectionRef.current = null;
        }
        dispatch({ type: NotificationActions.SET_SSE_CONNECTION, payload: null });

        console.error(" Error en conexión SSE:", error);
        console.error(" Estado de EventSource:", eventSource.readyState);
        console.error(" URL utilizada:", sseUrl.toString());
        reportBackendUnavailable("sse", "La conexión SSE se interrumpió");
        dispatch({
          type: NotificationActions.SET_CONNECTION_STATUS,
          payload: false,
        });
        dispatch({
          type: NotificationActions.SET_CONNECTION_ERROR,
          payload: "Error de conexión SSE",
        });

        // Reintento con backoff exponencial (igual que en Leptos)
        if (state.connectionRetries < state.maxRetries) {
          const delay = state.retryDelay * Math.pow(2, state.connectionRetries);

          // Almacenar timeout en ref para poder cancelarlo on unmount
          if (sseRetryTimeoutRef.current) {
            clearTimeout(sseRetryTimeoutRef.current);
          }
          sseRetryTimeoutRef.current = setTimeout(() => {
            sseRetryTimeoutRef.current = null;
            dispatch({
              type: NotificationActions.INCREMENT_CONNECTION_RETRIES,
            });
            connectToSse();
          }, delay);
        } else {
          console.error(" Máximo número de reintentos alcanzado para SSE");
          dispatch({
            type: NotificationActions.SET_CONNECTION_ERROR,
            payload: "No se pudo establecer conexión SSE",
          });
        }
      };

      dispatch({
        type: NotificationActions.SET_SSE_CONNECTION,
        payload: eventSource,
      });
    } catch (error) {
      console.error(" Error conectando a SSE:", error);
      reportBackendUnavailable("sse-ticket", error.message);
      dispatch({
        type: NotificationActions.SET_CONNECTION_STATUS,
        payload: false,
      });
      dispatch({
        type: NotificationActions.SET_CONNECTION_ERROR,
        payload: error.message,
      });

      // Si falló incluso la emisión del ticket (p. ej. durante una renovación
      // de sesión o un corte HTTP/2), también reintentamos desde cero. El nuevo
      // intento vuelve a /sse-ticket y nunca reutiliza un ticket consumido.
      if (state.connectionRetries < state.maxRetries) {
        const delay = state.retryDelay * Math.pow(2, state.connectionRetries);
        if (sseRetryTimeoutRef.current) {
          clearTimeout(sseRetryTimeoutRef.current);
        }
        sseRetryTimeoutRef.current = setTimeout(() => {
          sseRetryTimeoutRef.current = null;
          dispatch({
            type: NotificationActions.INCREMENT_CONNECTION_RETRIES,
          });
          connectToSse();
        }, delay);
      }
    } finally {
      sseConnectingRef.current = false;
    }
  }, [
    state.userDni,
    state.userRole,
    state.globalNotifications,
    state.lastEventId,
    state.connectionRetries,
    state.maxRetries,
    state.retryDelay,
    baseUrl,
  ]);

  // Desconectar SSE de forma segura (solo esta conexión específica)
  const disconnectFromSse = useCallback(() => {
    // Limpiar timeout de reconexión pendiente
    if (sseRetryTimeoutRef.current) {
      clearTimeout(sseRetryTimeoutRef.current);
      sseRetryTimeoutRef.current = null;
    }
    const activeConnection = sseConnectionRef.current || state.sseConnection;
    if (activeConnection) {
      activeConnection.close();
      sseConnectionRef.current = null;
      sseConnectingRef.current = false;
      dispatch({ type: NotificationActions.SET_SSE_CONNECTION, payload: null });
      dispatch({
        type: NotificationActions.SET_CONNECTION_STATUS,
        payload: false,
      });
    }
  }, [state.sseConnection, state.userDni]);

  // Manejar eventos SSE (igual que en Leptos)
  const handleSseEvent = async (data) => {
    // Si es un evento de conexión inicial, registrar mensaje
    if (data.message && data.message.includes("Conectado al stream")) {
      return;
    }

    // Procesar eventos de notificación
    if (data.event_type) {
      switch (data.event_type) {
        case "cotizacion_created":
        case "cotizacion_updated":
        case "cotizacion_deleted":
        case "cotizacion_duplicated":
          // Compatibilidad con servidores antiguos que emiten eventos por
          // entidad en vez del evento unificado new_notification.
          if (
            !data.notification ||
            !isNotificationVisibleForRole(data.notification, state.userRole)
          ) {
            break;
          }
          queryClient.invalidateQueries({
            queryKey: queryKeys.cotizaciones.lists(),
          });
          invalidateNotificationCache();
          dispatch({
            type: NotificationActions.ADD_NOTIFICATION,
            payload: data.notification,
          });
          break;
        case "notification_created":
          if (
            data.notification &&
            isNotificationVisibleForRole(data.notification, state.userRole)
          ) {
            invalidateNotificationCache();
            dispatch({
              type: NotificationActions.ADD_NOTIFICATION,
              payload: data.notification,
            });
          }
          break;
        case "notification_updated":
          if (data.notification) {
            invalidateNotificationCache();
            dispatch({
              type: NotificationActions.UPDATE_NOTIFICATION,
              payload: data.notification,
            });
          }
          break;
        case "notification_read":
          if (data.notification) {
            invalidateNotificationCache();
            dispatch({
              type: NotificationActions.MARK_AS_READ,
              payload: data.notification.id,
            });
          }
          break;
        case "new_notification": {
          if (!data.notification) break;

          let parsedNotification = { ...data.notification };
          if (typeof parsedNotification.datos_contexto === "string") {
            try {
              parsedNotification.datos_contexto = JSON.parse(
                parsedNotification.datos_contexto,
              );
            } catch (error) {
              console.error(" Error parseando datos_contexto:", error);
              parsedNotification.datos_contexto = {};
            }
          }

          if (
            !isNotificationVisibleForRole(
              parsedNotification,
              state.userRole,
            )
          ) {
            break;
          }

          const contextData = parsedNotification.datos_contexto || {};
          if (contextData.entity_type === "cotizacion_edit_request") {
            queryClient.invalidateQueries({ queryKey: ["cotizacion-edit-requests"] });
            window.dispatchEvent(
              new CustomEvent("postSaleEditRequestUpdated", {
                detail: {
                  source: "sse",
                  request_id: contextData.edit_request_id || null,
                  cotizacion_id: contextData.cotizacion_id || null,
                  status: contextData.status || null,
                  action: contextData.action || null,
                },
              }),
            );
          }
          if (
            contextData.entity_type === "cotizacion" ||
            contextData.entity_type === "voucher_venta" ||
            contextData.refresh_graph === "cotizacion_sale" ||
            contextData.action === "sold_quotation_updated"
          ) {
            invalidateCotizacionGraphCache({ refetchType: "active" });
            window.dispatchEvent(
              new CustomEvent("quotationSaleUpdated", {
                detail: {
                  source: "sse",
                  cotizacion_id: contextData.cotizacion_id || null,
                  voucher_venta_id:
                    contextData.voucher_venta_id ||
                    contextData.voucher_id ||
                    null,
                  voucher_reserva_id: contextData.voucher_reserva_id || null,
                },
              }),
            );
          }

          // Mantener la fecha autoritativa del servidor para el orden y usar
          // received_at local únicamente para la frescura visual del dropdown.
          const localTimestamp = new Date().toISOString();
          const notificationWithPreview = {
            ...parsedNotification,
            notification_type: "sse",
            timestamp: localTimestamp,
            received_at: localTimestamp,
            created_at: parsedNotification.created_at || localTimestamp,
          };

          invalidateNotificationCache();
          dispatch({
            type: NotificationActions.ADD_NOTIFICATION,
            payload: notificationWithPreview,
          });

          if (
            (contextData.type === "pago_solicitado" ||
              contextData.type === "pagos_solicitados_batch" ||
              contextData.type === "pago_solicitado_confirmacion") &&
            contextData.payment_request_id
          ) {
            window.dispatchEvent(
              new CustomEvent("paymentRequestCreated", {
                detail: {
                  payment_request_id: contextData.payment_request_id,
                  source: "sse",
                },
              }),
            );
          } else if (
            contextData.type === "pago_completado" ||
            contextData.type === "pago_completado_admin"
          ) {
            window.dispatchEvent(
              new CustomEvent("paymentRequestPaid", {
                detail: { source: "sse" },
              }),
            );
          }
          break;
        }
        case "cleanup_update":
          if (data.metadata && data.metadata.action === "cleanup_completed") {
            invalidateNotificationCache();
            // Recargar notificaciones para reflejar la limpieza
            await fetchNotifications();
          }
          break;
        default:
          // Intentar procesar como notificación genérica
          if (
            data.notification &&
            isNotificationVisibleForRole(data.notification, state.userRole)
          ) {
            invalidateNotificationCache();
            dispatch({
              type: NotificationActions.ADD_NOTIFICATION,
              payload: data.notification,
            });
          }
      }
    }
  };

  // Configurar usuario y conectar
  const setUserAndConnect = useCallback((dni, role) => {
    dispatch({
      type: NotificationActions.SET_USER_INFO,
      payload: { dni, role },
    });
  }, []);

  useEffect(() => {
    const handleLogout = () => {
      notificationsCacheRef.current.clear();
      unreadCountCacheRef.current.clear();
      dispatch({ type: NotificationActions.CLEAR_USER_INFO });
      setHasInitialized(false);
    };

    window.addEventListener("auth:logout", handleLogout);

    return () => {
      window.removeEventListener("auth:logout", handleLogout);
    };
  }, []);

  // Marcar notificación como leída (igual que Leptos) - usando apiUtils
  const markAsRead = useCallback(
    async (notificationId) => {
      try {
        const api = createApiInstance();

        await api.patch(`/notifications/${notificationId}/read`);

        invalidateNotificationCache();
        dispatch({
          type: NotificationActions.MARK_AS_READ,
          payload: notificationId,
        });
      } catch (error) {
        console.error(" Error marcando notificación como leída:", error);
      }
    },
    [invalidateNotificationCache],
  );

  // Marcar todas como leídas (igual que Leptos) - usando apiUtils
  const markAllAsRead = useCallback(async () => {
    try {
      const api = createApiInstance();

      await api.patch("/notifications/mark-all-read");

      invalidateNotificationCache();
      dispatch({ type: NotificationActions.MARK_ALL_AS_READ });
    } catch (error) {
      console.error(" Error marcando todas como leídas:", error);
    }
  }, [invalidateNotificationCache]);

  // Eliminar notificación (igual que Leptos) - usando apiUtils
  const deleteNotification = useCallback(
    async (notificationId) => {
      try {
        const api = createApiInstance();

        await api.delete(`/notifications/${notificationId}/delete`);

        invalidateNotificationCache();
        dispatch({
          type: NotificationActions.REMOVE_NOTIFICATION,
          payload: notificationId,
        });
      } catch (error) {
        console.error(" Error eliminando notificación:", error);
      }
    },
    [invalidateNotificationCache],
  );

  // Obtener notificaciones del usuario (igual que Leptos) - usando apiUtils
  // CORREGIDO: Filtrar por usuario actual en lugar de obtener todas
  const fetchNotifications = useCallback(async () => {
    if (!state.userDni) {
      return;
    }

    const cachedNotifications = getCachedValue(
      notificationsCacheRef,
      state.userDni,
    );

    if (cachedNotifications) {
      dispatch({
        type: NotificationActions.SET_NOTIFICATIONS,
        payload: cachedNotifications,
      });
      return;
    }

    try {
      const api = createApiInstance();

      // CORREGIDO: Filtrar por usuario actual
      const response = await api.get("/notifications", {
        params: {
          user_dniuser: state.userDni,
          limit: 50,
        },
      });

      if (response.data?.success && response.data?.data) {
        // Parsear datos_contexto si es string JSON y filtrar notificaciones excluidas
        const parsedNotifications = response.data.data
          .map((notification) => {
            let parsedNotification = { ...notification };
            if (typeof parsedNotification.datos_contexto === "string") {
              try {
                parsedNotification.datos_contexto = JSON.parse(
                  parsedNotification.datos_contexto,
                );
              } catch (e) {
                console.error(
                  " Error parseando datos_contexto para notificación:",
                  parsedNotification.id,
                  e,
                );
              }
            }
            return parsedNotification;
          })
          .filter((notification) =>
            isNotificationVisibleForRole(notification, state.userRole),
          );

        setCachedValue(
          notificationsCacheRef,
          state.userDni,
          parsedNotifications,
        );

        dispatch({
          type: NotificationActions.SET_NOTIFICATIONS,
          payload: parsedNotifications,
        });
      } else {
        console.warn(
          " Respuesta del servidor sin datos válidos:",
          response.data,
        );
      }
    } catch (error) {
      console.error(" Error obteniendo notificaciones:", error);
    }
  }, [getCachedValue, setCachedValue, state.userDni, state.userRole]);

  // Obtener conteo de no leídas (igual que Leptos) - usando apiUtils
  // CORREGIDO: Filtrar por usuario actual
  const fetchUnreadCount = useCallback(async () => {
    if (!state.userDni) {
      return;
    }

    const cachedUnreadCount = getCachedValue(
      unreadCountCacheRef,
      state.userDni,
    );

    if (cachedUnreadCount !== null) {
      dispatch({
        type: NotificationActions.SET_UNREAD_COUNT,
        payload: cachedUnreadCount,
      });
      return;
    }

    try {
      const api = createApiInstance();

      // CORREGIDO: Filtrar por usuario actual
      const response = await api.get("/notifications/unread-count", {
        params: {
          user_dniuser: state.userDni,
        },
      });

      if (response.data?.success) {
        setCachedValue(unreadCountCacheRef, state.userDni, response.data.data);
        dispatch({
          type: NotificationActions.SET_UNREAD_COUNT,
          payload: response.data.data,
        });
      }
    } catch (error) {
      console.error(" Error obteniendo conteo de no leídas:", error);
    }
  }, [getCachedValue, setCachedValue, state.userDni]);

  // Flag para prevenir múltiples inicializaciones
  const [hasInitialized, setHasInitialized] = useState(false);

  // Efecto para conectar automáticamente y cargar notificaciones cuando se configure el usuario
  useEffect(() => {
    // GUARD: No proceder si ya inicializado o ya conectado
    if (hasInitialized || state.isConnected || state.sseConnection) {
      return;
    }

    // GUARD: Verificar que tenemos la información completa del usuario
    if (!state.userDni || state.userRole === undefined) {
      // No hacer nada si falta información - esperar a que AuthContext la provea
      return;
    }

    setHasInitialized(true);

    // PRIMERO: Cargar notificaciones existentes desde la API
    fetchNotifications()
      .then(() => {
        // SEGUNDO: Conectar SSE para recibir notificaciones en tiempo real
        connectToSse();
      })
      .catch((error) => {
        console.error(" Error cargando notificaciones:", error);
        // Resetear flag para permitir reintento
        setHasInitialized(false);
      });

    // También cargar el conteo de no leídas
    fetchUnreadCount();
  }, [
    state.userDni,
    state.userRole,
    state.isConnected,
    state.sseConnection,
    hasInitialized,
    fetchNotifications,
    connectToSse,
    fetchUnreadCount,
  ]);

  // Limpiar conexión al desmontar el componente
  useEffect(() => {
    return () => {
      // Limpiar timeout de reconexión pendiente
      if (sseRetryTimeoutRef.current) {
        clearTimeout(sseRetryTimeoutRef.current);
        sseRetryTimeoutRef.current = null;
      }
      disconnectFromSse();
    };
  }, [disconnectFromSse]);

  // Trigger para crear previews automáticamente
  useEffect(() => {
    // Este efecto se ejecuta cuando hay nuevas notificaciones para crear previews
    if (state.notifications.length > 0) {
      notificationDebug(state.notifications.length);
    }
  }, [state.notifications]);

  // Calcular contador reactivamente a partir de las notificaciones locales
  const reactiveUnreadCount = useMemo(() => {
    return state.notifications.filter((n) => !n.leida).length;
  }, [state.notifications]);

  const value = {
    // Estado
    notifications: state.notifications,
    unreadCount: reactiveUnreadCount,
    isConnected: state.isConnected,
    connectionError: state.connectionError,
    userDni: state.userDni,
    userRole: state.userRole,

    // Acciones
    setUserAndConnect,
    connectToSse,
    disconnectFromSse,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchNotifications,

    // Utilidades
    getNotificationsByType: (tipo) =>
      state.notifications.filter((n) => n.tipo === tipo),
    getUnreadNotifications: () => state.notifications.filter((n) => !n.leida),
    getNotificationById: (id) => state.notifications.find((n) => n.id === id),
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

// Hook para usar el contexto
export const useNotificationContext = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotificationContext debe ser usado dentro de un NotificationProvider",
    );
  }
  return context;
};

export default NotificationContext;
