import React from "react";
import { FaRegTimesCircle, FaCheck } from "react-icons/fa";
import "./TarifaFilterPanel.scss";

/**
 * TarifaFilterPanel - Componente reutilizable para filtros de tipo_tarifa
 * Proporciona una UI estética y consistente para filtrar tarifas internas/externas
 */
const TarifaFilterPanel = ({
  tipoTarifaFilter = [],
  onChange = () => {},
  onClear = () => {},
  label = "Filtrar por Tarifas",
}) => {
  const handleToggle = (tipo) => {
    const newFilter = tipoTarifaFilter.includes(tipo)
      ? tipoTarifaFilter.filter((t) => t !== tipo)
      : [...tipoTarifaFilter, tipo];
    onChange(newFilter);
  };

  const isActive = tipoTarifaFilter.length > 0;

  return (
    <div className="tarifa-filter-panel">
      <div className="filter-header">
        <h4 className="filter-title">{label}</h4>
        {isActive && (
          <button className="clear-filter-btn" onClick={onClear}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="filter-checkboxes">
        <div
          className={`filter-checkbox ${tipoTarifaFilter.includes("interna") ? "checked" : ""}`}
          onClick={() => handleToggle("interna")}
        >
          <input
            type="checkbox"
            checked={tipoTarifaFilter.includes("interna")}
            readOnly
          />
          <span className="tarifa-type interna">
            <span className="tarifa-badge interna">INT</span>
            Confidencial
          </span>
          {tipoTarifaFilter.includes("interna") && (
            <FaCheck className="check-icon" />
          )}
        </div>

        <div
          className={`filter-checkbox ${tipoTarifaFilter.includes("externa") ? "checked" : ""}`}
          onClick={() => handleToggle("externa")}
        >
          <input
            type="checkbox"
            checked={tipoTarifaFilter.includes("externa")}
            readOnly
          />
          <span className="tarifa-type externa">
            <span className="tarifa-badge externa">EXT</span>
            Pública
          </span>
          {tipoTarifaFilter.includes("externa") && (
            <FaCheck className="check-icon" />
          )}
        </div>
      </div>

      {isActive && (
        <div className="filter-active-tags">
          {tipoTarifaFilter.map((tipo) => (
            <div key={tipo} className="filter-tag">
              <span className={`tag-badge ${tipo}`}>
                {tipo === "interna" ? "CONFIDENCIAL" : "PÚBLICA"}
              </span>
              <button
                className="tag-close"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggle(tipo);
                }}
                aria-label={`Quitar filtro ${tipo}`}
              >
                <FaRegTimesCircle />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TarifaFilterPanel;
