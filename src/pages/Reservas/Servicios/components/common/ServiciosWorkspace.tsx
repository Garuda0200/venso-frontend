import { useMemo, useState, type ReactNode } from "react";
import { ServiciosProviderContext, type ProviderSnapshot } from "../../context/ServiciosProviderContext";
import { isProviderCategory } from "../../utils/providerCatalogue";
import ProviderSidebar from "./ProviderSidebar";

/** Category changes reset navigation; agency changes retain the selected universal provider. */
export default function ServiciosWorkspace({ category, children }: { category: string | null; children: ReactNode }) {
  const [selectedId, select] = useState<string | null>(null);
  const [snapshot, publish] = useState<ProviderSnapshot>({ providers: [], loading: true, error: null });
  const navigation = useMemo(() => ({ selectedId, select, publish }), [selectedId]);
  const hasProviders = isProviderCategory(category);

  return <ServiciosProviderContext.Provider value={navigation}>
    <div className={`services-workspace ${category ? "services-workspace--focused" : ""} ${hasProviders ? "services-workspace--providers" : ""}`}>
      {hasProviders && <ProviderSidebar category={category} snapshot={snapshot} selectedId={selectedId} onSelect={select} />}
      <div className="main-content-servicios">{children}</div>
    </div>
  </ServiciosProviderContext.Provider>;
}
