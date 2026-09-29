import React, { useState, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import {
  FaChartBar,
  FaChartPie,
  FaChartLine,
  FaMoneyBillWave,
  FaFileInvoiceDollar,
  FaCheckCircle,
  FaHourglassHalf,
  FaTimesCircle,
  FaCalendarAlt,
  FaFilter,
  FaDownload,
  FaBuilding,
  FaDollarSign,
  FaExchangeAlt,
  FaArrowUp,
  FaArrowDown,
} from "react-icons/fa";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  parseISO,
  subMonths,
  addMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import axiosInstance from "../../../utils/axiosInstance";
import contabilidadService from "../../../services/contabilidadService";
import "./ReportesInformes.scss";

// Helper para formatear moneda
const formatCurrency = (amount, currency = "USD") => {
  const num = parseFloat(amount) || 0;
  if (currency === "PEN" || currency === "soles") {
    return `S/. ${num.toFixed(2)}`;
  }
  return `$ ${num.toFixed(2)}`;
};

// Nombres de los meses
const MONTH_NAMES = [
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

export function ReportesInformes() {
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    end: format(endOfMonth(new Date()), "yyyy-MM-dd"),
  });
  const [movimientos, setMovimientos] = useState([]);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterBusinessType, setFilterBusinessType] = useState("all");
  const [filterContexto, setFilterContexto] = useState("all");
  const [stats, setStats] = useState({
    movimientos: {
      total: 0,
      ingresos: 0,
      egresos: 0,
      montoIngresos: 0,
      montoEgresos: 0,
      montoTotal: 0,
    },
    paymentRequests: {
      total: 0,
      paid: 0,
      pending: 0,
      cancelled: 0,
      montoPagado: 0,
      montoPendiente: 0,
    },
    porTipoServicio: {},
    porContextoPago: {},
    porPlataforma: {},
    tendenciaDiaria: [],
    comparacionMesAnterior: { ingresos: 0, egresos: 0 },
  });

  // Actualizar dateRange cuando cambie el mes seleccionado
  useEffect(() => {
    setDateRange({
      start: format(startOfMonth(selectedMonth), "yyyy-MM-dd"),
      end: format(endOfMonth(selectedMonth), "yyyy-MM-dd"),
    });
  }, [selectedMonth]);

  useEffect(() => {
    loadReportData();
  }, [dateRange, filterPlatform, filterBusinessType, filterContexto]);

  const loadReportData = async () => {
    setLoading(true);
    try {
      // Cargar movimientos
      const movimientosResponse = await contabilidadService.getMovimientos();
      const allMovimientos = movimientosResponse.success
        ? movimientosResponse.data || []
        : [];

      // Filtrar movimientos por rango de fechas
      let filteredMovimientos = allMovimientos.filter((m) => {
        const fecha = new Date(m.fecha);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        return fecha >= start && fecha <= end;
      });

      // Aplicar filtros adicionales
      if (filterPlatform !== "all") {
        filteredMovimientos = filteredMovimientos.filter(
          (m) => m.platform === filterPlatform,
        );
      }
      if (filterBusinessType !== "all") {
        filteredMovimientos = filteredMovimientos.filter(
          (m) => m.business_type === filterBusinessType,
        );
      }
      if (filterContexto !== "all") {
        filteredMovimientos = filteredMovimientos.filter((m) => {
          const tipo = m.contexto_pago?.tipo || "Otro";
          return tipo === filterContexto;
        });
      }

      // Cargar payment requests
      const prResponse = await axiosInstance.get(
        "/turismo/vouchers-reserva/payment-requests/all",
      );
      const allPaymentRequests = prResponse.data?.success
        ? prResponse.data.data || []
        : [];

      // Filtrar payment requests por rango de fechas
      const filteredPR = allPaymentRequests.filter((pr) => {
        const fecha = new Date(pr.created_at);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        return fecha >= start && fecha <= end;
      });

      // Cargar movimientos del mes anterior para comparación
      const prevMonthStart = format(
        startOfMonth(subMonths(selectedMonth, 1)),
        "yyyy-MM-dd",
      );
      const prevMonthEnd = format(
        endOfMonth(subMonths(selectedMonth, 1)),
        "yyyy-MM-dd",
      );
      const prevMonthMovs = allMovimientos.filter((m) => {
        const fecha = new Date(m.fecha);
        return (
          fecha >= new Date(prevMonthStart) && fecha <= new Date(prevMonthEnd)
        );
      });

      setMovimientos(filteredMovimientos);
      setPaymentRequests(filteredPR);

      // Calcular estadísticas
      calculateStats(filteredMovimientos, filteredPR, prevMonthMovs);
    } catch (error) {
      console.error("Error loading report data:", error);
      toast.error("Error al cargar datos del reporte");
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (movs, prs, prevMonthMovs) => {
    // Estadísticas de movimientos
    const ingresos = movs.filter((m) => m.tipo_movimiento === "ingreso");
    const egresos = movs.filter((m) => m.tipo_movimiento === "egreso");
    const montoIngresos = ingresos.reduce(
      (sum, m) => sum + parseFloat(m.monto || 0),
      0,
    );
    const montoEgresos = egresos.reduce(
      (sum, m) => sum + parseFloat(m.monto || 0),
      0,
    );

    // Comparación con mes anterior
    const prevIngresos = prevMonthMovs.filter(
      (m) => m.tipo_movimiento === "ingreso",
    );
    const prevEgresos = prevMonthMovs.filter(
      (m) => m.tipo_movimiento === "egreso",
    );
    const prevMontoIngresos = prevIngresos.reduce(
      (sum, m) => sum + parseFloat(m.monto || 0),
      0,
    );
    const prevMontoEgresos = prevEgresos.reduce(
      (sum, m) => sum + parseFloat(m.monto || 0),
      0,
    );

    const comparacionMesAnterior = {
      ingresos:
        prevMontoIngresos > 0
          ? ((montoIngresos - prevMontoIngresos) / prevMontoIngresos) * 100
          : 0,
      egresos:
        prevMontoEgresos > 0
          ? ((montoEgresos - prevMontoEgresos) / prevMontoEgresos) * 100
          : 0,
    };

    // Estadísticas de payment requests
    const paid = prs.filter((pr) => pr.status === "paid");
    const pending = prs.filter((pr) => pr.status === "pending");
    const cancelled = prs.filter((pr) => pr.status === "cancelled");
    const montoPagado = paid.reduce(
      (sum, pr) => sum + parseFloat(pr.amount || 0),
      0,
    );
    const montoPendiente = pending.reduce(
      (sum, pr) => sum + parseFloat(pr.amount || 0),
      0,
    );

    // Estadísticas por tipo de servicio
    const porTipoServicio = {};
    prs.forEach((pr) => {
      const typeService =
        pr.service_data?.parentService?.typeService || "otros";
      if (!porTipoServicio[typeService]) {
        porTipoServicio[typeService] = {
          total: 0,
          paid: 0,
          pending: 0,
          cancelled: 0,
          montoPagado: 0,
          montoPendiente: 0,
        };
      }
      porTipoServicio[typeService].total++;
      porTipoServicio[typeService][pr.status]++;
      if (pr.status === "paid") {
        porTipoServicio[typeService].montoPagado += parseFloat(pr.amount || 0);
      } else if (pr.status === "pending") {
        porTipoServicio[typeService].montoPendiente += parseFloat(
          pr.amount || 0,
        );
      }
    });

    // Estadísticas por contexto de pago
    const porContextoPago = {};
    movs.forEach((m) => {
      const tipo = m.contexto_pago?.tipo || "Otro";
      if (!porContextoPago[tipo]) {
        porContextoPago[tipo] = { total: 0, monto: 0, ingresos: 0, egresos: 0 };
      }
      porContextoPago[tipo].total++;
      porContextoPago[tipo].monto += parseFloat(m.monto || 0);
      if (m.tipo_movimiento === "ingreso") {
        porContextoPago[tipo].ingresos += parseFloat(m.monto || 0);
      } else {
        porContextoPago[tipo].egresos += parseFloat(m.monto || 0);
      }
    });

    // Estadísticas por plataforma
    const porPlataforma = {};
    movs.forEach((m) => {
      const platform = m.platform || "venso";
      if (!porPlataforma[platform]) {
        porPlataforma[platform] = {
          total: 0,
          monto: 0,
          ingresos: 0,
          egresos: 0,
        };
      }
      porPlataforma[platform].total++;
      porPlataforma[platform].monto += parseFloat(m.monto || 0);
      if (m.tipo_movimiento === "ingreso") {
        porPlataforma[platform].ingresos += parseFloat(m.monto || 0);
      } else {
        porPlataforma[platform].egresos += parseFloat(m.monto || 0);
      }
    });

    // Tendencia diaria
    const start = parseISO(dateRange.start);
    const end = parseISO(dateRange.end);
    const days = eachDayOfInterval({ start, end });

    const tendenciaDiaria = days.map((day) => {
      const dayStr = format(day, "yyyy-MM-dd");
      const movsDelDia = movs.filter((m) => m.fecha.startsWith(dayStr));
      const prsDelDia = prs.filter((pr) => pr.created_at.startsWith(dayStr));

      return {
        fecha: format(day, "dd/MM", { locale: es }),
        fullDate: format(day, "dd MMM", { locale: es }),
        ingresos: movsDelDia
          .filter((m) => m.tipo_movimiento === "ingreso")
          .reduce((sum, m) => sum + parseFloat(m.monto || 0), 0),
        egresos: movsDelDia
          .filter((m) => m.tipo_movimiento === "egreso")
          .reduce((sum, m) => sum + parseFloat(m.monto || 0), 0),
        paymentsPaid: prsDelDia.filter((pr) => pr.status === "paid").length,
        paymentsPending: prsDelDia.filter((pr) => pr.status === "pending")
          .length,
        totalMovimientos: movsDelDia.length,
      };
    });

    setStats({
      movimientos: {
        total: movs.length,
        ingresos: ingresos.length,
        egresos: egresos.length,
        montoIngresos,
        montoEgresos,
        montoTotal: montoIngresos - montoEgresos,
      },
      paymentRequests: {
        total: prs.length,
        paid: paid.length,
        pending: pending.length,
        cancelled: cancelled.length,
        montoPagado,
        montoPendiente,
      },
      porTipoServicio,
      porContextoPago,
      porPlataforma,
      tendenciaDiaria,
      comparacionMesAnterior,
    });
  };

  const handleMonthChange = (direction) => {
    if (direction === "prev") {
      setSelectedMonth((prev) => subMonths(prev, 1));
    } else {
      setSelectedMonth((prev) => addMonths(prev, 1));
    }
  };

  const handleDateChange = (field, value) => {
    setDateRange((prev) => ({ ...prev, [field]: value }));
  };

  // Obtener lista única de contextos de pago para el filtro
  const contextosUnicos = useMemo(() => {
    const contextos = new Set();
    movimientos.forEach((m) => {
      const tipo = m.contexto_pago?.tipo || "Otro";
      contextos.add(tipo);
    });
    return Array.from(contextos);
  }, [movimientos]);

  const tipoServicioColors = {
    hoteles: "#007b46",
    transportes: "#36b9cc",
    guias: "#ff8c00",
    tours: "#e74a3b",
    restaurantes: "#1cc88a",
    tickets: "#858796",
    vuelos: "#4e73df",
    trenes: "#f6c23e",
    endoses: "#5a5c69",
    otros: "#6c757d",
  };

  const tipoServicioLabels = {
    hoteles: "Hoteles",
    transportes: "Transportes",
    guias: "Guías",
    tours: "Tours",
    restaurantes: "Restaurantes",
    tickets: "Tickets",
    vuelos: "Vuelos",
    trenes: "Trenes",
    endoses: "Endoses",
    otros: "Otros",
  };

  const contextoPagoLabels = {
    PagoCotizacion: "Pagos de Cotización",
    ServiciosVoucherReserva: "Servicios Voucher Reserva",
    LiquidacionServicioProveedor: "Pago por lote a proveedor",
    TransferenciaInterna: "Transferencia Interna",
    PagoProveedor: "Pago a Proveedor",
    Otro: "Otros",
  };

  const maxBarValue = useMemo(() => {
    if (stats.tendenciaDiaria.length === 0) return 1;
    return Math.max(
      ...stats.tendenciaDiaria.map((d) => Math.max(d.ingresos, d.egresos)),
      1,
    );
  }, [stats.tendenciaDiaria]);

  return (
    <div className="reportes-informes">
      {/* Header con selector de mes y filtros */}
      <div className="reportes-header">
        <div className="header-title">
          <h1>
            <FaChartBar /> Dashboard de Reportes
          </h1>
          <p>Análisis detallado de movimientos y pagos de servicios</p>
        </div>

        {/* Selector de mes mejorado */}
        <div className="month-selector">
          <button
            className="month-nav"
            onClick={() => handleMonthChange("prev")}
          ></button>
          <div className="month-display">
            <span className="month-name">
              {MONTH_NAMES[selectedMonth.getMonth()]}
            </span>
            <span className="month-year">{selectedMonth.getFullYear()}</span>
          </div>
          <button
            className="month-nav"
            onClick={() => handleMonthChange("next")}
          ></button>
        </div>

        {/* Filtros como botones toggle profesionales */}
        <div className="filter-toggles">
          {/* Plataforma - Venso/Mil con relación automática B2C/B2B */}
          <div className="toggle-group platform-toggle">
            <span className="toggle-label">Plataforma:</span>
            <div className="toggle-buttons">
              <button
                className={`toggle-btn ${filterPlatform === "all" ? "active" : ""}`}
                onClick={() => {
                  setFilterPlatform("all");
                  setFilterBusinessType("all");
                }}
              >
                Todas
              </button>
              <button
                className={`toggle-btn venso ${filterPlatform === "venso" ? "active" : ""}`}
                onClick={() => {
                  setFilterPlatform("venso");
                  setFilterBusinessType("B2C");
                }}
              >
                <span className="btn-icon"></span>
                Venso
                <span className="btn-badge">B2C</span>
              </button>
              <button
                className={`toggle-btn mil ${filterPlatform === "mil" ? "active" : ""}`}
                onClick={() => {
                  setFilterPlatform("mil");
                  setFilterBusinessType("B2B");
                }}
              >
                <span className="btn-icon"></span>
                Mil
                <span className="btn-badge">B2B</span>
              </button>
            </div>
          </div>

          {/* Contexto de pago */}
          <div className="toggle-group context-toggle">
            <span className="toggle-label">Contexto:</span>
            <div className="toggle-buttons">
              <button
                className={`toggle-btn ${filterContexto === "all" ? "active" : ""}`}
                onClick={() => setFilterContexto("all")}
              >
                Todos
              </button>
              <button
                className={`toggle-btn ${filterContexto === "PagoCotizacion" ? "active" : ""}`}
                onClick={() => setFilterContexto("PagoCotizacion")}
              >
                Cotización
              </button>
              <button
                className={`toggle-btn ${filterContexto === "ServiciosVoucherReserva" ? "active" : ""}`}
                onClick={() => setFilterContexto("ServiciosVoucherReserva")}
              >
                Reserva
              </button>
              <button
                className={`toggle-btn ${filterContexto === "LiquidacionServicioProveedor" ? "active" : ""}`}
                onClick={() =>
                  setFilterContexto("LiquidacionServicioProveedor")
                }
              >
                Pagos por lote
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Cargando datos del reporte...</p>
        </div>
      ) : (
        <>
          {/* Cards de resumen principal */}
          <div className="stats-cards">
            {/* Movimientos - Ingresos */}
            <div className="stat-card ingresos-card">
              <div className="card-icon">
                <FaArrowUp />
              </div>
              <div className="card-content">
                <h3>Ingresos</h3>
                <div className="card-amount">
                  {formatCurrency(stats.movimientos.montoIngresos, "PEN")}
                </div>
                <div className="card-count">
                  {stats.movimientos.ingresos} movimientos
                </div>
                {stats.comparacionMesAnterior.ingresos !== 0 && (
                  <div
                    className={`comparison ${stats.comparacionMesAnterior.ingresos >= 0 ? "positive" : "negative"}`}
                  >
                    {stats.comparacionMesAnterior.ingresos >= 0 ? "▲" : "▼"}{" "}
                    {Math.abs(stats.comparacionMesAnterior.ingresos).toFixed(1)}
                    % vs mes anterior
                  </div>
                )}
              </div>
            </div>

            {/* Movimientos - Egresos */}
            <div className="stat-card egresos-card">
              <div className="card-icon">
                <FaArrowDown />
              </div>
              <div className="card-content">
                <h3>Egresos</h3>
                <div className="card-amount">
                  {formatCurrency(stats.movimientos.montoEgresos, "PEN")}
                </div>
                <div className="card-count">
                  {stats.movimientos.egresos} movimientos
                </div>
                {stats.comparacionMesAnterior.egresos !== 0 && (
                  <div
                    className={`comparison ${stats.comparacionMesAnterior.egresos <= 0 ? "positive" : "negative"}`}
                  >
                    {stats.comparacionMesAnterior.egresos >= 0 ? "▲" : "▼"}{" "}
                    {Math.abs(stats.comparacionMesAnterior.egresos).toFixed(1)}%
                    vs mes anterior
                  </div>
                )}
              </div>
            </div>

            {/* Balance */}
            <div
              className={`stat-card balance-card ${stats.movimientos.montoTotal >= 0 ? "positive" : "negative"}`}
            >
              <div className="card-icon">
                <FaDollarSign />
              </div>
              <div className="card-content">
                <h3>Balance</h3>
                <div className="card-amount">
                  {formatCurrency(stats.movimientos.montoTotal, "PEN")}
                </div>
                <div className="card-count">
                  {stats.movimientos.total} movimientos totales
                </div>
              </div>
            </div>

            {/* Payment Requests */}
            <div className="stat-card payments-card">
              <div className="card-icon">
                <FaFileInvoiceDollar />
              </div>
              <div className="card-content">
                <h3>Solicitudes de Pago</h3>
                <div className="payment-stats-row">
                  <div className="payment-stat paid">
                    <FaCheckCircle />
                    <span>{stats.paymentRequests.paid}</span>
                  </div>
                  <div className="payment-stat pending">
                    <FaHourglassHalf />
                    <span>{stats.paymentRequests.pending}</span>
                  </div>
                  <div className="payment-stat cancelled">
                    <FaTimesCircle />
                    <span>{stats.paymentRequests.cancelled}</span>
                  </div>
                </div>
                <div className="payment-amounts">
                  <div>
                    Pagado:{" "}
                    <strong>
                      {formatCurrency(stats.paymentRequests.montoPagado, "PEN")}
                    </strong>
                  </div>
                  <div>
                    Pendiente:{" "}
                    <strong className="warning">
                      {formatCurrency(
                        stats.paymentRequests.montoPendiente,
                        "PEN",
                      )}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Gráfico de tendencia diaria mejorado */}
          <div className="chart-section">
            <div className="chart-card">
              <h3>
                <FaChartLine /> Tendencia Diaria -{" "}
                {MONTH_NAMES[selectedMonth.getMonth()]}{" "}
                {selectedMonth.getFullYear()}
              </h3>
              <div className="chart-content">
                <div className="simple-chart">
                  {stats.tendenciaDiaria.map((day, index) => (
                    <div key={index} className="chart-bar-group">
                      <div className="bars">
                        <div
                          className="bar ingresos"
                          style={{
                            height: `${(day.ingresos / maxBarValue) * 100}%`,
                          }}
                          title={`${day.fullDate}\nIngresos: ${formatCurrency(day.ingresos, "PEN")}`}
                        >
                          {day.ingresos > 0 && (
                            <span className="bar-value">
                              {formatCurrency(day.ingresos, "PEN")}
                            </span>
                          )}
                        </div>
                        <div
                          className="bar egresos"
                          style={{
                            height: `${(day.egresos / maxBarValue) * 100}%`,
                          }}
                          title={`${day.fullDate}\nEgresos: ${formatCurrency(day.egresos, "PEN")}`}
                        >
                          {day.egresos > 0 && (
                            <span className="bar-value">
                              {formatCurrency(day.egresos, "PEN")}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="bar-label">{day.fecha}</span>
                      {day.totalMovimientos > 0 && (
                        <span className="bar-count">
                          {day.totalMovimientos}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="chart-legend">
                  <div className="legend-item">
                    <span className="legend-color ingresos"></span>
                    <span>Ingresos</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-color egresos"></span>
                    <span>Egresos</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Estadísticas por contexto de pago */}
          <div className="context-stats-section">
            <h3>
              <FaChartPie /> Distribución por Contexto de Pago
            </h3>
            <div className="context-grid">
              {Object.entries(stats.porContextoPago).map(([tipo, data]) => (
                <div key={tipo} className="context-stat-card">
                  <div className="context-header">
                    <h4>{contextoPagoLabels[tipo] || tipo}</h4>
                    <span className="context-total">
                      {data.total} movimientos
                    </span>
                  </div>
                  <div className="context-amounts">
                    <div className="amount-row ingresos">
                      <FaArrowUp />
                      <span>Ingresos:</span>
                      <strong>{formatCurrency(data.ingresos, "PEN")}</strong>
                    </div>
                    <div className="amount-row egresos">
                      <FaArrowDown />
                      <span>Egresos:</span>
                      <strong>{formatCurrency(data.egresos, "PEN")}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Estadísticas por tipo de servicio */}
          <div className="services-stats-section">
            <h3>
              <FaChartPie /> Estadísticas por Tipo de Servicio
            </h3>
            <div className="services-grid">
              {Object.entries(stats.porTipoServicio).map(([tipo, data]) => (
                <div
                  key={tipo}
                  className="service-stat-card"
                  style={{
                    borderLeftColor: tipoServicioColors[tipo] || "#858796",
                  }}
                >
                  <div className="service-header">
                    <h4>{tipoServicioLabels[tipo] || tipo}</h4>
                    <span className="service-total">{data.total} pagos</span>
                  </div>
                  <div className="service-stats">
                    <div className="stat-row paid">
                      <FaCheckCircle />
                      <span>{data.paid} pagados</span>
                      <span className="amount">
                        {formatCurrency(data.montoPagado, "PEN")}
                      </span>
                    </div>
                    <div className="stat-row pending">
                      <FaHourglassHalf />
                      <span>{data.pending} pendientes</span>
                      <span className="amount">
                        {formatCurrency(data.montoPendiente, "PEN")}
                      </span>
                    </div>
                    {data.cancelled > 0 && (
                      <div className="stat-row cancelled">
                        <FaTimesCircle />
                        <span>{data.cancelled} cancelados</span>
                      </div>
                    )}
                  </div>
                  <div className="service-progress">
                    <div
                      className="progress-bar"
                      style={{
                        width: `${data.total > 0 ? (data.paid / data.total) * 100 : 0}%`,
                        backgroundColor: tipoServicioColors[tipo] || "#858796",
                      }}
                    ></div>
                  </div>
                  <div className="service-percentage">
                    {data.total > 0
                      ? ((data.paid / data.total) * 100).toFixed(1)
                      : 0}
                    % completado
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Estadísticas por plataforma */}
          {Object.keys(stats.porPlataforma).length > 1 && (
            <div className="platform-stats-section">
              <h3>
                <FaBuilding /> Distribución por Plataforma
              </h3>
              <div className="platform-grid">
                {Object.entries(stats.porPlataforma).map(([platform, data]) => (
                  <div key={platform} className={`platform-card ${platform}`}>
                    <h4>
                      {platform === "venso"
                        ? " Venso"
                        : platform === "mil"
                          ? " Mil"
                          : platform}
                    </h4>
                    <div className="platform-stats">
                      <div className="stat">
                        <span className="label">Movimientos:</span>
                        <span className="value">{data.total}</span>
                      </div>
                      <div className="stat ingresos">
                        <span className="label">Ingresos:</span>
                        <span className="value">
                          {formatCurrency(data.ingresos, "PEN")}
                        </span>
                      </div>
                      <div className="stat egresos">
                        <span className="label">Egresos:</span>
                        <span className="value">
                          {formatCurrency(data.egresos, "PEN")}
                        </span>
                      </div>
                      <div className="stat balance">
                        <span className="label">Balance:</span>
                        <span
                          className={`value ${data.ingresos - data.egresos >= 0 ? "positive" : "negative"}`}
                        >
                          {formatCurrency(data.ingresos - data.egresos, "PEN")}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
