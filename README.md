# ResearchLLM

ResearchLLM is a local AI research assistant for discovering, organizing, and understanding scholarly papers. It provides a React web interface backed by an Express API, a local SQLite library, PDF text extraction, optional GROBID metadata enrichment, and OpenAI-powered summaries and question answering.

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

- Node.js 18 or newer
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

From the repository root:

```bash
cd backend
npm install

cd ../frontend
npm install
```

Each application has its own `package.json` and lockfile, so dependencies must be installed in both directories.

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
