import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MdAutoAwesome, MdCheckCircle, MdPerson, MdChildCare, MdDescription } from 'react-icons/md';
import { getDocumentAiService } from '../../../../../../services/documentAiService';
import { IDENTITY_FIELDS, IdentityBatchError, defaultBatchSelection, identityBatchRows, makeIdentityBatch, reviewableFields, terminalJob } from './identityBatch';
import './PassengerIdentityBatch.scss';
import { ageFromBirthDate, procedenciaFromCountry } from '../../passengerIdentityDerived';
import { isIdentityDate, isoToReviewDate, reviewDateToIso, invalidReviewDates } from './identityReviewDates.js';

const newKey = () => globalThis.crypto.randomUUID();
const safeError = error => error instanceof IdentityBatchError ? error.message : error?.response?.status === 409 ? 'El file cambió. Actualiza los datos y revisa el lote nuevamente.'
  : error?.response?.status === 403 ? 'No tienes permiso o el procesamiento documental aún no está habilitado.'
  : error?.response?.status === 404 ? 'El backend local todavía no dispone de esta función.'
  : 'No se pudo completar la operación. No se volverá a procesar automáticamente.';

export default function PassengerIdentityBatch({ passengerData, documentMap, cotizacionId, voucherId,
  hasUnsavedPassengers = false, onIdentityApplied, onPersistDocuments, unassignedDocuments = [],
  onUnassignedDocumentsChange, onDocumentsReload, onPreviewDocument, api: injectedApi }) {
  const [selected, setSelected] = useState([]);
  const [capability, setCapability] = useState(null);
  const rows = useMemo(() => identityBatchRows(passengerData, documentMap, { privateOnly: !!capability?.private_documents, allowHistorical: !!capability?.existing_documents, unassignedDocuments }), [passengerData, documentMap, capability?.private_documents, capability?.existing_documents, unassignedDocuments]);
  const pendingFiles = [...(documentMap instanceof Map ? documentMap.values() : Object.values(documentMap || {}))]
    .flatMap(groups => Object.values(groups || {}).flatMap(docs => Array.isArray(docs) ? docs : []))
    .filter(doc => doc.fileObject && !doc.dbId && !doc.isFromDatabase).length;
  const [api, setApi] = useState(injectedApi || null);
  const [job, setJob] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [review, setReview] = useState(null);
  const [uploadCategory, setUploadCategory] = useState('passport');
  const fileInput = useRef(null);
  const controller = useRef(null), epoch = useRef(0), initialSelection = useRef(false), requestKey = useRef(null), submitting = useRef(false), batchMembers = useRef([]);
  const signature = rows.map(row => `${row.key}:${row.eligible}:${row.documentIds.join(',')}:${row.missing.join(',')}`).join('|');
  useEffect(() => {
    const generation = ++epoch.current;
    const abort = new AbortController(); controller.current = abort;
    setCapability(null); setJob(null); setCandidates([]); setReview(null); setError(''); setMessage(''); setBusy(false);
    setSelected([]); initialSelection.current = false; requestKey.current = null; submitting.current = false; batchMembers.current = [];
    if (cotizacionId && voucherId) (async () => {
      try {
        const client = injectedApi || await getDocumentAiService();
        const readiness = await client.capabilities(cotizacionId, voucherId, abort.signal);
        if (epoch.current === generation && !abort.signal.aborted) { setApi(client); setCapability(readiness); }
      } catch (failure) { if (epoch.current === generation && !abort.signal.aborted) setError(safeError(failure)); }
    })();
    return () => { abort.abort(); ++epoch.current; };
  }, [cotizacionId, voucherId, injectedApi]);

  useEffect(() => {
    const eligible = rows.filter(row => row.eligible).map(row => row.key);
    // StrictMode may evaluate a state updater twice. Keep the updater pure:
    // mutating this ref inside it made the second evaluation drop selection.
    const initialize = !!capability && !initialSelection.current && eligible.length > 0;
    if (initialize) initialSelection.current = true;
    setSelected(previous => initialize ? defaultBatchSelection(rows) : previous.filter(key => eligible.includes(key)));
  }, [signature, cotizacionId, voucherId, capability]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadJob = async (jobId, generation) => {
    const current = await api.job(jobId, controller.current.signal);
    if (epoch.current !== generation || controller.current.signal.aborted) return;
    setJob(previous => ({ ...previous, ...current }));
    if (terminalJob(current.state)) {
      let all = [], offset = 0;
      while (offset < 300) {
        const page = await api.candidates(jobId, offset, controller.current.signal);
        if (epoch.current !== generation || controller.current.signal.aborted) return;
        all.push(...(page.rows || [])); if ((page.rows || []).length < 100) break; offset += 100;
      }
      setCandidates(all); setBusy(false);
    }
    return current;
  };
  useEffect(() => {
    if (!api || !job?.id || terminalJob(job.state)) return undefined;
    const generation = epoch.current; let timer, stopped = false, polls = 0;
    const poll = async () => {
      try {
        const current = await loadJob(job.id, generation);
        if (!stopped && current && !terminalJob(current.state) && ++polls < 45) timer = setTimeout(poll, 4000);
        else if (!stopped && current && !terminalJob(current.state)) { setBusy(false); setMessage('El lote sigue en curso. Puedes consultar su estado sin volver a enviarlo.'); }
      } catch (failure) { if (!stopped && epoch.current === generation) { setError(safeError(failure)); setBusy(false); } }
    };
    timer = setTimeout(poll, 2000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [api, job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const process = async () => {
    if (submitting.current || busy || hasUnsavedPassengers || !capability?.enabled || !(capability?.existing_documents || capability?.private_documents) || !capability?.can_manage) return;
    const generation = epoch.current; submitting.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const fingerprint = JSON.stringify([signature, [...selected].sort()]);
      if (requestKey.current?.fingerprint !== fingerprint) requestKey.current = { fingerprint, value: newKey() };
      const body = makeIdentityBatch(rows, selected, cotizacionId, voucherId, requestKey.current.value);
      const accepted = await api.createBatch(body, controller.current.signal);
      if (epoch.current !== generation) return;
      if (!accepted.job_id) throw new Error('Invalid response');
      batchMembers.current = body.document_groups.some(group => group.selected_passenger_id == null)
        ? rows.filter(row => row.passengerId && row.missing.length).map(row => row.passengerId)
        : body.document_groups.map(group => group.selected_passenger_id);
      setJob({ id: accepted.job_id, state: accepted.state, context_revision: accepted.context_revision }); setCandidates([]);
      if (terminalJob(accepted.state)) await loadJob(accepted.job_id, generation);
    } catch (failure) { if (epoch.current === generation && !controller.current.signal.aborted) { setError(safeError(failure)); setBusy(false); } }
    finally { if (epoch.current === generation) submitting.current = false; }
  };
  const openReview = candidate => {
    const passengerId = Number(candidate.suggestion?.passenger_id);
    const row = rows.find(row => row.passengerId === passengerId && batchMembers.current.includes(row.passengerId));
    if (!candidate.identity_values) { setError('Esta propuesta ya no contiene información disponible para revisar.'); return; }
    const fields = row ? reviewableFields(row.passenger, candidate.identity_values, capability.sold) : [];
    const dateText = Object.fromEntries(IDENTITY_FIELDS.filter(field => isIdentityDate(field.key)).map(field => [field.key, isoToReviewDate(candidate.identity_values[field.key])]));
    setReview({ candidate, row, fields, values: { ...candidate.identity_values }, dateText, compared: false, idempotencyKey: newKey() });
  };
  const applyReview = async () => {
    if (!review?.row || !review.compared || !review.fields.length || submitting.current || hasUnsavedPassengers || job?.stale) return;
    if (invalidReviewDates(review).length) { setError('Revisa las fechas seleccionadas: usa dd/mm/aaaa y una fecha válida.'); return; }
    const generation = epoch.current; submitting.current = true; setBusy(true); setError('');
    try {
      const currentRow = rows.find(row => row.passengerId === review.row.passengerId);
      const allowed = reviewableFields(currentRow?.passenger, review.values, capability.sold);
      if (review.fields.some(field => !allowed.includes(field))) throw new Error('Stale review');
      const corrections = Object.fromEntries(review.fields.map(field => [field, String(review.values[field] || '').trim()]));
      const confirmed = await api.review(review.candidate.id, { passenger_id: review.row.passengerId, candidate_revision: review.candidate.revision,
        base_context_revision: job.context_revision, selected_fields: review.fields, corrections, missing_only: true, idempotency_key: review.idempotencyKey }, controller.current.signal);
      if (epoch.current !== generation || controller.current.signal.aborted) return;
      await api.apply(confirmed.id, controller.current.signal);
      if (epoch.current !== generation) return;
      setCandidates(previous => previous.map(candidate => candidate.id === review.candidate.id ? { ...candidate, state: 'applied' } : candidate));
      setReview(null); setMessage('Campos confirmados guardados. Los demás datos se conservaron.');
      try { await loadJob(job.id, generation); } catch { setJob(previous => ({ ...previous, stale: true })); setMessage('Los campos se guardaron. Actualiza el estado del lote antes de revisar otra propuesta.'); }
      try {
        await onIdentityApplied?.();
        if (api.documents && onDocumentsReload) {
          const listing = await api.documents(voucherId, controller.current.signal);
          if (epoch.current === generation && !controller.current.signal.aborted) onDocumentsReload(listing);
        }
      } catch { setMessage('Los campos se guardaron. Actualiza la ficha para verlos; no es necesario volver a aplicarlos.'); }
    } catch (failure) { if (epoch.current === generation && !controller.current.signal.aborted) setError(safeError(failure)); }
    finally { if (epoch.current === generation) { submitting.current = false; setBusy(false); } }
  };
  const passengerRows = rows.filter(row => row.passengerId != null);
  const pending = passengerRows.filter(row => row.missing.length).length;
  const running = job && !terminalJob(job.state);
  const enabled = capability?.enabled && (capability?.existing_documents || capability?.private_documents) && capability?.can_manage;
  const uploadUnassigned = async files => {
    if (!files.length || submitting.current || busy || running || hasUnsavedPassengers || !capability?.private_upload || !onDocumentsReload) return;
    const generation = epoch.current;
    submitting.current = true; setBusy(true); setError(''); setMessage('');
    try {
      if (files.length > 10 || files.reduce((sum, file) => sum + file.size, 0) > 40 * 1024 * 1024 || files.some(file =>
        !['application/pdf', 'image/png', 'image/jpeg'].includes(file.type) || file.size > (file.type === 'application/pdf' ? 15 : 8) * 1024 * 1024)) {
        throw new IdentityBatchError('Selecciona hasta 10 archivos de identidad (PDF hasta 15 MiB, imágenes hasta 8 MiB y lote hasta 40 MiB).');
      }
      for (const file of files) {
        const stored = await api.uploadAsset({ quote: cotizacionId, voucher: voucherId, passenger: null, category: uploadCategory, file }, controller.current.signal);
        if (epoch.current !== generation || controller.current.signal.aborted) return;
        if (!stored.document?.id || !stored.document.documentAssetId || stored.document.tigrisUrl || stored.document.passengerId != null) throw new Error('Unconfirmed private upload');
        // Keep every confirmed partial save visible even if the next file fails.
        onUnassignedDocumentsChange?.(previous => previous.some(doc => doc.id === stored.document.id) ? previous : [...previous, { ...stored.document, type: stored.document.fileType }]);
      }
      const listing = await api.documents(voucherId, controller.current.signal);
      if (epoch.current === generation && !controller.current.signal.aborted) {
        onDocumentsReload(listing);
        setMessage('Documentos privados guardados sin asignación. Selecciona los archivos para leerlos y luego confirma a qué pasajero corresponde cada propuesta.');
      }
    } catch (failure) { if (epoch.current === generation && !controller.current.signal.aborted) setError(safeError(failure)); }
    finally { if (epoch.current === generation) { submitting.current = false; setBusy(false); if (fileInput.current) fileInput.current.value = ''; } }
  };
  const persist = async () => {
    if (busy || submitting.current || hasUnsavedPassengers || !capability?.private_upload || !onPersistDocuments) return;
    const generation = epoch.current; submitting.current = true; setBusy(true); setError('');
    try {
      if (!await onPersistDocuments()) throw new IdentityBatchError('Quedan archivos pendientes. Reintenta su guardado; no se enviaron a Gemini.');
      if (epoch.current === generation) setMessage('Documentos guardados en privado. Ahora puedes seleccionar el lote para extraer los datos pendientes.');
    } catch (failure) { if (epoch.current === generation) setError(safeError(failure)); }
    finally { if (epoch.current === generation) { submitting.current = false; setBusy(false); } }
  };
  return <section className="identity-batch" aria-labelledby="identity-batch-title">
    <header><span className="identity-batch__icon"><MdAutoAwesome /></span><div><span className="identity-batch__eyebrow">LECTURA ASISTIDA · {capability?.private_documents ? 'DOCUMENTOS PRIVADOS' : 'DESARROLLO'}</span><h3 id="identity-batch-title">Completar datos desde documentos</h3><p>Selecciona sólo los pasajeros con información pendiente. Revisarás los resultados antes de guardar.</p></div></header>
    <div className="identity-batch__stats"><span>{pending} con datos pendientes</span><span>{rows.filter(row => row.eligible).length} listos para procesar</span><span>{passengerRows.length - pending} completos</span></div>
    {!voucherId || !cotizacionId ? <p className="identity-batch__notice">Guarda primero el voucher y sus pasajeros para vincular los documentos.</p> : null}
    {hasUnsavedPassengers && <p className="identity-batch__notice">Guarda los cambios de pasajeros antes de procesar o aplicar un lote.</p>}
    {capability && !enabled && <p className="identity-batch__notice">{!capability.can_manage ? 'Tu acceso permite consultar, pero no procesar identidades.' : 'El procesamiento documental no está habilitado en este entorno.'}</p>}
    {capability?.private_documents && <p className="identity-batch__notice">{capability.existing_documents ? 'Puedes seleccionar documentos de identidad ya guardados y nuevas cargas privadas, asignados o por identificar.' : 'Sólo se procesan documentos privados de identidad de este file, asignados o por identificar.'} Los archivos originales permanecen intactos y no se trasladan automáticamente.</p>}
    {capability?.private_upload && <div className="identity-batch__upload"><h4>Documentos sin asignar</h4><p>¿Recibiste los documentos desordenados? Guárdalos aquí sin elegir un pasajero. La lectura sólo se inicia cuando pulses Procesar.</p>
      <div className="identity-batch__actions"><label className="identity-batch__assign">Tipo de documentos<select aria-label="Tipo de documentos sin asignar" value={uploadCategory} disabled={busy || running} onChange={event => setUploadCategory(event.target.value)}><option value="passport">Pasaportes</option><option value="idcard">Documentos de identidad</option></select></label>
        <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png" multiple hidden aria-label="Seleccionar documentos sin asignar" onChange={event => uploadUnassigned([...event.target.files])} />
        <button type="button" disabled={busy || running || hasUnsavedPassengers || !pending || !onDocumentsReload} onClick={() => fileInput.current?.click()}>Guardar lote privado sin asignar</button></div>
    </div>}
    {unassignedDocuments.length > 0 && <div className="identity-batch__unassigned" aria-label="Archivos pendientes de asignación">{unassignedDocuments.map(doc => <div key={doc.id}><span>{doc.documentAssetId ? 'Privado' : capability?.existing_documents && capability?.private_documents ? 'Guardado previamente' : 'Histórico · sólo consulta'} · {doc.filename || 'Documento'} · sin asignar</span><button type="button" onClick={() => onPreviewDocument?.(doc)} disabled={!onPreviewDocument}>Ver documento</button></div>)}</div>}
    {capability?.private_upload && pendingFiles > 0 && <div className="identity-batch__actions"><button type="button" className="identity-batch__primary" disabled={busy || running || hasUnsavedPassengers || !onPersistDocuments} onClick={persist}>Guardar documentos privados ({pendingFiles})</button><span>Guardar archivos no inicia la extracción.</span></div>}
    <div className="identity-batch__rows">{rows.map(row => <button key={row.key} type="button" aria-pressed={selected.includes(row.key)} disabled={!row.eligible || busy || running}
      className={`identity-batch__row ${selected.includes(row.key) ? 'is-selected' : ''}`} onClick={() => setSelected(previous => previous.includes(row.key) ? previous.filter(key => key !== row.key) : previous.length < 10 ? [...previous, row.key] : previous)}>
      <span className="identity-batch__person">{row.type === 'adult' ? <MdPerson /> : row.type === 'unassigned' ? <MdDescription /> : <MdChildCare />}</span><span className="identity-batch__info"><strong>{row.label}</strong><small>{row.type === 'unassigned' ? row.document.filename || row.reason : row.missing.length ? row.missing.map(key => IDENTITY_FIELDS.find(field => field.key === key).label).join(' · ') : 'Datos de identidad completos'}</small></span>
      <span className="identity-batch__status">{!row.missing.length && row.type !== 'unassigned' ? <MdCheckCircle /> : <MdDescription />}{row.documentIds.length ? `${row.documentIds.length} archivo${row.documentIds.length > 1 ? 's' : ''}` : row.reason}</span>
    </button>)}</div>
    {!rows.length && <p className="identity-batch__notice">Todavía no hay pasajeros para revisar.</p>}
    <footer><small>Sólo PDF, pasaportes e imágenes de identidad guardados. No se borran ni reemplazan archivos. Máximo 10 pasajeros y 10 archivos por lote.</small>
      <button type="button" className="identity-batch__primary" onClick={process} disabled={!enabled || !selected.length || busy || running || hasUnsavedPassengers}> {busy ? 'Procesando…' : `Procesar seleccionados (${selected.length})`}</button></footer>
    {job && <div className="identity-batch__progress" role="status"><strong>{job.state === 'failed' ? 'No se pudo extraer la información' : job.state === 'partial' ? 'Lectura completada parcialmente' : job.state === 'cancelled' ? 'Lote cancelado' : terminalJob(job.state) ? 'Lectura completada' : 'Lectura en curso'}</strong><span>{(job.items || []).filter(item => ['extracted', 'unreadable', 'failed', 'cancelled'].includes(item.state)).length} / {(job.items || []).length || selected.length} documentos revisados</span>
      {job.state === 'failed' && <p>No se guardaron datos de pasajeros. El proceso falló; finalizar un lote no significa que se haya leído correctamente.</p>}
      {terminalJob(job.state) && job.state !== 'failed' && !busy && !candidates.length && <p>No hay propuestas de identidad disponibles. No se completarán datos sin una lectura válida.</p>}
      {job.stale && <p>El contexto cambió. No apliques estos resultados: actualiza la ficha.</p>}
      {!busy && running && <button type="button" onClick={() => loadJob(job.id, epoch.current).catch(failure => setError(safeError(failure)))}>Consultar estado</button>}
      {running && <button type="button" onClick={async () => { const generation = epoch.current; try { await api.cancel(job.id, controller.current.signal); if (epoch.current === generation) { setJob(previous => ({ ...previous, state: 'cancelled' })); setBusy(false); } } catch (failure) { if (epoch.current === generation) setError(safeError(failure)); } }}>Cancelar lote</button>}
    </div>}
    {candidates.map(candidate => <article className="identity-batch__proposal" key={candidate.id}><div><strong>Propuesta para {rows.find(row => row.passengerId === Number(candidate.suggestion?.passenger_id))?.label || 'pasajero por identificar'}</strong><small>{candidate.state === 'applied' ? 'Campos confirmados guardados' : 'Pendiente de revisión humana'}</small></div>
      <button type="button" onClick={() => openReview(candidate)} disabled={busy || job?.stale || !['review_pending', 'confirmed'].includes(candidate.state) || hasUnsavedPassengers}>Revisar datos</button></article>)}
    {review && <div className="identity-batch__review"><div className="identity-batch__review-heading"><span className="identity-batch__icon"><MdCheckCircle /></span><div><h4>Revisar datos {review.row ? `de ${review.row.label}` : 'y asignar pasajero'}</h4><p>Selecciona y confirma únicamente campos vacíos. Compara los valores con el documento original.</p></div></div>
      {(review.candidate.documents || []).length > 0 && <div className="identity-batch__actions">{review.candidate.documents.map(doc => <button key={doc.id} type="button" disabled={!onPreviewDocument} onClick={() => onPreviewDocument?.(doc)}>Ver original · pág. {(doc.pages || []).join(', ')}</button>)}</div>}
      <label className="identity-batch__assign">{review.row ? 'Pasajero propuesto; confirma la coincidencia con el original:' : 'No hay una coincidencia inequívoca. Confirma a quién pertenece el documento:'}
        <select aria-label="Asignar propuesta a pasajero del lote" value={review.row?.passengerId || ''} disabled={busy} onChange={event => { const row = rows.find(item => item.passengerId === Number(event.target.value) && batchMembers.current.includes(item.passengerId)); setReview(previous => ({ ...previous, row: row || null, fields: row ? reviewableFields(row.passenger, previous.values, capability.sold) : [], compared: false, idempotencyKey: newKey() })); }}><option value="">Seleccionar pasajero</option>{passengerRows.filter(row => batchMembers.current.includes(row.passengerId) && row.missing.length).map(row => <option key={row.key} value={row.passengerId}>{row.label}</option>)}</select>
      </label>
      <div className="identity-batch__fields">{IDENTITY_FIELDS.filter(field => review.row?.missing.includes(field.key)).map(field => {
        const locked = capability.sold && ['fecha_nacimiento', 'nacionalidad'].includes(field.key);
        const dateField = isIdentityDate(field.key);
        const invalidDate = dateField && !!review.dateText[field.key] && !reviewDateToIso(review.dateText[field.key]);
        return <label key={field.key} className="identity-batch__field"><input type="checkbox" aria-label={`Completar ${field.label}`} checked={review.fields.includes(field.key)} disabled={locked || busy || !review.values[field.key] && !review.fields.includes(field.key)} onChange={() => setReview(previous => ({ ...previous, fields: previous.fields.includes(field.key) ? previous.fields.filter(key => key !== field.key) : [...previous.fields, field.key], compared: false, idempotencyKey: newKey() }))} />
          <span>{field.label}{dateField && <small>Formato: dd/mm/aaaa</small>}{field.optional && <small>Opcional · sólo si figura en el documento</small>}{locked && <small>Requiere revisión postventa</small>}</span><input type="text" inputMode={dateField ? 'numeric' : undefined} placeholder={dateField ? 'dd/mm/aaaa' : undefined} aria-label={`Propuesta: ${field.label}`} aria-invalid={invalidDate || undefined} value={(dateField ? review.dateText[field.key] : review.values[field.key]) || ''} disabled={locked || busy} maxLength={dateField ? 10 : ['nombres', 'apellidos'].includes(field.key) ? 50 : 200} onChange={event => { const value = event.target.value; setReview(previous => ({ ...previous, ...(dateField ? { dateText: { ...previous.dateText, [field.key]: value } } : {}), values: { ...previous.values, [field.key]: dateField ? reviewDateToIso(value) : value }, compared: false, idempotencyKey: newKey() })); }} />{invalidDate && <small className="identity-batch__date-error">Introduce una fecha válida en dd/mm/aaaa.</small>}</label>;
      })}</div>
      <div className="identity-batch__notice" aria-label="Datos calculados localmente">
        {review.fields.includes('nacionalidad') && review.values.nacionalidad && <p>País: {review.values.nacionalidad} · Procedencia: {procedenciaFromCountry(review.values.nacionalidad)}</p>}
        {review.fields.includes('fecha_nacimiento') && ageFromBirthDate(review.values.fecha_nacimiento) && <p>Edad calculada desde nacimiento: {ageFromBirthDate(review.values.fecha_nacimiento)} años</p>}
        <small>La procedencia y la edad se calculan en Venso al confirmar los campos; no se solicitan ni se infieren con IA.</small>
      </div>
      <label className="identity-batch__confirm"><input type="checkbox" checked={review.compared} disabled={busy} onChange={event => setReview(previous => ({ ...previous, compared: event.target.checked }))} />He comparado los campos seleccionados con el documento.</label>
      <div className="identity-batch__actions"><button type="button" disabled={busy} onClick={() => setReview(null)}>Cerrar revisión</button><button type="button" className="identity-batch__primary" disabled={!review.compared || !review.fields.length || invalidReviewDates(review).length > 0 || busy || hasUnsavedPassengers || job?.stale} onClick={applyReview}>Confirmar y guardar campos</button></div>
    </div>}
    {error && <p role="alert" className="identity-batch__error">{error}</p>}{message && <p role="status" className="identity-batch__notice">{message}</p>}
  </section>;
}
