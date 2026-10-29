import { hotelOccupantId, hotelPassengerIds, roomCapacity } from "../../../../utils/roomCapacity";

export const hotelServiceId = service => String(service?.servicioId ?? service?.itinerario_servicio_id ?? service?.id ?? "");
export const quotedHotelPassengerIds = service => hotelPassengerIds({
  beneficiariosAdultos: service?.beneficiariosAdultos ?? service?.beneficiarios_adultos,
  beneficiariosNinos: service?.beneficiariosNinos ?? service?.beneficiarios_ninos,
});
export const hotelPassengerKey = ids => [...new Set(ids.map(hotelOccupantId).filter(Boolean))].sort().join("|");
export const hasHotelAssignment = service => Boolean(service?.isAssigned || service?.is_assigned ||
  (service?.assignedService && Object.keys(service.assignedService).length));
export const isHotelPaymentCommitted = service => {
  const request = service?.paymentRequest || service?.payment_request;
  return ["pending", "paid", "completed", "requested", "partially_paid"].includes(service?.paymentStatus || request?.status) ||
    Boolean(request?.movimiento_id) || Number(request?.settled_amount || request?.allocated_amount || 0) > 0;
};
export const hotelDayServices = day => (day?.servicios || []).filter(service => /hotel/i.test(
  service?.typeService || service?.parentService?.typeService || service?.cotizacionServiceRef?.typeService || "",
));
export const pendingHotelServices = day => hotelDayServices(day).filter(service => !hasHotelAssignment(service));

export const formatHotelCategory = value => {
  const raw = String(value || "").trim();
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const symbols = (raw.match(/[⭐★]/g) || []).length;
  const numeric = normalized.match(/(?:^|\bhotel\s+)([1-5])\s*(?:estrellas?|stars?|s(?:up(?:erior)?)?\.?|\*)?(?:\s|$)/);
  const stars = symbols || (numeric ? Number(numeric[1]) : 0);
  if (stars < 1 || stars > 5) return raw || "Sin categoría";
  const superior = /sup|superior/.test(normalized) ||
    (stars === 3 && (/\*\s*$/.test(raw) || /^\s*3s\s*$/i.test(raw)));
  return `${stars}★${superior ? " Sup." : ""}`;
};

export const quotedHotelCategory = service => {
  const parent = service?.parentService || {};
  const category = parent.categoria || service?.cotizacionServiceRef?.parentService?.categoria ||
    (!hasHotelAssignment(service) && service?.hotel_categoria);
  if (category) return formatHotelCategory(category);
  const label = parent.nombre || parent.name || "";
  // Old generic hotel records sometimes carry their stars in the name only.
  return /[⭐★]|\b[1-5]\s*(?:estrellas?|stars?)\b/i.test(label)
    ? formatHotelCategory(label) : "Sin categoría";
};

export const hotelRoomSnapshot = (service, assigned = false) => {
  const source = assigned ? service?.assignedService || {} : service || {};
  const child = assigned
    ? service?.assignedChildService || service?.assigned_child_service || source.childService || source.assignedChildService || {}
    : service?.childService || {};
  const parent = assigned
    ? service?.assignedParentService || service?.assigned_parent_service || source.parentService || source.assignedParentService || {}
    : service?.parentService || {};
  const field = assigned ? "assigned_capacidad_ocupacion" : "capacidad_ocupacion";
  const camel = assigned ? "assignedCapacidadOcupacion" : "capacidadOcupacion";
  // A null historical snapshot must never be replaced by today's catalog default.
  const snapshotOwner = [service, source].find(value => value &&
    (Object.hasOwn(value, field) || Object.hasOwn(value, camel)));
  const capacity = roomCapacity(snapshotOwner
    ? { ...child, capacidad_ocupacion: Object.hasOwn(snapshotOwner,field) ? snapshotOwner[field] : snapshotOwner[camel] }
    : child, { allowLegacy: false });
  return {
    hotel: parent.nombre || parent.name || parent.hotel?.nombre || (!assigned && service?.hotel_nombre) || "Hotel pendiente",
    room: child.tipo_habitacion || child.habitacion?.tipo_habitacion ||
      (!assigned && !hasHotelAssignment(service) && service?.habitacion_tipo) || "Habitación pendiente",
    capacity,
    passengers: assigned ? hotelPassengerIds(service) : quotedHotelPassengerIds(service),
  };
};

