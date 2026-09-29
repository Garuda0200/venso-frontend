import React, { useState, useMemo } from "react";
import LoadingIndicator from "../../../../../../../UI/LoadingIndicator/LoadingIndicator";
import MessageDisplay from "../../../../../../../UI/MessageDisplay/MessageDisplay";
import {
  FaUserTie,
  FaRoute,
  FaSearch,
  FaFilter,
  FaChevronRight,
  FaStar,
} from "react-icons/fa";
import "./ParentServicePanel.scss";

/**
 * Returns the canonical ID for a service depending on category
 */
const getServiceId = (service, categoryId, platform) => {
  if (platform === "venso" && categoryId === "guias" && service.isVirtualTour) {
    return service.id; // already unique tour id (e.g., tour_City Tour)
  }

  switch (categoryId) {
    case "guias":
      return service.id_guia || service.guia?.id_guia || service.id;
    case "hoteles":
      return service.id_hotel || service.id;
    case "transportes":
      return service.id_transporte || service.id;
    case "trenes":
      return service.id_tren || service.id;
    case "vuelos":
      return service.id_vuelo || service.id;
    case "endoses":
      return service.id_endose || service.id;
    case "restaurantes":
      return service.id_restaurante || service.id;
    case "tickets":
      return service.id_ticket || service.id;
    default:
      return service.id;
  }
};

/**
 * Returns the primary display name for a service depending on category
 */
const getServiceName = (service, categoryId, platform) => {
  if (platform === "venso" && categoryId === "guias" && service.isVirtualTour) {
    return service.nombre || "Tour";
  }

  switch (categoryId) {
    case "trenes":
      return service.nombre_empresa || service.nombre || "Tren";
    case "transportes":
      return service.nombre_transporte || service.nombre || "Transporte";
    case "endoses":
      return (
        service.nombre_agencia ||
        service.tipo_tour ||
        service.nombre ||
        "Endose"
      );
    case "guias": {
      const full =
        `${service.nombres || service.persona?.nombres || ""} ${service.apellidos || service.persona?.apellidos || ""}`.trim();
      return full || service.nombre || "Guía";
    }
    default:
      return service.nombre || "Servicio";
  }
};

/**
 * Returns a short secondary label (city, zone, type) per category
 */
const getServiceSub = (service, categoryId, platform) => {
  if (platform === "venso" && categoryId === "guias" && service.isVirtualTour) {
    return "Ruta / Tour";
  }

  switch (categoryId) {
    case "hoteles":
      return service.ciudad || service.categoria || null;
    case "transportes":
      return service.zona || service.tipo_transporte || null;
    case "trenes":
      return service.ruta || null;
    case "vuelos":
      return service.procedencia || null;
    case "endoses":
      return service.zona || service.tipo_tour || null;
    case "guias":
      return service.codigo_guia || service.tour_nombre || null;
    default:
      return service.ciudad || service.tipo || null;
  }
};

/** Extract numeric rating from calificacion JSON */
const getValoracion = (service) => {
  const cal = service.calificacion;
  if (!cal || typeof cal !== "object") return 0;
  return parseFloat(cal.valoracion || 0) || 0;
};

/** Get unique values for a field across services */
const getUniqueValues = (services, field) => {
  const vals = new Set();
  services.forEach((s) => {
    const v = s[field];
    if (v && typeof v === "string") vals.add(v);
  });
  return [...vals].sort();
};

const INITIAL_LIMIT = 10;

/**
 * Panel that shows parent services as aesthetic checkboxes (multi-select),
 * following the test.html provider-filter pattern.
 *
 * Props:
 * services – array of parent service objects
 * category – active category config object
 * selectedParents – array of selected parent objects (NEW: multi-select)
 * onParentSelect – called with a service to toggle it in/out of selection
 * loading / error – standard flags
 */
