import test from 'node:test';
import assert from 'node:assert/strict';
import { isoToReviewDate, reviewDateToIso, invalidReviewDates } from '../identityReviewDates.js';

test('assistant dates display day/month/year while transport stays ISO', () => {
  for (const [iso, display] of [['1990-01-02', '02/01/1990'], ['2032-06-15', '15/06/2032'], ['2000-02-29', '29/02/2000']]) {
    assert.equal(isoToReviewDate(iso), display);
    assert.equal(reviewDateToIso(display), iso);
    assert.equal(reviewDateToIso(display.replaceAll('/', '-')), iso);
  }
  assert.equal(isoToReviewDate(null), '');
});
test('impossible, incomplete and ambiguous dates cannot be sent', () => {
  for (const value of ['', '31/04/2032', '29/02/1900', '30/02/2032', '15/13/2032', '00/01/2032', '01/01/0000', '1/2/2032', '2032-06-15', '15/06/32']) {
    assert.equal(reviewDateToIso(value), '', value);
  }
  assert.equal(reviewDateToIso('29/02/2000'), '2000-02-29');
  assert.equal(reviewDateToIso('15/06/2000'), '2000-06-15'); // Expired documents remain reviewable.
  assert.deepEqual(invalidReviewDates({ fields: ['fecha_nacimiento', 'fecha_caducidad'], dateText: { fecha_nacimiento: '02/01/1990', fecha_caducidad: '31/04/2032' } }), ['fecha_caducidad']);
  assert.deepEqual(invalidReviewDates({ fields: ['nombres'], dateText: { fecha_caducidad: '' } }), []);
});
