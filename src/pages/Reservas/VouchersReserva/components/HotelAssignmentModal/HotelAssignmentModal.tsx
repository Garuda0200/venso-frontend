import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import axiosInstance from "../../../../../utils/axiosInstance";
import { pasajeroService } from "../../../../../services/pasajeroService";
import "./HotelAssignmentModal.scss";
import {
  FaTimes,
  FaHotel,
  FaBed,
  FaCalendarCheck,
  FaUsers,
  FaCheck,
  FaLock,
  FaTrash,
  FaPlus,
  FaStar,
  FaArrowLeft,
  FaMapMarkerAlt,
  FaExclamationTriangle,
  FaInfoCircle,
  FaMoon,
  FaDollarSign,
  FaRegCheckCircle,
} from "react-icons/fa";
import { MdSelectAll } from "react-icons/md";
import {
  createUnifiedService,
  getPassengerIdsByType,
} from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/unifiedServiceManager";
import { getParentId } from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/ServicePicker/utils/serviceTypes";
import { convertRoomTariffsToDollars } from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/tariffCurrency";

// Componentes modulares
import {
  CategorySelection,
  HotelSelection,
  RoomSelection,
  ReviewSelection,
  capacityFromRoom,
  getAssignedBedCountFromItinerary,
  isHotelService,
  getRoomCapacityFromType,
  formatPrice,
} from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/HotelItinerary";

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const STEP_ORDER = ["days", "category", "hotel", "room", "review"];

const calculateAge = (birthDate) => {
  if (!birthDate) return 30;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

const hasReservationHotelAssignment = (service = {}) => {
  if (service?.isAssigned === true) return true;
  if (
    service?.assignedService &&
    Object.keys(service.assignedService).length > 0
  ) {
    return true;
  }
  return false;
};

const getAssignableHotelServices = (day = {}) =>
  (day.servicios || []).filter((service) => {
    if (isHotelService(service)) return true;
    const typeService =
      service.typeService?.toLowerCase() ||
      service.parentService?.typeService?.toLowerCase() ||
      service.assignedService?.parentService?.typeService?.toLowerCase();
    return typeService === "hoteles" || typeService?.includes("hotel");
  });

const getUnassignedHotelServices = (day = {}) =>
  getAssignableHotelServices(day).filter(
    (service) => !hasReservationHotelAssignment(service),
  );

const getAssignedHotelServices = (day = {}) =>
  getAssignableHotelServices(day).filter((service) =>
    hasReservationHotelAssignment(service),
  );

const getQuotedHotelName = (day = {}) => {
  const hotelServices = getAssignableHotelServices(day);
  const unassigned = hotelServices.filter(
    (svc) => !hasReservationHotelAssignment(svc),
  );
  const candidates = unassigned.length > 0 ? unassigned : hotelServices;
  for (const svc of candidates) {
    const name =
      svc.parentService?.nombre ||
      svc.parentService?.name ||
      svc.hotel_nombre ||
      svc.nombre ||
      svc.serviceName;
    if (name) return name;
  }
  return null;
};

const getQuotedHotelCategory = (day = {}) => {
  const hotelServices = getAssignableHotelServices(day);
  const unassigned = hotelServices.filter(
    (svc) => !hasReservationHotelAssignment(svc),
  );
  const candidates = unassigned.length > 0 ? unassigned : hotelServices;
  for (const svc of candidates) {
    const cat =
      svc.parentService?.categoria ||
      svc.hotel_categoria ||
      svc.categoria;
    if (cat) return cat;
  }
  return null;
};

const buildSelectedRoomId = (hotel, room, tariff, priceType = null) => {
  const hotelId = hotel?.id_hotel || hotel?.id || "hotel";
  const roomId =
    room?.id_habitacion || room?.id || room?.tipo_habitacion || "room";
  const tariffId = tariff?.id_tarifa || tariff?.id || "tariff";
  return `${hotelId}-${roomId}-${tariffId}-${priceType || "base"}`;
};

const getRoomUnitPrice = (item) => {
  const tariff = item.tariff;
  if (item.customPrice !== null && item.customPrice !== undefined) {
    return Number(item.customPrice);
  }
  return Number(
    tariff?.precio ||
      tariff?.precio_compartido ||
      tariff?.precio_privado ||
      tariff?.precio_unico ||
      0,
  );
};

const buildHotelPassengerSelection = (peopleDetails = {}) => {
  const passengerIds = getPassengerIdsByType(peopleDetails);
  return buildHotelPassengerSelectionForIds(peopleDetails, passengerIds.allPassengerIds);
};

const buildHotelPassengerSelectionForIds = (peopleDetails = {}, selectedIds = []) => {
  const passengerIds = getPassengerIdsByType(peopleDetails);
  const selectedIdSet = new Set((selectedIds || []).filter(Boolean));
  const childIdSet = new Set(passengerIds.childIds || []);
  const convertedChildToAdultMap = {};

  selectedIdSet.forEach((id) => {
    if (childIdSet.has(id)) convertedChildToAdultMap[id] = true;
  });

  return {
    selectedIds: [...selectedIdSet],
    assignedPassengerCount: selectedIdSet.size,
    assignedChildExplicitCount: 0,
    assignedChildExplicitPriceMap: {},
    assignedChildExplicitPriceSum: 0,
    pricingMode: "adult",
    childPercentageMap: {},
    uniformPercentage: "",
    treatChildrenAsAdults: Object.keys(convertedChildToAdultMap).length > 0,
    convertedChildToAdultMap,
  };
};

const distributePassengerIdsToRooms = (roomItems = [], peopleDetails = {}) => {
  const { adultIds, childIds, allPassengerIds } =
    getPassengerIdsByType(peopleDetails);
  const orderedIds =
    adultIds.length + childIds.length > 0
      ? [...adultIds, ...childIds]
      : allPassengerIds;

  const physicalRooms = [];
  roomItems.forEach((item) => {
    const qty = Math.max(1, item.quantity || 1);
    for (let i = 0; i < qty; i++) {
      physicalRooms.push(item);
    }
  });

  let idx = 0;
  return physicalRooms.map((room) => {
    const ids = [];
    while (ids.length < capacityFromRoom(room.room) && idx < orderedIds.length) {
      ids.push(orderedIds[idx++]);
    }
    return ids;
  });
};

const normalizePassengerIdList = (value) => {
  if (!value) return [];

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        return normalizePassengerIdList(JSON.parse(trimmed));
      } catch {
        return [trimmed];
      }
    }
    return [trimmed];
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizePassengerIdList(item))
      .filter(Boolean);
  }

  if (typeof value === "object") {
    const id =
      value.rowId ||
      value.passengerId ||
      value.pasajero_id ||
      value.persona_id ||
      value.id_pasajero ||
      value.id_persona ||
      value.child_origin ||
      value.id ||
      value.value;
    if (id) return [String(id)];

    return Object.entries(value)
      .filter(([, enabled]) => enabled)
      .map(([key]) => String(key));
  }

  return [String(value)];
};

