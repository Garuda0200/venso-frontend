import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaBuilding, FaCheck, FaEdit, FaPlus, FaStar, FaTimes, FaTrashAlt } from "react-icons/fa";
import { AGENCIES_CHANGED_EVENT } from "../../../../../services/agencyEvents";
import { useAuth } from "../../../../../context/AuthContext";
import {
  Agency,
  createAgency,
  deleteAgency,
  getAgencies,
  updateAgency,
} from "../../../../../services/agencyService";
import "./AgencyManager.scss";

const EMPTY_FORM = {
  name: "",
  active: true,
};
const isProtectedAgency = (agency: Agency) => agency.is_primary || agency.code === "venso";

interface AgencyManagerProps {
  selectedAgencyId: number | null;
  onSelectAgency: (agency: Agency) => void;
  onAgenciesChanged?: (agencies: Agency[]) => void;
}

const AgencyManager = ({
  selectedAgencyId,
  onSelectAgency,
  onAgenciesChanged,
}: AgencyManagerProps) => {
  const { auth, user } = useAuth();
  const role = auth?.role ?? auth?.user?.role ?? user?.role;
  const isSuperAdmin = role != null && Number(role) === 0;
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingAgency, setEditingAgency] = useState<Agency | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showInactive, setShowInactive] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Agency | null>(null);
  const [notice, setNotice] = useState("");
  const loadController = useRef<AbortController | null>(null);
  const rowsRef = useRef<Agency[]>([]);
  const callbackRef = useRef(onAgenciesChanged);
  callbackRef.current = onAgenciesChanged;
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const createButton = useRef<HTMLButtonElement>(null);

  const applyRows = (rows: Agency[]) => {
    if (!mounted.current) return;
    rowsRef.current = rows;
    setAgencies(rows);
    callbackRef.current?.(rows);
  };

  const applySavedAgency = (agency: Agency) => {
    applyRows([agency, ...rowsRef.current.filter(row => row.id !== agency.id)]);
  };

  const loadAgencies = async () => {
    if (!mounted.current) return;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true);
    setError("");
    try {
      const rows = await getAgencies(true, { signal: controller.signal });
      if (!controller.signal.aborted) applyRows(rows);
    } catch (agencyError) {
      if (controller.signal.aborted) return;
      console.error("No se pudieron cargar las agencias", agencyError);
      setError("No fue posible cargar las agencias.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    void loadAgencies();
    const refresh = () => {
      void loadAgencies();
    };
    window.addEventListener(AGENCIES_CHANGED_EVENT, refresh);
    return () => {
      mounted.current = false;
      loadController.current?.abort();
      window.removeEventListener(AGENCIES_CHANGED_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    if (formOpen || pendingDelete) {
      if (dialogRef.current && !dialogRef.current.open) {
        dialogRef.current.showModal();
      }
    } else if (returnFocus.current) {
      const target = returnFocus.current.isConnected ? returnFocus.current : createButton.current;
      target?.focus();
      returnFocus.current = null;
    }
  }, [formOpen, pendingDelete]);

  const activeCount = useMemo(
    () => agencies.filter((agency) => agency.active).length,
    [agencies],
  );

  const openCreate = () => {
    returnFocus.current = document.activeElement as HTMLElement;
    setNotice("");
    setEditingAgency(null);
    setForm(EMPTY_FORM);
    setError("");
    setFormOpen(true);
  };

  const openEdit = (agency: Agency) => {
    returnFocus.current = document.activeElement as HTMLElement;
    setNotice("");
    setEditingAgency(agency);
    setForm({ name: agency.name, active: agency.active });
    setError("");
    setFormOpen(true);
  };

  const closeForm = () => {
    if (inFlight.current) return;
    dialogRef.current?.close();
    setPendingDelete(null);
    setFormOpen(false);
    setEditingAgency(null);
    setForm(EMPTY_FORM);
    setError("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const name = form.name.trim();

    if (name.length < 2) {
      setError("Ingresa un nombre de al menos dos caracteres.");
      return;
    }

    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      if (editingAgency) {
        const saved = await updateAgency(editingAgency.id, {
          name,
          active: isProtectedAgency(editingAgency) ? true : form.active,
        });
        applySavedAgency(saved);
      } else {
        const saved = await createAgency({ name, active: form.active, is_primary: false });
        applySavedAgency(saved);
      }
      inFlight.current = false;
      closeForm();
      setNotice(editingAgency ? "Agencia actualizada." : "Agencia creada.");
      void loadAgencies();
    } catch (saveError: any) {
      console.error("No se pudo guardar la agencia", saveError);
      setError(
        saveError?.response?.data?.message ||
          saveError?.message ||
          "No fue posible guardar la agencia.",
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const saved = await deleteAgency(pendingDelete.id);
      applySavedAgency(saved);
      inFlight.current = false;
      closeForm();
      setNotice(`Agencia ${saved.name} eliminada del catálogo activo.`);
      void loadAgencies();
    } catch (deleteError: any) {
      setError(
        deleteError?.response?.data?.message ||
          deleteError?.message ||
          "No fue posible eliminar la agencia.",
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <section className="agency-manager">
      <header className="agency-manager__header">
        <div>
          <span className="agency-manager__eyebrow">Catálogos por agencia</span>
          <h2>Agencias</h2>
          <p>
            Cada agencia puede tener precios propios o compartir una tarifa con otras agencias.
          </p>
        </div>
        <div className="agency-manager__header-actions">
          <span className="agency-manager__count">{activeCount} activas</span>
          <label className="agency-manager__inactive-filter">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={event => setShowInactive(event.target.checked)}
            />
            Mostrar inactivas
          </label>
          {isSuperAdmin && (
            <button ref={createButton} type="button" className="agency-manager__create" onClick={openCreate}>
              <FaPlus /> Nueva agencia
            </button>
          )}
        </div>
      </header>

      {notice && <p className="agency-manager__notice" role="status">{notice}</p>}
      {error && !formOpen && !pendingDelete && (
        <div className="agency-manager__error" role="alert">
          {error}
          <button type="button" onClick={() => void loadAgencies()}>Actualizar agencias</button>
        </div>
      )}

      {loading && !agencies.length ? (
        <div className="agency-manager__loading">Cargando agencias…</div>
      ) : (
        <div className="agency-manager__grid">
          {agencies.filter(agency => showInactive || agency.active).map((agency) => (
            <article
              key={agency.id}
              data-agency-id={agency.id}
              className={`agency-card ${selectedAgencyId === agency.id ? "selected" : ""} ${!agency.active ? "inactive" : ""}`}
            >
              <div className="agency-card__topline">
                <span className="agency-card__icon"><FaBuilding /></span>
                <div className="agency-card__badges">
                  {isProtectedAgency(agency) && <span className="primary"><FaStar /> Principal</span>}
                  <span className={agency.active ? "active" : "inactive"}>
                    {agency.active ? "Activa" : "Inactiva"}
                  </span>
                </div>
              </div>
              <h3>{agency.name}</h3>
              <p className="agency-card__description">
                Servicios comunes, tarifas propias o compartidas.
              </p>
              <footer>
                <button type="button" onClick={() => onSelectAgency(agency)} disabled={!agency.active}>
                  {selectedAgencyId === agency.id ? <><FaCheck /> En uso</> : "Usar catálogo"}
                </button>
                {isSuperAdmin && (
                  <button type="button" className="edit" aria-label={`Editar ${agency.name}`} onClick={() => openEdit(agency)}>
                    <FaEdit /> Editar
                  </button>
                )}
                {isSuperAdmin && agency.active && !isProtectedAgency(agency) && (
                  <button
                    type="button"
                    className="delete"
                    aria-label={`Eliminar ${agency.name}`}
                    onClick={() => {
                      returnFocus.current = document.activeElement as HTMLElement;
                      setPendingDelete(agency);
                      setError("");
                      setNotice("");
                    }}
                  >
                    <FaTrashAlt /> Eliminar
                  </button>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}

      {(formOpen || pendingDelete) && createPortal(
        <dialog
          ref={dialogRef}
          className="agency-form-overlay"
          aria-labelledby="agency-form-title"
          aria-busy={saving}
          onCancel={event => {
            event.preventDefault();
            closeForm();
          }}
          onKeyDown={event => {
            if (event.key === "Escape") event.stopPropagation();
          }}
          onClick={event => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          {formOpen ? (
            <form className="agency-form agency-form--simple" onSubmit={handleSubmit}>
              <header>
                <div>
                  <span>{editingAgency ? "Configuración" : "Nuevo catálogo"}</span>
                  <h3 id="agency-form-title">{editingAgency ? `Editar ${editingAgency.name}` : "Crear agencia"}</h3>
                </div>
                <button type="button" onClick={closeForm} disabled={saving} aria-label="Cerrar"><FaTimes /></button>
              </header>

              {error && <div className="agency-manager__error" role="alert">{error}</div>}

              <div className="agency-form__grid agency-form__grid--single">
                <label>
                  <span>Nombre de la agencia</span>
                  <input
                    value={form.name}
                    disabled={saving}
                    minLength={2}
                    maxLength={150}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Ej. Dika Travel"
                    required
                    autoFocus
                  />
                </label>
              </div>

              {(!editingAgency || !isProtectedAgency(editingAgency)) && (
                <label className="agency-form__check">
                  <input
                    type="checkbox"
                    checked={form.active}
                    disabled={saving}
                    onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                  />
                  <span>Agencia activa y disponible en cotizaciones</span>
                </label>
              )}

              <footer>
                <button type="button" className="secondary" onClick={closeForm} disabled={saving}>Cancelar</button>
                <button type="submit" className="primary" disabled={saving}>
                  {saving ? "Guardando…" : editingAgency ? "Guardar cambios" : "Crear agencia"}
                </button>
              </footer>
            </form>
          ) : (
            <div className="agency-form agency-form--simple agency-delete">
              <header>
                <div>
                  <span>Confirmar eliminación</span>
                  <h3 id="agency-form-title">Eliminar agencia</h3>
                </div>
              </header>
              <p>
                <strong>{pendingDelete?.name}</strong> dejará de aparecer entre las agencias activas.
                Sus cotizaciones y tarifas conservarán su referencia.
              </p>
              {error && <div className="agency-manager__error" role="alert">{error}</div>}
              <footer>
                <button type="button" className="secondary" disabled={saving} onClick={closeForm} autoFocus>
                  Cancelar
                </button>
                <button type="button" className="primary" disabled={saving} onClick={confirmDelete}>
                  {saving ? "Eliminando…" : "Eliminar agencia"}
                </button>
              </footer>
            </div>
          )}
        </dialog>, document.body
      )}
    </section>
  );
};

export default AgencyManager;
