import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

export const DEFAULT_DB_PATH = join(homedir(), '.custom-engram', 'engram.db');

export function getDb(dbPath = process.env.CUSTOM_ENGRAM_DB || DEFAULT_DB_PATH) {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  initSchema(db);
  return db;
}

export function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      root_path TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      goal TEXT,
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT,
      type TEXT NOT NULL DEFAULT 'discovery',
      scope TEXT NOT NULL DEFAULT 'project',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      topic_key TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_pinned INTEGER NOT NULL DEFAULT 0
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
      id UNINDEXED,
      project_id UNINDEXED,
      title,
      content,
      topic_key,
      type,
      scope
    );
  `);

  // Ensure triggers exist for keeping FTS5 in sync
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trig_obs_ai AFTER INSERT ON observations BEGIN
        INSERT INTO observations_fts (id, project_id, title, content, topic_key, type, scope)
        VALUES (new.id, new.project_id, new.title, new.content, new.topic_key, new.type, new.scope);
      END;

      CREATE TRIGGER IF NOT EXISTS trig_obs_ad AFTER DELETE ON observations BEGIN
        DELETE FROM observations_fts WHERE id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS trig_obs_au AFTER UPDATE ON observations BEGIN
        UPDATE observations_fts SET
          title = new.title,
          content = new.content,
          topic_key = new.topic_key,
          type = new.type,
          scope = new.scope
        WHERE id = old.id;
      END;
    `);
  } catch {
    // Triggers already exist or cannot be recreated
  }
}

export function ensureProject(db, name = 'default', rootPath = null) {
  const row = db.prepare('SELECT id, name, root_path FROM projects WHERE name = ?').get(name);
  if (row) return row;

  const id = randomUUID();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  db.prepare(`
    INSERT INTO projects (id, name, root_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, rootPath, now, now);

  return { id, name, root_path: rootPath };
}

export function saveObservation(db, {
  projectName = 'default',
  rootPath = null,
  sessionId = null,
  type = 'discovery',
  scope = 'project',
  title,
  content,
  topicKey = null,
  isPinned = 0,
}) {
  const project = ensureProject(db, projectName, rootPath);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // If topicKey is given, check for an existing observation under this project and topic_key
  if (topicKey) {
    const existing = db.prepare(`
      SELECT id FROM observations WHERE project_id = ? AND topic_key = ? LIMIT 1
    `).get(project.id, topicKey);

    if (existing) {
      db.prepare(`
        UPDATE observations
        SET title = ?, content = ?, type = ?, scope = ?, session_id = ?, updated_at = ?, is_pinned = ?
        WHERE id = ?
      `).run(title, content, type, scope, sessionId, now, isPinned ? 1 : 0, existing.id);
      return { id: existing.id, updated: true };
    }
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO observations (id, project_id, session_id, type, scope, title, content, topic_key, created_at, updated_at, is_pinned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, project.id, sessionId, type, scope, title, content, topicKey, now, now, isPinned ? 1 : 0);

  return { id, updated: false };
}

export function searchObservations(db, { projectName = null, query, limit = 10 }) {
  if (!query || typeof query !== 'string') return [];
  const cleanQuery = query.replace(/[^\w\s-]/g, ' ').trim();
  if (!cleanQuery) return [];

  let project = null;
  if (projectName) {
    project = db.prepare('SELECT id FROM projects WHERE name = ?').get(projectName);
  }

  try {
    if (project) {
      return db.prepare(`
        SELECT o.id, o.title, o.content, o.type, o.topic_key, o.scope, o.updated_at
        FROM observations o
        JOIN observations_fts fts ON o.id = fts.id
        WHERE observations_fts MATCH ? AND (o.project_id = ? OR o.scope = 'global')
        ORDER BY o.updated_at DESC
        LIMIT ?
      `).all(cleanQuery, project.id, limit);
    }
    return db.prepare(`
      SELECT o.id, o.title, o.content, o.type, o.topic_key, o.scope, o.updated_at
      FROM observations o
      JOIN observations_fts fts ON o.id = fts.id
      WHERE observations_fts MATCH ?
      ORDER BY o.updated_at DESC
      LIMIT ?
    `).all(cleanQuery, limit);
  } catch {
    // Fallback to LIKE if FTS query syntax error
    const likePattern = `%${cleanQuery}%`;
    if (project) {
      return db.prepare(`
        SELECT id, title, content, type, topic_key, scope, updated_at
        FROM observations
        WHERE (title LIKE ? OR content LIKE ? OR topic_key LIKE ?)
          AND (project_id = ? OR scope = 'global')
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(likePattern, likePattern, likePattern, project.id, limit);
    }
    return db.prepare(`
      SELECT id, title, content, type, topic_key, scope, updated_at
      FROM observations
      WHERE title LIKE ? OR content LIKE ? OR topic_key LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(likePattern, likePattern, likePattern, limit);
  }
}

export function listRecentObservations(db, { projectName = null, limit = 5 } = {}) {
  let project = null;
  if (projectName) {
    project = db.prepare('SELECT id FROM projects WHERE name = ?').get(projectName);
  }

  if (project) {
    return db.prepare(`
      SELECT id, title, content, type, topic_key, scope, updated_at, is_pinned
      FROM observations
      WHERE project_id = ? OR scope = 'global'
      ORDER BY is_pinned DESC, updated_at DESC
      LIMIT ?
    `).all(project.id, limit);
  }

  return db.prepare(`
    SELECT id, title, content, type, topic_key, scope, updated_at, is_pinned
    FROM observations
    ORDER BY is_pinned DESC, updated_at DESC
    LIMIT ?
  `).all(limit);
}

export function saveCircuitBreakerCheckpoint(db, {
  projectName = 'default',
  rootPath = null,
  sessionId = null,
  tokenCount = 249000,
  reason = 'Context ceiling reached',
  summary = '',
}) {
  const title = `Cold Reboot Checkpoint (${tokenCount.toLocaleString()} tokens)`;
  const content = `**What**: Circuit breaker triggered at ${tokenCount.toLocaleString()} tokens.
**Why**: ${reason}. Hard cutoff at 249k tokens to prevent degradation and high costs.
**Action**: Cold Reboot initiated (close session and open new clean context window).
**Summary**: ${summary || 'State saved prior to context reset.'}`;

  return saveObservation(db, {
    projectName,
    rootPath,
    sessionId,
    type: 'checkpoint',
    scope: 'project',
    title,
    content,
    topicKey: 'checkpoint/circuit-breaker',
    isPinned: 1,
  });
}
