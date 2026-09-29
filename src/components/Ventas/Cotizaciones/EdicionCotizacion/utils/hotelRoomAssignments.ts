const normalizeAliasText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const parseTrailingIndex = (value) => {
  const match = String(value ?? "").trim().match(/:(\d+)$/);
  const index = Number.parseInt(match?.[1] || "", 10);
  return Number.isInteger(index) && index > 0 ? index : null;
};

const buildSlotOccurrenceMeta = (roomSlots = []) => {
  const counts = new Map();

  return roomSlots.map((slot) => {
    const textAliases = [
      slot?.baseLabel,
      slot?.label,
      slot?.key,
      slot?.roomKey,
      slot?.sourceRoomKey,
    ]
      .map(normalizeAliasText)
      .filter(Boolean);

    const canonicalText = textAliases[0] || normalizeAliasText(slot?.id);
    const nextIndex = (counts.get(canonicalText) || 0) + 1;
    counts.set(canonicalText, nextIndex);

    return {
      slot,
      canonicalText,
      occurrenceIndex: nextIndex,
      textAliases: [...new Set(textAliases)],
      explicitIndex: parseTrailingIndex(slot?.id),
    };
  });
};

const buildAliasMap = (roomSlots = []) => {
  const slotMeta = buildSlotOccurrenceMeta(roomSlots);
  const aliasUsage = new Map();

  slotMeta.forEach((meta) => {
    const exactAliases = new Set();
    const textAliases = new Set(meta.textAliases);

    exactAliases.add(String(meta.slot?.id || ""));

    const inferredIndex = meta.explicitIndex || meta.occurrenceIndex;
    if (meta.slot?.id_habitacion != null) {
      exactAliases.add(`${meta.slot.id_habitacion}:${inferredIndex}`);
      exactAliases.add(String(meta.slot.id_habitacion));
    }

    if (meta.slot?.key) {
      exactAliases.add(`${meta.slot.key}:${inferredIndex}`);
      exactAliases.add(String(meta.slot.key));
    }

    textAliases.forEach((textAlias) => {
      exactAliases.add(`${textAlias}:${inferredIndex}`);
      aliasUsage.set(textAlias, (aliasUsage.get(textAlias) || 0) + 1);
    });

    meta.exactAliases = [...exactAliases].filter(Boolean);
  });

  const aliasMap = new Map();

  slotMeta.forEach((meta) => {
    meta.exactAliases.forEach((alias) => {
      const normalizedAlias = normalizeAliasText(alias);
      if (normalizedAlias && !aliasMap.has(normalizedAlias)) {
        aliasMap.set(normalizedAlias, meta.slot.id);
      }
    });

    meta.textAliases.forEach((alias) => {
      if ((aliasUsage.get(alias) || 0) !== 1) return;
      if (!aliasMap.has(alias)) {
        aliasMap.set(alias, meta.slot.id);
      }
    });
  });

  return aliasMap;
};

const mapAssignmentKeyToSlotId = (rawKey, aliasMap, roomSlots = []) => {
  if (!rawKey) return null;
  const normalizedKey = normalizeAliasText(rawKey);
  if (!normalizedKey) return null;

  // Handle generic sequential room:N keys used when services only have numeric child_id
  const genericMatch = normalizedKey.match(/^room:(\d+)$/);
  if (genericMatch) {
    const index = parseInt(genericMatch[1], 10) - 1;
    if (index >= 0 && index < roomSlots.length) {
      return roomSlots[index].id;
    }
    return null;
  }

  return aliasMap.get(normalizedKey) || null;
};

export const resolveHotelRoomAssignments = (rawAssignments, roomSlots = []) => {
  if (!rawAssignments || !Array.isArray(roomSlots) || roomSlots.length === 0) {
    return {};
  }

  const aliasMap = buildAliasMap(roomSlots);
  const resolved = {};

  const assign = (rawKey, rawIds) => {
    const slotId = mapAssignmentKeyToSlotId(rawKey, aliasMap, roomSlots);
    if (!slotId) return;
    const ids = Array.isArray(rawIds) ? rawIds.filter(Boolean) : [];
    resolved[slotId] = ids;
  };

  if (Array.isArray(rawAssignments)) {
    rawAssignments.forEach((entry) => {
      assign(entry?.roomId || entry?.id, entry?.passengerIds || entry?.ids);
    });
    return resolved;
  }

  if (typeof rawAssignments === "object") {
    Object.entries(rawAssignments).forEach(([rawKey, rawIds]) => {
      assign(rawKey, rawIds);
    });
  }

  return resolved;
};
