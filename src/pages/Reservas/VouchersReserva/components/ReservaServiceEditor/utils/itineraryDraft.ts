/** Cada edición reemplaza día, lista y fila; no muta el snapshot cotizado. */
export function cloneReservationItinerary(itinerary: any[]) {
  return (itinerary || []).map(day => ({
    ...day,
    servicios: (day.servicios || []).map((service: any) => ({ ...service })),
  }));
}
