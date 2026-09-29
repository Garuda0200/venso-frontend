import React from "react";
import "./TextAreaField.scss";

/**
 * Componente reutilizable para campos textarea con sugerencias
 * @param {string} id - ID único del campo
 * @param {string} name - Nombre del campo para el form data
 * @param {string} label - Etiqueta visible del campo
 * @param {string} value - Valor actual del campo
 * @param {function} onChange - Handler para cambios
 * @param {boolean} required - Si el campo es obligatorio
 * @param {string} error - Mensaje de error si existe
 * @param {boolean} disabled - Si el campo está deshabilitado
 * @param {string} placeholder - Placeholder para el textarea
 * @param {number} rows - Número de filas del textarea
 * @param {number} maxLength - Longitud máxima permitida
 * @param {boolean} showCounter - Mostrar contador de caracteres
 * @param {Array<string>} suggestions - Array de sugerencias para mostrar como chips
 * @param {function} onSelectSuggestion - Callback al seleccionar una sugerencia
 * @param {number} maxSuggestions - Número máximo de sugerencias a mostrar
 * @param {string} suggestionLabel - Label para las sugerencias
 * @param {string} hint - Texto de ayuda debajo del textarea
 */
const TextAreaField = ({
  id,
  name,
  label,
  value,
  onChange,
  required = false,
  error = null,
  disabled = false,
  placeholder = "",
  rows = 3,
  maxLength = null,
  showCounter = false,
  suggestions = [],
  onSelectSuggestion = null,
  maxSuggestions = 5,
  suggestionLabel = "Sugerencias:",
  hint = null,
  className = "",
}) => {
  const charCount = value ? value.length : 0;
  const showSuggestions =
    !value && suggestions.length > 0 && onSelectSuggestion;

  return (
    <div className={`textarea-field ${className} ${error ? "has-error" : ""}`}>
      <div className="textarea-field-header">
        {label && (
          <label htmlFor={id} className={required ? "required" : ""}>
            {label}
          </label>
        )}
        {showCounter && maxLength && (
          <span
            className={`char-counter ${charCount > maxLength * 0.9 ? "warning" : ""}`}
          >
            {charCount}/{maxLength}
          </span>
        )}
      </div>

      <textarea
        id={id}
        name={name}
        value={value || ""}
        onChange={onChange}
        className={`textarea-control ${error ? "error" : ""}`}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
      />

      {error && <div className="error-message"> {error}</div>}
      {hint && <small className="hint-text">{hint}</small>}

      {showSuggestions && (
        <div className="suggestion-chips">
          <span className="suggestion-label">{suggestionLabel}</span>
          <div className="chips-container">
            {suggestions.slice(0, maxSuggestions).map((suggestion, index) => (
              <button
                key={index}
                type="button"
                className="suggestion-chip"
                onClick={() => onSelectSuggestion(suggestion)}
                disabled={disabled}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TextAreaField;
