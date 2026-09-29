import { createApiInstance, handleApiError } from "../../../../utils/apiUtils";
import SecureStorage from "../../../../utils/secureStorage";
import { queryClient } from "../../../../config/queryClient";
import {
  invalidateCache,
  TURISMO_ENTITY_TYPES,
} from "../../../../hooks/useTurismoCache";

// Crear instancia API para todos los servicios
const api = createApiInstance();

let serviciosDataRevision = 0;
let serviciosAgencyId: number | null = null;

const normalizeAgencyId = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const setServiciosAgencyScope = (agencyId: number | string | null) => {
  const nextAgencyId = normalizeAgencyId(agencyId);
  if (nextAgencyId !== serviciosAgencyId) {
    serviciosAgencyId = nextAgencyId;
    bumpServiciosDataRevision();
  }
  return serviciosAgencyId;
};

export const getServiciosAgencyScope = () => serviciosAgencyId;

const bumpServiciosDataRevision = () => {
  serviciosDataRevision += 1;
  return serviciosDataRevision;
};

const buildFreshGetConfig = (config = {}, tariffScoped = false) => ({
  ...config,
  headers: config.headers || {},
  params: {
    ...(config.params || {}),
    force_refresh: true,
    no_cache: true,
    _servicios_rev: serviciosDataRevision,
    _servicios_ts: Date.now(),
    ...(tariffScoped && serviciosAgencyId ? { agency_id: serviciosAgencyId } : {}),
  },
});

const getFresh = (url, config = {}, tariffScoped = false) =>
  api.get(url, buildFreshGetConfig(config, tariffScoped));

const getCurrentAuditUser = () => {
  const user = SecureStorage.getItem("user") || {};
  return String(user.dniuser || SecureStorage.getItem("dniuser") || "system");
};

const withUpdateAuditFields = (entityData = {}) => {
  if (!entityData || typeof entityData !== "object" || Array.isArray(entityData)) {
    return entityData;
  }

  return {
    ...entityData,
    updated_by: entityData.updated_by || getCurrentAuditUser(),
    updated_at: entityData.updated_at || new Date().toISOString(),
  };
};

const handleFetchError = (error, fallback = []) => {
  handleApiError(error);
  return fallback;
};

const isServiciosQuery = (query) => {
  const key = query.queryKey;
  return Array.isArray(key) && (key.includes("turismo") || key.includes("servicios"));
};

const invalidateServiciosCaches = async (entityType = null) => {
  bumpServiciosDataRevision();

  if (entityType) {
    invalidateCache(entityType);
  }

  await queryClient.cancelQueries({ predicate: isServiciosQuery });
  queryClient.removeQueries({ predicate: isServiciosQuery });
  await queryClient.invalidateQueries({ predicate: isServiciosQuery });
  await queryClient.refetchQueries({
    predicate: isServiciosQuery,
    type: "active",
  });
};

const fetchEntities = async (entityPath) => {
  try {
    const response = await getFresh(`/${entityPath}`);
    return response.data.data || [];
  } catch (error) {
    return handleFetchError(error);
  }
};

/**
 * Crea una entidad e invalida el cache correspondiente
 */
