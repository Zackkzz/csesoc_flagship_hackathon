import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { spawn, spawnSync } from 'child_process';
import type { AddressInfo } from 'net';

// Isolate all tokenlean state (pidfile, default db path) in a temp home.
// config.ts reads env lazily at call time, so setting it here (after the
// hoisted imports have evaluated) is safe.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tokenlean-proxy-test-'));
process.env.TOKENLEAN_HOME = TMP;
process.env.TOKENLEAN_DB = path.join(TMP, 'db.sqlite');

import { openDb, type DB } from '../src/db';
import { startProxy, stopProxy } from '../src/proxy/server';
import { extractUsageFromSse, extractUsageFromJson } from '../src/proxy/usage';

// File-level cleanup: runs after every suite in this file (the stopProxy
// suite still needs TMP after the proxy suite's own afterAll has run).
afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SSE_BODY = [
  'event: message_start',
  'data: {"type":"message_start","message":{"id":"msg_01","type":"message","role":"assistant","model":"claude-opus-4-8","content":[],"stop_reason":null,"usage":{"input_tokens":1000,"cache_read_input_tokens":800,"cache_creation_input_tokens":50,"output_tokens":1}}}',
  '',
  'event: content_block_start',
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"héllo "}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"wörld ✨🦄"}}',
  '',
  'event: totally_unknown_future_event',
  'data: {"type":"totally_unknown_future_event","mystery":{"nested":[1,2,{"deep":"✓"}]},"flag":true,"emoji":"🎁"}',
  '',
  'event: message_delta',
  'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":321}}',
  '',
  'event: message_stop',
  'data: {"type":"message_stop"}',
  '',
  '',
].join('\n');

const JSON_BODY = JSON.stringify({
  id: 'msg_02',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-4-5',
  content: [{ type: 'text', text: 'ok ✔' }],
  stop_reason: 'end_turn',
  usage: {
    input_tokens: 42,
    output_tokens: 7,
    cache_read_input_tokens: 12,
    cache_creation_input_tokens: 3,
  },
  some_future_field: { unknown: ['a', 1, null], nested: { deep: true } },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Split a buffer into n roughly-equal slices (may cut multi-byte chars). */
function slices(buf: Buffer, n: number): Buffer[] {
  const out: Buffer[] = [];
  const step = Math.ceil(buf.length / n);
  for (let i = 0; i < buf.length; i += step) {
    out.push(buf.subarray(i, Math.min(i + step, buf.length)));
  }
  return out;
}

/** Write a response body in several delayed chunks (simulates streaming). */
async function writeChunked(res: http.ServerResponse, buf: Buffer): Promise<void> {
  for (const part of slices(buf, 5)) {
    res.write(part);
    await sleep(8);
  }
  res.end();
}

interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

/** Raw HTTP client: no auto-decompression, exact response bytes. */
function rawRequest(
  port: number,
  opts: { method: string; path: string; headers?: http.OutgoingHttpHeaders; body?: Buffer }
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: opts.path, method: opts.method, headers: opts.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) })
        );
      }
    );
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Proxy end-to-end (the M4 byte-identity gate)
// ---------------------------------------------------------------------------

