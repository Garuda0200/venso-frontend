import { getBibliaQuotationLinkLabel } from "../utils/bibliaActivityMapper";
import { getBibliaLinkRecommendations, getBibliaLinkUnavailableReason, getBibliaLinkDateNotice } from "../utils/bibliaQuotationLinking";
import type { BibliaActivity } from "../utils/bibliaActivityMapper";

export default function BibliaLinkRecommendations({ activity, recommendations, busy, onLink }: {
  activity: BibliaActivity; recommendations: ReturnType<typeof getBibliaLinkRecommendations>;
  busy: boolean; onLink: (quotationId: string) => void;
}) {
  if (!recommendations.length) return null;
  return <section className="biblia-link-recommendations" aria-label="Vinculaciones recomendadas por código de file">
    <strong>Mismo file · cotización encontrada</strong>
    <p>Puedes usar la cotización de {activity.file}.</p>
    {recommendations.map(({ quotation, records, dates }) => {
      const reason = getBibliaLinkUnavailableReason(activity, quotation);
      const notice = !reason && getBibliaLinkDateNotice(activity, quotation);
      return <div className="biblia-link-recommendations__item" key={String(quotation.id)}>
        <span><b>{getBibliaQuotationLinkLabel(quotation)}</b>
          <small>{quotation.agency_name || ""}{quotation.agency_name ? " · " : ""}{records > 0 ? `${records} registro${records === 1 ? "" : "s"} · ${dates.length} día${dates.length === 1 ? "" : "s"}` : "File listo para vincular"}</small>
          {notice && <small>{notice}</small>}
          {reason && <small className="biblia-link-recommendations__reason">{reason}</small>}
        </span>
        <button type="button" disabled={busy || Boolean(reason)} title={reason || "Vincular este registro a la misma cotización"}
          onClick={() => onLink(String(quotation.id))}>Vincular aquí</button>
      </div>;
    })}
  </section>;
}
