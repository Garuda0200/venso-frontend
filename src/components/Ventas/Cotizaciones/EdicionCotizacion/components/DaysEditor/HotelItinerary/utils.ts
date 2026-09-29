import {
  getHotelRoomCapacity as resolveHotelRoomCapacity,
  isExtraBedRoomType,
} from "../../../../../../../utils/hotelRoomTypes";

const STAR_PATTERN = /\u2B50/g;

const countStars = (value) =>
  (String(value || "").match(STAR_PATTERN) || []).length;

const normalizeText = (value) =>
  (value || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const formatStarLabel = (count) => `${count} estrella${count === 1 ? "" : "s"}`;

// Normalize text for comparisons.
export const normalizeCity = normalizeText;

// Parse hotel star category metadata.
export const parseStars = (rawCategory) => {
  const raw = (rawCategory || "").toString().toLowerCase();
  const starCount = countStars(raw);
  const isSuperior = /sup|superior/.test(raw);
  const digitMatch = raw.match(/(\d)/);
  const stars =
    starCount ||
    (digitMatch
      ? parseInt(digitMatch[1], 10)
      : raw.includes("lujo") || raw.includes("deluxe")
        ? 5
        : 0);
  return { stars, isSuperior };
};

// Child bed policy by city and hotel category.
export const getChildBedPolicy = (cityRaw, categoryRaw) => {
  const city = normalizeCity(cityRaw);
  const { stars, isSuperior } = parseStars(categoryRaw);

  let freeUntilAge = 5;
  let maxSharingChildrenPerRoom = 99;
  let surchargeUSDPerSharingChild = 0;

  const targetCity = ["lima", "puno", "arequipa", "cusco"].includes(city);

  if (targetCity) {
    if (stars === 2) freeUntilAge = 3;
    if (stars === 3 || (stars === 3 && isSuperior)) freeUntilAge = 4;
  }

  if (city === "cusco" && (stars === 4 || stars === 5)) {
    freeUntilAge = 9;
    maxSharingChildrenPerRoom = 1;
    surchargeUSDPerSharingChild = 12;
  }

  return {
    freeUntilAge,
    maxSharingChildrenPerRoom,
    surchargeUSDPerSharingChild,
    stars,
    isSuperior,
  };
};

// Get passenger counts and child ages.
export const getPeopleStats = (people = {}) => {
  const adults = Array.isArray(people.adults) ? people.adults.length : 0;
  const childrenArr = Array.isArray(people.children) ? people.children : [];
  const children = childrenArr
    .map((c) => {
      const a = c.age ?? c.edad ?? 0;
      const n = Number.isFinite(a) ? a : parseInt(a, 10) || 0;
      return Math.max(0, n);
    })
    .sort((a, b) => a - b);
  return { adults, children };
};

// Resolve capacity from the catalog value first and keep one shared terminology
// for HotelPricingModal, itinerary editing and voucher/reservation flows.
export const capacityFromRoom = (room) => resolveHotelRoomCapacity(room, 1);

// Readable room label.
export const labelFromRoom = (room) =>
  room.tipo_habitacion ||
  room.habitacion?.tipo_habitacion ||
  room.nombre ||
  room.tipo ||
  "Habitación";

export const getRoomCapacityFromType = (roomType) =>
  resolveHotelRoomCapacity(roomType, 1);

export const getRoomCapacity = (room) =>
  resolveHotelRoomCapacity(room, 1);

// An additional bed has capacity +1 but is an add-on to a physical room.
export const isExtraBedRoom = (room) => isExtraBedRoomType(room);

// Return a text label for hotel category.
export const getCategoryDisplay = (categoria) => {
  if (!categoria) return "Sin categoría";

  const raw = String(categoria).trim();
  const starCount = countStars(raw);
  if (starCount > 0) return formatStarLabel(starCount);

  const numStars = parseInt(raw, 10);
  if (!Number.isNaN(numStars) && numStars >= 1 && numStars <= 5) {
    return formatStarLabel(numStars);
  }

  const categoryMap = {
    economico: "1 estrella",
    turista: "2 estrellas",
    estandar: "3 estrellas",
    superior: "4 estrellas",
    lujo: "5 estrellas",
    luxury: "5 estrellas",
    deluxe: "5 estrellas",
  };

  return categoryMap[normalizeText(raw)] || raw;
};

// Format price with soles or dollars.
export const formatPrice = (price, moneda = "soles") => {
  if (price === null || price === undefined || isNaN(price)) return "S/ 0.00";
  const numPrice = parseFloat(price);
  if (isNaN(numPrice)) return "S/ 0.00";

  const isDolares =
    moneda &&
    (moneda.toLowerCase().includes("dolar") ||
      moneda.toLowerCase().includes("usd") ||
      moneda.toLowerCase() === "dolares");

  const symbol = isDolares ? "$" : "S/";
  return `${symbol} ${numPrice.toFixed(2)}`;
};

// Required beds: adults plus children who need a bed by policy.
export const getRequiredBedCount = (peopleDetails = {}, city, category) => {
  const policy = getChildBedPolicy(city, category);
  const adults = Array.isArray(peopleDetails.adults)
    ? peopleDetails.adults.length
    : 0;
  const rawChildren = Array.isArray(peopleDetails.children)
    ? peopleDetails.children
    : [];
  const childAges = rawChildren.map((c) => {
    const a = c.age ?? c.edad ?? 0;
    const n = Number.isFinite(a) ? a : parseInt(a, 10) || 0;
    return Math.max(0, n);
  });
  const mustBed = childAges.filter((age) => age > policy.freeUntilAge).length;
  return adults + mustBed;
};

// Count assigned beds from itinerary hotel services.
export const getAssignedBedCountFromItinerary = (days = []) => {
  let assigned = 0;
  days.forEach((day) => {
    const hotelServices = (day?.servicios || []).filter((service) => {
      if (service.parentService?.categoria?.toLowerCase().includes("hotel"))
        return true;
      if (
        service.tipo === "hotel" ||
        service.categoria === "hoteles" ||
        service.categoriaServicio === "hoteles"
      )
        return true;
      if (
        service.id_hotel ||
        service.hotel_id ||
        service.parentService?.id_hotel
      )
        return true;
      return false;
    });

    hotelServices.forEach((service) => {
      let capacity = 1;
      if (typeof service.habitacion_capacidad === "number") {
        capacity = service.habitacion_capacidad;
      } else if (service.childService?.tipo_habitacion) {
        capacity = getRoomCapacityFromType(
          service.childService.tipo_habitacion,
        );
      } else if (service.serviceDetails?.capacidad) {
        capacity = service.serviceDetails.capacidad;
      } else if (service.tipo_habitacion) {
        capacity = getRoomCapacityFromType(service.tipo_habitacion);
      }
      assigned += Number(capacity || 0);
    });
  });
  return assigned;
};

// Check whether a service is a hotel service.
export const isHotelService = (service) => {
  if (service.parentService?.categoria?.toLowerCase().includes("hotel"))
    return true;
  if (
    service.tipo === "hotel" ||
    service.categoria === "hoteles" ||
    service.categoriaServicio === "hoteles"
  )
    return true;
  if (service.id_hotel || service.hotel_id || service.parentService?.id_hotel)
    return true;
  return false;
};
