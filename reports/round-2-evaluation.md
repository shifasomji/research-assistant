# Round 2: behavior-directed test evaluation

## Outcome

Round 2 is complete. **The complete suites intentionally fail on five reproducible application-defect scenarios.** No production code or coverage configuration was changed. No valid existing test case was removed or weakened. Two backend and three frontend regression cases were added; existing cases were strengthened rather than adding redundant passing cases for test count.

| Version | Backend total / pass / fail / skip | Frontend total / pass / fail / skip |
| --- | --- | --- |
| Initial | 20 / 20 / 0 / 0 | 13 / 13 / 0 / 0 |
| Round 1 | 37 / 37 / 0 / 0 | 32 / 32 / 0 / 0 |
| Round 2 | **39 / 37 / 2 / 0** | **35 / 32 / 3 / 0** |

There are no TODO, cancelled, or expected-failure annotations. Both complete test commands exit **1**, accurately reporting the defects. All previously passing cases still pass. Three consecutive full runs of each suite produced the same pass/fail counts and the same failing test identities. These observations establish repeatability in this environment, not proof of freedom from all flakiness.

## Coverage comparison

| Suite / metric | Initial | Round 1 | Round 2 |
| --- | ---: | ---: | ---: |
| Backend statements | 88.30% | 100.00% | 100.00% |
| Backend branches | 78.78% | 100.00% | 100.00% |
| Backend functions | 80.00% | 100.00% | 100.00% |
| Backend lines | 88.30% | 100.00% | 100.00% |
| Frontend statements | 91.39% | 100.00% | 100.00% |
| Frontend branches | 75.40% | 100.00% | 100.00% |
| Frontend functions | 79.41% | 100.00% | 100.00% |
| Frontend lines | 100.00% | 100.00% | 100.00% |

Initial and Round 1 values are the baselines reproduced in [the Round 1 report](round-1-coverage.md). Round 2 uses the same commands and measured files:

```sh
# From backend/
./node_modules/.bin/c8 --reporter=text --reporter=json-summary node --test

# From frontend/
CI=true npm test -- --watchAll=false --runInBand --coverage \
  --collectCoverageFrom='src/**/*.{js,jsx}' \
  --collectCoverageFrom='!src/index.js'
```

Backend scope: four controllers plus `services/pdfMetadata.js`. Frontend scope: `App.js`, `PaperCard.js`, `SearchBar.js`, three pages, and `apiService.js`. The bootstrap, real database model, HTTP routes and middleware remain outside these baseline scopes. No new file exclusions or test filtering were used in the final complete runs. Coverage reports still emit when tests fail; 100% is execution coverage, not a passing-test claim.

Machine-readable [coverage results](round-2-artifacts/coverage-results.json), [backend summary](round-2-artifacts/backend-coverage-summary.json), and full logs are preserved. [Production integrity](round-2-artifacts/production-integrity.json) records SHA-256 checks of 20 JavaScript files outside the test suites; none changed from the start of Round 2. Package files were not edited in this round. Pre-existing workspace/package changes were preserved.

## Existing tests strengthened

### Frontend

Changes are in [`workflows.test.js`](../frontend/src/pages/workflows.test.js).

- **AI retry, both provider and network failures:** actually perform a second request; assert the recovered summary appears, the error disappears, exactly two calls occur, the retry payload is correct, and controls are re-enabled afterward. Button re-enablement alone no longer passes as successful recovery.
- **Failed save then retry:** hold the first request pending, reject it inside awaited `act`, and inspect the completed failure state before retrying. The button must still say `Save to library`, remain enabled, and never falsely say `Saved ✓`. Then assert successful retry and exactly two requests with the original paper payload.
- **Concurrent AI interactions:** populate a valid question before a pending summary, attempt clicks on both disabled controls, and verify exactly one API call. Repeat during a pending question and verify total calls remain two. This avoids a false sense of safety from a question button disabled only because its input was blank. Also verify blank-input clicks make no request, stale answers clear, and the final answer/payload are correct. This checks repeated DOM clicks while React's busy state is active; it does not prove server-side deduplication or every possible same-event race.
- **Empty search:** start with a real result, issue a controlled second search returning `[]`, and verify old cards/count disappear, searching finishes, the search-results heading remains, and another search is possible. No invented `No results` message is asserted: the source and README specify no such copy.
- **Empty library and null details:** await the actual mocked response and React updates before observing the UI. A mock invocation alone is no longer treated as evidence of completed loading. The null-response test remains explicitly a characterization of current behavior, not a requirement that indefinite loading is desirable.
- **Deferred deletion:** settle the pending request inside awaited `act` before checking removal and preservation of the other paper.

