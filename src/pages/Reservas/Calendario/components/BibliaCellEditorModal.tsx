import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { MdClose, MdEdit, MdSave } from "react-icons/md";

interface BibliaCellEditorProps {
  title: string;
  context: string;
  busy: boolean;
  error?: string;
  children: React.ReactNode;
  onSave: () => void;
  onCancel: () => void;
  onRestoreFocus?: () => void;
}

export function BibliaCellEditorPanel({ title, context, busy, error, children, onSave, onCancel,
  titleId }: BibliaCellEditorProps & { titleId: string }) {
  return <form className="biblia-cell-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}
    aria-busy={busy} onClick={event => event.stopPropagation()}
    onMouseDown={event => event.stopPropagation()}
    onSubmit={event => { event.preventDefault(); if (!busy) onSave(); }}>
    <header className="biblia-cell-panel__header">
      <div className="biblia-cell-panel__heading"><span className="biblia-cell-panel__icon"><MdEdit /></span>
        <div><h2 id={titleId}>{title}</h2><p>{context}</p></div></div>
      <button type="button" className="biblia-cell-panel__close" disabled={busy}
        onClick={onCancel} aria-label="Cerrar editor"><MdClose /></button>
    </header>
    <div className="biblia-cell-panel__body">
      <fieldset className="biblia-cell-panel__fields" disabled={busy}>{children}</fieldset>
      {error && <p className="biblia-cell-panel__error" role="alert">{error}</p>}
    </div>
    <footer className="biblia-cell-panel__footer">
      <button type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
      <button type="submit" className="biblia-cell-panel__save" disabled={busy}>
        <MdSave />{busy ? "Guardando…" : "Guardar registro"}</button>
    </footer>
  </form>;
}

export default function BibliaCellEditorModal(props: BibliaCellEditorProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const firstInput = dialog.current?.querySelector<HTMLElement>(".biblia-cell-panel__fields textarea, .biblia-cell-panel__fields input, .biblia-cell-panel__fields select");
    (firstInput || dialog.current?.querySelector<HTMLElement>("button"))?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (props.onRestoreFocus) props.onRestoreFocus();
      else if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return createPortal(<div ref={dialog} className="biblia-cell-modal" onClick={event => {
    event.stopPropagation();
    if (event.target === event.currentTarget && !props.busy) props.onCancel();
  }} onKeyDown={event => {
    event.stopPropagation();
    if (event.defaultPrevented) return;
    if (event.key === "Escape") { event.preventDefault(); if (!props.busy) props.onCancel(); }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (!props.busy) props.onSave();
    }
    if (event.key === "Tab") {
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), textarea:not(:disabled), input:not(:disabled):not([type=hidden]), select:not(:disabled), a[href], [tabindex='0']",
      ) || [])];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || props.busy) event.preventDefault();
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}><BibliaCellEditorPanel {...props} titleId={titleId} /></div>, document.body);
}
