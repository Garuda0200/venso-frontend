/**
 * useTurismoCache - Hook para cache de datos de turismo
 *
 * Este hook proporciona cache en memoria con invalidación automática
 * basada en versiones del backend. Cuando una entidad es creada,
 * actualizada o eliminada en el backend, la versión del cache cambia
 * y los datos se recargan automáticamente.
 *
 * @example
 * ```jsx
 * const { data, loading, error, refetch, invalidate, version } = useTurismoCache({
 * entityType: 'hotel',
 * fetchFn: () => api.get('/turismo/hoteles'),
 * });
 * ```
 */

import { useState, useEffect, useCallback, useRef } from "react";

// Cache global en memoria para evitar refetch innecesarios entre componentes
const memoryCache = new Map();

// Versiones conocidas de las entidades (sincronizadas con el backend)
const entityVersions = new Map();

// Listeners para notificar cambios de versión
const versionListeners = new Map();

/**
 * Tipos de entidades de turismo que pueden ser cacheadas
 */
export const TURISMO_ENTITY_TYPES = {
  HOTEL: "hotel",
  HABITACION: "habitacion",
  TREN: "tren",
  VAGONES: "vagones",
  VUELOS: "vuelos",
  TIPO_VUELO: "tipo_vuelo",
  TRANSPORTE: "transporte",
  MOVILIDAD: "movilidad",
  ENDOSE: "endose",
  TOUR: "tour",
  PERSONA: "persona",
  GUIA: "guia",
  RUTA: "ruta",
  TICKETS: "tickets",
  RESTAURANTE: "restaurante",
  SERVICIO_EXTRA: "servicio_extra",
  TARIFA: "tarifa",
};

/**
 * Entidades relacionadas - cuando una cambia, las otras también deben invalidarse
 * Esto replica la lógica del backend para mantener consistencia
 */
const RELATED_ENTITIES = {
  [TURISMO_ENTITY_TYPES.HABITACION]: [
    TURISMO_ENTITY_TYPES.HOTEL,
    TURISMO_ENTITY_TYPES.TARIFA,
  ],
  [TURISMO_ENTITY_TYPES.VAGONES]: [
    TURISMO_ENTITY_TYPES.TREN,
    TURISMO_ENTITY_TYPES.TARIFA,
  ],
  [TURISMO_ENTITY_TYPES.MOVILIDAD]: [
    TURISMO_ENTITY_TYPES.TRANSPORTE,
    TURISMO_ENTITY_TYPES.TARIFA,
  ],
  [TURISMO_ENTITY_TYPES.TOUR]: [
    TURISMO_ENTITY_TYPES.ENDOSE,
    TURISMO_ENTITY_TYPES.TARIFA,
  ],
  [TURISMO_ENTITY_TYPES.TIPO_VUELO]: [
    TURISMO_ENTITY_TYPES.VUELOS,
    TURISMO_ENTITY_TYPES.TARIFA,
  ],
  [TURISMO_ENTITY_TYPES.RUTA]: [
    TURISMO_ENTITY_TYPES.GUIA,
    TURISMO_ENTITY_TYPES.TARIFA,
  ],
  [TURISMO_ENTITY_TYPES.GUIA]: [TURISMO_ENTITY_TYPES.PERSONA],
  [TURISMO_ENTITY_TYPES.RESTAURANTE]: [TURISMO_ENTITY_TYPES.TARIFA],
  [TURISMO_ENTITY_TYPES.TICKETS]: [TURISMO_ENTITY_TYPES.TARIFA],
  [TURISMO_ENTITY_TYPES.SERVICIO_EXTRA]: [TURISMO_ENTITY_TYPES.TARIFA],
  [TURISMO_ENTITY_TYPES.HOTEL]: [TURISMO_ENTITY_TYPES.HABITACION],
  [TURISMO_ENTITY_TYPES.TREN]: [TURISMO_ENTITY_TYPES.VAGONES],
  [TURISMO_ENTITY_TYPES.TRANSPORTE]: [TURISMO_ENTITY_TYPES.MOVILIDAD],
  [TURISMO_ENTITY_TYPES.ENDOSE]: [TURISMO_ENTITY_TYPES.TOUR],
  [TURISMO_ENTITY_TYPES.VUELOS]: [TURISMO_ENTITY_TYPES.TIPO_VUELO],
  [TURISMO_ENTITY_TYPES.TARIFA]: [
    TURISMO_ENTITY_TYPES.HABITACION,
    TURISMO_ENTITY_TYPES.MOVILIDAD,
    TURISMO_ENTITY_TYPES.TIPO_VUELO,
    TURISMO_ENTITY_TYPES.RESTAURANTE,
    TURISMO_ENTITY_TYPES.TOUR,
    TURISMO_ENTITY_TYPES.RUTA,
    TURISMO_ENTITY_TYPES.VAGONES,
    TURISMO_ENTITY_TYPES.TICKETS,
    TURISMO_ENTITY_TYPES.SERVICIO_EXTRA,
  ],
  [TURISMO_ENTITY_TYPES.PERSONA]: [TURISMO_ENTITY_TYPES.GUIA],
};

