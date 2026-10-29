import React, { useId } from "react";
import type { BibliaServiceLinkMode as LinkMode } from "../utils/bibliaServiceLinkModes";
import "./BibliaServiceLinkMode.scss";

export default function BibliaServiceLinkMode({ value, label, disabled = false, onChange }: {
  value: LinkMode; label: string; disabled?: boolean; onChange: (mode: LinkMode) => void;
}) {
  const group = useId();
  return <fieldset className="biblia-service-link-mode" disabled={disabled}>
    <legend>{label}: uso del hotel</legend>
    <div className="biblia-service-link-mode__options">
      {([['service', 'Servicio'], ['reference', 'Sólo referencia']] as const).map(([mode, text]) =>
        <label key={mode} className={value === mode ? "is-selected" : ""}>
          <input type="radio" name={group} value={mode} checked={value === mode} onChange={() => onChange(mode)} />
          <span>{text}</span>
        </label>)}
    </div>
    <small>{value === "reference" ? "Se conserva en la Biblia sin generar un servicio." : "Se incorpora al día de la cotización al vincular o actualizar."}</small>
  </fieldset>;
}
