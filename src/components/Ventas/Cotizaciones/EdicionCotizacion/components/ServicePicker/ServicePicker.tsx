import { useState, useEffect, useMemo, useRef } from "react";
import {
  FaSearch,
  FaFilter,
  FaChevronUp,
  FaChevronDown,
  FaMapMarkerAlt,
  FaStar,
  FaSyncAlt,
} from "react-icons/fa";
import { MdClose } from "react-icons/md";

import ServiceCategoryButtons from "./components/ServiceCategoryButtons/ServiceCategoryButtons";
import ChildServicePanel from "./components/ChildServicePanel/ChildServicePanel";
import ExtraServiceModal from "./components/ExtraServiceModal/ExtraServiceModal";
import ServicePickerFilters from "./components/ServicePickerFilters";
import { filterCatalogue, quotationPickerPax } from "./utils/catalogueFilters";

import { createAxiosInstance } from "../../../../../../utils/axiosInstance";
import { getParentId, getServiceDisplayName } from "./utils/serviceTypes";
import { useUnifiedFilters } from "./hooks/useUnifiedFilters";
import { createUnifiedService } from "../../utils/unifiedServiceManager";
import { markServicePickerQuotationExchangeRate } from "../../utils/serviceExchangeRate";
import useServicePickerCache, {
  filterVisibleForServicePicker,
  shouldFilterServicePickerVisibility,
} from "./hooks/useServicePickerCache";

import "./ServicePicker.scss";
import "./components/ServicePickerFilters.scss";
import "./components/TrainPickerDetails.scss";

const CURRENT_TARIFF_YEAR = new Date().getFullYear();
const TARIFF_YEAR_OPTIONS = Array.from(
  { length: 7 },
  (_, index) => CURRENT_TARIFF_YEAR - 2 + index,
);

const normalizeServicePickerId = (value) => {
  if (value === null || value === undefined) return null;
  return String(value).trim();
};

