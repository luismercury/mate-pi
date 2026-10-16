import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  initSchema,
  ensureProject,
  saveObservation,
  searchObservations,
  listRecentObservations,
  saveCircuitBreakerCheckpoint,
} from '../targets/custom-engram-sqlite.mjs';

test('custom-engram-sqlite: schema initialization and project creation in in-memory DB', () => {
  const db = new DatabaseSync(':memory:');
  initSchema(db);

  const proj = ensureProject(db, 'test-project', '/path/to/test');
  assert.ok(proj.id);
  assert.equal(proj.name, 'test-project');

  // Second call returns existing project
  const proj2 = ensureProject(db, 'test-project', '/another/path');
  assert.equal(proj2.id, proj.id);
});

test('custom-engram-sqlite: save and search observations via FTS5', () => {
  const db = new DatabaseSync(':memory:');
  initSchema(db);

  const res1 = saveObservation(db, {
    projectName: 'mate-pi',
    title: 'Arquitectura FTS5 y Guardrails',
    content: 'Se definieron los guardrails duros para 400 lineas y 249k tokens de disyuntor.',
    type: 'architecture',
    topicKey: 'arch/guardrails',
  });
  assert.ok(res1.id);
  assert.equal(res1.updated, false);

  // Search by exact keyword using FTS5
  const matches = searchObservations(db, { projectName: 'mate-pi', query: 'guardrails' });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].title, 'Arquitectura FTS5 y Guardrails');

  // Upsert on same topic_key
  const res2 = saveObservation(db, {
    projectName: 'mate-pi',
    title: 'Arquitectura FTS5 y Guardrails v2',
    content: 'Actualizado el limite a 400 advertencia y 450 bloqueo.',
    type: 'architecture',
    topicKey: 'arch/guardrails',
  });
  assert.equal(res2.id, res1.id);
  assert.equal(res2.updated, true);

  const updatedMatches = searchObservations(db, { projectName: 'mate-pi', query: 'bloqueo' });
  assert.equal(updatedMatches.length, 1);
  assert.equal(updatedMatches[0].title, 'Arquitectura FTS5 y Guardrails v2');
});

test('custom-engram-sqlite: saveCircuitBreakerCheckpoint writes pinned checkpoint', () => {
  const db = new DatabaseSync(':memory:');
  initSchema(db);

  const res = saveCircuitBreakerCheckpoint(db, {
    projectName: 'mate-pi',
    tokenCount: 249500,
    reason: 'Context limit threshold 249k reached',
    summary: 'Saved turn state before cold reboot',
  });

  assert.ok(res.id);

  const recent = listRecentObservations(db, { projectName: 'mate-pi', limit: 5 });
  assert.equal(recent.length, 1);
  assert.equal(recent[0].is_pinned, 1);
  assert.ok(recent[0].title.includes('Cold Reboot Checkpoint'));
  assert.ok(recent[0].content.includes((249500).toLocaleString()) && recent[0].content.includes('tokens'));
});
