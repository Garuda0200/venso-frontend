import { MdLink, MdSync } from "react-icons/md";
import type { BibliaActivity } from "../utils/bibliaActivityMapper";
import { getBibliaPendingChangeLabels } from "../utils/bibliaQuotationLinking";

export default function BibliaQuotationSyncPrompt({ activity, busy, onConfirm }: {
  activity: BibliaActivity; busy: boolean; onConfirm: () => void;
}) {
  if (!activity.sourceQuotationId) return null;
  if (activity.overrideRecord?.quotationSyncPending !== true)
    return <span className="biblia-link-status" title="Este registro está vinculado a una cotización"><MdLink /> Vinculado</span>;
  const labels = getBibliaPendingChangeLabels(activity);
  return <details className="biblia-quotation-sync-prompt" onClick={event => event.stopPropagation()}>
    <summary><MdSync /> Actualización pendiente</summary>
    <div role="status">
      <p>Los cambios están guardados en la Biblia. ¿Actualizar los servicios del día en su cotización?</p>
      {labels.length > 0 && <small>{labels.join(" · ")}</small>}
      <button type="button" disabled={busy} onClick={onConfirm}><MdSync /> {busy ? "Guardando…" : "Actualizar cotización"}</button>
      <button type="button" disabled={busy} onClick={event => {
        event.currentTarget.closest("details")?.removeAttribute("open");
      }}>Luego</button>
    </div>
  </details>;
}
