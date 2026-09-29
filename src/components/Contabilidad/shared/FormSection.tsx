import "./FormSection.scss";

const FormSection = ({
  title,
  icon,
  variant = "primary",
  required = false, // true = muestra badge "Requerido"
  optional = false, // true = muestra badge "Opcional"
  showBadge = false, // Solo muestra badge si es explícito
  children,
  className = "",
  compact = false,
  headerAction = null,
}) => {
  return (
    <div
      className={`form-section-v2 form-section-${variant} ${compact ? "compact" : ""} ${className}`}
    >
      {title && (
        <div className="section-header">
          <div className="section-title-group">
            {icon && <span className="section-icon">{icon}</span>}
            <h3 className="section-title">{title}</h3>
            {showBadge && required && (
              <span className="required-badge">Requerido</span>
            )}
            {showBadge && optional && (
              <span className="optional-badge">Opcional</span>
            )}
          </div>
          {headerAction && (
            <div className="section-header-action">{headerAction}</div>
          )}
        </div>
      )}
      <div className="section-content">{children}</div>
    </div>
  );
};

export default FormSection;
