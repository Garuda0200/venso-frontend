import test from 'node:test';
import assert from 'node:assert/strict';
import { identityDocumentMime, normalizeIdentityDocumentFile } from '../../../../../../../services/identityDocumentFile';
import { createDocumentAiService } from '../../../../../../../services/documentAiService';

test('JFIF conserva sus bytes y se envía como JPEG desde el servicio autenticado', async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);
  for (const type of ['', 'application/octet-stream', 'image/jfif', 'image/pjpeg', 'image/jpg']) {
    const file = new File([bytes], 'pasaporte.JFIF', { type, lastModified: 123 });
    const normalized = await normalizeIdentityDocumentFile(file);
    assert.equal(normalized.type, 'image/jpeg');
    assert.equal(normalized.name, file.name);
    assert.equal(normalized.lastModified, 123);
    assert.deepEqual(new Uint8Array(await normalized.arrayBuffer()), bytes);
    const client = createDocumentAiService({ post: async (path, body) => {
      assert.equal(path, '/turismo/document-ai/assets');
      assert.equal(body.get('file').type, 'image/jpeg');
      assert.equal(body.get('file').name, 'document');
      assert.equal(body.get('passenger_id'), '7');
      return { data: { saved: true } };
    }});
    assert.deepEqual(await client.uploadAsset({ quote: 'SYNTHETIC', voucher: 2, passenger: 7, category: 'passport', file }), { saved: true });
  }
});

test('una extensión JFIF no convierte un texto ni un PNG en JPEG', async () => {
  for (const bytes of [new Uint8Array([1, 2, 3]), new Uint8Array([137, 80, 78, 71])]) {
    await assert.rejects(normalizeIdentityDocumentFile(new File([bytes], 'false.jfif', { type: '' })), /no es válida/);
  }
  assert.equal(identityDocumentMime({ fileType: 'image/jfif', filename: 'guardado.jfif' }), 'image/jpeg');
  assert.equal(identityDocumentMime({ type: 'image/gif', name: 'false.jfif' }), '');
});
