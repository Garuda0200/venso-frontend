import { useEffect, useMemo, useState } from "react";
import EntidadIconView from "./components/EntidadIconView";
import HotelList from "./components/hotel/HotelList";
import TicketsList from "./components/ticket/TicketsList";
import TransporteList from "./components/transporte/TransporteList";
import VuelosList from "./components/vuelo/VuelosList";
import EndosesList from "./components/endose/EndosesList";
import TrenList from "./components/tren/TrenList";
import GuiaList from "./components/guia/GuiaList";
import RestauranteList from "./components/restaurante/RestauranteList";
import ServicioExtraList from "./components/servicio_extra/ServicioExtraList";
import AgencyManager from "./components/agency/AgencyManager";
import { Agency, getAgencies, getPrimaryAgency } from "../../../services/agencyService";
import { setServiciosAgencyScope } from "./services/api";
import "./Servicios.scss";
import "./components/common/PremiumEntityShared.scss";
import "./components/common/ServiciosPrimitives.scss";
import "./components/common/ServiciosTables.scss";
import "./components/common/ServiciosOverlays.scss";
import "./components/common/ServiciosForms.scss";
import "./components/common/ServiciosFilters.scss";
import "./components/common/ServiciosPremiumLayout.scss";
import "./components/common/ServiciosDomainCards.scss";
import "./components/common/ServiciosWorkspace.scss";

import {
  FaBuilding,
  FaBus,
  FaHandshake,
  FaHotel,
  FaPlane,
  FaPuzzlePiece,
  FaStar,
  FaTicketAlt,
  FaTimes,
  FaTrain,
  FaUserTie,
  FaUtensils,
} from "react-icons/fa";

const STORAGE_KEY = "venso:servicios:agency-id";

