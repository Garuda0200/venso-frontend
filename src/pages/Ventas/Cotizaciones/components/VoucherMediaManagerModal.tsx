import React, { useEffect, useRef, useState } from "react";
import { MdAttachFile, MdClose, MdDeleteOutline, MdDownload, MdHistory, MdOpenInNew, MdRefresh } from "react-icons/md";
import { normalizeSourceVoucher, type SourceVoucherMedia } from "../utils/sourceVoucher";
import { isWordVoucher, mediaErrorMessage, voucherMediaDownloadPath, voucherMediaFormat, type VoucherMediaVersion } from "../utils/voucherMediaHistory";
import { useVoucherMediaManager } from "../hooks/useVoucherMediaManager";
import { voucherMediaService } from "../hooks/voucherMediaService";
import VoucherMediaHistoryList from "./VoucherMediaHistoryList";
import SourceVoucherPreviewModal from "./SourceVoucherPreviewModal";
import "./styles/VoucherMediaManagerModal.scss";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  cotizacionId?: string | number | null;
  voucherCode?: string | null;
  quotationTitle?: string | null;
  initialMedia?: any;
  legacyMedia?: any;
  canManage?: boolean;
  uploadedBy?: string;
  onChanged?: (media: SourceVoucherMedia | null) => void | Promise<void>;
};

