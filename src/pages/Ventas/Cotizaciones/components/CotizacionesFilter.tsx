import React, { useState } from "react";
import {
  MdSearch,
  MdClear,
  MdFilterList,
  MdExpandMore,
  MdExpandLess,
} from "react-icons/md";
import "./styles/CotizacionesFilter.scss";

const CotizacionesFilter = ({
  filters,
  onInputChange,
  onSearch,
  onClear,
  isLoading,
  resultCount,
  totalCount,
  sellers = [],
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasActiveFilters = Object.values(filters).some((f) => f !== "");

  return (
    <div
      className={`cotizaciones-filter ${hasActiveFilters ? "has-active-filters" : ""}`}
    >
      <div className="filter-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="filter-header-left">
          <MdFilterList className="filter-icon" />
          <span className="filter-title">Filtros de búsqueda</span>
          {hasActiveFilters && (
            <span className="active-filter-count">
              {Object.values(filters).filter((f) => f !== "").length} activo
              {Object.values(filters).filter((f) => f !== "").length > 1
                ? "s"
                : ""}
            </span>
          )}
        </div>
        <div className="filter-header-right">
          {hasActiveFilters && (
            <button
              type="button"
              className="btn-clear-inline"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
            >
              <MdClear /> Limpiar
            </button>
          )}
          {isExpanded ? (
            <MdExpandLess className="toggle-icon" />
          ) : (
            <MdExpandMore className="toggle-icon" />
          )}
        </div>
      </div>

      {isExpanded && (
        <form onSubmit={onSearch} className="filter-form">
          <div className="filter-row">
            <div className="filter-group filter-group--wide">
              <label>Título</label>
              <div className="input-wrapper">
                <MdSearch className="input-icon" />
                <input
                  type="text"
                  name="titulo"
                  value={filters.titulo}
                  onChange={onInputChange}
                  placeholder="Buscar por nombre de cotización..."
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="filter-group">
              <label>Fecha inicio</label>
              <input
                type="date"
                name="fechaInicio"
                value={filters.fechaInicio}
                onChange={onInputChange}
                disabled={isLoading}
              />
            </div>

            <div className="filter-group">
              <label>Fecha fin</label>
              <input
                type="date"
                name="fechaFin"
                value={filters.fechaFin}
                onChange={onInputChange}
                disabled={isLoading}
              />
            </div>

            <div className="filter-group">
              <label>Vendedor</label>
              <div className="select-wrapper seller-select-wrapper">
                <MdFilterList className="select-icon" />
                <select
                  name="vendedor"
                  value={filters.vendedor}
                  onChange={onInputChange}
                  disabled={isLoading}
                >
                  <option value="">Todos los vendedores</option>
                  {sellers.map((seller) => (
                    <option key={seller.dni} value={seller.dni}>
                      {seller.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};

export default CotizacionesFilter;
