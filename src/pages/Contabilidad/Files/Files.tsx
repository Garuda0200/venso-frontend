import React, { useState, useEffect, useMemo } from "react";
import {
  FaPlus,
  FaMoneyBillWave,
  FaMoneyCheckAlt,
  FaCalendarAlt,
  FaUser,
  FaFileInvoiceDollar,
  FaChevronDown,
  FaChevronUp,
} from "react-icons/fa";
import {
  MdCalendarMonth,
  MdToday,
  MdReceipt,
  MdCardTravel,
  MdTableChart,
} from "react-icons/md";

import contabilidadService from "../../../services/contabilidadService";
import MovimientoForm from "../../../components/Contabilidad/MovimientoForm";
import { voucherVentaService } from "../../../services/voucherVentaService";
import voucherReservaService from "../../../services/voucherReservaService";

import VentasSummaryModal from "../../Ventas/VouchersVenta/components/VentasSummaryModal/VentasSummaryModal";
import ServiceSummaryModal from "../../Reservas/VouchersReserva/components/ServiceSummaryModal/ServiceSummaryModal";
import FileFormatModal from "./components/FileFormatModal";
import "./Files.scss";

/* =======================
 CONSTANTE TIPO DE CAMBIO
 ======================= */

const normCurrency = (moneda) => (moneda || "soles").toLowerCase();
const toNumber = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const formatSoles = (amount) =>
  `S/ ${Number(toNumber(amount)).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatCurrency = (amount, currency = "soles") => {
  const symbol = normCurrency(currency) === "dolares" ? "$" : "S/";
  return `${symbol} ${Number(toNumber(amount)).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};
const normalizeVoucherReservaResponse = (res) => {
  if (!res) return null;
  if (res?.success && res?.data) return res.data;
  if (res?.data?.success && res?.data?.data) return res.data.data;
  if (res?.data?.data) return res.data.data;
  if (res?.data) return res.data;
  return res;
};

/* =======================
 COMPONENTE PRINCIPAL Files
 ======================= */
