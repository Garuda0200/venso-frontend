import React from "react";
import { FaCalendarAlt, FaTimes } from "react-icons/fa";
import "./DateRangeFilter.scss";

/**
 * Componente presentacional para filtro de rango de fechas
 * Sigue principios de arquitectura hexagonal - UI pura sin lógica de negocio
 */
export const DateRangeFilter = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClear,
}) => {
  return (
    <div className="date-range-filter">
      <div className="filter-header">
        <FaCalendarAlt className="filter-icon" />
        <span className="filter-label">Filtrar por fecha de solicitud</span>
      </div>

      <div className="filter-inputs">
        <div className="date-input-group">
          <label htmlFor="start-date">Desde</label>
          <input
            id="start-date"
            type="date"
            value={startDate || ""}
            onChange={(e) => onStartDateChange(e.target.value || null)}
            className="date-input"
          />
        </div>

        <div className="date-input-group">
          <label htmlFor="end-date">Hasta</label>
          <input
            id="end-date"
            type="date"
            value={endDate || ""}
            onChange={(e) => onEndDateChange(e.target.value || null)}
            className="date-input"
          />
        </div>

        {(startDate || endDate) && (
          <button
            className="clear-filter-btn"
            onClick={onClear}
            title="Limpiar filtro"
          >
            <FaTimes />
            <span>Limpiar</span>
          </button>
        )}
      </div>
    </div>
  );
};
