import React from "react";
import type { BibliaActivity } from "../utils/bibliaActivityMapper";
import { buildBibliaFileCopy, getBibliaFileSources } from "../utils/bibliaFileSuggestions";
export default function BibliaFileSuggestions({ activity, code, activities, quotations, onApply, disabled = false }: {
  activity: BibliaActivity; code: string; activities: BibliaActivity[]; quotations: Record<string, any>[];
  onApply: (changes: Record<string, string>) => void; disabled?: boolean;
}) {
  const sources = getBibliaFileSources(activity, code, activities);
  if (!sources.length) return null;
  return <section className="biblia-file-suggestions" aria-label="Datos del mismo file">
    <strong>Este file ya tiene pasajeros</strong>
    <small>Trae sus datos y ajusta los participantes de este día. Pulsa Guardar para confirmar.</small>
    <div>{sources.map(source => <button key={source.id} type="button" disabled={disabled}
      onClick={() => onApply(buildBibliaFileCopy(source, quotations))}>
      <span>{source.dateKey} · {source.pax} pax</span><strong>{source.reservationName}</strong>
      <small>{source.nationality} · {source.language}</small><span>Usar estos datos</span>
    </button>)}</div>
  </section>;
}
