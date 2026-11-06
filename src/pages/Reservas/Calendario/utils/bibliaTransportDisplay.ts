import type { BibliaActivity } from "./bibliaActivityMapper";

/** Shortens explicit catalogue selections without changing their stored value. */
export const compactBibliaTransportText = (
  value: unknown,
  activity?: Pick<BibliaActivity, "transport" | "transportDisplayName">,
) => {
  const text = String(value ?? "").trim();
  if (!text || text === "—") return "—";
  if (text === activity?.transport?.trim() && activity.transportDisplayName) return activity.transportDisplayName;

  const selections = text.split(" / ");
  const segments = selections.map(selection => selection.split(" · ").map(part => part.trim()));
  if (segments.every(parts => parts.length === 3 && parts.every(Boolean))) {
    return [...new Set(segments.map(parts => parts[0]))].join(" / ");
  }
  const parts = text.split(" · ").map(part => part.trim());
  return parts.length === 3 && parts.every(Boolean) ? parts[0] : text;
};
