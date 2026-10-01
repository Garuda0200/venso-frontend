import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  MdAdd,
  MdArrowBack,
  MdClose,
  MdPictureAsPdf,
  MdSave,
} from "react-icons/md";

// Import cotizacionService for API calls
import * as cotizacionService from "./hooks/cotizacionService";

// Import SecureStorage
import SecureStorage from "../../../utils/secureStorage";
import { getHotelRoomCapacity } from "../../../utils/hotelRoomTypes";

// Import the new VoucherModal component
import VoucherModal from "../VouchersVenta/components/VoucherModal";

// Import ServiceSummaryModal from Reservas
import ServiceSummaryModal from "../../Reservas/VouchersReserva/components/ServiceSummaryModal/ServiceSummaryModal";

// Import PDF components
import PdfPreviewModal from "../../../components/Ventas/Cotizaciones/PdfPreviewModal/PdfPreviewModal";

// Ensure proper import of the auth context
import { voucherReservaService } from "../../../services/voucherReservaService";
import { invalidateComisionesCache } from "../../../services/comisionesService";
import { invalidateCotizacionGraphCache } from "../../../utils/cacheInvalidation";
import { useAuth } from "../../../context/AuthContext";
import {
  canSearchCotizacionById,
  canViewAllCotizaciones,
} from "../../../utils/permissions";
import useCotizaciones from "./hooks/useCotizaciones";
import usePostSaleEditRequests from "./hooks/usePostSaleEditRequests";
import postSaleEditService from "../../../services/postSaleEditService";
import {
  canRequestPostSaleEdit,
  getRequestUiState,
  isApprovedAndUsable,
  isApprovalValidForSnapshot,
  normalizeUserRole,
} from "./utils/postSaleEditState";
import useCotizacionFilters from "./hooks/useCotizacionFilters";
import useActionButtons from "./hooks/useActionButtons";
import { useNotifications } from "../../../hooks/useNotifications";
import pasajeroService from "../../../services/pasajeroService";
import { getAgencyById } from "../../../services/agencyService";
import AgencyPaymentReportModal from "../../../components/Contabilidad/AgencyPaymentReportModal";
import VoucherMediaManagerModal from "./components/VoucherMediaManagerModal";
import PreLiquidacionModal from "./components/PreLiquidacionModal";

// Importar directamente la versión final del componente
import EdicionCotizacion from "../../../components/Ventas/Cotizaciones/EdicionCotizacion";
import LoadingIndicator from "../../../components/UI/LoadingIndicator/LoadingIndicator";
import MessageDisplay from "../../../components/UI/MessageDisplay/MessageDisplay";
import SummaryContent from "../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/SummaryContent/SummaryContent";
import {
  calculateExternalItineraryBreakdown,
  calculateCotizacionFinancialSummary,
} from "../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/cotizacionFinancialSummary";
import {
  resolveChildChargeSummary,
  resolveConvertedChildRoomFinancials,
} from "../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/financialDisplayHelpers";
import { deriveSelectedHotelFromDays } from "../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/hotelServiceHelpers";
import { resolveCotizacionPostSaveListState } from "./utils/cotizacionListState";
import {
  normalizeHotelDetallePayload,
  normalizeMojibakeValue,
} from "../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/hotelDetallePayload";
import { hydrateItinerarioFromDB } from "../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/itinerarioCleanupUtils";
import { buildPdfHotelPreviewRows } from "../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/pdfHotelPreviewData";
import { resolveSummaryContentPerRoomPricing } from "../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/summaryContentPricingParts";
import { calculateGeneralTotalsDetailed } from "../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/utils/priceCalculations";
import {
  resolveQuotationPricingSnapshot,
} from "../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/visibleSummaryTotals";

// Import confirmation modal component
import ConfirmationModal from "../../../components/common/ConfirmationModal/ConfirmationModal";

// Import refactored components
import CotizacionesFilter from "./components/CotizacionesFilter";
import CotizacionesTable from "./components/CotizacionesTable";
import CotizacionesEmpty from "./components/CotizacionesEmpty";
import BusinessTypeModal from "./components/BusinessTypeModal";
import CotizacionesDrafts from "./components/CotizacionesDrafts";
import PostSaleEditRequestModal from "./components/PostSaleEditRequestModal";
import { buildCotizacionPeopleDetails } from "./utils/cotizacionPassengerRows";

import "./Cotizaciones.scss";

const numberOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const coercePositiveCurrencyTotal = (...values) => {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round((parsed + Number.EPSILON) * 100) / 100;
    }
  }
  return 0;
};

const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null);

const normalizeIdentifier = (value) =>
  value === undefined || value === null ? "" : String(value).trim();

const getCurrentSellerDni = (user) =>
  normalizeIdentifier(user?.dniuser || user?.dni || user?.auth?.dniuser);

const getCotizacionSellerDni = (cotizacion = {}) =>
  normalizeIdentifier(
    cotizacion.createdby ||
      cotizacion.created_by ||
      cotizacion.createdBy ||
      cotizacion.vendedor_dniuser ||
      cotizacion.vendedor_dni,
  );

const cleanAdditionalCostsPayload = (value) => {
  let cleanCosts = value || {};

  if (typeof cleanCosts === "string") {
    try {
      cleanCosts = JSON.parse(cleanCosts);
    } catch {
      cleanCosts = {};
    }
  }

  if (!cleanCosts || typeof cleanCosts !== "object" || Array.isArray(cleanCosts)) {
    return {};
  }

  return Object.entries(cleanCosts).reduce((accumulator, [key, item]) => {
    if (!/^\d+$/.test(String(key))) {
      accumulator[key] = item;
    }
    return accumulator;
  }, {});
};

const normalizeAdditionalCostsForCotizaciones = (value, cotizacion = {}) => {
  const cleanCosts = cleanAdditionalCostsPayload(value);
  const applyAllChildren =
    firstDefined(
      cleanCosts?.applyAdditionalCostsToChildren,
      cleanCosts?.apply_additional_costs_to_children,
      true,
    ) !== false;
  const applyOperationalCostsToChildren = firstDefined(
    cleanCosts?.applyOperationalCostsToChildren,
    cleanCosts?.apply_operational_costs_to_children,
    applyAllChildren,
  );
  const applyFeeToChildren = firstDefined(
    cleanCosts?.applyFeeToChildren,
    cleanCosts?.apply_fee_to_children,
    applyAllChildren,
  );
  const applyExtraFeeToChildren = firstDefined(
    cleanCosts?.applyExtraFeeToChildren,
    cleanCosts?.apply_extra_fee_to_children,
    applyAllChildren,
  );
  const fee = firstDefined(cleanCosts?.fee, cleanCosts?.feeVal, cleanCosts?.fee_val, "25");
  const operationalCosts = firstDefined(
    cleanCosts?.operationalCosts,
    cleanCosts?.operational_costs,
    "0",
  );
  const extraFee = firstDefined(cleanCosts?.extraFee, cleanCosts?.extra_fee, 0);

  return {
    ...cleanCosts,
    operationalCosts: String(operationalCosts),
    operationalMode: String(
      firstDefined(cleanCosts?.operationalMode, cleanCosts?.operational_mode, "fixed"),
    ),
    fee: String(fee),
    feeVal: String(fee),
    feeMode: String(firstDefined(cleanCosts?.feeMode, cleanCosts?.fee_mode, "percentage")),
    extraFee: Number(extraFee || 0),
    applyAdditionalCostsToChildren: applyAllChildren,
    applyOperationalCostsToChildren,
    applyFeeToChildren,
    applyExtraFeeToChildren,
    childOperationalMode: String(
      firstDefined(
        cleanCosts?.childOperationalMode,
        cleanCosts?.child_operational_mode,
        cleanCosts?.operationalMode,
        cleanCosts?.operational_mode,
        "fixed",
      ),
    ),
    childOperationalCosts: String(
      firstDefined(
        cleanCosts?.childOperationalCosts,
        cleanCosts?.child_operational_costs,
        operationalCosts,
      ),
    ),
    childFeeMode: String(
      firstDefined(
        cleanCosts?.childFeeMode,
        cleanCosts?.child_fee_mode,
        cleanCosts?.feeMode,
        cleanCosts?.fee_mode,
        "percentage",
      ),
    ),
    childFee: String(firstDefined(cleanCosts?.childFee, cleanCosts?.child_fee, fee)),
    childExtraFee: Number(
      firstDefined(cleanCosts?.childExtraFee, cleanCosts?.child_extra_fee, extraFee, 0),
    ),
    calculatedOperational:
      cleanCosts?.calculatedOperational != null
        ? Number(cleanCosts.calculatedOperational)
        : null,
    calculatedFee:
      cleanCosts?.calculatedFee != null ? Number(cleanCosts.calculatedFee) : null,
    totalAdditional:
      cleanCosts?.totalAdditional != null ? Number(cleanCosts.totalAdditional) : null,
    finalTotal: coercePositiveCurrencyTotal(
      cleanCosts?.finalTotal,
      cleanCosts?.final_total,
      cleanCosts?.grandTotal,
      cleanCosts?.grand_total,
    ) || null,
    final_total: coercePositiveCurrencyTotal(
      cleanCosts?.finalTotal,
      cleanCosts?.final_total,
      cleanCosts?.grandTotal,
      cleanCosts?.grand_total,
    ) || null,
    grandTotal: coercePositiveCurrencyTotal(
      cleanCosts?.grandTotal,
      cleanCosts?.grand_total,
      cleanCosts?.finalTotal,
      cleanCosts?.final_total,
    ) || null,
    grand_total: coercePositiveCurrencyTotal(
      cleanCosts?.grandTotal,
      cleanCosts?.grand_total,
      cleanCosts?.finalTotal,
      cleanCosts?.final_total,
    ) || null,
    visibleSummaryGrandTotal: coercePositiveCurrencyTotal(
      cleanCosts?.visibleSummaryGrandTotal,
      cleanCosts?.summaryVisibleGrandTotal,
      cleanCosts?.acSummaryGrandTotal,
    ) || null,
    summaryVisibleGrandTotal: coercePositiveCurrencyTotal(
      cleanCosts?.summaryVisibleGrandTotal,
      cleanCosts?.visibleSummaryGrandTotal,
      cleanCosts?.acSummaryGrandTotal,
    ) || null,
    acSummaryGrandTotal: coercePositiveCurrencyTotal(
      cleanCosts?.acSummaryGrandTotal,
      cleanCosts?.visibleSummaryGrandTotal,
      cleanCosts?.summaryVisibleGrandTotal,
    ) || null,
    summaryVisibleParts: Array.isArray(cleanCosts?.summaryVisibleParts)
      ? cleanCosts.summaryVisibleParts
      : [],
    percentageBase:
      cleanCosts?.percentageBase != null ? Number(cleanCosts.percentageBase) : null,
    subtotalIndividual:
      cleanCosts?.subtotalIndividual != null
        ? Number(cleanCosts.subtotalIndividual)
        : null,
    hotelsTotal:
      cleanCosts?.hotelsTotal != null ? Number(cleanCosts.hotelsTotal) : null,
    hotelAdultTotal:
      cleanCosts?.hotelAdultTotal != null ? Number(cleanCosts.hotelAdultTotal) : null,
    hotelChildTotal:
      cleanCosts?.hotelChildTotal != null ? Number(cleanCosts.hotelChildTotal) : null,
    hotelConvertedChildTotal:
      cleanCosts?.hotelConvertedChildTotal != null
        ? Number(cleanCosts.hotelConvertedChildTotal)
        : null,
    subtotalNinos:
      cleanCosts?.subtotalNinos != null ? Number(cleanCosts.subtotalNinos) : null,
    hasIgv: cotizacion.hasigv || cotizacion.hasIgv || false,
    igvRate: cotizacion.igvrate || cotizacion.igvRate || 18,
  };
};

const normalizePerRoomPricingForSummary = (
  perRoomPricing = [],
  externalAdultTotal = 0,
) =>
  (Array.isArray(perRoomPricing) ? perRoomPricing : []).map((room) => {
    const baseWithoutExternal =
      numberOrZero(room?.base) + numberOrZero(room?.adicionales);
    const normalizedTotal =
      baseWithoutExternal > 0
        ? baseWithoutExternal
        : Math.max(0, numberOrZero(room?.totalPerPerson) - externalAdultTotal);
    const convertedBase =
      numberOrZero(room?.convertedChildBasePerPerson) ||
      numberOrZero(room?.convertedChildTotalPerPerson) ||
      numberOrZero(room?.convertedChildHotelPerPerson);

    return {
      ...room,
      totalPerPerson: normalizedTotal,
      displayTotalPerPerson:
        externalAdultTotal > 0
          ? normalizedTotal + externalAdultTotal
          : normalizedTotal,
      convertedChildDisplayTotalPerPerson:
        convertedBase || numberOrZero(room?.convertedChildDisplayTotalPerPerson),
    };
  });

const resolveGroupedHotelPricingForSummary = ({
  cotizacion = {},
  selectedHotel = null,
  peopleDetails = {},
  peopleCount = {},
  additionalCosts = {},
  summaryTotals = {},
  generalTotals = {},
  externalBreakdown = {},
}) =>
  normalizePerRoomPricingForSummary(
    resolveSummaryContentPerRoomPricing({
      ...cotizacion,
      selectedHotel,
      selected_hotel: selectedHotel,
      perRoomPricing: selectedHotel?.perRoomPricing || [],
      peopleDetails,
      people_details: peopleDetails,
      peopleCount,
      peoplecount: peopleCount,
      additionalCosts,
      additionalcosts: additionalCosts,
      subtotalIndividual: summaryTotals.subtotalIndividual,
      subtotal_individual: summaryTotals.subtotalIndividual,
      nonHotelExplicitChildTotal:
        generalTotals.nonHotelExplicitChildTotal ??
        summaryTotals.nonHotelExplicitChildTotal ??
        0,
      nonHotelConvertedChildTotal:
        generalTotals.nonHotelConvertedChildTotal ??
        summaryTotals.nonHotelConvertedChildTotal ??
        0,
      precio_it_ext_adulto: numberOrZero(externalBreakdown?.adultTotal),
    }),
    numberOrZero(externalBreakdown?.adultTotal),
  );

