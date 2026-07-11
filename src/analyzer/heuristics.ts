import type { DB } from '../db';
import type { HeuristicsResult } from '../types';

/**
 * Heuristic pass (SPEC §4.3): correction turns, repeated file reads,
 * cross-session context re-supply, paste-heavy prompts, abandonment.
 * Writes findings (source='heuristic'), flags turns.is_correction, and
 * stores a waste_score per session used to sample sessions for the LLM pass.
 */
export function runHeuristics(db: DB, opts?: { log?: (msg: string) => void }): HeuristicsResult {
  void db;
  void opts;
  throw new Error('not implemented: analyzer/heuristics (component A pending)');
}

/**
 * Record the week-1 baseline (meta key 'baseline') once enough data exists.
 * Returns true only on the run that records it.
 */
export function recordBaselineIfReady(db: DB): boolean {
  void db;
  throw new Error('not implemented: analyzer/heuristics baseline (component A pending)');
}
