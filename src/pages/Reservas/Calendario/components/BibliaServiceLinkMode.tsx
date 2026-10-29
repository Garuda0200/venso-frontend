import React, { useId } from "react";
import type { BibliaServiceLinkMode as LinkMode } from "../utils/bibliaServiceLinkModes";
import "./BibliaServiceLinkMode.scss";

export default function BibliaServiceLinkMode({ value, label, disabled = false, onChange }: {
  value: LinkMode; label: string; disabled?: boolean; onChange: (mode: LinkMode) => void;
}) {
  const group = useId();
  return <fieldset className="biblia-service-link-mode" aria-label={`${label}: uso del hotel`} disabled={disabled}>
    <div className="biblia-service-link-mode__options">
      {([['service', 'Servicio'], ['reference', 'Solo texto']] as const).map(([mode, text]) =>
        <label key={mode} className={value === mode ? "is-selected" : ""}
          title={mode === "service" ? "Vincular a la cotización" : "Mostrar solo en la Biblia"}>
          <input type="radio" name={group} value={mode} checked={value === mode} onChange={() => onChange(mode)} />
          <span>{text}</span>
        </label>)}
    </div>
  </fieldset>;
}
