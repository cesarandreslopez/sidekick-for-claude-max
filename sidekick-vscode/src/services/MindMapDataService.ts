/**
 * @fileoverview Service for transforming session data into mind map graph structure.
 *
 * This module provides a static service that transforms Claude Code session statistics
 * into a graph structure suitable for D3.js force-directed visualization.
 *
 * @module services/MindMapDataService
 */

import { SessionStats, ToolCall, TimelineEvent } from '../types/claudeSession';
import { GraphNode, GraphLink, GraphData } from '../types/mindMap';

/**
 * Transforms Claude Code session data into graph structure for D3.js visualization.
 *
 * Static class (no instantiation needed) following ModelPricingService pattern.
 * Creates a hub-and-spoke graph with the session as the central node and
 * files, tools, TODOs, and subagents as peripheral nodes.
 */
export class MindMapDataService {
  /** TODO extraction pattern for timeline descriptions */
  private static readonly TODO_PATTERN = /TODO:?\s*(.+?)(?:\n|$)/gi;

  /** File path tools that operate on files */
  private static readonly FILE_TOOLS = ['Read', 'Write', 'Edit', 'MultiEdit'];

  /** URL-based tools */
  private static readonly URL_TOOLS = ['WebFetch', 'WebSearch'];

  /**
   * Builds complete graph from session statistics.
   *
   * Creates a hierarchical structure:
   * - Central "session-root" node
   * - Tool nodes connected to session
   * - File nodes connected to tools (not directly to session)
   * - TODO nodes connected to session
   * - Subagent nodes connected to session
   *
   * @param stats - Session statistics from SessionMonitor
   * @returns Graph data with nodes and links
   */
  static buildGraph(stats: SessionStats): GraphData {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const nodeIds = new Set<string>();

    // Add session center node
    const sessionNode: GraphNode = {
      id: 'session-root',
      label: 'Session',
      type: 'session',
      count: stats.messageCount,
    };
    nodes.push(sessionNode);
    nodeIds.add(sessionNode.id);

    // Add file nodes (linked to tools, not directly to session)
    const files = this.extractFiles(stats.toolCalls);
    files.forEach((count, filePath) => {
      const id = `file-${filePath}`;
      if (!nodeIds.has(id)) {
        nodes.push({
          id,
          label: this.getFileName(filePath),
          fullPath: filePath,
          type: 'file',
          count,
        });
        nodeIds.add(id);
        // Note: files are linked to tools via addFileToolLinks, not to session directly
      }
    });

    // Add URL nodes (linked to WebFetch/WebSearch tools)
    const urls = this.extractUrls(stats.toolCalls);
    urls.forEach((count, url) => {
      const id = `url-${url}`;
      if (!nodeIds.has(id)) {
        nodes.push({
          id,
          label: this.getUrlLabel(url),
          fullPath: url,
          type: 'url',
          count,
        });
        nodeIds.add(id);
      }
    });

    // Add tool nodes with call counts
    stats.toolAnalytics.forEach((analytics, toolName) => {
      const id = `tool-${toolName}`;
      if (!nodeIds.has(id)) {
        nodes.push({
          id,
          label: toolName,
          type: 'tool',
          count: analytics.completedCount,
        });
        nodeIds.add(id);
        links.push({ source: 'session-root', target: id });
      }
    });

    // Add TODO nodes
    const todos = this.extractTODOs(stats.timeline);
    todos.forEach((todo, index) => {
      const id = `todo-${index}`;
      nodes.push({
        id,
        label: this.truncateLabel(todo, 30),
        fullPath: todo,
        type: 'todo',
      });
      nodeIds.add(id);
      links.push({ source: 'session-root', target: id });
    });

    // Add subagent nodes (from isSidechain events)
    const subagents = this.extractSubagents(stats.timeline);
    subagents.forEach((count, agentId) => {
      const id = `subagent-${agentId}`;
      if (!nodeIds.has(id)) {
        nodes.push({
          id,
          label: `Subagent ${agentId}`,
          type: 'subagent',
          count,
        });
        nodeIds.add(id);
        links.push({ source: 'session-root', target: id });
      }
    });

    // Create file-to-tool links
    this.addFileToolLinks(stats.toolCalls, nodeIds, links);

    // Create URL-to-tool links
    this.addUrlToolLinks(stats.toolCalls, nodeIds, links);

    return { nodes, links };
  }

  /**
   * Extracts files from tool calls with touch counts.
   *
   * @param toolCalls - Array of tool calls from session
   * @returns Map of file paths to touch counts
   */
  private static extractFiles(toolCalls: ToolCall[]): Map<string, number> {
    const files = new Map<string, number>();

    for (const call of toolCalls) {
      if (this.FILE_TOOLS.includes(call.name)) {
        const filePath = call.input.file_path as string;
        if (filePath && typeof filePath === 'string') {
          const count = files.get(filePath) || 0;
          files.set(filePath, count + 1);
        }
      }
    }

    return files;
  }