const createEntity = async (entityPath, entityData, entityType = null) => {
  try {
    const response = await api.post(`/${entityPath}`, entityData);
    await invalidateServiciosCaches(entityType);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
};

/**
 * Actualiza una entidad e invalida el cache correspondiente
 */
const updateEntity = async (entityPath, id, entityData, entityType = null) => {
  try {
    const auditedData = withUpdateAuditFields(entityData);
    const response = await api.put(`/${entityPath}/${id}`, auditedData);
    await invalidateServiciosCaches(entityType);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
};

/**
 * Elimina una entidad e invalida el cache correspondiente
 */
const deleteEntity = async (entityPath, id, entityType = null) => {
  try {
    const response = await api.delete(`/${entityPath}/${id}`);
    await invalidateServiciosCaches(entityType);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
};

export const fetchProtectedServiceUsage = async (items = []) => {
  try {
    if (!items.length) return [];
    const response = await api.post("/turismo/service-usage/protected", {
      items,
    });
    return response.data?.data || [];
  } catch (error) {
    return handleFetchError(error);
  }
};

const fetchEntitiesWithTarifas = async (entityPath) => {
  try {
    const response = await getFresh(`/${entityPath}/con-tarifas`, {}, true);
    return response.data.data || [];
  } catch (error) {
    return handleFetchError(error);
  }
};

const fetchChildEntities = async (entityPath, parentType, parentId) => {
  try {
    const response = await getFresh(`/${entityPath}/${parentType}/${parentId}`);
    return response.data.data || [];
  } catch (error) {
    return handleFetchError(error);
  }
};

const fetchChildEntitiesWithTarifas = async (
  entityPath,
  parentType,
  parentId,
) => {
  try {
    const response = await getFresh(
      `/${entityPath}/${parentType}/${parentId}/con-tarifas`,
      {},
      true,
    );
    return response.data.data || [];
  } catch (error) {
    return handleFetchError(error);
  }
};

const normalizeEntityWithTarifas = (item, entityKeys = []) => {
  const entity =
    entityKeys.map((key) => item?.[key]).find(Boolean) ||
    item?.data ||
    item ||
    {};

  return {
    ...entity,
    tarifas: item?.tarifas || entity?.tarifas || [],
  };
};

//
// HOTELES API
//
export const fetchHoteles = () => fetchEntities("turismo/hoteles");
export const createHotel = (hotelData) =>
  createEntity("turismo/hoteles", hotelData, TURISMO_ENTITY_TYPES.HOTEL);
export const updateHotel = (id, hotelData) =>
  updateEntity("turismo/hoteles", id, hotelData, TURISMO_ENTITY_TYPES.HOTEL);
export const deleteHotel = (id) =>
  deleteEntity("turismo/hoteles", id, TURISMO_ENTITY_TYPES.HOTEL);

export const getHotelDependencies = async (hotelId) => {
  try {
    const habitacionesWithRelated = await fetchHabitacionesByHotelWithTarifas(
      hotelId,
    );
    const habitacionesConTarifas = habitacionesWithRelated.map((item) =>
      normalizeEntityWithTarifas(item, ["habitacion", "room"]),
    );
    const habitaciones = habitacionesConTarifas.map(
      ({ tarifas, ...habitacion }) => habitacion,
    );

    return {
      habitaciones,
      habitacionesConTarifas,
    };
  } catch (error) {
    handleApiError(error);
    return { habitaciones: [], habitacionesConTarifas: [] };
  }
};

//
// HABITACIONES API
//
export const fetchHabitacionesByHotel = (hotelId) =>
  fetchChildEntities("turismo/habitaciones", "hotel", hotelId);

export const fetchHabitacionesByHotelWithTarifas = (hotelId) =>
  fetchChildEntitiesWithTarifas("turismo/habitaciones", "hotel", hotelId);

export const createHabitacion = (habitacionData) =>
  createEntity(
    "turismo/habitaciones",
    habitacionData,
    TURISMO_ENTITY_TYPES.HABITACION,
  );

export const updateHabitacion = (id, habitacionData) =>
  updateEntity(
    "turismo/habitaciones",
    id,
    habitacionData,
    TURISMO_ENTITY_TYPES.HABITACION,
  );

export const deleteHabitacion = (id) =>
  deleteEntity("turismo/habitaciones", id, TURISMO_ENTITY_TYPES.HABITACION);

export const getHabitacionDependencies = async (habitacionId) => {
  try {
    // Obtenemos las tarifas asociadas usando el endpoint correcto
    const tarifas = await fetchTarifasByServicio(habitacionId, "habitacion");
    return { tarifas };
  } catch (error) {
    handleApiError(error);
  }
};

//
// TICKETS API
//
export const fetchTickets = () => fetchEntities("turismo/tickets");
export const fetchTicketsWithTarifas = () =>
  fetchEntitiesWithTarifas("turismo/tickets");
export const createTicket = (ticketData) =>
  createEntity("turismo/tickets", ticketData, TURISMO_ENTITY_TYPES.TICKETS);
export const updateTicket = (id, ticketData) =>
  updateEntity("turismo/tickets", id, ticketData, TURISMO_ENTITY_TYPES.TICKETS);
export const deleteTicket = (id) =>
  deleteEntity("turismo/tickets", id, TURISMO_ENTITY_TYPES.TICKETS);

export const getTicketDependencies = async (ticketId) => {
  try {
    const tarifas = await fetchTarifasByServicio(ticketId, "tickets");
    return { tarifas };
  } catch (error) {
    handleApiError(error);
  }
};

//
// TARIFAS API
//
export const fetchTarifasByServicio = async (servicioId, tipoServicio) => {
  try {
    // Validate required parameters
    if (!servicioId) {
      console.error("fetchTarifasByServicio: Missing servicioId");
      return [];
    }

    if (!tipoServicio) {
      console.error("fetchTarifasByServicio: Missing tipoServicio");
      return [];
    }

    // Map service type to correct endpoint - ensure both vagon and vagones work
    const serviceEndpoints = {
      habitacion: "habitaciones",
      movilidad: "movilidades",
      ticket: "tickets",
      tickets: "tickets",
      restaurante: "restaurantes",
      servicio_extra: "servicio-extra",
      tour: "tours",
      ruta: "rutas",
      vagon: "vagones",
      vagones: "vagones",
      tipo_vuelo: "tipos-vuelo",
    };

    const endpoint = serviceEndpoints[tipoServicio];
    if (!endpoint) {
      console.error(`Invalid tipoServicio: ${tipoServicio}`);
      return [];
    }

    const url = `turismo/${endpoint}/${servicioId}/con-tarifas`;

    const response = await getFresh(url);

    // Enhanced data extraction logic for vagones and other services
    if (response.data && response.data.data) {
      // Case 1: Direct tarifas array in response.data.data.tarifas
      if (response.data.data.tarifas) {
        return response.data.data.tarifas || [];
      }

      // Case 2: Nested structure with vagon/habitacion and tarifas
      if (
        (response.data.data.vagon || response.data.data.habitacion) &&
        response.data.data.tarifas
      ) {
        return response.data.data.tarifas || [];
      }
    }

    return [];
  } catch (error) {
    console.error("Error fetching tarifas:", error);
    handleApiError(error);
    return [];
  }
};

const normalizeTariffAgencyIds = (tarifaData) => {
  const agencyIds = Array.isArray(tarifaData?.agency_ids)
    ? tarifaData.agency_ids.map(Number).filter((agencyId) => agencyId > 0)
    : [];
  if (agencyIds.length === 0) {
    throw new Error("Selecciona al menos una agencia para la tarifa.");
  }
  return Array.from(new Set(agencyIds)).sort((a, b) => a - b);
};

const buildTariffPayload = (tarifaData) => ({
  id_servicio: tarifaData.id_servicio,
  tipo_servicio: tarifaData.tipo_servicio,
  tipo_tarifa: tarifaData.tipo_tarifa,
  anio: Number(tarifaData.anio || new Date().getFullYear()),
  tiene_temporada: Boolean(tarifaData.tiene_temporada),
  temporada: tarifaData.tiene_temporada ? tarifaData.temporada : null,
  precio_compartido: parseFloat(tarifaData.precio_compartido),
  precio_privado: parseFloat(tarifaData.precio_privado),
  precio_unico: Boolean(tarifaData.precio_unico),
  moneda: tarifaData.moneda || "dolares",
  tasa_cambio: Number(tarifaData.tasa_cambio || 1),
  agency_ids: normalizeTariffAgencyIds(tarifaData),
  ...(tarifaData.created_by ? { created_by: tarifaData.created_by } : {}),
  ...(tarifaData.updated_by ? { updated_by: tarifaData.updated_by } : {}),
  ...(tarifaData.updated_at ? { updated_at: tarifaData.updated_at } : {}),
});

export const createTarifa = async (tarifaData) => {
  try {
    const response = await api.post(
      `turismo/tarifas`,
      buildTariffPayload(tarifaData),
    );
    await invalidateServiciosCaches(TURISMO_ENTITY_TYPES.TARIFA);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
};

export const updateTarifa = async (id, tarifaData) => {
  try {
    const processedData = buildTariffPayload(tarifaData);
    const auditedData = withUpdateAuditFields(processedData);

    if (auditedData.precio_unico === false) {
      const orderedData = {
        ...auditedData,
        precio_compartido: auditedData.precio_compartido,
        precio_privado: auditedData.precio_privado,
      };
      const response = await api.put(`turismo/tarifas/${id}`, orderedData);
      await invalidateServiciosCaches(TURISMO_ENTITY_TYPES.TARIFA);
      return response.data;
    }

    const response = await api.put(`turismo/tarifas/${id}`, auditedData);
    await invalidateServiciosCaches(TURISMO_ENTITY_TYPES.TARIFA);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
};

export const deleteTarifa = async (id) =>
  deleteEntity("turismo/tarifas", id, TURISMO_ENTITY_TYPES.TARIFA);

//
// TRANSPORTES API
//
export const fetchTransportes = () => fetchEntities("turismo/transportes");
export const createTransporte = (transporteData) =>
  createEntity(
    "turismo/transportes",
    transporteData,
    TURISMO_ENTITY_TYPES.TRANSPORTE,
  );
export const updateTransporte = (id, transporteData) =>
  updateEntity(
    "turismo/transportes",
    id,
    transporteData,
    TURISMO_ENTITY_TYPES.TRANSPORTE,
  );
export const deleteTransporte = (id) =>
  deleteEntity("turismo/transportes", id, TURISMO_ENTITY_TYPES.TRANSPORTE);

export const getTransporteDependencies = async (transporteId) => {
  try {
    const movilidadesWithRelated = await fetchMovilidadesByTransporteWithTarifas(
      transporteId,
    );
    const movilidadesConTarifas = movilidadesWithRelated.map((item) =>
      normalizeEntityWithTarifas(item, ["movilidad"]),
    );
    const movilidades = movilidadesConTarifas.map(
      ({ tarifas, ...movilidad }) => movilidad,
    );

    return {
      movilidades,
      movilidadesConTarifas,
    };
  } catch (error) {
    handleApiError(error);
    return { movilidades: [], movilidadesConTarifas: [] };
  }
};

//
// MOVILIDADES API
//
export const fetchMovilidadesByTransporte = (transporteId) =>
  fetchChildEntities("turismo/movilidades", "transporte", transporteId);

export const fetchMovilidadesByTransporteWithTarifas = (transporteId) =>
  fetchChildEntitiesWithTarifas(
    "turismo/movilidades",
    "transporte",
    transporteId,
  );

export const createMovilidad = (movilidadData) =>
  createEntity(
    "turismo/movilidades",
    movilidadData,
    TURISMO_ENTITY_TYPES.MOVILIDAD,
  );

export const updateMovilidad = (id, movilidadData) =>
  updateEntity(
    "turismo/movilidades",
    id,
    movilidadData,
    TURISMO_ENTITY_TYPES.MOVILIDAD,
  );

export const deleteMovilidad = (id) =>
  deleteEntity("turismo/movilidades", id, TURISMO_ENTITY_TYPES.MOVILIDAD);

export const getMovilidadDependencies = async (movilidadId) => {
  try {
    const tarifas = await fetchTarifasByServicio(movilidadId, "movilidad");
    return { tarifas };
  } catch (error) {
    handleApiError(error);
  }
};

//
// VUELOS API
//
export const fetchVuelos = () => fetchEntities("turismo/vuelos");
export const createVuelo = (vueloData) =>
  createEntity("turismo/vuelos", vueloData, TURISMO_ENTITY_TYPES.VUELOS);
export const updateVuelo = (id, vueloData) =>
  updateEntity("turismo/vuelos", id, vueloData, TURISMO_ENTITY_TYPES.VUELOS);
export const deleteVuelo = (id) =>
  deleteEntity("turismo/vuelos", id, TURISMO_ENTITY_TYPES.VUELOS);

export const getVueloDependencies = async (vueloId) => {
  try {
    const tiposVueloWithRelated = await fetchTipoVueloByVueloWithTarifas(
      vueloId,
    );
    const tiposVueloConTarifas = tiposVueloWithRelated.map((item) =>
      normalizeEntityWithTarifas(item, ["tipo_vuelo", "tipoVuelo"]),
    );
    const tiposVuelo = tiposVueloConTarifas.map(
      ({ tarifas, ...tipoVuelo }) => tipoVuelo,
    );

    return {
      tiposVuelo,
      tiposVueloConTarifas,
    };
  } catch (error) {
    handleApiError(error);
    return { tiposVuelo: [], tiposVueloConTarifas: [] };
  }
};

//
// TIPOS DE VUELO API
//
export const fetchTiposVuelo = () => fetchEntities("turismo/tipos-vuelo");

export const fetchTipoVueloByVuelo = (vueloId) =>
  fetchChildEntities("turismo/tipos-vuelo", "vuelo", vueloId);

export const fetchTipoVueloByVueloWithTarifas = (vueloId) =>
  fetchChildEntitiesWithTarifas("turismo/tipos-vuelo", "vuelo", vueloId);

export const createTipoVuelo = (tipoVueloData) =>
  createEntity(
    "turismo/tipos-vuelo",
    tipoVueloData,
    TURISMO_ENTITY_TYPES.TIPO_VUELO,
  );

export const updateTipoVuelo = (id, tipoVueloData) =>
  updateEntity(
    "turismo/tipos-vuelo",
    id,
    tipoVueloData,
    TURISMO_ENTITY_TYPES.TIPO_VUELO,
  );

export const deleteTipoVuelo = (id) =>
  deleteEntity("turismo/tipos-vuelo", id, TURISMO_ENTITY_TYPES.TIPO_VUELO);

export const getTipoVueloDependencies = async (tipoVueloId) => {
  try {
    const tarifas = await fetchTarifasByServicio(tipoVueloId, "tipo_vuelo");
    return { tarifas };
  } catch (error) {
    handleApiError(error);
  }
};

//
// ENDOSES API
//
export const fetchEndoses = () => fetchEntities("turismo/endoses");
export const createEndose = (endoseData) =>
  createEntity("turismo/endoses", endoseData, TURISMO_ENTITY_TYPES.ENDOSE);
export const updateEndose = (id, endoseData) =>
  updateEntity("turismo/endoses", id, endoseData, TURISMO_ENTITY_TYPES.ENDOSE);
export const deleteEndose = (id) =>
  deleteEntity("turismo/endoses", id, TURISMO_ENTITY_TYPES.ENDOSE);

export const getEndoseDependencies = async (endoseId) => {
  try {
    const toursWithRelated = await fetchToursByEndoseWithTarifas(endoseId);
    const toursConTarifas = toursWithRelated.map((item) => ({
      ...(item.tour || item),
      tarifas: item.tarifas || item.tour?.tarifas || [],
    }));
    const tours = toursConTarifas.map(({ tarifas, ...tour }) => tour);

    return {
      tours,
      toursConTarifas,
    };
  } catch (error) {
    handleApiError(error);
    return { tours: [], toursConTarifas: [] };
  }
};

//
// TOURS API
//
export const fetchTours = () => fetchEntities("turismo/tours");
export const fetchToursWithTarifas = () =>
  fetchEntitiesWithTarifas("turismo/tours");

export const fetchToursByEndose = (endoseId) =>
  fetchChildEntities("turismo/tours", "endose", endoseId);

export const fetchToursByEndoseWithTarifas = (endoseId) =>
  fetchChildEntitiesWithTarifas("turismo/tours", "endose", endoseId);

const normalizeTourPayload = (tourData = {}) => {
  const capacidad = tourData.capacidad;
  return {
    ...tourData,
    capacidad:
      capacidad === null || capacidad === undefined || capacidad === ""
        ? null
        : Math.max(1, Number(capacidad) || 1),
  };
};

export const createTour = (tourData) =>
  createEntity(
    "turismo/tours",
    normalizeTourPayload(tourData),
    TURISMO_ENTITY_TYPES.TOUR,
  );
export const updateTour = (id, tourData) =>
  updateEntity(
    "turismo/tours",
    id,
    normalizeTourPayload(tourData),
    TURISMO_ENTITY_TYPES.TOUR,
  );
export const deleteTour = (id) =>
  deleteEntity("turismo/tours", id, TURISMO_ENTITY_TYPES.TOUR);

export const getTourDependencies = async (tourId) => {
  try {
    const tarifas = await fetchTarifasByServicio(tourId, "tour");
    return { tarifas };
  } catch (error) {
    handleApiError(error);
  }
};

//
// TRENES API
//
export const fetchTrenes = () => fetchEntities("turismo/trenes");
export const createTren = (trenData) =>
  createEntity("turismo/trenes", trenData, TURISMO_ENTITY_TYPES.TREN);
export const updateTren = (id, trenData) =>
  updateEntity("turismo/trenes", id, trenData, TURISMO_ENTITY_TYPES.TREN);
export const deleteTren = (id) =>
  deleteEntity("turismo/trenes", id, TURISMO_ENTITY_TYPES.TREN);

export const getTrenDependencies = async (trenId) => {
  try {
    const vagonesWithRelated = await fetchVagonesByTrenWithTarifas(trenId);
    const vagonesConTarifas = vagonesWithRelated.map((item) =>
      normalizeEntityWithTarifas(item, ["vagon", "vagones"]),
    );
    const vagones = vagonesConTarifas.map(({ tarifas, ...vagon }) => vagon);

    return {
      vagones,
      vagonesConTarifas,
    };
  } catch (error) {
    handleApiError(error);
    return { vagones: [], vagonesConTarifas: [] };
  }
};

//
// VAGONES API
//
export const fetchVagonesByTren = (trenId) =>
  fetchChildEntities("turismo/vagones", "tren", trenId);

export const fetchVagonesByTrenWithTarifas = (trenId) =>
  fetchChildEntitiesWithTarifas("turismo/vagones", "tren", trenId);

export const createVagon = (vagonData) =>
  createEntity("turismo/vagones", vagonData, TURISMO_ENTITY_TYPES.VAGONES);
export const updateVagon = (id, vagonData) =>
  updateEntity("turismo/vagones", id, vagonData, TURISMO_ENTITY_TYPES.VAGONES);
export const deleteVagon = (id) =>
  deleteEntity("turismo/vagones", id, TURISMO_ENTITY_TYPES.VAGONES);

export const getVagonDependencies = async (vagonId) => {
  try {
    // Use 'vagon' consistently
    const tarifas = await fetchTarifasByServicio(vagonId, "vagones");
    return { tarifas };
  } catch (error) {
    console.error(`Error getting vagon dependencies: ${error}`);
    handleApiError(error);
    return { tarifas: [] };
  }
};

//
// GUIAS API
//
export const fetchGuias = async () => {
  try {
    const response = await getFresh("turismo/guias");
    return response.data.data || [];
  } catch (error) {
    return handleApiError(error);
  }
};

export const fetchGuiaById = async (id) => {
  try {
    const response = await getFresh(`turismo/guias/${id}`);
    return response.data.data || null;
  } catch (error) {
    return handleApiError(error);
  }
};

export const createGuia = async (guiaData) => {
  try {
    // First, make sure estado_civil exactly matches expected values (case sensitive)
    const normalizeEstadoCivil = (value) => {
      if (!value) return null;

      // Direct mapping to ensure exact match with backend
      const estadoCivilMap = {
        soltero: "Soltero",
        casado: "Casado",
        divorciado: "Divorciado",
        viudo: "Viudo",
        otro: "Otro",
        // Include exact matches too to avoid double mapping
        Soltero: "Soltero",
        Casado: "Casado",
        Divorciado: "Divorciado",
        Viudo: "Viudo",
        Otro: "Otro",
      };

      const normalized = estadoCivilMap[value] || null;
      return normalized;
    };

    // Step 1: Create persona first (if we have persona data)
    if (!guiaData.id_persona && (guiaData.nombres || guiaData.apellidos)) {
      // Create persona first with normalized data
      // IMPORTANT: Convert empty strings to null to avoid constraint violations
      const personaData = {
        nombres: guiaData.nombres,
        apellidos: guiaData.apellidos,
        direccion: guiaData.direccion || null,
        genero: guiaData.genero === "" ? null : guiaData.genero || null,
        estado_civil: normalizeEstadoCivil(guiaData.estado_civil),
        created_by: guiaData.created_by || "system",
      };

      console.log("Creating persona with data:", personaData);
      const personaResponse = await api.post("turismo/personas", personaData);

      let personaId = null;
      if (personaResponse.data && typeof personaResponse.data === "object") {
        // Try different possible locations of the ID in the response
        personaId = personaResponse.data.data || personaResponse.data.id;

        // If data is not in expected format, try to find the ID elsewhere
        if (!personaId && personaResponse.data.message) {
          // Sometimes the ID might be in the success message
          const match = personaResponse.data.message.match(/ID: (\d+)/);
          if (match && match[1]) {
            personaId = parseInt(match[1], 10);
          }
        }
      }

      if (!personaId || isNaN(personaId)) {
        throw new Error(
          "No valid persona ID was returned from server: " +
            JSON.stringify(personaResponse.data),
        );
      }

      // Now we have the persona ID to use for the guide
      guiaData.id_persona = personaId;
    }

    // If still no id_persona, we can't create a guide
    if (!guiaData.id_persona) {
      throw new Error(
        "Cannot create guide: missing id_persona and no persona data provided",
      );
    }

    // Step 2: Create guia with the persona ID
    const guiaToSend = {
      id_persona: guiaData.id_persona,
      // IMPORTANTE: Explícitamente convertir cadenas vacías a null
      codigo_guia:
        guiaData.codigo_guia === "" || guiaData.codigo_guia === null
          ? null
          : guiaData.codigo_guia,
      // Ensure idioma is properly formatted as a JSON array
      idioma: guiaData.idioma || [],
      created_by: guiaData.created_by || "system",
    };

    const response = await api.post("turismo/guias", guiaToSend);
    await invalidateServiciosCaches(TURISMO_ENTITY_TYPES.GUIA);
    return response.data;
  } catch (error) {
    console.error("Error creating guide:", error);
    console.error("Error response:", error.response?.data);
    return handleApiError(error);
  }
};

export const updateGuia = async (id, guiaData) => {
  try {
    const auditedGuiaData = withUpdateAuditFields(guiaData);

    // Validate ID to avoid sending request with undefined ID
    if (!id || isNaN(parseInt(id))) {
      console.error(`Invalid guide ID for update: ${id}`);
      throw new Error("ID de guía inválido o no especificado");
    }

    // First get the guide to find the persona ID
    const guideFetch = await getFresh(`turismo/guias/${id}`);

    // Make sure we get valid data back
    if (!guideFetch.data || !guideFetch.data.data) {
      throw new Error(`No se encontró el guía con ID: ${id}`);
    }

    const personaId = guideFetch.data.data.persona.id_persona;

    if (!personaId) {
      throw new Error(
        `No se encontró la persona asociada al guía con ID: ${id}`,
      );
    }

    // Update the persona first
    const personaData = {
      nombres: auditedGuiaData.nombres || null,
      apellidos: auditedGuiaData.apellidos || null,
      direccion: auditedGuiaData.direccion || null,
      genero: auditedGuiaData.genero || null,
      estado_civil: auditedGuiaData.estado_civil || null,
      updated_by: auditedGuiaData.updated_by,
      updated_at: auditedGuiaData.updated_at,
    };

    console.log("Updating persona with ID:", personaId, "Data:", personaData);

    // Update the persona first
    try {
      const personaResponse = await api.put(
        `turismo/personas/${personaId}`,
        personaData,
      );
      console.log("Persona update response:", personaResponse.data);
    } catch (personaError) {
      console.error(
        "Error updating persona:",
        personaError.response?.data || personaError.message,
      );
      throw new Error(
        `Error al actualizar datos personales: ${personaError.response?.data?.message || personaError.message}`,
      );
    }

    // IMPORTANTE: Verificar si el código está vacío o nulo
    const isCodEmpty =
      auditedGuiaData.codigo_guia === "" || auditedGuiaData.codigo_guia === null;

    // CORREGIDO: Crear los datos para enviar - incluir telefono y correo
    const guiaToSend = {
      // IMPORTANTE: Enviar null explícitamente cuando está vacío
      codigo_guia: isCodEmpty ? null : auditedGuiaData.codigo_guia,
      idioma: auditedGuiaData.idioma || [],
      calificacion: auditedGuiaData.calificacion || [],
      telefono: auditedGuiaData.telefono || null,
      correo: auditedGuiaData.correo || null,
      updated_by: auditedGuiaData.updated_by,
      updated_at: auditedGuiaData.updated_at,
    };

    const response = await api.put(`turismo/guias/${id}`, guiaToSend);
    await invalidateServiciosCaches(TURISMO_ENTITY_TYPES.GUIA);
    return response.data;
  } catch (error) {
    console.error("Error updating guide:", error);
    console.error("Error response:", error.response?.data);
    return handleApiError(error);
  }
};

export const deleteGuia = async (id) => {
  try {
    // Validate ID to avoid sending request with undefined ID
    if (!id || isNaN(parseInt(id))) {
      console.error(`Invalid guide ID for deletion: ${id}`);
      throw new Error("ID de guía inválido o no especificado");
    }

    const response = await api.delete(`turismo/guias/${id}`);
    await invalidateServiciosCaches(TURISMO_ENTITY_TYPES.GUIA);
    return response.data;
  } catch (error) {
    console.error("Error deleting guide:", error);
    return handleApiError(error);
  }
};

export const getGuiaDependencies = async (guiaId) => {
  try {
    // Validate the ID before proceeding
    if (!guiaId) {
      console.error("getGuiaDependencies: Missing guiaId parameter");
      return { rutas: [], rutasConTarifas: [] };
    }

    const rutasConTarifas = await fetchRutasByGuiaWithTarifas(guiaId);

    if (!rutasConTarifas || !Array.isArray(rutasConTarifas)) {
      console.warn(
        `No valid routes array returned for guide ${guiaId}:`,
        rutasConTarifas,
      );
      return { rutas: [], rutasConTarifas: [] };
    }

    const rutas = rutasConTarifas.map(({ tarifas, ...ruta }) => ruta);

    return {
      rutas,
      rutasConTarifas,
    };
  } catch (error) {
    console.error("Error getting guide dependencies:", error);
    handleApiError(error);
    return { rutas: [], rutasConTarifas: [] };
  }
};

//
// RUTAS API
//
export const fetchRutas = () => fetchEntities("turismo/rutas");
export const fetchRutasWithTarifas = () =>
  fetchEntitiesWithTarifas("turismo/rutas/con-tarifas");

export const fetchRutaById = (id) => {
  try {
    return api
      .get(`turismo/rutas/${id}`)
      .then((response) => response.data.data || null)
      .catch((error) => handleApiError(error));
  } catch (error) {
    handleApiError(error);
  }
};

export const fetchRutaByIdWithTarifas = (id) => {
  try {
    return api
      .get(`turismo/rutas/${id}/con-tarifas`)
      .then((response) => response.data.data || null)
      .catch((error) => handleApiError(error));
  } catch (error) {
    handleApiError(error);
  }
};

export const fetchRutaByIdWithGuia = (id) => {
  try {
    return api
      .get(`turismo/rutas/${id}/con-guia`)
      .then((response) => response.data.data || null)
      .catch((error) => handleApiError(error));
  } catch (error) {
    handleApiError(error);
  }
};

export const fetchRutasByGuia = async (guiaId) => {
  try {
    // Validate the ID before proceeding
    if (!guiaId) {
      console.error("fetchRutasByGuia: Missing guiaId parameter");
      return [];
    }

    const response = await getFresh(`turismo/rutas/guia/${guiaId}`);
    return response.data.data || [];
  } catch (error) {
    console.error(`Error fetching routes for guide ${guiaId}:`, error);
    handleApiError(error);
    return [];
  }
};

// Función para obtener rutas por guía con tarifas
export const fetchRutasByGuiaWithTarifas = async (guiaId) => {
  try {
    const response = await getFresh(`/turismo/rutas/guia/${guiaId}/con-tarifas`);
    const data = response.data;

    // Si la API devuelve un objeto con propiedad 'data', extraer solo los datos
    if (data && data.data) {
      return normalizeRutasData(data.data);
    }

    // Si no tiene estructura esperada, devolver un array vacío
    if (!Array.isArray(data)) {
      console.warn("La respuesta de la API no es un array:", data);
      return [];
    }

    return normalizeRutasData(data);
  } catch (error) {
    console.error("Error en fetchRutasByGuiaWithTarifas:", error);
    throw error;
  }
};

// Función de ayuda para normalizar los datos de rutas
function normalizeRutasData(data) {
  if (!Array.isArray(data)) {
    console.warn("normalizeRutasData: No se recibió un array", data);
    return [];
  }

  return data.map((item) => {
    // Si los datos vienen con estructura anidada (como en RutaConTarifas)
    if (item.ruta) {
      return {
        ...item.ruta,
        tarifas: item.tarifas || [],
      };
    }
    // Si ya vienen planos
    return item;
  });
}

export const createRuta = async (rutaData) => {
  try {
    // Validate required fields and improve error messages
    if (rutaData.id_guia === undefined || rutaData.id_guia === null) {
      console.error("createRuta received undefined or null id_guia:", rutaData);
      throw new Error("ID de guía no especificado");
    }

    // Convert to number if it's not already
    const guiaId =
      typeof rutaData.id_guia === "number"
        ? rutaData.id_guia
        : parseInt(rutaData.id_guia, 10);

    // Validate it's a valid number after conversion
    if (isNaN(guiaId)) {
      console.error(
        "Invalid guide ID (NaN after conversion):",
        rutaData.id_guia,
      );
      throw new Error("ID de guía inválido - formato incorrecto");
    }

    // Extra validation to ensure positive integer
    if (guiaId <= 0) {
      console.error("Invalid guide ID (not positive):", guiaId);
      throw new Error("ID de guía inválido - debe ser un número positivo");
    }

    if (!rutaData.tour_nombre || rutaData.tour_nombre.trim() === "") {
      throw new Error("El nombre del tour es obligatorio");
    }

    // Process data before sending to API
    const processedData = {
      ...rutaData,
      // Ensure ID is a number
      id_guia: guiaId,

      // Handle viáticos correctamente
      viaticos: Boolean(rutaData.viaticos),

      costo_viaticos: rutaData.viaticos
        ? rutaData.costo_viaticos
          ? parseFloat(rutaData.costo_viaticos)
          : null
        : null,

      // IMPORTANT: Ensure observaciones is either a non-empty string or null, never empty string
      observaciones:
        rutaData.observaciones && rutaData.observaciones.trim() !== ""
          ? rutaData.observaciones
          : null,
    };

    return createEntity(
      "turismo/rutas",
      processedData,
      TURISMO_ENTITY_TYPES.RUTA,
    );
  } catch (error) {
    console.error("Error creating ruta:", error);
    return handleApiError(error);
  }
};

export const updateRuta = async (id, rutaData) => {
  try {
    // Validate required fields
    if (!id && id !== 0) {
      console.error("updateRuta called with invalid ID:", id);
      throw new Error("ID de ruta inválido");
    }

    // Ensure ID is a valid number
    const rutaId = parseInt(id, 10);
    if (isNaN(rutaId)) {
      console.error("Invalid route ID (NaN after conversion):", id);
      throw new Error("ID de ruta inválido - formato incorrecto");
    }

    // Process data before sending to API
    const processedData = {
      ...rutaData,
      // Handle viáticos correctly
      viaticos:
        rutaData.viaticos !== undefined
          ? Boolean(rutaData.viaticos)
          : undefined,

      // IMPORTANT: Properly handle costo_viaticos
      costo_viaticos: rutaData.viaticos
        ? rutaData.costo_viaticos
          ? parseFloat(rutaData.costo_viaticos)
          : null
        : null,

      // IMPORTANT: Ensure observaciones is either a non-empty string or null, never empty string
      observaciones:
        rutaData.observaciones === "" ? null : rutaData.observaciones,
    };

    return updateEntity(
      "turismo/rutas",
      rutaId,
      processedData,
      TURISMO_ENTITY_TYPES.RUTA,
    );
  } catch (error) {
    console.error("Error updating ruta:", error);
    return handleApiError(error);
  }
};

export const deleteRuta = (id) => {
  // Validate and convert the ID
  if (!id && id !== 0) {
    console.error("deleteRuta called with invalid ID:", id);
    return Promise.reject(new Error("ID de ruta inválido"));
  }

  // Ensure ID is a valid number
  const rutaId = parseInt(id, 10);
  if (isNaN(rutaId)) {
    console.error("Invalid route ID (NaN after conversion):", id);
    return Promise.reject(
      new Error("ID de ruta inválido - formato incorrecto"),
    );
  }

  return deleteEntity("turismo/rutas", rutaId, TURISMO_ENTITY_TYPES.RUTA);
};

//
// PERSONAS API
//
export const fetchPersonas = () => fetchEntities("turismo/personas");

export const fetchPersonaById = (id) => {
  try {
    return api
      .get(`turismo/personas/${id}`)
      .then((response) => response.data.data || null)
      .catch((error) => handleApiError(error));
  } catch (error) {
    handleApiError(error);
  }
};

//
// RESTAURANTES API
//
export const fetchRestaurantes = () => fetchEntities("turismo/restaurantes");
export const fetchRestaurantesWithTarifas = () =>
  fetchEntitiesWithTarifas("turismo/restaurantes");
export const createRestaurante = (restauranteData) =>
  createEntity(
    "turismo/restaurantes",
    restauranteData,
    TURISMO_ENTITY_TYPES.RESTAURANTE,
  );
export const updateRestaurante = (id, restauranteData) =>
  updateEntity(
    "turismo/restaurantes",
    id,
    restauranteData,
    TURISMO_ENTITY_TYPES.RESTAURANTE,
  );
export const deleteRestaurante = (id) =>
  deleteEntity("turismo/restaurantes", id, TURISMO_ENTITY_TYPES.RESTAURANTE);

export const getRestauranteDependencies = async (restauranteId) => {
  try {
    const tarifas = await fetchTarifasByServicio(restauranteId, "restaurante");
    return { tarifas };
  } catch (error) {
    handleApiError(error);
  }
};

export const getRutaDependencies = async (rutaId) => {
  try {
    // Validate the ID before proceeding
    if (!rutaId && rutaId !== 0) {
      console.error("getRutaDependencies called with invalid ID:", rutaId);
      return { tarifas: [] };
    }

    // Ensure ID is a valid number
    const numericRutaId = parseInt(rutaId, 10);
    if (isNaN(numericRutaId)) {
      console.error("Invalid route ID (NaN after conversion):", rutaId);
      return { tarifas: [] };
    }

    // Get tariffs associated with this route
    const tarifas = await fetchTarifasByServicio(numericRutaId, "ruta");

    return { tarifas };
  } catch (error) {
    console.error("Error getting route dependencies:", error);
    handleApiError(error);
    return { tarifas: [] };
  }
};

//
// SERVICIOS EXTRAS API (CRUD backed by DB table servicio_extra)
//
export const fetchServiciosExtra = () =>
  fetchEntities("turismo/servicio-extra");
export const fetchServiciosExtraWithTarifas = () =>
  fetchEntitiesWithTarifas("turismo/servicio-extra");
export const createServicioExtra = (data) =>
  createEntity(
    "turismo/servicio-extra",
    data,
    TURISMO_ENTITY_TYPES.SERVICIO_EXTRA,
  );
export const updateServicioExtra = (id, data) =>
  updateEntity(
    "turismo/servicio-extra",
    id,
    data,
    TURISMO_ENTITY_TYPES.SERVICIO_EXTRA,
  );
export const deleteServicioExtra = (id) =>
  deleteEntity(
    "turismo/servicio-extra",
    id,
    TURISMO_ENTITY_TYPES.SERVICIO_EXTRA,
  );

export const getServicioExtraDependencies = async (servicioExtraId) => {
  try {
    const tarifas = await fetchTarifasByServicio(
      servicioExtraId,
      "servicio_extra",
    );
    return { tarifas };
  } catch (error) {
    handleApiError(error);
    return { tarifas: [] };
  }
};
