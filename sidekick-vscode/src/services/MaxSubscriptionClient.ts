/**
 * @fileoverview Claude client using Max subscription via Claude Code CLI.
 *
 * This client uses @anthropic-ai/claude-agent-sdk to make requests
 * through the Claude Code infrastructure, using a user's existing
 * Claude Max subscription instead of API billing.
 *
 * @module MaxSubscriptionClient
 */

import * as vscode from 'vscode';
import * as os from 'os';
import { ClaudeClient, CompletionOptions } from '../types';
import { log, logError } from './Logger';

// Type for the query function from the SDK
type QueryFunction = typeof import('@anthropic-ai/claude-agent-sdk').query;

// Cached query function after dynamic import
let cachedQuery: QueryFunction | null = null;

/**
 * Gets a working directory for the SDK.
 * Uses workspace folder if available, otherwise home directory.
 */
function getWorkingDirectory(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
}

/**
 * Dynamically imports the SDK after patching process.cwd.
 * The SDK calls process.cwd() during module initialization,
 * which can be undefined in VS Code extensions.
 */
async function getQueryFunction(): Promise<QueryFunction> {
  if (cachedQuery) {
    log('Using cached query function');
    return cachedQuery;
  }

  const cwd = getWorkingDirectory();
  log(`Importing SDK with patched cwd: ${cwd}`);

  // Patch process.cwd before importing the SDK
  const originalCwd = process.cwd;
  process.cwd = () => cwd;

  try {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    cachedQuery = sdk.query;
    log('SDK imported successfully');
    return cachedQuery;
  } catch (error) {
    logError('Failed to import SDK', error);
    throw error;
  } finally {
    // Restore original cwd after import
    process.cwd = originalCwd;
  }
}

/**
 * Claude client using Max subscription authentication.
 *
 * Uses @anthropic-ai/claude-agent-sdk which interfaces with the
 * Claude Code CLI. Requires the user to have:
 * 1. Claude Code CLI installed (npm install -g @anthropic-ai/claude-code)
 * 2. An active Claude Max subscription
 * 3. Being logged in via `claude login`
 *
 * @example
 * ```typescript
 * const client = new MaxSubscriptionClient();
 * const response = await client.complete('Hello!');
 * ```
 */
export class MaxSubscriptionClient implements ClaudeClient {
  /**
   * Sends a prompt to Claude and returns the completion.
   *
   * Uses the claude-agent-sdk query function which routes through
   * the Claude Code infrastructure.
   *
   * @param prompt - The text prompt to send
   * @param options - Optional completion configuration
   * @returns Promise resolving to the completion text
   * @throws Error if request times out or fails
   */
  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const abortController = new AbortController();
    const timeoutMs = options?.timeout ?? 30000;
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    log(`MaxSubscriptionClient.complete called, model=${options?.model}, timeout=${timeoutMs}`);

    try {
      const query = await getQueryFunction();
      const cwd = getWorkingDirectory();

      log(`Starting query with cwd: ${cwd}`);

      for await (const message of query({
        prompt,
        options: {
          cwd,
          abortController,
          model: this.mapModel(options?.model),
          maxTurns: 1,
          allowedTools: [],
          permissionMode: 'bypassPermissions',
        },
      })) {
        log(`Received message: type=${message.type}, subtype=${'subtype' in message ? message.subtype : 'n/a'}`);
        if (message.type === 'result') {
          if (message.subtype === 'success') {
            log('Query succeeded');
            return message.result;
          }
          // Log full message for debugging
          log(`Result message: ${JSON.stringify(message, null, 2)}`);
          const errorMsg = message.errors?.join(', ') || message.subtype || 'Unknown error';
          logError(`Query failed: ${errorMsg}`);
          throw new Error(errorMsg);
        }
      }
      throw new Error('No result received');
    } catch (error) {
      logError('MaxSubscriptionClient.complete error', error);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Tests if Claude Code CLI is available.
   *
   * Checks if the `claude` command exists by running `claude --version`.
   * This is a synchronous check but only runs once during connection test.
   *
   * @returns Promise resolving to true if CLI is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Check if Claude Code CLI is available
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { execSync } = require('child_process');
      execSync('claude --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Maps shorthand model names for the Claude agent SDK.
   *
   * The agent SDK uses simple names: 'haiku', 'sonnet', 'opus'
   *
   * @param model - Shorthand model name or undefined
   * @returns Model name for agent SDK
   */
  private mapModel(model?: string): string {
    switch (model) {
      case 'haiku':
        return 'haiku';
      case 'sonnet':
        return 'sonnet';
      case 'opus':
        return 'opus';
      default:
        return 'haiku';
    }
  }

  /**
   * Disposes of the client resources.
   *
   * No cleanup needed as each request is independent.
   */
  dispose(): void {
    // No cleanup needed
  }
}
