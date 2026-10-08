import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MdAdd, MdRemove, MdClose, MdPerson, MdChildCare, MdPublic, MdSave } from "react-icons/md";
import { getCountryNames } from "../../../../utils/countries";
import type { BibliaActivity, BibliaParticipantPlan } from "../utils/bibliaActivityMapper";
import { getBibliaSaveError } from "../utils/bibliaSyncFeedback";
import { buildParticipantPlan, changeParticipantCategory, initialParticipantDraft, participantCountryLabel,
  participantDraftError, quotationParticipantDraft, changeLinkedParticipantCount, availableParticipantCountries,
  type ParticipantDraft } from "../utils/bibliaParticipantEditor";
import { participantNationalityLabel } from "../utils/bibliaNationality";
import { isUnresolvedParticipantNationality } from "../utils/bibliaNationality";

const COUNTRIES = getCountryNames();

export function ParticipantPlanPanel({ draft, pax, busy, error, titleId, roster, onChange, onClose, onSave }: {
  draft: ParticipantDraft; pax: number; busy: boolean; error: string; titleId: string;
  roster: ParticipantDraft | null; onChange: (draft: ParticipantDraft) => void; onClose: () => void; onSave: () => void;
}) {
  const selectedPax = roster ? draft.adults.length + draft.children.length : pax;
  return <div className="biblia-participants-panel" aria-busy={busy}>
    <header><div><span className="biblia-participants-panel__eyebrow">BIBLIA DE ACTIVIDADES</span>
      <h2 id={titleId}>Participantes del día</h2></div>
      <button type="button" className="biblia-participants-panel__close" disabled={busy} onClick={onClose} aria-label="Cerrar participantes"><MdClose /></button>
    </header>
    <p className="biblia-participants-panel__intro">{roster
      ? <>Selecciona los beneficiarios de este día: <strong>{selectedPax} de {roster.adults.length + roster.children.length} pax</strong>. El padrón del file se conserva.</>
      : <>Distribuye los <strong>{pax} pax</strong> entre adultos y niños. Los controles mantienen el total del día.</>}</p>
    <fieldset disabled={busy}>
      <legend className="biblia-participants-panel__sr-only">Distribución de participantes</legend>
      <div className="biblia-participants-panel__counters">
        {(["adults", "children"] as const).map(kind => <article key={kind}>
          <strong>{kind === "adults" ? <MdPerson /> : <MdChildCare />}{kind === "adults" ? "Adultos" : "Niños"}</strong>
          <div><button type="button" disabled={!draft[kind].length} aria-label={kind === "adults" ? "Quitar un adulto" : "Quitar un niño"}
            onClick={() => onChange(roster ? changeLinkedParticipantCount(draft, kind, -1, roster) : changeParticipantCategory(draft, kind, -1))}><MdRemove /></button>
            <output aria-live="polite" aria-label={kind === "adults" ? "Cantidad de adultos" : "Cantidad de niños"}>{draft[kind].length}</output>
            <button type="button" disabled={roster ? draft[kind].length >= roster[kind].length : !draft[kind === "adults" ? "children" : "adults"].length}
              aria-label={kind === "adults" ? "Agregar un adulto" : "Agregar un niño"}
              onClick={() => onChange(roster ? changeLinkedParticipantCount(draft, kind, 1, roster) : changeParticipantCategory(draft, kind, 1))}><MdAdd /></button></div>
        </article>)}
      </div>
      <section className="biblia-participants-panel__nationalities">
        <div className="biblia-participants-panel__heading"><MdPublic /><strong>Nacionalidades</strong><span>{selectedPax} PAX</span></div>
        <div className="biblia-participants-panel__groups">
          {(["adults", "children"] as const).map(kind => <section key={kind}>
            <h3>{kind === "adults" ? <MdPerson /> : <MdChildCare />}{kind === "adults" ? "Adultos" : "Niños"}<span>{draft[kind].length}</span></h3>
            {draft[kind].length ? draft[kind].map((country, index) => <label key={`${kind}-${index}`}>
              <span>{kind === "adults" ? "A" : "N"}{index + 1}</span>
              <select value={country} aria-label={`Nacionalidad de ${kind === "adults" ? "adulto" : "niño"} ${index + 1}`}
                onChange={event => {
                  const chosen = event.target.value;
                  // Los países históricos (USA, PE...) conservan su valor de
                  // padrón al elegir su nombre visible, sin cambiar identidades.
                  const compatible = [country, ...(roster?.[kind] || [])]
                    .find(value => value && participantCountryLabel(value) === chosen) || chosen;
                  if (roster && !availableParticipantCountries(draft, kind, index, roster)
                    .some(value => participantCountryLabel(value) === participantCountryLabel(compatible))) return;
                  onChange({ ...draft, [kind]: draft[kind].map((value, i) => i === index ? compatible : value) });
                }}>
                <option value="" disabled={Boolean(roster)}>Seleccionar país</option>
                {country && !(roster ? availableParticipantCountries(draft, kind, index, roster) : COUNTRIES).includes(country)
                  && <option value={country}>{participantCountryLabel(country)}</option>}
                {roster
                  ? availableParticipantCountries(draft, kind, index, roster).filter(Boolean)
                    .map(value => <option key={value} value={value}>{participantCountryLabel(value)}</option>)
                  : COUNTRIES.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>) : <p className="biblia-participants-panel__empty">Sin {kind === "adults" ? "adultos" : "niños"} en este día.</p>}
          </section>)}
        </div>
      </section>
      {roster && <aside className="biblia-participants-panel__roster"><strong>Cotización vinculada: {roster.adults.length} adultos · {roster.children.length} niños</strong>
        <span>{[...roster.adults, ...roster.children].some(isUnresolvedParticipantNationality)
          ? "Completa las nacionalidades individuales de este día. El padrón histórico no se sobrescribe."
          : "Los controles cambian solo los beneficiarios del día, no los pasajeros de otros días."}</span></aside>}
    </fieldset>
    {error && <p className="biblia-participants-panel__error" role="alert">{error}</p>}
    <footer><button type="button" disabled={busy} onClick={onClose}>Cancelar</button>
      <button type="button" className="biblia-participants-panel__save" disabled={busy} onClick={onSave}><MdSave />{busy ? "Guardando…" : "Guardar participantes"}</button></footer>
  </div>;
}

export default function ParticipantPlanEditor({ activity, quotation, disabled = false, onSave }: {
  activity: BibliaActivity; quotation?: Record<string, any>; disabled?: boolean;
  onSave: (plan: BibliaParticipantPlan) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ParticipantDraft>(() => initialParticipantDraft(activity, quotation));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = () => { if (!saving.current) { setOpen(false); trigger.current?.focus(); } };
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);
  const save = async () => {
    if (saving.current || disabled) return;
    const total = quotationParticipantDraft(quotation) ? draft.adults.length + draft.children.length : activity.pax;
    const issue = participantDraftError(draft, total);
    if (issue) { setError(issue); return; }
    saving.current = true; setBusy(true); setError("");
    try { await onSave(buildParticipantPlan(draft)); setOpen(false); trigger.current?.focus(); }
    catch (saveError) { setError(getBibliaSaveError(saveError, "No se pudo guardar la distribución. Puedes reintentar.")); }
    finally { saving.current = false; setBusy(false); }
  };
  return <>
    <button ref={trigger} type="button" className="biblia-edit-value" disabled={disabled}
      title="Editar nacionalidades y beneficiarios del día" aria-label="Editar nacionalidades y beneficiarios del día"
      onClick={event => { event.stopPropagation(); setDraft(initialParticipantDraft(activity, quotation)); setError(""); setOpen(true); }}>{participantNationalityLabel(activity.participantPlan, activity.nationality)}</button>
    {open && createPortal(<div ref={dialog} className="biblia-participants-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}
      onClick={close} onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
        if (event.key === "Tab") {
          const controls = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled)") || [])];
          if (!controls.length) { event.preventDefault(); return; }
          const first = controls[0]; const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }}><div onClick={event => event.stopPropagation()}>
      <ParticipantPlanPanel draft={draft} pax={activity.pax} busy={busy || disabled} error={error} titleId={titleId}
        roster={quotationParticipantDraft(quotation)} onClose={close} onSave={() => void save()}
        onChange={next => { setDraft(next); setError(""); }} />
    </div></div>, document.body)}
  </>;
}
