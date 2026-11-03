import React, { useMemo } from "react";
import { MdClose, MdDescription, MdOpenInNew } from "react-icons/md";
import { getApiUrl } from "../../../../utils/apiUtils";
import { getSourceVoucherKind, normalizeSourceVoucher } from "../utils/sourceVoucher";
import { useSourceVoucherPdf } from "../hooks/useSourceVoucherPdf";
import "./styles/SourceVoucherPreviewModal.scss";

const proxyUrl = (url: string) => {
  if (!url) return "";
  if (url.includes("/upload/tigris/proxy")) return url;
  return `${getApiUrl()}/upload/tigris/proxy?url=${encodeURIComponent(url.replace(/^\//, ""))}`;
};

const SourceVoucherPreviewModal = ({ isOpen, onClose, voucher }: any) => {
  const media = useMemo(() => normalizeSourceVoucher(voucher), [voucher]);
  const kind = useMemo(() => getSourceVoucherKind(media), [media]);
  const previewUrl = media ? proxyUrl(media.url) : "";
  const pdf = useSourceVoucherPdf(Boolean(isOpen && kind === "pdf"), previewUrl);
  if (!isOpen) return null;

  return (
    <div className="source-voucher-preview__overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className="source-voucher-preview__modal" role="dialog" aria-modal="true">
        <header><div><strong>Archivo del voucher</strong><span>{media?.originalName || "Documento asociado"}</span></div><div className="source-voucher-preview__header-actions">{previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer"><MdOpenInNew /> Abrir</a>}<button onClick={onClose}><MdClose /></button></div></header>
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
              <span>Este tipo de documento no tiene previsualización embebida segura en el navegador.</span>
              {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer"><MdOpenInNew /> Abrir documento</a>}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default SourceVoucherPreviewModal;
