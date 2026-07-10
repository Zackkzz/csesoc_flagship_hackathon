# PromptLens

**Coach your prompting. Score every ask.**

PromptLens analyzes your past LLM prompting history, finds inefficiencies in your style, scores prompts **0–100**, and can rewrite weak prompts with a **cheap** small LLM **before** you send them to the expensive model.

Built for a CSE hackathon MVP — practical prompting feedback + enough technical depth to demo well.

---

## Features

| Feature | Description |
|---------|-------------|
| **History audit** | Import past chats → style report (top inefficiencies, est. waste) |
| **Input score 0–100** | Clarity, specificity, structure, concision, context fit + explainable findings |
| **Improve** | Cheap mini LLM rewrite (or offline heuristic fallback) |
| **Playground** | Score → improve → call model → see metrics |
| **OpenAI-compatible proxy** | Point clients at `/v1/chat/completions` with `promptlens` flags |

Works **without an API key** (heuristics + offline chat fallback). Add `OPENAI_API_KEY` for live Improve / Judge / target chat. Ollama is supported as fallback (`Q3=C`).

> **Out of scope:** context token-stripping middleware (low-information token compression before the call) is **not** part of this MVP.

---

## Architecture (short)

```
Browser (React)
    │  fetch JSON
    ▼
FastAPI  ──► detectors / scorer / improver / SQLite
    │
    ▼
Target LLM (OpenAI / Ollama / offline fallback)
```

- **Web** talks to **API** over HTTP JSON (`apps/web/src/api.ts`).
- **Docker:** UI on `:8080`; nginx proxies `/v1` and `/health` to the API (same-origin).
- **Local dev:** UI on `:5173` → API on `:8000` (CORS enabled).

---

## Quick start — Docker (Mac & Windows)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
cp .env.example .env          # optional: set OPENAI_API_KEY
docker compose up --build
```

| Service | URL |
|---------|-----|
| Web UI | http://localhost:8080 |
| API | http://localhost:8000 |
| OpenAPI | http://localhost:8000/docs |

```bash
docker compose down           # stop
docker compose down -v        # stop + wipe SQLite volume
```

More detail: [`docs/DOCKER.md`](docs/DOCKER.md)

---

## Quick start — local (no Docker)

**Prereqs:** Python 3.11+, Node 20+

### 1. API

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate                 # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../../.env.example .env                # optional OPENAI_API_KEY
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Web (second terminal)

```bash
cd apps/web
npm install
npm run dev
```

Open http://127.0.0.1:5173

### 3. Tests (optional)

```bash
cd apps/api
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
```

```bash
cd apps/web
npm run lint
npm run build
```

---

## CI

GitHub Actions runs on pushes/PRs to `main` / `master` (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

| Job | Checks |
|-----|--------|
| **API** | `pytest` on Python 3.12 |
| **Web** | `oxlint` + production `build` on Node 22 |
| **Docker** | `docker compose config` validation |

---

## Demo flow (UI)

1. Click **Import sample history** → open **Style report**.
2. On **Playground**, click **Score** on the weak sample prompt (see 0–100 + findings).
3. Toggle **Improve** / click **Improve now** → score should rise.
4. Click **Prepare & send** → inspect model output and `promptlens` metrics.

---

## Project layout

```
cse_hackathon/
├── apps/
│   ├── api/                 # FastAPI backend
│   │   ├── app/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   └── tests/
│   └── web/                 # React + Vite frontend
│       ├── src/
│       ├── Dockerfile
│       └── nginx.conf
├── packages/rules/          # Anti-pattern YAML (P01–P10)
├── fixtures/                # Sample history (+ optional context fixtures)
├── docs/                    # Product, architecture, scoring, plan…
├── docker-compose.yml
├── .env.example
├── Requirement.md
└── README.md
```

---

## Configuration

Copy [`.env.example`](.env.example) → `.env` (Compose) and/or `apps/api/.env` (local).

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Live Improve / Judge / chat |
| `PROCESSING_PROVIDER` | `auto` \| `openai` \| `ollama` |
| `IMPROVER_MODEL` / `JUDGE_MODEL` | Cheap processing models only |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | Local fallback |
| `CORS_ORIGINS` | Allowed browser origins |
| `ALLOW_HEURISTIC_FALLBACK` | Offline Improve/chat if no LLM |

Never use frontier models for Improve / Judge — keep those cheap.

---

## Main API routes

| Method | Path | Use |
|--------|------|-----|
| `GET` | `/health` | Liveness |
| `GET` | `/v1/config` | Active models / flags |
| `POST` | `/v1/history/import` | Ingest chat history |
| `GET` | `/v1/analytics/style-report` | Style fingerprint |
| `POST` | `/v1/score/input` | Score prompt 0–100 |
| `POST` | `/v1/improve` | Rewrite prompt |
| `POST` | `/v1/prepare` | Score + optional improve before send |
| `POST` | `/v1/chat/completions` | OpenAI-compatible gateway |

### Proxy example

```bash
curl -s http://127.0.0.1:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [{"role": "user", "content": "Please carefully explain recursion in extreme detail thanks"}],
    "promptlens": {"improve": true, "score": true}
  }'
```

Full contracts: [`docs/API.md`](docs/API.md)

---

## Docs index

| Doc | Contents |
|-----|----------|
| [`Requirement.md`](Requirement.md) | Original brief & marking criteria |
| [`docs/BRIEF.md`](docs/BRIEF.md) | One-page summary |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Audience & value |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design |
| [`docs/TECH_STACKS.md`](docs/TECH_STACKS.md) | Stack R + alternatives |
| [`docs/MVP_SPEC.md`](docs/MVP_SPEC.md) | Features & acceptance |
| [`docs/SCORING.md`](docs/SCORING.md) | 0–100 rubric & anti-patterns |
| [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) | Milestones |
| [`docs/HACKATHON.md`](docs/HACKATHON.md) | Pitch & demo script |
| [`docs/DOCKER.md`](docs/DOCKER.md) | Compose networking notes |

**Locked decisions:** history upload + proxy (**Q1=D**) · web first (**Q2=D**) · cloud mini + Ollama (**Q3=C**) · Stack R (FastAPI + React + SQLite).

---

## Stack

| Layer | Choice |
|-------|--------|
| UI | React, Vite, TypeScript, Recharts |
| API | FastAPI, Pydantic, SQLAlchemy, SQLite |
| Rules | YAML anti-pattern pack + heuristics |
| LLM | OpenAI mini / Ollama / heuristic fallback |
| Deploy | Docker Compose (nginx + API) |

---

## License

[MIT](LICENSE) — free to use, modify, and share, including commercially, with attribution.
