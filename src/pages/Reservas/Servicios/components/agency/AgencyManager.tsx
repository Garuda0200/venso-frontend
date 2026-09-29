import React, { useEffect, useMemo, useState } from "react";
import { FaBuilding, FaCheck, FaEdit, FaPlus, FaStar, FaTimes } from "react-icons/fa";
import { useAuth } from "../../../../../context/AuthContext";
import {
  Agency,
  createAgency,
  getAgencies,
  updateAgency,
} from "../../../../../services/agencyService";
import "./AgencyManager.scss";

const EMPTY_FORM = {
  name: "",
  active: true,
};

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
  const { auth } = useAuth();
  const isSuperAdmin = Number(auth?.role ?? auth?.user?.role) === 0;
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingAgency, setEditingAgency] = useState<Agency | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadAgencies = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await getAgencies(true);
      setAgencies(rows);
      onAgenciesChanged?.(rows);
    } catch (agencyError) {
      console.error("No se pudieron cargar las agencias", agencyError);
      setError("No fue posible cargar las agencias.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAgencies();
  }, []);

  const activeCount = useMemo(
    () => agencies.filter((agency) => agency.active).length,
    [agencies],
  );

  const openCreate = () => {
    setEditingAgency(null);
    setForm(EMPTY_FORM);
    setError("");
    setFormOpen(true);
  };

  const openEdit = (agency: Agency) => {
    setEditingAgency(agency);
    setForm({ name: agency.name, active: agency.active });
    setError("");
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingAgency(null);
    setForm(EMPTY_FORM);
    setError("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();

    if (!name) {
      setError("El nombre de la agencia es obligatorio.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (editingAgency) {
        await updateAgency(editingAgency.id, {
          name,
          active: editingAgency.is_primary ? true : form.active,
        });
      } else {
        await createAgency({ name, active: form.active, is_primary: false });
      }
      closeForm();
      await loadAgencies();
    } catch (saveError: any) {
      console.error("No se pudo guardar la agencia", saveError);
      setError(
        saveError?.response?.data?.message ||
          saveError?.message ||
          "No fue posible guardar la agencia.",
      );
    } finally {
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
            El nombre identifica el catálogo. Proveedores, servicios, modalidades y
            tarifas se configuran dentro de cada agencia.
          </p>
        </div>
        <div className="agency-manager__header-actions">
          <span className="agency-manager__count">{activeCount} activas</span>
          {isSuperAdmin && (
            <button type="button" className="agency-manager__create" onClick={openCreate}>
              <FaPlus /> Nueva agencia
            </button>
          )}
        </div>
      </header>

      {error && !formOpen && <div className="agency-manager__error">{error}</div>}

      {loading ? (
        <div className="agency-manager__loading">Cargando agencias…</div>
      ) : (
        <div className="agency-manager__grid">
          {agencies.map((agency) => (
            <article
              key={agency.id}
              className={`agency-card ${selectedAgencyId === agency.id ? "selected" : ""} ${!agency.active ? "inactive" : ""}`}
            >
              <div className="agency-card__topline">
                <span className="agency-card__icon"><FaBuilding /></span>
                <div className="agency-card__badges">
                  {agency.is_primary && <span className="primary"><FaStar /> Principal</span>}
                  <span className={agency.active ? "active" : "inactive"}>
                    {agency.active ? "Activa" : "Inactiva"}
                  </span>
                </div>
              </div>
              <h3>{agency.name}</h3>
              <p className="agency-card__description">
                Catálogo independiente de proveedores, servicios y tarifas.
              </p>
              <footer>
                <button type="button" onClick={() => onSelectAgency(agency)} disabled={!agency.active}>
                  {selectedAgencyId === agency.id ? <><FaCheck /> En uso</> : "Usar catálogo"}
                </button>
                {isSuperAdmin && (
                  <button type="button" className="edit" onClick={() => openEdit(agency)}>
                    <FaEdit /> Editar
                  </button>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}

      {formOpen && (
        <div className="agency-form-overlay">
          <form className="agency-form agency-form--simple" onSubmit={handleSubmit}>
            <header>
              <div>
                <span>{editingAgency ? "Configuración" : "Nuevo catálogo"}</span>
                <h3>{editingAgency ? `Editar ${editingAgency.name}` : "Crear agencia"}</h3>
              </div>
              <button type="button" onClick={closeForm} aria-label="Cerrar"><FaTimes /></button>
            </header>

            {error && <div className="agency-manager__error">{error}</div>}

            <div className="agency-form__grid agency-form__grid--single">
              <label>
                <span>Nombre de la agencia</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ej. Dika Travel"
                  required
                  autoFocus
                />
                <small>El código técnico se genera automáticamente.</small>
              </label>
            </div>

            {!editingAgency?.is_primary && (
              <label className="agency-form__check">
                <input
                  type="checkbox"
                  checked={form.active}
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
        </div>
      )}
    </section>
  );
};

export default AgencyManager;
