// Saved-file permissions are computed by the backend from authenticated claims
// and the stored upload audit, not from a passenger name or browser role alone.
export function canDeletePassengerDocument(document) {
  if (!document || document.documentAssetId) return false;
  if (document.dbId || document.isFromDatabase) return document.canDelete === true;
  return !!document.fileObject && document.isPending === true;
}

export function hasPendingDocumentUploads(documentData) {
  return Object.values(documentData || {}).some(groups => Object.values(groups || {}).some(documents =>
    Array.isArray(documents) && documents.some(document => !document.dbId && !document.isFromDatabase)));
}
