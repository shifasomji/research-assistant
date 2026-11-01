# ResearchLLM

ResearchLLM is a local AI research assistant for discovering, organizing, and understanding scholarly papers. It provides a React web interface backed by an Express API, a local SQLite library, PDF text extraction, optional GROBID metadata enrichment, and OpenAI-powered summaries and question answering.

> **Final test-suite evaluation:** Five regression tests intentionally remain failing because they expose known application defects. Expected results are **37 passed / 2 failed** for the backend and **32 passed / 3 failed** for the frontend. Both commands exit **1**. See [Automated tests and coverage](#automated-tests-and-coverage) for reproduction instructions and the defect list.

## Features

- **Scholarly search** — searches Semantic Scholar first and falls back to Crossref when Semantic Scholar is unavailable or rate-limited.
- **Local paper library** — saves searched papers and uploaded PDFs to SQLite.
- **PDF upload and processing** — accepts PDF files up to 15 MB, stores the original file locally, and extracts its text.
- **Academic metadata extraction** — uses local text heuristics first and optionally uses GROBID to identify a paper's title, authors, abstract, and publication year.
- **AI summaries** — generates a concise summary of a saved paper.
- **Paper questions and answers** — answers questions using the saved paper's extracted text or abstract.
- **Responsive web interface** — supports search, upload, library management, and paper analysis from the browser.

## Application structure

```text
research-assistant/
├── backend/
│   ├── app.js                    # Express application and server entry point
│   ├── controllers/              # Request handlers for search, library, upload, and AI
│   ├── models/paperModel.js      # SQLite schema and paper data access
│   ├── routes/                   # API route definitions
│   ├── services/pdfMetadata.js   # Local metadata parsing and GROBID integration
│   ├── database.sqlite           # Runtime SQLite database, created/updated locally
│   ├── uploads/                  # Uploaded PDF files, stored locally
│   ├── .env                      # Local secrets and service configuration
│   └── package.json
├── frontend/
│   ├── public/                   # Browser metadata and static assets
│   ├── src/
│   │   ├── components/           # Search bar and paper cards
│   │   ├── pages/                # Search, library, and paper detail screens
│   │   ├── services/apiService.js# Axios API client
│   │   ├── App.js                # Routes and shared navigation
│   │   └── App.css               # Application styling
│   └── package.json
└── README.md
```

The backend and frontend are separate Node.js applications. The frontend development server runs on port `3000` and proxies `/api` requests to the backend on port `5001`.

## Prerequisites

Install the following before starting:

- Node.js **24.21.0** (the tested version, recorded in `.nvmrc`) and npm (tested with **11.19.0**)
- npm
- Docker Desktop, only if using GROBID metadata extraction
- An OpenAI API key, only if using summaries or paper Q&A

Semantic Scholar and Crossref search require internet access. The application can still start without an OpenAI key or GROBID, but those optional features will be unavailable or use local fallbacks.

## Configuration

Create or edit `backend/.env`:

```env
PORT=5001
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
GROBID_URL=http://localhost:8070
```

### Configuration variables

| Variable | Required | Default | Purpose |
|---|---:|---|---|
| `PORT` | No | `5001` | Port used by the Express backend |
| `OPENAI_API_KEY` | For AI features | None | Authenticates OpenAI summary and Q&A requests |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI chat completion model |
| `GROBID_URL` | No | `http://localhost:8070` | Base URL of the GROBID service |
| `SEMANTIC_SCHOLAR_API_KEY` | No | None | Optional key for higher Semantic Scholar limits |

Do not commit `.env`, API keys, `database.sqlite`, or uploaded PDFs. The backend `.gitignore` excludes these runtime and secret files.

## Installation

From the repository root, install the dependencies locked for both applications:

```bash
# Optional: if using nvm, select the version recorded in .nvmrc.
nvm install
nvm use

npm ci --prefix backend
npm ci --prefix frontend
```

If you do not use nvm, install Node.js 24.21.0 directly and run the two `npm ci` commands. Each application has its own `package.json` and committed `package-lock.json`; there is no root npm package. Install development dependencies too: backend coverage requires the locked `c8` dev dependency. Internet access is needed for dependency installation. Application configuration and server startup below are needed only to run the app, not the automated tests.

## Start the application

Open two terminals.

### Terminal 1: backend

```bash
cd research-assistant/backend
npm start
```

The backend should report:

```text
Server running on http://localhost:5001
```

Check that it is running:

```bash
curl http://localhost:5001/api/health
```

Expected response:

```json
{"status":"ok"}
```

### Terminal 2: frontend

```bash
cd research-assistant/frontend
npm start
```

Open [http://localhost:3000](http://localhost:3000) in a browser.

The frontend's `proxy` configuration forwards API requests to `http://localhost:5001`. If the backend port changes, update both `backend/.env` and the `proxy` value in `frontend/package.json`.

## Optional GROBID setup

GROBID provides more accurate academic metadata than local heuristics, especially for title, author, and abstract detection. The application still accepts uploads when GROBID is unavailable.

With Docker Desktop running, start GROBID:

```bash
docker run -d \
  --name researchllm-grobid \
  --restart unless-stopped \
  -p 8070:8070 \
  lfoppiano/grobid:0.8.1
```

Check readiness:

```bash
curl http://localhost:8070/api/isalive
```

Expected response:

```text
true
```

The backend sends uploaded PDFs to `/api/processHeaderDocument`. If GROBID is stopped, the upload pipeline logs a warning and uses local extraction instead.

Useful Docker commands:

```bash
docker logs -f researchllm-grobid
docker stop researchllm-grobid
docker start researchllm-grobid
docker rm -f researchllm-grobid
```

## Using the application

1. Open the frontend at `http://localhost:3000`.
2. Search for a title, topic, or keyword.
3. Search results are ordered by publication year, newest first.
4. Select **Save to library** to store a search result in SQLite.
5. Upload a PDF from the home page to extract its text and metadata.
6. Open **My Library** to view saved papers.
7. Select **Ask Questions** to open the paper analysis page.
8. Use **Summarize paper** or enter a question for the LLM.

Search-result papers generally contain bibliographic metadata and an external paper link. Uploaded papers contain a locally stored PDF and extracted full text. AI requests use full text when available and otherwise use the abstract.

## API overview

All API routes are implemented under `backend/routes/`.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Checks backend availability |
| `GET` | `/api/search?query=...` | Searches Semantic Scholar, then Crossref |
| `POST` | `/api/search/save` | Saves a search result to SQLite |
| `GET` | `/api/library` | Lists saved papers |
| `GET` | `/api/library/:id` | Retrieves one saved paper |
| `DELETE` | `/api/library/:id` | Deletes one saved paper |
| `POST` | `/api/upload` | Uploads and processes a PDF using multipart field `file` |
| `POST` | `/api/llm` | Summarizes or answers questions about a saved paper |

Example AI request:

```bash
curl -X POST http://localhost:5001/api/llm \
  -H 'Content-Type: application/json' \
  -d '{"paperId":1,"mode":"summary"}'
```

Example question request:

```bash
curl -X POST http://localhost:5001/api/llm \
  -H 'Content-Type: application/json' \
  -d '{"paperId":1,"question":"What is the main contribution of this paper?"}'
```

## Development commands

Frontend:

```bash
cd frontend
npm start
npm test -- --watchAll=false
npm run build
```

Backend:

```bash
cd backend
npm start
```

Backend JavaScript files can be syntax-checked with:

```bash
for file in app.js controllers/*.js models/*.js routes/*.js services/*.js; do
  node --check "$file"
done
```

## Data and reset behavior

SQLite creates the `papers` table automatically when the backend starts. Uploaded files are saved under `backend/uploads/`, and paper records are saved in `backend/database.sqlite`.

To reset local application data, stop the backend and remove the database and uploaded PDFs:

```bash
rm -f backend/database.sqlite
find backend/uploads -type f ! -name .gitkeep -delete
```

This permanently removes the local paper library and uploaded files. API keys remain in `backend/.env` and should be managed separately.

## Troubleshooting

### The frontend loads but API operations fail

Confirm the backend is running on port `5001`:

```bash
curl http://localhost:5001/api/health
```

If you changed the backend port, update `frontend/package.json` and restart the frontend development server.

### Search returns an error

Search depends on external APIs and internet access. Semantic Scholar may rate-limit unauthenticated requests; the backend automatically attempts Crossref afterward. An optional `SEMANTIC_SCHOLAR_API_KEY` can improve Semantic Scholar limits.

### PDF upload fails

Confirm the file is a PDF and is smaller than 15 MB. Text-based PDFs work best. Scanned PDFs may produce little or no text because OCR is not currently included.

### Metadata is incomplete

Start GROBID and confirm `curl http://localhost:8070/api/isalive` returns `true`. The local parser remains available as a fallback, but unusual layouts may require GROBID for accurate metadata.

### AI features return an error

Set a valid `OPENAI_API_KEY` in `backend/.env`, then restart the backend. Never expose or commit the key.

## Automated tests and coverage

### Expected final results: five known-defect failures

This repository preserves the final suite from a two-round test-improvement experiment. **Production defects were deliberately left unfixed**, and their regression tests assert the intended behavior. They are ordinary failing tests, labeled `[DEFECT]`; none is skipped, marked TODO, or changed to accept buggy behavior.

| Suite | Total | Passing | Failing | Skipped | Expected exit code |
| --- | ---: | ---: | ---: | ---: | ---: |
| Backend (`node:test`) | 39 | 37 | 2 | 0 | **1** |
| Frontend (Jest / React Testing Library) | 35 | 32 | 3 | 0 | **1** |

A nonzero exit code is expected evidence that the suite detects these known application defects, rather than an installation or test-runner failure. Additional failures, different counts, or dependency errors are not part of the expected result. Coverage commands also exit 1 while still producing coverage reports. No script suppresses or converts failures to success.

| Regression | Test file | Expected behavior and observed defect |
| --- | --- | --- |
| GROBID title/year selection | `backend/test/pdfMetadata.test.js` | Expected article title and published year; returns the earlier journal title and generic date instead. |
| PDF parser cleanup | `backend/test/controllers.test.js` | Parser should be destroyed after extraction fails; `destroy()` is never called. |
| Library loading failure | `frontend/src/pages/errors.regression.test.js` | A failed request should be contained; the loading effect produces an unhandled rejection. |
| Library deletion failure | `frontend/src/pages/errors.regression.test.js` | The paper should remain and the failure should be contained; an unhandled rejection escapes the event handler. |
| Paper loading failure | `frontend/src/pages/errors.regression.test.js` | A missing-paper (404) request should be contained; the loading effect produces an unhandled rejection. |

See the [Round 2 evaluation](reports/round-2-evaluation.md) for exact test names, requirements analysis, root causes, failure output, repeated-run evidence, and the distinction between confirmed defects and unspecified UX/retention policies. The [Round 1 report](reports/round-1-coverage.md) records the coverage-directed baseline.

### Install and run the complete suites

Use the Node/npm versions and `npm ci` commands in [Installation](#installation). Commands below run from the **repository root** in a macOS/Linux shell:

```bash
npm test --prefix backend
```

```bash
CI=true npm test --prefix frontend -- --watchAll=false --runInBand
```

Run both commands independently: a shell or CI step configured to stop on the first nonzero exit will stop after the backend's two known failures. The frontend flags disable watch mode and run tests serially for deterministic reproduction. In PowerShell, set `$env:CI="true"` before running the frontend npm command without the `CI=true` prefix.

Do not run bare `node --test` from the repository root: recursive discovery also finds Jest frontend files, which Node's built-in runner cannot execute. The prefix commands select the correct application and runner.

Tests require **no `.env`, API keys, running servers, Docker, GROBID, or network access after dependencies are installed**. External HTTP, PDF parsing, and backend persistence are mocked. The automated suites leave the local database and uploaded files untouched. Jest setup is in `frontend/src/setupTests.js` and is loaded by `react-scripts` automatically; no global Jest, pytest, c8, or additional test configuration is required.

### Reproduce coverage

The package scripts preserve the commands and source-file scope used in both experiment rounds:

```bash
npm run test:coverage --prefix backend
```

```bash
CI=true npm run test:coverage --prefix frontend
```

| Suite | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| Backend, measured scope | 100.00% | 100.00% | 100.00% | 100.00% |
| Frontend, measured scope | 100.00% | 100.00% | 100.00% | 100.00% |

These figures coexist with the five failing regression tests: executing every measured branch does not prove the outputs are correct.

- **Backend:** `c8 --reporter=text --reporter=json-summary node --test`, executed in `backend/`. Reports appear in the terminal and `backend/coverage/coverage-summary.json`. The unchanged default c8 scope covers the four loaded controllers and `services/pdfMetadata.js`; it does not cover the entire backend, database, or HTTP wiring.
- **Frontend:** `react-scripts test --verbose --watchAll=false --runInBand --coverage --collectCoverageFrom="src/**/*.{js,jsx}" --collectCoverageFrom="!src/index.js"`, executed in `frontend/` with `CI=true`. Reports appear in the terminal and `frontend/coverage/`, including `lcov-report/index.html`, `lcov.info`, and `coverage-final.json`. The scope is `App.js`, `PaperCard.js`, `SearchBar.js`, the three pages, and `apiService.js`. Bootstrap `src/index.js` is excluded to match the original baseline; CRA provides the standard test/setup exclusions.

Generated coverage directories and `node_modules` are ignored by Git. Historical evaluation logs, summaries, and diagnostic scripts are deliberately kept under `reports/round-2-artifacts/`. React Router may print migration warnings during frontend tests; those warnings are separate from the three known rejection failures.

### Inspect regressions and supporting experiments

To run only the GROBID regression from the repository root:

```bash
npm test --prefix backend -- --test-name-pattern="GROBID selects article" test/pdfMetadata.test.js
```

To run the three frontend request-failure regressions:

```bash
CI=true npm test --prefix frontend -- --watchAll=false --runInBand --runTestsByPath src/pages/errors.regression.test.js
```

These focused commands intentionally fail too. Use the complete-suite commands above for the reported counts and coverage comparison.

Optional diagnostic commands, from the repository root:

```bash
node reports/round-2-artifacts/mutation-runner.cjs
node reports/round-2-artifacts/upload-retention-probe.cjs
```

The mutation harness compares six selected faults against Round 1 and Round 2 tests (4/6 versus 6/6 detected). It requires Git history containing the Round 1 commit named in the evaluation report; a shallow checkout without that commit must fetch the history first. Mutations are process-local and never edit production files. The retention probe uses and removes a temporary upload directory; it does not access the application's real database or uploads.

These are controller/service and React workflow tests. Real SQLite persistence, PDF workers, multipart MIME/15 MB limits, HTTP route integration, external providers, and actual browser navigation remain outside the evaluated suite. See the reports for the full limitations.
