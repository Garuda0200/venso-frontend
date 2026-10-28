import test from 'node:test';
import assert from 'node:assert/strict';
import { isDocumentAiUiEnabled } from '../documentAiUi';
import { ageFromBirthDate, procedenciaFromCountry } from '../../../passengerIdentityDerived';

test('OCR permanece oculto en desarrollo y producción salvo activación literal', () => {
  for (const MODE of ['development','production']) {
    for (const value of [undefined,null,false,true,'false','TRUE',' true ','1','']) {
      assert.equal(isDocumentAiUiEnabled({MODE,VITE_DOCUMENT_AI_UI:value}),false);
    }
    assert.equal(isDocumentAiUiEnabled({MODE,VITE_DOCUMENT_AI_UI:'true'}),true);
  }
  assert.equal(isDocumentAiUiEnabled(null),false);
});
test('identidad deriva procedencia y edad localmente sin inventar valores', () => {
  for (const country of ['Perú','PER','PE']) assert.equal(procedenciaFromCountry(country),'Nacional');
  assert.equal(procedenciaFromCountry('México'),'Extranjero');
  assert.equal(procedenciaFromCountry(''),'');
  assert.equal(ageFromBirthDate('2000-10-07',new Date('2026-10-07T02:00:00Z')),'25');
  assert.equal(ageFromBirthDate('2000-10-07',new Date('2026-10-07T05:00:00Z')),'26');
  assert.equal(ageFromBirthDate('2026-10-07',new Date('2026-10-07T12:00:00Z')),'0');
  for(const value of ['2026-02-30','2032-01-01','']) assert.equal(ageFromBirthDate(value,new Date('2026-10-07T12:00:00Z')),'');
});
