import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MdAutoAwesome, MdArrowForward, MdClose } from "react-icons/md";
import PassengerIdentityBatch from "./PassengerIdentityBatch";
import ImagePreviewModal from "../../../../../../components/Contabilidad/shared/ImagePreviewModal";
import { getDocumentFilename, getDocumentMimeType, getDocumentPreviewUrl } from "./documentPreview";
import "./PassengerIdentityModal.scss";

// Keep the batch mounted after its first opening. Closing this window must not
// discard a review, cancel an accepted job or allow a duplicate paid request.
export default function PassengerIdentityModal(props) {
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState(false);
  const [preview, setPreview] = useState(null);
  const previewRef = useRef(null);
  previewRef.current = preview;
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const id = useId();
  const close = () => { setPreview(null); setOpen(false); };

  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    closeRef.current?.focus();
    const onEscape = (event) => {
      // The document preview owns Escape while it is open. Otherwise consume it
      // before VoucherModal's listener can close the underlying commercial form.
      if (event.key !== "Escape" || previewRef.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onEscape, true);
    return () => {
      document.removeEventListener("keydown", onEscape, true);
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, [open]);

  const inert = preview ? { inert: "" } : {};
  return <>
    <div className="identity-launcher">
      <div className="identity-launcher__description">
        <span className="identity-launcher__icon"><MdAutoAwesome aria-hidden="true" /></span>
        <div><strong>Lectura asistida de documentos</strong><p>Extrae los datos pendientes y revisa a qué pasajero pertenece cada documento.</p></div>
      </div>
      <button type="button" aria-haspopup="dialog" aria-controls={`${id}-dialog`} aria-expanded={open}
        onClick={() => { setVisited(true); setOpen(true); }}>
        Completar datos <MdArrowForward aria-hidden="true" />
      </button>
    </div>
    {visited && createPortal(
      <dialog ref={dialogRef} id={`${id}-dialog`} className="identity-modal" aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-help`}
        onCancel={(event) => { event.preventDefault(); event.stopPropagation(); if (previewRef.current) setPreview(null); else close(); }}
        onClick={(event) => { event.stopPropagation(); }}>
        <header className="identity-modal__header" {...inert}>
          <div><span>DOCUMENTOS DE PASAJEROS</span><h2 id={`${id}-title`}>Completar datos desde documentos</h2></div>
          <button ref={closeRef} type="button" aria-label="Cerrar lectura asistida" onClick={close}><MdClose aria-hidden="true" /></button>
        </header>
        <div className="identity-modal__body" {...inert}>
          <p id={`${id}-help`} className="identity-modal__help">Usa documentos ya guardados o carga un lote sin asignar. La extracción empieza sólo al pulsar Procesar; los datos se guardan después de tu revisión.</p>
          <PassengerIdentityBatch {...props} onPreviewDocument={setPreview} />
          <p className="identity-modal__pdf-note">Para evitar lecturas innecesarias, selecciona sólo documentos de identidad. Un PDF de varias páginas requiere analizar cada página; no repitas el lote para consultar sus resultados.</p>
        </div>
        <footer className="identity-modal__footer" {...inert}>
          <p>Cerrar esta ventana no cancela el lote. Puedes volver a revisar sus resultados mientras este paso siga abierto.</p>
          <button type="button" onClick={close}>Volver a documentos</button>
        </footer>
        {preview && <ImagePreviewModal isOpen onClose={() => setPreview(null)} portalTarget={dialogRef.current}
          fileUrl={getDocumentPreviewUrl(preview)} filename={getDocumentFilename(preview)} fileType={getDocumentMimeType(preview)} />}
      </dialog>, document.body,
    )}
  </>;
}
