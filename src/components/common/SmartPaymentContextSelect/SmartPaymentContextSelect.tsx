import React, { useState, useEffect } from "react";
import { FaPencilAlt, FaChevronDown } from "react-icons/fa";
import "./SmartPaymentContextSelect.scss";

const SmartPaymentContextSelect = ({
  id,
  name,
  value,
  onChange,
  existingContexts = [],
  allContexts = [],
  placeholder = "-- Seleccionar contexto --",
  className = "",
  hiddenOptions = [],
}) => {
  const [isManual, setIsManual] = useState(false);

  // Auto-detect if current value is custom (not in predefined lists)
  useEffect(() => {
    // Verificar que value sea un string antes de usar trim
    if (value && typeof value === "string" && value.trim() !== "") {
      const allPredefinedContexts = allContexts.flatMap((group) =>
        group.contexts.map((ctx) => ctx.value),
      );
      const isCustomValue = !allPredefinedContexts.includes(value);
      setIsManual(isCustomValue);
    }
  }, [value, allContexts]);

  // Filtrar contextos ocultos
  const filteredContexts = allContexts
    .map((group) => ({
      ...group,
      contexts: group.contexts.filter(
        (ctx) => !hiddenOptions.includes(ctx.value),
      ),
    }))
    .filter((group) => group.contexts.length > 0);

  const filteredExistingContexts = existingContexts.filter(
    (ctx) => !hiddenOptions.includes(ctx),
  );

  const toggleMode = () => {
    setIsManual(!isManual);
  };

  const handleChange = (e) => {
    onChange(e);
  };

  return (
    <div className={`smart-payment-context-select ${className}`}>
      {isManual ? (
        <div className="manual-mode">
          <input
            type="text"
            id={id}
            name={name}
            value={value}
            onChange={handleChange}
            placeholder="Ingresar contexto personalizado"
            className="manual-input"
          />
          <button
            type="button"
            className="toggle-button"
            onClick={toggleMode}
            title="Cambiar a selector de contextos predefinidos"
          >
            <FaChevronDown />
          </button>
        </div>
      ) : (
        <div className="select-mode">
          <select
            id={id}
            name={name}
            value={value}
            onChange={handleChange}
            className="context-select"
          >
            <option value="">{placeholder}</option>

            {/* Existing contexts from database (recently used) */}
            {filteredExistingContexts &&
              filteredExistingContexts.length > 0 && (
                <optgroup label=" Usados Recientemente">
                  {filteredExistingContexts.map((context) => (
                    <option key={`existing-${context}`} value={context}>
                      {context}
                    </option>
                  ))}
                </optgroup>
              )}

            {/* Grouped predefined contexts */}
            {filteredContexts.map((group, idx) => (
              <optgroup key={`group-${idx}`} label={group.category}>
                {group.contexts.map((ctx) => (
                  <option key={`ctx-${ctx.value}`} value={ctx.value}>
                    {ctx.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <button
            type="button"
            className="toggle-button"
            onClick={toggleMode}
            title="Cambiar a entrada manual"
          >
            <FaPencilAlt />
          </button>
        </div>
      )}
    </div>
  );
};

export default SmartPaymentContextSelect;
