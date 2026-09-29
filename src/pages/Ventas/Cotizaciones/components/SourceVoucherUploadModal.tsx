import React, { useRef, useState } from "react";
import { MdAttachFile, MdCheckCircle, MdClose, MdCloudUpload } from "react-icons/md";
import {
  buildSourceVoucherMedia,
  validateSourceVoucherFile,
  type SourceVoucherMedia,
} from "../utils/sourceVoucher";
import "./styles/SourceVoucherUploadModal.scss";

interface Props {
  visible: boolean;
  uploading?: boolean;
  progress?: number;
  uploadedBy?: string;
  uploadFile: (file: File, folder?: string) => Promise<any>;
  deleteFile?: (url: string) => Promise<boolean>;
  onReady: (voucher: SourceVoucherMedia) => void;
  onCancel: () => void;
}

const SourceVoucherUploadModal = ({
  visible,
  uploading = false,
  progress = 0,
  uploadedBy,
  uploadFile,
  deleteFile,
  onReady,
  onCancel,
}: Props) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [uploaded, setUploaded] = useState<SourceVoucherMedia | null>(null);

  if (!visible) return null;

  const reset = async (removeRemote = false) => {
    if (removeRemote && uploaded?.url && deleteFile) {
      try { await deleteFile(uploaded.url); } catch { /* cleanup best effort */ }
    }
    setFile(null);
    setUploaded(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const selectFile = (candidate: File | null) => {
    const validation = validateSourceVoucherFile(candidate);
    setError(validation);
    if (!validation) setFile(candidate);
  };

  const handleUpload = async () => {
    const validation = validateSourceVoucherFile(file);
    if (validation) return setError(validation);
    try {
      const result = await uploadFile(file as File, "reservation-source-vouchers");
      const media = buildSourceVoucherMedia(result, uploadedBy);
      if (!media) throw new Error("Tigris no devolvió una referencia válida del archivo.");
      setUploaded(media);
      setError("");
    } catch (uploadError: any) {
      setError(uploadError?.message || "No se pudo subir el voucher de origen.");
    }
  };

  const cancel = async () => {
    await reset(Boolean(uploaded));
    onCancel();
  };

  const confirmUploaded = () => {
    if (!uploaded) return;
    const ready = uploaded;
    setFile(null);
    setUploaded(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
    onReady(ready);
  };

  return (
    <div className="source-voucher-upload__overlay" onMouseDown={(event) => event.target === event.currentTarget && cancel()}>
      <div className="source-voucher-upload__modal" role="dialog" aria-modal="true" aria-label="Voucher de origen">
        <button className="source-voucher-upload__close" onClick={cancel} aria-label="Cerrar"><MdClose /></button>
        <div className="source-voucher-upload__heading">
          <span><MdCloudUpload /></span>
          <div><h3>Voucher o documento de origen</h3><p>Reservas debe asociar el archivo recibido antes de iniciar la cotización.</p></div>
        </div>
        {!uploaded ? (
          <>
            <button className="source-voucher-upload__drop" type="button" onClick={() => inputRef.current?.click()}>
              <MdAttachFile />
              <strong>{file?.name || "Seleccionar archivo"}</strong>
              <small>PDF, imagen u otro documento · máximo 25 MB</small>
            </button>
            <input ref={inputRef} hidden type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip" onChange={(event) => selectFile(event.target.files?.[0] || null)} />
            {error && <div className="source-voucher-upload__error">{error}</div>}
            {uploading && <div className="source-voucher-upload__progress"><span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>}
            <div className="source-voucher-upload__actions">
              <button type="button" className="secondary" onClick={cancel}>Cancelar</button>
              <button type="button" className="primary" disabled={!file || uploading} onClick={handleUpload}>{uploading ? `Subiendo ${progress || 0}%` : "Subir y continuar"}</button>
            </div>
          </>
        ) : (
          <>
            <div className="source-voucher-upload__success"><MdCheckCircle /><div><strong>Archivo asociado</strong><span>{uploaded.originalName}</span></div></div>
            <div className="source-voucher-upload__actions">
              <button type="button" className="secondary" onClick={() => reset(true)}>Cambiar archivo</button>
              <button type="button" className="primary" onClick={confirmUploaded}>Continuar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SourceVoucherUploadModal;
