// One persistence path for the Documents step and voucher completion.
// Keep originals on failure and retry DB registration without uploading twice.
export class DocumentPersistenceError extends Error {}
const categories = { passports: 'passport', idCards: 'idcard', otherDocuments: 'other' };
const savedId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
export const documentSnapshot = (data: any) => Object.fromEntries(Object.entries(data).map(([key, groups]) =>
  [key, Array.isArray(groups) ? [...groups] : Object.fromEntries(Object.entries(groups || {}).map(([category, docs]) => [category, Array.isArray(docs) ? docs.map(doc => ({ ...doc })) : docs]))]));

export function mergeConfirmedDocuments(current: any, processed: any) {
  const snapshot = documentSnapshot(current || {});
  for (const [key, groups] of Object.entries(processed || {})) {
    for (const [category, docs] of Object.entries(groups || {})) {
      if (!Array.isArray(docs) || !Array.isArray(snapshot[key]?.[category])) continue;
      const updates = docs.filter(doc => (doc.dbId && doc.isFromDatabase) || doc.tigrisUrl);
      snapshot[key][category] = snapshot[key][category].map(doc => {
        const currentId = doc.clientId || doc.id;
        const saved = updates.find(update => (update.dbId && update.dbId === doc.dbId) ||
          (currentId != null && (update.clientId || update.id) === currentId));
        if (!saved) return doc;
        const merged = { ...doc, ...saved };
        if (saved.dbId && saved.isFromDatabase) { delete merged.fileObject; delete merged.isPending; }
        return merged;
      });
    }
  }
  return snapshot;
}

export async function persistVoucherDocuments({ documentData, passengerData, quote, voucher, code }: any, dependencies: any) {
  const pending = Object.entries(documentData || {}).flatMap(([key, groups]: [string, any]) => Object.entries(groups || {})
    .flatMap(([category, docs]: [string, any]) => Array.isArray(docs) ? docs.filter(doc => !doc.dbId && !doc.isFromDatabase)
      .map(doc => ({ key, category, doc })) : []));
  if (!pending.length) return;
  if (!quote || !savedId(voucher)) throw new DocumentPersistenceError('Guarda primero el voucher y sus pasajeros.');
  const passengers = Object.fromEntries([['adults', 'adult'], ['children', 'child']].flatMap(([group, type]) =>
    (passengerData?.[group] || []).map((passenger, index) => [`${type}-${index}`, passenger])));
  for (const item of pending) {
    item.passenger = passengers[item.key];
    if (!categories[item.category] || !savedId(item.passenger?.id_pasajero))
      throw new DocumentPersistenceError('Guarda los pasajeros antes de subir documentos.');
  }
  // Recheck file access before uploading any bytes.
  if (!(await dependencies.authorize(Number(voucher),pending.map(item=>Number(item.passenger.id_pasajero)))))
    throw new DocumentPersistenceError('Guarda primero la información de pasajeros y verifica el acceso al file antes de cargar documentos.');
  const persistOne = async ({ doc, category, passenger }: any) => {
    if (dependencies.isCurrent && !dependencies.isCurrent()) throw new DocumentPersistenceError('La ficha cambió durante la carga.');
    const clientId = doc.clientId || doc.id;
      // Use Venso's existing storage contract, without importing Document AI.
      if (doc.fileObject && !doc.tigrisUrl) {
        const result = await dependencies.legacyUpload(doc.fileObject, dependencies.legacyFolder(voucher, code, category));
        Object.assign(doc, { tigrisUrl: result.tigrisUrl, filename: result.metadata.originalName,
          proxyUrl: dependencies.legacyProxy(result.tigrisUrl) });
        dependencies.onProgress?.();
      }
      if (!doc.tigrisUrl) throw new DocumentPersistenceError('No se confirmó la carga del documento.');
      if (dependencies.isCurrent && !dependencies.isCurrent()) throw new DocumentPersistenceError('La ficha cambió durante la carga.');
      const response = await dependencies.legacyRegister(voucher, dependencies.legacyPayload(doc, code, passenger.id_pasajero,
        `${passenger.nombres || ''} ${passenger.apellidos || ''}`.trim()));
      if (!response.success || !savedId(response.data?.id)) throw new DocumentPersistenceError('No se pudo vincular el documento al voucher.');
      Object.assign(doc, { dbId: response.data.id, id: response.data.id, clientId,
        createdBy: response.data.createdBy, canDelete: response.data.canDelete === true,
        proxyUrl: dependencies.privateProxy(response.data.proxyUrl), isFromDatabase: true });
    // Remove the original browser File only AFTER both storage and DB confirm success.
    delete doc.fileObject; delete doc.isPending;
    dependencies.onProgress?.();
  };
  // Bounded uploads: do not turn a passenger batch into an unbounded burst.
  // Wait for every in-flight confirmation before exposing a retry after failure.
  let cursor = 0, firstError;
  const worker = async () => {
    while (!firstError && cursor < pending.length) {
      const item = pending[cursor++];
      try { await persistOne(item); } catch (error) { firstError ||= error; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, pending.length) }, worker));
  if (firstError) throw firstError;
}
