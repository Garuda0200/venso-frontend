// One persistence path for the Documents step and voucher completion.
// Private mode never falls back to media storage. Keep pending files on failure.
export class DocumentPersistenceError extends Error {}
const categories = { passports: 'passport', idCards: 'idcard', otherDocuments: 'other' };
const savedId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
export const documentSnapshot = data => Object.fromEntries(Object.entries(data).map(([key, groups]) =>
  [key, Array.isArray(groups) ? [...groups] : Object.fromEntries(Object.entries(groups || {}).map(([category, docs]) => [category, Array.isArray(docs) ? docs.map(doc => ({ ...doc })) : docs]))]));

export function mergeConfirmedDocuments(current, processed) {
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

export async function persistVoucherDocuments({ documentData, passengerData, quote, voucher, code }, dependencies) {
  const pending = Object.entries(documentData || {}).flatMap(([key, groups]) => Object.entries(groups || {})
    .flatMap(([category, docs]) => Array.isArray(docs) ? docs.filter(doc => !doc.dbId && !doc.isFromDatabase)
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
  // If capabilities fail, do not send a single byte to another bucket.
  const capability = dependencies.ai
    ? await dependencies.ai.capabilities(quote, Number(voucher))
    : { enabled: false, private_documents: false, can_upload_documents: await dependencies.authorize?.(Number(voucher), pending.map(item => Number(item.passenger.id_pasajero))) };
  // Uploading evidence and modifying passenger identity have separate policies.
  // Older backends expose only can_manage; an explicit upload denial always wins.
  const canUpload = capability.can_upload_documents ?? capability.can_manage;
  if (canUpload !== true) throw new DocumentPersistenceError('No tienes permiso para guardar documentos de este file.');
  const privateMode = capability.enabled && capability.private_documents;
  const persistOne = async ({ doc, category, passenger }) => {
    if (dependencies.isCurrent && !dependencies.isCurrent()) throw new DocumentPersistenceError('La ficha cambió durante la carga.');
    const clientId = doc.clientId || doc.id;
    if (privateMode) {
      if (!doc.fileObject) throw new DocumentPersistenceError('Vuelve a seleccionar el archivo para guardarlo en privado. El original no se modificará.');
      const result = await dependencies.ai.uploadAsset({ quote, voucher: Number(voucher), passenger: Number(passenger.id_pasajero), category: categories[category], file: doc.fileObject });
      const stored = result.document;
      if (!savedId(stored?.id) || !stored.documentAssetId || stored.tigrisUrl || stored.passengerId !== Number(passenger.id_pasajero) || stored.documentoTipo !== categories[category])
        throw new DocumentPersistenceError('No se confirmó la vinculación privada del documento. Puedes volver a intentarlo.');
      Object.assign(doc, { id: stored.id, dbId: stored.id, clientId, documentAssetId: stored.documentAssetId,
        passengerId: stored.passengerId, ownerId: stored.passengerId, documentoTipo: stored.documentoTipo,
        proxyUrl: dependencies.privateProxy(stored.proxyUrl), dataUrl: dependencies.privateProxy(stored.proxyUrl),
        tigrisUrl: null, filename: stored.filename, name: stored.filename, type: stored.fileType,
        size: stored.fileSize, createdBy: stored.createdBy, canDelete: stored.canDelete === true, isFromDatabase: true });
    } else {
      // Legacy uploads remain available only when private mode is not activated.
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
    }
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
