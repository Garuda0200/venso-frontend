export const getChildSlotKey = (childId) => {
  const parts = String(childId || "").split(":");
  return parts[0] === "child" && parts[1] !== undefined
    ? `child:${parts[1]}`
    : String(childId || "");
};

const getChildSlotIndex = (childId) => {
  const parts = String(childId || "").split(":");
  const parsed = Number.parseInt(parts[1], 10);
  return Number.isInteger(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

export const buildChildPricingRows = (
  childIds = [],
  convertedEntries = [],
) => {
  const rowsBySlot = new Map();

  childIds.filter(Boolean).forEach((childId, position) => {
    const slot = getChildSlotKey(childId);
    if (!slot || rowsBySlot.has(slot)) return;
    rowsBySlot.set(slot, {
      childId,
      isConverted: false,
      revertKey: childId,
      position,
    });
  });

  convertedEntries.forEach((entry, position) => {
    const childId = entry?.childId;
    if (!childId) return;
    const slot = getChildSlotKey(childId);
    const previous = rowsBySlot.get(slot);
    rowsBySlot.set(slot, {
      childId,
      isConverted: true,
      revertKey: entry?.revertKey || childId,
      position: previous?.position ?? childIds.length + position,
    });
  });

  return [...rowsBySlot.values()]
    .sort((left, right) => {
      const slotDifference =
        getChildSlotIndex(left.childId) - getChildSlotIndex(right.childId);
      return slotDifference !== 0
        ? slotDifference
        : left.position - right.position;
    })
    .map(({ position: _position, ...row }) => row);
};
