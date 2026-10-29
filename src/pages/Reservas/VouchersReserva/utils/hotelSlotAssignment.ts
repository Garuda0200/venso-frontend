import { hotelPassengerIds, roomCapacity } from "../../../../utils/roomCapacity";

const isHotel = service => /hotel/i.test(service?.typeService || service?.parentService?.typeService || service?.cotizacionServiceRef?.typeService || "");
const id = service => String(service?.servicioId ?? service?.itinerario_servicio_id ?? service?.id ?? "");
const quotedIds = service => hotelPassengerIds({beneficiariosAdultos:service?.beneficiariosAdultos ?? service?.beneficiarios_adultos,
  beneficiariosNinos:service?.beneficiariosNinos ?? service?.beneficiarios_ninos});
const sorted = values => [...values].sort().join("|");

// Plan all replacements before changing any day. Never clear other assigned rooms.
export const assignHotelSlots = (itinerary, selectedDays, rooms, hydrate) => {
  if (!selectedDays.length || !rooms.length) throw new Error("Selecciona días y habitaciones");
  if (selectedDays.some(index=>!Number.isInteger(index) || index<0 || index>=itinerary.length)) throw new Error("El día seleccionado ya no existe");
  return itinerary.map((day, dayIndex) => {
    if (!selectedDays.includes(dayIndex)) return day;
    const services = [...(day.servicios || [])];
    const used = new Set();
    const occupied = new Set(services.filter(service=>isHotel(service) && (service.isAssigned || service.is_assigned)).flatMap(hotelPassengerIds));
    const allowed = new Set(services.filter(isHotel).flatMap(quotedIds));
    for (const room of rooms) {
      const passengers = hotelPassengerIds(room);
      const capacity = roomCapacity(room.childService || {}, {allowLegacy:false});
      if (!capacity) throw new Error("Confirma la capacidad de la habitación en el catálogo antes de asignar");
      if (!passengers.length || passengers.length > capacity) throw new Error("Los pasajeros no caben en la habitación seleccionada");
      if (passengers.some(id=>!allowed.has(id))) throw new Error("El pasajero no pertenece al alojamiento cotizado del día");
      if (passengers.some(id=>occupied.has(id))) throw new Error("El pasajero ya ocupa otra habitación de este día");
      const destination = room.quotedHotelServiceIds?.[dayIndex] ?? room.quotedHotelServiceId;
      let candidates = services.map((service,index)=>({service,index})).filter(({service,index})=>
        isHotel(service) && !used.has(index) && !service.isAssigned && !service.is_assigned);
      if (destination != null) candidates = candidates.filter(({service})=>id(service)===String(destination));
      else {
        // Beneficiaries identify a quoted physical room even when labels/order changed.
        candidates = candidates.filter(({service})=>sorted(quotedIds(service))===sorted(passengers));
      }
      if (candidates.length !== 1) throw new Error("No hay un destino único para esta habitación y sus pasajeros. Revisa Habitaciones elegidas");
      const {service,index} = candidates[0];
      const request=service.paymentRequest || service.payment_request;
      if (["pending","paid","completed","requested","partially_paid"].includes(service.paymentStatus || request?.status)
          || request?.movimiento_id || Number(request?.settled_amount || request?.allocated_amount || 0)>0) {
        throw new Error("La habitación tiene un pago comprometido; usa el flujo de ajuste");
      }
      used.add(index);
      passengers.forEach(id=>occupied.add(id));
      services[index] = hydrate(service, {...room,quotedHotelServiceId:id(service)});
    }
    return {...day,servicios:services};
  });
};