const getNestedValue = (item, paths) => {
  for (const path of paths) {
    const value = path.split(".").reduce((acc, key) => acc?.[key], item);
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
};

const sameServicePickerId = (left, right) => {
  const a = normalizeServicePickerId(left);
  const b = normalizeServicePickerId(right);
  return Boolean(a && b && a === b);
};

const getChildParentIdForCategory = (child, categoryId) => {
  const pathMap = {
    hoteles: [
      "hotel_id",
      "id_hotel",
      "habitacion.hotel_id",
      "habitacion.id_hotel",
      "hotel.id_hotel",
      "hotel.id",
    ],
    transportes: [
      "transporte_id",
      "id_transporte",
      "movilidad.transporte_id",
      "movilidad.id_transporte",
      "transporte.id_transporte",
      "transporte.id",
    ],
    guias: [
      "guia_id",
      "id_guia",
      "ruta.guia_id",
      "ruta.id_guia",
      "guia.id_guia",
      "guia.id",
    ],
    endoses: [
      "endose_id",
      "id_endose",
      "tour.endose_id",
      "tour.id_endose",
      "endose.id_endose",
      "endose.id",
    ],
    trenes: [
      "tren_id",
      "id_tren",
      "vagon.tren_id",
      "vagon.id_tren",
      "tren.id_tren",
      "tren.id",
    ],
    vuelos: [
      "vuelo_id",
      "id_vuelo",
      "tipo_vuelo.vuelo_id",
      "tipo_vuelo.id_vuelo",
      "vuelo.id_vuelo",
      "vuelo.id",
    ],
  };

  return normalizeServicePickerId(getNestedValue(child, pathMap[categoryId] || []));
};

const filterVensoServicePickerVisibility = (
  children,
  visibleParents,
  categoryId,
  platform,
) => {
  const visibleChildren = filterVisibleForServicePicker(children || [], platform) || [];

  if (!shouldFilterServicePickerVisibility(platform) || !Array.isArray(visibleParents)) {
    return visibleChildren;
  }

  const visibleParentIds = new Set(
    visibleParents
      .map((parent) => normalizeServicePickerId(getParentId(parent, categoryId)))
      .filter(Boolean),
  );

  if (!visibleParentIds.size) return visibleChildren;

  return visibleChildren.filter((child) => {
    const parentId = getChildParentIdForCategory(child, categoryId);
    if (!parentId) return true;
    return visibleParentIds.has(parentId);
  });
};

const ServicePicker = ({
  onSelectService,
  selectedDay,
  onClose,
  packageType = "compartido",
  serviceFilter,
  filterTariffType,
  preselectedCategory = null,
  totalPassengers = 1,
  peopleDetails = {}, // Agregar datos de pasajeros
  preselectedCities = [], // Agregar ciudades preseleccionadas del itinerario
  passengerSelection = null,
  platform = "venso", // Platform para controlar visibilidad de elementos (se pasa a ServiceCategoryButtons)
  agencyId = 1, // Agencia de la cotización; no restringe el catálogo del picker.
}) => {
  // Core state management
  const [activeCategory, setActiveCategory] = useState(
    preselectedCategory || "hoteles",
  );
  const [services, setServices] = useState({});
  const [childServices, setChildServices] = useState({});
  const [loading, setLoading] = useState({});
  const [error, setError] = useState({});
  const [childSearchTerm, setChildSearchTerm] = useState("");
  const quotationPax = quotationPickerPax(peopleDetails, passengerSelection, totalPassengers);
  const [passengerCapacity, setPassengerCapacity] = useState(() => quotationPax);
  const [providerIds, setProviderIds] = useState<string[]>([]);
  const [catalogueFacetFilters, setCatalogueFacetFilters] = useState<Record<string, string>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    setProviderIds([]);
    setCatalogueFacetFilters({});
    setPassengerCapacity(quotationPax);
  }, [activeCategory, quotationPax]);
  const [tariffYear, setTariffYear] = useState(CURRENT_TARIFF_YEAR);

  // Hook de cache para servicios
  const { fetchWithCache, clearCache } = useServicePickerCache();

  // Extra service modal state
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [refreshingCategory, setRefreshingCategory] = useState(false);

  // Get current services arrays for filtering
  // CORREGIDO: Permitir servicios padre aunque estén en proceso de carga
  const currentParentServices = useMemo(() => {
    const categoryServices = services[activeCategory];
    // Verificar que sea un array (puede estar vacío durante la carga inicial)
    if (categoryServices && Array.isArray(categoryServices)) {
      return categoryServices;
    }
    return [];
  }, [services, activeCategory]);

  // Usar servicios hijo "all" si están disponibles, sino usar los específicos por padre
  // Siempre usar el array "all" de hijos para la categoría activa, y filtrar por padre localmente en ChildServicePanel
  const currentChildServices = useMemo(() => {
    const allChildKey = `${activeCategory}_all`;
    if (childServices[allChildKey] && childServices[allChildKey].length > 0) {
      return childServices[allChildKey];
    }
    if (
      childServices[activeCategory] &&
      childServices[activeCategory].length > 0
    ) {
      return childServices[activeCategory];
    }
    const fallbackChildren = Object.values(
      childServices[activeCategory] || {},
    ).flat();
    return fallbackChildren;
  }, [activeCategory, childServices]);

  // Service categories configuration (sin extras)
  const serviceCategories = useMemo(
    () => [
      {
        id: "hoteles",
        label: "Hoteles",
        icon: "FaHotel",
        endpoint: "hoteles",
        hasChildren: true,
        childEndpoint: "habitaciones/hotel",
        childName: "habitaciones",
      },
      {
        id: "vuelos",
        label: "Vuelos",
        icon: "FaPlane",
        endpoint: "vuelos",
        hasChildren: true,
        childEndpoint: "tipos-vuelo/vuelo",
        childName: "tipos de vuelo",
      },
      {
        id: "trenes",
        label: "Trenes",
        icon: "FaTrain",
        endpoint: "trenes",
        hasChildren: true,
        childEndpoint: "vagones/tren",
        childName: "vagones",
      },
      {
        id: "transportes",
        label: "Transportes",
        icon: "FaShuttleVan",
        endpoint: "transportes",
        hasChildren: true,
        childEndpoint: "movilidades/transporte",
        childName: "movilidades",
      },
      {
        id: "guias",
        label: "Guías",
        icon: "FaRoute",
        endpoint: "guias",
        hasChildren: true,
        childEndpoint: "rutas/guia",
        childName: "rutas",
      },
      {
        id: "endoses",
        label: "Endoses",
        icon: "FaSuitcase",
        endpoint: "endoses",
        hasChildren: true,
        childEndpoint: "tours/endose",
        childName: "tours",
      },
      {
        id: "restaurantes",
        label: "Restaurantes",
        icon: "FaUtensils",
        endpoint: "restaurantes",
        hasChildren: false,
        childEndpoint: "con-tarifas",
        childName: "tarifas",
        isStandalone: true,
        hasTarifas: true,
        showDirectly: true,
      },
      {
        id: "tickets",
        label: "Tickets",
        icon: "FaTicketAlt",
        endpoint: "tickets",
        hasChildren: false,
        childEndpoint: "con-tarifas",
        childName: "tarifas",
        isStandalone: true,
        hasTarifas: true,
        showDirectly: true,
      },
    ],
    [],
  );

  const currentCategory = useMemo(() => {
    const category = serviceCategories.find((cat) => cat.id === activeCategory);
    return category;
  }, [serviceCategories, activeCategory]);

  // Use unified filters hook
  const {
    filters,
    filteredChildServices,
    updateFilters,
    clearFilters,
    activeFilterCount,
    // Props para filtros del itinerario
    itineraryMatchingServices,
    hasItineraryMatches,
  } = useUnifiedFilters(
    currentParentServices,
    currentChildServices,
    activeCategory,
    preselectedCities,
    null,
    filterTariffType,
    platform,
    [],
  );

  const displayedChildServices = useMemo(() => filterCatalogue(
    filteredChildServices, activeCategory, currentParentServices, providerIds, catalogueFacetFilters,
  ), [filteredChildServices, activeCategory, currentParentServices, providerIds, catalogueFacetFilters]);

  // SIMPLIFICADO: Ya no necesitamos filtro adicional porque useUnifiedFilters maneja todo
  // El problema era que estábamos filtrando dos veces y el segundo filtro no tenía los datos correctos

  // Helper function to detect if we have active child filters (price, room type, etc.)
  const hasActiveChildFilters = useMemo(() => {
    const childFilterKeys = [
      "rangoPrecio",
      "tiposHabitacion",
      "estados",
      "tiposAuto",
      "capacidades",
    ];

    return childFilterKeys.some((key) => {
      const value = filters[key];
      if (key === "rangoPrecio") {
        return value && (value.min !== null || value.max !== null);
      }
      return Array.isArray(value) && value.length > 0;
    });
  }, [filters]);

  const normalizedPlatform = useMemo(
    () => String(platform || "").trim().toLowerCase(),
    [platform],
  );

  useEffect(() => {
    setServices({});
    setChildServices({});
    setChildSearchTerm("");
  }, [normalizedPlatform, tariffYear]);

  // Función para manejar el cambio de categoría - ahora directo sin modal
  const handleCategoryChange = (newCategoryId) => {
    // Si ya estamos en esa categoría, no hacer nada
    if (newCategoryId === activeCategory) return;
    setActiveCategory(newCategoryId);
    setChildSearchTerm("");
  };

  // Initialize and fetch all data when category changes
  useEffect(() => {
    if (activeCategory) {

      const category = serviceCategories.find(
        (cat) => cat.id === activeCategory,
      );
      if (category) {
        fetchAllServicesWithTariffs(category);
      }
    }
  }, [activeCategory, serviceCategories, platform, tariffYear, filterTariffType]);

  // Initialize with preselected category
  useEffect(() => {
    if (preselectedCategory && preselectedCategory !== activeCategory) {
      setActiveCategory(preselectedCategory);
    }
  }, [preselectedCategory]);

  // Las ciudades preseleccionadas ya NO se auto-aplican como filtro.
  // Solo se usan como chips clickeables en la barra de filtros de ciudades.

  // NUEVO: Cargar servicios hijo cuando se selecciona un padre

  const getAxios = () => createAxiosInstance();

  /**
   * Fetch all services with their children and tariffs in one go
   * OPTIMIZADO: No reprocesa si ya tenemos los datos mapeados en state
   */
  const fetchAllServicesWithTariffs = async (category, forceRefresh = false) => {
    // NUEVA OPTIMIZACIÓN: Si ya tenemos datos procesados para esta categoría, no reprocesar
    const hasExistingParents = services[category.id]?.length > 0;
    const hasExistingChildren = childServices[`${category.id}_all`]?.length > 0;

    // Si ya tenemos ambos datos procesados, no hacer nada
    if (!forceRefresh && hasExistingParents && hasExistingChildren) {
      return;
    }

    try {
      if (forceRefresh || !hasExistingParents) {
        setLoading((prev) => ({ ...prev, [category.id]: true }));
      }
      setError((prev) => ({ ...prev, [category.id]: null }));

      if (category.hasChildren) {
        // Usar cache para servicios padre
        let parentEndpoint = category.endpoint;
        const parentServices_raw = await fetchWithCache(
          parentEndpoint,
          forceRefresh,
        );
        let parentServices = parentServices_raw || [];

        // INNER JOIN: Para guías, combinar datos de guia con persona
        if (category.id === "guias") {
          // El backend ya envía {guia: {...}, persona: {...}}
          // Solo necesitamos aplanar la estructura combinando ambos objetos
          parentServices = parentServices.map((guiaConPersona) => {
            // Si ya viene con estructura plana (no tiene .guia), retornar tal cual
            if (!guiaConPersona.guia) {
              return guiaConPersona;
            }

            const { guia, persona } = guiaConPersona;

            if (guia && persona) {
              // Hacer INNER JOIN: combinar campos de guia y persona en un solo objeto
              return {
                ...guia,
                // Campos de persona unidos al objeto guía
                nombres: persona.nombres,
                apellidos: persona.apellidos,
                genero: persona.genero,
                estado_civil: persona.estado_civil,
                direccion: persona.direccion,
                // Nombre completo para display
                nombre_completo: `${persona.nombres} ${persona.apellidos}`,
                // Mantener referencia a persona completa si se necesita
                persona: persona,
                typeService: "guias",
              };
            } else {
              console.warn(` GuiaConPersona incompleto:`, guiaConPersona);
              return guia || guiaConPersona;
            }
          });
        }

        parentServices = filterVisibleForServicePicker(parentServices, platform) || [];

        const filterHotelsByStarCategory = (parents, serviceFilter) => {
          // TEMPORAL: Desactivar el filtro de estrellas que eliminaba todos los hoteles
          // Este filtro se puede reactivar más tarde si es necesario con una lógica más flexible
          return parents; // Retornar todos los hoteles sin filtrar por estrellas
        };

        /**
         * Un proveedor permanece visible cuando tiene al menos un servicio hijo
         * utilizable. La disponibilidad de una tarifa exacta NO determina la
         * visibilidad del catálogo: varios servicios importados son operativos
         * aunque todavía no tengan precio o sólo tengan tarifa interna.
         */
        const filterValidParents = (
          parents,
          allChildren,
          categoryId,
        ) => {
          const filtered = parents.filter((parent) => {
            const parentId = getParentId(parent, categoryId);
            if (!parentId) {
              return false;
            }

            // MEJORAR: Encontrar hijos vinculados a este padre con lógica más robusta
            const parentChildren = allChildren.filter((child) => {
              let matches = false;
              switch (categoryId) {
                case "hoteles":
                  matches =
                    child.hotel_id === parentId ||
                    child.id_hotel === parentId ||
                    child.habitacion?.hotel_id === parentId ||
                    child.habitacion?.id_hotel === parentId;
                  break;
                case "transportes":
                  matches =
                    child.transporte_id === parentId ||
                    child.id_transporte === parentId ||
                    child.movilidad?.transporte_id === parentId ||
                    child.movilidad?.id_transporte === parentId;
                  break;
                case "guias":
                  matches =
                    child.guia_id === parentId ||
                    child.id_guia === parentId ||
                    child.ruta?.guia_id === parentId ||
                    child.ruta?.id_guia === parentId;
                  break;
                case "endoses":
                  matches =
                    sameServicePickerId(child.endose_id, parentId) ||
                    sameServicePickerId(child.id_endose, parentId) ||
                    sameServicePickerId(child.tour?.endose_id, parentId) ||
                    sameServicePickerId(child.tour?.id_endose, parentId) ||
                    sameServicePickerId(child.endose?.id_endose, parentId) ||
                    sameServicePickerId(child.endose?.id, parentId);
                  break;
                case "trenes":
                  matches =
                    child.tren_id === parentId ||
                    child.id_tren === parentId ||
                    child.vagon?.tren_id === parentId ||
                    child.vagon?.id_tren === parentId;
                  break;
                case "vuelos":
                  matches =
                    child.vuelo_id === parentId ||
                    child.id_vuelo === parentId ||
                    child.tipo_vuelo?.vuelo_id === parentId ||
                    child.tipo_vuelo?.id_vuelo === parentId;
                  break;
                default:
                  matches = false;
                  break;
              }

              return matches;
            });

            // Si no tiene hijos, excluir el padre
            if (parentChildren.length === 0) return false;

            // Los hijos ya llegan preparados por `useServicePickerCache`: se
            // conserva sólo la tarifa comercial exacta y, si no existe, el
            // servicio permanece visible sin precio para completar el itinerario.
            return true;
          });
          return filtered;
        };

        // Inicialmente guardamos todos los padres
        setServices((prev) => ({ ...prev, [category.id]: parentServices }));

        try {
          let allChildEndpoint;
          if (category.id === "guias") {
            // Para guías, necesitamos cargar todas las rutas con tarifas
            allChildEndpoint = "rutas/con-tarifas";
          } else if (category.id === "vuelos") {
            // Para vuelos, el endpoint correcto es tipos-vuelo/con-tarifas
            allChildEndpoint = "tipos-vuelo/con-tarifas";
          } else if (category.id === "endoses") {
            // Para endoses, el endpoint correcto es tours/con-tarifas
            allChildEndpoint = "tours/con-tarifas";
          } else {
            // Para otros servicios, usar el childEndpoint estándar con con-tarifas
            allChildEndpoint = `${category.childEndpoint.split("/")[0]}/con-tarifas`;
          }

          // Usar cache para servicios hijo con tarifas
          const allChildServices =
            (await fetchWithCache(allChildEndpoint, forceRefresh, {
              tariffType: filterTariffType,
              tariffYear,
            })) || [];

          // Guardar todos los servicios hijo para filtrado directo
          // Si es transportes, aseguramos que cada movilidad tenga id_transporte plano
          let mappedChildServices = allChildServices;
          // Generalized mapping for all categories with children
          if (
            [
              "transportes",
              "vuelos",
              "guias",
              "endoses",
              "trenes",
              "hoteles",
            ].includes(category.id)
          ) {
            mappedChildServices = allChildServices.map((child) => {
              let parentId = null;
              let parentKey = null;
              switch (category.id) {
                case "transportes":
                  parentId =
                    child.id_transporte ||
                    child.transporte_id ||
                    child.movilidad?.id_transporte ||
                    child.transporte?.id_transporte ||
                    null;
                  parentKey = "transporte_id";
                  break;
                case "vuelos":
                  parentId =
                    child.vuelo_id ||
                    child.tipo_vuelo?.vuelo_id ||
                    child.vuelo?.id ||
                    null;
                  parentKey = "vuelo_id";
                  break;
                case "guias":
                  // Try to extract parentId from all possible sources
                  parentId =
                    child.id_guia ||
                    child.guia_id ||
                    child.ruta?.id_guia ||
                    child.ruta?.guia_id ||
                    child.guia?.id ||
                    null;
                  // If still not found, try to match with parent list
                  if (!parentId && Array.isArray(services["guias"])) {
                    // Try to match by nombre/persona if available
                    const match = services["guias"].find(
                      (g) =>
                        g.nombre === child.nombre_guia ||
                        g.id_guia === child.id_guia,
                    );
                    if (match) parentId = match.id_guia;
                  }
                  // Always set both keys for filtering
                  return {
                    ...child,
                    id_guia: parentId,
                    guia_id: parentId,
                  };
                case "endoses":
                  parentId =
                    child.endose_id ||
                    child.id_endose ||
                    child.tour?.id_endose ||
                    child.tour?.endose_id ||
                    child.endose?.id_endose ||
                    child.endose?.id ||
                    null;
                  parentKey = "endose_id";
                  // NUEVO: Extraer campos del tour anidado para que estén disponibles en búsqueda
                  if (child.tour) {
                    return {
                      ...child,
                      endose_id: parentId,
                      id_endose: parentId,
                      // Campos del tour extraídos al nivel raíz para búsqueda global
                      tipo_guiado: child.tour.tipo_guiado,
                      idioma: child.tour.idioma,
                      estado: child.tour.estado || child.estado,
                      observaciones: child.tour.observaciones,
                    };
                  }
                  break;
                case "trenes":
                  parentId =
                    child.tren_id ||
                    child.id_tren ||
                    child.vagon?.id_tren ||
                    child.vagon?.tren_id ||
                    child.tren?.id ||
                    null;
                  parentKey = "tren_id";
                  break;
                case "hoteles":
                  parentId =
                    child.hotel_id ||
                    child.habitacion?.id_hotel ||
                    child.hotel?.id ||
                    null;
                  parentKey = "hotel_id";
                  break;
                default:
                  break;
              }
              if (category.id !== "guias") {
                // Set both id_xxx and xxx_id for compatibility
                const parentIdObj = parentKey
                  ? {
                      [parentKey]: parentId,
                      ["id_" + parentKey.replace("_id", "")]: parentId,
                    }
                  : {};
                return {
                  ...child,
                  ...parentIdObj,
                };
              }
              return child;
            });
          }
          mappedChildServices = filterVensoServicePickerVisibility(
            mappedChildServices,
            parentServices,
            category.id,
            platform,
          );

          setChildServices((prev) => ({
            ...prev,
            [`${category.id}_all`]: mappedChildServices,
          }));

          // APLICAR FILTRO DE PADRES DESPUÉS DE CARGAR HIJOS
          let filteredParents = filterValidParents(
            parentServices,
            mappedChildServices,
            category.id,
          );

          if (category.id === "hoteles") {
            filteredParents = filterHotelsByStarCategory(
              filteredParents,
              serviceFilter,
            );
          }

          setServices((prev) => ({ ...prev, [category.id]: filteredParents }));
        } catch (childError) {
          console.warn(
            ` [DEBUG] No se pudieron cargar todos los servicios hijo para ${category.id}:`,
            childError,
          );
          // Fallback: cargar hijos individualmente como antes
          const childPromises = parentServices.map(async (parent) => {
            const parentId = getParentId(parent, category.id);
            return fetchChildServicesWithTariffs(category, parentId, parent);
          });
          await Promise.all(childPromises);
        }
      } else if (category.isStandalone && category.hasTarifas) {
        // Usar cache para servicios standalone con tarifas
        const standaloneEndpoint = `${category.endpoint}/${category.childEndpoint}`;
        const servicesWithTarifas = filterVisibleForServicePicker(
          (await fetchWithCache(standaloneEndpoint, forceRefresh, {
            tariffType: filterTariffType,
            tariffYear,
          })) || [],
          platform,
        );

        // Guardar en childServices directamente para ChildServicePanel
        setChildServices((prev) => ({
          ...prev,
          [category.id]: servicesWithTarifas,
        }));
        // No cargar servicios padre para estos tipos
        setServices((prev) => ({ ...prev, [category.id]: [] }));
      } else {
        // Simple standalone services without tariffs - usar cache
        const simpleServices = filterVisibleForServicePicker(
          (await fetchWithCache(category.endpoint, forceRefresh)) || [],
          platform,
        );
        setServices((prev) => ({
          ...prev,
          [category.id]: simpleServices,
        }));
      }
    } catch (err) {
      console.error(` Error fetching ${category.id}:`, err);
      console.error(` [DEBUG] Error completo para ${category.id}:`, {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        endpoint: category.isStandalone
          ? `/turismo/${category.endpoint}/${category.childEndpoint}`
          : `/turismo/${category.endpoint}`,
      });
      setError((prev) => ({
        ...prev,
        [category.id]: `Error cargando ${category.label}: ${err.response?.data?.message || err.message}`,
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [category.id]: false }));
    }
  };

  const handleRefreshCurrentCategory = async () => {
    if (!currentCategory || refreshingCategory) return;
    setRefreshingCategory(true);
    setChildSearchTerm("");
    clearCache();
    setServices((prev) => {
      const next = { ...prev };
      delete next[currentCategory.id];
      return next;
    });
    setChildServices((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key === currentCategory.id || key.startsWith(`${currentCategory.id}_`)) {
          delete next[key];
        }
      });
      return next;
    });

    try {
      await fetchAllServicesWithTariffs(currentCategory, true);
    } finally {
      setRefreshingCategory(false);
    }
  };

  const fetchChildServicesWithTariffs = async (category, parentId, parent) => {
    if (!parentId) return;

    const childKey = `${category.id}_children_${parentId}`;

    try {
      setLoading((prev) => ({ ...prev, [childKey]: true }));

      let endpoint;

      if (category.id === "guias") {
        endpoint = `rutas/guia/${parentId}/con-tarifas`;
      } else if (category.id === "restaurantes") {
        endpoint = `restaurantes/${parentId}/con-tarifas`;
      } else if (category.id === "tickets") {
        endpoint = `tickets/${parentId}/con-tarifas`;
      } else {
        endpoint = `${category.childEndpoint}/${parentId}/con-tarifas`;
      }

      const cachedChildren = await fetchWithCache(endpoint, false, {
        tariffType: filterTariffType,
        tariffYear,
      });
      const children = filterVensoServicePickerVisibility(
        cachedChildren || [],
        [parent],
        category.id,
        platform,
      );

      setChildServices((prev) => ({
        ...prev,
        [childKey]: {
          parent,
          children,
          categoryId: category.id,
        },
      }));
    } catch (err) {
      console.error(` Error fetching children for ${parentId}:`, err);
      setError((prev) => ({
        ...prev,
        [childKey]: `Error cargando servicios`,
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [childKey]: false }));
    }
  };

  // Handle filter changes
  const handleFilterChange = (filterKeyOrObject, value) => {
    if (typeof filterKeyOrObject === "string") {
      updateFilters({ [filterKeyOrObject]: value });
    } else {
      updateFilters(filterKeyOrObject);
    }
  };

  // Provider filters only narrow the catalogue; reconstruct the complete parent on selection.
  const selectedParent = null;

  // FUNCIÓN PARA MANEJAR SELECCIÓN DE TRENES CON LÓGICA IDA-VUELTA Y BIMODAL
  const handleTrainSelection = (
    service,
    parentService = null,
    tariff = null,
  ) => {
    if (activeCategory !== "trenes") {
      // Si no es tren, usar la lógica normal
      handleServiceSelect(service, parentService, tariff);
      return;
    }

    // SIMPLIFICADO: Siempre agregar solo un tren
    // Si serv_add contiene "bimodal", ya incluye ida y vuelta
    // Si NO contiene "bimodal", agregamos solo uno como solicitado
    handleServiceSelect(service, parentService, tariff);
  };

  const handleServiceSelect = async (
    service,
    parentService = null,
    tariff = null,
    options = {},
  ) => {
    // DETERMINAR ESTRUCTURA DEL SERVICIO SEGÚN TIPO
    let actualParentService, cleanChildService, actualTariff;

    // Debug: log entrada de la función
    console.log("[ServicePicker][handleServiceSelect] INICIO", {
      service,
      parentService,
      tariff,
      activeCategory,
      selectedParent,
      currentParentServices,
    });

    if (currentCategory?.isStandalone) {
      // SERVICIOS STANDALONE (restaurantes, tickets)
      actualParentService = {
        typeService: activeCategory,
      };
      cleanChildService = {
        ...service,
        packageType: service.packageType || packageType,
      };
      actualTariff = tariff ||
        service.tarifas?.[0] ||
        service.tariff || {
          precio: parseFloat(
            service.precio_compartido || service.precio_privado || 0,
          ),
          precio_original: parseFloat(
            service.precio_compartido || service.precio_privado || 0,
          ),
          tieneIgv: false,
        };
      console.log("[ServicePicker][handleServiceSelect] STANDALONE", {
        actualParentService,
        cleanChildService,
        actualTariff,
      });
    } else {
      // SERVICIOS CON RELACIÓN PADRE-HIJO NORMAL
      // Si no se pasa parentService, buscarlo localmente por la llave foránea
      if (!parentService) {
        // Buscar el padre en currentParentServices usando la llave foránea
        const possibleKeys = [
          "id_hotel",
          "hotel_id",
          "id_tren",
          "tren_id",
          "id_transporte",
          "transporte_id",
          "id_guia",
          "guia_id",
          "id_endose",
          "endose_id",
          "id_vuelo",
          "vuelo_id",
          "id",
          "id_tipo_vuelo",
        ];
        let parentId = null;
        let parentKey = null;
        // Buscar en la raíz del hijo
        for (const key of possibleKeys) {
          if (service[key] !== null && service[key] !== undefined) {
            parentId = service[key];
            parentKey = key;
            break;
          }
        }

        // MEJORADO: Estrategias adicionales para extraer parentId cuando no está en la raíz
        if (!parentId && service) {
          // Estrategia específica por categoría
          switch (activeCategory) {
            case "hoteles":
              parentId =
                service.id_hotel || service.hotel_id || service.id_servicio;
              parentKey = "hotel_specific";
              break;
            case "trenes":
              parentId =
                service.id_tren || service.tren_id || service.id_servicio;
              parentKey = "tren_specific";
              break;
            case "transportes":
              parentId =
                service.id_transporte ||
                service.transporte_id ||
                service.id_servicio;
              parentKey = "transporte_specific";
              break;
            case "guias":
              parentId =
                service.id_guia || service.guia_id || service.id_servicio;
              parentKey = "guia_specific";
              break;
            case "endoses":
              parentId =
                service.id_endose || service.endose_id || service.id_servicio;
              parentKey = "endose_specific";
              break;
            case "vuelos":
              parentId =
                service.id_vuelo || service.vuelo_id || service.id_servicio;
              parentKey = "vuelo_specific";
              break;
          }

          if (parentId) {
            console.log(
              "[ServicePicker][handleServiceSelect] parentId encontrado por estrategia específica de categoría:",
              parentId,
              parentKey,
            );
          }
        }
        // Buscar en subobjeto hijo si no se encontró en la raíz
        if (!parentId) {
          const subChild =
            service.habitacion ||
            service.vagon ||
            service.ruta ||
            service.tour ||
            service.tipo_vuelo ||
            service.movilidad;
          if (subChild) {
            for (const key of possibleKeys) {
              if (subChild[key]) {
                parentId = subChild[key];
                parentKey = key;
                console.log(
                  "[ServicePicker][handleServiceSelect] parentId encontrado en subChild:",
                  key,
                  parentId,
                );
                break;
              }
            }
            if (
              !parentId &&
              activeCategory === "hoteles" &&
              subChild.id_hotel
            ) {
              parentId = subChild.id_hotel;
              parentKey = "id_hotel";
              console.log(
                "[ServicePicker][handleServiceSelect] parentId encontrado en subChild.id_hotel:",
                parentId,
              );
            }
          }
        }
        // Buscar en la tarifa si no se encontró aún
        if (
          !parentId &&
          activeCategory === "hoteles" &&
          tariff &&
          tariff.id_servicio
        ) {
          const habitacion = currentChildServices.find(
            (h) => h.id_habitacion === tariff.id_servicio,
          );
          if (habitacion && habitacion.id_hotel) {
            parentId = habitacion.id_hotel;
            parentKey = "id_hotel";
            console.log(
              "[ServicePicker][handleServiceSelect] parentId encontrado en tarifa/habitacion:",
              parentId,
            );
          }
        }
        // Buscar por nombre del padre
        if (!parentId) {
          let parentName =
            service.nombre_hotel ||
            service.nombre_padre ||
            service.nombre ||
            null;
          if (!parentName) {
            const subChild =
              service.habitacion ||
              service.vagon ||
              service.ruta ||
              service.tour ||
              service.tipo_vuelo ||
              service.movilidad;
            if (subChild)
              parentName =
                subChild.nombre_hotel ||
                subChild.nombre_padre ||
                subChild.nombre ||
                null;
          }
          if (parentName) {
            const foundByName = currentParentServices.find(
              (p) => p.nombre === parentName,
            );
            if (foundByName) {
              parentId =
                foundByName.id_hotel ||
                foundByName.id_tren ||
                foundByName.id_transporte ||
                foundByName.id_guia ||
                foundByName.id_endose ||
                foundByName.id_vuelo ||
                foundByName.id;
              parentKey = "nombre";
              console.log(
                "[ServicePicker][handleServiceSelect] parentId encontrado por nombre:",
                parentName,
                parentId,
              );
            }
          }
        }
        // Buscar por ciudad y categoría
        if (!parentId) {
          let ciudad =
            service.ciudad || (service.habitacion && service.habitacion.ciudad);
          let categoria =
            service.categoria ||
            (service.habitacion && service.habitacion.categoria);
          if (ciudad || categoria) {
            const foundByMeta = currentParentServices.find(
              (p) =>
                (ciudad ? p.ciudad === ciudad : true) &&
                (categoria ? p.categoria === categoria : true),
            );
            if (foundByMeta) {
              parentId =
                foundByMeta.id_hotel ||
                foundByMeta.id_tren ||
                foundByMeta.id_transporte ||
                foundByMeta.id_guia ||
                foundByMeta.id_endose ||
                foundByMeta.id_vuelo ||
                foundByMeta.id;
              parentKey = "ciudad/categoria";
              console.log(
                "[ServicePicker][handleServiceSelect] parentId encontrado por ciudad/categoria:",
                ciudad,
                categoria,
                parentId,
              );
            }
          }
        }
        // Debug: log parentId encontrado
        console.log(
          "[ServicePicker][handleServiceSelect] parentId detectado:",
          parentId,
          "por",
          parentKey,
        );
        // Log todos los ids de los padres en currentParentServices
        if (currentParentServices && currentParentServices.length > 0) {
          const parentKeys = [
            "id_hotel",
            "hotel_id",
            "id_tren",
            "tren_id",
            "id_transporte",
            "transporte_id",
            "id_guia",
            "guia_id",
            "id_endose",
            "endose_id",
            "id_vuelo",
            "vuelo_id",
            "id",
            "id_tipo_vuelo",
          ];
          const parentIdsList = currentParentServices.map((p) => {
            let ids = {};
            parentKeys.forEach((k) => {
              ids[k] = p[k];
            });
            return ids;
          });
          console.log(
            "[ServicePicker][handleServiceSelect] parentServices ids:",
            parentIdsList,
          );
        }
        // Buscar el objeto completo del padre en currentParentServices usando todas las claves posibles
        let foundParent = null;
        if (parentId) {
          // Debug: Verificar qué IDs tienen los padres disponibles
          const availableParentIds = currentParentServices.map((p) => ({
            id_hotel: p.id_hotel,
            id: p.id,
            nombre: p.nombre,
          }));
          console.log(
            "[ServicePicker][handleServiceSelect] IDs disponibles en currentParentServices:",
            availableParentIds.slice(0, 5),
          );
          console.log(
            "[ServicePicker][handleServiceSelect] Buscando parentId:",
            parentId,
            "tipo:",
            typeof parentId,
          );

          foundParent = currentParentServices.find((s) => {
            // Comparar parentId con todas las posibles claves del padre
            const parentKeys = [
              "id_hotel",
              "hotel_id",
              "id_tren",
              "tren_id",
              "id_transporte",
              "transporte_id",
              "id_guia",
              "guia_id",
              "id_endose",
              "endose_id",
              "id_vuelo",
              "vuelo_id",
              "id",
              "id_tipo_vuelo",
            ];
            for (const key of parentKeys) {
              if (s[key] !== null && s[key] !== undefined) {
                // Comparar tanto como número como string
                if (
                  s[key] === parentId ||
                  Number(s[key]) === Number(parentId) ||
                  String(s[key]) === String(parentId)
                ) {
                  console.log(
                    "[ServicePicker][handleServiceSelect] Padre encontrado por clave:",
                    key,
                    "valor:",
                    s[key],
                    "vs parentId:",
                    parentId,
                  );
                  return true;
                }
              }
            }
            return false;
          });

          if (!foundParent) {
            console.warn(
              "[ServicePicker][handleServiceSelect] No se encontró padre con ID:",
              parentId,
            );
            console.warn(
              "[ServicePicker][handleServiceSelect] currentParentServices sample:",
              currentParentServices.slice(0, 3),
            );
          }
        }
        // Debug: log foundParent
        console.log(
          "[ServicePicker][handleServiceSelect] foundParent:",
          foundParent,
        );
        // Si se encontró el padre, copiar todos los datos relevantes
        if (foundParent) {
          // MEJORADO: Copiar todos los campos del padre de manera más robusta
          actualParentService = {
            ...foundParent,
            typeService: activeCategory,
          };
          console.log(
            "[ServicePicker][handleServiceSelect] Padre completo copiado directamente:",
            actualParentService,
          );
        } else if (parentId) {
          // MEJORADO: Búsqueda exhaustiva del padre en currentParentServices
          console.log(
            "[ServicePicker][handleServiceSelect] Padre no encontrado directamente, iniciando búsqueda exhaustiva para parentId:",
            parentId,
          );

          // Intentar buscar el padre por id en los arrays cargados con múltiples estrategias
          const parentKeys = [
            "id_hotel",
            "hotel_id",
            "id_tren",
            "tren_id",
            "id_transporte",
            "transporte_id",
            "id_guia",
            "guia_id",
            "id_endose",
            "endose_id",
            "id_vuelo",
            "vuelo_id",
            "id",
            "id_tipo_vuelo",
          ];
          let foundById = null;

          // Estrategia 1: Comparación directa por ID (mejorada)
          for (const parentObj of currentParentServices) {
            for (const key of parentKeys) {
              if (parentObj[key] !== null && parentObj[key] !== undefined) {
                // Comparar tanto como número como string y valor original
                if (
                  parentObj[key] === parentId ||
                  Number(parentObj[key]) === Number(parentId) ||
                  String(parentObj[key]) === String(parentId)
                ) {
                  foundById = parentObj;
                  console.log(
                    "[ServicePicker][handleServiceSelect] Padre encontrado por clave",
                    key,
                    "valor:",
                    parentObj[key],
                    "vs parentId:",
                    parentId,
                  );
                  break;
                }
              }
            }
            if (foundById) break;
          }

          // Estrategia 2: Si no se encontró, buscar por campos específicos según categoría
          if (!foundById && currentParentServices.length > 0) {
            console.log(
              "[ServicePicker][handleServiceSelect] Aplicando estrategia 2 - búsqueda por categoría específica",
            );

            const compareId = (value, target) => {
              return (
                value === target ||
                Number(value) === Number(target) ||
                String(value) === String(target)
              );
            };

            switch (activeCategory) {
              case "hoteles":
                foundById = currentParentServices.find(
                  (p) =>
                    compareId(p.id_hotel, parentId) ||
                    compareId(p.hotel_id, parentId) ||
                    compareId(p.id, parentId),
                );
                break;
              case "trenes":
                foundById = currentParentServices.find(
                  (p) =>
                    compareId(p.id_tren, parentId) ||
                    compareId(p.tren_id, parentId) ||
                    compareId(p.id, parentId),
                );
                break;
              case "transportes":
                foundById = currentParentServices.find(
                  (p) =>
                    compareId(p.id_transporte, parentId) ||
                    compareId(p.transporte_id, parentId) ||
                    compareId(p.id, parentId),
                );
                break;
              case "guias":
                foundById = currentParentServices.find(
                  (p) =>
                    compareId(p.id_guia, parentId) ||
                    compareId(p.guia_id, parentId) ||
                    compareId(p.id, parentId),
                );
                break;
              case "endoses":
                foundById = currentParentServices.find(
                  (p) =>
                    compareId(p.id_endose, parentId) ||
                    compareId(p.endose_id, parentId) ||
                    compareId(p.id, parentId),
                );
                break;
              case "vuelos":
                foundById = currentParentServices.find(
                  (p) =>
                    compareId(p.id_vuelo, parentId) ||
                    compareId(p.vuelo_id, parentId) ||
                    compareId(p.id, parentId),
                );
                break;
              default:
                foundById = currentParentServices.find((p) =>
                  compareId(p.id, parentId),
                );
                break;
            }

            if (foundById) {
              console.log(
                "[ServicePicker][handleServiceSelect] Padre encontrado por estrategia específica de categoría:",
                foundById,
              );
            }
          }

          // Estrategia 3: Si aún no se encontró, intentar por índice o posición
          if (!foundById && currentParentServices.length > 0) {
            console.log(
              "[ServicePicker][handleServiceSelect] Aplicando estrategia 3 - búsqueda por nombre o ciudad del servicio",
            );

            // Extraer información del servicio hijo para hacer match
            let serviceInfo = {
              ciudad:
                service.ciudad ||
                service.habitacion?.ciudad ||
                service.vagon?.ciudad ||
                service.ruta?.ciudad ||
                service.tour?.ciudad ||
                service.movilidad?.ciudad,
              nombre:
                service.nombre_hotel ||
                service.nombre_tren ||
                service.nombre_transporte ||
                service.nombre_guia ||
                service.nombre_endose ||
                service.nombre_vuelo,
              categoria:
                service.categoria ||
                service.habitacion?.categoria ||
                service.vagon?.categoria,
            };

            // Buscar por coincidencias de ciudad, nombre o categoría
            if (
              serviceInfo.ciudad ||
              serviceInfo.nombre ||
              serviceInfo.categoria
            ) {
              foundById = currentParentServices.find((p) => {
                const matchCiudad = serviceInfo.ciudad
                  ? p.ciudad === serviceInfo.ciudad
                  : true;
                const matchNombre = serviceInfo.nombre
                  ? p.nombre === serviceInfo.nombre
                  : true;
                const matchCategoria = serviceInfo.categoria
                  ? p.categoria === serviceInfo.categoria
                  : true;

                return matchCiudad && matchNombre && matchCategoria;
              });

              if (foundById) {
                console.log(
                  "[ServicePicker][handleServiceSelect] Padre encontrado por coincidencia de información:",
                  foundById,
                );
              }
            }
          }

          // Aplicar el resultado de la búsqueda
          if (foundById) {
            // MEJORADO: Copiar exhaustivamente todos los campos del padre
            actualParentService = {
              ...foundById,
              typeService: activeCategory,
            };
            console.log(
              "[ServicePicker][handleServiceSelect] ÉXITO: Padre completo encontrado por búsqueda exhaustiva:",
              actualParentService,
            );

            // Debug: Verificar que todos los campos importantes estén presentes
            const importantFields = [
              "nombre",
              "ciudad",
              "categoria",
              "direccion",
              "descripcion",
              "check_in",
              "check_out",
              "desayuno",
              "tipo_desayuno",
              "nombre_transporte",
              "zona",
              "nombre_empresa",
              "aerolinea",
            ];
            const presentFields = importantFields.filter(
              (field) =>
                actualParentService[field] !== undefined &&
                actualParentService[field] !== null,
            );
            console.log(
              "[ServicePicker][handleServiceSelect] Campos importantes presentes en padre:",
              presentFields,
            );
          } else {
            // MEJORADO: Fallback asíncrono para cargar el padre completo desde el backend
            console.warn(
              "[ServicePicker][handleServiceSelect] Padre no encontrado en caché, intentando cargar desde backend...",
            );

            // Para guías, hacer una petición especial para cargar el guía con persona
            if (activeCategory === "guias" && parentId) {
              try {
                const axios = getAxios();
                const guiaResponse = await axios.get(
                  `/turismo/guias/${parentId}`,
                );

                if (guiaResponse.data?.success) {
                  const guia = guiaResponse.data.data;

                  // Cargar la persona asociada si tiene id_persona
                  if (guia.id_persona) {
                    const personaResponse = await axios.get(
                      `/turismo/personas/${guia.id_persona}`,
                    );
                    if (personaResponse.data?.success) {
                      const persona = personaResponse.data.data;

                      // INNER JOIN manual: combinar guía y persona
                      actualParentService = {
                        ...guia,
                        nombres: persona.nombres,
                        apellidos: persona.apellidos,
                        genero: persona.genero,
                        estado_civil: persona.estado_civil,
                        direccion: persona.direccion,
                        nombre_completo: `${persona.nombres} ${persona.apellidos}`,
                        persona: persona,
                        typeService: "guias",
                      };

                      console.log(
                        "[ServicePicker][handleServiceSelect] Guía cargado con persona desde backend:",
                        actualParentService,
                      );
                    } else {
                      // Si no se puede cargar persona, usar solo guía
                      actualParentService = { ...guia, typeService: "guias" };
                      console.warn(
                        "[ServicePicker][handleServiceSelect] Guía cargado sin persona desde backend",
                      );
                    }
                  } else {
                    actualParentService = { ...guia, typeService: "guias" };
                  }
                } else {
                  throw new Error("No se pudo cargar el guía");
                }
              } catch (error) {
                console.error(
                  "[ServicePicker][handleServiceSelect] Error cargando guía desde backend:",
                  error,
                );
                actualParentService = {
                  id: parentId,
                  typeService: activeCategory,
                };
              }
            } else {
              // Para otros tipos de servicio, usar el objeto mínimo como fallback
              actualParentService = {
                id: parentId,
                typeService: activeCategory,
              };
              console.warn(
                "[ServicePicker][handleServiceSelect] FALLBACK: Usando padre mínimo, no se encontró información completa:",
                actualParentService,
              );
            }

            console.warn(
              "[ServicePicker][handleServiceSelect] currentParentServices disponibles:",
              currentParentServices.map((p) => ({
                ids: parentKeys.reduce(
                  (acc, key) => ({ ...acc, [key]: p[key] }),
                  {},
                ),
                nombre: p.nombre,
                ciudad: p.ciudad,
                categoria: p.categoria,
              })),
            );
          }
        } else {
          // Si no se encontró nada, usar el seleccionado (null si no hay)
          actualParentService = selectedParent;
        }
        if (!actualParentService) {
          console.error(
            " No parent service found for",
            activeCategory,
            service,
          );
          return;
        }
      } else {
        actualParentService = parentService;
      }

      // Add typeService to parent if missing
      if (actualParentService && !actualParentService.typeService) {
        actualParentService.typeService = activeCategory;
      }

      // Limpiar estructura del servicio hijo
      cleanChildService = service;
      // CORREGIDO: Agregado service.tour para endoses (TourConTarifas)
      if (
        service.movilidad ||
        service.habitacion ||
        service.guia ||
        service.endose ||
        service.tour ||
        service.vagon
      ) {
        cleanChildService =
          service.movilidad ||
          service.habitacion ||
          service.tour ||
          service.guia ||
          service.endose ||
          service.vagon ||
          service;
      }

      // LIMPIAR: Remover array tarifas innecesario del childService
      // Solo se debe usar tariff (singular) que viene como parámetro o se extrae
      const { tarifas, ...cleanedChild } = cleanChildService;

      cleanChildService = {
        ...cleanedChild,
        packageType: service.packageType || packageType,
        // NUEVO: Asegurar que tipo_guiado esté disponible para endoses (puede venir del tour anidado)
        tipo_guiado:
          cleanedChild.tipo_guiado ||
          service.tour?.tipo_guiado ||
          service.tipo_guiado,
      };

      actualTariff = tariff ||
        service.tarifas?.[0] ||
        service.tariff || {
          precio: parseFloat(
            service.precio_compartido || service.precio_privado || 0,
          ),
          precio_original: parseFloat(
            service.precio_compartido || service.precio_privado || 0,
          ),
          tieneIgv: false,
        };
      // Debug: log armado final
      console.log("[ServicePicker][handleServiceSelect] FINAL ARMADO", {
        actualParentService,
        cleanChildService,
        actualTariff,
      });
    }

    // CORREGIR: Extraer el precio correcto basado en packageType
    if (actualTariff && !actualTariff.precio) {
      const currentPackageType =
        service.packageType || tariff?.selectedPackageType || packageType;
      const priceField =
        currentPackageType === "privado"
          ? "precio_privado"
          : "precio_compartido";
      const extractedPrice = parseFloat(
        actualTariff[priceField] || actualTariff.precio_compartido || 0,
      );

      actualTariff = {
        ...actualTariff,
        precio: extractedPrice,
        precio_original: extractedPrice,
        moneda: actualTariff.moneda,
      };
    }

    // NORMALIZAR PARENT SERVICE PARA GUÍAS: manejar estructura con guia/persona anidados
    if (activeCategory === "guias" && actualParentService) {
      // Si tiene estructura {guia: {...}, persona: {...}} (estructura antigua sin JOIN),
      // combinar ambos objetos
      if (actualParentService.guia && actualParentService.persona) {
        console.log(
          "[ServicePicker] Normalizando guía con estructura antigua: uniendo guia y persona",
        );
        actualParentService = {
          ...actualParentService.guia,
          ...actualParentService.persona,
          // Sobrescribir id_persona del guia si existe en persona
          id_persona: actualParentService.persona.id_persona,
          // Crear nombre_completo
          nombre_completo: `${actualParentService.persona.nombres} ${actualParentService.persona.apellidos}`,
          typeService: "guias",
          persona: actualParentService.persona,
        };
      }
      // Si ya tiene los campos unidos (después del INNER JOIN), no hacer nada más
      // Los campos nombres, apellidos, etc. ya están en el objeto raíz
    }

    // CREAR SERVICIO UNIFICADO
    // Debug antes de llamar createUnifiedService
    console.log(
      "[ServicePicker][handleServiceSelect] Datos para createUnifiedService:",
      {
        actualParentService: {
          ...actualParentService,
          fieldsCount: actualParentService
            ? Object.keys(actualParentService).length
            : 0,
          hasNombre: !!actualParentService?.nombre,
          hasCiudad: !!actualParentService?.ciudad,
          hasCategoria: !!actualParentService?.categoria,
        },
        cleanChildService,
        actualTariff,
        packageType: service.packageType || packageType,
      },
    );

    const finalPassengerSelection = passengerSelection;
    console.log(
      "[ServicePicker] Selección de pasajeros para servicio:",
      finalPassengerSelection,
    );

    const enhancedService = markServicePickerQuotationExchangeRate(
      createUnifiedService(
        actualParentService,
        cleanChildService,
        actualTariff,
        peopleDetails,
        service.packageType || packageType,
        finalPassengerSelection,
      ),
    );
    console.log(
      "[ServicePicker][handleServiceSelect] Servicio unificado creado:",
      enhancedService,
    );

    onSelectService(enhancedService);
    if (options.closeAfterSelect !== false) {
      onClose();
    }
  };

  // Handler para abrir modal de servicios extras
  const handleExtrasClick = () => {
    setShowExtraModal(true);
  };

  // Handler para cerrar el modal de servicio extra
  const handleExtraModalClose = () => {
    setShowExtraModal(false);
  };

  // Handler para guardar un servicio extra (nueva estructura del modal con DB)
  const handleExtraServiceSave = (extraServiceData) => {
    // El nuevo modal ya devuelve la estructura {parentService, childService, tariff} correcta
    const finalService = {
      parentService: extraServiceData.parentService || {
        typeService: "extras",
        nombre: extraServiceData.nombre || "",
      },
      childService: extraServiceData.childService || {
        nombre: extraServiceData.nombre || "",
        packageType,
      },
      tariff: extraServiceData.tariff || {},
    };
    onSelectService(markServicePickerQuotationExchangeRate(finalService));
    setShowExtraModal(false);
    onClose();
  };

  return (
    <div
      className="service-picker-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="service-picker-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Compacto con Buscador Integrado */}
        <div className="service-picker-header">
          <div className="header-content">
            {/* Iconos de categorías a la izquierda */}
            <div className="header-categories">
              <ServiceCategoryButtons
                selectedCategory={activeCategory}
                onCategorySelect={handleCategoryChange}
                onExtrasClick={handleExtrasClick}
                compact={true}
                platform={platform}
              />
            </div>

            <div className="header-year-context">
              <label htmlFor="service-picker-tariff-year">Año</label>
              <select
                id="service-picker-tariff-year"
                aria-label="Año de las tarifas"
                value={tariffYear}
                onChange={(event) => {
                  setTariffYear(Number(event.target.value));
                  clearCache();
                  setServices({});
                  setChildServices({});
                }}
                title="Año de las tarifas"
              >
                {TARIFF_YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <small>Todas las agencias</small>
            </div>

            {/* Buscador de servicios hijos en el header */}
            <div className="header-search">
              <div className="search-box-compact">
                <FaSearch className="search-icon" />
                <input
                  ref={searchInputRef}
                  autoFocus
                  aria-label="Buscar servicios"
                  type="text"
                  className="search-input-compact"
                  placeholder={`Buscar ${getServiceDisplayName(activeCategory).toLowerCase()}...`}
                  value={childSearchTerm}
                  onChange={(e) => setChildSearchTerm(e.target.value)}
                />
                {childSearchTerm && (
                  <button
                    className="clear-search-btn"
                    onClick={() => setChildSearchTerm("")}
                    title="Limpiar búsqueda"
                  >
                    <MdClose />
                  </button>
                )}
              </div>
            </div>

            {/* Filtro por calificación alta */}
            <div className="header-rating-filter">
              <button
                className={`rating-filter-btn ${filters.calificacionMinima ? "active" : ""}`}
                onClick={() => {
                  // Toggle: null (sin filtro) -> 7.5 (solo alta)
                  updateFilters({
                    calificacionMinima: filters.calificacionMinima ? null : 7.5,
                  });
                }}
                title={
                  filters.calificacionMinima
                    ? `Mostrando solo calificación >= ${filters.calificacionMinima} — clic para quitar filtro`
                    : "Filtrar por alta calificación (>= 7.5)"
                }
              >
                <FaStar />
                <span className="rating-label">
                  {filters.calificacionMinima
                    ? `>= ${filters.calificacionMinima}`
                    : "Rating"}
                </span>
              </button>
            </div>

            {/* Botón de cerrar a la derecha */}
            <div className="header-actions">
              <button
                className={`refresh-btn ${refreshingCategory ? "is-refreshing" : ""}`}
                onClick={handleRefreshCurrentCategory}
                title="Recargar servicios, hijos y tarifas"
                disabled={refreshingCategory || loading[activeCategory]}
              >
                <FaSyncAlt />
              </button>
              <button className="close-btn" onClick={onClose} title="Cerrar">
                <MdClose />
              </button>
            </div>
          </div>
        </div>

        {/* Barra de filtros de ciudades - Chips */}
        {preselectedCities.length > 0 && (
          <div className="city-filters-bar">
            <span className="city-filters-label">
              <FaMapMarkerAlt /> Ciudades:
            </span>
            {preselectedCities.map((city, index) => {
              // Determinar si este chip está activo basado en el filtro actual
              const isActive =
                filters.ciudades?.some(
                  (c) => c.toLowerCase() === city.toLowerCase(),
                ) ||
                filters.zonas?.some(
                  (z) => z.toLowerCase() === city.toLowerCase(),
                );

              return (
                <span
                  key={`city-${index}-${city}`}
                  className={`city-chip ${isActive ? "active" : ""}`}
                  onClick={() => {
                    // Toggle la ciudad en el filtro apropiado
                    const normalizedCity = city.trim();
                    const updates = {};

                    if (
                      ["hoteles", "restaurantes", "guias", "endoses"].includes(
                        activeCategory,
                      )
                    ) {
                      const currentCiudades = filters.ciudades || [];
                      const cityLower = normalizedCity.toLowerCase();
                      const hasCity = currentCiudades.some(
                        (c) => c.toLowerCase() === cityLower,
                      );

                      if (hasCity) {
                        updates.ciudades = currentCiudades.filter(
                          (c) => c.toLowerCase() !== cityLower,
                        );
                      } else {
                        updates.ciudades = [...currentCiudades, normalizedCity];
                      }
                    }

                    if (["transportes", "trenes"].includes(activeCategory)) {
                      const currentZonas = filters.zonas || [];
                      const cityLower = normalizedCity.toLowerCase();
                      const hasZona = currentZonas.some(
                        (z) => z.toLowerCase() === cityLower,
                      );

                      if (hasZona) {
                        updates.zonas = currentZonas.filter(
                          (z) => z.toLowerCase() !== cityLower,
                        );
                      } else {
                        updates.zonas = [...currentZonas, normalizedCity];
                      }
                    }

                    if (Object.keys(updates).length > 0) {
                      updateFilters(updates);
                    }
                  }}
                  title={
                    isActive ? `Quitar filtro: ${city}` : `Filtrar por: ${city}`
                  }
                >
                  {city}
                  {isActive && (
                    <span
                      className="chip-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        const normalizedCity = city.trim().toLowerCase();
                        const updates = {};

                        if (filters.ciudades?.length > 0) {
                          updates.ciudades = filters.ciudades.filter(
                            (c) => c.toLowerCase() !== normalizedCity,
                          );
                        }
                        if (filters.zonas?.length > 0) {
                          updates.zonas = filters.zonas.filter(
                            (z) => z.toLowerCase() !== normalizedCity,
                          );
                        }

                        updateFilters(updates);
                      }}
                    >
                      <MdClose />
                    </span>
                  )}
                </span>
              );
            })}

            {/* Botón para limpiar todos los filtros de ciudad */}
            {(filters.ciudades?.length > 0 || filters.zonas?.length > 0) && (
              <button
                className="city-filter-clear-all"
                onClick={() => updateFilters({ ciudades: [], zonas: [] })}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {/* Contenedor Principal - Sin scroll general */}
        <div className="service-picker-scrollable-content">
          {/* Área Principal de Servicios */}
          <div className="services-main-area">
            <ServicePickerFilters
              key={activeCategory}
              category={activeCategory}
              parents={currentParentServices}
              services={currentChildServices}
              providerIds={providerIds}
              facets={catalogueFacetFilters}
              capacity={passengerCapacity}
              quotationPax={quotationPax}
              onProvidersChange={setProviderIds}
              onFacetsChange={setCatalogueFacetFilters}
              onCapacityChange={setPassengerCapacity}
              onReset={() => {
                setProviderIds([]);
                setCatalogueFacetFilters({});
                setPassengerCapacity(quotationPax);
                setChildSearchTerm("");
                clearFilters();
              }}
            />
            {/* Panel de Servicios Hijo + Tarifas */}
            <div className="child-services-section">
              <div className="section-header">
                <div className="section-title">
                  {currentCategory?.isStandalone
                    ? `${getServiceDisplayName(activeCategory)} con tarifas`
                    : hasActiveChildFilters && filteredChildServices.length > 0
                      ? "Resultados filtrados"
                      : currentCategory?.childName || "Opciones"}
                </div>
              </div>
              <div className="section-body">
                {(currentCategory?.hasChildren ||
                  currentCategory?.isStandalone) &&
                (filteredChildServices.length > 0 ||
                  hasActiveChildFilters ||
                  currentCategory?.isStandalone ||
                  (currentCategory?.hasChildren &&
                    childServices[`${activeCategory}_all`]?.length > 0)) ? (
                  <>
                    <ChildServicePanel
                      services={displayedChildServices}
                      parentService={null}
                      selectedParents={[]}
                      category={currentCategory}
                      activeCategory={activeCategory}
                      onSelectService={
                        activeCategory === "trenes"
                          ? handleTrainSelection
                          : handleServiceSelect
                      }
                      packageType={packageType}
                      peopleDetails={peopleDetails}
                      platform={platform}
                      parentServices={currentParentServices}
                      loading={
                        currentCategory?.isStandalone
                          ? loading[activeCategory]
                          : false
                      }
                      error={
                        currentCategory?.isStandalone
                          ? error[activeCategory]
                          : null
                      }
                      filterTariffType={filterTariffType}
                      tariffYear={tariffYear}
                      filters={filters}
                      debugSelectedParent={selectedParent}
                      childSearchTermProp={childSearchTerm}
                      passengerCapacity={passengerCapacity}
                      onBulkSelectComplete={onClose}
                    />
                  </>
                ) : (
                  <div className="empty-state-modern">
                    <div className="state-icon"></div>
                    <div className="state-title">
                      {currentCategory?.hasChildren
                        ? "Cargando opciones..."
                        : "Sin opciones adicionales"}
                    </div>
                    <div className="state-message">
                      {currentCategory?.hasChildren
                        ? "Las opciones se cargarán automáticamente."
                        : "Este servicio no tiene opciones adicionales."}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal de servicios extra con integracion DB */}
        {showExtraModal && (
          <ExtraServiceModal
            isOpen={showExtraModal}
            onClose={handleExtraModalClose}
            onSave={handleExtraServiceSave}
            packageType={packageType}
            peopleDetails={peopleDetails}
            platform={platform}
            tariffType={filterTariffType}
            tariffYear={tariffYear}
            agencyId={agencyId}
            fallbackAgencyId={agencyId}
            tieneFeeFilter={true}
          />
        )}
      </div>
    </div>
  );
};

export default ServicePicker;
