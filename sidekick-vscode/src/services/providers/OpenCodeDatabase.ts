/**
 * @fileoverview Read-only SQLite wrapper for OpenCode's database.
 *
 * OpenCode stores session data in a SQLite database at
 * ~/.local/share/opencode/opencode.db (or $XDG_DATA_HOME/opencode/opencode.db).
 * This module provides typed, read-only access to projects, sessions,
 * messages, and parts.
 *
 * Uses the `sqlite3` CLI tool for queries, which handles WAL mode
 * transparently (seeing uncommitted writes while OpenCode is running).
 * No native modules or WASM required.
 *
 * @module services/providers/OpenCodeDatabase
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import type { DbProject, DbSession, DbMessage, DbPart } from '../../types/opencode';
import { log } from '../Logger';

/**
 * Read-only SQLite wrapper for the OpenCode database.
 *
 * All methods are wrapped in try/catch and return null/empty on failure.
 * Uses `sqlite3` CLI with `-json` output for reliable WAL-aware reads.
 */
export class OpenCodeDatabase {
  private readonly dbPath: string;
  private sqlite3Available: boolean | null = null;

  constructor(dataDir: string) {
    this.dbPath = path.join(dataDir, 'opencode.db');
  }

  /** Whether the database file exists on disk. */
  isAvailable(): boolean {
    return fs.existsSync(this.dbPath);
  }

