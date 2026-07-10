# PromptLens — Hackathon MVP (Docs Only)

> Source of truth for scope: [`Requirement.md`](Requirement.md)

**One-liner:** Analyze past prompting history → find style inefficiencies → score prompts 0–100 → optionally rewrite with a cheap small LLM → optionally strip low-information tokens before the expensive model call.

---

## Marking criteria map

| Criterion | How this MVP addresses it |
|-----------|---------------------------|
| **Innovation and Creativity** | Personal *prompting style fingerprint* from history + dual live toggles (Improve / Strip) — not just another chat UI |
| **Technical Complexity and Completeness** | Hybrid pipeline: rule detectors + embeddings + small-LLM rewrite/judge + context compression + OpenAI-compatible gateway |
| **User Experience and Design** | Clear score (0–100), before/after diff, one-click improve, strip preview, coaching tips in plain language |
| **Practicality and Usability** | Saves tokens/$; works with existing tools via local proxy; cheap models only for processing |
| **Presentation and Pitch** | Demo script + metrics in [`docs/HACKATHON.md`](docs/HACKATHON.md) |
| **Team Collaboration** | Phased plan with role split in [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) |

---

## Requirement → feature traceability

| Requirement | Feature |
|-------------|---------|
| Generate prompts more efficiently before sending to AI | **Improve** toggle (small LLM rewrite) + coaching suggestions |
| Collect previous contexts and analyze | **History ingest** + style report / anti-pattern analytics |
| Score current prompt good/bad 0–100 | **InputScore** (and OutputScore after the call) |
| Toggle small LLM to strip low-info tokens | **Strip** toggle on pre-call pipeline |
| Cheap & efficient models for processing | Mini/Flash/Haiku/Ollama 7–8B — never frontier models for Improve/Judge/Strip |

---

## Document index

| Doc | Purpose |
|-----|---------|
| [`Requirement.md`](Requirement.md) | Original brief & constraints |
| [`docs/CLARIFYING_QUESTIONS.md`](docs/CLARIFYING_QUESTIONS.md) | Up to 3 questions before build |
| [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) | Phased milestones & step-by-step |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Technical architecture **for approval** |
| [`docs/TECH_STACKS.md`](docs/TECH_STACKS.md) | Recommended tools & alternatives |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Audience, value, scope |
| [`docs/RESEARCH.md`](docs/RESEARCH.md) | Research backing the idea |
| [`docs/MVP_SPEC.md`](docs/MVP_SPEC.md) | Features & acceptance criteria |
| [`docs/SCORING.md`](docs/SCORING.md) | 0–100 rubric & anti-patterns |
| [`docs/API.md`](docs/API.md) | API contracts |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Data & privacy |
| [`docs/HACKATHON.md`](docs/HACKATHON.md) | Pitch, demo, judging |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Post-hackathon |
| [`docs/BRIEF.md`](docs/BRIEF.md) | One-page summary |

---

## Status (per Requirement.md Immediate Instructions)

1. Clarifying questions → [`docs/CLARIFYING_QUESTIONS.md`](docs/CLARIFYING_QUESTIONS.md)  
2. Phased project plan → [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md)  
3. Architecture & tools for approval → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) + [`docs/TECH_STACKS.md`](docs/TECH_STACKS.md)  

**No application code in this package** — documents only until you approve architecture and answer clarifying questions.
