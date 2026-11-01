# Round 1: coverage-directed test improvements

Round 1 only. No production code, existing tests, package configuration, or coverage configuration was changed by this round. Existing controller and workflow tests were extended; three new test files were added. All original tests remain intact.

## Results

| Suite | Initial tests | Added | Final passing tests |
| --- | ---: | ---: | ---: |
| Backend | 20 | 17 | 37 |
| Frontend | 13 | 19 | 32 |

| Suite / metric | Initial | Round 1 | Change (percentage points) |
| --- | ---: | ---: | ---: |
| Backend statements | 88.30% | 100.00% | +11.70 |
| Backend branches | 78.78% | 100.00% | +21.22 |
| Backend functions | 80.00% | 100.00% | +20.00 |
| Backend lines | 88.30% | 100.00% | +11.70 |
| Frontend statements | 91.39% | 100.00% | +8.61 |
| Frontend branches | 75.40% | 100.00% | +24.60 |
| Frontend functions | 79.41% | 100.00% | +20.59 |
| Frontend lines | 100.00% | 100.00% | 0.00 |

All five backend source files and all seven frontend source files in the baseline scope now report 100% on all four metrics. No final tests fail, skip, or use TODO status. React Router migration warnings remain non-fatal. `git diff --check` passes.

## Coverage method and scope

No saved custom coverage configuration was present. The backend default c8 command reproduced all four supplied baseline metrics exactly before adding tests:

```sh
cd backend
./node_modules/.bin/c8 --reporter=text --reporter=json-summary node --test
```

Backend scope remains `controllers/{library,llm,search,upload}Controller.js` and `services/pdfMetadata.js`. Default c8 measures loaded source files; it does not imply coverage of all backend files.

The frontend baseline excludes the bootstrap file `src/index.js`. CRA's bare `--coverage` includes that file and initially reported 89.47% statements / 75.40% branches / 79.41% functions / 96.22% lines. Explicitly matching the supplied source scope reproduced the provided 91.39 / 75.40 / 79.41 / 100 baseline exactly using only the original 13 tests. The same scope was used for Round 1:

```sh
cd frontend
CI=true npm test -- --watchAll=false --runInBand --coverage \
  --collectCoverageFrom='src/**/*.{js,jsx}' \
  --collectCoverageFrom='!src/index.js'
```

Frontend measured files are `App.js`, `components/{PaperCard,SearchBar}.js`, `pages/{LibraryPage,PaperDetailsPage,SearchPage}.js`, and `services/apiService.js`. No additional production files were excluded. Test/setup exclusions are provided by CRA. The baseline cross-check selected original test names only; the final full-suite run had no test filtering.

## Added backend cases

- **Metadata (10 tests):** successful GROBID extraction; multipart PDF field, filename, content type, endpoint, timeout and response headers; title/entity/abstract cleanup; full and surname-only authors; empty authors; year extraction; custom and default service URLs; empty/unrecognized XML and non-string response fallback; short and footnote-like abstract rejection; connection failure and diagnostic; local boilerplate/affiliation filtering and filename fallback. These execute previously uncovered `cleanTitle`, `tagValue`, `parseGrobidResponse`, author mapping, and successful enrichment/field fallback paths.
- **Search (3 tests):** Semantic Scholar DOI/URL identifier fallback, absent title/authors/abstract/link, API-key header, invalid limit default; absent primary-provider data with Crossref title, partial authors, explicit publisher URL and missing date; absent Crossref items. Assertions check complete normalized records, successful statuses, and forwarded limits.
- **Upload (4 tests):** extracted metadata with no overrides, abstract override, filesystem failure, and database failure. Assertions check status/error bodies, persisted metadata, original PDF buffer, output path, parser destruction on success, and whether persistence is reached after a write failure.

External HTTP, PDF parsing, database writes and filesystem writes remain mocked. No real database, uploads, API credentials or network services are required.

## Added frontend cases

- **API service (12 tests):** seven direct method tests verify exact HTTP verbs, endpoints, query parameters/payloads, one request per call and unchanged response forwarding; rejection propagation; three empty-abstract cases; nested entity/tag cleanup. All seven previously uncovered API wrapper functions now execute.
- **PaperCard (2 tests):** absent metadata fallbacks, no original link, author preview limited to three, cleaned abstract and external-link attributes.
- **Workflows (5 tests):** uploaded library metadata fallbacks and deferred deletion that preserves other papers; uploaded detail metadata fallbacks and original-paper link; null detail response; sorting multiple undated/invalid dates with numeric-string years; upload network error, retry, multipart file preservation and successful redirect. These cover the remaining supported conditional states and upload success path.

Window location is temporarily substituted for navigation assertions and restored afterward. This verifies the redirect target, not real browser navigation.

## Findings and limitations

1. **Reproduced metadata selection bug:** `tagValue` concatenates the tag boundary directly with the supplied attribute expression, omitting the whitespace before the XML attribute. Thus article-title and published-date selectors do not match ordinary attributed tags. Fallback selects the first title/date instead. With this mocked response:

   ```xml
   <title level="m">Journal title</title>
   <title level="a">Article title</title>
   <date>2019</date>
   <date type="published">2025</date>
   ```

   `enrichWithGrobid` returned title `Journal title`, year `2019`, rather than the specifically requested article/published values. Reproduced with a separate mocked Node invocation; no incorrect expectation was added to bless this behavior, and production code was not changed. The successful extraction test contains one title/date and does not establish attribute-priority correctness. This demonstrates why 100% execution coverage is insufficient evidence of correctness.

2. **Missing frontend error handling, confirmed by source inspection:** `LibraryPage` does not catch initial-load or deletion rejections; `PaperDetailsPage` does not catch initial-load rejections. No supported recovery/error UI exists to assert. Rejection tests would currently introduce unhandled promise failures. These paths were documented instead of changing production code or suppressing failures. A null detail response remains `Loading paper…`; the added test characterizes that state rather than endorsing it as desirable missing-paper UX. Library also shows its empty state while an initial request is pending, with no separate loading indicator.

3. **Upload cleanup gaps:** source inspection shows parser destruction happens only after successful text extraction, and no file cleanup follows database failure. The new database-failure test confirms a write occurs before the failed persistence attempt. Real resource leakage/orphan-file behavior was not exercised against real storage. Errors in these stages are all reported as PDF-processing errors (422), including infrastructure errors; the tests record the current contract without asserting this is the ideal status policy.

4. **Malformed XML validation remains limited:** empty/unrecognized strings and non-string payloads are tested, but this regex parser is not a validating XML parser. Exhaustive malformed TEI, attribute order, namespaces, multiple titles/dates and real GROBID output remain functional gaps even with full reported coverage.

5. **Integration coverage remains outside the baseline scope:** real SQLite persistence, HTTP route wiring, multipart MIME/size rejection, real PDF parsing and parser resource cleanup, real GROBID/OpenAI/provider behavior, browser navigation, and bootstrap code are not established by this suite. No coverage scope was expanded or reduced to hide those limitations.

No expected test output had to be weakened to obtain passing results. Round 2 assertion/fault-detection work has not been started.
