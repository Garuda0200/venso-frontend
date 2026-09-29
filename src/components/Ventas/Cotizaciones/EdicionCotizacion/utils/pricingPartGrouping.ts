const round2 = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

const normalizePricingGroupKey = (value) =>
  String(value || "sin-hotel")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .replace(/\s+/g, "-");

const buildGroupedChildLabel = (roomLabel, beneficiaries) => {
  const count = Math.max(1, Number(beneficiaries || 1));
  const normalizedRoom = String(roomLabel || "").trim();
  const isNoHotel =
    !normalizedRoom || /^(sin hotel|no room|no-room)$/i.test(normalizedRoom);

  if (isNoHotel) {
    return count === 1 ? "Niño sin hotel" : `Niños sin hotel (${count})`;
  }
  return count === 1
    ? `Niño ${normalizedRoom}`
    : `Niños ${normalizedRoom} (${count})`;
};

/**
 * Agrupa únicamente filas infantiles equivalentes. Dos niños se consolidan si
 * comparten habitación (o ambos no tienen hotel) y el mismo precio canónico.
 * No se promedian precios distintos: cada combinación conserva su propia fila.
 */
export const groupEquivalentChildPricingParts = (parts = []) => {
  const result = [];
  const grouped = new Map();

  (Array.isArray(parts) ? parts : []).forEach((part, index) => {
    if (part?.audience !== "child") {
      result.push(part);
      return;
    }

    const roomLabel =
      String(part?.roomLabel || part?.label || "Sin hotel")
        .replace(/^Niños?\s+/i, "")
        .replace(/\s*\(\d+\)\s*$/, "")
        .trim() || "Sin hotel";
    const signature = [
      normalizePricingGroupKey(roomLabel),
      round2(part?.value),
      round2(part?.commissionableValue),
      round2(part?.externalPerPerson),
      Boolean(part?.isFree),
    ].join("|");
    const beneficiaries = Math.max(1, Number(part?.beneficiaries || 1));
    const passengerIds = Array.isArray(part?.passengerIds)
      ? part.passengerIds.filter(Boolean)
      : [];
    const current = grouped.get(signature);

    if (!current) {
      const next = {
        ...part,
        key: part?.key || `summary-child-group-${index + 1}`,
        roomLabel,
        beneficiaries,
        passengerIds: [...new Set(passengerIds)],
      };
      grouped.set(signature, next);
      result.push(next);
      return;
    }

    current.beneficiaries += beneficiaries;
    current.passengerIds = [
      ...new Set([...(current.passengerIds || []), ...passengerIds]),
    ];
  });

  return result.map((part) =>
    part?.audience === "child"
      ? {
          ...part,
          label: buildGroupedChildLabel(part.roomLabel, part.beneficiaries),
          roundedValue: Math.ceil(Number(part.value || 0)),
          displayValue: Math.ceil(Number(part.value || 0)),
          lineTotal:
            Math.ceil(Number(part.value || 0)) *
            Math.max(1, Number(part.beneficiaries || 1)),
        }
      : part,
  );
};

export default groupEquivalentChildPricingParts;
