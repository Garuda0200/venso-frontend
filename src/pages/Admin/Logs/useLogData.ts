/**
 * Hook para carga lazy de logs con filtros y paginación.
 * Principio de Responsabilidad Única: sólo gestiona datos.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { createAxiosInstance } from "../../../utils/axiosInstance";
import { DEFAULT_LAZY_PARAMS, DEFAULT_FILTERS } from "./logConstants";

export function useLogData(userRole, userDni) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalRecords, setTotalRecords] = useState(0);
  const [lazyParams, setLazyParams] = useState(DEFAULT_LAZY_PARAMS);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const isFetchingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const shouldRefreshRef = useRef(false);

  // ---------- Construir query params ----------
  const buildParams = useCallback(
    (overrideSize) => {
      const params = new URLSearchParams();
      params.append("page", lazyParams.page);
      params.append("size", overrideSize || lazyParams.rows);
      params.append("sort", lazyParams.sortField || "action_timestamp");
      params.append("order", lazyParams.sortOrder === 1 ? "asc" : "desc");

      if (filters.dniuser) params.append("dniuser", filters.dniuser);
      if (filters.operation) params.append("operation", filters.operation);
      if (filters.entity) params.append("entity", filters.entity);
      if (filters.dateFrom)
        params.append(
          "date_from",
          filters.dateFrom.toISOString().split("T")[0],
        );
      if (filters.dateTo)
        params.append("date_to", filters.dateTo.toISOString().split("T")[0]);

      return params;
    },
    [lazyParams, filters],
  );

  const getEndpoint = useCallback(() => {
    return userRole === 0 || userRole === 1 ? "/admin/logs" : "/admin/logs/my";
  }, [userRole]);

  // ---------- Cargar logs ----------
  const loadLogs = useCallback(
    async (forceReload = false) => {
      if (isFetchingRef.current && !forceReload) return;
      if (!forceReload && !shouldRefreshRef.current) return;

      shouldRefreshRef.current = false;
      setLoading(true);
      isFetchingRef.current = true;

      try {
        const axios = createAxiosInstance();
        const response = await axios.get(getEndpoint(), {
          params: buildParams(),
        });

        if (response.data?.success) {
          const formattedLogs = response.data.data.map((log) => ({
            ...log,
            formattedDate: new Date(log.action_timestamp).toLocaleString(),
            statusText: log.status ? "Éxito" : "Error",
          }));
          setLogs(formattedLogs);
          setTotalRecords(response.data.total || 0);
        } else {
          throw new Error(response.data?.message || "Error cargando logs");
        }
      } catch (error) {
        console.error("Error al cargar logs:", error);
        throw error;
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
      }
    },
    [buildParams, getEndpoint],
  );

  // ---------- Fetch para exportación (sin paginación visible) ----------
  const fetchAllForExport = useCallback(
    async (maxSize = 5000) => {
      const axios = createAxiosInstance();
      const params = buildParams(maxSize);
      params.set("page", "0");

      const response = await axios.get(getEndpoint(), { params });
      if (response.data?.success) {
        return response.data.data || [];
      }
      throw new Error(
        response.data?.message || "Error al obtener datos para exportar",
      );
    },
    [buildParams, getEndpoint],
  );

  // ---------- Carga inicial ----------
  useEffect(() => {
    if (!initialLoadDoneRef.current) {
      shouldRefreshRef.current = true;
      initialLoadDoneRef.current = true;
      loadLogs(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Re-carga en cambio de lazyParams ----------
  useEffect(() => {
    if (initialLoadDoneRef.current) {
      shouldRefreshRef.current = true;
      const timer = setTimeout(() => {
        if (shouldRefreshRef.current) loadLogs();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [lazyParams, loadLogs]);

  // ---------- Acciones de filtrado ----------
  const applyFilters = useCallback(() => {
    setLazyParams((prev) => ({ ...prev, first: 0, page: 0 }));
    shouldRefreshRef.current = true;
    setTimeout(() => loadLogs(true), 50);
  }, [loadLogs]);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setLazyParams((prev) => ({ ...prev, first: 0, page: 0 }));
    shouldRefreshRef.current = true;
    setTimeout(() => loadLogs(true), 50);
  }, [loadLogs]);

  const refresh = useCallback(() => {
    shouldRefreshRef.current = true;
    loadLogs(true);
  }, [loadLogs]);

  // ---------- Eventos de DataTable ----------
  const onPage = useCallback((event) => {
    setLazyParams((prev) => ({
      ...prev,
      first: event.first,
      rows: event.rows,
      page: event.page,
    }));
    shouldRefreshRef.current = true;
  }, []);

  const onSort = useCallback((event) => {
    setLazyParams((prev) => ({
      ...prev,
      sortField: event.sortField,
      sortOrder: event.sortOrder,
      first: 0,
      page: 0,
    }));
    shouldRefreshRef.current = true;
  }, []);

  return {
    logs,
    loading,
    totalRecords,
    lazyParams,
    filters,
    setFilters,
    applyFilters,
    resetFilters,
    refresh,
    onPage,
    onSort,
    fetchAllForExport,
  };
}
