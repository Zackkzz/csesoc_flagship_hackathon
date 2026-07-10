# MVP Specification

Traceability to [`Requirement.md`](../Requirement.md) Key Features.  
**Locked decisions:** Q1=D · Q2=D · Q3=C · Stack R.

---

## Scope locks

| Area | In MVP | Stretch |
|------|--------|---------|
| History upload (JSON / export) | ✅ | — |
| OpenAI-compatible proxy | ✅ (M6) | — |
| React web dashboard + playground | ✅ | — |
| Browser extension | — | ✅ after M6 |
| Cloud mini Improve/Judge | ✅ default | — |
| Ollama fallback | ✅ | — |
| Heuristic Strip | ✅ | — |
| LLMLingua-2 | — | ✅ |

---

## Feature requirements

### F1 — Efficient prompts before send

- Live suggestions from detectors  
- **Improve** toggle: cheap LLM rewrites prompt  
- User reviews before send (default)

**Accept:** Improved prompt gets higher InputScore (≥ +10) or clearly fewer waste tokens on demo set.

### F2 — Collect & analyze previous contexts

- Import history (generic JSON; optional ChatGPT export)  
- Per-turn analysis + aggregate **style report**

**Accept:** Fixture import → top inefficiencies listed with examples from user data.

### F3 — Score 0–100

- **InputScore** for current prompt  
- **OutputScore** after model response (MVP: cheap judge or heuristic subset)  
- Breakdown by dimension + findings

**Accept:** Score always in 0–100; deductions cite pattern + span.

### F4 — Strip low-information tokens (toggle)

- Off by default  
- On: compress context/messages; show diff  
- Processing: heuristic and/or cheap model — not frontier

**Accept:** ≥30% token reduction on bloated fixture; code blocks preserved.

### F5 — Cheap processing

- Config lists improver/judge/strip models  
- Docs + UI state “Processing model: …”

**Accept:** No frontier model used on Improve/Judge/Strip paths in default config.

---

## User flows

### Flow A — Audit habits

Upload history → style report → read top tips → open example rewrite.

### Flow B — Fix before send

Type prompt → see score → Improve ON → edit if needed → Strip ON → send → see output score + cost.

### Flow C — Proxy (completeness)

Point client `base_url` at local gateway with `improve`/`strip` flags.

---

## UX requirements (marking: User Experience and Design)

- Score is the hero number (large 0–100)  
- Color: low / mid / high bands  
- Strip diff: red = removed  
- Improve: side-by-side original vs rewritten  
- Empty states with sample data button  
- Mobile-usable layout optional; desktop-first OK for hackathon  

---

## Non-functional

| NFR | Target |
|-----|--------|
| Local-first | SQLite; localhost API |
| Latency | Heuristic score &lt; 100ms; Improve &lt; 2s typical on mini |
| Code quality (when built) | Clean, commented public functions |
| Privacy | Cloud mini calls disclosed |

---

## Demo acceptance checklist

- [ ] History → style report  
- [ ] Prompt → score 0–100  
- [ ] Improve → better score  
- [ ] Strip → fewer tokens + diff  
- [ ] Full send path works  
- [ ] Pitch ties features to marking criteria  
