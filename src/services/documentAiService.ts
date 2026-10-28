// Session/CSRF protected backend only. The browser never knows the Gemini key,
// Tigris credentials or n8n URL. Files go only to the authenticated backend;
// extraction requests contain saved document IDs, never browser-supplied URLs.
export function createDocumentAiService(client) {
  const base = '/turismo/document-ai';
  const data = promise => promise.then(response => response.data);
  return {
    uploadAsset: ({ quote, voucher, passenger, category, file }, signal) => {
      const body = new FormData();
      body.append('cotizacion_id', quote); body.append('voucher_id', String(voucher));
      if (passenger != null) body.append('passenger_id', String(passenger));
      body.append('documento_tipo', category);
      // Opaque filename: the original can contain passenger names/identity numbers.
      body.append('file', file, 'document');
      return data(client.post(`${base}/assets`, body, { signal, timeout: 120000 }));
    },
    capabilities: (quote, voucher, signal) => data(client.get(`${base}/capabilities`, { params: { cotizacion_id: quote, voucher_id: voucher }, signal, _skipDedup: true })),
    documents: (voucher, signal) => data(client.get(`/turismo/vouchers-venta/${encodeURIComponent(voucher)}/documentos`, { signal, _skipDedup: true })),
    createBatch: (body, signal) => data(client.post(`${base}/jobs/from-documents`, body, { signal })),
    job: (jobId, signal) => data(client.get(`${base}/jobs/${encodeURIComponent(jobId)}`, { signal, _skipDedup: true })),
    candidates: (jobId, offset, signal) => data(client.get(`${base}/jobs/${encodeURIComponent(jobId)}/candidates`, { params: { offset, limit: 100 }, signal, _skipDedup: true })),
    cancel: (jobId, signal) => data(client.post(`${base}/jobs/${encodeURIComponent(jobId)}/cancel`, {}, { signal })),
    review: (candidateId, body, signal) => data(client.post(`${base}/candidates/${encodeURIComponent(candidateId)}/review`, body, { signal })),
    apply: (reviewId, signal) => data(client.post(`${base}/reviews/${encodeURIComponent(reviewId)}/apply`, {}, { signal })),
  };
}
let service;
export async function getDocumentAiService() {
  if (!service) service = import('../utils/axiosInstance').then(module => createDocumentAiService(module.default));
  return service;
}
