import { useCallback, useEffect, useRef, useState } from "react";
import { useFileUpload } from "../../../../hooks/useFileUpload";
import { buildSourceVoucherMedia, normalizeSourceVoucher, validateSourceVoucherFile, type SourceVoucherMedia } from "../utils/sourceVoucher";
import {
  mediaErrorMessage, mediaMutationId, resolveVoucherMediaOperation,
  type PublishVoucherMediaVersion, type VoucherMediaChange, type VoucherMediaHistory,
  type VoucherMediaMutation,
} from "../utils/voucherMediaHistory";
import { voucherMediaService, VOUCHER_MEDIA_CHANGED } from "./voucherMediaService";

type Props = {
  isOpen: boolean;
  quotationId?: string | number | null;
  onChanged?: (media: SourceVoucherMedia | null) => void | Promise<void>;
};

type PendingUpload = {
  file: File;
  media: SourceVoucherMedia;
  request?: PublishVoucherMediaVersion;
};

export const useVoucherMediaManager = ({ isOpen, quotationId, onChanged }: Props) => {
  const [history, setHistory] = useState<VoucherMediaHistory | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [baseVersionId, setBaseVersionId] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const readSequence = useRef(0);
  const historyRevision = useRef(history?.revision);
  historyRevision.current = history?.revision;
  const pendingUpload = useRef<PendingUpload | null>(null);
  const pendingChange = useRef<{ kind: string; request: VoucherMediaMutation } | null>(null);
  const changedCallback = useRef(onChanged);
  changedCallback.current = onChanged;
  const upload = useFileUpload();

  const refresh = useCallback(async (beforeVersion?: number) => {
    if (!quotationId) throw new Error("La cotización del voucher no está disponible.");
    const request = ++readSequence.current;
    const scope = generation.current;
    let next = await voucherMediaService.history(quotationId, beforeVersion);
    if (scope !== generation.current || request !== readSequence.current) return;
    if (beforeVersion && historyRevision.current !== next.revision) {
      // A different writer changed the head while this page was loading.
      // Start again at the current head instead of displaying only older rows.
      next = await voucherMediaService.history(quotationId);
      if (scope !== generation.current || request !== readSequence.current) return;
      setHistory(next);
      return;
    }
    setHistory(previous => ({
      ...next,
      versions: beforeVersion && previous?.revision === next.revision
        ? [...previous.versions, ...next.versions.filter(row => !previous.versions.some(old => old.id === row.id))]
        : next.versions,
    }));
  }, [quotationId]);

  useEffect(() => {
    generation.current++;
    readSequence.current++;
    setHistory(null);
    setSelectedFile(null);
    setBaseVersionId("");
    setNote("");
    setError("");
    setMessage("");
    setUncertain(false);
    pendingUpload.current = null;
    pendingChange.current = null;
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    refresh().catch(error => {
      if (active) setError(mediaErrorMessage(error, "No se pudo consultar el historial."));
    }).finally(() => { if (active) setLoading(false); });
    const onMediaChanged = (event: Event) => {
      if ((event as CustomEvent).detail?.quotationId === String(quotationId)) {
        void refresh().catch(() => {});
      }
    };
    window.addEventListener(VOUCHER_MEDIA_CHANGED, onMediaChanged);
    return () => {
      active = false;
      generation.current++;
      readSequence.current++;
      window.removeEventListener(VOUCHER_MEDIA_CHANGED, onMediaChanged);
    };
  }, [isOpen, quotationId, refresh]);

  const selectFile = (file: File | null) => {
    if (saving || uncertain) return;
    const validation = validateSourceVoucherFile(file);
    setError(validation);
    setMessage("");
    setSelectedFile(validation ? null : file);
    if (pendingUpload.current?.file !== file) {
      const abandoned = pendingUpload.current;
      pendingUpload.current = null;
      if (abandoned) void upload.deleteFile(abandoned.media.url).catch(() => {});
    }
  };

  const finish = async (result: VoucherMediaChange) => {
    // Invalidate outstanding reads before publishing the committed state.
    readSequence.current++;
    const media = normalizeSourceVoucher(result.voucherMedia);
    setHistory(previous => previous && ({
      ...previous, revision: result.revision, voucherMedia: media,
      currentVersionId: media?.documentVersionId || null,
    }));
    setUncertain(false);
    setMessage("Cambios guardados.");
    try {
      await Promise.all([refresh(), changedCallback.current?.(media)]);
    } catch {
      setMessage("Los cambios se guardaron. Actualiza la vista para consultar el historial.");
    }
  };

  const recover = async (failure: any) => {
    const status = failure?.response?.status;
    const unresolved = !status || status >= 500;
    setUncertain(unresolved);
    setError(unresolved
      ? "La respuesta se interrumpió. Reintenta para recuperar esta misma operación."
      : mediaErrorMessage(failure, "No se pudo guardar el archivo."));
    if (status && status < 500) {
      if (pendingUpload.current) pendingUpload.current.request = undefined;
      pendingChange.current = null;
    }
    if (status === 409) await refresh().catch(() => {});
  };

  const saveFile = async () => {
    if (!quotationId || !history || !selectedFile || saving) return;
    const validation = validateSourceVoucherFile(selectedFile);
    if (validation) { setError(validation); return; }
    setSaving(true);
    setError("");
    try {
      let pending = pendingUpload.current;
      if (!pending || pending.file !== selectedFile) {
        const uploaded = buildSourceVoucherMedia(await upload.uploadFile(selectedFile, "voucher-media"));
        if (!uploaded?.mediaAssetId) throw new Error("La subida no devolvió un archivo registrado.");
        pending = { file: selectedFile, media: uploaded };
        pendingUpload.current = pending;
      }
      pending.request ??= {
        mediaAssetId: pending.media.mediaAssetId!, expectedRevision: history.revision,
        operationId: mediaMutationId(), baseVersionId: baseVersionId || null,
        origin: baseVersionId ? "external_edit" : "upload", note: note.trim() || undefined,
      };
      const request = pending.request;
      const result = await resolveVoucherMediaOperation(
        () => voucherMediaService.publish(quotationId, request),
        () => voucherMediaService.operation(quotationId, request.operationId),
      );
      pendingUpload.current = null;
      setSelectedFile(null);
      setBaseVersionId("");
      setNote("");
      await finish(result);
    } catch (failure) {
      if (!pendingUpload.current) {
        setError(mediaErrorMessage(failure, "No se pudo subir el archivo."));
      } else {
        await recover(failure);
      }
    } finally { setSaving(false); }
  };

  const changeVersion = async (kind: "detach" | string) => {
    if (!quotationId || !history || saving) return;
    setSaving(true);
    setError("");
    try {
      if (!pendingChange.current || pendingChange.current.kind !== kind) {
        pendingChange.current = { kind, request: { expectedRevision: history.revision, operationId: mediaMutationId() } };
      }
      const request = pendingChange.current.request;
      const result = await resolveVoucherMediaOperation(
        () => kind === "detach" ? voucherMediaService.detach(quotationId, request) : voucherMediaService.restore(quotationId, kind, request),
        () => voucherMediaService.operation(quotationId, request.operationId),
      );
      pendingChange.current = null;
      await finish(result);
      return true;
    } catch (failure) {
      await recover(failure);
      return false;
    } finally { setSaving(false); }
  };

  return {
    history, selectedFile, baseVersionId, note, setBaseVersionId, setNote,
    loading, saving, uncertain, error, message, selectFile, saveFile, changeVersion, refresh,
    isUploading: upload.isUploading, uploadProgress: upload.uploadProgress,
    busy: loading || saving || upload.isUploading,
  };
};
