import { useState, useEffect, useMemo } from "react";
import axiosInstance from "../../../../../../utils/axiosInstance";
import { queryClient, queryKeys } from "../../../../../../config/queryClient";
import "./HotelItineraryModal.scss";
import {
  FaTimes,
  FaHotel,
  FaBed,
  FaCalendarCheck,
  FaUsers,
  FaCheck,
  FaTrash,
  FaPlus,
  FaStar,
  FaArrowLeft,
} from "react-icons/fa";
import { MdSelectAll } from "react-icons/md";
import {
  createUnifiedService,
  getHotelOccupancyInfo,
} from "../../utils/unifiedServiceManager";
import { getParentId } from "../ServicePicker/utils/serviceTypes";
import { convertRoomTariffsToDollars } from "../../utils/tariffCurrency";

// Componentes modulares
import {
  CategorySelection,
  HotelSelection,
  RoomSelection,
  ReviewSelection,
  // Utilidades
  getChildBedPolicy,
  getPeopleStats,
  capacityFromRoom,
  getAssignedBedCountFromItinerary,
  isHotelService,
  getRoomCapacityFromType,
  isExtraBedRoom,
} from "./HotelItinerary";

// =============================================
// LÓGICA DE DISTRIBUCIÓN AUTOMÁTICA
// =============================================
const pickTariffForRoom = (
  room,
  preferTariff,
  pkgType,
  defaultTariffType = "externa",
) => {
  // Usar tarifa preferida, o el tipo de tarifa por defecto según el contexto
  const tipoPreferido = preferTariff?.tipo_tarifa || defaultTariffType;
  const roomTariffs = Array.isArray(room.tarifas) ? room.tarifas : [];
  let t =
    roomTariffs.find((x) => x.tipo_tarifa === tipoPreferido) || roomTariffs[0];
  if (!t) return null;
  const precio =
    pkgType === "privado"
      ? (t.precio_privado ?? t.precio_compartido ?? t.precio ?? 0)
      : (t.precio_compartido ?? t.precio_privado ?? t.precio ?? 0);
  return { ...t, _unitPrice: Number(precio || 0) };
};

const computeAutoDistributions = (
  rooms,
  hotelCategory,
  hotelCity,
  peopleDetails,
  pkgType,
  preferTariff,
  defaultTariffType = "externa",
) => {
  const { adults, children } = getPeopleStats(peopleDetails);
  const policy = getChildBedPolicy(hotelCity, hotelCategory);

  const shareable = children.filter((age) => age <= policy.freeUntilAge);
  const mustBed = children.filter((age) => age > policy.freeUntilAge);
  const requiredBeds = adults + mustBed.length;

  const items = (rooms || [])
    .map((room) => {
      // Pasar defaultTariffType a pickTariffForRoom
      const tariff = pickTariffForRoom(
        room,
        preferTariff,
        pkgType,
        defaultTariffType,
      );
      if (!tariff) return null;
      if (isExtraBedRoom(room)) return null;
      const cap = Math.max(1, capacityFromRoom(room));
      return {
        room,
        capacity: cap,
        tariff,
        price: Number(tariff?._unitPrice || 0),
      };
    })
    .filter(Boolean);

  if (items.length === 0 || requiredBeds <= 0) return [];

  const k =
    policy.maxSharingChildrenPerRoom === 99
      ? Infinity
      : Math.max(1, policy.maxSharingChildrenPerRoom || 0);
  const minRoomsBySharing =
    k === Infinity ? 0 : Math.ceil(shareable.length / k);

  const findBestCombo = (target, minRooms) => {
    const MAX_OVER = 12;
    const MAX_SUM = target + MAX_OVER;
    const dp = Array(MAX_SUM + 1).fill(null);
    dp[0] = { cost: 0, rooms: [] };

    // Room catalog rows represent room *types*, not a one-unit inventory. Use
    // an unbounded DP so the same DWB/triple/etc. type can be selected more
    // than once when the passenger count requires it.
    for (let s = 0; s <= MAX_SUM; s += 1) {
      if (!dp[s]) continue;
      items.forEach((it) => {
        const ns = s + it.capacity;
        if (ns > MAX_SUM) return;
        const candRooms = dp[s].rooms.concat(it);
        const candCost = dp[s].cost + it.price;
        const cur = dp[ns];
        const better =
          !cur ||
          candCost < cur.cost ||
          (candCost === cur.cost && candRooms.length < cur.rooms.length);
        if (better) dp[ns] = { cost: candCost, rooms: candRooms };
      });
    }

    if (dp[target] && dp[target].rooms.length >= minRooms)
      return { sum: target, overage: 0, ...dp[target] };
    for (let over = 1; over <= MAX_OVER; over++) {
      const s = target + over;
      if (dp[s] && dp[s].rooms.length >= minRooms)
        return { sum: s, overage: over, ...dp[s] };
    }
    if (dp[target]) return { sum: target, overage: 0, ...dp[target] };
    for (let s = target + 1; s <= MAX_SUM; s++) {
      if (dp[s]) return { sum: s, overage: s - target, ...dp[s] };
    }
    return null;
  };

  const options = [];
  const best = findBestCombo(requiredBeds, minRoomsBySharing);
  if (best) {
    const sharingUsed =
      k === Infinity
        ? shareable.length
        : Math.min(shareable.length, best.rooms.length * k);
    const surchargeUSD =
      (policy.surchargeUSDPerSharingChild || 0) * sharingUsed;
    options.push({
      ok: true,
      rooms: best.rooms.map((r) => ({
        room: r.room,
        capacity: r.capacity,
        tariff: r.tariff,
      })),
      beds: requiredBeds,
      sharingChildrenUsed: sharingUsed,
      surchargeUSD,
      policy,
      label:
        best.overage && best.overage > 0
          ? `Mínimo excedente (+${best.overage} cama${best.overage > 1 ? "s" : ""})`
          : "Ajuste exacto (0 excedente)",
    });
  }
  return options;
};

