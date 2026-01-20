/**
 * @fileoverview Claude client using Max subscription via Claude Code CLI.
 *
 * This client uses @anthropic-ai/claude-agent-sdk to make requests
 * through the Claude Code infrastructure, using a user's existing
 * Claude Max subscription instead of API billing.
 *
 * @module MaxSubscriptionClient
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { ClaudeClient, CompletionOptions } from '../types';

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

    try {
      for await (const message of query({
        prompt,
        options: {
          abortController,
          model: this.mapModel(options?.model),
          maxTurns: 1,
          allowedTools: [],
          permissionMode: 'bypassPermissions',
        },
      })) {
        if (message.type === 'result') {
          if (message.subtype === 'success') {
            return message.result;
          }
          throw new Error(message.errors?.join(', ') ?? 'Unknown error');
        }
      }
      throw new Error('No result received');
    } catch (error) {
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
