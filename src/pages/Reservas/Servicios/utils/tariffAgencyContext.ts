/** A season never substitutes an agency: only intersecting agency scopes collide. */
export function tariffAgencyIds(value: unknown): number[] {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(value) ? [...new Set(value.map(Number).filter(id=>Number.isInteger(id)&&id>0))] : [];
}
export function tariffSharesAgencyContext(tariff: any, agencyIds: unknown, year: number) {
  const selected = new Set(tariffAgencyIds(agencyIds));
  return Number(tariff.anio || new Date().getFullYear()) === Number(year)
    && tariffAgencyIds(tariff.agency_ids).some(id=>selected.has(id));
}
