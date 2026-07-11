import { PROXY_DEFAULT_PORT, claudeSettingsPath } from '../config';

/**
 * `proxy enable` PRINTS the required settings changes — it never applies
 * them silently (SPEC §6). `disable` prints the exact reversal.
 */
export function printEnableInstructions(port?: number): void {
  const p = port ?? PROXY_DEFAULT_PORT;
  const settings = claudeSettingsPath();
  console.log(
    [
      'tokenlean proxy enable — nothing has been changed; here is exactly what to do.',
      '',
      `1. Edit ${settings} and add this to its "env" block`,
      '   (merge into any existing "env" object — do not replace other keys):',
      '',
      '     "env": {',
      `       "ANTHROPIC_BASE_URL": "http://127.0.0.1:${p}"`,
      '     }',
      '',
      '2. Restart Claude Code sessions. Claude Code reads env at process start,',
      '   so running sessions are unaffected until restarted.',
      '',
      'Notes:',
      '  - Side effect: a non-first-party base URL disables MCP tool search by',
      '    default. Re-enable it by also adding "ENABLE_TOOL_SEARCH": "true" to',
      '    the same "env" block.',
      '  - Fail-loud: with ANTHROPIC_BASE_URL set and the proxy NOT running,',
      '    Claude Code requests fail visibly. `tokenlean status` diagnoses this.',
      '  - The proxy must be running first: `tokenlean proxy start` (foreground;',
      '    v1 has no daemon mode — keep the terminal open).',
    ].join('\n')
  );
}

export function printDisableInstructions(): void {
  const settings = claudeSettingsPath();
  console.log(
    [
      'tokenlean proxy disable — nothing has been changed; here is exactly what to do.',
      '',
      `1. Edit ${settings} and remove "ANTHROPIC_BASE_URL" from its "env" block.`,
      '   Optionally also remove "ENABLE_TOOL_SEARCH" if you only added it for',
      '   the proxy.',
      '',
      '2. Restart Claude Code sessions (env is read at process start, so running',
      '   sessions keep using the proxy until restarted).',
      '',
      '3. Stop the proxy process: `tokenlean proxy stop` (or Ctrl-C its terminal).',
    ].join('\n')
  );
}
