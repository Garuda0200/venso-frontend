import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MdBlock,
  MdCheck,
  MdCheckCircleOutline,
  MdCleaningServices,
  MdClose,
  MdDeleteOutline,
  MdDescription,
  MdDoneAll,
  MdErrorOutline,
  MdInfoOutline,
  MdLabelOutline,
  MdMarkEmailRead,
  MdNotifications,
  MdNotificationsNone,
  MdOutlinePayments,
  MdOpenInNew,
  MdSchedule,
  MdVisibility,
  MdWarningAmber,
} from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { useNotificationContext } from "../../../context/NotificationContext";
import { useNotifications } from "../../../hooks/useNotifications";
import { permissionService } from "../../../services/permissionService";
import { voucherVentaService } from "../../../services/voucherVentaService";
import { voucherReservaService } from "../../../services/voucherReservaService";
import {
  normalizePaymentServiceData,
  resolveFacturacionFromServiceData,
} from "../../../utils/paymentFacturacion";
import PendingPaymentsModal from "../../Contabilidad/PendingPaymentsModal";
import PaymentVoucherModal from "../../../pages/Reservas/VouchersReserva/components/PaymentVoucherModal/PaymentVoucherModal";
import MovimientoForm from "../../Contabilidad/MovimientoForm";
import cotizacionService from "../../../pages/Ventas/Cotizaciones/hooks/cotizacionService";
import {
  isNotificationVisibleForRole,
  normalizeNotificationContext,
  resolveNotificationDestination,
} from "../../../utils/notificationNavigation";
import "./NotificationBell.scss";

const QuotationHistoryModal = lazy(() =>
  import("../../../pages/Ventas/Cotizaciones/components/PredecesoresExpander"),
);

/**
 * Genera una descripción de pago basada en el tipo de servicio y datos del parentService
 * @param {object} serviceData - Los datos del servicio del payment_request
 * @param {string} voucherCode - El código del voucher como fallback
 * @returns {string} - Descripción formateada del pago
 */
const generatePaymentDescription = (serviceData, voucherCode) => {
  const normalizedServiceData = normalizePaymentServiceData(serviceData);

  // Si no hay service_data, usar el formato antiguo
  if (!normalizedServiceData) {
    return `Pago de servicio del file ${voucherCode || "Sin código"}`;
  }

  const parentService = normalizedServiceData.parentService || {};
  const childService = normalizedServiceData.childService || {};
  const childEntity =
    childService?.servicio_extra ||
    childService?.ticket ||
    childService?.restaurante ||
    childService;
  const typeService = String(
    normalizedServiceData.typeService || parentService?.typeService || "",
  ).toLowerCase();

  // Obtener el nombre del servicio según el tipo
  // Los campos varían según el tipo de servicio en el backend:
  // - tren: nombre_empresa
  // - hotel: nombre
  // - restaurante: nombre_empresa
  // - tour/ruta: tour_nombre (via guia)
  // - transporte: nombre_transporte
  // - guia: nombre (de persona)
  const nombreServicio =
    parentService.nombre_empresa ||
    parentService.nombreEmpresa ||
    parentService.nombre ||
    parentService.tour_nombre ||
    parentService.tourNombre ||
    parentService.nombre_transporte ||
    parentService.nombreTransporte ||
    childEntity?.nombre ||
    childEntity?.entrada ||
    "";

  // Mapear typeService a texto legible (singular para la descripción)
  const tipoServicios = {
    trenes: "tren",
    tren: "tren",
    hoteles: "hotel",
    hotel: "hotel",
    restaurantes: "restaurante",
    restaurante: "restaurante",
    tours: "tour",
    tour: "tour",
    rutas: "tour",
    ruta: "tour",
    vuelos: "vuelo",
    vuelo: "vuelo",
    transporte: "transporte",
    transportes: "transporte",
    guias: "guía",
    guia: "guía",
    entradas: "entrada",
    entrada: "entrada",
    tickets: "ticket",
    ticket: "ticket",
    paquetes: "paquete turístico",
    paquete: "paquete turístico",
    actividades: "actividad",
    actividad: "actividad",
    seguros: "seguro",
    seguro: "seguro",
    cruceros: "crucero",
    crucero: "crucero",
    movilidades: "movilidad",
    movilidad: "movilidad",
    extras: "servicio extra",
    extra: "servicio extra",
    otros: "servicio",
    otro: "servicio",
  };

  const tipoLegible = tipoServicios[typeService] || typeService || "servicio";

  if (nombreServicio) {
    return `Pago de ${tipoLegible} - ${nombreServicio}`;
  } else {
    return `Pago de ${tipoLegible} (file ${voucherCode || "Sin código"})`;
  }
};

