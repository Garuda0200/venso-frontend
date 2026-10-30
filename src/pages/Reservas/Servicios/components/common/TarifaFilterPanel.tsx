import React from "react";
import { FaCheck } from "react-icons/fa";
import "./TarifaFilterPanel.scss";

const TarifaFilterPanel = ({ tipoTarifaFilter = [], onChange = (_value) => {}, onClear = () => {}, label = "Tipos de tarifa" }) => (
  <div className="tarifa-filter-panel" role="group" aria-label={label}>
    <div className="filter-checkboxes">
      {[["interna", "Confidencial"], ["externa", "Pública"]].map(([value, title]) => {
        const selected = tipoTarifaFilter.includes(value);
        return <button key={value} type="button" className={`filter-checkbox ${selected ? "checked" : ""}`} aria-pressed={selected}
          onClick={() => onChange(selected ? tipoTarifaFilter.filter(item => item !== value) : [...tipoTarifaFilter, value])}>
          {selected && <FaCheck aria-hidden="true" />}{title}
        </button>;
      })}
    </div>
    {tipoTarifaFilter.length > 0 && <button type="button" className="clear-filter-btn" onClick={onClear}>Limpiar</button>}
  </div>
);
export default TarifaFilterPanel;
