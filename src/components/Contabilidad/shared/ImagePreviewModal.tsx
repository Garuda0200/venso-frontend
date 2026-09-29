import React, { useState } from "react";
import {
  FaTimes,
  FaDownload,
  FaFilePdf,
  FaExternalLinkAlt,
  FaSpinner,
} from "react-icons/fa";
import "./ImagePreviewModal.scss";

/**
 * Modal reutilizable para previsualizar imágenes y PDFs
 * Puede usarse en: EvidenciaUpload, MovimientosList, TransferenciasHistorial, etc.
 */
const ImagePreviewModal = ({
  isOpen,
  onClose,
  fileUrl, // URL de la imagen o PDF (presigned o dataUrl)
  filename, // Nombre del archivo
  fileType, // MIME type del archivo (image/*, application/pdf)
  loading = false, // Si está cargando la URL
}) => {
  const [imageError, setImageError] = useState(false);

  if (!isOpen) return null;

  const isPDF =
    fileType?.includes("pdf") || filename?.toLowerCase().endsWith(".pdf");
  const isImage =
    fileType?.includes("image") ||
    /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(filename || "");

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleDownload = () => {
    if (fileUrl) {
      window.open(fileUrl, "_blank");
    }
  };

  return (
    <div className="image-preview-modal-overlay" onClick={handleOverlayClick}>
      <div className="image-preview-modal">
        {/* Header */}
        <div className="modal-header">
          <h4 title={filename}>{filename || "Vista previa"}</h4>
          <button className="close-btn" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {loading ? (
            <div className="loading-preview">
              <FaSpinner className="spin" />
              <span>Cargando vista previa...</span>
            </div>
          ) : isPDF ? (
            <div className="pdf-preview">
              <FaFilePdf className="pdf-icon" />
              <span className="pdf-label">Documento PDF</span>
              <p className="pdf-hint">Los PDFs se abren en una nueva pestaña</p>
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-open-pdf"
              >
                <FaExternalLinkAlt /> Abrir PDF
              </a>
            </div>
          ) : isImage && !imageError ? (
            <div className="image-preview-container">
              <img
                src={fileUrl}
                alt={filename}
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

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn-download" onClick={handleDownload}>
            <FaDownload /> Descargar
          </button>
          <button className="btn-close" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImagePreviewModal;