const CONTEXT_LABELS = {
  action: "Acción",
  amount: "Monto",
  approved_by_name: "Aprobado por",
  approved_by: "DNI aprobador",
  business_type: "Tipo de negocio",
  cantidadpersonas: "Pasajeros",
  cotizacion_id: "Cotización",
  current_version: "Versión actual",
  deleted_by: "Eliminado por",
  entity_type: "Entidad",
  movimiento_id: "Movimiento",
  payment_request_id: "Solicitud de pago",
  platform: "Plataforma",
  requested_by_name: "Solicitado por",
  requested_by: "DNI solicitante",
  sale_baseline_version_id: "Versión base de venta",
  service_type: "Tipo de servicio",
  target_roles: "Roles destino",
  tipo: "Tipo",
  title: "Título",
  titulo: "Título",
  total_final: "Total final",
  type: "Tipo",
  updated_by: "Actualizado por",
  voucher_code: "File",
  voucher_id: "Voucher",
  voucher_venta_id: "ID voucher venta",
  voucher_venta_code: "Voucher de venta",
  voucher_reserva_id: "ID voucher reserva",
  voucher_reserva_code: "Voucher de reserva",
};

const HIDDEN_CONTEXT_KEYS = new Set([
  "created_by_role",
  "deleted_by_role",
  "exclude_user",
  "service_data",
  "timestamp",
  "updated_by_role",
]);

const formatContextValue = (key, value) => {
  if (value === null || value === undefined || value === "") return null;

  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : null;
  }

  if (typeof value === "object") {
    return null;
  }

  if (key === "amount" || key === "total_final") {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numericValue);
    }
  }

  return String(value);
};

const getReadableContextEntries = (context = {}) =>
  Object.entries(context)
    .filter(([key, value]) => {
      if (HIDDEN_CONTEXT_KEYS.has(key)) return false;
      if (!CONTEXT_LABELS[key]) return false;
      return formatContextValue(key, value) !== null;
    })
    .map(([key, value]) => ({
      key,
      label: CONTEXT_LABELS[key],
      value: formatContextValue(key, value),
    }));

/**
 * Componente NotificationBell - Idéntico al sistema Leptos
 * Funcionalidades completas: ver detalles, eliminar, marcar como leída, navegación
 * + Sistema de permisos con botones approve/reject
 */
