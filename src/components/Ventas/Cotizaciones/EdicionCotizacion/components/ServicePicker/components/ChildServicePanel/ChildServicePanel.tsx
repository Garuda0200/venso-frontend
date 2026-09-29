import React from "react";
import {
  FaBed,
  FaCar,
  FaTrain,
  FaPlane,
  FaRoute,
  FaSuitcase,
  FaTag,
  FaLanguage,
  FaSearch,
  FaPlus,
  FaUsers,
} from "react-icons/fa";
import {
  MdClose,
  MdSchedule,
  MdCalendarToday,
  MdLocationOn,
  MdRestaurant,
  MdPerson,
  MdMap,
} from "react-icons/md";
import { formatCurrency } from "../../../../../../../../utils/formatters";
import LoadingIndicator from "../../../../../../../UI/LoadingIndicator/LoadingIndicator";
import MessageDisplay from "../../../../../../../UI/MessageDisplay/MessageDisplay";
import ServiceDetailedInfo from "../../../DaysEditor/components/ServiceDetailedInfo/ServiceDetailedInfo";
import { AiOutlineSwapRight, AiOutlineSwap } from "react-icons/ai";
import {
  groupTicketsByEntrada,
  summarizeTicketGroup,
  getTicketProcedencia,
  getTicketTipoUsuario,
  normalizeTicketProcedencia,
  buildTicketProcedenciaPassengerSelection,
} from "../../../../utils/ticketBeneficiaries";
import {
  convertTarifaToDollars,
  convertToDollars,
} from "../../../../utils/tariffCurrency";
import "./ChildServicePanel.scss";

const normalizePanelId = (value) => {
  if (value === null || value === undefined) return null;
  return String(value).trim();
};

const addPanelComparableId = (set, value) => {
  const normalized = normalizePanelId(value);
  if (normalized) set.add(normalized);
};

const hasPanelComparableId = (set, value) => {
  const normalized = normalizePanelId(value);
  return Boolean(normalized && set.has(normalized));
};

/**
 * Función para identificar el padre de un servicio hijo basado en schema.rs
 */
const identifyParentService = async (
  childService,
  categoryId,
  parentServices = [],
) => {
  // Función auxiliar para comparar IDs con tipo flexible
  const compareId = (value, target) => {
    return (
      value === target ||
      Number(value) === Number(target) ||
      String(value) === String(target)
    );
  };

  // Esta función busca datos locales o retorna mínimos para standalone.
  let parentId = null;
  switch (categoryId) {
    case "transportes":
      parentId =
        childService.movilidad?.id_transporte || childService.id_transporte;
      break;
    case "hoteles":
      parentId = childService.habitacion?.id_hotel || childService.id_hotel;
      break;
    case "trenes":
      parentId =
        childService.vagones?.id_tren ||
        childService.vagon?.id_tren ||
        childService.id_tren;
      break;
    case "vuelos":
      parentId = childService.tipo_vuelo?.id_vuelo || childService.id_vuelo;
      break;
    case "guias":
      parentId = childService.ruta?.id_guia || childService.id_guia;
      break;
    case "endoses":
      parentId = childService.tour?.id_endose || childService.id_endose;
      break;
    case "restaurantes":
      return {
        id_restaurante:
          childService.restaurante?.id_restaurante ||
          childService.id_restaurante ||
          "standalone",
        nombre:
          childService.restaurante?.nombre ||
          childService.nombre ||
          "Restaurante",
        typeService: "restaurantes",
        isStandalone: true,
      };
    case "tickets":
      return {
        id_ticket:
          childService.ticket?.id_ticket ||
          childService.tickets?.id_ticket ||
          childService.id_ticket ||
          "standalone",
        entrada:
          childService.ticket?.entrada ||
          childService.tickets?.entrada ||
          childService.entrada ||
          "Ticket",
        typeService: "tickets",
        isStandalone: true,
      };
    default:
      console.warn(" No parent identification logic for category:", categoryId);
      return null;
  }

  if (!parentId) {
    console.warn(" No parent ID found for child service:", childService);
    return null;
  }

  // NUEVO: Buscar el padre completo en parentServices
  if (parentServices && parentServices.length > 0) {
    // Buscar por diferentes campos de ID según la categoría
    let foundParent = null;
    const parentKeys = {
      hoteles: ["id_hotel", "hotel_id", "id"],
      trenes: ["id_tren", "tren_id", "id"],
      transportes: ["id_transporte", "transporte_id", "id"],
      guias: ["id_guia", "guia_id", "id"],
      endoses: ["id_endose", "endose_id", "id"],
      vuelos: ["id_vuelo", "vuelo_id", "id"],
    };

    const keysToCheck = parentKeys[categoryId] || ["id"];

    for (const parent of parentServices) {
      for (const key of keysToCheck) {
        if (
          parent[key] !== null &&
          parent[key] !== undefined &&
          compareId(parent[key], parentId)
        ) {
          foundParent = { ...parent, typeService: categoryId };
          break;
        }
      }
      if (foundParent) break;
    }

    if (foundParent) {
      return foundParent;
    } else {
      console.warn(
        "[identifyParentService] No se encontró padre completo, usando fallback mínimo",
      );
    }
  }

  // Fallback: Solo retorna el id y tipo
  return {
    id: parentId,
    typeService: categoryId,
  };
};

/**
 * Component to display child services (rooms, wagons, etc.) matching ServiceSelector structure
 */
