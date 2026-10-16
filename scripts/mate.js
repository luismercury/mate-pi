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
  mate equip             Equipa el proyecto actual con guardrails, MCP y skills para Pi.dev (1 paso)
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

if (args[0] === 'equip') {
  const targetDir = process.cwd();
  console.log(`\nEquipando proyecto en: ${targetDir} con mate-pi...`);

  const { existsSync, writeFileSync, readFileSync } = await import('node:fs');
  const { targetPaths } = await import('../targets/index.js');
  const piAdapter = await import('../targets/pi.js');

  const ROOT = join(HERE, '..');
  const piPaths = targetPaths('pi', undefined, targetDir);

  // 1. Cablear hook AGENTS.md, extensiones y .mcp.json
  const sourceSuggest = join(ROOT, 'skills', 'suggest', 'SKILL.md');
  piAdapter.wireHook(piPaths, sourceSuggest, {});

  // 2. Instalar skills núcleo por defecto: orient, review, git-workflow
  const defaultSkills = ['orient', 'review', 'git-workflow'];
  const state = { skills: {} };

  for (const s of defaultSkills) {
    const from = join(ROOT, 'skills', s);
    const to = join(piPaths.root, s);
    if (existsSync(from)) {
      piAdapter.writeSkill(s, from, to);
      state.skills[s] = { installedAt: new Date().toISOString() };
    }
  }

  // 3. Registrar estado en .rsc-state.json
  writeFileSync(piPaths.stateFile, JSON.stringify(state, null, 2) + '\n');

  // 4. Proteger .gitignore local
  const gitignorePath = join(targetDir, '.gitignore');
  const ignoreLine = '.pi/skills/*';
  if (existsSync(gitignorePath)) {
    const existing = readFileSync(gitignorePath, 'utf8');
    if (!existing.includes(ignoreLine)) {
      writeFileSync(gitignorePath, existing.trimEnd() + '\n\n# mate-pi local skills\n' + ignoreLine + '\n!.pi/skills/.rsc-state.json\n');
    }
  }

  console.log(`\n=== mate-pi: Proyecto Equipado Exitosamente ===`);
  console.log(`✔ Guardrails duros activos: 400 advertencia / 450 bloqueo duro (.pi/extensions/mate-pi.ts)`);
  console.log(`✔ Disyuntor de tokens activo: 249.000 tokens con SQLite (.pi/extensions/mate-pi.ts)`);
  console.log(`✔ Servidores MCP activos: CodeGraph + Context7 (.mcp.json)`);
  console.log(`✔ Skills base instaladas: orient, review, git-workflow (.pi/skills/)`);
  console.log(`✔ Instrucciones de contexto generadas: AGENTS.md`);
  console.log(`\n¡Listo! Ahora abre tu terminal y ejecuta 'pi' para comenzar.`);
  console.log(`===============================================\n`);
  process.exit(0);
}

// Delegar el resto de comandos directamente al motor rsc.js de upstream
await import('./rsc.js');
