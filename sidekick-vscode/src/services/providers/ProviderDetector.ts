/**
 * @fileoverview Auto-detection of installed CLI coding agents.
 *
 * Determines which SessionProvider to use based on user configuration
 * or auto-detection of installed tools (Claude Code vs OpenCode).
 *
 * @module services/providers/ProviderDetector
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ClaudeCodeSessionProvider } from './ClaudeCodeSessionProvider';
import { OpenCodeSessionProvider } from './OpenCodeSessionProvider';
import type { SessionProvider } from '../../types/sessionProvider';
import { log } from '../Logger';

/**
 * Gets the OpenCode data directory path for detection.
 */
function getOpenCodeDataDir(): string {
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) {
    return path.join(xdg, 'opencode');
  }
  return path.join(os.homedir(), '.local', 'share', 'opencode');
}

function getOpenCodeStorageDir(): string {
  return path.join(getOpenCodeDataDir(), 'storage');
}

/**
 * Gets the most recent file modification time in a directory tree (shallow).
 * Returns 0 if directory doesn't exist or has no files.
 */
function getMostRecentMtime(dir: string): number {
  try {
    if (!fs.existsSync(dir)) return 0;

    let latest = 0;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      try {
        const stats = fs.statSync(path.join(dir, entry));
        if (stats.mtime.getTime() > latest) {
          latest = stats.mtime.getTime();
        }
      } catch {
        // Skip inaccessible entries
      }
    }
    return latest;
  } catch {
    return 0;
  }
}

/**
 * Gets the most recent OpenCode activity timestamp.
 * Checks opencode.db mtime first (more accurate), then falls back to storage dirs.
 */
function getOpenCodeActivityMtime(storageDir: string): number {
  // Check DB file mtime — more accurate than scanning subdirs
  const dbPath = path.join(path.dirname(storageDir), 'opencode.db');
  try {
    const dbMtime = fs.statSync(dbPath).mtime.getTime();
    if (dbMtime > 0) return dbMtime;
  } catch {
    // DB doesn't exist, fall back to storage dirs
  }

  const sessionMtime = getMostRecentMtime(path.join(storageDir, 'session'));
  const messageMtime = getMostRecentMtime(path.join(storageDir, 'message'));
  const partMtime = getMostRecentMtime(path.join(storageDir, 'part'));
  return Math.max(sessionMtime, messageMtime, partMtime);
}

/**
 * Detects which SessionProvider to use.
 *
 * Priority:
 * 1. User's explicit `sidekick.sessionProvider` setting
 * 2. Auto-detect based on which CLI agent has more recent session data
 * 3. Default to Claude Code (original provider)
 *
 * @returns The appropriate SessionProvider instance
 */
export function detectProvider(): SessionProvider {
  const config = vscode.workspace.getConfiguration('sidekick');
  const preference = config.get<string>('sessionProvider', 'auto');

  if (preference === 'claude-code') {
    log('Session provider: Claude Code (configured)');
    return new ClaudeCodeSessionProvider();
  }

  if (preference === 'opencode') {
    log('Session provider: OpenCode (configured)');
    return new OpenCodeSessionProvider();
  }

  // Auto-detect: check for session directories and database
  const openCodeStorage = getOpenCodeStorageDir();
  const openCodeDbPath = path.join(getOpenCodeDataDir(), 'opencode.db');
  const claudeBase = path.join(os.homedir(), '.claude', 'projects');

  const hasOpenCode = fs.existsSync(openCodeStorage) || fs.existsSync(openCodeDbPath);
  const hasClaude = fs.existsSync(claudeBase);

  log(`Auto-detecting session provider: Claude Code=${hasClaude}, OpenCode=${hasOpenCode}`);

  if (hasOpenCode && hasClaude) {
    // Both exist — prefer whichever has more recent activity
    const claudeMtime = getMostRecentMtime(claudeBase);
    const openCodeMtime = getOpenCodeActivityMtime(openCodeStorage);

    if (openCodeMtime > claudeMtime) {
      log('Session provider: OpenCode (auto-detected, more recent activity)');
      return new OpenCodeSessionProvider();
    }

    log('Session provider: Claude Code (auto-detected, more recent activity)');
    return new ClaudeCodeSessionProvider();
  }

  if (hasOpenCode) {
    log('Session provider: OpenCode (auto-detected)');
    return new OpenCodeSessionProvider();
  }

  // Default to Claude Code
  log('Session provider: Claude Code (default)');
  return new ClaudeCodeSessionProvider();
}
