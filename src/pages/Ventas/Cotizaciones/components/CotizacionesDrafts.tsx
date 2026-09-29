import React, { useState, useEffect, useCallback } from "react";
import {
  MdDelete,
  MdEdit,
  MdDrafts,
  MdRefresh,
  MdClose,
  MdAccessTime,
  MdPerson,
  MdChildCare,
  MdList,
  MdCalendarToday,
} from "react-icons/md";
import {
  getAllDrafts,
  removeDraft,
  cleanOldDrafts,
  DRAFTS_KEY,
  DRAFTS_CHANGED_EVENT,
} from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/useCotizacionDraft";
import "./CotizacionesDrafts.scss";

const CotizacionesDrafts = ({ onRestoreDraft, onRemoveDraft }) => {
  const [drafts, setDrafts] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(null);

  const loadDrafts = useCallback(() => {
    cleanOldDrafts();
    setDrafts(getAllDrafts());
  }, []);

  useEffect(() => {
    loadDrafts();

    const handleDraftChange = () => loadDrafts();
    const handleStorage = (event) => {
      if (!event.key || event.key === DRAFTS_KEY) {
        loadDrafts();
      }
    };

    window.addEventListener(DRAFTS_CHANGED_EVENT, handleDraftChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(DRAFTS_CHANGED_EVENT, handleDraftChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [loadDrafts]);

  const handleDelete = (draftKey) => {
    removeDraft(draftKey);
    setConfirmingDelete(null);
    loadDrafts();
    if (onRemoveDraft) onRemoveDraft(draftKey);
  };

  const handleRestore = (draft) => {
    if (onRestoreDraft) {
      onRestoreDraft(draft);
      setIsOpen(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Sin fecha";
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "Hace un momento";
      if (diffMins < 60) return `Hace ${diffMins} min`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `Hace ${diffHours}h`;
      return date.toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Sin fecha";
    }
  };

  const serviceCount = (draft) =>
    draft.days?.reduce((sum, d) => sum + (d.servicios?.length || 0), 0) || 0;

  const daysCount = (draft) => draft.days?.length || 0;

  const adultsCount = (draft) => draft.peopleCount?.adults || 0;

  const childrenCount = (draft) => draft.peopleCount?.children || 0;

  if (drafts.length === 0) return null;

  return (
    <>
      {/* Floating trigger button */}
      <button
        type="button"
        className="drafts-fab"
        onClick={() => {
          loadDrafts();
          setIsOpen(true);
        }}
        title="Borradores guardados en este dispositivo"
        aria-label={`Abrir ${drafts.length} borradores locales`}
      >
        <MdDrafts />
        <span className="drafts-fab__label">Borradores</span>
        <span className="drafts-fab__count">{drafts.length}</span>
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div className="drafts-backdrop" onClick={() => setIsOpen(false)} />
      )}

      {/* Side panel */}
      <div className={`drafts-panel${isOpen ? " drafts-panel--open" : ""}`}>
        <div className="drafts-panel__header">
          <div className="drafts-panel__header-copy">
            <span className="drafts-panel__header-icon">
              <MdDrafts />
            </span>
            <div>
              <h3>
                Borradores
                <span className="drafts-panel__badge">{drafts.length}</span>
              </h3>
              <p>Guardados automáticamente en este dispositivo</p>
            </div>
          </div>
          <div className="drafts-panel__header-actions">
            <button
              type="button"
              onClick={loadDrafts}
              title="Actualizar borradores"
              aria-label="Actualizar borradores"
            >
              <MdRefresh />
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              title="Cerrar"
              aria-label="Cerrar borradores"
            >
              <MdClose />
            </button>
          </div>
        </div>

        <div className="drafts-panel__list">
          {drafts.map((draft) => (
            <div
              key={draft.draftKey}
              className={`drafts-card${draft.isNew ? " drafts-card--new" : ""}${draft.isEdit ? " drafts-card--edit" : ""}`}
            >
              <div className="drafts-card__top">
                <span
                  className={`drafts-card__badge${draft.isNew ? " drafts-card__badge--new" : ""}${draft.isEdit ? " drafts-card__badge--edit" : ""}`}
                >
                  {draft.isNew
                    ? "Sin guardar"
                    : draft.isEdit
                      ? "Edición local"
                      : "Borrador"}
                </span>
                {draft.originalCodigo && (
                  <span className="drafts-card__code">
                    {draft.originalCodigo}
                  </span>
                )}
              </div>

              <p
                className="drafts-card__title"
                title={draft.displayTitle || draft.titulo || "Sin título"}
              >
                {draft.displayTitle || draft.titulo || "Sin título"}
              </p>

              <div className="drafts-card__meta">
                <span>
                  <MdAccessTime /> {formatDate(draft.lastModified)}
                </span>
                <span>
                  <MdCalendarToday /> {daysCount(draft)} días
                </span>
                <span>
                  <MdList /> {serviceCount(draft)} svc
                </span>
                <span>
                  <MdPerson /> {adultsCount(draft)} adulto{adultsCount(draft) !== 1 ? "s" : ""}
                </span>
                {childrenCount(draft) > 0 && (
                  <span>
                    <MdChildCare /> {childrenCount(draft)} niño{childrenCount(draft) !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <div className="drafts-card__actions">
                <button
                  type="button"
                  className="drafts-card__restore"
                  onClick={() => handleRestore(draft)}
                >
                  <MdEdit /> Continuar
                </button>
                {confirmingDelete === draft.draftKey ? (
                  <div className="drafts-card__confirm">
                    <button
                      type="button"
                      className="drafts-card__confirm-yes"
                      onClick={() => handleDelete(draft.draftKey)}
                    >
                      Eliminar
                    </button>
                    <button
                      type="button"
                      className="drafts-card__confirm-no"
                      onClick={() => setConfirmingDelete(null)}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="drafts-card__delete"
                    onClick={() => setConfirmingDelete(draft.draftKey)}
                    title="Eliminar borrador"
                    aria-label={`Eliminar borrador ${draft.displayTitle || draft.titulo || "Sin título"}`}
                  >
                    <MdDelete />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default CotizacionesDrafts;
