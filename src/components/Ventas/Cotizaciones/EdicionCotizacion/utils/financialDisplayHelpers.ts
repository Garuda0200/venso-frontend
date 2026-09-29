const n = (value) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export const resolveChildChargeSummary = ({
  childrenCount = 0,
  baseExplicitChildCount = 0,
  baseConvertedChildCount = 0,
  hotelExplicitChildCount = 0,
  hotelConvertedChildCount = 0,
  nonHotelExplicitChildTotal = 0,
  nonHotelConvertedChildTotal = 0,
  hotelExplicitChildTotal = 0,
  hotelConvertedChildTotal = 0,
} = {}) => {
  const totalChildrenCount = Math.max(0, n(childrenCount));
  const clampChildCount = (value) =>
    Math.min(totalChildrenCount, Math.max(0, n(value)));
  const resolveCohortCount = (total, ...counts) => {
    const observed = Math.max(0, ...counts.map((value) => n(value)));
    if (observed > 0) return clampChildCount(observed);
    return n(total) > 0 ? totalChildrenCount : 0;
  };

  const nonHotelExplicitTotal = round2(n(nonHotelExplicitChildTotal));
  const nonHotelConvertedTotal = round2(n(nonHotelConvertedChildTotal));
  const hotelExplicitTotal = round2(n(hotelExplicitChildTotal));
  const hotelConvertedTotal = round2(n(hotelConvertedChildTotal));

  const baseExplicitCount = resolveCohortCount(
    nonHotelExplicitTotal,
    baseExplicitChildCount,
  );
  const baseConvertedCount = resolveCohortCount(
    nonHotelConvertedTotal,
    baseConvertedChildCount,
  );
  const resolvedHotelExplicitCount = resolveCohortCount(
    hotelExplicitTotal,
    hotelExplicitChildCount,
  );
  const resolvedHotelConvertedCount = resolveCohortCount(
    hotelConvertedTotal,
    hotelConvertedChildCount,
  );

  const explicitCount = Math.max(baseExplicitCount, resolvedHotelExplicitCount);
  const convertedCount = Math.max(
    baseConvertedCount,
    resolvedHotelConvertedCount,
  );
  const explicitTotal = round2(nonHotelExplicitTotal + hotelExplicitTotal);
  const convertedTotal = round2(nonHotelConvertedTotal + hotelConvertedTotal);
  const nonHotelUnifiedTotal = round2(
    nonHotelExplicitTotal + nonHotelConvertedTotal,
  );
  const hotelUnifiedTotal = round2(hotelExplicitTotal + hotelConvertedTotal);

  // Los importes se mantienen por cohorte. Un niño convertido en el hotel no
  // debe repartir su habitación entre los demás niños (por ejemplo, el niño
  // "sin hotel"). Los servicios no hoteleros siguen siendo una base común por
  // niño, porque un mismo niño puede alternar tarifa propia/adulta por servicio.
  const nonHotelUnifiedPerChild =
    totalChildrenCount > 0
      ? round2(nonHotelUnifiedTotal / totalChildrenCount)
      : 0;
  const hotelExplicitPerChild =
    resolvedHotelExplicitCount > 0
      ? round2(hotelExplicitTotal / resolvedHotelExplicitCount)
      : 0;
  const hotelConvertedPerChild =
    resolvedHotelConvertedCount > 0
      ? round2(hotelConvertedTotal / resolvedHotelConvertedCount)
      : 0;
  const explicitPerChild = round2(
    nonHotelUnifiedPerChild + hotelExplicitPerChild,
  );
  const convertedPerChild = round2(
    nonHotelUnifiedPerChild + hotelConvertedPerChild,
  );
  const unifiedPerChild =
    totalChildrenCount > 0
      ? round2((explicitTotal + convertedTotal) / totalChildrenCount)
      : 0;

  return {
    totalChildrenCount,
    explicitCount,
    convertedCount,
    baseExplicitCount,
    baseConvertedCount,
    hotelExplicitCount: resolvedHotelExplicitCount,
    hotelConvertedCount: resolvedHotelConvertedCount,
    explicitTotal,
    convertedTotal,
    nonHotelExplicitTotal,
    nonHotelConvertedTotal,
    hotelExplicitTotal,
    hotelConvertedTotal,
    nonHotelUnifiedTotal,
    hotelUnifiedTotal,
    nonHotelUnifiedPerChild,
    hotelUnifiedPerChild:
      totalChildrenCount > 0
        ? round2(hotelUnifiedTotal / totalChildrenCount)
        : 0,
    hotelExplicitPerChild,
    hotelConvertedPerChild,
    explicitPerChild,
    convertedPerChild,
    unifiedCount: Math.max(explicitCount, convertedCount),
    unifiedPerChild,
  };
};


const cleanRoomLabel = (value) =>
  String(value || "Habitacion")
    .replace(/^HABITACION\s+/i, "")
    .trim();

const normalizeRoomIdentity = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^([^:]+:)/, "")
    .replace(/:\d+$/, "")
    .replace(/\s+\d+$/, "")
    .replace(/\s+/g, " ");

const getPricingRoomIdentity = (room = {}) => {
  const raw =
    room?.sourceRoomKey ||
    room?.roomTypeKey ||
    room?.roomKey ||
    room?.baseKey ||
    room?.baseLabel ||
    room?.label ||
    room?.key ||
    "habitacion";
  return normalizeRoomIdentity(raw) || "habitacion";
};

const getPassengerIdValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value).trim();

  return String(
    value?.id ??
      value?.passengerId ??
      value?.passenger_id ??
      value?.id_pasajero ??
      value?.pasajero_id ??
      value?.value ??
      "",
  ).trim();
};

const collectIds = (...values) =>
  values
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .map(getPassengerIdValue)
    .filter(Boolean);

const collectRoomPassengerIds = (room = {}, field) => {
  const details = Array.isArray(room?.roomDetails) ? room.roomDetails : [];
  return collectIds(
    room?.[field],
    ...details.map((detail) => detail?.[field]),
  );
};

const collectRoomBeneficiaryEntries = (room = {}, fields = []) => {
  const details = Array.isArray(room?.roomDetails) ? room.roomDetails : [];
  const toArray = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return [];

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const values = [
    ...fields.flatMap((field) => toArray(room?.[field])),
    ...details.flatMap((detail) =>
      fields.flatMap((field) => toArray(detail?.[field])),
    ),
  ];

  return values
    .map((value) => {
      const id = getPassengerIdValue(value);
      if (!id) return null;

      const normalizedId = id.toLowerCase();
      const isChild =
        normalizedId.startsWith("child:") ||
        Boolean(
          value &&
            typeof value === "object" &&
            (value.child_origin ||
              value.childOrigin ||
              value.is_child ||
              value.isChild ||
              value.es_nino ||
              value.esNiño),
        );

      return { id, isChild };
    })
    .filter(Boolean);
};

