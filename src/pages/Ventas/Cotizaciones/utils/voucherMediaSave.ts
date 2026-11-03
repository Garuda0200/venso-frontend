import { buildSourceVoucherMedia, normalizeSourceVoucher, type SourceVoucherMedia } from "./sourceVoucher";

type UploadAndLinkDependencies = {
  quotationId: string | number;
  uploadedBy?: string;
  uploadFile: (file: File, folder: string) => Promise<any>;
  upsertVoucherMedia: (quotationId: string | number, media: SourceVoucherMedia) => Promise<any>;
  deleteFile: (url: string) => Promise<any>;
};

/** La limpieza pertenece al guardado del vínculo, nunca al refresco de la vista. */
export const uploadAndLinkVoucherMedia = async (
  file: File,
  dependencies: UploadAndLinkDependencies,
): Promise<SourceVoucherMedia> => {
  const result = await dependencies.uploadFile(file, "voucher-media");
  const uploaded = buildSourceVoucherMedia(result, dependencies.uploadedBy, "cotizacion_voucher_media");
  if (!uploaded) throw new Error("Tigris no devolvió una referencia válida del archivo.");

  let response: any;
  try {
    response = await dependencies.upsertVoucherMedia(dependencies.quotationId, uploaded);
  } catch (error) {
    try {
      // El backend también rechaza la eliminación si el vínculo ya fue guardado
      // y la respuesta se perdió antes de llegar al navegador.
      await dependencies.deleteFile(uploaded.url);
    } catch {
      // Conservar el error del guardado para permitir reintentar.
    }
    throw error;
  }
  return normalizeSourceVoucher(response?.voucherMedia || response?.voucher_media || uploaded) || uploaded;
};
