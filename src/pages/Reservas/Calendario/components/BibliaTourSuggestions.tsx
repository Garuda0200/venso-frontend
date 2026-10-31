import { useEffect, useState } from "react";
import { bibliaActivityService } from "../services/bibliaActivityService";
import type { BibliaActivity } from "../utils/bibliaActivityMapper";
import { bibliaTourRecommendationPayload } from "../utils/bibliaRowDrafts";
export default function BibliaTourSuggestions({activity, excursion, selections, onChange}: {
  activity: BibliaActivity; excursion: string; selections?: string; onChange: (value: string) => void;
}) {
  const [rows, setRows] = useState<any[]>([]), [loading, setLoading] = useState(false), [error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  const payload = JSON.stringify(bibliaTourRecommendationPayload(activity, excursion, selections));
  useEffect(() => {
    const controller=new AbortController();setRows([]);setError("");setLoading(true);
    const timer=window.setTimeout(() => {
      bibliaActivityService.recommendTours(JSON.parse(payload),activity.sourceQuotationId,controller.signal)
        .then(value=>{if(!controller.signal.aborted)setRows(value)})
        .catch(error=>{if(!controller.signal.aborted)setError(error?.response?.data?.message||"No se pudieron consultar los tours.")})
        .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    },250);
    return ()=>{controller.abort();window.clearTimeout(timer)};
  },[payload,activity.sourceQuotationId,retry]);
  const select=(row:any,value:string)=>{
    const previous=selections?JSON.parse(selections):activity.tourSelections||[];
    const next=previous.filter((entry:any)=>entry.excursionKey!==row.key);
    if(value)next.push({excursionKey:row.key,tourId:Number(value),agencyId:row.agencyId});
    onChange(JSON.stringify(next));
  };
  return <div className="biblia-tour-suggestions" aria-busy={loading}>
    {loading&&<small role="status">Buscando tours para la excursión…</small>}
    {error&&<div role="alert">{error} <button type="button" onClick={()=>setRetry(value=>value+1)}>Reintentar</button></div>}
    {rows.map(row=><label key={row.key}><span>{row.excursion}</span>
      <select aria-label={`Tour para ${row.excursion}`} value={row.selectedTourId||""} onChange={event=>select(row,event.target.value)}>
        <option value="">{row.candidates.length?"Selecciona un tour":"Sin tour compatible"}</option>
        {row.candidates.map((item:any)=><option key={item.tourId} value={item.tourId}>{item.provider} · {item.label}{item.tariffAvailable?"":" · Tarifa pendiente"}</option>)}
      </select>
      {row.warning&&<small role="status">{row.warning}</small>}
    </label>)}
  </div>;
}
