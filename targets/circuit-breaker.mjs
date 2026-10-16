#!/usr/bin/env node
// rsc Circuit Breaker (Disyuntor de contexto a los 249.000 tokens / 24.9%).
// Wired by targets/claude.js onto PreToolUse / UserPromptSubmit
//   argv[2] = absolute project root   stdin = Hook JSON
//
// Al alcanzar el umbral de 249.000 tokens:
// 1. Guarda automáticamente un checkpoint en la base SQLite de custom-engram.
// 2. Bloquea la acción (deny) e instruye al agente/usuario a ejecutar un Cold Reboot.

import { existsSync, readFileSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { getDb, saveCircuitBreakerCheckpoint } from './custom-engram-sqlite.mjs';

const root = process.argv[2] || process.cwd();

export const TOKEN_LIMIT = 249000;

function allow() {
  process.exit(0);
}

function deny(tokenCount, why) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `DISYUNTOR DE CONTEXTO ACTIVADO: La ventana de contexto ha alcanzado ${tokenCount.toLocaleString()} tokens ` +
        `(${why}). Se ha registrado un checkpoint de seguridad en custom-engram. ` +
        `Por favor, guarde los cambios finales, cierre esta sesión e inicie una nueva ventana de contexto (Cold Reboot).`,
    },
  }));
  process.exit(0);
}

// Extrae el recuento de tokens reportado por el agente en el payload del hook
export function extractTokenCount(input) {
  if (!input || typeof input !== 'object') return 0;

  // Variantes comunes según el cliente/agente
  const direct = input.token_count || input.tokenCount || input.total_tokens || input.totalTokens;
  if (typeof direct === 'number') return direct;

  const usage = input.usage || input.token_usage || input.context_usage;
  if (usage && typeof usage === 'object') {
    const total = usage.total_tokens || usage.totalTokens || (usage.input_tokens || 0) + (usage.output_tokens || 0);
    if (typeof total === 'number') return total;
  }

  // Estimar por longitud de transcripción si no hay métrica directa
  if (typeof input.transcript_length === 'number') {
    // Aproximación conservadora: ~4 caracteres por token
    return Math.floor(input.transcript_length / 4);
  }

  return 0;
}

export function resolveProjectName(projectRoot = root) {
  try {
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
    if (pkg.name) return pkg.name.replace(/^@[^/]+\//, '');
  } catch { /* ignorar */ }
  return basename(resolve(projectRoot)) || 'default';
}

export function checkContextLimit(input, projectRoot = root) {
  const tokens = extractTokenCount(input);
  if (tokens >= TOKEN_LIMIT) {
    const projectName = resolveProjectName(projectRoot);
    const sessionId = input.session_id || input.sessionId || input.conversation_id || null;

    try {
      const db = getDb();
      saveCircuitBreakerCheckpoint(db, {
        projectName,
        rootPath: projectRoot,
        sessionId,
        tokenCount: tokens,
        reason: `Límite crítico alcanzado (${tokens.toLocaleString()} >= ${TOKEN_LIMIT.toLocaleString()} tokens)`,
        summary: `Cold Reboot forzado por disyuntor en ${projectName}.`,
      });
    } catch (err) {
      // Continuar con el deny incluso si falla la persistencia local
    }

    return {
      action: 'deny',
      tokens,
      limit: TOKEN_LIMIT,
      reason: `umbral crítico de 249.000 tokens (24.9% de capacidad)`,
    };
  }

  return { action: 'allow', tokens };
}

// Ejecución como script
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename || process.argv[1])) {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    allow();
  }

  const result = checkContextLimit(input, root);
  if (result.action === 'deny') {
    deny(result.tokens, result.reason);
  } else {
    allow();
  }
}