const calculateRoomAwareVisibleTotal = ({
  perRoomPricing = [],
  summaryTotals = {},
  peopleCount = {},
  externalBreakdown = {},
  nonHotelExplicitChildTotal = 0,
  nonHotelConvertedChildTotal = 0,
  baseExplicitChildCount = 0,
  baseConvertedChildCount = 0,
  hotelExplicitChildCount = 0,
  hotelConvertedChildCount = 0,
}) => {
  const rooms = Array.isArray(perRoomPricing) ? perRoomPricing : [];
  if (rooms.length === 0) return 0;

  const childSummary = resolveChildChargeSummary({
    childrenCount: numberOrZero(peopleCount?.children),
    baseExplicitChildCount,
    baseConvertedChildCount,
    hotelExplicitChildCount,
    hotelConvertedChildCount,
    nonHotelExplicitChildTotal,
    nonHotelConvertedChildTotal,
    hotelExplicitChildTotal: summaryTotals.hotelExplicitChildTotal || 0,
    hotelConvertedChildTotal: summaryTotals.hotelConvertedChildTotal || 0,
  });
  const childAdditionalPerPerson = Math.max(
    0,
    numberOrZero(summaryTotals.perUnifiedChildTotal) -
      numberOrZero(childSummary.unifiedPerChild),
  );

  const adultTotal = rooms.reduce((sum, room) => {
    const adultBeneficiaries = Math.max(
      0,
      numberOrZero(room?.adultBeneficiaries),
    );
    if (adultBeneficiaries <= 0) return sum;
    const value =
      numberOrZero(room?.displayTotalPerPerson) ||
      numberOrZero(room?.totalPerPerson) +
        numberOrZero(externalBreakdown?.adultTotal);
    return sum + Math.ceil(value) * adultBeneficiaries;
  }, 0);

  const roomChildTotal = rooms.reduce((sum, room) => {
    const convertedBeneficiaries = Math.max(
      0,
      numberOrZero(room?.convertedChildBeneficiaries),
    );
    if (convertedBeneficiaries <= 0) return sum;
    const childRoomFinancials = resolveConvertedChildRoomFinancials(
      room,
      childSummary,
      childAdditionalPerPerson,
      numberOrZero(externalBreakdown?.convertedChildTotal) /
        Math.max(1, childSummary.convertedCount),
    );
    return sum + Math.ceil(childRoomFinancials.totalPerChild) * convertedBeneficiaries;
  }, 0);

  const hasRoomChildren = rooms.some(
    (room) => numberOrZero(room?.convertedChildBeneficiaries) > 0,
  );
  // Sin niños alojados en una habitación, el core ya resuelve las cohortes
  // explícita/convertida y su solapamiento. No se vuelve a descomponer el
  // externo aquí para evitar duplicar tarifas infantiles o adult-as-child.
  const childTotalWithoutRoom =
    !hasRoomChildren && numberOrZero(peopleCount?.children) > 0
      ? numberOrZero(summaryTotals.childVisibleGrandTotal)
      : 0;

  return adultTotal + roomChildTotal + childTotalWithoutRoom;
};

