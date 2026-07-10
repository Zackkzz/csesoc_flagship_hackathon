# Technical Architecture (for approval)

Per [`Requirement.md`](../Requirement.md) Immediate Instructions §3.  
**Please approve or request changes before any application code is written.**

---

## Proposed system name

**PromptLens** — prompting coach + pre-call token firewall.

## Design principles (from constraints)

1. **Cheap processing** — Improve / Judge / Strip use mini or local models only.  
2. **Practical** — helps before send; works with real history.  
3. **Explainable scores** — 0–100 with reasons, not vibes.  
4. **Opt-in automation** — Improve and Strip are toggles.  
5. **Local-first** — history in SQLite on the user’s machine by default.  
6. **Clean code later** — modular services, commented public APIs.

---

## High-level architecture

```
                    ┌─────────────────────────────────────┐
                    │           Web Dashboard             │
                    │  Style Report │ Playground │ Diffs  │
                    └─────────────┬───────────────────────┘
                                  │ HTTP/JSON
┌──────────────┐        ┌─────────▼─────────┐        ┌─────────────┐
│ History      │───────▶│   PromptLens API  │───────▶│ Target LLM  │
│ upload/JSON  │        │   (FastAPI)       │        │ (user’s AI) │
└──────────────┘        └─────────┬─────────┘        └─────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              ┌──────────┐ ┌──────────┐ ┌────────────┐
              │ Detector │ │ Improver │ │  Stripper  │
              │ + Scorer │ │ (cheap   │ │ (heuristic │
              │ (0–100)  │ │  LLM)    │ │  ± cheap  │
              └──────────┘ └──────────┘ │   LLM)     │
                    │                   └────────────┘
                    ▼
              ┌──────────┐
              │ SQLite   │
              └──────────┘
```

### Pre-call pipeline (core UX)

```
User prompt (+ context/history)
        │
        ▼
 [1] Score Input (0–100) + findings/suggestions
        │
        ▼
 [2] if Improve ON → cheap LLM rewrite → re-score
        │
        ▼
 [3] if Strip ON  → remove low-info tokens/spans → preview
        │
        ▼
 [4] Send to target AI
        │
        ▼
 [5] Score Output (0–100) + tokens/$ logged
```

---

## Component responsibilities

| Component | Responsibility | Complexity |
|-----------|----------------|------------|
| **Ingest** | Parse exports / generic turns → SQLite | Medium |
| **Detector** | Regex/rules (+ optional embeddings) for inefficiencies | Medium–High |
| **Scorer** | Weighted 0–100 InputScore / OutputScore | Medium |
| **Improver** | Cheap LLM structured rewrite | Medium |
| **Stripper** | Heuristic prune; optional model compression | High (stretch) |
| **Gateway** | OpenAI-compatible proxy | High |
| **UI** | Report + playground + strip diff | Medium |

---

## Recommended tools (default proposal)

| Layer | Tool | Rationale |
|-------|------|-----------|
| API | **Python FastAPI** | Best fit for NLP, tokenizers, optional LLMLingua |
| UI | **React + Vite + TypeScript** | Strong UX for scores/diffs/charts |
| DB | **SQLite** | Zero ops, local, practical |
| Tokens | **tiktoken** (or HF tokenizer) | Accurate counts for scoring/$ |
| Cheap LLM | **GPT-4.1-mini / Haiku / Flash / Ollama 7–8B** | Requirement: cheap & efficient |
| Embeddings (optional) | MiniLM or `text-embedding-3-small` | Detect redundant paraphrases |
| Strip MVP | Heuristic + optional **LLMLingua-2** | Technical depth without blocking demo |
| Validation | **Pydantic** | Structured improver/judge JSON |
| Charts | Recharts / ECharts | Style fingerprint |

Full alternatives: [`TECH_STACKS.md`](TECH_STACKS.md).

---

## Data flow: history analysis

1. User uploads past chats.  
2. Normalize to turns.  
3. Run detectors on each user turn.  
4. Aggregate → style report (top inefficiencies, avg score, est. waste).  
5. Surface concrete rewrite suggestions from *their* prompts.

## Data flow: before-send assist

1. User types prompt in playground (or client hits proxy).  
2. Score 0–100 + suggestions.  
3. Optional Improve / Strip.  
4. Forward to AI.  
5. Score output; show efficiency.

---

## Security & privacy (MVP)

- Bind API to `127.0.0.1` by default.  
- Provider API keys in env only.  
- Banner if Improve/Judge sends text to a cloud mini model.  
- Redact obvious secrets (`sk-…`) on import.

---

## Complexity vs practicality (why this passes marking)

| Need | Approach |
|------|----------|
| Innovation | Style fingerprint + dual toggles |
| Technical complexity | Hybrid detect/score + LLM rewrite + strip + proxy |
| Completeness | Ingest → analyze → score → improve → strip → call → log |
| UX | Single 0–100 score, diffs, plain-language tips |
| Practicality | Real token/$ savings; cheap models; local store |

---

## Approval checklist

Reply with approvals or edits:

- [ ] Overall pipeline (Score → Improve? → Strip? → Call)  
- [ ] FastAPI + React + SQLite as default stack  
- [ ] Cheap models only for Improve/Judge/Strip  
- [ ] Heuristic Strip in MVP; LLMLingua as stretch  
- [ ] OpenAI-compatible proxy in MVP (or defer to stretch?)  

**Status:** ⏳ Awaiting team approval  

Once approved + [`CLARIFYING_QUESTIONS.md`](CLARIFYING_QUESTIONS.md) answered → implement per [`PROJECT_PLAN.md`](PROJECT_PLAN.md).
