import { Command } from 'commander';
import { openDb } from './db';
import { defaultClaudeDir, PROXY_DEFAULT_PORT, upstreamUrl } from './config';
import { ingestTranscripts } from './analyzer/parser';
import { runHeuristics, recordBaselineIfReady } from './analyzer/heuristics';
import { submitLlmBatch, collectLlmResults } from './analyzer/llm';
import { buildReport, renderReport } from './report/report';
import { writeClaudeMdSuggestions } from './report/claudeMdDiff';
import { installHook, uninstallHook, muteHooks } from './hook/install';
import { startProxy, stopProxy } from './proxy/server';
import { printEnableInstructions, printDisableInstructions } from './proxy/enable';
import { runStatus } from './status';

/** Parse `--since 7d` style windows into days. Returns undefined for "all". */
function parseSince(raw?: string): number | undefined {
  if (!raw) return undefined;
  const m = /^(\d+)\s*d$/i.exec(raw.trim());
  if (!m) {
    console.error(`Ignoring unparseable --since value "${raw}" (expected e.g. 7d).`);
    return undefined;
  }
  return parseInt(m[1], 10);
}

const program = new Command();
program
  .name('tokenlean')
  .description(
    'Measure and reduce wasted Claude Code tokens.\n' +
      'Offline transcript analyzer, live coaching hook, read-only usage proxy.'
  )
  .version('0.1.0');

program
  .command('analyze')
  .description('Parse transcripts, run heuristics, optionally submit LLM batch analysis')
  .option('--wait', 'poll the LLM batch to completion before returning')
  .option('--sample <n>', 'sessions to send for LLM analysis (0 disables)', '10')
  .option('--claude-dir <path>', 'override Claude Code config dir')
  .action(async (opts: { wait?: boolean; sample: string; claudeDir?: string }) => {
    const db = openDb();
    const claudeDir = opts.claudeDir || defaultClaudeDir();

    const ing = ingestTranscripts(db, claudeDir);
    console.log(
      `Ingest: ${ing.filesParsed}/${ing.filesScanned} files read ` +
        `(${ing.filesSkippedUnchanged} unchanged), ${ing.sessionsUpserted} sessions, ` +
        `${ing.turnsAdded} new turns, ${ing.malformedLines} malformed lines skipped.`
    );

    const heur = runHeuristics(db);
    console.log(
      `Heuristics: ${heur.sessionsScored} sessions scored, ${heur.findingsAdded} new findings.`
    );

    if (recordBaselineIfReady(db)) {
      console.log('Baseline recorded (week-1 reference for future comparisons).');
    }

    const sample = parseInt(opts.sample, 10);
    if (sample > 0) {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.log(
          'LLM pass skipped: ANTHROPIC_API_KEY not set. Heuristic findings are still recorded.'
        );
      } else {
        const sub = await submitLlmBatch(db, {
          sample,
          wait: !!opts.wait,
          log: (m) => console.log(m),
        });
        if (sub.message) console.log(sub.message);
      }
    }
    db.close();
  });

program
  .command('report')
  .description('Print the analysis report (scorecard, findings, CLAUDE.md suggestions)')
  .option('--json', 'machine-readable output')
  .option('--write-claude-md', 'write CLAUDE.md.suggested files next to each project CLAUDE.md')
  .option('--since <window>', 'restrict to a recent window, e.g. 7d')
  .action(async (opts: { json?: boolean; writeClaudeMd?: boolean; since?: string }) => {
    const db = openDb();
    if (process.env.ANTHROPIC_API_KEY) {
      // Collect any finished batches first so the report is fresh.
      await collectLlmResults(db, { log: opts.json ? undefined : (m) => console.log(m) });
    }
    const data = buildReport(db, { sinceDays: parseSince(opts.since) });
    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(renderReport(data));
    }
    if (opts.writeClaudeMd) {
      const written = writeClaudeMdSuggestions(db);
      if (written.length === 0) {
        console.log('No CLAUDE.md suggestions to write yet.');
      } else {
        for (const p of written) console.log(`Wrote ${p}`);
      }
    }
    db.close();
  });

const hooks = program.command('hooks').description('Manage the live coaching hook');
hooks
  .command('install')
  .description('Install the UserPromptSubmit hook into Claude Code settings')
  .action(() => {
    const res = installHook();
    console.log(
      res.already
        ? `Hook already installed in ${res.path}.`
        : `Hook installed in ${res.path}. It never blocks prompts and adds <500ms.`
    );
  });
hooks
  .command('uninstall')
  .description('Remove the hook from Claude Code settings')
  .action(() => {
    const res = uninstallHook();
    console.log(res.removed ? `Hook removed from ${res.path}.` : 'Hook was not installed.');
  });
hooks
  .command('mute <days>')
  .description('Silence nudges for N days')
  .action((days: string) => {
    const n = parseInt(days, 10);
    if (!Number.isFinite(n) || n <= 0) {
      console.error('mute expects a positive number of days');
      process.exitCode = 1;
      return;
    }
    const db = openDb();
    const res = muteHooks(db, n);
    console.log(`Nudges muted until ${new Date(res.mutedUntil).toLocaleString()}.`);
    db.close();
  });

const proxy = program.command('proxy').description('Read-only usage proxy');
proxy
  .command('start')
  .description('Run the pass-through proxy in the foreground')
  .option('--port <n>', 'listen port', String(PROXY_DEFAULT_PORT))
  .action(async (opts: { port: string }) => {
    const db = openDb();
    await startProxy(db, { port: parseInt(opts.port, 10), upstream: upstreamUrl() });
    // startProxy keeps the process alive; it prints its own status lines.
  });
proxy
  .command('stop')
  .description('Stop a running proxy (via pidfile)')
  .action(() => {
    const res = stopProxy();
    console.log(res.stopped ? `Proxy (pid ${res.pid}) stopped.` : 'No running proxy found.');
  });
proxy
  .command('enable')
  .description('Print the settings changes needed to route Claude Code through the proxy')
  .action(() => printEnableInstructions(PROXY_DEFAULT_PORT));
proxy
  .command('disable')
  .description('Print how to revert the proxy settings changes')
  .action(() => printDisableInstructions());

program
  .command('status')
  .description('Environment, proxy health, hook presence, DB stats, self-spend')
  .action(async () => {
    console.log(await runStatus());
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
