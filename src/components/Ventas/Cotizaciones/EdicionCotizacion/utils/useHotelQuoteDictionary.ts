import { useCallback, useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient, queryKeys } from "../../../../../config/queryClient";

export const resolveQuotationTariffType = (quotation = {}) => {
  const explicit = String(
    quotation?.tariff_type ||
      quotation?.tariffType ||
      quotation?.selectedHotel?.tariffType ||
      quotation?.selected_hotel?.tariffType ||
      quotation?.hotel?.tariffType ||
      quotation?.hotel_detalle?.tariffType ||
      "",
  )
    .trim()
    .toLowerCase();

  if (["interna", "externa", "cotizacion"].includes(explicit)) {
    return explicit;
  }

  return String(quotation?.business_type || quotation?.businessType || "B2C")
    .trim()
    .toUpperCase() === "B2B"
    ? "interna"
    : "externa";
};

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeHotelCategory = (hotel = {}) => {
  const raw =
    hotel?.categoria ||
    hotel?.category ||
    hotel?.clasificacion ||
    hotel?.tipo_categoria ||
    "Sin categoría";
  const normalized = normalizeText(raw);
  if (!normalized) return "sin-categoria";

  const stars = (String(raw).match(/⭐/g) || []).length;
  if (stars >= 2 && stars <= 5) return String(stars);
  if (normalized.includes("3") && /superior|\bsup\b/.test(normalized)) {
    return "3s";
  }
  const digit = normalized.match(/(?:^|\D)([2-5])(?:\D|$)/);
  if (digit) return digit[1];

  return normalized.replace(/\s+/g, "-");
};

const getHotelCategoryLabel = (hotel = {}, category = "") =>
  String(
    hotel?.categoria ||
      hotel?.category ||
      hotel?.clasificacion ||
      (category === "sin-categoria" ? "Sin categoría" : category),
  ).trim();

const tariffMatchesAgency = (tariff, agencyId) => {
  const scope = Number(agencyId || 0);
  if (!scope) return true;
  const ids = Array.isArray(tariff?.agency_ids) ? tariff.agency_ids : [];
  return ids.map(Number).includes(scope);
};

const buildManualTariff = ({ tariffType, agencyId }) => ({
  id_tarifa: null,
  agency_ids: agencyId ? [Number(agencyId)] : [],
  tipo_tarifa: tariffType,
  precio: 0,
  precio_compartido: 0,
  precio_privado: 0,
  precio_unico: true,
  manual: true,
});

const processRooms = (rooms = [], { tariffType, agencyId }) =>
  (Array.isArray(rooms) ? rooms : []).map((room) => {
    const matchingTariffs = (Array.isArray(room?.tarifas) ? room.tarifas : []).filter(
      (tariff) =>
        String(tariff?.tipo_tarifa || "").toLowerCase() === tariffType &&
        tariffMatchesAgency(tariff, agencyId),
    );

    return {
      ...room,
      tarifas:
        matchingTariffs.length > 0
          ? matchingTariffs
          : [buildManualTariff({ tariffType, agencyId })],
      manualPricing: matchingTariffs.length === 0,
    };
  });

/**
 * Construye un catálogo hotelero universal. Todos los hoteles activos se
 * agrupan por su categoría real; la agencia solo filtra las tarifas.
 */
