// These are local derivations, never fields guessed by the document model.
export function procedenciaFromCountry(value) {
  const country = String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (!country) return '';
  return ['PERU', 'PER', 'PE'].includes(country) ? 'Nacional' : 'Extranjero';
}

export function ageFromBirthDate(value, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  const [year, month, day] = value.split('-').map(Number);
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(today).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  const age = parts.year - year - (parts.month < month || parts.month === month && parts.day < day ? 1 : 0);
  return age >= 0 ? String(age) : '';
}
