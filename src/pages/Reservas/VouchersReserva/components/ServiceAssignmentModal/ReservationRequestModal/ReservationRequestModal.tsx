import { useEffect, useMemo, useRef, useState } from "react";
import { MdClose, MdContentCopy, MdFileDownload, MdPictureAsPdf } from "react-icons/md";
import html2canvas from "html2canvas";
import { PDFDocument } from "pdf-lib";
import Modal from "../../../../../../components/UI/Modal/Modal";
import { resolveServiceType } from "../../../utils/serviceAssignment";
import "./ReservationRequestModal.scss";

const SERVICE_TYPE_LABELS = {
  hoteles: "Hotel",
  hotel: "Hotel",
  transportes: "Transporte",
  transporte: "Transporte",
  guias: "Guía",
  guia: "Guía",
  endoses: "Endose / Tour",
  endose: "Endose / Tour",
  vuelos: "Vuelo",
  vuelo: "Vuelo",
  trenes: "Tren",
  tren: "Tren",
  restaurantes: "Restaurante",
  restaurante: "Restaurante",
  tickets: "Ticket",
  ticket: "Ticket",
  extras: "Extra",
  extra: "Extra",
};

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const cleanText = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
};

const firstValue = (...values) => {
  for (const value of values) {
    const normalized = cleanText(value);
    if (normalized) return normalized;
  }
  return "";
};

const normalizeTypeKey = (value = "") => {
  const raw = cleanText(value).toLowerCase();
  if (raw.includes("hotel")) return "hoteles";
  if (raw.includes("transport")) return "transportes";
  if (raw.includes("guia") || raw.includes("guía")) return "guias";
  if (raw.includes("endose") || raw.includes("tour")) return "endoses";
  if (raw.includes("vuelo")) return "vuelos";
  if (raw.includes("tren")) return "trenes";
  if (raw.includes("restaurant")) return "restaurantes";
  if (raw.includes("ticket") || raw.includes("entrada")) return "tickets";
  if (raw.includes("extra")) return "extras";
  return raw || "servicios";
};

export const getReservationServiceTypeKey = (service = {}) => {
  const extraMarker =
    service?.assignedService?.childService?.servicio_extra ||
    service?.assignedChildService?.servicio_extra ||
    service?.childService?.servicio_extra;

  if (extraMarker) return "extras";

  return normalizeTypeKey(
    resolveServiceType(service) ||
      service?.assignedService?.typeService ||
      service?.assignedService?.parentService?.typeService ||
      service?.assignedParentService?.typeService ||
      service?.typeService ||
      service?.parentService?.typeService ||
      service?.cotizacionServiceRef?.typeService ||
      "servicios",
  );
};

export const getReservationServiceTypeLabel = (service = {}) => {
  const key = getReservationServiceTypeKey(service);
  return SERVICE_TYPE_LABELS[key] || cleanText(key) || "Servicio";
};

const getAssignedServiceParts = (service = {}) => {
  const assigned = service?.assignedService || {};
  return {
    parent:
      assigned.parentService ||
      service.assignedParentService ||
      service.parentService ||
      assigned ||
      service,
    child:
      assigned.childService ||
      service.assignedChildService ||
      service.childService ||
      service,
    assigned,
  };
};

export const getReservationProviderName = (service = {}) => {
  const typeKey = getReservationServiceTypeKey(service);
  const { parent, child, assigned } = getAssignedServiceParts(service);
  const persona = parent?.persona || assigned?.persona || service?.persona;

  switch (typeKey) {
    case "hoteles":
      return firstValue(parent?.nombre, parent?.nombre_hotel, parent?.hotel?.nombre, service?.hotel_nombre, "Hotel sin proveedor");
    case "transportes":
      return firstValue(parent?.nombre_transporte, parent?.nombre, service?.transporte_nombre, "Transporte sin proveedor");
    case "guias":
      return firstValue(
        persona ? `${persona.nombres || ""} ${persona.apellidos || ""}` : "",
        parent?.nombre,
        parent?.guia?.nombre,
        "Guía sin proveedor",
      );
    case "endoses":
      return firstValue(parent?.nombre_agencia, parent?.nombre, parent?.tipo_tour, "Endose sin proveedor");
    case "trenes":
      return firstValue(parent?.nombre_empresa, parent?.nombre, "Tren sin proveedor");
    case "vuelos":
      return firstValue(parent?.aerolinea, parent?.nombre, parent?.vuelo?.nombre, "Vuelo sin proveedor");
    case "restaurantes":
      return firstValue(child?.restaurante?.nombre, child?.nombre, parent?.nombre, "Restaurante sin proveedor");
    case "tickets":
      return firstValue(child?.ticket?.entrada, child?.tickets?.entrada, child?.entrada, parent?.entrada, "Ticket / entrada");
    case "extras":
      return firstValue(child?.servicio_extra?.nombre, child?.nombre, parent?.nombre, "Servicio extra");
    default:
      return firstValue(parent?.nombre, child?.nombre, assigned?.nombre, "Proveedor sin nombre");
  }
};

