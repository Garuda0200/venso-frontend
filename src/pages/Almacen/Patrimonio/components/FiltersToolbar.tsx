import { useState } from "react";
import {
  FaSearch,
  FaSlidersH,
  FaTimes,
  FaUndo,
} from "react-icons/fa";
import { ESTADOS } from "../constants";

export default function FiltersToolbar({
  filters,
  categories,
  onChange,
  onClear,
}) {
  const [expanded, setExpanded] = useState(false);

  const hasFilters = Boolean(
    filters.q ||
      filters.categoria ||
      filters.estado ||
      filters.ubicacion ||
      filters.responsable ||
      filters.include_inactive,
  );

  return (
    <section className="patrimonio-toolbar">
      <div className="patrimonio-toolbar-main">
        <label className="patrimonio-search">
          <FaSearch />
          <input
            value={filters.q}
            onChange={(event) => onChange("q", event.target.value)}
            placeholder="Buscar código, equipo, atributo o dato registrado"
          />
        </label>
        <button
          type="button"
          className="patrimonio-filter-toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          <FaSlidersH />
          <span>Filtros avanzados</span>
          {hasFilters && <span className="patrimonio-filter-badge" />}
        </button>
      </div>

      <div className={`patrimonio-toolbar-filters ${expanded ? "is-open" : ""}`}>
        <label>
          <span>Categoría</span>
          <select
            value={filters.categoria}
            onChange={(event) => onChange("categoria", event.target.value)}
          >
            <option value="">Todas</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Estado</span>
          <select
            value={filters.estado}
            onChange={(event) => onChange("estado", event.target.value)}
          >
            <option value="">Todos</option>
            {ESTADOS.map((state) => (
              <option key={state.value} value={state.value}>{state.label}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Ubicación</span>
          <input
            value={filters.ubicacion}
            onChange={(event) => onChange("ubicacion", event.target.value)}
            placeholder="Oficina, área o almacén"
          />
        </label>

        <label>
          <span>Responsable</span>
          <input
            value={filters.responsable}
            onChange={(event) => onChange("responsable", event.target.value)}
            placeholder="Nombre o DNI"
          />
        </label>

        <button
          type="button"
          className={`patrimonio-toggle ${filters.include_inactive ? "active" : ""}`}
          onClick={() => onChange("include_inactive", !filters.include_inactive)}
        >
          <FaUndo /> Mostrar inactivos
        </button>
      </div>

      {hasFilters && (
        <button type="button" className="patrimonio-clear-filters" onClick={onClear}>
          <FaTimes /> Limpiar filtros
        </button>
      )}
    </section>
  );
}
