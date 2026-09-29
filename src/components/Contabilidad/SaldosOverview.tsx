import React, { useState, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import {
  FaEdit,
  FaPlus,
  FaSave,
  FaSync,
  FaMoneyBillWave,
  FaCreditCard,
  FaWallet,
  FaGlobe,
  FaUniversity,
  FaCheckCircle,
  FaExclamationTriangle,
} from "react-icons/fa";
import contabilidadService from "../../services/contabilidadService";
import { useAuth } from "../../context/AuthContext";
import TransferenciasInternas from "./TransferenciasInternas";
import "./SaldosOverview.scss";

const toNumber = (value) => Number.parseFloat(value || 0) || 0;

const normalizeTipo = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

const normalizePlatform = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (["mil", "b2b"].includes(normalized)) return "mil";
  return "venso";
};

const normalizeBusinessType = (value, platform) => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (["B2C", "B2B"].includes(normalized)) return normalized;
  return normalizePlatform(platform) === "mil" ? "B2B" : "B2C";
};

const titleize = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const currencyLabel = (moneda) => (moneda === "soles" ? "Soles" : "Dólares");

const currencySymbol = (mode) => {
  if (mode === "dolares") return "$";
  if (mode === "both") return "S/ · $";
  return "S/";
};

const SALDO_TYPE_OPTIONS = [
  { value: "efectivo", label: "Efectivo", monedas: ["soles", "dolares"] },
  {
    value: "cuenta_debito",
    label: "Cuenta débito",
    monedas: ["soles", "dolares"],
  },
  { value: "cuenta_credito", label: "Cuenta crédito", monedas: ["dolares"] },
  { value: "global66", label: "Global66", monedas: ["soles", "dolares"] },
  { value: "paypal", label: "PayPal", monedas: ["dolares"] },
  { value: "western_union", label: "Western Union", monedas: ["dolares"] },
  { value: "wetravel", label: "WeTravel", monedas: ["soles", "dolares"] },
];

const getAllowedCurrenciesForTipo = (tipo) => {
  const option = SALDO_TYPE_OPTIONS.find((item) => item.value === tipo);
  return option?.monedas || ["soles", "dolares"];
};

const PLATFORM_BUSINESS = {
  venso: { business: "B2C", label: "Venso", description: "Ventas B2C" },
  mil: { business: "B2B", label: "MIL", description: "Operación B2B" },
};

const platformToBusinessType = (platform) =>
  PLATFORM_BUSINESS[normalizePlatform(platform)]?.business || "B2C";

const getPlatformBusinessLabel = (platform) => {
  const meta = PLATFORM_BUSINESS[normalizePlatform(platform)] || PLATFORM_BUSINESS.venso;
  return `${meta.label} · ${meta.business}`;
};

const createDefaultSaldoForm = (year, platform) => ({
  year_saldo: Number(year) || new Date().getFullYear(),
  platform: platform || "venso",
  business_type: platformToBusinessType(platform || "venso"),
  tipo: "efectivo",
  custom_tipo: "",
  currencyMode: "both",
  saldo_inicial: "0",
});