### Backend

Changes are in [`controllers.test.js`](../backend/test/controllers.test.js).

- **Upload overrides:** verify title, trimmed author names, abstract, and year in both the response and complete persistence payload. The year fixture (`'2025'`) deliberately differs from the local extraction year (2024); ignoring the override is now detected. Assertions preserve the controller's string-valued year contract rather than inventing numeric coercion.
- **Provider failure/fallback:** verify exact error bodies as well as status, provider request order, normalized identifiers/abstracts, result count, and absence of unintended persistence.
- **Save:** inspect the sanitized persistence payload and returned record identifier, rather than relying only on a mocked returned object.
- **Library retrieval/deletion:** inspect missing-paper bodies, successful status, forwarded identifiers on both failed and successful deletion, and an empty 204 response. Each simulated request uses a fresh response object so stale status/body state cannot conceal missing behavior.
- **AI validation:** verify client-facing errors and ensure invalid input does not even perform the database lookup, while missing paper/key never calls the provider.
- **AI prompts:** verify system/user roles, exact selected source text and truncation, full-text precedence over abstract, question inclusion, paper-only grounding and acknowledgment of absent answers. Summary assertions check contribution/method/results/limitations concepts rather than an entire exact prompt sentence. Requests also verify the endpoint, authentication and record ID. These assertions establish request grounding instructions, not whether a real model obeys them.
- **Missing/unreadable uploads:** verify error bodies and that parsing/storage/provider/persistence stages are not reached when inappropriate.

## Preserved GROBID regression

**File:** [`backend/test/pdfMetadata.test.js`](../backend/test/pdfMetadata.test.js)

**Test:** `[DEFECT] GROBID selects article title and published year ahead of journal and generic date`

The test uses the exact representative XML from the Round 2 instructions, mocks only the HTTP response, and invokes the public `enrichWithGrobid` function. It asserts both expected fields together so the title failure does not conceal the wrong year.

| Field | Expected | Actual |
| --- | --- | --- |
| Title | `Article title` | `Journal title` |
| Publication year | 2025 | 2019 |

Failure output from the unchanged application:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
+ actual - expected

  {
+   title: 'Journal title',
+   year: 2019
-   title: 'Article title',
-   year: 2025
  }
