import { useEffect, useLayoutEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import "./DocumentDeletePopover.scss";

export default function DocumentDeletePopover({ anchor, busy, onCancel, onConfirm }) {
  const panelRef = useRef(null);
  const cancelRef = useRef(null);
  const titleId = useId();
  const [position, setPosition] = useState({ left: 12, top: 12 });
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor?.getBoundingClientRect();
      if (!rect) return;
      const width = panelRef.current?.offsetWidth || 300;
      const height = panelRef.current?.offsetHeight || 160;
      const viewportWidth = window.innerWidth || 1024;
      const viewportHeight = window.innerHeight || 768;
      const top = rect.bottom + height + 12 <= viewportHeight ? rect.bottom + 8 : rect.top - height - 8;
      setPosition({ left: Math.max(12, Math.min(rect.right - width, viewportWidth - width - 12)), top: Math.max(12, top) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchor]);
  useEffect(() => {
    cancelRef.current?.focus();
    return () => { if (anchor?.isConnected) anchor.focus(); };
  }, [anchor]);
  useEffect(() => {
    const outside = event => {
      if (!busy && !panelRef.current?.contains(event.target) && !anchor?.contains(event.target)) onCancel();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [anchor, busy, onCancel]);
  return createPortal(
    <div ref={panelRef} className="document-delete-popover" style={position}
      role="alertdialog" aria-labelledby={titleId} aria-busy={busy}
      onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); if (!busy) onCancel(); }
        if (event.key === "Tab") {
          const buttons = [...panelRef.current.querySelectorAll("button:not(:disabled)")];
          const first = buttons[0], last = buttons.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <strong id={titleId}>¿Eliminar este documento?</strong>
      <p>Se quitará del file. Esta acción requiere tu confirmación.</p>
      <div className="document-delete-popover__actions">
        <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
        <button type="button" className="document-delete-popover__confirm" disabled={busy} onClick={onConfirm}>
          {busy ? "Eliminando..." : "Sí, eliminar"}
        </button>
      </div>
    </div>, document.body,
  );
}