export const buildHotelQuoteDictionary = ({
  hotels = [],
  roomsByHotelId = {},
  tariffType = "externa",
  agencyId = 1,
}) => {
  const grouped = new Map();

  (Array.isArray(hotels) ? hotels : []).forEach((hotel) => {
    const hotelId = hotel?.id_hotel || hotel?.id;
    if (!hotelId) return;

    const category = normalizeHotelCategory(hotel);
    const rooms = processRooms(roomsByHotelId[hotelId], {
      tariffType,
      agencyId,
    });
    const option = { hotel, rooms };
    const current = grouped.get(category) || {
      category,
      categoryLabel: getHotelCategoryLabel(hotel, category),
      hotels: [],
    };
    current.hotels.push(option);
    grouped.set(category, current);
  });

  const byCategory = {};
  grouped.forEach((group, category) => {
    const first = group.hotels[0];
    if (!first) return;
    byCategory[category] = {
      category,
      categoryLabel: group.categoryLabel,
      hotel: first.hotel,
      rooms: first.rooms,
      hotels: group.hotels,
      luxuryManual: false,
    };
  });

  const roomTypeMap = new Map();
  Object.entries(byCategory).forEach(([category, pack]) => {
    (pack?.hotels || []).forEach(({ rooms }) => {
      (rooms || []).forEach((room) => {
        const label =
          room?.tipo_habitacion ||
          room?.habitacion?.tipo_habitacion ||
          "Habitación";
        const key = normalizeText(label);
        if (!key) return;
        const current = roomTypeMap.get(key) || {
          key,
          label: String(label).trim(),
          availability: {},
        };
        current.availability[category] = true;
        roomTypeMap.set(key, current);
      });
    });
  });

  return {
    byCategory,
    roomTypes: Array.from(roomTypeMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
  };
};

const fetchHotels = async (axios) => {
  const response = await axios.get("/turismo/hoteles", {
    params: { activo: true },
  });
  return response.data?.data || response.data || [];
};

const fetchHotelRooms = async ({ axios, hotelId }) => {
  // El catálogo de habitaciones es universal. Se consulta completo y la agencia
  // se usa únicamente para escoger las tarifas aplicables en `processRooms`.
  // Así una habitación sin tarifa todavía puede cotizarse con precio manual.
  const response = await axios.get(
    `/turismo/habitaciones/hotel/${hotelId}/con-tarifas`,
  );
  return response.data?.data || response.data || [];
};

export const fetchHotelQuoteDictionaryData = async ({
  axios,
  tariffType = "externa",
  agencyId = 1,
}) => {
  const hotels = await queryClient.fetchQuery({
    queryKey: queryKeys.servicios.hoteles,
    queryFn: () => fetchHotels(axios),
    staleTime: 1000 * 60 * 30,
  });

  const roomResults = await Promise.all(
    (hotels || []).map(async (hotel) => {
      const hotelId = hotel?.id_hotel || hotel?.id;
      if (!hotelId) return null;
      const rooms = await queryClient.fetchQuery({
        queryKey: queryKeys.servicios.habitaciones(hotelId),
        queryFn: () => fetchHotelRooms({ axios, hotelId }),
        staleTime: 1000 * 60 * 30,
      });
      return { hotelId, rooms };
    }),
  );

  const roomsByHotelId = {};
  roomResults.filter(Boolean).forEach(({ hotelId, rooms }) => {
    roomsByHotelId[hotelId] = rooms;
  });

  return buildHotelQuoteDictionary({
    hotels,
    roomsByHotelId,
    tariffType,
    agencyId,
  });
};

export default function useHotelQuoteDictionary({
  axios,
  tariffType = "externa",
  agencyId = 1,
  enabled = true,
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { data: hotels = [] } = useQuery({
    queryKey: queryKeys.servicios.hoteles,
    queryFn: () => fetchHotels(axios),
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 120,
    refetchOnWindowFocus: false,
    enabled,
  });

  const hotelIds = useMemo(
    () =>
      (hotels || [])
        .map((hotel) => hotel?.id_hotel || hotel?.id)
        .filter(Boolean),
    [hotels],
  );
  const hotelIdsKey = hotelIds.join("|");

  const roomResults = useQueries({
    queries: (enabled ? hotelIds : []).map((hotelId) => ({
      queryKey: queryKeys.servicios.habitaciones(hotelId),
      queryFn: () => fetchHotelRooms({ axios, hotelId }),
      staleTime: 1000 * 60 * 30,
      gcTime: 1000 * 60 * 120,
      refetchOnWindowFocus: false,
      enabled: Boolean(hotelId),
    })),
  });

  const roomResultsKey = roomResults
    .map((query, index) => {
      const hotelId = hotelIds[index] || "";
      return `${hotelId}:${query.dataUpdatedAt || 0}:${Array.isArray(query.data) ? query.data.length : 0}`;
    })
    .join("|");

  const roomsByHotelId = useMemo(() => {
    const next = {};
    hotelIds.forEach((hotelId, index) => {
      next[hotelId] = roomResults[index]?.data || [];
    });
    return next;
  }, [hotelIdsKey, roomResultsKey]);

  const { byCategory, roomTypes } = useMemo(
    () =>
      buildHotelQuoteDictionary({
        hotels,
        roomsByHotelId,
        tariffType,
        agencyId,
      }),
    [hotels, roomsByHotelId, tariffType, agencyId],
  );

  const fetchDictionary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.servicios.hoteles,
      });
      await Promise.all(
        hotelIds.map((hotelId) =>
          queryClient.invalidateQueries({
            queryKey: queryKeys.servicios.habitaciones(hotelId),
          }),
        ),
      );
    } catch (cause) {
      console.error(cause);
      setError("No fue posible refrescar el catálogo de hoteles.");
    } finally {
      setLoading(false);
    }
  }, [hotelIdsKey, queryClient]);

  const isLoading = enabled && (roomResults.some((query) => query.isLoading) || loading);
  const anyError = roomResults.some((query) => query.error) || error;

  return {
    loading: isLoading,
    error: anyError ? "No fue posible construir el catálogo de hoteles." : null,
    roomTypes,
    byCategory,
    fetchDictionary,
  };
}
