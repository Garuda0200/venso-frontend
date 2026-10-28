import { useCallback, useState } from "react";
import { MdClose, MdLink, MdSync } from "react-icons/md";
import FloatingBibliaPopover from "./FloatingBibliaPopover";
import type { BibliaActivity } from "../utils/bibliaActivityMapper";
import { getBibliaPendingChangeLabels } from "../utils/bibliaQuotationLinking";
import { getBibliaActivitySyncWarnings } from "../utils/bibliaSyncFeedback";

function SyncWarningsPopover({ warnings }: { warnings: string[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  return <span className="biblia-sync-warnings" onClick={event => event.stopPropagation()}>
    <button type="button" className="biblia-link-warning-trigger" title="Revisar vínculo"
      aria-label={`Revisar vínculo (${warnings.length} ${warnings.length === 1 ? "aviso" : "avisos"})`}
      aria-expanded={anchor !== null}
      onClick={event => setAnchor(anchor ? null : event.currentTarget)}>!</button>
    {anchor && <FloatingBibliaPopover anchor={anchor} className="biblia-link-popover biblia-sync-warnings-popover"
      ariaLabel="Avisos de la última sincronización" onRequestClose={close}>
      <div className="biblia-link-popover__header">
        <div><strong>Revisar vínculo</strong><small>Última sincronización del día</small></div>
        <button type="button" onClick={close} aria-label="Cerrar avisos"><MdClose /></button>
      </div>
      <ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
    </FloatingBibliaPopover>}
  </span>;
}

export default function BibliaQuotationSyncPrompt({ activity, busy, hasUnsavedChanges = false, onConfirm }: {
  activity: BibliaActivity; busy: boolean; hasUnsavedChanges?: boolean; onConfirm: () => void;
}) {
  if (!activity.sourceQuotationId) return null;
  const warnings = getBibliaActivitySyncWarnings(activity);
  const warningDetails = warnings.length > 0 && <SyncWarningsPopover warnings={warnings} />;
  if (activity.overrideRecord?.quotationSyncPending !== true)
    return <span className="biblia-link-row"><span className="biblia-link-status" title="Este registro está vinculado a una cotización"><MdLink /> Vinculado</span>{warningDetails}</span>;
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
