// Run: node --experimental-strip-types --test src/api/upload-dedup.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  planUploads,
  possibleDuplicatesMessage,
  possibleDuplicatesTitle,
  refusesField,
  skippedSummary,
  UPLOAD_CHECK_MAX_FILES,
} from './upload-dedup.ts';

const AT = Date.UTC(2026, 9, 18, 14, 30);
const files = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `f${i}`, name: `IMG_${i}.JPG`, size: 1000 + i, lastModified: AT }));
const describeFile = (f) => ({ name: f.name, size: f.size, lastModified: f.lastModified });
const ids = (list) => list.map((f) => f.id);

describe('planUploads', () => {
  it('sends what is new, skips what is already there, and holds back what might be', async () => {
    const batch = files(4);
    const plan = await planUploads(batch, describeFile, async () => ({
      matches: [
        { index: 1, match: 'exact' },
        { index: 3, match: 'possible', reason: 'unverified' },
      ],
    }));
    assert.deepEqual(ids(plan.upload), ['f0', 'f2']);
    assert.deepEqual(ids(plan.duplicates), ['f1']);
    assert.deepEqual(ids(plan.possible), ['f3']);
    assert.equal(plan.checked, true);
  });

  it('describes each file as name, size and modified time', async () => {
    const asked = [];
    await planUploads(files(1), describeFile, async (list) => {
      asked.push(list);
      return { matches: [] };
    });
    assert.deepEqual(asked, [[{ name: 'IMG_0.JPG', size: 1000, lastModified: AT }]]);
  });

  it('asks in pieces of 500, and maps each answer back to its own piece', async () => {
    assert.equal(UPLOAD_CHECK_MAX_FILES, 500);
    const batch = files(1100);
    const sizes = [];
    const plan = await planUploads(batch, describeFile, async (list) => {
      sizes.push(list.length);
      // Index 0 of every piece is already there.
      return { matches: [{ index: 0, match: 'exact' }] };
    });
    assert.deepEqual(sizes, [500, 500, 100]);
    assert.deepEqual(ids(plan.duplicates), ['f0', 'f500', 'f1000']);
    assert.equal(plan.upload.length, 1097);
  });

  it('uploads everything as before when the check fails', async () => {
    const batch = files(3);
    const plan = await planUploads(batch, describeFile, async () => {
      throw Object.assign(new Error('offline'), { status: 0 });
    });
    assert.deepEqual(ids(plan.upload), ['f0', 'f1', 'f2']);
    assert.deepEqual(plan.duplicates, []);
    assert.deepEqual(plan.possible, []);
    assert.equal(plan.checked, false);
  });

  it('uploads everything as before when the check takes too long', async () => {
    const plan = await planUploads(files(2), describeFile, () => new Promise(() => {}), {
      timeoutMs: 20,
    });
    assert.equal(plan.upload.length, 2);
    assert.equal(plan.checked, false);
  });

  it('keeps what earlier pieces found, and stops asking after one fails', async () => {
    let calls = 0;
    const plan = await planUploads(files(1200), describeFile, async () => {
      calls += 1;
      if (calls === 2) throw new Error('server error');
      return { matches: [{ index: 0, match: 'exact' }] };
    });
    // Waiting out a dead connection once per piece would hold the upload.
    assert.equal(calls, 2);
    assert.deepEqual(ids(plan.duplicates), ['f0']);
    assert.equal(plan.upload.length, 1199);
    assert.equal(plan.checked, false);
  });

  it('ignores an answer it cannot make sense of, rather than skip on it', async () => {
    const batch = files(3);
    for (const answer of [
      null,
      {},
      { matches: 'yes' },
      { matches: [{ index: 9, match: 'exact' }, { index: 1.5, match: 'exact' }, { index: 0, match: 'certainly' }, null] },
    ]) {
      const plan = await planUploads(batch, describeFile, async () => answer);
      assert.deepEqual(ids(plan.upload), ['f0', 'f1', 'f2']);
      assert.equal(plan.duplicates.length + plan.possible.length, 0);
    }
  });

  it('asks nothing for an empty batch', async () => {
    let asked = false;
    const plan = await planUploads([], describeFile, async () => {
      asked = true;
      return { matches: [] };
    });
    assert.equal(asked, false);
    assert.deepEqual(plan, { upload: [], duplicates: [], possible: [], checked: true });
  });
});

describe('refusesField', () => {
  // The API refuses unknown keys with a 400 (forbidNonWhitelisted), so a new
  // client confirming against an API from before `lastModified` must notice
  // and send the confirm again without it, or every upload fails at the end.
  const refusal = (field) =>
    Object.assign(new Error('Bad Request'), {
      status: 400,
      body: { statusCode: 400, message: [`property ${field} should not exist`], error: 'Bad Request' },
    });

  it('recognises an older API refusing the field', () => {
    assert.equal(refusesField(refusal('lastModified'), 'lastModified'), true);
  });

  it('recognises it in the message when there is no body', () => {
    const err = Object.assign(new Error('property lastModified should not exist'), { status: 400 });
    assert.equal(refusesField(err, 'lastModified'), true);
  });

  it('is not fooled by any other failure', () => {
    assert.equal(refusesField(refusal('clientId'), 'lastModified'), false);
    assert.equal(refusesField(Object.assign(refusal('lastModified'), { status: 500 }), 'lastModified'), false);
    assert.equal(refusesField(Object.assign(new Error('offline'), { status: 0 }), 'lastModified'), false);
    assert.equal(refusesField(null, 'lastModified'), false);
    assert.equal(refusesField('nope', 'lastModified'), false);
  });
});

describe('the words', () => {
  it('says how many were skipped', () => {
    assert.equal(skippedSummary(1), '1 file already uploaded, skipped');
    assert.equal(skippedSummary(37), '37 files already uploaded, skipped');
    assert.equal(skippedSummary(1234), '1,234 files already uploaded, skipped');
  });

  it('asks about possible duplicates without claiming they are the same', () => {
    assert.equal(possibleDuplicatesTitle(1), '1 file might already be uploaded');
    assert.equal(possibleDuplicatesTitle(5), '5 files might already be uploaded');
    assert.equal(
      possibleDuplicatesMessage(5, 'Reyes Wedding'),
      "Reyes Wedding already has files with the same names and sizes, but Virgo can't confirm they're the same files. Skip them, or upload them anyway?",
    );
    assert.equal(
      possibleDuplicatesMessage(1),
      "This album already has a file with the same name and size, but Virgo can't confirm it's the same file. Skip it, or upload it anyway?",
    );
  });
});
