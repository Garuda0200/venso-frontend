import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdWarning,
  MdExpandMore,
  MdExpandLess,
  MdCalendarToday,
} from "react-icons/md";
import { useAuth } from "../../../context/AuthContext";
import SecureStorage from "../../../utils/secureStorage";
import VoucherCard from "./components/VoucherCard/VoucherCard";
import VoucherModal from "./components/VoucherModal/VoucherModal";
import VentasSummaryModal from "./components/VentasSummaryModal/VentasSummaryModal";
import CotizacionSelectorModal from "./components/CotizacionSelectorModal/CotizacionSelectorModal";
import VouchersFilters from "./components/VouchersFilters/VouchersFilters";
import VentasSummaryPDFModal from "./components/VentasSummaryPDFModal/VentasSummaryPDFModal"; // Modal vista previa PDF

import ConfirmationModal from "../../../components/common/ConfirmationModal/ConfirmationModal";
import NotificationToast from "../../../components/common/NotificationToast/NotificationToast";
import { voucherVentaService } from "../../../services/voucherVentaService";
import { invalidateComisionesCache } from "../../../services/comisionesService";
import { invalidateCotizacionGraphCache } from "../../../utils/cacheInvalidation";
import { isRequestCanceled } from "../../../utils/apiUtils";
import { useVouchersVentaWithCotizacion } from "../../../hooks/useVouchersVenta";
import { queryKeys } from "../../../config/queryClient";
import { useNotifications } from "../../../hooks/useNotifications";
import { canViewAllVouchers } from "../../../utils/permissions";
import AgencyPaymentReportModal from "../../../components/Contabilidad/AgencyPaymentReportModal";
import VoucherMediaManagerModal from "../Cotizaciones/components/VoucherMediaManagerModal";
import { useAgencyDirectory } from "../../../hooks/useAgencyDirectory";
import AgencyGroups from "../../../components/common/AgencyGroups/AgencyGroups";
import "../../../components/common/AgencyGroups/AgencyGroups.scss";
import "./VouchersVenta.scss";

const getVoucherCotizacion = (voucher = {}) =>
  voucher?.cotizacion_data ||
  voucher?.cotizacionData ||
  voucher?.cotizacion ||
  null;

const parseVoucherLocalDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);
  return isNaN(date.getTime()) ? null : date;
};

const getVoucherReservationDate = (voucher = {}) => {
  const cotizacion = getVoucherCotizacion(voucher) || {};
  return parseVoucherLocalDate(
    cotizacion.fechainicio ||
      voucher.created_at ||
      voucher.createdAt,
  );
};

const normalizeIdentifier = (value) =>
  value === undefined || value === null ? "" : String(value).trim();

const getCurrentSellerDni = (auth, user) =>
  normalizeIdentifier(
    user?.dniuser ||
      user?.dni ||
      auth?.dniuser ||
      auth?.user?.dniuser ||
      auth?.user?.dni,
  );

const getVoucherSellerDni = (voucher = {}) =>
  normalizeIdentifier(
    voucher.created_by ||
      voucher.createdBy ||
      voucher.createdby ||
      voucher.vendedor_dniuser ||
      voucher.vendedor_dni,
  );

