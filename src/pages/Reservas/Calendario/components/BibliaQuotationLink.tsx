import { Link } from "react-router-dom";
import { MdOpenInNew } from "react-icons/md";
import { quotationFocusHref } from "../../../Ventas/Cotizaciones/utils/quotationFocus";

export default function BibliaQuotationLink({ quotationId, role }: { quotationId: string; role: number }) {
  const href = quotationFocusHref(quotationId, role);
  if (!href) return null;
  return <Link className="biblia-quotation-link" to={href} onClick={event => event.stopPropagation()}>
    <MdOpenInNew aria-hidden="true" /> Ver cotización
  </Link>;
}