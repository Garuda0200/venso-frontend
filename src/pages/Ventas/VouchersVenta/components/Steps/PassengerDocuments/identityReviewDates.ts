export const isIdentityDate = key => ['fecha_nacimiento', 'fecha_caducidad'].includes(key);

function validDate(year, month, day) {
  if (year < 1 || year > 9999) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function reviewDateToIso(value) {
  const match = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(String(value ?? '').trim());
  if (!match || !validDate(Number(match[3]), Number(match[2]), Number(match[1]))) return '';
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function isoToReviewDate(value) {
  const text = String(value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match || !validDate(Number(match[1]), Number(match[2]), Number(match[3]))) return text;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function invalidReviewDates(review) {
  return (review?.fields || []).filter(key => isIdentityDate(key) && !reviewDateToIso(review.dateText?.[key]));
}
