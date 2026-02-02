/**
 * @fileoverview Service for transforming session data into mind map graph structure.
 *
 * This module provides a static service that transforms Claude Code session statistics
 * into a graph structure suitable for D3.js force-directed visualization.
 *
 * @module services/MindMapDataService
 */

import { SessionStats, ToolCall, TimelineEvent, SubagentStats } from '../types/claudeSession';
import { GraphNode, GraphLink, GraphData } from '../types/mindMap';
import { calculateLineChanges } from '../utils/lineChangeCalculator';
import { log } from './Logger';

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
   *   - Subagent tool nodes connected to subagent
   *   - Subagent file nodes connected to subagent tools
   *
   * @param stats - Session statistics from SessionMonitor
   * @param subagents - Optional subagent statistics for expanded visualization
   * @returns Graph data with nodes and links
   */
  static buildGraph(stats: SessionStats, subagents?: SubagentStats[]): GraphData {
    // Debug logging for subagent data
    if (subagents && subagents.length > 0) {
      log(`[MindMap] Building graph with ${subagents.length} subagents:`);
      for (const agent of subagents) {
        log(`  - Agent ${agent.agentId}: type=${agent.agentType}, toolCalls=${agent.toolCalls.length}`);
        if (agent.toolCalls.length > 0) {
          const toolNames = [...new Set(agent.toolCalls.map(c => c.name))];
          log(`    Tools: ${toolNames.join(', ')}`);
        }
      }
    } else {
      log('[MindMap] Building graph with NO subagents');
    }
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
    files.forEach((stats, filePath) => {
      const id = `file-${filePath}`;
      if (!nodeIds.has(id)) {
        nodes.push({
          id,
          label: this.getFileName(filePath),
          fullPath: filePath,
          type: 'file',
          count: stats.touchCount,
          additions: stats.additions,
          deletions: stats.deletions,
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

    // Add subagent nodes with hierarchical structure
    if (subagents && subagents.length > 0) {
      const nodesBefore = nodes.length;
      const linksBefore = links.length;
      this.addSubagentNodes(subagents, nodes, links, nodeIds);
      log(`[MindMap] addSubagentNodes added ${nodes.length - nodesBefore} nodes and ${links.length - linksBefore} links`);
    } else {
      // Fallback: extract subagents from timeline (legacy behavior)
      const legacySubagents = this.extractSubagents(stats.timeline);
      legacySubagents.forEach((count, agentId) => {
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
    }

    // Create file-to-tool links
    this.addFileToolLinks(stats.toolCalls, nodeIds, links);

    // Create URL-to-tool links
    this.addUrlToolLinks(stats.toolCalls, nodeIds, links);

    // Mark the latest file/URL link based on last tool call
    const lastFileUrlCall = [...stats.toolCalls]
      .reverse()
      .find(c => this.FILE_TOOLS.includes(c.name) || this.URL_TOOLS.includes(c.name));

    if (lastFileUrlCall) {
      const toolId = `tool-${lastFileUrlCall.name}`;
      let targetId: string | undefined;

      if (this.FILE_TOOLS.includes(lastFileUrlCall.name)) {
        const path = lastFileUrlCall.input.file_path as string;
        if (path) targetId = `file-${path}`;
      } else {
        const url = (lastFileUrlCall.input.url || lastFileUrlCall.input.query) as string;
        if (url) targetId = `url-${url}`;
      }

      if (targetId) {
        const latestLink = links.find(l => l.source === toolId && l.target === targetId);
        if (latestLink) latestLink.isLatest = true;
      }
    }

    return { nodes, links };
  }

  /**
   * File statistics including touch count and line changes.
   */
  private static extractFiles(toolCalls: ToolCall[]): Map<string, { touchCount: number; additions: number; deletions: number }> {
    const files = new Map<string, { touchCount: number; additions: number; deletions: number }>();

    for (const call of toolCalls) {
      if (this.FILE_TOOLS.includes(call.name)) {
        const filePath = call.input.file_path as string;
        if (filePath && typeof filePath === 'string') {
          const existing = files.get(filePath) || { touchCount: 0, additions: 0, deletions: 0 };
          existing.touchCount += 1;

          // Calculate line changes for modifying tools (Write, Edit, MultiEdit)
          const changes = calculateLineChanges(call.name, call.input);
          existing.additions += changes.additions;
          existing.deletions += changes.deletions;

          files.set(filePath, existing);
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
   * Adds subagent nodes with hierarchical tool and file structure.
   *
   * Creates a tree structure for each subagent:
   * - Subagent node (connected to session-root)
   * - Tool nodes for each unique tool used by the subagent
   * - File/URL nodes connected to the subagent's tool nodes
   *
   * @param subagents - Array of subagent statistics
   * @param nodes - Nodes array to add to
   * @param links - Links array to add to
   * @param nodeIds - Set of existing node IDs
   */
  private static addSubagentNodes(
    subagents: SubagentStats[],
    nodes: GraphNode[],
    links: GraphLink[],
    nodeIds: Set<string>
  ): void {
    for (const agent of subagents) {
      // Create subagent node
      const agentNodeId = `subagent-${agent.agentId}`;

      // Build label from agent type and/or description
      let label = agent.agentType || 'Subagent';
      if (agent.description) {
        label = `${label}: ${this.truncateLabel(agent.description, 20)}`;
      }

      if (!nodeIds.has(agentNodeId)) {
        nodes.push({
          id: agentNodeId,
          label: this.truncateLabel(label, 30),
          fullPath: agent.description || `Agent ${agent.agentId}`,
          type: 'subagent',
          count: agent.toolCalls.length,
        });
        nodeIds.add(agentNodeId);
        links.push({ source: 'session-root', target: agentNodeId });
      }

      // Skip if no tool calls
      if (agent.toolCalls.length === 0) {
        continue;
      }

      // Aggregate tool calls by tool name
      const toolCounts = new Map<string, number>();
      for (const call of agent.toolCalls) {
        const count = toolCounts.get(call.name) || 0;
        toolCounts.set(call.name, count + 1);
      }

      // Create tool nodes for this subagent
      for (const [toolName, count] of toolCounts) {
        const toolNodeId = `subagent-${agent.agentId}-tool-${toolName}`;

        if (!nodeIds.has(toolNodeId)) {
          nodes.push({
            id: toolNodeId,
            label: toolName,
            type: 'tool',
            count,
          });
          nodeIds.add(toolNodeId);
          links.push({ source: agentNodeId, target: toolNodeId });
        }
      }

      // Extract files touched by this subagent and create nodes
      const subagentFiles = this.extractFiles(agent.toolCalls);
      for (const [filePath, fileStats] of subagentFiles) {
        const fileNodeId = `subagent-${agent.agentId}-file-${filePath}`;

        if (!nodeIds.has(fileNodeId)) {
          nodes.push({
            id: fileNodeId,
            label: this.getFileName(filePath),
            fullPath: filePath,
            type: 'file',
            count: fileStats.touchCount,
            additions: fileStats.additions,
            deletions: fileStats.deletions,
          });
          nodeIds.add(fileNodeId);
        }

        // Link file to the tools that touched it
        for (const call of agent.toolCalls) {
          if (this.FILE_TOOLS.includes(call.name)) {
            const callFilePath = call.input.file_path as string;
            if (callFilePath === filePath) {
              const toolNodeId = `subagent-${agent.agentId}-tool-${call.name}`;
              // Check if link already exists
              const linkExists = links.some(l => l.source === toolNodeId && l.target === fileNodeId);
              if (!linkExists && nodeIds.has(toolNodeId)) {
                links.push({ source: toolNodeId, target: fileNodeId });
              }
            }
          }
        }
      }

      // Extract URLs touched by this subagent
      const subagentUrls = this.extractUrls(agent.toolCalls);
      for (const [url, count] of subagentUrls) {
        const urlNodeId = `subagent-${agent.agentId}-url-${url}`;

        if (!nodeIds.has(urlNodeId)) {
          nodes.push({
            id: urlNodeId,
            label: this.getUrlLabel(url),
            fullPath: url,
            type: 'url',
            count,
          });
          nodeIds.add(urlNodeId);
        }

        // Link URL to the tools that accessed it
        for (const call of agent.toolCalls) {
          if (this.URL_TOOLS.includes(call.name)) {
            const callUrl = (call.input.url as string) || (call.input.query as string);
            if (callUrl === url) {
              const toolNodeId = `subagent-${agent.agentId}-tool-${call.name}`;
              // Check if link already exists
              const linkExists = links.some(l => l.source === toolNodeId && l.target === urlNodeId);
              if (!linkExists && nodeIds.has(toolNodeId)) {
                links.push({ source: toolNodeId, target: urlNodeId });
              }
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
