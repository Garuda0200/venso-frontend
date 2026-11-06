import React from "react";
import { MdDownload, MdHistory, MdOpenInNew, MdRestore } from "react-icons/md";
import { isWordVoucher, voucherMediaOrigin, type VoucherMediaHistory, type VoucherMediaVersion } from "../utils/voucherMediaHistory";
import type { SourceVoucherMedia } from "../utils/sourceVoucher";

type Props = {
  history: VoucherMediaHistory;
  busy: boolean;
  canManage: boolean;
  onDownload: (media: SourceVoucherMedia, forEditing?: boolean) => void;
  onPreview: (media: SourceVoucherMedia) => void;
  onRestore: (version: VoucherMediaVersion) => void;
  onMore: () => void;
};

export default function VoucherMediaHistoryList({ history, busy, canManage, onDownload, onPreview, onRestore, onMore }: Props) {
  return (
    <section className="voucher-media-manager__history" aria-label="Historial de archivos">
      <h4><MdHistory /> Versiones del archivo</h4>
      {history.versions.length ? (
        <ol>
          {history.versions.map(version => (
            <li key={version.id}>
              <div className="voucher-media-manager__version-copy">
                <div className="voucher-media-manager__version-label">
                  <strong>Versión {version.versionNumber}</strong>
                  {version.id === history.currentVersionId && <span className="is-current">Vigente</span>}
                </div>
                <span className="voucher-media-manager__version-name">{version.media.originalName}</span>
                <small>{new Date(version.createdAt).toLocaleString("es-PE")} · {voucherMediaOrigin(version.origin)}</small>
                {version.createdByName && <small>{version.createdByName}</small>}
                {version.note && <small>{version.note}</small>}
              </div>
              <div className="voucher-media-manager__file-actions">
                <button type="button" className="secondary" disabled={busy} onClick={() => onPreview(version.media)} aria-label={`Ver versión ${version.versionNumber}`}><MdOpenInNew /> Ver</button>
                <button type="button" className="secondary" disabled={busy} onClick={() => onDownload(version.media)} aria-label={`Descargar versión ${version.versionNumber}`}><MdDownload /> Descargar</button>
                {canManage && isWordVoucher(version.media) && (
                  <button type="button" className="secondary" disabled={busy} onClick={() => onDownload(version.media, true)} aria-label={`Descargar versión ${version.versionNumber} para editar`}>Editar fuera</button>
                )}
                {canManage && version.id !== history.currentVersionId && (
                  <button type="button" className="secondary" disabled={busy} onClick={() => onRestore(version)} aria-label={`Restaurar versión ${version.versionNumber}`}><MdRestore /> Restaurar</button>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : <p>Las nuevas subidas aparecerán aquí.</p>}
      {history.nextBeforeVersion && <button type="button" className="secondary" disabled={busy} onClick={onMore}>Ver versiones anteriores</button>}
    </section>
  );
}
