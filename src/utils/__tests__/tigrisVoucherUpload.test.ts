import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTigrisUploadResponse } from "../tigrisUploadResponse";
import { buildSourceVoucherMedia } from "../../pages/Ventas/Cotizaciones/utils/sourceVoucher";
import { uploadAndLinkVoucherMedia } from "../../pages/Ventas/Cotizaciones/utils/voucherMediaSave";

const assetId = "fe10ee00-a54f-42f2-af0e-d253df774c90";
const uploadResponse = { success: true, url: "https://media.example.test/voucher-media/qa.pdf", media_asset_id: assetId,
  metadata: { original_name: "voucher.pdf", content_type: "application/pdf", size_bytes: 120, uploaded_at: "2026-10-31T12:00:00Z" } };

test("Tigris upload identity reaches the canonical voucher without a second registration", () => {
  const uploaded = normalizeTigrisUploadResponse(uploadResponse);
  assert.equal(uploaded.mediaAssetId, assetId);
  const media = buildSourceVoucherMedia(uploaded, "reserva-qa", "cotizacion_voucher_media");
  assert.equal(media?.mediaAssetId, assetId);
  assert.equal(media?.originalName, "voucher.pdf");
  assert.equal(media?.contentType, "application/pdf");
  assert.equal(media?.sizeBytes, 120);
});

test("generic older uploads remain compatible while invalid upload responses fail", () => {
  const { media_asset_id, ...legacy } = uploadResponse;
  assert.equal(normalizeTigrisUploadResponse(legacy).mediaAssetId, undefined);
  assert.equal(normalizeTigrisUploadResponse({ ...legacy, mediaAssetId: assetId }).mediaAssetId, assetId);
  for (const bad of [null, {}, { success: false, url: legacy.url }, { success: true, url: " " }])
    assert.throws(() => normalizeTigrisUploadResponse(bad), /URL/);
});

const dependencies = () => {
  const calls: any[] = [];
  const deps = { quotationId: "COT-QA", uploadedBy: "reserva-qa",
    uploadFile: async (_file, folder) => { calls.push(["upload", folder]); return normalizeTigrisUploadResponse(uploadResponse); },
    upsertVoucherMedia: async (id, media) => { calls.push(["link", id, media.mediaAssetId]); return { voucherMedia: media }; },
    deleteFile: async url => { calls.push(["delete", url]); },
  };
  return { calls, deps };
};

test("a saved voucher links its registered identity and retains its storage object", async () => {
  const { calls, deps } = dependencies();
  const media = await uploadAndLinkVoucherMedia({} as File, deps);
  assert.equal(media.mediaAssetId, assetId);
  assert.deepEqual(calls, [["upload", "voucher-media"], ["link", "COT-QA", assetId]]);
});

test("a failed link cleans only the just-uploaded object and retains the original error", async () => {
  const { calls, deps } = dependencies();
  const failure = new Error("No se guardó el vínculo");
  deps.upsertVoucherMedia = async () => { throw failure; };
  await assert.rejects(uploadAndLinkVoucherMedia({} as File, deps), error => error === failure);
  assert.deepEqual(calls.at(-1), ["delete", uploadResponse.url]);
});

test("a cleanup rejected for an already-linked voucher never hides the save response error", async () => {
  const { deps } = dependencies();
  const timeout = new Error("Respuesta interrumpida");
  deps.upsertVoucherMedia = async () => { throw timeout; };
  deps.deleteFile = async () => { throw new Error("409: voucher ya vinculado"); };
  await assert.rejects(uploadAndLinkVoucherMedia({} as File, deps), error => error === timeout);
});
