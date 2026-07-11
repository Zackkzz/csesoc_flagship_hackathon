# tokenlean

Measure and reduce wasted Claude Code tokens.

tokenlean analyzes your Claude Code transcripts for measurably wasteful patterns — rework loops, re-pasted context, vague openings — and turns them into concrete fixes, above all suggested additions to your `CLAUDE.md`. It can also nudge you (gently, and never blockingly) at the moment you prompt, and record exact token usage through a strictly read-only local proxy.

The motivating goal is environmental: wasted inference tokens waste energy and water. To be clear about the scale: **per-user savings are modest.** A single user trimming a million wasted tokens saves somewhere around 0.3–1.0 kWh of inference energy on our default constants — roughly a laptop's working day, at the high end. The leverage is elsewhere: better prompting habits compound over every future session, and small savings multiplied across many users add up. tokenlean measures real waste rather than assumed waste, and reports impact only as sourced ranges (see [ASSUMPTIONS.md](ASSUMPTIONS.md)).

## Components

Three components, shipped in this order. Each is independently useful and independently installable.

1. **Offline transcript analyzer** — parses your local session transcripts, scores waste, proposes fixes.
2. **Live coaching hook** — a `UserPromptSubmit` hook that occasionally adds one informational context line.
3. **Read-only proxy observer** — records the `usage` block from API responses; changes nothing else.

## Quickstart

```
npx tokenlean analyze          # parse transcripts, run heuristics, optional LLM pass
npx tokenlean report           # scorecard, findings, proposed CLAUDE.md additions
npx tokenlean hooks install    # enable the live coaching nudge
npx tokenlean proxy enable     # print the settings changes for exact token counts
npx tokenlean status           # env, proxy health, hook presence, DB stats, self-spend
```

