import { invalidateReservaAssignmentGraphCache } from "./cacheInvalidation";
export async function updateReservationMetadataCache(data) {
 if (!Number(data?.id)) throw new Error("Falta identificar el vuelo confirmado");
 invalidateReservaAssignmentGraphCache();
}
