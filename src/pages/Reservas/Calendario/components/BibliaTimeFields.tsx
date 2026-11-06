import { useEffect, useId, useRef, useState } from "react";
import { formatBibliaTimeRange, parseBibliaTimeRange, type BibliaTimeRange } from "../utils/bibliaTimeRange";

export default function BibliaTimeFields({ value, onChange, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [times, setTimes] = useState(() => parseBibliaTimeRange(value));
  const lastValue = useRef(value);
  const id = useId();
  useEffect(() => {
    if (value !== lastValue.current) setTimes(parseBibliaTimeRange(value));
    lastValue.current = value;
  }, [value]);

  const change = (field: keyof BibliaTimeRange, time: string) => {
    const next = { ...times, [field]: time };
    const nextValue = formatBibliaTimeRange(next.start, next.end);
    setTimes(next);
    lastValue.current = nextValue;
    onChange(nextValue);
  };
  const original = value.trim();
  const showOriginal = !["", "—", "Sin hora", formatBibliaTimeRange(times.start, times.end)].includes(original);
  return <div className="biblia-time-fields">
    <div className="biblia-time-fields__grid">
      <label htmlFor={`${id}-start`}>Hora de inicio
        <input id={`${id}-start`} type="time" step="60" value={times.start} disabled={disabled}
          onChange={event => change("start", event.target.value)} />
      </label>
      <label htmlFor={`${id}-end`}>Hora de fin
        <input id={`${id}-end`} type="time" step="60" value={times.end} disabled={disabled}
          onChange={event => change("end", event.target.value)} />
      </label>
    </div>
    {showOriginal && <p className="biblia-time-fields__original"><strong>Horario registrado</strong><span>{value}</span></p>}
  </div>;
}
