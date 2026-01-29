/**
 * @fileoverview Tree data provider for displaying subagent activity.
 *
 * This module provides a TreeDataProvider implementation that shows
 * running and completed subagents spawned during Claude Code sessions.
 * It integrates with SessionMonitor to detect subagent activity from
 * timeline events and displays them in the Session Monitor activity bar.
 *
 * Key features:
 * - Detects subagents from timeline event descriptions
 * - Shows running (spinner) vs completed (check) status
 * - Displays agent type (Explore, Plan, Task, Unknown)
 * - Click-to-open transcript files when available
 * - Scans session directory for existing agent files
 *
 * @module providers/SubagentTreeProvider
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SessionMonitor } from '../services/SessionMonitor';
import { TimelineEvent } from '../types/claudeSession';

/**
 * Type for subagent classification based on description keywords.
 */
type AgentType = 'Explore' | 'Plan' | 'Task' | 'Unknown';

/**
 * Represents a subagent item in the tree view.
 */
interface SubagentItem {
  /** Unique agent identifier extracted from description */
  id: string;

  /** Display name (e.g., "worker-1 (Explore)") */
  label: string;

  /** Running or completed status */
  type: 'running' | 'completed';

  /** Agent type based on description keywords */
  agentType: AgentType;

  /** Path to agent transcript file if available */
  transcriptPath: string | undefined;

  /** When the agent was first detected */
  timestamp: Date;
}

/**
 * Tree data provider for subagent activity during Claude Code sessions.
 *
 * Monitors timeline events for subagent spawning indicators and tracks
 * their lifecycle. Provides click-to-open functionality for transcript files.
 *
 * @example
 * ```typescript
 * const sessionMonitor = new SessionMonitor();
 * const subagentProvider = new SubagentTreeProvider(sessionMonitor);
 *
 * // Register as tree data provider
 * vscode.window.registerTreeDataProvider('sidekick.subagents', subagentProvider);
 *
 * // Provider automatically updates when timeline events fire
 * ```
 */
export class SubagentTreeProvider implements vscode.TreeDataProvider<SubagentItem>, vscode.Disposable {
  /** View type identifier for registration */
  static readonly viewType = 'sidekick.subagents';

  /** Event emitter for tree data changes */
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<SubagentItem | undefined>();

  /** Event fired when tree data changes */
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Map of agent ID to SubagentItem */
  private subagents: Map<string, SubagentItem> = new Map();

  /** Directory containing session/agent files */
  private sessionDir: string | null = null;

  /** Subscriptions to dispose */
  private disposables: vscode.Disposable[] = [];

  /**
   * Creates a new SubagentTreeProvider.
   *
   * Subscribes to SessionMonitor events to detect session starts
   * and timeline events indicating subagent activity.
   *
   * @param sessionMonitor - The session monitor to subscribe to
   */
  constructor(private readonly sessionMonitor: SessionMonitor) {
    // Subscribe to session start to initialize session directory
    this.disposables.push(
      sessionMonitor.onSessionStart((sessionPath: string) => {
        this.sessionDir = path.dirname(sessionPath);
        this.subagents.clear();
        this.scanForAgentFiles();
        this.refresh();
      })
    );

    // Subscribe to timeline events for subagent detection
    this.disposables.push(
      sessionMonitor.onTimelineEvent((event: TimelineEvent) => {
        this.handleTimelineEvent(event);
      })
    );

    // Initialize from current session if available
    const currentSessionPath = sessionMonitor.getSessionPath();
    if (currentSessionPath) {
      this.sessionDir = path.dirname(currentSessionPath);
      this.scanForAgentFiles();
    }
  }

  /**
   * Handles a timeline event to detect subagent activity.
   *
   * Checks event descriptions for subagent-related keywords and
   * extracts agent information when found.
   *
   * @param event - Timeline event from SessionMonitor
   */
  private handleTimelineEvent(event: TimelineEvent): void {
    // Handle Task tool_result events to mark subagents as completed
    if (event.type === 'tool_result' && event.metadata?.toolName === 'Task') {
      this.markOldestRunningAsCompleted();
      return;
    }

    const description = event.description.toLowerCase();

    // Check for subagent-related keywords (only for tool_call events)
    if (event.type !== 'tool_call') {
      return;
    }

    if (!description.includes('subagent') &&
        !description.includes('sidechain') &&
        !description.includes('spawned')) {
      return;
    }

    // Generate sequential worker ID (don't try to extract from description)
    const agentId = `worker-${this.subagents.size + 1}`;

    // Detect agent type from description
    const agentType = this.detectAgentType(event.description);

    // Create subagent item (always starts as running)
    const item: SubagentItem = {
      id: agentId,
      label: `${agentId} (${agentType})`,
      type: 'running',
      agentType,
      transcriptPath: undefined,
      timestamp: new Date(event.timestamp)
    };

    this.subagents.set(agentId, item);
    this.refresh();
  }

