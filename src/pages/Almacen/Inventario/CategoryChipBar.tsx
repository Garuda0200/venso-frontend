import React from "react";

/**
 * Filtro de categorías en forma de chips. `category: null` representa "Todas".
 * `getDropProps(chip)` permite convertir cada chip en una zona de soltar.
 */
export default function CategoryChipBar({ chips, onSelect, className = "", getDropProps = undefined }) {
  return (
    <div className={`media-chipbar ${className}`} role="toolbar" aria-label="Filtrar por categoría">
      {chips.map((chip) => (
        <button
          type="button"
          key={chip.category ?? "__all"}
          className={`media-chip ${chip.active ? "media-chip--active" : ""} ${chip.dropOver ? "media-chip--drop" : ""}`}
          onClick={() => onSelect(chip.category)}
          aria-pressed={Boolean(chip.active)}
          {...(getDropProps ? getDropProps(chip) : {})}
        >
          <span>{chip.label}</span>
          <small>{chip.count}</small>
        </button>
      ))}
    </div>
  );
}
