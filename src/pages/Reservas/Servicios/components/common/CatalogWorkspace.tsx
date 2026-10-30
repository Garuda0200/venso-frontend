import React, { Children, isValidElement } from "react";

// Keep each catalogue's filters and handlers in one header, with one records
// viewport. React owns the layout; no DOM nodes move after rendering.
export default function CatalogWorkspace({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const navigation: React.ReactNode[] = [], headings: React.ReactNode[] = [], filters: React.ReactNode[] = [], records: React.ReactNode[] = [];
  Children.toArray(children).forEach(child => {
    const classes = isValidElement<{ className?: string }>(child) ? child.props.className || "" : "";
    if (/\bback-navigation\b/.test(classes)) navigation.push(child);
    else if (/\b(header-dashboard|header-with-actions)\b/.test(classes)) headings.push(child);
    else if (/\b(filters-wrapper|filters-container|search-container|filter-panel)\b/.test(classes)) filters.push(child);
    else records.push(child);
  });
  return <section className={`catalogue-workspace ${navigation.length ? "catalogue-workspace--provider" : ""} entity-view-container premium-design ${className}`}>
    <header className="catalogue-toolbar" aria-label="Búsqueda, filtros y acciones del catálogo">
      <div className="catalogue-toolbar__heading">{navigation}{headings}</div>
      {filters.length > 0 && <div className="catalogue-toolbar__filters">{filters}</div>}
    </header>
    <div className="catalogue-records" role="region" aria-label="Registros del catálogo" tabIndex={0}>{records}</div>
  </section>;
}
