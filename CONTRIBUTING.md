# Contributing

Thanks for considering a contribution. tokenlean is small on purpose; the constraints below are what keep it safe to run against real Claude Code sessions.

## Setup

Node ≥ 20.

```
npm install        # dependencies (better-sqlite3, commander, @anthropic-ai/sdk)
npm run build      # tsc → dist/
npm test           # vitest
npx tsc --noEmit   # typecheck only
```

## Layout

```
src/
  cli.ts                commander wiring for all subcommands
  config.ts             every path/env lookup in one place (tests override via env)
  constants.ts          environmental constants — sourced, bounded (see ASSUMPTIONS.md)
  db.ts                 SQLite schema + open/meta helpers (single local file)
  types.ts              shared cross-component types
  status.ts             `tokenlean status` diagnostics
  analyzer/
    parser.ts           incremental, defensive JSONL transcript ingestion
    heuristics.ts       no-LLM waste scoring (correction turns, re-supply, ...)
    llm.ts              sampled Message Batches pipeline + self-spend accounting
  report/
    report.ts           scorecard/findings/digest rendering (plain text + --json)
    claudeMdDiff.ts     proposed CLAUDE.md additions (written to CLAUDE.md.suggested)
    envEstimate.ts      tokens → energy/water ranges
  hook/
    hook.ts             UserPromptSubmit hot path (decideNudge + stdin entrypoint)
    install.ts          settings.json install/uninstall/mute
  proxy/
    server.ts           byte-for-byte pass-through server
    usage.ts            SSE/JSON usage extraction (the tee)
    enable.ts           prints (never applies) the settings changes
tests/                  vitest suites; fixtures are synthetic only
```

## Three inviolable rules

Violating any of these is a bug regardless of what feature it enables. PRs touching these paths must include tests demonstrating the guarantee still holds.

1. **The proxy never mutates traffic** (SPEC §3, §6). Request and response bodies pass through byte-for-byte; headers and auth untouched; responses piped, never buffered; unknown fields forwarded unmodified. Any interference with prompt caching, streaming, or session flow is a defect of the highest severity — the tool must never make the thing it observes worse. Transformation features belong in a future, separately-flagged component with cache-safety tests, not in this proxy.

2. **The hook never blocks** (SPEC §5). Always exit 0; exit code 2 (which blocks the user's prompt) is forbidden by design, not merely discouraged. The hot path finishes in under 500 ms: synchronous SQLite only — no LLM calls, no network, no child processes. Any internal error, missing DB, or lock contention results in silent pass-through, never a visible failure. Rate limits (1 nudge/session, 5/day, mute) are part of the contract: a coaching tool that annoys the user gets uninstalled, which saves nothing.

3. **The parser never crashes on a transcript** (SPEC §4.1). The JSONL format is undocumented and may change with any Claude Code release. Parse defensively: skip unknown record types (with a debug log), count malformed lines, and degrade gracefully. A transcript that breaks the parser becomes a fixture, not an excuse.

## Fixture policy

**Synthetic transcripts only. Never commit a real one.** Real transcripts contain user code, prose, and paths. Construct minimal JSONL fixtures by hand (or with a generator) containing only what the test needs, with obviously fake content. The same applies to settings.json fixtures — invented keys only. Tests must never read or write `~/.claude` or `~/.tokenlean`; use the env overrides in `src/config.ts` (`TOKENLEAN_DB`, `TOKENLEAN_HOME`, `TOKENLEAN_CLAUDE_SETTINGS`, `CLAUDE_CONFIG_DIR`) or explicit path arguments, pointed at temp directories.

## Milestones

| Milestone | Scope | Exit criterion |
|---|---|---|
| M1 | Parser, schema, heuristic pass, report without LLM findings | Report runs on real transcripts; baseline recorded |
| M2 | Batch pipeline, taxonomy classifier, CLAUDE.md diffs, self-spend | Overhead ≤ 2% on a real run |
| M3 | Hook install/uninstall, first-prompt nudge, digest, rate limits | 20 sessions, zero perceived latency, zero blocked prompts |
| M4 | Proxy pass-through, usage tee, enable/disable UX, status | Full agentic session byte-identical with proxy on vs. off |
| M5 | README, ASSUMPTIONS.md, CONTRIBUTING.md, CI, v0.1.0 on npm | Published |

Section references (§) cite the v1 specification the project was built against.