  /**
   * Marks the oldest running subagent as completed.
   * Called when a Task tool_result event is received.
   */
  private markOldestRunningAsCompleted(): void {
    // Find oldest running subagent (by timestamp)
    let oldestRunning: SubagentItem | undefined;
    for (const item of this.subagents.values()) {
      if (item.type === 'running') {
        if (!oldestRunning || item.timestamp < oldestRunning.timestamp) {
          oldestRunning = item;
        }
      }
    }

    if (oldestRunning) {
      oldestRunning.type = 'completed';
      // Try to find transcript now that it's completed
      oldestRunning.transcriptPath = this.findTranscriptPath(oldestRunning.id);
      this.refresh();
    }
  }

  /**
   * Detects agent type from description keywords.
   *
   * @param description - Event description to analyze
   * @returns Agent type classification
   */
  private detectAgentType(description: string): AgentType {
    const lower = description.toLowerCase();

    if (lower.includes('explore') || lower.includes('research') || lower.includes('investigate')) {
      return 'Explore';
    }

    if (lower.includes('plan') || lower.includes('architect') || lower.includes('design')) {
      return 'Plan';
    }

    if (lower.includes('task') || lower.includes('execute') || lower.includes('implement') || lower.includes('build')) {
      return 'Task';
    }

    return 'Unknown';
  }

  /**
   * Finds the transcript file path for an agent.
   *
   * @param agentId - Agent identifier
   * @returns Path to transcript if exists, undefined otherwise
   */
  private findTranscriptPath(agentId: string): string | undefined {
    if (!this.sessionDir) {
      return undefined;
    }

    const transcriptPath = path.join(this.sessionDir, `agent-${agentId}.jsonl`);
    return fs.existsSync(transcriptPath) ? transcriptPath : undefined;
  }

  /**
   * Scans the session directory for existing agent transcript files.
   *
   * Discovers completed agents that may have been created before
   * monitoring started or without detectable timeline events.
   */
  private scanForAgentFiles(): void {
    if (!this.sessionDir) {
      return;
    }

    try {
      const files = fs.readdirSync(this.sessionDir);
      const agentFilePattern = /^agent-(.*)\.jsonl$/;

      for (const file of files) {
        const match = file.match(agentFilePattern);
        if (match) {
          const agentId = match[1];

          // Skip if already tracked
          if (this.subagents.has(agentId)) {
            continue;
          }

          // Add discovered agent
          const transcriptPath = path.join(this.sessionDir, file);
          const item: SubagentItem = {
            id: agentId,
            label: `${agentId} (Unknown)`,
            type: 'completed',
            agentType: 'Unknown',
            transcriptPath,
            timestamp: new Date()
          };

          this.subagents.set(agentId, item);
        }
      }

      this.refresh();
    } catch {
      // Directory read failed - ignore, will update on events
    }
  }

  /**
   * Gets tree item representation for display.
   *
   * @param element - Subagent item to convert
   * @returns VS Code TreeItem for display
   */
  getTreeItem(element: SubagentItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);

    // Set icon based on status
    if (element.type === 'running') {
      treeItem.iconPath = new vscode.ThemeIcon('sync~spin');
    } else {
      treeItem.iconPath = new vscode.ThemeIcon('check');
    }

    // Set click-to-open command if transcript exists
    if (element.transcriptPath && fs.existsSync(element.transcriptPath)) {
      treeItem.command = {
        command: 'vscode.open',
        title: 'Open Transcript',
        arguments: [vscode.Uri.file(element.transcriptPath)]
      };
      treeItem.tooltip = `Click to open transcript\n${element.transcriptPath}`;
    } else {
      treeItem.tooltip = 'Transcript not yet available';
    }

    // Set description and context
    treeItem.description = element.type === 'running' ? 'Running...' : 'Completed';
    treeItem.contextValue = element.type === 'running' ? 'runningSubagent' : 'completedSubagent';

    return treeItem;
  }

  /**
   * Gets children for a tree element.
   *
   * Returns all subagents for root, empty for children (flat structure).
   *
   * @param element - Parent element (undefined for root)
   * @returns Array of child items
   */
  getChildren(element?: SubagentItem): SubagentItem[] {
    // Flat structure - no children for items
    if (element) {
      return [];
    }

    // Return all subagents sorted by timestamp (most recent first)
    return Array.from(this.subagents.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Triggers a refresh of the tree view.
   */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Disposes resources.
   */
  dispose(): void {
    this._onDidChangeTreeData.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