const extractHotelAssignedPassengerIds = (service = {}) => {
  const sources = [
    service.assignedPassengerIds,
    service.assignedPassengerSelection?.selectedIds,
    service.passengerSelection?.selectedIds,
    service.assignedService?.assignedPassengerIds,
    service.assignedService?.assignedPassengerSelection?.selectedIds,
    service.assignedService?.passengerSelection?.selectedIds,
    service.assigned_beneficiarios_adultos,
    service.assigned_beneficiarios_ninos,
    service.assignedService?.assigned_beneficiarios_adultos,
    service.assignedService?.assigned_beneficiarios_ninos,
  ];

  return [...new Set(sources.flatMap(normalizePassengerIdList).filter(Boolean))];
};

const getHotelServiceAssignedCount = (service = {}) => {
  const ids = extractHotelAssignedPassengerIds(service);
  if (ids.length > 0) return ids.length;
  return (
    Number(service.assignedPassengerCount) ||
    Number(service.assignedPassengerSelection?.assignedPassengerCount) ||
    Number(service.passengerSelection?.assignedPassengerCount) ||
    Number(service.assignedService?.assignedPassengerCount) ||
    Number(service.assignedService?.passengerSelection?.assignedPassengerCount) ||
    0
  );
};

const getHotelServiceCapacity = (service = {}) => {
  const capacity =
    service.habitacion_capacidad ||
    service.assignedService?.habitacion_capacidad ||
    service.childService?.habitacion?.capacidad ||
    service.childService?.capacidad ||
    service.assignedService?.childService?.habitacion?.capacidad ||
    service.assignedService?.childService?.capacidad ||
    getRoomCapacityFromType(
      service.habitacion_tipo ||
        service.childService?.tipo_habitacion ||
        service.assignedService?.habitacion_tipo ||
        service.assignedService?.childService?.tipo_habitacion ||
        "",
    );
  return Math.max(0, Number(capacity) || 0);
};

const getDayHotelAssignmentProgress = (day = {}, totalPassengers = 0) => {
  const assignedHotels = getAssignedHotelServices(day);
  const uniqueIds = new Set();
  let fallbackAssignedCount = 0;
  let totalCapacity = 0;

  assignedHotels.forEach((service) => {
    const ids = extractHotelAssignedPassengerIds(service);
    ids.forEach((id) => uniqueIds.add(id));
    if (ids.length === 0) fallbackAssignedCount += getHotelServiceAssignedCount(service);
    totalCapacity += getHotelServiceCapacity(service);
  });

  const assignedCount = uniqueIds.size || fallbackAssignedCount;
  return {
    assignedCount: Math.min(assignedCount, Math.max(assignedCount, totalPassengers)),
    totalCapacity,
    totalPassengers,
    pendingCount: Math.max(0, totalPassengers - assignedCount),
    isFullyAccommodated: totalPassengers > 0 && assignedCount >= totalPassengers,
  };
};

const buildPhysicalRoomSlots = (selectedRooms = []) => {
  const slots = [];
  selectedRooms.forEach((item, selectedIndex) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    for (let roomIndex = 0; roomIndex < qty; roomIndex += 1) {
      slots.push({
        id: `${item.id || selectedIndex}__slot_${roomIndex}`,
        item,
        selectedIndex,
        roomIndex,
        capacity: capacityFromRoom(item.room),
        label:
          qty > 1
            ? `${item.room?.tipo_habitacion || "Habitación"} ${roomIndex + 1}`
            : item.room?.tipo_habitacion || "Habitación",
      });
    }
  });
  return slots;
};

const getPassengerLabel = (passengerId, peopleDetails = {}) => {
  const { adultIds, childIds } = getPassengerIdsByType(peopleDetails);
  const adultIndex = adultIds.indexOf(passengerId);
  if (adultIndex >= 0) {
    const person = peopleDetails.adults?.[adultIndex] || {};
    return person.nombre || person.nombres || `Adulto ${adultIndex + 1}`;
  }

  const childIndex = childIds.indexOf(passengerId);
  if (childIndex >= 0) {
    const person = peopleDetails.children?.[childIndex] || {};
    return person.nombre || person.nombres || `Niño ${childIndex + 1}`;
  }

  return String(passengerId || "Pasajero");
};

const isChildPassengerId = (passengerId, peopleDetails = {}) => {
  const { childIds } = getPassengerIdsByType(peopleDetails);
  return childIds.includes(passengerId);
};

const normalizeRoomAssignmentsState = (
  currentAssignments = {},
  roomSlots = [],
  peopleDetails = {},
) => {
  const { adultIds, childIds, allPassengerIds } = getPassengerIdsByType(peopleDetails);
  const orderedPassengerIds =
    adultIds.length + childIds.length > 0
      ? [...adultIds, ...childIds]
      : allPassengerIds;
  const validPassengerIds = new Set(orderedPassengerIds);
  const usedPassengers = new Set();
  const next = {};

  roomSlots.forEach((slot) => {
    const currentIds = Array.isArray(currentAssignments?.[slot.id])
      ? currentAssignments[slot.id]
      : [];
    next[slot.id] = currentIds
      .filter((id) => validPassengerIds.has(id) && !usedPassengers.has(id))
      .slice(0, slot.capacity);
    next[slot.id].forEach((id) => usedPassengers.add(id));
  });

  orderedPassengerIds.forEach((passengerId) => {
    if (usedPassengers.has(passengerId)) return;
    const targetSlot = roomSlots.find(
      (slot) => (next[slot.id] || []).length < slot.capacity,
    );
    if (!targetSlot) return;
    next[targetSlot.id] = [...(next[targetSlot.id] || []), passengerId];
    usedPassengers.add(passengerId);
  });

  return next;
};

const getCategoryKey = (categoryName) => {
  const raw = String(categoryName || "");
  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/hotel\s+/g, "")
    .trim();
  const starCount = (raw.match(/\u2B50/g) || []).length;
  const numberMatch = normalized.match(/([1-5])\s*(?:estrellas?|stars?)/i);
  const stars = starCount || (numberMatch ? Number(numberMatch[1]) : 0);
  const superior =
    normalized.includes("superior") ||
    normalized.includes("sup") ||
    normalized.includes("plus") ||
    normalized.includes("+") ||
    raw.trim().endsWith("*");
  return stars > 0 ? `${stars}${superior ? "s" : ""}` : normalized;
};

