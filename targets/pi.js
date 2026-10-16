import { existsSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as mdAdapter from './_md-block.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function writeSkill(id, fromDir, toPath) {
  return mdAdapter.writeSkill(id, fromDir, toPath);
}

export function wireHook(paths, sourceMd, policy = {}) {
  const touched = mdAdapter.wireHook(paths, sourceMd, policy);

  // Equip project with .pi/extensions/mate-pi if not present
  const extDir = join(paths.projectRoot, '.pi', 'extensions');
  mkdirSync(extDir, { recursive: true });
  const srcTs = join(ROOT, '.pi', 'extensions', 'mate-pi.ts');
  const srcJs = join(ROOT, '.pi', 'extensions', 'mate-pi.js');
  const dstTs = join(extDir, 'mate-pi.ts');
  const dstJs = join(extDir, 'mate-pi.js');

  if (existsSync(srcTs) && !existsSync(dstTs)) {
    cpSync(srcTs, dstTs);
    touched.push(dstTs);
  }
  if (existsSync(srcJs) && !existsSync(dstJs)) {
    cpSync(srcJs, dstJs);
    touched.push(dstJs);
  }

  // Ensure .mcp.json exists in target project
  const srcMcp = join(ROOT, '.mcp.json');
  const dstMcp = join(paths.projectRoot, '.mcp.json');
  if (existsSync(srcMcp) && !existsSync(dstMcp)) {
    cpSync(srcMcp, dstMcp);
    touched.push(dstMcp);
  }

  return touched;
}

export function unwireHook(paths) {
  return mdAdapter.unwireHook(paths);
}
