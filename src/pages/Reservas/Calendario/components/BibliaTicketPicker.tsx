import React, { useEffect, useRef, useState } from "react";
import SmartComboBox from "../../../../components/common/SmartComboBox/SmartComboBox";
import { addBibliaTicket, compactBibliaTickets, joinBibliaTickets, splitBibliaTickets } from "../utils/bibliaTicketSelection";
export default function BibliaTicketPicker({ value, onChange, options, loading = false, disabled = false, portalDropdown = true }: {
  value: string; onChange: (value: string) => void; options: string[]; loading?: boolean; disabled?: boolean; portalDropdown?: boolean;
}) {
  const [query, setQuery] = useState("");
  const opened = useRef(false);
  useEffect(() => { opened.current = true; }, []);
  const latest = useRef(value); latest.current = value;
  const selected = splitBibliaTickets(value);
  const available = splitBibliaTickets(options.join(" + ")).filter(label => !selected.some(row => row.toUpperCase() === label.toUpperCase()));
  const add = (label: string) => { const next = addBibliaTicket(latest.current, label); latest.current = next; onChange(next); setQuery(""); return ""; };
  return <div className="biblia-ticket-picker">
    <div className="biblia-ticket-picker__selected" aria-label="Entradas seleccionadas">
      {selected.map(label => <button type="button" key={label} title={label} disabled={disabled}
        aria-label={`Quitar ${label}`} onClick={() => onChange(joinBibliaTickets(selected.filter(row => row !== label)))}>
        {compactBibliaTickets(label)} <span aria-hidden="true">×</span></button>)}
    </div>
    {disabled ? <input disabled value={value} aria-label="Entradas guardándose" /> : <SmartComboBox
      value={query} onChange={setQuery} onCommit={add} options={available} loading={loading}
      placeholder="Agregar entrada..." autoFocus={!opened.current} portalDropdown={portalDropdown} maxVisibleOptions={80} />}
  </div>;
}