const ParentServicePanel = ({
  category,
  services,
  allParentServices, // unfiltered list for generating dropdown options
  childServices = [],
  loading,
  error,
  onParentSelect,
  selectedParents = [],
  passengerCapacity = 0,
  onPassengerCapacityChange,
  onFilterChange, // callback: ({ zonas?, ciudades?, empresas? }) => void
  platform = "venso",
}) => {
  const [showAll, setShowAll] = useState(false);
  const [filterZona, setFilterZona] = useState("");
  const [filterCiudad, setFilterCiudad] = useState("");
  const [searchText, setSearchText] = useState("");

  const categoryId = category?.id;

  // Unique zona/ciudad values for filter dropdowns — always use full unfiltered list
  // so options never shrink after a filter is applied.
  const optionSource = allParentServices || services;
  const zonaOptions = useMemo(
    () =>
      categoryId === "transportes" || categoryId === "endoses"
        ? getUniqueValues(optionSource || [], "zona")
        : [],
    [optionSource, categoryId],
  );
  const ciudadOptions = useMemo(
    () =>
      categoryId === "hoteles"
        ? getUniqueValues(optionSource || [], "ciudad")
        : [],
    [optionSource, categoryId],
  );

  const tourQuickOptions = useMemo(
    () =>
      categoryId === "guias" || categoryId === "endoses"
        ? getUniqueValues(childServices || [], "tour_nombre")
        : [],
    [childServices, categoryId],
  );

  // Build a set of parent IDs whose children support the passenger capacity
  // Mostrar transportes que tengan al menos una movilidad con capacidad >= al
  // número ingresado, preferentemente la superior más cercana.
  const parentIdsMatchingCapacity = useMemo(() => {
    if (
      !passengerCapacity ||
      passengerCapacity <= 0 ||
      categoryId !== "transportes"
    )
      return null;
    const cap = parseInt(passengerCapacity);
    if (isNaN(cap) || cap <= 0) return null;
    const ids = new Set();
    (childServices || []).forEach((s) => {
      const sCap = parseInt(s.nro_pasajeros || s.movilidad?.nro_pasajeros);
      if (!isNaN(sCap) && sCap >= cap) {
        const parentId =
          s.transporte_id || s.id_transporte || s.movilidad?.id_transporte;
        if (parentId != null) {
          ids.add(parentId);
          ids.add(String(parentId));
          ids.add(Number(parentId));
        }
      }
    });
    return ids;
  }, [childServices, passengerCapacity, categoryId]);

  // Filter + sort
  const processedServices = useMemo(() => {
    let list = [...(services || [])];

    // Text search
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter((s) => {
        const name = getServiceName(s, categoryId) || "";
        const sub = getServiceSub(s, categoryId) || "";
        return name.toLowerCase().includes(q) || sub.toLowerCase().includes(q);
      });
    }

    // Zona/ciudad filtering is done by the parent (useUnifiedFilters) via onFilterChange;
    // `services` is already filtered by the hook when a zone is active.
    // We keep local filtering only as a fallback when onFilterChange is not provided.
    if (!onFilterChange) {
      if (
        filterZona &&
        (categoryId === "transportes" || categoryId === "endoses")
      ) {
        list = list.filter((s) => s.zona === filterZona);
      }
      if (filterCiudad && categoryId === "hoteles") {
        list = list.filter((s) => s.ciudad === filterCiudad);
      }
    }

    // Capacity filter (transportes) — keep only parents that have children matching the capacity
    if (parentIdsMatchingCapacity) {
      list = list.filter((s) => {
        const id = getServiceId(s, categoryId);
        return parentIdsMatchingCapacity.has(id);
      });
    }

    // Sort by valoracion descending
    list.sort((a, b) => getValoracion(b) - getValoracion(a));

    return list;
  }, [
    services,
    categoryId,
    searchText,
    filterZona,
    filterCiudad,
    parentIdsMatchingCapacity,
    onFilterChange,
  ]);

  const displayedServices = showAll
    ? processedServices
    : processedServices.slice(0, INITIAL_LIMIT);
  const hasMore = processedServices.length > INITIAL_LIMIT;

  const isSelected = (service) => {
    const id = String(getServiceId(service, categoryId, platform) ?? "");
    return selectedParents.some(
      (p) => String(getServiceId(p, categoryId, platform) ?? "") === id,
    );
  };

  const handleToggle = (service) => {
    onParentSelect(service);
  };

  const handleSelectAll = () => {
    if (selectedParents.length === services.length) {
      onParentSelect(null);
    } else {
      onParentSelect("__all__", services);
    }
  };

  // Reset filters when category changes
  React.useEffect(() => {
    setShowAll(false);
    setFilterZona("");
    setFilterCiudad("");
    setSearchText("");
    onFilterChange?.({ zonas: [], ciudades: [] });
  }, [categoryId]);

  if (loading) {
    return (
      <div className="parent-service-panel">
        <div className="panel-header">
          <h4>{category?.label || "Servicios"}</h4>
        </div>
        <LoadingIndicator
          message={`Cargando ${category?.label?.toLowerCase()}...`}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="parent-service-panel">
        <div className="panel-header">
          <h4>{category?.label || "Servicios"}</h4>
        </div>
        <MessageDisplay type="error" message={error} />
      </div>
    );
  }

  const allSelected =
    services?.length > 0 && selectedParents.length === services.length;
  const someSelected =
    selectedParents.length > 0 &&
    selectedParents.length < (services?.length || 0);

  const showFilters = zonaOptions.length > 0 || ciudadOptions.length > 0;

  return (
    <div className={`parent-service-panel premium-design ${platform}`}>
      <div className="panel-header">
        <div className="header-title">
          <FaFilter className="header-icon" />
          <h4>{category?.label || "Servicios"}</h4>
        </div>
        <span className="service-count">
          {processedServices.length} de {services?.length || 0}
        </span>
      </div>

      {/* Search */}
      <div className="panel-search-wrapper">
        <div className="search-box">
          <FaSearch className="search-icon" />
          <input
            type="text"
            placeholder={`Buscar ${category?.label?.toLowerCase() || "proveedor"}...`}
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setShowAll(false);
            }}
            className="panel-search-input"
          />
        </div>
      </div>

      {/* Capacity control - above services for transportes */}
      {categoryId === "transportes" && onPassengerCapacityChange && (
        <div className="capacity-filter-group">
          <div className="filter-group-label">Capacidad</div>
          <div className="capacity-control">
            <button
              className="capacity-btn"
              onClick={() =>
                onPassengerCapacityChange((p) => Math.max(0, p - 1))
              }
            >
              −
            </button>
            <input
              type="number"
              className="capacity-input"
              value={passengerCapacity || ""}
              min={0}
              placeholder="0"
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  onPassengerCapacityChange(0);
                  return;
                }
                const v = parseInt(raw);
                if (!isNaN(v) && v >= 0) onPassengerCapacityChange(v);
              }}
            />
            <button
              className="capacity-btn"
              onClick={() => onPassengerCapacityChange((p) => p + 1)}
            >
              +
            </button>
            <span className="capacity-label">pax</span>
          </div>
        </div>
      )}

      {services?.length > 0 && (
        <div className="select-all-row" onClick={handleSelectAll}>
          <span
            className={`toggle-dot${allSelected ? " active" : someSelected ? " partial" : ""}`}
          />
          <span className="toggle-text">
            {allSelected ? "Deseleccionar todo" : "Seleccionar todo"}
          </span>

          {tourQuickOptions.length > 0 && (
            <div
              className="tour-quick-filter"
              onClick={(e) => e.stopPropagation()}
            >
              <select
                className="quick-filter-select"
                onChange={(e) => {
                  const val = e.target.value;
                  onFilterChange?.({ tourNombres: val ? [val] : [] });
                }}
              >
                <option value="">Filtrar por Tour...</option>
                {tourQuickOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedParents.length > 0 && (
            <span className="selected-badge">{selectedParents.length}</span>
          )}
        </div>
      )}

      {displayedServices.length > 0 ? (
        <div className="services-list-wrapper">
          {displayedServices.map((service, index) => {
            const checked = isSelected(service);
            const name = getServiceName(service, categoryId, platform);
            const sub = getServiceSub(service, categoryId, platform);
            const rating = getValoracion(service);
            const isTour = service.isVirtualTour;

            return (
              <div
                key={getServiceId(service, categoryId, platform) || index}
                className={`service-row${checked ? " active" : ""}${isTour ? " tour-item" : ""}`}
                onClick={() => handleToggle(service)}
              >
                <div className="row-selection">
                  <span className={`row-indicator${checked ? " on" : ""}`}>
                    {checked ? "" : ""}
                  </span>
                </div>

                <div className="row-icon-box">
                  {isTour ? (
                    <FaRoute className="item-icon tour" />
                  ) : (
                    <FaUserTie className="item-icon guide" />
                  )}
                </div>

                <div className="row-content">
                  <span className="row-name">{name}</span>
                  {sub && !isTour && <span className="row-sub">{sub}</span>}
                  {isTour && (
                    <span className="tour-badge">
                      Tour{service.childCount ? ` · ${service.childCount}` : ""}
                    </span>
                  )}
                </div>

                {rating > 0 && !isTour && (
                  <div className="row-rating" title={`Valoración: ${rating}`}>
                    <FaStar className="star-icon" />
                    <span>{rating}</span>
                  </div>
                )}

                <FaChevronRight className="row-arrow" />
              </div>
            );
          })}
          {hasMore && !showAll && (
            <button className="show-more-btn" onClick={() => setShowAll(true)}>
              Ver más ({processedServices.length - INITIAL_LIMIT} restantes)
            </button>
          )}
          {showAll && hasMore && (
            <button className="show-more-btn" onClick={() => setShowAll(false)}>
              Ver menos
            </button>
          )}
        </div>
      ) : (
        <MessageDisplay
          type="info"
          message={`No se encontraron ${
            category?.label?.toLowerCase() || "servicios"
          }`}
        />
      )}

      {/* Checkbox-style filters below services */}
      {showFilters && (
        <div className="panel-filters-bottom">
          {zonaOptions.length > 0 && (
            <div className="filter-group">
              <div className="filter-group-label">Destino</div>
              {zonaOptions.map((z) => (
                <div
                  key={z}
                  className={`service-row${filterZona === z ? " active" : ""}`}
                  onClick={() => {
                    const newZona = filterZona === z ? "" : z;
                    setFilterZona(newZona);
                    setShowAll(false);
                    onFilterChange?.({ zonas: newZona ? [newZona] : [] });
                  }}
                >
                  <span
                    className={`row-indicator${filterZona === z ? " on" : ""}`}
                  >
                    {filterZona === z ? "" : ""}
                  </span>
                  <span className="row-content">
                    <span className="row-name">{z}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          {ciudadOptions.length > 0 && (
            <div className="filter-group">
              <div className="filter-group-label">Ciudad</div>
              {ciudadOptions.map((c) => (
                <div
                  key={c}
                  className={`service-row${filterCiudad === c ? " active" : ""}`}
                  onClick={() => {
                    const newCiudad = filterCiudad === c ? "" : c;
                    setFilterCiudad(newCiudad);
                    setShowAll(false);
                    onFilterChange?.({
                      ciudades: newCiudad ? [newCiudad] : [],
                    });
                  }}
                >
                  <span
                    className={`row-indicator${filterCiudad === c ? " on" : ""}`}
                  >
                    {filterCiudad === c ? "" : ""}
                  </span>
                  <span className="row-content">
                    <span className="row-name">{c}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ParentServicePanel;
