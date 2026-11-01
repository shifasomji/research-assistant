const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { enrichWithGrobid, parseLocalText } = require('../services/pdfMetadata');
const fallback = { title: 'Local title', authors: ['Local author'], abstract: 'Local abstract', year: 2020 };
const buffer = Buffer.from('mock PDF');
const originalUrl = process.env.GROBID_URL;
beforeEach(() => {
  delete process.env.GROBID_URL;
  mock.method(axios, 'post', async () => { throw new Error('Unexpected request'); });
  mock.method(console, 'warn', () => {});
});
afterEach(() => {
  mock.restoreAll();
  if (originalUrl === undefined) delete process.env.GROBID_URL;
  else process.env.GROBID_URL = originalUrl;
});

test('GROBID extracts and cleans metadata and sends the PDF as multipart', async () => {
  process.env.GROBID_URL = 'http://grobid.test/';
  const abstract = 'A detailed study of reliable research tools and their evaluation. '.repeat(3);
  axios.post.mock.mockImplementation(async () => ({ data: `<TEI><title level="a">Useful &amp; Reliable Alphabetical author list discarded</title><author><forename>Ada</forename><surname>Lovelace</surname></author><author><surname>Grace</surname></author><author></author><abstract><p>${abstract}</p></abstract><date type="published">2025</date></TEI>` }));
  assert.deepEqual(await enrichWithGrobid(buffer, fallback), {
    title: 'Useful & Reliable', authors: ['Ada Lovelace', 'Grace'], abstract: abstract.trim(), year: 2025,
  });
  const [url, form, options] = axios.post.mock.calls[0].arguments;
  assert.equal(url, 'http://grobid.test/api/processHeaderDocument');
  assert.match(options.headers['content-type'], /^multipart\/form-data; boundary=/);
  assert.equal(options.headers.Accept, 'application/xml');
  assert.equal(options.timeout, 20000);
  assert.equal(options.maxBodyLength, Infinity);
  const multipart = form.getBuffer();
  assert.ok(multipart.includes(buffer));
  assert.match(multipart.toString(), /name="input"; filename="paper.pdf"/);
  assert.match(multipart.toString(), /Content-Type: application\/pdf/);
});

for (const [label, data] of [['empty XML', ''], ['unrecognized XML', '<unexpected>oops</unexpected>'], ['non-string response', {}]]) {
  test(`GROBID falls back for ${label}`, async () => {
    axios.post.mock.mockImplementation(async () => ({ data }));
    assert.deepEqual(await enrichWithGrobid(buffer, fallback), fallback);
    assert.equal(axios.post.mock.callCount(), 1);
  });
}
for (const abstract of ['Too short', 'For details ' + 'consult the supplementary material. '.repeat(6), 'Author contributions ' + 'appear in the supplementary material. '.repeat(6)]) {
  test(`GROBID rejects low quality abstract: ${abstract.split(' ').slice(0, 2).join(' ')}`, async () => {
    axios.post.mock.mockImplementation(async () => ({ data: `<title>Remote title</title><abstract>${abstract}</abstract><date>unknown</date>` }));
    assert.deepEqual(await enrichWithGrobid(buffer, fallback), { ...fallback, title: 'Remote title' });
    assert.equal(axios.post.mock.calls[0].arguments[0], 'http://localhost:8070/api/processHeaderDocument');
  });
}
test('GROBID connection failure returns local metadata and records a diagnostic', async () => {
  axios.post.mock.mockImplementation(async () => { throw Object.assign(new Error('offline'), { code: 'ECONNREFUSED' }); });
  assert.strictEqual(await enrichWithGrobid(buffer, fallback), fallback);
  assert.deepEqual(console.warn.mock.calls[0].arguments, ['GROBID metadata extraction unavailable: ECONNREFUSED']);
});
test('local parsing filters publication boilerplate and affiliations and cleans abstract footnotes', () => {
  const text = ['Proceedings of a conference', 'January 12 2024', 'pages 10–20', 'https://example.org', 'person@example.org', 'Purdue University', 'A meaningful research title', 'Abstract', '* See section 2 for details. Useful &amp; reproducible findings.'].join('\n');
  assert.deepEqual(parseLocalText(text, 'fallback.pdf'), { title: 'A meaningful research title', authors: [], abstract: 'Useful & reproducible findings.', year: 2024 });
});
test('local parsing falls back to case-insensitive filename without a title and finds year without abstract', () => {
  assert.deepEqual(parseLocalText('Purdue University\n2023', 'Scanned.PDF'), { title: 'Scanned', authors: [], abstract: '', year: 2023 });
});

// Intentionally failing regression. Do not change these expectations to the first XML values.
test('[DEFECT] GROBID selects article title and published year ahead of journal and generic date', async () => {
  axios.post.mock.mockImplementation(async () => ({ data: `
    <title level="m">Journal title</title>
    <title level="a">Article title</title>
    <date>2019</date>
    <date type="published">2025</date>` }));
  const result = await enrichWithGrobid(buffer, fallback);
  assert.deepEqual({ title: result.title, year: result.year }, { title: 'Article title', year: 2025 });
});
