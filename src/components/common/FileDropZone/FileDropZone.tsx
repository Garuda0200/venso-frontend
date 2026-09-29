import { useState, useRef, useCallback } from "react";
import {
  MdCloudUpload,
  MdClose,
  MdPictureAsPdf,
  MdAttachFile,
  MdImage,
} from "react-icons/md";
import { getProxyUrl } from "../../../services/presignedUrlService";
import "./FileDropZone.scss";

/**
 * Shared drag-and-drop file upload zone with preview grid.
 *
 * @param {Object[]} files - Array of file objects to display (each: { id, filename, file_type, file_size, dataUrl, tigris_url, proxyUrl, proxy_url, isPending, fileObject })
 * @param {Function} onFilesAdded - Called with an array of NEW pending file objects after user drops/selects files
 * @param {Function} onFileRemove - Called with (index) when user clicks remove on a file
 * @param {Function} [canRemoveFile] - Optional predicate (file, index) => boolean to protect persisted files
 * @param {boolean} [disabled=false] - Disable uploads
 * @param {boolean} [isUploading=false] - Show uploading state
 * @param {number} [uploadProgress=0] - Upload progress 0-100
 * @param {string} [accept="image/*,application/pdf"] - Accepted file types
 * @param {number} [maxSizeMB=10] - Max file size in MB
 * @param {string} [label] - Custom primary text
 * @param {string} [hint] - Custom hint text
 * @param {string} [inputId] - Custom id for the hidden file input
 * @param {string} [accentColor] - CSS variable name for accent tinting (e.g. "--color-brand-green")
 */
const FileDropZone = ({
  files = [],
  onFilesAdded,
  onFileRemove,
  canRemoveFile,
  disabled = false,
  isUploading = false,
  uploadProgress = 0,
  accept = "image/*,application/pdf",
  maxSizeMB = 10,
  label,
  hint,
  inputId,
}) => {
  const [dragState, setDragState] = useState("idle"); // 'idle' | 'over' | 'rejected'
  const dragCounter = useRef(0);
  const fileInputRef = useRef(null);
  const generatedId = useRef(`fdz-${Math.random().toString(36).slice(2, 9)}`);
  const id = inputId || generatedId.current;

  // ── Drag handlers ──
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) {
      // Check if the dragged content contains files
      const hasFiles = e.dataTransfer.types.includes("Files");
      setDragState(hasFiles ? "over" : "rejected");
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragState("idle");
    }
  }, []);

  const processNewFiles = useCallback(
    async (rawFiles) => {
      if (!onFilesAdded || disabled) return;

      const fileArray = Array.from(rawFiles);
      const maxBytes = maxSizeMB * 1024 * 1024;
      const pendingPromises = fileArray
        .filter((f) => f.size <= maxBytes)
        .map(async (file) => {
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(ev.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          return {
            filename: file.name,
            file_type: file.type,
            file_size: file.size,
            fileObject: file,
            dataUrl,
            isPending: true,
            tigris_url: null,
            uploaded_at: null,
            id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          };
        });

      const pending = await Promise.all(pendingPromises);
      if (pending.length > 0) onFilesAdded(pending);
    },
    [onFilesAdded, disabled, maxSizeMB],
  );

  const handleDrop = useCallback(
    async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setDragState("idle");
      if (disabled) return;
      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles?.length > 0) {
        await processNewFiles(droppedFiles);
      }
    },
    [processNewFiles, disabled],
  );

  const handleInputChange = useCallback(
    (e) => {
      if (e.target.files?.length > 0) {
        processNewFiles(e.target.files);
        e.target.value = "";
      }
    },
    [processNewFiles],
  );

  // ── Helpers for preview ──
  const getPreviewSrc = (file) => {
    if (file.dataUrl) return file.dataUrl;
    if (file.tigris_url) return getProxyUrl(file.tigris_url);
    return file.proxyUrl || file.proxy_url || null;
  };

  const isImage = (file) =>
    file.file_type?.startsWith("image/") ||
    /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.filename || "") ||
    /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.tigris_url || "");

  const isPDF = (file) =>
    file.file_type === "application/pdf" ||
    file.filename?.toLowerCase().endsWith(".pdf") ||
    file.tigris_url?.toLowerCase().endsWith(".pdf");

  // ── Render ──
  return (
    <div className="file-drop-zone-wrapper">
      {/* ---- Drop zone ---- */}
      <div
        className={`file-drop-zone ${dragState === "over" ? "drag-over" : ""} ${dragState === "rejected" ? "drag-rejected" : ""} ${disabled ? "disabled" : ""}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          id={id}
          multiple
          accept={accept}
          onChange={handleInputChange}
          style={{ display: "none" }}
          disabled={disabled || isUploading}
        />

        {/* Animated background ring */}
        <div className="drop-ring" />

        <div className="drop-content">
          <div className="drop-icon-circle">
            <MdCloudUpload className="drop-icon" />
          </div>
          <span className="drop-primary-text">
            {dragState === "over"
              ? "Suelta los archivos aquí"
              : isUploading
                ? "Subiendo archivos..."
                : label || "Arrastra archivos aquí o haz clic para seleccionar"}
          </span>
          <small className="drop-secondary-text">
            {hint || `Imágenes o PDFs • Máx. ${maxSizeMB}MB por archivo`}
          </small>
        </div>

        {/* Progress */}
        {isUploading && uploadProgress > 0 && (
          <div className="drop-progress">
            <div
              className="drop-progress-bar"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* ---- Preview grid ---- */}
      {files.length > 0 && (
        <div className="file-drop-preview-grid">
          {files.map((file, index) => (
            <div
              key={file.id || index}
              className={`fdz-card ${file.isPending ? "pending" : ""}`}
            >
              <div className="fdz-card-preview">
                {isImage(file) ? (
                  <img
                    src={getPreviewSrc(file)}
                    alt={file.filename}
                    className="fdz-thumb"
                    onError={(e) => {
                      e.target.style.display = "none";
                      if (e.target.nextSibling)
                        e.target.nextSibling.style.display = "flex";
                    }}
                  />
                ) : isPDF(file) ? (
                  <div className="fdz-pdf-icon">
                    <MdPictureAsPdf />
                    <span>PDF</span>
                  </div>
                ) : (
                  <div className="fdz-file-icon">
                    <MdAttachFile />
                  </div>
                )}
                <div className="fdz-fallback" style={{ display: "none" }}>
                  <MdImage />
                </div>
              </div>

              <div className="fdz-card-info">
                <span className="fdz-name" title={file.filename}>
                  {file.isPending && <span className="fdz-pending-dot" />}
                  {file.filename && file.filename.length > 20
                    ? `${file.filename.substring(0, 17)}...`
                    : file.filename || "archivo"}
                </span>
                <div className="fdz-meta-row">
                  {file.file_size && (
                    <span className="fdz-size">
                      {(file.file_size / 1024).toFixed(1)} KB
                    </span>
                  )}
                  {(file.existingId || file.existing_id) && (
                    <span className="fdz-persisted-badge">Registrado</span>
                  )}
                </div>
              </div>

              {onFileRemove &&
                (canRemoveFile ? canRemoveFile(file, index) : true) && (
                <button
                  type="button"
                  className="fdz-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileRemove(index);
                  }}
                  title="Eliminar archivo"
                >
                  <MdClose />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileDropZone;
