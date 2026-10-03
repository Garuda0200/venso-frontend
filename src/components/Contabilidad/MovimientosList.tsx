import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "react-toastify";
import {
  FaEdit,
  FaFilter,
  FaSearch,
  FaCalendar,
  FaFileAlt,
  FaImage,
} from "react-icons/fa"; // Añadido FaFileAlt, FaImage
import {
  MdVisibility,
  MdAttachFile,
  MdDelete,
  MdWarning,
} from "react-icons/md";import DatePicker from "react-datepicker";
import MovimientoPreviewModal from "./MovimientoPreviewModal";
import MovimientoForm from "./MovimientoForm";
import { getProxyUrl } from "../../services/presignedUrlService";
import vouchersPagosService from "../../services/vouchersPagosService"; // Cargar evidencias
import contabilidadService from "../../services/contabilidadService"; // Para eliminar movimientos
import "./MovimientosList.scss";

// Helper para formatear tipo de cuenta
const formatTipoCuenta = (tipo) => {
  const tipoLabelMap = {
    efectivo: "Efectivo",
    cuenta_debito: "Cuenta Débito",
    cuenta_credito: "Cuenta Crédito",
    cuenta: "Cuenta Débito", // Legacy
    global66: "Global66",
    paypal: "PayPal",
    western_union: "Western Union",
    wetravel: "WeTravel",
  };
  return (
    tipoLabelMap[tipo] ||
    (tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : tipo)
  );
};

