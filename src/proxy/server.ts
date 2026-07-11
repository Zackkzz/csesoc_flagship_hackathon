import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';
import { PassThrough } from 'stream';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import type { DB } from '../db';
import type { ParsedUsage } from '../types';
import { PROXY_DEFAULT_PORT, proxyPidPath, tokenleanHome, upstreamUrl } from '../config';
import { extractUsageFromJson, extractUsageFromSse } from './usage';

/**
 * Read-only pass-through proxy (SPEC §6).
 *
 * Hard rule: request and response bodies are forwarded BYTE-FOR-BYTE by
 * piping streams — never buffered, never parsed, never re-serialized. The
 * only header the proxy touches is the request `host` (transport
 * necessity). Usage observation happens on a private copy of the response
 * after it has already streamed to the client, so a tee failure can never
 * affect traffic. Auth headers pass through untouched; no header value is
 * ever logged or written to the database.
 */

/** Tee accumulation cap: beyond this we abandon parsing, never the passthrough. */
const MAX_TEE_BYTES = 10 * 1024 * 1024;

function debug(msg: string): void {
  if (process.env.TOKENLEAN_DEBUG) console.error(`[tokenlean proxy] ${msg}`);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** POST /v1/messages (query string allowed) — NOT /v1/messages/batches etc. */
function isMessagesPath(url: string): boolean {
  return url.split('?')[0] === '/v1/messages';
}

type InsertUsage = (u: ParsedUsage, streaming: number, requestPath: string) => void;

/**
 * Attach an observation-only tee to an upstream response. The tee gets a
 * copy of every chunk via extra listeners (never via pipe(), so its
 * backpressure can never pause the client-facing stream). After the
 * response ends we parse the copy; any error is logged and skipped.
 */
function attachUsageTee(
  upstreamRes: http.IncomingMessage,
  requestPath: string,
  insert: InsertUsage
): void {
  const tee = new PassThrough();
  const chunks: Buffer[] = [];
  let bytes = 0;
  let abandoned = false;

  tee.on('data', (chunk: Buffer) => {
    if (abandoned) return;
    bytes += chunk.length;
    if (bytes > MAX_TEE_BYTES) {
      abandoned = true;
      chunks.length = 0;
      debug(`tee abandoned for ${requestPath}: copy exceeded ${MAX_TEE_BYTES} bytes`);
      return;
    }
    chunks.push(chunk);
  });
  tee.on('error', () => {
    /* the tee must never surface errors */
  });
  tee.on('end', () => {
    if (abandoned) return;
    try {
      let buf: Buffer = Buffer.concat(chunks);
      const encoding = String(upstreamRes.headers['content-encoding'] || '')
        .trim()
        .toLowerCase();
      // Decompress OUR COPY only — the passthrough stays compressed exactly
      // as the upstream sent it.
      if (encoding === 'gzip' || encoding === 'x-gzip') {
        buf = zlib.gunzipSync(buf);
      } else if (encoding === 'deflate') {
        try {
          buf = zlib.inflateSync(buf);
        } catch {
          buf = zlib.inflateRawSync(buf);
        }
      } else if (encoding === 'br') {
        buf = zlib.brotliDecompressSync(buf);
      } else if (encoding && encoding !== 'identity') {
        debug(`usage extraction skipped for ${requestPath}: unsupported content-encoding`);
        return;
      }
      const contentType = String(upstreamRes.headers['content-type'] || '').toLowerCase();
      const body = buf.toString('utf8');
      if (contentType.includes('text/event-stream')) {
        const usage = extractUsageFromSse(body);
        if (usage) insert(usage, 1, requestPath);
      } else if (contentType.includes('application/json')) {
        const usage = extractUsageFromJson(body);
        if (usage) insert(usage, 0, requestPath);
      }
      // Any other content type: nothing to observe.
    } catch (err) {
      debug(`usage extraction skipped for ${requestPath}: ${errMsg(err)}`);
    }
  });

  // Feed the tee manually so it can never apply backpressure to upstreamRes.
  upstreamRes.on('data', (chunk: Buffer) => {
    tee.write(chunk);
  });
  upstreamRes.on('end', () => tee.end());
  upstreamRes.on('aborted', () => {
    abandoned = true;
    chunks.length = 0;
    tee.destroy();
  });
}

function makeHandler(db: DB, upstream: URL): http.RequestListener {
  // https.request accepts http.RequestOptions at runtime; the cast unifies
  // the two module signatures.
  const requestFn: typeof http.request =
    upstream.protocol === 'https:' ? (https.request as typeof http.request) : http.request;
  const upstreamPort = upstream.port
    ? parseInt(upstream.port, 10)
    : upstream.protocol === 'https:'
      ? 443
      : 80;

  const stmt = db.prepare(
    `INSERT INTO usage_events
       (ts, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, request_path, streaming)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertUsage: InsertUsage = (u, streaming, requestPath) => {
    try {
      stmt.run(
        Date.now(),
        u.model,
        u.inputTokens,
        u.outputTokens,
        u.cacheReadTokens,
        u.cacheWriteTokens,
        requestPath,
        streaming
      );
    } catch (err) {
      // A locked/broken DB must never affect the passthrough.
      debug(`usage row insert failed: ${errMsg(err)}`);
    }
  };

  return (req, res) => {
    const requestPath = req.url || '/';
    // Only the host header changes; everything else (auth included) passes
    // through untouched.
    const headers: http.OutgoingHttpHeaders = { ...req.headers, host: upstream.host };

    const upstreamReq = requestFn(
      {
        hostname: upstream.hostname,
        port: upstreamPort,
        method: req.method || 'GET',
        path: requestPath,
        headers,
      },
      (upstreamRes) => {
        if (req.method === 'POST' && isMessagesPath(requestPath)) {
          attachUsageTee(upstreamRes, requestPath, insertUsage);
        }
        res.writeHead(
          upstreamRes.statusCode || 502,
          upstreamRes.statusMessage,
          upstreamRes.headers
        );
        upstreamRes.pipe(res);
        upstreamRes.on('error', (err) => {
          debug(`upstream response error: ${errMsg(err)}`);
          res.destroy();
        });
      }
    );

    // Request body: pipe, never buffer, never parse (privacy + byte-identity).
    req.pipe(upstreamReq);
    req.on('error', () => upstreamReq.destroy());
    res.on('close', () => {
      if (!res.writableEnded) upstreamReq.destroy();
    });

    upstreamReq.on('error', (err) => {
      debug(`upstream request error: ${errMsg(err)}`);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      // Fail loud (SPEC §6): the user must see WHY requests are failing.
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(
        [
          `tokenlean proxy: could not reach upstream ${upstream.origin} (${errMsg(err)}).`,
          '',
          'Claude Code requests routed through this proxy are failing right now.',
          '- If the upstream is temporarily unreachable, check your network and retry.',
          '- If you meant to stop using the proxy, run `tokenlean proxy disable` and',
          '  remove ANTHROPIC_BASE_URL from your Claude Code settings.',
          '- Diagnose with: tokenlean status',
          '',
        ].join('\n')
      );
    });
  };
}

/**
 * Start the pass-through proxy. Resolves with the Server once listening
 * (opts.port 0 is supported; read the real port from server.address()).
 * Writes a pidfile so `tokenlean proxy stop` works. Runs in the foreground:
 * SIGINT/SIGTERM close the server, remove the pidfile, and exit 0.
 */
export function startProxy(
  db: DB,
  opts?: { port?: number; upstream?: string }
): Promise<Server> {
  const port = opts?.port ?? PROXY_DEFAULT_PORT;
  const upstream = new URL(opts?.upstream || upstreamUrl());
  const server = http.createServer(makeHandler(db, upstream));
  // Long agentic SSE turns can exceed Node's default 300s request timeout.
  server.requestTimeout = 0;

  return new Promise((resolve, reject) => {
    const onListenError = (err: Error) => reject(err);
    server.once('error', onListenError);
    // Loopback only: the proxy must never be reachable from the network.
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', onListenError);
      server.on('error', (err) => console.error(`tokenlean proxy server error: ${errMsg(err)}`));

      const addr = server.address() as AddressInfo;
      try {
        fs.mkdirSync(tokenleanHome(), { recursive: true });
        fs.writeFileSync(proxyPidPath(), `${process.pid}\n`);
      } catch (err) {
        console.error(`tokenlean proxy: could not write pidfile: ${errMsg(err)}`);
      }

      console.log(
        `tokenlean proxy listening on http://127.0.0.1:${addr.port} -> ${upstream.origin}`
      );
      console.log(
        'Read-only guarantee: requests and responses pass through byte-for-byte and are ' +
          'never mutated; API keys are never stored or logged.'
      );
      console.log(
        'Route Claude Code through it: `tokenlean proxy enable` (prints the settings ' +
          'change) - check health: `tokenlean status` - stop: Ctrl-C or `tokenlean proxy stop`.'
      );

      const shutdown = () => {
        try {
          fs.unlinkSync(proxyPidPath());
        } catch {
          /* already gone */
        }
        server.close(() => process.exit(0));
        // close() waits for open keep-alive sockets; don't hang forever.
        setTimeout(() => process.exit(0), 1000).unref();
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);

      resolve(server);
    });
  });
}

/** Stop a running proxy via its pidfile. */
export function stopProxy(): { stopped: boolean; pid?: number } {
  const pidPath = proxyPidPath();
  let raw: string;
  try {
    raw = fs.readFileSync(pidPath, 'utf8');
  } catch {
    return { stopped: false };
  }
  const removePidfile = () => {
    try {
      fs.unlinkSync(pidPath);
    } catch {
      /* already gone */
    }
  };
  const pid = parseInt(raw.trim(), 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    removePidfile();
    return { stopped: false };
  }
  try {
    process.kill(pid, 0); // liveness probe only
  } catch {
    removePidfile(); // stale pidfile
    return { stopped: false };
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* raced with exit — treat as stopped */
  }
  removePidfile();
  return { stopped: true, pid };
}