const getPassengerCohortIdentity = (room = {}) => {
  const adultIds = [...new Set(collectRoomPassengerIds(room, "adultPassengerIds"))]
    .sort();
  const convertedChildIds = [
    ...new Set(collectRoomPassengerIds(room, "convertedChildPassengerIds")),
  ].sort();
  const passengerIds = [
    ...new Set([
      ...collectRoomPassengerIds(room, "passengerIds"),
      ...adultIds,
      ...convertedChildIds,
    ]),
  ].sort();

  if (passengerIds.length === 0) return "";

  // Una misma cohorte puede alojarse en distintos grupos de días y hasta
  // cambiar de categoría. Se consolida para aplicar servicios, adicionales e
  // itinerario externo una sola vez; el hotel se suma desde cada grupo.
  return [
    `pax:${passengerIds.join(",")}`,
    `adult:${adultIds.join(",")}`,
    `converted:${convertedChildIds.join(",")}`,
  ].join("|");
};

const getRoomIgvStatus = (room = {}) =>
  Boolean(
    room?.hasIgv ||
      room?.tieneIgv ||
      (Array.isArray(room?.roomDetails) &&
        room.roomDetails.some(
          (detail) => detail?.hasIgv || detail?.tieneIgv || detail?.roomHasIgv,
        )),
  );

const getRoomPricingCohortIdentity = (room = {}) => {
  const passengerCohort = getPassengerCohortIdentity(room);
  if (passengerCohort) return passengerCohort;

  // Los datos antiguos sin IDs de pasajeros conservan su agrupación previa.
  // En ese caso no es seguro asumir que dos filas representan la misma gente.
  const identity = getPricingRoomIdentity(room);
  const hasIgv = getRoomIgvStatus(room);
  const detail = Array.isArray(room?.roomDetails) ? room.roomDetails[0] : null;
  const baseUnit = round2(
    n(detail?.baseUnit ?? detail?.roomBaseUnit ?? room?.roomBaseUnitPrice),
  );
  const unitWithIgv = round2(
    n(
      detail?.unitWithIgv ??
        detail?.unit ??
        room?.roomUnitPriceWithIgv ??
        room?.hotelPerNight,
    ),
  );
  return `${identity}|igv:${hasIgv ? 1 : 0}|base:${baseUnit}|unit:${unitWithIgv}`;
};

const getPricingGroupIdentity = (room = {}, index = 0) => {
  const indices = Array.isArray(room?.groupDayIndices)
    ? room.groupDayIndices
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value))
        .sort((a, b) => a - b)
    : [];
  const explicit = String(room?.groupKey || room?.groupId || "").trim();
  if (explicit && indices.length > 0) return `${explicit}:${indices.join("-")}`;
  if (explicit) return explicit;
  if (indices.length > 0) {
    return `${room?.groupCategory || "group"}:${indices.join("-")}`;
  }
  return `group-${index + 1}`;
};

const mergeUniqueIds = (target, ids = []) => {
  ids.forEach((id) => target.add(String(id)));
};

const resolveBeneficiaryCountFromGroups = (groups, field) => {
  if (!groups || groups.size === 0) return 0;
  return Math.max(
    0,
    ...Array.from(groups.values()).map((group) => Math.max(0, n(group?.[field]))),
  );
};

const resolveWeightedGroupShare = (group = {}, valueField, weightField) => {
  const weight = Math.max(0, n(group?.[weightField]));
  if (weight <= 0) return 0;
  return round2(n(group?.[valueField]) / weight);
};

