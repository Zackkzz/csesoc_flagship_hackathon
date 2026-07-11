import { describe, it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import type { AddressInfo } from 'net';

// Isolate all state; config.ts reads these lazily so post-import is fine.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tokenlean-status-test-'));
process.env.TOKENLEAN_HOME = TMP;
process.env.TOKENLEAN_DB = path.join(TMP, 'db.sqlite');
process.env.TOKENLEAN_CLAUDE_SETTINGS = path.join(TMP, 'settings.json');

import { runStatus } from '../src/status';
import { openDb, metaSet } from '../src/db';

const settingsFile = path.join(TMP, 'settings.json');
const dbFile = path.join(TMP, 'db.sqlite');

/** Grab an ephemeral port with nothing listening on it. */
async function deadPort(): Promise<number> {
  const srv = http.createServer();
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as AddressInfo).port;
  await new Promise<void>((r) => srv.close(() => r()));
  return port;
}

describe('runStatus', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_BASE_URL;
    for (const f of [settingsFile, dbFile, `${dbFile}-wal`, `${dbFile}-shm`, path.join(TMP, 'proxy.pid')]) {
      fs.rmSync(f, { force: true });
    }
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_BASE_URL;
  });

  afterAll(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('reports a clean slate without throwing and prefixes every line', async () => {
    const out = await runStatus();
    expect(out).toContain('ANTHROPIC_BASE_URL');
    expect(out).toContain('not created');
    expect(out).not.toContain('FAIL');
    for (const l of out.split('\n')) {
      expect(l).toMatch(/^(OK|WARN|FAIL|--)\s/);
    }
  });

  it('FAILs loud when a base URL is configured but nothing is listening', async () => {
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${await deadPort()}`;
    const out = await runStatus();
    expect(out).toMatch(/^FAIL/m);
    expect(out).toContain('failing right now');
    expect(out).toContain('tokenlean proxy start');
    expect(out).toContain('tokenlean proxy disable');
  });

  it('reports OK when the configured base URL has a listener (settings env block)', async () => {
    const srv = http.createServer();
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const port = (srv.address() as AddressInfo).port;
    fs.writeFileSync(
      settingsFile,
      JSON.stringify({ env: { ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}` } })
    );
    try {
      const out = await runStatus();
      expect(out).toContain(`http://127.0.0.1:${port}`);
      expect(out).toMatch(/^OK\s+proxy listening/m);
      expect(out).not.toMatch(/^FAIL/m);
    } finally {
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });

  it('WARNs (never throws) on a corrupt settings file', async () => {
    fs.writeFileSync(settingsFile, '{ this is not json');
    const out = await runStatus();
    expect(out).toContain('WARN');
    expect(out).toContain('unreadable');
  });

  it('detects the tokenlean hook and the muted state', async () => {
    fs.writeFileSync(
      settingsFile,
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            { hooks: [{ type: 'command', command: 'npx tokenlean hook' }] },
          ],
        },
      })
    );
    const db = openDb(dbFile);
    metaSet(db, 'muted_until', String(Date.now() + 24 * 60 * 60 * 1000));
    db.close();

    const out = await runStatus();
    expect(out).toMatch(/^OK\s+coaching hook installed/m);
    expect(out).toContain('nudges muted until');
  });

  it('reports DB counts, baseline state, pending batches and self-spend', async () => {
    const db = openDb(dbFile);
    db.prepare(
      `INSERT INTO usage_events
         (ts, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, request_path, streaming)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(Date.now(), 'claude-opus-4-8', 10, 5, 0, 0, '/v1/messages', 1);
    db.prepare(`INSERT INTO sessions (id, project) VALUES ('s1', 'proj')`).run();
    db.prepare(
      `INSERT INTO findings (session_id, category, confidence, evidence, suggestion, created_at, source)
       VALUES ('s1', 'rework_loop', 0.9, 'e', 's', ?, 'heuristic')`
    ).run(Date.now());
    db.prepare(
      `INSERT INTO llm_batches (id, submitted_at, status, session_ids, model)
       VALUES ('batch_1', ?, 'submitted', '["s1"]', 'claude-haiku-4-5')`
    ).run(Date.now());
    db.close();

    const out = await runStatus();
    expect(out).toContain('sessions 1');
    expect(out).toContain('usage_events 1');
    expect(out).toContain('findings 1 (heuristic 1)');
    expect(out).toContain('baseline not recorded');
    expect(out).toContain('pending llm_batches: 1');
    expect(out).toContain('self-spend');
  });
});
