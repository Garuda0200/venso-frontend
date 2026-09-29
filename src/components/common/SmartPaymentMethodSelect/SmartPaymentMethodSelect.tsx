import React, { useState, useEffect, useRef } from "react";
import { FaChevronDown, FaPencilAlt } from "react-icons/fa";
import "./SmartPaymentMethodSelect.scss";

/**
 * SmartPaymentMethodSelect - Selector inteligente de métodos de pago
 * Muestra primero los métodos usados recientemente, luego los predefinidos
 * Permite entrada manual para métodos personalizados
 */
const SmartPaymentMethodSelect = ({
  value,
  onChange,
  existingMethods = [],
  allMethods = [],
  placeholder = "-- Seleccionar método --",
  name = "metodo_pago",
  id = "metodo_pago",
}) => {
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const inputRef = useRef(null);

  // Determinar si el valor actual es un método personalizado (no está en la lista)
  useEffect(() => {
    if (value) {
      const isExisting =
        Array.isArray(existingMethods) &&
        existingMethods.some((m) => m.value === value);
      const isPredefined =
        Array.isArray(allMethods) &&
        allMethods.some(
          (group) =>
            Array.isArray(group.methods) &&
            group.methods.some((m) => m.value === value),
        );

      if (!isExisting && !isPredefined) {
        setIsManualMode(true);
        setManualValue(value);
      } else {
        setIsManualMode(false);
        setManualValue("");
      }
    }
  }, [value, existingMethods, allMethods]);

  // Focus en el input cuando se activa modo manual
  useEffect(() => {
    if (isManualMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isManualMode]);

  const handleSelectChange = (e) => {
    const newValue = e.target.value;
    onChange({ target: { name, value: newValue } });
  };

  const handleManualChange = (e) => {
    const newValue = e.target.value;
    setManualValue(newValue);
    onChange({ target: { name, value: newValue } });
  };

  const toggleManualMode = () => {
    if (isManualMode) {
      // Salir de modo manual
      setIsManualMode(false);
      setManualValue("");
      onChange({ target: { name, value: "" } });
    } else {
      // Entrar en modo manual
      setIsManualMode(true);
      setManualValue(value || "");
    }
  };

  return (
    <div className="smart-payment-method-select">
      {!isManualMode ? (
        <>
          <select
            id={id}
            name={name}
            value={value || ""}
            onChange={handleSelectChange}
            className="form-control"
          >
            <option value="">{placeholder}</option>

            {/* Métodos existentes/usados recientemente */}
            {Array.isArray(existingMethods) && existingMethods.length > 0 && (
              <optgroup label=" Usados Recientemente">
                {existingMethods.map((method) => (
                  <option key={`existing-${method.value}`} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </optgroup>
            )}

            {/* Métodos predefinidos agrupados */}
            {Array.isArray(allMethods) &&
              allMethods.map(({ category, methods }) => (
                <optgroup key={category} label={category}>
                  {Array.isArray(methods) &&
                    methods.map((method) => (
                      <option
                        key={`predefined-${method.value}`}
                        value={method.value}
                      >
                        {method.label}
                      </option>
                    ))}
                </optgroup>
              ))}
          </select>

          <button
            type="button"
            className="btn-manual-mode"
            onClick={toggleManualMode}
            title="Ingresar método personalizado"
          >
            <FaPencilAlt />
          </button>
        </>
      ) : (
        <>
          <input
            ref={inputRef}
            type="text"
            id={id}
            name={name}
            value={manualValue}
            onChange={handleManualChange}
            placeholder="Ingrese método de pago personalizado"
            className="form-control manual-input"
          />

          <button
            type="button"
            className="btn-select-mode"
            onClick={toggleManualMode}
            title="Volver a lista de métodos"
          >
            <FaChevronDown /> Lista
          </button>
        </>
      )}
    </div>
  );
};

export default SmartPaymentMethodSelect;
