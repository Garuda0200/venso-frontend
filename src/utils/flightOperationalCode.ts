export const FLIGHT_METADATA_EVENT="reservationServiceMetadataUpdated";
export function flightServiceId(service={}) {
 const value=service.itinerario_servicio_id ?? service.servicioId ?? service.assignedService?.servicioId ?? service.id;
 return /^\d+$/.test(String(value ?? "")) && Number(value)>0 ? Number(value) : null;
}
export function flightCode(service={}) {
 const value=Object.hasOwn(service,"codigo") ? service.codigo : service.assignedService?.codigo;
 return String(value ?? "").trim();
}
export function sameFlight(service,detail={}) {return flightServiceId(service)!==null && flightServiceId(service)===Number(detail?.id);}
export function announceFlightMetadata(data) {window.dispatchEvent(new CustomEvent(FLIGHT_METADATA_EVENT,{detail:data}));}