const ChildServicePanel = ({
  category,
  parentService,
  selectedParents = [], // NEW: multi-select array
  services = [],
  loading,
  error,
  filterTariffType,
  tariffYear = new Date().getFullYear(),
  onSelectService,
  packageType = "compartido",
  filters = {}, // Receive filters from UnifiedFilters system
  parentServices = [], // Array of parent services for complete parent lookup
  activeCategory = null,
  peopleDetails = null,
  platform = "venso",
  childSearchTermProp = "",
  passengerCapacity = 0,
  onBulkSelectComplete = null,
}) => {
  // IMPORTANTE: Todos los filtros y búsquedas operan SOLO sobre los arrays recibidos por props (services, parentServices)
  // Nunca se hacen subconsultas ni fetch externos aquí. El conjunto de servicios es el que se recibe al abrir el ServicePicker.

  // Local state for child-specific filters
  const [localFilters, setLocalFilters] = React.useState({});

  // Active filters are the combination of parent filters and local filters
  const activeFilters = React.useMemo(
    () => ({
      ...filters,
      ...localFilters,
    }),
    [filters, localFilters],
  );

  // Opciones de capacidad (nro_pasajeros) para el filtro dropdown en transportes
  // Calificación visual class helper
  const getCalificacionClass = (calificacion) => {
    if (!calificacion || typeof calificacion !== "object") return "";
    const valor = parseFloat(calificacion.valoracion || 0);
    if (isNaN(valor)) return "";
    if (valor <= 3) return "calif-baja";
    if (valor <= 7) return "calif-media";
    return "calif-alta";
  };

  // Clear local filters when parent changes or is selected
  React.useEffect(() => {
    setLocalFilters({});
  }, [parentService, filters]);

  // Category-specific filter functions
  const applyRoomFilters = React.useCallback((rooms, filters) => {
    let filtered = [...rooms];

    // Add categoria filter (inherited from parent)
    if (filters.categorias && filters.categorias.length > 0) {
      filtered = filtered.filter((room) => {
        // Child services inherit the categoria from parent
        let roomCategoria =
          room.categoria || (room.hotel && room.hotel.categoria);
        // Si no tiene categoria, pero hay parentService y category activa, asumimos la del padre
        if (!roomCategoria && filters.parentServiceCategoria) {
          roomCategoria = filters.parentServiceCategoria;
        }
        return filters.categorias.includes(roomCategoria);
      });
    }

    if (filters.tiposHabitacion && filters.tiposHabitacion.length > 0) {
      filtered = filtered.filter((room) =>
        filters.tiposHabitacion.includes(room.tipo_habitacion),
      );
    }

    if (filters.capacidades && filters.capacidades.length > 0) {
      filtered = filtered.filter((room) =>
        filters.capacidades.includes(room.capacidad),
      );
    }

    if (
      filters.rangoPrecio &&
      (filters.rangoPrecio.min || filters.rangoPrecio.max)
    ) {
      filtered = filtered.filter((room) => {
        // Use the same price extraction logic as useUnifiedFilters
        let precio = null;

        // Extract price from tarifas array (same as useUnifiedFilters)
        if (room.tarifas && room.tarifas.length > 0) {
          const tarifa = room.tarifas[0];
          precio = tarifa.precio_privado || tarifa.precio_compartido;
        }

        // Fallback to legacy tarifa_externa
        if (!precio) {
          precio = room.tarifa_externa || 0;
        }

        if (filters.rangoPrecio.min && precio < filters.rangoPrecio.min)
          return false;
        if (filters.rangoPrecio.max && precio > filters.rangoPrecio.max)
          return false;
        return true;
      });
    }

    return filtered;
  }, []);

  const applyVagonFilters = React.useCallback((wagons, filters) => {
    let filtered = [...wagons];

    // Add categoria filter (inherited from parent)
    if (filters.categorias && filters.categorias.length > 0) {
      filtered = filtered.filter((wagon) => {
        const wagonCategoria =
          wagon.categoria || (wagon.tren && wagon.tren.categoria);
        return filters.categorias.includes(wagonCategoria);
      });
    }

    if (filters.tiposVagon && filters.tiposVagon.length > 0) {
      filtered = filtered.filter((wagon) =>
        filters.tiposVagon.includes(wagon.tipo_vagon),
      );
    }

    if (filters.capacidades && filters.capacidades.length > 0) {
      filtered = filtered.filter((wagon) =>
        filters.capacidades.includes(wagon.capacidad),
      );
    }

    // Add price filter for wagons with tarifas
    if (
      filters.rangoPrecio &&
      (filters.rangoPrecio.min || filters.rangoPrecio.max)
    ) {
      filtered = filtered.filter((wagon) => {
        let precio = null;

        // Extract price from tarifas array (same logic as useUnifiedFilters)
        if (wagon.tarifas && wagon.tarifas.length > 0) {
          const tarifa = wagon.tarifas[0];
          precio = tarifa.precio_privado || tarifa.precio_compartido;
        }

        // Fallback to legacy tarifa_externa or other price fields
        if (!precio) {
          precio = wagon.tarifa_externa || wagon.precio || 0;
        }

        if (filters.rangoPrecio.min && precio < filters.rangoPrecio.min)
          return false;
        if (filters.rangoPrecio.max && precio > filters.rangoPrecio.max)
          return false;
        return true;
      });
    }

    return filtered;
  }, []);

  const applyFlightFilters = React.useCallback((flights, filters) => {
    let filtered = [...flights];

    // Add categoria filter (inherited from parent)
    if (filters.categorias && filters.categorias.length > 0) {
      filtered = filtered.filter((flight) => {
        const flightCategoria =
          flight.categoria || (flight.vuelo && flight.vuelo.categoria);
        return filters.categorias.includes(flightCategoria);
      });
    }

    if (filters.tiposVuelo && filters.tiposVuelo.length > 0) {
      filtered = filtered.filter((flight) =>
        filters.tiposVuelo.includes(flight.tipo_vuelo),
      );
    }

    if (filters.equipaje && filters.equipaje.length > 0) {
      filtered = filtered.filter((flight) =>
        filters.equipaje.includes(flight.equipaje_incluido),
      );
    }

    // Add price filter for flights with tarifas
    if (
      filters.rangoPrecio &&
      (filters.rangoPrecio.min || filters.rangoPrecio.max)
    ) {
      filtered = filtered.filter((flight) => {
        let precio = null;

        // Extract price from tarifas array (same logic as useUnifiedFilters)
        if (flight.tarifas && flight.tarifas.length > 0) {
          const tarifa = flight.tarifas[0];
          precio = tarifa.precio_privado || tarifa.precio_compartido;
        }

        // Fallback to legacy tarifa_externa or other price fields
        if (!precio) {
          precio = flight.tarifa_externa || flight.precio || 0;
        }

        if (filters.rangoPrecio.min && precio < filters.rangoPrecio.min)
          return false;
        if (filters.rangoPrecio.max && precio > filters.rangoPrecio.max)
          return false;
        return true;
      });
    }

    return filtered;
  }, []);

  const applyTransportFilters = React.useCallback((transports, filters) => {
    let filtered = [...transports];

    // Add categoria filter (inherited from parent)
    if (filters.categorias && filters.categorias.length > 0) {
      filtered = filtered.filter((transport) => {
        const transportCategoria =
          transport.categoria ||
          (transport.transporte && transport.transporte.categoria);
        return filters.categorias.includes(transportCategoria);
      });
    }

    if (filters.tiposVehiculo && filters.tiposVehiculo.length > 0) {
      filtered = filtered.filter((transport) =>
        filters.tiposVehiculo.includes(transports.tipo_vehiculo),
      );
    }

    // Filtro por rango de capacidad
    if (
      filters.rangoCapacidad &&
      (filters.rangoCapacidad.min || filters.rangoCapacidad.max)
    ) {
      filtered = filtered.filter((transport) => {
        const cap = parseInt(transport.nro_pasajeros);
        if (isNaN(cap)) return false;
        if (
          filters.rangoCapacidad.min !== null &&
          cap < filters.rangoCapacidad.min
        )
          return false;
        if (
          filters.rangoCapacidad.max !== null &&
          cap > filters.rangoCapacidad.max
        )
          return false;
        return true;
      });
    }

    // Add price filter for transports with tarifas
    if (
      filters.rangoPrecio &&
      (filters.rangoPrecio.min || filters.rangoPrecio.max)
    ) {
      filtered = filtered.filter((transport) => {
        let precio = null;

        // Extract price from tarifas array (same logic as useUnifiedFilters)
        if (transport.tarifas && transport.tarifas.length > 0) {
          const tarifa = transport.tarifas[0];
          precio = tarifa.precio_privado || tarifa.precio_compartido;
        }

        // Fallback to legacy tarifa_externa or other price fields
        if (!precio) {
          precio = transport.tarifa_externa || transport.precio || 0;
        }

        if (filters.rangoPrecio.min && precio < filters.rangoPrecio.min)
          return false;
        if (filters.rangoPrecio.max && precio > filters.rangoPrecio.max)
          return false;
        return true;
      });
    }

    return filtered;
  }, []);

  const applyTourFilters = React.useCallback((tours, filters) => {
    let filtered = [...tours];

    // Add categoria filter (inherited from parent)
    if (filters.categorias && filters.categorias.length > 0) {
      filtered = filtered.filter((tour) => {
        const tourCategoria =
          tour.categoria || (tour.endose && tour.endose.categoria);
        return filters.categorias.includes(tourCategoria);
      });
    }

    if (filters.idiomas && filters.idiomas.length > 0) {
      filtered = filtered.filter((tour) =>
        filters.idiomas.some(
          (idioma) => tour.idioma && tour.idioma.includes(idioma),
        ),
      );
    }

    // Add price filter for tours with tarifas
    if (
      filters.rangoPrecio &&
      (filters.rangoPrecio.min || filters.rangoPrecio.max)
    ) {
      filtered = filtered.filter((tour) => {
        let precio = null;

        // Extract price from tarifas array (same logic as useUnifiedFilters)
        if (tour.tarifas && tour.tarifas.length > 0) {
          const tarifa = tour.tarifas[0];
          precio = tarifa.precio_privado || tarifa.precio_compartido;
        }

        // Fallback to legacy tarifa_externa or other price fields
        if (!precio) {
          precio = tour.tarifa_externa || tour.precio || 0;
        }

        if (filters.rangoPrecio.min && precio < filters.rangoPrecio.min)
          return false;
        if (filters.rangoPrecio.max && precio > filters.rangoPrecio.max)
          return false;
        return true;
      });
    }

    return filtered;
  }, []);

  // Apply all filters to services (text search + category filters)
  const filteredServices = React.useMemo(() => {
    // Solo filtrar sobre el array recibido por props
    if (!services || services.length === 0) return [];

    let filtered = services; // Nunca modificar ni consultar fuera de este array

    // 1. DETERMINAR PADRES ACTIVOS (Soporte para multi-selección y selección simple legacy)
    const activeParents =
      selectedParents.length > 0
        ? selectedParents
        : parentService
          ? [parentService]
          : [];

    if (activeParents.length > 0) {
      // Build a set of parent IDs for fast lookup
      const parentIdSet = new Set();
      activeParents.forEach((p) => {
        if (p.isVirtualTour || String(p.id || "").startsWith("tour_")) {
          parentIdSet.add(String(p.id).toLowerCase());
          // También agregar por nombre normalizado como fallback
          const nameKey = (p.tour_nombre || p.nombre || "")
            .trim()
            .toLowerCase();
          if (nameKey) {
            parentIdSet.add(`tour_${nameKey}`);
            parentIdSet.add(nameKey);
          }
        } else {
          const id =
            category?.id === "guias"
              ? p.id_guia || p.guia?.id_guia || p.guia_id || p.id
              : p.id_hotel ||
                p.id_tren ||
                p.id_transporte ||
                p.id_guia ||
                p.id_endose ||
                p.endose_id ||
                p.id_vuelo ||
                p.id;
          addPanelComparableId(parentIdSet, id);
        }
      });

      filtered = filtered.filter((service) => {
        // Get the parent FK from the child service
        let childParentId;
        switch (category?.id) {
          case "hoteles":
            childParentId =
              service.hotel_id ||
              service.id_hotel ||
              service.habitacion?.id_hotel;
            break;
          case "trenes":
            childParentId =
              service.tren_id || service.id_tren || service.vagon?.id_tren;
            break;
          case "transportes":
            childParentId =
              service.transporte_id ||
              service.id_transporte ||
              service.movilidad?.id_transporte;
            break;
          case "guias":
            childParentId =
              service.id_guia || service.guia_id || service.ruta?.id_guia;
            break;
          case "endoses":
            childParentId =
              service.endose_id ||
              service.id_endose ||
              service.tour?.id_endose ||
              service.tour?.endose_id ||
              service.endose?.id_endose ||
              service.endose?.id;
            break;
          case "vuelos":
            childParentId =
              service.vuelo_id ||
              service.id_vuelo ||
              service.tipo_vuelo?.id_vuelo;
            break;
          default:
            childParentId = service.id;
        }

        const tName = (service.tour_nombre || service.ruta?.tour_nombre || "")
          .trim()
          .toLowerCase();

        return (
          (childParentId !== undefined &&
            childParentId !== null &&
            hasPanelComparableId(parentIdSet, childParentId)) ||
          (category?.id === "guias" &&
            platform === "venso" &&
            tName &&
            (parentIdSet.has(`tour_${tName}`) || parentIdSet.has(tName)))
        );
      });
    }

    // 2. NO FILTRAR POR TIPO DE TARIFA AQUÍ.
    // `useServicePickerCache` ya selecciona la tarifa comercial exacta y
    // conserva igualmente los servicios importados que todavía no tienen esa
    // tarifa. Filtrarlos otra vez volvería a vaciar el catálogo.

    // 3. APLICAR FILTROS ESPECÍFICOS DE CATEGORÍA
    switch (category?.id) {
      case "hoteles":
        filtered = applyRoomFilters(filtered, activeFilters);
        break;
      case "trenes":
        filtered = applyVagonFilters(filtered, activeFilters);
        break;
      case "vuelos":
        filtered = applyFlightFilters(filtered, activeFilters);
        break;
      case "transportes":
        filtered = applyTransportFilters(filtered, activeFilters);
        break;
      case "endoses":
        filtered = applyTourFilters(filtered, activeFilters);
        break;
      default:
        break;
    }

    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    services,
    category?.id,
    selectedParents,
    parentService,
    platform,
    filterTariffType,
    activeFilters,
    applyRoomFilters,
    applyVagonFilters,
    applyFlightFilters,
    applyTransportFilters,
    applyTourFilters,
  ]);

  // Filtro de búsqueda desde el header + capacidad de pasajeros
  const searchFilteredServices = React.useMemo(() => {
    let result = filteredServices;

    // Filtro de capacidad (nro_pasajeros) para transportes — capacidad mínima
    // suficiente, ordenadas de menor a mayor para mostrar primero la superior
    // más cercana (ej: 3 pax -> 4 pax; 5 pax -> 13 pax).
    if (passengerCapacity > 0 && category?.id === "transportes") {
      result = result
        .filter((s) => {
          const sCap = parseInt(s.nro_pasajeros || s.movilidad?.nro_pasajeros);
          return !isNaN(sCap) && sCap >= passengerCapacity;
        })
        .sort((a, b) => {
          const capA =
            parseInt(a.nro_pasajeros || a.movilidad?.nro_pasajeros) || 0;
          const capB =
            parseInt(b.nro_pasajeros || b.movilidad?.nro_pasajeros) || 0;
          return capA - capB;
        });
    }

    if (!childSearchTermProp || !childSearchTermProp.trim()) return result;
    const normalizedSearch = childSearchTermProp
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const terms = normalizedSearch.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return result;

    return result.filter((service) => {
      const searchableFields = [
        service.nombre,
        service.tipo_habitacion,
        service.tipohabitacion,
        service.tipo_auto,
        service.tipo_tren,
        service.tipovuelo,
        service.tour_nombre,
        service.tipo_guiado,
        service.idioma,
        service.entrada,
        service.estado,
        service.descripcion,
        service.ruta,
        service.lugar_salida,
        service.lugar_destino,
        service.equipaje,
        service.detalles,
        service.observaciones,
        service.nro_placa,
        service.serv_add,
        service.direccion,
        service.tipo_servicio,
        service.tipo_cocina,
        service.tipo_ticket,
        service.lugar,
        // Campos anidados
        service.habitacion?.tipo_habitacion,
        service.habitacion?.tipohabitacion,
        service.habitacion?.estado,
        service.movilidad?.tipo_auto,
        service.movilidad?.ruta,
        service.movilidad?.estado,
        service.movilidad?.nro_placa,
        service.vagon?.tipo_tren,
        service.vagon?.lugar_salida,
        service.vagon?.lugar_destino,
        service.vagon?.serv_add,
        service.tipo_vuelo?.tipovuelo,
        service.tipo_vuelo?.equipaje,
        service.tipo_vuelo?.detalles,
        service.ruta_obj?.tour_nombre,
        service.ruta_obj?.observaciones,
        service.tour?.tipo_guiado,
        service.tour?.idioma,
        service.tour?.observaciones,
        // Restaurantes
        service.restaurante?.nombre,
        service.restaurante?.direccion,
        service.restaurante?.tipo_servicio,
        service.restaurante?.tipo_cocina,
        service.restaurante?.descripcion,
        // Tickets
        service.ticket?.nombre,
        service.ticket?.tipo_ticket,
        service.ticket?.lugar,
        service.ticket?.entrada,
        service.ticket?.descripcion,
        // Tarifas: tipo y moneda
        ...(service.tarifas || []).flatMap((t) => [t.tipo_tarifa, t.moneda]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      return terms.every((term) => searchableFields.includes(term));
    });
  }, [filteredServices, childSearchTermProp, passengerCapacity, category?.id]);

  // Helper function to get train route from services (vagones)
  const getTrainRoute = React.useCallback(() => {
    if (!services || services.length === 0) return null;

    // Get lugar_salida and lugar_destino from first available wagon
    const firstServiceWithRoute = services.find(
      (s) => s.lugar_salida && s.lugar_destino,
    );
    if (firstServiceWithRoute) {
      return `${firstServiceWithRoute.lugar_salida} → ${firstServiceWithRoute.lugar_destino}`;
    }

    // Try to get from nested vagon structure
    const firstServiceWithNestedRoute = services.find(
      (s) => s.vagon?.lugar_salida && s.vagon?.lugar_destino,
    );
    if (firstServiceWithNestedRoute) {
      return `${firstServiceWithNestedRoute.vagon.lugar_salida} → ${firstServiceWithNestedRoute.vagon.lugar_destino}`;
    }

    return null;
  }, [services]);

  const getParentServiceName = (parentService, categoryId) => {
    if (!parentService) return "Servicio no seleccionado";
    switch (categoryId) {
      case "hoteles":
        return parentService.nombre || "Hotel sin nombre";
      case "transportes":
        return (
          parentService.nombre_transporte ||
          parentService.nombre ||
          "Transporte sin nombre"
        );
      case "trenes": {
        const empresaNombre =
          parentService.nombre_empresa || parentService.nombre || "Tren";
        const ruta = getTrainRoute();
        return ruta ? `${empresaNombre} - ${ruta}` : empresaNombre;
      }
      case "vuelos":
        // SCHEMA ACTUALIZADO: vuelo tiene nombre, procedencia (no aerolinea)
        return (
          parentService.nombre || parentService.aerolinea || "Vuelo sin nombre"
        );
      case "guias": {
        // Soportar estructura {guia, persona}
        let nombre = "";
        let apellido = "";
        let idioma = "";
        if (parentService.guia && parentService.persona) {
          nombre = parentService.persona.nombres || "";
          apellido = parentService.persona.apellidos || "";
          idioma = Array.isArray(parentService.guia.idioma)
            ? parentService.guia.idioma.join(", ")
            : parentService.guia.idioma || "";
        } else {
          nombre = parentService.nombres || parentService.nombre || "";
          apellido = parentService.apellidos || "";
          idioma = Array.isArray(parentService.idioma)
            ? parentService.idioma.join(", ")
            : parentService.idioma || "";
        }
        let info = `${nombre} ${apellido}`.trim();
        if (idioma) info += ` (${idioma})`;
        return info || "Guía sin nombre";
      }
      case "endoses":
        return (
          parentService.nombre_agencia ||
          parentService.nombre ||
          "Endose sin nombre"
        );
      default:
        return parentService.nombre || "Servicio sin nombre";
    }
  };

  const getChildIcon = (categoryId) => {
    switch (categoryId) {
      case "hoteles":
        return <FaBed />;
      case "transportes":
        return <FaCar />;
      case "trenes":
        return <FaTrain />;
      case "vuelos":
        return <FaPlane />;
      case "guias":
        return <FaRoute />;
      case "endoses":
        return <FaSuitcase />;
      default:
        return <FaTag />;
    }
  };

  /**
   * Formatea el precio SIEMPRE en dólares
   * Si la tarifa original está en soles, convierte a dólares usando tasa_cambio
   * Retorna objeto con precio formateado e indicador de conversión
   */
  const formatPrice = (price, currency = "dolares", tasaCambio = null) => {
    if (!price) {
      return "$0.00";
    }
    // Convertir a dólares si está en soles
    const priceInDollars = convertToDollars(price, currency, tasaCambio);
    return formatCurrency(priceInDollars, "dolares");
  };

  /**
   * Verifica si una tarifa fue convertida de soles a dólares
   */
  const isConvertedFromSoles = (currency) => {
    return currency === "soles";
  };

  // Helper functions to extract service details based on category
  const getRoomType = (room) => {
    return (
      room.tipo_habitacion ||
      room.tipohabitacion ||
      (room.habitacion &&
        (room.habitacion.tipo_habitacion || room.habitacion.tipohabitacion)) ||
      "Estándar"
    );
  };

  const getWagonType = (wagon) => {
    let wagonType =
      wagon.tipo_tren ||
      wagon.tipo_vagon ||
      (wagon.vagon && (wagon.vagon.tipo_tren || wagon.vagon.tipo_vagon)) ||
      "Estándar";

    // Limpiar cualquier ID numérico o "ID" del string para diseño minimalista
    wagonType = wagonType.replace(/\s*#\d+\s*/g, ""); // Remover #123
    wagonType = wagonType.replace(/\s*id[:\s]*\d+\s*/gi, ""); // Remover "id: 123" o "id 123"
    wagonType = wagonType.replace(/\(\d+\)/g, ""); // Remover (123)
    wagonType = wagonType.replace(/\s*-\s*\d+\s*$/g, ""); // Remover " - 5" al final
    wagonType = wagonType.replace(/\s+\d+\s*$/g, ""); // Remover " 5" al final (trailing number)

    return wagonType.trim();
  };

  /**
   * Obtener la ruta de un vagón individual (lugar_salida → lugar_destino)
   */
  const getWagonRoute = (wagon) => {
    const lugarSalida = wagon.lugar_salida || wagon.vagon?.lugar_salida;
    const lugarDestino = wagon.lugar_destino || wagon.vagon?.lugar_destino;

    if (lugarSalida && lugarDestino) {
      return `${lugarSalida} → ${lugarDestino}`;
    }
    return null;
  };

  const getWagonBimodal = (wagon) => {
    const rawValue = wagon.es_bimodal ?? wagon.vagon?.es_bimodal;
    const normalizedValue =
      typeof rawValue === "string" ? rawValue.trim().toLowerCase() : rawValue;
    const isBimodal =
      normalizedValue === true ||
      normalizedValue === 1 ||
      normalizedValue === "1" ||
      normalizedValue === "true" ||
      normalizedValue === "si" ||
      normalizedValue === "sí";

    return isBimodal ? "Bimodal" : "No bimodal";
  };

  const getWagonInfo = (wagon) => {
    const horaSalida = wagon.hora_salida || wagon.vagon?.hora_salida;
    const horaLlegada = wagon.hora_llegada || wagon.vagon?.hora_llegada;
    return {
      horarios:
        horaSalida && horaLlegada ? `${horaSalida} - ${horaLlegada}` : null,
    };
  };

  /**
   * Obtener información adicional de una habitación (estado, temporada)
   */
  const getRoomInfo = (room, tarifas = []) => {
    // Estado de la habitación
    const estado = room.estado || room.habitacion?.estado;

    // Temporada de la primera tarifa disponible
    const temporada = tarifas.length > 0 ? tarifas[0].temporada : null;

    // Capacidad (puede no existir en la BD)
    const capacidad = room.capacidad || room.habitacion?.capacidad;

    // Tipo de desayuno (puede no existir en la BD)
    const tipoDesayuno = room.tipo_desayuno || room.habitacion?.tipo_desayuno;

    return {
      estado: estado || null,
      temporada: temporada || null,
      capacidad: capacidad ? `${capacidad} personas` : null,
      desayuno: tipoDesayuno || null,
    };
  };

  /**
   * Obtener información adicional de un transporte/movilidad
   */
  const getTransportInfo = (vehicle, tarifas = []) => {
    const capacidad = vehicle.nro_pasajeros || vehicle.movilidad?.nro_pasajeros;
    const placa = vehicle.nro_placa || vehicle.movilidad?.nro_placa;
    const ruta = vehicle.ruta || vehicle.movilidad?.ruta;
    const estado = vehicle.estado || vehicle.movilidad?.estado;

    // Temporada de la tarifa
    const temporada = tarifas.length > 0 ? tarifas[0].temporada : null;

    return {
      capacidad: capacidad ? `${capacidad} pasajeros` : null,
      placa: placa || null,
      ruta: ruta || null,
      estado: estado || null,
      temporada: temporada || null,
    };
  };

  /**
   * Obtener la ruta de un vuelo (lugar_ida → lugar_vuelta) - ACTUALIZADO para nuevo schema
   * tipo_vuelo ahora tiene: lugar_ida, lugar_vuelta, hora_salida, hora_llegada
   */
  const getFlightRoute = (flight) => {
    // lugar_ida y lugar_vuelta ahora están en tipo_vuelo, no en vuelo
    const origen = flight.lugar_ida || flight.tipo_vuelo?.lugar_ida;
    const destino = flight.lugar_vuelta || flight.tipo_vuelo?.lugar_vuelta;

    if (origen && destino) {
      return `${origen} → ${destino}`;
    }
    return null;
  };

  /**
   * Obtener información adicional de un vuelo - ACTUALIZADO para nuevo schema
   * tipo_vuelo tiene: tipovuelo, equipaje, detalles, estado, hora_salida, hora_llegada
   */
  const getFlightInfo = (flight) => {
    const tipovuelo = flight.tipovuelo || flight.tipo_vuelo?.tipovuelo;
    const equipaje = flight.equipaje || flight.tipo_vuelo?.equipaje;
    const horaSalida = flight.hora_salida || flight.tipo_vuelo?.hora_salida;
    const horaLlegada = flight.hora_llegada || flight.tipo_vuelo?.hora_llegada;
    const estado = flight.estado || flight.tipo_vuelo?.estado;

    return {
      tipovuelo: tipovuelo || null,
      equipaje: equipaje || null,
      horarios:
        horaSalida && horaLlegada ? `${horaSalida} - ${horaLlegada}` : null,
      estado: estado || null,
    };
  };

  /**
   * Obtener información adicional de una ruta de guía
   * Nota: base puede ser el objeto 'ruta' directamente o el service completo
   */
  const getGuideRouteInfo = (guide, tarifas = []) => {
    // Buscar idioma - puede estar en guide directamente (si base=ruta) o en guide.ruta
    const idioma = guide.idioma || guide.ruta?.idioma;

    // Buscar viáticos
    const viaticos = guide.viaticos || guide.ruta?.viaticos;
    const costoViaticos = guide.costo_viaticos || guide.ruta?.costo_viaticos;

    // Estado de la ruta
    const estado = guide.estado || guide.ruta?.estado;

    // Temporada de la tarifa
    const temporada = tarifas.length > 0 ? tarifas[0].temporada : null;

    // Formatear idioma si es un array
    const idiomaFormatted = Array.isArray(idioma) ? idioma.join(", ") : idioma;

    return {
      idioma: idiomaFormatted || null,
      viaticos: viaticos ? "Incluye viáticos" : null,
      costoViaticos: costoViaticos ? `$${costoViaticos}` : null,
      estado: estado || null,
      temporada: temporada || null,
    };
  };

  /**
   * Obtener información adicional de un tour (endose)
   * Nota: base puede ser el objeto 'tour' directamente o el service completo
   * Según schema.rs, tour tiene: id_tipotour, id_endose, tipo_guiado, idioma, estado, observaciones
   */
  const getTourInfo = (tour, tarifas = []) => {
    // Buscar en tour directamente (si base=tour) o en tour.tour
    const tipoGuiado = tour.tipo_guiado || tour.tour?.tipo_guiado;
    const idioma = tour.idioma || tour.tour?.idioma;
    const observaciones = tour.observaciones || tour.tour?.observaciones;
    const capacidadRaw = tour.capacidad ?? tour.tour?.capacidad;
    const capacidad = Number(capacidadRaw || 0);

    // Estado del tour
    const estado = tour.estado || tour.tour?.estado;

    // Temporada de la tarifa
    const temporada = tarifas.length > 0 ? tarifas[0].temporada : null;

    // Formatear idioma si es un array
    const idiomaFormatted = Array.isArray(idioma) ? idioma.join(", ") : idioma;

    return {
      tipoGuiado: tipoGuiado || null,
      idioma: idiomaFormatted || null,
      observaciones: observaciones || null,
      capacidad: capacidad >= 1 ? capacidad : null,
      estado: estado || null,
      temporada: temporada || null,
    };
  };

  /**
   * Obtener información adicional de un restaurante
   */
  const getRestaurantInfo = (restaurant) => {
    const direccion = restaurant.direccion || restaurant.restaurante?.direccion;
    const tipoServicio =
      restaurant.tipo_servicio || restaurant.restaurante?.tipo_servicio;
    const tipoCocina =
      restaurant.tipo_cocina || restaurant.restaurante?.tipo_cocina;

    return {
      direccion: direccion || null,
      tipoServicio: tipoServicio || null,
      tipoCocina: tipoCocina || null,
    };
  };

  /**
   * Obtener información adicional de un ticket
   */
  const getTicketInfo = (ticket) => {
    const procedencia =
      ticket.procedencia ||
      ticket.ticket?.procedencia ||
      ticket.tickets?.procedencia;
    const tipoUsuario =
      ticket.tipo_usuario ||
      ticket.ticket?.tipo_usuario ||
      ticket.tickets?.tipo_usuario;

    return {
      procedencia: procedencia || null,
      tipoUsuario: tipoUsuario || null,
    };
  };

  const getVehicleType = (vehicle) => {
    return (
      vehicle.tipo_auto ||
      vehicle.tipo_vehiculo ||
      (vehicle.movilidad &&
        (vehicle.movilidad.tipo_auto || vehicle.movilidad.tipo_vehiculo)) ||
      "Vehículo estándar"
    );
  };

  const getVehicleRoute = (vehicle) => {
    return (
      vehicle.ruta ||
      (vehicle.movilidad && vehicle.movilidad.ruta) ||
      "Ruta no especificada"
    );
  };

  // Buscar el endose padre para un child tour usando parentServices
  const findEndoseParentForChild = (service) => {
    if (!Array.isArray(parentServices) || parentServices.length === 0)
      return null;

    const childEndoseId = service.tour?.id_endose || service.id_endose;

    if (!childEndoseId) return null;

    const normalize = (v) => (v != null ? String(v) : null);

    return parentServices.find((parent) => {
      const parentId = parent.id_endose || parent.endose_id || parent.id;

      return normalize(parentId) === normalize(childEndoseId);
    });
  };

  const getServiceName = (service, categoryId, parentService) => {
    switch (categoryId) {
      case "hoteles":
        return `Habitación ${getRoomType(service)}`;
      case "transportes":
        // Simplificado: Solo tipo de vehículo y ruta (capacidad y estado van en badges)
        return `${getVehicleType(service)} - ${getVehicleRoute(service)}`;
      case "trenes":
        return `Vagón ${getWagonType(service)}`;
      case "vuelos":
        return (
          service.tipovuelo || service.tipo || service.clase || "Tipo de vuelo"
        );
      case "guias":
        // Corregir acceso a la estructura anidada de rutas
        return (
          service.ruta?.tour_nombre ||
          service.tour_nombre ||
          service.nombre ||
          "Ruta no especificada"
        );
      case "endoses":
        // CORREGIDO: Usar campos de schema.rs para tour
        // tour tiene: id_tipotour, id_endose, tipo_guiado, idioma, estado, observaciones
        if (!parentService) {
          // Intentar encontrar el endose padre en parentServices
          const foundParent = findEndoseParentForChild(service);
          parentService = foundParent;
        }
        // El tipo_guiado viene del tour (hijo), tipo_tour viene del endose (padre)
        const tipoGuiado =
          service.tour?.tipo_guiado || service.tipo_guiado || "Tour";
        const idiomaStr =
          service.tour?.idioma || service.idioma || "Sin idioma";
        // Mostrar tipo_tour del padre (opcional) + tipo_guiado del tour
        const tipoTourPadre = parentService?.tipo_tour;
        return tipoTourPadre
          ? `${tipoTourPadre} - ${tipoGuiado} (${idiomaStr})`
          : `${tipoGuiado} (${idiomaStr})`;
      case "restaurantes":
        // Para servicios independientes, mostrar el nombre del restaurante + tipo de tarifa
        return (
          service.restaurante?.nombre ||
          service.nombre ||
          `Restaurante - Tarifa ${service.tipo_tarifa || "Estándar"}`
        );
      case "tickets":
        // Para servicios independientes, mostrar el nombre del ticket + tipo de tarifa
        return (
          service.ticket?.entrada ||
          service.tickets?.entrada ||
          service.entrada ||
          `Ticket - Tarifa ${service.tipo_tarifa || "Estándar"}`
        );
      default:
        return service.nombre || "Servicio";
    }
  };

  // Ordenar: primero por calificación desc, luego por antigüedad asc (más antiguo primero)
  // Para transportes con múltiples padres: también agrupar por proveedor
  const sortedForGrouping = React.useMemo(() => {
    const getCalifValor = (s) => {
      // Check nested parent objects for calificacion
      const childKeys = [
        "habitacion",
        "vagon",
        "ticket",
        "restaurante",
        "tipo_vuelo",
        "movilidad",
        "ruta",
        "tour",
      ];
      const childObj = childKeys.map((k) => s[k]).find((v) => v);
      const base = childObj || s;
      const calif = base.calificacion || s.calificacion || s.guia?.calificacion;
      if (!calif || typeof calif !== "object") return -1;
      const v = parseFloat(calif.valoracion);
      return isNaN(v) ? -1 : v;
    };
    const getDate = (s) => {
      // Prioritize tarifa creation date, then service dates
      const tarifas = s.tarifas || [];
      const tarifaDate =
        tarifas.length > 0
          ? tarifas[0].created_at || tarifas[0].fecha_creacion
          : null;
      const d =
        tarifaDate ||
        s.created_at ||
        s.fecha_creacion ||
        s.updated_at ||
        s.fecha_actualizacion;
      return d ? new Date(d).getTime() : 0;
    };
    const getId = (s) => {
      const id =
        s.id ||
        s.id_habitacion ||
        s.id_movilidad ||
        s.id_vagon ||
        s.id_tipo_vuelo ||
        s.id_ruta ||
        s.id_tour ||
        s.id_ticket ||
        0;
      return typeof id === "number" ? id : parseInt(id) || 0;
    };

    const sorted = [...(searchFilteredServices || [])].sort((a, b) => {
      // 1) Rating desc (highest first)
      const califA = getCalifValor(a);
      const califB = getCalifValor(b);
      if (califB !== califA) return califB - califA;
      // 2) Date asc (oldest first) - prioritize tarifa date
      const dateA = getDate(a);
      const dateB = getDate(b);
      if (dateA !== dateB) return dateA - dateB;
      // 3) ID asc (oldest/lowest ID first)
      return getId(a) - getId(b);
    });

    const isVensoGuias = category?.id === "guias" && platform === "venso";
    if (
      !isVensoGuias &&
      (category?.id !== "transportes" || selectedParents.length <= 1)
    )
      return sorted;

    // Stable sort by group key
    const getGroupKey = (s) => {
      if (category?.id === "guias")
        return s.tour_nombre || s.ruta?.tour_nombre || "";
      return (
        s.transporte_id || s.id_transporte || s.movilidad?.id_transporte || ""
      );
    };
    return sorted.sort((a, b) => {
      const ga = getGroupKey(a);
      const gb = getGroupKey(b);
      return String(ga).localeCompare(String(gb));
    });
  }, [searchFilteredServices, category?.id, selectedParents.length]);


  const ticketEntryGroups = React.useMemo(() => {
    if (category?.id !== "tickets") return [];
    return groupTicketsByEntrada(searchFilteredServices || []);
  }, [category?.id, searchFilteredServices]);

  const getTicketDisplayPrice = React.useCallback(
    (item) => {
      const allTarifas = item.tarifas || item.ticket?.tarifas || [];
      const currentFilterTariffType =
        filterTariffType ||
        (platform === "venso" ? "externa" : platform === "mil" ? "interna" : null);
      const tarifa = currentFilterTariffType
        ? allTarifas.find(
            (t) => String(t.tipo_tarifa).toLowerCase() === currentFilterTariffType,
          )
        : allTarifas[0];
      if (!tarifa) return null;
      const converted = convertTarifaToDollars(tarifa);
      const price =
        packageType === "privado"
          ? converted.precio_privado || converted.precio_compartido
          : converted.precio_compartido || converted.precio_privado;
      return {
        price,
        tarifa,
        converted,
      };
    },
    [filterTariffType, packageType, platform],
  );

  const handleTicketEntryGroupClick = React.useCallback(
    async (group) => {
      const currentFilterTariffType =
        filterTariffType ||
        (platform === "venso" ? "externa" : platform === "mil" ? "interna" : null);

      const pickTariff = (item, preferredType = currentFilterTariffType) => {
        const allTarifas = item.tarifas || item.ticket?.tarifas || [];
        if (!allTarifas.length) return null;
        return preferredType
          ? allTarifas.find(
              (t) => String(t.tipo_tarifa || "").toLowerCase() === preferredType,
            ) || null
          : allTarifas[0];
      };

      const getPriceFromConvertedTariff = (tarifaEnDolares) => {
        if (!tarifaEnDolares) return 0;
        return packageType === "privado"
          ? tarifaEnDolares.precio_privado || tarifaEnDolares.precio_compartido
          : tarifaEnDolares.precio_compartido || tarifaEnDolares.precio_privado;
      };

      const buildRateInfo = (item) => {
        if (!item) return null;
        const tarifa = pickTariff(item);
        if (!tarifa) return null;
        const tarifaEnDolares = convertTarifaToDollars(tarifa);
        const precio = getPriceFromConvertedTariff(tarifaEnDolares);
        const tarifaInterna = pickTariff(item, "interna");
        const tarifaInternaEnDolares = tarifaInterna
          ? convertTarifaToDollars(tarifaInterna)
          : null;
        const precioInterno = tarifaInternaEnDolares
          ? getPriceFromConvertedTariff(tarifaInternaEnDolares)
          : null;

        return {
          item,
          tarifa,
          tarifaEnDolares,
          precio,
          precioInterno,
          rate: {
            ...item,
            precio,
            tarifa: tarifaEnDolares,
            edad_estudiante_min:
              item.edad_estudiante_min ?? item.ticket?.edad_estudiante_min ?? null,
            edad_estudiante_max:
              item.edad_estudiante_max ?? item.ticket?.edad_estudiante_max ?? null,
          },
        };
      };

      const groupedByProcedencia = (group.items || []).reduce((acc, item) => {
        const procedencia = normalizeTicketProcedencia(getTicketProcedencia(item));
        if (!procedencia) return acc;
        const tipoUsuario = String(getTicketTipoUsuario(item) || "").toLowerCase();
        if (!acc[procedencia]) acc[procedencia] = { adult: null, child: null };
        if (
          tipoUsuario.includes("estudiante") ||
          tipoUsuario.includes("niño") ||
          tipoUsuario.includes("nino") ||
          tipoUsuario.includes("child")
        ) {
          acc[procedencia].child = item;
        } else {
          acc[procedencia].adult = item;
        }
        return acc;
      }, {});

      let selectedCount = 0;
      const selectTicketVariant = async ({ item, rateInfo, targetGroup, procedencia, childRateInfo = null }) => {
        if (!item || !rateInfo || !Number(rateInfo.precio)) return false;

        const isChildTarget = targetGroup === "child";
        const hasStudentTariff = Boolean(childRateInfo && Number(childRateInfo.precio));
        const freeChildRate = {
          ...(rateInfo.rate || {}),
          precio: 0,
          tipo_usuario: "gratis",
        };
        const groupedChildService = {
          ...(item || {}),
          entrada: group.entrada,
          ticketEntryGroup: group.entrada,
          ticketEntrada: group.entrada,
          procedencia,
          ticketProcedenciaGroup: procedencia,
          tipo_usuario: isChildTarget ? "estudiante" : "adulto",
          ticketTipoUsuarioGroup: isChildTarget ? "estudiante" : "adulto",
          ticketPassengerTargetGroup: targetGroup,
          ticketTargetGroup: targetGroup,
          ticketAdultRate: isChildTarget ? childRateInfo?.rate || rateInfo.rate : rateInfo.rate,
          ticketChildRate: isChildTarget ? null : hasStudentTariff ? null : freeChildRate,
          ticketTarifasByUserType: {
            adult: isChildTarget ? childRateInfo?.rate || rateInfo.rate : rateInfo.rate,
            child: childRateInfo?.rate || null,
          },
          ticketAdultUnitPrice: Number(rateInfo.precio) || 0,
          ticketChildUnitPrice: isChildTarget
            ? 0
            : hasStudentTariff
              ? 0
              : 0,
          ticketChildPricingMode: isChildTarget
            ? "student_tariff"
            : hasStudentTariff
              ? "none"
              : "manual",
          ticketChildrenUseStudentTariffAsAdult: isChildTarget,
          packageType,
        };

        const resolvedPassengerSelection = buildTicketProcedenciaPassengerSelection({
          childService: groupedChildService,
          peopleDetails,
        });
        if (
          resolvedPassengerSelection?.ticketProcedenciaFilter &&
          (resolvedPassengerSelection?.selectedIds || []).length === 0
        ) {
          return false;
        }

        const actualParent = await identifyParentService(
          item,
          "tickets",
          parentServices,
        );
        await onSelectService(
          groupedChildService,
          actualParent,
          {
            ...rateInfo.tarifaEnDolares,
            selectedPackageType: packageType,
            precio: Number(rateInfo.precio) || 0,
            precio_interno: rateInfo.precioInterno,
          },
          { closeAfterSelect: false, source: "ticket-entry-group" },
        );
        return true;
      };

      for (const procedencia of ["nacional", "extranjero"]) {
        const entry = groupedByProcedencia[procedencia];
        if (!entry) continue;

        const adultInfo = buildRateInfo(entry.adult);
        const childInfo = buildRateInfo(entry.child);

        if (adultInfo && Number(adultInfo.precio)) {
          const addedAdult = await selectTicketVariant({
            item: adultInfo.item,
            rateInfo: adultInfo,
            targetGroup: childInfo ? "adult" : "all",
            procedencia,
            childRateInfo: childInfo,
          });
          if (addedAdult) selectedCount += 1;
        }

        if (childInfo && Number(childInfo.precio)) {
          const addedChild = await selectTicketVariant({
            item: childInfo.item,
            rateInfo: childInfo,
            targetGroup: "child",
            procedencia,
            childRateInfo: childInfo,
          });
          if (addedChild) selectedCount += 1;
        }
      }

      if (selectedCount > 0) {
        onBulkSelectComplete?.();
      } else {
        alert("La entrada seleccionada no tiene beneficiarios/tarifas disponibles para la distribución actual.");
      }
    },
    [filterTariffType, onBulkSelectComplete, onSelectService, packageType, parentServices, peopleDetails, platform],
  );

  // Mapeo de parentId → nombre para separadores de grupo
  const parentNameMap = React.useMemo(() => {
    if (category?.id !== "transportes" || selectedParents.length <= 1)
      return {};
    const map = {};
    (selectedParents || []).forEach((p) => {
      const id = p.id_transporte || p.id;
      if (id != null) map[String(id)] = getParentServiceName(p, "transportes");
    });
    return map;
  }, [selectedParents, category?.id]);

  if (loading) {
    return (
      <div className="child-service-panel">
        <div className="panel-header">
          <h4>Cargando servicios...</h4>
        </div>
        <LoadingIndicator message="Cargando servicios..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="child-service-panel">
        <div className="panel-header">
          <h4>Error</h4>
        </div>
        <MessageDisplay type="error" message={error} />
      </div>
    );
  }

  if (category?.id === "tickets") {
    return (
      <div className="child-service-panel child-service-panel--tickets-grouped">
        <div className="panel-header">
          <div className="header-content">
            <h4>Entradas agrupadas</h4>
            <div className="parent-name">
              Selecciona una entrada para agregar automáticamente sus tarifas por procedencia y tipo de pasajero.
            </div>
          </div>
          <div className="header-controls">
            <div className="service-count">
              {ticketEntryGroups.length} entradas · {searchFilteredServices?.length || 0} tarifas
            </div>
          </div>
        </div>

        <div className="services-list ticket-entry-list">
          {ticketEntryGroups.length > 0 ? (
            ticketEntryGroups.map((group) => {
              const counters = summarizeTicketGroup(group);
              const priceItems = (group.items || [])
                .map((item) => ({ item, priceInfo: getTicketDisplayPrice(item) }))
                .filter(({ priceInfo }) => priceInfo && Number(priceInfo.price) > 0);
              const minPrice = priceItems.length
                ? Math.min(...priceItems.map(({ priceInfo }) => Number(priceInfo.price)))
                : 0;
              const maxPrice = priceItems.length
                ? Math.max(...priceItems.map(({ priceInfo }) => Number(priceInfo.price)))
                : 0;

              return (
                <div
                  key={group.key}
                  className="ticket-entry-card"
                  onClick={() => handleTicketEntryGroupClick(group)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleTicketEntryGroupClick(group);
                    }
                  }}
                >
                  <div className="ticket-entry-card__main">
                    <div className="ticket-entry-card__eyebrow">
                      Entrada · {group.anio || new Date().getFullYear()}
                      {Array.isArray(group.agencyIds) && group.agencyIds.length > 0
                        ? ` · ${group.agencyIds.length} ag.`
                        : ""}
                    </div>
                    <h5>{group.entrada}</h5>
                    <div className="ticket-entry-card__chips">
                      {counters.nacionalAdulto > 0 && <span>Nacional adulto</span>}
                      {counters.nacionalChild > 0 && <span>Nacional niño/estudiante</span>}
                      {counters.extranjeroAdulto > 0 && <span>Extranjero adulto</span>}
                      {counters.extranjeroChild > 0 && <span>Extranjero niño/estudiante</span>}
                    </div>
                  </div>
                  <div className="ticket-entry-card__tariffs">
                    {(group.items || []).map((item) => {
                      const procedencia = normalizeTicketProcedencia(getTicketProcedencia(item));
                      const tipoUsuario = getTicketTipoUsuario(item);
                      const priceInfo = getTicketDisplayPrice(item);
                      return (
                        <span
                          key={`${item.id_ticket || item.ticket?.id_ticket || item.id}-${item._tariff_variant_key || item.tarifas?.[0]?.id_tarifa || "rate"}-${procedencia}-${tipoUsuario}`}
                          className={`ticket-entry-card__tariff ticket-entry-card__tariff--${procedencia || "none"}`}
                        >
                          <strong>{procedencia || "por definir"}</strong>
                          <small>{tipoUsuario}</small>
                          <b>{priceInfo ? formatPrice(priceInfo.price, "dolares") : "—"}</b>
                        </span>
                      );
                    })}
                  </div>
                  <div className="ticket-entry-card__action">
                    <span className="ticket-entry-card__price-range">
                      {minPrice && maxPrice
                        ? minPrice === maxPrice
                          ? formatPrice(minPrice, "dolares")
                          : `${formatPrice(minPrice, "dolares")} - ${formatPrice(maxPrice, "dolares")}`
                        : "Sin precio"}
                    </span>
                    <button className="add-btn" type="button" title="Agregar entrada completa">
                      <FaPlus />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="no-services-container">
              <MessageDisplay type="info" message="No se encontraron entradas disponibles para esta selección" />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="child-service-panel">
      <div className="panel-header">
        <div className="header-content">
          <h4>
            {category?.id === "hoteles"
              ? "Habitaciones"
              : category?.id === "transportes"
                ? "Movilidades"
                : category?.id === "trenes"
                  ? "Vagones"
                  : category?.id === "vuelos"
                    ? "Tipos de Vuelo"
                    : category?.id === "guias"
                      ? "Rutas"
                      : category?.id === "endoses"
                        ? "Tours"
                        : category?.id === "restaurantes"
                          ? "Tarifas"
                          : category?.id === "tickets"
                            ? "Tarifas"
                            : "Servicios"}
          </h4>
        </div>
        <div className="header-controls">
          <div className="service-count">
            {searchFilteredServices?.length || 0} de {services?.length || 0}
          </div>
        </div>
      </div>

      <div className="services-list">
        {sortedForGrouping?.length > 0 ? (
          (() => {
            let lastParentId = null;
            const showGroups =
              (category?.id === "transportes" ||
                (category?.id === "guias" && platform === "venso")) &&
              selectedParents.length > 1;
            return sortedForGrouping.map((service, index) => {
              // Insertar separador de grupo para transportes con múltiples padres
              const curParentFK = showGroups
                ? String(
                    category?.id === "guias"
                      ? service.tour_nombre || service.ruta?.tour_nombre || ""
                      : service.transporte_id ||
                          service.id_transporte ||
                          service.movilidad?.id_transporte ||
                          "",
                  )
                : null;
              const needsGroupHeader =
                showGroups && curParentFK !== lastParentId;
              if (showGroups) lastParentId = curParentFK;

              // Solo usar data local, nunca consultar por cada hijo
              // Detectar si el hijo está anidado (habitacion, vagon, ticket, restaurante, etc.)
              const childKeys = [
                "habitacion",
                "vagon",
                "ticket",
                "restaurante",
                "tipo_vuelo",
                "movilidad",
                "ruta",
                "tour",
              ];
              const childObj = childKeys.map((k) => service[k]).find((v) => v);
              const base = childObj || service;
              // `service.tarifas` ya viene resuelto por contexto: contiene sólo
              // la tarifa comercial exacta solicitada. Una tarifa alternativa
              // (por ejemplo `interna` cuando se pide `externa`) se conserva sólo
              // como metadato y nunca se reutiliza como precio de venta.
              const allTarifas = service.tarifas || base.tarifas || [];
              const tarifas = allTarifas;
              const tarifa_interna = allTarifas.filter(
                (tarifa) => String(tarifa.tipo_tarifa || "").toLowerCase() === "interna",
              );
              const hasTariffs = tarifas.length > 0;
              const preferredTariffType = String(
                service._servicepicker_preferred_tariff_type || filterTariffType || "",
              )
                .trim()
                .toLowerCase();
              const alternateTariffTypes = Array.isArray(
                service._servicepicker_alternate_tariff_types,
              )
                ? service._servicepicker_alternate_tariff_types.filter(Boolean)
                : [];
              const hasAlternateTariff = Boolean(
                service._servicepicker_has_alternate_tariff ||
                  alternateTariffTypes.length > 0,
              );
              const missingTariff =
                Boolean(service._servicepicker_tariff_missing) || !hasTariffs;

              // Usar id del hijo anidado si existe, si no el id plano, si no el index
              const keyId =
                service._tariff_variant_key ||
                base.id ||
                base.id_habitacion ||
                base.id_vagon ||
                base.id_ticket ||
                base.id_restaurante ||
                base.id_tipo_vuelo ||
                base.id_movilidad ||
                service.id ||
                index;

              // Usar helpers con el objeto base
              const serviceName = getServiceName(
                base,
                category?.id,
                parentService,
              );

              // Manejar clic en toda la tarjeta - seleccionar automáticamente el primer precio
              const handleCardClick = async () => {
                let actualParent = parentService;

                // Para guías, buscar padre completo
                if (category?.id === "guias" || !actualParent) {
                  actualParent = await identifyParentService(
                    service,
                    category.id,
                    parentServices,
                  );
                  if (
                    !actualParent &&
                    !["restaurantes", "tickets"].includes(category.id)
                  ) {
                    console.error(
                      " Unable to identify parent service for child:",
                      service,
                    );
                    alert(
                      "No se pudo identificar el servicio padre. Por favor selecciona el servicio padre primero.",
                    );
                    return;
                  }
                }

                if (!hasTariffs) {
                  // El servicio sigue siendo seleccionable para construir el
                  // itinerario; ServicePicker creará una tarifa provisional de
                  // precio 0 sin inventar un valor comercial.
                  onSelectService(
                    { ...service, packageType: packageType },
                    actualParent,
                    null,
                  );
                  return;
                }

                const tarifa = tarifas[0];
                const tarifaEnDolares = convertTarifaToDollars(tarifa);
                const precio =
                  tarifaEnDolares.precio_compartido ||
                  tarifaEnDolares.precio_privado;
                const tarifaInternaEnDolares =
                  tarifa_interna.length > 0
                    ? convertTarifaToDollars(tarifa_interna[0])
                    : null;
                const precio_interno = tarifaInternaEnDolares
                  ? tarifaInternaEnDolares.precio_compartido ||
                    tarifaInternaEnDolares.precio_privado
                  : null;

                onSelectService(
                  { ...service, packageType: packageType },
                  actualParent,
                  {
                    ...tarifaEnDolares,
                    selectedPackageType: packageType,
                    precio: precio,
                    precio_interno,
                  },
                );
              };

              const califClass = getCalificacionClass(
                base.calificacion ||
                  service.calificacion ||
                  service.guia?.calificacion,
              );
              return (
                <React.Fragment key={keyId}>
                  {needsGroupHeader && (
                    <div className="group-separator">
                      <span className="group-separator-label">
                        {category?.id === "guias"
                          ? curParentFK
                          : parentNameMap[curParentFK] ||
                            `Transporte #${curParentFK}`}
                      </span>
                    </div>
                  )}
                  <div
                    className={`child-service-card ${califClass}`}
                    onClick={handleCardClick}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="card-body">
                      <div className="card-info">
                        {/* Identity (name + type) */}
                        <div className="card-identity">
                          <h5 className="service-name">{serviceName}</h5>
                          <span
                            className={`type-badge${califClass ? " type-badge--primary" : ""}${missingTariff ? " type-badge--missing" : ""}`}
                          >
                            {missingTariff ? (
                              <>
                                Sin tarifa
                                {preferredTariffType ? ` ${preferredTariffType}` : ""}
                                {` ${tariffYear || new Date().getFullYear()}`}
                                {hasAlternateTariff &&
                                  ` · ${alternateTariffTypes.join("/")} disponible`}
                              </>
                            ) : (
                              <>
                                {tarifas[0]?.anio || tariffYear || new Date().getFullYear()}
                                {` · ${tarifas[0]?.tipo_tarifa || category?.id || ""}`}
                                {tarifas[0]?.temporada && ` · ${tarifas[0].temporada}`}
                                {Array.isArray(tarifas[0]?.agency_ids) &&
                                  tarifas[0].agency_ids.length > 0 &&
                                  ` · ${tarifas[0].agency_ids.length} ag.`}
                              </>
                            )}
                          </span>
                        </div>

                        {/* Route / Details (category-specific) */}
                        <div className="card-route">
                          {category?.id === "hoteles" &&
                            (() => {
                              const roomInfo = getRoomInfo(base, tarifas);
                              return (
                                <>
                                  {roomInfo.capacidad && (
                                    <span className="route-value">
                                      <FaBed
                                        style={{
                                          fontSize: "0.82rem",
                                          marginRight: 3,
                                        }}
                                      />
                                      {roomInfo.capacidad}
                                    </span>
                                  )}
                                  {roomInfo.temporada && (
                                    <span className="route-label">
                                      <MdCalendarToday
                                        style={{
                                          fontSize: "0.82rem",
                                          marginRight: 3,
                                          verticalAlign: "middle",
                                        }}
                                      />
                                      {roomInfo.temporada}
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          {category?.id === "transportes" &&
                            (() => {
                              const transportInfo = getTransportInfo(
                                base,
                                tarifas,
                              );
                              return (
                                <>
                                  {transportInfo.capacidad && (
                                    <span className="route-value">
                                      <FaCar
                                        style={{
                                          fontSize: "0.82rem",
                                          marginRight: 3,
                                        }}
                                      />
                                      {transportInfo.capacidad}
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          {category?.id === "trenes" &&
                            (() => {
                              const wagonInfo = getWagonInfo(base);
                              return (
                                <>
                                  {getWagonRoute(base) && (
                                    <span className="route-value">
                                      <FaRoute
                                        style={{
                                          fontSize: "0.82rem",
                                          marginRight: 3,
                                        }}
                                      />
                                      {getWagonRoute(base)}
                                    </span>
                                  )}
                                  <span className="route-detail">
                                    {getWagonBimodal(base)}
                                  </span>
                                  {wagonInfo.horarios && (
                                    <span className="route-detail">
                                      <MdSchedule
                                        style={{
                                          fontSize: "0.82rem",
                                          marginRight: 3,
                                          verticalAlign: "middle",
                                        }}
                                      />
                                      {wagonInfo.horarios}
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          {category?.id === "vuelos" &&
                            (() => {
                              const flightRoute = getFlightRoute(base);
                              const flightInfo = getFlightInfo(base);
                              return (
                                <>
                                  {flightRoute && (
                                    <span className="route-value">
                                      <FaPlane
                                        style={{
                                          fontSize: "0.82rem",
                                          marginRight: 3,
                                        }}
                                      />
                                      {flightRoute}
                                    </span>
                                  )}
                                  {flightInfo.horarios && (
                                    <span className="route-detail">
                                      <MdSchedule
                                        style={{
                                          fontSize: "0.82rem",
                                          marginRight: 3,
                                          verticalAlign: "middle",
                                        }}
                                      />
                                      {flightInfo.horarios}
                                    </span>
                                  )}
                                  {flightInfo.equipaje && (
                                    <span className="route-detail route-detail--luggage">
                                      <FaSuitcase
                                        style={{
                                          fontSize: "0.78rem",
                                          marginRight: 3,
                                          verticalAlign: "middle",
                                        }}
                                      />
                                      {flightInfo.equipaje}
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          {category?.id === "guias" &&
                            (() => {
                              const guideInfo = getGuideRouteInfo(
                                base,
                                tarifas,
                              );
                              return (
                                <>
                                  {guideInfo.idioma && (
                                    <span className="route-value">
                                      <FaLanguage
                                        style={{
                                          fontSize: "0.82rem",
                                          marginRight: 3,
                                        }}
                                      />
                                      {guideInfo.idioma}
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          {category?.id === "endoses" &&
                            (() => {
                              const tourInfo = getTourInfo(base, tarifas);
                              return (
                                <>
                                  {tourInfo.tipoGuiado && (
                                    <span className="route-value">
                                      <MdMap
                                        style={{
                                          fontSize: "0.82rem",
                                          marginRight: 3,
                                          verticalAlign: "middle",
                                        }}
                                      />
                                      {tourInfo.tipoGuiado}
                                    </span>
                                  )}
                                  {tourInfo.idioma && (
                                    <span className="route-detail">
                                      <FaLanguage
                                        style={{
                                          fontSize: "0.82rem",
                                          marginRight: 3,
                                        }}
                                      />
                                      {tourInfo.idioma}
                                    </span>
                                  )}
                                  {tourInfo.capacidad && (
                                    <span className="route-detail">
                                      <FaUsers
                                        style={{
                                          fontSize: "0.82rem",
                                          marginRight: 3,
                                        }}
                                      />
                                      {tourInfo.capacidad} pax
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          {category?.id === "restaurantes" &&
                            (() => {
                              const restaurantInfo = getRestaurantInfo(base);
                              return (
                                <>
                                  {restaurantInfo.direccion && (
                                    <span className="route-value">
                                      <MdLocationOn
                                        style={{
                                          fontSize: "0.82rem",
                                          marginRight: 3,
                                          verticalAlign: "middle",
                                        }}
                                      />
                                      {restaurantInfo.direccion}
                                    </span>
                                  )}
                                  {restaurantInfo.tipoCocina && (
                                    <span className="route-detail">
                                      <MdRestaurant
                                        style={{
                                          fontSize: "0.82rem",
                                          marginRight: 3,
                                          verticalAlign: "middle",
                                        }}
                                      />
                                      {restaurantInfo.tipoCocina}
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          {category?.id === "tickets" &&
                            (() => {
                              const ticketInfo = getTicketInfo(base);
                              return (
                                <>
                                  {ticketInfo.procedencia && (
                                    <span className="route-value">
                                      <MdLocationOn
                                        style={{
                                          fontSize: "0.82rem",
                                          marginRight: 3,
                                          verticalAlign: "middle",
                                        }}
                                      />
                                      {ticketInfo.procedencia}
                                    </span>
                                  )}
                                  {ticketInfo.tipoUsuario && (
                                    <span className="route-detail">
                                      <MdPerson
                                        style={{
                                          fontSize: "0.82rem",
                                          marginRight: 3,
                                          verticalAlign: "middle",
                                        }}
                                      />
                                      {ticketInfo.tipoUsuario}
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                        </div>
                      </div>

                      {/* Price + Actions */}
                      <div className="card-price-actions">
                        {hasTariffs ? (
                          <div className="price-block">
                            <span className="price-label">
                              {tarifas.length > 1
                                ? `${tarifas.length} tarifas`
                                : packageType === "privado"
                                  ? "Privado"
                                  : "Compartido"}
                            </span>
                            <span className="price-amount">
                              {(() => {
                                const t = tarifas[0];
                                const isSinglePrice =
                                  t.precio_unico ||
                                  !t.precio_compartido !== !t.precio_privado;
                                const price = isSinglePrice
                                  ? t.precio_compartido || t.precio_privado
                                  : packageType === "privado"
                                    ? t.precio_privado || t.precio_compartido
                                    : t.precio_compartido || t.precio_privado;
                                return formatPrice(
                                  price,
                                  t.moneda,
                                  t.tasa_cambio,
                                );
                              })()}
                            </span>
                            {isConvertedFromSoles(tarifas[0]?.moneda) && (
                              <span className="price-converted">S/→$</span>
                            )}
                          </div>
                        ) : (
                          <div className="price-block">
                            <span className="price-label">Precio</span>
                            <span className="price-amount">—</span>
                          </div>
                        )}
                        <button
                          className="add-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCardClick();
                          }}
                          title="Agregar a cotización"
                        >
                          <FaPlus />
                        </button>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            });
          })()
        ) : (
          <div className="no-services-container">
            <MessageDisplay
              type="info"
              message={`No se encontraron ${
                category?.id === "hoteles"
                  ? "habitaciones"
                  : category?.id === "transportes"
                    ? "movilidades"
                    : category?.id === "trenes"
                      ? "vagones"
                      : category?.id === "vuelos"
                        ? "tipos de vuelo"
                        : category?.id === "guias"
                          ? "rutas"
                          : category?.id === "endoses"
                            ? "tours"
                            : category?.id === "restaurantes"
                              ? "tarifas"
                              : category?.id === "tickets"
                                ? "tarifas"
                                : "servicios"
              } disponibles para esta selección`}
            />
            {(Object.keys(activeFilters).length > 0 ||
              Object.keys(localFilters).length > 0) && (
              <div className="filter-suggestion">
                <p>Intenta ajustar los filtros para ver más resultados.</p>
                <div className="filter-actions">
                  {Object.keys(localFilters).length > 0 && (
                    <button
                      className="clear-filters-btn local"
                      onClick={() => {
                        setLocalFilters({});
                      }}
                    >
                      Limpiar filtros locales
                    </button>
                  )}
                  {Object.keys(filters || {}).length > 0 && (
                    <span className="parent-filter-note">
                      Los filtros del panel padre también están activos
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChildServicePanel;
