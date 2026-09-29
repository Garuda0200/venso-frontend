const firstDefined = (...values: any[]) =>
  values.find((value) => value !== undefined && value !== null && value !== "");

const firstNonEmptyObject = (...values: any[]) =>
  values.find(
    (value) =>
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0,
  );

const normalizeSearchText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const collectPrimitiveValues = (value: any, acc: string[], depth = 0) => {
  if (value == null || depth > 5) return;
  if (["string", "number", "boolean"].includes(typeof value)) {
    acc.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.slice(0, 40).forEach((item) => collectPrimitiveValues(item, acc, depth + 1));
    return;
  }
  if (typeof value === "object") {
    Object.values(value)
      .slice(0, 80)
      .forEach((item) => collectPrimitiveValues(item, acc, depth + 1));
  }
};

/** Conserva el proveedor y tarifa operativos cuando la solicitud nació de un servicio asignado. */
export const resolvePendingPaymentAssignment = (request: any = {}) => {
  const raw = request?.service_data && typeof request.service_data === "object"
    ? request.service_data
    : {};
  const assigned = raw.assignedService || raw.assigned_service || {};
  const assignedParentService = firstNonEmptyObject(
    assigned.parentService,
    assigned.parent_service,
    raw.assignedParentService,
    raw.assigned_parent_service,
  );
  const assignedChildService = firstNonEmptyObject(
    assigned.childService,
    assigned.child_service,
    raw.assignedChildService,
    raw.assigned_child_service,
  );
  const hasAssignedSnapshot = Boolean(
    Object.keys(assigned).length ||
      assignedParentService ||
      assignedChildService ||
      raw.isAssigned || raw.is_assigned ||
      raw.assigned_parent_id != null || raw.assigned_child_id != null ||
      request.assigned_parent_id != null || request.assigned_child_id != null,
  );
  const quoted = raw.quotedService || raw.quoted_service || raw;
  const service = hasAssignedSnapshot
    ? {
        ...raw,
        ...assigned,
        typeService: firstDefined(assigned.typeService, assigned.type_service, raw.typeService, raw.type_service, raw.tipo_servicio),
        parentService: assignedParentService || null,
        childService: assignedChildService || null,
        tariff: firstDefined(assigned.tariff, assigned.tarifa, raw.assignedTariff, raw.assigned_tariff),
      }
    : {
        ...raw,
        ...quoted,
        parentService: firstDefined(quoted.parentService, quoted.parent_service, raw.parentService, raw.parent_service),
        childService: firstDefined(quoted.childService, quoted.child_service, raw.childService, raw.child_service),
      };
  const assignedParentId = firstDefined(
    request.assigned_parent_id, raw.assigned_parent_id, raw.assignedParentId,
    assigned.assigned_parent_id, assigned.assignedParentId, assigned.parent_id, assigned.parentId,
    service?.assigned_parent_id, service?.assignedParentId, service?.parent_id, service?.parentId,
  );
  const assignedChildId = firstDefined(
    request.assigned_child_id, raw.assigned_child_id, raw.assignedChildId,
    assigned.assigned_child_id, assigned.assignedChildId, assigned.child_id, assigned.childId,
    service?.assigned_child_id, service?.assignedChildId, service?.child_id, service?.childId,
  );
  return {
    service,
    assignedParentId: assignedParentId ?? null,
    assignedChildId: assignedChildId ?? null,
    isAssigned: assignedParentId != null || assignedChildId != null || Boolean(
      raw.isAssigned || raw.is_assigned || raw.assignedService || raw.assigned_service,
    ),
  };
};

export const buildPendingPaymentSearchText = (request: any = {}) => {
  const { service, assignedParentId, assignedChildId } = resolvePendingPaymentAssignment(request);
  const values = [
    request.voucher_code, request.voucher_reserva_id, request.itinerario_servicio_id,
    request.observaciones, request.requested_by, request.platform, request.business_type,
    request.currency, assignedParentId, assignedChildId,
  ];
  collectPrimitiveValues(service, values);
  return normalizeSearchText(values.filter(Boolean).join(" "));
};

export const matchesPendingPaymentSearch = (request: any, query: string) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const haystack = buildPendingPaymentSearchText(request);
  return normalizedQuery.split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
};

export const resolvePendingPaymentCurrency = (request: any = {}) => {
  const raw = request?.service_data || {};
  return String(firstDefined(
    request.currency, raw.assigned_moneda, raw.assignedMoneda,
    raw.assignedService?.moneda, raw.assigned_service?.moneda, raw.moneda, "USD",
  )).toUpperCase();
};

export const formatPendingPaymentAmount = (request: any = {}) => {
  const currency = resolvePendingPaymentCurrency(request);
  const parsed = Number.parseFloat(request.amount || 0);
  const amount = Number.isFinite(parsed) ? parsed : 0;
  const symbol = currency === "PEN" || currency === "SOLES" ? "S/" : currency === "USD" || currency === "DOLARES" ? "$" : currency;
  return `${symbol} ${amount.toFixed(2)}`;
};