describe('proxy pass-through', () => {
  let db: DB;
  let mock: http.Server;
  let mockPort: number;
  let proxy: http.Server;
  let proxyPort: number;
  const extraServers: http.Server[] = [];

  type Received = { method: string; url: string; headers: http.IncomingHttpHeaders; body: Buffer };
  const received: Received[] = [];
  let mockHandler: (req: http.IncomingMessage, res: http.ServerResponse, body: Buffer) => void;

  function usageRows(): any[] {
    return db.prepare('SELECT * FROM usage_events ORDER BY id').all();
  }

  /** The tee inserts its row just after the client sees `end`; poll briefly. */
  async function waitForRows(n: number, ms = 2000): Promise<void> {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (usageRows().length >= n) return;
      await sleep(20);
    }
  }

  beforeAll(async () => {
    db = openDb(path.join(TMP, 'db.sqlite'));

    mock = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        received.push({ method: req.method || '', url: req.url || '', headers: req.headers, body });
        mockHandler(req, res, body);
      });
    });
    await new Promise<void>((r) => mock.listen(0, '127.0.0.1', () => r()));
    mockPort = (mock.address() as AddressInfo).port;

    proxy = await startProxy(db, { port: 0, upstream: `http://127.0.0.1:${mockPort}` });
    proxyPort = (proxy.address() as AddressInfo).port;
  });

  afterAll(async () => {
    for (const s of [proxy, mock, ...extraServers]) {
      if (!s) continue;
      (s as any).closeAllConnections?.();
      await new Promise<void>((r) => s.close(() => r()));
    }
    db.close();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM usage_events').run();
    received.length = 0;
  });

  it('streaming SSE: byte-identical passthrough + exact usage row', async () => {
    mockHandler = (_req, res) => {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        'x-mock-custom': 'preserved-123',
      });
      void writeChunked(res, Buffer.from(SSE_BODY, 'utf8'));
    };

    const reqBody = Buffer.from(
      JSON.stringify({
        model: 'claude-opus-4-8',
        stream: true,
        max_tokens: 512,
        messages: [{ role: 'user', content: 'héllo — 试试看 🎈' }],
      }),
      'utf8'
    );
    const reqOpts = {
      method: 'POST',
      path: '/v1/messages',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'sk-ant-test-key-000',
        'anthropic-version': '2023-06-01',
        'content-length': reqBody.length,
      },
      body: reqBody,
    };

    const direct = await rawRequest(mockPort, reqOpts);
    const viaProxy = await rawRequest(proxyPort, reqOpts);

    // Byte identity: status, body bytes, custom + content-type headers.
    expect(viaProxy.status).toBe(direct.status);
    expect(Buffer.compare(viaProxy.body, direct.body)).toBe(0);
    expect(viaProxy.body.toString('utf8')).toBe(SSE_BODY);
    expect(viaProxy.headers['x-mock-custom']).toBe('preserved-123');
    expect(viaProxy.headers['content-type']).toBe(direct.headers['content-type']);

    // Upstream saw identical request bytes; auth passed through; host swapped.
    expect(received).toHaveLength(2);
    const [d, p] = received;
    expect(Buffer.compare(d.body, p.body)).toBe(0);
    expect(p.headers['x-api-key']).toBe('sk-ant-test-key-000');
    expect(p.headers['anthropic-version']).toBe('2023-06-01');
    expect(p.headers.host).toBe(`127.0.0.1:${mockPort}`);

    // Exactly one usage row with the exact token numbers.
    await waitForRows(1);
    const rows = usageRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      model: 'claude-opus-4-8',
      input_tokens: 1000,
      output_tokens: 321, // final cumulative value from message_delta
      cache_read_tokens: 800,
      cache_write_tokens: 50,
      request_path: '/v1/messages',
      streaming: 1,
    });
  });

  it('non-streaming JSON with unknown extra fields: byte-identical + usage row', async () => {
    mockHandler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON_BODY);
    };
    const body = Buffer.from('{"model":"claude-haiku-4-5","messages":[]}', 'utf8');
    const reqOpts = {
      method: 'POST',
      path: '/v1/messages',
      headers: { 'content-type': 'application/json', 'content-length': body.length },
      body,
    };

    const direct = await rawRequest(mockPort, reqOpts);
    const viaProxy = await rawRequest(proxyPort, reqOpts);
    expect(viaProxy.status).toBe(direct.status);
    expect(Buffer.compare(viaProxy.body, direct.body)).toBe(0);
    expect(viaProxy.body.toString('utf8')).toBe(JSON_BODY);

    await waitForRows(1);
    const rows = usageRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      model: 'claude-haiku-4-5',
      input_tokens: 42,
      output_tokens: 7,
      cache_read_tokens: 12,
      cache_write_tokens: 3,
      request_path: '/v1/messages',
      streaming: 0,
    });
  });

  it('tees /v1/messages with a query string too', async () => {
    mockHandler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON_BODY);
    };
    const viaProxy = await rawRequest(proxyPort, { method: 'POST', path: '/v1/messages?beta=true' });
    expect(viaProxy.status).toBe(200);
    await waitForRows(1);
    expect(usageRows()[0]).toMatchObject({ request_path: '/v1/messages?beta=true', streaming: 0 });
  });

  it('unrelated path GET /v1/models: byte-identical, no usage row', async () => {
    const listing = JSON.stringify({ data: [{ id: 'claude-opus-4-8' }], has_more: false });
    mockHandler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(listing);
    };
    const direct = await rawRequest(mockPort, { method: 'GET', path: '/v1/models' });
    const viaProxy = await rawRequest(proxyPort, { method: 'GET', path: '/v1/models' });
    expect(viaProxy.status).toBe(direct.status);
    expect(Buffer.compare(viaProxy.body, direct.body)).toBe(0);
    await sleep(200);
    expect(usageRows()).toHaveLength(0);
  });

  it('does NOT tee /v1/messages/batches', async () => {
    mockHandler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON_BODY); // even though this carries a usage block
    };
    const viaProxy = await rawRequest(proxyPort, { method: 'POST', path: '/v1/messages/batches' });
    expect(viaProxy.status).toBe(200);
    await sleep(200);
    expect(usageRows()).toHaveLength(0);
  });

  it('gzipped JSON: client gets identical compressed bytes, usage still extracted', async () => {
    const gz = zlib.gzipSync(Buffer.from(JSON_BODY, 'utf8'));
    mockHandler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' });
      res.end(gz);
    };
    const direct = await rawRequest(mockPort, { method: 'POST', path: '/v1/messages' });
    const viaProxy = await rawRequest(proxyPort, { method: 'POST', path: '/v1/messages' });

    // Passthrough stays compressed, byte-for-byte.
    expect(viaProxy.headers['content-encoding']).toBe('gzip');
    expect(Buffer.compare(viaProxy.body, direct.body)).toBe(0);
    expect(viaProxy.body.equals(gz)).toBe(true);

    // The tee decompressed its own copy.
    await waitForRows(1);
    expect(usageRows()[0]).toMatchObject({
      model: 'claude-haiku-4-5',
      input_tokens: 42,
      output_tokens: 7,
      streaming: 0,
    });
  });

  it('HTML garbage on /v1/messages: passthrough identical, no row, no crash', async () => {
    const garbage = '<html><body>upstream had a bad day &amp; returned garbage 🙃</body></html>';
    mockHandler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(garbage);
    };
    const direct = await rawRequest(mockPort, { method: 'POST', path: '/v1/messages' });
    const viaProxy = await rawRequest(proxyPort, { method: 'POST', path: '/v1/messages' });
    expect(Buffer.compare(viaProxy.body, direct.body)).toBe(0);
    expect(viaProxy.body.toString('utf8')).toBe(garbage);
    await sleep(200);
    expect(usageRows()).toHaveLength(0);

    // The proxy is still healthy afterwards.
    mockHandler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON_BODY);
    };
    const again = await rawRequest(proxyPort, { method: 'POST', path: '/v1/messages' });
    expect(again.status).toBe(200);
  });

  it('upstream down: loud 502 explaining the fail-loud posture', async () => {
    // Reserve then release an ephemeral port so nothing is listening on it.
    const tmpSrv = http.createServer();
    await new Promise<void>((r) => tmpSrv.listen(0, '127.0.0.1', () => r()));
    const deadPort = (tmpSrv.address() as AddressInfo).port;
    await new Promise<void>((r) => tmpSrv.close(() => r()));

    const deadProxy = await startProxy(db, { port: 0, upstream: `http://127.0.0.1:${deadPort}` });
    extraServers.push(deadProxy);
    const deadProxyPort = (deadProxy.address() as AddressInfo).port;

    const res = await rawRequest(deadProxyPort, { method: 'POST', path: '/v1/messages' });
    expect(res.status).toBe(502);
    const text = res.body.toString('utf8');
    expect(text).toContain('tokenlean proxy');
    expect(text).toContain('could not reach upstream');
    expect(text).toContain('tokenlean proxy disable');
    expect(text).toContain('ANTHROPIC_BASE_URL');
    expect(text).toContain('tokenlean status');
  });
});

