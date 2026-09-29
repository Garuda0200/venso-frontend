import React, { useState, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import {
  FaExchangeAlt,
  FaHistory,
  FaSearch,
  FaFilter,
  FaChevronDown,
  FaChevronUp,
  FaTrash,
  FaCalendarAlt,
  FaArrowRight,
  FaSync,
  FaPaperclip,
  FaEye,
  FaUpload,
  FaSpinner,
  FaFileImage,
  FaFilePdf,
  FaWallet,
  FaUniversity,
  FaCreditCard,
  FaGlobe,
} from "react-icons/fa";
import { useAuth } from "../../context/AuthContext";
import contabilidadService from "../../services/contabilidadService";
import { getProxyUrl } from "../../services/presignedUrlService";
import ImagePreviewModal from "./shared/ImagePreviewModal";
import "./TransferenciasHistorial.scss";

// Configuración de iconos y colores por tipo de cuenta (usando paleta del proyecto)
const TIPO_CUENTA_CONFIG = {
  efectivo: {
    label: "Efectivo",
    icon: FaWallet,
    color: "#1cc88a", // $success
    bgLight: "#e6f7ef",
  },
  cuenta_debito: {
    label: "Cuenta Débito",
    icon: FaUniversity,
    color: "#02522f", // $primary
    bgLight: "#e8f5ee",
  },
  cuenta_credito: {
    label: "Cuenta Crédito",
    icon: FaCreditCard,
    color: "#858796", // $secondary
    bgLight: "#f4f4f6",
  },
  paypal: {
    label: "PayPal",
    icon: FaGlobe,
    color: "#f6c23e", // $warning
    bgLight: "#fef8e7",
  },
  western_union: {
    label: "Western Union",
    icon: FaExchangeAlt,
    color: "#e74a3b", // $danger
    bgLight: "#fde8e6",
  },
};

// Helper para obtener configuración de tipo de cuenta
const getTipoCuentaConfig = (tipo) => {
  return (
    TIPO_CUENTA_CONFIG[tipo] || {
      label: tipo || "Cuenta",
      icon: FaWallet,
      color: "#64748b",
      bgLight: "#f1f5f9",
    }
  );
};

const TransferenciasHistorial = ({ refreshTrigger }) => {
  const { auth } = useAuth();
  const isSuperAdmin = auth?.role === 0;

  const [transferencias, setTransferencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCambioMoneda, setFilterCambioMoneda] = useState("todos"); // 'todos' | 'si' | 'no'
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [uploadingMedia, setUploadingMedia] = useState(null); // ID de transferencia subiendo
  const [loadingPreview, setLoadingPreview] = useState(null); // ID de transferencia cargando preview
  const [deletingMedia, setDeletingMedia] = useState(null); // ID de transferencia eliminando media

  // Estado para modal de preview
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState({
    url: null,
    filename: null,
    fileType: null,
  });

  // Cargar transferencias
  const loadTransferencias = async () => {
    setLoading(true);
    try {
      const response = await contabilidadService.getTransferenciasWithSaldos();
      if (response.success) {
        setTransferencias(response.data || []);
      }
    } catch (error) {
      toast.error(`Error al cargar transferencias: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransferencias();
  }, [refreshTrigger]);

  // Filtrar transferencias
  const transferenciasFiltradas = useMemo(() => {
    return transferencias.filter((item) => {
      const t = item.transferencia; // La transferencia está anidada

      // Filtro por búsqueda
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchDescripcion = t?.descripcion?.toLowerCase().includes(search);
        const matchOrigen = item.saldo_origen?.tipo_cuenta
          ?.toLowerCase()
          .includes(search);
        const matchDestino = item.saldo_destino?.tipo_cuenta
          ?.toLowerCase()
          .includes(search);
        if (!matchDescripcion && !matchOrigen && !matchDestino) {
          return false;
        }
      }

      // Filtro por cambio de moneda
      if (filterCambioMoneda === "si" && !t?.es_cambio_moneda) return false;
      if (filterCambioMoneda === "no" && t?.es_cambio_moneda) return false;

      return true;
    });
  }, [transferencias, searchTerm, filterCambioMoneda]);

  // Helper para etiqueta de tipo
  const getTipoLabel = (tipo) => {
    const labels = {
      efectivo: "Efectivo",
      cuenta_debito: "Cuenta Débito",
      cuenta_credito: "Cuenta Crédito",
      global66: "Global66",
      paypal: "PayPal",
      western_union: "Western Union",
      wetravel: "WeTravel",
    };
    return labels[tipo] || tipo;
  };

  // Formatear fecha
  const formatFecha = (fecha) => {
    const date = new Date(fecha);
    return date.toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Formatear monto
  const formatMonto = (monto, moneda) => {
    const num = parseFloat(monto || 0).toFixed(2);
    return moneda === "soles" ? `S/ ${num}` : `$ ${num}`;
  };

  // Eliminar transferencia (solo superadmin)
  const handleDelete = async (id) => {
    if (!isSuperAdmin) {
      toast.error("Solo el superadmin puede eliminar transferencias");
      return;
    }

    try {
      const response = await contabilidadService.deleteTransferencia(id);
      if (response.success) {
        toast.success("Transferencia eliminada y saldos revertidos");
        setConfirmDelete(null);
        loadTransferencias();
      } else {
        toast.error(response.message || "Error al eliminar transferencia");
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`);
    }
  };

  // Subir evidencia
  const handleUploadMedia = async (transferenciaId, file) => {
    setUploadingMedia(transferenciaId);
    try {
      const response = await contabilidadService.uploadTransferenciaMedia(
        transferenciaId,
        file,
      );
      if (response.success) {
        toast.success("Evidencia subida correctamente");
        loadTransferencias();
      } else {
        toast.error(response.message || "Error al subir evidencia");
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setUploadingMedia(null);
    }
  };

  // Ver evidencia (en modal, no en nueva pestaña)
  const handlePreviewMedia = async (transferencia) => {
    const t = transferencia;
    if (!t.media_tigris_url) {
      toast.warning("Esta transferencia no tiene evidencia adjunta");
      return;
    }

    setLoadingPreview(t.id);
    try {
      // Usar proxy URL para evitar problemas de CORS/ad-blockers
      const url = t.media_tigris_url ? getProxyUrl(t.media_tigris_url) : null;

      if (url) {
        setPreviewData({
          url: url,
          filename: t.media_filename,
          fileType: t.media_file_type,
        });
        setShowPreviewModal(true);
      }
    } catch (error) {
      toast.error("Error al obtener URL de visualización");
    } finally {
      setLoadingPreview(null);
    }
  };

  // Cerrar modal de preview
  const handleClosePreviewModal = () => {
    setShowPreviewModal(false);
    setPreviewData({ url: null, filename: null, fileType: null });
  };

  // Eliminar evidencia
  const handleDeleteMedia = async (transferenciaId) => {
    setDeletingMedia(transferenciaId);
    try {
      const response =
        await contabilidadService.deleteTransferenciaMedia(transferenciaId);
      if (response.success) {
        toast.success("Evidencia eliminada correctamente");
        loadTransferencias();
      } else {
        toast.error(response.message || "Error al eliminar evidencia");
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setDeletingMedia(null);
    }
  };

  // Helper para icono de archivo
  const getFileIcon = (fileType) => {
    if (fileType?.includes("pdf"))
      return <FaFilePdf className="file-icon pdf" />;
    return <FaFileImage className="file-icon image" />;
  };

  return (
    <div className="transferencias-historial">
      {/* Header colapsable */}
      <div className="historial-header" onClick={() => setExpanded(!expanded)}>
        <div className="header-left">
          <FaHistory className="header-icon" />
          <h4>Historial de Transferencias</h4>
          <span className="count-badge">{transferenciasFiltradas.length}</span>
        </div>
        <button className="expand-btn">
          {expanded ? <FaChevronUp /> : <FaChevronDown />}
        </button>
      </div>

      {/* Contenido expandible */}
      {expanded && (
        <div className="historial-content">
          {/* Barra de filtros */}
          <div className="filters-bar">
            <div className="search-box">
              <FaSearch className="search-icon" />
              <input
                type="text"
                placeholder="Buscar por descripción o tipo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <FaFilter className="filter-icon" />
              <select
                value={filterCambioMoneda}
                onChange={(e) => setFilterCambioMoneda(e.target.value)}
              >
                <option value="todos">Todas las transferencias</option>
                <option value="si">Con cambio de moneda</option>
                <option value="no">Sin cambio de moneda</option>
              </select>
            </div>

            <button
              className="btn-refresh"
              onClick={loadTransferencias}
              disabled={loading}
            >
              <FaSync className={loading ? "spin" : ""} />
            </button>
          </div>

          {/* Lista de transferencias */}
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <span>Cargando transferencias...</span>
            </div>
          ) : transferenciasFiltradas.length === 0 ? (
            <div className="empty-state">
              <FaExchangeAlt className="empty-icon" />
              <p>No hay transferencias registradas</p>
            </div>
          ) : (
            <div className="transferencias-list">
              {transferenciasFiltradas.map((item) => {
                // Desestructurar la estructura anidada del backend
                const t = item.transferencia;
                const saldoOrigen = item.saldo_origen;
                const saldoDestino = item.saldo_destino;

                return (
                  <div
                    key={t.id}
                    className={`transferencia-item ${t.es_cambio_moneda ? "cambio-moneda" : ""}`}
                  >
                    {/* Columna de fecha */}
                    <div className="col-fecha">
                      <div className="fecha-wrapper">
                        <FaCalendarAlt className="fecha-icon" />
                        <span>{formatFecha(t.fecha_transferencia)}</span>
                      </div>
                    </div>

                    {/* Flujo de transferencia */}
                    <div className="col-flow">
                      {/* Origen */}
                      {(() => {
                        const configOrigen = getTipoCuentaConfig(
                          saldoOrigen?.tipo_cuenta,
                        );
                        const IconOrigen = configOrigen.icon;
                        return (
                          <div className="account-box origin">
                            <div
                              className="account-icon-wrapper"
                              style={{ backgroundColor: configOrigen.bgLight }}
                            >
                              <IconOrigen
                                className="account-icon"
                                style={{ color: configOrigen.color }}
                              />
                            </div>
                            <div className="account-info">
                              <div className="account-header">
                                <span className="account-type">
                                  {configOrigen.label}
                                </span>
                                <span
                                  className={`currency-badge ${saldoOrigen?.moneda === "soles" ? "soles" : "dolares"}`}
                                >
                                  {saldoOrigen?.moneda === "soles"
                                    ? "🇵🇪 PEN"
                                    : "🇺🇸 USD"}
                                </span>
                              </div>
                              <span className="account-amount negative">
                                -{" "}
                                {formatMonto(
                                  t.monto_origen,
                                  saldoOrigen?.moneda,
                                )}
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Flecha */}
                      <div className="flow-arrow">
                        <FaArrowRight />
                        {t.tasa_cambio && (
                          <span className="tasa-badge" title="Tasa de cambio">
                            TC: {parseFloat(t.tasa_cambio).toFixed(4)}
                          </span>
                        )}
                      </div>

                      {/* Destino */}
                      {(() => {
                        const configDestino = getTipoCuentaConfig(
                          saldoDestino?.tipo_cuenta,
                        );
                        const IconDestino = configDestino.icon;
                        return (
                          <div className="account-box destination">
                            <div
                              className="account-icon-wrapper"
                              style={{ backgroundColor: configDestino.bgLight }}
                            >
                              <IconDestino
                                className="account-icon"
                                style={{ color: configDestino.color }}
                              />
                            </div>
                            <div className="account-info">
                              <div className="account-header">
                                <span className="account-type">
                                  {configDestino.label}
                                </span>
                                <span
                                  className={`currency-badge ${saldoDestino?.moneda === "soles" ? "soles" : "dolares"}`}
                                >
                                  {saldoDestino?.moneda === "soles"
                                    ? "🇵🇪 PEN"
                                    : "🇺🇸 USD"}
                                </span>
                              </div>
                              <span className="account-amount positive">
                                +{" "}
                                {formatMonto(
                                  t.monto_destino,
                                  saldoDestino?.moneda,
                                )}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Descripción */}
                    <div className="col-descripcion">
                      <span>{t.descripcion || "Transferencia interna"}</span>
                    </div>

                    {/* Columna de Evidencia */}
                    <div className="col-evidencia">
                      {t.media_tigris_url ? (
                        // Ya tiene evidencia - mostrar preview y opciones
                        <div className="evidencia-attached">
                          {getFileIcon(t.media_file_type)}
                          <span
                            className="evidencia-filename"
                            title={t.media_filename}
                          >
                            {t.media_filename?.length > 15
                              ? `${t.media_filename.substring(0, 15)}...`
                              : t.media_filename || "Archivo"}
                          </span>
                          <button
                            className="btn-evidencia-preview"
                            onClick={() => handlePreviewMedia(t)}
                            disabled={loadingPreview === t.id}
                            title="Ver evidencia"
                          >
                            {loadingPreview === t.id ? (
                              <FaSpinner className="spin" />
                            ) : (
                              <FaEye />
                            )}
                          </button>
                          <button
                            className="btn-evidencia-delete"
                            onClick={() => handleDeleteMedia(t.id)}
                            disabled={deletingMedia === t.id}
                            title="Eliminar evidencia"
                          >
                            {deletingMedia === t.id ? (
                              <FaSpinner className="spin" />
                            ) : (
                              <FaTrash />
                            )}
                          </button>
                        </div>
                      ) : (
                        // No tiene evidencia - mostrar botón de subida
                        <label
                          className={`btn-upload-evidencia ${uploadingMedia === t.id ? "uploading" : ""}`}
                        >
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            style={{ display: "none" }}
                            onChange={(e) => {
                              if (e.target.files?.[0]) {
                                handleUploadMedia(t.id, e.target.files[0]);
                              }
                            }}
                            disabled={uploadingMedia === t.id}
                          />
                          {uploadingMedia === t.id ? (
                            <>
                              <FaSpinner className="spin" />
                              <span>Subiendo...</span>
                            </>
                          ) : (
                            <>
                              <FaUpload />
                              <span>Subir</span>
                            </>
                          )}
                        </label>
                      )}
                    </div>

                    {/* Acciones (solo superadmin) */}
                    {isSuperAdmin && (
                      <div className="col-actions">
                        {confirmDelete === t.id ? (
                          <div className="confirm-delete">
                            <span>¿Eliminar?</span>
                            <button
                              className="btn-confirm-yes"
                              onClick={() => handleDelete(t.id)}
                            >
                              Sí
                            </button>
                            <button
                              className="btn-confirm-no"
                              onClick={() => setConfirmDelete(null)}
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn-delete"
                            onClick={() => setConfirmDelete(t.id)}
                            title="Eliminar transferencia (revierte saldos)"
                          >
                            <FaTrash />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal de preview de evidencia */}
      <ImagePreviewModal
        isOpen={showPreviewModal}
        onClose={handleClosePreviewModal}
        fileUrl={previewData.url}
        filename={previewData.filename}
        fileType={previewData.fileType}
        loading={loadingPreview !== null}
      />
    </div>
  );
};

export default TransferenciasHistorial;
