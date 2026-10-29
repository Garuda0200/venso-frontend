import { useQuery } from "@tanstack/react-query";
import { getCotizacionById } from "./cotizacionService";

export default function useQuotationFocus(id: string, user: any) {
  const scope = [user?.dniuser || user?.dni || user?.sub || user?.auth?.dniuser || "anonymous",
    user?.role ?? user?.auth?.role, user?.platform ?? user?.auth?.platform,
    JSON.stringify(user?.permissions ?? user?.auth?.permissions ?? {})];
  const query = useQuery({
    queryKey: ["cotizaciones", "biblia-focus", ...scope, id],
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const quote = await getCotizacionById(id, { skipCache: true, signal });
      if (!quote || String(quote.id) !== id || quote.is_active !== true) {
        throw new Error("La cotización no está disponible.");
      }
      return quote;
    },
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const status = (query.error as any)?.response?.status;
  const error = query.error ? status === 403 || status === 404
    ? "No se encontró la cotización o no tienes permiso para verla."
    : "No se pudo cargar la cotización. Intenta nuevamente." : "";
  return { quotation: query.isError ? null : query.data, loading: Boolean(id) && query.isPending,
    error, retry: query.refetch };
}