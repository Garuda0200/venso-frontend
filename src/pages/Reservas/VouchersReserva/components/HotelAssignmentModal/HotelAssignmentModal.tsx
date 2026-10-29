import {buildHotelAssignmentService} from "../../utils/hotelAssignmentPricing";
import { readWithRetry } from "../../../../../utils/readWithRetry";
import { useState, useEffect, useMemo, useRef } from "react";
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
  FaRegCheckCircle,
} from "react-icons/fa";
import { MdSelectAll } from "react-icons/md";
import {
  createUnifiedService,
  getPassengerIdsByType,
} from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/unifiedServiceManager";
import { getParentId } from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/ServicePicker/utils/serviceTypes";
import { assignedPaymentExchangeRate, DEFAULT_ASSIGNED_PEN_RATE, storedPaymentCurrency, formatPaymentMoney, formatPaymentTotals, sumPaymentCurrencies } from "../../../../../utils/paymentCurrency";
import { hotelOccupantId, hotelPassengerIds, roomCapacity } from "../../../../../utils/roomCapacity";
import { roomTariffPrice } from "../../../../../utils/roomTariff";
import { normalizeReservationPassengerRows } from "../../utils/passengerClassification";
import {
  compatibleHotelDestinations, emptyHotelRoomDistribution, hasHotelAssignment,
  hotelDestinationIds, hotelRoomSnapshot, hotelServiceId, isHotelPaymentCommitted, planHotelRoomDistribution,
  quotedHotelPassengerIds, quotedHotelCategory,
} from "../../utils/hotelAssignmentRooms";

// Componentes modulares
import {
  CategorySelection,
  HotelSelection,
  RoomSelection,
  ReviewSelection,
  getAssignedBedCountFromItinerary,
  isHotelService,
  getRoomCapacityFromType,
} from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/HotelItinerary";

const reservationRoomCapacity = room => roomCapacity(room, {allowLegacy:false}) || 0;
const EMPTY_DAYS = [];
const EMPTY_PEOPLE_DETAILS = {adults:[],children:[]};

const STEP_ORDER = ["days", "category", "hotel", "room", "review"];

// La API de habitaciones con tarifas devuelve HabitacionConTarifas
// ({ habitacion, tarifas }). El editor, la asignación y las tarifas trabajan
// con la entidad habitación directamente. Conservar el wrapper aquí hacía que
// `id_habitacion` quedara enterrado y se guardara `assigned_child_id = null`.
const getHotelRoomEntity = (room = {}) => {
  if (room?.id_habitacion != null) return room;
  if (room?.habitacion?.id_habitacion != null) return room.habitacion;
  if (room?.habitacion?.habitacion?.id_habitacion != null) {
    return room.habitacion.habitacion;
  }
  return room;
};

const normalizeHotelRoomWithTariffs = (room = {}) => {
  const entity = getHotelRoomEntity(room);
  return {
    ...room,
    ...entity,
    habitacion: entity,
    tarifas: Array.isArray(room?.tarifas)
      ? room.tarifas
      : Array.isArray(entity?.tarifas)
        ? entity.tarifas
        : [],
  };
};

const hasReservationHotelAssignment = hasHotelAssignment;

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

const buildSelectedRoomId = (hotel, room, tariff, priceType = null) => {
  const hotelId = hotel?.id_hotel || hotel?.id || "hotel";
  const roomEntity = getHotelRoomEntity(room);
  const roomId =
    roomEntity?.id_habitacion ||
    roomEntity?.id ||
    roomEntity?.tipo_habitacion ||
    "room";
  const tariffId = tariff?.id_tarifa || tariff?.id || "tariff";
  return `${hotelId}-${roomId}-${tariffId}-${priceType || "base"}`;
};