// ---------------------------------------------------------------------------
// Usage extraction units
// ---------------------------------------------------------------------------

describe('extractUsageFromSse', () => {
  it('extracts model + tokens, preferring the final message_delta output count', () => {
    expect(extractUsageFromSse(SSE_BODY)).toEqual({
      model: 'claude-opus-4-8',
      inputTokens: 1000,
      outputTokens: 321,
      cacheReadTokens: 800,
      cacheWriteTokens: 50,
    });
  });

  it('handles CRLF line endings', () => {
    const crlf = SSE_BODY.replace(/\n/g, '\r\n');
    expect(extractUsageFromSse(crlf)).toMatchObject({ inputTokens: 1000, outputTokens: 321 });
  });

  it('skips broken data lines but keeps valid ones', () => {
    const body = [
      'event: message_start',
      'data: {this is not json',
      '',
      'event: message_start',
      'data: {"type":"message_start","message":{"model":"m1","usage":{"input_tokens":9,"output_tokens":1}}}',
      '',
      '',
    ].join('\n');
    expect(extractUsageFromSse(body)).toMatchObject({ model: 'm1', inputTokens: 9, outputTokens: 1 });
  });

  it('returns null on garbage / empty / fence-y bodies', () => {
    expect(extractUsageFromSse('lol not sse at all')).toBeNull();
    expect(extractUsageFromSse('')).toBeNull();
    expect(extractUsageFromSse('```json\n{"usage":{"input_tokens":5}}\n```')).toBeNull();
    expect(extractUsageFromSse('event: message_start\ndata: 42\n\n')).toBeNull();
    expect(extractUsageFromSse('<html>error page</html>')).toBeNull();
  });
});

