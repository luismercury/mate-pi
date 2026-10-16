import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..');
const MATE_CLI = join(ROOT, 'scripts', 'mate.js');

test('mate-equip: equips a fresh directory with all mate-pi components in one step', () => {
  const tempDir = join(tmpdir(), `test-mate-equip-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  try {
    // Run node scripts/mate.js equip in the temp directory
    const output = execFileSync(process.execPath, [MATE_CLI, 'equip'], {
      cwd: tempDir,
      encoding: 'utf8',
    });

    assert.ok(output.includes('mate-pi: Proyecto Equipado Exitosamente'));

    // Check AGENTS.md
    const agentsPath = join(tempDir, 'AGENTS.md');
    assert.ok(existsSync(agentsPath), 'AGENTS.md should exist');
    const agentsContent = readFileSync(agentsPath, 'utf8');
    assert.ok(agentsContent.includes('<!-- rsc-suggest:start -->'));

    // Check .pi/extensions and self-contained lib
    assert.ok(existsSync(join(tempDir, '.pi', 'extensions', 'mate-pi.ts')), 'mate-pi.ts should exist');
    assert.ok(existsSync(join(tempDir, '.pi', 'extensions', 'mate-pi.js')), 'mate-pi.js should exist');
    assert.ok(existsSync(join(tempDir, '.pi', 'extensions', 'lib', 'line-guard.mjs')), 'line-guard.mjs should exist');
    assert.ok(existsSync(join(tempDir, '.pi', 'extensions', 'lib', 'circuit-breaker.mjs')), 'circuit-breaker.mjs should exist');
    assert.ok(existsSync(join(tempDir, '.pi', 'extensions', 'lib', 'custom-engram-sqlite.mjs')), 'custom-engram-sqlite.mjs should exist');

    // Check .mcp.json
    assert.ok(existsSync(join(tempDir, '.mcp.json')), '.mcp.json should exist');
    const mcp = JSON.parse(readFileSync(join(tempDir, '.mcp.json'), 'utf8'));
    assert.ok(mcp.mcpServers.codegraph, 'codegraph MCP should be declared');
    assert.ok(mcp.mcpServers.context7, 'context7 MCP should be declared');

    // Check default skills
    assert.ok(existsSync(join(tempDir, '.pi', 'skills', 'orient', 'SKILL.md')), 'orient skill should exist');
    assert.ok(existsSync(join(tempDir, '.pi', 'skills', 'review', 'SKILL.md')), 'review skill should exist');
    assert.ok(existsSync(join(tempDir, '.pi', 'skills', 'git-workflow', 'SKILL.md')), 'git-workflow skill should exist');
    assert.ok(existsSync(join(tempDir, '.pi', 'skills', '.rsc-state.json')), '.rsc-state.json should exist');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
