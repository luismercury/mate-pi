import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkToolInput, isExcluded } from '../targets/line-guard.mjs';

test('line-guard: isExcluded recognizes documentation, manifests and lockfiles', () => {
  assert.equal(isExcluded('02-DOCS/wiki/test.md'), true);
  assert.equal(isExcluded('docs/guide.markdown'), true);
  assert.equal(isExcluded('manifest.json'), true);
  assert.equal(isExcluded('package-lock.json'), true);
  assert.equal(isExcluded('src/app.js'), false);
  assert.equal(isExcluded('targets/line-guard.mjs'), false);
});

test('line-guard: Write tool checks line count correctly (350 allow, 420 ask, 455 deny)', () => {
  const content350 = Array.from({ length: 350 }, (_, i) => `console.log(${i});`).join('\n');
  const res350 = checkToolInput({
    tool_name: 'Write',
    tool_input: { file_path: 'src/module.js', content: content350 },
  });
  assert.equal(res350.action, 'allow');

  const content420 = Array.from({ length: 420 }, (_, i) => `console.log(${i});`).join('\n');
  const res420 = checkToolInput({
    tool_name: 'Write',
    tool_input: { file_path: 'src/module.js', content: content420 },
  });
  assert.equal(res420.action, 'ask');
  assert.equal(res420.lines, 420);

  const content455 = Array.from({ length: 455 }, (_, i) => `console.log(${i});`).join('\n');
  const res455 = checkToolInput({
    tool_name: 'Write',
    tool_input: { file_path: 'src/module.js', content: content455 },
  });
  assert.equal(res455.action, 'deny');
  assert.equal(res455.lines, 455);
});

test('line-guard: excluded files with > 450 lines are allowed', () => {
  const content600 = Array.from({ length: 600 }, (_, i) => `# Line ${i}`).join('\n');
  const resMd = checkToolInput({
    tool_name: 'Write',
    tool_input: { file_path: 'docs/architecture.md', content: content600 },
  });
  assert.equal(resMd.action, 'allow');

  const resManifest = checkToolInput({
    tool_name: 'Write',
    tool_input: { file_path: 'manifest.json', content: content600 },
  });
  assert.equal(resManifest.action, 'allow');
});

test('line-guard: Edit tool validates resulting lines from existing file and replacements', () => {
  const tempDir = join(tmpdir(), `rsc-line-test-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  const testFile = join(tempDir, 'test-target.js');
  const initial380 = Array.from({ length: 380 }, (_, i) => `const x${i} = ${i};`).join('\n');
  writeFileSync(testFile, initial380, 'utf8');

  // Edit adding 40 lines (total 420 -> ask)
  const additional40 = Array.from({ length: 40 }, (_, i) => `const y${i} = ${i};`).join('\n');
  const resAsk = checkToolInput({
    tool_name: 'Edit',
    tool_input: {
      file_path: testFile,
      old_string: 'const x0 = 0;',
      new_string: `const x0 = 0;\n${additional40}`,
    },
  }, tempDir);
  assert.equal(resAsk.action, 'ask');
  assert.equal(resAsk.lines, 420);

  // Edit adding 80 lines (total 460 -> deny)
  const additional80 = Array.from({ length: 80 }, (_, i) => `const z${i} = ${i};`).join('\n');
  const resDeny = checkToolInput({
    tool_name: 'Edit',
    tool_input: {
      file_path: testFile,
      old_string: 'const x0 = 0;',
      new_string: `const x0 = 0;\n${additional80}`,
    },
  }, tempDir);
  assert.equal(resDeny.action, 'deny');
  assert.equal(resDeny.lines, 460);

  rmSync(tempDir, { recursive: true, force: true });
});