/**
 * TTL del cache en milisegundos (desde .env o 5 minutos por defecto)
 */
const CACHE_TTL_MS =
  parseInt(import.meta.env.VITE_TURISMO_CACHE_TTL_MS) || 5 * 60 * 1000;

/**
 * Barrido periódico del memoryCache para eliminar entradas expiradas.
 * Evita crecimiento ilimitado del Map cuando las entidades no se re-leen.
 * Intervalo = 2× TTL (por defecto cada 10 minutos).
 */
const CACHE_SWEEP_INTERVAL_MS = CACHE_TTL_MS * 2;
let _sweepTimer = null;

const startCacheSweep = () => {
  if (_sweepTimer) return; // ya activo
  _sweepTimer = setInterval(() => {
    const now = Date.now();
    let swept = 0;
    for (const [key, entry] of memoryCache.entries()) {
      if (!entry || !entry.timestamp || now - entry.timestamp > CACHE_TTL_MS) {
        memoryCache.delete(key);
        swept++;
      }
    }
    if (swept > 0) {
      console.log(
        ` [Cache] Sweep: eliminadas ${swept} entradas expiradas, quedan ${memoryCache.size}`,
      );
    }
  }, CACHE_SWEEP_INTERVAL_MS);
};

// Iniciar barrido automáticamente al importar el módulo
startCacheSweep();

/**
 * Genera la clave del cache
 */
export const getTurismoCacheKey = (entityType, suffix = "") => {
  return `turismo:${entityType}${suffix ? `:${suffix}` : ""}`;
};

/**
 * Verifica si una entrada del cache está expirada
 */
const isCacheExpired = (entry) => {
  if (!entry || !entry.timestamp) return true;
  return Date.now() - entry.timestamp > CACHE_TTL_MS;
};

/**
 * Obtiene datos del cache en memoria
 */
export const getTurismoCachedData = (entityType, suffix = "") => {
  const key = getTurismoCacheKey(entityType, suffix);
  const entry = memoryCache.get(key);

  if (!entry || isCacheExpired(entry)) {
    if (entry) memoryCache.delete(key);
    return null;
  }

  console.log(` [Cache] HIT: ${key}`);
  return entry.data;
};

/**
 * Guarda datos en el cache en memoria
 */
export const setTurismoCachedData = (entityType, data, suffix = "") => {
  const key = getTurismoCacheKey(entityType, suffix);
  memoryCache.set(key, {
    data,
    timestamp: Date.now(),
  });
  console.log(
    ` [Cache] SET: ${key} (${Array.isArray(data) ? data.length + " items" : "object"})`,
  );
};

/**
 * Invalida el cache de una entidad y sus relacionadas
 */
export const invalidateCache = (entityType) => {
  const key = getTurismoCacheKey(entityType);

  // Eliminar todas las entradas que empiezan con este prefijo
  for (const cacheKey of memoryCache.keys()) {
    if (cacheKey.startsWith(`turismo:${entityType}`)) {
      memoryCache.delete(cacheKey);
    }
  }

  // Incrementar versión local
  const currentVersion = entityVersions.get(entityType) || 0;
  entityVersions.set(entityType, currentVersion + 1);

  // Notificar a los listeners
  const listeners = versionListeners.get(entityType);
  if (listeners) {
    listeners.forEach((listener) => listener(currentVersion + 1));
  }

  console.log(` [Cache] INVALIDATED: ${entityType}`);

  // Invalidar entidades relacionadas y notificar también a sus listeners.
  const related = RELATED_ENTITIES[entityType] || [];
  related.forEach((relatedType) => {
    for (const cacheKey of memoryCache.keys()) {
      if (cacheKey.startsWith(`turismo:${relatedType}`)) {
        memoryCache.delete(cacheKey);
      }
    }

    const relatedVersion = entityVersions.get(relatedType) || 0;
    const nextRelatedVersion = relatedVersion + 1;
    entityVersions.set(relatedType, nextRelatedVersion);

    const relatedListeners = versionListeners.get(relatedType);
    if (relatedListeners) {
      relatedListeners.forEach((listener) => listener(nextRelatedVersion));
    }

    console.log(` [Cache] INVALIDATED related: ${relatedType}`);
  });
};

