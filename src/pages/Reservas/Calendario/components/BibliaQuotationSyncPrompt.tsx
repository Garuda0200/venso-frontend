import { MdLink, MdSync, MdWarningAmber } from "react-icons/md";
import type { BibliaActivity } from "../utils/bibliaActivityMapper";
import { getBibliaPendingChangeLabels } from "../utils/bibliaQuotationLinking";
import { getBibliaActivitySyncWarnings } from "../utils/bibliaSyncFeedback";

export default function BibliaQuotationSyncPrompt({ activity, busy, hasUnsavedChanges = false, onConfirm }: {
  activity: BibliaActivity; busy: boolean; hasUnsavedChanges?: boolean; onConfirm: () => void;
}) {
  if (!activity.sourceQuotationId) return null;
  const warnings = getBibliaActivitySyncWarnings(activity);
  const warningDetails = warnings.length > 0 && <details className="biblia-quotation-sync-warnings" onClick={event => event.stopPropagation()}>
    <summary><MdWarningAmber /> Revisar vínculo ({warnings.length})</summary>
    <div role="status"><small>Última sincronización del día</small><ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>
  </details>;
  if (activity.overrideRecord?.quotationSyncPending !== true)
    return <><span className="biblia-link-status" title="Este registro está vinculado a una cotización"><MdLink /> Vinculado</span>{warningDetails}</>;
  const labels = getBibliaPendingChangeLabels(activity);
  return <><details className="biblia-quotation-sync-prompt" onClick={event => event.stopPropagation()}>
    <summary><MdSync /> Actualización pendiente</summary>
    <div role="status">
      <p>Los cambios están guardados en la Biblia. ¿Actualizar los servicios del día en su cotización?</p>
      {labels.length > 0 && <small>{labels.join(" · ")}</small>}
      {hasUnsavedChanges && <small>Guarda el registro antes de actualizar su cotización.</small>}
      <button type="button" disabled={busy || hasUnsavedChanges} onClick={onConfirm}><MdSync /> {busy ? "Guardando…" : "Actualizar cotización"}</button>
      <button type="button" disabled={busy} onClick={event => {
        event.currentTarget.closest("details")?.removeAttribute("open");
      }}>Luego</button>
    </div>
  </details>{warningDetails}</>;
}
