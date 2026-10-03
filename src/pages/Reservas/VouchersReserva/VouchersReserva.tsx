import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useDeferredValue,
} from "react";
import {
  MdSearch,
  MdClear,
  MdOutlineError,
  MdCalendarMonth,
  MdExpandMore,
  MdExpandLess,
  MdConfirmationNumber,
} from "react-icons/md";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import SecureStorage from "../../../utils/secureStorage";
import "./VouchersReserva.scss";
import MessageDisplay from "../../../components/UI/MessageDisplay/MessageDisplay";
import LoadingIndicator from "../../../components/UI/LoadingIndicator/LoadingIndicator";

// Import services
import { voucherVentaService } from "../../../services/voucherVentaService";
import { voucherReservaService } from "../../../services/voucherReservaService";
import { summarizeVoucherFinancials } from "../../Ventas/VouchersVenta/utils/voucherFinancials";
import AgencyPaymentReportModal from "../../../components/Contabilidad/AgencyPaymentReportModal";

// Import service components
import EdicionReserva from "./components/EdicionReserva";
import ServiceSummaryModal from "./components/ServiceSummaryModal/ServiceSummaryModal";
import VoucherReservaCard from "./components/VoucherReservaCard/VoucherReservaCard";
import VentasSummaryModal from "../../Ventas/VouchersVenta/components/VentasSummaryModal/VentasSummaryModal";
import PaymentManagementModal from "./components/PaymentManagementModal/PaymentManagementModal";
import PredecesoresExpander from "../../Ventas/Cotizaciones/components/PredecesoresExpander";
import { buildClosedSaleQuotation } from "./components/QuotationVersionHistory/QuotationVersionHistory";
import VentasSummaryPDFModal from "../../Ventas/VouchersVenta/components/VentasSummaryPDFModal/VentasSummaryPDFModal";
import DocumentsManagerModal from "../../../components/Contabilidad/DocumentsManagerModal/DocumentsManagerModal";
import VoucherMediaManagerModal from "../../Ventas/Cotizaciones/components/VoucherMediaManagerModal";
import {
  invalidateReservaAssignmentGraphCache,
} from "../../../utils/cacheInvalidation";
import {
  hasAssignedService,
  mergeItineraryDaysByNumber,
} from "./utils/serviceAssignment";
import { buildReservationVoucherMap } from "./utils/reservationVoucherRender";
import { useAgencyDirectory } from "../../../hooks/useAgencyDirectory";
import AgencyGroups from "../../../components/common/AgencyGroups/AgencyGroups";
import { getQuotationAgency } from "../../../utils/quotationAgencyGroups";
import "../../../components/common/AgencyGroups/AgencyGroups.scss";
import {
  createClientResourceId,
  createIdempotencyKey,
} from "../../../utils/idempotency";

