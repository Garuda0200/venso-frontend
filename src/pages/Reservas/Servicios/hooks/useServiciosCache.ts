import { useState, useCallback, useEffect, useRef } from "react";
import useTurismoCache, {
  TURISMO_ENTITY_TYPES,
  invalidateCache,
  getCacheStats as getGlobalCacheStats,
} from "../../../../hooks/useTurismoCache";
import * as api from "../services/api";

/**
 * Mapeo de entidades a sus funciones de fetch
 */
const ENTITY_FETCH_MAP = {
  hoteles: api.fetchHoteles,
  habitaciones: null, // Se carga por hotel
  tickets: api.fetchTickets,
  transportes: api.fetchTransportes,
  movilidades: null, // Se carga por transporte
  vuelos: api.fetchVuelos,
  tiposvuelo: null, // Se carga por vuelo
  trenes: api.fetchTrenes,
  vagones: null, // Se carga por tren
  endoses: api.fetchEndoses,
  tours: null, // Se carga por endose
  guias: api.fetchGuias,
  rutas: null, // Se carga por guía
  restaurantes: api.fetchRestaurantes,
  extras: api.fetchServiciosExtra,
};

/**
 * Mapeo de IDs de vista a tipos de entidad del cache
 */
const VIEW_TO_ENTITY = {
  hoteles: TURISMO_ENTITY_TYPES.HOTEL,
  habitaciones: TURISMO_ENTITY_TYPES.HABITACION,
  tickets: TURISMO_ENTITY_TYPES.TICKETS,
  transportes: TURISMO_ENTITY_TYPES.TRANSPORTE,
  movilidades: TURISMO_ENTITY_TYPES.MOVILIDAD,
  vuelos: TURISMO_ENTITY_TYPES.VUELOS,
  tiposvuelo: TURISMO_ENTITY_TYPES.TIPO_VUELO,
  trenes: TURISMO_ENTITY_TYPES.TREN,
  vagones: TURISMO_ENTITY_TYPES.VAGONES,
  endoses: TURISMO_ENTITY_TYPES.ENDOSE,
  tours: TURISMO_ENTITY_TYPES.TOUR,
  guias: TURISMO_ENTITY_TYPES.GUIA,
  rutas: TURISMO_ENTITY_TYPES.RUTA,
  restaurantes: TURISMO_ENTITY_TYPES.RESTAURANTE,
  extras: TURISMO_ENTITY_TYPES.SERVICIO_EXTRA,
};

/**
 * Hook para gestionar el cache de la página Servicios
 *
 * @param {string} activeView - La vista activa actual (hoteles, tickets, etc.)
 */
const useServiciosCache = (activeView) => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const lastViewRef = useRef(activeView);

  // Obtener la función de fetch para la vista actual
  const fetchFn = ENTITY_FETCH_MAP[activeView];
  const entityType = VIEW_TO_ENTITY[activeView];

  // Usar el hook de cache de turismo
  const { data, loading, error, refetch, invalidate, version, isCached } =
    useTurismoCache({
      entityType,
      fetchFn: fetchFn ? () => fetchFn() : null,
      cacheKey: activeView,
      enabled: !!fetchFn,
      autoFetch: !!fetchFn,
    });

  // Refrescar cuando cambia la vista
  useEffect(() => {
    if (activeView !== lastViewRef.current) {
      lastViewRef.current = activeView;
      // El cambio de entityType causará un nuevo fetch automáticamente
    }
  }, [activeView]);

  /**
   * Función para invalidar el cache y recargar datos
   */
  const refreshData = useCallback(async () => {
    if (entityType) {
      invalidateCache(entityType);
    }
    setRefreshTrigger((prev) => prev + 1);
    return refetch();
  }, [entityType, refetch]);

  /**
   * Función para invalidar una entidad específica
   */
  const invalidateEntity = useCallback((entityTypeToInvalidate) => {
    invalidateCache(entityTypeToInvalidate);
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  /**
   * Obtiene estadísticas del cache
   */
  const getCacheStats = useCallback(() => {
    return getGlobalCacheStats();
  }, []);

  return {
    // Datos
    data,
    loading,
    error,

    // Estado del cache
    version,
    isCached,

    // Acciones
    refetch,
    refreshData,
    invalidateEntity,
    getCacheStats,

    // Metadata
    activeEntityType: entityType,
  };
};

export default useServiciosCache;
