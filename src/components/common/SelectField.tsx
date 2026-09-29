import React from "react";
import { FaEdit, FaTimes } from "react-icons/fa";
import "./SelectField.scss";

/**
 * Componente reutilizable para campos select con opción de entrada personalizada
 * @param {string} id - ID único del campo
 * @param {string} name - Nombre del campo para el form data
 * @param {string} label - Etiqueta visible del campo
 * @param {Array} options - Array de opciones [{value: '', label: ''}, ...] o array de strings
 * @param {string|number} value - Valor actual del campo
 * @param {function} onChange - Handler para cambios en el select
 * @param {boolean} required - Si el campo es obligatorio
 * @param {string} error - Mensaje de error si existe
 * @param {boolean} disabled - Si el campo está deshabilitado
 * @param {boolean} isLoading - Si está cargando opciones
 * @param {string} placeholder - Placeholder para el select
 * @param {boolean} allowCustom - Si permite entrada personalizada
 * @param {boolean} isCustomMode - Estado actual del modo personalizado (controlado externamente)
 * @param {function} onToggleCustom - Callback al cambiar modo personalizado
 * @param {string} customPlaceholder - Placeholder para input personalizado
 * @param {number} maxLength - Longitud máxima del input personalizado
 * @param {string} customLabel - Label del botón personalizar
 * @param {string} cancelLabel - Label del botón cancelar
 * @param {boolean} showOtherOption - Mostrar opción "Otro..." al final del select
 */
const SelectField = ({
  id,
  name,
  label,
  options = [],
  value,
  onChange,
  required = false,
  error = null,
  disabled = false,
  isLoading = false,
  placeholder = "Seleccione una opción...",
  allowCustom = false,
  isCustomMode = false,
  onToggleCustom = null,
  customPlaceholder = "Escriba una opción personalizada",
  maxLength = 50,
  customLabel = "Personalizar",
  cancelLabel = "Cancelar",
  showOtherOption = true,
  className = "",
}) => {
  // Normalizar opciones a formato {value, label}
  const normalizedOptions = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt,
  );

  return (
    <div className={`select-field ${className} ${error ? "has-error" : ""}`}>
      <div className="select-field-header">
        {label && (
          <label htmlFor={id} className={required ? "required" : ""}>
            {label}
          </label>
        )}
        {allowCustom && onToggleCustom && (
          <button
            type="button"
            className="custom-toggle-btn"
            onClick={onToggleCustom}
            disabled={disabled}
            title={
              isCustomMode
                ? `${cancelLabel} entrada personalizada`
                : `${customLabel} opción`
            }
          >
            {isCustomMode ? <FaTimes /> : <FaEdit />}
            <span className="btn-text">
              {isCustomMode ? cancelLabel : customLabel}
            </span>
          </button>
        )}
      </div>

      {isCustomMode ? (
        <div className="custom-input-wrapper">
          <input
            type="text"
            id={`${id}_custom`}
            name={name}
            value={value || ""}
            onChange={onChange}
            className={`custom-input ${error ? "error" : ""}`}
            disabled={disabled}
            placeholder={customPlaceholder}
            maxLength={maxLength}
            required={required}
            autoFocus
          />
        </div>
      ) : (
        <select
          id={id}
          name={name}
          value={value || ""}
          onChange={onChange}
          className={`select-control ${error ? "error" : ""}`}
          disabled={disabled || isLoading}
          required={required}
        >
          <option value="">{placeholder}</option>
          {normalizedOptions.map((option, index) => (
            <option key={index} value={option.value}>
              {option.label}
            </option>
          ))}
          {allowCustom && showOtherOption && (
            <option value="Otro">Otro...</option>
          )}
        </select>
      )}

      {error && <div className="error-message"> {error}</div>}
      {isLoading && (
        <small className="loading-text">Cargando opciones...</small>
      )}
    </div>
  );
};

export default SelectField;