const aggregateLegacyPerRoomPricingByStayGroup = (perRoomPricing = []) => {
  if (!Array.isArray(perRoomPricing) || perRoomPricing.length === 0) return [];

  const buckets = new Map();

  perRoomPricing.forEach((room, index) => {
    if (!room || typeof room !== "object") return;

    const roomIdentity = getPricingRoomIdentity(room);
    const cohortIdentity = getRoomPricingCohortIdentity(room);
    const label = cleanRoomLabel(room?.label || room?.baseLabel || roomIdentity);
    const bucket = buckets.get(cohortIdentity) || {
      source: room,
      key: cohortIdentity,
      roomKey: room?.roomKey || room?.sourceRoomKey || roomIdentity,
      sourceRoomKey: room?.sourceRoomKey || room?.roomKey || roomIdentity,
      label,
      baseLabel: label,
      capacity: n(room?.capacity),
      roomCount: 0,
      groups: new Map(),
      adultPassengerIds: new Set(),
      convertedChildPassengerIds: new Set(),
      passengerIds: new Set(),
      roomDetails: [],
      hasIgv: getRoomIgvStatus(room),
      hotelTotalRoom: 0,
      baseTotal: 0,
      baseWeight: 0,
      adicionalesTotal: 0,
      adicionalesWeight: 0,
      totalPerPersonTotal: 0,
      totalPerPersonWeight: 0,
      displayTotalPerPersonTotal: 0,
      displayTotalPerPersonWeight: 0,
      convertedDisplayTotal: 0,
      convertedDisplayWeight: 0,
      convertedServiceTotal: 0,
      convertedServiceWeight: 0,
    };

    const groupKey = getPricingGroupIdentity(room, index);
    const group = bucket.groups.get(groupKey) || {
      adultBeneficiaries: 0,
      convertedChildBeneficiaries: 0,
      totalBeneficiaries: 0,
      hotelShareTotal: 0,
      hotelShareWeight: 0,
      convertedHotelShareTotal: 0,
      convertedHotelShareWeight: 0,
      igvShareTotal: 0,
      igvShareWeight: 0,
      roomCount: 0,
    };

    const adultBeneficiaries = Math.max(0, n(room?.adultBeneficiaries));
    const convertedChildBeneficiaries = Math.max(
      0,
      n(room?.convertedChildBeneficiaries),
    );
    const totalBeneficiaries = Math.max(
      0,
      n(room?.beneficiaries) || adultBeneficiaries + convertedChildBeneficiaries,
    );
    const adultIds = collectRoomPassengerIds(room, "adultPassengerIds");
    const convertedIds = collectRoomPassengerIds(room, "convertedChildPassengerIds");
    const passengerIds = collectIds(
      room?.passengerIds,
      ...collectRoomPassengerIds(room, "passengerIds"),
      adultIds,
      convertedIds,
    );
    mergeUniqueIds(bucket.adultPassengerIds, adultIds);
    mergeUniqueIds(bucket.convertedChildPassengerIds, convertedIds);
    mergeUniqueIds(bucket.passengerIds, passengerIds);
    if (Array.isArray(room?.roomDetails)) {
      bucket.roomDetails.push(...room.roomDetails);
    }

    const hotelPerPerson = n(room?.hotelPerPerson);
    const convertedHotelPerPerson =
      n(room?.convertedChildHotelPerPerson) || hotelPerPerson;
    const igvPerPerson = n(room?.igvPerPerson);

    group.adultBeneficiaries += adultBeneficiaries;
    group.convertedChildBeneficiaries += convertedChildBeneficiaries;
    group.totalBeneficiaries += totalBeneficiaries;
    group.hotelShareTotal += hotelPerPerson * Math.max(1, totalBeneficiaries);
    group.hotelShareWeight += Math.max(1, totalBeneficiaries);
    group.convertedHotelShareTotal +=
      convertedHotelPerPerson * Math.max(0, convertedChildBeneficiaries);
    group.convertedHotelShareWeight += Math.max(0, convertedChildBeneficiaries);
    group.igvShareTotal += igvPerPerson * Math.max(1, totalBeneficiaries);
    group.igvShareWeight += Math.max(1, totalBeneficiaries);
    group.roomCount += Math.max(0, n(room?.roomCount) || 1);
    bucket.groups.set(groupKey, group);

    // El mismo cuarto puede aparecer en varios grupos de días. La cantidad de
    // habitaciones físicas no debe crecer por cada tramo de estadía.
    bucket.roomCount = Math.max(bucket.roomCount, n(room?.roomCount) || 1);
    bucket.hotelTotalRoom += n(room?.hotelTotalRoom);

    const baseWeight = Math.max(0, adultBeneficiaries);
    bucket.baseTotal += n(room?.base) * baseWeight;
    bucket.baseWeight += baseWeight;
    bucket.adicionalesTotal += n(room?.adicionales) * baseWeight;
    bucket.adicionalesWeight += baseWeight;
    bucket.totalPerPersonTotal += n(room?.totalPerPerson) * baseWeight;
    bucket.totalPerPersonWeight += baseWeight;
    bucket.displayTotalPerPersonTotal += n(room?.displayTotalPerPerson) * baseWeight;
    bucket.displayTotalPerPersonWeight += baseWeight;

    const convertedWeight = Math.max(0, convertedChildBeneficiaries);
    bucket.convertedDisplayTotal +=
      (n(room?.convertedChildDisplayTotalPerPerson) ||
        n(room?.convertedChildTotalPerPerson)) * convertedWeight;
    bucket.convertedDisplayWeight += convertedWeight;
    bucket.convertedServiceTotal +=
      n(room?.convertedChildServicePerPerson) * convertedWeight;
    bucket.convertedServiceWeight += convertedWeight;

    buckets.set(cohortIdentity, bucket);
  });

  return Array.from(buckets.values()).map((bucket, index) => {
    const groupEntries = Array.from(bucket.groups.values());
    const adultBeneficiaries =
      bucket.adultPassengerIds.size > 0
        ? bucket.adultPassengerIds.size
        : resolveBeneficiaryCountFromGroups(bucket.groups, "adultBeneficiaries");
    const convertedChildBeneficiaries =
      bucket.convertedChildPassengerIds.size > 0
        ? bucket.convertedChildPassengerIds.size
        : resolveBeneficiaryCountFromGroups(bucket.groups, "convertedChildBeneficiaries");
    const beneficiaries =
      bucket.passengerIds.size > 0
        ? bucket.passengerIds.size
        : Math.max(adultBeneficiaries + convertedChildBeneficiaries, 0);
    const hotelPerPerson = round2(
      groupEntries.reduce(
        (sum, group) =>
          sum + resolveWeightedGroupShare(group, "hotelShareTotal", "hotelShareWeight"),
        0,
      ),
    );
    const convertedChildHotelPerPerson = round2(
      groupEntries.reduce((sum, group) => {
        const convertedShare = resolveWeightedGroupShare(
          group,
          "convertedHotelShareTotal",
          "convertedHotelShareWeight",
        );
        return (
          sum +
          (convertedShare ||
            resolveWeightedGroupShare(group, "hotelShareTotal", "hotelShareWeight"))
        );
      }, 0),
    );
    const igvPerPerson = round2(
      groupEntries.reduce(
        (sum, group) =>
          sum + resolveWeightedGroupShare(group, "igvShareTotal", "igvShareWeight"),
        0,
      ),
    );

    return {
      ...bucket.source,
      key: bucket.key || `room-${index + 1}`,
      roomKey: bucket.roomKey,
      sourceRoomKey: bucket.sourceRoomKey,
      label: bucket.label,
      baseLabel: bucket.baseLabel,
      capacity: bucket.capacity || bucket.source?.capacity,
      roomCount: bucket.roomCount || 1,
      beneficiaries,
      adultBeneficiaries,
      convertedChildBeneficiaries,
      passengerIds: Array.from(bucket.passengerIds),
      adultPassengerIds: Array.from(bucket.adultPassengerIds),
      convertedChildPassengerIds: Array.from(bucket.convertedChildPassengerIds),
      roomDetails: bucket.roomDetails,
      hasIgv: bucket.hasIgv,
      tieneIgv: bucket.hasIgv,
      hotelPerPerson,
      convertedChildHotelPerPerson,
      hotelTotalRoom: round2(bucket.hotelTotalRoom),
      igvPerPerson,
      base:
        bucket.baseWeight > 0 ? round2(bucket.baseTotal / bucket.baseWeight) : 0,
      adicionales:
        bucket.adicionalesWeight > 0
          ? round2(bucket.adicionalesTotal / bucket.adicionalesWeight)
          : 0,
      totalPerPerson:
        bucket.totalPerPersonWeight > 0
          ? round2(bucket.totalPerPersonTotal / bucket.totalPerPersonWeight)
          : 0,
      displayTotalPerPerson:
        bucket.displayTotalPerPersonWeight > 0
          ? round2(
              bucket.displayTotalPerPersonTotal /
                bucket.displayTotalPerPersonWeight,
            )
          : 0,
      convertedChildDisplayTotalPerPerson:
        bucket.convertedDisplayWeight > 0
          ? round2(bucket.convertedDisplayTotal / bucket.convertedDisplayWeight)
          : 0,
      convertedChildTotalPerPerson:
        bucket.convertedDisplayWeight > 0
          ? round2(bucket.convertedDisplayTotal / bucket.convertedDisplayWeight)
          : 0,
      convertedChildServicePerPerson:
        bucket.convertedServiceWeight > 0
          ? round2(bucket.convertedServiceTotal / bucket.convertedServiceWeight)
          : 0,
      aggregatedHotelGroups: groupEntries.length,
      aggregatedFromGroupedHotel: groupEntries.length > 1,
    };
  });
};