const applySurchargeToService = (service, inc) => {
  if (!inc || inc <= 0) return service;
  const currOriginal = Number(
    service?.tariff?.precio_original || service?.tariff?.precio || 0,
  );
  return {
    ...service,
    tariff: { ...service.tariff, precio_original: currOriginal + inc },
  };
};

const countCategoryStars = (value) =>
  (String(value || "").match(/\u2B50/g) || []).length;

// =============================================
// COMPONENTE PRINCIPAL
// =============================================
const HotelItineraryModal = ({
  isOpen,
  onClose,
  days,
  totalPassengers,
  onAddHotelToDays,
  itinerary = {},
  removeHotelFromDay,
  packageType = "compartido",
  peopleDetails = {},
  tariffType = "externa",
  platform = "venso",
  agencyId = null,
  isVensoPrimary = false,
}) => {
  // Estados principales
  const [selectedDays, setSelectedDays] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [selectedTariff, setSelectedTariff] = useState(null);
  const [customPrice, setCustomPrice] = useState(null); // Precio personalizado del review

  // Estado para multiselección de habitaciones
  const [selectedRooms, setSelectedRooms] = useState([]); // Array de {hotel, room, tariff, customPrice?}

  // Estados de distribución automática
  const [autoOptions, setAutoOptions] = useState([]);
  const [selectedAutoIndex, setSelectedAutoIndex] = useState(0);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [showAutoSuggest, setShowAutoSuggest] = useState(false);

  // Estados de datos
  const [hotels, setHotels] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filtros y paso actual
  const [filters, setFilters] = useState({
    search: "",
    categoria: "",
    ciudad: "",
    zona: "",
  });
  const [step, setStep] = useState("category");
  const [unassignedPassengers, setUnassignedPassengers] = useState(0);

  // Ocupación actual
  const hotelOccupancyInfo = useMemo(() => {
    return getHotelOccupancyInfo(days, totalPassengers);
  }, [days, totalPassengers]);

  // =============================================
  // EFECTOS
  // =============================================
  useEffect(() => {
    if (isOpen) fetchHotelCategories();
  }, [isOpen, agencyId, tariffType]);

  // Para venso: Seleccionar automáticamente la categoría 5 estrellas y saltar al step 'hotel'
  useEffect(() => {
    if (
      isVensoPrimary &&
      categories.length > 0 &&
      !selectedCategory &&
      step === "category"
    ) {
      // Buscar la categoría de 5 estrellas
      const luxuryCategory = categories.find((cat) => {
        const name = (cat.name || "").toString();
        const starCount = countCategoryStars(name);
        return starCount === 5;
      });

      if (luxuryCategory) {
        console.log(
          "Venso: Auto-seleccionando categoría luxury:",
          luxuryCategory.name,
        );
        setSelectedCategory(luxuryCategory.name);
      }
    }
  }, [categories, isVensoPrimary, selectedCategory, step]);

  useEffect(() => {
    if (selectedCategory) {
      fetchHotelsByCategory(selectedCategory);
      setStep("hotel");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  useEffect(() => {
    if (selectedHotel) {
      fetchRooms(selectedHotel.id_hotel || selectedHotel.id);
      setStep("room");
    }
  }, [selectedHotel]);

  useEffect(() => {
    if (!selectedHotel) {
      setAutoOptions([]);
      setShowAutoSuggest(false);
      return;
    }
    if (rooms && rooms.length > 0 && autoEnabled) {
      // Pasar tariffType a computeAutoDistributions
      const opts = computeAutoDistributions(
        rooms,
        selectedHotel.categoria,
        selectedHotel.ciudad,
        peopleDetails,
        packageType,
        null,
        tariffType,
      );
      setAutoOptions(opts);
      setSelectedAutoIndex(0);
      if (opts.length > 0) setShowAutoSuggest(true);
    } else {
      setAutoOptions([]);
      setShowAutoSuggest(false);
    }
  }, [
    rooms,
    selectedHotel,
    peopleDetails,
    packageType,
    autoEnabled,
    tariffType,
  ]);

  useEffect(() => {
    calculateUnassignedPassengers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  // =============================================
  // FUNCIONES DE FETCH
  // =============================================
  const fetchHotelCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const hotelsData = await queryClient.fetchQuery({
        queryKey: queryKeys.servicios.hoteles,
        queryFn: async () => {
          const response = await axiosInstance.get("/turismo/hoteles", {
            params: { activo: true },
          });
          return response.data?.success && Array.isArray(response.data.data)
            ? response.data.data
            : Array.isArray(response.data)
              ? response.data
              : [];
        },
        staleTime: 1000 * 60 * 30,
      });

      const categoriesMap = {};
      hotelsData.forEach((hotel) => {
        const categoria = hotel.categoria || "Sin categoría";
        if (!categoriesMap[categoria])
          categoriesMap[categoria] = { name: categoria, hotels: [], count: 0 };
        categoriesMap[categoria].hotels.push(hotel);
        categoriesMap[categoria].count++;
      });
      setCategories(
        Object.values(categoriesMap).sort((a, b) => b.count - a.count),
      );
    } catch (err) {
      setError("Error al cargar categorías de hoteles");
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchHotelsByCategory = async (category) => {
    setLoading(true);
    try {
      const categoryData = categories.find((cat) => cat.name === category);
      if (categoryData) setHotels(categoryData.hotels);
    } catch (err) {
      setError("Error al cargar hoteles");
      setHotels([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllHotels = async () => {
    setLoading(true);
    setError(null);
    try {
      const hotelsData = await queryClient.fetchQuery({
        queryKey: queryKeys.servicios.hoteles,
        queryFn: async () => {
          const response = await axiosInstance.get("/turismo/hoteles", {
            params: { activo: true },
          });
          return response.data?.success && Array.isArray(response.data.data)
            ? response.data.data
            : Array.isArray(response.data)
              ? response.data
              : [];
        },
        staleTime: 1000 * 60 * 30,
      });
      setHotels(hotelsData);
    } catch (err) {
      setError("Error al cargar hoteles");
      setHotels([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchRooms = async (hotelId) => {
    setLoading(true);
    try {
      const roomsData = await queryClient.fetchQuery({
        queryKey: queryKeys.servicios.habitaciones(hotelId),
        queryFn: async () => {
          const response = await axiosInstance.get(
            `/turismo/habitaciones/hotel/${hotelId}/con-tarifas`,
          );
          return response.data?.success && Array.isArray(response.data.data)
            ? response.data.data
            : Array.isArray(response.data)
              ? response.data
              : [];
        },
        staleTime: 1000 * 60 * 30,
      });

      // Filtrar habitaciones que tengan tarifa del tipo correcto (externa o interna)
      const roomsWithMatchingTariffs = roomsData.filter((room) => {
        if (!Array.isArray(room.tarifas) || room.tarifas.length === 0)
          return false;
        return room.tarifas.some((t) => t.tipo_tarifa === tariffType);
      });

      const processedRooms = roomsWithMatchingTariffs.map((room) =>
        convertRoomTariffsToDollars(room, tariffType),
      );
      setRooms(processedRooms);
    } catch (err) {
      setError("Error al cargar habitaciones");
      setRooms([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoomsForCategory = async (categoryHotels) => {
    const allRooms = [];
    const results = await Promise.allSettled(
      categoryHotels.map(async (hotel) => {
        const hotelId = hotel.id_hotel || hotel.id;
        return queryClient.fetchQuery({
          queryKey: queryKeys.servicios.habitaciones(hotelId),
          queryFn: async () => {
            const response = await axiosInstance.get(
              `/turismo/habitaciones/hotel/${hotelId}/con-tarifas`,
            );
            return response.data?.data || response.data || [];
          },
          staleTime: 1000 * 60 * 30,
        });
      }),
    );
    results.forEach((r) => {
      if (r.status === "fulfilled" && Array.isArray(r.value))
        allRooms.push(...r.value);
    });
    return allRooms;
  };

  useEffect(() => {
    const loadFilteredHotels = async () => {
      if (!selectedCategory || categories.length === 0) return;
      const categoryData = categories.find(
        (cat) => cat.name === selectedCategory,
      );
      if (!categoryData?.hotels?.length) return;
      const allRooms = await fetchRoomsForCategory(categoryData.hotels);
      // Usar tariffType dinámico en lugar de hardcodear 'externa'
      const filtered = filterValidParents(
        categoryData.hotels,
        allRooms,
        "hoteles",
        tariffType,
      );
      setHotels(filtered);
    };
    loadFilteredHotels();
  }, [selectedCategory, categories, tariffType, agencyId]);

  const filterValidParents = (
    parents,
    allChildren,
    categoryId,
    filterTariffType,
  ) => {
    return parents.filter((parent) => {
      const parentId = getParentId(parent, categoryId);
      if (!parentId) return false;

      const parentChildren = allChildren.filter((child) => {
        if (categoryId === "hoteles") {
          return (
            child.hotel_id === parentId ||
            child.id_hotel === parentId ||
            child.habitacion?.hotel_id === parentId ||
            child.habitacion?.id_hotel === parentId
          );
        }
        return false;
      });
      if (parentChildren.length === 0) return false;

      if (filterTariffType) {
        return parentChildren.some((child) => {
          if (!Array.isArray(child.tarifas) || child.tarifas.length === 0)
            return false;
          return child.tarifas.some(
            (tariff) => tariff.tipo_tarifa === filterTariffType,
          );
        });
      }
      return true;
    });
  };

  // =============================================
  // HELPERS
  // =============================================
  const calculateUnassignedPassengers = () => {
    const assigned = getAssignedBedCountFromItinerary(days);
    setUnassignedPassengers(Math.max(0, totalPassengers - assigned));
  };

  // Calcular capacidad total de habitaciones seleccionadas
  const totalSelectedCapacity = useMemo(() => {
    return selectedRooms.reduce(
      (sum, item) => sum + capacityFromRoom(item.room),
      0,
    );
  }, [selectedRooms]);

  // Verificar si una habitación ya está seleccionada (utilizado por componentes hijos)
  // eslint-disable-next-line no-unused-vars
  const isRoomSelected = (room, hotel) => {
    return selectedRooms.some(
      (item) =>
        (item.room.id_habitacion || item.room.id) ===
          (room.id_habitacion || room.id) &&
        (item.hotel.id_hotel || item.hotel.id) === (hotel.id_hotel || hotel.id),
    );
  };

  const getPhysicalRoomQuantityForHotel = (selection, hotel) => {
    const hotelId = hotel?.id_hotel || hotel?.id;
    return (selection || []).reduce((sum, item) => {
      const itemHotelId = item.hotel?.id_hotel || item.hotel?.id;
      if (itemHotelId !== hotelId || isExtraBedRoom(item.room)) return sum;
      return sum + Math.max(0, Number(item.quantity || 1));
    }, 0);
  };

  // Agregar o quitar habitación de la selección (con soporte para cantidad).
  // "Cama adicional" is a +1 pax supplement and can only exist attached to a
  // physical room of the same hotel (maximum one extra bed per room).
  const toggleRoomSelection = (room, hotel, tariff, delta = 1) => {
    const roomId = room.id_habitacion || room.id;
    const hotelId = hotel.id_hotel || hotel.id;
    const tariffId = tariff?.id_tarifa || tariff?.id;
    const priceType = tariff?.selectedType || "unico"; // compartido, privado, o unico

    setSelectedRooms((prev) => {
      const isExtraBed = isExtraBedRoom(room);
      const physicalRooms = getPhysicalRoomQuantityForHotel(prev, hotel);
      if (isExtraBed && delta > 0 && physicalRooms <= 0) {
        alert("Primero selecciona una habitación. La cama adicional es un suplemento de +1 pax.");
        return prev;
      }

      // Buscar por la combinación exacta: hotel + habitación + tarifa + tipo de precio
      const existingIndex = prev.findIndex((item) => {
        const itemRoomId = item.room.id_habitacion || item.room.id;
        const itemHotelId = item.hotel.id_hotel || item.hotel.id;
        const itemTariffId = item.tariff?.id_tarifa || item.tariff?.id;
        const itemPriceType = item.tariff?.selectedType || "unico";

        return (
          itemRoomId === roomId &&
          itemHotelId === hotelId &&
          itemTariffId === tariffId &&
          itemPriceType === priceType
        );
      });

      if (existingIndex >= 0) {
        // Ya existe: actualizar cantidad
        const currentQty = prev[existingIndex].quantity || 1;
        const requestedQty = currentQty + delta;
        const newQty = isExtraBed
          ? Math.min(requestedQty, physicalRooms)
          : requestedQty;

        if (newQty <= 0) {
          // Quitar si la cantidad llega a 0
          return prev.filter((_, idx) => idx !== existingIndex);
        } else {
          // Actualizar cantidad
          return prev.map((item, idx) =>
            idx === existingIndex ? { ...item, quantity: newQty } : item,
          );
        }
      } else if (delta > 0) {
        // Agregar nueva habitación con cantidad inicial
        const newItem = {
          hotel,
          room,
          tariff,
          quantity: isExtraBed ? Math.min(delta, physicalRooms) : delta,
          isExtraBed,
          id: `${hotelId}-${roomId}-${tariffId}-${priceType}-${Date.now()}`,
        };
        return [...prev, newItem];
      }
      return prev;
    });
  };

  // Actualizar cantidad de una habitación por índice
  const updateRoomQuantity = (index, newQty) => {
    setSelectedRooms((prev) => {
      const target = prev[index];
      if (!target) return prev;
      if (newQty <= 0) return prev.filter((_, idx) => idx !== index);

      if (isExtraBedRoom(target.room)) {
        const maxExtraBeds = getPhysicalRoomQuantityForHotel(prev, target.hotel);
        return prev.map((item, idx) =>
          idx === index
            ? { ...item, quantity: Math.min(newQty, maxExtraBeds) }
            : item,
        );
      }

      const updated = prev.map((item, idx) =>
        idx === index ? { ...item, quantity: newQty } : item,
      );
      const maxExtraBeds = getPhysicalRoomQuantityForHotel(updated, target.hotel);
      return updated.map((item) =>
        isExtraBedRoom(item.room) &&
        (item.hotel?.id_hotel || item.hotel?.id) ===
          (target.hotel?.id_hotel || target.hotel?.id)
          ? { ...item, quantity: Math.min(item.quantity || 1, maxExtraBeds) }
          : item,
      );
    });
  };

  // Remover una habitación específica de la selección por índice
  const removeFromSelection = (index) => {
    setSelectedRooms((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Remover una habitación específica de la selección por ID
  const handleRemoveRoom = (itemId) => {
    setSelectedRooms((prev) => prev.filter((item) => item.id !== itemId));
  };

  // Actualizar precio customizado de una habitación específica
  const handleUpdateRoomPrice = (itemId, newPrice) => {
    setSelectedRooms((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, customPrice: parseFloat(newPrice) || 0 }
          : item,
      ),
    );
  };

  // Limpiar selección de habitaciones
  const clearRoomSelection = () => {
    setSelectedRooms([]);
  };

  const handleDayToggle = (dayIndex) => {
    setSelectedDays((prev) =>
      prev.includes(dayIndex)
        ? prev.filter((d) => d !== dayIndex)
        : [...prev, dayIndex],
    );
  };

  const handleFilterChange = (filterName, value) => {
    setFilters((prev) => ({ ...prev, [filterName]: value }));
  };

  const countHotelsUsedByCategory = (categoryName) => {
    let count = 0;
    days.forEach((day) => {
      const dayHotels = (day.servicios || []).filter(isHotelService);
      dayHotels.forEach((hotel) => {
        const directCategory = hotel.hotel_categoria;
        if (directCategory === categoryName) {
          count++;
          return;
        }
        if (hotel.parentData?.categoria === categoryName) {
          count++;
          return;
        }
        const categoryData = categories.find(
          (cat) => cat.name === categoryName,
        );
        if (categoryData?.hotels?.length > 0) {
          const hotelName =
            hotel.hotel_nombre ||
            hotel.nombre ||
            hotel.serviceDetails?.nombre ||
            hotel.parentData?.nombre;
          const hotelId =
            hotel.hotel_id ||
            hotel.id_hotel ||
            hotel.serviceDetails?.hotel_id ||
            hotel.parentData?.id ||
            hotel.parentData?.id_hotel;
          const matchingHotel = categoryData.hotels.find((catHotel) => {
            if (hotelName && catHotel.nombre)
              return (
                catHotel.nombre.toLowerCase().trim() ===
                hotelName.toLowerCase().trim()
              );
            if (hotelId && (catHotel.id || catHotel.id_hotel))
              return catHotel.id === hotelId || catHotel.id_hotel === hotelId;
            return false;
          });
          if (matchingHotel) count++;
        }
      });
    });
    return count;
  };

  // =============================================
  // ACCIONES
  // =============================================
  const handleAddToItinerary = () => {
    // Verificar si tenemos habitaciones en multiselección o en selección individual
    const hasMultiSelection = selectedRooms.length > 0;
    const hasSingleSelection = selectedHotel && selectedRoom && selectedTariff;

    if (!hasMultiSelection && !hasSingleSelection) {
      alert("Por favor selecciona al menos una habitación");
      return;
    }

    if (selectedDays.length === 0) {
      alert("Por favor selecciona al menos un día");
      return;
    }

    let services = [];

    if (hasMultiSelection) {
      // Multiselección: crear servicios por cada habitación seleccionada
      // Si una habitación tiene quantity > 1, expandir a múltiples servicios
      services = selectedRooms
        .flatMap(
          ({
            hotel,
            room,
            tariff,
            customPrice: roomCustomPrice,
            quantity = 1,
          }) => {
            // Validar que la tarifa coincida con el tipo requerido (externa para venso, interna para mil)
            if (tariff.tipo_tarifa !== tariffType) {
              console.warn(
                `Tarifa ${tariff.tipo_tarifa} ignorada (se requiere ${tariffType}):`,
                tariff,
              );
              return [];
            }

            const tariffToUse =
              roomCustomPrice !== null && roomCustomPrice !== undefined
                ? {
                    ...tariff,
                    precio_privado: roomCustomPrice,
                    precio_compartido: roomCustomPrice,
                    precio: roomCustomPrice,
                  }
                : tariff;

            // Crear tantos servicios como indique quantity
            return Array.from({ length: quantity }, (_, idx) => {
              const roomWithHotel = {
                ...room,
                hotel_id: hotel.id_hotel || hotel.id,
                habitacion: {
                  ...room,
                  tipo_habitacion: room.tipo_habitacion,
                  capacidad: capacityFromRoom(room),
                },
              };

              const hotelService = createUnifiedService(
                hotel,
                roomWithHotel,
                tariffToUse,
                peopleDetails,
                packageType,
              );
              hotelService.habitacion_capacidad = capacityFromRoom(room);
              hotelService.habitacion_es_cama_adicional = isExtraBedRoom(room);
              hotelService.hotel_nombre = hotel.nombre;
              hotelService.hotel_categoria = hotel.categoria;
              hotelService.hotel_ciudad = hotel.ciudad;
              hotelService.habitacion_tipo = room.tipo_habitacion;
              // Identificador para distinguir habitaciones del mismo tipo
              if (quantity > 1) {
                hotelService._roomIndex = idx + 1;
              }

              return hotelService;
            });
          },
        )
        .filter(Boolean);
    } else {
      // Selección individual (flujo anterior)
      // Validar que la tarifa coincida con el tipo requerido
      if (selectedTariff.tipo_tarifa !== tariffType) {
        alert(`Solo se pueden agregar tarifas ${tariffType} al itinerario`);
        return;
      }

      const tariffToUse =
        customPrice !== null
          ? {
              ...selectedTariff,
              precio_privado: customPrice,
              precio_compartido: customPrice,
              precio: customPrice,
            }
          : selectedTariff;

      const roomWithHotel = {
        ...selectedRoom,
        hotel_id: selectedHotel.id_hotel || selectedHotel.id,
        habitacion: {
          ...selectedRoom,
          tipo_habitacion: selectedRoom.tipo_habitacion,
          capacidad: capacityFromRoom(selectedRoom),
        },
      };

      const hotelService = createUnifiedService(
        selectedHotel,
        roomWithHotel,
        tariffToUse,
        peopleDetails,
        packageType,
      );
      hotelService.habitacion_capacidad = capacityFromRoom(selectedRoom);
      hotelService.habitacion_es_cama_adicional = isExtraBedRoom(selectedRoom);
      hotelService.hotel_nombre = selectedHotel.nombre;
      hotelService.hotel_categoria = selectedHotel.categoria;
      hotelService.hotel_ciudad = selectedHotel.ciudad;
      hotelService.habitacion_tipo = selectedRoom.tipo_habitacion;

      services = [hotelService];
    }

    if (services.length === 0) {
      alert("No hay habitaciones válidas para agregar");
      return;
    }

    onAddHotelToDays(selectedDays, services);

    // Limpiar estados
    setSelectedDays([]);
    setSelectedTariff(null);
    setCustomPrice(null);
    setSelectedRooms([]);
    setStep("review");
  };

  const handleAcceptAutoDistribution = () => {
    if (
      !selectedHotel ||
      selectedDays.length === 0 ||
      autoOptions.length === 0
    ) {
      setShowAutoSuggest(false);
      return;
    }
    const opt = autoOptions[selectedAutoIndex] || autoOptions[0];
    let remainingShareSurcharges = opt.sharingChildrenUsed;

    const services = opt.rooms.map(({ room, tariff }) => {
      // Crear habitación con estructura completa
      const roomWithHotel = {
        ...room,
        hotel_id: selectedHotel.id_hotel || selectedHotel.id,
        habitacion: {
          ...room,
          tipo_habitacion: room.tipo_habitacion,
          capacidad: capacityFromRoom(room),
        },
      };

      let s = createUnifiedService(
        selectedHotel,
        roomWithHotel,
        tariff,
        peopleDetails,
        packageType,
      );
      s.habitacion_capacidad = capacityFromRoom(room);
      s.habitacion_es_cama_adicional = false;

      // Añadir campos adicionales
      s.hotel_nombre = selectedHotel.nombre;
      s.hotel_categoria = selectedHotel.categoria;
      s.hotel_ciudad = selectedHotel.ciudad;
      s.habitacion_tipo = room.tipo_habitacion;

      if (
        opt.policy?.surchargeUSDPerSharingChild > 0 &&
        remainingShareSurcharges > 0
      ) {
        s = applySurchargeToService(s, opt.policy.surchargeUSDPerSharingChild);
        remainingShareSurcharges -= 1;
      }
      return s;
    });

    onAddHotelToDays(selectedDays, services);
    setShowAutoSuggest(false);
    alert("Se agregó la distribución automática al itinerario.");
  };

  const handleRemoveHotelFromDay = (dayIndex, serviceId) => {
    if (removeHotelFromDay) removeHotelFromDay(dayIndex, serviceId);
  };

  const handleClearAllHotels = () => {
    if (!removeHotelFromDay) return;
    if (!window.confirm("?Eliminar todos los hoteles del itinerario?")) return;

    days.forEach((day, dayIndex) => {
      const hotelServices = (day.servicios || []).filter(isHotelService);
      hotelServices.forEach((service) =>
        removeHotelFromDay(dayIndex, service.id),
      );
    });
  };

  const handleSelectAllDays = () => setSelectedDays(days.map((_, i) => i));
  const handleDeselectAllDays = () => {
    setSelectedDays([]);
    calculateUnassignedPassengers();
  };

  if (!isOpen) return null;

  return (
    <div className="hotel-itinerary-modal-overlay">
      <div className="hotel-itinerary-modal">
        {/* Header */}
        <div className="modal-header">
          <h2>
            <FaHotel className="header-icon" /> Gestionar Hoteles del Itinerario
          </h2>
          <button className="close-button" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <div className="modal-content">
          {/* Progress Steps */}
          <div className="progress-steps">
            <div
              className={`step ${step === "category" ? "active" : step !== "category" ? "completed" : ""}`}
            >
              <FaStar />
              <span>Categoría</span>
            </div>
            <div
              className={`step ${step === "hotel" || step === "hotel-all" ? "active" : step === "room" || step === "review" ? "completed" : ""}`}
            >
              <FaHotel />
              <span>Hotel</span>
            </div>
            <div
              className={`step ${step === "room" ? "active" : step === "review" ? "completed" : ""}`}
            >
              <FaBed />
              <span>Habitación</span>
            </div>
            <div className={`step ${step === "review" ? "active" : ""}`}>
              <FaCheck />
              <span>Confirmar</span>
            </div>
          </div>

          {/* Info pasajeros */}
          <div className="passenger-info">
            <div className="info-card">
              <FaUsers />
              <span>Total: {totalPassengers} pasajeros</span>
            </div>
            <div className="info-card warning">
              <FaUsers />
              <span>Sin asignar: {unassignedPassengers}</span>
            </div>
          </div>

          {/* Panel de Selección de días - Siempre visible */}
          {days?.length > 0 && (
            <div className="days-selection-panel">
              <div className="panel-header">
                <h3>
                  <FaCalendarCheck /> Seleccionar Días para el Hotel
                </h3>
                <div className="header-actions">
                  <button
                    className="select-all-btn"
                    onClick={
                      selectedDays.length === days.length
                        ? handleDeselectAllDays
                        : handleSelectAllDays
                    }
                  >
                    <MdSelectAll />{" "}
                    {selectedDays.length === days.length ? "Ninguno" : "Todos"}
                  </button>
                  <span className="selected-count">
                    {selectedDays.length} seleccionados
                  </span>
                </div>
              </div>
              <div className="days-compact-grid">
                {days.map((day, index) => {
                  const dayHotels = (day.servicios || []).filter(
                    isHotelService,
                  );
                  return (
                    <div
                      key={index}
                      className={`day-item ${selectedDays.includes(index) ? "selected" : ""}`}
                      onClick={() => handleDayToggle(index)}
                    >
                      <div className="day-item-header">
                        <span className="day-number">Día {index + 1}</span>
                        <input
                          type="checkbox"
                          checked={selectedDays.includes(index)}
                          onChange={() => {}}
                        />
                      </div>
                      <span className="day-title">{day.titulo}</span>
                      {dayHotels.length > 0 && (
                        <div className="day-hotels">
                          {dayHotels.map((hotel, hotelIdx) => {
                            const hotelName =
                              hotel.hotel_nombre ||
                              hotel.parentService?.nombre ||
                              hotel.serviceDetails?.nombre ||
                              hotel.parentData?.nombre ||
                              hotel.nombre ||
                              "Hotel";
                            const hotelServiceId =
                              hotel.id ||
                              hotel.serviceId ||
                              `hotel-${index}-${hotelIdx}`;
                            return (
                              <span
                                key={hotelServiceId}
                                className="hotel-tag"
                                title={hotelName}
                              >
                                <FaHotel />
                                <span className="hotel-name">{hotelName}</span>
                                <button
                                  className="remove-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveHotelFromDay(
                                      index,
                                      hotelServiceId,
                                    );
                                  }}
                                >
                                  <FaTimes />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step: Categoría - Solo para platform 'mil' */}
          {/* Para venso: auto-selecciona 5? y salta directamente a HotelSelection */}
          {step === "category" && platform?.toLowerCase() !== "venso" && (
            <CategorySelection
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              countHotelsUsedByCategory={countHotelsUsedByCategory}
              loading={loading}
              error={error}
              onRetry={fetchHotelCategories}
            />
          )}

          {/* Venso loading: mientras se cargan las categorías para auto-seleccionar 5? */}
          {step === "category" && platform?.toLowerCase() === "venso" && (
            <div className="venso-loading-state">
              <div className="loading-spinner"></div>
              <p>Cargando hoteles de lujo...</p>
            </div>
          )}

          {/* Step: Hotel */}
          {(step === "hotel" || step === "hotel-all") && (
            <HotelSelection
              hotels={hotels}
              selectedHotel={selectedHotel}
              selectedCategory={selectedCategory}
              filters={filters}
              onFilterChange={handleFilterChange}
              onSelectHotel={setSelectedHotel}
              onBack={() => {
                setStep("category");
                setSelectedCategory(null);
                setSelectedHotel(null);
                setRooms([]);
              }}
              onViewAll={() => {
                setSelectedCategory(null);
                setStep("hotel-all");
                fetchAllHotels();
              }}
              loading={loading}
              error={error}
              showAllHotels={step === "hotel-all"}
            />
          )}

          {/* Step: Habitación */}
          {step === "room" && selectedHotel && (
            <RoomSelection
              rooms={rooms}
              selectedRoom={selectedRoom}
              selectedTariff={selectedTariff}
              selectedHotel={selectedHotel}
              packageType={packageType}
              autoOptions={autoOptions}
              selectedAutoIndex={selectedAutoIndex}
              autoEnabled={autoEnabled}
              showAutoSuggest={showAutoSuggest}
              onSelectRoom={setSelectedRoom}
              onSelectTariff={setSelectedTariff}
              onSetStep={setStep}
              onBack={() => {
                const previousStep = selectedCategory ? "hotel" : "hotel-all";
                setStep(previousStep);
                setSelectedRoom(null);
                setSelectedTariff(null);
              }}
              onToggleAutoEnabled={setAutoEnabled}
              onSetSelectedAutoIndex={setSelectedAutoIndex}
              onCloseAutoSuggest={() => setShowAutoSuggest(false)}
              onAcceptAutoDistribution={handleAcceptAutoDistribution}
              loading={loading}
              // Props de multiselección
              selectedRooms={selectedRooms}
              totalPassengers={totalPassengers}
              onToggleRoom={toggleRoomSelection}
              onRemoveFromSelection={removeFromSelection}
              onClearSelection={clearRoomSelection}
              onUpdateQuantity={updateRoomQuantity}
            />
          )}

          {/* Step: Review - Ahora soporta multiselección */}
          {step === "review" &&
            (selectedRooms.length > 0 ||
              (selectedHotel && selectedRoom && selectedTariff)) && (
              <ReviewSelection
                selectedHotel={selectedHotel}
                selectedRoom={selectedRoom}
                selectedTariff={selectedTariff}
                selectedDays={selectedDays}
                days={days}
                packageType={packageType}
                onBack={() => setStep("room")}
                onPriceChange={(price) => setCustomPrice(price)}
                // Props de multiselección
                selectedRooms={selectedRooms}
                onRemoveRoom={handleRemoveRoom}
                onUpdateRoomPrice={handleUpdateRoomPrice}
                totalPassengers={totalPassengers}
              />
            )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>
            Cerrar
          </button>
          {step === "room" && selectedRooms.length > 0 && (
            <button className="confirm-btn" onClick={() => setStep("review")}>
              <FaCheck /> Revisar Selección ({selectedRooms.length})
            </button>
          )}
          {step === "review" && (
            <>
              <button
                className="secondary-btn"
                onClick={() => {
                  setStep("room");
                }}
              >
                <FaArrowLeft /> Agregar Más
              </button>
              <button
                className="secondary-btn"
                onClick={() => {
                  setSelectedHotel(null);
                  setSelectedRoom(null);
                  setSelectedTariff(null);
                  setSelectedRooms([]);
                  setRooms([]);
                  setStep("hotel");
                }}
              >
                Elegir Otro Hotel
              </button>
              <button
                className="confirm-btn"
                onClick={handleAddToItinerary}
                disabled={
                  selectedDays.length === 0 ||
                  (selectedRooms.length === 0 && !selectedTariff)
                }
              >
                <FaPlus /> Agregar al Itinerario
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default HotelItineraryModal;

// Exportar funciones para compatibilidad
export { getAssignedBedCountFromItinerary, getRoomCapacityFromType };
export const getRequiredBedCount = (peopleDetails = {}, city, category) => {
  const policy = getChildBedPolicy(city, category);
  const adults = Array.isArray(peopleDetails.adults)
    ? peopleDetails.adults.length
    : 0;
  const rawChildren = Array.isArray(peopleDetails.children)
    ? peopleDetails.children
    : [];
  const childAges = rawChildren.map((c) =>
    Math.max(
      0,
      Number.isFinite(c.age ?? c.edad)
        ? (c.age ?? c.edad)
        : parseInt(c.age ?? c.edad, 10) || 0,
    ),
  );
  const mustBed = childAges.filter((age) => age > policy.freeUntilAge).length;
  return adults + mustBed;
};
