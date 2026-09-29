const normalizeNationalityText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const isPeruvianPassenger = (passenger = {}) => {
  if (!passenger) return false;

  const nationality = normalizeNationalityText(
    passenger.nacionalidad ||
      passenger.nationality ||
      passenger.pais ||
      passenger.country ||
      passenger.pais_origen ||
      passenger.countryCode ||
      "",
  );

  return (
    nationality === "pe" ||
    nationality === "per" ||
    nationality.includes("peru") ||
    nationality.includes("peruano") ||
    nationality.includes("peruana")
  );
};

export const hasPeruvianPassengers = (passengers = []) => {
  if (!Array.isArray(passengers) || passengers.length === 0) return false;

  return passengers.some(isPeruvianPassenger);
};

export const hasPeruvianPassengersFromDetails = (peopleDetails = {}) => {
  const adults = peopleDetails.adults || [];
  const children = peopleDetails.children || [];

  const allPassengers = [...adults, ...children];
  return hasPeruvianPassengers(allPassengers);
};

const normalizePassengerId = (value) => String(value ?? "").trim();

const addPassengerIdentityAliases = (target, passenger, prefix, index) => {
  if (!target || !passenger) return;

  const oneBasedId = `${prefix}:${index + 1}`;
  target.add(oneBasedId);

  const explicitIds = [
    passenger?.id,
    passenger?.id_pasajero,
    passenger?.idPasajero,
    passenger?.passengerId,
    passenger?.passenger_id,
    passenger?.pasajeroId,
    passenger?.uid,
    passenger?.passenger_key,
    passenger?.passengerKey,
  ]
    .map(normalizePassengerId)
    .filter(Boolean);

  explicitIds.forEach((id) => target.add(id));

  const numericId = normalizePassengerId(
    passenger?.id_pasajero || passenger?.idPasajero || passenger?.id,
  );
  if (numericId) {
    // Legacy itinerary beneficiaries can be persisted as adult:0:593 while
    // HotelPricingModal uses adult:1. Keep both aliases for the same person.
    target.add(`${prefix}:${index}:${numericId}`);
    target.add(`${prefix}:${index + 1}:${numericId}`);
  }
};

export const getPassengerIdAliases = (value) => {
  const raw = normalizePassengerId(value);
  const aliases = new Set(raw ? [raw] : []);
  if (!raw) return aliases;

  const colonMatch = raw.match(/^(adult|child):(\d+)(?::.*)?$/i);
  if (colonMatch) {
    const prefix = colonMatch[1].toLowerCase();
    const rawIndex = Number.parseInt(colonMatch[2], 10);
    const isLegacyZeroBasedId = raw.split(":").length > 2;
    if (isLegacyZeroBasedId) {
      // Los IDs largos usan un índice base cero. Se traducen únicamente al
      // slot canónico base uno; añadir también `adult-1`/`child-1` resulta
      // ambiguo porque passenger_key puede ser base cero o base uno.
      aliases.add(`${prefix}:${rawIndex + 1}`);
    } else {
      aliases.add(`${prefix}:${rawIndex}`);
    }
  }

  // Las claves con guion se comparan de forma exacta. Históricamente existen
  // tanto adult-0/child-0 como adult-1/child-1; inferir aquí una convención
  // puede fusionar dos pasajeros distintos en un mismo beneficiario.

  return aliases;
};

export const passengerIdMatchesSet = (value, identitySet) => {
  if (!(identitySet instanceof Set) || identitySet.size === 0) return false;
  return [...getPassengerIdAliases(value)].some((alias) =>
    identitySet.has(alias),
  );
};