describe('extractUsageFromJson', () => {
  it('extracts usage + model from a message object', () => {
    expect(extractUsageFromJson(JSON_BODY)).toEqual({
      model: 'claude-haiku-4-5',
      inputTokens: 42,
      outputTokens: 7,
      cacheReadTokens: 12,
      cacheWriteTokens: 3,
    });
  });

  it('tolerates missing model and missing cache fields', () => {
    expect(extractUsageFromJson('{"usage":{"input_tokens":5,"output_tokens":2}}')).toEqual({
      model: null,
      inputTokens: 5,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });

  it('returns null on absence or parse failure, never throws', () => {
    expect(extractUsageFromJson('not json')).toBeNull();
    expect(extractUsageFromJson('')).toBeNull();
    expect(extractUsageFromJson('{}')).toBeNull();
    expect(extractUsageFromJson('[]')).toBeNull();
    expect(extractUsageFromJson('{"usage":"nope"}')).toBeNull();
    expect(extractUsageFromJson('{"usage":{"input_tokens":"x"}}')).toBeNull();
    expect(extractUsageFromJson('null')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// stopProxy pidfile lifecycle
// ---------------------------------------------------------------------------

describe('stopProxy', () => {
  const pidfile = () => path.join(TMP, 'proxy.pid');

  // Always clear the pidfile first: startProxy in earlier suites wrote the
  // CURRENT process pid into it, and stopProxy must never SIGTERM vitest.
  beforeEach(() => {
    fs.mkdirSync(TMP, { recursive: true });
    fs.rmSync(pidfile(), { force: true });
  });

  it('returns stopped:false when there is no pidfile', () => {
    expect(stopProxy()).toEqual({ stopped: false });
  });

  it('removes a corrupt pidfile and reports stopped:false', () => {
    fs.writeFileSync(pidfile(), 'not-a-pid');
    expect(stopProxy()).toEqual({ stopped: false });
    expect(fs.existsSync(pidfile())).toBe(false);
  });

  it('removes a stale pidfile (dead pid) and reports stopped:false', () => {
    const dead = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
    expect(dead.pid).toBeGreaterThan(0);
    fs.writeFileSync(pidfile(), String(dead.pid));
    expect(stopProxy()).toEqual({ stopped: false });
    expect(fs.existsSync(pidfile())).toBe(false);
  });

  it('SIGTERMs a live pid and removes the pidfile', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    });
    await new Promise<void>((r) => child.once('spawn', () => r()));
    fs.writeFileSync(pidfile(), String(child.pid));
    const exited = new Promise<void>((r) => child.once('exit', () => r()));
    expect(stopProxy()).toEqual({ stopped: true, pid: child.pid });
    await exited;
    expect(fs.existsSync(pidfile())).toBe(false);
  });
});
