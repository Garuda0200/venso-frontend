import { MdCheck, MdSave } from "react-icons/md";
import type { BibliaRowDraft } from "../utils/bibliaRowDrafts";

export default function BibliaRowSave({ draft, busy, disabled, file, onSave }: {
  draft?: BibliaRowDraft; busy: boolean; disabled: boolean; file: string; onSave: () => void;
}) {
  const count = Object.keys(draft?.values || {}).length;
  const text = busy ? "Guardando…" : draft?.error ? "No se guardó"
    : count ? `${count} cambio${count === 1 ? "" : "s"} sin guardar`
    : draft?.saved ? "Guardado" : "Sin cambios";
  return <div className={`biblia-row-save${count ? " is-dirty" : ""}${draft?.error ? " has-error" : ""}`}>
    <span role="status" title={draft?.error || text}>{draft?.saved && !count && <MdCheck />}{text}</span>
    <button type="button" disabled={disabled || busy || !count} onClick={event => {
      event.stopPropagation(); onSave();
    }} aria-label={`Guardar registro ${file}`}><MdSave />{busy ? "Guardando…" : "Guardar registro"}</button>
    {draft?.error && <small role="alert">{draft.error}</small>}
  </div>;
}