const Servicios = () => {
  const [activeView, setActiveView] = useState<string | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<number | null>(null);
  const [agencyLoading, setAgencyLoading] = useState(true);
  const [agencyError, setAgencyError] = useState("");

  const selectedAgency = useMemo(
    () => agencies.find((agency) => agency.id === selectedAgencyId) || null,
    [agencies, selectedAgencyId],
  );

  const loadAgencies = async () => {
    setAgencyLoading(true);
    setAgencyError("");
    try {
      const rows = await getAgencies(false);
      let primary = rows.find((agency) => agency.is_primary) || null;
      if (!primary) {
        try {
          primary = await getPrimaryAgency();
        } catch {
          primary = rows[0] || null;
        }
      }

      const storedAgencyId = Number(localStorage.getItem(STORAGE_KEY));
      const storedAgency = rows.find((agency) => agency.id === storedAgencyId && agency.active);
      const initialAgency = storedAgency || primary || rows[0] || null;

      setAgencies(rows);
      setSelectedAgencyId(initialAgency?.id || null);
      if (initialAgency?.id) localStorage.setItem(STORAGE_KEY, String(initialAgency.id));
    } catch (error) {
      console.error("No se pudieron cargar las agencias de servicios", error);
      setAgencyError("No fue posible cargar las agencias. Verifica la conexión con el backend.");
    } finally {
      setAgencyLoading(false);
    }
  };

  useEffect(() => {
    void loadAgencies();
  }, []);

  setServiciosAgencyScope(selectedAgencyId);

  const selectAgency = (agency: Agency) => {
    setSelectedAgencyId(agency.id);
    localStorage.setItem(STORAGE_KEY, String(agency.id));
  };

  const handleAgenciesChanged = (rows: Agency[]) => {
    const activeRows = rows.filter((agency) => agency.active);
    setAgencies(activeRows);
    if (!activeRows.some((agency) => agency.id === selectedAgencyId)) {
      const fallback = activeRows.find((agency) => agency.is_primary) || activeRows[0] || null;
      setSelectedAgencyId(fallback?.id || null);
      if (fallback?.id) localStorage.setItem(STORAGE_KEY, String(fallback.id));
    }
  };

  const entidades = useMemo(
    () => [
      {
        id: "agencias",
        name: "Agencias",
        icon: <FaBuilding />,
        description: "Agencias comerciales disponibles para asignar tarifas",
      },
      {
        id: "hoteles",
        name: "Hoteles",
        icon: <FaHotel />,
        description: "Catálogo universal de hoteles y habitaciones",
      },
      {
        id: "tickets",
        name: "Tickets",
        icon: <FaTicketAlt />,
        description: "Entradas universales con tarifas por agencia",
      },
      {
        id: "transportes",
        name: "Transportes",
        icon: <FaBus />,
        description: "Proveedores y unidades de movilidad",
      },
      {
        id: "vuelos",
        name: "Vuelos",
        icon: <FaPlane />,
        description: "Aerolíneas y tipos de vuelo",
      },
      {
        id: "restaurantes",
        name: "Restaurantes",
        icon: <FaUtensils />,
        description: "Proveedores gastronómicos",
      },
      {
        id: "endoses",
        name: "Endoses",
        icon: <FaHandshake />,
        description: "Operadores y tours asociados",
      },
      {
        id: "trenes",
        name: "Trenes",
        icon: <FaTrain />,
        description: "Empresas ferroviarias y vagones",
      },
      {
        id: "guias",
        name: "Guías",
        icon: <FaUserTie />,
        description: "Guías y rutas disponibles",
      },
      {
        id: "extras",
        name: "Extras",
        icon: <FaPuzzlePiece />,
        description: "Servicios adicionales de la agencia",
      },
    ],
    [],
  );

  const activeEntity = entidades.find((entity) => entity.id === activeView) || null;

  const renderActiveView = () => {
    const scopedKey = `${activeView || "home"}:${selectedAgencyId || "none"}`;

    switch (activeView) {
      case "agencias":
        return (
          <AgencyManager
            selectedAgencyId={selectedAgencyId}
            onSelectAgency={selectAgency}
            onAgenciesChanged={handleAgenciesChanged}
          />
        );
      case "hoteles":
        return <HotelList key={scopedKey} />;
      case "tickets":
        return <TicketsList key={scopedKey} />;
      case "transportes":
        return <TransporteList key={scopedKey} />;
      case "vuelos":
        return <VuelosList key={scopedKey} />;
      case "restaurantes":
        return <RestauranteList key={scopedKey} />;
      case "endoses":
        return <EndosesList key={scopedKey} />;
      case "trenes":
        return <TrenList key={scopedKey} />;
      case "guias":
        return <GuiaList key={scopedKey} />;
      case "extras":
        return <ServicioExtraList key={scopedKey} />;
      default:
        return (
          <div className="empty-state-modern">
            <FaPuzzlePiece className="empty-icon" />
            <h3>Selecciona un catálogo</h3>
            <p>Elige una categoría para administrar sus proveedores.</p>
          </div>
        );
    }
  };

  return (
    <div className={`servicios-container premium-design venso-services ${activeView ? "venso-services--focused" : ""}`}>
      <header className={`services-agency-hero ${activeView ? "services-agency-hero--compact" : ""}`}>
        <div className="services-agency-hero__copy">
          <span className="services-agency-hero__eyebrow">
            {activeEntity ? `CATÁLOGO / ${activeEntity.name.toUpperCase()}` : "CATÁLOGOS VENSO"}
          </span>
          <h1>{activeEntity?.name || "Servicios y tarifas"}</h1>
          <p>
            {activeEntity
              ? `${activeEntity.description} · ${selectedAgency?.name || "Catálogo activo"}`
              : "Los proveedores y servicios se registran una sola vez; cambia de agencia para administrar sus tarifas."}
          </p>
        </div>

        <div className="services-agency-switcher">
          <label htmlFor="services-agency-select">Tarifas visibles para</label>
          <div className="services-agency-switcher__control">
            <FaBuilding />
            <select
              id="services-agency-select"
              value={selectedAgencyId || ""}
              onChange={(event) => {
                const agency = agencies.find((item) => item.id === Number(event.target.value));
                if (agency) selectAgency(agency);
              }}
              disabled={agencyLoading || agencies.length === 0}
            >
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name}
                </option>
              ))}
            </select>
          </div>
          {selectedAgency && (
            <div className="services-agency-switcher__meta">
              {selectedAgency.is_primary && <span className="primary"><FaStar /> Principal</span>}
              <span>{selectedAgency.active ? "Agencia activa" : "Agencia inactiva"}</span>
            </div>
          )}
        </div>
      </header>

      {agencyError && <div className="services-agency-error">{agencyError}</div>}

      <div className={`services-workspace ${activeView ? "services-workspace--focused" : ""}`}>
        {activeView && (
          <nav className="tabs-header-premium tabs-header-premium--focused" aria-label="Catálogos de servicios">
            <span className="services-navigation-label">CATÁLOGOS</span>
            <div className="tabs-wrapper">
              {entidades.map((entity) => (
                <button
                  type="button"
                  key={entity.id}
                  className={`tab-item-premium ${activeView === entity.id ? "active" : ""}`}
                  onClick={() => setActiveView(entity.id)}
                  aria-current={activeView === entity.id ? "page" : undefined}
                >
                  <span className="tab-icon">{entity.icon}</span>
                  <span className="tab-text">{entity.name}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="exit-btn"
              onClick={() => setActiveView(null)}
              title="Volver al catálogo"
            >
              <FaTimes /> <span>Ver todos</span>
            </button>
          </nav>
        )}

        <div className="main-content-servicios">
          {agencyLoading ? (
            <div className="services-agency-loading">Preparando catálogos por agencia…</div>
          ) : !selectedAgencyId ? (
            <AgencyManager
              selectedAgencyId={selectedAgencyId}
              onSelectAgency={selectAgency}
              onAgenciesChanged={handleAgenciesChanged}
            />
          ) : !activeView ? (
            <EntidadIconView entidades={entidades} onSelectEntidad={setActiveView} />
          ) : (
            <div className="entity-view-wrapper">{renderActiveView()}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Servicios;
