import React from "react";
import "./FilterPanel.scss";

/**
 * A reusable filter panel component for structured filters
 * @param {Object} props Component props
 * @param {React.ReactNode} props.children The filter content
 * @param {string} props.title Optional panel title
 * @param {Function} props.onClearAll Optional clear all filters callback
 */
const FilterPanel = ({ children, title = "Filtros Avanzados", onClearAll }) => {
  return (
    <div className="filter-panel">
      <div className="filter-panel-header">
        <h3>{title}</h3>
        {onClearAll && (
          <button className="clear-filters-button" onClick={onClearAll}>
            Limpiar filtros
          </button>
        )}
      </div>
      <div className="filter-panel-content">{children}</div>
    </div>
  );
};

export default FilterPanel;
