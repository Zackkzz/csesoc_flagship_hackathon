# Clarifying Questions (max 3)

Per [`Requirement.md`](../Requirement.md) Immediate Instructions §1 — answer these before we lock architecture and start coding.

---

### Q1 — Where does “past prompting history” come from in the MVP?

| Option | Meaning |
|--------|---------|
| **A** | User uploads ChatGPT/Claude export JSON |
| **B** | User pastes transcripts / we ship a synthetic demo corpus only |
| **C** | Live capture via local OpenAI-compatible proxy (apps point `base_url` at us) |
| **D** | Combination: upload for Audit + proxy for live Score/Improve/Strip |

**Why it matters:** Ingest parsers vs proxy streaming are different engineering loads for a hackathon weekend.

**Our recommendation if you don’t care:** **D** (upload for the style report demo + proxy for the live path).

---

### Q2 — What is the primary product surface for judging UX?

| Option | Meaning |
|--------|---------|
| **A** | Web dashboard + playground (React) |
| **B** | Browser extension on ChatGPT/Claude pages |
| **C** | CLI / TUI only |
| **D** | Web app first, extension as stretch |

**Why it matters:** Extension demos look flashy but are fragile; web app scores better on completeness/UX reliability.

**Our recommendation:** **D** (web first).

---

### Q3 — Processing models: cloud cheap APIs, fully local, or hybrid?

| Option | Improve / Judge / Strip | Target “big” model |
|--------|-------------------------|-------------------|
| **A** | Cloud mini (GPT-4.1-mini / Haiku / Flash) | Cloud frontier |
| **B** | Fully local (Ollama 7–8B + heuristic strip) | Local or cloud |
| **C** | Hybrid: cloud mini by default, Ollama fallback |

Constraint from requirements: *considerable cheap and efficient model to process the data.*

**Our recommendation:** **C** — cheap cloud for reliability in the pitch; local fallback if Wi‑Fi dies.

---

## How to reply

Reply with something like: `Q1=D, Q2=D, Q3=C` (or your own mix).  
After that, architecture in [`ARCHITECTURE.md`](ARCHITECTURE.md) can be marked **Approved** and implementation can start.
