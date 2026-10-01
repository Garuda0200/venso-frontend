import { catalogueBase, catalogueFacets, catalogueFacetValues, catalogueParentId, catalogueProviderName } from "../utils/catalogueFilters";
import { FaFilter } from "react-icons/fa";
import { useState } from "react";

export default function ServicePickerFilters({ category, parents, services, providerIds, facets, capacity, quotationPax, onProvidersChange, onFacetsChange, onCapacityChange, onReset }) {
  const [expanded, setExpanded] = useState(false);
  const providerOptions = [...new Map(parents.map(parent => {
    const id = catalogueParentId(parent, category);
    return [id, { id, name: catalogueProviderName(catalogueBase(parent, category)) }] as const;
  })).values()].filter(parent => parent.id);
  return (
    <aside className="venso-picker-filters" aria-label="Filtros de servicios">
      <header><h3><FaFilter /> Filtros</h3><button type="button" className="venso-picker-filters__toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Ocultar filtros" : "Mostrar filtros"}</button><button type="button" onClick={onReset}>Restablecer</button></header>
      <div className={`venso-picker-filters__body${expanded ? " is-expanded" : ""}`}>
      {["transportes", "endoses"].includes(category) && (
        <label className="venso-picker-filters__capacity">Capacidad mínima
          <div><input aria-label="Capacidad mínima en pasajeros" type="number" min="0" step="1" value={capacity || ""} placeholder="Sin filtro" onChange={event => onCapacityChange(Math.max(0, Math.floor(Number(event.target.value) || 0)))} /><span>pax</span></div>
          <button type="button" onClick={() => onCapacityChange(quotationPax)}>Usar {quotationPax} pax</button>
        </label>
      )}
      {(catalogueFacets[category] || []).map(({ field, label }) => {
        const options = [...new Set<string>(services.flatMap(item => catalogueFacetValues(item, category, field, parents)))].sort((a, b) => a.localeCompare(b));
        if (!options.length) return null;
        return <label key={field}>{label}<select aria-label={label} value={facets[field] || ""} onChange={event => onFacetsChange({ ...facets, [field]: event.target.value })}><option value="">Todos</option>{options.map(value => <option key={value} value={value}>{value}</option>)}</select></label>;
      })}
      {providerOptions.length > 0 && <fieldset><legend>{category === "tickets" ? "Entradas" : "Proveedores"}</legend>
        {providerOptions.map(provider => <label className="venso-picker-filters__provider" key={provider.id}><input type="checkbox" checked={providerIds.includes(provider.id)} onChange={() => onProvidersChange(providerIds.includes(provider.id) ? providerIds.filter(id => id !== provider.id) : [...providerIds, provider.id])} /><span>{provider.name}</span></label>)}
      </fieldset>}
      </div>
    </aside>
  );
}
