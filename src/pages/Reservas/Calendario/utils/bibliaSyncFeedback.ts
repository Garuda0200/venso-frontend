/** Conserva las advertencias operativas sin confundirlas con un guardado fallido. */
export function getBibliaSyncWarnings(response: any): string[] {
  const data = response?.data ?? response;
  const rows = data?.warnings ?? data?.actividad?.syncWarnings ?? data?.activity?.syncWarnings;
  if (!Array.isArray(rows)) return [];
  return [...new Set(rows.filter((row): row is string => typeof row === "string")
    .map((row) => row.trim()).filter(Boolean))];
}

export function getBibliaSaveError(error: any, fallback: string): string {
  const message = error?.response?.data?.message;
  return typeof message === "string" && message.trim() ? message.trim() : fallback;
}

/** Los avisos pertenecen a la última sincronización de esta fila. No deben
 * desaparecer al recargar ni presentarse como errores de persistencia. */
export function getBibliaActivitySyncWarnings(activity: { overrideRecord?: Record<string, any> | null }): string[] {
  return getBibliaSyncWarnings({ actividad: activity.overrideRecord });
}