  /** Verify sqlite3 CLI is available. Returns false on failure. */
  open(): boolean {
    if (this.sqlite3Available !== null) return this.sqlite3Available;

    try {
      execFileSync('sqlite3', ['--version'], {
        encoding: 'utf-8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.sqlite3Available = true;
      log(`OpenCode database ready (sqlite3 CLI): ${this.dbPath}`);
      return true;
    } catch (error) {
      log(`sqlite3 CLI not available: ${error}`);
      this.sqlite3Available = false;
      return false;
    }
  }

  /** No-op for CLI-based access. */
  close(): void {
    // Nothing to close — each query spawns a fresh sqlite3 process
  }

  // --- Query helpers ---

  /**
   * Run a SQL query via the sqlite3 CLI and return parsed JSON rows.
   * Parameters are escaped and substituted into the query string.
   */
  private query<T>(sql: string, params: (string | number)[] = []): T[] {
    if (!this.sqlite3Available) return [];

    // Substitute parameters into the query
    let query = sql;
    for (const param of params) {
      if (typeof param === 'number') {
        query = query.replace('?', String(param));
      } else {
        // Escape single quotes by doubling them (SQL standard)
        const escaped = String(param).replace(/'/g, "''");
        query = query.replace('?', `'${escaped}'`);
      }
    }

    try {
      const result = execFileSync('sqlite3', ['-json', '-readonly', this.dbPath, query], {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 50 * 1024 * 1024, // 50MB for large session data
      });

      const trimmed = result.trim();
      if (!trimmed) return [];
      return JSON.parse(trimmed) as T[];
    } catch (error) {
      // Only log unexpected errors, not empty results
      const msg = String(error);
      if (!msg.includes('not an error')) {
        log(`OpenCodeDatabase query error: ${msg.substring(0, 200)}`);
      }
      return [];
    }
  }

  /** Run a query and return the first row. */
  private queryOne<T>(sql: string, params: (string | number)[] = []): T | null {
    const results = this.query<T>(sql, params);
    return results[0] ?? null;
  }

  // --- Projects ---

  /** Find a project whose worktree matches the given workspace path. */
  findProjectByWorktree(workspacePath: string): DbProject | null {
    const normalized = normalizePath(workspacePath);

    try {
      // Exact match first
      const exact = this.queryOne<DbProject>(
        'SELECT id, worktree, name, time_created, time_updated FROM project WHERE worktree = ?',
        [normalized]
      );
      if (exact) return exact;

      // All projects for parent/child matching
      const all = this.query<DbProject>(
        'SELECT id, worktree, name, time_created, time_updated FROM project'
      );

      const matches: Array<DbProject & { pathLen: number }> = [];
      for (const proj of all) {
        const projPath = normalizePath(proj.worktree);
        if (projPath === normalized) {
          return proj;
        }
        if (normalized.startsWith(projPath + path.sep) || projPath.startsWith(normalized + path.sep)) {
          matches.push({ ...proj, pathLen: projPath.length });
        }
      }

      if (matches.length > 0) {
        matches.sort((a, b) => b.pathLen - a.pathLen);
        return matches[0];
      }

      return null;
    } catch (error) {
      log(`OpenCodeDatabase.findProjectByWorktree error: ${error}`);
      return null;
    }
  }

  /** Get all projects. */
  getAllProjects(): DbProject[] {
    return this.query<DbProject>(
      'SELECT id, worktree, name, time_created, time_updated FROM project'
    );
  }

  // --- Sessions ---

  /** Get all sessions for a project, ordered by most recent first. */
  getSessionsForProject(projectId: string): DbSession[] {
    return this.query<DbSession>(
      'SELECT id, project_id, title, directory, time_created, time_updated FROM session WHERE project_id = ? ORDER BY time_updated DESC',
      [projectId]
    );
  }

  /** Get the most recently updated session for a project. */
  getMostRecentSession(projectId: string): DbSession | null {
    return this.queryOne<DbSession>(
      'SELECT id, project_id, title, directory, time_created, time_updated FROM session WHERE project_id = ? ORDER BY time_updated DESC LIMIT 1',
      [projectId]
    );
  }

  /** Get a single session by ID. */
  getSession(sessionId: string): DbSession | null {
    return this.queryOne<DbSession>(
      'SELECT id, project_id, title, directory, time_created, time_updated FROM session WHERE id = ?',
      [sessionId]
    );
  }

  // --- Messages ---

  /** Get all messages for a session, ordered by creation time. */
  getMessagesForSession(sessionId: string): DbMessage[] {
    return this.query<DbMessage>(
      'SELECT id, session_id, time_created, time_updated, data FROM message WHERE session_id = ? ORDER BY time_created ASC',
      [sessionId]
    );
  }

  /** Get messages newer than a given time_updated timestamp (ms epoch). */
  getMessagesNewerThan(sessionId: string, afterTimeUpdated: number): DbMessage[] {
    return this.query<DbMessage>(
      'SELECT id, session_id, time_created, time_updated, data FROM message WHERE session_id = ? AND time_updated > ? ORDER BY time_created ASC',
      [sessionId, afterTimeUpdated]
    );
  }

  // --- Parts ---

  /** Get all parts for a message. */
  getPartsForMessage(messageId: string): DbPart[] {
    return this.query<DbPart>(
      'SELECT id, message_id, session_id, time_created, time_updated, data FROM part WHERE message_id = ? ORDER BY time_created ASC',
      [messageId]
    );
  }

  /** Get all parts for a session. */
  getPartsForSession(sessionId: string): DbPart[] {
    return this.query<DbPart>(
      'SELECT id, message_id, session_id, time_created, time_updated, data FROM part WHERE session_id = ? ORDER BY time_created ASC',
      [sessionId]
    );
  }

  /** Get parts newer than a given time_updated timestamp (ms epoch). */
  getPartsNewerThan(sessionId: string, afterTimeUpdated: number): DbPart[] {
    return this.query<DbPart>(
      'SELECT id, message_id, session_id, time_created, time_updated, data FROM part WHERE session_id = ? AND time_updated > ? ORDER BY time_created ASC',
      [sessionId, afterTimeUpdated]
    );
  }

  // --- Aggregates ---

  /** Get session count and max time_updated per project. */
  getProjectSessionStats(): Array<{ projectId: string; sessionCount: number; maxTimeUpdated: number }> {
    return this.query<{ projectId: string; sessionCount: number; maxTimeUpdated: number }>(
      'SELECT project_id AS projectId, COUNT(*) AS sessionCount, MAX(time_updated) AS maxTimeUpdated FROM session GROUP BY project_id'
    );
  }

  /** Get the database file's mtime (ms epoch). Returns 0 if unavailable. */
  getDbMtime(): number {
    try {
      return fs.statSync(this.dbPath).mtime.getTime();
    } catch {
      return 0;
    }
  }
}

/** Normalize a path using realpathSync, falling back to path.resolve. */
function normalizePath(input: string): string {
  try {
    return fs.realpathSync(input);
  } catch {
    return path.resolve(input);
  }
}
