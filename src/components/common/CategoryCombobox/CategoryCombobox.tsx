import React, { useEffect, useMemo, useState } from "react";
import SmartComboBox from "../SmartComboBox/SmartComboBox";
import { canonicalCategory, isNewCategory } from "../../../utils/categoryOptions";
import "./CategoryCombobox.scss";

/**
 * Selector de categoría de texto libre: sugiere las categorías existentes y
 * permite escribir una nueva. El valor se normaliza al guardar con
 * `canonicalCategory`, no mientras se escribe.
 *
 * Con `commitMode`, `onChange` solo se llama al confirmar (elegir una opción,
 * Enter o salir del campo) y recibe el valor ya normalizado. Útil cuando el
 * padre reagrupa elementos por categoría y no debe hacerlo en cada tecla.
 */
const CategoryCombobox = ({
  value = "",
  onChange,
  options = [],
  placeholder = "Escribe o elige una categoría",
  loading = false,
  className = "",
  portalDropdown = true,
  showNewHint = true,
  commitMode = false,
}) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const current = commitMode ? draft : value;
  const isNew = useMemo(() => isNewCategory(current, options), [current, options]);

  const handleCommit = (next) => {
    const normalized = canonicalCategory(next, options);
    setDraft(normalized);
    if (normalized && normalized !== value) onChange(normalized);
    // Un valor vacío no se confirma: se vuelve a la categoría actual.
    return normalized || value;
  };

  return (
    <div className={`category-combobox ${className}`}>
      <SmartComboBox
        value={value}
        onChange={commitMode ? setDraft : onChange}
        onCommit={commitMode ? handleCommit : undefined}
        createLabel={commitMode && isNew && current !== value ? `Crear «${current.trim()}»` : null}
        options={options}
        placeholder={placeholder}
        loading={loading}
        portalDropdown={portalDropdown}
        filterOnTyping
        hideEmpty
      />
      {showNewHint && isNew && (
        <small className="category-combobox__hint">
          {commitMode ? "Nueva categoría: Enter para usarla." : "Nueva categoría: se creará al guardar."}
        </small>
      )}
    </div>
  );
};

export default CategoryCombobox;