const getRoomPassengerAssignment = (room = {}) => {
  const passengerIds = collectRoomPassengerIds(room, "passengerIds");
  const persistedAdultBeneficiaries = collectRoomBeneficiaryEntries(room, [
    "beneficiariosAdultos",
    "beneficiarios_adultos",
    "beneficiarios_adulto",
    "beneficiariosAdulto",
  ]);
  const explicitAdultPassengerIds = collectRoomPassengerIds(
    room,
    "adultPassengerIds",
  );
  const explicitConvertedChildIds = collectRoomPassengerIds(
    room,
    "convertedChildPassengerIds",
  );

  const persistedAdultPassengerIds = persistedAdultBeneficiaries
    .filter((beneficiary) => !beneficiary.isChild)
    .map((beneficiary) => beneficiary.id);
  const persistedConvertedChildIds = persistedAdultBeneficiaries
    .filter((beneficiary) => beneficiary.isChild)
    .map((beneficiary) => beneficiary.id);
  const knownConvertedChildIds = new Set([
    ...explicitConvertedChildIds,
    ...persistedConvertedChildIds,
    ...passengerIds.filter((id) => String(id).startsWith("child:")),
  ]);
  const persistedOrExplicitAdultIds = new Set([
    ...explicitAdultPassengerIds,
    ...persistedAdultPassengerIds,
  ]);
  const barePassengerIds = passengerIds.filter((id) => {
    const value = String(id);
    return !value.startsWith("adult:") && !value.startsWith("child:");
  });

  // Las cotizaciones rehidratadas desde PostgreSQL conservan los IDs reales
  // de pasajero (a menudo numéricos) en beneficiarios_adultos. No dependen
  // necesariamente de los prefijos internos adult:/child:, por lo que se
  // respeta child_origin para separar a los niños con tarifa adulta.
  const adultPassengerIds = [
    ...new Set([
      ...explicitAdultPassengerIds.filter(
        (id) => !String(id).startsWith("child:"),
      ),
      ...persistedAdultPassengerIds,
      ...passengerIds.filter((id) => String(id).startsWith("adult:")),
      // Las asignaciones de habitación guardadas por versiones anteriores
      // pueden exponer sólo IDs reales (sin prefijo). En un cuarto de hotel
      // esos IDs son adultos salvo que el payload los marque con child_origin.
      ...barePassengerIds.filter(
        (id) =>
          !knownConvertedChildIds.has(id) ||
          persistedOrExplicitAdultIds.has(id),
      ),
    ]),
  ];
  const convertedChildPassengerIds = [
    ...new Set([
      ...explicitConvertedChildIds,
      ...persistedConvertedChildIds,
      ...passengerIds.filter((id) => String(id).startsWith("child:")),
    ]),
  ];

  return {
    adultPassengerIds,
    convertedChildPassengerIds,
    passengerIds: [
      ...new Set([
        ...collectRoomPassengerIds(room, "passengerIds"),
        ...adultPassengerIds,
        ...convertedChildPassengerIds,
      ]),
    ],
  };
};

const getLastGroupDay = (room = {}, index = 0) => {
  const dayIndices = Array.isArray(room?.groupDayIndices)
    ? room.groupDayIndices
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value))
    : [];

  return dayIndices.length > 0 ? Math.max(...dayIndices) : index;
};

const getRoomDisplayIdentity = (room = {}) => {
  const label = cleanRoomLabel(room?.baseLabel || room?.label || "Habitación")
    .replace(/\s+\d+$/, "")
    .trim();
  return label || "Habitación";
};

const getAudienceBeneficiaryCount = (room = {}, audience) => {
  const convertedChildren = Math.max(0, n(room?.convertedChildBeneficiaries));

  if (audience === "converted") return convertedChildren;

  // Las cotizaciones rehidratadas desde itinerario_servicio no siempre traen
  // adultBeneficiaries, aunque sí conservan beneficiaries. En ese formato el
  // total representa adultos más niños con tarifa adulta. Usarlo como fallback
  // mantiene la misma cohorte durante todos los grupos de hotel y evita que el
  // resumen vuelva al cálculo legado por habitación.
  const declaredAdults = room?.adultBeneficiaries;
  if (declaredAdults !== undefined && declaredAdults !== null) {
    return Math.max(0, n(declaredAdults));
  }

  return Math.max(0, n(room?.beneficiaries) - convertedChildren);
};

const buildRoomPassengerAssignments = (perRoomPricing = []) => {
  const explicitAssignments = perRoomPricing.map((room) =>
    getRoomPassengerAssignment(room),
  );
  const audiences = ["adult", "converted"];

  // Al rehidratar cotizaciones antiguas, algunos servicios hoteleros conservan
  // solamente el conteo de beneficiarios. Para que cada tramo de hotel siga
  // perteneciendo al mismo pasajero, se generan posiciones estables por grupo
  // (adulto 1..n / niño como adulto 1..n). Esto evita duplicar servicios y fee
  // por cada grupo de noches, sin inventar precios ni alterar la persistencia.
  const requiresSyntheticByAudience = audiences.reduce((result, audience) => {
    result[audience] = perRoomPricing.some((room, index) => {
      const expected = getAudienceBeneficiaryCount(room, audience);
      if (expected === 0) return false;
      const actual =
        audience === "adult"
          ? explicitAssignments[index].adultPassengerIds.length
          : explicitAssignments[index].convertedChildPassengerIds.length;
      return actual < expected;
    });
    return result;
  }, {});

  const assignments = explicitAssignments.map((assignment) => ({
    adultPassengerIds: [...assignment.adultPassengerIds],
    convertedChildPassengerIds: [...assignment.convertedChildPassengerIds],
    passengerIds: [...assignment.passengerIds],
  }));
  const roomIndexesByGroup = new Map();

  perRoomPricing.forEach((room, index) => {
    const groupKey = getPricingGroupIdentity(room, index);
    const roomIndexes = roomIndexesByGroup.get(groupKey) || [];
    roomIndexes.push(index);
    roomIndexesByGroup.set(groupKey, roomIndexes);
  });

  audiences.forEach((audience) => {
    if (!requiresSyntheticByAudience[audience]) return;

    roomIndexesByGroup.forEach((roomIndexes) => {
      let passengerPosition = 0;
      roomIndexes.forEach((roomIndex) => {
        const expected = getAudienceBeneficiaryCount(
          perRoomPricing[roomIndex],
          audience,
        );
        const passengerPrefix = audience === "adult" ? "adult" : "child";
        const syntheticIds = Array.from({ length: expected }, (_, slotIndex) =>
          `${passengerPrefix}:synthetic-${passengerPosition + slotIndex + 1}`,
        );
        passengerPosition += expected;

        if (audience === "adult") {
          assignments[roomIndex].adultPassengerIds = syntheticIds;
        } else {
          assignments[roomIndex].convertedChildPassengerIds = syntheticIds;
        }
      });
    });
  });

  return assignments.map((assignment) => ({
    ...assignment,
    passengerIds: [
      ...new Set([
        ...assignment.adultPassengerIds,
        ...assignment.convertedChildPassengerIds,
      ]),
    ],
  }));
};

