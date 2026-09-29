import { isOperationallyAssignedService } from "./assignmentProtection";

const n = (value) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeToken = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const passengerType = (passenger = {}) => {
  const type = normalizeToken(
    passenger?.tipo_pasajero ||
      passenger?.tipoPasajero ||
      passenger?.passenger_type ||
      passenger?.type,
  );
  const key = normalizeToken(
    passenger?.passenger_key || passenger?.passengerKey,
  );

  if (
    type === "child" ||
    type.includes("nino") ||
    type.includes("niño") ||
    key.startsWith("child")
  ) {
    return "child";
  }

  if (type === "adult" || key.startsWith("adult")) return "adult";
  return null;
};

const addPassengerTokens = (target, passenger = {}) => {
  [
    passenger?.id,
    passenger?.id_pasajero,
    passenger?.idPasajero,
    passenger?.passenger_key,
    passenger?.passengerKey,
    passenger?.rowId,
    passenger?.row_id,
  ].forEach((value) => {
    const token = normalizeToken(value);
    if (token) target.add(token);
  });
};

const buildRoster = (peopleDetails = null) => {
  const hasAdultsArray = Array.isArray(peopleDetails?.adults);
  const hasChildrenArray = Array.isArray(peopleDetails?.children);
  const hasDetailsArray = Array.isArray(peopleDetails?.details);
  const authoritative = hasAdultsArray || hasChildrenArray || hasDetailsArray;

  const adults = hasAdultsArray ? peopleDetails.adults : [];
  const children = hasChildrenArray ? peopleDetails.children : [];
  const details = hasDetailsArray ? peopleDetails.details : [];
  const adultTokens = new Set();
  const childTokens = new Set();

  adults.forEach((passenger) => addPassengerTokens(adultTokens, passenger));
  children.forEach((passenger) => addPassengerTokens(childTokens, passenger));

  details.forEach((passenger) => {
    const type = passengerType(passenger);
    if (type === "child") addPassengerTokens(childTokens, passenger);
    else if (type === "adult") addPassengerTokens(adultTokens, passenger);
  });

  const adultCount = hasAdultsArray
    ? adults.length
    : details.filter((passenger) => passengerType(passenger) !== "child").length;
  const childCount = hasChildrenArray
    ? children.length
    : details.filter((passenger) => passengerType(passenger) === "child").length;

  return {
    authoritative,
    adultTokens,
    childTokens,
    adultCount,
    childCount,
  };
};

const getBeneficiaryIdentityTokens = (rawId) => {
  const raw = normalizeToken(rawId);
  if (!raw) return [];

  const tokens = new Set([raw]);
  const parts = raw.split(":").filter(Boolean);
  if (parts.length >= 3) {
    tokens.add(parts.slice(2).join(":"));
    tokens.add(parts[parts.length - 1]);
  }
  return [...tokens].filter(Boolean);
};

const matchesRoster = (rawId, rosterTokens) =>
  getBeneficiaryIdentityTokens(rawId).some((token) => rosterTokens.has(token));

export const hasAuthoritativePassengerRoster = (peopleDetails = null) =>
  buildRoster(peopleDetails).authoritative;

export const getAuthoritativePassengerCounts = (peopleDetails = null) => {
  const roster = buildRoster(peopleDetails);
  return {
    authoritative: roster.authoritative,
    adults: roster.adultCount,
    children: roster.childCount,
  };
};

/**
 * Reconciles the *commercial child cohort* of a persisted service snapshot
 * against the current quotation passenger roster without mutating the service.
 *
 * Operationally assigned services intentionally keep their historical snapshot
 * (assigned_* / original beneficiaries).  When the quotation roster changes,
 * a former child charge must therefore disappear from the CURRENT child totals,
 * but it must never be silently moved into the adult quote.  Doing so would
 * change the commercial price of an already assigned service.
 */
