import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import postSaleEditService from "../../../../services/postSaleEditService";
import { indexLatestRequestsByCotizacion } from "../utils/postSaleEditState";

export const POST_SALE_REQUESTS_QUERY_KEY = ["cotizacion-edit-requests", "mine"];

export default function usePostSaleEditRequests() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: POST_SALE_REQUESTS_QUERY_KEY,
    queryFn: () => postSaleEditService.listMine(),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchInterval: 30_000,
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["cotizacion-edit-requests"] }),
    [queryClient],
  );

  useEffect(() => {
    const listener = () => refresh();
    window.addEventListener("postSaleEditRequestUpdated", listener);
    return () => window.removeEventListener("postSaleEditRequestUpdated", listener);
  }, [refresh]);

  const byCotizacion = useMemo(
    () => indexLatestRequestsByCotizacion(query.data || []),
    [query.data],
  );

  const createRequest = useCallback(
    async (cotizacionId, reason) => {
      const result = await postSaleEditService.create(cotizacionId, reason);
      await refresh();
      return result;
    },
    [refresh],
  );

  const cancelRequest = useCallback(
    async (requestId) => {
      const result = await postSaleEditService.cancel(requestId);
      await refresh();
      return result;
    },
    [refresh],
  );

  return {
    ...query,
    byCotizacion,
    refresh,
    createRequest,
    cancelRequest,
  };
}
