# Atlas — Gemini Knowledge RAG

Atlas is a citation-first internal knowledge assistant. The repository keeps the FastAPI RAG server and Next.js application as independent services with separate dependencies, environment files, builds, and test commands.

## Repository layout

```text
RAG/
├── server/                  # Python/FastAPI service only
│   ├── app/
│   │   ├── api/            # REST endpoints
│   │   └── services/       # parsing, chunking, Gemini, retrieval
│   ├── data/               # source manifest and local uploads
│   ├── db/                 # pgvector initialization
│   ├── eval/               # retrieval evaluation questions
│   ├── scripts/            # sample-data utilities
│   ├── tests/
│   ├── .env.example
│   ├── Dockerfile
│   └── pyproject.toml
├── frontend/               # Next.js/React application only
│   ├── src/actions/         # Validated Server Actions and revalidation
│   ├── src/app/             # App Router pages, layouts, and route handlers
│   ├── src/components/      # Feature UI plus reusable shadcn primitives
│   ├── src/lib/             # Server API adapter and shared domain types
│   ├── .env.local.example
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml      # joins db, server, and frontend
└── README.md
```

## Service boundaries

| Service | Responsibility | Port |
| --- | --- | --- |
| `frontend` | Next.js UI, same-origin route handlers, and source-file gateway | `3000` |
| `server` | FastAPI ingestion, retrieval, generation, and document files | `8000` |
| `db` | PostgreSQL 16 with pgvector | `5432` |

The browser submits JSON to typed, same-origin Next.js route handlers. Those handlers validate input, derive the active access scope from an HTTP-only cookie, and call the FastAPI service configured by `RAG_API_URL`. Source files are streamed through `/source/[id]`. The browser does not call FastAPI directly, the server never imports frontend code, and the frontend never imports Python code.

## Run the complete stack

Create the server environment file:

```powershell
Copy-Item server/.env.example server/.env
```

Add the Gemini key to `server/.env`:

```dotenv
GEMINI_API_KEY=your-key-from-google-ai-studio
```

Start all three services:

```powershell
docker compose up --build
```

- Next.js UI: [http://localhost:3000](http://localhost:3000)
- FastAPI documentation: [http://localhost:8000/docs](http://localhost:8000/docs)
- FastAPI health check: [http://localhost:8000/api/health](http://localhost:8000/api/health)

## Run services independently

### Database

```powershell
docker compose up db -d
```

### FastAPI server

Run commands from the server directory so its `.env` and data paths remain server-owned:

```powershell
cd server
Copy-Item .env.example .env
./.venv/Scripts/python.exe -m pip install -e ".[dev]"
./.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

The local environment template points PostgreSQL to `localhost:5432`. Docker Compose overrides it to use the `db` service internally.

### Next.js frontend

In a second terminal:

```powershell
cd frontend
Copy-Item .env.local.example .env.local
pnpm install
pnpm dev
```

`RAG_API_URL` defaults to `http://localhost:8000`, so `.env.local` is optional for the standard local setup.

## Backend capabilities

- PDF parsing with page metadata and heading-aware chunks
- Gemini document/query embeddings with retrieval-specific task types
- PostgreSQL + pgvector HNSW index
- Hybrid vector and full-text search using reciprocal-rank fusion
- Grounded Gemini answers with numbered page citations
- Public, internal, and confidential document filtering
- SHA-256 duplicate detection and PDF validation
- Source preview/download and document deletion endpoints

## Frontend capabilities

- shadcn/ui Base Nova component system with Tailwind CSS v4 theme tokens
- Corpus and system overview dashboard
- Grounded chat with source filters and page-level citation links
- Persistent, access-scoped chat history with deep-linked conversations and new-chat creation
- Searchable document library with classification filters
- Drag-and-drop PDF upload with metadata
- Responsive desktop and mobile layouts
- Loading, error, empty, and configuration states

## Sample handbook

Download the public Clark Atlanta University Staff Handbook into the server-owned data directory:

```powershell
./server/scripts/download_sample.ps1
```

The file is saved as `server/data/raw/hr/cau_staff_handbook_2026.pdf`. The source manifest is at `server/data/sources.json`, and starter evaluation questions are at `server/eval/retrieval_questions.jsonl`.

## API examples

Upload and index a PDF:

```bash
curl -X POST http://localhost:8000/api/documents /
  -H "X-Access-Level: confidential" /
  -F "file=@handbook.pdf" /
  -F "title=Staff Handbook" /
  -F "classification=internal" /
  -F 'metadata_json={"department":"HR","year":2026}'
```

Ask a question:

```bash
curl -X POST http://localhost:8000/api/chat /
  -N /
  -H "Content-Type: application/json" /
  -H "X-Access-Level: internal" /
  -d '{"query":"What is the annual leave policy?","top_k":5}'
```

Chat responses use Server-Sent Events. `delta` events contain incremental answer text, `done`
contains the saved answer, citations, messages, and conversation metadata, and `error` reports a
failure after the stream has started. Chat requests create a persisted conversation when
`conversation_id` is omitted. To continue or inspect a conversation, reuse the ID from the `done`
event with `POST /api/chat` or call
`GET /api/conversations/{id}`. `GET /api/conversations` lists history and
`POST /api/conversations` creates an empty chat. The optional `X-Workspace-ID` header defaults to
`local`; the Next.js service sets it from the server-only `ATLAS_WORKSPACE_ID` environment variable.
Conversation history is also separated by the active `X-Access-Level`.

`X-Access-Level` is an MVP seam. Production deployments should derive access from a verified identity or JWT.

## Test each service

Server:

```powershell
cd server
./.venv/Scripts/python.exe -m pytest
```

Frontend:

```powershell
cd frontend
pnpm lint
pnpm typecheck
pnpm build
```

Container builds can also be performed separately:

```powershell
docker build -t atlas-server ./server
docker build -t atlas-frontend ./frontend
```

The server unit tests use a fake Gemini client and do not consume API quota.

## Gemini configuration

The server reads `GEMINI_API_KEY` only from its environment. It uses `gemini-embedding-2` at 768 dimensions and `gemini-3.6-flash` by default. If the primary generation model is rate limited, it retries once with `gemini-3.5-flash-lite`. All three model settings are configurable in `server/.env`.

Official references: [Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key), [embeddings](https://ai.google.dev/gemini-api/docs/embeddings), and [text generation](https://ai.google.dev/gemini-api/docs/text-generation).
