# PromptLens — One-Page Brief

**From:** [`Requirement.md`](../Requirement.md)  
**Decisions locked:** Q1=D · Q2=D · Q3=C · Stack R

## What we build

App that (1) analyzes past prompting history, (2) finds style inefficiencies, (3) scores prompts **0–100**, (4) optionally improves via **cheap** small LLM, (5) optionally **strips** low-info tokens before the AI call.

## Locked MVP shape

| Choice | MVP |
|--------|-----|
| History | Upload exports **+** live OpenAI-compatible proxy |
| UX | React web dashboard first; extension = stretch |
| Processing | Cloud mini default **+** Ollama fallback |
| Stack | FastAPI + React/Vite + SQLite + tiktoken + heuristic Strip |

## Marking fit

Innovation (style fingerprint) · Complexity (full pipeline + proxy) · UX (web scores/diffs) · Practical ($/tokens) · Pitch (scripted demo) · Collaboration (phased roles).

## Immediate instructions status

| # | Instruction | Status |
|---|-------------|--------|
| 1 | Clarifying questions | ✅ Answered |
| 2 | Phased plan | ✅ [`PROJECT_PLAN.md`](PROJECT_PLAN.md) — start **M0** |
| 3 | Architecture & tools | ✅ [`ARCHITECTURE.md`](ARCHITECTURE.md) / [`TECH_STACKS.md`](TECH_STACKS.md) |

## Next step

Say when to **start coding M0** (scaffold `apps/api` + `apps/web` + fixtures).
