import React from "react";

/**
 * Filtro de categorías en forma de chips. `category: null` representa "Todas".
 */
export default function CategoryChipBar({ chips, onSelect, className = "" }) {
  return (
    <div className={`media-chipbar ${className}`} role="toolbar" aria-label="Filtrar por categoría">
      {chips.map((chip) => (
        <button
          type="button"
          key={chip.category ?? "__all"}
          className={`media-chip ${chip.active ? "media-chip--active" : ""}`}
          onClick={() => onSelect(chip.category)}
          aria-pressed={Boolean(chip.active)}
        >
          <span>{chip.label}</span>
          <small>{chip.count}</small>
        </button>
      ))}
    </div>
  );
}
