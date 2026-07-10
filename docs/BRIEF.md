# PromptLens — One-Page Brief

**From:** [`Requirement.md`](../Requirement.md)  
**Mode:** Documents only — no app code until questions + architecture approval.

## What we build

App that (1) analyzes past prompting history, (2) finds style inefficiencies, (3) scores prompts **0–100**, (4) optionally improves via **cheap** small LLM, (5) optionally **strips** low-info tokens before the AI call.

## Marking fit

Innovation (style fingerprint) · Complexity (full pipeline) · UX (score + diffs) · Practical ($/tokens) · Pitch (scripted demo) · Collaboration (phased roles).

## Immediate instructions status

| # | Instruction | Doc |
|---|-------------|-----|
| 1 | Up to 3 clarifying questions | [`CLARIFYING_QUESTIONS.md`](CLARIFYING_QUESTIONS.md) |
| 2 | Phased plan + milestones | [`PROJECT_PLAN.md`](PROJECT_PLAN.md) |
| 3 | Architecture & tools for approval | [`ARCHITECTURE.md`](ARCHITECTURE.md), [`TECH_STACKS.md`](TECH_STACKS.md) |

## Default tech (pending approval)

FastAPI + React/Vite + SQLite + tiktoken + mini/Flash/Haiku/Ollama for processing + heuristic Strip (± LLMLingua stretch).

## Your next message

Answer: `Q1=…, Q2=…, Q3=…` and approve/reject Stack R.
