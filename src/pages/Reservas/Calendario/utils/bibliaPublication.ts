import { materializeQuotationBibliaRecords, parseBibliaDate } from "./bibliaActivityMapper";

/** Actualiza la proyección del itinerario sin perder ediciones o bajas de Biblia. */
export function buildBibliaPublicationRecords(quote: Record<string, any>, standalone: Record<string, any>[] = []) {
  const source = quote.biblia_actividades ?? quote.bibliaActividades ?? [];
  const previous: Record<string, any>[] = typeof source === "string" ? JSON.parse(source) : source;
  if (!Array.isArray(previous)) throw new Error("No se pudieron leer los registros anteriores de la Biblia. Actualiza el file antes de publicarlo.");
  const days = [...(quote.itinerario || []), ...(quote.itinerario_externo || [])];
  if (days.length && !parseBibliaDate(quote.fechainicio)) throw new Error("Configura la fecha de inicio del file antes de mostrar sus días en la Biblia.");
  const fresh = materializeQuotationBibliaRecords({ ...quote, biblia_actividades: [], bibliaActividades: [] }, [], standalone);
  const used = new Set<Record<string, any>>();
  const records = fresh.map(record => {
    const old = previous.find(item => !used.has(item) && (item.id === record.id || item.dateKey === record.dateKey));
    if (!old) return record;
    used.add(old);
    // Las filas editadas, importadas o manuales siguen siendo autoritativas.
    return old.snapshotOrigin === "itinerary" && !old.snapshotEdited && !old.isDeleted && !old.sourceExcel
      ? { ...old, ...record, id: old.id }
      : old;
  });
  previous.filter(record => !used.has(record)).forEach(record => records.push(record));
  return records.map(record => ({ ...record, syncQuotation: false }));
}