const getRoomUnitPrice = (item) => {
  const tariff = item.tariff;
  if (item.customPrice !== null && item.customPrice !== undefined) {
    return Number(item.customPrice);
  }
  return Number(
    tariff?.precio ?? roomTariffPrice(tariff),
  );
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
  const assignedAdults = service.assignedBeneficiariosAdultos ??
    service.assigned_beneficiarios_adultos ??
    service.assignedService?.assignedBeneficiariosAdultos ??
    service.assignedService?.assigned_beneficiarios_adultos;
  const assignedChildren = service.assignedBeneficiariosNinos ??
    service.assigned_beneficiarios_ninos ??
    service.assignedService?.assignedBeneficiariosNinos ??
    service.assignedService?.assigned_beneficiarios_ninos;
  if (Array.isArray(assignedAdults) || Array.isArray(assignedChildren)) {
    return [...new Set([assignedAdults, assignedChildren]
      .flatMap(normalizePassengerIdList).filter(Boolean))];
  }
  const selectedIds = [
    service.assignedPassengerIds,
    service.assignedService?.assignedPassengerIds,
    service.assignedPassengerSelection?.selectedIds,
    service.assignedService?.assignedPassengerSelection?.selectedIds,
    service.assignedService?.passengerSelection?.selectedIds,
    service.passengerSelection?.selectedIds,
  ].find(Array.isArray);
  return [...new Set(normalizePassengerIdList(selectedIds).filter(Boolean))];
};

const getHotelServiceAssignedCount = (service = {}) => {
  const ids = extractHotelAssignedPassengerIds(service);
  if (ids.length > 0) return ids.length;
  if ([
    service.assignedBeneficiariosAdultos,
    service.assigned_beneficiarios_adultos,
    service.assignedBeneficiariosNinos,
    service.assigned_beneficiarios_ninos,
    service.assignedPassengerIds,
    service.assignedPassengerSelection?.selectedIds,
  ].some(Array.isArray)) return 0;
  return (
    Number(service.assignedPassengerCount) ||
    Number(service.assignedPassengerSelection?.assignedPassengerCount) ||
    Number(service.passengerSelection?.assignedPassengerCount) ||
    Number(service.assignedService?.assignedPassengerCount) ||
    Number(service.assignedService?.passengerSelection?.assignedPassengerCount) ||
    0
  );
};

