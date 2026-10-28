export const IDENTITY_FIELDS = [
  { key: 'nombres', label: 'Nombres', aliases: ['nombres', 'firstName'] },
  { key: 'apellidos', label: 'Apellidos', aliases: ['apellidos', 'lastName'] },
  { key: 'numero_documento', label: 'Número de documento', aliases: ['numero_documento', 'numeroDocumento', 'docNumber'] },
  { key: 'tipo_documento', label: 'Tipo de documento', aliases: ['tipo_documento', 'tipoDocumento', 'docType'] },
  { key: 'fecha_nacimiento', label: 'Nacimiento', aliases: ['fecha_nacimiento', 'birthDate'] },
  { key: 'nacionalidad', label: 'País', aliases: ['nacionalidad', 'nationality', 'pais'] },
  { key: 'fecha_caducidad', label: 'Caducidad del documento', aliases: ['fecha_caducidad', 'expiryDate'], type: 'date', optional: true },
];
const text = value => value == null ? '' : String(value).trim();
const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
export class IdentityBatchError extends Error {}
export function defaultBatchSelection(rows) {
  let files = 0;
  return rows.filter(row => {
    if (!row.eligible || files + row.documentIds.length > 10) return false;
    files += row.documentIds.length; return true;
  }).slice(0, 10).map(row => row.key);
}
export const valueForField = (passenger, key) => {
  const field = IDENTITY_FIELDS.find(field => field.key === key);
  return field?.aliases.map(alias => text(passenger?.[alias])).find(Boolean) || '';
};
export const missingFields = passenger => IDENTITY_FIELDS.filter(field => {
  const value = valueForField(passenger, field.key);
  return !value || ['nombres', 'apellidos'].includes(field.key) && /^(?:adulto|niño|nino|pasajero|pax)\s*\d+$|^sin (?:nombre|apellido)s?$/i.test(value);
}).map(field => field.key);

export function identityBatchRows(passengerData, documentMap, { privateOnly = false, allowHistorical = false, unassignedDocuments = [] } = {}) {
  const groups = [['adults', 'adult'], ['children', 'child']];
  const passengers = groups.flatMap(([group, type]) => (passengerData?.[group] || []).map((passenger, index) => {
    const key = `${type}-${index}`;
    const passengerId = id(passenger.id_pasajero);
    const documents = documentMap instanceof Map ? documentMap.get(key) : documentMap?.[key];
    const seen = new Set();
    const savedDocuments = ['passports', 'idCards'].flatMap(category => documents?.[category] || []).filter(doc => {
      const documentId = id(doc.dbId) || (doc.isFromDatabase ? id(doc.id) : null);
      const owner = id(doc.passengerId ?? doc.passenger_id ?? doc.ownerId);
      const mime = doc.file_type || doc.fileType || doc.type || doc.mime_type;
      if (!documentId || seen.has(documentId) || owner && owner !== passengerId || privateOnly && ((!doc.documentAssetId && !allowHistorical) || owner !== passengerId) || !['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'].includes(mime)) return false;
      seen.add(documentId); return true;
    }).map(doc => id(doc.dbId) || id(doc.id));
    const missing = missingFields(passenger);
    return { key, passengerId, passenger, type, missing, documentIds: savedDocuments,
      label: [text(passenger.nombres), text(passenger.apellidos)].filter(Boolean).join(' ') || `${type === 'adult' ? 'Adulto' : 'Niño'} ${index + 1}`,
      eligible: !!passengerId && missing.length > 0 && savedDocuments.length > 0,
      reason: !passengerId ? 'Guarda primero el pasajero' : !missing.length ? 'Información completa' : !savedDocuments.length ? privateOnly ? 'Sin documento de identidad privado guardado' : 'Sin documento de identidad guardado' : 'Listo para completar',
    };
  }));
  const seen = new Set(passengers.flatMap(row => row.documentIds));
  const hasPending = passengers.some(row => row.passengerId && row.missing.length);
  const documents = unassignedDocuments.filter(doc => {
    const documentId = id(doc.dbId) || id(doc.id);
    if (!documentId || seen.has(documentId) || id(doc.passengerId ?? doc.ownerId) ||
      !['passport', 'idcard'].includes(doc.documentoTipo) || !doc.documentAssetId && !allowHistorical ||
      !['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'].includes(doc.type || doc.fileType)) return false;
    seen.add(documentId); return true;
  });
  return [...passengers, ...(privateOnly ? documents.map(doc => ({ key: `unassigned-${id(doc.dbId) || id(doc.id)}`, type: 'unassigned', passengerId: null,
    documentIds: [id(doc.dbId) || id(doc.id)], missing: [], label: 'Documento por identificar', document: doc,
    eligible: hasPending, reason: hasPending ? 'Asignación tras revisar la lectura' : 'Sin pasajeros pendientes',
  })) : [])];
}
export function makeIdentityBatch(rows, selected, quote, voucher, idempotencyKey) {
  const ids = new Set(selected);
  const chosen = rows.filter(row => ids.has(row.key));
  if (!quote || !id(voucher) || !chosen.length || chosen.length > 10 || chosen.length !== ids.size || chosen.some(row => !row.eligible)) throw new IdentityBatchError('La selección cambió. Revisa pasajeros y documentos antes de enviar el lote.');
  const documents = chosen.flatMap(row => row.documentIds);
  if (documents.length > 10) throw new IdentityBatchError('El lote admite hasta 10 archivos. Selecciona menos pasajeros para continuar.');
  if (new Set(documents).size !== documents.length) throw new IdentityBatchError('Un documento aparece en más de un pasajero. Revisa su asignación.');
  const assigned = chosen.filter(row => row.passengerId != null);
  const unassigned = chosen.filter(row => row.passengerId == null).flatMap(row => row.documentIds);
  // Keep the unordered set together: Gemini can link front/back only when the
  // printed identity agrees, and can return multiple people from the same PDF.
  return { cotizacion_id: quote, voucher_id: id(voucher), idempotency_key: idempotencyKey,
    document_groups: [...assigned.map(row => ({ selected_passenger_id: row.passengerId, document_ids: row.documentIds })),
      ...(unassigned.length ? [{ selected_passenger_id: null, document_ids: unassigned }] : [])],
  };
}
export function reviewableFields(passenger, values, sold) {
  const missing = new Set(missingFields(passenger));
  return IDENTITY_FIELDS.filter(field => missing.has(field.key) && text(values?.[field.key]) && !(sold && ['fecha_nacimiento', 'nacionalidad'].includes(field.key))).map(field => field.key);
}
export const terminalJob = state => ['extraction_done', 'partial', 'failed', 'cancelled'].includes(state);
