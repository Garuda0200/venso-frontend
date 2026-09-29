export const buildProtectedQueryItems = (records, entityType, getId) =>
  (records || [])
    .map((record) => {
      const id = Number(getId(record));
      if (!Number.isFinite(id) || id <= 0) return null;
      return { entity_type: entityType, id };
    })
    .filter(Boolean);

export const buildProtectedUsageMap = (usageResults = []) =>
  new Map(
    usageResults.map((item) => [
      `${String(item.entity_type).toLowerCase()}:${Number(item.id)}`,
      item,
    ]),
  );

export const annotateProtectedRecords = (
  records,
  usageResults,
  entityType,
  getId,
) => {
  const usageMap = buildProtectedUsageMap(usageResults);
  return (records || []).map((record) => {
    const id = Number(getId(record));
    const usage =
      usageMap.get(`${entityType.toLowerCase()}:${id}`) ||
      usageMap.get(`${entityType.toLowerCase()}s:${id}`);
    return {
      ...record,
      protected_usage: usage || null,
      is_protected_by_voucher: Boolean(usage?.blocked),
    };
  });
};

export const getProtectedDeleteTitle = (record) => {
  if (!record?.is_protected_by_voucher) return "Eliminar";
  const count = Number(record.protected_usage?.usage_count || 0);
  return count > 0
    ? `No se puede eliminar: usado en ${count} servicio(s) de vouchers`
    : "No se puede eliminar: usado en vouchers";
};
