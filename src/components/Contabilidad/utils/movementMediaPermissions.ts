export const getPersistedMovementEvidenceId = (file = {}) =>
  file?.existingId ?? file?.existing_id ?? null;

export const isPersistedMovementEvidence = (file = {}) =>
  Boolean(getPersistedMovementEvidenceId(file));

export const canRemoveMovementEvidence = (file = {}, role, actorId?) =>
  !isPersistedMovementEvidence(file) || (actorId != null
    ? String(file.created_by ?? file.createdBy ?? "") === String(actorId)
    : Number(role) === 0);

export const getPendingMovementEvidences = (files = []) =>
  (Array.isArray(files) ? files : []).filter(
    (file) =>
      !isPersistedMovementEvidence(file) &&
      file?.isPending === true &&
      Boolean(file?.fileObject),
  );