const VouchersVenta = () => {
  const location = useLocation();
  const { auth, user } = useAuth();
  const queryClientInstance = useQueryClient();
  const { data: agencies = [] } = useAgencyDirectory();
  const currentSellerDni = getCurrentSellerDni(auth, user);
  const canScopeBySeller = canViewAllVouchers(user || auth);

  // IDs de vouchers de venta recién eliminados en esta sesión. Evita que un
  // refetch con caché backend/frontend obsoleto haga reaparecer el registro
  // tras un borrado exitoso.
  const recentlyDeletedVoucherIdsRef = useRef(new Set());

  // Usar useQuery para compartir caché con Dashboard (evita fetch duplicado)
  const {
    data: vouchers = [],
    isLoading,
    error: queryError,
    dataUpdatedAt,
  } = useVouchersVentaWithCotizacion();
  const error = isRequestCanceled(queryError) ? null : queryError?.message || null;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCotizacionSelector, setShowCotizacionSelector] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [selectedCotizacion, setSelectedCotizacion] = useState(null);
  const [isPaymentManagementMode, setIsPaymentManagementMode] = useState(false); // Modo gestión de pagos
  const [isDocumentManagementMode, setIsDocumentManagementMode] =
    useState(false); // Modo gestión de documentos

  const [showPDFPreviewModal, setShowPDFPreviewModal] = useState(false); // Modal vista previa PDF
  const [agencyPaymentVoucher, setAgencyPaymentVoucher] = useState(null);
  const [voucherMediaVoucher, setVoucherMediaVoucher] = useState(null);

  // Estados para acordeones
  const [expandedYears, setExpandedYears] = useState({});
  const [expandedMonths, setExpandedMonths] = useState({});

  // Estados para filtros
  const [filterCriteria, setFilterCriteria] = useState({
    searchTerm: "",
    dateFrom: "",
    dateTo: "",
    seller: "",
  });
  const [sellerScope, setSellerScope] = useState("mine");

  // Hook de notificaciones
  const {
    confirmationModal,
    notification,
    confirmDelete,
    showSuccess,
    showError,
    showInfo,
    closeConfirmation,
    closeNotification,
  } = useNotifications();

  // Recarga fresca de vouchers evitando el caché manual de axios y
  // sobrescribiendo el caché de React Query con los datos actuales del backend.
  const loadVouchers = useCallback(async () => {
    try {
      const freshVouchers =
        await voucherVentaService.getVouchersWithCotizacion({
          skipCache: true,
        });
      const data = Array.isArray(freshVouchers)
        ? freshVouchers
        : freshVouchers?.data || [];

      queryClientInstance.setQueryData(
        queryKeys.vouchersVenta.withCotizaciones(),
        data,
      );

      return data;
    } catch (error) {
      if (!isRequestCanceled(error)) {
        console.error("Error recargando vouchers:", error);
      }
      return null;
    }
  }, [queryClientInstance]);

  const handlePdfVoucherUpdated = useCallback(
    async (updatedVoucher) => {
      const updatedVoucherId = normalizeIdentifier(
        updatedVoucher?.id || selectedVoucher?.id,
      );

      if (updatedVoucherId) {
        const listVoucherPatch = { ...(updatedVoucher || {}) };
        delete listVoucherPatch.itinerario;

        queryClientInstance.setQueryData(
          queryKeys.vouchersVenta.withCotizaciones(),
          (current = []) =>
            current.map((item) =>
              normalizeIdentifier(item?.id) === updatedVoucherId
                ? {
                    ...item,
                    ...listVoucherPatch,
                    passenger_summary:
                      listVoucherPatch.passenger_summary ??
                      item.passenger_summary,
                  }
                : item,
            ),
        );

        setSelectedVoucher((current) =>
          normalizeIdentifier(current?.id) === updatedVoucherId
            ? { ...current, ...updatedVoucher }
            : current,
        );
      }

      // La actualización optimista ya deja el card sincronizado. Esta lectura
      // fuerza al backend a entregar el listado autoritativo sin Moka/axios.
      await loadVouchers();
    },
    [loadVouchers, queryClientInstance, selectedVoucher?.id],
  );

  // Get active vouchers with filters applied
  const activeVouchers = useMemo(() => {
    const deletedIds = recentlyDeletedVoucherIdsRef.current;
    let results = vouchers.filter(
      (v) => v.is_active !== false && !deletedIds.has(v.id),
    );

    // Apply search filter
    if (filterCriteria.searchTerm) {
      const searchLower = filterCriteria.searchTerm.toLowerCase();
      results = results.filter((voucher) => {
        return (
          voucher.id?.toString().includes(searchLower) ||
          voucher.voucher_code?.toLowerCase().includes(searchLower) ||
          voucher.cotizacion?.titulo?.toLowerCase().includes(searchLower) ||
          voucher.cotizacion_id?.toLowerCase().includes(searchLower) ||
          voucher.cotizacion?.client?.nombres
            ?.toLowerCase()
            .includes(searchLower) ||
          voucher.cotizacion?.client?.apellidos
            ?.toLowerCase()
            .includes(searchLower)
        );
      });
    }

    // Apply date from filter
    if (filterCriteria.dateFrom) {
      const startDate = new Date(filterCriteria.dateFrom);
      startDate.setHours(0, 0, 0, 0);
      results = results.filter((voucher) => {
        const voucherDate = getVoucherReservationDate(voucher);
        if (!voucherDate) return false;
        voucherDate.setHours(0, 0, 0, 0);
        return voucherDate >= startDate;
      });
    }

    // Apply date to filter
    if (filterCriteria.dateTo) {
      const endDate = new Date(filterCriteria.dateTo);
      endDate.setHours(23, 59, 59, 999);
      results = results.filter((voucher) => {
        const voucherDate = getVoucherReservationDate(voucher);
        return Boolean(voucherDate && voucherDate <= endDate);
      });
    }

    // Apply seller filter
    if (filterCriteria.seller) {
      results = results.filter(
        (voucher) =>
          getVoucherSellerDni(voucher) === filterCriteria.seller,
      );
    }

    return results;
  }, [vouchers, filterCriteria]);

  const sellerScopeCounts = useMemo(() => {
    return activeVouchers.reduce(
      (acc, voucher) => {
        const isOwn =
          currentSellerDni && getVoucherSellerDni(voucher) === currentSellerDni;
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
  }, [activeVouchers, currentSellerDni]);

  const hasExternalSellers = useMemo(
    () =>
      vouchers.some(
        (voucher) =>
          currentSellerDni &&
          getVoucherSellerDni(voucher) &&
          getVoucherSellerDni(voucher) !== currentSellerDni,
      ),
    [currentSellerDni, vouchers],
  );

  const showSellerScopeTabs =
    canScopeBySeller &&
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

    if (
      sellerScope === "mine" &&
      filterCriteria.seller &&
      filterCriteria.seller !== currentSellerDni
    ) {
      setFilterCriteria((prev) => ({ ...prev, seller: "" }));
      return;
    }

    if (sellerScope === "others" && filterCriteria.seller === currentSellerDni) {
      setFilterCriteria((prev) => ({ ...prev, seller: "" }));
    }
  }, [
    currentSellerDni,
    filterCriteria.seller,
    sellerScope,
    sellerScopeCounts.mine,
    sellerScopeCounts.others,
    showSellerScopeTabs,
  ]);

  const scopedVouchers = useMemo(() => {
    if (!showSellerScopeTabs) {
      return activeVouchers;
    }

    return activeVouchers.filter((voucher) => {
      const isOwn =
        currentSellerDni && getVoucherSellerDni(voucher) === currentSellerDni;
      return sellerScope === "mine" ? isOwn : !isOwn;
    });
  }, [activeVouchers, currentSellerDni, sellerScope, showSellerScopeTabs]);

  // Helper function to get voucher date for grouping (by creation date)
  const getVoucherDate = (voucher) =>
    parseVoucherLocalDate(
      voucher.created_at || voucher.createdAt,
    );

  // Agrupar por año / mes para acordeones (similar a VouchersReserva)
  const yearGroups = useMemo(() => {
    const yearsMap = {};

    scopedVouchers.forEach((voucher) => {
      const date = getVoucherDate(voucher);
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
  }, [scopedVouchers]);

  // Inicializar año/mes actual como abiertos (solo cuando aparecen nuevos grupos)
  useEffect(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let hasYearChanges = false;
    let hasMonthChanges = false;

    const nextYears = { ...expandedYears };
    yearGroups.forEach((yg) => {
      if (!(yg.year in nextYears)) {
        nextYears[yg.year] = yg.year === currentYear;
        hasYearChanges = true;
      }
    });

    const nextMonths = { ...expandedMonths };
    yearGroups.forEach((yg) => {
      yg.months.forEach((m) => {
        const key = m.key;
        if (!(key in nextMonths)) {
          nextMonths[key] = yg.year === currentYear && m.month === currentMonth;
          hasMonthChanges = true;
        }
      });
    });

    if (hasYearChanges) setExpandedYears(nextYears);
    if (hasMonthChanges) setExpandedMonths(nextMonths);
  }, [yearGroups]);

  // Toggle año
  const toggleYear = (year) => {
    setExpandedYears((prev) => ({
      ...prev,
      [year]: !prev[year],
    }));
  };

  // Toggle mes
  const toggleMonth = (monthKey) => {
    setExpandedMonths((prev) => ({
      ...prev,
      [monthKey]: !prev[monthKey],
    }));
  };

  // Handle filter change from VouchersFilters component
  const handleFilterChange = useCallback((newFilters) => {
    if (newFilters?.seller && currentSellerDni) {
      setSellerScope(
        newFilters.seller === currentSellerDni ? "mine" : "others",
      );
    }
    setFilterCriteria(newFilters);
  }, [currentSellerDni]);

  // Manejar creación de nuevo voucher
  const handleNewVoucher = () => {
    // Mostrar el selector de cotización primero
    setShowCotizacionSelector(true);
  };

  // Manejar la selección de una cotización
  const handleCotizacionSelect = (cotizacion) => {
    setSelectedCotizacion(cotizacion);
    setShowCotizacionSelector(false);
    setShowCreateModal(true);
  };

  // Manejar edición de voucher existente (simplificado - solo usa status)
  const handleEditVoucher = async (voucher) => {
    // Superadmin y ventas pueden editar desde sus cards.
    // Otros roles solo pueden editar si status es EDITABLE_ONCE.
    const isSuperAdmin = auth.role === 0;
    const isVentas = auth.role === 2;

    if (isSuperAdmin || isVentas) {
      console.log(" Usuario autorizado - permitiendo edición de voucher");
      setSelectedVoucher(voucher);
      setSelectedCotizacion(getVoucherCotizacion(voucher));
      setShowEditModal(true);
    } else if (voucher.status === "EDITABLE_ONCE") {
      console.log(" Voucher con status EDITABLE_ONCE - permitiendo edición");
      setSelectedVoucher(voucher);
      setSelectedCotizacion(getVoucherCotizacion(voucher));
      setShowEditModal(true);
    } else {
      // Usuario normal intentando editar voucher con status ACTIVE
      showInfo("Solo se pueden editar vouchers con status EDITABLE_ONCE");
    }
  };

  // Manejar vista previa de voucher
  const handlePreviewVoucher = (voucher) => {
    setSelectedVoucher(voucher);
    setShowPreviewModal(true);
  };

  // Manejar vista previa de voucher en formato PDF
  const handlePreviewVoucherPDF = (voucher) => {
    setSelectedVoucher(voucher);
    setShowPDFPreviewModal(true);
  };

  // Manejar gestión de pagos - abrir modal en modo pago únicamente
  const handleManagePayments = (voucher) => {
    setSelectedVoucher(voucher);
    setSelectedCotizacion(getVoucherCotizacion(voucher));
    setIsPaymentManagementMode(true); // Activar modo gestión de pagos
    setIsDocumentManagementMode(false); // Desactivar modo documentos
    setShowEditModal(true); // Abrir el modal de edición pero en modo gestión de pagos
  };

  // Manejar gestión de documentos - abrir modal en modo documentos únicamente
  const handleManageDocuments = (voucher) => {
    setSelectedVoucher(voucher);
    setSelectedCotizacion(getVoucherCotizacion(voucher));
    setIsDocumentManagementMode(true); // Activar modo gestión de documentos
    setIsPaymentManagementMode(false); // Desactivar modo pagos
    setShowEditModal(true); // Abrir el modal de edición pero en modo gestión de documentos
  };

  // Manejar eliminación de voucher
  const handleDeleteVoucher = async (voucherId) => {
    const voucherToDelete = vouchers.find((v) => v.id === voucherId);
    const voucherTitle =
      voucherToDelete?.voucher_code || voucherToDelete?.id || "este voucher";

    await confirmDelete({
      title: "Confirmar Eliminación de Voucher",
      message: `¿Está seguro que desea eliminar el voucher "${voucherTitle}"? Esta acción no se puede deshacer.`,
      confirmText: "Eliminar Voucher",
      onConfirm: async () => {
        try {
          // Marcar como eliminado inmediatamente para que no reaparezca si el
          // refetch posterior trae datos obsoletos de alguna capa de caché.
          recentlyDeletedVoucherIdsRef.current.add(voucherId);

          // Actualización optimista del caché de React Query
          queryClientInstance.setQueryData(
            queryKeys.vouchersVenta.withCotizaciones(),
            (old) => (old || []).filter((v) => v.id !== voucherId),
          );

          const response = await voucherVentaService.deleteVoucher(voucherId);

          if (response && response.success) {
            // Invalidar caches relacionadas para que Comisiones refleje la eliminación
            invalidateCotizacionGraphCache();
            await invalidateComisionesCache();

            // Recargar la lista fresca del backend
            await loadVouchers();

            showSuccess(`Voucher "${voucherTitle}" eliminado exitosamente`);
          } else {
            recentlyDeletedVoucherIdsRef.current.delete(voucherId);
            throw new Error("No se pudo eliminar el voucher");
          }
        } catch (err) {
          recentlyDeletedVoucherIdsRef.current.delete(voucherId);
          console.error("Error al eliminar voucher:", err);
          throw new Error(
            err.message || "Error desconocido al eliminar el voucher",
          );
        }
      },
    });
  };

  // Manejar guardado de voucher (crear o actualizar)
  const handleSaveVoucher = async (voucher) => {
    try {
      // Cerrar modal
      setShowCreateModal(false);
      setShowEditModal(false);
      setSelectedVoucher(null);
      setSelectedCotizacion(null);

      // Invalidar caches relacionadas para que VouchersVenta y Comisiones reflejen los cambios
      invalidateCotizacionGraphCache();
      await invalidateComisionesCache();

      // Recargar la lista fresca del backend para reflejar pagos, montos y estado
      await loadVouchers();

      return true;
    } catch (error) {
      console.error("Error al guardar voucher:", error);
      alert(
        `No se pudo ${selectedVoucher ? "actualizar" : "crear"} el voucher: ${error.message || "Error desconocido"}`,
      );
    }
  };

  // Cerrar modal del selector de cotización
  const handleCloseCotizacionSelector = () => {
    setShowCotizacionSelector(false);
  };

  // Cerrar modal de vista previa
  const handleClosePreviewModal = () => {
    setShowPreviewModal(false);
    setSelectedVoucher(null);
  };

  // Efecto para manejar navegación con estado (desde Cotizaciones)
  useEffect(() => {
    if (location.state) {
      if (location.state.action === "create" && location.state.cotizacionData) {
        setSelectedCotizacion(location.state.cotizacionData);
        setShowCreateModal(true);
      } else if (location.state.action === "edit" && location.state.voucherId) {
        setSelectedVoucher(
          location.state.voucherData || { id: location.state.voucherId },
        );
        setShowEditModal(true);
      }

      // Clear the location state to prevent reopening on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Refrescar la lista cuando se creen/paguen movimientos desde el modal de
  // pagos o desde otras vistas de contabilidad.
  useEffect(() => {
    const handlePaymentChange = () => {
      loadVouchers();
    };

    window.addEventListener("movimientoCreated", handlePaymentChange);
    window.addEventListener("paymentRequestPaid", handlePaymentChange);
    window.addEventListener("paymentRequestCompleted", handlePaymentChange);

    return () => {
      window.removeEventListener("movimientoCreated", handlePaymentChange);
      window.removeEventListener("paymentRequestPaid", handlePaymentChange);
      window.removeEventListener("paymentRequestCompleted", handlePaymentChange);
    };
  }, [loadVouchers]);

  // Build seller list from loaded vouchers
  const sellerOptions = useMemo(() => {
    const map = new Map();
    vouchers.forEach((voucher) => {
      const dni = getVoucherSellerDni(voucher);
      const name = voucher.created_by_name || dni || "Desconocido";
      if (dni && !map.has(dni)) {
        map.set(dni, { dni, name });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [vouchers]);

  // Renderizar lista de vouchers
  return (
    <div className="vouchers-venta-page">
      <div className="vouchers-venta-sticky-top">
        <div className="vouchers-header">
        <div className="vouchers-header__copy">
          <span className="vouchers-header__eyebrow">VENTAS · DOCUMENTOS COMERCIALES</span>
          <h1>Vouchers</h1>
          <p>Emite, consulta y organiza la documentación confirmada de cada venta.</p>
        </div>
        <div className="vouchers-header__actions">
          <div className="vouchers-header__metric">
            <strong>{scopedVouchers.length}</strong>
            <span>registros visibles</span>
          </div>
          <button className="new-voucher-button" onClick={handleNewVoucher}>
            <MdAdd />
            <span>Crear voucher</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <VouchersFilters
        onFilterChange={handleFilterChange}
        onRefresh={loadVouchers}
        sellers={sellerOptions}
      />

        {showSellerScopeTabs && (
          <div className="seller-scope-tabs" role="tablist" aria-label="Alcance de vouchers">
            <button
              type="button"
              className={`seller-scope-tab ${sellerScope === "mine" ? "active" : ""}`}
              onClick={() => setSellerScope("mine")}
            >
              Propios
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
      </div>

      {isLoading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Cargando vouchers...</p>
        </div>
      ) : error ? (
        <div className="error-state">
          <MdWarning className="error-icon" />
          <p>{error}</p>
          <button onClick={loadVouchers} className="retry-button">
            Intentar nuevamente
          </button>
        </div>
      ) : yearGroups.length === 0 ? (
        <div className="empty-state">
          <p>No se encontraron vouchers</p>
        </div>
      ) : (
        <div className="vouchers-container">
          <div className="vouchers-count">
            <span>{scopedVouchers.length} voucher(s) encontrado(s)</span>
          </div>

          {yearGroups.map((yearGroup) => {
            const now = new Date();
            const currentYear = now.getFullYear();
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
                      <MdCalendarToday />
                    </div>
                    <div className="year-title">
                      <span className="year-text">{yearGroup.year}</span>
                      {isYearCurrent && (
                        <span className="year-badge current-year">ACTUAL</span>
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
                      const currentMonth = now.getMonth() + 1;
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
                                <MdCalendarToday />
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
                            <AgencyGroups items={monthGroup.vouchers} agencies={agencies} listClassName="vouchers-sale-list" renderItem={(voucher) => {
                                const roleToPass =
                                  auth?.role !== undefined
                                    ? auth.role
                                    : parseInt(
                                        SecureStorage.getItem("userRole") ||
                                          "1",
                                        10,
                                      );
                                return (
                                  <VoucherCard
                                    key={voucher.id}
                                    voucher={voucher}
                                    dataUpdatedAt={dataUpdatedAt}
                                    onEdit={() => handleEditVoucher(voucher)}
                                    onPreview={() =>
                                      handlePreviewVoucher(voucher)
                                    }
                                    onPreviewPDF={() =>
                                      handlePreviewVoucherPDF(voucher)
                                    } // Vista previa PDF
                                    onDelete={() =>
                                      handleDeleteVoucher(voucher.id)
                                    }
                                    onManagePayments={() =>
                                      handleManagePayments(voucher)
                                    }
                                    onManageDocuments={() =>
                                      handleManageDocuments(voucher)
                                    }
                                    onVoucherMedia={() =>
                                      setVoucherMediaVoucher(voucher)
                                    }
                                    onAgencyPayment={() =>
                                      setAgencyPaymentVoucher(voucher)
                                    }
                                    userRole={roleToPass}
                                    allVouchers={vouchers}
                                  />
                                );
                              }} />
                          )}
                        </section>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Modal para seleccionar cotización */}
      <CotizacionSelectorModal
        isOpen={showCotizacionSelector}
        onClose={handleCloseCotizacionSelector}
        onSelect={handleCotizacionSelect}
      />

      {/* Modal para crear voucher */}
      {showCreateModal && (
        <VoucherModal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedCotizacion(null);
          }}
          onSave={handleSaveVoucher}
          cotizacionData={selectedCotizacion}
          isEditMode={false}
        />
      )}

      {/* Modal para editar voucher */}
      {showEditModal && (
        <VoucherModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedVoucher(null);
            setIsPaymentManagementMode(false); // Reset modo gestión de pagos
            setIsDocumentManagementMode(false); // Reset modo gestión de documentos
          }}
          onSave={handleSaveVoucher}
          voucherData={selectedVoucher}
          cotizacionData={selectedCotizacion}
          isEditMode={true}
          isPaymentManagementMode={isPaymentManagementMode} // Pasar modo gestión de pagos
          isDocumentManagementMode={isDocumentManagementMode} // Pasar modo gestión de documentos
        />
      )}

      {/* Modal para previsualizar voucher */}
      {showPreviewModal && (
        <VentasSummaryModal
          isOpen={showPreviewModal}
          onClose={handleClosePreviewModal}
          voucher={selectedVoucher}
        />
      )}

      {showPDFPreviewModal && (
        <VentasSummaryPDFModal
          isOpen={showPDFPreviewModal}
          onClose={() => {
            setShowPDFPreviewModal(false);
            setSelectedVoucher(null);
          }}
          voucher={selectedVoucher}
          isPDFView={true} // Indicar que es vista PDF
          onVoucherUpdated={handlePdfVoucherUpdated}
        />
      )}

      {agencyPaymentVoucher && (
        <AgencyPaymentReportModal
          isOpen={Boolean(agencyPaymentVoucher)}
          onClose={() => setAgencyPaymentVoucher(null)}
          cotizacionId={agencyPaymentVoucher.cotizacion_id || getVoucherCotizacion(agencyPaymentVoucher)?.id}
          voucherCode={agencyPaymentVoucher.voucher_code}
          initialCotizacion={getVoucherCotizacion(agencyPaymentVoucher)}
        />
      )}

      {voucherMediaVoucher && (() => {
        const quote = getVoucherCotizacion(voucherMediaVoucher) || {};
        const role = Number(auth?.role ?? SecureStorage.getItem("userRole") ?? -1);
        const quoteOwner = normalizeIdentifier(
          quote.createdby || quote.created_by || quote.createdBy,
        );
        const canManageMedia =
          [0, 1, 3].includes(role) ||
          (role === 2 && quoteOwner === normalizeIdentifier(currentSellerDni));
        return (
          <VoucherMediaManagerModal
            isOpen
            onClose={() => setVoucherMediaVoucher(null)}
            cotizacionId={voucherMediaVoucher.cotizacion_id || quote.id}
            voucherCode={voucherMediaVoucher.voucher_code}
            quotationTitle={quote.titulo}
            initialMedia={quote.source_voucher || quote.sourceVoucher}
            canManage={canManageMedia}
            uploadedBy={currentSellerDni}
            onChanged={async () => {
              await loadVouchers();
            }}
          />
        );
      })()}

      {/* Modal de confirmación */}
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

      {/* Notificación toast */}
      <NotificationToast
        isVisible={notification.isVisible}
        message={notification.message}
        type={notification.type}
        duration={notification.duration}
        onClose={closeNotification}
      />
    </div>
  );
};

export default VouchersVenta;
