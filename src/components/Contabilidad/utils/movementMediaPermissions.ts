export const getPersistedMovementEvidenceId = (file = {}) =>
  file?.existingId ?? file?.existing_id ?? null;

export const isPersistedMovementEvidence = (file = {}) =>
  Boolean(getPersistedMovementEvidenceId(file));

export const canRemoveMovementEvidence = (file = {}, role) =>
  !isPersistedMovementEvidence(file) || Number(role) === 0;

export const getPendingMovementEvidences = (files = []) =>
  (Array.isArray(files) ? files : []).filter(
    (file) =>
      !isPersistedMovementEvidence(file) &&
      file?.isPending === true &&
      Boolean(file?.fileObject),
  );