export const reconcilePricingSnapshotToPassengerRoster = (
  pricing = {},
  peopleDetails = null,
) => {
  const roster = buildRoster(peopleDetails);
  const rawChildren = Object.entries(pricing?.children || {});

  if (!roster.authoritative) {
    return {
      amountPerAdult: n(pricing?.amountPerAdult),
      amountPerChild: n(pricing?.amountPerChild),
      droppedStaleChildTotal: 0,
      explicitChildEntries: rawChildren.filter(([, data]) => !data?.asAdult),
      convertedChildEntries: rawChildren.filter(([, data]) => data?.asAdult),
      childEntries: rawChildren,
      currentAdultCount: 0,
      currentChildCount: 0,
      authoritative: false,
    };
  }

  const retainedChildren = [];
  const unmatchedChildren = [];
  let droppedStaleChildTotal = 0;

  rawChildren.forEach(([childId, childData]) => {
    const stillChild = matchesRoster(childId, roster.childTokens);
    const nowAdult = matchesRoster(childId, roster.adultTokens);

    if (stillChild) {
      retainedChildren.push([childId, childData]);
      return;
    }

    if (nowAdult || roster.childCount === 0) {
      droppedStaleChildTotal += n(childData?.amount);
      return;
    }

    // Legacy rows can lack a DB identity and only expose a positional child id.
    // Keep at most the number of current child slots that are still unaccounted
    // for; never let a stale snapshot grow the live quotation cohort.
    unmatchedChildren.push([childId, childData]);
  });

  const remainingChildSlots = Math.max(
    0,
    roster.childCount - retainedChildren.length,
  );
  unmatchedChildren.forEach((entry, index) => {
    if (index < remainingChildSlots) retainedChildren.push(entry);
    else droppedStaleChildTotal += n(entry?.[1]?.amount);
  });

  const rawChildrenTotal = rawChildren.reduce(
    (sum, [, childData]) => sum + n(childData?.amount),
    0,
  );
  const fallbackChildResidual = Math.max(
    0,
    n(pricing?.amountPerChild) - rawChildrenTotal,
  );
  const retainedFallback = roster.childCount > 0 ? fallbackChildResidual : 0;
  if (roster.childCount === 0) {
    droppedStaleChildTotal += fallbackChildResidual;
  }

  const retainedChildrenTotal = retainedChildren.reduce(
    (sum, [, childData]) => sum + n(childData?.amount),
    0,
  );
  const explicitChildEntries = retainedChildren.filter(
    ([, data]) => !data?.asAdult,
  );
  const convertedChildEntries = retainedChildren.filter(
    ([, data]) => data?.asAdult,
  );

  return {
    // Adult pricing stays exactly as represented by the service snapshot.  A
    // passenger type change only affects mutable services; assigned services
    // are preserved by assignmentProtection.
    amountPerAdult: n(pricing?.amountPerAdult),
    amountPerChild: retainedChildrenTotal + retainedFallback,
    droppedStaleChildTotal,
    explicitChildEntries,
    convertedChildEntries,
    childEntries: retainedChildren,
    currentAdultCount: roster.adultCount,
    currentChildCount: roster.childCount,
    authoritative: true,
  };
};


const getServiceType = (service = {}) =>
  normalizeToken(
    service?.parentService?.typeService ||
      service?.parentService?.type_service ||
      service?.typeService ||
      service?.type_service,
  );

const getTicketTargetGroup = (service = {}) =>
  normalizeToken(
    service?.ticketPassengerTargetGroup ||
      service?.passengerSelection?.ticketPassengerTargetGroup ||
      service?.passenger_selection?.ticketPassengerTargetGroup ||
      service?.childService?.ticketPassengerTargetGroup ||
      service?.child_service?.ticketPassengerTargetGroup,
  );

const getSelectedPassengerIds = (service = {}) => {
  const candidates = [
    service?.passengerSelection?.selectedIds,
    service?.passenger_selection?.selectedIds,
    service?.assignedPassengerIds,
    service?.assigned_passenger_ids,
  ];
  return candidates.find(Array.isArray) || [];
};

/**
 * Removes only mutable ticket cohort rows that no longer have beneficiaries.
 * This is what makes a 2A+2N -> 4A/0N post-sale edit actually remove the old
 * student/child ticket row on the next save. Operationally assigned rows are
 * never removed, even when their historical beneficiary cohort no longer
 * exists in the commercial quotation.
 */
export const pruneEmptyMutableTicketCohorts = (services = []) =>
  (Array.isArray(services) ? services : []).filter((service) => {
    if (getServiceType(service) !== "tickets") return true;
    if (isOperationallyAssignedService(service)) return true;

    const targetGroup = getTicketTargetGroup(service);
    if (targetGroup !== "adult" && targetGroup !== "child") return true;

    return getSelectedPassengerIds(service).length > 0;
  });