export function Files() {
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [exchangeRate, setExchangeRate] = useState(3.5);

  const [expandedFiles, setExpandedFiles] = useState(new Set());
  const [expandedMonths, setExpandedMonths] = useState(new Set());
  const [expandedYears, setExpandedYears] = useState(
    new Set([new Date().getFullYear()]),
  );

  const [showVentasSummary, setShowVentasSummary] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [loadingVoucher, setLoadingVoucher] = useState(false);

  const [showServiceSummary, setShowServiceSummary] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [loadingService, setLoadingService] = useState(false);

  const [showFileFormat, setShowFileFormat] = useState(false);
  const [selectedFileGroup, setSelectedFileGroup] = useState(null);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [selectedMovementType, setSelectedMovementType] = useState<"ingreso" | "egreso" | null>(null);

  useEffect(() => {
    loadMovimientos();
  }, []);

  const loadMovimientos = async () => {
    try {
      setLoading(true);
      const response = await contabilidadService.getMovimientos();
      console.log("response", response);
      if (response.success) {
        const filtered = response.data.filter((mov) => mov.voucher_code);
        setMovimientos(filtered);

        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        setExpandedMonths(new Set([currentMonthKey]));
      }
    } catch (error) {
      console.error("Error loading movimientos:", error);
    } finally {
      setLoading(false);
    }
  };

  const yearlyData = useMemo(() => {
    const years = {};

    movimientos.forEach((mov) => {
      const dateStr = mov.created_at || mov.fecha;
      if (!dateStr) return;

      const date = new Date(dateStr);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      const monthName = date.toLocaleDateString("es-ES", { month: "long" });

      if (!years[year]) {
        years[year] = {
          year,
          months: {},
          totalFiles: 0,
          totalIngresosSoles: 0,
          totalEgresosSoles: 0,
          balanceSoles: 0,
        };
      }

      if (!years[year].months[monthKey]) {
        years[year].months[monthKey] = {
          monthKey,
          month,
          monthName,
          year,
          files: {},
          totalFiles: 0,
          totalIngresosSoles: 0,
          totalEgresosSoles: 0,
          balanceSoles: 0,
        };
      }

      const monthData = years[year].months[monthKey];
      const code = mov.voucher_code;

      if (!monthData.files[code]) {
        monthData.files[code] = {
          voucher_code: code,
          movimientos: [],
          total_ingresos_soles: 0,
          total_egresos_soles: 0,
          balance_soles: 0,
          referencia_voucher_venta: mov.referencia_voucher_venta || null,
          referencia_voucher_reserva: mov.referencia_voucher_reserva || null,
        };
        monthData.totalFiles++;
        years[year].totalFiles++;
      }

      const fileGroup = monthData.files[code];
      fileGroup.movimientos.push(mov);

      if (mov.referencia_voucher_reserva)
        fileGroup.referencia_voucher_reserva = mov.referencia_voucher_reserva;
      if (mov.referencia_voucher_venta)
        fileGroup.referencia_voucher_venta = mov.referencia_voucher_venta;

      const amountSoles =
        normCurrency(mov.moneda) === "dolares"
          ? toNumber(mov.monto) * exchangeRate
          : toNumber(mov.monto);

      if (mov.tipo_movimiento === "ingreso") {
        fileGroup.total_ingresos_soles += amountSoles;
        monthData.totalIngresosSoles += amountSoles;
        years[year].totalIngresosSoles += amountSoles;
      } else if (mov.tipo_movimiento === "egreso") {
        fileGroup.total_egresos_soles += amountSoles;
        monthData.totalEgresosSoles += amountSoles;
        years[year].totalEgresosSoles += amountSoles;
      }
    });

    Object.values(years).forEach((yearData) => {
      yearData.balanceSoles =
        yearData.totalIngresosSoles - yearData.totalEgresosSoles;

      Object.values(yearData.months).forEach((monthData) => {
        monthData.balanceSoles =
          monthData.totalIngresosSoles - monthData.totalEgresosSoles;

        Object.values(monthData.files).forEach((fileGroup) => {
          fileGroup.balance_soles =
            fileGroup.total_ingresos_soles - fileGroup.total_egresos_soles;
        });
      });
    });

    const sortedYears = Object.values(years).sort((a, b) => b.year - a.year);
    sortedYears.forEach((yearData) => {
      yearData.months = Object.values(yearData.months).sort(
        (a, b) => b.month - a.month,
      );
      yearData.months.forEach((monthData) => {
        monthData.files = Object.values(monthData.files).sort((a, b) =>
          a.voucher_code.localeCompare(b.voucher_code),
        );
      });
    });

    return sortedYears;
  }, [movimientos]);

  const toggleFileExpand = (voucherCode) => {
    setExpandedFiles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(voucherCode)) newSet.delete(voucherCode);
      else newSet.add(voucherCode);
      return newSet;
    });
  };

  const toggleMonthExpand = (monthKey) => {
    setExpandedMonths((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(monthKey)) newSet.delete(monthKey);
      else newSet.add(monthKey);
      return newSet;
    });
  };

  const toggleYearExpand = (year) => {
    setExpandedYears((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(year)) newSet.delete(year);
      else newSet.add(year);
      return newSet;
    });
  };

  const isCurrentMonth = (monthKey) => {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return monthKey === currentMonthKey;
  };

  const handleViewFileFormat = (e, group) => {
    e.stopPropagation();
    setSelectedFileGroup(group);
    setShowFileFormat(true);
  };

  const handleViewServiceSummary = async (e, voucherCode) => {
    e.stopPropagation();
    if (!voucherCode) return;

    setLoadingService(true);
    try {
      const movimiento = movimientos.find(
        (m) => m.voucher_code === voucherCode && m.referencia_voucher_reserva,
      );

      if (movimiento?.referencia_voucher_reserva) {
        const res = await voucherReservaService.getVoucherReservaById(
          movimiento.referencia_voucher_reserva,
        );
        const data = normalizeVoucherReservaResponse(res);

        if (data) {
          setSelectedReservation(data);
          setShowServiceSummary(true);
        } else {
          console.warn(
            "Voucher de reserva no encontrado:",
            movimiento.referencia_voucher_reserva,
          );
        }
      } else {
        console.warn(
          "No se encontró referencia_voucher_reserva para:",
          voucherCode,
        );
      }
    } catch (error) {
      console.error("Error cargando servicio de reserva:", error);
    } finally {
      setLoadingService(false);
    }
  };

  const handleViewVoucherSummary = async (e, voucherCode) => {
    e.stopPropagation();
    if (!voucherCode) return;

    setLoadingVoucher(true);
    try {
      const movimiento = movimientos.find(
        (m) => m.voucher_code === voucherCode,
      );

      if (movimiento?.referencia_voucher_venta) {
        const response = await voucherVentaService.getVoucherWithCotizacionById(
          movimiento.referencia_voucher_venta,
        );

        if (response?.success && response?.data) {
          setSelectedVoucher(response.data);
          setShowVentasSummary(true);
        } else {
          console.warn(
            "Voucher no encontrado para ID:",
            movimiento.referencia_voucher_venta,
          );
        }
      } else {
        console.warn(
          "No se encontró referencia_voucher_venta para:",
          voucherCode,
        );
      }
    } catch (error) {
      console.error("Error cargando voucher:", error);
    } finally {
      setLoadingVoucher(false);
    }
  };

  const getFileTypeLabel = (group) => {
    if (group.referencia_voucher_venta && group.referencia_voucher_reserva) {
      return { label: "Servicios Voucher Reserva", icon: "", color: "service" };
    } else if (group.referencia_voucher_venta) {
      return { label: "Pago Voucher Venta", icon: "", color: "payment" };
    }
    return { label: "Otros", icon: "", color: "other" };
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("es-PE", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const openMovementTypeSelector = () => setShowTypeSelector(true);
  const selectMovementType = (type: "ingreso" | "egreso") => {
    setSelectedMovementType(type);
    setShowTypeSelector(false);
    setShowMovementForm(true);
  };
  const closeMovementForm = () => {
    setShowMovementForm(false);
    setSelectedMovementType(null);
  };
  const handleMovementSaved = () => {
    closeMovementForm();
    void loadMovimientos();
  };

  if (loading) {
    return (
      <div className="files-page">
        <div className="page-header">
          <h1>Movimientos</h1>
          <p className="subtitle">Files organizados por intervalo de viaje</p>
        </div>
        <div className="loading-state">Cargando files...</div>
      </div>
    );
  }

  const totalFiles = yearlyData.reduce((sum, year) => sum + year.totalFiles, 0);

  return (
    <div className="files-page">
      <div className="page-header">
        <h1>Movimientos</h1>
        <p className="subtitle">
          {totalFiles}{" "}
          {totalFiles === 1 ? "file encontrado" : "files encontrados"} • TC{" "}
          {exchangeRate}
        </p>
        <button type="button" className="btn-add" onClick={openMovementTypeSelector}><FaPlus /> Nuevo movimiento</button>
      </div>

      {yearlyData.length === 0 ? (
        <div className="empty-state">
          <FaFileInvoiceDollar className="empty-icon" />
          <p>No hay movimientos con código de voucher</p>
        </div>
      ) : (
        <div className="years-container">
          {yearlyData.map((yearData) => {
            const isYearExpanded = expandedYears.has(yearData.year);
            const isCurrentYear = yearData.year === new Date().getFullYear();

            return (
              <div
                key={yearData.year}
                className={`year-section ${isCurrentYear ? "current-year" : ""}`}
              >
                <div
                  className="year-header"
                  onClick={() => toggleYearExpand(yearData.year)}
                >
                  <div className="year-title">
                    <MdCalendarMonth className="year-icon" />
                    <h2 className="year-label">
                      {yearData.year}
                      {isCurrentYear && (
                        <span className="current-badge">Actual</span>
                      )}
                    </h2>
                  </div>

                  <div className="year-summary">
                    <span className="summary-stat">
                      {yearData.totalFiles}{" "}
                      {yearData.totalFiles === 1 ? "file" : "files"}
                    </span>
                    <span className="summary-stat ingresos">
                      {" "}
                      {formatSoles(yearData.totalIngresosSoles)}
                    </span>
                    <span className="summary-stat egresos">
                      {" "}
                      {formatSoles(yearData.totalEgresosSoles)}
                    </span>
                    <span
                      className={`summary-stat balance ${yearData.balanceSoles >= 0 ? "positive" : "negative"}`}
                    >
                      {formatSoles(yearData.balanceSoles)}
                    </span>
                  </div>

                  <button className="expand-button">
                    {isYearExpanded ? <FaChevronUp /> : <FaChevronDown />}
                  </button>
                </div>

                {isYearExpanded && (
                  <div className="months-container">
                    {yearData.months.map((monthData) => {
                      const isMonthExpanded = expandedMonths.has(
                        monthData.monthKey,
                      );
                      const isCurrent = isCurrentMonth(monthData.monthKey);

                      return (
                        <div
                          key={monthData.monthKey}
                          className={`month-section ${isCurrent ? "current-month" : ""}`}
                        >
                          <div
                            className="month-header"
                            onClick={() =>
                              toggleMonthExpand(monthData.monthKey)
                            }
                          >
                            <div className="month-title">
                              {isCurrent && <MdToday className="today-icon" />}
                              <h3 className="month-label">
                                {monthData.monthName.charAt(0).toUpperCase() +
                                  monthData.monthName.slice(1)}
                                {isCurrent && (
                                  <span className="current-badge">
                                    Mes Actual
                                  </span>
                                )}
                              </h3>
                            </div>

                            <div className="month-summary">
                              <span className="summary-stat">
                                {monthData.totalFiles}{" "}
                                {monthData.totalFiles === 1 ? "file" : "files"}
                              </span>
                              <span className="summary-stat ingresos">
                                {" "}
                                {formatSoles(monthData.totalIngresosSoles)}
                              </span>
                              <span className="summary-stat egresos">
                                {" "}
                                {formatSoles(monthData.totalEgresosSoles)}
                              </span>
                              <span
                                className={`summary-stat balance ${monthData.balanceSoles >= 0 ? "positive" : "negative"}`}
                              >
                                {formatSoles(monthData.balanceSoles)}
                              </span>
                            </div>

                            <button className="expand-button">
                              {isMonthExpanded ? (
                                <FaChevronUp />
                              ) : (
                                <FaChevronDown />
                              )}
                            </button>
                          </div>

                          {isMonthExpanded && (
                            <div className="files-grid">
                              {monthData.files.map((group) => {
                                const fileType = getFileTypeLabel(group);
                                const isExpanded = expandedFiles.has(
                                  group.voucher_code,
                                );

                                return (
                                  <div
                                    key={group.voucher_code}
                                    className={`file-card ${fileType.color}`}
                                  >
                                    <div
                                      className="file-header"
                                      onClick={() =>
                                        toggleFileExpand(group.voucher_code)
                                      }
                                    >
                                      <div className="file-title">
                                        <span className="file-icon">
                                          {fileType.icon}
                                        </span>
                                        <div className="file-info">
                                          <h3 className="voucher-code">
                                            {group.voucher_code}
                                          </h3>
                                          <span
                                            className={`file-type-badge ${fileType.color}`}
                                          >
                                            {fileType.label}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="file-actions">
                                        <button
                                          className="btn-view-voucher"
                                          onClick={(e) =>
                                            handleViewVoucherSummary(
                                              e,
                                              group.voucher_code,
                                            )
                                          }
                                          disabled={loadingVoucher}
                                          title="Ver resumen del voucher de venta"
                                        >
                                          <MdReceipt />
                                        </button>

                                        {group.referencia_voucher_reserva && (
                                          <button
                                            className="btn-view-service"
                                            onClick={(e) =>
                                              handleViewServiceSummary(
                                                e,
                                                group.voucher_code,
                                              )
                                            }
                                            disabled={loadingService}
                                            title="Ver detalle del servicio de reserva"
                                          >
                                            <MdCardTravel />
                                          </button>
                                        )}

                                        <button
                                          className="btn-view-file-format"
                                          onClick={(e) =>
                                            handleViewFileFormat(e, group)
                                          }
                                          title="Ver formato contable del file"
                                        >
                                          <MdTableChart />
                                        </button>

                                        <button className="expand-button">
                                          {isExpanded ? (
                                            <FaChevronUp />
                                          ) : (
                                            <FaChevronDown />
                                          )}
                                        </button>
                                      </div>
                                    </div>

                                    <div className="file-summary">
                                      <div className="summary-item ingresos">
                                        <FaMoneyBillWave className="summary-icon" />
                                        <div className="summary-details">
                                          <span className="summary-label">
                                            Ingresos (S/)
                                          </span>
                                          <span className="summary-value">
                                            {formatSoles(
                                              group.total_ingresos_soles,
                                            )}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="summary-item egresos">
                                        <FaMoneyCheckAlt className="summary-icon" />
                                        <div className="summary-details">
                                          <span className="summary-label">
                                            Egresos (S/)
                                          </span>
                                          <span className="summary-value">
                                            {formatSoles(
                                              group.total_egresos_soles,
                                            )}
                                          </span>
                                        </div>
                                      </div>

                                      <div
                                        className={`summary-item balance ${group.balance_soles >= 0 ? "positive" : "negative"}`}
                                      >
                                        <span className="summary-label">
                                          Balance (S/)
                                        </span>
                                        <span className="summary-value">
                                          {formatSoles(group.balance_soles)}
                                        </span>
                                      </div>
                                    </div>

                                    {isExpanded && (
                                      <div className="file-details">
                                        <div className="movimientos-list">
                                          <h4 className="section-title">
                                            Movimientos (
                                            {group.movimientos.length})
                                          </h4>

                                          {group.movimientos.map((mov) => (
                                            <div
                                              key={mov.id}
                                              className={`movimiento-item ${mov.tipo_movimiento}`}
                                            >
                                              <div className="movimiento-header">
                                                <span
                                                  className={`tipo-badge ${mov.tipo_movimiento}`}
                                                >
                                                  {mov.tipo_movimiento ===
                                                  "ingreso"
                                                    ? " Ingreso"
                                                    : " Egreso"}
                                                </span>
                                                <span className="monto">
                                                  {formatCurrency(
                                                    mov.monto,
                                                    mov.moneda,
                                                  )}
                                                </span>
                                              </div>

                                              <div className="movimiento-body">
                                                <p className="descripcion">
                                                  {mov.descripcion}
                                                </p>

                                                <div className="movimiento-meta">
                                                  <span className="meta-item">
                                                    <FaCalendarAlt />{" "}
                                                    {formatDate(mov.fecha)}
                                                  </span>
                                                  {mov.creator_name && (
                                                    <span className="meta-item">
                                                      <FaUser />{" "}
                                                      {mov.creator_name}
                                                    </span>
                                                  )}
                                                  {mov.metodo_pago && (
                                                    <span className="meta-item">
                                                      {" "}
                                                      {mov.metodo_pago}
                                                    </span>
                                                  )}
                                                </div>

                                                {mov.observaciones && (
                                                  <div className="observaciones">
                                                    <strong>
                                                      Observaciones:
                                                    </strong>{" "}
                                                    {mov.observaciones}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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

      {showFileFormat && selectedFileGroup && (
        <FileFormatModal
          group={selectedFileGroup}
          exchangeRate={exchangeRate}
          onClose={() => {
            setShowFileFormat(false);
            setSelectedFileGroup(null);
          }}
        />
      )}

      {showTypeSelector && (
        <div className="modal-overlay">
          <div className="tipo-selector-modal">
            <div className="modal-header"><h3>Nuevo movimiento</h3><button type="button" className="close-btn" onClick={() => setShowTypeSelector(false)}>&times;</button></div>
            <div className="modal-body"><p>Selecciona el tipo de movimiento.</p><div className="tipo-buttons">
              <button type="button" className="tipo-btn ingreso" onClick={() => selectMovementType("ingreso")}><span className="label">Ingreso</span><span className="description">Registrar entrada de dinero</span></button>
              <button type="button" className="tipo-btn egreso" onClick={() => selectMovementType("egreso")}><span className="label">Egreso</span><span className="description">Registrar salida de dinero</span></button>
            </div></div>
          </div>
        </div>
      )}

      {showMovementForm && selectedMovementType && <MovimientoForm tipo={selectedMovementType} isOpen={showMovementForm} onClose={closeMovementForm} onSuccess={handleMovementSaved} />}
    </div>
  );
}

export default Files;
