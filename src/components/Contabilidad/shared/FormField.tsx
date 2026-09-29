import React from "react";
import "./FormField.scss";

/**
 * Campo de formulario reutilizable con label y validación
 * @param {string} label - Etiqueta del campo
 * @param {boolean} required - Si el campo es obligatorio
 * @param {string} error - Mensaje de error
 * @param {string} hint - Texto de ayuda
 * @param {React.ReactNode} children - Input o control
 * @param {string} className - Clases adicionales
 * @param {boolean} inline - Si el campo es inline (horizontal)
 */
const FormField = ({
  label,
  required = false,
  error = "",
  hint = "",
  children,
  className = "",
  inline = false,
  htmlFor = "",
}) => {
  return (
    <div
      className={`form-field-v2 ${inline ? "inline" : ""} ${error ? "has-error" : ""} ${className}`}
    >
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
          {required && <span className="required-asterisk">*</span>}
        </label>
      )}
      <div className="field-control">{children}</div>
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
};

export default FormField;
