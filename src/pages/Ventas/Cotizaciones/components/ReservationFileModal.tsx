import React, { useEffect, useRef, useState } from "react";
import { MdAttachFile, MdCheckCircle, MdClose, MdOutlineConfirmationNumber } from "react-icons/md";
import { useFileUpload } from "../../../../hooks/useFileUpload";
import cotizacionService from "../hooks/cotizacionService";
import { buildReservationFileInput } from "../utils/reservationFileCreation";
import {
  buildSourceVoucherMedia,
  normalizeSourceVoucher,
  validateSourceVoucherFile,
  type SourceVoucherMedia,
} from "../utils/sourceVoucher";
import "./styles/ReservationFileModal.scss";
import BibliaVisibilitySwitch from "./BibliaVisibilitySwitch";

export interface ReservationFileResult {
  quotation: Record<string, any>;
  reused: boolean;
  attachmentPending?: boolean;
}

interface Props {
  isOpen: boolean;
  uploadedBy?: string;
  onClose: () => void;
  onCreated: (result: ReservationFileResult) => void | Promise<void>;
}

const errorMessage = (error: any, fallback: string) =>
  error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback;

const ReservationFileModal = ({ isOpen, uploadedBy, onClose, onCreated }: Props) => {
  const codeInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const completed = useRef(false);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [bibliaVisible, setBibliaVisible] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [created, setCreated] = useState<ReservationFileResult | null>(null);
  const [uploaded, setUploaded] = useState<SourceVoucherMedia | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { uploadFile, isUploading, uploadProgress } = useFileUpload();

  useEffect(() => {
    if (!isOpen) return;
    codeInput.current?.focus();
  }, [isOpen]);

  const finish = async (result: ReservationFileResult) => {
    if (completed.current) return;
    completed.current = true;
    // El guardado ya terminó: un fallo al refrescar la lista no debe repetirlo.
    try { await onCreated(result); } finally { onClose(); }
  };

  const close = () => {
    if (inFlight.current) return;
    if (created) void finish({ ...created, attachmentPending: Boolean(file) });
    else onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [isOpen, created, file]);

  if (!isOpen) return null;

  const selectFile = (candidate: File | null) => {
    if (!candidate) return;
    const validation = validateSourceVoucherFile(candidate);
    setError(validation);
    if (validation) return;
    setFile(candidate);
    setUploaded(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current || completed.current) return;
    let input;
    try { input = buildReservationFileInput({ voucher_code: code, titulo: title, biblia_visible: bibliaVisible }); }
    catch (validation: any) { setError(validation.message); codeInput.current?.focus(); return; }
    inFlight.current = true;
    setSaving(true);
    setError("");
    let result = created;
    try {
      if (!result) {
        result = await cotizacionService.createReservationFile(input);
        if (!result?.quotation?.id) throw new Error("No se recibió el file guardado. Revisa su código antes de reintentar.");
        setCreated(result);
      }
      // Reutilizar un código nunca reemplaza silenciosamente su voucher existente.
      if (result.reused || !file) {
        await finish({ ...result, attachmentPending: result.reused && Boolean(file) });
        return;
      }
      let media = uploaded;
      if (!media) {
        media = buildSourceVoucherMedia(await uploadFile(file, "voucher-media"), uploadedBy, "cotizacion_voucher_media");
        if (!media?.mediaAssetId) throw new Error("No se recibió el identificador del archivo subido. Puedes adjuntarlo después desde el file.");
        setUploaded(media);
      }
      const response = await cotizacionService.upsertVoucherMedia(result.quotation.id, media);
      const savedMedia = normalizeSourceVoucher(response?.voucherMedia || response?.voucher_media || media);
      const saved = { ...result, quotation: { ...result.quotation, source_voucher: savedMedia } };
      setCreated(saved);
      await finish(saved);
    } catch (saveError: any) {
      const message = errorMessage(saveError, "No se pudo guardar el file.");
      setError(result
        ? `El file ${result.quotation.voucher_code || code.trim()} está guardado. Falta adjuntar el archivo: ${message}`
        : message);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="reservation-file__overlay" onMouseDown={event => event.target === event.currentTarget && close()}>
      <section className="reservation-file" role="dialog" aria-modal="true" aria-labelledby="reservation-file-title" aria-describedby="reservation-file-help">
        <header className="reservation-file__header">
          <span className="reservation-file__icon"><MdOutlineConfirmationNumber /></span>
          <div><span className="reservation-file__eyebrow">Reservas</span><h2 id="reservation-file-title">Nuevo file</h2></div>
          <button type="button" className="reservation-file__close" onClick={close} disabled={saving} aria-label="Cerrar nuevo file"><MdClose /></button>
        </header>
        <p id="reservation-file-help">Registra su código. Podrás completar los pasajeros y los servicios de cada día desde la cotización.</p>
        <form onSubmit={submit} noValidate aria-busy={saving}>
          <label className="reservation-file__field" htmlFor="reservation-file-code">Código de file <span>*</span>
            <input ref={codeInput} id="reservation-file-code" name="voucher_code" autoComplete="off" autoFocus maxLength={50} value={code} readOnly={Boolean(created)} required onChange={event => { setCode(event.target.value); setError(""); }} placeholder="Ej. DK0802" />
          </label>
          <label className="reservation-file__field" htmlFor="reservation-file-name">Nombre de la reserva <small>Opcional</small>
            <input id="reservation-file-name" name="titulo" maxLength={255} value={title} readOnly={Boolean(created)} onChange={event => setTitle(event.target.value)} placeholder="Nombre de la reserva" />
          </label>
          <div className="reservation-file__attachment">
            <button type="button" className="reservation-file__file" onClick={() => fileInput.current?.click()} disabled={saving}>
              <MdAttachFile /><span><strong>{file?.name || "Adjuntar voucher"}</strong><small>{file ? "Cambiar archivo" : "Opcional · PDF, imagen o documento · hasta 25 MB"}</small></span>
            </button>
            {file && !saving && <button type="button" className="reservation-file__remove" aria-label="Quitar adjunto" onClick={() => { setFile(null); setUploaded(null); setError(""); if (fileInput.current) fileInput.current.value = ""; }}><MdClose /></button>}
            <input ref={fileInput} hidden type="file" aria-label="Archivo de voucher" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip" onChange={event => selectFile(event.target.files?.[0] || null)} />
          </div>
          <BibliaVisibilitySwitch checked={bibliaVisible} fileCode={code.trim()} creating disabled={saving || Boolean(created)} onConfirm={setBibliaVisible} />
          {created && <div className="reservation-file__saved" role="status"><MdCheckCircle /><span>File {created.quotation.voucher_code || code.trim()} guardado</span></div>}
          {isUploading && <div className="reservation-file__progress" role="progressbar" aria-label="Subiendo voucher" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}><span style={{ width: `${uploadProgress}%` }} /></div>}
          {error && <div className="reservation-file__error" role="alert">{error}</div>}
          <footer className="reservation-file__actions">
            <button type="button" className="reservation-file__secondary" disabled={saving} onClick={close}>{created ? "Terminar sin adjunto" : "Cancelar"}</button>
            <button type="submit" className="reservation-file__primary" disabled={saving}>{saving ? (isUploading ? `Subiendo ${uploadProgress}%` : "Guardando…") : (created && file ? "Reintentar adjunto" : "Crear file")}</button>
          </footer>
        </form>
      </section>
    </div>
  );
};

export default ReservationFileModal;
