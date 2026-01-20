/**
 * @fileoverview Inline completion provider for VS Code.
 *
 * This provider implements VS Code's InlineCompletionItemProvider interface
 * to show AI-generated code suggestions as ghost text in the editor.
 * It delegates to CompletionService for caching, debouncing, and API calls.
 *
 * @module InlineCompletionProvider
 */

import * as vscode from 'vscode';
import { CompletionService } from '../services/CompletionService';

/**
 * Inline completion provider that delegates to CompletionService.
 *
 * This is a thin wrapper that:
 * - Checks if completions are enabled
 * - Calls CompletionService.getCompletion()
 * - Wraps results in InlineCompletionItem
 *
 * Tab acceptance and Ctrl+Right partial accept are handled
 * automatically by VS Code - no extension code needed.
 *
 * @example
 * ```typescript
 * const provider = new InlineCompletionProvider(completionService);
 * vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, provider);
 * ```
 */
export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  /**
   * Creates a new InlineCompletionProvider.
   *
   * @param completionService - The CompletionService for handling completion requests
   */
  constructor(private completionService: CompletionService) {}

  /**
   * Provides inline completion items for the current cursor position.
   *
   * @param document - The text document being edited
   * @param position - The cursor position
   * @param context - The inline completion context
   * @param token - Cancellation token for aborting the request
   * @returns Array of inline completion items or undefined
   */
  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    // Check if completions are enabled in config
    const config = vscode.workspace.getConfiguration('sidekick');
    if (!config.get('enabled')) {
      return undefined;
    }

    // Check if already cancelled
    if (token.isCancellationRequested) {
      return undefined;
    }

    try {
      // Delegate to CompletionService
      const completion = await this.completionService.getCompletion(
        document,
        position,
        token
      );

      // Check cancellation after async operation
      if (!completion || token.isCancellationRequested) {
        return undefined;
      }

      // Return completion as InlineCompletionItem
      return [
        new vscode.InlineCompletionItem(
          completion,
          new vscode.Range(position, position)
        ),
      ];
    } catch (error) {
      console.error('Completion error:', error);
      return undefined;
    }
  }
}
