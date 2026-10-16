// mate-pi extension for Pi.dev
// Enforces hard constraints:
// 1. Line limits: 400 lines warning / 450 lines hard block
// 2. Token circuit breaker: 249k tokens (24.9%) with custom-engram SQLite checkpoint
// 3. Memory injection from ~/.custom-engram/engram.db

let checkToolInput, checkContextLimit, getDb, listRecentObservations;

try {
  const lineMod = await import('./lib/line-guard.mjs');
  const cbMod = await import('./lib/circuit-breaker.mjs');
  const sqlMod = await import('./lib/custom-engram-sqlite.mjs');
  checkToolInput = lineMod.checkToolInput;
  checkContextLimit = cbMod.checkContextLimit;
  getDb = sqlMod.getDb;
  listRecentObservations = sqlMod.listRecentObservations;
} catch {
  const lineMod = await import('../../targets/line-guard.mjs');
  const cbMod = await import('../../targets/circuit-breaker.mjs');
  const sqlMod = await import('../../targets/custom-engram-sqlite.mjs');
  checkToolInput = lineMod.checkToolInput;
  checkContextLimit = cbMod.checkContextLimit;
  getDb = sqlMod.getDb;
  listRecentObservations = sqlMod.listRecentObservations;
}

export default function(pi) {
  // Session startup: inject memory observations into Pi
  pi.on?.('session_start', async (event, ctx) => {
    try {
      const db = getDb();
      const obs = listRecentObservations(db, { limit: 3 });
      if (obs && obs.length) {
        const text = obs.map((o) => `[${o.type.toUpperCase()}] ${o.title}: ${o.content.slice(0, 140)}...`).join('\n');
        ctx?.uiContext?.notify?.(`mate-pi: ${obs.length} observaciones de memoria cargadas desde custom-engram.`);
      }
    } catch {
      // Fail open if SQLite is unavailable
    }
  });

  // Intercept tool calls to enforce 400/450 line limits on write and edit
  pi.on?.('tool_call', async (event) => {
    const toolName = event?.name || event?.tool;
    const input = event?.input || event?.params || {};

    if (toolName === 'write' || toolName === 'edit') {
      const mappedInput = {
        tool_name: toolName === 'write' ? 'Write' : 'Edit',
        tool_input: {
          file_path: input.path || input.file_path,
          content: input.content,
          old_string: input.old_string || input.oldText,
          new_string: input.new_string || input.newText,
        },
      };

      const result = checkToolInput(mappedInput, process.cwd());
      if (result.action === 'deny') {
        throw new Error(`BLOCKED por mate-pi: El archivo tendría ${result.lines} líneas, superando el límite duro de ${result.limit} líneas. Divida el módulo.`);
      } else if (result.action === 'ask') {
        console.warn(`[mate-pi ADVERTENCIA]: El archivo tiene ${result.lines} líneas (supera advertencia de ${result.limit} líneas). Se recomienda modularizar.`);
      }
    }
  });

  // End of turn / context monitoring for 249k tokens circuit breaker
  pi.on?.('agent_settled', async (event, ctx) => {
    try {
      const stats = ctx?.session?.stats || ctx?.stats;
      const tokens = stats?.totalTokens || stats?.tokenCount || 0;
      if (tokens >= 249000) {
        const check = checkContextLimit({ total_tokens: tokens }, process.cwd());
        if (check.action === 'deny') {
          ctx?.uiContext?.notify?.(`[DISYUNTOR ACTIVADO]: ${check.reason}. Ejecute Cold Reboot.`);
        }
      }
    } catch {
      // Fail open
    }
  });
}
