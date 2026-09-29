import {
  getHotelRoomCapacity,
  getHotelRoomKind,
  isExtraBedRoomType,
} from "../../../../../utils/hotelRoomTypes";

const n = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getRoomKind = (room) => getHotelRoomKind(room);

const getPreferredRank = (room) => {
  const kind = getRoomKind(room);
  if (kind === "extra-bed") return 99;
  const capacity = getHotelRoomCapacity(room, 1);
  // Prefer higher-capacity physical rooms first. This supports current Venso
  // quintuple/sextuple catalog entries without special cases in the modal.
  return 10 - Math.min(9, capacity);
};

const getPreferredRoomOptions = (roomOptions) => {
  const byKind = new Map();

  (roomOptions || []).forEach((option) => {
    if (!option?.key || isExtraBedRoomType(option)) return;
    const kind = getRoomKind(option);
    const current = byKind.get(kind);
    if (
      !current ||
      n(option.pricePerRoomNight) < n(current.pricePerRoomNight)
    ) {
      byKind.set(kind, option);
    }
  });

  return Array.from(byKind.values()).sort((a, b) => {
    const rankDiff = getPreferredRank(a) - getPreferredRank(b);
    if (rankDiff !== 0) return rankDiff;
    const capacityDiff =
      getHotelRoomCapacity(b, 1) - getHotelRoomCapacity(a, 1);
    if (capacityDiff !== 0) return capacityDiff;
    return n(a.pricePerRoomNight) - n(b.pricePerRoomNight);
  });
};

export const autoMixForPax = (roomOptions, passengers) => {
  if (!Array.isArray(roomOptions) || roomOptions.length === 0) return {};

  const sorted = getPreferredRoomOptions(roomOptions);
  if (sorted.length === 0) return {};

  const out = {};
  let remaining = Math.max(1, passengers || 1);

  for (let idx = 0; idx < sorted.length; idx += 1) {
    const option = sorted[idx];
    const capacity = getHotelRoomCapacity(option, 1);
    if (remaining <= 0) break;

    if (idx === sorted.length - 1) {
      const count = Math.ceil(remaining / capacity);
      out[option.key] = (out[option.key] || 0) + count;
      remaining -= count * capacity;
    } else {
      const count = Math.floor(remaining / capacity);
      if (count > 0) {
        out[option.key] = (out[option.key] || 0) + count;
        remaining -= count * capacity;
      }
    }
  }

  if (remaining > 0) {
    const best = sorted[0];
    out[best.key] = (out[best.key] || 0) + 1;
  }

  return out;
};

export const autoMixWithConvertedChildren = (
  roomOptions,
  originalAdults,
  convertedCount,
) => {
  if (!Array.isArray(roomOptions) || roomOptions.length === 0) return {};
  return autoMixForPax(
    roomOptions,
    Math.max(1, n(originalAdults) + Math.max(0, n(convertedCount))),
  );
};

export const transferRoomMixToOptions = (
  sourceMix,
  sourceRoomOptions,
  targetRoomOptions,
) => {
  if (!sourceMix || typeof sourceMix !== "object") return {};
  if (!Array.isArray(targetRoomOptions) || targetRoomOptions.length === 0) {
    return {};
  }

  const targetByKey = new Map(
    targetRoomOptions.map((room) => [room.key, room]),
  );
  const targetByKind = new Map();
  targetRoomOptions.forEach((room) => {
    const kind = getRoomKind(room);
    const current = targetByKind.get(kind);
    if (!current || n(room.pricePerRoomNight) < n(current.pricePerRoomNight)) {
      targetByKind.set(kind, room);
    }
  });

  const sourceByKey = new Map(
    (sourceRoomOptions || []).map((room) => [room.key, room]),
  );
  const nextMix = {};

  Object.entries(sourceMix).forEach(([sourceKey, rawCount]) => {
    const count = Math.max(0, parseInt(rawCount, 10) || 0);
    if (count <= 0) return;

    const directTarget = targetByKey.get(sourceKey);
    if (directTarget) {
      nextMix[directTarget.key] = (nextMix[directTarget.key] || 0) + count;
      return;
    }

    const sourceRoom = sourceByKey.get(sourceKey) || {
      key: sourceKey,
      label: sourceKey,
    };
    const kindTarget = targetByKind.get(getRoomKind(sourceRoom));
    if (kindTarget) {
      nextMix[kindTarget.key] = (nextMix[kindTarget.key] || 0) + count;
    }
  });

  return nextMix;
};
