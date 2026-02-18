/**
 * @fileoverview Inference client using OpenAI Codex SDK.
 *
 * Implements ClaudeClient by delegating to the @openai/codex-sdk.
 * Requires an OpenAI API key via OPENAI_API_KEY or CODEX_API_KEY env var,
 * or a credentials file at ~/.codex/.credentials.json.
 *
 * @module services/CodexClient
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClaudeClient, CompletionOptions, TimeoutError } from '../types';
import { log, logError } from './Logger';

// Lazy-loaded SDK reference
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let CodexClass: any = null;

/**
 * Inference client that routes completions through OpenAI Codex CLI.
 *
 * Uses @openai/codex-sdk to create a Codex instance, start a thread
 * in read-only sandbox mode, and extract the final response.
 */
export class CodexClient implements ClaudeClient {
  /**
   * Lazily loads the Codex SDK class.
   */
  private async getCodexClass(): Promise<new (...args: unknown[]) => { startThread(opts: unknown): Promise<unknown> }> {
    if (CodexClass) return CodexClass;

    try {
      const mod = await import('@openai/codex-sdk');
      CodexClass = mod.Codex ?? mod.default;
      if (!CodexClass) throw new Error('Codex class not found in SDK exports');
      log('CodexClient: SDK loaded');
      return CodexClass;
    } catch {
      throw new Error(
        'Codex SDK not installed. Install @openai/codex-sdk or choose a different inference provider.'
      );
    }
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    if (options?.signal?.aborted) {
      const err = new Error('Request was cancelled');
      err.name = 'AbortError';
      throw err;
    }

    const timeoutMs = options?.timeout ?? 30000;
    const Codex = await this.getCodexClass();

    const work = async (): Promise<string> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const codex = new (Codex as any)({
        ...(options?.model ? { model: options.model } : {}),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const thread = await (codex as any).startThread({
        prompt,
        sandboxMode: 'read-only',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const turn = await (thread as any).run(prompt);
      const response = turn?.finalResponse ?? turn?.response ?? '';
      return typeof response === 'string' ? response : JSON.stringify(response);
    };

    const timeout = new Promise<never>((_, reject) => {
      const id = setTimeout(() => {
        reject(new TimeoutError(`Request timed out after ${timeoutMs}ms`, timeoutMs));
      }, timeoutMs);
      options?.signal?.addEventListener('abort', () => {
        clearTimeout(id);
        const err = new Error('Request was cancelled');
        err.name = 'AbortError';
        reject(err);
      });
    });

    return Promise.race([work(), timeout]);
  }

  async isAvailable(): Promise<boolean> {
    // Check for API key availability
    if (process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY) {
      log('CodexClient: API key found in env');
      return true;
    }

    const credPath = path.join(
      process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'),
      '.credentials.json'
    );
    if (fs.existsSync(credPath)) {
      log('CodexClient: credentials file found');
      return true;
    }

    logError('CodexClient: no API key or credentials found');
    return false;
  }

  dispose(): void {
    CodexClass = null;
  }
}
