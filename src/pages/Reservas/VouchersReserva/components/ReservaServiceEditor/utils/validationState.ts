export const applyQuotedServiceValidation = (
  current: Record<string, any> = {},
  enriched: Record<string, any> = {},
  validation: Record<string, any> = {},
) => {
  const assignedService =
    enriched.assignedService ||
    enriched.assigned_service ||
    current.assignedService ||
    null;

  return {
    ...current,
    ...enriched,
    isAssigned: true,
    is_assigned: true,
    assignedService,
    assignedParentService:
      enriched.assignedParentService ||
      enriched.assigned_parent_service ||
      assignedService?.parentService ||
      current.parentService ||
      null,
    assignedChildService:
      enriched.assignedChildService ||
      enriched.assigned_child_service ||
      assignedService?.childService ||
      current.childService ||
      null,
    assignedTariff:
      enriched.assignedTariff ||
      enriched.assigned_tariff ||
      assignedService?.tariff ||
      null,
    validationSource: validation.source || "quoted_fallback",
    validationTariffId: validation.tariff_id ?? null,
    validationTariffYear: validation.tariff_year ?? null,
    needsUnassign: false,
    _needsUnassign: false,
  };
};