const VouchersReserva = () => {
  const { auth } = useAuth();
  const { data: agencies = [] } = useAgencyDirectory();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMounted = useRef(true);

  // IDs de vouchers de reserva recién eliminados en esta sesión. Se usan para
  // filtrar entradas que aún puedan venir de caché del backend mientras se
  // refresca la lista tras un borrado.
  const recentlyDeletedReservationIdsRef = useRef(new Set());
  const reservationCreatePromisesRef = useRef(new Map());
  const reservationCreateMetadataRef = useRef(new Map());

  // Use the same role source as VouchersVenta and normalize stored string roles.
  const storedRole = SecureStorage.getItem("userRole");
  const userRole = Number(auth?.role ?? storedRole ?? 1);
  const currentActorDni = String(
    auth?.dniuser ||
      auth?.user?.dniuser ||
      auth?.user?.dni ||
      SecureStorage.getItem("dniuser") ||
      "",
  ).trim();

  // State for vouchers data
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State for filters
  const [filters, setFilters] = useState({
    fechaEmision: "",
    pasajeros: "",
    voucherCode: "",
  });

  // State for notifications
  const [snackbar, setSnackbar] = useState({
    show: false,
    message: "",
    type: "info",
  });

  // State for reservations-specific modals
  const [showServicesEditor, setShowServicesEditor] = useState(false);
  const [showServicesSummary, setShowServicesSummary] = useState(false);
  const [currentVoucher, setCurrentVoucher] = useState(null);
  const [reservationVoucher, setReservationVoucher] = useState(null);
  const [showPDFPreviewModal, setShowPDFPreviewModal] = useState(null);
  const [agencyPaymentVoucher, setAgencyPaymentVoucher] = useState(null);

  // State for payment management modal
  const [showPaymentManagement, setShowPaymentManagement] = useState(false);
  const [selectedVoucherForPayments, setSelectedVoucherForPayments] =
    useState(null);

  // State for documents management modal
  const [showDocumentsModal, setShowDocumentsModal] = useState(false);
  const [selectedVoucherForDocuments, setSelectedVoucherForDocuments] =
    useState(null);

  const [voucherMediaVoucher, setVoucherMediaVoucher] = useState(null);

  // State for processing status
  const [isProcessing, setIsProcessing] = useState(false);

  const viewMode = "list";

  // Add state for voucher preview modal
  const [showVoucherPreview, setShowVoucherPreview] = useState(false);
  const [selectedVoucherForModal, setSelectedVoucherForModal] = useState(null);
  const [editingServices, setEditingServices] = useState(false);
  const [notificationHistoryQuotation, setNotificationHistoryQuotation] =
    useState(null);

  // Estado para acordeones
  const [expandedYears, setExpandedYears] = useState({});
  const [expandedMonths, setExpandedMonths] = useState({});

  // IMPORTANT: Define closeAllModals first, before any useEffect hooks that call it
  const closeAllModals = useCallback(() => {
    // Reset all modal states
    setShowServicesEditor(false);
    setShowServicesSummary(false);
    setShowPaymentManagement(false);
    setShowDocumentsModal(false);
    setVoucherMediaVoucher(null);

    // Reset selected data
    setCurrentVoucher(null);
    setReservationVoucher(null);
    setSelectedVoucherForModal(null);
    setSelectedVoucherForPayments(null);
    setSelectedVoucherForDocuments(null);
    setShowVoucherPreview(false);
    setEditingServices(false);

    // Restore body scrolling immediately
    document.body.style.removeProperty("overflow");
  }, []);

  // Set isMounted ref to false when component unmounts
  useEffect(() => {
    return () => {
      isMounted.current = false;
      // Close all modals and reset states when component unmounts
      closeAllModals();
    };
  }, [closeAllModals]);

  const parseVoucherDate = (rawDate) => {
    if (!rawDate) return null;
    if (rawDate instanceof Date) {
      return Number.isNaN(rawDate.getTime()) ? null : rawDate;
    }

    const raw = String(rawDate).trim();
    if (!raw) return null;

    // Parse ISO date-only strings as local dates to avoid timezone shifts
    const isoDateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDateOnly && !raw.includes("T")) {
      const [, year, month, day] = isoDateOnly;
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const getVoucherCotizacionData = (voucher) =>
    voucher?.cotizacionData ||
    voucher?.cotizacion_data ||
    voucher?.reservationVoucher?.cotizacionData ||
    voucher?.reservationVoucher?.cotizacion_data ||
    {};

  const getVoucherStartDate = (voucher) => {
    const cotizacion =
      voucher?.cotizacionData ||
      voucher?.cotizacion_data ||
      voucher?.reservationVoucher?.cotizacionData ||
      voucher?.reservationVoucher?.cotizacion_data ||
      {};
    return parseVoucherDate(
      cotizacion.fechainicio || voucher?.createdAt,
    );
  };

  const getVoucherEndDate = (voucher) => {
    const cotizacion =
      voucher?.cotizacionData ||
      voucher?.cotizacion_data ||
      voucher?.reservationVoucher?.cotizacionData ||
      voucher?.reservationVoucher?.cotizacion_data ||
      {};
    return parseVoucherDate(
      cotizacion.fechafin || voucher?.createdAt,
    );
  };

  const getVoucherDateKey = (voucher) =>
    (getVoucherStartDate(voucher) || getVoucherEndDate(voucher) || new Date(0))
      .toISOString()
      .split("T")[0];

  const sortVouchersByTravelDates = (items = []) =>
    [...items].sort((left, right) => {
      const leftStart = getVoucherStartDate(left)?.getTime() || 0;
      const rightStart = getVoucherStartDate(right)?.getTime() || 0;
      if (leftStart !== rightStart) return leftStart - rightStart;

      const leftEnd = getVoucherEndDate(left)?.getTime() || leftStart;
      const rightEnd = getVoucherEndDate(right)?.getTime() || rightStart;
      if (leftEnd !== rightEnd) return leftEnd - rightEnd;

      return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
    });

  // IMPROVED: Prevent infinite loop by memoizing checkVoucherMatchesFilters
  const checkVoucherMatchesFilters = useCallback((voucher, currentFilters) => {
    // Filter by voucher code
    if (
      currentFilters.voucherCode &&
      !voucher.voucherCode
        ?.toLowerCase()
        .includes(currentFilters.voucherCode.toLowerCase())
    ) {
      return false;
    }

    // Filter by fecha emisión
    if (currentFilters.fechaEmision) {
      const voucherDate = getVoucherDateKey(voucher);
      if (voucherDate !== currentFilters.fechaEmision) {
        return false;
      }
    }

    // Filter by pasajeros (search in passengerData)
    if (currentFilters.pasajeros) {
      const searchTerm = currentFilters.pasajeros.toLowerCase();
      const adults = voucher.passengerData?.adults || [];
      const children = voucher.passengerData?.children || [];
      const allPassengers = [...adults, ...children];

      // Search in passenger names
      const hasMatchingPassenger = allPassengers.some((passenger) =>
        (passenger.nombres + " " + passenger.apellidos)
          .toLowerCase()
          .includes(searchTerm),
      );

      if (!hasMatchingPassenger) {
        return false;
      }
    }

    return true;
  }, []);

  const deferredFilters = useDeferredValue(filters);

  const visibleVouchers = useMemo(() => {
    const activeVouchers = vouchers.filter(
      (voucher) => voucher.is_active !== false,
    );
    return sortVouchersByTravelDates(
      activeVouchers.filter((voucher) =>
        checkVoucherMatchesFilters(voucher, deferredFilters),
      ),
    );
  }, [vouchers, deferredFilters, checkVoucherMatchesFilters]);

  // Normalize voucher data to handle API field names
  const normalizeVoucherData = useCallback((voucher) => {
    const cotizacionData = voucher.cotizacion_data || voucher.cotizacionData;
    const fechaInicio =
      cotizacionData?.fechainicio || null;
    const fechaFin = cotizacionData?.fechafin || null;
    const financialSummary = summarizeVoucherFinancials({
      voucher,
      cotizacion: cotizacionData,
    });

    // Create a new object with normalized fields
    return {
      ...voucher,
      // Support both snake_case and camelCase fields
      id: voucher.id,
      voucherCode: voucher.voucher_code || voucher.voucherCode,
      cotizacionId: voucher.cotizacion_id || voucher.cotizacionId,
      createdAt: voucher.created_at || voucher.createdAt,
      updatedAt: voucher.updated_at || voucher.updatedAt,
      cotizacionData,
      fechaInicio,
      fechaFin,
      passengerData: voucher.passenger_data || voucher.passengerData,
      passengerSummary:
        voucher.passenger_summary || voucher.passengerSummary || null,
      documentData: voucher.document_data || voucher.documentData,
      paymentData: voucher.payment_data || voucher.paymentData,
      total_final: financialSummary.totalFinal,
      totalPaid: financialSummary.totalPaid,
      remainingAmount: financialSummary.remainingAmount,
      paymentStatus: financialSummary.paymentStatus,
      // Keep original fields too
      voucher_code: voucher.voucher_code,
      cotizacion_id: voucher.cotizacion_id,
      created_at: voucher.created_at,
      updated_at: voucher.updated_at,
      passenger_data: voucher.passenger_data,
      passenger_summary:
        voucher.passenger_summary || voucher.passengerSummary || null,
      document_data: voucher.document_data,
      payment_data: voucher.payment_data,
    };
  }, []);

  // Load vouchers from API. This is the only request that controls the full page loader.
  const loadVouchers = useCallback(async (showFullLoading = true, forceReload = false) => {
    if (showFullLoading) {
      setLoading(true);
      setError(null);
    }
    try {
      // Get vouchers from API with cotizacion data
      const response = await voucherVentaService.getVouchersWithCotizacion({
        skipCache: forceReload,
      });

      if (response.success && Array.isArray(response.data)) {
        const allVouchers = sortVouchersByTravelDates(
          response.data.map(normalizeVoucherData),
        );

        if (isMounted.current) {
          // Store ALL vouchers (including inactive)
          setVouchers(allVouchers);

          const activeVouchers = allVouchers.filter(
            (v) => v.is_active !== false,
          );

          console.log(
            ` Loaded ${allVouchers.length} total vouchers (${activeVouchers.length} active, ${allVouchers.length - activeVouchers.length} inactive)`,
          );

        }
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      console.error("Error loading vouchers:", err);
      if (isMounted.current) {
        setError(
          "Error al cargar los vouchers: " + (err.message || "Unknown error"),
        );
      }
    } finally {
      if (showFullLoading && isMounted.current) {
        setLoading(false);
      }
    }
  }, [normalizeVoucherData]);

  const vouchersRef = useRef(vouchers.length);
  useEffect(() => {
    vouchersRef.current = vouchers.length;
  }, [vouchers.length]);

  // Enrich vouchers with reservation assignment data. This must not block the initial list render.
  const loadReservationVouchers = useCallback(
    async (forceReload = false) => {
      if (!isMounted.current || (!forceReload && vouchersRef.current === 0)) {
        return;
      }

      try {
        const response =
          await voucherReservaService.getVoucherReservasWithRelations({
            skipCache: forceReload,
          });

        const reservationData = Array.isArray(response)
          ? response
          : response.data && Array.isArray(response.data)
            ? response.data
            : [];

        console.log(" Loading reservation vouchers:", {
          forceReload,
          reservationDataLength: reservationData.length,
          vouchersLength: vouchersRef.current,
        });

        const deletedReservationIds = recentlyDeletedReservationIdsRef.current;

        const reservationMap = buildReservationVoucherMap(
          reservationData,
          deletedReservationIds,
        );

        setVouchers((prevVouchers) => {
          const vouchersWithAssignmentStatus = prevVouchers.map((voucher) => {
            const voucherId = String(voucher.id);
            const reservationVoucher = reservationMap[voucherId] || null;
            const hasAssignment =
              reservationVoucher?.hasAssignedServices || false;

            const newVoucher = {
              ...voucher,
              hasAssignedServices: hasAssignment,
              reservationVoucher,
            };

            return newVoucher;
          });

          return vouchersWithAssignmentStatus;
        });
      } catch (err) {
        console.error("Error loading reservation vouchers from API:", err);
        setSnackbar({
          show: true,
          message:
            "No se pudieron cargar las asignaciones de reserva. La lista base sigue disponible.",
          type: "warning",
        });
      }
    },
    [],
  );

  // Helper function to force a complete refresh of all data (debounced)
  const forceCompleteRefreshRaw = useCallback(async () => {
    try {
      invalidateReservaAssignmentGraphCache();
      await loadVouchers(false, true);
      await loadReservationVouchers(true);
    } catch (error) {
      console.error("Error during forced refresh:", error);
    }
  }, [loadVouchers, loadReservationVouchers]);

  // Using single useEffect for initial load with cleanup
  useEffect(() => {
    isMounted.current = true;
    let cancelled = false;
    const runInitialLoad = async () => {
      await loadVouchers();
      if (!cancelled && isMounted.current) {
        loadReservationVouchers(true);
      }
    };
    runInitialLoad();
    return () => {
      cancelled = true;
      isMounted.current = false;
      closeAllModals();
      document.body.style.overflow = "";
    };
  }, [loadVouchers, loadReservationVouchers, closeAllModals]);

  // Listen for payment-related events and force fresh assignment/payment data.
  useEffect(() => {
    const handleForceRefresh = () => {
      forceCompleteRefreshRaw();
    };

    window.addEventListener("movimientoCreated", handleForceRefresh);
    window.addEventListener("quotationSaleUpdated", handleForceRefresh);
    window.addEventListener("paymentRequestCompleted", handleForceRefresh);
    window.addEventListener("paymentRequestPaid", handleForceRefresh);
    window.addEventListener("paymentRequestCancelled", handleForceRefresh);

    return () => {
      window.removeEventListener("movimientoCreated", handleForceRefresh);
      window.removeEventListener("quotationSaleUpdated", handleForceRefresh);
      window.removeEventListener("paymentRequestCompleted", handleForceRefresh);
      window.removeEventListener("paymentRequestPaid", handleForceRefresh);
      window.removeEventListener("paymentRequestCancelled", handleForceRefresh);
    };
  }, [forceCompleteRefreshRaw]);

  // Deep link desde el dropdown de notificaciones. Reservas no tiene acceso a
  // /ventas/cotizaciones, por lo que localiza el voucher vinculado y abre el
  // mismo history-modal-panel reutilizado por la vista comercial.
  useEffect(() => {
    if (searchParams.get("notification_action") !== "quotation_history") return;
    if (loading || notificationHistoryQuotation) return;

    const targetCotizacionId = searchParams.get("cotizacion_id");
    const targetVoucherVentaId = searchParams.get("voucher_venta_id");
    const targetVoucherReservaId = searchParams.get("voucher_reserva_id");

    const targetVoucher = vouchers.find((voucher) => {
      const quotation =
        voucher?.cotizacionData ||
        voucher?.cotizacion_data ||
        voucher?.cotizacion ||
        voucher?.quotation ||
        {};
      const reservation = voucher?.reservationVoucher || {};
      const cotizacionIds = [
        voucher?.cotizacionId,
        voucher?.cotizacion_id,
        quotation?.id,
        quotation?.cotizacion_id,
        reservation?.cotizacionId,
        reservation?.cotizacion_id,
      ];
      const voucherVentaIds = [
        voucher?.id,
        voucher?.voucherId,
        voucher?.voucher_id,
        voucher?.voucherVentaId,
        voucher?.voucher_venta_id,
        reservation?.voucherId,
        reservation?.voucher_id,
      ];
      const voucherReservaIds = [
        reservation?.id,
        voucher?.voucherReservaId,
        voucher?.voucher_reserva_id,
      ];

      const matches = (target, candidates) =>
        !target || candidates.some((candidate) => String(candidate) === target);

      const hasCommercialReference =
        Boolean(targetCotizacionId) || Boolean(targetVoucherVentaId);
      if (hasCommercialReference) {
        return (
          matches(targetCotizacionId, cotizacionIds) &&
          matches(targetVoucherVentaId, voucherVentaIds)
        );
      }

      return matches(targetVoucherReservaId, voucherReservaIds);
    });

    const quotation = targetVoucher
      ? buildClosedSaleQuotation(targetVoucher)
      : null;
    const nextParams = new URLSearchParams(searchParams);
    [
      "notification_action",
      "notification_id",
      "cotizacion_id",
      "voucher_venta_id",
      "voucher_reserva_id",
    ].forEach((key) => nextParams.delete(key));
    setSearchParams(nextParams, { replace: true });

    if (!quotation) {
      setSnackbar({
        show: true,
        message:
          "La notificación corresponde a una cotización que todavía no tiene una venta vinculada disponible en Reservas.",
        type: "warning",
      });
      return;
    }

    setNotificationHistoryQuotation(quotation);
  }, [
    loading,
    notificationHistoryQuotation,
    searchParams,
    setSearchParams,
    vouchers,
  ]);

  // Handle filter input changes — reactive filtering (no submit button needed)
  const handleFilterInputChange = (e) => {
    if (!isMounted.current) return;

    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  // Clear filters
  const handleClearFilters = () => {
    if (!isMounted.current) return;

    const clearedFilters = {
      fechaEmision: "",
      pasajeros: "",
      voucherCode: "",
    };
    setFilters(clearedFilters);
  };

  // Open service assignment editor - unified function for both assign and edit
  const handleAssignServices = (voucher) => {
    const isEditing =
      voucher.hasAssignedServices || !!voucher.reservationVoucher;
    setCurrentVoucher(voucher);
    setEditingServices(isEditing);
    setShowServicesEditor(true);
  };

  // New handler for viewing voucher details in modal
  const handleViewVoucherModal = (voucher) => {
    setSelectedVoucherForModal(voucher);
    setShowVoucherPreview(true);
    document.body.style.overflow = "hidden";
  };

  // Manejar vista previa de voucher en formato PDF
  const handlePreviewVoucherPDF = (voucher) => {
    setSelectedVoucherForModal(voucher);
    setShowPDFPreviewModal(true);
  };

  // View assigned services summary
  const handleViewServicesSummary = (voucher) => {
    if (!voucher.reservationVoucher) {
      setSnackbar({
        show: true,
        message: "Este voucher no tiene servicios asignados",
        type: "warning",
      });
      return;
    }

    setCurrentVoucher(voucher);
    setReservationVoucher(voucher.reservationVoucher);
    setShowServicesSummary(true);
    document.body.style.overflow = "hidden";
  };

  // Manage payments for assigned services
  const handleManagePayments = (voucher) => {
    if (!voucher.reservationVoucher) {
      setSnackbar({
        show: true,
        message: "Este voucher no tiene servicios asignados",
        type: "warning",
      });
      return;
    }

    // Pasamos el reservationVoucher con el voucher_code del voucher de venta incluido
    setSelectedVoucherForPayments({
      ...voucher.reservationVoucher,
      voucher_code_venta: voucher.voucher_code, // El voucher_code del voucher de venta
      voucherId: voucher.id,
      cotizacionData: getVoucherCotizacionData(voucher),
      passengerData: voucher.passengerData || voucher.passenger_data,
      agency_name: getQuotationAgency(voucher, agencies).name,
    });
    setShowPaymentManagement(true);
    document.body.style.overflow = "hidden";
  };

  // Payment completed callback
  const handlePaymentCompleted = () => {
    forceCompleteRefreshRaw();
  };

  const handleVoucherMedia = (voucher) => {
    const quote = getVoucherCotizacionData(voucher);
    const cotizacionId =
      quote?.id ||
      voucher?.cotizacion_id ||
      voucher?.reservationVoucher?.cotizacion_id;
    if (!cotizacionId) {
      setSnackbar({
        show: true,
        message: "No se pudo resolver la cotización vinculada a este voucher.",
        type: "warning",
      });
      return;
    }
    setVoucherMediaVoucher(voucher);
  };

  // Manage documents for voucher de venta asociado
  const handleManageDocuments = (voucher) => {
    // El voucher tiene acceso al voucher_venta asociado a través de su estructura
    // Necesitamos pasar el id del voucher de venta y su código
    console.log(
      " Abriendo gestor de documentos para voucher:",
      voucher.voucher_code,
    );
    setSelectedVoucherForDocuments({
      voucherId: voucher.id, // ID del voucher de venta
      voucherCode: voucher.voucher_code, // Código del voucher de venta
    });
    setShowDocumentsModal(true);
    document.body.style.overflow = "hidden";
  };

  // Close documents modal
  const handleCloseDocumentsModal = () => {
    setShowDocumentsModal(false);
    setSelectedVoucherForDocuments(null);
    document.body.style.overflow = "auto";
  };

  // Delete the reservation voucher after confirmation from the card popover.
  const handleUnlinkServices = useCallback(
    async (voucherToDelete) => {
      try {
        setIsProcessing(true);

        if (!voucherToDelete?.id) {
          throw new Error("Missing voucher information");
        }

        const voucher =
          vouchers.find((item) => item.id === voucherToDelete.id) ||
          voucherToDelete;
        if (!voucher || !voucher.reservationVoucher) {
          throw new Error(
            "No reservation voucher associated with this voucher",
          );
        }

        const reservationVoucherId = voucher.reservationVoucher.id;
        const voucherVentaId = voucher.id;

        // Marcamos el ID como recientemente eliminado para que no vuelva a
        // aparecer si el backend aún lo tiene en caché.
        recentlyDeletedReservationIdsRef.current.add(reservationVoucherId);

        // Actualización optimista: limpiamos la asignación del voucher de venta
        // localmente antes de refrescar, para que la UI reaccione inmediatamente.
        setVouchers((prevVouchers) =>
          prevVouchers.map((v) =>
            v.id === voucherVentaId
              ? {
                  ...v,
                  hasAssignedServices: false,
                  reservationVoucher: null,
                }
              : v,
          ),
        );

        await voucherReservaService.deleteVoucherReserva(reservationVoucherId);
        await forceCompleteRefreshRaw();

        setSnackbar({
          show: true,
          message: "Voucher de reserva eliminado correctamente",
          type: "success",
        });

        return true;
      } catch (error) {
        console.error("Error deleting reservation voucher:", error);
        setSnackbar({
          show: true,
          message: `Error al eliminar el voucher de reserva: ${error.message || "Error desconocido"}`,
          type: "error",
        });
        return false;
      } finally {
        setIsProcessing(false);
      }
    },
    [vouchers, forceCompleteRefreshRaw],
  );

  // Handler de guardado: las asignaciones per-service ya se guardan en el modal
  // Este handler maneja la creación de voucher-reserva (nuevo) y el refresco
  const handleSaveServiceAssignments = useCallback(
    async (voucherId, serviceAssignments) => {
      const operationKey = String(voucherId);
      const inFlight = reservationCreatePromisesRef.current.get(operationKey);
      if (inFlight) {
        return inFlight;
      }

      const operation = (async () => {
        let completed = false;

        try {
          setIsProcessing(true);

          if (!Array.isArray(serviceAssignments)) {
            throw new Error("Formato inválido de servicios asignados");
          }

          const voucher = vouchers.find(
            (item) => String(item.id) === operationKey,
          );
          if (!voucher) {
            throw new Error("No se encontró el voucher de venta seleccionado");
          }

          const isUpdating = Boolean(
            editingServices && voucher.reservationVoucher?.id,
          );

          if (!isUpdating) {
            const voucherIdNum = Number.parseInt(voucherId, 10);
            if (!Number.isInteger(voucherIdNum) || voucherIdNum <= 0) {
              throw new Error("El ID del voucher de venta es inválido");
            }

            const cotizacionId =
              currentVoucher?.cotizacionId ||
              currentVoucher?.cotizacion_id ||
              voucher?.cotizacionId ||
              voucher?.cotizacion_id;

            if (!cotizacionId) {
              throw new Error(
                "No se encontró la cotización asociada al voucher de venta",
              );
            }

            let metadata = reservationCreateMetadataRef.current.get(operationKey);
            if (!metadata) {
              metadata = {
                reservationId: createClientResourceId(
                  "VR",
                  voucherIdNum,
                  50,
                ),
                idempotencyKey: createIdempotencyKey(
                  "voucher-reserva-create",
                  voucherIdNum,
                ),
              };
              reservationCreateMetadataRef.current.set(operationKey, metadata);
            }

            const voucherCode =
              currentVoucher?.voucherCode ||
              currentVoucher?.voucher_code ||
              voucher?.voucherCode ||
              voucher?.voucher_code ||
              `VR-${voucherIdNum}`;

            const newReservationVoucher = {
              id: metadata.reservationId,
              voucher_id: voucherIdNum,
              cotizacion_id: cotizacionId,
              voucher_code: voucherCode,
              status: "active",
              created_by: String(SecureStorage.getItem("dniuser") || ""),
              platform:
                currentVoucher?.platform || voucher?.platform || "venso",
              business_type:
                currentVoucher?.business_type ||
                voucher?.business_type ||
                "B2C",
            };

            await voucherReservaService.createVoucherReserva(
              newReservationVoucher,
              {
                idempotencyKey: metadata.idempotencyKey,
              },
            );
          }

          await forceCompleteRefreshRaw();
          invalidateReservaAssignmentGraphCache();

          setShowServicesEditor(false);
          setCurrentVoucher(null);
          setEditingServices(false);
          setSnackbar({
            show: true,
            message: isUpdating
              ? "Validaciones actualizadas correctamente"
              : "Servicios validados correctamente",
            type: "success",
          });
          completed = true;
          return true;
        } catch (error) {
          console.error("Error guardando validaciones de servicios:", error);
          setSnackbar({
            show: true,
            message: `Error al ${editingServices ? "actualizar" : "validar"} servicios: ${error.message || "Error desconocido"}`,
            type: "error",
          });
          return false;
        } finally {
          setIsProcessing(false);
          reservationCreatePromisesRef.current.delete(operationKey);
          if (completed) {
            reservationCreateMetadataRef.current.delete(operationKey);
          }
        }
      })();

      reservationCreatePromisesRef.current.set(operationKey, operation);
      return operation;
    },
    [currentVoucher, editingServices, vouchers, forceCompleteRefreshRaw],
  );

  const handleServiceAssignmentComplete = useCallback(
    (voucherId, serviceAssignments) => {
      return handleSaveServiceAssignments(voucherId, serviceAssignments);
    },
    [handleSaveServiceAssignments],
  );

  // Helper: obtener fecha de inicio de reserva (o fallback)
  // Agrupar por año / mes para acordeones
  const yearGroups = useMemo(() => {
    const yearsMap = {};

    visibleVouchers.forEach((voucher) => {
      const date = getVoucherStartDate(voucher);
      if (!date) return;

      const year = date.getFullYear();
      const month = date.getMonth() + 1; // 1–12
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;

      if (!yearsMap[year]) {
        yearsMap[year] = {
          year,
          totalCount: 0,
          monthsMap: {},
        };
      }

      const yearObj = yearsMap[year];
      yearObj.totalCount += 1;

      if (!yearObj.monthsMap[monthKey]) {
        const labelRaw = new Intl.DateTimeFormat("es-PE", {
          month: "long",
          year: "numeric",
        }).format(date);

        const label = labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1);

        yearObj.monthsMap[monthKey] = {
          key: monthKey,
          month,
          label,
          vouchers: [],
        };
      }

      yearObj.monthsMap[monthKey].vouchers.push(voucher);
    });

    return Object.values(yearsMap)
      .sort((a, b) => b.year - a.year)
      .map((y) => ({
        year: y.year,
        totalCount: y.totalCount,
        months: Object.values(y.monthsMap).sort((a, b) => b.month - a.month),
      }));
  }, [visibleVouchers]);

  // Inicializar año/mes actual como abiertos
  useEffect(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    setExpandedYears((prev) => {
      let hasChanges = false;
      const next = { ...prev };
      yearGroups.forEach((yg) => {
        if (!(yg.year in next)) {
          next[yg.year] = yg.year === currentYear;
          hasChanges = true;
        }
      });
      return hasChanges ? next : prev;
    });

    setExpandedMonths((prev) => {
      let hasChanges = false;
      const next = { ...prev };
      yearGroups.forEach((yg) => {
        yg.months.forEach((m) => {
          const key = m.key;
          if (!(key in next)) {
            next[key] = yg.year === currentYear && m.month === currentMonth;
            hasChanges = true;
          }
        });
      });
      return hasChanges ? next : prev;
    });
  }, [yearGroups]);

  const toggleYear = (year) => {
    setExpandedYears((prev) => ({
      ...prev,
      [year]: !prev[year],
    }));
  };

  const toggleMonth = (monthKey) => {
    setExpandedMonths((prev) => ({
      ...prev,
      [monthKey]: !prev[monthKey],
    }));
  };

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Loading state
  if (loading) {
    return (
      <div className="vouchers-reserva-page">
        <div className="page-header">
          <h1>Vouchers de Reserva</h1>
        </div>
        <LoadingIndicator mensaje="Cargando vouchers..." />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="vouchers-reserva-page">
        <div className="page-header">
          <h1>Vouchers de Reserva</h1>
        </div>
        <MessageDisplay type="error" message={error} />
        <button onClick={loadVouchers} className="retry-button">
          Reintentar carga
        </button>
      </div>
    );
  }

  const handleCloseServicesEditor = () => {
    const wasEditing = editingServices;
    const hadReservation = Boolean(currentVoucher?.reservationVoucher);

    setShowServicesEditor(false);
    setCurrentVoucher(null);
    setEditingServices(false);
    document.body.style.overflow = "";

    // Si se cerró el editor de edición, refrescamos la lista porque el
    // autoguardado per-service pudo haber persistido cambios sin llamar a
    // onSave (por ejemplo, al usar el botón "Atrás" en lugar de Guardar).
    if (wasEditing && hadReservation) {
      forceCompleteRefreshRaw();
    }
  };

  if (showServicesEditor && currentVoucher) {
    return (
      <div
        className="vouchers-reserva-page vouchers-reserva-page--editor"
        data-testid="voucher-reserva-component"
      >
        {snackbar.show && (
          <MessageDisplay
            type={snackbar.type}
            message={snackbar.message}
            dismissible={true}
            onDismiss={() => setSnackbar({ ...snackbar, show: false })}
          />
        )}
        <EdicionReserva
          voucher={currentVoucher}
          onBack={handleCloseServicesEditor}
          onSave={handleServiceAssignmentComplete}
          isProcessing={isProcessing}
          isEditing={editingServices}
        />
      </div>
    );
  }

  return (
    <div
      className="vouchers-reserva-page"
      data-testid="voucher-reserva-component"
    >
      <div className="vouchers-reserva-sticky-top">
        <div className="page-header">
          <div className="page-heading">
            <span className="page-heading__icon" aria-hidden="true">
              <MdConfirmationNumber />
            </span>
            <div>
              <div className="page-heading__title-line">
                <h1>Reservas operativas</h1>
                <span>{visibleVouchers.length}</span>
              </div>
              <p>Asignaciones, pagos, documentos y seguimiento por viaje</p>
            </div>
          </div>
          <div className="reservation-list-mode">
            <span>Vista operativa</span>
            <strong>Lista</strong>
          </div>
        </div>

        <div className="filters-container">
          <div className="filter-row">
            <label className="filter-group">
              <span><MdSearch /> Código</span>
              <input
                type="text"
                name="voucherCode"
                value={filters.voucherCode}
                onChange={handleFilterInputChange}
                placeholder="Código del voucher"
              />
            </label>

            <label className="filter-group filter-group--date">
              <span><MdCalendarMonth /> Viaje</span>
              <input
                type="date"
                name="fechaEmision"
                value={filters.fechaEmision}
                onChange={handleFilterInputChange}
              />
            </label>

            <label className="filter-group filter-group--passenger">
              <span><MdSearch /> Pasajero</span>
              <input
                type="text"
                name="pasajeros"
                value={filters.pasajeros}
                onChange={handleFilterInputChange}
                placeholder="Nombre del pasajero"
              />
            </label>

            {(filters.voucherCode || filters.fechaEmision || filters.pasajeros) && (
              <button type="button" className="btn-clear" onClick={handleClearFilters}>
                <MdClear /> <span>Limpiar</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      {snackbar.show && (
        <MessageDisplay
          type={snackbar.type}
          message={snackbar.message}
          dismissible={true}
          onDismiss={() => setSnackbar({ ...snackbar, show: false })}
        />
      )}

      {/* Vouchers agrupados en acordeones Año → Mes */}
      <div className={`vouchers-container ${viewMode}`}>
        {yearGroups.length > 0 ? (
          <>
            <div className="vouchers-count">
              <span>{visibleVouchers.length} voucher(s) encontrado(s)</span>
            </div>

            {yearGroups.map((yearGroup) => {
              const isYearCurrent = yearGroup.year === currentYear;
              const isYearExpanded = !!expandedYears[yearGroup.year];

              return (
                <section
                  key={yearGroup.year}
                  className={`voucher-year-group ${isYearExpanded ? "expanded" : "collapsed"}`}
                >
                  <header
                    className="voucher-year-header"
                    onClick={() => toggleYear(yearGroup.year)}
                  >
                    <div className="year-header-left">
                      <div className="year-icon">
                        <MdCalendarMonth />
                      </div>
                      <div className="year-title">
                        <span className="year-text">{yearGroup.year}</span>
                        {isYearCurrent && (
                          <span className="year-badge current-year">
                            ACTUAL
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="year-header-right">
                      <span className="year-files-pill">
                        {yearGroup.totalCount} voucher(s)
                      </span>
                      <button
                        type="button"
                        className="year-toggle-btn"
                        aria-label={
                          isYearExpanded ? "Contraer año" : "Expandir año"
                        }
                      >
                        {isYearExpanded ? <MdExpandLess /> : <MdExpandMore />}
                      </button>
                    </div>
                  </header>

                  {isYearExpanded && (
                    <div className="voucher-year-body">
                      {yearGroup.months.map((monthGroup) => {
                        const monthKey = monthGroup.key;
                        const isMonthExpanded = !!expandedMonths[monthKey];

                        // extraer solo mes numérico para comparar con actual
                        const isMonthCurrent =
                          yearGroup.year === currentYear &&
                          monthGroup.month === currentMonth;

                        return (
                          <section
                            key={monthKey}
                            className={`voucher-month-group ${
                              isMonthExpanded ? "expanded" : "collapsed"
                            }`}
                          >
                            <header
                              className="voucher-month-header"
                              onClick={() => toggleMonth(monthKey)}
                            >
                              <div className="month-header-left">
                                <div className="month-icon">
                                  <MdCalendarMonth />
                                </div>
                                <div className="month-title">
                                  <span className="month-text">
                                    {monthGroup.label}
                                  </span>
                                  {isMonthCurrent && (
                                    <span className="month-badge current-month">
                                      MES ACTUAL
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="month-header-right">
                                <span className="month-files-pill">
                                  {monthGroup.vouchers.length} voucher(s)
                                </span>
                                <button
                                  type="button"
                                  className="month-toggle-btn"
                                  aria-label={
                                    isMonthExpanded
                                      ? "Contraer mes"
                                      : "Expandir mes"
                                  }
                                >
                                  {isMonthExpanded ? (
                                    <MdExpandLess />
                                  ) : (
                                    <MdExpandMore />
                                  )}
                                </button>
                              </div>
                            </header>

                            {isMonthExpanded && (
                              <AgencyGroups items={monthGroup.vouchers} agencies={agencies} listClassName="vouchers-grid" renderItem={(voucher) => (
                                  <VoucherReservaCard
                                    key={voucher.id}
                                    voucher={voucher}
                                    onAssignServices={handleAssignServices}
                                    onViewServicesSummary={
                                      handleViewServicesSummary
                                    }
                                    onManagePayments={handleManagePayments}
                                    onManageDocuments={handleManageDocuments}
                                    onPreviewPDF={() =>
                                      handlePreviewVoucherPDF(voucher)
                                    }
                                    onUnlinkServices={handleUnlinkServices}
                                    onViewVoucher={handleViewVoucherModal}
                                    onVoucherMedia={handleVoucherMedia}
                                    onAgencyPayment={() =>
                                      setAgencyPaymentVoucher(voucher)
                                    }
                                    userRole={userRole}
                                    allVouchers={vouchers}
                                    viewMode={viewMode}
                                  />
                                )} />
                            )}
                          </section>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </>
        ) : (
          <div className="no-vouchers">
            <div className="no-data-icon">
              <MdOutlineError />
            </div>
            <p>No hay vouchers disponibles</p>
          </div>
        )}
      </div>

      {/* Service Summary Modal */}
      {showServicesSummary && reservationVoucher && (
        <ServiceSummaryModal
          isOpen={showServicesSummary}
          onClose={() => {
            setShowServicesSummary(false);
            setReservationVoucher(null);
            document.body.style.overflow = "";
          }}
          reservationVoucher={reservationVoucher}
          userRole={userRole}
        />
      )}

      {/* Payment Management Modal */}
      {showPaymentManagement && selectedVoucherForPayments && (
        <PaymentManagementModal
          isOpen={showPaymentManagement}
          onClose={() => {
            setShowPaymentManagement(false);
            setSelectedVoucherForPayments(null);
            document.body.style.overflow = "";
          }}
          voucherReserva={selectedVoucherForPayments}
          onPaymentCompleted={handlePaymentCompleted}
        />
      )}

      {/* Voucher Preview Modal */}
      {agencyPaymentVoucher && (
        <AgencyPaymentReportModal
          isOpen={Boolean(agencyPaymentVoucher)}
          onClose={() => setAgencyPaymentVoucher(null)}
          cotizacionId={
            agencyPaymentVoucher.cotizacion_id ||
            agencyPaymentVoucher.reservationVoucher?.cotizacion_id ||
            getVoucherCotizacionData(agencyPaymentVoucher)?.id
          }
          voucherCode={agencyPaymentVoucher.voucher_code || agencyPaymentVoucher.reservationVoucher?.voucher_code}
          initialCotizacion={getVoucherCotizacionData(agencyPaymentVoucher)}
        />
      )}

      {showVoucherPreview && selectedVoucherForModal && (
        <VentasSummaryModal
          isOpen={showVoucherPreview}
          onClose={() => {
            setShowVoucherPreview(false);
            setSelectedVoucherForModal(null);
            document.body.style.overflow = "";
          }}
          voucher={selectedVoucherForModal}
        />
      )}

      {showPDFPreviewModal && (
        <VentasSummaryPDFModal
          isOpen={showPDFPreviewModal}
          onClose={() => {
            setShowPDFPreviewModal(false);
            setSelectedVoucherForModal(null);
          }}
          voucher={selectedVoucherForModal}
          isPDFView={true} // Indicar que es vista PDF
        />
      )}

      {/* Documents Manager Modal */}
      {showDocumentsModal && selectedVoucherForDocuments && (
        <DocumentsManagerModal
          isOpen={showDocumentsModal}
          onClose={handleCloseDocumentsModal}
          voucherId={selectedVoucherForDocuments.voucherId}
          voucherCode={selectedVoucherForDocuments.voucherCode}
        />
      )}

      {voucherMediaVoucher && (() => {
        const quote = getVoucherCotizacionData(voucherMediaVoucher);
        const quoteOwner = String(
          quote?.createdby || quote?.created_by || quote?.createdBy || "",
        ).trim();
        const canManageMedia =
          [0, 1, 3].includes(Number(userRole)) ||
          (Number(userRole) === 2 && quoteOwner === currentActorDni);
        return (
          <VoucherMediaManagerModal
            isOpen
            onClose={() => setVoucherMediaVoucher(null)}
            cotizacionId={
              quote?.id ||
              voucherMediaVoucher?.cotizacion_id ||
              voucherMediaVoucher?.reservationVoucher?.cotizacion_id
            }
            voucherCode={
              voucherMediaVoucher?.voucher_code ||
              voucherMediaVoucher?.reservationVoucher?.voucher_code
            }
            quotationTitle={quote?.titulo}
            initialMedia={quote?.source_voucher || quote?.sourceVoucher}
            legacyMedia={
              voucherMediaVoucher?.reservationVoucher?.resolvedVoucherMedia ||
              voucherMediaVoucher?.reservationVoucher?.voucherMedia
            }
            canManage={canManageMedia}
            uploadedBy={currentActorDni}
            onChanged={async () => {
              await forceCompleteRefreshRaw();
            }}
          />
        );
      })()}

      {notificationHistoryQuotation && (
        <PredecesoresExpander
          cotizacion={notificationHistoryQuotation}
          modalMode
          onClose={() => setNotificationHistoryQuotation(null)}
          userRole={userRole}
          allowRestore={false}
        />
      )}
    </div>
  );
};

export default VouchersReserva;
