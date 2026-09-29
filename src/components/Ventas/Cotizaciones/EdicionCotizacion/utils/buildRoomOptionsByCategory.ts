import { getHotelRoomCapacity, isExtraBedRoomType } from "../../../../../utils/hotelRoomTypes";

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const prettyRoomType = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return "Habitación";
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const capacityFromRoom = (room) => getHotelRoomCapacity(room, 2);

const buildRoomOptions = ({
  rooms = [],
  tariffType,
  packageType,
  hotelId,
  hotelName,
}) =>
  (Array.isArray(rooms) ? rooms : [])
    .flatMap((room) => {
      const tariffs = (Array.isArray(room?.tarifas) ? room.tarifas : []).filter(
        (tariff) =>
          String(tariff?.tipo_tarifa || "").toLowerCase() === tariffType,
      );
      if (tariffs.length === 0) return [];

      const rawLabel =
        room?.tipo_habitacion ||
        room?.habitacion?.tipo_habitacion ||
        "Habitación";
      const baseKey = normalizeText(rawLabel) || "habitacion";
      const baseLabel = prettyRoomType(rawLabel);
      const capacity = capacityFromRoom(room);

      return tariffs.map((tariff, tariffIndex) => {
        const preferredPrice =
          packageType === "privado"
            ? tariff?.precio_privado ?? tariff?.precio
            : tariff?.precio_compartido ?? tariff?.precio;
        const price = Number.parseFloat(preferredPrice) || 0;
        const agencyIds = Array.isArray(tariff?.agency_ids)
          ? tariff.agency_ids.map(Number).filter(Boolean)
          : [];
        const roomId =
          room?.id_habitacion || room?.habitacion?.id_habitacion || null;
        const tariffId = tariff?.id_tarifa || null;

        return {
          key: `${hotelId || "hotel"}:${roomId || baseKey}:tarifa:${tariffId || tariffIndex}`,
          baseKey,
          sourceRoomKey: baseKey,
          label: baseLabel,
          baseLabel,
          capacity,
          isExtraBed: isExtraBedRoomType(room),
          roomType: String(rawLabel).trim(),
          tipo_habitacion: String(rawLabel).trim(),
          pricePerRoomNight: price,
          id_hotel: hotelId || null,
          hotelName: hotelName || "Hotel",
          hotelCategory: room?.hotel?.categoria || null,
          id_habitacion: roomId,
          id_tarifa: tariffId,
          tariff,
          agency_ids: agencyIds,
          manualPricing:
            room?.manualPricing === true || tariff?.manual === true || !tariffId,
          luxuryManual: room?.luxuryManual === true || tariff?.manual === true,
        };
      });
    })
    .filter(Boolean);

/**
 * Transforma el catálogo universal de hoteles en las opciones consumidas por
 * HotelPricingModal. Cada categoría puede contener varios hoteles y cada hotel
 * conserva todas sus habitaciones, incluso si el precio debe ingresarse manualmente.
 */
export default function buildRoomOptionsByCategory(
  hotelDict,
  tariffType = "externa",
  packageType = "compartido",
) {
  const output = {};

  Object.entries(hotelDict || {}).forEach(([category, pack]) => {
    const hotelPacks = Array.isArray(pack?.hotels)
      ? pack.hotels
      : pack?.hotel
        ? [{ hotel: pack.hotel, rooms: pack.rooms || [] }]
        : [];

    const hotelOptions = hotelPacks
      .map(({ hotel, rooms }) => {
        const hotelId = hotel?.id_hotel || hotel?.id || null;
        const hotelName = hotel?.nombre || hotel?.name || "Hotel";
        const roomOptions = buildRoomOptions({
          rooms,
          tariffType,
          packageType,
          hotelId,
          hotelName,
        });
        if (!hotelId || roomOptions.length === 0) return null;

        return {
          key: String(hotelId),
          hotelName,
          id_hotel: hotelId,
          ciudad: hotel?.ciudad || hotel?.city || hotel?.ubicacion || null,
          categoria: hotel?.categoria || pack?.categoryLabel || category,
          roomOptions,
          hasManualPrices: roomOptions.some((option) => option.manualPricing),
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.hotelName.localeCompare(right.hotelName));

    if (hotelOptions.length === 0) return;
    const first = hotelOptions[0];
    output[category] = {
      category,
      categoryLabel: pack?.categoryLabel || first.categoria || category,
      hotelName: first.hotelName,
      id_hotel: first.id_hotel,
      ciudad: first.ciudad,
      roomOptions: first.roomOptions,
      hotelOptions,
      luxuryManual: false,
    };
  });

  return output;
}
