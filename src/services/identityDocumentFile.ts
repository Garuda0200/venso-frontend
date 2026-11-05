const jpegTypes = new Set(['image/jpeg', 'image/jpg', 'image/jfif', 'image/pjpeg']);

export function identityDocumentMime(file: { type?: string; fileType?: string; file_type?: string; mime_type?: string; name?: string; filename?: string }) {
  const declared = (file.file_type || file.fileType || file.type || file.mime_type || '').split(';')[0].trim().toLowerCase();
  if (jpegTypes.has(declared)) return 'image/jpeg';
  if (['image/png', 'application/pdf'].includes(declared)) return declared;
  if ((!declared || declared === 'application/octet-stream') && /\.(?:jfif|jpe?g|jpe)$/i.test(file.name || file.filename || '')) return 'image/jpeg';
  return '';
}

export async function normalizeIdentityDocumentFile(file: File): Promise<File> {
  const mime = identityDocumentMime(file);
  if (!mime) throw new Error('Selecciona un documento JPEG, JFIF, PNG o PDF.');
  if (mime === 'image/jpeg' && file.type !== mime) {
    const bytes = new Uint8Array(await file.slice(0, 3).arrayBuffer());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error('La imagen JPEG o JFIF no es válida.');
    return new File([file], file.name, { type: mime, lastModified: file.lastModified });
  }
  return file;
}