const occupiedIds = day => new Set(hotelDayServices(day).filter(hasHotelAssignment).flatMap(hotelPassengerIds));

// Match physical quotation rooms by their occupants, never by list position.
export const hotelDestinationIds = (days, selectedDays, destinationId) => {
  const first = pendingHotelServices(days[selectedDays[0]]).find(service => hotelServiceId(service) === String(destinationId));
  if (!first) throw new Error("La habitación cotizada ya no está disponible. Revisa los días seleccionados");
  const key = hotelPassengerKey(quotedHotelPassengerIds(first));
  if (!key) throw new Error("La habitación cotizada no tiene beneficiarios. Revisa su cotización");
  return Object.fromEntries(selectedDays.map(dayIndex => {
    const matches = pendingHotelServices(days[dayIndex]).filter(service =>
      hotelPassengerKey(quotedHotelPassengerIds(service)) === key);
    if (matches.length !== 1) throw new Error("La distribución cotizada cambia o es ambigua entre los días seleccionados. Asigna esos días por separado");
    return [dayIndex, hotelServiceId(matches[0])];
  }));
};

export const compatibleHotelDestinations = (days, selectedDays) => pendingHotelServices(days[selectedDays[0]])
  .filter(service => {
    try {
      const ids = quotedHotelPassengerIds(service);
      const destinations = hotelDestinationIds(days, selectedDays, hotelServiceId(service));
      return selectedDays.every(index => ids.every(id => !occupiedIds(days[index]).has(id)) &&
        !isHotelPaymentCommitted(pendingHotelServices(days[index]).find(row => hotelServiceId(row) === destinations[index])));
    } catch {
      return false;
    }
  });

const roomLabel = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export const emptyHotelRoomDistribution = () => ({ assignments: {}, destinations: {}, manualSlots: [] });

export const planHotelRoomDistribution = ({ days, selectedDays, roomSlots, passengerIds, current = emptyHotelRoomDistribution() }) => {
  const next = emptyHotelRoomDistribution();
  const runtimeIds = new Map(passengerIds.map(id => [hotelOccupantId(id), id]));
  const candidates = compatibleHotelDestinations(days, selectedDays);
  const reservedDestinations = new Set();
  const used = new Set();
  // User edits (including deliberately empty rooms) survive quantity/price reads.
  roomSlots.filter(slot => current.manualSlots.includes(slot.id)).forEach(slot => {
    next.manualSlots.push(slot.id);
    next.assignments[slot.id] = (current.assignments[slot.id] || []).map(id => runtimeIds.get(hotelOccupantId(id)) || id);
    next.destinations[slot.id] = current.destinations[slot.id] || "";
    reservedDestinations.add(next.destinations[slot.id]);
    next.assignments[slot.id].forEach(id => used.add(hotelOccupantId(id)));
  });
  // Small rooms first prevents a large room taking the only suitable small group.
  [...roomSlots].filter(slot => !next.manualSlots.includes(slot.id))
    .sort((a, b) => a.capacity - b.capacity).forEach(slot => {
      const options = candidates.filter(service => {
        const ids = quotedHotelPassengerIds(service);
        return slot.capacity > 0 && ids.length <= slot.capacity && !reservedDestinations.has(hotelServiceId(service)) &&
          ids.every(id => runtimeIds.has(id) && !used.has(id));
      }).sort((a, b) => {
        const aRoom = hotelRoomSnapshot(a), bRoom = hotelRoomSnapshot(b);
        const typeScore = room => roomLabel(room.room) === roomLabel(slot.item?.room?.tipo_habitacion) ? 0 : 1;
        return bRoom.passengers.length - aRoom.passengers.length || typeScore(aRoom) - typeScore(bRoom);
      });
      const destination = options[0];
      next.assignments[slot.id] = destination ? quotedHotelPassengerIds(destination).map(id => runtimeIds.get(id)) : [];
      next.destinations[slot.id] = destination ? hotelServiceId(destination) : "";
      if (destination) {
        reservedDestinations.add(hotelServiceId(destination));
        quotedHotelPassengerIds(destination).forEach(id => used.add(id));
      }
    });
  return next;
};
