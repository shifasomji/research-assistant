// Controlled, in-memory CommonJS mutations. Never writes production source.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const round1Ref = '88bfcef3f867b6a1fac9bd0d970cd474f4548055';
const cases = [
  { id: 'search-author', file: 'backend/controllers/searchController.js', from: '.map((author) => author.name)', to: ".map(() => 'Wrong author')", testFile: 'test/controllers.test.js', pattern: '^search normalizes Semantic Scholar' },
  { id: 'metadata-title', file: 'backend/services/pdfMetadata.js', from: 'title: parsed.title || fallback.title,', to: 'title: fallback.title,', testFile: 'test/pdfMetadata.test.js', pattern: '^GROBID extracts and cleans metadata' },
  { id: 'deletion-id', file: 'backend/controllers/libraryController.js', from: 'paperModel.remove(req.params.id)', to: "paperModel.remove('wrong-id')", testFile: 'test/controllers.test.js', pattern: '^library retrieves and deletes existing papers' },
  { id: 'AI-validation', file: 'backend/controllers/llmController.js', from: "if (!paperId || !question && mode !== 'summary')", to: 'if (false)', testFile: 'test/controllers.test.js', pattern: '^AI validates input' },
  { id: 'upload-year-override', file: 'backend/controllers/uploadController.js', from: 'year: req.body.year || metadata.year,', to: 'year: metadata.year,', testFile: 'test/controllers.test.js', pattern: '^upload extracts text, sanitizes filename and respects metadata overrides$' },
  { id: 'AI-source-substitution', file: 'backend/controllers/llmController.js', from: 'content: (paper.fullText || paper.abstract).slice(0, 120000)', to: "content: paper.fullText ? 'z'.repeat(paper.fullText.slice(0, 120000).length) : paper.abstract.slice(0, 120000)", testFile: 'test/controllers.test.js', pattern: '^AI question sends grounded prompt and returns answer$' },
];
if (process.env.ROUND2_CASE) {
  const target = cases.find(item => item.id === process.env.ROUND2_CASE);
  if (!target) throw new Error('Unknown mutation');
  const Module = require('node:module');
  const original = Module._extensions['.js'];
  Module._extensions['.js'] = (module, filename) => {
    const isTarget = filename === path.join(root, target.file);
    const isHistoricalTest = process.env.ROUND2_VERSION === 'round1' && filename === path.join(root, 'backend', target.testFile);
    if (!isTarget && !isHistoricalTest) return original(module, filename);
    let source = isHistoricalTest
      ? cp.execFileSync('git', ['show', `${round1Ref}:backend/${target.testFile}`], { cwd: root, encoding: 'utf8' })
      : fs.readFileSync(filename, 'utf8');
    if (isTarget && process.env.ROUND2_MUTATE === '1') {
      if (source.split(target.from).length !== 2) throw new Error('Mutation target must occur exactly once');
      source = source.replace(target.from, target.to);
      console.log(`[mutation applied] ${target.id}`);
    }
    module._compile(source, filename);
  };
} else {
  const results = [];
  for (const version of ['round1', 'round2']) {
    for (const target of cases) {
      const runs = [];
      for (const mutate of ['0', '1']) {
        const result = cp.spawnSync(process.execPath, ['--require', __filename, '--test', '--test-name-pattern', target.pattern, target.testFile], {
          cwd: path.join(root, 'backend'), encoding: 'utf8',
          env: { ...process.env, ROUND2_CASE: target.id, ROUND2_VERSION: version, ROUND2_MUTATE: mutate },
        });
        const output = result.stdout + result.stderr;
        const log = `${version}-${target.id}-${mutate === '1' ? 'mutant' : 'control'}.log`;
        fs.writeFileSync(path.join(__dirname, log), output);
        if (result.error || result.signal || !/tests 1\b/.test(output)) throw new Error(`Invalid run: ${log}`);
        if (mutate === '0' && result.status !== 0) throw new Error(`Control failed: ${log}`);
        if (mutate === '1' && !output.includes(`[mutation applied] ${target.id}`)) throw new Error(`Mutation not loaded: ${log}`);
        runs.push(result.status);
      }
      results.push({ version, mutation: target.id, test: target.pattern, controlExitCode: runs[0], mutantExitCode: runs[1], detected: runs[1] !== 0 });
    }
  }
  fs.writeFileSync(path.join(__dirname, 'mutation-results.json'), JSON.stringify(results, null, 2) + '\n');
  for (const version of ['round1', 'round2']) {
    const group = results.filter(result => result.version === version);
    console.log(`${version}: ${group.filter(result => result.detected).length}/${group.length} mutations detected; all controls pass`);
  }
}