const SaldosOverview = ({
  refreshTrigger,
  onSaldosLoaded,
  refreshData: parentRefreshData,
}) => {
  const { auth } = useAuth();
  const isSuperAdmin = auth?.role === 0;

  const [saldos, setSaldos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSaldo, setEditingSaldo] = useState(null);
  const [newSaldoInicial, setNewSaldoInicial] = useState("");
  const [validated, setValidated] = useState(false);
  const [createValidated, setCreateValidated] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [saldoForm, setSaldoForm] = useState(() =>
    createDefaultSaldoForm(new Date().getFullYear(), "venso"),
  );

  // Estados para filtros por año y plataforma
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedPlatform, setSelectedPlatform] = useState("venso"); // 'venso' (b2c) o 'mil' (b2b)

  // Configuración de tipos de cuenta con iconos y colores
  const tipoConfig = useMemo(
    () => ({
      efectivo: {
        label: "Efectivo",
        icon: FaMoneyBillWave,
        gradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
        bgLight: "#ecfdf5",
        supportsBothCurrencies: true,
      },
      cuenta_debito: {
        label: "Cuenta Débito",
        icon: FaCreditCard,
        gradient: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
        bgLight: "#eff6ff",
        supportsBothCurrencies: true,
      },
      cuenta_credito: {
        label: "Cuenta Crédito",
        icon: FaWallet,
        gradient: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
        bgLight: "#f5f3ff",
        supportsBothCurrencies: false,
        onlyCurrency: "dolares",
        isCredit: true,
      },
      global66: {
        label: "Global66",
        icon: FaGlobe,
        gradient: "linear-gradient(135deg, #00d4aa 0%, #00b894 100%)",
        bgLight: "#ecfdf5",
        supportsBothCurrencies: true,
      },
      paypal: {
        label: "PayPal",
        icon: FaGlobe,
        gradient: "linear-gradient(135deg, #0070ba 0%, #003087 100%)",
        bgLight: "#f0f9ff",
        supportsBothCurrencies: false,
        onlyCurrency: "dolares",
      },
      western_union: {
        label: "Western Union",
        icon: FaUniversity,
        gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
        bgLight: "#fffbeb",
        supportsBothCurrencies: false,
        onlyCurrency: "dolares",
      },
      wetravel: {
        label: "WeTravel",
        icon: FaGlobe,
        gradient: "linear-gradient(135deg, #ff6b35 0%, #e55039 100%)",
        bgLight: "#fff5f0",
        supportsBothCurrencies: true,
      },
    }),
    [],
  );

  // Obtener años disponibles de los saldos
  const availableYears = useMemo(() => {
    const years = [...new Set(saldos.map((s) => s.year_saldo))]
      .filter(Boolean)
      .sort((a, b) => b - a);
    // Si no hay años, usar el actual
    return years.length > 0 ? years : [new Date().getFullYear()];
  }, [saldos]);

  // Obtener plataformas disponibles de los saldos
  const availablePlatforms = useMemo(() => {
    const platforms = [...new Set(saldos.map((s) => s.platform))].filter(
      Boolean,
    );
    return platforms.length > 0 ? platforms : ["venso", "mil"];
  }, [saldos]);

  // Sincronizar año seleccionado con años disponibles cuando cambien los saldos
  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      // Si el año seleccionado no está disponible, usar el más reciente
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  // Sincronizar plataforma seleccionada con plataformas disponibles
  useEffect(() => {
    if (
      availablePlatforms.length > 0 &&
      !availablePlatforms.includes(selectedPlatform)
    ) {
      // Si la plataforma seleccionada no está disponible, usar la primera
      setSelectedPlatform(availablePlatforms[0]);
    }
  }, [availablePlatforms, selectedPlatform]);

  // Filtrar saldos por año y plataforma seleccionados
  const filteredSaldos = useMemo(() => {
    const filtered = saldos.filter(
      (s) => s.year_saldo === selectedYear && s.platform === selectedPlatform,
    );
    console.log(" Filtrado de saldos:", {
      total: saldos.length,
      filtered: filtered.length,
      selectedYear,
      selectedPlatform,
      availableYears,
      availablePlatforms,
      saldosData: saldos.slice(0, 3).map((s) => ({
        tipo: s.tipo,
        year: s.year_saldo,
        platform: s.platform,
      })),
    });
    return filtered;
  }, [
    saldos,
    selectedYear,
    selectedPlatform,
    availableYears,
    availablePlatforms,
  ]);

  // Agrupar saldos filtrados por tipo de cuenta
  const saldosAgrupados = useMemo(() => {
    const grupos = {};

    filteredSaldos.forEach((saldo) => {
      if (!grupos[saldo.tipo]) {
        grupos[saldo.tipo] = {
          tipo: saldo.tipo,
          config: tipoConfig[saldo.tipo] || {
            label: titleize(saldo.tipo),
            icon: FaWallet,
            gradient: "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)",
            bgLight: "#f9fafb",
            supportsBothCurrencies: true,
          },
          soles: null,
          dolares: null,
        };
      }

      if (saldo.moneda === "soles") {
        grupos[saldo.tipo].soles = saldo;
      } else {
        grupos[saldo.tipo].dolares = saldo;
      }
    });

    // Ordenar por tipo
    const orden = [
      "efectivo",
      "cuenta_debito",
      "cuenta_credito",
      "global66",
      "paypal",
      "western_union",
      "wetravel",
    ];
    return Object.values(grupos).sort((a, b) => {
      const indexA = orden.indexOf(a.tipo);
      const indexB = orden.indexOf(b.tipo);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });
  }, [filteredSaldos, tipoConfig]);

  // Cargar saldos
  const loadSaldos = async () => {
    setLoading(true);
    try {
      const response = await contabilidadService.getSaldos();
      console.log(" Respuesta getSaldos:", response);
      if (response.success) {
        const data = response.data || [];
        console.log(
          " Saldos cargados:",
          data.length,
          "registros",
          data.slice(0, 3),
        );
        setSaldos(data);
        if (onSaldosLoaded) onSaldosLoaded(data);
      } else {
        toast.error("Error al cargar los saldos");
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSaldos();
  }, [refreshTrigger]);

  // Inicializar saldos (SOLO SUPERADMIN)
  const initializeSaldos = async () => {
    if (!isSuperAdmin) {
      toast.error("Solo el superadmin puede inicializar saldos");
      return;
    }

    try {
      const response = await contabilidadService.initializeSaldos({
        platform: selectedPlatform,
        year_saldo: selectedYear,
      });
      if (response.success) {
        toast.success(
          response.message ||
            `Saldos predeterminados verificados para ${selectedPlatform.toUpperCase()} · ${selectedYear}`,
        );
        await loadSaldos();
      } else {
        toast.error(response.message || "Error al inicializar saldos");
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`);
    }
  };

  // Abrir modal para editar saldo (SOLO SUPERADMIN)
  const openEditModal = (saldo) => {
    if (!isSuperAdmin) {
      toast.error("Solo el superadmin puede editar saldos iniciales");
      return;
    }
    setEditingSaldo(saldo);
    setNewSaldoInicial(saldo.saldo_inicial);
    setShowEditModal(true);
  };

  const closeModal = () => {
    setShowEditModal(false);
    setEditingSaldo(null);
    setValidated(false);
  };

  const openCreateModal = () => {
    if (!isSuperAdmin) {
      toast.error("Solo el superadmin puede crear saldos");
      return;
    }

    setSaldoForm(createDefaultSaldoForm(selectedYear, selectedPlatform));
    setCreateValidated(false);
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateValidated(false);
    setCreateLoading(false);
  };

  const selectedCreateTipo =
    saldoForm.tipo === "custom"
      ? normalizeTipo(saldoForm.custom_tipo)
      : saldoForm.tipo;

  const createAllowedCurrencies =
    getAllowedCurrenciesForTipo(selectedCreateTipo);

  const createSelectedCurrencies =
    saldoForm.currencyMode === "both"
      ? createAllowedCurrencies
      : createAllowedCurrencies.includes(saldoForm.currencyMode)
        ? [saldoForm.currencyMode]
        : createAllowedCurrencies.slice(0, 1);

  const createSaldoDuplicateInfo = useMemo(() => {
    const tipo = selectedCreateTipo;
    const platform = normalizePlatform(saldoForm.platform);
    const businessType = platformToBusinessType(platform);
    const year = Number(saldoForm.year_saldo);

    return createSelectedCurrencies.map((moneda) => {
      const existing = saldos.find((saldo) => {
        const saldoTipo = normalizeTipo(saldo.tipo);
        const saldoPlatform = normalizePlatform(saldo.platform);
        const saldoBusinessType = normalizeBusinessType(
          saldo.business_type,
          saldo.platform,
        );
        return (
          saldoTipo === tipo &&
          String(saldo.moneda || "").toLowerCase() === moneda &&
          saldoPlatform === platform &&
          saldoBusinessType === businessType &&
          Number(saldo.year_saldo) === year
        );
      });

      return {
        moneda,
        exists: Boolean(existing),
        existing,
      };
    });
  }, [
    createSelectedCurrencies,
    saldoForm.business_type,
    saldoForm.platform,
    saldoForm.year_saldo,
    saldos,
    selectedCreateTipo,
  ]);

  const currenciesToCreate = createSaldoDuplicateInfo
    .filter((item) => !item.exists)
    .map((item) => item.moneda);

  const allSelectedCurrenciesAlreadyExist =
    createSaldoDuplicateInfo.length > 0 && currenciesToCreate.length === 0;

  const createFormHasValidTarget =
    Boolean(selectedCreateTipo && selectedCreateTipo.length >= 2) &&
    createSelectedCurrencies.length > 0 &&
    currenciesToCreate.length > 0;

  const handleSaldoFormChange = (event) => {
    const { name, value } = event.target;

    setSaldoForm((prev) => {
      const next = { ...prev, [name]: value };

      if (name === "platform") {
        next.business_type = platformToBusinessType(value);
      }

      if (name === "tipo") {
        const allowed = getAllowedCurrenciesForTipo(
          value === "custom" ? prev.custom_tipo : value,
        );
        next.currencyMode = allowed.length === 1 ? allowed[0] : "both";
      }

      if (name === "custom_tipo") {
        next.custom_tipo = value;
      }

      return next;
    });
  };

  const handleCreateSaldo = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;

    if (form.checkValidity() === false) {
      event.stopPropagation();
      setCreateValidated(true);
      return;
    }

    const tipo = selectedCreateTipo;
    if (!tipo || tipo.length < 2) {
      setCreateValidated(true);
      toast.error("Indica un nombre válido para el saldo/caja");
      return;
    }

    if (createSelectedCurrencies.length === 0) {
      toast.error("Selecciona al menos una moneda válida");
      return;
    }

    if (allSelectedCurrenciesAlreadyExist) {
      setCreateValidated(true);
      toast.warning(
        "No se creó ningún saldo porque todas las monedas seleccionadas ya existen para ese año, plataforma, negocio y caja.",
      );
      return;
    }

    setCreateLoading(true);
    try {
      const created = [];
      const duplicated = createSaldoDuplicateInfo
        .filter((item) => item.exists)
        .map((item) => item.moneda);
      const initialAmount = String(toNumber(saldoForm.saldo_inicial));

      for (const moneda of currenciesToCreate) {
        const response = await contabilidadService.createSaldo({
          tipo,
          moneda,
          saldo_inicial: initialAmount,
          saldo_actual: initialAmount,
          platform: normalizePlatform(saldoForm.platform),
          business_type: platformToBusinessType(saldoForm.platform),
          year_saldo: Number(saldoForm.year_saldo),
        });

        if (response.success) created.push(moneda);
        else
          throw new Error(
            response.message || `No se pudo crear el saldo en ${moneda}`,
          );
      }

      if (created.length > 0) {
        toast.success(
          `Saldo creado para: ${created.map(currencyLabel).join(", ")}`,
        );
      }
      if (duplicated.length > 0) {
        toast.info(
          `Se omitió porque ya existía: ${duplicated.map(currencyLabel).join(", ")}`,
        );
      }

      closeCreateModal();
      await loadSaldos();
      if (parentRefreshData) parentRefreshData();
    } catch (error) {
      console.error("Error creando saldos:", error);
      toast.error(error.message || "No se pudieron crear los saldos");
    } finally {
      setCreateLoading(false);
    }
  };

  // Guardar cambios de saldo inicial
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;

    if (form.checkValidity() === false) {
      e.stopPropagation();
      setValidated(true);
      return;
    }

    try {
      const response = await contabilidadService.updateSaldoInicial(
        editingSaldo.id,
        parseFloat(newSaldoInicial),
      );

      if (response.success) {
        toast.success("Saldo inicial actualizado correctamente");
        closeModal();
        await loadSaldos();
      } else {
        toast.error(response.message || "Error al actualizar saldo inicial");
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`);
    }
  };

  // Formatear monto
  const formatMonto = (valor, moneda) => {
    const num = parseFloat(valor || 0).toFixed(2);
    return moneda === "soles" ? `S/ ${num}` : `$ ${num}`;
  };

  // Renderizar mini-card de moneda dentro de la card principal
  const renderMonedaSection = (saldo, moneda, config) => {
    if (!saldo) {
      // Si no hay saldo para esta moneda pero el tipo lo soporta
      if (config.supportsBothCurrencies || config.onlyCurrency === moneda) {
        return (
          <div className={`moneda-section ${moneda} empty`}>
            <div className="moneda-header">
              <span className="moneda-icon">
                {moneda === "soles" ? "S/" : "$"}
              </span>
              <span className="moneda-label">
                {moneda === "soles" ? "Soles" : "Dólares"}
              </span>
            </div>
            <div className="moneda-values">
              <span className="no-config">No configurado</span>
            </div>
          </div>
        );
      }
      return null;
    }

    return (
      <div className={`moneda-section ${moneda}`}>
        <div className="moneda-header">
          <span className="moneda-icon">{moneda === "soles" ? "S/" : "$"}</span>
          <span className="moneda-label">
            {moneda === "soles" ? "Soles" : "Dólares"}
          </span>
          {isSuperAdmin && (
            <button
              className="edit-mini-btn"
              onClick={(e) => {
                e.stopPropagation();
                openEditModal(saldo);
              }}
              title="Editar saldo inicial"
            >
              <FaEdit />
            </button>
          )}
        </div>
        <div className="moneda-values">
          <div className="value-row">
            <span className="value-label">Inicial</span>
            <span className="value-amount inicial">
              {formatMonto(saldo.saldo_inicial, moneda)}
            </span>
          </div>

          <div className="value-row">
            <span className="value-label">Actual</span>
            <span
              className={`value-amount actual ${parseFloat(saldo.saldo_actual) < 0 ? "negative" : "positive"}`}
            >
              {formatMonto(saldo.saldo_actual, moneda)}
            </span>
          </div>
        </div>
        <div className="moneda-footer">
          <span className="last-update">
            Actualizado:{" "}
            {new Date(saldo.ultima_actualizacion).toLocaleDateString()}
          </span>
        </div>
      </div>
    );
  };

  // Renderizar tarjeta agrupada por tipo
  const renderGrupoCard = (grupo) => {
    const { tipo, config, soles, dolares } = grupo;
    const Icon = config.icon;

    return (
      <div
        key={tipo}
        className={`saldo-card-grouped ${tipo}`}
        style={{
          "--card-gradient": config.gradient,
          "--card-bg-light": config.bgLight,
        }}
      >
        {/* Header con icono y nombre del tipo */}
        <div className="card-header" style={{ background: config.gradient }}>
          <div className="header-left">
            <div className="icon-wrapper">
              <Icon />
            </div>
            <h3 className="tipo-label">{config.label}</h3>
          </div>
          {config.isCredit && <span className="credit-badge">Consumido</span>}
        </div>

        {/* Secciones de moneda */}
        <div className="monedas-container">
          {(config.supportsBothCurrencies || !config.onlyCurrency) &&
            renderMonedaSection(soles, "soles", config)}
          {(config.supportsBothCurrencies ||
            config.onlyCurrency === "dolares") &&
            renderMonedaSection(dolares, "dolares", config)}
        </div>
      </div>
    );
  };

  // Prevenir scroll en inputs
  const preventWheelChange = (e) => e.target.blur();
  const preventArrowChange = (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
  };

  return (
    <>
      <div className="saldos-header">
        <div className="header-left">
          <h4> Resumen de Saldos</h4>
          <span className="saldos-count">
            {filteredSaldos.length} cuenta(s)
          </span>
        </div>

        {/* Filtros por año y plataforma */}
        <div className="saldos-filters">
          {/* Selector de Año */}
          <div className="filter-group">
            <label className="filter-label"> Año:</label>
            <select
              className="filter-select year-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Selector de Plataforma */}
          <div className="filter-group">
            <label className="filter-label"> Plataforma:</label>
            <div className="platform-toggle">
              <button
                className={`platform-btn ${selectedPlatform === "venso" ? "active" : ""}`}
                onClick={() => setSelectedPlatform("venso")}
              >
                Venso (B2C)
              </button>
              <button
                className={`platform-btn ${selectedPlatform === "mil" ? "active" : ""}`}
                onClick={() => setSelectedPlatform("mil")}
              >
                MIL (B2B)
              </button>
            </div>
          </div>
        </div>

        <div className="header-actions">
          {/* Botón de transferencias */}
          <TransferenciasInternas
            saldos={filteredSaldos}
            selectedYear={selectedYear}
            selectedPlatform={selectedPlatform}
            refreshData={() => {
              loadSaldos();
              if (parentRefreshData) parentRefreshData();
            }}
          />

          {isSuperAdmin && (
            <button
              className="btn-create-saldo"
              onClick={openCreateModal}
              disabled={loading}
              title="Crear saldo por año, plataforma, negocio y moneda"
            >
              <FaPlus /> Nuevo saldo
            </button>
          )}

          {/* Botón inicializar (SOLO SUPERADMIN) */}
          {isSuperAdmin && (
            <button
              className="btn-initialize"
              onClick={initializeSaldos}
              disabled={loading}
              title="Inicializar saldos predeterminados para el año y plataforma actual"
            >
              <FaSync className={loading ? "spin" : ""} /> Inicializar
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading-indicator">
          <div className="spinner"></div>
          <span>Cargando saldos...</span>
        </div>
      ) : saldos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"></div>
          <h5>No hay saldos configurados</h5>
          <p>Inicializa los saldos para comenzar a gestionar tu caja</p>
          {isSuperAdmin && (
            <div className="empty-actions">
              <button
                className="btn-create-saldo primary"
                onClick={openCreateModal}
              >
                <FaPlus /> Crear saldo
              </button>
              <button
                className="btn-initialize primary"
                onClick={initializeSaldos}
              >
                <FaSync /> Inicializar saldos predeterminados
              </button>
            </div>
          )}
        </div>
      ) : filteredSaldos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"></div>
          <h5>
            No hay saldos para{" "}
            {selectedPlatform === "venso" ? "Venso (B2C)" : "MIL (B2B)"} -{" "}
            {selectedYear}
          </h5>
          <p>No se encontraron saldos con los filtros seleccionados</p>
          <p
            className="debug-info"
            style={{ fontSize: "12px", color: "#6b7280", marginTop: "8px" }}
          >
            Total de saldos: {saldos.length} | Años disponibles:{" "}
            {availableYears.join(", ")} | Plataformas:{" "}
            {availablePlatforms.join(", ")}
          </p>
          {isSuperAdmin && (
            <div className="empty-actions">
              <button
                className="btn-create-saldo primary"
                onClick={openCreateModal}
              >
                <FaPlus /> Crear saldo para este filtro
              </button>
              <button
                className="btn-initialize primary"
                onClick={initializeSaldos}
              >
                <FaSync /> Inicializar saldos default
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="saldos-grid-grouped">
          {saldosAgrupados.map((grupo) => renderGrupoCard(grupo))}
        </div>
      )}

      {/* Modal para crear saldo/caja */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal create-saldo-modal">
            <div className="modal-header create">
              <h4>Crear nuevo saldo</h4>
              <button className="close-button" onClick={closeCreateModal}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form
                className={`create-saldo-form ${createValidated ? "validated" : ""}`}
                noValidate
                onSubmit={handleCreateSaldo}
              >
                <div className="form-grid">
                  <div className="form-group">
                    <label>Año del saldo</label>
                    <input
                      type="number"
                      name="year_saldo"
                      min="2020"
                      max="2100"
                      value={saldoForm.year_saldo}
                      onChange={handleSaldoFormChange}
                      onWheel={preventWheelChange}
                      onKeyDown={preventArrowChange}
                      required
                    />
                  </div>
                  <div className="form-group platform-business-field">
                    <label>Plataforma / negocio</label>
                    <select
                      name="platform"
                      value={saldoForm.platform}
                      onChange={handleSaldoFormChange}
                    >
                      <option value="venso">Venso · B2C</option>
                      <option value="mil">MIL · B2B</option>
                    </select>
                    <small className="linked-business-note">
                      El negocio se asigna automáticamente: {getPlatformBusinessLabel(saldoForm.platform)}
                    </small>
                  </div>
                  <div className="form-group">
                    <label>Tipo de saldo / caja</label>
                    <select
                      name="tipo"
                      value={saldoForm.tipo}
                      onChange={handleSaldoFormChange}
                    >
                      {SALDO_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                      <option value="custom">Caja personalizada</option>
                    </select>
                  </div>
                  {saldoForm.tipo === "custom" && (
                    <div className="form-group full">
                      <label>Nombre de caja</label>
                      <input
                        type="text"
                        name="custom_tipo"
                        placeholder="Ej. caja_operativa_cusco"
                        value={saldoForm.custom_tipo}
                        onChange={handleSaldoFormChange}
                        required
                      />
                    </div>
                  )}
                  <div className="form-group">
                    <label>Monedas soportadas</label>
                    <select
                      name="currencyMode"
                      value={saldoForm.currencyMode}
                      onChange={handleSaldoFormChange}
                    >
                      {createAllowedCurrencies.includes("soles") &&
                        createAllowedCurrencies.includes("dolares") && (
                          <option value="both">Soles y dólares</option>
                        )}
                      {createAllowedCurrencies.includes("soles") && (
                        <option value="soles">Solo soles</option>
                      )}
                      {createAllowedCurrencies.includes("dolares") && (
                        <option value="dolares">Solo dólares</option>
                      )}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Saldo inicial</label>
                    <div className="input-with-prefix compact">
                      <span className="prefix">
                        {currencySymbol(saldoForm.currencyMode)}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        name="saldo_inicial"
                        value={saldoForm.saldo_inicial}
                        onChange={handleSaldoFormChange}
                        onWheel={preventWheelChange}
                        onKeyDown={preventArrowChange}
                        required
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                <div className="create-saldo-preview">
                  <div className="preview-heading">
                    <strong>Validación previa</strong>
                    <span>Evita duplicar saldos ya configurados</span>
                  </div>
                  <div className="preview-tags">
                    <span>{getPlatformBusinessLabel(saldoForm.platform)}</span>
                    <span>{saldoForm.year_saldo}</span>
                    <span>{titleize(selectedCreateTipo || "saldo")}</span>
                  </div>

                  <div className="currency-validation-list">
                    {createSaldoDuplicateInfo.map((item) => (
                      <div
                        className={`currency-validation-item ${item.exists ? "exists" : "available"}`}
                        key={item.moneda}
                      >
                        <span className="status-icon">
                          {item.exists ? (
                            <FaExclamationTriangle />
                          ) : (
                            <FaCheckCircle />
                          )}
                        </span>
                        <div>
                          <strong>{currencyLabel(item.moneda)}</strong>
                          <small>
                            {item.exists
                              ? `Ya existe como ${titleize(item.existing?.tipo)} · ID ${item.existing?.id}`
                              : "Disponible para crear"}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>

                  {allSelectedCurrenciesAlreadyExist ? (
                    <p className="create-warning">
                      Todas las monedas seleccionadas ya existen. Cambia la
                      caja, moneda, año o plataforma para crear un saldo nuevo.
                    </p>
                  ) : (
                    <p className="create-hint">
                      Se crearán {currenciesToCreate.length} saldo(s) nuevo(s) y
                      se omitirá cualquier coincidencia existente.
                    </p>
                  )}
                </div>

                <div className="create-saldo-footer">
                  <div className="create-saldo-footer-summary">
                    <strong>{getPlatformBusinessLabel(saldoForm.platform)}</strong>
                    <span>
                      {saldoForm.year_saldo} · {titleize(selectedCreateTipo || "saldo")} · {currenciesToCreate.length} por crear
                    </span>
                  </div>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn-cancel"
                      onClick={closeCreateModal}
                      disabled={createLoading}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="btn-save"
                      disabled={createLoading || !createFormHasValidTarget}
                      title={
                        allSelectedCurrenciesAlreadyExist
                          ? "El saldo ya existe para todas las monedas seleccionadas"
                          : "Crear saldo"
                      }
                    >
                      <FaSave /> {createLoading ? "Creando..." : "Crear saldo"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal para editar saldo inicial */}
      {showEditModal && editingSaldo && (
        <div className="modal-overlay">
          <div className="modal edit-saldo-modal">
            <div className="modal-header">
              <h4> Editar Saldo Inicial</h4>
              <button className="close-button" onClick={closeModal}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form
                className={validated ? "validated" : ""}
                noValidate
                onSubmit={handleSaveEdit}
              >
                <div className="form-info">
                  <div className="info-row">
                    <span className="info-label">Tipo:</span>
                    <span className="info-value">
                      {tipoConfig[editingSaldo.tipo]?.label ||
                        editingSaldo.tipo}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Moneda:</span>
                    <span className="info-value">
                      {editingSaldo.moneda === "soles"
                        ? "🇵🇪 Soles"
                        : "🇺🇸 Dólares"}
                    </span>
                  </div>
                </div>

                <div className="form-group">
                  <label>Saldo Inicial</label>
                  <div className="input-with-prefix">
                    <span className="prefix">
                      {editingSaldo.moneda === "soles" ? "S/" : "$"}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newSaldoInicial}
                      onChange={(e) => setNewSaldoInicial(e.target.value)}
                      required
                      className={validated && !newSaldoInicial ? "invalid" : ""}
                      onWheel={preventWheelChange}
                      onKeyDown={preventArrowChange}
                      placeholder="0.00"
                    />
                  </div>
                  {validated && !newSaldoInicial && (
                    <div className="feedback">
                      Por favor ingrese un saldo inicial válido.
                    </div>
                  )}
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={closeModal}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn-save">
                    Guardar Cambios
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SaldosOverview;
