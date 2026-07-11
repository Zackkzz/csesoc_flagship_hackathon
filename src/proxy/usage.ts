import type { ParsedUsage } from '../types';

/**
 * Usage extraction for the read-only proxy tee (SPEC §6).
 * These functions parse a PRIVATE COPY of a response after it has fully
 * streamed to the client. They must never throw on garbage input: a parse
 * failure means "no usage row", never a broken passthrough.
 */

/** Anthropic usage block as it appears in API responses. */
interface RawUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function emptyUsage(): ParsedUsage {
  return {
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

/**
 * Merge recognized numeric fields of a raw usage block into acc.
 * Later values overwrite earlier ones (message_delta carries the FINAL
 * cumulative output_tokens). Returns true if any field was present.
 */
function mergeUsage(acc: ParsedUsage, raw: RawUsage): boolean {
  let saw = false;
  const i = num(raw.input_tokens);
  if (i !== null) {
    acc.inputTokens = i;
    saw = true;
  }
  const o = num(raw.output_tokens);
  if (o !== null) {
    acc.outputTokens = o;
    saw = true;
  }
  const cr = num(raw.cache_read_input_tokens);
  if (cr !== null) {
    acc.cacheReadTokens = cr;
    saw = true;
  }
  const cw = num(raw.cache_creation_input_tokens);
  if (cw !== null) {
    acc.cacheWriteTokens = cw;
    saw = true;
  }
  return saw;
}

/**
 * Extract usage + model from a complete SSE body.
 * message_start carries message.model + message.usage (input/cache tokens,
 * provisional output). message_delta carries usage.output_tokens as the
 * final cumulative value, plus any other usage fields, which we merge.
 * Returns null if no usage block was seen anywhere.
 */
export function extractUsageFromSse(body: string): ParsedUsage | null {
  const acc = emptyUsage();
  let sawUsage = false;
  try {
    // SSE: events are blocks of "field: value" lines separated by blank lines.
    for (const block of String(body).split(/\r?\n\r?\n/)) {
      let eventName = '';
      const dataLines: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      let obj: any;
      try {
        // Per the SSE spec, multiple data lines in one event join with "\n".
        obj = JSON.parse(dataLines.join('\n'));
      } catch {
        continue; // bad JSON data line — skip, never throw
      }
      if (obj === null || typeof obj !== 'object') continue;
      const type = typeof obj.type === 'string' ? obj.type : eventName;
      if (type === 'message_start') {
        const message = obj.message;
        if (message && typeof message === 'object') {
          if (typeof message.model === 'string') acc.model = message.model;
          if (message.usage && typeof message.usage === 'object') {
            sawUsage = mergeUsage(acc, message.usage) || sawUsage;
          }
        }
      } else if (type === 'message_delta') {
        if (obj.usage && typeof obj.usage === 'object') {
          sawUsage = mergeUsage(acc, obj.usage) || sawUsage;
        }
      }
      // Every other event type (including unknown future ones) is ignored.
    }
  } catch {
    return sawUsage ? acc : null;
  }
  return sawUsage ? acc : null;
}

/** Extract usage from a non-streaming JSON /v1/messages response body. */
export function extractUsageFromJson(body: string): ParsedUsage | null {
  try {
    const obj = JSON.parse(String(body));
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return null;
    if (!obj.usage || typeof obj.usage !== 'object') return null;
    const acc = emptyUsage();
    if (typeof obj.model === 'string') acc.model = obj.model;
    return mergeUsage(acc, obj.usage) ? acc : null;
  } catch {
    return null;
  }
}