  /**
   * Extracts URLs from WebFetch/WebSearch tool calls with access counts.
   *
   * @param toolCalls - Array of tool calls from session
   * @returns Map of URLs to access counts
   */
  private static extractUrls(toolCalls: ToolCall[]): Map<string, number> {
    const urls = new Map<string, number>();

    for (const call of toolCalls) {
      if (this.URL_TOOLS.includes(call.name)) {
        // WebFetch uses 'url', WebSearch uses 'query'
        const url = (call.input.url as string) || (call.input.query as string);
        if (url && typeof url === 'string') {
          const count = urls.get(url) || 0;
          urls.set(url, count + 1);
        }
      }
    }

    return urls;
  }

  /**
   * Extracts TODOs from timeline event descriptions.
   *
   * @param timeline - Array of timeline events
   * @returns Array of unique TODO strings
   */
  private static extractTODOs(timeline: TimelineEvent[]): string[] {
    const todos: string[] = [];
    const seen = new Set<string>();

    for (const event of timeline) {
      const matches = event.description.matchAll(this.TODO_PATTERN);
      for (const match of matches) {
        const todo = match[1].trim();
        if (todo && !seen.has(todo.toLowerCase())) {
          todos.push(todo);
          seen.add(todo.toLowerCase());
        }
      }
    }

    return todos;
  }

  /**
   * Extracts subagent identifiers from timeline.
   *
   * Looks for events with 'subagent', 'sidechain', or 'spawned' in description.
   *
   * @param timeline - Array of timeline events
   * @returns Map of agent identifiers to event counts
   */
  private static extractSubagents(timeline: TimelineEvent[]): Map<string, number> {
    const subagents = new Map<string, number>();

    for (const event of timeline) {
      const desc = event.description.toLowerCase();
      if (desc.includes('subagent') || desc.includes('sidechain') || desc.includes('spawned')) {
        // Extract agent identifier if present, otherwise use generic
        const agentMatch = event.description.match(/(?:subagent|agent)\s*[-:]?\s*(\w+)/i);
        const agentId = agentMatch ? agentMatch[1] : 'worker';
        const count = subagents.get(agentId) || 0;
        subagents.set(agentId, count + 1);
      }
    }

    return subagents;
  }

  /**
   * Creates links between files and the tools that touched them.
   *
   * @param toolCalls - Array of tool calls from session
   * @param existingNodeIds - Set of existing node IDs
   * @param links - Links array to add to
   */
  private static addFileToolLinks(
    toolCalls: ToolCall[],
    existingNodeIds: Set<string>,
    links: GraphLink[]
  ): void {
    const addedLinks = new Set<string>();

    for (const call of toolCalls) {
      if (this.FILE_TOOLS.includes(call.name)) {
        const filePath = call.input.file_path as string;
        if (filePath && typeof filePath === 'string') {
          const fileId = `file-${filePath}`;
          const toolId = `tool-${call.name}`;

          if (existingNodeIds.has(fileId) && existingNodeIds.has(toolId)) {
            // Only add unique links (tool → file direction)
            const linkKey = `${toolId}-${fileId}`;
            if (!addedLinks.has(linkKey)) {
              links.push({ source: toolId, target: fileId });
              addedLinks.add(linkKey);
            }
          }
        }
      }
    }
  }

  /**
   * Creates links between URLs/queries and the tools that accessed them.
   *
   * @param toolCalls - Array of tool calls from session
   * @param existingNodeIds - Set of existing node IDs
   * @param links - Links array to add to
   */
  private static addUrlToolLinks(
    toolCalls: ToolCall[],
    existingNodeIds: Set<string>,
    links: GraphLink[]
  ): void {
    const addedLinks = new Set<string>();

    for (const call of toolCalls) {
      if (this.URL_TOOLS.includes(call.name)) {
        const url = (call.input.url as string) || (call.input.query as string);
        if (url && typeof url === 'string') {
          const urlId = `url-${url}`;
          const toolId = `tool-${call.name}`;

          if (existingNodeIds.has(urlId) && existingNodeIds.has(toolId)) {
            const linkKey = `${toolId}-${urlId}`;
            if (!addedLinks.has(linkKey)) {
              links.push({ source: toolId, target: urlId });
              addedLinks.add(linkKey);
            }
          }
        }
      }
    }
  }

  /**
   * Extracts filename from full path.
   *
   * @param filePath - Full file path
   * @returns Just the filename
   */
  private static getFileName(filePath: string): string {
    const parts = filePath.split('/');
    return parts[parts.length - 1] || filePath;
  }

  /**
   * Extracts display label from URL or search query.
   *
   * For URLs, extracts the hostname. For search queries, truncates if needed.
   *
   * @param urlOrQuery - URL or search query string
   * @returns Shortened label for display
   */
  private static getUrlLabel(urlOrQuery: string): string {
    try {
      const url = new URL(urlOrQuery);
      return url.hostname;
    } catch {
      // Not a valid URL (probably a search query), truncate it
      return this.truncateLabel(urlOrQuery, 25);
    }
  }

  /**
   * Truncates label with ellipsis if too long.
   *
   * @param text - Text to truncate
   * @param maxLength - Maximum length before truncation
   * @returns Truncated text with ellipsis if needed
   */
  private static truncateLabel(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}
