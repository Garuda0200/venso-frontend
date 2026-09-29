import React, { useState, useRef } from "react";
import {
  FaUpload,
  FaFile,
  FaFilePdf,
  FaFileImage,
  FaTrash,
  FaEye,
  FaSpinner,
  FaExclamationTriangle,
  FaTimes,
} from "react-icons/fa";
import { toast } from "react-toastify";
import { getProxyUrl } from "../../../services/presignedUrlService";
import ImagePreviewModal from "./ImagePreviewModal";
import "./EvidenciaUpload.scss";

/**
 * Componente reutilizable para subir/visualizar un único archivo de evidencia
 * Puede usarse en: TransferenciasInternas, MovimientoForm, LiquidacionForm, etc.
 *
 * Características:
 * - Preview renderizado de imágenes (thumbnail)
 * - Modal para ver imagen/PDF en grande
 * - Drag & drop support
 * - Validación de tipo y tamaño
 */
const EvidenciaUpload = ({
  // Datos actuales del archivo (si ya existe)
  currentFile = null, // { filename, file_size, file_type, tigris_url, proxyUrl, dataUrl }

  // Callbacks
  onUpload, // (file: File) => Promise<void> - Cuando se sube un archivo
  onDelete, // () => Promise<void> - Cuando se elimina el archivo

  // Configuración
  disabled = false,
  uploading = false,
  deleting = false,
  maxSizeMB = 10,
  acceptedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
  ],
  label = "Evidencia de Pago",
  placeholder = "Arrastra un archivo o haz clic para seleccionar",
  showThumbnail = true, // Si debe mostrar thumbnail de imagen
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !uploading) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled || uploading) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await processFile(files[0]);
    }
  };

  const handleFileInput = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      await processFile(files[0]);
    }
    e.target.value = ""; // Reset input
  };

  const processFile = async (file) => {
    // Validar tipo
    if (
      !acceptedTypes.some((type) => {
        if (type.includes("*")) {
          const prefix = type.split("/")[0];
          return file.type.startsWith(prefix);
        }
        return file.type === type;
      })
    ) {
      toast.error(
        "Tipo de archivo no permitido. Solo se aceptan imágenes y PDF.",
      );
      return;
    }

    // Validar tamaño
    if (file.size > maxSizeMB * 1024 * 1024) {
      toast.error(`El archivo excede el tamaño máximo de ${maxSizeMB}MB`);
      return;
    }

    // Llamar al callback de upload
    if (onUpload) {
      await onUpload(file);
    }
  };

  const handlePreview = async () => {
    if (
      !currentFile?.tigris_url &&
      !currentFile?.proxyUrl &&
      !currentFile?.dataUrl
    ) {
      toast.warning("No hay archivo para visualizar");
      return;
    }

    setLoadingPreview(true);
    try {
      let url = null;

      // Si tiene dataUrl (archivo recién seleccionado), usarla
      if (currentFile.dataUrl) {
        url = currentFile.dataUrl;
      }
      // Usar proxy URL para evitar problemas de CORS/ad-blockers
      else if (currentFile.tigris_url) {
        url = getProxyUrl(currentFile.tigris_url);
      }
      // Fallback: proxyUrl precalculada
      else if (currentFile.proxyUrl) {
        url = currentFile.proxyUrl;
      }

      if (url) {
        setPreviewUrl(url);
        setShowPreviewModal(true);
      }
    } catch (error) {
      toast.error("Error al obtener URL de visualización");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleClosePreviewModal = () => {
    setShowPreviewModal(false);
    setPreviewUrl(null);
  };

  const handleDelete = async () => {
    if (onDelete) {
      await onDelete();
    }
  };

  const isPDFFile = (fileType, filename) => {
    return (
      fileType?.includes("pdf") || filename?.toLowerCase().endsWith(".pdf")
    );
  };

  const isImageFile = (fileType, filename) => {
    return (
      fileType?.includes("image") ||
      /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(filename || "")
    );
  };

  const getFileIcon = (fileType) => {
    if (fileType?.includes("pdf"))
      return <FaFilePdf className="file-icon pdf" />;
    if (fileType?.includes("image"))
      return <FaFileImage className="file-icon image" />;
    return <FaFile className="file-icon" />;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Obtener URL para thumbnail (dataUrl o proxy)
  const getThumbnailUrl = () => {
    if (currentFile?.dataUrl) return currentFile.dataUrl;
    // Usar proxy URL para evitar problemas de CORS/ad-blockers
    if (currentFile?.tigris_url) return getProxyUrl(currentFile.tigris_url);
    if (currentFile?.proxyUrl) return currentFile.proxyUrl;
    return null;
  };

  const hasFile =
    currentFile && (currentFile.tigris_url || currentFile.dataUrl);
  const thumbnailUrl = getThumbnailUrl();
  const fileIsImage =
    currentFile && isImageFile(currentFile.file_type, currentFile.filename);
  const fileIsPDF =
    currentFile && isPDFFile(currentFile.file_type, currentFile.filename);

  return (
    <div className="evidencia-upload">
      <label className="evidencia-label">
        <FaUpload className="label-icon" />
        {label}
        <span className="optional-tag">(opcional)</span>
      </label>

      {/* Si ya hay un archivo subido, mostrar preview con thumbnail */}
      {hasFile ? (
        <div className="file-preview-card">
          {/* Thumbnail / Preview visual */}
          <div className="preview-thumbnail" onClick={handlePreview}>
            {fileIsImage && thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={currentFile.filename}
                className="thumbnail-image"
                onError={(e) => {
                  e.target.style.display = "none";
                  e.target.nextSibling.style.display = "flex";
                }}
              />
            ) : fileIsPDF ? (
              <div className="thumbnail-pdf">
                <FaFilePdf className="pdf-icon" />
                <span>PDF</span>
              </div>
            ) : (
              <div className="thumbnail-unknown">
                <FaFile className="file-icon" />
              </div>
            )}
            {/* Overlay para indicar que se puede ver */}
            <div className="preview-overlay">
              {loadingPreview ? <FaSpinner className="spin" /> : <FaEye />}
            </div>
            {/* Fallback si imagen no carga */}
            <div className="thumbnail-fallback" style={{ display: "none" }}>
              <FaFileImage />
            </div>
          </div>

          {/* Info del archivo */}
          <div className="file-info">
            <span className="filename" title={currentFile.filename}>
              {currentFile.filename && currentFile.filename.length > 25
                ? `${currentFile.filename.substring(0, 22)}...`
                : currentFile.filename || "Archivo adjunto"}
            </span>
            <span className="file-meta">
              {formatFileSize(currentFile.file_size)}
            </span>
          </div>

          {/* Botón eliminar */}
          {!disabled && onDelete && (
            <button
              type="button"
              className="btn-remove"
              onClick={handleDelete}
              disabled={deleting}
              title="Eliminar archivo"
            >
              {deleting ? <FaSpinner className="spin" /> : <FaTimes />}
            </button>
          )}
        </div>
      ) : (
        /* Dropzone para subir archivo */
        <div
          className={`dropzone ${isDragging ? "dragging" : ""} ${disabled || uploading ? "disabled" : ""}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() =>
            !disabled && !uploading && fileInputRef.current?.click()
          }
        >
          <input
            ref={fileInputRef}
            type="file"
            className="file-input"
            accept={acceptedTypes.join(",")}
            onChange={handleFileInput}
            disabled={disabled || uploading}
          />

          {uploading ? (
            <div className="uploading-state">
              <FaSpinner className="spin upload-icon" />
              <span>Subiendo archivo...</span>
            </div>
          ) : (
            <div className="dropzone-content">
              <FaUpload className="upload-icon" />
              <span className="dropzone-text">{placeholder}</span>
              <span className="dropzone-hint">
                Máx. {maxSizeMB}MB • Imágenes o PDF
              </span>
            </div>
          )}
        </div>
      )}

      {/* Modal de preview */}
      <ImagePreviewModal
        isOpen={showPreviewModal}
        onClose={handleClosePreviewModal}
        fileUrl={previewUrl}
        filename={currentFile?.filename}
        fileType={currentFile?.file_type}
        loading={loadingPreview}
      />
    </div>
  );
};

export default EvidenciaUpload;
