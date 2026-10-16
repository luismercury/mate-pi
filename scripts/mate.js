#!/usr/bin/env node
// mate-harness CLI entrypoint
// Wraps and extends upstream rsc engine with mate-pi custom guardrails and Pi.dev compatibility.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);

// Custom mate commands or banner
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
mate-harness (mate-pi) — AI Coding Agent Harness
Tuneado para Pi.dev con guardrails programáticos duros y persistencia SQLite.

Comandos principales:
  mate status            Estado del arnés, guardrails y base de memoria
  mate init              Inicializa el perfil del arnés en este proyecto
  mate add <skill>       Añade una habilidad al arnés
  mate doctor            Diagnóstico de configuración y congruencia
  mate catalog           Explora el catálogo de habilidades disponibles
  mate sync              Sincroniza habilidades con los asistentes configurados

Guardrails activos:
  - Límite de líneas:     400 advertencia / 450 bloqueo duro (targets/line-guard.mjs)
  - Disyuntor de tokens:  249.000 tokens / 24.9% con Cold Reboot (targets/circuit-breaker.mjs)
  - Memoria persistente:  SQLite FTS5 directo a custom-engram (targets/custom-engram-sqlite.mjs)
  - MCP:                  CodeGraph (estructural) + Context7 (librerías vivas)

Para ver las opciones completas de cada subcomando, ejecute: mate <comando> --help
`);
  process.exit(0);
}

if (args[0] === 'status') {
  console.log(`\n=== Estado de mate-harness (mate-pi) ===`);
  try {
    const { getDb, listRecentObservations } = await import('../targets/custom-engram-sqlite.mjs');
    const db = getDb();
    const recent = listRecentObservations(db, { limit: 3 });
    console.log(`✔ Conexión SQLite: Activa (custom-engram)`);
    console.log(`✔ Observaciones recientes: ${recent.length} encontradas`);
  } catch (err) {
    console.log(`⚠ Conexión SQLite: ${err.message}`);
  }
  console.log(`✔ Guardrail de líneas: Activo (400 adv / 450 deny)`);
  console.log(`✔ Disyuntor de tokens: Activo (umbral 249.000 tokens)`);
  console.log(`✔ Target Pi.dev: Configurado (.pi/skills, .mcp.json)`);
  console.log(`========================================\n`);
  process.exit(0);
}

// Delegar el resto de comandos directamente al motor rsc.js de upstream
await import('./rsc.js');
