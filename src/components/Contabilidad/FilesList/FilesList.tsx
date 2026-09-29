import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  MdSearch,
  MdFilterList,
  MdPerson,
  MdCalendarToday,
  MdAttachMoney,
  MdFolder,
  MdGroup,
  MdTrendingUp,
  MdRefresh,
  MdExpandMore,
  MdExpandLess,
} from "react-icons/md";
import { FaPercentage, FaMoneyBillWave, FaUserTie } from "react-icons/fa";
import { toast } from "react-toastify";
import { useVouchersVentaWithCotizacion } from "../../../hooks/useVouchersVenta";
import pasajeroService from "../../../services/pasajeroService";
import { formatCurrency } from "../../../utils/formatters";
import { queryKeys } from "../../../config/queryClient";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import contabilidadService from "../../../services/contabilidadService";
import { summarizeVoucherFinancials } from "../../../pages/Ventas/VouchersVenta/utils/voucherFinancials";
import "./FilesList.scss";

const FilesList = ({ refreshTrigger = 0 }) => {
  const queryClient = useQueryClient();

  const {
    data: vouchersData = [],
    isLoading: loading,
    error: queryError,
    refetch,
    isFetching,
  } = useVouchersVentaWithCotizacion();

  // Estados de filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [vendedorFilter, setVendedorFilter] = useState("");
  const [movimientos, setMovimientos] = useState([]);
  const [loadingMov, setLoadingMov] = useState(true);
  const [expandedMonths, setExpandedMonths] = useState(new Set());

  const loadMovimientos = async () => {
    try {
      setLoadingMov(true);
      const response = await contabilidadService.getMovimientos();
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
      setLoadingMov(false);
    }
  };

  useEffect(() => {
    loadMovimientos();
  }, []);

  // Cache de pasajeros (voucher_id -> count)
  const [passengerCounts, setPassengerCounts] = useState({});
  const [expandedVoucher, setExpandedVoucher] = useState(null);
  const toggleRow = (voucherCode) => {
    setExpandedVoucher(expandedVoucher === voucherCode ? null : voucherCode);
  };
  // Filtrar solo vouchers activos
  const files = useMemo(() => {
    return Array.isArray(vouchersData)
      ? vouchersData.filter((v) => v.is_active !== false)
      : [];
  }, [vouchersData]);

  // Error message
  const error = queryError
    ? "Error al cargar los files. Por favor intente nuevamente."
    : null;

  // Refetch cuando refreshTrigger cambia
  useEffect(() => {
    if (refreshTrigger > 0) {
      queryClient.invalidateQueries({ queryKey: queryKeys.vouchersVenta.all });
    }
  }, [refreshTrigger, queryClient]);

  // Lista de vendedores para el filtro
  const vendedoresList = useMemo(() => {
    const vendedoresMap = new Map();

    files.forEach((v) => {
      if (v.created_by && !vendedoresMap.has(v.created_by)) {
        vendedoresMap.set(v.created_by, {
          dni: v.created_by,
          nombre: v.created_by_name || v.created_by,
        });
      }
    });

    return Array.from(vendedoresMap.values()).sort((a, b) =>
      a.nombre.localeCompare(b.nombre),
    );
  }, [files]);

  // Cargar conteo de pasajeros cuando cambian los files
  useEffect(() => {
    const loadPassengerCounts = async () => {
      if (files.length === 0) return;

      const counts = {};

      for (const voucher of files) {
        if (voucher.id) {
          try {
            const passengers =
              await pasajeroService.getPassengersByVoucherVenta(voucher.id);
            counts[voucher.id] = Array.isArray(passengers)
              ? passengers.length
              : 0;
          } catch (err) {
            console.warn(
              `Error contando pasajeros de voucher ${voucher.id}:`,
              err,
            );
            counts[voucher.id] = 0;
          }
        }
      }

      setPassengerCounts(counts);
    };

    loadPassengerCounts();
  }, [files]);

  // Función para refrescar manualmente
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Filtrar files
  const filteredFiles = useMemo(() => {
    let result = [...files];

    // Filtro de búsqueda
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter(
        (file) =>
          file.voucher_code?.toLowerCase().includes(searchLower) ||
          file.cotizacion?.titulo?.toLowerCase().includes(searchLower) ||
          file.created_by_name?.toLowerCase().includes(searchLower) ||
          file.created_by?.toLowerCase().includes(searchLower),
      );
    }

    // Filtro por vendedor
    if (vendedorFilter) {
      result = result.filter((file) => file.created_by === vendedorFilter);
    }

    // Ordenar por fecha descendente
    result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return result;
  }, [files, searchTerm, vendedorFilter]);

  // Calcular totales
  const totals = useMemo(() => {
    return filteredFiles.reduce(
      (acc, file) => {
        const summary = summarizeVoucherFinancials({ voucher: file });
        acc.totalAmount += summary.totalFinal;
        acc.totalPaid += summary.totalPaid;
        acc.totalRemaining += summary.remainingAmount;
        acc.totalPassengers += passengerCounts[file.id] || 0;
        return acc;
      },
      { totalAmount: 0, totalPaid: 0, totalRemaining: 0, totalPassengers: 0 },
    );
  }, [filteredFiles, passengerCounts]);

  // Formatear fecha
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    try {
      return new Date(dateString).toLocaleDateString("es-PE", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  // Calcular porcentaje pagado
  const getPaymentPercentage = (totalAmount, totalPaid) => {
    if (!totalAmount || totalAmount === 0) return 0;
    return Math.min(100, Math.round((totalPaid / totalAmount) * 100));
  };

  // Obtener clase de status de pago
  const getPaymentStatusClass = (percentage) => {
    if (percentage >= 100) return "completed";
    if (percentage >= 50) return "partial-high";
    if (percentage > 0) return "partial-low";
    return "pending";
  };

  const handleExportExcel = async () => {
    if (!filteredFiles.length) {
      toast.info("No hay datos para exportar");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Files de Venta");

    // Cabeceras
    const headers = [
      "Fecha de Venta",
      "Código de File",
      "Pasajeros",
      "Costo Total",
      "% Pagado",
      "Adelanto",
      "Saldo",
      "Vendedor(a)",
    ];

    worksheet.addRow(headers);

    // Estilo cabecera (verde)
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2E7D32" }, // verde
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // Datos
    filteredFiles.forEach((file) => {
      const { totalFinal: totalAmount, totalPaid, remainingAmount: remaining } =
        summarizeVoucherFinancials({ voucher: file });
      const percentage = getPaymentPercentage(totalAmount, totalPaid);

      worksheet.addRow([
        formatDate(file.created_at),
        file.voucher_code || "",
        passengerCounts[file.id] || 0,
        totalAmount,
        percentage,
        totalPaid,
        remaining,
        file.created_by_name || file.created_by || "",
      ]);
    });

    // Fila de totales
    const totalsRow = worksheet.addRow([
      "TOTALES",
      "",
      totals.totalPassengers,
      totals.totalAmount,
      "",
      totals.totalPaid,
      totals.totalRemaining,
      "",
    ]);

    totalsRow.font = { bold: true };

    // Auto–ajuste de columnas (DESPUÉS de todos los datos)
    worksheet.columns.forEach((column) => {
      let maxLength = 10;

      column.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.value == null) return;

        const text =
          typeof cell.value === "object" && cell.value.richText
            ? cell.value.richText.map((t) => t.text).join("")
            : String(cell.value);

        maxLength = Math.max(maxLength, text.length);
      });

      column.width = Math.min(maxLength + 2, 35);
    });

    // Formatos moneda
    worksheet.getColumn(4).numFmt = '"$/ " #,##0.00';
    worksheet.getColumn(6).numFmt = '"$/ " #,##0.00';
    worksheet.getColumn(7).numFmt = '"$/ " #,##0.00';

    // Congelar cabecera
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    // Autofiltro
    worksheet.autoFilter = {
      from: "A1",
      to: "H1",
    };

    // Exportar
    const buffer = await workbook.xlsx.writeBuffer();

    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const today = new Date();
    const localDate = today.toLocaleDateString("en-CA"); // YYYY-MM-DD

    saveAs(blob, `files_venta_${localDate}.xlsx`);
  };

  if (loading) {
    return (
      <div className="files-list-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Cargando files...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="files-list-container">
        <div className="error-state">
          <p>{error}</p>
          <button className="btn-retry" onClick={handleRefresh}>
            <MdRefresh /> Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="files-list-container">
      {/* Header con estadísticas */}
      <div className="files-header">
        <div className="header-title">
          <MdFolder className="header-icon" />
          <h2>Files de Venta</h2>
          <span className="files-count">{filteredFiles.length} files</span>
          {isFetching && <span className="fetching-indicator">⟳</span>}
        </div>

        <button
          className="btn-refresh"
          onClick={handleRefresh}
          title="Actualizar"
          disabled={isFetching}
        >
          <MdRefresh className={isFetching ? "spinning" : ""} />
        </button>
      </div>

      {/* Filtros */}
      <div className="files-filters">
        <div className="search-box">
          <MdSearch className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por código, título, vendedor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>
            <FaUserTie className="filter-icon" />
            Vendedor:
          </label>
          <select
            value={vendedorFilter}
            onChange={(e) => setVendedorFilter(e.target.value)}
          >
            <option value="">Todos</option>
            {vendedoresList.map((v) => (
              <option key={v.dni} value={v.dni}>
                {v.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla de files */}
      <div className="files-table-wrapper">
        <table className="files-table">
          <thead>
            <tr>
              <th className="th-date">
                <MdCalendarToday /> Fecha de Venta
              </th>
              <th className="th-code">
                <MdFolder /> Código de File
              </th>
              <th className="th-passengers">
                <MdGroup /> Pasajeros
              </th>
              <th className="th-total">
                <MdAttachMoney /> Costo Total
              </th>
              <th className="th-percentage">
                <FaPercentage /> %
              </th>
              <th className="th-advance">
                <FaMoneyBillWave /> Adelanto
              </th>
              <th className="th-balance">
                <MdTrendingUp /> Saldo
              </th>
              <th className="th-seller">
                <FaUserTie /> Vendedor(a)
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredFiles.length === 0 ? (
              <tr className="empty-row">
                <td colSpan="8">
                  <div className="empty-state">
                    <MdFolder className="empty-icon" />
                    <p>No se encontraron files</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredFiles.map((file) => {
                const {
                  totalFinal: totalAmount,
                  totalPaid,
                  remainingAmount: remaining,
                } = summarizeVoucherFinancials({ voucher: file });
                const percentage = getPaymentPercentage(totalAmount, totalPaid);
                const statusClass = getPaymentStatusClass(percentage);
                const passengerCount = passengerCounts[file.id] || 0;
                const vendedorName =
                  file.created_by_name || file.created_by || "-";
                const isExpanded = expandedVoucher === file.voucher_code;

                // Filtrar movimientos relacionados usando el voucher_code
                // 1. Filtrar solo ingresos
                const ingresosRelacionados = movimientos.filter(
                  (m) =>
                    m.voucher_code === file.voucher_code &&
                    m.tipo_movimiento === "ingreso",
                );

                // 2. Ordenar por fecha (el más antiguo primero)
                const movimientosOrdenados = [...ingresosRelacionados].sort(
                  (a, b) => new Date(a.created_at) - new Date(b.created_at),
                );

                return (
                  <React.Fragment key={file.id}>
                    <tr
                      className={`file-row ${statusClass} ${isExpanded ? "is-expanded" : ""}`}
                      onClick={() => toggleRow(file.voucher_code)}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="td-date">{formatDate(file.created_at)}</td>
                      <td className="td-code">
                        <span className="code-badge">{file.voucher_code}</span>
                      </td>
                      <td className="td-passengers">
                        <span className="passengers-count">
                          {passengerCount}
                        </span>
                      </td>
                      <td className="td-total">
                        {formatCurrency(totalAmount)}
                      </td>
                      <td className="td-percentage">
                        <div className="percentage-wrapper">
                          <div className="percentage-bar">
                            <div
                              className={`percentage-fill ${statusClass}`}
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                          <span className="percentage-text">{percentage}%</span>
                        </div>
                      </td>
                      <td className="td-advance">
                        <span className="advance-amount">
                          {formatCurrency(totalPaid)}
                        </span>
                      </td>
                      <td className="td-balance">
                        <span
                          className={`balance-amount ${remaining > 0 ? "pending" : "paid"}`}
                        >
                          {formatCurrency(remaining)}
                        </span>
                      </td>
                      <td className="td-seller">
                        <span className="seller-name">{vendedorName}</span>
                      </td>
                    </tr>

                    {/* Menu Desplegable de Movimientos */}
                    {isExpanded && (
                      <tr className="row-details">
                        <td colSpan="8">
                          <div className="movimientos-container">
                            <h4>
                              <FaMoneyBillWave /> Cronología de Ingresos
                            </h4>
                            {movimientosOrdenados.length > 0 ? (
                              <table className="movimientos-subtable">
                                <thead>
                                  <tr>
                                    <th>Fecha</th>
                                    <th>Estado</th>
                                    <th>Descripción</th>
                                    <th>Registrado por</th>
                                    <th>Monto</th>
                                    <th>Porcentaje del total </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {movimientosOrdenados.map((mov, index) => {
                                    const montoMov = parseFloat(mov.monto || 0);
                                    const porcentajeMov =
                                      totalAmount > 0
                                        ? (
                                            (montoMov / totalAmount) *
                                            100
                                          ).toFixed(2)
                                        : 0;

                                    const isFirst = index === 0;

                                    return (
                                      <tr
                                        key={mov.id}
                                        className={
                                          isFirst ? "first-movement-row" : ""
                                        }
                                      >
                                        <td>
                                          {isFirst && (
                                            <span className="main-badge">
                                              PRIMERO
                                            </span>
                                          )}
                                          {" " + formatDate(mov.fecha)}
                                        </td>
                                        <td>
                                          <span className="badge-tipo ingreso">
                                            ↑ Ingreso
                                          </span>
                                        </td>
                                        <td>
                                          <small
                                            style={{
                                              fontWeight: isFirst ? 700 : 500,
                                            }}
                                          >
                                            {mov.descripcion}
                                          </small>
                                          <br />
                                          <span className="badge-cuenta">
                                            {mov.tipo_cuenta_display}
                                          </span>
                                        </td>
                                        <td>
                                          {mov.creator_name || mov.created_by}
                                        </td>
                                        <td className="txt-amount ingreso">
                                          {mov.moneda_symbol}{" "}
                                          {montoMov.toLocaleString("en-US", {
                                            minimumFractionDigits: 2,
                                          })}
                                        </td>
                                        <td>
                                          <span
                                            className={`percentage-badge ${isFirst ? "highlight" : ""}`}
                                          >
                                            {porcentajeMov}%
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            ) : (
                              <p className="no-data-msg">
                                No hay ingresos registrados.
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer con totales */}
      <div className="files-footer">
        <div className="footer-totals">
          <span className="total-label">Totales:</span>
          <span className="total-item">
            <strong>Costo:</strong> {formatCurrency(totals.totalAmount)}
          </span>
          <span className="total-item">
            <strong>Adelantos:</strong> {formatCurrency(totals.totalPaid)}
          </span>
          <span className="total-item pending">
            <strong>Por Cobrar:</strong> {formatCurrency(totals.totalRemaining)}
          </span>
        </div>
        <button
          className="btn-export"
          onClick={handleExportExcel}
          title="Exportar a Excel"
        >
          Exportar XLSX
        </button>
      </div>
    </div>
  );
};

export default FilesList;
