import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPendingPaymentRequests, pendingPaymentsKey, subscribePendingPaymentChanges } from "../services/pendingPaymentService";

/** Contador, pp-modal y lotes comparten una única lectura de las solicitudes. */
export function usePendingPaymentRequests(enabled = true) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: pendingPaymentsKey,
    queryFn: ({ signal }) => getPendingPaymentRequests(signal),
    enabled,
    staleTime: 10_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  useEffect(() => {
    if (!enabled) return;
    return subscribePendingPaymentChanges(window, () => {
      void client.invalidateQueries({ queryKey: pendingPaymentsKey }, { cancelRefetch: false });
    });
  }, [client, enabled]);
  return query;
}
