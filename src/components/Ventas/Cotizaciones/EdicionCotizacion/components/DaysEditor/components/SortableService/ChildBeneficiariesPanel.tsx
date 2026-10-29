import React from 'react';
import { FaChild } from 'react-icons/fa';
import { getServiceBeneficiarySnapshot } from '../../../../utils/passengerPricingState';
import { passengerIdMatchesSet } from '../../../../utils/igvUtils';
import { childServiceCapacity } from '../../../../utils/childServiceBeneficiaries';

export default function ChildBeneficiariesPanel({ service, rows = [], onChange }) {
  const snapshot = getServiceBeneficiarySnapshot(service);
  const capacity = childServiceCapacity(service);
  return <div className="sr__children sr__children--selection" onClick={event => event.stopPropagation()}>
    <div className="sr__adults-heading">Niños beneficiarios del servicio</div>
    <div className="sr__adults-chips" role="group" aria-label="Seleccionar niños del servicio">
      {rows.map(row => {
        const included = snapshot.allChildIds.some(id => passengerIdMatchesSet(id, row.aliases));
        const full = !included && capacity && snapshot.selectedIds.length >= capacity;
        return <button key={row.id} type="button" className={`sr__adults-chip${included ? ' sr__adults-chip--selected' : ''}`}
          aria-pressed={included} aria-label={`${row.label}: ${included ? 'beneficiario' : 'no incluido'}`} disabled={!!full}
          title={full ? 'Quita un beneficiario para liberar una plaza' : row.label} onClick={() => onChange(row, !included)}>
          <FaChild aria-hidden="true" /><span className="sr__adults-chip-name">{row.label}</span><small>{included ? 'Incluido' : 'No incluido'}</small>
        </button>;
      })}
    </div>
    <small>Selecciona quién recibe este servicio. Un niño incluido de nuevo empieza gratis; puedes configurar su tarifa abajo.</small>
  </div>;
}