const hasRecoverableRoomAssignments = (perRoomPricing = []) =>
  perRoomPricing.some((room) => {
    const assignment = getRoomPassengerAssignment(room);
    return (
      assignment.adultPassengerIds.length > 0 ||
      assignment.convertedChildPassengerIds.length > 0 ||
      getAudienceBeneficiaryCount(room, "adult") > 0 ||
      getAudienceBeneficiaryCount(room, "converted") > 0
    );
  });

const resolveProfileBase = (profile) => {
  const samples = profile.baseWithoutHotel.filter(
    (value) => Number.isFinite(value) && value >= 0,
  );
  if (samples.length === 0) return 0;

  // Servicios e importes adicionales ajenos al hotel deben ser iguales por
  // pasajero en todos los grupos. La mediana evita que una fila heredada o
  // incompleta altere el costo base de la trayectoria completa.
  const sorted = [...samples].sort((left, right) => left - right);
  return round2(sorted[Math.floor(sorted.length / 2)]);
};

const buildPassengerStayProfiles = (
  perRoomPricing = [],
  roomAssignments = [],
) => {
  const passengers = new Map();
  const seenPassengerGroup = new Set();

  perRoomPricing.forEach((room, index) => {
    const assignment = roomAssignments[index] || getRoomPassengerAssignment(room);
    const groupKey = getPricingGroupIdentity(room, index);
    const roomIdentity = getPricingRoomIdentity(room);
    const displayLabel = getRoomDisplayIdentity(room);
    const groupDay = getLastGroupDay(room, index);
    const roomHotelPerPerson = n(room?.hotelPerPerson);
    const convertedHotelPerPerson =
      room?.convertedChildHotelPerPerson === undefined ||
      room?.convertedChildHotelPerPerson === null
        ? roomHotelPerPerson
        : n(room.convertedChildHotelPerPerson);
    const roomIgvPerPerson = n(room?.igvPerPerson);
    const roomDetails = Array.isArray(room?.roomDetails)
      ? room.roomDetails
      : [];

    const registerPassenger = (passengerId, audience, hotelPerPerson) => {
      const dedupeKey = `${groupKey}|${audience}|${passengerId}`;
      if (seenPassengerGroup.has(dedupeKey)) return;
      seenPassengerGroup.add(dedupeKey);

      const identity = `${audience}:${passengerId}`;
      const profile = passengers.get(identity) || {
        identity,
        passengerId,
        audience,
        hotelPerPerson: 0,
        igvPerPerson: 0,
        baseWithoutHotel: [],
        contributions: [],
        roomDetails: [],
        dayIndices: new Set(),
        hasIgv: false,
      };
      const base = n(room?.base);
      profile.hotelPerPerson = round2(profile.hotelPerPerson + hotelPerPerson);
      profile.igvPerPerson = round2(profile.igvPerPerson + roomIgvPerPerson);
      if (base > 0 || hotelPerPerson > 0) {
        profile.baseWithoutHotel.push(round2(Math.max(0, base - hotelPerPerson)));
      }
      profile.contributions.push({
        room,
        index,
        groupKey,
        groupDay,
        roomIdentity,
        displayLabel,
        hotelPerPerson,
        igvPerPerson: roomIgvPerPerson,
      });
      profile.roomDetails.push(...roomDetails);
      (Array.isArray(room?.groupDayIndices) ? room.groupDayIndices : []).forEach(
        (value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isInteger(parsed)) profile.dayIndices.add(parsed);
        },
      );
      profile.hasIgv = profile.hasIgv || getRoomIgvStatus(room);
      passengers.set(identity, profile);
    };

    assignment.adultPassengerIds.forEach((passengerId) =>
      registerPassenger(passengerId, "adult", roomHotelPerPerson),
    );
    assignment.convertedChildPassengerIds.forEach((passengerId) =>
      registerPassenger(passengerId, "converted", convertedHotelPerPerson),
    );
  });

  const buckets = new Map();
  passengers.forEach((passenger) => {
    const contributions = [...passenger.contributions].sort(
      (left, right) => left.groupDay - right.groupDay || left.index - right.index,
    );
    const latest = contributions[contributions.length - 1];
    if (!latest) return;

    const roomIdentity = latest.roomIdentity || "habitacion";
    const hotelPerPerson = round2(passenger.hotelPerPerson);
    const igvPerPerson = round2(passenger.igvPerPerson);
    // El perfil se agrupa por costo final y por la habitación más reciente.
    // Así una estadía familiar seguida de dobles continúa siendo un único
    // pasajero financiero, sin multiplicar servicios ni adicionales.
    const profileKey = [
      roomIdentity,
      `hotel:${hotelPerPerson.toFixed(2)}`,
      `igv:${igvPerPerson.toFixed(2)}`,
    ].join("|");
    const bucket = buckets.get(profileKey) || {
      key: profileKey,
      source: latest.room,
      roomKey:
        latest.room?.roomTypeKey ||
        latest.room?.sourceRoomKey ||
        latest.room?.roomKey ||
        roomIdentity,
      sourceRoomKey:
        latest.room?.sourceRoomKey ||
        latest.room?.roomTypeKey ||
        latest.room?.roomKey ||
        roomIdentity,
      label: latest.displayLabel,
      baseLabel: latest.displayLabel,
      capacity: n(latest.room?.capacity),
      adultPassengerIds: new Set(),
      convertedChildPassengerIds: new Set(),
      passengerIds: new Set(),
      roomDetails: [],
      groupKeys: new Set(),
      groupDayIndices: new Set(),
      hasIgv: false,
      hotelPerPerson,
      igvPerPerson,
      baseWithoutHotel: [],
    };

    bucket.passengerIds.add(passenger.passengerId);
    if (passenger.audience === "adult") {
      bucket.adultPassengerIds.add(passenger.passengerId);
    } else {
      bucket.convertedChildPassengerIds.add(passenger.passengerId);
    }
    bucket.roomDetails.push(...passenger.roomDetails);
    bucket.baseWithoutHotel.push(resolveProfileBase(passenger));
    bucket.hasIgv = bucket.hasIgv || passenger.hasIgv;
    contributions.forEach((contribution) => {
      bucket.groupKeys.add(contribution.groupKey);
    });
    passenger.dayIndices.forEach((dayIndex) => bucket.groupDayIndices.add(dayIndex));
    buckets.set(profileKey, bucket);
  });

  return Array.from(buckets.values()).map((bucket, index) => {
    const adultBeneficiaries = bucket.adultPassengerIds.size;
    const convertedChildBeneficiaries = bucket.convertedChildPassengerIds.size;
    const beneficiaries = adultBeneficiaries + convertedChildBeneficiaries;
    const baseWithoutHotel = resolveProfileBase(bucket);
    const hotelPerPerson = round2(bucket.hotelPerPerson);
    const totalHotel = round2(hotelPerPerson * beneficiaries);

    return {
      ...bucket.source,
      key: bucket.key || `stay-profile-${index + 1}`,
      roomKey: bucket.roomKey,
      sourceRoomKey: bucket.sourceRoomKey,
      label: bucket.label,
      baseLabel: bucket.baseLabel,
      capacity: bucket.capacity || bucket.source?.capacity,
      roomCount: 1,
      beneficiaries,
      adultBeneficiaries,
      convertedChildBeneficiaries,
      passengerIds: Array.from(bucket.passengerIds),
      adultPassengerIds: Array.from(bucket.adultPassengerIds),
      convertedChildPassengerIds: Array.from(bucket.convertedChildPassengerIds),
      roomDetails: bucket.roomDetails,
      hasIgv: bucket.hasIgv,
      tieneIgv: bucket.hasIgv,
      hotelPerPerson,
      convertedChildHotelPerPerson: hotelPerPerson,
      hotelTotalRoom: totalHotel,
      igvPerPerson: round2(bucket.igvPerPerson),
      base: round2(baseWithoutHotel + hotelPerPerson),
      // Los adicionales se recalculan en cada consumidor con su configuración
      // actual. No se arrastra un adicional parcial de un grupo de hotel.
      adicionales: 0,
      totalPerPerson: round2(baseWithoutHotel + hotelPerPerson),
      displayTotalPerPerson: round2(baseWithoutHotel + hotelPerPerson),
      convertedChildDisplayTotalPerPerson: hotelPerPerson,
      convertedChildTotalPerPerson: hotelPerPerson,
      convertedChildServicePerPerson: 0,
      groupKey: Array.from(bucket.groupKeys).join("|"),
      groupDayIndices: Array.from(bucket.groupDayIndices).sort(
        (left, right) => left - right,
      ),
      aggregatedHotelGroups: bucket.groupKeys.size,
      aggregatedFromGroupedHotel: bucket.groupKeys.size > 1,
    };
  });
};