export default function VoucherMediaManagerModal({
  isOpen, onClose, cotizacionId, voucherCode, quotationTitle, canManage = true, onChanged,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const manager = useVoucherMediaManager({ isOpen, quotationId: cotizacionId, onChanged });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [preview, setPreview] = useState<SourceVoucherMedia | null>(null);
  const [confirmation, setConfirmation] = useState<"detach" | VoucherMediaVersion | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const media = normalizeSourceVoucher(manager.history?.voucherMedia);
  const editable = canManage && manager.history?.capabilities.canManage === true;
  const busy = manager.busy || downloading;
  const locked = busy || manager.uncertain;
  const title = voucherCode || quotationTitle || String(cotizacionId || "Voucher");

  useEffect(() => {
    if (isOpen && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (!isOpen) dialog.current?.close();
    setHistoryOpen(false);
    setPreview(null);
    setConfirmation(null);
    setDownloadError("");
  }, [isOpen, cotizacionId]);

  const download = async (source: SourceVoucherMedia, forEditing = false) => {
    setDownloading(true);
    setDownloadError("");
    try {
      const blob = await voucherMediaService.download(voucherMediaDownloadPath(source));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = source.originalName || "voucher";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (forEditing) manager.setBaseVersionId(source.documentVersionId || "");
    } catch (failure) {
      setDownloadError(mediaErrorMessage(failure, "No se pudo descargar el documento."));
    } finally { setDownloading(false); }
  };

  const confirm = async () => {
    if (!confirmation) return;
    const saved = await manager.changeVersion(confirmation === "detach" ? "detach" : confirmation.id);
    if (saved) setConfirmation(null);
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialog}
      className="voucher-media-manager"
      aria-label="Archivo del voucher"
      onCancel={event => { event.preventDefault(); if (!locked) onClose(); }}
    >
      <header className="voucher-media-manager__header">
        <div><span className="voucher-media-manager__eyebrow">VENSO · VOUCHER</span><h3>Archivo del voucher</h3><p>{title}</p></div>
        <button type="button" onClick={onClose} disabled={locked} aria-label="Cerrar"><MdClose /></button>
      </header>
      <div className="voucher-media-manager__body" aria-busy={busy}>
        {manager.loading ? (
          <div className="voucher-media-manager__loading" role="status"><MdRefresh className="spin" /> Consultando archivos…</div>
        ) : media ? (
          <section className="voucher-media-manager__current" aria-label="Archivo vigente">
            <div className="voucher-media-manager__file-icon"><MdAttachFile /></div>
            <div className="voucher-media-manager__file-copy">
              <strong>{media.originalName}</strong>
              <span>Versión {media.versionNumber} · {voucherMediaFormat(media)}</span>
              {media.uploadedAt && <small>{new Date(media.uploadedAt).toLocaleString("es-PE")}</small>}
            </div>
            <div className="voucher-media-manager__file-actions">
              <button type="button" className="secondary" disabled={locked} onClick={() => setPreview(media)}><MdOpenInNew /> Ver</button>
              <button type="button" className="secondary" disabled={locked} onClick={() => download(media)}><MdDownload /> Descargar</button>
              {editable && isWordVoucher(media) && <button type="button" className="secondary" disabled={locked} onClick={() => download(media, true)}>Descargar para editar</button>}
              {editable && <button type="button" className="danger" disabled={locked} onClick={() => setConfirmation("detach")}><MdDeleteOutline /> Desvincular</button>}
            </div>
          </section>
        ) : manager.history ? (
          <div className="voucher-media-manager__empty"><MdAttachFile /><strong>File sin archivo vigente</strong><span>El adjunto es opcional.</span></div>
        ) : null}

        {manager.history && (
          <button type="button" className="voucher-media-manager__history-toggle secondary" disabled={locked} aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)}>
            <MdHistory /> {historyOpen ? "Ocultar historial" : "Ver historial"}
          </button>
        )}

        {historyOpen && manager.history && (
          <VoucherMediaHistoryList history={manager.history} busy={locked} canManage={editable}
            onDownload={download} onPreview={setPreview} onRestore={setConfirmation}
            onMore={() => manager.refresh(manager.history!.nextBeforeVersion!).catch(failure => setDownloadError(mediaErrorMessage(failure, "No se pudo cargar el historial.")))}
          />
        )}

        {editable && (
          <section className={`voucher-media-manager__dropzone ${dragging ? "is-dragging" : ""}`}
            onDragOver={event => { event.preventDefault(); if (!locked) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={event => { event.preventDefault(); setDragging(false); if (!locked) manager.selectFile(event.dataTransfer.files?.[0] || null); }}
            aria-label="Subir nueva versión"
          >
            <input ref={input} hidden type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
              onChange={event => { manager.selectFile(event.target.files?.[0] || null); event.target.value = ""; }}
            />
            <button type="button" disabled={locked} onClick={() => input.current?.click()}>
              <MdAttachFile /><strong>{manager.selectedFile?.name || "Seleccionar nueva versión"}</strong><span>PDF, Word y otros documentos · máximo 25 MB</span>
            </button>
            {manager.selectedFile && (
              <div className="voucher-media-manager__upload-form">
                <label>Basada en la versión
                  <select value={manager.baseVersionId} disabled={locked} onChange={event => manager.setBaseVersionId(event.target.value)}>
                    <option value="">Nueva subida</option>
                    {manager.baseVersionId && !manager.history?.versions.some(row => row.id === manager.baseVersionId) && <option value={manager.baseVersionId}>Versión seleccionada para editar</option>}
                    {manager.history?.versions.map(row => <option key={row.id} value={row.id}>Versión {row.versionNumber} · {row.media.originalName}</option>)}
                  </select>
                </label>
                <label>Nota opcional<input maxLength={500} value={manager.note} disabled={locked} onChange={event => manager.setNote(event.target.value)} /></label>
                <button type="button" className="primary" disabled={busy} onClick={manager.saveFile}>
                  {manager.isUploading ? `Subiendo ${manager.uploadProgress}%` : manager.saving ? "Guardando…" : manager.uncertain ? "Recuperar guardado" : "Guardar nueva versión"}
                </button>
              </div>
            )}
            {manager.isUploading && <progress aria-label="Progreso de subida" value={manager.uploadProgress} max={100} />}
          </section>
        )}

        {confirmation && (
          <section className="voucher-media-manager__confirmation" role="alertdialog" aria-label={confirmation === "detach" ? "Desvincular archivo" : "Restaurar versión"}>
            <strong>{confirmation === "detach" ? "¿Desvincular el archivo vigente?" : `¿Restaurar la versión ${confirmation.versionNumber}?`}</strong>
            <p>{confirmation === "detach" ? "Podrás consultar y restaurar sus versiones desde el historial." : "Se guardará como una nueva versión del file."}</p>
            <div className="voucher-media-manager__file-actions">
              <button type="button" className="secondary" disabled={locked} onClick={() => setConfirmation(null)}>Cancelar</button>
              <button type="button" className="primary" disabled={busy} onClick={confirm}>{manager.uncertain ? "Recuperar operación" : "Confirmar"}</button>
            </div>
          </section>
        )}
        {(manager.error || downloadError) && <div className="voucher-media-manager__error" role="alert">{downloadError || manager.error}</div>}
        {manager.message && <div className="voucher-media-manager__success" role="status">{manager.message}</div>}
        {!manager.history && !manager.loading && <button type="button" className="secondary" disabled={busy} onClick={() => manager.refresh().catch(failure => setDownloadError(mediaErrorMessage(failure, "No se pudo consultar el archivo.")))}>Reintentar consulta</button>}
      </div>
      <footer className="voucher-media-manager__footer">
        <span>{editable ? "Cada nueva subida conserva las versiones anteriores." : "Consulta de archivos."}</span>
        <button type="button" className="primary" disabled={locked} onClick={onClose}>Cerrar</button>
      </footer>
      <SourceVoucherPreviewModal isOpen={Boolean(preview)} onClose={() => setPreview(null)} voucher={preview} />
    </dialog>
  );
}