const findMatchingCategory = (categoryName, categories = []) => {
  if (!categoryName || categories.length === 0) return null;
  const detectedKey = getCategoryKey(categoryName);
  return categories.find((cat) => {
    const catName = cat.name || "";
    if (catName === categoryName) return true;
    const catKey = getCategoryKey(catName);
    if (catKey && catKey === detectedKey) return true;
    const normalized1 = catName
      .toLowerCase()
      .replace(/hotel\s+/g, "")
      .trim();
    const normalized2 = String(categoryName)
      .toLowerCase()
      .replace(/hotel\s+/g, "")
      .trim();
    return (
      normalized1 === normalized2 ||
      catName.includes(normalized2) ||
      normalized2.includes(catName)
    );
  });
};

// Componente interno: tarjeta resumen lateral
const SummarySidebar = ({
  selectedDays,
  days,
  selectedHotel,
  selectedRooms,
  totalPassengers,
  step,
  assignedPassengerCount = 0,
}) => {
  const totalCapacity = selectedRooms.reduce(
    (sum, item) => sum + capacityFromRoom(item.room) * (item.quantity || 1),
    0,
  );
  const totalRooms = selectedRooms.reduce(
    (sum, item) => sum + (item.quantity || 1),
    0,
  );

  const currency =
    selectedRooms[0]?.tariff?.moneda ||
    selectedHotel?.moneda ||
    "dolares";

  const totalPrice = selectedRooms.reduce((sum, item) => {
    const unit = getRoomUnitPrice(item);
    return sum + unit * (item.quantity || 1) * selectedDays.length;
  }, 0);

  const isAssignmentMet = assignedPassengerCount >= totalPassengers;
  const isOverCapacity = totalCapacity > totalPassengers;

  if (step === "days") return null;

  return (
    <div className="summary-sidebar">
      <div className="summary-section">
        <h4>
          <FaCalendarCheck /> Días seleccionados
        </h4>
        {selectedDays.length === 0 ? (
          <p className="summary-empty">Ningún día seleccionado</p>
        ) : (
          <div className="day-chips">
            {selectedDays.map((dayIndex) => (
              <span key={dayIndex} className="day-chip">
                D{dayIndex + 1}
              </span>
            ))}
          </div>
        )}
      </div>

      {selectedHotel && (
        <div className="summary-section hotel-summary">
          <h4>
            <FaHotel /> Hotel
          </h4>
          <div className="hotel-card-mini">
            <span className="hotel-name">{selectedHotel.nombre}</span>
            <span className="hotel-meta">
              <FaMapMarkerAlt /> {selectedHotel.ciudad || "Sin ciudad"} ·{" "}
              {selectedHotel.categoria || "Sin categoría"}
            </span>
          </div>
        </div>
      )}

      <div className="summary-section">
        <h4>
          <FaBed /> Habitaciones ({totalRooms})
        </h4>
        {selectedRooms.length === 0 ? (
          <p className="summary-empty">No hay habitaciones seleccionadas</p>
        ) : (
          <ul className="room-summary-list">
            {selectedRooms.map((item, idx) => {
              const qty = item.quantity || 1;
              const cap = capacityFromRoom(item.room);
              const unit = getRoomUnitPrice(item);
              return (
                <li key={item.id || idx} className="room-summary-item">
                  <div className="room-summary-main">
                    <span className="room-type">
                      {item.room.tipo_habitacion || "Habitación"}
                    </span>
                    {qty > 1 && (
                      <span className="room-qty">×{qty}</span>
                    )}
                  </div>
                  <div className="room-summary-sub">
                    <span>{cap * qty} pax</span>
                    <span>{formatPrice(unit * qty, currency)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="summary-section capacity-summary">
        <h4>
          <FaUsers /> Asignación
        </h4>
        <div className="capacity-bar-wrapper">
          <div className="capacity-bar-bg">
            <div
              className={`capacity-bar-fill ${isAssignmentMet ? (isOverCapacity ? "over" : "ok") : "low"}`}
              style={{
                width: `${Math.min((assignedPassengerCount / Math.max(1, totalPassengers)) * 100, 100)}%`,
              }}
            />
          </div>
          <div className="capacity-label">
            {assignedPassengerCount} / {totalPassengers} pax · capacidad {totalCapacity}
          </div>
        </div>
        {!isAssignmentMet && (
          <div className="capacity-alert">
            <FaExclamationTriangle />
            <span>Faltan {totalPassengers - assignedPassengerCount} pasajeros</span>
          </div>
        )}
      </div>

      {selectedRooms.length > 0 && (
        <div className="summary-section total-summary">
          <div className="total-row">
            <span>
              <FaMoon /> {selectedDays.length} noche
              {selectedDays.length !== 1 ? "s" : ""}
            </span>
            <span className="total-price">
              <FaDollarSign />
              {formatPrice(totalPrice, currency)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// Componente interno: tarjeta de día
const DayCard = ({
  dayInfo,
  isSelected,
  onToggle,
  totalPassengers,
  onRemoveAssigned,
}) => {
  const {
    day,
    dayIndex,
    unassignedHotels,
    assignedHotels,
    isDayAvailable,
    hasAssignedHotels,
    occupancy,
  } = dayInfo;

  const quotedHotelName = getQuotedHotelName(day);
  const isFullyAssigned = Boolean(occupancy?.isFullyAccommodated);
  const canSelect = isDayAvailable || (hasAssignedHotels && !isFullyAssigned);
  const occupancyPct = Math.min(
    100,
    Math.round(
      (occupancy.assignedCount / Math.max(1, totalPassengers)) * 100,
    ),
  );
  const pendingCount = Math.max(0, occupancy.pendingCount || 0);

  return (
    <div
      className={`day-card ${isSelected ? "selected" : ""} ${!canSelect ? "disabled" : ""} ${hasAssignedHotels ? "assigned" : ""}`}
    >
      <div className="day-card-main" onClick={() => canSelect && onToggle(dayIndex)}>
        <div className="day-card-header">
          <div className="day-title-block">
            <span className="day-number">Día {dayIndex + 1}</span>
            <span className="day-title" title={day.titulo}>
              {day.titulo || "Sin título"}
            </span>
          </div>
          {canSelect ? (
            <div
              className={`custom-checkbox ${isSelected ? "checked" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(dayIndex);
              }}
            >
              {isSelected && <FaCheck />}
            </div>
          ) : (
            <span className={`day-status ${hasAssignedHotels ? "assigned" : "empty"}`}>
              {hasAssignedHotels ? <FaCheck /> : "-"}
            </span>
          )}
        </div>

        <div className="day-occupancy">
          <div className="occupancy-header">
            <span className="occupancy-label">Ocupación</span>
            <span className="occupancy-value">
              {occupancy.assignedCount}/{totalPassengers} pax
            </span>
          </div>
          <div className="occupancy-bar-bg">
            <div
              className={`occupancy-bar-fill ${occupancyPct >= 100 ? "complete" : occupancyPct >= 70 ? "warning" : "low"}`}
              style={{ width: `${occupancyPct}%` }}
            />
          </div>
        </div>

        <div className="day-badges">
          {(unassignedHotels.length > 0 || pendingCount > 0) && (
            <span className="badge badge-pending">
              {pendingCount > 0
                ? `${pendingCount} pax pendientes`
                : `${unassignedHotels.length} por asignar`}
            </span>
          )}
          {assignedHotels.length > 0 && (
            <span className="badge badge-assigned">
              {assignedHotels.length} asignado
              {assignedHotels.length !== 1 ? "s" : ""}
            </span>
          )}
          {!isDayAvailable && !hasAssignedHotels && (
            <span className="badge badge-none">No requiere hotel</span>
          )}
        </div>
      </div>

      {quotedHotelName && (
        <div className="day-quoted-hotel">
          <FaHotel />
          <span className="quoted-label">Cotizado:</span>
          <span className="quoted-name" title={quotedHotelName}>
            {quotedHotelName}
          </span>
        </div>
      )}

      {assignedHotels.length > 0 && (
        <div className="day-assigned-list">
          {assignedHotels.map((hotel, hotelIdx) => {
            const hotelName =
              hotel.assignedService?.parentService?.nombre ||
              hotel.hotel_nombre ||
              hotel.parentService?.nombre ||
              hotel.nombre ||
              "Hotel";
            const tipoHabitacion =
              hotel.assignedService?.childService?.tipo_habitacion ||
              hotel.childService?.tipo_habitacion ||
              hotel.tipo_habitacion ||
              "";
            const displayName = tipoHabitacion
              ? `${hotelName} · ${tipoHabitacion}`
              : hotelName;
            const hotelServiceId =
              hotel.id || hotel.serviceId || `hotel-${dayIndex}-${hotelIdx}`;
            const hasPaymentRequest =
              hotel.paymentRequest &&
              Object.keys(hotel.paymentRequest).length > 0;
            const isPaid = hotel.paymentRequest?.status === "paid";
            const isPending = hasPaymentRequest && !isPaid;
            const canEdit = !hasPaymentRequest;

            return (
              <div
                key={hotelServiceId}
                className={`assigned-hotel-chip ${isPaid ? "paid" : isPending ? "pending" : ""}`}
              >
                <FaHotel />
                <span className="assigned-name" title={displayName}>
                  {displayName}
                </span>
                {canEdit ? (
                  <button
                    className="remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveAssigned(dayIndex, hotelServiceId);
                    }}
                    title="Quitar asignación"
                  >
                    <FaTimes />
                  </button>
                ) : (
                  <FaLock className="locked-icon" title="No editable" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const RoomAssignmentBoard = ({
  roomSlots,
  roomAssignments,
  peopleDetails,
  totalPassengers,
  onAssignPassenger,
  onRemovePassenger,
  onAutoDistribute,
}) => {
  if (roomSlots.length === 0) return null;

  const { allPassengerIds } = getPassengerIdsByType(peopleDetails);
  const assignedIds = new Set(
    Object.values(roomAssignments || {})
      .flat()
      .filter(Boolean),
  );
  const unassignedIds = allPassengerIds.filter((id) => !assignedIds.has(id));
  const assignedCount = assignedIds.size;
  const totalCapacity = roomSlots.reduce((sum, slot) => sum + slot.capacity, 0);

  return (
    <div className="ham-assignment-board">
      <div className="ham-assignment-head">
        <div>
          <strong>Asignación por habitación</strong>
          <span>
            {assignedCount}/{totalPassengers} pasajeros asignados · capacidad{" "}
            {totalCapacity}
          </span>
        </div>
        <button type="button" onClick={onAutoDistribute}>
          Reasignar automático
        </button>
      </div>

      {unassignedIds.length > 0 && (
        <div className="ham-unassigned-row">
          <span className="ham-unassigned-label">Pendientes</span>
          <div className="ham-passenger-strip">
            {unassignedIds.map((passengerId) => (
              <button
                type="button"
                key={passengerId}
                className={`ham-passenger-chip ${isChildPassengerId(passengerId, peopleDetails) ? "child" : ""}`}
                onClick={() => {
                  const firstAvailable = roomSlots.find(
                    (slot) =>
                      (roomAssignments?.[slot.id] || []).length < slot.capacity,
                  );
                  if (firstAvailable) {
                    onAssignPassenger(passengerId, firstAvailable.id);
                  }
                }}
              >
                <FaUsers />
                {getPassengerLabel(passengerId, peopleDetails)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="ham-room-grid">
        {roomSlots.map((slot) => {
          const passengerIds = roomAssignments?.[slot.id] || [];
          const isFull = passengerIds.length >= slot.capacity;

          return (
            <div key={slot.id} className={`ham-room-card ${isFull ? "full" : ""}`}>
              <div className="ham-room-card__head">
                <div>
                  <strong>{slot.label}</strong>
                  <span>
                    {slot.item?.hotel?.nombre || "Hotel"} · {slot.capacity} pax
                    máx.
                  </span>
                </div>
                <span className="ham-room-count">
                  {passengerIds.length}/{slot.capacity}
                </span>
              </div>

              <div className="ham-room-card__body">
                {passengerIds.length === 0 ? (
                  <span className="ham-room-empty">Sin pasajeros asignados</span>
                ) : (
                  passengerIds.map((passengerId) => (
                    <button
                      type="button"
                      key={passengerId}
                      className={`ham-passenger-chip ${isChildPassengerId(passengerId, peopleDetails) ? "child" : ""}`}
                      onClick={() => onRemovePassenger(passengerId, slot.id)}
                      title="Quitar de esta habitación"
                    >
                      <FaTimes />
                      {getPassengerLabel(passengerId, peopleDetails)}
                    </button>
                  ))
                )}
              </div>

              {!isFull && unassignedIds.length > 0 && (
                <button
                  type="button"
                  className="ham-room-add"
                  onClick={() => onAssignPassenger(unassignedIds[0], slot.id)}
                >
                  <FaPlus /> Asignar pendiente
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const HotelAssignmentModal = ({
  isOpen,
  onClose,
  days = [],
  totalPassengers: propTotalPassengers,
  onAddHotelToDays,
  itinerary = {},
  removeHotelFromDay,
  packageType = "compartido",
  peopleDetails: propPeopleDetails = {},
  voucherReservaId = null,
}) => {
  const tariffType = "interna";

  const [passengers, setPassengers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selectedDays, setSelectedDays] = useState([]);
  const [step, setStep] = useState("days");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [selectedTariff, setSelectedTariff] = useState(null);
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [roomAssignments, setRoomAssignments] = useState({});
  const [customPrice, setCustomPrice] = useState(null);
  const [filters, setFilters] = useState({
    search: "",
    categoria: "",
    ciudad: "",
  });

  // Cargar pasajeros del voucher de reserva
  useEffect(() => {
    const fetchPassengers = async () => {
      if (!voucherReservaId || !isOpen) return;
      try {
        const { passengers: fetchedPassengers } =
          await pasajeroService.getPassengersByVoucherReserva(voucherReservaId);
        setPassengers(fetchedPassengers || []);
      } catch (error) {
        setPassengers([]);
      }
    };
    fetchPassengers();
  }, [voucherReservaId, isOpen]);

  const peopleDetails = useMemo(() => {
    if (passengers.length > 0) {
      const adults = [];
      const children = [];
      passengers.forEach((p) => {
        const age =
          p.edad || (p.fecha_nacimiento ? calculateAge(p.fecha_nacimiento) : 30);
        if (age >= 18) {
          adults.push({ nombre: p.nombre || p.nombres, edad: age, id: p.id });
        } else {
          children.push({ nombre: p.nombre || p.nombres, edad: age, id: p.id });
        }
      });
      return { adults, children };
    }
    return propPeopleDetails;
  }, [passengers, propPeopleDetails]);

  const totalPassengers = useMemo(() => {
    if (passengers.length > 0) return passengers.length;
    if (propTotalPassengers) return propTotalPassengers;
    const adults = Array.isArray(propPeopleDetails?.adults)
      ? propPeopleDetails.adults.length
      : 0;
    const children = Array.isArray(propPeopleDetails?.children)
      ? propPeopleDetails.children.length
      : 0;
    return adults + children;
  }, [passengers, propTotalPassengers, propPeopleDetails]);

  const dayAssignmentInfo = useMemo(
    () =>
      (days || []).map((day, index) => {
        const unassignedHotels = getUnassignedHotelServices(day);
        const assignedHotels = getAssignedHotelServices(day);
        const occupancy = getDayHotelAssignmentProgress(day, totalPassengers);
        return {
          day,
          dayIndex: index,
          unassignedHotels,
          assignedHotels,
          isDayAvailable: unassignedHotels.length > 0,
          hasAssignedHotels: assignedHotels.length > 0,
          occupancy,
        };
      }),
    [days, totalPassengers],
  );

  // Resetear todo al cerrar el modal
  useEffect(() => {
    if (!isOpen) {
      setSelectedDays([]);
      setStep("days");
      setSelectedCategory(null);
      setSelectedHotel(null);
      setSelectedRoom(null);
      setSelectedTariff(null);
      setSelectedRooms([]);
      setRoomAssignments({});
      setCustomPrice(null);
      setFilters({ search: "", categoria: "", ciudad: "" });
      setCategories([]);
      setHotels([]);
      setRooms([]);
      setError(null);
    }
  }, [isOpen]);

  // Cargar categorias al abrir
  useEffect(() => {
    if (isOpen) fetchHotelCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Cargar hoteles cuando cambia la categoria seleccionada
  useEffect(() => {
    if (selectedCategory && categories.length > 0) {
      fetchHotelsByCategory(selectedCategory);
    } else {
      setHotels([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, categories]);

  // Cargar habitaciones cuando cambia el hotel seleccionado
  useEffect(() => {
    if (selectedHotel) {
      fetchRooms(selectedHotel.id_hotel || selectedHotel.id);
    } else {
      setRooms([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHotel]);

  const fetchHotelCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.get("/turismo/hoteles", {
        params: { activo: true },
      });
      let hotelsData =
        response.data?.success && Array.isArray(response.data.data)
          ? response.data.data
          : Array.isArray(response.data)
            ? response.data
            : [];

      const categoriesMap = {};
      hotelsData.forEach((hotel) => {
        const categoria = hotel.categoria || "Sin categoria";
        if (!categoriesMap[categoria])
          categoriesMap[categoria] = { name: categoria, hotels: [], count: 0 };
        categoriesMap[categoria].hotels.push(hotel);
        categoriesMap[categoria].count++;
      });
      setCategories(
        Object.values(categoriesMap).sort((a, b) => b.count - a.count),
      );
    } catch (err) {
      setError("Error al cargar categorias de hoteles");
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchHotelsByCategory = async (category) => {
    setLoading(true);
    try {
      const categoryData = categories.find((cat) => cat.name === category);
      if (categoryData) {
        const allRooms = await fetchRoomsForCategory(categoryData.hotels);
        const filtered = filterValidParents(
          categoryData.hotels,
          allRooms,
          "hoteles",
          tariffType,
        );
        setHotels(filtered);
      } else {
        setHotels([]);
      }
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
      const response = await axiosInstance.get("/turismo/hoteles", {
        params: { activo: true },
      });
      if (response.data?.success && Array.isArray(response.data.data))
        setHotels(response.data.data);
      else if (Array.isArray(response.data)) setHotels(response.data);
      else setHotels([]);
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
      const response = await axiosInstance.get(
        `/turismo/habitaciones/hotel/${hotelId}/con-tarifas`,
      );
      let roomsData =
        response.data?.success && Array.isArray(response.data.data)
          ? response.data.data
          : Array.isArray(response.data)
            ? response.data
            : [];

      const roomsWithMatchingTariffs = roomsData.filter((room) => {
        if (!Array.isArray(room.tarifas) || room.tarifas.length === 0)
          return false;
        return room.tarifas.some((t) => t.tipo_tarifa === tariffType);
      });

      // ReservaServiceEditor trabaja sus assigned_* en USD. Normalizar aquí
      // evita que selección, totales y persistencia reutilicen el monto PEN.
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
        const response = await axiosInstance.get(
          `/turismo/habitaciones/hotel/${hotelId}/con-tarifas`,
        );
        return response.data?.data || response.data || [];
      }),
    );
    results.forEach((r) => {
      if (r.status === "fulfilled" && Array.isArray(r.value))
        allRooms.push(...r.value);
    });
    return allRooms;
  };

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

  const unassignedPassengers = useMemo(() => {
    const assignableDays = dayAssignmentInfo.filter(
      (dayInfo) => dayInfo.isDayAvailable || dayInfo.hasAssignedHotels,
    );
    if (assignableDays.length === 0) return 0;
    return assignableDays.reduce(
      (maxPending, dayInfo) =>
        Math.max(maxPending, Number(dayInfo.occupancy?.pendingCount) || 0),
      0,
    );
  }, [dayAssignmentInfo]);

  const countHotelsUsedByCategory = (categoryName) => {
    let count = 0;
    days.forEach((day) => {
      const hotelServices = getAssignableHotelServices(day);
      hotelServices.forEach((service) => {
        const cat =
          service.hotel_categoria || service.parentService?.categoria || "";
        if (cat === categoryName) count++;
      });
    });
    return count;
  };

  const availableDaysForAssignment = useMemo(
    () =>
      dayAssignmentInfo
        .filter(
          (dayInfo) =>
            dayInfo.isDayAvailable ||
            (dayInfo.hasAssignedHotels &&
              !dayInfo.occupancy?.isFullyAccommodated),
        )
        .map((dayInfo) => dayInfo.dayIndex),
    [dayAssignmentInfo],
  );

  const handleDayToggle = (index) => {
    setSelectedDays((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index].sort((a, b) => a - b),
    );
  };

  const handleSelectAllDays = () =>
    setSelectedDays([...availableDaysForAssignment]);
  const handleDeselectAllDays = () => setSelectedDays([]);

  const startAssignmentFlow = () => {
    if (selectedDays.length === 0) {
      alert("Selecciona al menos un dia");
      return;
    }
    setStep("category");
    setSelectedCategory(null);
    setSelectedHotel(null);
    setSelectedRoom(null);
    setSelectedTariff(null);
    setSelectedRooms([]);
    setRoomAssignments({});
    setCustomPrice(null);
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const totalSelectedCapacity = useMemo(
    () =>
      selectedRooms.reduce(
        (sum, item) =>
          sum + capacityFromRoom(item.room) * (item.quantity || 1),
        0,
      ),
    [selectedRooms],
  );

  const totalSelectedRoomsCount = useMemo(
    () =>
      selectedRooms.reduce(
        (sum, item) => sum + Math.max(1, item.quantity || 1),
        0,
      ),
    [selectedRooms],
  );

  const roomSlots = useMemo(
    () => buildPhysicalRoomSlots(selectedRooms),
    [selectedRooms],
  );

  useEffect(() => {
    if (!isOpen || roomSlots.length === 0) {
      if (roomSlots.length === 0) setRoomAssignments({});
      return;
    }

    setRoomAssignments((current) =>
      normalizeRoomAssignmentsState(current, roomSlots, peopleDetails),
    );
  }, [isOpen, roomSlots, peopleDetails]);

  const assignedPreviewPassengerIds = useMemo(
    () => [
      ...new Set(
        Object.values(roomAssignments || {})
          .flat()
          .filter(Boolean),
      ),
    ],
    [roomAssignments],
  );

  const previewAssignedPassengerCount = assignedPreviewPassengerIds.length;

  const handleAssignPassengerToRoom = (passengerId, slotId) => {
    const targetSlot = roomSlots.find((slot) => slot.id === slotId);
    if (!targetSlot) return;

    setRoomAssignments((current) => {
      const next = {};
      Object.entries(current || {}).forEach(([key, ids]) => {
        next[key] = (Array.isArray(ids) ? ids : []).filter(
          (id) => id !== passengerId,
        );
      });

      const targetIds = next[slotId] || [];
      if (targetIds.length >= targetSlot.capacity) return current;

      return {
        ...next,
        [slotId]: [...targetIds, passengerId],
      };
    });
  };

  const handleRemovePassengerFromRoom = (passengerId, slotId) => {
    setRoomAssignments((current) => ({
      ...(current || {}),
      [slotId]: (current?.[slotId] || []).filter((id) => id !== passengerId),
    }));
  };

  const handleAutoDistributeRooms = () => {
    setRoomAssignments(normalizeRoomAssignmentsState({}, roomSlots, peopleDetails));
  };

  const toggleRoomSelection = (room, hotel, tariff, priceType = null) => {
    const quantityDelta = typeof priceType === "number" ? priceType : null;
    const selectedType =
      typeof priceType === "string" ? priceType : tariff?.selectedType || null;
    const hotelToUse = hotel || selectedHotel;
    const tariffWithType = selectedType
      ? { ...tariff, selectedType }
      : tariff;
    const selectionId = buildSelectedRoomId(
      hotelToUse,
      room,
      tariffWithType,
      selectedType,
    );

    const existingIndex = selectedRooms.findIndex((item) => {
      if (item.id && item.id === selectionId) return true;
      const itemRoomId = item.room.id_habitacion || item.room.id;
      const itemHotelId = item.hotel?.id_hotel || item.hotel?.id;
      const itemTariffId = item.tariff?.id_tarifa || item.tariff?.id;
      const itemPriceType = item.tariff?.selectedType || null;
      const roomId = room.id_habitacion || room.id;
      const hotelId = hotelToUse?.id_hotel || hotelToUse?.id;
      const tariffId = tariff?.id_tarifa || tariff?.id;
      return (
        itemRoomId === roomId &&
        itemHotelId === hotelId &&
        itemTariffId === tariffId &&
        itemPriceType === selectedType
      );
    });

    if (quantityDelta !== null) {
      setSelectedRooms((prev) => {
        if (existingIndex >= 0) {
          const currentQty = Math.max(1, prev[existingIndex].quantity || 1);
          const nextQty = currentQty + quantityDelta;
          if (nextQty <= 0) {
            return prev.filter((_, idx) => idx !== existingIndex);
          }
          return prev.map((item, idx) =>
            idx === existingIndex ? { ...item, quantity: nextQty } : item,
          );
        }
        if (quantityDelta <= 0) return prev;
        return [
          ...prev,
          {
            id: selectionId,
            hotel: hotelToUse,
            room,
            tariff: tariffWithType,
            customPrice: null,
            quantity: quantityDelta,
          },
        ];
      });
      return;
    }

    if (existingIndex >= 0) {
      setSelectedRooms((prev) => prev.filter((_, idx) => idx !== existingIndex));
    } else {
      setSelectedRooms((prev) => [
        ...prev,
        {
          id: selectionId,
          hotel: hotelToUse,
          room,
          tariff: tariffWithType,
          customPrice: null,
          quantity: 1,
        },
      ]);
    }
  };

  const removeFromSelection = (index) => {
    setSelectedRooms((prev) => prev.filter((_, idx) => idx !== index));
  };

  const clearRoomSelection = () => {
    setSelectedRooms([]);
    setRoomAssignments({});
  };

  const handleRemoveRoom = (roomIdentifier) => {
    setSelectedRooms((prev) =>
      prev.filter(
        (item, idx) => item.id !== roomIdentifier && idx !== roomIdentifier,
      ),
    );
  };

  const handleUpdateRoomPrice = (roomIdentifier, newPrice) => {
    setSelectedRooms((prev) =>
      prev.map((item, idx) =>
        item.id === roomIdentifier || idx === roomIdentifier
          ? { ...item, customPrice: newPrice }
          : item,
      ),
    );
  };

  const handleUpdateRoomQuantity = (roomIdentifier, nextQuantity) => {
    const safeQuantity = parseInt(nextQuantity, 10) || 0;
    setSelectedRooms((prev) => {
      if (safeQuantity <= 0) {
        return prev.filter(
          (item, idx) =>
            item.id !== roomIdentifier && idx !== roomIdentifier,
        );
      }
      return prev.map((item, idx) =>
        item.id === roomIdentifier || idx === roomIdentifier
          ? { ...item, quantity: safeQuantity }
          : item,
      );
    });
  };

  const buildServicesForSelectedDays = () => {
    if (selectedDays.length === 0 || selectedRooms.length === 0 || !selectedHotel)
      return [];

    return roomSlots.map((slot) => {
      const item = slot.item;
      const { hotel, room, tariff, customPrice } = item;
      const tariffToUse =
        customPrice !== null && customPrice !== undefined
          ? {
              ...tariff,
              precio_privado: Number(customPrice),
              precio_compartido: Number(customPrice),
              precio: Number(customPrice),
            }
          : tariff;

      const roomWithHotel = {
        ...room,
        hotel_id: hotel?.id_hotel || hotel?.id,
        habitacion: {
          ...room,
          tipo_habitacion: room.tipo_habitacion,
          capacidad: capacityFromRoom(room),
        },
      };

      const passengerIdsForRoom = roomAssignments?.[slot.id] || [];
      if (passengerIdsForRoom.length === 0) return null;
      const passengerSelection = buildHotelPassengerSelectionForIds(
        peopleDetails,
        passengerIdsForRoom,
      );

      const hotelService = createUnifiedService(
        hotel,
        roomWithHotel,
        tariffToUse,
        peopleDetails,
        packageType,
        passengerSelection,
      );
      hotelService.habitacion_capacidad = capacityFromRoom(room);
      hotelService.hotel_nombre = hotel?.nombre;
      hotelService.hotel_categoria = hotel?.categoria;
      hotelService.hotel_ciudad = hotel?.ciudad;
      hotelService.habitacion_tipo = room.tipo_habitacion;
      hotelService.tariffType = tariffType;
      hotelService.assignedPassengerIds = passengerIdsForRoom;
      hotelService.assignedPassengerCount = passengerIdsForRoom.length;

      return hotelService;
    }).filter(Boolean);
  };

  const handleAddToItinerary = () => {
    if (selectedDays.length === 0) {
      alert("Selecciona al menos un dia");
      return;
    }
    if (selectedRooms.length === 0) {
      alert("Selecciona al menos una habitacion");
      return;
    }
    if (previewAssignedPassengerCount < totalPassengers) {
      if (
        !window.confirm(
          `Hay ${previewAssignedPassengerCount} de ${totalPassengers} pasajeros asignados. ¿Deseas continuar de todos modos?`,
        )
      ) {
        return;
      }
    }

    const services = buildServicesForSelectedDays();
    if (services.length === 0) {
      alert("No hay habitaciones validas para agregar");
      return;
    }

    onAddHotelToDays(selectedDays, services);

    setStep("days");
    setSelectedDays([]);
    setSelectedCategory(null);
    setSelectedHotel(null);
    setSelectedRoom(null);
    setSelectedTariff(null);
    setSelectedRooms([]);
    setRoomAssignments({});
    setCustomPrice(null);
  };

  const handleRemoveHotelFromDay = (dayIndex, serviceId) => {
    if (removeHotelFromDay) removeHotelFromDay(dayIndex, serviceId);
  };

  const handleClearAllHotels = () => {
    if (!removeHotelFromDay) return;
    if (!window.confirm("Eliminar todos los hoteles asignados del itinerario?"))
      return;
    days.forEach((day, dayIndex) => {
      getAssignedHotelServices(day).forEach((service) => {
        const serviceId =
          service.id || service.serviceId || `hotel-${dayIndex}-${service.id}`;
        removeHotelFromDay(dayIndex, serviceId);
      });
    });
  };

  const navigateBack = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) {
      setStep(STEP_ORDER[idx - 1]);
      if (step === "hotel" || step === "hotel-all") {
        setSelectedHotel(null);
      } else if (step === "room") {
        setSelectedRoom(null);
        setSelectedTariff(null);
      }
    }
  };

  if (!isOpen) return null;

  const stepLabels = {
    days: "Días",
    category: "Categoría",
    hotel: "Hotel",
    "hotel-all": "Hotel",
    room: "Habitación",
    review: "Confirmar",
  };

  const currentStepIndex = STEP_ORDER.indexOf(
    step === "hotel-all" ? "hotel" : step,
  );

  const modalContent = (
    <div className="hotel-itinerary-modal-overlay">
      <div className="hotel-itinerary-modal">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-content">
            <h2>
              <FaHotel className="header-icon" />
              Gestionar Hoteles
            </h2>
            <span className="modal-subtitle">
              Tarifa interna · {totalPassengers} pasajeros
            </span>
          </div>
          <button className="close-button" onClick={onClose} title="Cerrar">
            <FaTimes />
          </button>
        </div>

        <div className="modal-body">
          {/* Progress Steps */}
          <div className="progress-steps">
            {STEP_ORDER.map((s, idx) => {
              const label = stepLabels[s] || s;
              const isActive = currentStepIndex === idx;
              const isCompleted = currentStepIndex > idx;
              return (
                <div
                  key={s}
                  className={`step ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`}
                >
                  <div className="step-circle">
                    {isCompleted ? <FaCheck /> : idx + 1}
                  </div>
                  <span className="step-label">{label}</span>
                  {idx < STEP_ORDER.length - 1 && (
                    <div
                      className={`step-connector ${isCompleted ? "completed" : ""}`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Info pasajeros */}
          <div className="passenger-info">
            <div className="info-card">
              <FaUsers />
              <span>{totalPassengers} pasajeros</span>
            </div>
            {unassignedPassengers > 0 && (
              <div className="info-card warning">
                <FaExclamationTriangle />
                <span>{unassignedPassengers} sin asignar</span>
              </div>
            )}
            {step !== "days" && (
              <div
                className={`info-card ${previewAssignedPassengerCount >= totalPassengers ? "success" : "info"}`}
              >
                <FaBed />
                <span>
                  {totalSelectedRoomsCount} hab. · {previewAssignedPassengerCount}/
                  {totalPassengers} pax asignados
                </span>
              </div>
            )}
          </div>

          <div className="modal-workspace">
            {/* Contenido principal */}
            <div className="workspace-main">
              {error && (
                <div className="modal-alert error">
                  <FaExclamationTriangle />
                  <span>{error}</span>
                  <button onClick={fetchHotelCategories}>Reintentar</button>
                </div>
              )}

              {step === "days" && (
                <div className="panel days-panel">
                  <div className="panel-header">
                    <h3>
                      <FaCalendarCheck /> Seleccionar días
                    </h3>
                    <div className="panel-actions">
                      <button
                        className="select-all-btn"
                        onClick={
                          selectedDays.length ===
                            availableDaysForAssignment.length &&
                          availableDaysForAssignment.length > 0
                            ? handleDeselectAllDays
                            : handleSelectAllDays
                        }
                      >
                        <MdSelectAll />
                        {selectedDays.length ===
                          availableDaysForAssignment.length &&
                        availableDaysForAssignment.length > 0
                          ? "Limpiar"
                          : "Seleccionar disponibles"}
                      </button>
                      <button
                        className="clear-all-btn"
                        onClick={handleClearAllHotels}
                        title="Eliminar todos los hoteles"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                  <div className="panel-body">
                    <div className="days-grid">
                      {dayAssignmentInfo.map((dayInfo) => (
                        <DayCard
                          key={dayInfo.dayIndex}
                          dayInfo={dayInfo}
                          isSelected={selectedDays.includes(dayInfo.dayIndex)}
                          onToggle={handleDayToggle}
                          totalPassengers={totalPassengers}
                          onRemoveAssigned={handleRemoveHotelFromDay}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === "category" && (
                <CategorySelection
                  categories={categories}
                  selectedCategory={selectedCategory}
                  onSelectCategory={(cat) => {
                    setSelectedCategory(cat);
                    setSelectedHotel(null);
                    setSelectedRoom(null);
                    setSelectedTariff(null);
                    setSelectedRooms([]);
                    setRoomAssignments({});
                    setStep("hotel");
                  }}
                  countHotelsUsedByCategory={countHotelsUsedByCategory}
                  loading={loading}
                  error={error}
                  onRetry={fetchHotelCategories}
                />
              )}

              {(step === "hotel" || step === "hotel-all") && (
                <HotelSelection
                  hotels={hotels}
                  selectedHotel={selectedHotel}
                  selectedCategory={selectedCategory}
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  onSelectHotel={(hotel) => {
                    setSelectedHotel(hotel);
                    setSelectedRoom(null);
                    setSelectedTariff(null);
                    setSelectedRooms([]);
                    setRoomAssignments({});
                    setStep("room");
                  }}
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

              {step === "room" && selectedHotel && (
                <RoomSelection
                  rooms={rooms}
                  selectedRoom={selectedRoom}
                  selectedTariff={selectedTariff}
                  selectedHotel={selectedHotel}
                  packageType={packageType}
                  autoOptions={[]}
                  selectedAutoIndex={0}
                  autoEnabled={false}
                  showAutoSuggest={false}
                  onSelectRoom={setSelectedRoom}
                  onSelectTariff={setSelectedTariff}
                  onSetStep={(nextStep) => {
                    if (nextStep !== "review") setStep(nextStep);
                  }}
                  onBack={() => {
                    const previousStep = selectedCategory ? "hotel" : "hotel-all";
                    setStep(previousStep);
                    setSelectedRoom(null);
                    setSelectedTariff(null);
                  }}
                  onToggleAutoEnabled={() => {}}
                  onSetSelectedAutoIndex={() => {}}
                  onCloseAutoSuggest={() => {}}
                  onAcceptAutoDistribution={() => {}}
                  loading={loading}
                  selectedRooms={selectedRooms}
                  totalPassengers={totalPassengers}
                  onToggleRoom={toggleRoomSelection}
                  onRemoveFromSelection={removeFromSelection}
                  onClearSelection={clearRoomSelection}
                  onUpdateQuantity={handleUpdateRoomQuantity}
                />
              )}

              {step === "room" && selectedHotel && selectedRooms.length > 0 && (
                <RoomAssignmentBoard
                  roomSlots={roomSlots}
                  roomAssignments={roomAssignments}
                  peopleDetails={peopleDetails}
                  totalPassengers={totalPassengers}
                  onAssignPassenger={handleAssignPassengerToRoom}
                  onRemovePassenger={handleRemovePassengerFromRoom}
                  onAutoDistribute={handleAutoDistributeRooms}
                />
              )}

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
                    selectedRooms={selectedRooms}
                    onRemoveRoom={handleRemoveRoom}
                    onUpdateRoomPrice={handleUpdateRoomPrice}
                    totalPassengers={totalPassengers}
                  />
                )}
            </div>

            {/* Sidebar resumen */}
            <SummarySidebar
              selectedDays={selectedDays}
              days={days}
              selectedHotel={selectedHotel}
              selectedRooms={selectedRooms}
              totalPassengers={totalPassengers}
              step={step}
              assignedPassengerCount={previewAssignedPassengerCount}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {step === "days" ? (
            <>
              <button className="cancel-btn" onClick={onClose}>
                Cerrar
              </button>
              <button
                className="confirm-btn"
                onClick={startAssignmentFlow}
                disabled={selectedDays.length === 0}
              >
                <FaHotel />
                Asignar hotel a {selectedDays.length} día
                {selectedDays.length !== 1 ? "s" : ""}
              </button>
            </>
          ) : (
            <>
              <button className="secondary-btn" onClick={navigateBack}>
                <FaArrowLeft /> Volver
              </button>
              {step === "room" && selectedRooms.length > 0 && (
                <button
                  className="confirm-btn"
                  onClick={() => setStep("review")}
                >
                  <FaRegCheckCircle /> Revisar selección
                </button>
              )}
              {step === "review" && (
                <>
                  <button
                    className="secondary-btn"
                    onClick={() => setStep("room")}
                  >
                    <FaPlus /> Agregar más
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() => {
                      setSelectedHotel(null);
                      setSelectedRoom(null);
                      setSelectedTariff(null);
                      setSelectedRooms([]);
                      setRoomAssignments({});
                      setRooms([]);
                      setStep("hotel");
                    }}
                  >
                    <FaHotel /> Elegir otro hotel
                  </button>
                  <button className="confirm-btn" onClick={handleAddToItinerary}>
                    <FaCheck /> Guardar asignación
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default HotelAssignmentModal;

export { getAssignedBedCountFromItinerary, getRoomCapacityFromType };
export const getRequiredBedCount = (peopleDetails = {}, city, category) => {
  const { getChildBedPolicy } =
    require("../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/HotelItinerary");
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