export const getServiceBeneficiaryIds = (service = {}, selection = null) => {
  const selectionSource =
    selection?.passengerSelection || selection?.selection || selection || {};
  const values = [
    selectionSource?.selectedIds,
    selectionSource?.ids,
    selectionSource?.selectedPassengers,
    service?.assignedPassengerIds,
    service?.roomPassengerIds,
    service?.passengerIds,
    service?.passengerSelection?.selectedIds,
    service?.beneficiariosAdultos,
    service?.beneficiarios_adultos,
    service?.beneficiariosNinos,
    service?.beneficiarios_ninos,
  ];

  const ids = values.flatMap((entries) => {
    if (!Array.isArray(entries)) return [];
    return entries
      .map((entry) =>
        normalizePassengerId(
          typeof entry === "object" && entry !== null ? entry.id : entry,
        ),
      )
      .filter(Boolean);
  });

  return [...new Set(ids)];
};

export const buildPeruvianPassengerIdSet = (
  peopleDetails = {},
  { includeChildren = false } = {},
) => {
  const ids = new Set();
  const addPassengerIds = (passengers = [], prefix) => {
    if (!Array.isArray(passengers)) return;
    passengers.forEach((passenger, index) => {
      if (!isPeruvianPassenger(passenger)) return;
      addPassengerIdentityAliases(ids, passenger, prefix, index);
    });
  };

  addPassengerIds(peopleDetails.adults || [], "adult");
  if (includeChildren) {
    addPassengerIds(peopleDetails.children || [], "child");
  }

  return ids;
};

export const serviceHasPeruvianBeneficiary = (
  service = {},
  peopleDetails = {},
  selection = null,
) => {
  const peruvianIds = buildPeruvianPassengerIdSet(peopleDetails, {
    includeChildren: true,
  });
  if (peruvianIds.size === 0) return false;

  return getServiceBeneficiaryIds(service, selection).some((id) =>
    passengerIdMatchesSet(id, peruvianIds),
  );
};

export const calculateIGVForService = (
  service,
  passengers = [],
  basePrice = 0,
) => {
  const hasPeruvians = hasPeruvianPassengers(passengers);
  const isHotelService = isServiceHotel(service);

  const shouldApplyIGV = hasPeruvians && isHotelService;
  const igvRate = 0.18; // 18%
  const igvAmount = shouldApplyIGV ? basePrice * igvRate : 0;
  const totalWithIGV = basePrice + igvAmount;

  return {
    hasIGV: shouldApplyIGV,
    igvRate: shouldApplyIGV ? igvRate : 0,
    igvAmount,
    basePrice,
    totalWithIGV,
    hasPeruvians,
    isHotelService,
  };
};

const isServiceHotel = (service) => {
  if (!service) return false;

  // Check new structure
  if (
    service.parentService?.categoria === "hoteles" ||
    service.parentService?.id_hotel ||
    service.parentService?.nombre_hotel
  ) {
    return true;
  }

  if (
    service.childService?.typeService === "hoteles" &&
    !service.parentService
  ) {
    return true;
  }

  // Check legacy structure
  if (
    service.typeService?.toLowerCase() === "hoteles" ||
    service.typeService?.toLowerCase() === "hotel" ||
    service.type?.toLowerCase() === "hotel" ||
    service.id_hotel ||
    service.nombre_hotel
  ) {
    return true;
  }

  return false;
};

export const calculateDayIGV = (services = [], passengers = []) => {
  let totalIGV = 0;
  let totalBase = 0;
  let hasAnyIGV = false;

  services.forEach((service) => {
    const basePrice = parseFloat(service.precio) || 0;
    const igvCalc = calculateIGVForService(service, passengers, basePrice);

    totalIGV += igvCalc.igvAmount;
    totalBase += igvCalc.basePrice;

    if (igvCalc.hasIGV) {
      hasAnyIGV = true;
    }
  });

  return {
    totalIGV,
    totalBase,
    totalWithIGV: totalBase + totalIGV,
    hasAnyIGV,
    igvRate: hasAnyIGV ? 0.18 : 0,
  };
};

export default {
  isPeruvianPassenger,
  hasPeruvianPassengers,
  hasPeruvianPassengersFromDetails,
  buildPeruvianPassengerIdSet,
  getPassengerIdAliases,
  passengerIdMatchesSet,
  getServiceBeneficiaryIds,
  serviceHasPeruvianBeneficiary,
  calculateIGVForService,
  calculateDayIGV,
};
