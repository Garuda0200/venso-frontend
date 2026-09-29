import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MdArrowDropDown, MdClose } from "react-icons/md";
import { filterSmartComboBoxOptions } from "./smartComboBoxSearch";
import "./SmartComboBox.scss";

/**
 * SmartComboBox Component
 *
 * Un combobox inteligente que permite escribir libremente o seleccionar de opciones sugeridas.
 *
 * @param {string} value - Valor actual del input
 * @param {function} onChange - Callback cuando cambia el valor (recibe string)
 * @param {Array<string>} options - Lista de opciones sugeridas
 * @param {string} placeholder - Texto placeholder
 * @param {boolean} loading - Indicador de carga de opciones
 * @param {string} className - Clases CSS adicionales
 * @param {boolean} portalDropdown - Renderiza las sugerencias en body para escapar de overflow/stacking contexts
 */
const SmartComboBox = ({
  value = "",
  onChange,
  options = [],
  placeholder = "Escriba o seleccione...",
  loading = false,
  className = "",
  onKeyDown: externalOnKeyDown,
  multiline = false,
  autoFocus = false,
  maxVisibleOptions = 60,
  portalDropdown = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const [portalStyle, setPortalStyle] = useState(null);

  const filteredOptions = useMemo(
    () => filterSmartComboBoxOptions(options, inputValue),
    [inputValue, options],
  );
  const visibleOptions = useMemo(
    () => filteredOptions.slice(0, Math.max(1, maxVisibleOptions)),
    [filteredOptions, maxVisibleOptions],
  );

  // Sincronizar con prop value
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    if (highlightedIndex >= visibleOptions.length) {
      setHighlightedIndex(-1);
    }
  }, [visibleOptions.length, highlightedIndex]);

  const updatePortalPosition = () => {
    if (!portalDropdown || !containerRef.current || typeof window === "undefined") {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 4;
    const preferredHeight = 300;
    const minimumUsefulHeight = 140;
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - viewportPadding);
    const spaceAbove = Math.max(0, rect.top - viewportPadding);
    const placeAbove =
      spaceBelow < minimumUsefulHeight && spaceAbove > spaceBelow;
    const availableHeight = Math.max(
      96,
      Math.min(
        preferredHeight,
        placeAbove ? spaceAbove - gap : spaceBelow - gap,
      ),
    );

    const width = Math.max(
      180,
      Math.min(rect.width, window.innerWidth - viewportPadding * 2),
    );
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
    );

    setPortalStyle({
      position: "fixed",
      left,
      width,
      maxHeight: availableHeight,
      ...(placeAbove
        ? { bottom: window.innerHeight - rect.top + gap, top: "auto" }
        : { top: rect.bottom + gap, bottom: "auto" }),
    });
  };

  useLayoutEffect(() => {
    if (!isOpen || !portalDropdown) return undefined;

    updatePortalPosition();
    const handleViewportChange = () => updatePortalPosition();
    window.addEventListener("resize", handleViewportChange);
    // `true` captura scrolls de cualquier contenedor padre del editor.
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen, portalDropdown, inputValue, visibleOptions.length, loading]);

  useEffect(() => {
    if (!autoFocus) return undefined;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      setIsOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocus]);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target) &&
        !dropdownRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setHighlightedIndex(-1);
    setIsOpen(true);
    onChange(newValue);
  };

  const handleOptionSelect = (option) => {
    setInputValue(option);
    setIsOpen(false);
    setHighlightedIndex(-1);
    onChange(option);
    inputRef.current?.blur();
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setInputValue("");
    setHighlightedIndex(-1);
    setIsOpen(true);
    onChange("");
    inputRef.current?.focus();
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown" && isOpen && visibleOptions.length > 0) {
      e.preventDefault();
      setHighlightedIndex((current) =>
        current < visibleOptions.length - 1 ? current + 1 : 0,
      );
      return;
    }

    if (e.key === "ArrowUp" && isOpen && visibleOptions.length > 0) {
      e.preventDefault();
      setHighlightedIndex((current) =>
        current > 0 ? current - 1 : visibleOptions.length - 1,
      );
      return;
    }

    if (
      e.key === "Enter" &&
      isOpen &&
      highlightedIndex >= 0 &&
      visibleOptions[highlightedIndex]
    ) {
      e.preventDefault();
      e.stopPropagation();
      handleOptionSelect(visibleOptions[highlightedIndex]);
      return;
    }

    if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
      inputRef.current?.blur();
    }

    if (externalOnKeyDown) externalOnKeyDown(e);
  };

  const toggleDropdown = () => {
    setIsOpen((current) => !current);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const dropdown = isOpen ? (
    <div
      ref={dropdownRef}
      className={`combobox-dropdown${portalDropdown ? " combobox-dropdown--portal" : ""}`}
      style={portalDropdown ? portalStyle || undefined : undefined}
    >
      {loading ? (
        <div className="dropdown-loading">Cargando opciones...</div>
      ) : visibleOptions.length > 0 ? (
        <>
          <ul className="dropdown-list" role="listbox">
            {visibleOptions.map((option, index) => (
              <li
                key={`${option}-${index}`}
                className={`dropdown-option ${inputValue === option ? "selected" : ""} ${highlightedIndex === index ? "highlighted" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleOptionSelect(option)}
                role="option"
                aria-selected={inputValue === option}
              >
                {option}
              </li>
            ))}
          </ul>
          {filteredOptions.length > visibleOptions.length && (
            <div className="dropdown-more">
              Mostrando {visibleOptions.length} de {filteredOptions.length}.
              Escribe para filtrar.
            </div>
          )}
        </>
      ) : (
        <div className="dropdown-empty">
          {inputValue
            ? "No se encontraron coincidencias"
            : "No hay opciones disponibles"}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={`smart-combobox ${className}`}>
      <div className="combobox-input-wrapper">
        {multiline ? (
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="combobox-input combobox-textarea"
            rows={Math.max(1, Math.ceil((inputValue || "").length / 40))}
            autoFocus={autoFocus}
            aria-autocomplete="list"
            aria-expanded={isOpen}
          />
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="combobox-input"
            autoFocus={autoFocus}
            aria-autocomplete="list"
            aria-expanded={isOpen}
          />
        )}
        <div className="combobox-actions">
          {inputValue && (
            <button
              type="button"
              className="clear-btn"
              onClick={handleClear}
              title="Limpiar"
            >
              <MdClose size={18} />
            </button>
          )}
          <button
            type="button"
            className="dropdown-btn"
            onClick={toggleDropdown}
            title="Ver opciones"
          >
            <MdArrowDropDown size={20} className={isOpen ? "rotated" : ""} />
          </button>
        </div>
      </div>

      {portalDropdown && typeof document !== "undefined"
        ? createPortal(dropdown, document.body)
        : dropdown}
    </div>
  );
};

export default SmartComboBox;
