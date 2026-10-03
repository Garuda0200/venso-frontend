import { useQuery } from "@tanstack/react-query";
import { getAgencies } from "../services/agencyService";

/** Una consulta compartida para los listados; incluye agencias históricas. */
export function useAgencyDirectory() {
  return useQuery({
    queryKey: ["turismo", "agencias", "directory"],
    queryFn: () => getAgencies(true),
    staleTime: 5 * 60 * 1000,
  });
}
