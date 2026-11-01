// Diagnostic only: run unchanged controller against a real temporary upload dir.
// Storage failure is injected; the user's DB and upload directory are never used.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'research-upload-retention-'));
  const uploads = path.join(temp, 'uploads');
  fs.mkdirSync(uploads);
  let attempts = 0;
  const moduleFixture = { exports: {} };
  const metadata = { title: 'Diagnostic', authors: [], abstract: 'Abstract', year: 2025 };
  const dependency = name => {
    if (name === 'path') return path;
    if (name === 'fs') return fs;
    if (name === 'pdf-parse') return { PDFParse: class { async getText() { return { text: 'PDF text' }; } async destroy() {} } };
    if (name === '../models/paperModel') return { async create() { attempts++; throw new Error('Injected persistence failure'); } };
    if (name === '../services/pdfMetadata') return { parseLocalText: () => metadata, enrichWithGrobid: async () => metadata };
    throw new Error(`Unexpected dependency: ${name}`);
  };
  try {
    const source = fs.readFileSync(path.join(root, 'backend/controllers/uploadController.js'), 'utf8');
    new Function('require', 'module', 'exports', '__dirname', source)(dependency, moduleFixture, moduleFixture.exports, path.join(temp, 'controllers'));
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    const buffer = Buffer.from('Probe PDF bytes');
    await moduleFixture.exports.uploadPaper({ body: {}, file: { buffer, originalname: 'probe.pdf' } }, response);
    const files = fs.readdirSync(uploads);
    assert.equal(response.statusCode, 422);
    assert.equal(attempts, 1);
    assert.equal(files.length, 1);
    assert.deepEqual(fs.readFileSync(path.join(uploads, files[0])), buffer);
    console.log(JSON.stringify({ status: response.statusCode, response: response.body, persistenceAttempts: attempts, retainedFiles: files.length, retainedOriginalBytes: true, classification: 'Confirmed retention; desired rollback/retention policy is unspecified' }, null, 2));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
