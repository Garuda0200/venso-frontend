const categories = ['passports', 'idCards', 'otherDocuments'];
const emptyGroups = () => Object.fromEntries(categories.map(category => [category, []]));
const passengerId = passenger => passenger.id_pasajero ?? passenger.id;

export function documentListingData(response) {
  let data = response || {};
  for (let depth = 0; depth < 3 && data.data && !categories.some(category => Array.isArray(data[category])); depth++) data = data.data;
  return data;
}

// The wizard owns this draft across step unmounts. Accept its keyed shape and
// historical flat categories; explicit owner IDs always outrank positional keys.
export function hydrateDocumentDraft(passengers, draft, absoluteProxy, legacyProxy) {
  const documents = new Map(passengers.map(passenger => [passenger.passengerKey, emptyGroups()]));
  const byId = new Map(passengers.filter(passenger => passengerId(passenger) != null)
    .map(passenger => [String(passengerId(passenger)), passenger.passengerKey]));
  const add = (doc, category, sourceKey) => {
    if (!doc) return;
    const owner = doc.passengerId ?? doc.ownerId ?? doc.owner_id;
    const key = owner != null ? byId.get(String(owner)) : (doc.passengerKey || doc.passenger_key || sourceKey);
    if (!documents.has(key)) return;
    const proxy = doc.proxyUrl ? absoluteProxy(doc.proxyUrl)
      : doc.tigrisUrl ? legacyProxy(doc.tigrisUrl) : doc.dataUrl;
    const target = documents.get(key)[category];
    if (doc.dbId && target.some(saved => String(saved.dbId) === String(doc.dbId))) return;
    target.push({ ...doc, passengerKey: key,
      ...(proxy ? { dataUrl: proxy } : {}), ...(doc.proxyUrl ? { proxyUrl: proxy } : {}) });
  };
  for (const [key, groups] of Object.entries(draft || {})) {
    if (categories.includes(key) && Array.isArray(groups)) groups.forEach(doc => add(doc, key));
    else for (const category of categories) {
      if (Array.isArray(groups?.[category])) groups[category].forEach(doc => add(doc, category, key));
    }
  }
  return documents;
}

// Server IDs determine ownership. Never infer it from filenames or array order.
export function reconcileDocumentListing(passengers, current, response, absoluteProxy, { preserveSaved = false, excludedIds = new Set() } = {}) {
  const data = documentListingData(response);
  const next = new Map(passengers.map(passenger => [passenger.passengerKey, {
    passports: [], idCards: [], otherDocuments: [],
  }]));
  const byId = new Map(passengers.filter(passenger => passengerId(passenger) != null).map(passenger => [Number(passengerId(passenger)), passenger.passengerKey]));
  const unassigned = [];
  const listedIds = new Set();
  for (const category of ['passports', 'idCards', 'otherDocuments']) {
    for (const doc of Array.isArray(data[category]) ? data[category] : []) {
      if (!doc || excludedIds.has(String(doc.id))) continue;
      listedIds.add(String(doc.id));
      const key = byId.get(Number(doc.passengerId));
      const normalized = { ...doc, id: doc.id, dbId: doc.id, name: doc.filename,
        type: doc.fileType, size: doc.fileSize, ownerId: doc.passengerId, ownerName: doc.passengerName,
        uploadDate: doc.uploadedAt, createdAt: doc.uploadedAt,
        passengerKey: key, category, dataUrl: absoluteProxy(doc.proxyUrl), proxyUrl: absoluteProxy(doc.proxyUrl), isFromDatabase: true };
      if (key && next.has(key)) next.get(key)[category].push(normalized);
      else if (doc.passengerId == null) unassigned.push(normalized);
    }
  }
  // A refresh after applying identity must not discard unrelated browser drafts.
  for (const [key, groups] of current || []) {
    if (!next.has(key)) continue;
    for (const category of ['passports', 'idCards', 'otherDocuments']) {
      const listed = next.get(key)[category];
      listed.push(...(groups[category] || []).filter(doc =>
        !excludedIds.has(String(doc.dbId || doc.id)) &&
        !listedIds.has(String(doc.dbId || doc.id)) &&
        (doc.fileObject && !doc.dbId && !doc.isFromDatabase || preserveSaved && (doc.dbId || doc.isFromDatabase)) &&
        !listed.some(saved => String(saved.dbId || saved.id) === String(doc.dbId || doc.id))));
    }
  }
  return { documents: next, unassigned };
}
