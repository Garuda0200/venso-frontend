import React from "react";
import { MdSearchOff } from "react-icons/md";
import "./styles/CotizacionesEmpty.scss";

const CotizacionesEmpty = ({ hasFilters, onClearFilters }) => {
  return (
    <div className="cotizaciones-empty">
      <MdSearchOff className="empty-icon" />
      <h3>Sin resultados</h3>
      <p>
        {hasFilters
          ? "No se encontraron cotizaciones con los filtros aplicados"
          : "No hay cotizaciones disponibles"}
      </p>
      {hasFilters && (
        <button className="btn-clear-filters" onClick={onClearFilters}>
          Limpiar filtros
        </button>
      )}
    </div>
  );
};

export default CotizacionesEmpty;
