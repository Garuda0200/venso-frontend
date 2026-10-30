import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { catalogueProviders, providerId, type CatalogueProvider, type ProviderCategory, type ProviderRecord } from "../utils/providerCatalogue";

export type ProviderSnapshot = { providers: CatalogueProvider[]; loading: boolean; error: string | null };
type ProviderNavigation = {
  selectedId: string | null;
  select: (id: string | null) => void;
  publish: (snapshot: ProviderSnapshot) => void;
};

export const ServiciosProviderContext = createContext<ProviderNavigation | null>(null);

/** The parent catalogue supplies its existing records; navigation does not fetch a second copy. */
export function useProviderCatalogue(category: ProviderCategory, rows: ProviderRecord[], loading: boolean, error: string | null) {
  const navigation = useContext(ServiciosProviderContext);
  const [localId, setLocalId] = useState<string | null>(null);
  const selectedId = navigation ? navigation.selectedId : localId;
  const select = navigation?.select || setLocalId;
  const publish = navigation?.publish;
  const providers = useMemo(() => catalogueProviders(category, rows), [category, rows]);
  const provider = rows.find(row => providerId(category, row) === selectedId) || null;

  useLayoutEffect(() => { publish?.({ providers, loading, error }); }, [publish, providers, loading, error]);
  useEffect(() => {
    if (!loading && !error && selectedId && !provider) select(null);
  }, [loading, error, selectedId, provider, select]);

  return {
    provider,
    openProvider: (row: ProviderRecord) => select(providerId(category, row) || null),
    closeProvider: () => select(null),
  };
}
