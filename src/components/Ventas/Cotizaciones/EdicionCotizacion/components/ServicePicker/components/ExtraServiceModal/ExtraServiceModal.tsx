import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  MdClose,
  MdSearch,
  MdAdd,
  MdArrowBack,
  MdCheckCircle,
} from "react-icons/md";
import { FaFloppyDisk, FaWandMagicSparkles, FaPlus } from "react-icons/fa6";
import { createAxiosInstance } from "../../../../../../../../utils/axiosInstance";
import { createApiInstance } from "../../../../../../../../utils/apiUtils";
import { getTotalPassengerCount } from "../../../../utils/unifiedServiceManager";
import "./ExtraServiceModal.scss";

const ExtraServiceModal = ({
  isOpen,
  onClose,
  onSave,
  packageType = "compartido",
  peopleDetails = {},
  platform = "venso",
  tariffType = null,
  tariffYear = new Date().getFullYear(),
  agencyId = 1,
  fallbackAgencyId = 1,
  tieneFeeFilter = true,
}) => {
  // Views: 'list' | 'create' | 'add-tariff'
  const [view, setView] = useState("list");
  const [search, setSearch] = useState("");
  const [servicios, setServicios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Unified create form (service + tariff in one step)
  const [createForm, setCreateForm] = useState({
    nombre: "",
    descripcion: "",
    precio: "",
    moneda: "dolares",
  });

  // For adding tariff to an existing service that lacks one for this platform
  const [tariffTarget, setTariffTarget] = useState(null);
  const [tariffForm, setTariffForm] = useState({
    precio: "",
    moneda: "dolares",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const searchRef = useRef(null);

  const totalPax = getTotalPassengerCount(peopleDetails);
  const cantPax = Math.max(1, totalPax);
  const tipoTarifa =
    tariffType || (platform === "venso" ? "externa" : "interna");
  const createAgencyId =
    Number(agencyId || 0) > 0
      ? Number(agencyId)
      : Number(fallbackAgencyId || 0);
  const selectedTariffYear = Number(tariffYear) || new Date().getFullYear();

  // Fetch servicios extra con tarifas
  const fetchServicios = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const axios = createAxiosInstance();
      const res = await axios.get(`/turismo/servicio-extra/con-tarifas`, {
        params: {
          tipo_tarifa: tipoTarifa,
          anio: selectedTariffYear,
        },
      });
      if (res.data?.success) {
        let fetchedServices = res.data.data || [];
        fetchedServices = fetchedServices.map((item) => ({
          ...item,
          tarifas: Array.isArray(item?.tarifas)
            ? item.tarifas.filter(
                (tarifa) =>
                  String(tarifa?.tipo_tarifa || "").toLowerCase() ===
                    String(tipoTarifa || "").toLowerCase() &&
                  Number(tarifa?.anio || selectedTariffYear) === selectedTariffYear,
              )
            : [],
        }));
        fetchedServices = fetchedServices.filter((item) => {
          const svc = item.servicio_extra || item;
          return svc.mostrar_en_servicepicker !== false;
        });
        if (tieneFeeFilter !== null && tieneFeeFilter !== undefined) {
          fetchedServices = fetchedServices.filter((item) => {
            const svc = item.servicio_extra || item;
            return svc.tiene_fee === tieneFeeFilter;
          });
        }
        setServicios(fetchedServices);
      } else {
        setServicios([]);
      }
    } catch (err) {
      console.error("[ExtraServiceModal] Error fetching servicios extra:", err);
      setError("No se pudieron cargar los servicios extra");
      setServicios([]);
    } finally {
      setLoading(false);
    }
  }, [selectedTariffYear, tipoTarifa, tieneFeeFilter]);

  useEffect(() => {
    if (isOpen) {
      fetchServicios();
    }
  }, [isOpen, fetchServicios]);

  useEffect(() => {
    if (isOpen && view === "list" && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen, view]);

  // Filter by search only — show ALL services regardless of tariff type
  const filtered = servicios.filter((item) => {
    const s = item.servicio_extra || item;
    const q = search.toLowerCase();
    return (
      (s.nombre || "").toLowerCase().includes(q) ||
      (s.descripcion || "").toLowerCase().includes(q)
    );
  });

  const handleClose = () => {
    setView("list");
    setSearch("");
    setCreateForm({
      nombre: "",
      descripcion: "",
      precio: "",
      moneda: "dolares",
    });
    setTariffTarget(null);
    setTariffForm({ precio: "", moneda: "dolares" });
    setFormErrors({});
    setIsSaving(false);
    onClose();
  };

  // Select an existing service+tariff → add to itinerary
  const handleSelectExisting = (svcItem, tariff) => {
    const svc = svcItem.servicio_extra || svcItem;
    const precio = parseFloat(
      tariff?.precio_compartido || tariff?.precio_privado || 0,
    );

    onSave({
      id: `extra-${svc.id}-${Date.now()}`,
      categoria: "extras",
      typeService: "extras",
      parentService: {
        typeService: "extras",
        nombre: svc.nombre,
        descripcion: svc.descripcion || "",
        id_servicio_extra: svc.id,
        capacidad: cantPax,
      },
      childService: {
        nombre: svc.nombre,
        descripcion: svc.descripcion || "",
        id_servicio_extra: svc.id,
        packageType,
      },
      tariff: {
        id_tarifa: tariff?.id_tarifa,
        precio,
        precio_original: precio * cantPax,
        tipo_tarifa: tariff?.tipo_tarifa || tipoTarifa,
        tieneIgv: false,
        moneda: tariff?.moneda || "dolares",
        pasajeros_beneficiados: cantPax,
      },
      pasajerosBeneficiados: cantPax,
      capacidad: cantPax,
      cantidadPasajeros: cantPax,
    });
    handleClose();
  };

  // Open the "add tariff" mini-view for an existing service
  const handleOpenAddTariff = (svcItem) => {
    const svc = svcItem.servicio_extra || svcItem;
    setTariffTarget(svc);
    setTariffForm({ precio: "", moneda: "dolares" });
    setFormErrors({});
    setView("add-tariff");
  };

  // Create tariff ONLY for an existing service, then add to itinerary
  const handleAddTariffAndSave = async () => {
    const errs = {};
    const precio = parseFloat(tariffForm.precio);
    if (!precio || precio <= 0) errs.precio = "Precio debe ser mayor a 0";
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      return;
    }

    setIsSaving(true);
    try {
      const api = createApiInstance();

      if (!createAgencyId) {
        throw new Error("Selecciona una agencia para crear la tarifa.");
      }
      const tariffRes = await api.post("/turismo/tarifas", {
        agency_ids: [createAgencyId],
        id_servicio: tariffTarget.id,
        tipo_servicio: "servicio_extra",
        tipo_tarifa: tipoTarifa,
        anio: selectedTariffYear,
        tiene_temporada: false,
        temporada: null,
        precio_compartido: precio,
        precio_privado: precio,
        precio_unico: true,
        moneda: tariffForm.moneda || "dolares",
        tasa_cambio: 1.0,
      });

      let tariffId = tariffRes.data?.data?.id_tarifa;
      if (!tariffId) {
        const idMatch = tariffRes.data?.message?.match(/ID:\s*(\d+)/);
        tariffId = idMatch ? parseInt(idMatch[1], 10) : null;
      }

      onSave({
        id: `extra-${tariffTarget.id}-${Date.now()}`,
        categoria: "extras",
        typeService: "extras",
        parentService: {
          typeService: "extras",
          nombre: tariffTarget.nombre,
          descripcion: tariffTarget.descripcion || "",
          id_servicio_extra: tariffTarget.id,
          capacidad: cantPax,
        },
        childService: {
          nombre: tariffTarget.nombre,
          descripcion: tariffTarget.descripcion || "",
          id_servicio_extra: tariffTarget.id,
          packageType,
        },
        tariff: {
          id_tarifa: tariffId,
          precio,
          precio_original: precio * cantPax,
          tipo_tarifa: tipoTarifa,
          tieneIgv: false,
          moneda: tariffForm.moneda || "dolares",
          pasajeros_beneficiados: cantPax,
        },
        pasajerosBeneficiados: cantPax,
        capacidad: cantPax,
        cantidadPasajeros: cantPax,
      });
      handleClose();
    } catch (err) {
      console.error("[ExtraServiceModal] Error creating tariff:", err);
      setFormErrors({
        api:
          err.response?.data?.message || err.message || "Error al crear tarifa",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Create service + tariff in one flow, then add to itinerary
  const handleCreateAndAdd = async () => {
    const errs = {};
    if (!createForm.nombre.trim()) errs.nombre = "Nombre obligatorio";
    const precio = parseFloat(createForm.precio);
    if (!precio || precio <= 0) errs.precio = "Precio debe ser mayor a 0";
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      return;
    }

    // Check if a service with this name already exists
    const nameNorm = createForm.nombre.trim().toLowerCase();
    const existing = servicios.find((item) => {
      const s = item.servicio_extra || item;
      return (s.nombre || "").toLowerCase() === nameNorm;
    });

    if (existing) {
      const svc = existing.servicio_extra || existing;
      const hasTariff = (existing.tarifas || []).some(
        (t) =>
          t.tipo_tarifa === tipoTarifa &&
          Number(t.anio || selectedTariffYear) === selectedTariffYear,
      );
      if (hasTariff) {
        // Already has tariff for this platform — just select it
        const tariff = (existing.tarifas || []).find(
          (t) =>
            t.tipo_tarifa === tipoTarifa &&
            Number(t.anio || selectedTariffYear) === selectedTariffYear,
        );
        handleSelectExisting(existing, tariff);
        return;
      }
      // Service exists but no tariff for this platform — create tariff only
      setTariffTarget(svc);
      setTariffForm({ precio: createForm.precio, moneda: createForm.moneda });
      setFormErrors({});
      setView("add-tariff");
      return;
    }

    setIsSaving(true);
    try {
      const api = createApiInstance();

      // Step 1: Create the service
      const svcRes = await api.post("/turismo/servicio-extra", {
        nombre: createForm.nombre.trim(),
        descripcion: createForm.descripcion.trim() || null,
        estado: "disponible",
        tiene_fee: tieneFeeFilter !== null ? tieneFeeFilter : true,
        mostrar_en_servicepicker: true,
      });

      let svcId = svcRes.data?.data?.id;
      if (!svcId) {
        const idMatch = svcRes.data?.message?.match(/ID:\s*(\d+)/);
        svcId = idMatch ? parseInt(idMatch[1], 10) : null;
      }
      if (!svcId)
        throw new Error("No se pudo obtener el ID del servicio creado");

      // Step 2: Create the tariff
      if (!createAgencyId) {
        throw new Error("Selecciona una agencia para crear la tarifa.");
      }
      const tariffRes = await api.post("/turismo/tarifas", {
        agency_ids: [createAgencyId],
        id_servicio: svcId,
        tipo_servicio: "servicio_extra",
        tipo_tarifa: tipoTarifa,
        anio: selectedTariffYear,
        tiene_temporada: false,
        temporada: null,
        precio_compartido: precio,
        precio_privado: precio,
        precio_unico: true,
        moneda: createForm.moneda || "dolares",
        tasa_cambio: 1.0,
      });

      let tariffId = tariffRes.data?.data?.id_tarifa;
      if (!tariffId) {
        const idMatch = tariffRes.data?.message?.match(/ID:\s*(\d+)/);
        tariffId = idMatch ? parseInt(idMatch[1], 10) : null;
      }

      // Step 3: Add to itinerary
      onSave({
        id: `extra-${svcId}-${Date.now()}`,
        categoria: "extras",
        typeService: "extras",
        parentService: {
          typeService: "extras",
          nombre: createForm.nombre.trim(),
          descripcion: createForm.descripcion.trim() || "",
          id_servicio_extra: svcId,
          capacidad: cantPax,
        },
        childService: {
          nombre: createForm.nombre.trim(),
          descripcion: createForm.descripcion.trim() || "",
          id_servicio_extra: svcId,
          packageType,
        },
        tariff: {
          id_tarifa: tariffId,
          precio,
          precio_original: precio * cantPax,
          tipo_tarifa: tipoTarifa,
          tieneIgv: false,
          moneda: createForm.moneda || "dolares",
          pasajeros_beneficiados: cantPax,
        },
        pasajerosBeneficiados: cantPax,
        capacidad: cantPax,
        cantidadPasajeros: cantPax,
      });
      handleClose();
    } catch (err) {
      console.error("[ExtraServiceModal] Error creating service+tariff:", err);
      setFormErrors({
        api: err.response?.data?.message || err.message || "Error al crear",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const preventWheel = (e) => e.target.blur();
  const preventArrow = (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
  };

  if (!isOpen) return null;

  return (
    <div
      className="esm-overlay"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="esm-panel" onClick={(e) => e.stopPropagation()}>
        {/* ── HEADER ── */}
        <div className="esm-header">
          {(view === "create" || view === "add-tariff") && (
            <button
              className="esm-back"
              onClick={() => {
                setView("list");
                setFormErrors({});
                setTariffTarget(null);
              }}
            >
              <MdArrowBack />
            </button>
          )}
          <div className="esm-header__icon">
            <FaWandMagicSparkles />
          </div>
          <div className="esm-header__text">
            <h3>
              {view === "list"
                ? "Servicios Extra"
                : view === "add-tariff"
                  ? "Agregar Tarifa"
                  : "Nuevo Servicio Extra"}
            </h3>
            <p>
              {view === "list"
                ? `${cantPax} pasajero${cantPax > 1 ? "s" : ""} — Selecciona o crea un servicio`
                : view === "add-tariff"
                  ? `Asignar precio para "${tariffTarget?.nombre || ""}"`
                  : "Registra servicio, tarifa y agrega al itinerario"}
            </p>
          </div>
          <button className="esm-close" onClick={handleClose}>
            <MdClose />
          </button>
        </div>

        {/* ── LIST VIEW ── */}
        {view === "list" && (
          <>
            <div className="esm-toolbar">
              <div className="esm-search">
                <MdSearch className="esm-search__icon" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar servicio extra..."
                />
              </div>
              <button
                className="esm-btn-create"
                onClick={() => {
                  setCreateForm({
                    nombre: search,
                    descripcion: "",
                    precio: "",
                    moneda: "dolares",
                  });
                  setView("create");
                  setFormErrors({});
                }}
              >
                <MdAdd /> Nuevo
              </button>
            </div>

            <div className="esm-list">
              {loading && <div className="esm-list__msg">Cargando...</div>}
              {error && (
                <div className="esm-list__msg esm-list__msg--err">{error}</div>
              )}
              {!loading && !error && filtered.length === 0 && (
                <div className="esm-list__msg">
                  {search ? "Sin resultados" : "No hay servicios extra"}
                  <button
                    className="esm-inline-create"
                    onClick={() => {
                      setCreateForm({
                        nombre: search,
                        descripcion: "",
                        precio: "",
                        moneda: "dolares",
                      });
                      setView("create");
                    }}
                  >
                    <FaPlus /> Crear "{search || "nuevo"}"
                  </button>
                </div>
              )}
              {filtered.map((item) => {
                const svc = item.servicio_extra || item;
                const matchingTarifas = (item.tarifas || []).filter(
                  (t) =>
                    t.tipo_tarifa === tipoTarifa &&
                    Number(t.anio || selectedTariffYear) === selectedTariffYear,
                );
                const hasTariff = matchingTarifas.length > 0;

                return (
                  <div
                    key={svc.id}
                    className="esm-card"
                    onClick={() => {
                      if (hasTariff) {
                        // If there is at least one matching tariff, pick the first one
                        handleSelectExisting(item, matchingTarifas[0]);
                      } else {
                        // Otherwise open add tariff view
                        handleOpenAddTariff(item);
                      }
                    }}
                  >
                    <div className="esm-card__head">
                      <div className="esm-card__info">
                        <span className="esm-card__name">{svc.nombre}</span>
                        {svc.descripcion && (
                          <span className="esm-card__desc">
                            {svc.descripcion}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="esm-card__tarifas">
                      {hasTariff ? (
                        matchingTarifas.map((t) => (
                          <button
                            key={t.id_tarifa}
                            className="esm-tariff-btn"
                            onClick={(e) => {
                              e.stopPropagation(); // Avoid triggering card click
                              handleSelectExisting(item, t);
                            }}
                            title="Clic para agregar al itinerario"
                          >
                            <span className="esm-tariff-btn__price">
                              ${parseFloat(t.precio_compartido || 0).toFixed(2)}
                            </span>
                            {t.moneda && (
                              <span className="esm-tariff-btn__cur">
                                {t.moneda}
                              </span>
                            )}
                            <MdCheckCircle className="esm-tariff-btn__icon" />
                          </button>
                        ))
                      ) : (
                        <button
                          className="esm-add-tariff-btn"
                          onClick={(e) => {
                            e.stopPropagation(); // Avoid triggering card click
                            handleOpenAddTariff(item);
                          }}
                          title="Este servicio no tiene tarifa para tu plataforma — clic para asignar precio"
                        >
                          <MdAdd className="esm-add-tariff-btn__icon" />
                          <span>Agregar tarifa</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── ADD TARIFF VIEW (existing service, new tariff only) ── */}
        {view === "add-tariff" && tariffTarget && (
          <div className="esm-create">
            <div className="esm-add-tariff-info">
              <span className="esm-add-tariff-info__name">
                {tariffTarget.nombre}
              </span>
              {tariffTarget.descripcion && (
                <span className="esm-add-tariff-info__desc">
                  {tariffTarget.descripcion}
                </span>
              )}
            </div>

            <div className="esm-create__row">
              <div className="esm-create__field esm-create__field--price">
                <label>Precio *</label>
                <div className="esm-create__price-input">
                  <span className="esm-create__currency-symbol">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={tariffForm.precio}
                    onChange={(e) => {
                      setTariffForm((p) => ({ ...p, precio: e.target.value }));
                      setFormErrors({});
                    }}
                    placeholder="0.00"
                    onWheel={preventWheel}
                    onKeyDown={preventArrow}
                    className={formErrors.precio ? "esm-input--err" : ""}
                    autoFocus
                  />
                </div>
                {formErrors.precio && (
                  <span className="esm-err">{formErrors.precio}</span>
                )}
              </div>
              <div className="esm-create__field esm-create__field--moneda">
                <label>Moneda</label>
                <select
                  value={tariffForm.moneda}
                  onChange={(e) =>
                    setTariffForm((p) => ({ ...p, moneda: e.target.value }))
                  }
                >
                  <option value="dolares">USD</option>
                  <option value="soles">PEN</option>
                </select>
              </div>
            </div>

            {tariffForm.precio && cantPax > 0 && (
              <div className="esm-create__summary">
                ${parseFloat(tariffForm.precio || 0).toFixed(2)} x {cantPax} pax
                ={" "}
                <strong>
                  ${(parseFloat(tariffForm.precio || 0) * cantPax).toFixed(2)}
                </strong>
              </div>
            )}

            {formErrors.api && (
              <div className="esm-err esm-err--api">{formErrors.api}</div>
            )}

            <div className="esm-create__actions">
              <button
                className="esm-btn-cancel"
                onClick={() => {
                  setView("list");
                  setTariffTarget(null);
                }}
              >
                Cancelar
              </button>
              <button
                className="esm-btn-save"
                onClick={handleAddTariffAndSave}
                disabled={isSaving}
              >
                <FaFloppyDisk /> {isSaving ? "Guardando..." : "Agregar"}
              </button>
            </div>
          </div>
        )}

        {/* ── CREATE VIEW (service + tariff combined) ── */}
        {view === "create" && (
          <div className="esm-create">
            <div className="esm-create__field">
              <label>Nombre del servicio *</label>
              <input
                type="text"
                value={createForm.nombre}
                onChange={(e) => {
                  setCreateForm((p) => ({ ...p, nombre: e.target.value }));
                  setFormErrors({});
                }}
                placeholder="Ej: Masaje relajante, City tour nocturno..."
                className={formErrors.nombre ? "esm-input--err" : ""}
                autoFocus
              />
              {formErrors.nombre && (
                <span className="esm-err">{formErrors.nombre}</span>
              )}
            </div>

            <div className="esm-create__field">
              <label>Descripcion (opcional)</label>
              <textarea
                value={createForm.descripcion}
                onChange={(e) =>
                  setCreateForm((p) => ({ ...p, descripcion: e.target.value }))
                }
                placeholder="Detalles adicionales..."
                rows="2"
              />
            </div>

            <div className="esm-create__row">
              <div className="esm-create__field esm-create__field--price">
                <label>Precio *</label>
                <div className="esm-create__price-input">
                  <span className="esm-create__currency-symbol">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={createForm.precio}
                    onChange={(e) => {
                      setCreateForm((p) => ({ ...p, precio: e.target.value }));
                      setFormErrors({});
                    }}
                    placeholder="0.00"
                    onWheel={preventWheel}
                    onKeyDown={preventArrow}
                    className={formErrors.precio ? "esm-input--err" : ""}
                  />
                </div>
                {formErrors.precio && (
                  <span className="esm-err">{formErrors.precio}</span>
                )}
              </div>
              <div className="esm-create__field esm-create__field--moneda">
                <label>Moneda</label>
                <select
                  value={createForm.moneda}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, moneda: e.target.value }))
                  }
                >
                  <option value="dolares">USD</option>
                  <option value="soles">PEN</option>
                </select>
              </div>
            </div>

            {/* Price summary */}
            {createForm.precio && cantPax > 0 && (
              <div className="esm-create__summary">
                ${parseFloat(createForm.precio || 0).toFixed(2)} x {cantPax} pax
                ={" "}
                <strong>
                  ${(parseFloat(createForm.precio || 0) * cantPax).toFixed(2)}
                </strong>
              </div>
            )}

            {formErrors.api && (
              <div className="esm-err esm-err--api">{formErrors.api}</div>
            )}

            <div className="esm-create__actions">
              <button
                className="esm-btn-cancel"
                onClick={() => setView("list")}
              >
                Cancelar
              </button>
              <button
                className="esm-btn-save"
                onClick={handleCreateAndAdd}
                disabled={isSaving}
              >
                <FaFloppyDisk /> {isSaving ? "Guardando..." : "Crear y Agregar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExtraServiceModal;
