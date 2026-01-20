/**
 * @fileoverview Centralized status bar state management for Sidekick.
 *
 * StatusBarManager provides a multi-state status bar with proper visual feedback
 * for connected, disconnected, loading, and error states. It replaces the simple
 * toggle pattern with comprehensive connection state tracking.
 *
 * @module StatusBarManager
 */

import * as vscode from 'vscode';

/**
 * Connection state for the Sidekick extension.
 *
 * - 'connected': Extension is enabled and ready
 * - 'disconnected': Extension is disabled
 * - 'loading': API operation in progress
 * - 'error': Last operation failed
 */
export type ConnectionState = 'connected' | 'disconnected' | 'loading' | 'error';

/**
 * Manages the VS Code status bar item with multi-state support.
 *
 * Provides visual feedback for different extension states including
 * connection status, loading indicators, and error states.
 *
 * @example
 * ```typescript
 * const statusBarManager = new StatusBarManager();
 * context.subscriptions.push(statusBarManager);
 *
 * // Toggle states
 * statusBarManager.setConnected();
 * statusBarManager.setDisconnected();
 *
 * // Show loading state during operations
 * statusBarManager.setLoading('Testing connection');
 *
 * // Show error state on failure
 * statusBarManager.setError('API request failed');
 *
 * // Update model display
 * statusBarManager.setModel('sonnet');
 * ```
 */
export class StatusBarManager implements vscode.Disposable {
  /** Current connection state */
  private state: ConnectionState = 'disconnected';

  /** Currently configured model name */
  private currentModel: string = 'haiku';

  /** Error message when in error state */
  private errorMessage: string | undefined;

  /** The VS Code status bar item */
  private statusBarItem: vscode.StatusBarItem;

  /**
   * Creates a new StatusBarManager.
   *
   * Initializes the status bar item with right alignment, priority 100,
   * and the toggle command. Shows the status bar immediately.
   */
  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'sidekick.toggle';
    this.update();
    this.statusBarItem.show();
  }

  /**
   * Sets the status bar to connected state.
   *
   * Shows sparkle icon indicating the extension is active and ready.
   */
  setConnected(): void {
    this.state = 'connected';
    this.errorMessage = undefined;
    this.update();
  }

  /**
   * Sets the status bar to disconnected state.
   *
   * Shows circle-slash icon indicating the extension is disabled.
   */
  setDisconnected(): void {
    this.state = 'disconnected';
    this.errorMessage = undefined;
    this.update();
  }

  /**
   * Sets the status bar to loading state.
   *
   * Shows spinning sync icon during API operations.
   *
   * @param operation - Optional description of the current operation
   */
  setLoading(operation?: string): void {
    this.state = 'loading';
    this.errorMessage = undefined;
    this.update(operation);
  }

  /**
   * Sets the status bar to error state.
   *
   * Shows error icon with red background indicating a failure.
   *
   * @param message - Error message describing what went wrong
   */
  setError(message: string): void {
    this.state = 'error';
    this.errorMessage = message;
    this.update();
  }

  /**
   * Updates the current model name displayed in tooltip.
   *
   * @param model - Model shorthand (haiku, sonnet, opus)
   */
  setModel(model: string): void {
    this.currentModel = model;
    this.update();
  }

  /**
   * Gets the current connection state.
   *
   * @returns The current ConnectionState
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Updates the status bar item appearance based on current state.
   *
   * @param operation - Optional operation name for loading state
   */
  private update(operation?: string): void {
    switch (this.state) {
      case 'connected':
        this.statusBarItem.text = '$(sparkle) Sidekick';
        this.statusBarItem.tooltip = `Sidekick: Connected (${this.currentModel})`;
        this.statusBarItem.backgroundColor = undefined;
        break;

      case 'disconnected':
        this.statusBarItem.text = '$(circle-slash) Sidekick';
        this.statusBarItem.tooltip = 'Sidekick: Disabled (click to enable)';
        this.statusBarItem.backgroundColor = undefined;
        break;

      case 'loading':
        this.statusBarItem.text = '$(sync~spin) Sidekick';
        this.statusBarItem.tooltip = `Sidekick: ${operation || 'Working'}...`;
        this.statusBarItem.backgroundColor = undefined;
        break;

      case 'error':
        this.statusBarItem.text = '$(error) Sidekick';
        this.statusBarItem.tooltip = `Sidekick Error: ${this.errorMessage}`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.errorBackground'
        );
        break;
    }
  }

  /**
   * Disposes of the status bar item.
   *
   * Called automatically when removed from context.subscriptions.
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
