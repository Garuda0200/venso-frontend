import React, { useState } from "react";
import {
  FaCloudUploadAlt,
  FaTrash,
  FaFileAlt,
  FaFilePdf,
  FaFileImage,
  FaEye,
  FaExternalLinkAlt,
} from "react-icons/fa";
import { toast } from "react-toastify";
import { getProxyUrl } from "../../../services/presignedUrlService";
import "./FileUploadZone.scss";

const FileUploadZone = ({
  files = [],
  onFilesChange,
  onRemoveFile,
  maxFiles = 5,
  maxSizeMB = 10,
  acceptedTypes = ["image/*", "application/pdf"],
  disabled = false,
  isUploading = false,
  uploadProgress = 0,
  compact = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(null);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
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

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const droppedFiles = Array.from(e.dataTransfer.files);
    processFiles(droppedFiles);
  };

  const handleFileInput = (e) => {
    const selectedFiles = Array.from(e.target.files);
    processFiles(selectedFiles);
    e.target.value = "";
  };

  const processFiles = async (newFiles) => {
    // Validar cantidad
    if (files.length + newFiles.length > maxFiles) {
      toast.error(`Máximo ${maxFiles} archivos permitidos`);
      return;
    }

    // Validar cada archivo
    const validFiles = [];
    for (const file of newFiles) {
      // Validar tamaño
      if (file.size > maxSizeMB * 1024 * 1024) {
        toast.error(`${file.name} excede el tamaño máximo de ${maxSizeMB}MB`);
        continue;
      }

      // Convertir a base64 para preview
      const dataUrl = await readFileAsDataUrl(file);

      validFiles.push({
        id: `pending-${Date.now()}-${Math.random()}`,
        filename: file.name,
        file_type: file.type,
        file_size: file.size,
        fileObject: file,
        dataUrl: dataUrl,
        isPending: true,
        tigris_url: null,
      });
    }

    if (validFiles.length > 0) {
      onFilesChange([...files, ...validFiles]);
      toast.info(`${validFiles.length} archivo(s) seleccionado(s)`);
    }
  };

  const readFileAsDataUrl = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handlePreview = async (file) => {
    // Si tiene dataUrl (pendiente), usar esa
    if (file.dataUrl) {
      window.open(file.dataUrl, "_blank");
      return;
    }

    // Si tiene tigris_url, usar proxy URL para evitar CORS/ad-blockers
    if (file.tigris_url) {
      setLoadingPreview(file.id || file.filename);
      try {
        const proxyUrl = getProxyUrl(file.tigris_url);
        window.open(proxyUrl, "_blank");
      } catch (error) {
        toast.error("Error al obtener URL de visualización");
      } finally {
        setLoadingPreview(null);
      }
    }
  };

  const getFileIcon = (fileType) => {
    if (fileType?.includes("pdf"))
      return <FaFilePdf className="file-icon pdf" />;
    if (fileType?.includes("image"))
      return <FaFileImage className="file-icon image" />;
    return <FaFileAlt className="file-icon default" />;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className={`file-upload-zone-v2 ${compact ? "compact" : ""}`}>
      {/* Dropzone */}
      <div
        className={`dropzone ${isDragging ? "dragging" : ""} ${disabled ? "disabled" : ""}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-upload-input"
          className="file-input"
          multiple
          accept={acceptedTypes.join(",")}
          onChange={handleFileInput}
          disabled={disabled || isUploading}
        />
        <label htmlFor="file-upload-input" className="dropzone-label">
          <div className="upload-icon">
            <FaCloudUploadAlt />
          </div>
          <div className="upload-text">
            <span className="primary-text">
              {isDragging
                ? "Suelta los archivos aquí"
                : "Arrastra archivos o haz clic"}
            </span>
            <span className="secondary-text">
              Máx. {maxSizeMB}MB por archivo • {files.length}/{maxFiles}{" "}
              archivos
            </span>
          </div>
        </label>
      </div>

      {/* Progress bar */}
      {isUploading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <span className="progress-text">Subiendo... {uploadProgress}%</span>
        </div>
      )}

      {/* Files list */}
      {files.length > 0 && (
        <div className="files-list">
          {files.map((file, index) => (
            <div
              key={file.id || index}
              className={`file-item ${file.isPending ? "pending" : ""}`}
            >
              <div className="file-icon-wrapper">
                {getFileIcon(file.file_type)}
              </div>
              <div className="file-info">
                <span className="file-name" title={file.filename}>
                  {file.filename}
                </span>
                <span className="file-meta">
                  {formatFileSize(file.file_size)}
                  {file.isPending && (
                    <span className="pending-badge">Pendiente</span>
                  )}
                </span>
              </div>
              <div className="file-actions">
                <button
                  type="button"
                  className="btn-preview"
                  onClick={() => handlePreview(file)}
                  disabled={loadingPreview === (file.id || file.filename)}
                  title="Ver archivo"
                >
                  {loadingPreview === (file.id || file.filename) ? (
                    <span className="spinner-sm"></span>
                  ) : file.tigris_url ? (
                    <FaExternalLinkAlt />
                  ) : (
                    <FaEye />
                  )}
                </button>
                {onRemoveFile && (
                  <button
                    type="button"
                    className="btn-remove"
                    onClick={() => onRemoveFile(index)}
                    title="Eliminar archivo"
                  >
                    <FaTrash />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUploadZone;
