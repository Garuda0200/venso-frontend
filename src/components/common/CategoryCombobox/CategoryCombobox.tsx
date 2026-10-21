import React, { useMemo } from "react";
import SmartComboBox from "../SmartComboBox/SmartComboBox";
import { isNewCategory } from "../../../utils/categoryOptions";
import "./CategoryCombobox.scss";

/**
 * Selector de categoría de texto libre: sugiere las categorías existentes y
 * permite escribir una nueva. El valor se normaliza al guardar con
 * `canonicalCategory`, no mientras se escribe.
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
}) => {
  const isNew = useMemo(() => isNewCategory(value, options), [value, options]);

  return (
    <div className={`category-combobox ${className}`}>
      <SmartComboBox
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        loading={loading}
        portalDropdown={portalDropdown}
      />
      {showNewHint && isNew && (
        <small className="category-combobox__hint">
          Nueva categoría: se creará al guardar.
        </small>
      )}
    </div>
  );
};

export default CategoryCombobox;
