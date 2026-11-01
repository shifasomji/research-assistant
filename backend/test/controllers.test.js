const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const fs = require('node:fs');

// Replace storage before importing controllers: never open the user's SQLite DB.
const model = {};
require.cache[require.resolve('../models/paperModel')] = { exports: model };
const metadata = require('../services/pdfMetadata');
const parsedText = 'A research paper\nAbstract\nUseful findings from 2024.';
const destroy = mock.fn(async () => {});
const getText = mock.fn(async () => ({ text: parsedText }));
require.cache[require.resolve('pdf-parse')] = { exports: { PDFParse: class {
  getText = getText;
  destroy = destroy;
} } };
const search = require('../controllers/searchController');
const library = require('../controllers/libraryController');
const llm = require('../controllers/llmController');
const upload = require('../controllers/uploadController');
let res;
const originalKey = process.env.OPENAI_API_KEY;
beforeEach(() => {
  for (const name of ['list', 'findById', 'create', 'remove']) model[name] = mock.fn(async () => null);
  mock.method(axios, 'get', async () => { throw new Error('Unexpected HTTP GET'); });
  mock.method(axios, 'post', async () => { throw new Error('Unexpected HTTP POST'); });
  mock.method(fs, 'writeFileSync', () => {});
  getText.mock.resetCalls(); destroy.mock.resetCalls();
  process.env.OPENAI_API_KEY = 'test-only';
  res = { code: 200, body: undefined, status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }, send() { return this; } };
});
afterEach(() => {
  mock.restoreAll();
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
});

