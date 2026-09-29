import React, { useEffect, useMemo, useState } from "react";
import { Dialog } from "primereact/dialog";
import {
  Agency,
  AgencyBusinessType,
  AgencyTariffType,
  createAgency,
  getAgencies,
} from "../../../../services/agencyService";
import "./styles/BusinessTypeModal.scss";

export interface QuotationAgencySelection {
  agency: Agency;
  platform: "venso";
  businessType: AgencyBusinessType;
  tariffType: AgencyTariffType;
}

interface BusinessTypeModalProps {
  visible: boolean;
  onHide: () => void;
  onSelect: (selection: QuotationAgencySelection) => void;
  canManageAgencies?: boolean;
}

const BusinessTypeModal = ({
  visible,
  onHide,
  onSelect,
  canManageAgencies = false,
}: BusinessTypeModalProps) => {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<number | null>(null);
  const [selectedTariffType, setSelectedTariffType] =
    useState<AgencyTariffType>("externa");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateAgency, setShowCreateAgency] = useState(false);
  const [creatingAgency, setCreatingAgency] = useState(false);
  const [agencyName, setAgencyName] = useState("");

  const selectedAgency = useMemo(
    () => agencies.find((agency) => agency.id === selectedAgencyId) || null,
    [agencies, selectedAgencyId],
  );

  const loadAgencies = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getAgencies(false);
      setAgencies(rows);
      setSelectedAgencyId((current) => {
        if (current && rows.some((agency) => agency.id === current)) return current;
        return rows.find((agency) => agency.is_primary)?.id || rows[0]?.id || null;
      });
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "No fue posible cargar las agencias.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    setSelectedTariffType("externa");
    void loadAgencies();
  }, [visible]);

  const handleConfirm = () => {
    if (!selectedAgency) return;
    onSelect({
      agency: selectedAgency,
      platform: "venso",
      businessType: selectedTariffType === "interna" ? "B2B" : "B2C",
      tariffType: selectedTariffType,
    });
    onHide();
  };

  const handleCancel = () => {
    setShowCreateAgency(false);
    setAgencyName("");
    onHide();
  };

  const handleCreateAgency = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = agencyName.trim();
    if (!name) {
      setError("Ingresa el nombre de la agencia.");
      return;
    }

    setCreatingAgency(true);
    setError(null);
    try {
      const created = await createAgency({ name, active: true, is_primary: false });
      setAgencies((current) =>
        [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setSelectedAgencyId(created.id);
      setAgencyName("");
      setShowCreateAgency(false);
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.message ||
          requestError?.response?.data?.error ||
          requestError?.message ||
          "No fue posible crear la agencia.",
      );
    } finally {
      setCreatingAgency(false);
    }
  };

  const footer = (
    <div className="modal-footer">
      <button className="btn-cancel" onClick={handleCancel} type="button">
        Cancelar
      </button>
      <button
        className="btn-confirm"
        onClick={handleConfirm}
        disabled={!selectedAgency || loading}
        type="button"
      >
        Crear cotización
      </button>
    </div>
  );

  return (
    <Dialog
      header="Seleccionar agencia"
      visible={visible}
      onHide={handleCancel}
      footer={footer}
      className="business-type-modal agency-quotation-modal"
      draggable={false}
      resizable={false}
      style={{ width: "min(820px, 94vw)" }}
    >
      <div className="modal-content">
        <div className="agency-modal-heading">
          <div>
            <p className="modal-description">
              Elige el catálogo de proveedores que utilizará la cotización.
            </p>
            <small>
              La modalidad compartida o privada se define en el paquete y cada
              servicio conserva sus propias tarifas.
            </small>
          </div>
          {canManageAgencies && (
            <button
              type="button"
              className="btn-new-agency"
              onClick={() => setShowCreateAgency((current) => !current)}
            >
              {showCreateAgency ? "Cerrar formulario" : "+ Nueva agencia"}
            </button>
          )}
        </div>

        {error && <div className="agency-modal-error">{error}</div>}

        {showCreateAgency && canManageAgencies && (
          <form className="agency-create-form agency-create-form--simple" onSubmit={handleCreateAgency}>
            <label>
              Nombre de la agencia
              <input
                value={agencyName}
                onChange={(event) => setAgencyName(event.target.value)}
                placeholder="Ej. Andes Partner Travel"
                autoFocus
              />
            </label>
            <button type="submit" disabled={creatingAgency}>
              {creatingAgency ? "Creando…" : "Guardar agencia"}
            </button>
          </form>
        )}

        <div className="agency-tariff-context" role="group" aria-label="Tipo de tarifa">
          <div>
            <strong>Tarifa para esta cotización</strong>
            <span>Se aplicará únicamente a los servicios de la agencia seleccionada.</span>
          </div>
          <div className="agency-tariff-context__options">
            {(["externa", "interna"] as AgencyTariffType[]).map((type) => (
              <button
                type="button"
                key={type}
                className={selectedTariffType === type ? "active" : ""}
                onClick={() => setSelectedTariffType(type)}
              >
                {type === "externa" ? "Externa" : "Interna"}
              </button>
            ))}
          </div>
        </div>

        <div className="business-type-cards agency-cards" aria-busy={loading}>
          {loading && <div className="agency-loading">Cargando agencias…</div>}
          {!loading && agencies.length === 0 && (
            <div className="agency-loading">No existen agencias activas.</div>
          )}
          {agencies.map((agency) => {
            const selected = selectedAgencyId === agency.id;
            const branding = agency.branding || {};
            const primaryColor = String(branding.primaryColor || "#ff007e");
            return (
              <button
                type="button"
                key={agency.id}
                className={`business-type-card agency-card ${selected ? "selected" : ""}`}
                onClick={() => setSelectedAgencyId(agency.id)}
                style={{ "--agency-accent": primaryColor } as React.CSSProperties}
              >
                <div className="card-header agency-header">
                  <div className="platform-icon">
                    <span className="icon-text">{agency.name.slice(0, 1).toUpperCase()}</span>
                  </div>
                  <div className="agency-card-copy">
                    <div className="platform-name">{agency.name}</div>
                    <small>Catálogo independiente</small>
                  </div>
                  {agency.is_primary && (
                    <span className="primary-agency-badge">Principal</span>
                  )}
                </div>
                <div className="card-body agency-card-body--simple">
                  <p>Proveedores y servicios administrados para {agency.name}.</p>
                  <span className="agency-selection-state">
                    {selected ? "Agencia seleccionada" : "Seleccionar agencia"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
};

export default BusinessTypeModal;
