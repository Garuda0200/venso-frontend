import React, { useEffect, useMemo, useRef } from "react";
import { MdClose, MdDescription, MdDownload, MdOpenInNew } from "react-icons/md";
import { getApiUrl } from "../../../../utils/apiUtils";
import { getSourceVoucherKind, normalizeSourceVoucher } from "../utils/sourceVoucher";
import { useSourceVoucherPdf } from "../hooks/useSourceVoucherPdf";
import { isWordVoucher, voucherMediaDownloadPath } from "../utils/voucherMediaHistory";
import "./styles/SourceVoucherPreviewModal.scss";

const proxyUrl = (url: string) => {
  if (!url) return "";
  if (url.includes("/upload/tigris/proxy")) return url;
  return `${getApiUrl()}/upload/tigris/proxy?url=${encodeURIComponent(url.replace(/^\//, ""))}`;
};

const SourceVoucherPreviewModal = ({ isOpen, onClose, voucher }: any) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const media = useMemo(() => normalizeSourceVoucher(voucher), [voucher]);
  const kind = useMemo(() => getSourceVoucherKind(media), [media]);
  const downloadPath = voucherMediaDownloadPath(media);
  const previewUrl = downloadPath ? `${getApiUrl().replace(/\/+$/, "")}${downloadPath}` : media ? proxyUrl(media.url) : "";
  const pdf = useSourceVoucherPdf(Boolean(isOpen && kind === "pdf"), previewUrl, Boolean(downloadPath));
  useEffect(() => {
    if (isOpen && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (!isOpen) dialog.current?.close();
  }, [isOpen]);
  if (!isOpen) return null;

  return (
      <dialog ref={dialog} className="source-voucher-preview__modal" aria-label="Vista previa del archivo"
        onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose?.(); }}>
        <header><div><strong>Archivo del voucher</strong><span>{media?.originalName || "Documento asociado"}</span></div><div className="source-voucher-preview__header-actions">{previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer"><MdDownload /> Descargar</a>}<button type="button" aria-label="Cerrar vista previa" onClick={onClose}><MdClose /></button></div></header>
        <main>
          {!media ? (
            <div className="source-voucher-preview__empty">No hay un archivo asociado al voucher.</div>
          ) : kind === "image" ? (
            <img src={previewUrl} alt={media.originalName || "Archivo del voucher"} />
          ) : kind === "pdf" ? (
            pdf.url ? <iframe title={media.originalName || "Archivo del voucher"} src={pdf.url} />
            : pdf.error ? <div className="source-voucher-preview__document" role="alert"><MdDescription /><strong>No se pudo abrir el PDF</strong><span>{pdf.error}</span><button type="button" onClick={pdf.retry}>Reintentar</button></div>
            : <div className="source-voucher-preview__empty" role="status">Cargando documento…</div>
          ) : (
            <div className="source-voucher-preview__document">
              <MdDescription />
              <strong>{media.originalName || "Documento asociado"}</strong>
              <span>{isWordVoucher(media) ? "Descarga el Word para trabajar en tu editor. Puedes subir el archivo editado como una nueva versión." : "Descarga el archivo para abrirlo en una aplicación compatible."}</span>
              {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer"><MdDownload /> Descargar documento</a>}
            </div>
          )}
        </main>
      </dialog>
  );
};

export default SourceVoucherPreviewModal;