test('search rejects absent and whitespace queries without contacting providers', async () => {
  for (const query of [undefined, '', '   ']) {
    await search.searchPapers({ query: { query } }, res);
    assert.equal(res.code, 400);
  }
  assert.equal(axios.get.mock.callCount(), 0);
});
test('search normalizes Semantic Scholar papers, trims query and caps limit', async () => {
  axios.get.mock.mockImplementation(async () => ({ data: { data: [{ paperId: 's1', title: 'Paper', authors: [{ name: 'Ada' }], abstract: '&lt;p&gt;A &amp;amp; B&lt;/p&gt;', openAccessPdf: { url: 'https://example.org/p.pdf' } }] } }));
  await search.searchPapers({ query: { query: ' AI ', limit: 100 } }, res);
  assert.deepEqual(axios.get.mock.calls[0].arguments[1].params.query, 'AI');
  assert.equal(axios.get.mock.calls[0].arguments[1].params.limit, 50);
  assert.deepEqual(res.body[0], { id: 's1', title: 'Paper', authors: ['Ada'], abstract: 'A & B', year: undefined, link: 'https://example.org/p.pdf' });
});
for (const empty of [false, true]) test(`search falls back to Crossref after ${empty ? 'empty results' : 'provider failure'}`, async () => {
  let calls = 0;
  axios.get.mock.mockImplementation(async () => {
    if (++calls === 1) { if (empty) return { data: { data: [] } }; throw new Error('429'); }
    return { data: { message: { items: [{ DOI: '10/test', author: [{ given: 'Ada', family: 'Lovelace' }], published: { 'date-parts': [[2024]] } }] } } };
  });
  await search.searchPapers({ query: { query: 'AI' } }, res);
  assert.equal(calls, 2);
  assert.equal(res.body[0].title, 'Untitled paper');
  assert.deepEqual(res.body[0].authors, ['Ada Lovelace']);
  assert.equal(res.body[0].year, 2024);
  assert.equal(res.body[0].link, 'https://doi.org/10/test');
});
test('search reports total provider failure', async () => {
  await search.searchPapers({ query: { query: 'AI' } }, res);
  assert.equal(res.code, 502);
});
test('save cleans abstract and persists search source', async () => {
  model.create.mock.mockImplementation(async paper => ({ ...paper, id: 1 }));
  await search.savePaper({ body: { title: 'Paper', abstract: '<p>Result</p>', source: 'upload' } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.abstract, 'Result');
  assert.equal(res.body.source, 'search');
});
for (const [handler, method, req, failure] of [
  [search.savePaper, 'create', { body: {} }, 'Unable to save paper.'],
  [library.getLibrary, 'list', {}, 'Unable to load library.'],
  [library.getPaper, 'findById', { params: { id: '1' } }, 'Unable to load paper.'],
  [library.deletePaper, 'remove', { params: { id: '1' } }, 'Unable to delete paper.'],
]) test(failure, async () => {
  model[method].mock.mockImplementation(async () => { throw new Error('database failure'); });
  await handler(req, res);
  assert.equal(res.code, 500); assert.deepEqual(res.body, { error: failure });
});
test('library lists empty and populated collections', async () => {
  for (const papers of [[], [{ id: 1, title: 'Paper' }]]) {
    model.list.mock.mockImplementation(async () => papers);
    await library.getLibrary({}, res); assert.deepEqual(res.body, papers);
  }
});
test('library retrieves and deletes existing papers and reports missing records', async () => {
  const req = { params: { id: '7' } };
  await library.getPaper(req, res); assert.equal(res.code, 404);
  model.findById.mock.mockImplementation(async () => ({ id: 7 }));
  res.code = 200;
  await library.getPaper(req, res); assert.deepEqual(res.body, { id: 7 });
  await library.deletePaper(req, res); assert.equal(res.code, 404);
  model.remove.mock.mockImplementation(async () => true);
  await library.deletePaper(req, res); assert.equal(res.code, 204);
  assert.equal(model.remove.mock.calls[0].arguments[0], '7');
});
test('AI validates input, missing papers and missing API key', async () => {
  for (const body of [{}, { paperId: 1 }, { question: 'Why?' }]) {
    await llm.askLLM({ body }, res); assert.equal(res.code, 400);
  }
  await llm.askLLM({ body: { paperId: 1, mode: 'summary' } }, res); assert.equal(res.code, 404);
  model.findById.mock.mockImplementation(async () => ({ abstract: 'Text' }));
  delete process.env.OPENAI_API_KEY;
  await llm.askLLM({ body: { paperId: 1, mode: 'summary' } }, res); assert.equal(res.code, 503);
  assert.equal(axios.post.mock.callCount(), 0);
});
for (const mode of ['summary', 'question']) test(`AI ${mode} sends grounded prompt and returns answer`, async () => {
  model.findById.mock.mockImplementation(async () => ({ fullText: 'x'.repeat(120001), abstract: 'Fallback' }));
  axios.post.mock.mockImplementation(async () => ({ data: { choices: [{ message: { content: 'Answer' } }] } }));
  await llm.askLLM({ body: { paperId: 1, mode, question: 'Why?' } }, res);
  assert.deepEqual(res.body, { answer: 'Answer' });
  const payload = axios.post.mock.calls[0].arguments[1];
  assert.equal(payload.messages[1].content.length, 120000);
  assert.match(payload.messages[0].content, mode === 'summary' ? /Summarize/ : /Question: Why\?/);
});
test('AI uses abstract fallback and reports upstream failure', async () => {
  model.findById.mock.mockImplementation(async () => ({ abstract: 'Abstract only' }));
  await llm.askLLM({ body: { paperId: 1, question: 'Why?' } }, res);
  assert.equal(axios.post.mock.calls[0].arguments[1].messages[1].content, 'Abstract only');
  assert.equal(res.code, 502);
});
test('upload requires a file', async () => {
  await upload.uploadPaper({ body: {} }, res); assert.equal(res.code, 400);
});
test('upload extracts text, sanitizes filename and respects metadata overrides', async () => {
  // GROBID failure intentionally exercises local metadata fallback.
  mock.method(console, 'warn', () => {});
  model.create.mock.mockImplementation(async paper => ({ id: 2, ...paper }));
  await upload.uploadPaper({ file: { buffer: Buffer.from('PDF fixture'), originalname: 'my paper.pdf' }, body: { title: 'Override', authors: 'Ada, Grace', year: '2025' } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.title, 'Override'); assert.deepEqual(res.body.authors, ['Ada', 'Grace']);
  assert.equal(res.body.fullText, parsedText); assert.equal(res.body.source, 'upload');
  assert.match(res.body.pdfPath, /^\/uploads\/\d+-my_paper.pdf$/);
  assert.equal(destroy.mock.callCount(), 1);
  assert.equal(fs.writeFileSync.mock.callCount(), 1);
});
test('upload reports unreadable PDF without writing storage', async () => {
  getText.mock.mockImplementationOnce(async () => { throw new Error('corrupt PDF'); });
  await upload.uploadPaper({ file: { buffer: Buffer.from('bad'), originalname: 'bad.pdf' }, body: {} }, res);
  assert.equal(res.code, 422); assert.equal(fs.writeFileSync.mock.callCount(), 0);
});
test('local metadata handles empty text and normal academic text', () => {
  assert.deepEqual(metadata.parseLocalText('', 'scan.pdf'), { title: 'scan', authors: [], abstract: '', year: null });
  assert.equal(metadata.parseLocalText(parsedText, 'paper.pdf').year, 2024);
  assert.equal(metadata.parseLocalText(parsedText, 'paper.pdf').title, 'A research paper');
});
