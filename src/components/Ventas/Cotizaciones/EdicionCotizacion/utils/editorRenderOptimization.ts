export interface HotelDictionaryLoadingState {
  currentStep: string;
  passengerStep: string;
  showHotelModal?: boolean;
  hasExistingHotel?: boolean;
}

/**
 * El catálogo hotelero es pesado porque puede derivar en una consulta de
 * habitaciones por hotel. No debe hidratarse mientras el usuario solo trabaja
 * pasajeros en una cotización nueva sin hotel.
 */
export const shouldEnableHotelDictionary = ({
  currentStep,
  passengerStep,
  showHotelModal = false,
  hasExistingHotel = false,
}: HotelDictionaryLoadingState) =>
  Boolean(showHotelModal || hasExistingHotel || currentStep !== passengerStep);

/**
 * Las habitaciones son universales. La agencia y el tipo de tarifa filtran
 * `room.tarifas` en memoria y no cambian el payload del endpoint, por lo que
 * ambos contextos deben compartir la misma entrada de caché.
 */
export const hotelRoomCacheIdentity = (hotelId: string | number) =>
  `hotel-room-catalog:${String(hotelId)}`;
