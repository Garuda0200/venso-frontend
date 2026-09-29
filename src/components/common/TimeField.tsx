import React from "react";
import { FaClock, FaToggleOff } from "react-icons/fa";
import "./TimeField.scss";

/**
 * Componente reutilizable para campos de tiempo con toggle de habilitación
 * @param {string} id - ID único del campo
 * @param {string} name - Nombre del campo para el form data
 * @param {string} label - Etiqueta visible del campo
 * @param {string} value - Valor actual del campo (formato HH:mm)
 * @param {function} onChange - Handler para cambios en el input
 * @param {boolean} isEnabled - Si el campo está habilitado (controlado externamente)
 * @param {function} onToggle - Callback al cambiar el estado del toggle
 * @param {boolean} required - Si el campo es obligatorio cuando está habilitado
 * @param {string} error - Mensaje de error si existe
 * @param {boolean} disabled - Si el campo está completamente deshabilitado
 * @param {string} placeholder - Placeholder para el input
 * @param {string} enabledHint - Texto que aparece cuando está habilitado
 * @param {string} disabledHint - Texto que aparece cuando está deshabilitado
 * @param {string} nullMessage - Mensaje que se muestra cuando no está habilitado
 */
const TimeField = ({
  id,
  name,
  label,
  value,
  onChange,
  isEnabled = true,
  onToggle = null,
  required = false,
  error = null,
  disabled = false,
  placeholder = "--:--",
  enabledHint = "(hh:mm)",
  disabledHint = "(No especificado)",
  nullMessage = "Se guardará como no especificado (NULL)",
  className = "",
}) => {
  return (
    <div className={`time-field ${className} ${error ? "has-error" : ""}`}>
      <div className="time-field-header">
        <label htmlFor={id} className={required && isEnabled ? "required" : ""}>
          {label} {isEnabled ? enabledHint : disabledHint}
        </label>
      </div>

      <div className="time-input-container">
        <input
          type="time"
          id={id}
          name={name}
          value={value || ""}
          onChange={onChange}
          className={`time-control ${error ? "error" : ""}`}
          disabled={!isEnabled || disabled}
          placeholder={placeholder}
          required={required && isEnabled}
        />

        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className={`toggle-btn ${isEnabled ? "active" : "inactive"}`}
            disabled={disabled}
            title={isEnabled ? `Deshabilitar ${label}` : `Habilitar ${label}`}
          >
            {isEnabled ? <FaClock /> : <FaToggleOff />}
          </button>
        )}
      </div>

      {error && <div className="error-message"> {error}</div>}
      {!isEnabled && nullMessage && (
        <small className="null-message">{nullMessage}</small>
      )}
    </div>
  );
};

export default TimeField;
