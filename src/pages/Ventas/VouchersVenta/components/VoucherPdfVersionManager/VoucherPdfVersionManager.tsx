import { useEffect, useMemo, useRef, useState } from "react";
import {
  MdAdd,
  MdClose,
  MdCompareArrows,
  MdDeleteOutline,
  MdDescription,
  MdFlight,
  MdHistory,
  MdRemove,
  MdRestore,
} from "react-icons/md";
import { toast } from "react-toastify";
import { voucherVentaService } from "../../../../../services/voucherVentaService";
import {
  buildVoucherPdfVersionDiff,
  getVoucherPdfSnapshotFlights,
} from "../../utils/voucherPdfVersionDiff";
import "./VoucherPdfVersionManager.scss";

const CHANGE_TYPE_LABELS = {
  INITIAL: "Estado inicial",
  MANUAL_SAVE: "Edición del PDF",
  FLIGHT_UPDATE: "Actualización de vuelos",
  QUOTE_DAY_SYNC: "Días sincronizados",
  RESTORED: "Versión restaurada",
};

const formatDate = (value) => {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Sin fecha"
    : date.toLocaleString("es-PE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

const getResponseData = (response) => response?.data ?? response ?? null;
const versionId = (version) => String(version?.id ?? "");

const getPreviousVersion = (versions, selected) => {
  const index = versions.findIndex(
    (version) => versionId(version) === versionId(selected),
  );
  return index >= 0 ? versions[index + 1] || null : null;
};

const renderStatusLabel = (state) => {
  const labels = {
    added: "Agregado",
    removed: "Eliminado",
    modified: "Modificado",
    unchanged: "Sin cambios",
  };
  return labels[state] || "Modificado";
};

const DiffLines = ({ lines = [], emptyLabel = "Sin contenido" }) => {
  if (lines.length === 0) {
    return <p className="voucher-pdf-diff__empty-line">{emptyLabel}</p>;
  }

  return (
    <div className="voucher-pdf-diff__lines">
      {lines.map((line, index) => (
        <div
          className={`voucher-pdf-diff__line is-${line.type}`}
          key={`${line.type}-${index}-${line.value}`}
        >
          <span aria-hidden="true">
            {line.type === "added" ? "+" : line.type === "removed" ? "−" : " "}
          </span>
          <span>{line.value || " "}</span>
        </div>
      ))}
    </div>
  );
};

const getFlightValue = (flight = {}, fields = []) => {
  const value = fields
    .map((field) => flight?.[field])
    .find(
      (candidate) =>
        candidate !== undefined && candidate !== null && String(candidate).trim(),
    );
  return value ? String(value).trim() : "";
};

const FlightPreview = ({ flight, state }) => {
  const airline = getFlightValue(flight, ["airline", "aerolinea", "carrier"]);
  const number = getFlightValue(flight, [
    "flight_number",
    "flightNumber",
    "numero_vuelo",
    "numeroVuelo",
  ]);
  const origin = getFlightValue(flight, ["origin", "origen", "from"]);
  const destination = getFlightValue(flight, ["destination", "destino", "to"]);
  const date = getFlightValue(flight, ["date", "fecha", "departure_date"]);
  const time = getFlightValue(flight, [
    "departure_time",
    "hora_salida",
    "horaSalida",
  ]);

  return (
    <article className={`voucher-pdf-diff__flight is-${state}`}>
      <div className="voucher-pdf-diff__flight-icon">
        <MdFlight size={18} />
      </div>
      <div>
        <strong>
          {[airline, number].filter(Boolean).join(" · ") || "Vuelo sin detalle"}
        </strong>
        <span>
          {[
            origin && destination ? `${origin} → ${destination}` : "",
            date,
            time,
          ]
            .filter(Boolean)
            .join(" · ") || "Sin ruta registrada"}
        </span>
      </div>
      <small>{renderStatusLabel(state)}</small>
    </article>
  );
};

const VersionDiffDocument = ({ targetVersion, baseVersion, targetRecord, baseRecord }) => {
  const targetSnapshot = targetRecord?.snapshot || {};
  const baseSnapshot = baseRecord?.snapshot || {};
  const diff = useMemo(
    () => buildVoucherPdfVersionDiff(baseSnapshot, targetSnapshot),
    [baseRecord?.id, targetRecord?.id, baseSnapshot, targetSnapshot],
  );
  const currentFlights = getVoucherPdfSnapshotFlights(targetSnapshot);
  const changedDays = diff.days.filter((day) => day.state !== "unchanged");
  const changedFlights = diff.flights.filter(
    (flight) => flight.state !== "unchanged",
  );

  return (
    <section className="voucher-pdf-diff" aria-live="polite">
      <header className="voucher-pdf-diff__header">
        <div>
          <span>
            <MdCompareArrows size={15} /> Comparación de contenido
          </span>
          <h4>
            V{targetVersion.version_number}
            {baseVersion ? ` frente a V${baseVersion.version_number}` : " · estado inicial"}
          </h4>
          <p>
            {baseVersion
              ? "Los cambios se muestran sobre una vista del voucher, sin sustituir el contenido guardado."
              : "Esta es la primera versión registrada del contenido operativo."}
          </p>
        </div>
        <div className="voucher-pdf-diff__stats">
          <span className="is-add">
            <MdAdd size={15} /> {diff.summary.addedLines}
          </span>
          <span className="is-remove">
            <MdRemove size={15} /> {diff.summary.removedLines}
          </span>
          <span>{changedDays.length} día(s)</span>
        </div>
      </header>

      <div className="voucher-pdf-diff__paper">
        <header className="voucher-pdf-diff__paper-header">
          <div className="voucher-pdf-diff__brand">Venso Tours</div>
          <strong>VOUCHER DE SERVICIO</strong>
          <small>
            Versión V{targetVersion.version_number} · {formatDate(targetVersion.created_at)}
          </small>
        </header>

        {diff.general.length > 0 && (
          <section className="voucher-pdf-diff__section">
            <h5>
              <MdDescription size={16} /> Datos editables modificados
            </h5>
            <div className="voucher-pdf-diff__general-grid">
              {diff.general.map((field) => (
                <article key={field.label}>
                  <strong>{field.label}</strong>
                  <DiffLines lines={field.lines} />
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="voucher-pdf-diff__section">
          <h5>
            <MdDescription size={16} /> {diff.itineraryTitle.after || diff.itineraryTitle.before || "ITINERARIO"}
          </h5>
          {changedDays.length === 0 ? (
            <p className="voucher-pdf-diff__unchanged">
              No hubo modificaciones de días o descripciones en esta versión.
            </p>
          ) : (
            changedDays.map((day) => {
              const shownDay = day.after || day.before || {};
              return (
                <article
                  className={`voucher-pdf-diff__day is-${day.state}`}
                  key={day.key}
                >
                  <header>
                    <span>Día {day.number}</span>
                    <small>{renderStatusLabel(day.state)}</small>
                  </header>
                  <div className="voucher-pdf-diff__day-title">
                    <DiffLines
                      lines={day.titleLines}
                      emptyLabel={shownDay?.title || "Día sin título"}
                    />
                  </div>
                  <DiffLines lines={day.contentLines} />
                </article>
              );
            })
          )}
        </section>

        <section className="voucher-pdf-diff__section">
          <h5>
            <MdFlight size={16} /> Vuelos del voucher
          </h5>
          {changedFlights.length > 0 ? (
            changedFlights.map((flight) => (
              <FlightPreview
                key={flight.key}
                flight={flight.after || flight.before || {}}
                state={flight.state}
              />
            ))
          ) : currentFlights.length > 0 ? (
            <p className="voucher-pdf-diff__unchanged">
              Los {currentFlights.length} vuelo(s) permanecen sin cambios.
            </p>
          ) : (
            <p className="voucher-pdf-diff__unchanged">
              No hay vuelos externos registrados en esta versión.
            </p>
          )}
        </section>
      </div>
    </section>
  );
};

const VoucherPdfVersionManager = ({
  isOpen,
  voucherId,
  canRestore,
  canDelete,
  onClose,
  onRestored,
}) => {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [snapshotByVersionId, setSnapshotByVersionId] = useState({});
  const snapshotCacheRef = useRef({});
  const historySessionRef = useRef(null);
  const actionRef = useRef(null);
  const comparisonRequestRef = useRef(null);
  const historySessionKey = JSON.stringify([isOpen, voucherId, canRestore, canDelete]);
  if (historySessionRef.current?.key !== historySessionKey) {
    historySessionRef.current = { key: historySessionKey };
  }
  const historySession = historySessionRef.current;

  const loadSnapshot = async (version, session) => {
    const id = versionId(version);
    if (!id) return null;
    if (snapshotCacheRef.current[id]) return snapshotCacheRef.current[id];

    const response = await voucherVentaService.getDatosPdfVersion(voucherId, version.id);
    if (historySessionRef.current !== session) return null;
    const record = getResponseData(response);
    snapshotCacheRef.current = { ...snapshotCacheRef.current, [id]: record };
    setSnapshotByVersionId(snapshotCacheRef.current);
    return record;
  };

  const selectVersion = async (version, versionList = versions, session = historySessionRef.current) => {
    if (!version || !isOpen || historySessionRef.current !== session) return;
    const request = {};
    comparisonRequestRef.current = request;
    const isCurrent = () => historySessionRef.current === session
      && comparisonRequestRef.current === request;
    setSelectedVersionId(versionId(version));
    setLoadingComparison(true);
    try {
      const previous = getPreviousVersion(versionList, version);
      await Promise.all([
        loadSnapshot(version, session),
        previous ? loadSnapshot(previous, session) : Promise.resolve(null),
      ]);
    } catch (error) {
      if (!isCurrent()) return;
      console.error(
        "No se pudo preparar la comparación del historial del PDF:",
        error,
      );
      toast.error("No se pudo abrir la comparación de esta versión");
    } finally {
      if (isCurrent()) setLoadingComparison(false);
    }
  };

  const loadVersions = async () => {
    if (!voucherId || !isOpen) return;
    const session = historySessionRef.current;
    setLoading(true);
    try {
      const response = await voucherVentaService.getDatosPdfVersions(voucherId);
      if (historySessionRef.current !== session) return;
      const nextVersions = getResponseData(response) || [];
      setVersions(nextVersions);
      const selected = nextVersions[0] || null;
      setSelectedVersionId(selected ? versionId(selected) : null);
      if (selected) await selectVersion(selected, nextVersions, session);
    } catch (error) {
      if (historySessionRef.current !== session) return;
      console.error("No se pudo cargar el historial del PDF:", error);
      toast.error("No se pudo cargar el historial del PDF");
    } finally {
      if (historySessionRef.current === session) setLoading(false);
    }
  };

  useEffect(() => {
    historySessionRef.current = historySession;
    actionRef.current = null;
    setConfirmation(null);
    setVersions([]);
    setSelectedVersionId(null);
    setActingId(null);
    setLoadingComparison(false);
    comparisonRequestRef.current = null;
    snapshotCacheRef.current = {};
    setSnapshotByVersionId({});
    if (isOpen) loadVersions();
    return () => {
      if (historySessionRef.current === historySession) historySessionRef.current = null;
    };
  }, [historySession]);

  const selectedVersion =
    versions.find((version) => versionId(version) === selectedVersionId) ||
    versions[0] ||
    null;
  const baseVersion = selectedVersion
    ? getPreviousVersion(versions, selectedVersion)
    : null;
  const selectedRecord = selectedVersion
    ? snapshotByVersionId[versionId(selectedVersion)]
    : null;
  const baseRecord = baseVersion
    ? snapshotByVersionId[versionId(baseVersion)]
    : null;

  const confirmAction = async () => {
    if (!confirmation || !isOpen || actionRef.current) return;
    const { type, version } = confirmation;
    if ((type === "restore" && !canRestore) || (type === "delete" && !canDelete)) return;
    const session = historySessionRef.current;
    const action = {};
    actionRef.current = action;
    setActingId(version.id);
    try {
      if (type === "restore") {
        const response = await voucherVentaService.restoreDatosPdfVersion(
          voucherId,
          version.id,
        );
        if (historySessionRef.current !== session) return;
        const restoredVoucher = response?.data?.voucher || response?.voucher;
        await onRestored?.(restoredVoucher);
        if (historySessionRef.current !== session) return;
        toast.success(`Se restauró la versión ${version.version_number}`);
      } else {
        await voucherVentaService.deleteDatosPdfVersion(voucherId, version.id);
        if (historySessionRef.current !== session) return;
        toast.success(`Se eliminó la versión ${version.version_number}`);
      }
      setConfirmation(null);
      snapshotCacheRef.current = {};
      setSnapshotByVersionId({});
      await loadVersions();
    } catch (error) {
      if (historySessionRef.current !== session) return;
      console.error("No se pudo gestionar la versión del PDF:", error);
      toast.error(
        type === "restore"
          ? "No se pudo restaurar la versión"
          : "No se pudo eliminar la versión",
      );
    } finally {
      if (actionRef.current === action) actionRef.current = null;
      if (historySessionRef.current === session) setActingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="voucher-pdf-version-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Historial del contenido del voucher"
    >
      <section className="voucher-pdf-version-manager">
        <header className="voucher-pdf-version-manager__header">
          <div>
            <span className="voucher-pdf-version-manager__eyebrow">
              <MdHistory size={16} /> Historial operativo
            </span>
            <h3>Historial del contenido del PDF</h3>
            <p>
              Revisa qué cambió entre versiones del voucher.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar historial">
            <MdClose size={22} />
          </button>
        </header>

        <div className="voucher-pdf-version-manager__content">
          {loading ? (
            <p className="voucher-pdf-version-manager__empty">Cargando historial…</p>
          ) : versions.length === 0 ? (
            <p className="voucher-pdf-version-manager__empty">
              Aún no hay cambios guardados para este PDF.
            </p>
          ) : (
            <>
              <aside
                className="voucher-pdf-version-timeline"
                aria-label="Versiones disponibles"
              >
                {versions.map((version) => {
                  const isSelected = versionId(version) === versionId(selectedVersion);
                  return (
                    <button
                      type="button"
                      key={version.id}
                      className={isSelected ? "is-selected" : ""}
                      onClick={() => selectVersion(version)}
                      aria-pressed={isSelected}
                    >
                      <strong>V{version.version_number}</strong>
                      <span>
                        {CHANGE_TYPE_LABELS[version.change_type] || "Cambio guardado"}
                      </span>
                      <small>{formatDate(version.created_at)}</small>
                    </button>
                  );
                })}
              </aside>

              <main className="voucher-pdf-version-comparison">
                <div className="voucher-pdf-version-comparison__toolbar">
                  <span>
                    {selectedVersion
                      ? `V${selectedVersion.version_number}${baseVersion ? ` ← V${baseVersion.version_number}` : ""}`
                      : "Selecciona una versión"}
                  </span>
                  {selectedVersion && (
                    <div>
                      {canRestore && (
                        <button
                          type="button"
                          className="is-restore"
                          onClick={() =>
                            setConfirmation({ type: "restore", version: selectedVersion })
                          }
                          disabled={actingId === selectedVersion.id}
                        >
                          <MdRestore size={17} /> Restaurar esta versión
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className="is-delete"
                          onClick={() =>
                            setConfirmation({ type: "delete", version: selectedVersion })
                          }
                          disabled={actingId === selectedVersion.id}
                          aria-label={`Eliminar versión ${selectedVersion.version_number}`}
                        >
                          <MdDeleteOutline size={18} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {loadingComparison ||
                !selectedRecord ||
                (baseVersion && !baseRecord) ? (
                  <p className="voucher-pdf-version-manager__empty">
                    Preparando comparación…
                  </p>
                ) : (
                  <VersionDiffDocument
                    targetVersion={selectedVersion}
                    baseVersion={baseVersion}
                    targetRecord={selectedRecord}
                    baseRecord={baseRecord}
                  />
                )}
              </main>
            </>
          )}
        </div>

        {confirmation && (
          <footer className="voucher-pdf-version-manager__confirmation">
            <span>
              {confirmation.type === "restore"
                ? `¿Restaurar V${confirmation.version.version_number}? El estado actual se conservará como una nueva versión.`
                : `¿Eliminar V${confirmation.version.version_number} del historial?`}
            </span>
            <div>
              <button type="button" onClick={() => setConfirmation(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className={confirmation.type === "delete" ? "is-danger" : "is-confirm"}
                onClick={confirmAction}
                disabled={actingId === confirmation.version.id}
              >
                {actingId === confirmation.version.id ? "Procesando…" : "Confirmar"}
              </button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
};

export default VoucherPdfVersionManager;