Without `ANTHROPIC_API_KEY` set (or with `--sample 0`), `analyze` runs heuristics only and nothing leaves your machine. With a key, the sampled LLM pass runs — read the [Privacy](#privacy) section first.

## How it works

### 1. Offline transcript analyzer

Claude Code stores sessions as JSONL under `~/.claude/projects/`. The analyzer parses them defensively (the format is undocumented and treated as unstable; malformed lines are skipped, never fatal) and incrementally (only new content on re-runs). A heuristic pass runs on everything: correction turns, repeated file reads, context re-supplied across sessions, paste-heavy prompts, abandonment. A budgeted LLM pass then samples only the N most wasteful sessions (default 10), condenses them, and submits them via the Anthropic Message Batches API to `claude-haiku-4-5` for classification against a six-category taxonomy. Findings in the `missing_convention` and `resupplied_context` categories aggregate into a proposed `CLAUDE.md` diff per project; `tokenlean report --write-claude-md` writes it to `CLAUDE.md.suggested` — it never edits your `CLAUDE.md` directly.

### 2. Live coaching hook

`tokenlean hooks install` adds a `UserPromptSubmit` hook to `~/.claude/settings.json`, merging non-destructively and backing up the file first. On the first prompt of a session, the hook scores the prompt against patterns learned offline (vague-opener lexicon, this project's known missing-convention topics, oversized pastes) and, on a high-confidence match, prints one context line that Claude — not you — sees, phrased as information rather than command, so Claude asks a single clarifying question when warranted. **The hook never blocks:** the hot path is heuristic-only (no LLM call, ever), budgeted under 500 ms, and exits 0 on every path including internal errors and a locked database — exit code 2, which would block your prompt, is forbidden by design. Rate limits: at most 1 nudge per session, at most 5 per day, and `tokenlean hooks mute <days>` as an escape hatch. Every invocation, fired or suppressed, is logged locally and audited in the report's digest.

### 3. Read-only proxy observer

Heuristics cannot see token counts; only API responses carry the `usage` block. `tokenlean proxy start` runs a local pass-through server (default `127.0.0.1:4141`) that forwards every request to `https://api.anthropic.com` preserving method, headers, and body **byte-for-byte**. Responses stream back by piping the socket — never buffering, so SSE frames arrive as they are produced. A tee parses `message_start`/`message_delta` events (or the JSON body for non-streaming responses) to record usage and model per request. Auth passes through untouched; tokenlean never stores API keys. Unknown fields are forwarded unmodified. The proxy reads; it never rewrites.

## Privacy

Stated plainly, because it matters:

- **The LLM analysis pass sends sampled transcripts as-is to the Anthropic API — your code included.** No redaction, no filtering. It only runs when `ANTHROPIC_API_KEY` is set; `analyze --sample 0` disables it entirely. The CLI also states this on first run.
- **Everything else stays on your machine.** All state lives in a single local SQLite file (`~/.tokenlean/db.sqlite`). There is no telemetry and no network traffic other than the Anthropic API calls above (and, if you enable the proxy, the API traffic you were already sending).
- **Redaction before submission is the top v2 candidate.** Track it at [tokenlean/tokenlean#1](https://github.com/tokenlean/tokenlean/issues/1) (placeholder until the repository is published).

## Proxy failure posture: fail loud, not silent

If `ANTHROPIC_BASE_URL` points at the proxy and the proxy process is not running, Claude Code requests **fail visibly**. This is deliberate. v1 has no daemon, no supervisor, and no silent fallback: a half-working observer that quietly drops data (or quietly stops observing) is worse than an obvious failure. `tokenlean status` diagnoses exactly this state — base URL set, nothing listening — and tells you what to do. `tokenlean proxy enable` prints the required settings changes rather than applying them silently, and notes that Claude Code reads the env at process start, so running sessions are unaffected until restarted. A launchd/systemd unit is a v2 candidate.

Known side effect: with a non-first-party `ANTHROPIC_BASE_URL`, Claude Code disables MCP tool search by default. Re-enable it with `ENABLE_TOOL_SEARCH=true` if you use it.

## Self-accounting

An efficiency tool that hides its own cost is not credible. Every report prints tokenlean's own analysis spend, e.g. `tokenlean spent 41k tokens ≈ $0.03 analyzing 2.1M tokens — 1.9% overhead`. The target is analysis spend at or below **2%** of the usage analyzed; sampling and the Batches API exist to keep it there.

## Environmental estimates

Reports convert tokens saved against your baseline into energy and water figures using the constants in `src/constants.ts` — each with a source URL and a LOW/HIGH bound. Output is **always a range**, always labeled `rough estimate — no first-party figures exist for Claude; see ASSUMPTIONS.md`, and never a single unqualified number. Cache-read tokens are weighted at 10% of uncached tokens; that weighting is an assumption, and it is flagged as one. [ASSUMPTIONS.md](ASSUMPTIONS.md) documents every constant, its source, and its uncertainty.

## CLI reference

```
npx tokenlean analyze [--wait] [--sample N] [--claude-dir PATH]
npx tokenlean report  [--json] [--write-claude-md] [--since 7d]
npx tokenlean hooks   install | uninstall | mute <days>
npx tokenlean proxy   start | stop | enable | disable
npx tokenlean status            # env, proxy health, hook presence, DB stats, self-spend
```

All commands are manual — no scheduler in v1.

## Success metrics

tokenlean succeeds if, after four weeks of use:

1. the correction-turn rate (user messages that reverse or fix Claude's previous work) drops measurably from the week-1 baseline;
2. cache hit rate holds steady or improves;
3. tokens per completed task trends down;
4. analysis overhead stays under the 2% budget.

Week 1 exists to establish the baseline, which is why the analyzer ships first and coaching comes second.

## Non-goals (v1)

tokenlean never modifies API traffic — the proxy is strictly read-only. It never rewrites your prompts, silently or otherwise. It never blocks a prompt. No web dashboard, no scheduled runs, no team aggregation, no secret redaction (all documented v2 candidates). It is not a cost-optimization router; model routing is out of scope.

## License

[MIT](LICENSE).
