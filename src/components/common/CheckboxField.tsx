import React from "react";
import "./CheckboxField.scss";

/**
 * Componente reutilizable para campos checkbox
 * @param {string} id - ID único del campo
 * @param {string} name - Nombre del campo para el form data
 * @param {string} label - Etiqueta visible del campo
 * @param {boolean} checked - Si el checkbox está marcado
 * @param {function} onChange - Handler para cambios
 * @param {boolean} disabled - Si el campo está deshabilitado
 * @param {string} description - Descripción adicional debajo del label
 * @param {string} error - Mensaje de error si existe
 * @param {string} position - Posición del checkbox ('left' | 'right')
 */
const CheckboxField = ({
  id,
  name,
  label,
  checked = false,
  onChange,
  disabled = false,
  description = null,
  error = null,
  position = "left",
  className = "",
}) => {
  return (
    <div className={`checkbox-field ${className} ${error ? "has-error" : ""}`}>
      <div className={`checkbox-container position-${position}`}>
        <input
          type="checkbox"
          id={id}
          name={name}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="checkbox-input"
        />
        <label htmlFor={id} className="checkbox-label">
          <span className="checkbox-box">
            {checked && (
              <svg viewBox="0 0 24 24" className="checkbox-icon">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            )}
          </span>
          <span className="checkbox-text">
            {label}
            {description && (
              <small className="checkbox-description">{description}</small>
            )}
          </span>
        </label>
      </div>
      {error && <div className="error-message"> {error}</div>}
    </div>
  );
};

export default CheckboxField;
