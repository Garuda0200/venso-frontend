const toSafeCount = (value, minimum = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return minimum;
  return Math.max(minimum, Math.trunc(parsed));
};

const defaultPassenger = (type, index) => ({
  id: `${type}-${index}`,
  passenger_key: `${type}-${index}`,
  age: type === "adult" ? "18" : "8",
  nacionalidad: "",
});

const normalizePassengerGroup = (items, requestedCount, type) => {
  const minimum = type === "adult" ? 1 : 0;
  const safeCount = toSafeCount(requestedCount, minimum);
  const original = Array.isArray(items) ? items : [];
  let changed = original.length !== safeCount;
  const next = original.slice(0, safeCount);

  while (next.length < safeCount) {
    next.push(defaultPassenger(type, next.length));
    changed = true;
  }

  const normalized = next.map((passenger, index) => {
    const passengerKey = `${type}-${index}`;
    const safePassenger = passenger && typeof passenger === "object"
      ? passenger
      : defaultPassenger(type, index);

    if (
      safePassenger.passenger_key === passengerKey &&
      safePassenger.id !== undefined &&
      safePassenger.id !== null
    ) {
      return safePassenger;
    }

    changed = true;
    return {
      ...safePassenger,
      id: safePassenger.id ?? passengerKey,
      passenger_key: passengerKey,
      age:
        safePassenger.age ??
        safePassenger.edad ??
        (type === "adult" ? "18" : "8"),
      nacionalidad: safePassenger.nacionalidad ?? safePassenger.pais ?? "",
    };
  });

  return {
    items: changed ? normalized : original,
    count: safeCount,
    changed,
  };
};

/**
 * Builds the canonical passenger composition used by PeopleSelection, the
 * quotation payload and the passenger synchronization endpoint.
 *
 * Explicit zero children is preserved. Adults always have a minimum of one.
 */
export const buildCanonicalPassengerComposition = (
  peopleDetails,
  peopleCount,
) => {
  const safeDetails =
    peopleDetails && typeof peopleDetails === "object" ? peopleDetails : {};
  const safeCount =
    peopleCount && typeof peopleCount === "object" ? peopleCount : {};

  const adults = normalizePassengerGroup(
    safeDetails.adults,
    safeCount.adults ?? safeDetails.adults?.length ?? 1,
    "adult",
  );
  const children = normalizePassengerGroup(
    safeDetails.children,
    safeCount.children ?? safeDetails.children?.length ?? 0,
    "child",
  );

  const normalizedCount = {
    ...safeCount,
    adults: adults.count,
    children: children.count,
  };

  const normalizedDetails =
    !adults.changed &&
    !children.changed &&
    safeDetails.adults === adults.items &&
    safeDetails.children === children.items
      ? safeDetails
      : {
          ...safeDetails,
          adults: adults.items,
          children: children.items,
        };

  return {
    peopleDetails: normalizedDetails,
    peopleCount: normalizedCount,
    total: adults.count + children.count,
  };
};

export const changeCanonicalPassengerCount = (
  peopleDetails,
  peopleCount,
  type,
  delta,
) => {
  const field = type === "children" ? "children" : "adults";
  const minimum = field === "adults" ? 1 : 0;
  const current = toSafeCount(peopleCount?.[field], minimum);
  const nextCount = {
    ...(peopleCount || {}),
    [field]: Math.max(minimum, current + Number(delta || 0)),
  };

  return buildCanonicalPassengerComposition(peopleDetails, nextCount);
};

export const countPassengerTypes = (passengers) => {
  const rows = Array.isArray(passengers) ? passengers : [];
  return rows.reduce(
    (acc, passenger) => {
      const type = String(
        passenger?.tipo_pasajero || passenger?.type || "adult",
      )
        .trim()
        .toLowerCase();
      if (["child", "children", "nino", "niño"].includes(type)) {
        acc.children += 1;
      } else {
        acc.adults += 1;
      }
      return acc;
    },
    { adults: 0, children: 0 },
  );
};
