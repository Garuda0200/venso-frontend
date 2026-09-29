/**
 * useServicePickerCache - Hook para cachear servicios en ServicePicker
 *
 * Este hook proporciona cache para los servicios de turismo
 * utilizados en ServicePicker, evitando llamadas innecesarias al backend.
 *
 * Implementación actual: delega en TanStack Query (React Query) para que
 * los datos turísticos universales se compartan con el resto de la aplicación.
 */

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createAxiosInstance } from "../../../../../../../utils/axiosInstance";
import { queryKeys } from "../../../../../../../config/queryClient";
import {
  buildServicePickerTariffRequestParams,
  filterTariffsForContext,
  normalizeTariffYear,
  prepareServicePickerCatalogRows,
} from "../utils/tariffContext";
export {
  filterTariffsForContext,
  getTariffAgencyIds,
  tariffMatchesAgency,
} from "../utils/tariffContext";

const getAxios = () => createAxiosInstance();

const VISIBILITY_SUBJECT_KEYS = [
  "hotel",
  "habitacion",
  "transporte",
  "movilidad",
  "tren",
  "vagon",
  "vuelo",
  "tipo_vuelo",
  "guia",
  "ruta",
  "endose",
  "tour",
  "restaurante",
  "ticket",
  "servicio_extra",
];

const normalizePlatform = (platform) =>
  String(platform || "")
    .trim()
    .toLowerCase();

export const shouldFilterServicePickerVisibility = (platform) =>
  normalizePlatform(platform) === "venso";

export const getVisibilitySubject = (item) => {
  if (!item || typeof item !== "object") return item;
  for (const key of VISIBILITY_SUBJECT_KEYS) {
    if (item[key] && typeof item[key] === "object") {
      return item[key];
    }
  }
  return item;
};

export const isVisibleInServicePicker = (item, platform = "venso") => {
  if (!shouldFilterServicePickerVisibility(platform)) return true;
  const subject = getVisibilitySubject(item);
  return subject?.mostrar_en_servicepicker !== false;
};

export const filterVisibleForServicePicker = (data, platform = "venso") => {
  if (!Array.isArray(data)) return data;
  if (!shouldFilterServicePickerVisibility(platform)) return data;
  return data.filter((item) => isVisibleInServicePicker(item, platform));
};

/**
 * Mapea un endpoint de ServicePicker a queryKey y queryFn de TanStack Query.
 */