export const getReservationServiceName = (service = {}) => {
  const typeKey = getReservationServiceTypeKey(service);
  const { parent, child } = getAssignedServiceParts(service);
  switch (typeKey) {
    case "hoteles":
      return firstValue(child?.tipo_habitacion, child?.habitacion?.tipo_habitacion, service?.tipo_habitacion, "Habitación");
    case "transportes":
      return firstValue(child?.ruta, child?.tipo_auto, service?.ruta, "Traslado / transporte");
    case "guias":
      return firstValue(child?.ruta?.tour_nombre, child?.tour_nombre, parent?.idioma, "Servicio de guía");
    case "endoses":
      return firstValue(child?.tour?.tipo_tour, child?.tour?.nombre, parent?.tipo_tour, "Tour / endose");
    case "trenes":
      return firstValue(child?.vagon?.tipo_tren, child?.tipo_tren, "Servicio de tren");
    case "vuelos":
      return firstValue(child?.tipo_vuelo?.tipovuelo, child?.tipovuelo, "Servicio aéreo");
    case "restaurantes":
      return firstValue(child?.restaurante?.nombre, child?.nombre, "Restaurante");
    case "tickets":
      return firstValue(child?.ticket?.entrada, child?.tickets?.entrada, child?.entrada, "Entrada / ticket");
    case "extras":
      return firstValue(child?.servicio_extra?.nombre, child?.nombre, parent?.nombre, "Extra");
    default:
      return firstValue(child?.nombre, parent?.nombre, "Servicio");
  }
};

const pushDetail = (details, label, value) => {
  const cleanValue = cleanText(value);
  if (cleanValue) details.push({ label, value: cleanValue });
};

export const getReservationServiceDetails = (service = {}) => {
  const details = [];
  const typeKey = getReservationServiceTypeKey(service);
  const { parent, child, assigned } = getAssignedServiceParts(service);
  const tariff = assigned?.tariff || service?.assignedTariff || service?.tariff || {};

  switch (typeKey) {
    case "hoteles":
      pushDetail(details, "Hotel", getReservationProviderName(service));
      pushDetail(details, "Habitación", child?.tipo_habitacion || child?.habitacion?.tipo_habitacion);
      pushDetail(details, "Categoría", parent?.categoria);
      pushDetail(details, "Ciudad", parent?.ciudad);
      pushDetail(details, "Alimentación", tariff?.tipo_alimentacion);
      break;
    case "transportes":
      pushDetail(details, "Servicio", child?.ruta || getReservationServiceName(service));
      pushDetail(details, "Tipo de movilidad", child?.tipo_auto);
      pushDetail(details, "Zona", parent?.zona);
      pushDetail(details, "Capacidad", child?.nro_pasajeros ? `${child.nro_pasajeros} pax` : "");
      break;
    case "guias":
      pushDetail(details, "Guía", getReservationProviderName(service));
      pushDetail(details, "Ruta", child?.ruta?.tour_nombre || child?.tour_nombre);
      pushDetail(details, "Idioma", Array.isArray(parent?.guia?.idioma) ? parent.guia.idioma.join(", ") : parent?.guia?.idioma || parent?.idioma);
      break;
    case "endoses":
      pushDetail(details, "Tour", child?.tour?.tipo_tour || child?.tour?.nombre || parent?.tipo_tour);
      pushDetail(details, "Agencia", getReservationProviderName(service));
      pushDetail(details, "Guiado", child?.tour?.tipo_guiado);
      pushDetail(details, "Idioma", Array.isArray(child?.tour?.idioma) ? child.tour.idioma.join(", ") : child?.tour?.idioma);
      break;
    case "trenes":
      pushDetail(details, "Empresa", getReservationProviderName(service));
      pushDetail(details, "Vagón / tren", child?.vagon?.tipo_tren || child?.tipo_tren);
      pushDetail(details, "Ruta", child?.vagon?.lugar_salida && child?.vagon?.lugar_destino ? `${child.vagon.lugar_salida} → ${child.vagon.lugar_destino}` : child?.lugar_salida && child?.lugar_destino ? `${child.lugar_salida} → ${child.lugar_destino}` : "");
      pushDetail(details, "Horario", child?.vagon?.hora_salida && child?.vagon?.hora_llegada ? `${child.vagon.hora_salida} - ${child.vagon.hora_llegada}` : child?.hora_salida && child?.hora_llegada ? `${child.hora_salida} - ${child.hora_llegada}` : "");
      break;
    case "vuelos":
      pushDetail(details, "Aerolínea", getReservationProviderName(service));
      pushDetail(details, "Tipo de vuelo", child?.tipo_vuelo?.tipovuelo || child?.tipovuelo);
      pushDetail(details, "Ruta", child?.tipo_vuelo?.lugar_ida && child?.tipo_vuelo?.lugar_vuelta ? `${child.tipo_vuelo.lugar_ida} → ${child.tipo_vuelo.lugar_vuelta}` : child?.lugar_ida && child?.lugar_vuelta ? `${child.lugar_ida} → ${child.lugar_vuelta}` : "");
      pushDetail(details, "Horario", child?.tipo_vuelo?.hora_salida && child?.tipo_vuelo?.hora_llegada ? `${child.tipo_vuelo.hora_salida} - ${child.tipo_vuelo.hora_llegada}` : child?.hora_salida && child?.hora_llegada ? `${child.hora_salida} - ${child.hora_llegada}` : "");
      break;
    case "restaurantes":
      pushDetail(details, "Restaurante", getReservationProviderName(service));
      pushDetail(details, "Dirección", child?.restaurante?.direccion || child?.direccion);
      break;
    case "tickets":
      pushDetail(details, "Entrada", getReservationServiceName(service));
      pushDetail(details, "Procedencia", child?.ticket?.procedencia || child?.procedencia);
      pushDetail(details, "Tipo usuario", child?.ticket?.tipo_usuario || child?.tipo_usuario);
      break;
    case "extras":
      pushDetail(details, "Extra", getReservationServiceName(service));
      pushDetail(details, "Descripción", child?.servicio_extra?.descripcion || child?.descripcion || parent?.descripcion);
      pushDetail(details, "Categoría", child?.servicio_extra?.categoria || child?.categoria || parent?.categoria);
      break;
    default:
      pushDetail(details, "Servicio", getReservationServiceName(service));
      break;
  }

  return details;
};

