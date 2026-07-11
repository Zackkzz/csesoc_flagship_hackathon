import * as fs from 'fs';
import * as net from 'net';
import { PROXY_DEFAULT_PORT, claudeSettingsPath, dbPath, proxyPidPath } from './config';
import { getSelfSpend, metaGet, openDb } from './db';
import type { DB } from './db';

/**
 * `tokenlean status` (SPEC §8): env routing, proxy health, hook presence,
 * DB stats, self-spend. Every probe is wrapped — a broken settings file or
 * missing DB is a reported condition, not a crash. The key diagnosis is the
 * fail-loud case: ANTHROPIC_BASE_URL configured but nothing listening.
 */

type Level = 'OK' | 'WARN' | 'FAIL' | '--';

function line(level: Level, text: string): string {
  return `${level.padEnd(4)} ${text}`;
}

function safeErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function tcpListening(host: string, port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const sock = net.connect({ host, port });
    const done = (v: boolean) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });
}

function readSettings(p: string): { exists: boolean; settings: any; error: string | null } {
  let raw: string;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    return { exists: false, settings: null, error: null };
  }
  try {
    return { exists: true, settings: JSON.parse(raw), error: null };
  } catch (err) {
    return { exists: true, settings: null, error: safeErr(err) };
  }
}