const endpointToBaseQueryConfig = (endpoint) => {
  const axios = getAxios();

  // Hoteles
  if (endpoint === "hoteles") {
    return {
      queryKey: queryKeys.servicios.hoteles,
      queryFn: async () => {
        const response = await axios.get("/turismo/hoteles", {
          params: { activo: true },
        });
        return response.data?.data || response.data || [];
      },
    };
  }

  if (endpoint === "habitaciones/con-tarifas") {
    return {
      queryKey: queryKeys.servicios.habitacionesAll,
      queryFn: async () => {
        const response = await axios.get("/turismo/habitaciones/con-tarifas");
        return response.data?.data || response.data || [];
      },
    };
  }

  if (endpoint.startsWith("habitaciones/hotel/") && endpoint.endsWith("/con-tarifas")) {
    const hotelId = endpoint.split("/")[2];
    return {
      queryKey: queryKeys.servicios.habitaciones(hotelId),
      queryFn: async () => {
        const response = await axios.get(`/turismo/${endpoint}`);
        return response.data?.data || response.data || [];
      },
    };
  }

  // Transportes / Movilidades
  if (endpoint === "transportes") {
    return {
      queryKey: queryKeys.servicios.transportes,
      queryFn: async () => {
        const response = await axios.get("/turismo/transportes");
        return response.data?.data || response.data || [];
      },
    };
  }

  if (endpoint === "movilidades/con-tarifas") {
    return {
      queryKey: queryKeys.servicios.movilidades,
      queryFn: async () => {
        const response = await axios.get("/turismo/movilidades/con-tarifas");
        return response.data?.data || response.data || [];
      },
    };
  }

  if (endpoint.startsWith("movilidades/transporte/") && endpoint.endsWith("/con-tarifas")) {
    const transporteId = endpoint.split("/")[2];
    return {
      queryKey: queryKeys.servicios.movilidadesByTransporte(transporteId),
      queryFn: async () => {
        const response = await axios.get(`/turismo/${endpoint}`);
        return response.data?.data || response.data || [];
      },
    };
  }

  // Trenes / Vagones
  if (endpoint === "trenes") {
    return {
      queryKey: queryKeys.servicios.trenes,
      queryFn: async () => {
        const response = await axios.get("/turismo/trenes");
        return response.data?.data || response.data || [];
      },
    };
  }

  if (endpoint === "vagones/con-tarifas") {
    return {
      queryKey: queryKeys.servicios.vagonesAll,
      queryFn: async () => {
        const response = await axios.get("/turismo/vagones/con-tarifas");
        return response.data?.data || response.data || [];
      },
    };
  }

  if (endpoint.startsWith("vagones/tren/") && endpoint.endsWith("/con-tarifas")) {
    const trenId = endpoint.split("/")[2];
    return {
      queryKey: queryKeys.servicios.vagones(trenId),
      queryFn: async () => {
        const response = await axios.get(`/turismo/${endpoint}`);
        return response.data?.data || response.data || [];
      },
    };
  }

  // Vuelos / Tipos de vuelo
  if (endpoint === "vuelos") {
    return {
      queryKey: queryKeys.servicios.vuelos,
      queryFn: async () => {
        const response = await axios.get("/turismo/vuelos");
        return response.data?.data || response.data || [];
      },
    };
  }

  if (endpoint === "tipos-vuelo/con-tarifas") {
    return {
      queryKey: queryKeys.servicios.tiposVuelo,
      queryFn: async () => {
        const response = await axios.get("/turismo/tipos-vuelo/con-tarifas");
        return response.data?.data || response.data || [];
      },
    };
  }

  if (endpoint.startsWith("tipos-vuelo/vuelo/") && endpoint.endsWith("/con-tarifas")) {
    const vueloId = endpoint.split("/")[2];
    return {
      queryKey: queryKeys.servicios.tiposVueloByVuelo(vueloId),
      queryFn: async () => {
        const response = await axios.get(`/turismo/${endpoint}`);
        return response.data?.data || response.data || [];
      },
    };
  }

  // Guías / Rutas
  if (endpoint === "guias") {
    return {
      queryKey: queryKeys.servicios.guias,
      queryFn: async () => {
        const response = await axios.get("/turismo/guias");
        return response.data?.data || response.data || [];
      },
    };
  }

  if (endpoint === "rutas/con-tarifas") {
    return {
      queryKey: queryKeys.servicios.rutas,
      queryFn: async () => {
        const response = await axios.get("/turismo/rutas/con-tarifas");
        return response.data?.data || response.data || [];
      },
    };
  }

  if (endpoint.startsWith("rutas/guia/") && endpoint.endsWith("/con-tarifas")) {
    const guiaId = endpoint.split("/")[2];
    return {
      queryKey: queryKeys.servicios.rutasByGuia(guiaId),
      queryFn: async () => {
        const response = await axios.get(`/turismo/${endpoint}`);
        return response.data?.data || response.data || [];
      },
    };
  }

  // Endoses / Tours
  if (endpoint === "endoses") {
    return {
      queryKey: queryKeys.servicios.endoses,
      queryFn: async () => {
        const response = await axios.get("/turismo/endoses");
        return response.data?.data || response.data || [];
      },
    };
  }

  if (endpoint === "tours/con-tarifas") {
    return {
      queryKey: queryKeys.servicios.tours,
      queryFn: async () => {
        const response = await axios.get("/turismo/tours/con-tarifas");
        return response.data?.data || response.data || [];
      },
    };
  }

  if (endpoint.startsWith("tours/endose/") && endpoint.endsWith("/con-tarifas")) {
    const endoseId = endpoint.split("/")[2];
    return {
      queryKey: queryKeys.servicios.toursByEndose(endoseId),
      queryFn: async () => {
        const response = await axios.get(`/turismo/${endpoint}`);
        return response.data?.data || response.data || [];
      },
    };
  }

  // Restaurantes / Tickets (standalone con tarifas)
  if (endpoint === "restaurantes") {
    return {
      queryKey: queryKeys.servicios.restaurantes,
      queryFn: async () => {
        const response = await axios.get("/turismo/restaurantes");
        return response.data?.data || response.data || [];
      },
    };
  }

  if (endpoint === "restaurantes/con-tarifas") {
    return {
      queryKey: queryKeys.servicios.restaurantes,
      queryFn: async () => {
        const response = await axios.get("/turismo/restaurantes/con-tarifas");
        return response.data?.data || response.data || [];
      },
    };
  }

  if (endpoint.startsWith("restaurantes/") && endpoint.endsWith("/con-tarifas")) {
    const parentId = endpoint.split("/")[1];
    return {
      queryKey: [...queryKeys.servicios.restaurantes, "detail", parentId],
      queryFn: async () => {
        const response = await axios.get(`/turismo/${endpoint}`);
        return response.data?.data || response.data || [];
      },
    };
  }

  if (endpoint === "tickets") {
    return {
      queryKey: queryKeys.servicios.tickets,
      queryFn: async () => {
        const response = await axios.get("/turismo/tickets");
        return response.data?.data || response.data || [];
      },
    };
  }

  if (endpoint === "tickets/con-tarifas") {
    return {
      queryKey: queryKeys.servicios.tickets,
      queryFn: async () => {
        const response = await axios.get("/turismo/tickets/con-tarifas");
        return response.data?.data || response.data || [];
      },
    };
  }

  if (endpoint.startsWith("tickets/") && endpoint.endsWith("/con-tarifas")) {
    const parentId = endpoint.split("/")[1];
    return {
      queryKey: queryKeys.servicios.ticketsByParent(parentId),
      queryFn: async () => {
        const response = await axios.get(`/turismo/${endpoint}`);
        return response.data?.data || response.data || [];
      },
    };
  }

  // Servicios extras
  if (endpoint === "servicio-extra/con-tarifas" || endpoint === "servicios-extras/con-tarifas") {
    return {
      queryKey: queryKeys.servicios.serviciosExtras,
      queryFn: async () => {
        const response = await axios.get("/turismo/servicio-extra/con-tarifas");
        return response.data?.data || response.data || [];
      },
    };
  }

  // Fallback genérico
  return {
    queryKey: ["turismo", "servicepicker", endpoint],
    queryFn: async () => {
      const response = await axios.get(`/turismo/${endpoint}`);
      return response.data?.data || response.data || [];
    },
  };
};