const NotificationBell = () => {
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [historyCotizacion, setHistoryCotizacion] = useState(null);
  const [historyOpening, setHistoryOpening] = useState(false);

  // Estados para modal de rechazo de permiso
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [pendingRejectionNotification, setPendingRejectionNotification] =
    useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Estados para modales de pago
  const [showPendingPaymentsModal, setShowPendingPaymentsModal] =
    useState(false);
  const [showPaymentVoucherModal, setShowPaymentVoucherModal] = useState(false);
  const [selectedPaymentService, setSelectedPaymentService] = useState(null);
  const [paymentVoucherData, setPaymentVoucherData] = useState({
    voucherReservaId: "",
    voucherReservaCode: "",
    dayIndex: 0,
    serviceIndex: 0,
  });

  // Estados para modal de MovimientoForm (egresos)
  const [showMovimientoModal, setShowMovimientoModal] = useState(false);
  const [movimientoInitialData, setMovimientoInitialData] = useState(null);

  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  const {
    notifications,
    userRole,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchNotifications,
  } = useNotificationContext();

  const { showSuccess, showError } = useNotifications();

  const markNotificationRead = useCallback(
    async (notification) => {
      if (notification?.leida) return;
      try {
        await markAsRead(notification.id);
      } catch (error) {
        console.error(" Error marcando notificación como leída:", error);
      }
    },
    [markAsRead],
  );

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Toggle dropdown
  const toggleDropdown = useCallback(() => {
    const newState = !showDropdown;
    setShowDropdown(newState);

    // Cargar notificaciones cuando se abre el dropdown
    if (newState) {
      setIsLoading(true);
      fetchNotifications().finally(() => setIsLoading(false));
    }
  }, [showDropdown, fetchNotifications]);

  // Obtener icono por tipo de notificación (igual que Leptos)
  const getNotificationIcon = useCallback((tipo) => {
    switch (tipo) {
      case "Info":
      case "INFO":
        return <MdInfoOutline />;
      case "Success":
      case "SUCCESS":
        return <MdCheckCircleOutline />;
      case "Warning":
      case "WARNING":
        return <MdWarningAmber />;
      case "Error":
      case "ERROR":
        return <MdErrorOutline />;
      default:
        return <MdInfoOutline />;
    }
  }, []);

  // Obtener clase CSS por tipo (igual que Leptos)
  const getNotificationTypeClass = useCallback((tipo) => {
    switch (tipo) {
      case "Info":
      case "INFO":
        return "info";
      case "Success":
      case "SUCCESS":
        return "success";
      case "Warning":
      case "WARNING":
        return "warning";
      case "Error":
      case "ERROR":
        return "error";
      default:
        return "info";
    }
  }, []);

  // Obtener etiqueta de tipo (igual que Leptos)
  const getNotificationTypeLabel = useCallback((tipo) => {
    switch (tipo) {
      case "Info":
      case "INFO":
        return "Información";
      case "Success":
      case "SUCCESS":
        return "Éxito";
      case "Warning":
      case "WARNING":
        return "Advertencia";
      case "Error":
      case "ERROR":
        return "Error";
      default:
        return "Información";
    }
  }, []);

  // Formatear tiempo relativo (igual que Leptos)
  const formatTimeAgo = useCallback((dateString) => {
    const now = new Date();
    const notificationDate = new Date(dateString);
    const diffInMinutes = Math.floor((now - notificationDate) / (1000 * 60));

    if (diffInMinutes < 1) return "Ahora";
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
    return `${Math.floor(diffInMinutes / 1440)}d`;
  }, []);

  // Marcar como leída y abrir el detalle cuando no existe un destino seguro
  // y específico para el rol actual.
  const markNotificationReadAndShowDetails = useCallback(
    async (notification) => {
      await markNotificationRead(notification);

      setSelectedNotification(notification);
      setShowModal(true);
      setShowDropdown(false);
    },
    [markNotificationRead],
  );

  const resolveQuotationForNotification = useCallback(async (notification) => {
    const destination = resolveNotificationDestination(notification, userRole);
    const context = normalizeNotificationContext(notification);
    let cotizacionId =
      destination?.cotizacionId ||
      context.cotizacion_id ||
      context.quotation_id ||
      context.original_cotizacion_id ||
      null;
    let embeddedQuotation = null;

    const voucherVentaId =
      destination?.voucherVentaId ||
      context.voucher_venta_id ||
      context.voucher_id ||
      null;
    const voucherReservaId =
      destination?.voucherReservaId ||
      context.voucher_reserva_id ||
      context.reservation_voucher_id ||
      null;

    if (!cotizacionId && voucherVentaId) {
      const response = await voucherVentaService.getVoucherWithCotizacionById(
        voucherVentaId,
        { skipCache: true, _skipDedup: true },
      );
      const voucher = response?.data || response || {};
      embeddedQuotation =
        voucher.cotizacion_data ||
        voucher.cotizacionData ||
        voucher.cotizacion ||
        voucher.quotation ||
        null;
      cotizacionId =
        embeddedQuotation?.id ||
        embeddedQuotation?.cotizacion_id ||
        voucher.cotizacion_id ||
        voucher.cotizacionId ||
        null;
    }

    if (!cotizacionId && voucherReservaId) {
      const response =
        await voucherReservaService.getVoucherReservaWithRelationsById(
          voucherReservaId,
        );
      const voucherReserva = response?.data || response || {};
      embeddedQuotation =
        voucherReserva.cotizacion_data ||
        voucherReserva.cotizacionData ||
        voucherReserva.cotizacion ||
        voucherReserva.quotation ||
        null;
      cotizacionId =
        embeddedQuotation?.id ||
        embeddedQuotation?.cotizacion_id ||
        voucherReserva.cotizacion_id ||
        voucherReserva.cotizacionId ||
        null;
    }

    if (!cotizacionId) {
      throw new Error(
        "La notificación no contiene una cotización vinculada para abrir su historial.",
      );
    }

    // Reservas obtiene la cotización desde su propio endpoint con relaciones.
    // Esto evita redirigirla al módulo comercial o depender de permisos de esa
    // pantalla para abrir un historial que debe ser de solo lectura.
    if (Number(userRole) === 3 && embeddedQuotation) {
      return {
        ...embeddedQuotation,
        id: embeddedQuotation.id || embeddedQuotation.cotizacion_id || cotizacionId,
        tiene_voucher: true,
      };
    }

    try {
      return await cotizacionService.getCotizacionById(cotizacionId, {
        skipCache: true,
        _skipDedup: true,
      });
    } catch (error) {
      if (embeddedQuotation) {
        return {
          ...embeddedQuotation,
          id: embeddedQuotation.id || embeddedQuotation.cotizacion_id || cotizacionId,
          tiene_voucher: true,
        };
      }
      throw error;
    }
  }, [userRole]);

  const openNotificationDestination = useCallback(
    async (notification) => {
      const destination = resolveNotificationDestination(notification, userRole);
      if (!destination) return false;

      await markNotificationRead(notification);
      setShowDropdown(false);
      setShowModal(false);
      setSelectedNotification(null);

      if (destination.kind === "quotation_history") {
        setHistoryOpening(true);
        try {
          const quotation = await resolveQuotationForNotification(notification);
          setHistoryCotizacion(quotation);
          return true;
        } catch (error) {
          console.error("No se pudo abrir el historial desde la notificación:", error);
          showError(
            error?.message ||
              "No se pudo localizar el historial relacionado con esta notificación.",
            { autoHideDuration: 4500 },
          );
          return false;
        } finally {
          setHistoryOpening(false);
        }
      }

      if (!destination.path) return false;
      navigate(destination.path);
      return true;
    },
    [
      markNotificationRead,
      navigate,
      resolveQuotationForNotification,
      showError,
      userRole,
    ],
  );

  const handlePrimaryNotificationAction = useCallback(
    async (notification) => {
      const opened = await openNotificationDestination(notification);
      if (!opened) {
        await markNotificationReadAndShowDetails(notification);
      }
    },
    [markNotificationReadAndShowDetails, openNotificationDestination],
  );

  // Detectar si una notificación es una solicitud de permiso
  const isPermissionRequest = useCallback((notification) => {
    const contextData = notification.datos_contexto || {};
    const isPermission =
      contextData.action === "permission_request" && contextData.permission_id;

    return isPermission;
  }, []);

  // Detectar si una notificación es una solicitud de pago
  const isPaymentRequest = useCallback((notification) => {
    const contextData = notification.datos_contexto || {};
    // FIX: usar payment_request_id en vez de service_data
    // El backend NO envía service_data en la notificación; sí envía payment_request_id
    const isPayment =
      contextData.type === "pago_solicitado" && contextData.payment_request_id;

    return isPayment;
  }, []);

  // Detectar si una notificación es un pago COMPLETADO
  const isPaymentCompleted = useCallback((notification) => {
    const contextData = notification.datos_contexto || {};
    const isCompleted =
      contextData.type === "pago_completado" && contextData.movimiento_id;

    return isCompleted;
  }, []);

  // Manejar aprobación de permiso
  const handleApprovePermission = useCallback(
    async (notification, approved) => {
      const contextData = notification.datos_contexto || {};
      const permissionId = contextData.permission_id;

      if (!permissionId) {
        console.error(" No se encontró permission_id en la notificación");
        return;
      }

      // Si es rechazo, mostrar modal
      if (!approved) {
        setPendingRejectionNotification(notification);
        setShowRejectModal(true);
        return;
      }

      // Aprobación directa
      try {
        const response = await permissionService.approvePermission(
          permissionId,
          true,
          null,
        );

        if (response && response.success) {
          // Marcar notificación como leída y eliminarla
          await markAsRead(notification.id);
          await deleteNotification(notification.id);

          // Recargar notificaciones
          fetchNotifications();

          // Mostrar mensaje de éxito con snackbar (3 segundos)
          showSuccess("Permiso aprobado exitosamente", {
            autoHideDuration: 3000,
          });
        } else {
          throw new Error("No se pudo aprobar el permiso");
        }
      } catch (error) {
        console.error(" Error al aprobar permiso:", error);
        showError(
          `Error al aprobar el permiso: ${error.message || "Error desconocido"}`,
          { autoHideDuration: 3000 },
        );
      }
    },
    [markAsRead, deleteNotification, fetchNotifications],
  );

  // Confirmar rechazo de permiso con razón
  const handleConfirmRejection = useCallback(async () => {
    if (!pendingRejectionNotification) return;

    const contextData = pendingRejectionNotification.datos_contexto || {};
    const permissionId = contextData.permission_id;

    try {
      const response = await permissionService.approvePermission(
        permissionId,
        false,
        rejectionReason || null,
      );

      if (response && response.success) {
        // Marcar notificación como leída y eliminarla
        await markAsRead(pendingRejectionNotification.id);
        await deleteNotification(pendingRejectionNotification.id);

        // Cerrar modal y limpiar estado
        setShowRejectModal(false);
        setPendingRejectionNotification(null);
        setRejectionReason("");

        // Recargar notificaciones
        fetchNotifications();

        // Mostrar mensaje de éxito
        alert(" Permiso rechazado exitosamente");
      } else {
        throw new Error("No se pudo rechazar el permiso");
      }
    } catch (error) {
      console.error(" Error al rechazar permiso:", error);
      alert(
        `Error al rechazar el permiso: ${error.message || "Error desconocido"}`,
      );
    }
  }, [
    pendingRejectionNotification,
    rejectionReason,
    markAsRead,
    deleteNotification,
    fetchNotifications,
  ]);

  // Cancelar rechazo
  const handleCancelRejection = useCallback(() => {
    setShowRejectModal(false);
    setPendingRejectionNotification(null);
    setRejectionReason("");
  }, []);

  // Manejar pago desde notificación (navegar a contabilidad/egresos con datos pre-cargados)
  const handlePayFromNotification = useCallback(
    async (notification) => {
      const contextData = notification.datos_contexto || {};

      // Marcar notificación como leída
      if (!notification.leida) {
        try {
          await markAsRead(notification.id);
        } catch (error) {
          console.error(" Error marcando notificación como leída:", error);
        }
      }

      // Fetch voucher_venta by code to get referencia_voucher_venta
      let referencia_voucher_venta = null;
      if (contextData.voucher_code) {
        try {
          const voucher = await voucherVentaService.getVoucherByCode(
            contextData.voucher_code,
          );
          if (voucher) {
            referencia_voucher_venta = voucher.id;
          } else {
            console.warn(
              ` No se encontró voucher venta con código: ${contextData.voucher_code}`,
            );
          }
        } catch (error) {
          console.error(" Error obteniendo voucher venta por código:", error);
        }
      }

      // Preparar datos para el formulario de pago (igual que PendingPaymentsModal)
      // Usar descripción basada en el tipo de servicio (parentService.typeService)
      const descripcionPago = generatePaymentDescription(
        contextData.service_data,
        contextData.voucher_code || contextData.voucher_reserva_id,
      );

      const normalizedServiceData = normalizePaymentServiceData(
        contextData.service_data,
      );
      const facturacion = resolveFacturacionFromServiceData(
        normalizedServiceData,
      );

      const paymentData = {
        descripcion: descripcionPago,
        monto: contextData.amount,
        observaciones: contextData.observaciones || "",
        contexto_pago: {
          tipo: "ServiciosVoucherReserva",
          payment_request_id: contextData.payment_request_id, // Incluir para que el backend pueda marcarlo como pagado
          facturacion,
          platform: contextData.platform || "venso", // Incluir platform del payment_request
          business_type: contextData.business_type || "B2C", // Incluir business_type del payment_request
        },
        payment_request_service_data: normalizedServiceData,
        payment_request_itinerario_servicio_id:
          contextData.itinerario_servicio_id || null,
        voucher_code: contextData.voucher_code,
        referencia_voucher_reserva: contextData.voucher_reserva_id,
        referencia_voucher_venta: referencia_voucher_venta, // Auto-populated
        platform: contextData.platform || "venso", // Incluir platform
        business_type: contextData.business_type || "B2C", // Incluir business_type
      };

      // Abrir modal de MovimientoForm directamente
      setMovimientoInitialData(paymentData);
      setShowMovimientoModal(true);

      // Cerrar dropdown
      setShowDropdown(false);
    },
    [markAsRead],
  );

  // Manejar pago completado desde notificación (usar service_data de la notificación)
  const handleViewPaymentCompleted = useCallback(
    async (notification) => {
      const contextData = notification.datos_contexto || {};

      // Marcar notificación como leída
      if (!notification.leida) {
        try {
          await markAsRead(notification.id);
        } catch (error) {
          console.error(" Error marcando notificación como leída:", error);
        }
      }

      // Verificar si la notificación incluye service_data
      if (contextData.service_data) {
        const newPaymentService = {
          assignedService: contextData.service_data,
        };

        const newPaymentVoucherData = {
          voucherReservaId: contextData.voucher_reserva_id,
          voucherReservaCode: contextData.voucher_code || "",
          dayIndex:
            contextData.service_data.day_index !== undefined
              ? contextData.service_data.day_index
              : 0,
          serviceIndex:
            contextData.service_data.service_index !== undefined
              ? contextData.service_data.service_index
              : 0,
        };

        setSelectedPaymentService(newPaymentService);
        setPaymentVoucherData(newPaymentVoucherData);
        setShowPaymentVoucherModal(true);
      } else {
        // Fallback: mostrar modal de detalles
        console.warn(" No se encontró service_data en la notificación");
        console.warn(
          " Esta notificación fue generada antes de la corrección del backend",
        );
        console.warn(
          " Recomiende regenerar las notificaciones de pago después de desplegar el backend",
        );
        setSelectedNotification(notification);
        setShowModal(true);
      }

      // Cerrar dropdown
      setShowDropdown(false);
    },
    [markAsRead],
  );

  // Handler para cuando se selecciona un pago desde PendingPaymentsModal
  const handlePaymentSelect = useCallback((paymentData) => {
    setMovimientoInitialData(paymentData);
    setShowMovimientoModal(true);
  }, []);

  // Limpiar notificaciones antiguas (igual que Leptos)
  const cleanupOldNotifications = useCallback(async () => {
    try {
      // Aquí implementarías la llamada al API para limpiar notificaciones
      fetchNotifications(); // Recargar después de limpiar
    } catch (error) {
      console.error(" Error limpiando notificaciones:", error);
    }
  }, [fetchNotifications]);

  // El frontend replica las reglas de alcance del backend para ocultar ruido
  // histórico durante despliegues escalonados y recalcular el contador visible.
  const visibleNotifications = useMemo(
    () =>
      notifications.filter((notification) =>
        isNotificationVisibleForRole(notification, userRole),
      ),
    [notifications, userRole],
  );

  const sortedNotifications = useMemo(
    () =>
      [...visibleNotifications].sort((a, b) => {
        if (a.leida !== b.leida) {
          return a.leida ? 1 : -1;
        }
        const priorityDifference =
          Number(b.priority || 0) - Number(a.priority || 0);
        if (priorityDifference !== 0) return priorityDifference;
        return (
          new Date(b.fecha_creacion || b.created_at) -
          new Date(a.fecha_creacion || a.created_at)
        );
      }),
    [visibleNotifications],
  );

  const visibleUnreadCount = useMemo(
    () =>
      visibleNotifications.reduce(
        (total, notification) => total + (notification.leida ? 0 : 1),
        0,
      ),
    [visibleNotifications],
  );
  const hasNotifications = visibleUnreadCount > 0;
  const selectedContextEntries = selectedNotification
    ? getReadableContextEntries(selectedNotification.datos_contexto || {})
    : [];
  const selectedDestination = selectedNotification
    ? resolveNotificationDestination(selectedNotification, userRole)
    : null;

  return (
    <div className="notification-bell">
      <button
        ref={buttonRef}
        className={`bell-button ${hasNotifications ? "has-notifications" : ""}`}
        onClick={toggleDropdown}
        title="Notificaciones"
      >
        <MdNotifications className="bell-icon" aria-hidden="true" />
        {hasNotifications && (
          <span className="notification-count">
            {visibleUnreadCount > 99 ? "99+" : visibleUnreadCount}
          </span>
        )}
      </button>

      <div
        className={`notifications-dropdown ${showDropdown ? "open" : ""}`}
        ref={dropdownRef}
      >
        <div className="dropdown-header">
          <h3>Notificaciones</h3>
          <div className="header-actions">
            {hasNotifications && (
              <button className="mark-all-read" onClick={markAllAsRead}>
                <MdDoneAll />
                Marcar leídas
              </button>
            )}
            <button
              className="cleanup-old"
              title="Limpiar notificaciones antiguas (>7 días)"
              onClick={cleanupOldNotifications}
            >
              <MdCleaningServices />
              Limpiar
            </button>
          </div>
        </div>

        <div className="notifications-list">
          {isLoading ? (
            <div className="loading-notifications">
              <div className="loading-spinner"></div>
              <span>Cargando notificaciones...</span>
            </div>
          ) : sortedNotifications.length === 0 ? (
            <div className="empty-notifications">
              <MdNotificationsNone className="empty-icon" aria-hidden="true" />
              <div className="empty-message">No hay notificaciones</div>
              <div className="empty-submessage">
                Te notificaremos cuando haya algo nuevo
              </div>
            </div>
          ) : (
            sortedNotifications.map((notification) => {
              const isUnread = !notification.leida;
              const icon = getNotificationIcon(notification.tipo);
              const timeAgo = formatTimeAgo(
                notification.fecha_creacion || notification.created_at,
              );
              const notificationTypeClass = getNotificationTypeClass(
                notification.tipo,
              );
              const isPermission = isPermissionRequest(notification);
              const isPaymentPending = isPaymentRequest(notification);
              const isPaymentDone = isPaymentCompleted(notification);
              const destination = resolveNotificationDestination(
                notification,
                userRole,
              );
              const isPriority = Number(notification.priority || 0) >= 3;

              return (
                <div
                  key={notification.id}
                  className={`notification-item ${isUnread ? "unread" : "read"} ${isPriority ? "priority-critical" : ""}`}
                >
                  <div
                    className="notification-content-wrapper"
                    onClick={(e) => {
                      e.preventDefault();
                      // Si es pago completado, abrir modal en lugar de navegar
                      if (isPaymentDone) {
                        handleViewPaymentCompleted(notification);
                      } else if (isPaymentPending) {
                        handlePayFromNotification(notification);
                      } else {
                        handlePrimaryNotificationAction(notification);
                      }
                    }}
                  >
                    <div
                      className={`notification-icon ${notificationTypeClass}`}
                    >
                      {icon}
                    </div>
                    <div className="notification-content">
                      <div className="notification-title">
                        {notification.titulo}
                      </div>
                      <div className="notification-message">
                        {notification.mensaje}
                      </div>
                      <div className="notification-time">{timeAgo}</div>
                      {destination?.label && (
                        <div className="notification-destination">
                          <MdOpenInNew /> {destination.label}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="notification-actions">
                    {/* Botones especiales para solicitudes de permiso */}
                    {isPermission ? (
                      <>
                        <button
                          className="btn-approve-permission"
                          title="Aprobar permiso"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleApprovePermission(notification, true);
                          }}
                        >
                          <MdCheck />
                        </button>
                        <button
                          className="btn-reject-permission"
                          title="Rechazar permiso"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleApprovePermission(notification, false);
                          }}
                        >
                          <MdClose />
                        </button>
                      </>
                    ) : isPaymentPending ? (
                      /* Botón especial para solicitudes de pago */
                      <button
                        className="btn-pay-from-notification"
                        title="Pagar ahora"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handlePayFromNotification(notification);
                        }}
                      >
                        <MdOutlinePayments />
                        Pagar
                      </button>
                    ) : isPaymentDone ? (
                      /* Botones para pagos completados */
                      <>
                        <button
                          className="btn-details-notification"
                          title="Ver detalles"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            markNotificationReadAndShowDetails(notification);
                          }}
                        >
                          <MdVisibility />
                        </button>
                        <button
                          className="btn-delete-notification"
                          title="Borrar notificación"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                        >
                          <MdDeleteOutline />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn-details-notification"
                          title="Ver detalles"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            markNotificationReadAndShowDetails(notification);
                          }}
                        >
                          <MdVisibility />
                        </button>
                        <button
                          className="btn-delete-notification"
                          title="Borrar notificación"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                        >
                          <MdDeleteOutline />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal para detalles de notificación (igual que Leptos) */}
      {showModal && selectedNotification && (
        <div
          className="notification-modal-overlay"
          onClick={() => {
            setShowModal(false);
            setSelectedNotification(null);
          }}
        >
          <div
            className="notification-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div
                className={`modal-icon ${getNotificationTypeClass(selectedNotification.tipo)}`}
              >
                {getNotificationIcon(selectedNotification.tipo)}
              </div>
              <h2 className="modal-title">{selectedNotification.titulo}</h2>
              <button
                className="modal-close"
                onClick={() => {
                  setShowModal(false);
                  setSelectedNotification(null);
                }}
              >
                <MdClose />
              </button>
            </div>
            <div className="modal-body">
              <div className="notification-detail-section">
                <h3>
                  <MdDescription /> Descripción
                </h3>
                <p className="modal-message">{selectedNotification.mensaje}</p>
              </div>

              <div className="notification-detail-section">
                <h3>
                  <MdInfoOutline /> Información General
                </h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">
                      <MdSchedule /> Fecha y Hora:
                    </span>
                    <span className="detail-value">
                      {formatTimeAgo(
                        selectedNotification.fecha_creacion ||
                          selectedNotification.created_at,
                      )}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">
                      <MdLabelOutline /> Tipo:
                    </span>
                    <span className="detail-value">
                      {getNotificationTypeLabel(selectedNotification.tipo)}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">
                      <MdMarkEmailRead /> Estado:
                    </span>
                    <span className="detail-value">
                      {selectedNotification.leida ? "Leída" : "No leída"}
                    </span>
                  </div>
                </div>
              </div>

              {selectedContextEntries.length > 0 && (
                <div className="notification-detail-section">
                  <h3>
                    <MdInfoOutline /> Detalles útiles
                  </h3>
                  <div className="context-summary-grid">
                    {selectedContextEntries.map((entry) => (
                      <div className="context-summary-item" key={entry.key}>
                        <span>{entry.label}</span>
                        <strong>{entry.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {selectedDestination && (
                <button
                  className="btn-open-notification"
                  onClick={() =>
                    openNotificationDestination(selectedNotification)
                  }
                >
                  <MdOpenInNew />
                  {selectedDestination.label}
                </button>
              )}
              <button
                className="btn-close"
                onClick={() => {
                  setShowModal(false);
                  setSelectedNotification(null);
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de rechazo de permiso */}
      {showRejectModal && (
        <div className="modal-overlay" onClick={handleCancelRejection}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <MdBlock /> Rechazar Solicitud de Permiso
              </h2>
              <button
                className="btn-close-modal"
                onClick={handleCancelRejection}
              >
                <MdClose />
              </button>
            </div>
            <div className="modal-body">
              <p className="reject-modal-message">
                ¿Está seguro que desea rechazar esta solicitud de permiso?
              </p>
              {pendingRejectionNotification && (
                <div className="reject-modal-notification-info">
                  <p>
                    <strong>Solicitud:</strong>{" "}
                    {pendingRejectionNotification.titulo}
                  </p>
                  <p>
                    <strong>Mensaje:</strong>{" "}
                    {pendingRejectionNotification.mensaje}
                  </p>
                </div>
              )}
              <div className="form-group">
                <label htmlFor="rejectionReason">
                  Motivo del rechazo (opcional):
                </label>
                <textarea
                  id="rejectionReason"
                  className="rejection-reason-textarea"
                  placeholder="Ingrese el motivo del rechazo..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-confirm-reject"
                onClick={handleConfirmRejection}
              >
                Confirmar Rechazo
              </button>
              <button className="btn-cancel" onClick={handleCancelRejection}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {historyOpening && (
        <div
          className="notification-history-loading"
          role="dialog"
          aria-modal="true"
          aria-label="Cargando historial de cotización"
        >
          <div className="notification-history-loading__panel">
            <span className="notification-history-loading__spinner" />
            <strong>Abriendo historial</strong>
            <p>Estamos cargando la cotización vinculada a la notificación.</p>
          </div>
        </div>
      )}

      {historyCotizacion && (
        <Suspense
          fallback={
            <div className="notification-history-loading" role="status">
              <div className="notification-history-loading__panel">
                <span className="notification-history-loading__spinner" />
                <strong>Preparando historial</strong>
              </div>
            </div>
          }
        >
          <QuotationHistoryModal
            cotizacion={historyCotizacion}
            userRole={Number(userRole)}
            modalMode
            allowRestore={Number(userRole) === 0 || Number(userRole) === 2}
            onRefresh={
              Number(userRole) === 3
                ? undefined
                : async () => {
                    const fresh = await cotizacionService.getCotizacionById(
                      historyCotizacion.id,
                      { skipCache: true, _skipDedup: true },
                    );
                    setHistoryCotizacion(fresh);
                  }
            }
            onClose={() => setHistoryCotizacion(null)}
          />
        </Suspense>
      )}

      {/* Modal de pagos pendientes */}
      <PendingPaymentsModal
        isOpen={showPendingPaymentsModal}
        onClose={() => setShowPendingPaymentsModal(false)}
        onPaymentSelect={handlePaymentSelect}
      />

      {/* Modal de voucher de pago (para pagos completados) */}
      {showPaymentVoucherModal && selectedPaymentService && (
        <PaymentVoucherModal
          key={`payment-voucher-${paymentVoucherData.voucherReservaId}-${paymentVoucherData.dayIndex}-${paymentVoucherData.serviceIndex}`}
          show={showPaymentVoucherModal}
          onClose={() => {
            setShowPaymentVoucherModal(false);
            setSelectedPaymentService(null);
          }}
          service={selectedPaymentService}
          voucherReservaId={paymentVoucherData.voucherReservaId}
          voucherReservaCode={paymentVoucherData.voucherReservaCode}
          dayIndex={paymentVoucherData.dayIndex}
          serviceIndex={paymentVoucherData.serviceIndex}
        />
      )}

      {/* Modal de MovimientoForm (para crear egresos de pago) */}
      <MovimientoForm
        tipo="egreso"
        onSuccess={() => {
          setShowMovimientoModal(false);
          setMovimientoInitialData(null);

          // Recargar notificaciones para actualizar el estado
          fetchNotifications();

          // Emitir evento personalizado para que Egresos.jsx se actualice
          const event = new CustomEvent("movimientoCreated", {
            detail: { tipo: "egreso", source: "notification" },
          });
          window.dispatchEvent(event);
        }}
        isOpen={showMovimientoModal}
        onClose={() => {
          setShowMovimientoModal(false);
          setMovimientoInitialData(null);
        }}
        initialData={movimientoInitialData}
      />
    </div>
  );
};

export default NotificationBell;
