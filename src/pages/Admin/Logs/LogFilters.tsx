/**
 * Componente de filtros para Logs.
 * Principio de Responsabilidad Única: sólo maneja UI de filtros.
 */
import { useMemo } from "react";
import { Card } from "primereact/card";
import { InputText } from "primereact/inputtext";
import { Dropdown } from "primereact/dropdown";
import { Calendar } from "primereact/calendar";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";
import {
  FaFilter,
  FaChevronDown,
  FaUser,
  FaDatabase,
  FaCalendarAlt,
} from "react-icons/fa";
import { OPERATION_TYPES, ENTITY_TYPES } from "./logConstants";

export default function LogFilters({
  filters,
  setFilters,
  applyFilters,
  resetFilters,
  exportToExcel,
  exportLoading,
  loading,
  totalRecords,
  filtersExpanded,
  setFiltersExpanded,
}) {
  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filters.dniuser) c++;
    if (filters.operation) c++;
    if (filters.entity) c++;
    if (filters.dateFrom) c++;
    if (filters.dateTo) c++;
    return c;
  }, [filters]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") applyFilters();
  };

  return (
    <Card className="filters-card">
      <div
        className="filters-header"
        onClick={() => setFiltersExpanded(!filtersExpanded)}
      >
        <div className="filters-title">
          <FaFilter className="filter-icon" />
          <span>Filtros de búsqueda</span>
          {activeFilterCount > 0 && (
            <Tag
              value={`${activeFilterCount} activo${activeFilterCount > 1 ? "s" : ""}`}
              severity="warning"
              className="active-filter-badge"
            />
          )}
        </div>
        <FaChevronDown
          className={`chevron ${filtersExpanded ? "expanded" : ""}`}
        />
      </div>

      <div className={`filters-content ${filtersExpanded ? "expanded" : ""}`}>
        <div className="filters-grid">
          {/* DNI Usuario */}
          <div className="filter-group">
            <label htmlFor="userFilter">
              <FaUser style={{ marginRight: 6 }} />
              Usuario (DNI)
            </label>
            <InputText
              id="userFilter"
              value={filters.dniuser}
              onChange={(e) =>
                setFilters({ ...filters, dniuser: e.target.value })
              }
              placeholder="Buscar por DNI..."
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Operación */}
          <div className="filter-group">
            <label htmlFor="operationFilter">Tipo de Operación</label>
            <Dropdown
              id="operationFilter"
              value={filters.operation}
              options={OPERATION_TYPES}
              onChange={(e) => setFilters({ ...filters, operation: e.value })}
              placeholder="Seleccionar operación..."
            />
          </div>

          {/* Entidad */}
          <div className="filter-group">
            <label htmlFor="entityFilter">
              <FaDatabase style={{ marginRight: 6 }} />
              Tipo de Entidad
            </label>
            <Dropdown
              id="entityFilter"
              value={filters.entity}
              options={ENTITY_TYPES}
              onChange={(e) => setFilters({ ...filters, entity: e.value })}
              placeholder="Seleccionar entidad..."
              filter
              filterPlaceholder="Buscar entidad..."
            />
          </div>

          {/* Fecha desde */}
          <div className="filter-group">
            <label htmlFor="dateFromFilter">
              <FaCalendarAlt style={{ marginRight: 6 }} />
              Fecha desde
            </label>
            <Calendar
              id="dateFromFilter"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.value })}
              placeholder="Fecha inicial..."
              showIcon
              dateFormat="dd/mm/yy"
              maxDate={filters.dateTo || new Date()}
            />
          </div>

          {/* Fecha hasta */}
          <div className="filter-group">
            <label htmlFor="dateToFilter">
              <FaCalendarAlt style={{ marginRight: 6 }} />
              Fecha hasta
            </label>
            <Calendar
              id="dateToFilter"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.value })}
              placeholder="Fecha final..."
              showIcon
              dateFormat="dd/mm/yy"
              minDate={filters.dateFrom || undefined}
              maxDate={new Date()}
            />
          </div>
        </div>

        <div className="filters-actions">
          <Button
            label="Aplicar Filtros"
            icon="pi pi-search"
            className="p-button-primary"
            onClick={applyFilters}
            disabled={loading}
          />
          <Button
            label="Limpiar Filtros"
            icon="pi pi-times"
            className="p-button-secondary"
            onClick={resetFilters}
            disabled={loading}
          />
          <Button
            label={exportLoading ? "Exportando..." : "Exportar Excel"}
            icon={exportLoading ? "pi pi-spin pi-spinner" : "pi pi-file-excel"}
            className="p-button-success export-btn"
            onClick={() => exportToExcel(filters)}
            disabled={loading || exportLoading || totalRecords === 0}
            tooltip="Exportar registros filtrados a Excel (.xlsx) con múltiples hojas"
            tooltipOptions={{ position: "top" }}
          />
        </div>
      </div>
    </Card>
  );
}