const endpointToQueryConfig = (endpoint, options = {}) => {
  const baseConfig = endpointToBaseQueryConfig(endpoint);
  const tariffType = String(options?.tariffType || "")
    .trim()
    .toLowerCase();
  const agencyId = Number(options?.agencyId || 0) || null;
  const tariffYear = normalizeTariffYear(options?.tariffYear ?? options?.anio);
  const hasTariffs = String(endpoint).includes("con-tarifas");

  if (!hasTariffs) {
    return baseConfig;
  }

  return {
    queryKey: [
      ...baseConfig.queryKey,
      "tariff-type",
      tariffType || "all",
      "agency",
      agencyId || "all",
      "year",
      tariffYear || "all",
    ],
    queryFn: async () => {
      const axios = getAxios();
      const response = await axios.get(`/turismo/${endpoint}`, {
        // No enviar `tipo_tarifa`: el backend descarta servicios sin una
        // coincidencia exacta y eso vacía el catálogo importado. El tipo se
        // usa abajo sólo como preferencia comercial de ServicePicker.
        params: buildServicePickerTariffRequestParams(agencyId, tariffYear),
      });
      const rows = response.data?.data || response.data || [];
      return prepareServicePickerCatalogRows(rows, agencyId, tariffType, tariffYear);
    },
  };
};

/**
 * Hook para gestionar el cache de ServicePicker mediante TanStack Query.
 */
