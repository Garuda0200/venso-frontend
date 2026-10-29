import React from "react";
import { FaUser } from "react-icons/fa";
import { isAdultServiceBeneficiary } from "../../../../utils/adultServiceBeneficiaries";
import { childServiceCapacity } from "../../../../utils/childServiceBeneficiaries";
import { getServiceBeneficiarySnapshot } from "../../../../utils/passengerPricingState";

const AdultsPanel = ({ service, rows = [], onChange }) => (
  <div className="sr__adults" onClick={(event) => event.stopPropagation()}>
    <div className="sr__adults-heading">Adultos beneficiarios del servicio</div>
    {rows.length === 0 ? (
      <span className="sr__adults-empty">No hay adultos en el padrón</span>
    ) : (
      <div className="sr__adults-chips" role="group" aria-label="Seleccionar adultos beneficiarios">
        {rows.map((row, index) => {
          const included = isAdultServiceBeneficiary(service, row);
          const label = row.label || `Adulto ${index + 1}`;
          const capacity = childServiceCapacity(service);
          const full = !included && capacity && getServiceBeneficiarySnapshot(service).selectedIds.length >= capacity;

          return (
            <button
              key={row.id}
              type="button"
              className={`sr__adults-chip${included ? " sr__adults-chip--selected" : ""}`}
              aria-pressed={included}
              disabled={Boolean(full)}
              title={full ? "Quita un beneficiario para liberar una plaza" : label}
              aria-label={`${label}: ${included ? "beneficiario" : "no incluido"}`}
              onClick={() => onChange?.(row, !included)}
            >
              <FaUser aria-hidden="true" />
              <span className="sr__adults-chip-name" title={label}>{label}</span>
              <small aria-hidden="true">{included ? "Incluido" : "No incluido"}</small>
            </button>
          );
        })}
      </div>
    )}
  </div>
);

export default AdultsPanel;
