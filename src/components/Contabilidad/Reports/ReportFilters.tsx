import React from "react";
import {
  FaCalendarAlt,
  FaCoins,
  FaWallet,
  FaExchangeAlt,
} from "react-icons/fa";
import "./ReportFilters.scss";

const ReportFilters = ({ filters, onFilterChange, saldos }) => {
  const handleFilterChange = (field, value) => {
    onFilterChange({
      ...filters,
      [field]: value,
    });
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const months = [
    { value: 1, label: "Enero" },
    { value: 2, label: "Febrero" },
    { value: 3, label: "Marzo" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Mayo" },
    { value: 6, label: "Junio" },
    { value: 7, label: "Julio" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Septiembre" },
    { value: 10, label: "Octubre" },
    { value: 11, label: "Noviembre" },
    { value: 12, label: "Diciembre" },
  ];

  const resetFilters = () => {
    onFilterChange({
      mes: new Date().getMonth() + 1,
      año: new Date().getFullYear(),
      moneda: "",
      tipoSaldo: "",
      tipoMovimiento: "",
    });
  };

  return (
    <div className="report-filters">
      <div className="filters-header">
        <h3>Filtros de Reporte</h3>
        <button className="btn-reset" onClick={resetFilters}>
          Limpiar Filtros
        </button>
      </div>

      <div className="filters-grid">
        <div className="filter-group">
          <label>
            <FaCalendarAlt /> Mes
          </label>
          <select
            value={filters.mes}
            onChange={(e) =>
              handleFilterChange("mes", parseInt(e.target.value))
            }
          >
            {months.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>
            <FaCalendarAlt /> Año
          </label>
          <select
            value={filters.año}
            onChange={(e) =>
              handleFilterChange("año", parseInt(e.target.value))
            }
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>
            <FaCoins /> Moneda
          </label>
          <select
            value={filters.moneda}
            onChange={(e) => handleFilterChange("moneda", e.target.value)}
          >
            <option value="">Todas las monedas</option>
            <option value="soles">Soles (S/)</option>
            <option value="dolares">Dólares (US$)</option>
          </select>
        </div>

        <div className="filter-group">
          <label>
            <FaWallet /> Tipo de Saldo
          </label>
          <select
            value={filters.tipoSaldo}
            onChange={(e) => handleFilterChange("tipoSaldo", e.target.value)}
          >
            <option value="">Todos los tipos</option>
            <option value="efectivo">Efectivo</option>
            <option value="cuenta">Cuenta Bancaria</option>
          </select>
        </div>

        <div className="filter-group">
          <label>
            <FaExchangeAlt /> Tipo de Movimiento
          </label>
          <select
            value={filters.tipoMovimiento}
            onChange={(e) =>
              handleFilterChange("tipoMovimiento", e.target.value)
            }
          >
            <option value="">Todos los movimientos</option>
            <option value="ingreso">Solo Ingresos</option>
            <option value="egreso">Solo Egresos</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default ReportFilters;