const useServicePickerCache = () => {
  const queryClient = useQueryClient();

  /**
   * Fetch con cache para cualquier endpoint de turismo.
   * Delega en queryClient.fetchQuery para aprovechar el cache global de React Query.
   */
  const fetchWithCache = useCallback(
    async (endpoint, forceRefresh = false, options = {}) => {
      const { queryKey, queryFn } = endpointToQueryConfig(endpoint, options);

      const data = await queryClient.fetchQuery({
        queryKey,
        queryFn,
        staleTime: forceRefresh ? 0 : 1000 * 60 * 30, // 30 minutos por defecto
      });

      return data;
    },
    [queryClient],
  );

  /**
   * Fetch servicios padre
   */
  const fetchParentServices = useCallback(
    async (category, forceRefresh = false) => {
      const data = await fetchWithCache(category.endpoint, forceRefresh);
      return filterVisibleForServicePicker(data);
    },
    [fetchWithCache],
  );

  /**
   * Fetch servicios hijo con tarifas
   */
  const fetchChildServicesWithTarifas = useCallback(
    async (category, forceRefresh = false) => {
      let endpoint;

      if (category.id === "guias") {
        endpoint = "rutas/con-tarifas";
      } else if (category.id === "vuelos") {
        endpoint = "tipos-vuelo/con-tarifas";
      } else if (category.id === "endoses") {
        endpoint = "tours/con-tarifas";
      } else if (category.isStandalone && category.hasTarifas) {
        endpoint = `${category.endpoint}/${category.childEndpoint}`;
      } else {
        endpoint = `${category.childEndpoint.split("/")[0]}/con-tarifas`;
      }

      const data = await fetchWithCache(endpoint, forceRefresh);
      return filterVisibleForServicePicker(data);
    },
    [fetchWithCache],
  );

  /**
   * Fetch servicios hijo por padre específico
   */
  const fetchChildServicesByParent = useCallback(
    async (category, parentId, forceRefresh = false) => {
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

      const data = await fetchWithCache(endpoint, forceRefresh);
      return filterVisibleForServicePicker(data);
    },
    [fetchWithCache],
  );

  /**
   * Invalida el cache de una categoría en TanStack Query.
   */
  const invalidateCategoryCache = useCallback(
    (categoryId) => {
      const map = {
        hoteles: queryKeys.servicios.hoteles,
        habitaciones: queryKeys.servicios.hoteles,
        transportes: queryKeys.servicios.transportes,
        movilidades: queryKeys.servicios.movilidades,
        trenes: queryKeys.servicios.trenes,
        vagones: queryKeys.servicios.vagonesAll,
        vuelos: queryKeys.servicios.vuelos,
        "tipos-vuelo": queryKeys.servicios.tiposVuelo,
        endoses: queryKeys.servicios.endoses,
        tours: queryKeys.servicios.tours,
        guias: queryKeys.servicios.guias,
        rutas: queryKeys.servicios.rutas,
        restaurantes: queryKeys.servicios.restaurantes,
        tickets: queryKeys.servicios.tickets,
        extras: queryKeys.servicios.serviciosExtras,
        "servicio-extra": queryKeys.servicios.serviciosExtras,
        "servicios-extras": queryKeys.servicios.serviciosExtras,
      };
      const key = map[categoryId];
      if (key) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      console.log(`[DELETE] [ServicePickerCache] INVALIDATED: ${categoryId}`);
    },
    [queryClient],
  );

  /**
   * Limpia todo el cache relacionado con servicios turísticos.
   */
  const clearCache = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["turismo"] });
    console.log(` [ServicePickerCache] CLEARED ALL`);
  }, [queryClient]);

  /**
   * Obtiene estadísticas básicas del cache de TanStack Query.
   */
  const getCacheStats = useCallback(() => {
    const queries = queryClient.getQueryCache().findAll({ queryKey: ["turismo"] });
    return {
      totalEntries: queries.length,
      entries: queries.map((q) => ({
        key: q.queryKey,
        state: q.state.status,
        dataUpdatedAt: q.state.dataUpdatedAt,
      })),
    };
  }, [queryClient]);

  return {
    loading: {},
    errors: {},
    fetchWithCache,
    fetchParentServices,
    fetchChildServicesWithTarifas,
    fetchChildServicesByParent,
    invalidateCategoryCache,
    clearCache,
    getCacheStats,
  };
};

export default useServicePickerCache;