export const aggregatePerRoomPricingByStayGroup = (perRoomPricing = []) => {
  if (!Array.isArray(perRoomPricing) || perRoomPricing.length === 0) return [];

  if (!hasRecoverableRoomAssignments(perRoomPricing)) {
    return aggregateLegacyPerRoomPricingByStayGroup(perRoomPricing);
  }

  const profiles = buildPassengerStayProfiles(
    perRoomPricing,
    buildRoomPassengerAssignments(perRoomPricing),
  );
  return profiles.length > 0
    ? profiles
    : aggregateLegacyPerRoomPricingByStayGroup(perRoomPricing);
};

export const resolveConvertedChildRoomFinancials = (
  room,
  childInfo,
  childAdditionalPerPerson = 0,
  externalChildTotal = 0,
) => {
  const hotelPerPerson =
    n(room?.convertedChildHotelPerPerson) || n(room?.hotelPerPerson);
  const expectedServices = n(childInfo?.nonHotelUnifiedPerChild);
  const roomBaseValue =
    n(room?.convertedChildDisplayTotalPerPerson) ||
    n(room?.convertedChildTotalPerPerson) ||
    hotelPerPerson;
  const storedServices =
    n(room?.convertedChildServicePerPerson) ||
    Math.max(0, round2(roomBaseValue - hotelPerPerson));
  const includedServices =
    expectedServices > 0 ? expectedServices : storedServices;
  const missingServices = Math.max(0, round2(expectedServices - storedServices));
  const basePerChild = round2(hotelPerPerson + includedServices);
  const totalPerChild = round2(
    basePerChild + n(childAdditionalPerPerson) + n(externalChildTotal),
  );

  return {
    hotelPerPerson,
    includedServices,
    missingServices,
    basePerChild,
    totalPerChild,
  };
};


const pickDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null);

const readAdditionalPolicy = (additionalCosts = {}, field) =>
  pickDefined(
    additionalCosts?.[field],
    additionalCosts?.[
      field === "applyOperationalCostsToChildren"
        ? "apply_operational_costs_to_children"
        : field === "applyFeeToChildren"
          ? "apply_fee_to_children"
          : field === "applyExtraFeeToChildren"
            ? "apply_extra_fee_to_children"
            : field
    ],
    additionalCosts?.applyAdditionalCostsToChildren,
    additionalCosts?.apply_additional_costs_to_children,
    true,
  ) !== false;