export async function runStatus(): Promise<string> {
  const lines: string[] = [];
  let db: DB | null = null;
  try {
    lines.push(line('--', 'tokenlean status'));

    const settingsPath = claudeSettingsPath();
    const s = readSettings(settingsPath);
    const settingsEnv =
      s.settings && typeof s.settings === 'object' && s.settings.env && typeof s.settings.env === 'object'
        ? s.settings.env
        : null;
    const settingsBase: string | null =
      settingsEnv && typeof settingsEnv.ANTHROPIC_BASE_URL === 'string'
        ? settingsEnv.ANTHROPIC_BASE_URL
        : null;
    const shellBase: string | null = process.env.ANTHROPIC_BASE_URL || null;

    // [env]
    lines.push(line('--', '[env]'));
    lines.push(
      shellBase
        ? line('--', `ANTHROPIC_BASE_URL (shell): ${shellBase}`)
        : line('--', 'ANTHROPIC_BASE_URL not set in this shell')
    );
    if (!s.exists) {
      lines.push(line('--', `Claude settings not found: ${settingsPath}`));
    } else if (s.error) {
      lines.push(line('WARN', `Claude settings unreadable (${settingsPath}): ${s.error}`));
    } else {
      lines.push(
        settingsBase
          ? line('--', `ANTHROPIC_BASE_URL (${settingsPath}): ${settingsBase}`)
          : line('--', `ANTHROPIC_BASE_URL not set in ${settingsPath}`)
      );
    }

    // [proxy]
    lines.push(line('--', '[proxy]'));
    const pidPath = proxyPidPath();
    try {
      const rawPid = fs.readFileSync(pidPath, 'utf8');
      const pid = parseInt(rawPid.trim(), 10);
      if (!Number.isFinite(pid) || pid <= 0) {
        lines.push(line('WARN', `pidfile ${pidPath} is corrupt`));
      } else {
        let alive = false;
        try {
          process.kill(pid, 0);
          alive = true;
        } catch {
          alive = false;
        }
        lines.push(
          alive
            ? line('OK', `proxy process alive (pid ${pid})`)
            : line('WARN', `stale pidfile (pid ${pid} not running) — \`tokenlean proxy stop\` cleans it up`)
        );
      }
    } catch {
      lines.push(line('--', 'no proxy pidfile (proxy has not been started)'));
    }

    const configuredBase = settingsBase || shellBase;
    let host = '127.0.0.1';
    let port = PROXY_DEFAULT_PORT;
    if (configuredBase) {
      try {
        const u = new URL(configuredBase);
        host = u.hostname || host;
        port = u.port ? parseInt(u.port, 10) : u.protocol === 'https:' ? 443 : 80;
      } catch {
        lines.push(line('WARN', `configured ANTHROPIC_BASE_URL is not a valid URL: ${configuredBase}`));
      }
    }
    const listening = await tcpListening(host, port);
    if (configuredBase && !listening) {
      lines.push(
        line(
          'FAIL',
          `ANTHROPIC_BASE_URL is set to ${configuredBase} but nothing is listening on ` +
            `${host}:${port} — Claude Code requests are failing right now (fail-loud by design). ` +
            'Fix: run `tokenlean proxy start`, or remove the env var (`tokenlean proxy disable` prints how).'
        )
      );
    } else if (configuredBase && listening) {
      lines.push(
        line(
          'OK',
          `proxy listening on ${host}:${port}; Claude Code routes through it ` +
            '(sessions started before the env change pick it up on restart)'
        )
      );
    } else if (listening) {
      lines.push(
        line(
          'WARN',
          `something is listening on ${host}:${port} but ANTHROPIC_BASE_URL is not configured — ` +
            'traffic is NOT routed through the proxy (`tokenlean proxy enable` prints how)'
        )
      );
    } else {
      lines.push(
        line('--', 'proxy not running and not configured (start: `tokenlean proxy start`, route: `tokenlean proxy enable`)')
      );
    }

    // Shared DB handle for the hook mute state and the [db] section.
    // Never CREATE the DB from status — openDb would; only open if present.
    const dp = dbPath();
    let dbError: string | null = null;
    if (fs.existsSync(dp)) {
      try {
        db = openDb(dp);
      } catch (err) {
        dbError = safeErr(err);
      }
    }

    // [hook]
    lines.push(line('--', '[hook]'));
    if (s.error) {
      lines.push(line('WARN', 'hook state unknown: Claude settings unreadable'));
    } else {
      let installed = false;
      try {
        const hookCfg = s.settings?.hooks?.UserPromptSubmit;
        installed = hookCfg !== undefined && JSON.stringify(hookCfg).includes('tokenlean');
      } catch {
        installed = false;
      }
      lines.push(
        installed
          ? line('OK', 'coaching hook installed (UserPromptSubmit -> tokenlean)')
          : line('--', 'coaching hook not installed (`tokenlean hooks install`)')
      );
    }
    if (db) {
      try {
        const mutedRaw = metaGet(db, 'muted_until');
        if (mutedRaw !== null) {
          const n = Number(mutedRaw);
          const ts = Number.isFinite(n) ? n : Date.parse(mutedRaw);
          if (Number.isFinite(ts) && ts > Date.now()) {
            lines.push(line('WARN', `nudges muted until ${new Date(ts).toISOString()}`));
          } else {
            lines.push(line('--', 'nudges not muted'));
          }
        } else {
          lines.push(line('--', 'nudges not muted'));
        }
      } catch {
        lines.push(line('--', 'mute state unknown'));
      }
    } else {
      lines.push(line('--', 'mute state unknown (no database yet)'));
    }

    // [db]
    lines.push(line('--', '[db]'));
    if (!fs.existsSync(dp)) {
      lines.push(line('--', `database not created yet at ${dp} (run \`tokenlean analyze\`)`));
    } else if (!db) {
      lines.push(line('FAIL', `database exists at ${dp} but could not be opened: ${dbError || 'unknown error'}`));
    } else {
      try {
        const count = (table: string): number =>
          (db!.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
        const bySource = db
          .prepare('SELECT source, COUNT(*) AS c FROM findings GROUP BY source ORDER BY source')
          .all() as { source: string | null; c: number }[];
        const findingsTotal = bySource.reduce((acc, r) => acc + r.c, 0);
        const sourceTxt = bySource.length
          ? ` (${bySource.map((r) => `${r.source ?? 'unknown'} ${r.c}`).join(', ')})`
          : '';
        lines.push(line('--', `database: ${dp}`));
        lines.push(
          line(
            '--',
            `sessions ${count('sessions')} · turns ${count('turns')} · ` +
              `findings ${findingsTotal}${sourceTxt} · nudges ${count('nudges')} · ` +
              `usage_events ${count('usage_events')}`
          )
        );
        const baselineRecorded =
          (db.prepare(`SELECT COUNT(*) AS c FROM meta WHERE key LIKE 'baseline%'`).get() as { c: number }).c > 0;
        lines.push(
          baselineRecorded
            ? line('OK', 'baseline recorded (week-1 reference)')
            : line('--', 'baseline not recorded yet (week-1 reference)')
        );
        const pending = (
          db
            .prepare(
              `SELECT COUNT(*) AS c FROM llm_batches WHERE status IS NULL OR status NOT IN ('collected', 'failed', 'cancelled')`
            )
            .get() as { c: number }
        ).c;
        lines.push(
          pending > 0
            ? line('--', `pending llm_batches: ${pending} (collect with \`tokenlean report\` or \`tokenlean analyze --wait\`)`)
            : line('--', 'pending llm_batches: 0')
        );
        const spend = getSelfSpend(db);
        const usd = spend.usd > 0 && spend.usd < 0.01 ? spend.usd.toFixed(4) : spend.usd.toFixed(2);
        lines.push(
          line(
            '--',
            `self-spend: ${spend.inputTokens} input + ${spend.outputTokens} output tokens ` +
              `≈ $${usd} (tokenlean's own analysis cost)`
          )
        );
      } catch (err) {
        lines.push(line('FAIL', `database query failed: ${safeErr(err)}`));
      }
    }

    return lines.join('\n');
  } catch (err) {
    lines.push(line('FAIL', `status probe crashed: ${safeErr(err)}`));
    return lines.join('\n');
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}
