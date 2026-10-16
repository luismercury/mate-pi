#!/usr/bin/env node
// rsc Line Guard (modularidad y legibilidad para humanos e IA).
// Wired by targets/claude.js onto PreToolUse (matcher Write|Edit|NotebookEdit|Bash)
//   argv[2] = absolute project root   stdin = PreToolUse hook JSON
//
// Reglas:
// - <= 400 líneas: Permitido (allow).
// - 401 a 450 líneas: Advertencia (ask) para alertar sobre la necesidad de modularizar.
// - > 450 líneas: Bloqueo duro (deny) rechazando la operación.
//
// Exclusiones: Documentación (.md, 02-DOCS/), manifiestos generados y lockfiles.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, isAbsolute, extname } from 'node:path';

const root = process.argv[2] || process.cwd();

export const WARN_LINE_LIMIT = 400;
export const HARD_LINE_LIMIT = 450;

export const EXCLUDED_EXTENSIONS = new Set([
  '.md', '.markdown', '.txt', '.csv', '.tsv', '.svg', '.lock'
]);

export const EXCLUDED_FILES = new Set([
  'manifest.json', 'package-lock.json', '.rsc.json', '.gitignore'
]);

export const EXCLUDED_DIRS = [
  '02-DOCS', '.git', '.codegraph', 'node_modules', '.gemini'
];

function allow() {
  process.exit(0);
}

function ask(file, lines, why) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: `rsc: El archivo "${file}" tiene ${lines} líneas (${why}). Se recomienda modularizarlo para mantener legibilidad humana y de IA.`,
    },
  }));
  process.exit(0);
}

function deny(file, lines, why) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `BLOCKED por límite de legibilidad: El archivo "${file}" tendría ${lines} líneas, excediendo el límite duro de ${HARD_LINE_LIMIT} líneas (${why}). Divide la lógica en módulos más pequeños.`,
    },
  }));
  process.exit(0);
}

// Comprueba si un path debe estar exento del control de líneas
export function isExcluded(filePath) {
  if (!filePath) return true;
  const normalized = filePath.replace(/\\/g, '/');
  const base = normalized.split('/').pop();
  const ext = extname(base).toLowerCase();

  if (EXCLUDED_EXTENSIONS.has(ext)) return true;
  if (EXCLUDED_FILES.has(base)) return true;

  for (const dir of EXCLUDED_DIRS) {
    if (normalized.includes(`/${dir}/`) || normalized.startsWith(`${dir}/`)) {
      return true;
    }
  }

  return false;
}

// Evalúa la cantidad de líneas que tendrá el archivo
export function evaluateLines(filePath, content) {
  if (typeof content !== 'string') return 0;
  return content.split('\n').length;
}

// Procesa el payload del hook
export function checkToolInput(input, projectRoot = root) {
  const toolName = input.tool_name || input.toolName || '';
  const toolInput = input.tool_input || input.toolInput || {};

  // Caso 1: Write
  if (toolName === 'Write') {
    const rawPath = toolInput.file_path || toolInput.path || '';
    const filePath = isAbsolute(rawPath) ? rawPath : join(projectRoot, rawPath);
    if (isExcluded(rawPath)) return { action: 'allow' };

    const content = toolInput.content || '';
    const lines = evaluateLines(filePath, content);

    if (lines > HARD_LINE_LIMIT) {
      return { action: 'deny', file: rawPath, lines, limit: HARD_LINE_LIMIT };
    }
    if (lines > WARN_LINE_LIMIT) {
      return { action: 'ask', file: rawPath, lines, limit: WARN_LINE_LIMIT };
    }
    return { action: 'allow', lines };
  }

  // Caso 2: Edit
  if (toolName === 'Edit') {
    const rawPath = toolInput.file_path || toolInput.path || '';
    const filePath = isAbsolute(rawPath) ? rawPath : join(projectRoot, rawPath);
    if (isExcluded(rawPath)) return { action: 'allow' };

    let currentContent = '';
    try {
      if (existsSync(filePath)) {
        currentContent = readFileSync(filePath, 'utf8');
      }
    } catch {
      return { action: 'allow' };
    }

    const oldStr = toolInput.old_string || toolInput.oldString || '';
    const newStr = toolInput.new_string || toolInput.newString || '';

    let resultingContent = currentContent;
    if (oldStr) {
      resultingContent = currentContent.replace(oldStr, newStr);
    } else {
      resultingContent = currentContent + '\n' + newStr;
    }

    const lines = evaluateLines(filePath, resultingContent);
    if (lines > HARD_LINE_LIMIT) {
      return { action: 'deny', file: rawPath, lines, limit: HARD_LINE_LIMIT };
    }
    if (lines > WARN_LINE_LIMIT) {
      return { action: 'ask', file: rawPath, lines, limit: WARN_LINE_LIMIT };
    }
    return { action: 'allow', lines };
  }

  return { action: 'allow' };
}

// Ejecución si se llama como CLI / Hook
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename || process.argv[1])) {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    allow();
  }

  const result = checkToolInput(input, root);
  if (result.action === 'deny') {
    deny(result.file, result.lines, `supera el corte duro de ${HARD_LINE_LIMIT} líneas`);
  } else if (result.action === 'ask') {
    ask(result.file, result.lines, `supera la advertencia de ${WARN_LINE_LIMIT} líneas`);
  } else {
    allow();
  }
}