const addDays = (dateInput, daysToAdd = 0) => {
  if (!dateInput) return null;
  const [year, month, day] = String(dateInput).split("-").map(Number);
  const date = new Date(year || 0, (month || 1) - 1, day || 1);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + daysToAdd);
  return date;
};

const formatLongDate = (date) => {
  if (!date || Number.isNaN(date.getTime())) return "Fecha no definida";
  return `${date.getDate()} ${MONTHS_ES[date.getMonth()]} ${date.getFullYear()}`;
};

const formatShortDate = (date) => {
  if (!date || Number.isNaN(date.getTime())) return "Fecha no definida";
  return `${date.getDate()} ${MONTHS_ES[date.getMonth()]}`;
};

const diffDaysLocal = (dateA, dateB) => {
  if (!dateA || !dateB) return 0;
  const msPerDay = 86400000;
  const utcA = Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
  const utcB = Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
  return Math.round((utcA - utcB) / msPerDay);
};

const parseDateOfBirth = (raw = "") => {
  if (!raw) return null;
  const text = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const [day, month, year] = text.split("/").map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeHour = (value = "") => {
  const raw = cleanText(value);
  if (!raw) return "Hora por confirmar";
  const [hh, mm] = raw.split(":");
  if (!hh || !mm) return raw;
  const hour = Number(hh);
  if (!Number.isFinite(hour)) return raw;
  const suffix = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${mm} ${suffix}`;
};

const getPrimaryPassenger = (peopleDetails = {}) => {
  const candidates = [
    ...(Array.isArray(peopleDetails?.adults) ? peopleDetails.adults : []),
    ...(Array.isArray(peopleDetails?.details) ? peopleDetails.details : []),
    ...(Array.isArray(peopleDetails?.children) ? peopleDetails.children : []),
  ];
  return candidates.find(Boolean) || {};
};

const getPassengerName = (passenger = {}) =>
  firstValue(
    `${passenger.nombres || passenger.nombre || ""} ${passenger.apellidos || passenger.apellido || ""}`,
    passenger.fullName,
    passenger.nombre_completo,
    "Pasajero por confirmar",
  );

const getPassengerPhone = (passenger = {}) =>
  firstValue(
    passenger.telefono_emergencia,
    passenger.telefonoEmergencia,
    passenger.telefono,
    passenger.celular,
    passenger.phone,
    passenger.whatsapp,
    "Contacto por confirmar",
  );

const getPassengerNationality = (passenger = {}) =>
  firstValue(passenger.nacionalidad, passenger.pais, passenger.country, "Nacionalidad por confirmar");

const getPassengerCount = (peopleDetails = {}) => {
  const adults = Array.isArray(peopleDetails?.adults) ? peopleDetails.adults.length : 0;
  const children = Array.isArray(peopleDetails?.children) ? peopleDetails.children.length : 0;
  const infants = Array.isArray(peopleDetails?.infants) ? peopleDetails.infants.length : 0;
  const details = Array.isArray(peopleDetails?.details) ? peopleDetails.details.length : 0;
  return Math.max(1, adults + children + infants || details || 1);
};

const getHotelCheckInOut = (items = []) => {
  const dates = items
    .map((item) => item.serviceDate)
    .filter((date) => date && !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b);
  if (!dates.length) return null;
  const checkIn = dates[0];
  const lastNight = dates[dates.length - 1];
  const checkOut = new Date(lastNight);
  checkOut.setDate(checkOut.getDate() + 1);
  const nights = diffDaysLocal(checkOut, checkIn);
  return {
    checkIn,
    checkOut,
    nights: nights > 0 ? nights : 1,
  };
};

const getHotelMealPlan = (service = {}) => {
  const { parent, child, assigned } = getAssignedServiceParts(service);
  const tariff = assigned?.tariff || service?.assignedTariff || service?.tariff || {};
  return cleanText(
    tariff?.tipo_alimentacion || child?.tipo_alimentacion || parent?.tipo_alimentacion,
  );
};

const getHotelRoomDistribution = (items = [], peopleDetails = {}) => {
  const rooms = [];
  for (const item of items) {
    const service = item.service || {};
    const roomType = getReservationServiceName(service);
    const mealPlan = getHotelMealPlan(service);
    const { child, assigned } = getAssignedServiceParts(service);
    const capacity =
      child?.nro_pasajeros || child?.capacidad || assigned?.capacidad || 0;
    const paxCount = capacity > 0 ? Number(capacity) : getPassengerCount(peopleDetails) || 1;
    const existing = rooms.find(
      (room) =>
        room.roomType === roomType &&
        room.mealPlan === mealPlan &&
        room.paxCount === paxCount,
    );
    if (existing) {
      existing.count += 1;
    } else {
      rooms.push({ count: 1, roomType, mealPlan, paxCount });
    }
  }
  return rooms;
};

const getAllPassengers = (peopleDetails = {}) => {
  const adults = Array.isArray(peopleDetails?.adults) ? peopleDetails.adults : [];
  const children = Array.isArray(peopleDetails?.children) ? peopleDetails.children : [];
  const infants = Array.isArray(peopleDetails?.infants) ? peopleDetails.infants : [];
  return [...adults, ...children, ...infants].filter(Boolean);
};

const padTwo = (value) => String(Math.max(0, Number(value) || 0)).padStart(2, "0");

const toUpperText = (value, fallback = "") => cleanText(value || fallback).toUpperCase();

const toTitleCase = (value = "") =>
  cleanText(value)
    .toLocaleLowerCase("es-PE")
    .replace(/(^|\s|\/|-)(\p{L})/gu, (match, separator, letter) =>
      `${separator}${letter.toLocaleUpperCase("es-PE")}`,
    );

const formatHotelProviderGreeting = (title = "") => {
  const provider = toUpperText(title, "HOTEL");
  if (!provider) return "Hotel";
  return provider.includes("HOTEL") ? provider : `Hotel ${provider}`;
};

const formatFormalHotelDate = (date) => {
  if (!date || Number.isNaN(date.getTime())) return "POR CONFIRMAR";
  return `${date.getDate()} DE ${MONTHS_ES[date.getMonth()].toUpperCase()} DEL ${date.getFullYear()}`;
};

const formatPassengerBirthDate = (value) => {
  const date = parseDateOfBirth(value);
  if (!date) return "";
  return `${padTwo(date.getDate())}/${padTwo(date.getMonth() + 1)}/${date.getFullYear()}`;
};

const getPassengerNameParts = (passenger = {}) => {
  const explicitNames = firstValue(
    passenger.nombres,
    passenger.nombre,
    passenger.firstName,
    passenger.first_name,
  );
  const explicitLastNames = firstValue(
    passenger.apellidos,
    passenger.apellido,
    passenger.lastName,
    passenger.last_name,
    `${passenger.apellido_paterno || passenger.apellidoPaterno || ""} ${
      passenger.apellido_materno || passenger.apellidoMaterno || ""
    }`,
  );

  if (explicitNames || explicitLastNames) {
    return {
      names: toUpperText(explicitNames, "POR CONFIRMAR"),
      lastNames: toUpperText(explicitLastNames, "POR CONFIRMAR"),
    };
  }

  const parts = getPassengerName(passenger).split(/\s+/).filter(Boolean);
  if (parts.length <= 2) {
    return {
      names: toUpperText(parts.join(" "), "POR CONFIRMAR"),
      lastNames: "POR CONFIRMAR",
    };
  }

  return {
    names: toUpperText(parts.slice(0, -2).join(" "), "POR CONFIRMAR"),
    lastNames: toUpperText(parts.slice(-2).join(" "), "POR CONFIRMAR"),
  };
};

const getPassengerDocumentInfo = (passenger = {}) => {
  const docType = firstValue(
    passenger.tipo_documento,
    passenger.tipoDocumento,
    passenger.documentType,
    passenger.docType,
    passenger.numero_pasaporte || passenger.pasaporte || passenger.passport ? "Pasaporte" : "Documento",
  );
  const docNumber = firstValue(
    passenger.numero_pasaporte,
    passenger.passportNumber,
    passenger.pasaporte,
    passenger.passport,
    passenger.numero_documento,
    passenger.numeroDocumento,
    passenger.documentNumber,
    passenger.docNumber,
    passenger.documento,
    passenger.dni,
  );
  const isPassport = /pasaporte|passport|pass/i.test(cleanText(docType));
  return {
    label: isPassport ? "Número de pasaporte" : "Número de documento",
    value: toUpperText(docNumber),
    isPassport,
  };
};

const hasPassportCopy = (passenger = {}, peopleDetails = {}) => {
  const directValue =
    passenger.copia_pasaporte ??
    passenger.copiaPasaporte ??
    passenger.passport_copy ??
    passenger.passportCopy ??
    passenger.has_passport_copy ??
    passenger.hasPassportCopy;

  if (typeof directValue === "boolean") return directValue;
  if (typeof directValue === "string") return /^(si|sí|true|1|yes)$/i.test(directValue.trim());

  const documentsByPassenger =
    peopleDetails?.documentData ||
    peopleDetails?.document_data ||
    peopleDetails?.documents ||
    peopleDetails?.documentos ||
    {};

  const possibleKeys = [
    passenger.passenger_key,
    passenger.passengerKey,
    passenger.id_pasajero,
    passenger.id,
    `${passenger.nombres || passenger.nombre || ""} ${passenger.apellidos || passenger.apellido || ""}`.trim(),
  ]
    .map((key) => cleanText(key))
    .filter(Boolean);

  return possibleKeys.some((key) => {
    const docs = documentsByPassenger?.[key];
    return Array.isArray(docs?.passports) && docs.passports.length > 0;
  });
};

const formatHotelRoomDistributionLine = (room = {}) => {
  const rawRoomType = cleanText(room.roomType || "Habitación");
  const roomType = /habitaci[oó]n/i.test(rawRoomType)
    ? toTitleCase(rawRoomType)
    : `Habitación ${toTitleCase(rawRoomType)}`;
  return roomType;
};

const isAssigned = (service = {}) =>
  service?.isAssigned === true || Boolean(service?.assignedService);

const getDateKey = (date) => {
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

// Divide items de hotel en bloques de días contiguos. Cada bloque representa una
// estadía continua con su propio check-in/check-out. Días repetidos (múltiples
// habitaciones el mismo día) se mantienen en el mismo bloque.
const splitItemsByContiguousDates = (items = []) => {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => {
    const dateDiff = (a.serviceDate?.getTime() || 0) - (b.serviceDate?.getTime() || 0);
    if (dateDiff !== 0) return dateDiff;
    return (a.dayIndex || 0) - (b.dayIndex || 0);
  });

  const blocks = [];
  let currentBlock = [sorted[0]];
  let lastDateKey = getDateKey(sorted[0].serviceDate);

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const currentDateKey = getDateKey(current.serviceDate);
    const prevDate = sorted[i - 1].serviceDate;
    const isContiguous =
      currentDateKey === lastDateKey ||
      (prevDate && current.serviceDate && diffDaysLocal(current.serviceDate, prevDate) === 1);

    if (isContiguous) {
      currentBlock.push(current);
    } else {
      blocks.push(currentBlock);
      currentBlock = [current];
    }
    lastDateKey = currentDateKey;
  }
  blocks.push(currentBlock);
  return blocks;
};

export const buildReservationProviderGroups = (days = [], fechaInicio = "") => {
  const groupMap = new Map();

  (Array.isArray(days) ? days : []).forEach((day, dayIndex) => {
    (day?.servicios || []).forEach((service, serviceIndex) => {
      if (!isAssigned(service)) return;

      const typeKey = getReservationServiceTypeKey(service);
      const typeLabel = SERVICE_TYPE_LABELS[typeKey] || getReservationServiceTypeLabel(service);
      const providerName = getReservationProviderName(service);
      const providerKey = `${typeKey}::${providerName.toLowerCase()}`;
      const serviceDate = addDays(fechaInicio, dayIndex);
      const item = {
        id: `${dayIndex}-${serviceIndex}`,
        day,
        dayIndex,
        serviceIndex,
        service,
        typeKey,
        typeLabel,
        providerName,
        serviceName: getReservationServiceName(service),
        serviceDate,
      };

      if (!groupMap.has(typeKey)) {
        groupMap.set(typeKey, {
          typeKey,
          typeLabel,
          providers: new Map(),
          totalServices: 0,
        });
      }

      const typeGroup = groupMap.get(typeKey);
      typeGroup.totalServices += 1;

      if (!typeGroup.providers.has(providerKey)) {
        typeGroup.providers.set(providerKey, {
          key: providerKey,
          typeKey,
          typeLabel,
          providerName,
          items: [],
        });
      }

      typeGroup.providers.get(providerKey).items.push(item);
    });
  });

  // Para hoteles, subdividir cada proveedor en bloques de días contiguos.
  // Así cada estadía separada (por huecos de días) obtiene su propio
  // check-in / check-out y no se genera un rango genérico que cubra todo.
  Array.from(groupMap.values()).forEach((typeGroup) => {
    if (typeGroup.typeKey !== "hoteles") return;

    const contiguousProviders = new Map();
    typeGroup.providers.forEach((provider, providerKey) => {
      const blocks = splitItemsByContiguousDates(provider.items);
      if (blocks.length <= 1) {
        contiguousProviders.set(providerKey, provider);
        return;
      }

      blocks.forEach((block, blockIndex) => {
        const stay = getHotelCheckInOut(block);
        const rangeLabel = stay
          ? `${formatShortDate(stay.checkIn)} - ${formatShortDate(stay.checkOut)}`
          : `Bloque ${blockIndex + 1}`;
        const blockKey = `${providerKey}::block-${blockIndex}`;
        contiguousProviders.set(blockKey, {
          ...provider,
          key: blockKey,
          providerName: `${provider.providerName} (${rangeLabel})`,
          items: block,
        });
      });
    });

    typeGroup.providers = contiguousProviders;
  });

  return Array.from(groupMap.values()).map((group) => ({
    ...group,
    providers: Array.from(group.providers.values()).map((provider) => ({
      ...provider,
      dateLabels: Array.from(
        new Set(provider.items.map((item) => formatShortDate(item.serviceDate))),
      ),
    })),
  }));
};

const buildRelatedServices = (selectedItems = [], allDays = []) => {
  const related = [];
  const seen = new Set();

  selectedItems.forEach((item) => {
    const serviceType = item.typeKey;
    if (serviceType !== "transportes") return;

    const sameDay = allDays[item.dayIndex] || {};
    const previousDay = item.dayIndex > 0 ? allDays[item.dayIndex - 1] : null;

    const collect = (service, dayIndex, reason) => {
      if (!isAssigned(service)) return;
      const typeKey = getReservationServiceTypeKey(service);
      const allowed = ["tickets", "trenes", "vuelos"].includes(typeKey) || reason === "Hotel del día anterior";
      if (!allowed) return;
      const id = `${dayIndex}-${service?.servicioId || service?.id || getReservationProviderName(service)}-${typeKey}`;
      if (seen.has(id)) return;
      seen.add(id);
      related.push({
        dayIndex,
        reason,
        typeKey,
        typeLabel: SERVICE_TYPE_LABELS[typeKey] || getReservationServiceTypeLabel(service),
        providerName: getReservationProviderName(service),
        serviceName: getReservationServiceName(service),
        details: getReservationServiceDetails(service),
      });
    };

    (sameDay.servicios || []).forEach((service) => {
      const typeKey = getReservationServiceTypeKey(service);
      if (["tickets", "trenes", "vuelos"].includes(typeKey)) {
        collect(service, item.dayIndex, "Servicio aledaño del mismo día");
      }
    });

    (previousDay?.servicios || []).forEach((service) => {
      if (getReservationServiceTypeKey(service) === "hoteles") {
        collect(service, item.dayIndex - 1, "Hotel del día anterior");
      }
    });
  });

  return related;
};

const buildCartelName = (mainPassengerName = "") =>
  cleanText(mainPassengerName)
    .split(" ")
    .filter(Boolean)
    .slice(0, 4)
    .join(" ")
    .toUpperCase();

const isAirportPickup = (item = {}) => {
  const text = `${item.serviceName} ${getReservationServiceDetails(item.service).map((d) => d.value).join(" ")}`.toLowerCase();
  return /\bapt\b|aeropuerto|airport/.test(text) && /(hotel|htl|hote|traslado|transfer)/.test(text);
};

const dataUrlToUint8Array = (dataUrl) => {
  const base64 = dataUrl.split(",")[1] || "";
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
};

const buildHotelReservationMessageText = ({
  voucherCode,
  title,
  items,
  passengerCount,
  peopleDetails,
}) => {
  const stay = getHotelCheckInOut(items);
  const rooms = getHotelRoomDistribution(items, peopleDetails);
  const passengers = getAllPassengers(peopleDetails);
  const hotelName = formatHotelProviderGreeting(title);
  const totalPax = padTwo(passengerCount);

  const lines = [
    `Buenas tardes, estimados amigos del ${hotelName}.`,
    "",
    "Mediante la presente reciba un cordial saludo; del mismo modo le solicitamos realizar la reserva a favor del",
    `File: ${toUpperText(voucherCode)}, de la siguiente manera:`,
    "",
    `DISTRIBUCIÓN: TOTAL ${totalPax} PAX`,
  ];

  if (rooms.length > 0) {
    rooms.forEach((room) => lines.push(formatHotelRoomDistributionLine(room)));
  } else {
    lines.push("01 Habitación por confirmar");
  }

  lines.push(
    "",
    "INGRESO",
    `CHECK INN : ${stay ? formatFormalHotelDate(stay.checkIn) : "POR CONFIRMAR"}`,
    `CHECK OUT: ${stay ? formatFormalHotelDate(stay.checkOut) : "POR CONFIRMAR"}`,
    "",
    "DATOS DE LOS PASAJEROS:",
    "",
  );

  if (passengers.length > 0) {
    passengers.forEach((passenger, index) => {
      const { names, lastNames } = getPassengerNameParts(passenger);
      const nationality = toUpperText(getPassengerNationality(passenger), "POR CONFIRMAR");
      const documentInfo = getPassengerDocumentInfo(passenger);
      const birthDate = formatPassengerBirthDate(
        passenger.fecha_nacimiento || passenger.birthDate || passenger.fechaNacimiento,
      );

      lines.push(`${index + 1}.- Nombres: ${names}`);
      lines.push(`Apellidos: ${lastNames}`);
      lines.push(`Nacionalidad: ${nationality}`);
      if (documentInfo.value) {
        lines.push(`${documentInfo.label}: ${documentInfo.value}`);
      }
      if (birthDate) {
        lines.push(`Fecha de Nacimiento: ${birthDate}`);
      }
      if (documentInfo.isPassport && hasPassportCopy(passenger, peopleDetails)) {
        lines.push("Copia de pasaporte: (SI)");
      }
      lines.push("");
    });
  } else {
    lines.push("1.- Nombres: POR CONFIRMAR");
    lines.push("Apellidos: POR CONFIRMAR");
    lines.push("Nacionalidad: POR CONFIRMAR");
    lines.push("");
  }

  lines.push(
    "Quedo a la espera de que se nos remita la liquidación respectiva y estaré atenta a cualquier comentario suyo.",
    "",
    "Saludos cordiales.",
  );

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

const buildReservationMessageText = ({
  voucherCode,
  title,
  items,
  relatedServices,
  mainPassengerName,
  passengerPhone,
  passengerNationality,
  passengerCount,
  typeKey,
  peopleDetails,
}) => {
  if (typeKey === "hoteles") {
    return buildHotelReservationMessageText({
      voucherCode,
      title,
      items,
      mainPassengerName,
      passengerPhone,
      passengerNationality,
      passengerCount,
      peopleDetails,
    });
  }

  const lines = [
    "🔔 SOLICITUD DE RESERVA",
    `📁 File: ${voucherCode}`,
    "━━━━━━━━━━━━━━",
    `📌 Proveedor: ${title}`,
    `👤 Pasajero: ${mainPassengerName}`,
    `🌍 Nacionalidad: ${passengerNationality}`,
    `📱 Contacto: ${passengerPhone}`,
    `👥 N° de pasajeros: ${String(passengerCount).padStart(2, "0")}`,
    "",
  ];

  items.forEach((item, index) => {
    const details = getReservationServiceDetails(item.service);
    const hourLabel = normalizeHour(item.service?.assignedService?.hora || item.service?.hora);
    const airportPickup = isAirportPickup(item);
    const cartelName = buildCartelName(mainPassengerName);

    if (index > 0) lines.push("━━━━━━━━━━━━━━");
    lines.push(`📅 Fecha: ${formatLongDate(item.serviceDate)}`);
    lines.push(`⏰ Hora: ${hourLabel}`);
    lines.push(`${item.typeKey === "transportes" ? "🚐" : item.typeKey === "hoteles" ? "🏨" : item.typeKey === "trenes" ? "🚞" : item.typeKey === "vuelos" ? "✈️" : item.typeKey === "tickets" ? "🎫" : item.typeKey === "restaurantes" ? "🍽️" : "📌"} Servicio: ${item.serviceName}`);

    details.forEach((detail) => {
      const label = cleanText(detail.label);
      const value = cleanText(detail.value);
      if (!label || !value) return;

      // En mensajería de transportes, el servicio ya aparece en la línea
      // principal. Omitimos el duplicado y la zona para mantener el texto breve.
      if (
        item.typeKey === "transportes" &&
        ["Servicio", "Zona"].includes(label)
      ) {
        return;
      }

      lines.push(`• ${label}: ${value}`);
    });

    if (airportPickup && cartelName) {
      lines.push(`🪧 PINTAR EL CARTEL: ${cartelName}`);
    }
    lines.push("");
  });

  if (relatedServices.length > 0) {
    lines.push("━━━━━━━━━━━━━━");
    lines.push("📎 Coordinaciones aledañas");
    relatedServices.forEach((service) => {
      lines.push(`• Día ${service.dayIndex + 1}: ${service.typeLabel} - ${service.providerName}`);
      lines.push(`  ${service.serviceName}`);
    });
    lines.push("");
  }

  lines.push("📌 Observación: Ninguna, salvo indicación posterior del área de reservas.");

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

const downloadUrl = (url, filename) => {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const copyTextToClipboard = async (text) => {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
};

const ReservationRequestModal = ({
  isOpen,
  onClose,
  request,
  voucher = {},
  peopleDetails = {},
  fechaInicio = "",
  allDays = [],
}) => {
  const sheetRef = useRef(null);
  const messageRef = useRef(null);
  const pendingDownloadRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [formatMode, setFormatMode] = useState("sheet");
  const [copied, setCopied] = useState(false);
  const mainPassenger = getPrimaryPassenger(peopleDetails);
  const mainPassengerName = getPassengerName(mainPassenger);
  const passengerPhone = getPassengerPhone(mainPassenger);
  const passengerNationality = getPassengerNationality(mainPassenger);
  const passengerCount = getPassengerCount(peopleDetails);
  const voucherCode = firstValue(
    voucher?.reservationVoucher?.voucher_code,
    voucher?.reservationVoucher?.voucherCode,
    voucher?.voucher_code,
    voucher?.voucherCode,
    voucher?.id,
    "FILE-SIN-CODIGO",
  );

  const items = useMemo(() => {
    if (!request) return [];
    if (request.mode === "single") return request.items || [];
    return request.items || [];
  }, [request]);

  const relatedServices = useMemo(
    () => buildRelatedServices(items, allDays),
    [items, allDays],
  );

  const title = request?.providerName || items[0]?.providerName || "Solicitud de reserva";
  const typeLabel = request?.typeLabel || items[0]?.typeLabel || "Servicio";
  const typeKey = request?.typeKey || items[0]?.typeKey || "servicios";
  const isHotelRequest = typeKey === "hoteles";
  const filenameBase = `${voucherCode}_${typeLabel}_${title}`
    .replace(/[^a-z0-9ñáéíóúü]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);

  const messageText = useMemo(
    () =>
      buildReservationMessageText({
        voucherCode,
        title,
        items,
        relatedServices,
        mainPassengerName,
        passengerPhone,
        passengerNationality,
        passengerCount,
        typeKey,
        peopleDetails,
      }),
    [
      voucherCode,
      title,
      items,
      relatedServices,
      mainPassengerName,
      passengerPhone,
      passengerNationality,
      passengerCount,
      typeKey,
      peopleDetails,
    ],
  );

  const getExportDataUrl = async () => {
    if (!sheetRef.current) return "";
    const node = sheetRef.current;
    const modalBody = node.closest(".modal-body");

    const originalBodyStyles = modalBody
      ? {
          maxHeight: modalBody.style.maxHeight,
          overflow: modalBody.style.overflow,
          height: modalBody.style.height,
        }
      : null;

    const originalNodeStyles = {
      maxHeight: node.style.maxHeight,
      overflow: node.style.overflow,
      height: node.style.height,
    };

    if (modalBody) {
      modalBody.style.maxHeight = "none";
      modalBody.style.overflow = "visible";
      modalBody.style.height = "auto";
    }
    node.style.maxHeight = "none";
    node.style.overflow = "visible";
    node.style.height = "auto";

    try {
      const canvas = await html2canvas(node, {
        scale: 1,
        useCORS: false,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
        imageTimeout: 0,
        width: Math.max(node.scrollWidth, node.offsetWidth),
        height: Math.max(node.scrollHeight, node.offsetHeight),
        windowWidth: Math.max(node.scrollWidth, node.offsetWidth),
        windowHeight: Math.max(node.scrollHeight, node.offsetHeight),
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        ignoreElements: (element) =>
          element?.classList?.contains("rr-no-export"),
      });
      return canvas.toDataURL("image/jpeg", 0.92);
    } catch (error) {
      console.error("Error capturando sheet con html2canvas:", error);
      return "";
    } finally {
      if (modalBody && originalBodyStyles) {
        modalBody.style.maxHeight = originalBodyStyles.maxHeight;
        modalBody.style.overflow = originalBodyStyles.overflow;
        modalBody.style.height = originalBodyStyles.height;
      }
      node.style.maxHeight = originalNodeStyles.maxHeight;
      node.style.overflow = originalNodeStyles.overflow;
      node.style.height = originalNodeStyles.height;
    }
  };

  const handleCopyText = async () => {
    try {
      await copyTextToClipboard(messageText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error("No se pudo copiar la solicitud:", error);
    }
  };

  const runDownload = async (format) => {
    if (!sheetRef.current || downloading) return;
    setDownloading(true);
    try {
      const dataUrl = await getExportDataUrl();
      if (!dataUrl) return;
      if (format === "jpg") {
        downloadUrl(dataUrl, `${filenameBase || "solicitud_reserva"}.jpg`);
        return;
      }
      const imageBytes = dataUrlToUint8Array(dataUrl);
      const pdfDoc = await PDFDocument.create();
      const jpg = await pdfDoc.embedJpg(imageBytes);
      const margin = 24;
      const pageWidth = 595.28;
      const imageRatio = jpg.height / jpg.width;
      const imageWidth = pageWidth - margin * 2;
      const imageHeight = imageWidth * imageRatio;
      const pageHeight = Math.max(841.89, imageHeight + margin * 2);
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      page.drawImage(jpg, {
        x: margin,
        y: pageHeight - margin - imageHeight,
        width: imageWidth,
        height: imageHeight,
      });
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      downloadUrl(url, `${filenameBase || "solicitud_reserva"}.pdf`);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error) {
      console.error(
        `No se pudo descargar la solicitud como ${format.toUpperCase()}:`,
        error,
      );
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    if (formatMode === "sheet" && pendingDownloadRef.current && !downloading) {
      const format = pendingDownloadRef.current;
      pendingDownloadRef.current = null;
      runDownload(format);
    }
  }, [formatMode, downloading, runDownload]);

  const handleDownloadJpg = () => {
    if (downloading) return;
    if (formatMode !== "sheet") {
      pendingDownloadRef.current = "jpg";
      setFormatMode("sheet");
      return;
    }
    runDownload("jpg");
  };

  const handleDownloadPdf = () => {
    if (downloading) return;
    if (formatMode !== "sheet") {
      pendingDownloadRef.current = "pdf";
      setFormatMode("sheet");
      return;
    }
    runDownload("pdf");
  };

  const renderHotelSheet = () => (
    <div
      className="reservation-request-sheet reservation-request-sheet--hotel-letter"
      ref={sheetRef}
    >
      <pre className="rr-hotel-letter__text">{messageText}</pre>
    </div>
  );

  const renderGenericSheet = () => (
    <div className="reservation-request-sheet" ref={sheetRef}>
      <header className="rr-document-header">
        <div className="rr-document-title">
          <span>Solicitud de reserva</span>
          <h2>{typeLabel}</h2>
          <p>{title}</p>
        </div>
        <div className="rr-file-badge">
          <span>File</span>
          <strong>{voucherCode}</strong>
        </div>
      </header>

      <section className="rr-summary-board">
        <div className="rr-summary-card rr-summary-card--passenger">
          <h3>Pasajero</h3>
          <dl>
            <div>
              <dt>Titular</dt>
              <dd>{mainPassengerName}</dd>
            </div>
            <div>
              <dt>Nacionalidad</dt>
              <dd>{passengerNationality}</dd>
            </div>
            <div>
              <dt>Contacto / emergencia</dt>
              <dd>{passengerPhone}</dd>
            </div>
            <div>
              <dt>N° pasajeros</dt>
              <dd>{String(passengerCount).padStart(2, "0")}</dd>
            </div>
          </dl>
        </div>

        <div className="rr-summary-card rr-summary-card--provider">
          <h3>Proveedor</h3>
          <dl>
            <div>
              <dt>Nombre</dt>
              <dd>{title}</dd>
            </div>
            <div>
              <dt>Fechas de servicio</dt>
              <dd>
                {Array.from(new Set(items.map((item) => formatShortDate(item.serviceDate)))).join(" · ") ||
                  "Por confirmar"}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="rr-service-ledger">
        {items.map((item) => {
          const details = getReservationServiceDetails(item.service);
          const airportPickup = isAirportPickup(item);
          const cartelName = buildCartelName(mainPassengerName);
          const hourLabel = normalizeHour(
            item.service?.assignedService?.hora || item.service?.hora,
          );

          return (
            <article className="rr-service-entry" key={item.id}>
              <div className="rr-service-entry__date">
                <span>Día {item.day?.numero || item.dayIndex + 1}</span>
                <strong>{formatLongDate(item.serviceDate)}</strong>
                <em>{hourLabel}</em>
              </div>

              <div className="rr-service-entry__body">
                <div className="rr-service-entry__heading">
                  <span>{item.typeLabel}</span>
                  <h3>{item.serviceName}</h3>
                </div>

                <div className="rr-detail-list">
                  {details.map((detail) => (
                    <div
                      className="rr-detail-row"
                      key={`${item.id}-${detail.label}-${detail.value}`}
                    >
                      <dt>{detail.label}</dt>
                      <dd>{detail.value}</dd>
                    </div>
                  ))}
                </div>

                {airportPickup && cartelName && (
                  <div className="rr-cartel-strip">
                    <span>Pintar cartel</span>
                    <strong>{cartelName}</strong>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {relatedServices.length > 0 && (
        <section className="rr-related-panel">
          <h3>Coordinaciones aledañas</h3>
          <div className="rr-related-list">
            {relatedServices.map((service, index) => (
              <div
                className="rr-related-row"
                key={`${service.dayIndex}-${service.typeKey}-${index}`}
              >
                <span>{service.reason}</span>
                <strong>
                  Día {service.dayIndex + 1} · {service.typeLabel}: {service.providerName}
                </strong>
                <p>{service.serviceName}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="rr-document-footer">
        <div>
          <span>Observación</span>
          <p>Ninguna, salvo indicación posterior del área de reservas.</p>
        </div>
        <small>Emitido desde gestión de reservas</small>
      </footer>
    </div>
  );

  const renderContent = () => {
    if (formatMode === "sheet") {
      return isHotelRequest ? renderHotelSheet() : renderGenericSheet();
    }
    return (
      <section
        className={`rr-message-preview${isHotelRequest ? " rr-message-preview--hotel-letter" : ""}`}
        ref={messageRef}
      >
        <div className="rr-message-preview__toolbar rr-no-export">
          <strong>Texto listo para copiar y enviar por WhatsApp o mensajería</strong>
          <button type="button" onClick={handleCopyText}>
            <MdContentCopy /> {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
        <pre>{messageText}</pre>
      </section>
    );
  };

  if (!isOpen || !request) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Solicitud de reserva - ${typeLabel}`}
      size="large"
      className="reservation-request-modal"
      actions={[
        {
          label: copied ? "Copiado" : "Copiar texto",
          onClick: handleCopyText,
          variant: "secondary",
          disabled: downloading,
          icon: <MdContentCopy />,
        },
        {
          label: downloading ? "Generando..." : "Descargar JPG",
          onClick: handleDownloadJpg,
          variant: "primary",
          disabled: downloading,
          icon: <MdFileDownload />,
        },
        {
          label: "Descargar PDF",
          onClick: handleDownloadPdf,
          variant: "secondary",
          disabled: downloading,
          icon: <MdPictureAsPdf />,
        },
        {
          label: "Cerrar",
          onClick: onClose,
          variant: "secondary",
          icon: <MdClose />,
        },
      ]}
    >
      <div className="rr-format-switch rr-no-export" role="group" aria-label="Formato de solicitud">
        <button
          type="button"
          className={formatMode === "sheet" ? "is-active" : ""}
          onClick={() => setFormatMode("sheet")}
        >
          Formato documento
        </button>
        <button
          type="button"
          className={formatMode === "message" ? "is-active" : ""}
          onClick={() => setFormatMode("message")}
        >
          Texto para mensajería
        </button>
      </div>

      {renderContent()}
    </Modal>
  );
};

export default ReservationRequestModal;
