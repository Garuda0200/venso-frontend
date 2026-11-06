import React, { useEffect, useState } from "react";
import BibliaFileSuggestions from "./BibliaFileSuggestions";
import { bibliaActivityService } from "../services/bibliaActivityService";
import { buildBibliaActivitiesFromSnapshots } from "../utils/bibliaActivityMapper";
import type { BibliaOperationalData } from "../utils/bibliaReadCache";

type Props = React.ComponentProps<typeof BibliaFileSuggestions> & { cacheScope?: string };

/** Mounted only inside the open file editor. The grid loads no history upfront. */
export default function BibliaFileHistorySuggestions({ cacheScope, ...props }: Props) {
  const [history, setHistory] = useState<{ code: string; data: BibliaOperationalData } | null>(null);
  const [error, setError] = useState(false);
  const fileCode = props.code.trim();

  useEffect(() => {
    let active = true;
    setHistory(null);
    setError(false);
    if (!fileCode || fileCode === "—") return;

    const timer = setTimeout(() => {
      void bibliaActivityService.getOperationalData(undefined, { fileCode, cacheScope }).then(data => {
        if (active) setHistory({ code: fileCode, data });
      }).catch(() => { if (active) setError(true); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [fileCode, cacheScope]);

  const current = history?.code === fileCode ? history.data : null;
  const historicalActivities = current ? buildBibliaActivitiesFromSnapshots(current.quotations, current.standalone) : [];
  const activities = [...new Map([...props.activities, ...historicalActivities].map(row => [row.id, row])).values()];
  const quotations = [...new Map([...props.quotations, ...(current?.quotations || [])].map(quote => [String(quote.id), quote])).values()];

  return <>
    {error && <small role="status">No se pudieron consultar los datos de este file en otros meses.</small>}
    <BibliaFileSuggestions {...props} activities={activities} quotations={quotations} />
  </>;
}