```

**Confirmed root cause:** `tagValue` constructs `<${tag}\\b${attributes}...`. The boundary is zero-width and there is no whitespace expression before `level="a"` or `type="published"`. Ordinary XML has a space there, so the attribute-specific lookup fails. The subsequent unqualified lookup selects the first title/date. A single-title/single-date fixture had concealed this defect despite 100% reported coverage.

Reproduce independently from `backend/`:

```sh
node --test --test-name-pattern='GROBID selects article' test/pdfMetadata.test.js
```

The regression is a normal failing test, not skipped, marked TODO, or changed to assert the buggy result.

## Investigation of additional concerns

| Issue | Evidence and classification | Test or probe |
| --- | --- | --- |
| Library load rejection | **Confirmed robustness defect:** rejected promise escapes the effect without handling. No exact recovery copy is specified. | New failing frontend regression injects a representative HTTP 500; Jest reports `Library load rejected`. |
| Library deletion rejection | **Confirmed robustness defect:** the async event handler has no rejection handling. The paper remains visible, but the rejection escapes. | New failing regression injects HTTP 500, verifies the paper/count remain, and leaves the unhandled rejection visible to Jest. |
| Paper detail load rejection | **Confirmed robustness defect:** rejected lookup escapes the effect without handling. | New failing regression uses HTTP 404 and the backend's `Paper not found.` payload, matching the actual missing-paper API contract. Jest reports `Paper load rejected`. |
| Null paper response | **Defensive UX feature gap, not an established regression contract:** after settlement, `Loading paper…` persists. The backend normally returns 404 for absent records, not successful `null`. No specified missing-paper message exists. | Existing characterization strengthened to await completed loading. No invented message or new failing assertion was added. |
| Parser destruction after extraction failure | **Confirmed resource-lifecycle defect:** the installed PDFParse README's error-handling example requires `destroy()` in `finally` to free memory. Controller calls it only after successful `getText()`. | New failing backend test expects one destroy call after rejection; actual is zero. No claim of measured heap growth is made. |
| Upload retained after database failure | **Confirmed file retention; rollback policy is unspecified.** Real temporary filesystem probe reproduces one retained original PDF after rejected persistence and a 422 response. Automatic cleanup/retry/retention behavior is not promised in requirements. | Diagnostic probe records the retained bytes and deletes its temporary directory afterward. No failing rollback test was invented, and disk-exhaustion effects remain unmeasured. |

The five counted defect scenarios are GROBID selection, parser cleanup, and the three unhandled frontend rejection paths. File retention and null-response UX are tracked separately rather than inflating the confirmed-defect count.

**Frontend regression file:** [`errors.regression.test.js`](../frontend/src/pages/errors.regression.test.js). Test names:

- `[DEFECT] library load failure does not escape as an unhandled rejection`
- `[DEFECT] library deletion failure preserves the paper without an unhandled rejection`
- `[DEFECT] paper load failure does not escape as an unhandled rejection`

The minimal robustness expectation is containment of request failure rather than an unhandled host rejection; no particular toast, retry button, or navigation behavior is invented. Tests allow an event-loop turn to complete within awaited `act` so Jest attributes the rejection to its originating test. No catch, global rejection listener, `preventDefault`, or unhandled-rejection suppression is added. DOM assertions alone can pass while these tests correctly fail through Jest's uncaught-error detection. They do not establish a complete recovery-UI specification.

**Parser regression:** `[DEFECT] upload destroys the PDF parser when text extraction fails` in `controllers.test.js`. Failure:

```text
AssertionError [ERR_ASSERTION]: parser must be destroyed even after getText rejects
0 !== 1
```

Supporting contract: installed `backend/node_modules/pdf-parse/README.md`, error-handling example around lines 270–292 (`finally` / `Always call destroy() to free memory`). The test demonstrates the missing lifecycle call using a parser double; it does not exercise a real PDF worker.

[Retention probe](round-2-artifacts/upload-retention-probe.cjs) uses unchanged controller source, actual filesystem writes in a fresh OS temporary directory, injected PDF/metadata dependencies and a rejected database operation. It never opens the user's database or writes to the real uploads directory. [Observed result](round-2-artifacts/upload-retention-result.json): status 422, one persistence attempt, one retained file containing the original bytes. This is a diagnostic characterization, not a desired-behavior regression.

No failing test was attributable to an incorrect new assertion or repaired by weakening an expectation. The null/retention issues were deliberately kept out of the failing-regression count because their desired handling is not specified.

## Reliability review and repeated execution

- Frontend `clearAllMocks` became `resetAllMocks` in workflow tests: call-history clearing alone retained previous implementations and queued one-shot results.
- Backend parser mocks are recreated before each test, removing possible one-shot implementation leakage. Model mocks are also recreated; Axios/filesystem spies restore after each case.
- Backend controller tests isolate and restore `OPENAI_API_KEY`, `OPENAI_MODEL`, `GROBID_URL`, and `SEMANTIC_SCHOLAR_API_KEY`, preventing ambient configuration from changing test behavior.
- Fresh response objects isolate simulated requests. Pending operations use explicit promise resolvers/rejectors and awaited React `act`; no arbitrary long sleeps or premature API-call-count assertions stand in for completion.
- Window navigation substitution remains protected by `finally` restoration. Existing service/card tests were reviewed and retained; their doubles/fixtures are not mutated between cases.
- Node's per-file process isolation contains the controller suite's module-cache replacements. Model/PDF doubles still limit integration fidelity; stronger output/side-effect checks do not eliminate that limitation.

| Complete run | Backend | Frontend |
| --- | --- | --- |
| 1 | 37 pass, 2 fail, 0 skip | 32 pass, 3 fail, 0 skip |
| 2 | 37 pass, 2 fail, 0 skip | 32 pass, 3 fail, 0 skip |
| 3 | 37 pass, 2 fail, 0 skip | 32 pass, 3 fail, 0 skip |

Raw logs: [backend run 1](round-2-artifacts/backend-run-1.log), [2](round-2-artifacts/backend-run-2.log), [3](round-2-artifacts/backend-run-3.log); [frontend run 1](round-2-artifacts/frontend-run-1.log), [2](round-2-artifacts/frontend-run-2.log), [3](round-2-artifacts/frontend-run-3.log). React Router migration warnings are non-fatal. No inconsistent outcome was observed. Runs were not a randomized-order or cross-runtime campaign. Targeted unmutated controls also passed independently of the rest of the suites. `git diff --check` passes.

## Controlled mutation experiment

Six temporary **in-memory** production mutations were evaluated against the relevant passing test in each version. Production files on disk were never edited. Each mutant gets a separate Node process and an unmutated passing control. Known defect regressions are outside these targeted selections, so unrelated failures cannot count as mutation detection. The harness verifies one selected test ran and the mutation was actually applied.

Historical Round 1 test sources are loaded from commit `88bfcef3f867b6a1fac9bd0d970cd474f4548055`; Round 2 uses the working tests. This is a small targeted experiment, not a full-suite or exhaustive mutation score.

| Mutation | Round 1 targeted test | Round 2 targeted test |
| --- | --- | --- |
| Replace normalized Semantic Scholar author with incorrect text | Detected | Detected |
| Discard GROBID title and always use fallback | Detected | Detected |
| Forward wrong library deletion ID | Detected | Detected |
| Bypass AI input validation | Detected | Detected |
| Ignore upload year override | Survived | **Detected** |
| Replace full-text AI context with unrelated same-length text; preserve abstract fallback | Survived | **Detected** |
| **Selected mutation detection** | **4/6** | **6/6** |

All 12 controls passed. There were six unique mutations, evaluated twice (12 mutant runs plus 12 controls). Initial-suite mutation detection was not measured. The two newly detected faults directly demonstrate value from assertion changes even though coverage was already 100%. These intentionally injected faults are separate from the five genuine pre-existing application-defect scenarios.

Reproduce from the repository root:

```sh
node reports/round-2-artifacts/mutation-runner.cjs
```

[Harness](round-2-artifacts/mutation-runner.cjs), [machine-readable results](round-2-artifacts/mutation-results.json), and individual control/mutant logs are retained in `round-2-artifacts/`. Module compilation substitutions are process-local and disappear on process exit; there is no production-file restoration step to omit accidentally.

## Interpretation across the three versions

| Dimension | Initial suite | Round 1 | Round 2 |
| --- | --- | --- | --- |
| Coverage | Partial branches/functions | 100% in original scopes | Unchanged 100% |
| Assertion quality | Several status-only, length-only and call-only checks | Broader behavior exercised, but some weak assertions remained | Checks settled failure states, real retry success, duplicate calls, complete overrides, source fidelity and error contracts |
| Confirmed defect scenarios dynamically demonstrated | 0 documented; no retrospective bug campaign | 1 (GROBID; external reproduction, no failing regression) | 5 preserved as failing regressions: the existing GROBID defect plus 4 newly demonstrated scenarios |
| Fault detection | Not mutation-measured | 4/6 selected mutations in retrospective experiment | 6/6 on the same selected mutations |
| Reliability evidence | Passing run; limited async checks | Passing runs; retained mock/premature-assertion risks | Three consistent full runs; stronger isolation and explicit settlement |

The defect counts describe evidence produced by these rounds, not how many defects existed in the application. Round 1 had already flagged additional concerns through inspection; Round 2 turns four of them into reproducible failing regression scenarios.

**Why 100% coverage was insufficient:** a parser can execute every instrumented branch while selecting the wrong title; an upload test can execute an override expression without asserting its year; an AI test can accept unrelated source text if it checks only length. Promise-rejection handling cannot be established by covering successful renders. Round 2 improves the behavioral oracles and fault detection while leaving the execution percentages unchanged.

Remaining limitations include real SQLite and HTTP integration, multipart MIME/size validation, real PDF/worker cleanup, validating TEI/XML parsing and namespaces, real provider/model behavior, browser navigation, load/retry UX requirements, rollback policy, and wider concurrency/order/environment testing. The targeted mutation experiment is intentionally small and backend-only. No application defects were fixed, and no further improvement round was started.