export const calculateAdditionalCostForAudience = (
  base = 0,
  additionalCosts = {},
  audience = "adult",
) => {
  const isChild = audience === "child";
  const useAdultOperational =
    !isChild || readAdditionalPolicy(additionalCosts, "applyOperationalCostsToChildren");
  const useAdultFee =
    !isChild || readAdditionalPolicy(additionalCosts, "applyFeeToChildren");
  const useAdultExtra =
    !isChild || readAdditionalPolicy(additionalCosts, "applyExtraFeeToChildren");

  const operationalMode = String(
    useAdultOperational
      ? pickDefined(additionalCosts?.operationalMode, additionalCosts?.operational_mode, "fixed")
      : pickDefined(
          additionalCosts?.childOperationalMode,
          additionalCosts?.child_operational_mode,
          additionalCosts?.operationalMode,
          additionalCosts?.operational_mode,
          "fixed",
        ),
  ).toLowerCase();
  const feeMode = String(
    useAdultFee
      ? pickDefined(additionalCosts?.feeMode, additionalCosts?.fee_mode, "fixed")
      : pickDefined(
          additionalCosts?.childFeeMode,
          additionalCosts?.child_fee_mode,
          additionalCosts?.feeMode,
          additionalCosts?.fee_mode,
          "fixed",
        ),
  ).toLowerCase();

  const operationalValue = n(
    useAdultOperational
      ? pickDefined(additionalCosts?.operationalCosts, additionalCosts?.operational_costs, 0)
      : pickDefined(
          additionalCosts?.childOperationalCosts,
          additionalCosts?.child_operational_costs,
          additionalCosts?.operationalCosts,
          additionalCosts?.operational_costs,
          0,
        ),
  );
  const feeValue = n(
    useAdultFee
      ? pickDefined(additionalCosts?.fee, additionalCosts?.feeVal, additionalCosts?.fee_val, 0)
      : pickDefined(
          additionalCosts?.childFee,
          additionalCosts?.child_fee,
          additionalCosts?.fee,
          additionalCosts?.feeVal,
          additionalCosts?.fee_val,
          0,
        ),
  );
  const extraValue = n(
    useAdultExtra
      ? pickDefined(additionalCosts?.extraFee, additionalCosts?.extra_fee, 0)
      : pickDefined(
          additionalCosts?.childExtraFee,
          additionalCosts?.child_extra_fee,
          additionalCosts?.extraFee,
          additionalCosts?.extra_fee,
          0,
        ),
  );

  const safeBase = round2(base);
  const operational =
    operationalMode === "percentage"
      ? round2((operationalValue * safeBase) / 100)
      : round2(operationalValue);
  const fee =
    feeMode === "percentage" ? round2((feeValue * safeBase) / 100) : round2(feeValue);
  const extra = round2(extraValue);

  return {
    operational,
    fee,
    extra,
    // Solo Fee forma parte del subtotal comisionable.
    commissionable: round2(fee),
    total: round2(operational + fee + extra),
  };
};

export const buildRoomBasedFinancialSummaryParts = ({
  adultIcon,
  childIcon,
  hotelIcon,
  adultsCount = 1,
  childrenCount = 0,
  subtotalIndividual = 0,
  additionalCosts = {},
  perRoomPricing = [],
  childSummary = null,
  externalAdultTotal = 0,
  externalChildTotal = 0,
  externalConvertedChildTotal = 0,
  adultClassName = "",
  childClassName = "",
  roomClassName = "",
} = {}) => {
  if (!Array.isArray(perRoomPricing) || perRoomPricing.length === 0) return [];

  const aggregatedPerRoomPricing = aggregatePerRoomPricingByStayGroup(perRoomPricing);
  const effectivePerRoomPricing =
    aggregatedPerRoomPricing.length > 0 ? aggregatedPerRoomPricing : perRoomPricing;

  const childInfo = childSummary || resolveChildChargeSummary({ childrenCount });
  // El precio infantil mostrado por habitacion es unificado: incluye tanto
  // la tarifa propia del nino como el tramo en que pago como adulto. Esta es
  // la misma regla usada por AdditionalCosts para su calculo visible.
  const unifiedChildExternal = round2(
    n(externalChildTotal) + n(externalConvertedChildTotal),
  );
  const parts = [];

  effectivePerRoomPricing.forEach((room, index) => {
    const key = room?.key || index;
    const label = room?.label || "Habitacion";
    const adultBeneficiaries = Math.max(
      0,
      n(room?.adultBeneficiaries ?? room?.beneficiaries),
    );

    if (adultBeneficiaries > 0) {
      const hotelPerPerson = n(room?.hotelPerPerson);
      const base = round2(n(subtotalIndividual) + hotelPerPerson);
      const additional = calculateAdditionalCostForAudience(
        base,
        additionalCosts,
        "adult",
      );
      const commissionableValue = round2(
        base + (additional.commissionable ?? additional.fee ?? 0),
      );
      const value = round2(base + additional.total + n(externalAdultTotal));

      if (value > 0) {
        parts.push({
          key: `room-${key}`,
          icon: hotelIcon || adultIcon,
          label: `${label} (${adultBeneficiaries})`,
          value,
          commissionableValue,
          beneficiaries: adultBeneficiaries,
          className: roomClassName || adultClassName,
        });
      }
    }

    const convertedBeneficiaries = Math.max(0, n(room?.convertedChildBeneficiaries));
    if (convertedBeneficiaries > 0) {
      const childFinancials = resolveConvertedChildRoomFinancials(
        room,
        childInfo,
        0,
        0,
      );
      const childBase = round2(childFinancials.basePerChild);
      const childAdditional = calculateAdditionalCostForAudience(
        childBase,
        additionalCosts,
        "child",
      );
      const commissionableValue = round2(
        childBase + (childAdditional.commissionable ?? childAdditional.fee ?? 0),
      );
      const value = round2(
        childBase + childAdditional.total + unifiedChildExternal,
      );

      if (value > 0) {
        const childLabel = /niñ/i.test(String(label))
          ? String(label)
          : `Niños ${label}`;
        parts.push({
          key: `room-converted-${key}`,
          icon: childIcon,
          label: `${childLabel} (${convertedBeneficiaries})`,
          value,
          commissionableValue,
          beneficiaries: convertedBeneficiaries,
          className: childClassName,
        });
      }
    }
  });

  const roomChildBeneficiaries = parts.reduce((sum, part) => {
    const isChild = String(part.key || "").startsWith("room-converted-");
    return isChild ? sum + Math.max(0, n(part.beneficiaries)) : sum;
  }, 0);
  const childrenWithoutRoom = Math.max(0, n(childrenCount) - roomChildBeneficiaries);
  if (childrenWithoutRoom > 0) {
    const childBase = round2(childInfo.explicitPerChild || 0);
    const childAdditional = calculateAdditionalCostForAudience(
      childBase,
      additionalCosts,
      "child",
    );
    const commissionableValue = round2(
      childBase + (childAdditional.commissionable ?? childAdditional.fee ?? 0),
    );
    const value = round2(
      childBase + childAdditional.total + unifiedChildExternal,
    );
    if (childrenWithoutRoom > 0) {
      parts.push({
        key: "child-no-room",
        icon: childIcon,
        label:
          childrenWithoutRoom > 1
            ? `Niños sin hotel (${childrenWithoutRoom})`
            : "Niño sin hotel",
        value,
        commissionableValue,
        beneficiaries: childrenWithoutRoom,
        className: childClassName,
      });
    }
  }

  return parts;
};

