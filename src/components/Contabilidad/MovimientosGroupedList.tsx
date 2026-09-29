import React, { useState, useMemo, useCallback } from "react";
import {
  FaChevronDown,
  FaChevronRight,
  FaFilePdf,
  FaPlus,
} from "react-icons/fa";
import {
  MdReceipt,
  MdCardTravel,
  MdAttachFile,
  MdClose,
} from "react-icons/md";
import MovimientosList from "./MovimientosList";
import VentasSummaryModal from "../../pages/Ventas/VouchersVenta/components/VentasSummaryModal/VentasSummaryModal";
import VentasSummaryPDFModal from "../../pages/Ventas/VouchersVenta/components/VentasSummaryPDFModal/VentasSummaryPDFModal";
import ServiceSummaryModal from "../../pages/Reservas/VouchersReserva/components/ServiceSummaryModal/ServiceSummaryModal";
import DocumentsManagerModal from "./DocumentsManagerModal/DocumentsManagerModal";
import { voucherVentaService } from "../../services/voucherVentaService";
import voucherReservaService from "../../services/voucherReservaService";
import "./MovimientosGroupedList.scss";

const MovimientosGroupedList = ({
  movimientos,
  tipo,
  groupBy,
  showTipoColumn = false,
  refreshData,
  onNewMovementForFile,
}) => {
  const [expandedGroups, setExpandedGroups] = useState({});
  const [showVentasSummary, setShowVentasSummary] = useState(false);
  const [showVentasPDFSummary, setShowVentasPDFSummary] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [loadingVoucher, setLoadingVoucher] = useState(false);
  const [showServiceSummary, setShowServiceSummary] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [loadingService, setLoadingService] = useState(false);

  // Estados para modal de documentos
  const [showDocumentsModal, setShowDocumentsModal] = useState(false);
  const [selectedVoucherIdForDocs, setSelectedVoucherIdForDocs] =
    useState(null);
  const [selectedVoucherCodeForDocs, setSelectedVoucherCodeForDocs] =
    useState(null);

  // Estado para menú de acciones
  const [activeActionsMenu, setActiveActionsMenu] = useState(null);

  // Agrupar movimientos según el campo seleccionado
  const groupedMovimientos = useMemo(() => {
    const groups = {};
    const ungrouped = [];

    movimientos.forEach((mov) => {
      if (groupBy === "file") {
        // Usar voucher_code directly from movimiento
        const fileKey = mov.voucher_code;

        // Agrupar por voucher_code + referencia_voucher_venta
        // (todos los movimientos del mismo voucher_venta van juntos)
        const refVoucherVenta = mov.referencia_voucher_venta || "";

        // También guardar si hay referencia a voucher_reserva para mostrar el botón
        const refVoucherReserva = mov.referencia_voucher_reserva || null;

        // Si no hay file, agrupamos por "Sin File Asociado"
        if (!fileKey) {
          const specialKey = refVoucherVenta
            ? `__no_file__::${refVoucherVenta}`
            : "__no_file_no_ref__";

          if (!groups[specialKey]) {
            groups[specialKey] = {
              file: null,
              refVoucherVenta: refVoucherVenta || null,
              refVoucherReserva: null,
              movimientos: [],
              isSpecial: true,
            };
          }
          // Actualizar referencia de reserva si existe
          if (refVoucherReserva && !groups[specialKey].refVoucherReserva) {
            groups[specialKey].refVoucherReserva = refVoucherReserva;
          }
          groups[specialKey].movimientos.push(mov);
        } else {
          // Clave compuesta: file + ref_voucher_venta
          const key = refVoucherVenta
            ? `${fileKey}::${refVoucherVenta}`
            : `${fileKey}::__no_ref__`;

          if (!groups[key]) {
            groups[key] = {
              file: fileKey,
              refVoucherVenta: refVoucherVenta || null,
              refVoucherReserva: null,
              movimientos: [],
              isSpecial: false,
            };
          }
          // Actualizar referencia de reserva si existe
          if (refVoucherReserva && !groups[key].refVoucherReserva) {
            groups[key].refVoucherReserva = refVoucherReserva;
          }
          groups[key].movimientos.push(mov);
        }
      }
    });

    return { groups, ungrouped };
  }, [movimientos, groupBy]);

  // Calcular totales por grupo separados por moneda
  const calculateGroupTotal = (groupMovimientos) => {
    const totalSoles = groupMovimientos
      .filter(
        (mov) =>
          mov.moneda?.toLowerCase()?.includes("sol") ||
          mov.moneda?.toLowerCase() === "pen",
      )
      .reduce((sum, mov) => sum + parseFloat(mov.monto || 0), 0);

    const totalDolares = groupMovimientos
      .filter(
        (mov) =>
          mov.moneda?.toLowerCase()?.includes("dolar") ||
          mov.moneda?.toLowerCase() === "usd",
      )
      .reduce((sum, mov) => sum + parseFloat(mov.monto || 0), 0);

    return { totalSoles, totalDolares };
  };

  // Toggle expansión de grupo
  const toggleGroup = (groupKey) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  // Abrir modal de gestión de documentos
  const handleManageDocuments = (e, refVoucherVenta, voucherCode) => {
    e.stopPropagation();

    if (!refVoucherVenta) return;

    setSelectedVoucherIdForDocs(refVoucherVenta);
    setSelectedVoucherCodeForDocs(voucherCode);
    setShowDocumentsModal(true);
  };

  // Ver detalle del servicio de reserva
  const handleViewServiceSummary = async (e, file, refVoucher) => {
    e.stopPropagation();

    if (!refVoucher) return;

    setLoadingService(true);
    try {
      // El refVoucher es el referencia_voucher_reserva
      // Buscar el voucher de reserva por su ID
      const response =
        await voucherReservaService.getVoucherReservaById(refVoucher);

      if (response.success && response.data) {
        // ServiceSummaryModal espera el voucher de reserva completo
        setSelectedReservation(response.data);
        setShowServiceSummary(true);
      } else {
        console.warn("Voucher de reserva no encontrado para ID:", refVoucher);
      }
    } catch (error) {
      console.error("Error cargando servicio de reserva:", error);
    } finally {
      setLoadingService(false);
    }
  };

  // Ver detalle del voucher de venta
  const handleViewVoucherSummary = async (e, file) => {
    e.stopPropagation(); // Evitar que se expanda/contraiga el grupo

    if (!file) return;

    setLoadingVoucher(true);
    setActiveActionsMenu(null);
    try {
      // El file es el voucher_code, que es igual a referencia_voucher_venta
      // Buscar cualquier movimiento del grupo para obtener la referencia
      const movimiento = movimientos.find((m) => m.voucher_code === file);

      if (movimiento && movimiento.referencia_voucher_venta) {
        // Obtener el voucher por su ID (referencia_voucher_venta)
        const response = await voucherVentaService.getVoucherWithCotizacionById(
          movimiento.referencia_voucher_venta,
        );

        if (response.success && response.data) {
          setSelectedVoucher(response.data);
          setShowVentasSummary(true);
        } else {
          console.warn(
            "Voucher no encontrado para ID:",
            movimiento.referencia_voucher_venta,
          );
        }
      } else {
        console.warn("No se encontró referencia de voucher para file:", file);
      }
    } catch (error) {
      console.error("Error cargando voucher:", error);
    } finally {
      setLoadingVoucher(false);
    }
  };

  // Ver PDF del voucher de venta
  const handleViewVoucherPDF = async (e, file) => {
    e.stopPropagation();

    if (!file) return;

    setLoadingVoucher(true);
    setActiveActionsMenu(null);
    try {
      const movimiento = movimientos.find((m) => m.voucher_code === file);

      if (movimiento && movimiento.referencia_voucher_venta) {
        const response = await voucherVentaService.getVoucherWithCotizacionById(
          movimiento.referencia_voucher_venta,
        );

        if (response.success && response.data) {
          setSelectedVoucher(response.data);
          setShowVentasPDFSummary(true);
        } else {
          console.warn(
            "Voucher no encontrado para ID:",
            movimiento.referencia_voucher_venta,
          );
        }
      }
    } catch (error) {
      console.error("Error cargando voucher para PDF:", error);
    } finally {
      setLoadingVoucher(false);
    }
  };

  // Ver resumen de la cotización
  const handleNewMovementForFile = (e, groupData) => {
    e.stopPropagation();
    setActiveActionsMenu(null);

    onNewMovementForFile?.({
      voucher_code: groupData.file || "",
      file_nombre: groupData.file || "",
      referencia_voucher_venta: groupData.refVoucherVenta || "",
      referencia_voucher_reserva: groupData.refVoucherReserva || "",
    });
  };
  // Toggle menú de acciones
  const toggleActionsMenu = useCallback((e, groupKey) => {
    e.stopPropagation();
    setActiveActionsMenu((prev) => (prev === groupKey ? null : groupKey));
  }, []);

  // Cerrar menú de acciones al hacer clic fuera
  const closeActionsMenu = useCallback(() => {
    setActiveActionsMenu(null);
  }, []);

  // Obtener label descriptivo para el grupo
  const getGroupLabel = (groupKey, groupData) => {
    if (groupBy === "file") {
      // Caso especial: Sin file
      if (groupData.isSpecial && !groupData.file) {
        if (groupData.refVoucherVenta) {
          const refDisplay =
            groupData.refVoucherVenta.length > 12
              ? groupData.refVoucherVenta.substring(0, 12) + "..."
              : groupData.refVoucherVenta;
          return ` Sin File (Ref: ${refDisplay})`;
        }
        return " Sin File ni Ref. Voucher";
      }

      // Caso normal: Tiene file
      const fileDisplay = groupData.file || "Sin File";

      // Mostrar ref_voucher si existe
      if (groupData.refVoucherVenta) {
        const refDisplay =
          groupData.refVoucherVenta.length > 12
            ? groupData.refVoucherVenta.substring(0, 12) + "..."
            : groupData.refVoucherVenta;
        return `File: ${fileDisplay}`;
      }

      // Sin ref_voucher
      return `File: ${fileDisplay}`;
    }
    return groupKey;
  };

  return (
    <div className="movimientos-grouped-list">
      {/* Grupos con datos */}
      {Object.entries(groupedMovimientos.groups).map(
        ([groupKey, groupData]) => {
          const isExpanded = expandedGroups[groupKey] || false;
          const isActionsExpanded = activeActionsMenu === groupKey;
          const { totalSoles, totalDolares } = calculateGroupTotal(
            groupData.movimientos,
          );
          const count = groupData.movimientos.length;

          return (
            <div
              key={groupKey}
              className={`group-container ${groupData.isSpecial ? "no-file" : ""}`}
            >
              <div
                className="group-header"
                onClick={() => toggleGroup(groupKey)}
              >
                <div className="group-header-left">
                  <span className="group-icon">
                    {isExpanded ? <FaChevronDown /> : <FaChevronRight />}
                  </span>
                  <span className="group-label">
                    {getGroupLabel(groupKey, groupData)}
                  </span>
                </div>

                <div className="group-header-right">
                  <span className="group-count">
                    {count} movimiento{count !== 1 ? "s" : ""}
                  </span>
                  <div className={`group-totals ${tipo}`}>
                    {totalSoles > 0 && (
                      <span className="group-total soles">
                        S/ {totalSoles.toFixed(2)}
                      </span>
                    )}
                    {totalDolares > 0 && (
                      <span className="group-total dolares">
                        US$ {totalDolares.toFixed(2)}
                      </span>
                    )}
                    {totalSoles === 0 && totalDolares === 0 && (
                      <span className="group-total empty">S/ 0.00</span>
                    )}
                  </div>

                  {/* Acciones del grupo - similar a Cotizaciones */}
                  {(groupData.refVoucherVenta || groupData.file) && (
                    <div
                      className={`group-actions-container ${isActionsExpanded ? "expanded" : ""}`}
                    >
                      {/* Botón principal para expandir acciones */}
                      {!isActionsExpanded && (
                        <button
                          className="action-main-btn"
                          onClick={(e) => toggleActionsMenu(e, groupKey)}
                          title="Ver opciones del voucher"
                        >
                          Opciones <FaChevronDown />
                        </button>
                      )}

                      {/* Botones expandidos en línea */}
                      {isActionsExpanded && (
                        <div className="inline-expanded-buttons">
                          {groupData.refVoucherVenta && (
                            <>
                              <button
                                onClick={(e) =>
                                  handleViewVoucherSummary(e, groupData.file)
                                }
                                className="action-btn summary-btn"
                                disabled={loadingVoucher}
                                title="Ver resumen del voucher"
                              >
                                <MdReceipt />
                              </button>

                              <button
                                onClick={(e) =>
                                  handleViewVoucherPDF(e, groupData.file)
                                }
                                className="action-btn pdf-btn"
                                disabled={loadingVoucher}
                                title="Generar PDF del voucher"
                              >
                                <FaFilePdf />
                              </button>
                            </>
                          )}

                          <button
                            onClick={(e) =>
                              handleNewMovementForFile(e, groupData)
                            }
                            className="action-btn new-movement-btn"
                            title="Agregar gasto / ingreso para este file"
                          >
                            <FaPlus />
                          </button>

                          {groupData.refVoucherReserva && (
                            <button
                              onClick={(e) =>
                                handleViewServiceSummary(
                                  e,
                                  groupData.file,
                                  groupData.refVoucherReserva,
                                )
                              }
                              className="action-btn reserva-btn"
                              disabled={loadingService}
                              title="Ver servicios de reserva"
                            >
                              <MdCardTravel />
                            </button>
                          )}

                          {groupData.refVoucherVenta && (
                            <button
                              onClick={(e) =>
                                handleManageDocuments(
                                  e,
                                  groupData.refVoucherVenta,
                                  groupData.file,
                                )
                              }
                              className="action-btn docs-btn"
                              title="Gestionar documentos"
                            >
                              <MdAttachFile />
                            </button>
                          )}

                          {/* Botón para contraer */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              closeActionsMenu();
                            }}
                            className="action-btn collapse-btn"
                            title="Contraer acciones"
                          >
                            <MdClose />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Solo botón de reserva si no hay voucher venta pero sí reserva */}
                  {!groupData.refVoucherVenta &&
                    !groupData.file &&
                    groupData.refVoucherReserva && (
                      <button
                        className="btn-view-service-summary"
                        onClick={(e) =>
                          handleViewServiceSummary(
                            e,
                            groupData.file,
                            groupData.refVoucherReserva,
                          )
                        }
                        disabled={loadingService}
                        title="Ver detalle del servicio de reserva"
                      >
                        <MdCardTravel />
                      </button>
                    )}
                </div>
              </div>

              {isExpanded && (
                <div className="group-content">
                  <MovimientosList
                    movimientos={groupData.movimientos}
                    tipo={tipo}
                    showTipoColumn={showTipoColumn}
                    refreshData={refreshData}
                  />
                </div>
              )}
            </div>
          );
        },
      )}

      {/* Movimientos sin agrupar */}
      {groupedMovimientos.ungrouped.length > 0 && (
        <div className="group-container ungrouped">
          <div
            className="group-header"
            onClick={() => toggleGroup("__ungrouped__")}
          >
            <div className="group-header-left">
              <span className="group-icon">
                {expandedGroups["__ungrouped__"] ? (
                  <FaChevronDown />
                ) : (
                  <FaChevronRight />
                )}
              </span>
              <span className="group-label">Sin File</span>
            </div>
            <div className="group-header-right">
              <span className="group-count">
                {groupedMovimientos.ungrouped.length} movimiento
                {groupedMovimientos.ungrouped.length !== 1 ? "s" : ""}
              </span>
              {(() => {
                const { totalSoles, totalDolares } = calculateGroupTotal(
                  groupedMovimientos.ungrouped,
                );
                return (
                  <div className={`group-totals ${tipo}`}>
                    {totalSoles > 0 && (
                      <span className="group-total soles">
                        S/ {totalSoles.toFixed(2)}
                      </span>
                    )}
                    {totalDolares > 0 && (
                      <span className="group-total dolares">
                        US$ {totalDolares.toFixed(2)}
                      </span>
                    )}
                    {totalSoles === 0 && totalDolares === 0 && (
                      <span className="group-total empty">S/ 0.00</span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {expandedGroups["__ungrouped__"] && (
            <div className="group-content">
              <MovimientosList
                movimientos={groupedMovimientos.ungrouped}
                tipo={tipo}
                showTipoColumn={showTipoColumn}
                refreshData={refreshData}
              />
            </div>
          )}
        </div>
      )}

      {/* Mensaje si no hay movimientos */}
      {Object.keys(groupedMovimientos.groups).length === 0 &&
        groupedMovimientos.ungrouped.length === 0 && (
          <div className="no-movimientos">
            <p>
              No hay {tipo === "ingreso" ? "ingresos" : "egresos"} registrados
            </p>
          </div>
        )}

      {/* Modal de resumen de voucher */}
      {showVentasSummary && selectedVoucher && (
        <VentasSummaryModal
          isOpen={showVentasSummary}
          onClose={() => {
            setShowVentasSummary(false);
            setSelectedVoucher(null);
          }}
          voucher={selectedVoucher}
        />
      )}

      {/* Modal de PDF de voucher */}
      {showVentasPDFSummary && selectedVoucher && (
        <VentasSummaryPDFModal
          isOpen={showVentasPDFSummary}
          onClose={() => {
            setShowVentasPDFSummary(false);
            setSelectedVoucher(null);
          }}
          voucher={selectedVoucher}
        />
      )}

      {/* Modal de detalle de servicio */}
      {showServiceSummary && selectedReservation && (
        <ServiceSummaryModal
          isOpen={showServiceSummary}
          onClose={() => {
            setShowServiceSummary(false);
            setSelectedReservation(null);
          }}
          reservationVoucher={selectedReservation}
        />
      )}

      {/* Modal de gestión de documentos */}
      {showDocumentsModal && selectedVoucherIdForDocs && (
        <DocumentsManagerModal
          isOpen={showDocumentsModal}
          onClose={() => {
            setShowDocumentsModal(false);
            setSelectedVoucherIdForDocs(null);
            setSelectedVoucherCodeForDocs(null);
          }}
          voucherId={selectedVoucherIdForDocs}
          voucherCode={selectedVoucherCodeForDocs}
        />
      )}
    </div>
  );
};

export default MovimientosGroupedList;
