# Product — Target Audience & Value

Derived from [`Requirement.md`](../Requirement.md).

---

## Hackathon context

This is a **CSE hackathon** project. Success is measured by:

1. Innovation and Creativity  
2. Technical Complexity and Completeness  
3. User Experience and Design  
4. Practicality and Usability  
5. Presentation and Pitch  
6. Team Collaboration  

---

## Problem

Users send inefficient prompts and bloated context to AI:

- Vague filler, politeness, redundant constraints → more tokens, worse attention  
- No feedback on whether a prompt is “good”  
- Past chats hide repeated bad habits  
- Context windows fill with low-information tokens before the real ask  

## Value proposition

**PromptLens** makes prompting measurable and improvable:

| For | Value |
|-----|--------|
| Students / hackers | Higher-quality answers; fewer wasted API credits |
| Builders | Tighter prompts before agent/API calls |
| Judges (demo) | Clear before/after scores, token savings, live toggles |

**Promise:** *See what’s wrong with your prompting style, get a 0–100 score, fix it with a cheap model, and optionally strip noise before the expensive call.*

---

## Key features (requirements)

1. **Pre-send efficiency** — suggestions + optional Improve rewrite.  
2. **History analysis** — collect prior contexts; surface inefficiencies.  
3. **Score 0–100** — current prompt quality (plus output score after call).  
4. **Strip toggle** — remove low-information tokens from context pre-call.  
5. **Cheap processing models** — all coaching/compression on efficient models.

---

## In scope (MVP)

- Import/analyze history  
- InputScore 0–100 with explanations  
- Style report  
- Improve toggle  
- Strip toggle + preview  
- Call target model + basic OutputScore  
- Local web UI  

## Out of scope (MVP)

- Final production SaaS  
- Fine-tuned custom models  
- Mobile apps  
- Writing application code before architecture approval  

---

## Success for demo

- Score moves meaningfully after Improve  
- Strip shows visible token reduction  
- Style report names 2–3 personal anti-patterns  
- Pitch ties each feature to a marking criterion  
