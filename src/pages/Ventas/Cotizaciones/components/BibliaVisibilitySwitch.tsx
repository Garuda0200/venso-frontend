import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MdEventAvailable, MdVisibilityOff } from "react-icons/md";
import "./styles/BibliaVisibilitySwitch.scss";

interface Props {
  checked: boolean;
  fileCode?: string;
  disabled?: boolean;
  creating?: boolean;
  onConfirm: (visible: boolean) => Promise<void> | void;
}

export default function BibliaVisibilitySwitch({ checked, fileCode, disabled, creating, onConfirm }: Props) {
  const [pending, setPending] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDialogElement>(null), inFlight = useRef(false);
  const heading = useId(), description = useId();
  const close = () => {
    if (inFlight.current) return;
    dialog.current?.close(); setPending(null); setError(""); trigger.current?.focus();
  };
  useEffect(() => {
    if (pending !== null && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [pending]);
  const confirm = async () => {
    if (inFlight.current || pending === null) return;
    inFlight.current = true; setBusy(true); setError("");
    try { await onConfirm(pending); inFlight.current = false; close(); }
    catch (failure: any) { setError(failure?.response?.data?.message || failure?.message || "No se pudo cambiar la visibilidad. Inténtalo nuevamente."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <>
    <button ref={trigger} type="button" role="switch" aria-checked={checked}
      aria-label={`Mostrar ${fileCode || "file"} en la Biblia de actividades`}
      className={`biblia-visibility-switch${checked ? " is-on" : ""}`} disabled={disabled || busy}
      onClick={event => { event.stopPropagation(); setError(""); setPending(!checked); }}>
      <span className="biblia-visibility-switch__track" aria-hidden="true"><span /></span>
      <span>Biblia <small>{checked ? "Visible" : "Oculto"}</small></span>
    </button>
    {pending !== null && createPortal(<dialog ref={dialog} className="biblia-publication-confirm"
      aria-labelledby={heading} aria-describedby={description}
      onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }}
      onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) close(); }}>
      <div className="biblia-publication-confirm__body">
        <span className="biblia-publication-confirm__icon" aria-hidden="true">{pending ? <MdEventAvailable /> : <MdVisibilityOff />}</span>
        <h2 id={heading}>{pending ? "Mostrar en la Biblia" : "Ocultar de la Biblia"}</h2>
        {fileCode && <strong className="biblia-publication-confirm__file">{fileCode}</strong>}
        <p id={description}>{pending
          ? creating ? "Sus días aparecerán cuando completes la fecha y el itinerario del file."
            : "Se mostrarán sus días con los pasajeros y servicios disponibles, conservando las ediciones de la Biblia."
          : "Sus registros dejarán de mostrarse. Los datos y vínculos se conservarán para volver a activarlos."}</p>
        {error && <p className="biblia-publication-confirm__error" role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={close} autoFocus>Cancelar</button>
          <button type="button" className="is-primary" disabled={busy} onClick={confirm}>{busy ? "Guardando…" : pending ? "Mostrar en Biblia" : "Ocultar registros"}</button>
        </footer>
      </div>
    </dialog>, document.body)}
  </>;
}