const MovimientosList = ({
  movimientos,
  tipo,
  showTipoColumn = false,
  refreshData,
  compact = false,
  showFilters = true,
  showTotals = true,
}) => {
  const tipoMovimiento = tipo.toLowerCase(); // 'ingreso', 'egreso', o 'todos'
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMoneda, setFilterMoneda] = useState("");
  const [filterMes, setFilterMes] = useState("");
  const [filterContextoPago, setFilterContextoPago] = useState("");
  const [filterFechaInicio, setFilterFechaInicio] = useState(null);
  const [filterFechaFin, setFilterFechaFin] = useState(null);

  // Estados para el modal de previsualización
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedMovimiento, setSelectedMovimiento] = useState(null);

  // Estados para el modal de edición
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMovimiento, setEditingMovimiento] = useState(null);

  // Estados para el modal de evidencias
  const [showEvidenciaModal, setShowEvidenciaModal] = useState(false);
  const [selectedEvidencia, setSelectedEvidencia] = useState(null);
  const [evidenciasWithProxyUrls, setEvidenciasWithProxyUrls] = useState([]);
  const [loadingProxyUrls, setLoadingProxyUrls] = useState(false);
  const [pendingDeleteMovimiento, setPendingDeleteMovimiento] = useState(null);
  const [deletingMovimientoId, setDeletingMovimientoId] = useState(null);

  // Estado para contador de evidencias desde vouchers_pagos
  const [evidenciasCounts, setEvidenciasCounts] = useState({});

  // Cargar conteo de evidencias desde vouchers_pagos para cada movimiento
  useEffect(() => {
    loadEvidenciasCounts();
  }, [movimientos]);

  const loadEvidenciasCounts = async () => {
    const counts = {};

    await Promise.all(
      movimientos.map(async (mov) => {
        try {
          // Detectar si es una liquidación
          const esLiquidacion =
            mov?.contexto_pago?.tipo === "LiquidacionServicioProveedor";
          let result;

          if (esLiquidacion && mov?.liq_movimiento_id) {
            // Para liquidaciones: contar 1 evidencia (el voucher_pago referenciado)
            result = await vouchersPagosService.getById(mov.liq_movimiento_id);
            counts[mov.id] = result.success && result.data ? 1 : 0;
          } else {
            // Para pagos normales: contar por movimiento_id
            result = await vouchersPagosService.getByMovimientoId(mov.id);
            counts[mov.id] =
              result.success && result.data ? result.data.length : 0;
          }
        } catch (error) {
          console.error(
            `Error loading evidencias count for movimiento ${mov.id}:`,
            error,
          );
          counts[mov.id] = 0;
        }
      }),
    );

    setEvidenciasCounts(counts);
  };

  // Efecto para cargar evidencias desde vouchers_pagos cuando se abre el modal
  useEffect(() => {
    if (showEvidenciaModal && selectedEvidencia?.id) {
      loadEvidenciasFromVouchersPagos();
    }
  }, [showEvidenciaModal, selectedEvidencia]);

  const loadEvidenciasFromVouchersPagos = async () => {
    setLoadingProxyUrls(true);
    try {
      console.log(
        " Cargando evidencias para movimiento ID:",
        selectedEvidencia.id,
      );

      // Detectar si es una liquidación
      const esLiquidacion =
        selectedEvidencia?.contexto_pago?.tipo ===
        "LiquidacionServicioProveedor";
      let result;

      if (esLiquidacion && selectedEvidencia?.liq_movimiento_id) {
        // Para liquidaciones: buscar evidencia por el ID del voucher_pago referenciado
        console.log(
          " [MovimientosList] Es liquidación - Buscando evidencia con ID:",
          selectedEvidencia.liq_movimiento_id,
        );
        result = await vouchersPagosService.getById(
          selectedEvidencia.liq_movimiento_id,
        );
        // Convertir a array para mantener compatibilidad
        result = {
          success: result.success,
          data: result.data ? [result.data] : [],
        };
      } else {
        // Para pagos normales: buscar por movimiento_id
        console.log(
          " [MovimientosList] Es pago normal - Buscando por movimiento_id:",
          selectedEvidencia.id,
        );
        result = await vouchersPagosService.getByMovimientoId(
          selectedEvidencia.id,
        );
      }

      if (result.success && result.data && result.data.length > 0) {
        console.log(" Evidencias cargadas:", result.data);

        // Generar proxy URLs para cada evidencia
        const evidenciasWithProxyUrls = result.data.map((ev) => {
          // Usar proxy URL del backend o generar una con getProxyUrl
          const proxyUrl =
            ev.proxy_url || (ev.tigris_url ? getProxyUrl(ev.tigris_url) : null);

          return {
            filename: ev.filename,
            type: ev.file_type,
            size: ev.file_size,
            tigrisUrl: ev.tigris_url,
            proxyUrl: proxyUrl,
            uploaded_at: ev.created_at,
          };
        });

        setEvidenciasWithProxyUrls(evidenciasWithProxyUrls);
      } else {
        console.log(" No se encontraron evidencias para el movimiento");
        setEvidenciasWithProxyUrls([]);
      }
    } catch (error) {
      console.error(" Error loading evidencias from vouchers_pagos:", error);
      setEvidenciasWithProxyUrls([]);
    } finally {
      setLoadingProxyUrls(false);
    }
  };

  const handleEdit = (movimiento) => {
    console.log(" Abriendo edición de movimiento:", movimiento);
    setEditingMovimiento(movimiento);
    setShowEditModal(true);
  };

  const handleCloseEdit = () => {
    setShowEditModal(false);
    setEditingMovimiento(null);
  };

  const handleEditSuccess = () => {
    handleCloseEdit();
    if (refreshData) refreshData();
  };

  const handleDelete = (movimiento) => {
    setPendingDeleteMovimiento((current) =>
      current?.id === movimiento.id ? null : movimiento,
    );
  };

  const handleCancelDelete = () => {
    if (deletingMovimientoId) return;
    setPendingDeleteMovimiento(null);
  };

  const handleConfirmDelete = async () => {
    const movimiento = pendingDeleteMovimiento;
    if (!movimiento) return;

    setDeletingMovimientoId(movimiento.id);
    try {
      console.log(" Eliminando movimiento:", movimiento.id);
      const result = await contabilidadService.deleteMovimiento(movimiento.id);

      if (!result.success) {
        toast.error(`Error al eliminar el ${tipoMovimiento}: ${result.error}`);
        return;
      }

      toast.success(
        `${tipoMovimiento === "ingreso" ? "Ingreso" : "Egreso"} eliminado correctamente`,
      );

      setPendingDeleteMovimiento(null);
      if (refreshData) refreshData();
    } catch (error) {
      console.error(" Error al eliminar movimiento:", error);
      toast.error(`Error al eliminar el ${tipoMovimiento}`);
    } finally {
      setDeletingMovimientoId(null);
    }
  };
  const handlePreview = (movimiento) => {
    console.log(" Abriendo vista previa:", movimiento);
    setSelectedMovimiento(movimiento);
    setShowPreviewModal(true);
  };

  const handleClosePreview = () => {
    setShowPreviewModal(false);
    setSelectedMovimiento(null);
  };

  // Handlers para evidencias
  const handleViewEvidencia = (movimiento) => {
    console.log(" Abriendo evidencia:", movimiento);
    setSelectedEvidencia(movimiento);
    setShowEvidenciaModal(true);
  };

  const handleCloseEvidencia = () => {
    setShowEvidenciaModal(false);
    setSelectedEvidencia(null);
  };

  // Aplicar filtros
  const filteredMovimientos = movimientos.filter((m) => {
    // Filtro por tipo (ingreso/egreso) - solo si no es "todos"
    if (
      tipoMovimiento !== "todos" &&
      m.tipo_movimiento.toLowerCase() !== tipoMovimiento
    )
      return false;

    // Filtro por término de búsqueda
    if (
      searchTerm &&
      !m.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
    )
      return false;

    // Filtro por moneda
    if (filterMoneda && m.moneda !== filterMoneda) return false;

    // Filtro por mes
    if (filterMes && m.mes !== parseInt(filterMes)) return false;

    // Filtro por contexto de pago
    if (filterContextoPago) {
      const contextoPagoValue =
        typeof m.contexto_pago === "object"
          ? m.contexto_pago?.tipo
          : m.contexto_pago;
      if (contextoPagoValue !== filterContextoPago) return false;
    }

    // Filtro por rango de fechas
    if (filterFechaInicio && filterFechaFin) {
      const fecha = new Date(m.fecha);
      return fecha >= filterFechaInicio && fecha <= filterFechaFin;
    }

    return true;
  });

  const resetFilters = () => {
    setSearchTerm("");
    setFilterMoneda("");
    setFilterMes("");
    setFilterContextoPago("");
    setFilterFechaInicio(null);
    setFilterFechaFin(null);
  };

  const formatFecha = (fecha) => {
    return format(new Date(fecha), "dd MMMM yyyy", { locale: es });
  };

  // Totales separados por moneda
  const totalSoles = filteredMovimientos
    .filter((m) => m.moneda?.toLowerCase().includes("sol"))
    .reduce((sum, mov) => sum + parseFloat(mov.monto || 0), 0);

  const totalDolares = filteredMovimientos
    .filter(
      (m) =>
        m.moneda?.toLowerCase().includes("dolar") ||
        m.moneda?.toLowerCase().includes("usd"),
    )
    .reduce((sum, mov) => sum + parseFloat(mov.monto || 0), 0);

  // Helper para nombre del mes
  const getNombreMes = (mes) => {
    const meses = [
      "Enero",
      "Febrero",
      "Marzo",
      "Abril",
      "Mayo",
      "Junio",
      "Julio",
      "Agosto",
      "Septiembre",
      "Octubre",
      "Noviembre",
      "Diciembre",
    ];
    return meses[mes - 1];
  };

  return (
    <div className={`movimientos-list ${tipoMovimiento} ${compact ? "movimientos-list--compact" : ""}`}>
      <div className="list-header">
        <h5 className="list-title">
          {tipoMovimiento === "todos" ? "Movimientos" : `Listado de ${tipoMovimiento === "ingreso" ? "Ingresos" : "Egresos"}`}
        </h5>
        <span className="badge">Total: {filteredMovimientos.length}</span>
      </div>
      <div className="list-body">
        {/* Filtros */}
        {showFilters && <div className="filter-card">
          <div className="filter-grid">
            <div className="filter-group">
              <label>
                <FaSearch /> Buscar
              </label>
              <input
                type="text"
                placeholder="Buscar por descripción"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>
                <FaFilter /> Moneda
              </label>
              <select
                value={filterMoneda}
                onChange={(e) => setFilterMoneda(e.target.value)}
              >
                <option value="">Todas</option>
                <option value="soles">Soles</option>
                <option value="dolares">Dólares</option>
              </select>
            </div>

            <div className="filter-group">
              <label>
                <FaFilter /> Mes
              </label>
              <select
                value={filterMes}
                onChange={(e) => setFilterMes(e.target.value)}
              >
                <option value="">Todos</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((mes) => (
                  <option key={mes} value={mes}>
                    {getNombreMes(mes)}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>
                <FaFilter /> Contexto Pago
              </label>
              <select
                value={filterContextoPago}
                onChange={(e) => setFilterContextoPago(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="ServiciosVoucherReserva">
                  Servicios Voucher Reserva
                </option>
              </select>
            </div>

            <div className="filter-group">
              <label>
                <FaCalendar /> Rango de Fechas
              </label>
              <div className="date-range">
                <DatePicker
                  selected={filterFechaInicio}
                  onChange={(date) => setFilterFechaInicio(date)}
                  dateFormat="dd/MM/yyyy"
                  locale={es}
                  className="custom-datepicker"
                  placeholderText="Fecha inicio"
                  isClearable
                />
                <span className="date-separator">-</span>
                <DatePicker
                  selected={filterFechaFin}
                  onChange={(date) => setFilterFechaFin(date)}
                  dateFormat="dd/MM/yyyy"
                  locale={es}
                  className="custom-datepicker"
                  placeholderText="Fecha fin"
                  minDate={filterFechaInicio}
                  isClearable
                  disabled={!filterFechaInicio}
                />
              </div>
            </div>
          </div>
          <div className="filter-actions">
            <button className="btn-reset" onClick={resetFilters}>
              Limpiar Filtros
            </button>
          </div>
        </div>}

        {/* Tabla */}
        <div className="table-container">
          <table className="movimientos-table">
            <thead>
              <tr>
                {showTipoColumn && <th>Tipo</th>}
                <th>Descripción</th>
                <th>Fecha</th>
                <th>Tipo Cuenta</th>
                <th>Monto</th>
                <th>Contexto Pago</th>
                <th>Creado Por</th>
                <th>Plataforma</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredMovimientos.length > 0 ? (
                filteredMovimientos.map((movimiento) => (
                  <tr key={movimiento.id}>
                    {showTipoColumn && (
                      <td>
                        <span
                          className={`badge tipo-movimiento ${movimiento.tipo_movimiento.toLowerCase()}`}
                        >
                          {movimiento.tipo_movimiento === "ingreso"
                            ? " Ingreso"
                            : " Egreso"}
                        </span>
                      </td>
                    )}
                    <td>{movimiento.descripcion}</td>
                    <td>{formatFecha(movimiento.fecha)}</td>
                    <td>
                      <span className="badge tipo-cuenta">
                        {formatTipoCuenta(movimiento.tipo_cuenta)}
                      </span>
                    </td>
                    <td className="monto-cell">
                      <div className="monto-wrapper">
                        <span className={`moneda-badge ${movimiento.moneda}`}>
                          {movimiento.moneda === "soles" ? "S/" : "US$"}
                        </span>
                        <span className="monto-value">
                          {parseFloat(movimiento.monto).toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td>
                      {movimiento.contexto_pago || movimiento.voucher_code ? (
                        <div className="contexto-pago-wrapper">
                          {/* Icon Indicator */}
                          <div className="contexto-icon">
                            {movimiento.contexto_pago?.tipo ===
                              "ServiciosVoucherReserva" && ""}
                            {movimiento.contexto_pago?.tipo ===
                              "ServiciosVoucherVenta" && ""}
                            {movimiento.contexto_pago?.tipo ===
                              "TransferenciaInterna" && ""}
                            {movimiento.contexto_pago?.tipo ===
                              "PagoProveedor" && ""}
                            {(!movimiento.contexto_pago?.tipo ||
                              ![
                                "ServiciosVoucherReserva",
                                "ServiciosVoucherVenta",
                                "TransferenciaInterna",
                                "PagoProveedor",
                              ].includes(movimiento.contexto_pago?.tipo)) &&
                              ""}
                          </div>

                          {/* Content Stack */}
                          <div className="contexto-content">
                            {movimiento.contexto_pago && (
                              <div className="contexto-tipo">
                                {typeof movimiento.contexto_pago === "object"
                                  ? movimiento.contexto_pago.tipo
                                  : movimiento.contexto_pago}
                              </div>
                            )}
                            {(() => {
                              // Mostrar voucher_code from movimiento directly or from contexto_pago
                              let displayCode =
                                movimiento.voucher_code ||
                                movimiento.contexto_pago?.voucher_code ||
                                null;

                              return displayCode ? (
                                <div className="contexto-codigo">
                                  {displayCode}
                                </div>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td>
                      <span
                        className="text-small text-muted"
                        title={movimiento.created_by || "Sistema"}
                      >
                        {movimiento.creator_name ||
                          movimiento.created_by ||
                          "Sistema"}
                      </span>
                    </td>
                    <td>
                      <div className="platform-badge-wrapper">
                        <span
                          className={`platform-badge ${(movimiento.platform || "venso").toLowerCase()}`}
                        >
                          {(movimiento.platform || "venso").toUpperCase()}
                        </span>
                        <span
                          className={`business-type-badge ${(movimiento.business_type || "B2C").toLowerCase()}`}
                        >
                          {movimiento.business_type || "B2C"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="actions">
                        {/* Botón de evidencias desde vouchers_pagos */}
                        {evidenciasCounts[movimiento.id] > 0 && (
                          <button
                            className="btn-action evidencia"
                            onClick={() => handleViewEvidencia(movimiento)}
                            title={`Ver ${evidenciasCounts[movimiento.id]} evidencia(s)`}
                          >
                            <FaImage />
                            <span className="badge-count">
                              {evidenciasCounts[movimiento.id]}
                            </span>
                          </button>
                        )}
                        <button
                          className="btn-action preview"
                          onClick={() => handlePreview(movimiento)}
                          title="Previsualizar movimiento"
                        >
                          <MdVisibility />
                        </button>
                        <button
                          className="btn-action edit"
                          onClick={() => handleEdit(movimiento)}
                          title="Editar movimiento"
                        >
                          <FaEdit />
                        </button>
                        <div className="delete-movement-wrapper">
                          <button
                            className={`btn-action delete ${
                              pendingDeleteMovimiento?.id === movimiento.id
                                ? "active"
                                : ""
                            }`}
                            onClick={() => handleDelete(movimiento)}
                            title="Eliminar movimiento"
                            disabled={deletingMovimientoId === movimiento.id}
                          >
                            <MdDelete />
                          </button>
                          {pendingDeleteMovimiento?.id === movimiento.id && (
                            <div className="delete-movement-popover">
                              <div className="delete-movement-popover__header">
                                <MdWarning className="delete-movement-popover__icon" />
                                <span>Eliminar movimiento</span>
                              </div>
                              <p className="delete-movement-popover__text">
                                {movimiento.descripcion || "Sin descripción"}
                              </p>
                              <div className="delete-movement-popover__amount">
                                {movimiento.moneda} {movimiento.monto}
                              </div>
                              <div className="delete-movement-popover__actions">
                                <button
                                  className="delete-movement-popover__cancel"
                                  onClick={handleCancelDelete}
                                  disabled={
                                    deletingMovimientoId === movimiento.id
                                  }
                                >
                                  Cancelar
                                </button>
                                <button
                                  className="delete-movement-popover__confirm"
                                  onClick={handleConfirmDelete}
                                  disabled={
                                    deletingMovimientoId === movimiento.id
                                  }
                                >
                                  <MdDelete />
                                  {deletingMovimientoId === movimiento.id
                                    ? "Eliminando..."
                                    : "Eliminar"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="empty-message">
                    No hay{" "}
                    {tipoMovimiento === "ingreso" ? "ingresos" : "egresos"}{" "}
                    registrados que coincidan con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
            {showTotals && <tfoot>
              <tr>
                <th colSpan="4" className="total-label">
                  Totales:
                </th>
                <th className="total-monto">
                  {totalSoles > 0 && (
                    <div className="total-item soles">
                      <span className="label">Soles:</span>
                      <span className="value">S/ {totalSoles.toFixed(2)}</span>
                    </div>
                  )}
                  {totalDolares > 0 && (
                    <div className="total-item dolares">
                      <span className="label">Dólares:</span>
                      <span className="value">
                        US$ {totalDolares.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {totalSoles === 0 && totalDolares === 0 && (
                    <span className="text-muted">S/ 0.00</span>
                  )}
                </th>
                <th></th>
              </tr>
            </tfoot>}
          </table>
        </div>
      </div>

      {/* Modal de Previsualización */}
      <MovimientoPreviewModal
        isOpen={showPreviewModal}
        onClose={handleClosePreview}
        movimiento={selectedMovimiento}
      />

      {/* Modal de Edición */}
      <MovimientoForm
        tipo={tipo}
        isOpen={showEditModal}
        onClose={handleCloseEdit}
        onSuccess={handleEditSuccess}
        initialData={editingMovimiento}
        mode="edit"
      />

      {/* Modal de Evidencias */}
      {showEvidenciaModal && selectedEvidencia && (
        <div className="evidencia-modal-overlay" onClick={handleCloseEvidencia}>
          <div className="evidencia-modal" onClick={(e) => e.stopPropagation()}>
            <div className="evidencia-modal-header">
              <h3>Evidencias - {selectedEvidencia.descripcion}</h3>
              <button className="close-btn" onClick={handleCloseEvidencia}>
                ×
              </button>
            </div>
            <div className="evidencia-modal-body">
              {loadingProxyUrls ? (
                <div className="loading-evidencias">
                  <p>Cargando evidencias...</p>
                </div>
              ) : (
                (() => {
                  const evidencias = evidenciasWithProxyUrls;
                  console.log(" Evidencias con proxy URLs:", evidencias);

                  if (evidencias.length === 0) {
                    return (
                      <div className="no-evidencia">
                        <MdAttachFile className="no-evidencia-icon" />
                        <p>No hay evidencias disponibles</p>
                      </div>
                    );
                  }

                  // Si hay múltiples evidencias, mostrarlas en grid
                  if (evidencias.length > 1) {
                    return (
                      <div className="evidencias-grid">
                        {evidencias.map((ev, index) => {
                          console.log(` Evidencia ${index}:`, ev);
                          const isPDF =
                            ev.type === "application/pdf" ||
                            ev.tigrisUrl?.toLowerCase().endsWith(".pdf");
                          // Usar proxy URL para evitar CORS/ad-blockers
                          const fileUrl = ev.tigrisUrl
                            ? getProxyUrl(ev.tigrisUrl)
                            : ev.proxyUrl;
                          return (
                            <div key={index} className="evidencia-item">
                              <div className="evidencia-preview">
                                {isPDF ? (
                                  <div className="pdf-placeholder-small">
                                    <FaFileAlt size={40} />
                                    <span>PDF</span>
                                  </div>
                                ) : (
                                  <img
                                    src={fileUrl}
                                    alt={
                                      ev.filename || `Evidencia ${index + 1}`
                                    }
                                    className="image-preview-small"
                                    onLoad={() =>
                                      console.log(` Imagen ${index} cargada`)
                                    }
                                    onError={(e) =>
                                      console.error(
                                        ` Error cargando imagen ${index}:`,
                                        e,
                                      )
                                    }
                                  />
                                )}
                              </div>
                              <div className="evidencia-info">
                                <span className="file-name" title={ev.filename}>
                                  {ev.filename || `Archivo ${index + 1}`}
                                </span>
                                <a
                                  href={fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn-download-small"
                                >
                                  Abrir
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  // Si solo hay una evidencia, mostrarla en grande
                  const ev = evidencias[0];
                  console.log(" Evidencia única:", ev);
                  const isPDF =
                    ev.type === "application/pdf" ||
                    ev.tigrisUrl?.toLowerCase().endsWith(".pdf");
                  // Usar proxy URL para evitar CORS/ad-blockers
                  const fileUrl = ev.tigrisUrl
                    ? getProxyUrl(ev.tigrisUrl)
                    : ev.proxyUrl;
                  return (
                    <>
                      {isPDF ? (
                        <div className="pdf-preview-large">
                          <FaFileAlt size={80} />
                          <span className="pdf-label">Documento PDF</span>
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-view-pdf"
                          >
                            Ver PDF
                          </a>
                        </div>
                      ) : (
                        <img
                          src={fileUrl}
                          alt={ev.filename}
                          className="image-preview"
                          onLoad={() => console.log(" Imagen única cargada")}
                          onError={(e) =>
                            console.error(" Error cargando imagen única:", e)
                          }
                        />
                      )}
                      <div className="evidencia-modal-footer">
                        <span className="file-info">{ev.filename}</span>
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-download"
                        >
                          Descargar
                        </a>
                      </div>
                    </>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MovimientosList;