export const buildFinancialSummaryParts = ({
  adultIcon,
  childIcon,
  hotelIcon,
  adultsCount = 1,
  adultTotal = 0,
  childTotal = 0,
  convertedChildTotal = 0,
  unifiedChildTotal = null,
  childSummary,
  perRoomPricing = [],
  adultClassName = "",
  childClassName = "",
  convertedChildClassName = "",
  roomClassName = "",
  adultLabelWithConverted = false,
  externalAdultTotal = 0,
  externalChildTotal = 0,
  externalConvertedChildTotal = 0,
} = {}) => {
  const adults = Math.max(1, n(adultsCount) || 1);
  const childInfo = childSummary || resolveChildChargeSummary();
  const childExternalForRoomPricing = round2(
    n(externalChildTotal) + n(externalConvertedChildTotal),
  );
  const childAdditionalPerPerson =
    unifiedChildTotal != null
      ? Math.max(
          0,
          n(unifiedChildTotal) -
            n(childInfo.unifiedPerChild) -
            childExternalForRoomPricing,
        )
      : 0;

  // When room pricing exists, show adult room pills instead of a single
  // generic adult pill. Converted children are added separately below.
  const hasRoomPricing =
    Array.isArray(perRoomPricing) && perRoomPricing.length > 0;
  const aggregatedPerRoomPricing = hasRoomPricing
    ? aggregatePerRoomPricingByStayGroup(perRoomPricing)
    : [];
  const effectivePerRoomPricing =
    aggregatedPerRoomPricing.length > 0
      ? aggregatedPerRoomPricing
      : perRoomPricing;

  const parts = [];

  if (hasRoomPricing) {
    // Una fila por trayectoria financiera. Una habitación puede cambiar entre
    // grupos de días, pero los servicios, el fee y el externo solo pertenecen
    // una vez a cada pasajero.
    effectivePerRoomPricing.forEach((rp) => {
      const adultBeneficiaries = Math.max(
        0,
        n(rp.adultBeneficiaries ?? rp.beneficiaries),
      );
      if (rp.totalPerPerson > 0 && adultBeneficiaries > 0) {
        const roomBaseTotal =
          rp.base != null || rp.adicionales != null
            ? n(rp.base) + n(rp.adicionales)
            : n(rp.totalPerPerson);
        parts.push({
          key: `room-${rp.key}`,
          icon: hotelIcon || adultIcon,
          label: `${rp.label} (${adultBeneficiaries})`,
          value: Math.ceil(roomBaseTotal + n(externalAdultTotal)),
          commissionableValue: roomBaseTotal,
          className: roomClassName || adultClassName,
        });
      }

      const convertedBeneficiaries = Math.max(
        0,
        n(rp.convertedChildBeneficiaries),
      );
      const convertedRoomValue =
        n(rp.convertedChildDisplayTotalPerPerson) ||
        n(rp.convertedChildTotalPerPerson) ||
        n(rp.convertedChildHotelPerPerson) ||
        n(rp.hotelPerPerson);
      if (convertedBeneficiaries > 0 && convertedRoomValue > 0) {
        const childRoomFinancials = resolveConvertedChildRoomFinancials(
          rp,
          childInfo,
          childAdditionalPerPerson,
          childExternalForRoomPricing,
        );
        parts.push({
          key: `room-converted-${rp.key}`,
          icon: childIcon,
          label: `Niños ${rp.label} (${convertedBeneficiaries})`,
          value: Math.ceil(childRoomFinancials.totalPerChild),
          commissionableValue: Math.max(
            0,
            round2(n(childRoomFinancials.totalPerChild) - childExternalForRoomPricing),
          ),
          className: childClassName || convertedChildClassName,
        });
      }
    });

    const fallbackChildValue =
      unifiedChildTotal != null
        ? n(unifiedChildTotal)
        : n(childTotal) || Math.ceil(n(childInfo.explicitPerChild));
    if (
      !parts.some((part) => String(part.key || "").startsWith("room-converted-")) &&
      childInfo.explicitCount > 0 &&
      fallbackChildValue > 0
    ) {
      parts.push({
        key: "child-total",
        icon: childIcon,
        label: `Niños (${childInfo.explicitCount})`,
        value: fallbackChildValue,
        commissionableValue: Math.max(0, round2(fallbackChildValue - childExternalForRoomPricing)),
        className: childClassName,
      });
    }
  } else {
    const adultLabel =
      childInfo.convertedCount > 0 && adultLabelWithConverted
        ? `Por adulto (${adults})`
        : adults > 1
          ? `Por adulto (${adults})`
          : "Por adulto";

    if (n(adultTotal) > 0) {
      parts.push({
        key: "adult-total",
        icon: adultIcon,
        label: adultLabel,
        value: adultTotal,
        commissionableValue: Math.max(0, round2(n(adultTotal) - n(externalAdultTotal))),
        className: adultClassName,
      });
    }
  }

  const genericChildValue =
    unifiedChildTotal != null
      ? n(unifiedChildTotal)
      : n(childInfo.unifiedPerChild) ||
        round2(n(childTotal) + n(convertedChildTotal));

  if (!hasRoomPricing && childInfo.unifiedCount > 0 && genericChildValue > 0) {
    parts.push({
      key: "child-total",
      icon: childIcon,
      label: `Niños (${childInfo.unifiedCount})`,
      value: genericChildValue,
      commissionableValue: Math.max(0, round2(genericChildValue - childExternalForRoomPricing)),
      className: childClassName || convertedChildClassName,
    });
  }

  return parts;
};

export const buildChildCostRows = (childSummary) => {
  const info = childSummary || resolveChildChargeSummary();
  return info.unifiedPerChild > 0
    ? [
        {
          key: "child",
          label: "Costos operativos / niño",
          count: info.unifiedCount,
          value: info.unifiedPerChild,
        },
      ]
    : [];
};
