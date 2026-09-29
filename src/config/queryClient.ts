import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Tiempo que los datos se consideran frescos (30 minutos)
      staleTime: 1000 * 60 * 30, // 30 minutos

      // Tiempo que los datos permanecen en caché después de unmount (2 horas)
      // Permite navegar entre páginas sin re-fetch
      gcTime: 1000 * 60 * 120, // 2 horas

      // NO refetch al enfocar la ventana — evita ráfagas de requests
      // al cambiar de pestaña/aplicación
      refetchOnWindowFocus: false,

      // Refetch al reconectar - útil en conexiones inestables
      refetchOnReconnect: true,

      // Reintentos en caso de error (con backoff exponencial)
      retry: 2,

      // Tiempo de espera antes de reintentar (aumenta exponencialmente)
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      // No reintentar mutaciones automáticamente para evitar duplicados
      retry: false,
    },
  },
});

/**
 * Keys de query organizadas por recurso
 * Esto facilita la invalidación de caché relacionada
 */
export const queryKeys = {
  // Vouchers de Reserva
  vouchersReserva: {
    all: ["vouchers-reserva"],
    lists: () => [...queryKeys.vouchersReserva.all, "list"],
    list: (filters) => [...queryKeys.vouchersReserva.lists(), filters],
    details: () => [...queryKeys.vouchersReserva.all, "detail"],
    detail: (id) => [...queryKeys.vouchersReserva.details(), id],
    withRelations: () => [...queryKeys.vouchersReserva.all, "with-relations"],
    withRelation: (id) => [...queryKeys.vouchersReserva.withRelations(), id],
  },

  // Vouchers de Venta
  vouchersVenta: {
    all: ["vouchers-venta"],
    lists: () => [...queryKeys.vouchersVenta.all, "list"],
    list: (filters) => [...queryKeys.vouchersVenta.lists(), filters],
    details: () => [...queryKeys.vouchersVenta.all, "detail"],
    detail: (id) => [...queryKeys.vouchersVenta.details(), id],
    withCotizaciones: () => [...queryKeys.vouchersVenta.all, "with-cotizacion"], // Lista de todos con cotización
    withCotizacion: (id) => [...queryKeys.vouchersVenta.withCotizaciones(), id], // Uno específico con cotización
  },

  // Cotizaciones
  cotizaciones: {
    all: ["cotizaciones"],
    lists: () => [...queryKeys.cotizaciones.all, "list"],
    list: (filters) => [...queryKeys.cotizaciones.lists(), filters],
    details: () => [...queryKeys.cotizaciones.all, "detail"],
    detail: (id) => [...queryKeys.cotizaciones.details(), id],
  },

  // Paquetes turísticos
  paquetes: {
    all: ["paquetes"],
    lists: () => [...queryKeys.paquetes.all, "list"],
    list: (filters) => [...queryKeys.paquetes.lists(), filters],
    details: () => [...queryKeys.paquetes.all, "detail"],
    detail: (id) => [...queryKeys.paquetes.details(), id],
  },

  // Servicios turísticos universales (mismo resultado para todos los usuarios)
  servicios: {
    hoteles: ["turismo", "hoteles"],
    habitacionesAll: ["turismo", "habitaciones", "all", "con-tarifas"],
    habitaciones: (hotelId) => ["turismo", "habitaciones", "hotel", hotelId, "con-tarifas"],
    trenes: ["turismo", "trenes"],
    vagones: (trenId) => ["turismo", "vagones", "tren", trenId, "con-tarifas"],
    vagonesAll: ["turismo", "vagones", "all", "con-tarifas"],
    restaurantes: ["turismo", "restaurantes"],
    transportes: ["turismo", "transportes"],
    movilidades: ["turismo", "movilidades", "con-tarifas"],
    movilidadesByTransporte: (transporteId) => [
      "turismo",
      "movilidades",
      "transporte",
      transporteId,
      "con-tarifas",
    ],
    guias: ["turismo", "guias"],
    rutas: ["turismo", "rutas"],
    rutasByGuia: (guiaId) => ["turismo", "rutas", "guia", guiaId, "con-tarifas"],
    tickets: ["turismo", "tickets"],
    ticketsByParent: (parentId) => ["turismo", "tickets", parentId, "con-tarifas"],
    endoses: ["turismo", "endoses"],
    endosesByParent: (parentId) => ["turismo", "endoses", parentId, "con-tarifas"],
    tours: ["turismo", "tours"],
    toursByEndose: (endoseId) => ["turismo", "tours", "endose", endoseId, "con-tarifas"],
    vuelos: ["turismo", "vuelos"],
    tiposVuelo: ["turismo", "tipos-vuelo", "con-tarifas"],
    tiposVueloByVuelo: (vueloId) => [
      "turismo",
      "tipos-vuelo",
      "vuelo",
      vueloId,
      "con-tarifas",
    ],
    personas: ["turismo", "personas"],
    serviciosExtras: ["turismo", "servicios-extras", "con-tarifas"],
  },
};

export default queryClient;
