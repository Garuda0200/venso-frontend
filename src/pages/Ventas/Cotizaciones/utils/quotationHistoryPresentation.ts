const number = value => Number(value) || 0;
const text = value => String(value ?? '').trim();

export function groupQuotationHistory(versions, sold) {
  const relational = versions.filter(v => v.history_source !== 'archived')
    .slice().sort((a, b) => number(b.version_number) - number(a.version_number));
  const allArchives = versions.filter(v => v.history_source === 'archived')
    .slice().sort((a, b) => number(b.version_number) - number(a.version_number));
  const baseline = relational.find(v => v.phase === 'SALE_BASE');
  const preSaleRelational = sold ? relational.filter(v => v.history_stage === 'PRE_SALE' ||
    (baseline ? number(v.version_number) < number(baseline.version_number) : v.phase === 'DRAFT')) : [];
  const preSaleArchives = sold ? allArchives.filter(v => v.is_closed_sale === false) : [];
  const preSale = [...preSaleRelational, ...preSaleArchives];
  return { relational: relational.filter(v => !preSaleRelational.includes(v)), preSale,
    archived: allArchives.filter(v => !preSaleArchives.includes(v)) };
}

export function versionPresentation(version = {}, now = Date.now()) {
  const context = version.edit_context;
  const backup = context && String(context.backup_version_id) === String(version.id);
  const result = context && String(context.result_version_id) === String(version.id);
  const effectiveStatus = context?.status === 'APPROVED' && context.expires_at &&
    new Date(context.expires_at).getTime() <= now && !context.result_version_id ? 'EXPIRED' : context?.status;
  const state = { APPROVED: 'Permiso aprobado · sin guardado registrado', EXPIRED: 'Permiso vencido · sin guardado registrado',
    REVOKED: 'Permiso revocado', CANCELLED: 'Solicitud cancelada', CONFLICT: 'Permiso en conflicto',
    CONSUMED: 'Edición guardada', PENDING: 'Pendiente de aprobación', REJECTED: 'Solicitud rechazada' };
  const action = result || version.action === 'AUTHORIZED_EDIT_COMMIT' ? 'Resultado guardado'
    : backup || version.action === 'MANUAL_BACKUP' ? 'Respaldo previo'
    : version.phase === 'SALE_BASE' ? 'Base de venta'
    : version.action === 'RESTORE' ? 'Punto de restauración'
    : version.history_source === 'archived' ? 'Archivo anterior' : 'Estado anterior al guardado';
  const note = text(version.archive_note) || text(version.note);
  const automaticNote = /^(Backup automático|Resultado de edición postventa|Versión archivada automáticamente|Estado anterior al guardado|Base importada desde)/i.test(note);
  return {
    title: text(context?.reason) || (!automaticNote && note) || action,
    action, backup: Boolean(backup), result: Boolean(result),
    status: context ? (state[effectiveStatus] || 'Estado del permiso no disponible') : '',
    context,
  };
}

// La relación explícita del permiso prevalece sobre la cercanía cronológica:
// pueden existir varios respaldos de permisos vencidos entre dos ediciones.
export function versionComparisonPair(selected, group) {
  if (!selected) return { before: null, after: null };
  const context = selected.edit_context;
  const byId = id => id == null ? null : group.find(v => String(v.id) === String(id));
  if (context) {
    const backup = byId(context.backup_version_id);
    const result = byId(context.result_version_id);
    if (backup && result) return { before: backup, after: result };
    if (String(context.backup_version_id) === String(selected.id)) return { before: selected, after: selected };
  }
  const index = group.indexOf(selected);
  return { before: group[index + 1] || selected, after: selected };
}