/**
 * Limpia todo el cache
 */
export const clearAllCache = () => {
  memoryCache.clear();
  entityVersions.clear();
  console.log(` [Cache] CLEARED ALL`);
};

/**
 * Obtiene estadísticas del cache
 */
export const getCacheStats = () => {
  const stats = {
    totalEntries: memoryCache.size,
    entries: [],
    versions: Object.fromEntries(entityVersions),
  };

  for (const [key, entry] of memoryCache.entries()) {
    stats.entries.push({
      key,
      size: Array.isArray(entry.data) ? entry.data.length : 1,
      age: Date.now() - entry.timestamp,
      expired: isCacheExpired(entry),
    });
  }

  return stats;
};

/**
 * Hook principal para cache de datos de turismo
 *
 * @param {Object} options
 * @param {string} options.entityType - Tipo de entidad (hotel, habitacion, etc.)
 * @param {Function} options.fetchFn - Función para obtener los datos
 * @param {string} options.cacheKey - Clave adicional para diferenciar sub-consultas
 * @param {boolean} options.enabled - Si está habilitado (default: true)
 * @param {boolean} options.autoFetch - Si debe hacer fetch automáticamente (default: true)
 */
const useTurismoCache = ({
  entityType,
  fetchFn,
  cacheKey = "",
  enabled = true,
  autoFetch = true,
}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(entityVersions.get(entityType) || 0);

  const isMountedRef = useRef(true);
  const fetchingRef = useRef(false);

  // Registrar listener para cambios de versión
  useEffect(() => {
    const handleVersionChange = (newVersion) => {
      setVersion(newVersion);
      // Refetch cuando cambia la versión
      if (enabled && autoFetch) {
        fetchData(true);
      }
    };

    if (!versionListeners.has(entityType)) {
      versionListeners.set(entityType, new Set());
    }
    versionListeners.get(entityType).add(handleVersionChange);

    return () => {
      versionListeners.get(entityType)?.delete(handleVersionChange);
    };
  }, [entityType, enabled, autoFetch]);

  // Función para obtener datos
  const fetchData = useCallback(
    async (forceRefresh = false) => {
      if (!enabled || !fetchFn) return;
      if (fetchingRef.current) return;

      // Verificar cache primero (si no es force refresh)
      if (!forceRefresh) {
        const cached = getTurismoCachedData(entityType, cacheKey);
        if (cached !== null) {
          setData(cached);
          setLoading(false);
          return cached;
        }
      }

      try {
        fetchingRef.current = true;
        setLoading(true);
        setError(null);

        const result = await fetchFn();

        if (isMountedRef.current) {
          setData(result);
          setTurismoCachedData(entityType, result, cacheKey);
        }

        return result;
      } catch (err) {
        if (isMountedRef.current) {
          setError(err.message || "Error al cargar datos");
          console.error(` [Cache] Error fetching ${entityType}:`, err);
        }
        return null;
      } finally {
        fetchingRef.current = false;
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [enabled, fetchFn, entityType, cacheKey],
  );

  // Auto-fetch en mount si está habilitado
  useEffect(() => {
    isMountedRef.current = true;

    if (enabled && autoFetch) {
      fetchData();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [enabled, autoFetch, fetchData]);

  // Función para invalidar y refrescar
  const invalidate = useCallback(() => {
    invalidateCache(entityType);
    return fetchData(true);
  }, [entityType, fetchData]);

  // Función para refetch manual
  const refetch = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch,
    invalidate,
    version,
    isCached: getTurismoCachedData(entityType, cacheKey) !== null,
  };
};

/**
 * Hook para obtener múltiples entidades con cache
 */
export const useTurismoCacheMultiple = (entityTypes) => {
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [data, setData] = useState({});

  useEffect(() => {
    // Este hook es para cargar múltiples entidades a la vez
    // La implementación depende del uso específico
    setLoading(false);
  }, [entityTypes]);

  return { data, loading, errors };
};

/**
 * Función helper para usar en las APIs de CRUD
 * Invalida el cache después de una operación exitosa
 */
export const withCacheInvalidation = (entityType) => async (operation) => {
  const result = await operation();
  invalidateCache(entityType);
  return result;
};

export default useTurismoCache;
