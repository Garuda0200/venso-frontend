import { useMemo, useState } from "react";
import { FaChevronRight, FaList, FaSearch } from "react-icons/fa";
import { PROVIDER_CATALOGUES, filterCatalogueProviders, type ProviderCategory } from "../../utils/providerCatalogue";
import type { ProviderSnapshot } from "../../context/ServiciosProviderContext";
import "./ProviderSidebar.scss";

export default function ProviderSidebar({ category, snapshot, selectedId, onSelect }: {
  category: ProviderCategory; snapshot: ProviderSnapshot; selectedId: string | null; onSelect: (id: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const providers = useMemo(() => filterCatalogueProviders(snapshot.providers, search), [snapshot.providers, search]);
  const config = PROVIDER_CATALOGUES[category];

  return <aside className="services-provider-sidebar" aria-label={`Proveedores de ${config.label}`} aria-busy={snapshot.loading}>
    <div className="services-provider-sidebar__heading"><h2>{config.label}</h2><span>{snapshot.providers.length}</span></div>
    <select className="services-provider-sidebar__select" aria-label="Proveedor" disabled={snapshot.loading}
      value={selectedId || ""} onChange={event => onSelect(event.target.value || null)}>
      <option value="">Gestionar proveedores</option>
      {snapshot.providers.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
    </select>
    <button type="button" className="services-provider-sidebar__manage" aria-current={!selectedId ? "page" : undefined} onClick={() => onSelect(null)}>
      <FaList aria-hidden="true" /><span>Gestionar proveedores</span>
    </button>
    <label className="services-provider-sidebar__search"><FaSearch aria-hidden="true" />
      <input type="search" placeholder="Buscar proveedor…" aria-label="Buscar proveedor" value={search} onChange={event => setSearch(event.target.value)} />
    </label>
    <div className="services-provider-sidebar__list">
      {snapshot.loading ? <div role="status" aria-label="Cargando proveedores" className="services-provider-sidebar__loading">
        {[0, 1, 2, 3].map(index => <span key={index} aria-hidden="true" />)}
      </div> : snapshot.error ? <p role="alert">{snapshot.error}</p> : providers.length === 0 ?
        <p role="status">{search ? "Sin coincidencias" : "Sin proveedores registrados"}</p> :
        providers.map(provider => <button type="button" key={provider.id} className="services-provider-sidebar__item"
          aria-current={selectedId === provider.id ? "page" : undefined} aria-label={`Ver ${config.services.toLowerCase()} de ${provider.name}`}
          onClick={() => onSelect(provider.id)}>
          <span><strong>{provider.name}</strong>{provider.detail && <small>{provider.detail}</small>}</span><FaChevronRight aria-hidden="true" />
        </button>)}
    </div>
  </aside>;
}
