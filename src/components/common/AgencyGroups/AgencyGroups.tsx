import React from "react";
import { MdBusiness } from "react-icons/md";
import type { Agency } from "../../../services/agencyService";
import { groupByQuotationAgency } from "../../../utils/quotationAgencyGroups";

export function AgencyGroupLabel({ name, count, totalCount = count, noun = "vouchers" }: {
  name: string; count: number; totalCount?: number; noun?: string;
}) {
  const label = totalCount === 1 ? (noun === "cotizaciones" ? "cotización" : noun === "vouchers" ? "voucher" : noun) : noun;
  return <span className="quotation-agency-label">
    <MdBusiness aria-hidden="true" />
    <span className="quotation-agency-label__name">{name}</span>
    <span className="quotation-agency-label__count">
      {count < totalCount ? `${count} de ${totalCount}` : count} {label}
    </span>
  </span>;
}

export default function AgencyGroups<T extends Record<string, any>>({ items, agencies, renderItem, listClassName }: {
  items: readonly T[]; agencies: readonly Agency[]; renderItem: (item: T) => React.ReactNode; listClassName: string;
}) {
  return <div className="quotation-agency-groups">
    {groupByQuotationAgency(items, agencies).map((group) => <section key={group.key} aria-label={group.name}>
      <header className="quotation-agency-group-header">
        <h3><AgencyGroupLabel name={group.name} count={group.items.length} /></h3>
      </header>
      <div className={listClassName}>{group.items.map(renderItem)}</div>
    </section>)}
  </div>;
}