const getDayHotelAssignmentProgress = (day = {}) => {
  const assignedHotels = getAssignedHotelServices(day);
  const uniqueIds = new Set();
  let fallbackAssignedCount = 0;
  let totalCapacity = 0;

  assignedHotels.forEach((service) => {
    const ids = extractHotelAssignedPassengerIds(service);
    ids.map(hotelOccupantId).filter(Boolean).forEach((id) => uniqueIds.add(id));
    if (ids.length === 0) fallbackAssignedCount += getHotelServiceAssignedCount(service);
    totalCapacity += hotelRoomSnapshot(service,true).capacity || 0;
  });

  const quotedIds = new Set(getAssignableHotelServices(day).flatMap(quotedHotelPassengerIds));
  const targetCount = quotedIds.size;
  const assignedCount = uniqueIds.size || fallbackAssignedCount;
  return {
    assignedCount,
    totalCapacity,
    totalPassengers: targetCount,
    pendingCount: [...quotedIds].filter(id => !uniqueIds.has(id)).length,
    isFullyAccommodated: targetCount > 0 && [...quotedIds].every(id => uniqueIds.has(id)),
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
        capacity: roomCapacity(item.room, {allowLegacy:false}) || 0,
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
  const adultIndex = adultIds.findIndex(id=>hotelOccupantId(id)===hotelOccupantId(passengerId));
  if (adultIndex >= 0) {
    const person = peopleDetails.adults?.[adultIndex] || {};
    return person.nombre || person.nombres || `Adulto ${adultIndex + 1}`;
  }

  const childIndex = childIds.findIndex(id=>hotelOccupantId(id)===hotelOccupantId(passengerId));
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

const HotelDestinationRecord = ({service,peopleDetails,roomNumber,onRemove}) => {
  const quoted = hotelRoomSnapshot(service);
  const actual = hotelRoomSnapshot(service,true);
  const assigned=service.assignedService || {};
  const currency=service.assignedMoneda || service.assigned_moneda || assigned.assignedMoneda || assigned.moneda || assigned.tariff?.moneda;
  const amount=service.assignedPrecioTotal ?? service.assigned_precio_total ?? assigned.assignedPrecioTotal ?? assigned.precioTotal;
  const rate=currency ? assignedPaymentExchangeRate(service) : null;
  return <div className="hotel-destination-record" data-quoted-room={hotelServiceId(service)} aria-label={`Habitación ${roomNumber}`}>
    <div className={`hotel-room-comparison ${hasReservationHotelAssignment(service) ? "" : "hotel-room-comparison--pending"}`}>
      <div className="hotel-room-fact quoted">
        <span className="hotel-room-label">Cotizado</span>
        <div className="hotel-room-heading"><strong>{quoted.room}</strong>
          <span className="hotel-category-badge" title="Categoría del hotel cotizado">{quotedHotelCategory(service)}</span></div>
        <span className="hotel-room-passengers">{quoted.passengers.map(id=>getPassengerLabel(id,peopleDetails)).join(", ") || "Beneficiarios sin registrar"}</span>
      </div>
      <div className={`hotel-room-fact assigned ${hasReservationHotelAssignment(service) ? "" : "empty"}`}>
        <span className="hotel-room-label">Asignado</span>
        {hasReservationHotelAssignment(service) ? <>
          <strong>{actual.hotel} · {actual.room}</strong>
          <span className="hotel-room-passengers">{actual.passengers.map(id=>getPassengerLabel(id,peopleDetails)).join(", ") || "Beneficiarios sin registrar"}</span>
          <div className="hotel-room-assignment-meta"><span title={actual.capacity == null ? "Capacidad histórica no registrada" : `Capacidad ${actual.capacity}`}>
            {amount != null && currency ? formatPaymentMoney(amount,currency) : "Costo pendiente"}
            {currency && storedPaymentCurrency(currency)==="soles" && <> · TC {rate ?? "pendiente"}</>}</span>
          {onRemove && (isHotelPaymentCommitted(service)
            ? <span className="hotel-room-lock" title="Con pago o solicitud comprometida"><FaLock aria-label="Asignación protegida" /></span>
            : <button type="button" className="hotel-room-remove" onClick={onRemove} title="Quitar asignación" aria-label="Quitar asignación"><FaTimes /></button>)}</div>
        </> : <strong>Por asignar</strong>}
      </div>
    </div>
  </div>;
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
  getSelectedRoomTotal,
}) => {
  const totalCapacity = selectedRooms.reduce(
    (sum, item) => sum + reservationRoomCapacity(item.room) * (item.quantity || 1),
    0,
  );
  const totalRooms = selectedRooms.reduce(
    (sum, item) => sum + (item.quantity || 1),
    0,
  );

  const totalPrice = formatPaymentTotals(sumPaymentCurrencies(selectedRooms.map(item => ({
    amount: getSelectedRoomTotal ? getSelectedRoomTotal(item) : getRoomUnitPrice(item) * (item.quantity || 1) * selectedDays.length,
    moneda: item.tariff?.moneda || item.room?.moneda || selectedHotel?.moneda || "dolares",
  }))));

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
              const cap = reservationRoomCapacity(item.room);
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
                    <span>{formatPaymentMoney(unit * qty, item.tariff?.moneda || item.room?.moneda || selectedHotel?.moneda || "dolares")}</span>
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
              {totalPrice}
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
  onRemoveAssigned,
  peopleDetails,
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

  const isFullyAssigned = Boolean(occupancy?.isFullyAccommodated);
  const canSelect = isDayAvailable || (hasAssignedHotels && !isFullyAssigned);
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

        <div className="day-badges">
          {occupancy.totalPassengers > 0 && <span className="day-occupancy-count">
            {occupancy.assignedCount}/{occupancy.totalPassengers} pax cotizados
          </span>}
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

      <div className="day-room-comparisons">
        {getAssignableHotelServices(day).map((service,index) => <HotelDestinationRecord
          key={hotelServiceId(service)} service={service} peopleDetails={peopleDetails} roomNumber={index+1}
          onRemove={()=>onRemoveAssigned(dayIndex,service.servicioId ?? service.id)} />)}
      </div>

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
  targetPassengerIds,
  quotedDestinations,
  compatibleDestinations,
  roomDestinations,
  onSelectDestination,
}) => {
  if (roomSlots.length === 0) return null;

  const assignedIds = new Set(
    Object.values(roomAssignments || {})
      .flat()
      .filter(Boolean),
  );
  const unassignedIds = targetPassengerIds.filter((id) => !assignedIds.has(id));
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
          Distribuir según cotización
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
                    {slot.item?.hotel?.nombre || "Hotel"} · {slot.capacity ? `${slot.capacity} pax máx.` : "Capacidad por confirmar"}
                  </span>
                </div>
                <span className="ham-room-count">
                  {passengerIds.length}/{slot.capacity}
                </span>
              </div>

              <label className="ham-room-destination">
                {slot.label} · destino cotizado
                <select value={roomDestinations[slot.id] || ""} onChange={event=>onSelectDestination(slot,event.target.value)}>
                  <option value="">Selecciona la habitación cotizada</option>
                  {quotedDestinations.map((service,index) => {
                    const quoted = hotelRoomSnapshot(service);
                    const unavailable = !compatibleDestinations.includes(service) || quoted.passengers.length > slot.capacity ||
                      Object.entries(roomDestinations).some(([key,value]) => key !== slot.id && value === hotelServiceId(service));
                    return <option key={hotelServiceId(service)} value={hotelServiceId(service)} disabled={unavailable}>
                      Hab. {index+1} · {quoted.room} · {quoted.hotel} · {quoted.passengers.length} pax · {quoted.passengers.map(id=>getPassengerLabel(id,peopleDetails)).join(", ")}
                    </option>;
                  })}
                </select>
              </label>

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
  days = EMPTY_DAYS,
  totalPassengers: propTotalPassengers,
  onAddHotelToDays,
  itinerary = {},
  removeHotelFromDay,
  packageType = "compartido",
  peopleDetails: propPeopleDetails = EMPTY_PEOPLE_DETAILS,
  voucherReservaId = null,
}) => {
  const tariffType = "interna";

  const [passengers, setPassengers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [selectedDays, setSelectedDays] = useState([]);
  const [step, setStep] = useState("days");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [selectedTariff, setSelectedTariff] = useState(null);
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [roomDistribution, setRoomDistribution] = useState(emptyHotelRoomDistribution);
  const {assignments: roomAssignments, destinations: roomDestinations} = roomDistribution;
  const [customPrice, setCustomPrice] = useState(null);
  const [filters, setFilters] = useState({
    search: "",
    categoria: "",
    ciudad: "",
  });
  const roomReadVersion = useRef(0);
  const hotelReadVersion = useRef(0);
  const categoryReadVersion = useRef(0);

  // Cargar pasajeros del voucher de reserva
  useEffect(() => {
    let active = true;
    setPassengers([]);
    const fetchPassengers = async () => {
      if (!voucherReservaId || !isOpen) return;
      try {
        const { passengers: fetchedPassengers } =
          await pasajeroService.getPassengersByVoucherReserva(voucherReservaId);
        if (active) setPassengers(fetchedPassengers || []);
      } catch (error) {
        if (active) setPassengers([]);
      }
    };
    fetchPassengers();
    return () => { active = false; };
  }, [voucherReservaId, isOpen]);

  const peopleDetails = useMemo(() => {
    const normalized = normalizeReservationPassengerRows(passengers);
    const fetched = [...normalized.adults, ...normalized.children, ...normalized.infants];
    if ((propPeopleDetails.adults?.length || 0) + (propPeopleDetails.children?.length || 0) > 0) {
      // Quotation order/row IDs define beneficiaries; fetching names cannot reorder them.
      const enrich = person => {
        const match = fetched.find(row =>
          (person.id != null && String(row.id) === String(person.id)) ||
          (person.passenger_key && row.passenger_key === person.passenger_key));
        return match ? {...person, nombre: match.nombre || match.nombres || person.nombre} : person;
      };
      return {...propPeopleDetails, adults:(propPeopleDetails.adults || []).map(enrich),
        children:(propPeopleDetails.children || []).map(enrich)};
    }
    return fetched.length ? {...normalized, children:[...normalized.children,...normalized.infants]} : propPeopleDetails;
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
        const occupancy = getDayHotelAssignmentProgress(day);
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
      setRoomDistribution(emptyHotelRoomDistribution());
      setCustomPrice(null);
      setFilters({ search: "", categoria: "", ciudad: "" });
      setCategories([]);
      setHotels([]);
      setRooms([]);
      setError(null);
    }
    return () => { hotelReadVersion.current += 1; };
  }, [isOpen]);

  // Cargar categorias al abrir
  useEffect(() => {
    if (isOpen) fetchHotelCategories();
    return () => { categoryReadVersion.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Cargar hoteles cuando cambia la categoria seleccionada
  useEffect(() => {
    if (isOpen && selectedCategory && categories.length > 0) {
      fetchHotelsByCategory(selectedCategory);
    } else {
      setHotels([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedCategory, categories]);

  // Cargar habitaciones cuando cambia el hotel seleccionado
  useEffect(() => {
    if (isOpen && selectedHotel) {
      fetchRooms(selectedHotel.id_hotel || selectedHotel.id);
    } else {
      setRooms([]);
    }
    return () => { roomReadVersion.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedHotel]);

  const fetchHotelCategories = async () => {
    const readVersion = ++categoryReadVersion.current;
    setLoading(true);
    setError(null);
    try {
      const response = await readWithRetry(()=>axiosInstance.get("/turismo/hoteles", {
        params: { activo: true },
      }));
      if (readVersion !== categoryReadVersion.current) return;
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
      if (readVersion === categoryReadVersion.current) {
        setError("Error al cargar categorias de hoteles");
        setCategories([]);
      }
    } finally {
      if (readVersion === categoryReadVersion.current) setLoading(false);
    }
  };

  const fetchHotelsByCategory = async (category) => {
    const readVersion = ++hotelReadVersion.current;
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
        if (readVersion === hotelReadVersion.current) setHotels(filtered);
      } else {
        if (readVersion === hotelReadVersion.current) setHotels([]);
      }
    } catch (err) {
      if (readVersion === hotelReadVersion.current) {
        setError("Error al cargar hoteles");
        setHotels([]);
      }
    } finally {
      if (readVersion === hotelReadVersion.current) setLoading(false);
    }
  };

  const fetchAllHotels = async () => {
    const readVersion = ++hotelReadVersion.current;
    setLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.get("/turismo/hoteles", {
        params: { activo: true },
      });
      if (readVersion !== hotelReadVersion.current) return;
      if (response.data?.success && Array.isArray(response.data.data))
        setHotels(response.data.data);
      else if (Array.isArray(response.data)) setHotels(response.data);
      else setHotels([]);
    } catch (err) {
      if (readVersion === hotelReadVersion.current) {
        setError("Error al cargar hoteles");
        setHotels([]);
      }
    } finally {
      if (readVersion === hotelReadVersion.current) setLoading(false);
    }
  };

  const fetchRooms = async (hotelId) => {
    const readVersion = ++roomReadVersion.current;
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

      const processedRooms = roomsWithMatchingTariffs.map(normalizeHotelRoomWithTariffs);
      if (readVersion === roomReadVersion.current) setRooms(processedRooms);
    } catch (err) {
      if (readVersion === roomReadVersion.current) {
        setError("Error al cargar habitaciones");
        setRooms([]);
      }
    } finally {
      if (readVersion === roomReadVersion.current) setLoading(false);
    }
  };

  const fetchRoomsForCategory = async (categoryHotels) => {
    const allRooms = [];
    const results = await Promise.allSettled(
      categoryHotels.map(async (hotel) => {
        const hotelId = hotel.id_hotel || hotel.id;
        const response = await readWithRetry(()=>axiosInstance.get(
          `/turismo/habitaciones/hotel/${hotelId}/con-tarifas`,
        ));
        return response.data?.data || response.data || [];
      }),
    );
    results.forEach((r) => {
      if (r.status === "fulfilled" && Array.isArray(r.value)) {
        allRooms.push(...r.value.map(normalizeHotelRoomWithTariffs));
      }
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
    setRoomDistribution(emptyHotelRoomDistribution());
    setCustomPrice(null);
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

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
  const quotedDestinations = useMemo(() => getUnassignedHotelServices(days[selectedDays[0]] || {}), [days, selectedDays]);
  const compatibleDestinations = useMemo(() => compatibleHotelDestinations(days,selectedDays), [days,selectedDays]);
  const runtimePassengerIds = useMemo(() => getPassengerIdsByType(peopleDetails).allPassengerIds, [peopleDetails]);
  const targetPassengerIds = useMemo(() => {
    const quoted = new Set(quotedDestinations.flatMap(quotedHotelPassengerIds));
    return runtimePassengerIds.filter(id => quoted.has(hotelOccupantId(id)));
  }, [quotedDestinations,runtimePassengerIds]);
  const assignmentTargetCount = targetPassengerIds.length;

  const selectQuotedDestination = (slot, destinationId) => {
    const destination = quotedDestinations.find(service => hotelServiceId(service) === destinationId);
    const ids = destination ? quotedHotelPassengerIds(destination) : [];
    if (ids.length > slot.capacity) {
      setError("Los pasajeros cotizados no caben en esta habitación. Elige otra habitación");
      return;
    }
    if (destination && Object.entries(roomDestinations).some(([key,value]) => key !== slot.id && value === destinationId)) {
      setError("Esta habitación cotizada ya está relacionada con otra habitación seleccionada");
      return;
    }
    setError(null);
    setRoomDistribution(previous => ({
      assignments:{...previous.assignments,[slot.id]:ids.map(id => runtimePassengerIds.find(current => hotelOccupantId(current) === id) || id)},
      destinations:{...previous.destinations,[slot.id]:destinationId},
      manualSlots:[...new Set([...previous.manualSlots,slot.id])],
    }));
  };

  useEffect(() => {
    if (!isOpen) return;
    setRoomDistribution(current => planHotelRoomDistribution({
      days, selectedDays, roomSlots, passengerIds:runtimePassengerIds, current,
    }));
  }, [isOpen, roomSlots, runtimePassengerIds, days, selectedDays]);

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
    const targetSlot = roomSlots.find(slot => slot.id === slotId);
    if (!targetSlot || !targetPassengerIds.includes(passengerId)) return;
    setRoomDistribution(current => {
      if ((current.assignments[slotId] || []).length >= targetSlot.capacity) return current;
      const assignments = {}, manualSlots = new Set([...current.manualSlots,slotId]);
      Object.entries(current.assignments).forEach(([key,ids]) => {
        assignments[key] = ids.filter(id => hotelOccupantId(id) !== hotelOccupantId(passengerId));
        if (assignments[key].length !== ids.length) manualSlots.add(key);
      });
      assignments[slotId] = [...(assignments[slotId] || []),passengerId];
      return {...current,assignments,manualSlots:[...manualSlots]};
    });
  };

  const handleRemovePassengerFromRoom = (passengerId, slotId) => {
    setRoomDistribution(current => ({...current,
      assignments:{...current.assignments,[slotId]:(current.assignments[slotId] || []).filter(id => id !== passengerId)},
      manualSlots:[...new Set([...current.manualSlots,slotId])],
    }));
  };

  const handleAutoDistributeRooms = () => {
    setRoomDistribution(planHotelRoomDistribution({days,selectedDays,roomSlots,passengerIds:runtimePassengerIds}));
  };

  const toggleRoomSelection = (room, hotel, tariff, priceType = null) => {
    if (!reservationRoomCapacity(room)) {
      setError("Confirma la capacidad de la habitación en el catálogo antes de asignar");
      return;
    }
    setError(null);
    const quantityDelta = typeof priceType === "number" ? priceType : null;
    const selectedType =
      typeof priceType === "string" ? priceType : tariff?.selectedType || tariff?.tipoPrecio || tariff?.tipo_precio || null;
    const hotelToUse = hotel || selectedHotel;
    const tariffWithType = {...tariff,selectedType,tipoPrecio:selectedType || packageType,precio:roomTariffPrice({...tariff,selectedType},packageType)};
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
    setRoomDistribution(emptyHotelRoomDistribution());
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

  const selectedRoomTotal = item => {
    const mode=item.tariff?.tipoPrecio || item.tariff?.selectedType || packageType;
    const multiplier=mode === "privado" ? roomSlots.filter(slot=>slot.item===item).reduce((sum,slot)=>sum+(roomAssignments[slot.id]?.length || 0),0) : (item.quantity || 1);
    return getRoomUnitPrice(item) * multiplier * selectedDays.length;
  };

  const buildServicesForSelectedDays = () => {
    if (selectedDays.length === 0 || selectedRooms.length === 0 || !selectedHotel)
      return [];

    return roomSlots.map((slot) => {
      const item = slot.item;
      const { hotel, room, tariff, customPrice } = item;
      const roomEntity = getHotelRoomEntity(room);
      const tariffToUse =
        customPrice !== null && customPrice !== undefined
          ? {
              ...tariff,
              precio_privado: Number(customPrice),
              precio_compartido: Number(customPrice),
              precio: Number(customPrice),
            }
          : {...tariff,precio:roomTariffPrice(tariff,packageType)};

      const roomWithHotel = {
        ...roomEntity,
        hotel_id: hotel?.id_hotel || hotel?.id,
        habitacion: roomEntity,
        tarifas: Array.isArray(room?.tarifas) ? room.tarifas : [],
      };

      const passengerIdsForRoom = roomAssignments?.[slot.id] || [];
      if (passengerIdsForRoom.length === 0) throw new Error("Hay una habitación seleccionada sin pasajeros. Relaciónala con lo cotizado o quítala de la selección");
      const passengerSelection = buildHotelPassengerSelectionForIds(
        peopleDetails,
        passengerIdsForRoom,
      );

      const hotelService = buildHotelAssignmentService(hotel,roomWithHotel,tariffToUse,peopleDetails,passengerSelection,packageType);
      const selectedDestination = roomDestinations[slot.id];
      if (!selectedDestination) throw new Error("Relaciona cada habitación con su habitación cotizada antes de guardar");
      if (!slot.capacity || passengerIdsForRoom.length > slot.capacity) throw new Error("Los pasajeros no caben en la habitación seleccionada. Confirma su capacidad");
      hotelService.quotedHotelServiceIds = hotelDestinationIds(days,selectedDays,selectedDestination);
      hotelService.habitacion_capacidad = slot.capacity;
      hotelService.hotel_nombre = hotel?.nombre;
      hotelService.hotel_categoria = hotel?.categoria;
      hotelService.hotel_ciudad = hotel?.ciudad;
      hotelService.habitacion_tipo = roomEntity?.tipo_habitacion;
      hotelService.assignedParentId = hotel?.id_hotel || hotel?.id || null;
      hotelService.assigned_parent_id = hotelService.assignedParentId;
      hotelService.assignedChildId =
        roomEntity?.id_habitacion || roomEntity?.id || null;
      hotelService.assigned_child_id = hotelService.assignedChildId;
      hotelService.tariffType = tariffType;
      hotelService.assignedPassengerIds = passengerIdsForRoom;
      hotelService.assignedPassengerCount = passengerIdsForRoom.length;

      return hotelService;
    }).filter(Boolean);
  };

  const handleAddToItinerary = async () => {
    if (saving) return;
    if (selectedDays.length === 0) {
      alert("Selecciona al menos un dia");
      return;
    }
    if (selectedRooms.length === 0) {
      alert("Selecciona al menos una habitacion");
      return;
    }
    if (previewAssignedPassengerCount < assignmentTargetCount) {
      if (
        !window.confirm(
          `Hay ${previewAssignedPassengerCount} de ${assignmentTargetCount} pasajeros asignados. ¿Deseas continuar de todos modos?`,
        )
      ) {
        return;
      }
    }

    try {
      setError(null);
      setSaving(true);
      const services = buildServicesForSelectedDays();
      if (!services.length) throw new Error("Asigna los pasajeros a sus habitaciones antes de guardar");
      const saved = await onAddHotelToDays(selectedDays, services);
      if (saved === false) throw new Error("No se guardaron las habitaciones. Reintenta sin perder la distribución.");
    } catch (assignmentError) {
      setError(assignmentError.message);
      return;
    } finally {
      setSaving(false);
    }

    setStep("days");
    setSelectedDays([]);
    setSelectedCategory(null);
    setSelectedHotel(null);
    setSelectedRoom(null);
    setSelectedTariff(null);
    setSelectedRooms([]);
    setRoomDistribution(emptyHotelRoomDistribution());
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
      getAssignedHotelServices(day).filter(service=>!isHotelPaymentCommitted(service)).forEach((service) => {
        const serviceId =
          service.id || service.serviceId || `hotel-${dayIndex}-${service.id}`;
        removeHotelFromDay(dayIndex, serviceId);
      });
    });
  };

  const navigateBack = () => {
    if (saving) return;
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
      <div className="hotel-itinerary-modal hotel-assignment-modal">
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
          <button className="close-button" disabled={saving} onClick={onClose} title="Cerrar">
            <FaTimes />
          </button>
        </div>

        <div className="modal-body" inert={saving ? "" : undefined} aria-busy={saving}>
          {error && <div role="alert" className="info-card warning">{error}</div>}
          {/* Progress Steps */}
          <div className="hotel-assignment-toolbar">
          <div className="progress-steps" aria-label="Pasos de asignación">
            {STEP_ORDER.map((s, idx) => {
              const label = stepLabels[s] || s;
              const isActive = currentStepIndex === idx;
              const isCompleted = currentStepIndex > idx;
              return (
                <div
                  key={s}
                  aria-current={isActive ? "step" : undefined}
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
            {unassignedPassengers > 0 && (
              <div className="info-card warning">
                <FaExclamationTriangle />
                <span>{unassignedPassengers} sin asignar</span>
              </div>
            )}
            {step !== "days" && (
              <div
                className={`info-card ${previewAssignedPassengerCount >= assignmentTargetCount ? "success" : "info"}`}
              >
                <FaBed />
                <span>
                  {totalSelectedRoomsCount} hab. · {previewAssignedPassengerCount}/
                  {assignmentTargetCount} pax asignados
                </span>
              </div>
            )}
          </div>
          </div>

          {step !== "days" && selectedDays.length > 0 && (
            <details className="selected-hotel-destinations">
              <summary>Cotizado y asignado · {selectedDays.length} días seleccionados</summary>
              {selectedDays.map(dayIndex => <div key={dayIndex}>
                <strong>Día {days[dayIndex]?.numero || dayIndex+1}</strong>
                {getAssignableHotelServices(days[dayIndex]).map((service,index) =>
                  <HotelDestinationRecord key={hotelServiceId(service)} service={service} peopleDetails={peopleDetails} roomNumber={index+1} />)}
              </div>)}
            </details>
          )}
          {step !== "days" && compatibleDestinations.length < quotedDestinations.length && (
            <div role="status" className="info-card warning">Hay habitaciones con distinta distribución o pasajeros ya asignados entre estos días. Revisa los días y asígnalos por separado.</div>
          )}

          <div className={`modal-workspace ${step === "days" ? "modal-workspace--days" : ""}`}>
            {/* Contenido principal */}
            <div className="workspace-main">
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
                          peopleDetails={peopleDetails}
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
                    setRoomDistribution(emptyHotelRoomDistribution());
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
                    setRoomDistribution(emptyHotelRoomDistribution());
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
                  capacityForRoom={reservationRoomCapacity}
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

              {(step === "room" || step === "review") && selectedHotel && selectedRooms.length > 0 && (
                <RoomAssignmentBoard
                  roomSlots={roomSlots}
                  roomAssignments={roomAssignments}
                  peopleDetails={peopleDetails}
                  totalPassengers={assignmentTargetCount}
                  targetPassengerIds={targetPassengerIds}
                  quotedDestinations={quotedDestinations}
                  compatibleDestinations={compatibleDestinations}
                  roomDestinations={roomDestinations}
                  onSelectDestination={selectQuotedDestination}
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
                    getSelectedRoomTotal={selectedRoomTotal}
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
              totalPassengers={assignmentTargetCount}
              step={step}
              assignedPassengerCount={previewAssignedPassengerCount}
              getSelectedRoomTotal={selectedRoomTotal}
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
                      setRoomDistribution(emptyHotelRoomDistribution());
                      setRooms([]);
                      setStep("hotel");
                    }}
                  >
                    <FaHotel /> Elegir otro hotel
                  </button>
                  <button className="confirm-btn" disabled={saving} aria-busy={saving} onClick={handleAddToItinerary}>
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
