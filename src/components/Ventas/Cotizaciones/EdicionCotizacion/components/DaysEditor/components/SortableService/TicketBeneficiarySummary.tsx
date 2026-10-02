import React from "react";
import { FaChild, FaUser } from "react-icons/fa";

type TicketBeneficiarySummaryProps = {
  adultIds: string[];
  studentChildIds: string[];
  convertedChildIds: string[];
  isStudentRow: boolean;
  childControl?: React.ReactNode;
};

// Only summarize the existing selection. Nominal identities and tariff editing
// remain in the passenger/child controls, not repeated in the collapsed row.
const TicketBeneficiarySummary = ({
  adultIds,
  studentChildIds,
  convertedChildIds,
  isStudentRow,
  childControl,
}: TicketBeneficiarySummaryProps) => {
  const adultCount = new Set(adultIds).size;
  const studentCount = new Set(studentChildIds).size;
  const convertedCount = new Set(convertedChildIds).size;
  const hasAdultTariff = adultCount > 0 || convertedCount > 0;
  const hasPrimaryBeneficiaries = isStudentRow ? studentCount > 0 : hasAdultTariff;

  return (
    <div className="sr-ticket__beneficiaries" role="group" aria-label="Cantidad de beneficiarios de la entrada">
      {isStudentRow && studentCount > 0 && (
        <span className="sr__pax-tag sr__pax-tag--child" aria-label={`Niños beneficiarios: ${studentCount}`}>
          <FaChild aria-hidden="true" />
          <span>{studentCount}</span>
          <span className="sr__pax-label">{studentCount === 1 ? "niño" : "niños"}</span>
        </span>
      )}
      {!isStudentRow && hasAdultTariff && (
        <span
          className="sr__pax-tag sr__pax-tag--adult"
          aria-label={`Adultos beneficiarios: ${adultCount}${convertedCount > 0 ? `. Niños con tarifa adulto: ${convertedCount}` : ""}`}
          title={convertedCount > 0 ? `${convertedCount} niño${convertedCount === 1 ? "" : "s"} con tarifa adulto` : undefined}
        >
          <FaUser aria-hidden="true" />
          <span>{adultCount}</span>
          <span className="sr__pax-label">{adultCount === 1 ? "adulto" : "adultos"}</span>
          {convertedCount > 0 && <span className="sr__pax-converted">+{convertedCount}n</span>}
        </span>
      )}
      {!isStudentRow && childControl}
      {!hasPrimaryBeneficiaries && (isStudentRow || !childControl) && (
        <span className="sr-ticket__empty-beneficiaries">Sin beneficiarios</span>
      )}
    </div>
  );
};

export default TicketBeneficiarySummary;
