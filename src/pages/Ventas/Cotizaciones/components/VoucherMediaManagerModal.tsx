import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MdAttachFile,
  MdCheckCircle,
  MdClose,
  MdDeleteOutline,
  MdOpenInNew,
  MdRefresh,
} from "react-icons/md";
import { useFileUpload } from "../../../../hooks/useFileUpload";
import cotizacionService from "../hooks/cotizacionService";
import {
  buildSourceVoucherMedia,
  normalizeSourceVoucher,
  resolveVoucherMediaForFile,
  validateSourceVoucherFile,
  type SourceVoucherMedia,
} from "../utils/sourceVoucher";
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

const humanSize = (bytes?: number) => {
  const value = Number(bytes || 0);
  if (!value) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const VoucherMediaManagerModal = ({
  isOpen,
  onClose,
  cotizacionId,
  voucherCode,
  quotationTitle,
  initialMedia,
  legacyMedia,
  canManage = true,
  uploadedBy,
  onChanged,
}: Props) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [media, setMedia] = useState<SourceVoucherMedia | null>(null);
  const [canonicalLinked, setCanonicalLinked] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const { uploadFile, deleteFile, isUploading, uploadProgress } = useFileUpload();

  const initialResolution = useMemo(
    () => resolveVoucherMediaForFile(initialMedia, legacyMedia),
    [initialMedia, legacyMedia],
  );

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setSelectedFile(null);
    setError("");
    setCanonicalLinked(initialResolution.canonicalLinked);
    setMedia(initialResolution.media);
    if (!cotizacionId) return;

    setLoading(true);
    cotizacionService
      .getCotizacionById(cotizacionId, { skipCache: true })
      .then((quote) => {
        if (!active) return;
        const canonical = normalizeSourceVoucher(
          quote?.source_voucher || quote?.sourceVoucher,
        );
        const resolved = resolveVoucherMediaForFile(canonical, legacyMedia);
        setCanonicalLinked(resolved.canonicalLinked);
        setMedia(resolved.media);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError?.message || "No se pudo consultar el archivo actual del voucher.");
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [cotizacionId, initialResolution, isOpen, legacyMedia]);

  if (!isOpen) return null;

  const selectFile = (candidate: File | null) => {
    const validation = validateSourceVoucherFile(candidate);
    setError(validation);
    setSelectedFile(validation ? null : candidate);
    if (validation && inputRef.current) inputRef.current.value = "";
  };

  const saveSelectedFile = async () => {
    if (!cotizacionId) {
      setError("La cotización del voucher no está disponible.");
      return;
    }
    const validation = validateSourceVoucherFile(selectedFile);
    if (validation) {
      setError(validation);
      return;
    }

    let uploaded: SourceVoucherMedia | null = null;
    setSaving(true);
    setError("");
    try {
      const result = await uploadFile(selectedFile as File, "voucher-media");
      uploaded = buildSourceVoucherMedia(
        result,
        uploadedBy,
        "cotizacion_voucher_media",
      );
      if (!uploaded) throw new Error("Tigris no devolvió una referencia válida del archivo.");

      const response = await cotizacionService.upsertVoucherMedia(cotizacionId, uploaded);
      const saved = normalizeSourceVoucher(
        response?.voucherMedia || response?.voucher_media || uploaded,
      );
      setMedia(saved);
      setCanonicalLinked(Boolean(saved));
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await onChanged?.(saved);
    } catch (saveError: any) {
      if (uploaded?.url) {
        try {
          await deleteFile(uploaded.url);
        } catch {
          // Limpieza best-effort: el vínculo no se persistió.
        }
      }
      setError(saveError?.message || "No se pudo vincular el archivo al voucher.");
    } finally {
      setSaving(false);
    }
  };

  const adoptLegacyMedia = async () => {
    if (!cotizacionId || !media) return;
    setSaving(true);
    setError("");
    try {
      const response = await cotizacionService.upsertVoucherMedia(cotizacionId, media);
      const saved = normalizeSourceVoucher(
        response?.voucherMedia || response?.voucher_media || media,
      );
      setMedia(saved);
      setCanonicalLinked(Boolean(saved));
      await onChanged?.(saved);
    } catch (adoptError: any) {
      setError(adoptError?.message || "No se pudo vincular el archivo existente a todo el file.");
    } finally {
      setSaving(false);
    }
  };

  const clearMedia = async () => {
    if (!cotizacionId || !media) return;
    setSaving(true);
    setError("");
    try {
      await cotizacionService.clearVoucherMedia(cotizacionId);
      setMedia(null);
      setCanonicalLinked(false);
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await onChanged?.(null);
    } catch (clearError: any) {
      setError(clearError?.message || "No se pudo quitar el vínculo del archivo.");
    } finally {
      setSaving(false);
    }
  };

  const busy = loading || saving || isUploading;
  const title = voucherCode || quotationTitle || String(cotizacionId || "Voucher");

  return (
    <>
      <div
        className="voucher-media-manager__overlay"
        onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
      >
        <section className="voucher-media-manager" role="dialog" aria-modal="true" aria-label="Archivo del voucher">
          <header className="voucher-media-manager__header">
            <div>
              <span className="voucher-media-manager__eyebrow">VENSO · VOUCHER</span>
              <h3>Archivo del voucher</h3>
              <p>{title}</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar"><MdClose /></button>
          </header>

          <div className="voucher-media-manager__body">
            <div className="voucher-media-manager__notice">
              <MdCheckCircle />
              <div>
                <strong>Adjunto opcional y único por file</strong>
                <span>El mismo archivo se visualiza desde Cotizaciones, Voucher de Venta y Voucher de Reserva.</span>
              </div>
            </div>

            {loading ? (
              <div className="voucher-media-manager__loading"><MdRefresh className="spin" /> Consultando archivo…</div>
            ) : media ? (
              <div className="voucher-media-manager__current">
                <div className="voucher-media-manager__file-icon"><MdAttachFile /></div>
                <div className="voucher-media-manager__file-copy">
                  <strong>{media.originalName || "Archivo asociado"}</strong>
                  <span>{[media.contentType, humanSize(media.sizeBytes)].filter(Boolean).join(" · ") || "Documento asociado"}</span>
                  {media.uploadedAt && <small>Vinculado {new Date(media.uploadedAt).toLocaleString("es-PE")}</small>}
                  {!canonicalLinked && <small className="voucher-media-manager__legacy">Documento heredado de Reserva · aún no unificado con el file</small>}
                </div>
                <div className="voucher-media-manager__file-actions">
                  <button type="button" className="secondary" onClick={() => setPreviewOpen(true)}><MdOpenInNew /> Ver</button>
                  {canManage && (
                    <>
                      {!canonicalLinked && (
                        <button type="button" className="primary" disabled={busy} onClick={adoptLegacyMedia}><MdCheckCircle /> Usar en todo el file</button>
                      )}
                      <button type="button" className="secondary" disabled={busy} onClick={() => inputRef.current?.click()}><MdRefresh /> Reemplazar</button>
                      <button type="button" className="danger" disabled={busy} onClick={clearMedia}><MdDeleteOutline /> Quitar vínculo</button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="voucher-media-manager__empty">
                <MdAttachFile />
                <strong>Este voucher todavía no tiene un archivo asociado</strong>
                <span>Puede continuar trabajando sin adjunto y cargarlo cuando lo necesite.</span>
              </div>
            )}

            {canManage && (
              <div
                className={`voucher-media-manager__dropzone ${dragging ? "is-dragging" : ""} ${selectedFile ? "has-file" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  selectFile(event.dataTransfer.files?.[0] || null);
                }}
              >
                <input
                  ref={inputRef}
                  hidden
                  type="file"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
                  onChange={(event) => selectFile(event.target.files?.[0] || null)}
                />
                <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
                  <MdAttachFile />
                  <strong>{selectedFile?.name || (media ? "Seleccionar reemplazo" : "Seleccionar archivo")}</strong>
                  <span>Arrastra aquí o haz clic · máximo 25 MB</span>
                </button>
                {selectedFile && (
                  <div className="voucher-media-manager__selected">
                    <span>{humanSize(selectedFile.size)}</span>
                    <button type="button" className="primary" disabled={busy} onClick={saveSelectedFile}>
                      {isUploading ? `Subiendo ${uploadProgress || 0}%` : saving ? "Vinculando…" : media ? "Subir y reemplazar" : "Subir y vincular"}
                    </button>
                  </div>
                )}
                {isUploading && <div className="voucher-media-manager__progress"><span style={{ width: `${Math.max(0, Math.min(100, uploadProgress))}%` }} /></div>}
              </div>
            )}

            {error && <div className="voucher-media-manager__error">{error}</div>}
          </div>

          <footer className="voucher-media-manager__footer">
            <span>{canManage ? "Los cambios se guardan directamente en el file." : "Modo lectura."}</span>
            <button type="button" className="primary" onClick={onClose} disabled={busy}>Cerrar</button>
          </footer>
        </section>
      </div>

      <SourceVoucherPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        voucher={media}
      />
    </>
  );
};

export default VoucherMediaManagerModal;
