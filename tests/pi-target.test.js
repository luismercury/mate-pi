import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectTarget, targetPaths } from '../targets/index.js';
import * as piAdapter from '../targets/pi.js';

test('pi-target: detectTarget resolves to pi when .pi folder exists', () => {
  const tempDir = join(tmpdir(), `test-pi-detect-${Date.now()}`);
  mkdirSync(join(tempDir, '.pi'), { recursive: true });
  try {
    const detected = detectTarget(tempDir);
    assert.equal(detected, 'pi');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('pi-target: targetPaths returns correct pi paths', () => {
  const dummyCwd = join(tmpdir(), 'dummy-cwd');
  const paths = targetPaths('pi', undefined, dummyCwd);
  assert.equal(paths.root, join(dummyCwd, '.pi', 'skills'));
  assert.equal(paths.hookTarget, join(dummyCwd, 'AGENTS.md'));
});

test('pi-target: wireHook creates AGENTS.md, equips .pi/extensions and .mcp.json', () => {
  const tempDir = join(tmpdir(), `test-pi-wire-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  const dummySkillMd = join(tempDir, 'dummy-source.md');
  writeFileSync(dummySkillMd, '# Suggest Rule\nThis is a suggest rule.');

  const paths = targetPaths('pi', undefined, tempDir);

  try {
    const touched = piAdapter.wireHook(paths, dummySkillMd, {});
    assert.ok(touched.length > 0);
    assert.ok(existsSync(paths.hookTarget));

    const content = readFileSync(paths.hookTarget, 'utf8');
    assert.ok(content.includes('<!-- rsc-suggest:start -->'));
    assert.ok(content.includes('Suggest Rule'));

    // Check .pi/extensions and .mcp.json
    assert.ok(existsSync(join(tempDir, '.pi', 'extensions', 'mate-pi.ts')));
    assert.ok(existsSync(join(tempDir, '.pi', 'extensions', 'mate-pi.js')));
    assert.ok(existsSync(join(tempDir, '.mcp.json')));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
