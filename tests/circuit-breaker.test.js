import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTokenCount, checkContextLimit, TOKEN_LIMIT } from '../targets/circuit-breaker.mjs';
import { getDb, listRecentObservations } from '../targets/custom-engram-sqlite.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('circuit-breaker: extractTokenCount handles various agent payload shapes', () => {
  assert.equal(extractTokenCount({ total_tokens: 150000 }), 150000);
  assert.equal(extractTokenCount({ tokenCount: 200000 }), 200000);
  assert.equal(extractTokenCount({ usage: { input_tokens: 120000, output_tokens: 30000 } }), 150000);
  assert.equal(extractTokenCount({ transcript_length: 400000 }), 100000);
  assert.equal(extractTokenCount({}), 0);
});

test('circuit-breaker: checkContextLimit allows below 249k and trips at 249k+', () => {
  const tempDb = join(tmpdir(), `engram-cb-test-${Date.now()}.db`);
  process.env.CUSTOM_ENGRAM_DB = tempDb;

  const resAllow = checkContextLimit({ total_tokens: 240000 });
  assert.equal(resAllow.action, 'allow');
  assert.equal(resAllow.tokens, 240000);

  const resTrip = checkContextLimit({ total_tokens: 249000 });
  assert.equal(resTrip.action, 'deny');
  assert.equal(resTrip.tokens, 249000);
  assert.equal(resTrip.limit, TOKEN_LIMIT);
  assert.ok(resTrip.reason.includes('249.000 tokens'));

  // Verify checkpoint was saved into the database
  const db = getDb(tempDb);
  const recent = listRecentObservations(db, { limit: 5 });
  assert.equal(recent.length, 1);
  assert.ok(recent[0].title.includes('Cold Reboot Checkpoint'));
  assert.ok(recent[0].content.includes((249000).toLocaleString()) && recent[0].content.includes('tokens'));
});
