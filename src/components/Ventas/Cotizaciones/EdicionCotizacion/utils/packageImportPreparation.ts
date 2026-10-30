import { hydrateItinerarioFromDB } from "./itinerarioCleanupUtils";
import { isHotelService } from "./hotelServiceHelpers";

/** Shared by the package import UI and its persisted-contract fixtures.
 * Room selection stays in the hotel editor. Passenger membership belongs to
 * the destination quotation, so the repricer reassigns it after preparation.
 */
export const prepareImportedPackageItinerary = (itinerary: any[]) =>
  hydrateItinerarioFromDB(itinerary).map(day => ({
    ...day,
    servicios: (day.servicios || []).filter(service => !isHotelService(service)).map(service => ({
      ...service,
      assignedPassengerIds: [],
      assignedPassengerCount: 0,
      beneficiariosAdultos: undefined,
      beneficiariosNinos: undefined,
      passengerSelection: {
        ...(service.passengerSelection || {}),
        selectedIds: [],
        assignedPassengerCount: 0,
      },
      tariff: { ...(service.tariff || {}) },
    })),
  }));
