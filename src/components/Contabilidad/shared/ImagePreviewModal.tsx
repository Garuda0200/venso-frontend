import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  FaTimes,
  FaDownload,
  FaFilePdf,
  FaExternalLinkAlt,
  FaSpinner,
} from "react-icons/fa";
import "./ImagePreviewModal.scss";

const PDF_MIME_TYPE = "application/pdf";

const isPdfFile = (fileType, filename) =>
  String(fileType || "")
    .toLowerCase()
    .includes("pdf") || String(filename || "").toLowerCase().endsWith(".pdf");

const isImageFile = (fileType, filename) =>
  String(fileType || "")
    .toLowerCase()
    .startsWith("image/") ||
  /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(String(filename || ""));

/**
 * Modal reutilizable para previsualizar imágenes y PDFs.
 * Los PDF se descargan como Blob antes de insertarse en el iframe. De esta
 * forma el visor no queda bloqueado por X-Frame-Options/CSP del endpoint API.
 */
const ImagePreviewModal = ({
  isOpen,
  onClose,
  fileUrl,
  filename,
  fileType,
  loading = false,
  portalTarget = null,
}) => {
  const [imageError, setImageError] = useState(false);
  const [pdfObjectUrl, setPdfObjectUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);

  const isPDF = isPdfFile(fileType, filename);
  const isImage = isImageFile(fileType, filename);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const closeModal = useCallback(() => {
    onCloseRef.current?.();
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;

    setImageError(false);

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    // A native parent dialog already owns the body lock and the top layer.
    if (!portalTarget) document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeModal();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown, true);
      if (!portalTarget) document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, [closeModal, isOpen, portalTarget]);

  useEffect(() => {
    if (!isOpen || !isPDF || !fileUrl) {
      setPdfLoading(false);
      setPdfError("");
      setPdfObjectUrl(null);
      return undefined;
    }

    const controller = new AbortController();
    let generatedObjectUrl = null;
    let active = true;

    const loadPdf = async () => {
      setPdfLoading(true);
      setPdfError("");
      setPdfObjectUrl(null);

      try {
        const response = await fetch(fileUrl, {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
          headers: {
            Accept: `${PDF_MIME_TYPE},application/octet-stream;q=0.9,*/*;q=0.8`,
          },
        });

        if (!response.ok) {
          throw new Error(`No se pudo cargar el PDF (${response.status})`);
        }

        const blob = await response.blob();
        const responseType = String(
          blob.type || response.headers.get("content-type") || "",
        ).toLowerCase();
        const headerSample = await blob.slice(0, 1024).text();
        const hasPdfSignature = headerSample.includes("%PDF-");

        if (!responseType.includes("pdf") && !hasPdfSignature) {
          throw new Error(
            "El servidor no devolvió un documento PDF válido. Verifique el proxy de archivos.",
          );
        }

        const normalizedBlob = responseType.includes("pdf")
          ? blob
          : new Blob([blob], { type: PDF_MIME_TYPE });

        generatedObjectUrl = URL.createObjectURL(normalizedBlob);
        if (active) {
          setPdfObjectUrl(generatedObjectUrl);
        }
      } catch (error) {
        if (error?.name !== "AbortError" && active) {
          setPdfError(error?.message || "No se pudo visualizar el PDF.");
        }
      } finally {
        if (active) {
          setPdfLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      active = false;
      controller.abort();
      if (generatedObjectUrl) {
        URL.revokeObjectURL(generatedObjectUrl);
      }
    };
  }, [fileUrl, isOpen, isPDF]);

  const handleOverlayClick = useCallback(
    (event) => {
      if (event.target === event.currentTarget) {
        closeModal();
      }
    },
    [closeModal],
  );

  const handleDownload = useCallback(() => {
    const downloadUrl = isPDF && pdfObjectUrl ? pdfObjectUrl : fileUrl;
    if (!downloadUrl) return;

    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = filename || "evidencia";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }, [fileUrl, filename, isPDF, pdfObjectUrl]);

  const handleOpenInNewTab = useCallback(() => {
    const previewUrl = isPDF && pdfObjectUrl ? pdfObjectUrl : fileUrl;
    if (previewUrl) {
      window.open(previewUrl, "_blank", "noopener,noreferrer");
    }
  }, [fileUrl, isPDF, pdfObjectUrl]);

  if (!isOpen || typeof document === "undefined") return null;

  const isLoadingPreview = loading || (isPDF && pdfLoading);
  const canOpenPreview = Boolean(
    isPDF ? pdfObjectUrl || fileUrl : fileUrl,
  );

  return createPortal(
    <div
      className="image-preview-modal-overlay"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className={`image-preview-modal ${isPDF ? "pdf-mode" : "image-mode"}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Vista previa de ${filename || "evidencia de pago"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h4 title={filename}>{filename || "Vista previa"}</h4>
          <button
            ref={closeButtonRef}
            type="button"
            className="close-btn"
            onClick={closeModal}
            aria-label="Cerrar vista previa"
          >
            <FaTimes />
          </button>
        </div>

        <div className="modal-body">
          {isLoadingPreview ? (
            <div className="loading-preview" aria-live="polite">
              <FaSpinner className="spin" />
              <span>Cargando vista previa...</span>
            </div>
          ) : isPDF && pdfError ? (
            <div className="pdf-preview-error" role="alert">
              <FaFilePdf className="pdf-icon" />
              <strong>No se pudo mostrar el PDF</strong>
              <span>{pdfError}</span>
              <small>
                Todavía puede abrir el archivo en otra pestaña o descargarlo.
              </small>
            </div>
          ) : isPDF && pdfObjectUrl ? (
            <div className="pdf-preview-container">
              <iframe
                key={pdfObjectUrl}
                src={`${pdfObjectUrl}#toolbar=1&navpanes=0&view=FitH`}
                title={filename || "Documento PDF"}
                className="pdf-document-frame"
              />
            </div>
          ) : isImage && fileUrl && !imageError ? (
            <div className="image-preview-container">
              <img
                src={fileUrl}
                alt={filename || "Evidencia de pago"}
                className="preview-image"
                onError={() => setImageError(true)}
              />
            </div>
          ) : (
            <div className="unknown-preview">
              <span>No se puede previsualizar este archivo</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-open-external"
            onClick={handleOpenInNewTab}
            disabled={!canOpenPreview}
          >
            <FaExternalLinkAlt /> Abrir en otra pestaña
          </button>
          <button
            type="button"
            className="btn-download"
            onClick={handleDownload}
            disabled={!canOpenPreview}
          >
            <FaDownload /> Descargar
          </button>
          <button type="button" className="btn-close" onClick={closeModal}>
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    portalTarget || document.body,
  );
};

export default memo(ImagePreviewModal);
