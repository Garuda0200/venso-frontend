import { useEffect, useMemo, useRef, useState } from "react";
import { FaBuilding, FaCheck, FaChevronDown, FaGlobeAmericas, FaTimes } from "react-icons/fa";
import { Agency, getAgencies } from "../../../services/agencyService";
import "./TariffAgencyCombobox.scss";

type Props = {
  value: number | number[];
  onChange: (value: number | number[]) => void;
  multiple?: boolean;
  allowAll?: boolean;
  label?: string;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
};

const normalizeIds = (value: number | number[]) =>
  (Array.isArray(value) ? value : [value])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

const TariffAgencyCombobox = ({
  value,
  onChange,
  multiple = false,
  allowAll = false,
  label = "Agencias de la tarifa",
  compact = false,
  disabled = false,
  className = "",
}: Props) => {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedIds = useMemo(() => normalizeIds(value), [value]);
  const allSelected = !multiple && Number(value) === 0;

  useEffect(() => {
    let mounted = true;
    getAgencies(false)
      .then((rows) => {
        if (!mounted) return;
        setAgencies((rows || []).filter((agency) => agency.active));
      })
      .catch(() => mounted && setAgencies([]));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const toggleAgency = (agencyId: number) => {
    if (!multiple) {
      onChange(agencyId);
      setOpen(false);
      return;
    }
    const next = selectedIds.includes(agencyId)
      ? selectedIds.filter((id) => id !== agencyId)
      : [...selectedIds, agencyId];
    onChange(next);
  };

  const selectedAgencies = agencies.filter((agency) => selectedIds.includes(agency.id));
  const summary = allSelected
    ? "Todas las agencias"
    : selectedAgencies.length === 0
      ? "Seleccionar agencia"
      : selectedAgencies.length === 1
        ? selectedAgencies[0].name
        : `${selectedAgencies.length} agencias`;

  return (
    <div
      ref={rootRef}
      className={`tariff-agency-combobox ${compact ? "compact" : ""} ${open ? "open" : ""} ${className}`}
    >
      {!compact && <span className="tac-label">{label}</span>}
      <button
        type="button"
        className="tac-trigger"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {allSelected ? <FaGlobeAmericas /> : <FaBuilding />}
        <span>{summary}</span>
        <FaChevronDown className="tac-chevron" />
      </button>

      {multiple && selectedAgencies.length > 0 && !compact && (
        <div className="tac-chips">
          {selectedAgencies.map((agency) => (
            <span key={agency.id}>
              {agency.name}
              <button
                type="button"
                onClick={() => toggleAgency(agency.id)}
                aria-label={`Quitar ${agency.name}`}
              >
                <FaTimes />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="tac-menu">
          {allowAll && !multiple && (
            <button
              type="button"
              className={allSelected ? "selected" : ""}
              onClick={() => {
                onChange(0);
                setOpen(false);
              }}
            >
              <FaGlobeAmericas />
              <span>
                <strong>Todas las agencias</strong>
                <small>Ver todas las tarifas disponibles</small>
              </span>
              {allSelected && <FaCheck />}
            </button>
          )}

          {agencies.map((agency) => {
            const selected = selectedIds.includes(agency.id);
            return (
              <button
                type="button"
                key={agency.id}
                className={selected ? "selected" : ""}
                onClick={() => toggleAgency(agency.id)}
              >
                <FaBuilding />
                <span>
                  <strong>{agency.name}</strong>
                  <small>{agency.is_primary ? "Agencia principal" : agency.business_type}</small>
                </span>
                {selected && <FaCheck />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TariffAgencyCombobox;
