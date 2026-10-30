/** Preserve full catalogue names in storage; abbreviate only known labels. */
const key = (value: string) => value.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase().replace(/\s+/g, " ");
const canonical = (value: string) => {
  const name = key(value);
  if (["QORI", "QORY", "QORICANCHA", "QORIKANCHA", "KORICANCHA"].includes(name)) return "QORICANCHA";
  if (["CATE", "CATEDRAL"].includes(name)) return "CATEDRAL";
  return value.trim();
};
export function splitBibliaTickets(value: unknown): string[] {
  const result = new Map<string, string>();
  for (const raw of String(value ?? "").split(/\s*\+\s*(?![^\[]*\])|[;\n]/)) {
    const label = canonical(raw);
    if (label && label !== "—" && !result.has(key(label))) result.set(key(label), label);
  }
  return [...result.values()];
}
export const joinBibliaTickets = (values: string[]) => splitBibliaTickets(values.join(" + ")).join(" + ");
export function compactBibliaTickets(value: unknown): string {
  return splitBibliaTickets(value).map(label => ({ QORICANCHA: "QORI", CATEDRAL: "CATE" }[key(label)] || label)).join(" + ") || "—";
}
export const addBibliaTicket = (current: string, next: string) => joinBibliaTickets([...splitBibliaTickets(current), ...splitBibliaTickets(next)]);
