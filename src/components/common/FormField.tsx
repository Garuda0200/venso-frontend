import React from "react";
import "./FormField.scss";

/**
 * Componente reutilizable para campos de formulario
 * @param {string} id - ID único del campo
 * @param {string} name - Nombre del campo para el form data
 * @param {string} label - Etiqueta visible del campo
 * @param {string} type - Tipo de input (text, email, number, tel, etc.)
 * @param {string|number} value - Valor actual del campo
 * @param {function} onChange - Handler para cambios
 * @param {string} placeholder - Texto placeholder
 * @param {boolean} required - Si el campo es obligatorio
 * @param {string} error - Mensaje de error si existe
 * @param {number} maxLength - Longitud máxima permitida
 * @param {number} min - Valor mínimo (para type number)
 * @param {number} max - Valor máximo (para type number)
 * @param {number} step - Incremento (para type number)
 * @param {boolean} disabled - Si el campo está deshabilitado
 * @param {string} className - Clases CSS adicionales
 */
const FormField = ({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder = "",
  required = false,
  error = null,
  maxLength = null,
  min = null,
  max = null,
  step = null,
  disabled = false,
  className = "",
}) => {
  return (
    <div className={`form-field ${className} ${error ? "has-error" : ""}`}>
      {label && (
        <label htmlFor={id} className={required ? "required" : ""}>
          {label}
        </label>
      )}
      <input
        type={type}
        id={id}
        name={name}
        value={value || ""}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="form-control"
      />
      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

export default FormField;