const Cotizaciones = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // Get auth user explicitly at the top level
  const { user } = useAuth();

  // Un rol ausente nunca debe convertirse accidentalmente en superadmin.
  const rawRole =
    user?.role !== undefined ? user.role : SecureStorage.getItem("userRole");
  const userRole = normalizeUserRole(rawRole) ?? -1;
  const showAuditColumn = canViewAllCotizaciones(user);
  const allowInternalIdSearch = canSearchCotizacionById(user);
  const currentSellerDni = getCurrentSellerDni(user);
  const isReservasQuotationFlow = Number(userRole) === 3 || location.pathname.startsWith("/reservas/cotizaciones");
  const [sellerScope, setSellerScope] = useState("mine");
  const [quotationStatus, setQuotationStatus] = useState("open");
  const notificationHistoryTargetId =
    searchParams.get("notification_action") === "quotation_history"
      ? searchParams.get("cotizacion_id")
      : null;

  useEffect(() => {
    if (notificationHistoryTargetId) {
      setQuotationStatus("sold");
    }
  }, [notificationHistoryTargetId]);

  const consumeNotificationHistoryTarget = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams);
    [
      "notification_action",
      "notification_id",
      "cotizacion_id",
      "voucher_venta_id",
      "voucher_reserva_id",
    ].forEach((key) => nextParams.delete(key));
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Estado para controlar qué componente se muestra
  const [currentView, setCurrentView] = useState("list"); // 'list' or 'edicion'

  // Estado para datos de edición/creación
  const [editingData, setEditingData] = useState({
    isEditing: false,
    isNewCotizacion: false,
    clientData: null,
    cotizacion: null,
    selectedPackage: null,
    isNewPackage: true,
  });

  // New state for summary modal
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryData, setSummaryData] = useState(null);

  // Simplified voucher state - just track if modal is open and which cotizacion
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [voucherCotizacion, setVoucherCotizacion] = useState(null);

  // PDF Preview Modal state
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [pdfPreviewCotizacion, setPdfPreviewCotizacion] = useState(null);

  // ServiceSummaryModal state
  const [showServiceSummaryModal, setShowServiceSummaryModal] = useState(false);
  const [serviceSummaryVoucher, setServiceSummaryVoucher] = useState(null);

  // Informativo de pago disponible tanto para Venso principal como para agencias externas.
  const [agencyPaymentCotizacion, setAgencyPaymentCotizacion] = useState(null);
  const [voucherMediaCotizacion, setVoucherMediaCotizacion] = useState(null);
  const [preLiquidacionCotizacion, setPreLiquidacionCotizacion] = useState(null);
  const preLiquidacionRequest = useRef(0);

  // Dynamic agency selector for every new quotation.
  const [showBusinessTypeModal, setShowBusinessTypeModal] = useState(false);
  const [pendingQuotationClientData, setPendingQuotationClientData] =
    useState(null);

  // N8N PDF Canva processing state
  const [processingN8NId, setProcessingN8NId] = useState(null);
  const [isSavingCotizacion, setIsSavingCotizacion] = useState(false);
  const savePromiseRef = useRef(null);

  // Obtener datos y funciones del hook de cotizaciones
  const {
    cotizaciones,
    setCotizaciones,
    selectedCotizacion,
    snackbar,
    setSnackbar,
    showSnackbar,
    viewCotizacionDetails,
    handlePackageEdit,
    handleDeleteCotizacion,
    cancelDelete,
    formatDate,
    formatCurrency,
    handleDuplicarModelo,
    deletePopover,
    fetchCotizaciones,
  } = useCotizaciones();

  const {
    byCotizacion: postSaleRequestsByCotizacion,
    createRequest: createPostSaleEditRequest,
    cancelRequest: cancelPostSaleEditRequest,
    refresh: refreshPostSaleEditRequests,
    isFetched: postSaleRequestsFetched,
  } = usePostSaleEditRequests();
  const [postSaleRequestModal, setPostSaleRequestModal] = useState({
    open: false,
    cotizacion: null,
    loading: false,
  });

  useEffect(() => {
    if (
      !postSaleRequestsFetched ||
      currentView !== "edicion" ||
      !editingData.cotizacion?.tiene_voucher
    ) return;
    const cotizacionId = String(editingData.cotizacion.id || "");
    if (!cotizacionId) return;
    const liveRequest = postSaleRequestsByCotizacion[cotizacionId] || null;
    const currentRequest = editingData.cotizacion._postSaleEditRequest || null;
    const sameRequest =
      currentRequest?.id === liveRequest?.id &&
      currentRequest?.status === liveRequest?.status &&
      currentRequest?.updated_at === liveRequest?.updated_at &&
      currentRequest?.expires_at === liveRequest?.expires_at;
    if (sameRequest) return;
    setEditingData((previous) => ({
      ...previous,
      cotizacion: previous.cotizacion
        ? { ...previous.cotizacion, _postSaleEditRequest: liveRequest }
        : previous.cotizacion,
    }));
  }, [
    currentView,
    editingData.cotizacion?.id,
    editingData.cotizacion?.tiene_voucher,
    editingData.cotizacion?._postSaleEditRequest?.id,
    editingData.cotizacion?._postSaleEditRequest?.status,
    editingData.cotizacion?._postSaleEditRequest?.updated_at,
    editingData.cotizacion?._postSaleEditRequest?.expires_at,
    postSaleRequestsByCotizacion,
    postSaleRequestsFetched,
  ]);

  // Obtener notificaciones y confirmación mejorada
  const {
    confirmationModal,
    notification,
    confirmDelete: confirmDeleteNotif,
    showSuccess,
    showError,
    closeConfirmation,
  } = useNotifications();

  // Obtener funciones para filtros
  const {
    filters,
    filteredCotizaciones,
    handleInputChange,
    handleSearch,
    setFilters,
    clearFilters,
  } = useCotizacionFilters(cotizaciones, {
    allowIdSearch: allowInternalIdSearch,
  });

  // Obtener funciones para botones de acción - Now including state setters
  const {
    expandedActionsId,
    expandedPdfId,
    toggleActionButtons,
    togglePdfButtons,
    setExpandedActionsId,
    setExpandedPdfId,
  } = useActionButtons();

  // Estado de carga (simulado para este ejemplo)
  const [loading, setLoading] = useState(false);

  // Cada cotización debe elegir una agencia comercial. La plataforma de sesión
  // se conserva para permisos/auditoría, pero ya no define la cartera de tarifas.
  const handleCreateCotizacion = (clientData = null) => {
    setPendingQuotationClientData(clientData);
    // Reservas puede iniciar la cotización sin archivo de origen. El PDF/imagen
    // se asociará posteriormente desde la propia cotización cuando el storage
    // de VENSO esté configurado.
    setShowBusinessTypeModal(true);
  };

  const handleBusinessTypeSelect = (selection) => {
    const { agency, platform, businessType, tariffType } = selection;
    const selectedContext = {
      platform,
      businessType,
      tariffType,
      agency,
      agencyId: agency.id,
    };
    setShowBusinessTypeModal(false);

    setEditingData({
      isEditing: false,
      isNewCotizacion: true,
      clientData: pendingQuotationClientData,
      cotizacion: null,
      selectedPackage: null,
      isNewPackage: true,
      selectedBusinessType: selectedContext,
      sourceVoucher: null,
    });
    setPendingQuotationClientData(null);
    setCurrentView("edicion");
  };

  // Función para editar una cotización existente
  const handleEditCotizacionModal = async (cotizacion) => {
    const isPostSaleEdit = Boolean(cotizacion?.tiene_voucher);
    let livePostSaleRequest = null;
    if (isPostSaleEdit) {
      try {
        livePostSaleRequest = await postSaleEditService.getMine(cotizacion.id);
      } catch (error) {
        console.error("No se pudo validar la autorización postventa:", error);
      }
      if (!isApprovedAndUsable(livePostSaleRequest)) {
        await refreshPostSaleEditRequests();
        showSnackbar(
          "Esta venta está cerrada y requiere una autorización vigente para editarse",
          "error",
        );
        return;
      }
    }

    // Obtener datos frescos del servidor para asegurarse de que el itinerario
    // refleje el estado actual de las asignaciones (is_assigned en itinerario_servicio).
    let freshCotizacion = cotizacion;
    try {
      freshCotizacion = await cotizacionService.getCotizacionById(
        cotizacion.id,
        { skipCache: true },
      );
    } catch (err) {
      if (isPostSaleEdit) {
        console.error("No se pudo cargar el snapshot fresco para edición postventa:", err);
        showSnackbar(
          "No se pudo verificar el estado actual de la venta. Actualiza e inténtalo nuevamente",
          "error",
        );
        return;
      }
      console.warn(
        "No se pudo obtener datos frescos de cotización, usando caché:",
        err,
      );
    }

    if (isPostSaleEdit && !isApprovalValidForSnapshot(livePostSaleRequest, freshCotizacion)) {
      await refreshPostSaleEditRequests();
      showSnackbar(
        "La venta cambió después de la autorización. Solicita una nueva aprobación antes de editar",
        "error",
      );
      return;
    }

    // La agencia y el tipo de tarifa deben resolverse desde la fila fresca.
    // La lista puede conservar datos anteriores mientras React Query refetches.
    const cotizacionPlatform =
      freshCotizacion.platform ||
      cotizacion.platform ||
      user?.platform ||
      "venso";
    const cotizacionBusinessType =
      freshCotizacion.business_type ||
      freshCotizacion.businessType ||
      cotizacion.business_type ||
      user?.business_type ||
      "B2C";
    const agencyId = Number(
      freshCotizacion.agency_id ||
        freshCotizacion.agencyId ||
        cotizacion.agency_id ||
        cotizacion.agencyId ||
        0,
    );
    let quotationAgency = null;
    if (agencyId > 0) {
      try {
        quotationAgency = await getAgencyById(agencyId);
      } catch (agencyError) {
        console.warn(
          "No se pudo cargar la agencia de la cotización:",
          agencyError,
        );
      }
    }

    // Fetch passengers from pasajero table and enrich cotizacion
    let peopleDetails = { adults: [], children: [] };
    try {
      const dbPassengers = await pasajeroService.getPassengersByCotizacion(
        freshCotizacion.id,
      );
      peopleDetails = buildCotizacionPeopleDetails(
        dbPassengers,
        freshCotizacion,
      );
    } catch (err) {
      if (isPostSaleEdit) {
        console.error("No se pudieron verificar pasajeros para edición postventa:", err);
        showSnackbar(
          "No se pudieron verificar los pasajeros actuales de la venta. No se abrirá una edición insegura",
          "error",
        );
        return;
      }
      console.log("No passengers found for cotizacion:", err);
    }

    // Fallback: if no passengers in DB, create defaults
    if (peopleDetails.adults.length === 0) {
      const total =
        freshCotizacion.cantidadpersonas ||
        freshCotizacion.cantidadPersonas ||
        1;
      peopleDetails.adults = Array(total)
        .fill(0)
        .map((_, i) => ({
          id: i + 1,
          age: "18",
          nombres: i === 0 ? freshCotizacion.titulo?.split(" ")[0] || "" : "",
          apellidos:
            i === 0
              ? freshCotizacion.titulo?.split(" ").slice(1).join(" ") || ""
              : "",
        }));
    }

    const peopleCount = {
      adults: peopleDetails.adults.length || 1,
      children: peopleDetails.children.length || 0,
    };

    const enrichedCotizacion = {
      ...freshCotizacion,
      peopleDetails,
      peopleCount,
      ...(livePostSaleRequest
        ? { _postSaleEditRequest: livePostSaleRequest }
        : {}),
    };

    setEditingData({
      isEditing: true,
      isNewCotizacion: false,
      clientData: enrichedCotizacion.clientData || cotizacion.clientData,
      cotizacion: enrichedCotizacion,
      selectedPackage: enrichedCotizacion.packageData || cotizacion.packageData,
      isNewPackage:
        (freshCotizacion.packageData || cotizacion.packageData)?.isNewPackage ||
        false,
      // Incluir el platform/business_type de la cotización para edición
      selectedBusinessType: {
        platform: cotizacionPlatform,
        businessType: quotationAgency?.business_type || cotizacionBusinessType,
        tariffType:
          freshCotizacion.tariff_type ||
          freshCotizacion.tariffType ||
          cotizacion.tariff_type ||
          cotizacion.tariffType ||
          quotationAgency?.default_tariff_type ||
          (cotizacionBusinessType === "B2B" ? "interna" : "externa"),
        agency:
          quotationAgency ||
          (agencyId > 0
            ? {
                id: agencyId,
                name:
                  freshCotizacion.agency_name ||
                  cotizacion.agency_name ||
                  `Agencia #${agencyId}`,
              }
            : null),
        agencyId: quotationAgency?.id || agencyId || 1,
      },
    });
    setCurrentView("edicion");
  };

  // Función para restaurar un borrador
  const handleRestoreDraft = (draft) => {
    console.log(" Restaurando borrador:", draft.draftKey);
    console.log(
      " Platform/BusinessType del borrador:",
      draft.platform,
      draft.businessType,
    );

    if (draft.isEdit && draft.originalId) {
      // Es una edición de cotización existente
      // Buscar la cotización original en la lista
      const originalCotizacion = cotizaciones.find(
        (c) => c.id === draft.originalId,
      );
      if (originalCotizacion?.tiene_voucher) {
        showSnackbar(
          "Los borradores de una venta cerrada no pueden reabrirse directamente. Usa una autorización vigente",
          "error",
        );
        return;
      }

      setEditingData({
        isEditing: true,
        isNewCotizacion: false,
        clientData: draft.clientData || originalCotizacion?.clientData,
        // Usar los datos del borrador manteniendo el ID original
        cotizacion: {
          ...(originalCotizacion || {}),
          id: draft.originalId,
          titulo: draft.titulo,
          itinerario: draft.days,
          peopleDetails: draft.peopleDetails,
          peopleCount: draft.peopleCount,
          packageType: draft.packageType,
          additionalCosts: draft.additionalCosts,
          fechainicio: draft.formData?.fechainicio,
          fechafin: draft.formData?.fechafin,
          itinerario_externo: draft.externalDays || [],
          externalAdditionalCosts: draft.externalAdditionalCosts || {},
          includeChildrenInPricing: draft.includeChildrenInPricing ?? false,
          tasa_cambio: draft.currentTc ?? 3,
          // Mantener el draftKey para que EdicionCotizacion lo maneje
          _restoredFromDraft: draft.draftKey,
        },
        selectedPackage: null,
        isNewPackage: false,
        // Restaurar platform y businessType del borrador
        selectedBusinessType:
          draft.platform || draft.businessType || draft.agencyId || draft.agency
            ? {
                platform: draft.platform || "venso",
                businessType: draft.businessType || "B2C",
                tariffType:
                  draft.tariffType ||
                  (draft.businessType === "B2B" ? "interna" : "externa"),
                agency: draft.agency || null,
                agencyId: Number(draft.agencyId || draft.agency?.id || 1),
              }
            : null,
      });
    } else {
      // Es una cotización nueva
      setEditingData({
        isEditing: false,
        isNewCotizacion: true,
        clientData: draft.clientData,
        cotizacion: {
          titulo: draft.titulo,
          itinerario: draft.days,
          peopleDetails: draft.peopleDetails,
          peopleCount: draft.peopleCount,
          packageType: draft.packageType,
          additionalCosts: draft.additionalCosts,
          fechainicio: draft.formData?.fechainicio,
          fechafin: draft.formData?.fechafin,
          itinerario_externo: draft.externalDays || [],
          externalAdditionalCosts: draft.externalAdditionalCosts || {},
          includeChildrenInPricing: draft.includeChildrenInPricing ?? false,
          tasa_cambio: draft.currentTc ?? 3,
          _restoredFromDraft: draft.draftKey,
        },
        selectedPackage: null,
        isNewPackage: true,
        // Restaurar platform y businessType del borrador
        selectedBusinessType:
          draft.platform || draft.businessType || draft.agencyId || draft.agency
            ? {
                platform: draft.platform || "venso",
                businessType: draft.businessType || "B2C",
                tariffType:
                  draft.tariffType ||
                  (draft.businessType === "B2B" ? "interna" : "externa"),
                agency: draft.agency || null,
                agencyId: Number(draft.agencyId || draft.agency?.id || 1),
              }
            : null,
      });
    }

    setCurrentView("edicion");
  };

  // Función para manejar eliminación de borrador
  const handleRemoveDraft = (draftKey) => {
  };

  // Función que maneja el guardado de la cotización
  // State for dual-save choice when editing a processed cotizacion (fallback modal)
  const [saveChoiceModal, setSaveChoiceModal] = useState({
    isOpen: false,
    data: null,
  });

  const handleCotizacionSave = async (cotizacionData) => {
    const currentUserIdentifier =
      user?.dni || user?.dniuser || SecureStorage.getItem("dniuser") || "SYSTEM";
    const isSuperAdminRole = Number(userRole) === 0;
    const selectedCreatedBy =
      String(
        cotizacionData.createdby ||
          cotizacionData.created_by ||
          cotizacionData.createdBy ||
          "",
      ).trim() || null;

    const enrichedData = {
      ...cotizacionData,
      createdby:
        isSuperAdminRole && selectedCreatedBy
          ? selectedCreatedBy
          : currentUserIdentifier,
      updatedby: currentUserIdentifier,
    };

    // If EdicionCotizacion already included the _resetPdf choice, use it directly
    if (
      cotizacionData._resetPdf === true ||
      cotizacionData._resetPdf === false
    ) {
      return executeSave(enrichedData, cotizacionData._resetPdf);
    }

    const isEditing = !!cotizacionData.id;
    // Check if this cotizacion was already processed (has AI PDF)
    const wasProcessed =
      isEditing && editingData.cotizacion?.es_procesado === true;

    if (wasProcessed) {
      // Fallback: show choice dialog
      setSaveChoiceModal({ isOpen: true, data: enrichedData });
      return;
    }

    // Not processed or new cotizacion → save only (no auto PDF Canva generation)
    return executeSave(enrichedData, false);
  };

  // Execute save with optional PDF reset & PDF Canva trigger
  const executeSave = async (enrichedData, shouldRegenerate) => {
    // A second call receives the same in-flight promise instead of issuing a
    // second POST/PUT. This protects every save entry point, not only buttons.
    if (savePromiseRef.current) return savePromiseRef.current;

    const operation = (async () => {
      setIsSavingCotizacion(true);
      try {
        const dataToSave = shouldRegenerate
          ? { ...enrichedData, _resetPdf: true }
          : enrichedData;

        const savedResult = await handlePackageEdit(dataToSave);
        const savedCotizacion = {
          ...enrichedData,
          ...((savedResult?.data || savedResult) ?? {}),
        };
        const postSaveListState = resolveCotizacionPostSaveListState({
          isReservationFlow: isReservasQuotationFlow,
          currentSellerDni,
          savedSellerDni: getCotizacionSellerDni(savedCotizacion),
          currentSellerScope: sellerScope,
          currentSellerFilter: filters.vendedor,
          hasVoucher: savedCotizacion.tiene_voucher === true,
        });

        setSellerScope(postSaveListState.sellerScope);
        setQuotationStatus(postSaveListState.quotationStatus);
        if (postSaveListState.vendedor !== filters.vendedor) {
          setFilters((previous) => ({
            ...previous,
            vendedor: postSaveListState.vendedor,
          }));
        }

        setCurrentView("list");
        setSaveChoiceModal({ isOpen: false, data: null });

        // Auto-trigger PDF Canva generation if requested
        if (shouldRegenerate) {
          const savedCotizacion = savedResult?.data || savedResult;
          if (savedCotizacion?.id) {
            setTimeout(() => {
              handleTriggerN8N({
                id: savedCotizacion.id,
                titulo:
                  savedCotizacion.titulo || enrichedData.titulo || "Cotización",
              });
            }, 500);
          }
        }

        return savedResult;
      } finally {
        setIsSavingCotizacion(false);
        savePromiseRef.current = null;
      }
    })();

    savePromiseRef.current = operation;
    return operation;
  };

  // Función para volver a la lista desde la edición
  const handleBackToList = () => {
    setCurrentView("list");
    // No hacer fetch automático: TanStack Query maneja la caché
  };

  // Functions for PDF handling
  const handlePdfPreviewOpen = async (cotizacion) => {
    // El PDF y su editor deben partir del mismo contexto completo que alimenta
    // SummaryContent y el editor PDF. La normalización parcial anterior
    // perdía perRoomPricing, asignaciones infantiles y adicionales por audiencia.
    const summaryCotizacion = await buildSummaryDataForCotizacion(cotizacion, {
      skipCache: true,
    });
    const parsedHotelDetalle = normalizeHotelDetallePayload(
      summaryCotizacion?.hotel_detalle ||
        summaryCotizacion?.hotelDetalle ||
        null,
    );

    setPdfPreviewCotizacion({
      ...summaryCotizacion,
      hotel_detalle: parsedHotelDetalle,
      hotelDetalle: parsedHotelDetalle,
      info_pdf: normalizeMojibakeValue(summaryCotizacion?.info_pdf || []),
    });
    setShowPdfPreview(true);
  };

  const handlePdfPreviewClose = () => {
    setShowPdfPreview(false);
    setPdfPreviewCotizacion(null);
  };

  // Trigger N8N PDF Canva processing for a cotizacion
  const handleTriggerN8N = async (cotizacion) => {
    if (processingN8NId) {
      showSnackbar(
        "Ya hay una cotización generando su PDF Canva. Espera a que termine.",
        "warning",
      );
      return;
    }

    try {
      setProcessingN8NId(cotizacion.id);
      showSnackbar(
        `Generando PDF Canva para "${cotizacion.titulo}"...`,
        "info",
      );

      const result = await cotizacionService.triggerN8NCotizacion(
        cotizacion.id,
      );

      if (result.success) {
        showSnackbar(
          `PDF Canva solicitado correctamente para "${cotizacion.titulo}"`,
          "success",
        );
        // Polling para verificar que el procesamiento se completó en la DB
        const processed = await pollUntilProcessed(cotizacion.id);
        if (processed) {
          showSnackbar(
            `Contenido del PDF Canva listo para "${cotizacion.titulo}"`,
            "success",
          );
        }
        // Recargar cotizaciones para reflejar el estado actualizado
        await fetchCotizaciones();
      } else if (result.n8n_unavailable) {
        showSnackbar(
          ` ${result.message || "N8N no disponible. La cotización se guardó correctamente pero no se generó el PDF."}`,
          "warning",
        );
      } else {
        showSnackbar(
          `Error al procesar: ${result.message || "Error desconocido"}`,
          "error",
        );
      }
    } catch (error) {
      console.error(" Error triggering N8N:", error);
      const serverMsg = error.response?.data?.error;
      let errorMsg;
      if (serverMsg && serverMsg.includes("Webhook no registrado")) {
        errorMsg =
          " Workflow N8N no activo. Activa el workflow en la interfaz de N8N (toggle ON arriba a la derecha).";
      } else if (
        serverMsg &&
        (serverMsg.includes("Error conectando") ||
          serverMsg.includes("no está accesible") ||
          serverMsg.includes("no está saludable"))
      ) {
        errorMsg =
          " N8N no está disponible. ¿Está corriendo el contenedor Docker? Ejecuta: docker compose -f scripts/docker-compose.n8n.yml up -d";
      } else {
        errorMsg =
          serverMsg || error.message || "Error desconocido al generar el PDF Canva";
      }
      showSnackbar(errorMsg, "error");
    } finally {
      setProcessingN8NId(null);
    }
  };

  // Polling helper: espera hasta que la cotización esté procesada en la DB
  const pollUntilProcessed = async (
    id,
    maxAttempts = 30,
    intervalMs = 3000,
  ) => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const result = await cotizacionService.checkCotizacionProcesado(id);
        if (result?.es_procesado) return true;
      } catch (e) {
        // Ignorar errores de polling individuales
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return false;
  };

  // Nueva función para manejar "Ver Servicios" - obtener voucher de reserva
  const handleViewServices = async (cotizacion) => {
    try {
      // Obtener vouchers de reserva por cotización_id
      const response =
        await voucherReservaService.getVoucherReservaByCotizacionId(
          cotizacion.id,
        );

      if (response && response.data && response.data.length > 0) {
        // Tomar el primer voucher de reserva encontrado
        const voucherReserva = response.data[0];
        setServiceSummaryVoucher(voucherReserva);
        setShowServiceSummaryModal(true);
      } else {
        showSnackbar(
          "No se encontró voucher de reserva para esta cotización",
          "warning",
        );
      }
    } catch (error) {
      console.error("Error al obtener voucher de reserva:", error);
      showSnackbar("Error al cargar el voucher de reserva", "error");
    }
  };

  const getHotelServiceCapacity = (service) =>
    getHotelRoomCapacity(service, 1);

  const isHotelSummaryService = (service) => {
    return (
      service?.parentService?.typeService === "hoteles" ||
      service?.typeService === "hoteles"
    );
  };

  const parseItineraryDays = (value) => {
    let days;
    if (Array.isArray(value)) days = value;
    else if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        days = Array.isArray(parsed) ? parsed : [];
      } catch {
        days = [];
      }
    } else {
      days = [];
    }
    // Hydrate services from new flat DB fields (moneda, precioServicio, etc.)
    return hydrateItinerarioFromDB(days);
  };

  const calculateGeneralTotal = (
    days,
    totalPassengers,
    passengers,
    additionalCosts = {},
  ) => {
    if (!Array.isArray(days))
      return {
        grandTotal: 0,
        totalPerPerson: 0,
        totalIGV: 0,
        subtotalIndividual: 0,
        servicesTotal: 0,
        hotelsByCategory: {},
        hotelsTotal: 0,
        hotelAdultTotal: 0,
        hotelChildTotal: 0,
        hotelConvertedChildTotal: 0,
        nonHotelConvertedChildTotal: 0,
        nonHotelsTotal: 0,
        costosAdicionales: 0,
        subtotal_ninos: 0,
        subtotalNinos: 0,
        baseExplicitChildCount: 0,
        baseConvertedChildCount: 0,
        hotelExplicitChildCount: 0,
        hotelConvertedChildCount: 0,
      };

    let subtotalIndividual = 0;
    let servicesTotal = 0;
    let totalIGV = 0;
    let nonHotelsTotal = 0;
    let grandTotal = 0;
    let subtotal_ninos = 0;
    let hotelAdultTotal = 0;
    let hotelChildTotal = 0;
    let hotelConvertedChildTotal = 0;
    let nonHotelConvertedChildTotal = 0;

    // Global sets for unique passenger counting across all days
    const globalBaseExplicitChildIds = new Set();
    const globalBaseConvertedChildIds = new Set();
    const globalHotelExplicitChildIds = new Set();
    const globalHotelConvertedChildIds = new Set();

    const hotelCategoryAccumulator = {};

    days.forEach((day, dayIndex) => {
      if (day.servicios && Array.isArray(day.servicios)) {
        day.servicios.forEach((service) => {
          // Runtime format: tariff.precio is already per-adult
          // Flat DB format: need to derive per-adult from precioServicio + flags
          let price, originalPrice;
          if (service.tariff?.precio != null) {
            price = parseFloat(service.tariff.precio);
            originalPrice = parseFloat(service.tariff.precio_original || 0);
          } else {
            const raw = parseFloat(service.precioServicio ?? 0);
            const total = parseFloat(service.precioTotal) || 0;
            if (service.precioAdultoDividido) {
              // precioServicio is the TOTAL — divide to get per-adult
              const numAdults = Array.isArray(service.beneficiariosAdultos)
                ? service.beneficiariosAdultos.length
                : 0;
              let divisor = Math.max(1, numAdults || totalPassengers || 1);
              if (service.capacidadLimite) {
                const cap = parseInt(service.childService?.nro_pasajeros) || 0;
                if (cap > 0 && cap < divisor) divisor = cap;
              }
              originalPrice = total > 0 ? total : raw; // total
              price = originalPrice / divisor;
            } else {
              price = raw;
              originalPrice = total > 0 ? total : 0;
            }
          }
          const subtotalninos = parseFloat(
            service.tariff?.childExtras ||
              service.tariff?.childExtrasTotal ||
              0,
          );

          // total "bruto" que ya venías usando
          grandTotal +=
            parseFloat(service.tariff?.precio_original_with_child_extras) ||
            originalPrice ||
            price;

          const isHotel = isHotelSummaryService(service);

          if (isHotel) {
            const categoria =
              service.parentService?.categoria ||
              service.parentService?.nombre ||
              "Otro";
            const nightlyValue = originalPrice > 0 ? originalPrice : price;
            subtotal_ninos += subtotalninos;
            hotelChildTotal += subtotalninos;

            const convertedChildToAdultMap =
              service.convertedChildToAdultMap ||
              service.passengerSelection?.convertedChildToAdultMap ||
              service.assignedPassengerSelection?.ninosComoAdulto ||
              {};
            const treatAsAdults =
              service.treatChildrenAsAdults ||
              service.passengerSelection?.treatChildrenAsAdults ||
              service.assignedPassengerSelection?.treatChildrenAsAdults ||
              false;
            const rootIds = Array.isArray(service.assignedPassengerIds)
              ? service.assignedPassengerIds
              : [];
            const selectionIds = Array.isArray(
              service.passengerSelection?.selectedIds,
            )
              ? service.passengerSelection.selectedIds
              : [];
            const assignedIds =
              selectionIds.length >= rootIds.length ? selectionIds : rootIds;
            const convertedChildIds = assignedIds.filter(
              (id) =>
                typeof id === "string" &&
                id.startsWith("child:") &&
                (convertedChildToAdultMap[id] || treatAsAdults),
            );
            const assignedAdultIds = assignedIds.filter(
              (id) => typeof id === "string" && id.startsWith("adult:"),
            );

            // Track unique hotel child IDs
            convertedChildIds.forEach((id) =>
              globalHotelConvertedChildIds.add(id),
            );
            assignedIds
              .filter(
                (id) =>
                  typeof id === "string" &&
                  id.startsWith("child:") &&
                  !convertedChildToAdultMap[id],
              )
              .forEach((id) => globalHotelExplicitChildIds.add(id));

            const sharers = assignedAdultIds.length + convertedChildIds.length;
            const convertedChildShare =
              sharers > 0
                ? convertedChildIds.length * (nightlyValue / sharers)
                : 0;

            hotelConvertedChildTotal += convertedChildShare;
            hotelAdultTotal += Math.max(0, nightlyValue - convertedChildShare);

            if (!hotelCategoryAccumulator[categoria]) {
              hotelCategoryAccumulator[categoria] = {
                total: 0,
                dayIndexes: new Set(),
                capacityTotal: 0,
              };
            }

            hotelCategoryAccumulator[categoria].total += nightlyValue;
            hotelCategoryAccumulator[categoria].dayIndexes.add(dayIndex);
            hotelCategoryAccumulator[categoria].capacityTotal +=
              getHotelServiceCapacity(service);
          } else {
            subtotalIndividual += price;
            servicesTotal += originalPrice > 0 ? originalPrice : price;
            nonHotelsTotal += price;
            subtotal_ninos += subtotalninos;

            // Track non-hotel converted children
            const convertedChildToAdultMap =
              service.convertedChildToAdultMap ||
              service.passengerSelection?.convertedChildToAdultMap ||
              service.assignedPassengerSelection?.ninosComoAdulto ||
              {};
            const treatAsAdults =
              service.treatChildrenAsAdults ||
              service.passengerSelection?.treatChildrenAsAdults ||
              service.assignedPassengerSelection?.treatChildrenAsAdults ||
              false;
            const rootIds = Array.isArray(service.assignedPassengerIds)
              ? service.assignedPassengerIds
              : [];
            const selectionIds = Array.isArray(
              service.passengerSelection?.selectedIds,
            )
              ? service.passengerSelection.selectedIds
              : [];
            const svcAssignedIds =
              selectionIds.length >= rootIds.length ? selectionIds : rootIds;
            svcAssignedIds.forEach((id) => {
              if (typeof id === "string" && id.startsWith("child:")) {
                if (convertedChildToAdultMap[id] || treatAsAdults) {
                  globalBaseConvertedChildIds.add(id);
                  nonHotelConvertedChildTotal += price;
                } else {
                  globalBaseExplicitChildIds.add(id);
                }
              }
            });
          }

          // IGV
          if (service.tariff?.tieneIgv || service.igv) {
            const basePrice = parseFloat(
              service.tariff.precio_original || originalPrice,
            );
            totalIGV += originalPrice - basePrice;
          }
        });
      }
    });

    const costosAdicionales = 0;

    const hotelsByCategory = Object.fromEntries(
      Object.entries(hotelCategoryAccumulator).map(([categoria, info]) => {
        const nights = info.dayIndexes.size || 1;
        const total = info.total;
        const perNightPrice = total / Math.max(1, nights);
        const capacityPerNight = info.capacityTotal / Math.max(1, nights);
        const facturado =
          perNightPrice / Math.max(1, capacityPerNight || totalPassengers || 1);

        return [
          categoria,
          {
            perNightPrice,
            nights,
            total,
            capacityPerNight,
            facturado,
          },
        ];
      }),
    );

    // Sumar todos los hoteles con hotelsByCategory ya construido
    const hotelsTotal = Object.values(hotelsByCategory).reduce(
      (acc, h) => acc + h.total,
      0,
    );

    return {
      grandTotal,
      totalPerPerson: subtotalIndividual,
      totalIGV,
      subtotalIndividual,
      servicesTotal,
      hotelsByCategory,
      hotelsTotal,
      hotelAdultTotal,
      hotelChildTotal,
      hotelConvertedChildTotal,
      nonHotelConvertedChildTotal,
      nonHotelsTotal,
      costosAdicionales,
      subtotal_ninos,
      subtotalNinos: subtotal_ninos,
      baseExplicitChildCount: globalBaseExplicitChildIds.size,
      baseConvertedChildCount: globalBaseConvertedChildIds.size,
      hotelExplicitChildCount: globalHotelExplicitChildIds.size,
      hotelConvertedChildCount: globalHotelConvertedChildIds.size,
    };
  };

  const calculateSummaryGeneralTotal = (days = [], _totalPassengers = 0, peopleDetails = null) => {
    const detailed = calculateGeneralTotalsDetailed(
      Array.isArray(days) ? days : [],
      peopleDetails,
    );
    const hotelExplicitChildTotal = Math.max(
      0,
      Number(detailed.hotelChildrenTotal || 0) -
        Number(detailed.hotelConvertedChildTotal || 0),
    );
    const subtotalNinos =
      Number(detailed.baseExplicitChildTotal || 0) +
      Number(detailed.baseConvertedChildTotal || 0) +
      Number(detailed.hotelChildrenTotal || 0);

    return {
      grandTotal: detailed.grandTotal,
      totalPerPerson: detailed.totalPerPerson,
      totalIGV: detailed.totalIGV,
      subtotalIndividual: detailed.totalPerPerson,
      servicesTotal: detailed.grandTotal,
      hotelsByCategory: {},
      hotelsTotal: detailed.hotelAdultTotal,
      hotelFullTotal: detailed.hotelsTotal,
      hotelChildTotal: detailed.hotelChildrenTotal,
      hotelExplicitChildTotal,
      hotelConvertedChildTotal: detailed.hotelConvertedChildTotal,
      hotelAdultTotal: detailed.hotelAdultTotal,
      subtotalNinos,
      subtotal_ninos: subtotalNinos,
      nonHotelsTotal: detailed.totalPerPerson,
      nonHotelExplicitChildTotal: detailed.baseExplicitChildTotal,
      nonHotelConvertedChildTotal: detailed.baseConvertedChildTotal,
      nonHotelExplicitChildTotalsById:
        detailed.baseExplicitChildTotalsById || {},
      nonHotelConvertedChildTotalsById:
        detailed.baseConvertedChildTotalsById || {},
      hotelExplicitChildTotalsById: detailed.hotelExplicitChildTotalsById || {},
      hotelConvertedChildTotalsById:
        detailed.hotelConvertedChildTotalsById || {},
      baseExplicitChildCount: detailed.baseExplicitChildCount || 0,
      baseConvertedChildCount: detailed.baseConvertedChildCount || 0,
      hotelExplicitChildCount: detailed.hotelExplicitChildCount || 0,
      hotelConvertedChildCount: detailed.hotelConvertedChildCount || 0,
      baseAdultCount: detailed.baseAdultCount || 0,
      hotelAdultCount: detailed.hotelAdultCount || 0,
      costosAdicionales: 0,
    };
  };

  // Construye el mismo modelo normalizado que consume SummaryContent.
  const buildSummaryDataForCotizacion = async (sourceCotizacion, options = {}) => {
    let cotizacion = sourceCotizacion || {};
    if (cotizacion?.id) {
      try {
        const freshCotizacion = await cotizacionService.getCotizacionById(
          cotizacion.id,
          { skipCache: options.skipCache === true },
        );
        cotizacion = {
          ...cotizacion,
          ...(freshCotizacion || {}),
          num_adults: freshCotizacion?.num_adults ?? cotizacion.num_adults,
          numAdults: freshCotizacion?.numAdults ?? cotizacion.numAdults,
          num_children:
            freshCotizacion?.num_children ?? cotizacion.num_children,
          numChildren: freshCotizacion?.numChildren ?? cotizacion.numChildren,
        };
      } catch (err) {
        console.warn(
          "No se pudo obtener cotizacion completa para resumen:",
          err,
        );
      }

      try {
        const dbPassengers = await pasajeroService.getPassengersByCotizacion(
          cotizacion.id,
        );
        if (Array.isArray(dbPassengers) && dbPassengers.length > 0) {
          const peopleDetails = { adults: [], children: [] };
          dbPassengers.forEach((passenger) => {
            const entry = {
              ...passenger,
              id:
                passenger.id_pasajero ||
                passenger.id ||
                passenger.passenger_key ||
                "",
              age: passenger.edad ?? passenger.age ?? null,
              nacionalidad: passenger.nacionalidad || passenger.pais || "",
            };
            if (String(passenger.tipo_pasajero).toLowerCase() === "child") {
              peopleDetails.children.push(entry);
            } else {
              peopleDetails.adults.push(entry);
            }
          });
          cotizacion = {
            ...cotizacion,
            peopleDetails,
            peopledetails: peopleDetails,
            peopleCount: {
              adults: peopleDetails.adults.length,
              children: peopleDetails.children.length,
            },
            peoplecount: {
              adults: peopleDetails.adults.length,
              children: peopleDetails.children.length,
            },
          };
        }
      } catch (err) {
        console.warn("No se pudieron cargar pasajeros para resumen:", err);
      }
    }

    const itineraryDays = parseItineraryDays(
      cotizacion.itinerario || cotizacion.dias,
    );
    const rawPeopleDetails =
      cotizacion.peopleDetails || cotizacion.peopledetails || {};
    const adultsFromDetails = Array.isArray(rawPeopleDetails?.adults)
      ? rawPeopleDetails.adults.length
      : 0;
    const childrenFromDetails = Array.isArray(rawPeopleDetails?.children)
      ? rawPeopleDetails.children.length
      : 0;
    const fallbackTotalPeople = Number(
      cotizacion.cantidadpersonas || cotizacion.cantidadPersonas || 0,
    );
    // Use num_adults/num_children from the list API (passenger counts from pasajero table)
    const numAdultsFromApi = Number(
      cotizacion.num_adults || cotizacion.numAdults || 0,
    );
    const numChildrenFromApi = Number(
      cotizacion.num_children || cotizacion.numChildren || 0,
    );
    const peopleCountForSummary =
      numAdultsFromApi + numChildrenFromApi > 0
        ? {
            adults: numAdultsFromApi,
            children: numChildrenFromApi,
          }
        : adultsFromDetails + childrenFromDetails > 0
          ? {
              adults: adultsFromDetails,
              children: childrenFromDetails,
            }
          : {
              adults: Math.max(1, fallbackTotalPeople),
              children: 0,
            };
    const generalTotals = calculateSummaryGeneralTotal(
      itineraryDays,
      peopleCountForSummary.adults + peopleCountForSummary.children,
      rawPeopleDetails,
      cotizacion.additionalCosts ||
        cotizacion.additionalcosts ||
        cotizacion.additional_costs,
    );
    const cleanAdditionalCostsFromDB = (() => {
      const cleanCosts = cleanAdditionalCostsPayload(
        cotizacion.additionalCosts ||
          cotizacion.additionalcosts ||
          cotizacion.additional_costs ||
          {},
      );
      const result = normalizeAdditionalCostsForCotizaciones(
        cleanCosts,
        cotizacion,
      );

      return {
        result,
        externalCosts:
          cleanCosts?.external || cleanCosts?.externalCosts || null,
      };
    })();
    const rawAdditionalCosts = cleanAdditionalCostsFromDB.result;
    const adultsCountForSummary = Math.max(
      1,
      Number(peopleCountForSummary?.adults || 0),
    );
    const storedServicesTotalRaw =
      cotizacion.precio_it_adulto ?? cotizacion.precioItAdulto;
    const storedServicesTotal =
      storedServicesTotalRaw != null
        ? Number(storedServicesTotalRaw)
        : Number(generalTotals.servicesTotal || 0);
    const peopleDetailsForSummary =
      cotizacion.peopleDetails || cotizacion.peopledetails || {};
    const externalItinerary = parseItineraryDays(
      cotizacion.itinerario_externo || cotizacion.itinerarioExterno,
    );
    const externalItineraryBreakdown = calculateExternalItineraryBreakdown(
      externalItinerary,
      peopleDetailsForSummary,
    );
    const summaryTotals = calculateCotizacionFinancialSummary({
      subtotalIndividual:
        Number(cotizacion.precio_it_adulto ?? cotizacion.precioItAdulto ?? 0) ||
        (generalTotals.subtotalIndividual ??
          cotizacion.subtotal_individual ??
          cotizacion.subtotalIndividual ??
          0),
      adultsCount: adultsCountForSummary,
      childrenCount: peopleCountForSummary.children,
      hotelsTotal:
        generalTotals.hotelsTotal ??
        cotizacion.totalHoteles ??
        0,
      hotelAdultTotal:
        generalTotals.hotelAdultTotal ??
        cotizacion.hotel_adult_total ??
        cotizacion.hotelAdultTotal ??
        rawAdditionalCosts?.hotelAdultTotal ??
        null,
      hotelChildTotal:
        generalTotals.hotelChildTotal ??
        cotizacion.hotel_child_total ??
        cotizacion.hotelChildTotal ??
        rawAdditionalCosts?.hotelChildTotal ??
        0,
      hotelConvertedChildTotal:
        generalTotals.hotelConvertedChildTotal ??
        cotizacion.hotel_converted_child_total ??
        cotizacion.hotelConvertedChildTotal ??
        rawAdditionalCosts?.hotelConvertedChildTotal ??
        0,
      subtotalNinos:
        generalTotals.subtotalNinos ??
        generalTotals.subtotal_ninos ??
        cotizacion.subtotal_nino ??
        cotizacion.subtotal_ninos ??
        cotizacion.subtotalNino ??
        cotizacion.subtotalNinos ??
        rawAdditionalCosts?.subtotalNinos ??
        0,
      externalAdultTotal: externalItineraryBreakdown.adultTotal,
      externalChildTotal: externalItineraryBreakdown.childTotal,
      externalConvertedChildTotal:
        externalItineraryBreakdown.convertedChildTotal,
      externalExplicitChildCount:
        externalItineraryBreakdown.explicitChildCount,
      externalConvertedChildCount:
        externalItineraryBreakdown.convertedChildCount,
      additionalCosts: rawAdditionalCosts,
    });
    const storedAdditionalRaw =
      cotizacion.total_adicionales ?? cotizacion.totalAdicionales;
    const storedAdditionalTotal =
      storedAdditionalRaw != null
        ? Number(storedAdditionalRaw)
        : Number(summaryTotals.additionalTotal || 0);
    const storedGrandTotalRaw = cotizacion.total_final ?? cotizacion.totalFinal;
    const storedGrandTotal =
      storedGrandTotalRaw != null
        ? Number(storedGrandTotalRaw)
        : Number(summaryTotals.grandTotal || 0);
    const parsedHotelDetalle = normalizeHotelDetallePayload(
      cotizacion.hotel_detalle || cotizacion.hotelDetalle || null,
    );
    const resolvedCalculatedOperational = Number(
      rawAdditionalCosts?.calculatedOperational ??
        summaryTotals.operationalAmount,
    );
    const resolvedCalculatedFee =
      rawAdditionalCosts?.calculatedFee != null
        ? Number(rawAdditionalCosts.calculatedFee)
        : Number(summaryTotals.feeAmount || 0);
    const resolvedTotalAdditional =
      rawAdditionalCosts?.totalAdditional != null
        ? Number(rawAdditionalCosts.totalAdditional)
        : Number(summaryTotals.totalAdditionalPerAdult || 0);
    const enrichedAdditionalCosts = {
      ...rawAdditionalCosts,
      calculatedOperational: resolvedCalculatedOperational,
      calculatedFee: resolvedCalculatedFee,
      totalAdditional: resolvedTotalAdditional,
      ...(cleanAdditionalCostsFromDB.externalCosts
        ? { external: cleanAdditionalCostsFromDB.externalCosts }
        : {}),
    };
    const selectedHotel = deriveSelectedHotelFromDays(
      itineraryDays,
      parsedHotelDetalle,
      cotizacion.selectedHotel || cotizacion.selected_hotel || null,
    );
    const hotelPreviewRows =
      buildPdfHotelPreviewRows({
        cotizacion: {
          ...cotizacion,
          peopleDetails: peopleDetailsForSummary,
          peopleCount: peopleCountForSummary,
          peoplecount: peopleCountForSummary,
          additionalCosts: enrichedAdditionalCosts,
          additionalcosts: enrichedAdditionalCosts,
          itinerario: itineraryDays,
          dias: itineraryDays,
          itinerario_externo: externalItinerary,
          itinerarioExterno: externalItinerary,
          externalItinerary,
          selectedHotel,
          hotel_detalle: parsedHotelDetalle,
          subtotalIndividual: summaryTotals.subtotalIndividual,
          subtotal_individual: summaryTotals.subtotalIndividual,
          precio_it_adulto: summaryTotals.subtotalIndividual,
          precio_it_ninos:
            cotizacion.precio_it_ninos ?? cotizacion.precioItNinos ?? 0,
          subtotalNinos: summaryTotals.subtotalNinos,
          subtotal_ninos: summaryTotals.subtotalNinos,
          hotelAdultTotal: summaryTotals.hotelAdultTotal,
          hotel_adult_total: summaryTotals.hotelAdultTotal,
          hotelChildTotal: summaryTotals.hotelChildTotal,
          hotel_child_total: summaryTotals.hotelChildTotal,
          hotelConvertedChildTotal: summaryTotals.hotelConvertedChildTotal,
          hotel_converted_child_total:
            summaryTotals.hotelConvertedChildTotal,
          nonHotelExplicitChildTotal: generalTotals.nonHotelExplicitChildTotal,
          nonHotelConvertedChildTotal:
            generalTotals.nonHotelConvertedChildTotal,
        },
      }).categoryRows || [];
    const selectedHotelCategory = String(
      selectedHotel?.category || selectedHotel?.key || "",
    ).toLowerCase();
    const selectedPreviewRow =
      hotelPreviewRows.find((row) => row?.isSelected) ||
      hotelPreviewRows.find(
        (row) => String(row?.category || "").toLowerCase() === selectedHotelCategory,
      ) ||
      null;
    const selectedPerRoomPricing = resolveGroupedHotelPricingForSummary({
      cotizacion,
      selectedHotel,
      peopleDetails: peopleDetailsForSummary,
      peopleCount: peopleCountForSummary,
      additionalCosts: enrichedAdditionalCosts,
      summaryTotals,
      generalTotals,
      externalBreakdown: externalItineraryBreakdown,
    });
    const hasGroupedHotelStay =
      Array.isArray(selectedHotel?.dayGroups) && selectedHotel.dayGroups.length > 1;
    const computedGrandTotal = calculateRoomAwareVisibleTotal({
      perRoomPricing: selectedPerRoomPricing,
      summaryTotals,
      peopleCount: peopleCountForSummary,
      externalBreakdown: externalItineraryBreakdown,
      nonHotelExplicitChildTotal:
        generalTotals.nonHotelExplicitChildTotal ??
        summaryTotals.nonHotelExplicitChildTotal,
      nonHotelConvertedChildTotal:
        generalTotals.nonHotelConvertedChildTotal ??
        summaryTotals.nonHotelConvertedChildTotal,
      baseExplicitChildCount: generalTotals.baseExplicitChildCount,
      baseConvertedChildCount: generalTotals.baseConvertedChildCount,
      hotelExplicitChildCount: generalTotals.hotelExplicitChildCount,
      hotelConvertedChildCount: generalTotals.hotelConvertedChildCount,
    });
    const additionalFinalTotal = coercePositiveCurrencyTotal(
      rawAdditionalCosts?.finalTotal,
      rawAdditionalCosts?.final_total,
      rawAdditionalCosts?.grandTotal,
      rawAdditionalCosts?.grand_total,
    );
    const summaryGrandTotal = resolveQuotationPricingSnapshot({
      additionalCosts: rawAdditionalCosts,
      previewTotal: computedGrandTotal,
      fallbackAdditionalTotal: additionalFinalTotal,
      fallbackTotal:
        storedGrandTotal > 0 ? storedGrandTotal : summaryTotals.grandTotal,
    }).grandTotal;
    const selectedHotelForSummary = selectedHotel
      ? {
          ...selectedHotel,
          ...(!hasGroupedHotelStay && selectedPreviewRow
            ? selectedPreviewRow
            : {}),
          breakdown:
            !hasGroupedHotelStay &&
            Array.isArray(selectedPreviewRow?.breakdown) &&
            selectedPreviewRow.breakdown.length > 0
              ? selectedPreviewRow.breakdown
              : selectedHotel?.breakdown || [],
          allCategoryRows: hotelPreviewRows,
          perRoomPricing: selectedPerRoomPricing,
          dayGroupsAuthoritative:
            hasGroupedHotelStay || selectedHotel?.dayGroupsAuthoritative === true,
          groupedHotelSelection:
            hasGroupedHotelStay || selectedHotel?.groupedHotelSelection === true,
        }
      : selectedHotel;
    const previewHotelFullTotal =
      numberOrZero(generalTotals.hotelFullTotal) ||
      numberOrZero(selectedPreviewRow?.hotelTotal) ||
      summaryTotals.hotelGroupTotal;
    const previewHotelChildTotal =
      numberOrZero(generalTotals.hotelChildTotal) ||
      numberOrZero(selectedPreviewRow?.hotelChildTotal) ||
      summaryTotals.hotelChildTotal;
    const previewHotelConvertedChildTotal =
      numberOrZero(generalTotals.hotelConvertedChildTotal) ||
      numberOrZero(selectedPreviewRow?.hotelConvertedChildTotal) ||
      summaryTotals.hotelConvertedChildTotal;
    const previewHotelAdultTotal =
      numberOrZero(generalTotals.hotelAdultTotal) ||
      summaryTotals.hotelAdultTotal;
    // Create normalized copy using only the simplified structure fields
    const normalizedCotizacion = {
      ...cotizacion,
      // Convert backend snake_case to frontend camelCase for compatibility
      peopleDetails: rawPeopleDetails || { adults: [], children: [] },
      peopleCount: peopleCountForSummary,
      additionalcosts: enrichedAdditionalCosts,
      additionalCosts: enrichedAdditionalCosts,
      packageType:
        cotizacion.packagetype || cotizacion.packageType || "compartido",
      grandTotal: summaryGrandTotal,
      totalPerPerson: generalTotals.totalPerPerson,
      totalIGV: generalTotals.totalIGV,
      nonHotelsTotal:
        summaryTotals.subtotalIndividual > 0
          ? summaryTotals.subtotalIndividual
          : generalTotals.nonHotelsTotal,
      hotelsByCategory: generalTotals.hotelsByCategory,
      hotelsTotal: previewHotelAdultTotal,
      hotelFullTotal: previewHotelFullTotal,
      selectedHotel: selectedHotelForSummary,
      perRoomPricing: selectedPerRoomPricing,
      hotel_detalle: parsedHotelDetalle,
      itinerarioExterno: externalItinerary,
      itinerario_externo: externalItinerary,
      // Use simplified total fields only
      totalServicios: storedServicesTotal,
      precio_it_adulto: summaryTotals.subtotalIndividual,
      precio_it_ninos:
        cotizacion.precio_it_ninos ?? cotizacion.precioItNinos ?? 0,
      precio_it_ext_adulto:
        cotizacion.precio_it_ext_adulto ??
        cotizacion.precioItExtAdulto ??
        externalItineraryBreakdown.adultTotal,
      precio_it_ext_ninos:
        cotizacion.precio_it_ext_ninos ??
        cotizacion.precioItExtNinos ??
        externalItineraryBreakdown.childTotal +
          externalItineraryBreakdown.convertedChildTotal,
      totalFinal: summaryGrandTotal,
      total_final: summaryGrandTotal,
      totalAdicionales: storedAdditionalTotal,
      total_adicionales: storedAdditionalTotal,
      subtotalIndividual: summaryTotals.subtotalIndividual,
      subtotal_individual: summaryTotals.subtotalIndividual,
      hotelAdultTotal: previewHotelAdultTotal,
      hotel_adult_total: previewHotelAdultTotal,
      hotelChildTotal: previewHotelChildTotal,
      hotel_child_total: previewHotelChildTotal,
      hotelConvertedChildTotal: previewHotelConvertedChildTotal,
      hotel_converted_child_total: previewHotelConvertedChildTotal,
      nonHotelConvertedChildTotal: generalTotals.nonHotelConvertedChildTotal,
      nonHotelExplicitChildTotal:
        generalTotals.nonHotelExplicitChildTotal ??
        summaryTotals.nonHotelExplicitChildTotal,
      baseExplicitChildCount: generalTotals.baseExplicitChildCount,
      baseConvertedChildCount: generalTotals.baseConvertedChildCount,
      hotelExplicitChildCount: generalTotals.hotelExplicitChildCount,
      hotelConvertedChildCount: generalTotals.hotelConvertedChildCount,
      // Ensure we have cantidadPersonas as a number for calculations
      cantidadPersonas: Number(
        cotizacion.cantidadpersonas || cotizacion.cantidadPersonas || 0,
      ),
      subtotal_ninos: summaryTotals.subtotalNinos,
      subtotal_nino: summaryTotals.subtotalNinos,
      subtotalNinos: summaryTotals.subtotalNinos,
    };

    // Calculate total number of people from peopleCount if available
    if (
      normalizedCotizacion.peopleCount &&
      (normalizedCotizacion.peopleCount.adults ||
        normalizedCotizacion.peopleCount.children)
    ) {
      normalizedCotizacion.cantidadPersonas =
        Number(normalizedCotizacion.peopleCount.adults || 0) +
        Number(normalizedCotizacion.peopleCount.children || 0);
    }

    if (normalizedCotizacion.cantidadPersonas <= 0) {
      normalizedCotizacion.cantidadPersonas = 1; // Default to at least 1 person
    }

    return normalizedCotizacion;
  };

  const handleShowSummary = async (sourceCotizacion) => {
    const normalizedCotizacion = await buildSummaryDataForCotizacion(
      sourceCotizacion,
      { skipCache: true },
    );
    setSummaryData(normalizedCotizacion);
    setShowSummaryModal(true);
  };

  const handleShowPreLiquidacion = async (sourceCotizacion) => {
    const request = ++preLiquidacionRequest.current;
    try {
      const quotation = await buildSummaryDataForCotizacion(sourceCotizacion, { skipCache: true });
      if (request === preLiquidacionRequest.current) setPreLiquidacionCotizacion(quotation);
    } catch (error) {
      console.error("No se pudo abrir la preliquidación", error);
      if (request === preLiquidacionRequest.current) showError("No se pudo cargar la preliquidación. Intenta nuevamente.");
    }
  };

  // Simplified total calculation using the new structure
  const calculateTotalFinal = (cotizacion) => {
    // Check if the cotizacion object is properly formed
    if (!cotizacion) return 0;

    const storedTotalFinal = numberOrZero(
      cotizacion.total_final ?? cotizacion.totalFinal,
    );

    const itineraryDays = parseItineraryDays(
      cotizacion.itinerario || cotizacion.dias,
    );
    const rawPeopleDetails = cotizacion.peopleDetails || {};
    const adultsFromDetails = Array.isArray(rawPeopleDetails?.adults)
      ? rawPeopleDetails.adults.length
      : 0;
    const childrenFromDetails = Array.isArray(rawPeopleDetails?.children)
      ? rawPeopleDetails.children.length
      : 0;
    const rawPeopleCount = cotizacion.peopleCount;
    const adultsCount = Math.max(
      1,
      Number(rawPeopleCount?.adults || adultsFromDetails || 0),
    );
    const peopleCountForSummary = {
      adults: adultsCount,
      children: Number(rawPeopleCount?.children || childrenFromDetails || 0),
    };
    const generalTotals = calculateSummaryGeneralTotal(
      itineraryDays,
      peopleCountForSummary.adults + peopleCountForSummary.children,
      rawPeopleDetails,
      cotizacion.additionalCosts ||
        cotizacion.additionalcosts ||
        cotizacion.additional_costs,
    );

    let rawAdditionalCosts =
      cotizacion.additionalCosts ||
      cotizacion.additionalcosts ||
      cotizacion.additional_costs ||
      {};
    if (typeof rawAdditionalCosts === "string") {
      try {
        rawAdditionalCosts = JSON.parse(rawAdditionalCosts);
      } catch {
        rawAdditionalCosts = {};
      }
    }
    rawAdditionalCosts = normalizeAdditionalCostsForCotizaciones(
      rawAdditionalCosts,
      cotizacion,
    );

    const externalItinerary = parseItineraryDays(
      cotizacion.itinerario_externo || cotizacion.itinerarioExterno,
    );
    const externalItineraryBreakdown = calculateExternalItineraryBreakdown(
      externalItinerary,
      rawPeopleDetails,
    );
    const summaryTotals = calculateCotizacionFinancialSummary({
      subtotalIndividual:
        cotizacion.precio_it_adulto ??
        cotizacion.precioItAdulto ??
        cotizacion.subtotal_individual ??
        cotizacion.subtotalIndividual ??
        generalTotals.subtotalIndividual ??
        0,
      adultsCount,
      hotelsTotal:
        cotizacion.totalHoteles ??
        generalTotals.hotelsTotal ??
        0,
      hotelAdultTotal:
        cotizacion.hotel_adult_total ??
        cotizacion.hotelAdultTotal ??
        rawAdditionalCosts?.hotelAdultTotal ??
        generalTotals.hotelAdultTotal ??
        null,
      hotelChildTotal:
        cotizacion.hotel_child_total ??
        cotizacion.hotelChildTotal ??
        rawAdditionalCosts?.hotelChildTotal ??
        generalTotals.hotelChildTotal ??
        0,
      hotelConvertedChildTotal:
        cotizacion.hotel_converted_child_total ??
        cotizacion.hotelConvertedChildTotal ??
        rawAdditionalCosts?.hotelConvertedChildTotal ??
        generalTotals.hotelConvertedChildTotal ??
        0,
      subtotalNinos:
        cotizacion.subtotal_nino ??
        cotizacion.subtotal_ninos ??
        cotizacion.subtotalNino ??
        cotizacion.subtotalNinos ??
        rawAdditionalCosts?.subtotalNinos ??
        generalTotals.subtotalNinos ??
        generalTotals.subtotal_ninos ??
        0,
      externalAdultTotal: externalItineraryBreakdown.adultTotal,
      externalChildTotal: externalItineraryBreakdown.childTotal,
      externalConvertedChildTotal:
        externalItineraryBreakdown.convertedChildTotal,
      externalExplicitChildCount:
        externalItineraryBreakdown.explicitChildCount,
      externalConvertedChildCount:
        externalItineraryBreakdown.convertedChildCount,
      baseExplicitChildCount:
        generalTotals.baseExplicitChildCount ||
        rawAdditionalCosts?.baseExplicitChildCount ||
        0,
      baseConvertedChildCount:
        generalTotals.baseConvertedChildCount ||
        rawAdditionalCosts?.baseConvertedChildCount ||
        0,
      hotelExplicitChildCount:
        generalTotals.hotelExplicitChildCount ||
        rawAdditionalCosts?.hotelExplicitChildCount ||
        0,
      hotelConvertedChildCount:
        generalTotals.hotelConvertedChildCount ||
        rawAdditionalCosts?.hotelConvertedChildCount ||
        0,
      nonHotelExplicitChildTotal:
        generalTotals.nonHotelExplicitChildTotal ??
        rawAdditionalCosts?.nonHotelExplicitChildTotal ??
        rawAdditionalCosts?.baseExplicitChildTotal ??
        null,
      nonHotelConvertedChildTotal:
        generalTotals.nonHotelConvertedChildTotal ??
        rawAdditionalCosts?.nonHotelConvertedChildTotal ??
        rawAdditionalCosts?.baseConvertedChildTotal ??
        null,
      additionalCosts: rawAdditionalCosts,
    });

    const parsedHotelDetalle = normalizeHotelDetallePayload(
      cotizacion.hotel_detalle || cotizacion.hotelDetalle || null,
    );
    const selectedHotel = deriveSelectedHotelFromDays(
      itineraryDays,
      parsedHotelDetalle,
      cotizacion.selectedHotel || cotizacion.selected_hotel || null,
    );
    const hotelPreviewRows =
      buildPdfHotelPreviewRows({
        cotizacion: {
          ...cotizacion,
          peopleDetails: rawPeopleDetails,
          peopleCount: peopleCountForSummary,
          peoplecount: peopleCountForSummary,
          additionalCosts: rawAdditionalCosts,
          additionalcosts: rawAdditionalCosts,
          itinerario: itineraryDays,
          dias: itineraryDays,
          itinerario_externo: externalItinerary,
          itinerarioExterno: externalItinerary,
          selectedHotel,
          hotel_detalle: parsedHotelDetalle,
          subtotalIndividual: summaryTotals.subtotalIndividual,
          subtotal_individual: summaryTotals.subtotalIndividual,
          precio_it_adulto: summaryTotals.subtotalIndividual,
          precio_it_ninos:
            cotizacion.precio_it_ninos ?? cotizacion.precioItNinos ?? 0,
          subtotalNinos: summaryTotals.subtotalNinos,
          subtotal_ninos: summaryTotals.subtotalNinos,
          hotelAdultTotal: summaryTotals.hotelAdultTotal,
          hotel_adult_total: summaryTotals.hotelAdultTotal,
          hotelChildTotal: summaryTotals.hotelChildTotal,
          hotel_child_total: summaryTotals.hotelChildTotal,
          hotelConvertedChildTotal: summaryTotals.hotelConvertedChildTotal,
          hotel_converted_child_total:
            summaryTotals.hotelConvertedChildTotal,
          nonHotelExplicitChildTotal:
            generalTotals.nonHotelExplicitChildTotal ??
            summaryTotals.nonHotelExplicitChildTotal,
          nonHotelConvertedChildTotal:
            generalTotals.nonHotelConvertedChildTotal ??
            summaryTotals.nonHotelConvertedChildTotal,
        },
      }).categoryRows || [];
    const selectedHotelCategory = String(
      selectedHotel?.category || selectedHotel?.key || "",
    ).toLowerCase();
    const selectedPreviewRow =
      hotelPreviewRows.find((row) => row?.isSelected) ||
      hotelPreviewRows.find(
        (row) => String(row?.category || "").toLowerCase() === selectedHotelCategory,
      ) ||
      null;
    const groupedPerRoomPricing = resolveGroupedHotelPricingForSummary({
      cotizacion,
      selectedHotel,
      peopleDetails: rawPeopleDetails,
      peopleCount: peopleCountForSummary,
      additionalCosts: rawAdditionalCosts,
      summaryTotals,
      generalTotals,
      externalBreakdown: externalItineraryBreakdown,
    });
    const roomAwareTotal = calculateRoomAwareVisibleTotal({
      perRoomPricing: groupedPerRoomPricing,
      summaryTotals,
      peopleCount: peopleCountForSummary,
      externalBreakdown: externalItineraryBreakdown,
      nonHotelExplicitChildTotal:
        generalTotals.nonHotelExplicitChildTotal ??
        summaryTotals.nonHotelExplicitChildTotal,
      nonHotelConvertedChildTotal:
        generalTotals.nonHotelConvertedChildTotal ??
        summaryTotals.nonHotelConvertedChildTotal,
      baseExplicitChildCount: generalTotals.baseExplicitChildCount,
      baseConvertedChildCount: generalTotals.baseConvertedChildCount,
      hotelExplicitChildCount: generalTotals.hotelExplicitChildCount,
      hotelConvertedChildCount: generalTotals.hotelConvertedChildCount,
    });

    const additionalFinalTotal = coercePositiveCurrencyTotal(
      rawAdditionalCosts?.finalTotal,
      rawAdditionalCosts?.final_total,
      rawAdditionalCosts?.grandTotal,
      rawAdditionalCosts?.grand_total,
    );
    const authoritativeTotal = resolveQuotationPricingSnapshot({
      additionalCosts: rawAdditionalCosts,
      previewTotal: roomAwareTotal,
      fallbackAdditionalTotal: additionalFinalTotal,
      fallbackTotal:
        storedTotalFinal > 0 ? storedTotalFinal : summaryTotals.grandTotal,
    }).grandTotal;

    if (authoritativeTotal > 0) {
      return authoritativeTotal;
    }

    // Si los totales están en cero, intentar calcular desde el itinerario
    if (cotizacion.itinerario) {
      let calculatedTotal = 0;
      let itinerarioArray = [];

      // Manejar tanto arrays como strings JSON
      if (Array.isArray(cotizacion.itinerario)) {
        itinerarioArray = cotizacion.itinerario;
      } else if (typeof cotizacion.itinerario === "string") {
        try {
          itinerarioArray = JSON.parse(cotizacion.itinerario);
        } catch (e) {
          // Si no se puede parsear, usar array vacío
          itinerarioArray = [];
        }
      }

      // Calcular total desde los servicios del itinerario
      if (Array.isArray(itinerarioArray)) {
        itinerarioArray.forEach((day) => {
          if (day.servicios && Array.isArray(day.servicios)) {
            day.servicios.forEach((service) => {
              // Intentar obtener precio desde diferentes estructuras
              let servicePrecio = 0;

              if (service.tariff && service.tariff.precio) {
                servicePrecio = parseFloat(service.tariff.precio);
              } else if (service.precio) {
                servicePrecio = parseFloat(service.precio);
              }

              calculatedTotal += servicePrecio || 0;
            });
          }
        });
      }

      if (calculatedTotal > 0) return calculatedTotal;
    }

    // Fallback: try to get total from services total only
    const servicesTotal = parseFloat(
      cotizacion.precio_it_adulto ||
        cotizacion.precioItAdulto ||
        cotizacion.totalServicios ||
        0,
    );

    return servicesTotal;
  };

  // Simplified Summary Modal using only the new structure - memoizado para evitar re-renders
  // NOTA: Debe estar antes de cualquier return condicional para cumplir con las reglas de Hooks
  const SummaryModal = useMemo(() => {
    if (!showSummaryModal || !summaryData) return null;

    return (
      <div
        className="summary-modal-overlay"
        onClick={() => setShowSummaryModal(false)}
      >
        <div
          className="summary-modal-content"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="summary-modal-header">
            <h3>Resumen de Cotización</h3>
            <button
              className="close-button"
              onClick={() => setShowSummaryModal(false)}
            >
              <MdClose />
            </button>
          </div>

          <div className="summary-modal-body">
            <SummaryContent cotizacion={summaryData} readonly={true} />
          </div>
        </div>
      </div>
    );
  }, [showSummaryModal, summaryData]);

  // Mostrar indicador de carga si es necesario
  if (loading) {
    return <LoadingIndicator mensaje="Cargando cotizaciones..." />;
  }

  const handleRequestPostSaleEdit = (cotizacion) => {
    if (!canRequestPostSaleEdit({
      role: userRole,
      actorDni: currentSellerDni,
      ownerDni: getCotizacionSellerDni(cotizacion),
    })) {
      showSnackbar("No tienes autorización para solicitar la edición de esta venta", "error");
      return;
    }
    const request = postSaleRequestsByCotizacion[String(cotizacion?.id)] || null;
    const uiState = getRequestUiState(request);
    if (!uiState.canRequest) {
      showSnackbar(
        uiState.canEdit ? "La edición ya fue aprobada. Usa Editar venta" : "Ya existe una solicitud pendiente para esta venta",
        uiState.canEdit ? "success" : "warning",
      );
      return;
    }
    setPostSaleRequestModal({ open: true, cotizacion, loading: false });
  };

  const submitPostSaleEditRequest = async (reason) => {
    const target = postSaleRequestModal.cotizacion;
    if (!target?.id) return;
    setPostSaleRequestModal((current) => ({ ...current, loading: true }));
    try {
      const request = await createPostSaleEditRequest(target.id, reason);
      showSnackbar(
        isApprovedAndUsable(request)
          ? "Solicitud registrada y autoaprobada. Ya puedes editar la venta"
          : "Solicitud enviada. Quedará habilitada cuando un superadmin la apruebe",
        "success",
      );
      setPostSaleRequestModal({ open: false, cotizacion: null, loading: false });
    } catch (error) {
      showSnackbar(
        error?.response?.data?.message || error?.message || "No se pudo enviar la solicitud",
        "error",
      );
      setPostSaleRequestModal((current) => ({ ...current, loading: false }));
    }
  };

  const handleCancelPostSaleRequest = async (request) => {
    if (!request?.id) return;
    try {
      await cancelPostSaleEditRequest(request.id);
      showSnackbar("Solicitud cancelada", "success");
    } catch (error) {
      showSnackbar(error?.response?.data?.message || "No se pudo cancelar la solicitud", "error");
    }
  };

  const handleDuplicarModeloWithAuth = (cotizacion) => {
    handleDuplicarModelo({
      ...cotizacion,
      createdby: user?.dni || "SYSTEM",
    });
  };

  // Handle delete with confirmation modal
  const handleDeleteCotizacionWithConfirmation = async (cotizacionId) => {
    console.log(
      " [DELETE] handleDeleteCotizacionWithConfirmation called with ID:",
      cotizacionId,
    );

    const cotizacionToDelete = filteredCotizaciones.find(
      (c) => c.id === cotizacionId,
    );
    const cotizacionTitle =
      cotizacionToDelete?.titulo || cotizacionToDelete?.id || "esta cotización";

    console.log(" [DELETE] Cotización to delete:", {
      id: cotizacionId,
      title: cotizacionTitle,
    });

    await confirmDeleteNotif({
      title: "Confirmar Eliminación de Cotización",
      message: `¿Está seguro que desea eliminar la cotización "${cotizacionTitle}"? Esta acción no se puede deshacer.`,
      type: "danger",
      confirmText: "Eliminar Cotización",
      cancelText: "Cancelar",
      onConfirm: async () => {
        console.log(" [DELETE] User confirmed deletion, calling API...");

        try {
          // Call API to delete directly
          console.log(
            ` [DELETE] Calling cotizacionService.deleteCotizacion(${cotizacionId})`,
          );
          await cotizacionService.deleteCotizacion(cotizacionId);

          console.log(" [DELETE] API call successful, updating local state...");

          // Update local state to remove the deleted item
          setCotizaciones((prev) => {
            const updated = prev.filter(
              (cotizacion) => cotizacion.id !== cotizacionId,
            );
            console.log(
              ` [DELETE] Local state updated. Removed 1 item. New count: ${updated.length}`,
            );
            return updated;
          });

          showSuccess(`Cotización "${cotizacionTitle}" eliminada exitosamente`);
          invalidateCotizacionGraphCache();
          await fetchCotizaciones();

          console.log(" [DELETE] Delete operation completed successfully");
        } catch (error) {
          console.error(
            ` [DELETE ERROR] Failed to delete cotizacion ${cotizacionId}:`,
            error,
          );
          console.error(" [DELETE ERROR] Error details:", {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
          });
          showError(error.message || "Error al eliminar la cotización");
          throw error;
        }
      },
      onCancel: () => {
        console.log(" [DELETE] User cancelled deletion");
      },
    });
  };

  // Handle predecessor click - Show predecessor details in summary modal
  const handlePredecessorClick = (predecessor) => {
    handleShowSummary(predecessor);
  };

  // New function to handle voucher creation completion
  const handleVoucherComplete = async (finalVoucherData) => {
    try {
      // El backend marca cotizacion.tiene_voucher al crear el voucher.
      // No volver a actualizar la cotización completa desde este flujo:
      // additionalcosts solo pertenece a EdicionCotizacion.
      if (voucherCotizacion?.id) {
        const updatedCotizaciones = cotizaciones.map((cot) =>
          cot.id === voucherCotizacion.id
            ? { ...cot, tiene_voucher: true }
            : cot,
        );
        setCotizaciones(updatedCotizaciones);
      }

      setShowVoucherModal(false);
      setVoucherCotizacion(null);

      // Show success message
      showSnackbar("Voucher creado exitosamente", "success");

      invalidateCotizacionGraphCache();
      await fetchCotizaciones();
      invalidateComisionesCache();
    } catch (error) {
      console.error("Error saving voucher:", error);
      showSnackbar("Error al crear el voucher", "error");
    }
  };

  // Function to close voucher modal
  const handleCloseVoucherModal = () => {
    setShowVoucherModal(false);
    setVoucherCotizacion(null);
  };

  // Open voucher modal with full cotizacion detail, not the lightweight list row.
  const handleVoucherClick = async (cotizacion) => {
    let voucherSource = cotizacion;
    try {
      if (cotizacion?.id) {
        const freshCotizacion = await cotizacionService.getCotizacionById(cotizacion.id, {
          skipCache: true,
        });
        voucherSource = { ...cotizacion, ...(freshCotizacion || {}) };
      }
    } catch (error) {
      console.error("Error loading cotizacion detail for voucher:", error);
      showSnackbar("No se pudo cargar el detalle completo de la cotización", "error");
    }
    setVoucherCotizacion(voucherSource);
    setShowVoucherModal(true);
  };

  // Build seller list from loaded quotes (must be before any early return)
  const sellerOptions = useMemo(() => {
    const map = new Map();
    cotizaciones.forEach((cotizacion) => {
      const dni = getCotizacionSellerDni(cotizacion);
      const name = cotizacion.creator_name || dni || "Desconocido";
      if (dni && !map.has(dni)) {
        map.set(dni, { dni, name });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [cotizaciones]);

  const sellerScopeCounts = useMemo(() => {
    return filteredCotizaciones.reduce(
      (acc, cotizacion) => {
        const isOwn =
          currentSellerDni &&
          getCotizacionSellerDni(cotizacion) === currentSellerDni;
        acc.all += 1;
        if (isOwn) {
          acc.mine += 1;
        } else {
          acc.others += 1;
        }
        return acc;
      },
      { all: 0, mine: 0, others: 0 },
    );
  }, [filteredCotizaciones, currentSellerDni]);

  const hasExternalSellers = useMemo(
    () =>
      sellerOptions.some(
        (seller) => currentSellerDni && seller.dni !== currentSellerDni,
      ),
    [currentSellerDni, sellerOptions],
  );

  const showSellerScopeTabs =
    showAuditColumn &&
    Boolean(currentSellerDni) &&
    hasExternalSellers;

  useEffect(() => {
    if (!showSellerScopeTabs) return;

    if (
      sellerScope === "mine" &&
      sellerScopeCounts.mine === 0 &&
      sellerScopeCounts.others > 0
    ) {
      setSellerScope("others");
      return;
    }

    if (sellerScope === "mine" && filters.vendedor && filters.vendedor !== currentSellerDni) {
      setFilters((prev) => ({ ...prev, vendedor: "" }));
      return;
    }

    if (sellerScope === "others" && filters.vendedor === currentSellerDni) {
      setFilters((prev) => ({ ...prev, vendedor: "" }));
    }
  }, [
    currentSellerDni,
    filters.vendedor,
    sellerScope,
    sellerScopeCounts.mine,
    sellerScopeCounts.others,
    setFilters,
    showSellerScopeTabs,
  ]);

  const scopedCotizaciones = useMemo(() => {
    if (!showSellerScopeTabs) {
      return filteredCotizaciones;
    }

    return filteredCotizaciones.filter((cotizacion) => {
      const isOwn =
        currentSellerDni &&
        getCotizacionSellerDni(cotizacion) === currentSellerDni;
      return sellerScope === "mine" ? isOwn : !isOwn;
    });
  }, [
    filteredCotizaciones,
    currentSellerDni,
    sellerScope,
    showSellerScopeTabs,
  ]);

  const quotationStatusCounts = useMemo(
    () => ({
      open: scopedCotizaciones.filter((item) => item.tiene_voucher !== true).length,
      sold: scopedCotizaciones.filter((item) => item.tiene_voucher === true).length,
    }),
    [scopedCotizaciones],
  );

  const handleScopedInputChange = (event) => {
    if (event?.target?.name === "vendedor" && showSellerScopeTabs) {
      const selectedSeller = event.target.value;
      if (selectedSeller && selectedSeller !== currentSellerDni) {
        setSellerScope("others");
      } else if (selectedSeller === currentSellerDni) {
        setSellerScope("mine");
      }
    }
    handleInputChange(event);
  };

  // Renderizar la vista correspondiente
  if (currentView === "edicion") {
    return (
      <div className="cotizaciones-page cotizaciones-page--edicion">
        <EdicionCotizacion
          onClose={handleBackToList}
          onBack={handleBackToList}
          onNext={handleCotizacionSave}
          selectedPackage={editingData.selectedPackage}
          isNewPackage={editingData.isNewPackage}
          editingCotizacion={editingData.cotizacion}
          clientData={editingData.clientData}
          userPlatform={
            editingData.selectedBusinessType?.platform || user?.platform
          }
          userBusinessType={
            editingData.selectedBusinessType?.businessType ||
            user?.business_type
          }
          quotationAgency={editingData.selectedBusinessType?.agency || null}
          quotationAgencyId={
            editingData.selectedBusinessType?.agencyId ||
            editingData.cotizacion?.agency_id ||
            1
          }
          quotationTariffType={editingData.selectedBusinessType?.tariffType}
          userRole={userRole}
          sourceVoucher={editingData.sourceVoucher || editingData.cotizacion?.source_voucher || null}
          initialStep={editingData.initialStep}
          isSaving={isSavingCotizacion}
        />
      </div>
    );
  }

  // Vista por defecto (lista de cotizaciones)
  return (
    <div className="cotizaciones-page">
      <div className="cotizaciones-sticky-top">
        <div className="quotation-command-header">
          <div className="quotation-command-header__copy">
            <span className="quotation-command-header__eyebrow">
              {isReservasQuotationFlow ? "RESERVAS · VENSO TOURS" : "VENTAS · VENSO TOURS"}
            </span>
            <h1>Centro de cotizaciones</h1>
            <p>
              {isReservasQuotationFlow
                ? "Elabora cotizaciones operativas desde su documento de origen y conserva la trazabilidad hacia Reservas."
                : "Diseña propuestas, controla su avance comercial y convierte cada oportunidad en una experiencia lista para operar."}
            </p>
            {user && (
              <div className="quotation-command-header__context">
                <span className="agency-badge">Venso Tours</span>
                <span className="business-badge">
                  {user.business_type === "B2B" ? "B2B · Agencias" : "B2C · Cliente final"}
                </span>
              </div>
            )}
          </div>
          <div className="quotation-command-header__aside">
            <div className="quotation-command-header__metric">
              <span>Abiertas</span>
              <strong>{quotationStatusCounts.open}</strong>
            </div>
            <div className="quotation-command-header__metric">
              <span>Vendidas</span>
              <strong>{quotationStatusCounts.sold}</strong>
            </div>
            <button
              className="btn-create-cotizacion"
              onClick={() => handleCreateCotizacion()}
            >
              <MdAdd /> Nueva cotización
            </button>
          </div>
        </div>

        {/* Refactored Filter Component */}
        <CotizacionesFilter
          filters={filters}
          onInputChange={handleScopedInputChange}
          onSearch={handleSearch}
          onClear={clearFilters}
          isLoading={loading}
          sellers={sellerOptions}
        />

        {showSellerScopeTabs && (
          <div className="seller-scope-tabs" role="tablist" aria-label="Alcance de cotizaciones">
            <button
              type="button"
              className={`seller-scope-tab ${sellerScope === "mine" ? "active" : ""}`}
              onClick={() => setSellerScope("mine")}
            >
              Propias
              <span>{sellerScopeCounts.mine}</span>
            </button>
            <button
              type="button"
              className={`seller-scope-tab ${sellerScope === "others" ? "active" : ""}`}
              onClick={() => setSellerScope("others")}
            >
              Otros vendedores
              <span>{sellerScopeCounts.others}</span>
            </button>
          </div>
        )}

        <div
          className="quotation-status-tabs quotation-status-tabs--sticky"
          role="tablist"
          aria-label="Estado de cotizaciones"
        >
          <button
            type="button"
            role="tab"
            aria-selected={quotationStatus === "open"}
            className={quotationStatus === "open" ? "active" : ""}
            onClick={() => setQuotationStatus("open")}
          >
            Cotizaciones abiertas <strong>{quotationStatusCounts.open}</strong>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={quotationStatus === "sold"}
            className={quotationStatus === "sold" ? "active" : ""}
            onClick={() => setQuotationStatus("sold")}
          >
            Cerradas / vendidas <strong>{quotationStatusCounts.sold}</strong>
          </button>
        </div>
      </div>

      {/* Sección de borradores no guardados */}
      <CotizacionesDrafts
        onRestoreDraft={handleRestoreDraft}
        onRemoveDraft={handleRemoveDraft}
      />

      {/* Floating Snackbar - positioned fixed at bottom center */}
      {snackbar.show && (
        <div className={`cotizaciones-snackbar ${snackbar.type}`}>
          <span>{snackbar.message}</span>
          <button onClick={() => setSnackbar({ ...snackbar, show: false })}>
            <MdClose />
          </button>
        </div>
      )}

      {/* Refactored Table Component */}
      {scopedCotizaciones.length > 0 || notificationHistoryTargetId ? (
        <CotizacionesTable
          cotizaciones={scopedCotizaciones}
          allCotizacionesWithInactive={cotizaciones}
          expandedActionsId={expandedActionsId}
          expandedPdfId={expandedPdfId}
          selectedCotizacion={selectedCotizacion}
          userRole={userRole}
          currentSellerDni={currentSellerDni}
          showAuditColumn={showAuditColumn}
          onToggleActions={toggleActionButtons}
          onTogglePdf={togglePdfButtons}
          onEdit={handleEditCotizacionModal}
          onRequestPostSaleEdit={handleRequestPostSaleEdit}
          onCancelPostSaleRequest={handleCancelPostSaleRequest}
          postSaleRequestsByCotizacion={postSaleRequestsByCotizacion}
          onDuplicateModel={handleDuplicarModeloWithAuth}
          onSummary={handleShowSummary}
          onPreLiquidacion={handleShowPreLiquidacion}
          onAgencyPayment={(cotizacion) => setAgencyPaymentCotizacion(cotizacion)}
          onVoucherMedia={(cotizacion) => setVoucherMediaCotizacion(cotizacion)}
          loadSummaryPricingData={buildSummaryDataForCotizacion}
          onViewServices={handleViewServices}
          onVoucher={handleVoucherClick}
          onDelete={handleDeleteCotizacionWithConfirmation}
          onRowClick={viewCotizacionDetails}
          onPdfPreview={handlePdfPreviewOpen}
          onTriggerN8N={handleTriggerN8N}
          processingN8NId={processingN8NId}
          onPdfClose={() => setExpandedPdfId(null)}
          onActionsClose={() => setExpandedActionsId(null)}
          formatDate={formatDate}
          formatCurrency={formatCurrency}
          calculateTotalFinal={calculateTotalFinal}
          deletePopover={deletePopover}
          onCancelDelete={cancelDelete}
          onPredecessorClick={handlePredecessorClick}
          onRefresh={fetchCotizaciones}
          quotationStatus={quotationStatus}
          historyTargetId={notificationHistoryTargetId}
          onHistoryTargetConsumed={consumeNotificationHistoryTarget}
        />
      ) : (
        <CotizacionesEmpty
          hasFilters={
            Object.values(filters).some((f) => f !== "") ||
            showSellerScopeTabs
          }
          onClearFilters={() => {
            clearFilters();
            setSellerScope("mine");
          }}
        />
      )}

      {/* Add VoucherModal after your other modal components */}
      {SummaryModal}

      {/* Use the new VoucherModal component from VouchersVenta with correct prop names */}
      {showVoucherModal && (
        <VoucherModal
          isOpen={showVoucherModal}
          onClose={handleCloseVoucherModal}
          cotizacionData={voucherCotizacion}
          onSave={handleVoucherComplete}
          isEditMode={false}
        />
      )}

      {agencyPaymentCotizacion && (
        <AgencyPaymentReportModal
          isOpen={Boolean(agencyPaymentCotizacion)}
          onClose={() => setAgencyPaymentCotizacion(null)}
          cotizacionId={agencyPaymentCotizacion.id}
          voucherCode={agencyPaymentCotizacion.voucher_codes?.[0] || agencyPaymentCotizacion.voucher_code}
          initialCotizacion={agencyPaymentCotizacion}
        />
      )}

      {voucherMediaCotizacion && (
        <VoucherMediaManagerModal
          isOpen={Boolean(voucherMediaCotizacion)}
          onClose={() => setVoucherMediaCotizacion(null)}
          cotizacionId={voucherMediaCotizacion.id}
          voucherCode={voucherMediaCotizacion.voucher_codes?.[0] || voucherMediaCotizacion.voucher_code}
          quotationTitle={voucherMediaCotizacion.titulo}
          initialMedia={voucherMediaCotizacion.source_voucher || voucherMediaCotizacion.sourceVoucher}
          canManage={
            voucherMediaCotizacion.is_active !== false &&
            ([0, 1, 3].includes(Number(userRole)) ||
              (Number(userRole) === 2 &&
                normalizeIdentifier(
                  voucherMediaCotizacion.createdby ||
                    voucherMediaCotizacion.created_by ||
                    voucherMediaCotizacion.createdBy,
                ) === normalizeIdentifier(currentSellerDni)))
          }
          uploadedBy={currentSellerDni}
          onChanged={async () => {
            await fetchCotizaciones();
          }}
        />
      )}

      {preLiquidacionCotizacion && (
        <PreLiquidacionModal
          isOpen
          readOnly
          onClose={() => { preLiquidacionRequest.current += 1; setPreLiquidacionCotizacion(null); }}
          value={preLiquidacionCotizacion.preliquidacion}
          quotation={preLiquidacionCotizacion}
          peopleDetails={preLiquidacionCotizacion.peopleDetails}
          defaults={{
            code: preLiquidacionCotizacion.voucher_code || preLiquidacionCotizacion.id || "",
            program: preLiquidacionCotizacion.titulo || preLiquidacionCotizacion.title || "",
            agency: preLiquidacionCotizacion.agency_name || preLiquidacionCotizacion.agencia_nombre || "VENSO TOURS",
          }}
        />
      )}

      {/* PDF Preview Modal */}
      {showPdfPreview && pdfPreviewCotizacion && (
        <PdfPreviewModal
          cotizacion={pdfPreviewCotizacion}
          onClose={handlePdfPreviewClose}
        />
      )}

      {/* ServiceSummaryModal - Modal de servicios con estados de pago */}
      {showServiceSummaryModal && serviceSummaryVoucher && (
        <ServiceSummaryModal
          isOpen={showServiceSummaryModal}
          onClose={() => {
            setShowServiceSummaryModal(false);
            setServiceSummaryVoucher(null);
          }}
          reservationVoucher={serviceSummaryVoucher}
        />
      )}

      {/* ConfirmationModal - Delete confirmation with improved UX */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={closeConfirmation}
        onConfirm={confirmationModal.onConfirm}
        title={confirmationModal.title}
        message={confirmationModal.message}
        type={confirmationModal.type}
        confirmText={confirmationModal.confirmText}
        cancelText={confirmationModal.cancelText}
        loading={confirmationModal.loading}
      />

      <PostSaleEditRequestModal
        open={postSaleRequestModal.open}
        cotizacion={postSaleRequestModal.cotizacion}
        loading={postSaleRequestModal.loading}
        onClose={() =>
          !postSaleRequestModal.loading &&
          setPostSaleRequestModal({ open: false, cotizacion: null, loading: false })
        }
        onSubmit={submitPostSaleEditRequest}
      />

      {/* BusinessTypeModal - selector de contexto comercial */}
      <BusinessTypeModal
        visible={showBusinessTypeModal}
        onHide={() => {
          setShowBusinessTypeModal(false);
          setPendingQuotationClientData(null);
        }}
        onSelect={handleBusinessTypeSelect}
        canManageAgencies={Number(userRole) === 0}
      />

      {/* Notification Toast */}
      {notification.isOpen && (
        <div className={`notification notification-${notification.type}`}>
          {notification.message}
        </div>
      )}

      {/* Save Choice Modal - When editing a processed cotizacion */}
      {saveChoiceModal.isOpen && (
        <div
          className="save-choice-overlay"
          onClick={() => setSaveChoiceModal({ isOpen: false, data: null })}
        >
          <div
            className="save-choice-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Esta cotización ya tiene PDF generado</h3>
            <p>
              ¿Deseas regenerar el PDF con los cambios o mantener el PDF actual?
            </p>
            <div className="save-choice-actions">
              <button
                className="save-choice-btn regenerate"
                onClick={() => executeSave(saveChoiceModal.data, true)}
              >
                <MdPictureAsPdf /> Guardar y regenerar PDF Canva
              </button>
              <button
                className="save-choice-btn keep"
                onClick={() => executeSave(saveChoiceModal.data, false)}
              >
                <MdSave /> Guardar sin actualizar PDF
              </button>
            </div>
            <button
              className="save-choice-close"
              onClick={() => setSaveChoiceModal({ isOpen: false, data: null })}
            >
              <MdClose /> Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cotizaciones;
