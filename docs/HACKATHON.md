# Hackathon Pitch & Demo

Maps to marking criteria in [`Requirement.md`](../Requirement.md).

---

## 30-second pitch

> AI bills you for every token — including the useless ones. **PromptLens** reads your past prompts, finds your bad habits, scores every prompt from 0–100, and lets you toggle a cheap small model to rewrite your ask or strip low-information context *before* you hit the expensive model.

---

## Criteria → demo moment

| Criterion | Show this |
|-----------|-----------|
| Innovation | Style fingerprint unique to the user’s history |
| Technical complexity | Detector → score → improve → strip → proxy pipeline |
| Completeness | Full path from import to send |
| UX / Design | Big 0–100 score, diffs, clear tips |
| Practicality | Token/%/$ saved on screen |
| Presentation | Rehearsed 3-min script below |
| Collaboration | Named roles; shared fixtures; one demo driver |

---

## 3-minute script

1. **Problem (20s)** — Show bloated prompt + high token count.  
2. **History (40s)** — Import → “Your top inefficiency: vague filler + context dumps.”  
3. **Score (30s)** — Paste weak prompt → **42/100** with reasons.  
4. **Improve (40s)** — Toggle ON → **78/100**; show changelog.  
5. **Strip (40s)** — Toggle ON → −35% tokens; red diff.  
6. **Close (20s)** — Cheap models for coaching; your frontier model only for the final answer.

---

## Slide outline (5–7)

1. Problem: inefficient prompting is invisible  
2. Solution: Audit · Score · Improve · Strip  
3. Architecture diagram  
4. Live demo  
5. Why it’s complex *and* useful  
6. Stack + cheap-model policy  
7. Next steps / Q&A  

---

## Backup plan

- Pre-recorded screen capture  
- Frozen JSON responses if APIs fail  
- Ollama local improver  

---

## Speaking roles (collaboration)

| Person | Segment |
|--------|---------|
| A | Problem + value |
| B | Live demo driver |
| C | Architecture + Q&A |
