import type { ReactNode } from "react";
import { FaThLarge } from "react-icons/fa";

type Category = { id: string; name: string; icon: ReactNode };

export default function ServiciosCategoryTabs({ categories, activeView, onSelect }: {
  categories: Category[]; activeView: string; onSelect: (id: string | null) => void;
}) {
  return <nav className="tabs-header-premium tabs-header-premium--focused" aria-label="Catálogos de servicios">
    <div className="tabs-wrapper">
      {categories.map(category => <button type="button" key={category.id}
        className={`tab-item-premium ${activeView === category.id ? "active" : ""}`}
        onClick={() => onSelect(category.id)} aria-current={activeView === category.id ? "page" : undefined}>
        <span className="tab-icon" aria-hidden="true">{category.icon}</span><span className="tab-text">{category.name}</span>
      </button>)}
    </div>
    <button type="button" className="exit-btn" onClick={() => onSelect(null)} title="Volver al catálogo" aria-label="Ver todos los catálogos">
      <FaThLarge aria-hidden="true" />
    </button>
  </nav>;
}
