const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const fs = require('node:fs');

// Replace storage before importing controllers: never open the user's SQLite DB.
const model = {};
require.cache[require.resolve('../models/paperModel')] = { exports: model };
const metadata = require('../services/pdfMetadata');
const parsedText = 'A research paper\nAbstract\nUseful findings from 2024.';
let destroy;
let getText;
require.cache[require.resolve('pdf-parse')] = { exports: { PDFParse: class {
  getText = getText;
  destroy = destroy;
} } };
const search = require('../controllers/searchController');
const library = require('../controllers/libraryController');
const llm = require('../controllers/llmController');
const upload = require('../controllers/uploadController');
let res;
const environmentNames = ['OPENAI_API_KEY', 'OPENAI_MODEL', 'GROBID_URL', 'SEMANTIC_SCHOLAR_API_KEY'];
const originalEnvironment = Object.fromEntries(environmentNames.map(name => [name, process.env[name]]));
function response() {
  return { code: 200, body: undefined, status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    send: mock.fn(function () { this.body = undefined; return this; }) };
}
beforeEach(() => {
  for (const name of ['list', 'findById', 'create', 'remove']) model[name] = mock.fn(async () => null);
  mock.method(axios, 'get', async () => { throw new Error('Unexpected HTTP GET'); });
  mock.method(axios, 'post', async () => { throw new Error('Unexpected HTTP POST'); });
  mock.method(fs, 'writeFileSync', () => {});
  getText = mock.fn(async () => ({ text: parsedText }));
  destroy = mock.fn(async () => {});
  for (const name of environmentNames) delete process.env[name];
  process.env.OPENAI_API_KEY = 'test-only';
  res = response();
});
afterEach(() => {
  mock.restoreAll();
  for (const name of environmentNames) {
    if (originalEnvironment[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnvironment[name];
  }
});

test('search rejects absent and whitespace queries without contacting providers', async () => {
  for (const query of [undefined, '', '   ']) {
    res = response();
    await search.searchPapers({ query: { query } }, res);
    assert.equal(res.code, 400);
    assert.deepEqual(res.body, { error: 'A search query is required.' });
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
  assert.equal(res.code, 200);
  assert.deepEqual(axios.get.mock.calls.map(call => call.arguments[0]), [
    'https://api.semanticscholar.org/graph/v1/paper/search', 'https://api.crossref.org/works',
  ]);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].id, '10/test');
  assert.equal(res.body[0].abstract, 'No abstract available.');
  assert.equal(res.body[0].title, 'Untitled paper');
  assert.deepEqual(res.body[0].authors, ['Ada Lovelace']);
  assert.equal(res.body[0].year, 2024);
  assert.equal(res.body[0].link, 'https://doi.org/10/test');
});
test('search reports total provider failure', async () => {
  await search.searchPapers({ query: { query: 'AI' } }, res);
  assert.equal(res.code, 502);
  assert.deepEqual(res.body, { error: 'Paper search is temporarily unavailable.' });
  assert.equal(axios.get.mock.callCount(), 2);
  assert.equal(model.create.mock.callCount(), 0);
});
test('save cleans abstract and persists search source', async () => {
  model.create.mock.mockImplementation(async paper => ({ ...paper, id: 1 }));
  await search.savePaper({ body: { title: 'Paper', abstract: '<p>Result</p>', source: 'upload' } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.abstract, 'Result');
  assert.equal(res.body.source, 'search');
  assert.deepEqual(model.create.mock.calls[0].arguments[0], { title: 'Paper', abstract: 'Result', source: 'search' });
  assert.equal(res.body.id, 1);
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
    res = response();
    await library.getLibrary({}, res); assert.deepEqual(res.body, papers);
    assert.equal(res.code, 200);
  }
});
test('library retrieves and deletes existing papers and reports missing records', async () => {
  const req = { params: { id: '7' } };
  await library.getPaper(req, res); assert.equal(res.code, 404);
  assert.deepEqual(res.body, { error: 'Paper not found.' });
  assert.equal(model.findById.mock.calls[0].arguments[0], '7');
  model.findById.mock.mockImplementation(async () => ({ id: 7 }));
  res = response();
  await library.getPaper(req, res); assert.deepEqual(res.body, { id: 7 });
  assert.equal(res.code, 200);
  res = response();
  await library.deletePaper(req, res); assert.equal(res.code, 404);
  assert.deepEqual(res.body, { error: 'Paper not found.' });
  assert.equal(res.send.mock.callCount(), 0);
  res = response();
  model.remove.mock.mockImplementation(async () => true);
  await library.deletePaper(req, res); assert.equal(res.code, 204);
  assert.equal(model.remove.mock.calls[0].arguments[0], '7');
  assert.equal(model.remove.mock.calls[1].arguments[0], '7');
  assert.equal(res.send.mock.callCount(), 1);
  assert.equal(res.body, undefined);
});
test('AI validates input, missing papers and missing API key', async () => {
  for (const body of [{}, { paperId: 1 }, { question: 'Why?' }]) {
    res = response();
    await llm.askLLM({ body }, res); assert.equal(res.code, 400);
    assert.deepEqual(res.body, { error: 'A paper and question are required.' });
  }
  assert.equal(model.findById.mock.callCount(), 0);
  await llm.askLLM({ body: { paperId: 1, mode: 'summary' } }, res); assert.equal(res.code, 404);
  assert.deepEqual(res.body, { error: 'Paper not found.' });
  model.findById.mock.mockImplementation(async () => ({ abstract: 'Text' }));
  delete process.env.OPENAI_API_KEY;
  await llm.askLLM({ body: { paperId: 1, mode: 'summary' } }, res); assert.equal(res.code, 503);
  assert.deepEqual(res.body, { error: 'Set OPENAI_API_KEY in backend/.env to enable AI features.' });
  assert.equal(axios.post.mock.callCount(), 0);
});
for (const mode of ['summary', 'question']) test(`AI ${mode} sends grounded prompt and returns answer`, async () => {
  const fullText = 'Source evidence: intervention improved accuracy. '.repeat(3000);
  model.findById.mock.mockImplementation(async () => ({ fullText, abstract: 'Fallback that must not be used' }));
  axios.post.mock.mockImplementation(async () => ({ data: { choices: [{ message: { content: 'Answer' } }] } }));
  await llm.askLLM({ body: { paperId: 1, mode, question: 'Why?' } }, res);
  assert.deepEqual(res.body, { answer: 'Answer' });
  const payload = axios.post.mock.calls[0].arguments[1];
  assert.equal(res.code, 200);
  assert.equal(axios.post.mock.callCount(), 1);
  assert.equal(model.findById.mock.calls[0].arguments[0], 1);
  assert.equal(axios.post.mock.calls[0].arguments[0], 'https://api.openai.com/v1/chat/completions');
  assert.deepEqual(payload.messages.map(message => message.role), ['system', 'user']);
  assert.equal(payload.messages[1].content, fullText.slice(0, 120000));
  assert.equal(payload.messages[1].content.length, 120000);
  const instructions = payload.messages[0].content;
  if (mode === 'summary') {
    assert.match(instructions, /summari[sz]e.*paper/i);
    for (const topic of ['contribution', 'method', 'results', 'limitations']) assert.match(instructions, new RegExp(topic, 'i'));
  } else {
    assert.match(instructions, /only.*paper text/i);
    assert.match(instructions, /answer.*not present.*say so/i);
    assert.ok(instructions.includes('Why?'));
  }
  assert.deepEqual(axios.post.mock.calls[0].arguments[2].headers, { Authorization: 'Bearer test-only' });
});
test('AI uses abstract fallback and reports upstream failure', async () => {
  model.findById.mock.mockImplementation(async () => ({ abstract: 'Abstract only' }));
  await llm.askLLM({ body: { paperId: 1, question: 'Why?' } }, res);
  assert.equal(axios.post.mock.calls[0].arguments[1].messages[1].content, 'Abstract only');
  assert.equal(res.code, 502);
  assert.deepEqual(res.body, { error: 'The AI service could not answer right now.' });
});
test('upload requires a file', async () => {
  await upload.uploadPaper({ body: {} }, res); assert.equal(res.code, 400);
  assert.deepEqual(res.body, { error: 'Please upload a PDF file.' });
  assert.equal(getText.mock.callCount(), 0);
  assert.equal(fs.writeFileSync.mock.callCount(), 0);
  assert.equal(model.create.mock.callCount(), 0);
});
test('upload extracts text, sanitizes filename and respects metadata overrides', async () => {
  // GROBID failure intentionally exercises local metadata fallback.
  mock.method(console, 'warn', () => {});
  model.create.mock.mockImplementation(async paper => ({ id: 2, ...paper }));
  await upload.uploadPaper({ file: { buffer: Buffer.from('PDF fixture'), originalname: 'my paper.pdf' }, body: { title: 'Override', authors: ' Ada,  Grace ', abstract: 'Override abstract', year: '2025' } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.title, 'Override'); assert.deepEqual(res.body.authors, ['Ada', 'Grace']);
  assert.equal(res.body.year, '2025');
  assert.equal(res.body.abstract, 'Override abstract');
  assert.deepEqual(model.create.mock.calls[0].arguments[0], {
    title: 'Override', authors: ['Ada', 'Grace'], abstract: 'Override abstract', year: '2025',
    fullText: parsedText, source: 'upload', pdfPath: res.body.pdfPath,
  });
  assert.equal(res.body.fullText, parsedText); assert.equal(res.body.source, 'upload');
  assert.match(res.body.pdfPath, /^\/uploads\/\d+-my_paper.pdf$/);
  assert.equal(destroy.mock.callCount(), 1);
  assert.equal(fs.writeFileSync.mock.callCount(), 1);
});
test('upload reports unreadable PDF without writing storage', async () => {
  getText.mock.mockImplementationOnce(async () => { throw new Error('corrupt PDF'); });
  await upload.uploadPaper({ file: { buffer: Buffer.from('bad'), originalname: 'bad.pdf' }, body: {} }, res);
  assert.equal(res.code, 422); assert.equal(fs.writeFileSync.mock.callCount(), 0);
  assert.deepEqual(res.body, { error: 'The PDF could not be processed.' });
  assert.equal(model.create.mock.callCount(), 0);
  assert.equal(axios.post.mock.callCount(), 0);
});
test('local metadata handles empty text and normal academic text', () => {
  assert.deepEqual(metadata.parseLocalText('', 'scan.pdf'), { title: 'scan', authors: [], abstract: '', year: null });
  assert.equal(metadata.parseLocalText(parsedText, 'paper.pdf').year, 2024);
  assert.equal(metadata.parseLocalText(parsedText, 'paper.pdf').title, 'A research paper');
});

// Round 1: provider variation and upload failure paths.
test('Semantic Scholar fills missing fields and selects DOI, URL and PDF links in priority order', async () => {
  const original = process.env.SEMANTIC_SCHOLAR_API_KEY;
  process.env.SEMANTIC_SCHOLAR_API_KEY = 'coverage-test-key';
  try {
    axios.get.mock.mockImplementation(async () => ({ data: { data: [
      { externalIds: { DOI: '10/doi' }, url: 'https://paper.test/1' },
      { url: 'https://paper.test/2', authors: [] },
      { paperId: 's3', externalIds: {}, openAccessPdf: {} },
    ] } }));
    await search.searchPapers({ query: { query: 'metadata', limit: 'invalid' } }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body, [
      { id: '10/doi', title: 'Untitled paper', authors: [], abstract: 'No abstract available.', year: undefined, link: 'https://paper.test/1' },
      { id: 'https://paper.test/2', title: 'Untitled paper', authors: [], abstract: 'No abstract available.', year: undefined, link: 'https://paper.test/2' },
      { id: 's3', title: 'Untitled paper', authors: [], abstract: 'No abstract available.', year: undefined, link: '' },
    ]);
    assert.equal(axios.get.mock.calls[0].arguments[1].params.limit, 10);
    assert.deepEqual(axios.get.mock.calls[0].arguments[1].headers, { 'x-api-key': 'coverage-test-key' });
  } finally {
    if (original === undefined) delete process.env.SEMANTIC_SCHOLAR_API_KEY;
    else process.env.SEMANTIC_SCHOLAR_API_KEY = original;
  }
});
test('missing Semantic Scholar data falls back to Crossref with title, partial authors and explicit URL', async () => {
  axios.get.mock.mockImplementation(async url => url.includes('semanticscholar') ? { data: {} } : { data: { message: { items: [
    { DOI: '10/test', title: ['Crossref title'], author: [{ given: 'Ada' }, { family: 'Lovelace' }, {}], abstract: '<p>A finding</p>', URL: 'https://publisher.test' },
    { DOI: '10/missing', published: {} },
  ] } } });
  await search.searchPapers({ query: { query: 'fallback', limit: 3 } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, [
    { id: '10/test', title: 'Crossref title', authors: ['Ada', 'Lovelace', ''], abstract: 'A finding', year: undefined, link: 'https://publisher.test' },
    { id: '10/missing', title: 'Untitled paper', authors: [], abstract: 'No abstract available.', year: undefined, link: 'https://doi.org/10/missing' },
  ]);
  assert.equal(axios.get.mock.calls[1].arguments[1].params.rows, 3);
});
test('missing Crossref items returns an empty successful result', async () => {
  axios.get.mock.mockImplementation(async url => url.includes('semanticscholar') ? { data: {} } : { data: { message: {} } });
  await search.searchPapers({ query: { query: 'empty' } }, res);
  assert.equal(res.code, 200); assert.deepEqual(res.body, []);
});
test('upload uses extracted metadata when overrides are absent', async () => {
  const abstract = 'Important research findings from the remote metadata service. '.repeat(3).trim();
  axios.post.mock.mockImplementation(async () => ({ data: `<title>Extracted title</title><author><forename>Ada</forename><surname>Lovelace</surname></author><abstract>${abstract}</abstract><date>2026</date>` }));
  model.create.mock.mockImplementation(async paper => ({ id: 9, ...paper }));
  const buffer = Buffer.from('PDF fixture');
  await upload.uploadPaper({ file: { buffer, originalname: 'paper.pdf' }, body: {} }, res);
  assert.equal(res.code, 201);
  assert.deepEqual(model.create.mock.calls[0].arguments[0], {
    title: 'Extracted title', authors: ['Ada Lovelace'], abstract, year: 2026,
    pdfPath: res.body.pdfPath, fullText: parsedText, source: 'upload',
  });
  assert.strictEqual(fs.writeFileSync.mock.calls[0].arguments[1], buffer);
  assert.ok(fs.writeFileSync.mock.calls[0].arguments[0].endsWith(res.body.pdfPath));
  assert.equal(destroy.mock.callCount(), 1);
});
test('upload abstract override takes precedence over extracted abstract', async () => {
  mock.method(console, 'warn', () => {});
  model.create.mock.mockImplementation(async paper => paper);
  await upload.uploadPaper({ file: { buffer: Buffer.from('PDF'), originalname: 'paper.pdf' }, body: { abstract: 'User abstract' } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.abstract, 'User abstract');
});
for (const stage of ['write', 'database']) test(`upload reports ${stage} failure and stops subsequent work`, async () => {
  mock.method(console, 'warn', () => {});
  if (stage === 'write') fs.writeFileSync.mock.mockImplementation(() => { throw new Error('disk full'); });
  else model.create.mock.mockImplementation(async () => { throw new Error('database unavailable'); });
  await upload.uploadPaper({ file: { buffer: Buffer.from('PDF'), originalname: 'paper.pdf' }, body: {} }, res);
  assert.equal(res.code, 422);
  assert.deepEqual(res.body, { error: 'The PDF could not be processed.' });
  assert.equal(model.create.mock.callCount(), stage === 'write' ? 0 : 1);
  assert.equal(fs.writeFileSync.mock.callCount(), 1);
});

// PDFParse's installed README requires destroy() in finally, including getText errors.
test('[DEFECT] upload destroys the PDF parser when text extraction fails', async () => {
  getText.mock.mockImplementationOnce(async () => { throw new Error('corrupt PDF'); });
  await upload.uploadPaper({ file: { buffer: Buffer.from('bad'), originalname: 'bad.pdf' }, body: {} }, res);
  assert.equal(res.code, 422);
  assert.deepEqual(res.body, { error: 'The PDF could not be processed.' });
  assert.equal(model.create.mock.callCount(), 0);
  assert.equal(fs.writeFileSync.mock.callCount(), 0);
  assert.equal(destroy.mock.callCount(), 1, 'parser must be destroyed even after getText rejects');
});
