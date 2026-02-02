/**
 * @fileoverview Type definitions for mind map visualization.
 *
 * This module defines types for the D3.js force-directed graph visualization
 * of Claude Code session activity, showing files, tools, TODOs, and subagents.
 *
 * @module types/mindMap
 */

/**
 * Node types for visual differentiation.
 *
 * Each type has distinct styling in the visualization:
 * - file: Files touched by Read/Write/Edit tools
 * - tool: Claude Code tools (Bash, Read, Write, etc.)
 * - todo: TODOs extracted from timeline descriptions
 * - subagent: Subagent/sidechain events
 * - session: Central session node (hub)
 * - url: URLs accessed by WebFetch or search queries from WebSearch
 * - directory: Directories searched by Grep/Glob tools
 * - command: Command types executed by Bash (git, npm, etc.)
 */
export type NodeType = 'file' | 'tool' | 'todo' | 'subagent' | 'session' | 'url' | 'directory' | 'command';

/**
 * Graph node for D3.js force simulation.
 *
 * Extends d3.SimulationNodeDatum pattern with optional x, y, fx, fy, vx, vy, index
 * properties that D3 adds during simulation.
 */
export interface GraphNode {
  /** Unique identifier (e.g., "file-/path/to/file.ts", "tool-Read") */
  id: string;

  /** Display label (short name for rendering) */
  label: string;

  /** Full path or description for tooltip display */
  fullPath?: string;

  /** Node type for styling */
  type: NodeType;

  /** Call count for tools, touch count for files */
  count?: number;

  /** Number of lines added (for file nodes) */
  additions?: number;

  /** Number of lines deleted (for file nodes) */
  deletions?: number;

  // D3 simulation properties (added during simulation)
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
  index?: number;
}

/**
 * Graph link for D3.js force simulation.
 *
 * Connects nodes in the graph. Source and target are node IDs.
 */
export interface GraphLink {
  /** Source node ID */
  source: string;

  /** Target node ID */
  target: string;

  /** Link strength (optional, affects force simulation) */
  strength?: number;

  /** Marks most recent file/URL operation */
  isLatest?: boolean;
}

/**
 * Complete graph data structure.
 *
 * Contains all nodes and links for D3.js visualization.
 */
export interface GraphData {
  /** All nodes in the graph */
  nodes: GraphNode[];

  /** All links connecting nodes */
  links: GraphLink[];
}

/**
 * Mind map state sent to webview.
 *
 * Contains the graph data and session metadata.
 */
export interface MindMapState {
  /** Graph data for rendering */
  graph: GraphData;

  /** Whether session is active */
  sessionActive: boolean;

  /** Last update timestamp (ISO 8601) */
  lastUpdated: string;
}

/**
 * Messages from extension to webview.
 *
 * These messages update the mind map visualization.
 */
export type MindMapMessage =
  | { type: 'updateGraph'; state: MindMapState }
  | { type: 'sessionStart'; sessionPath: string }
  | { type: 'sessionEnd' };

/**
 * Messages from webview to extension.
 *
 * These messages are sent by the webview to request data or signal interaction.
 */
export type WebviewMindMapMessage =
  | { type: 'webviewReady' }
  | { type: 'requestGraph' }
  | { type: 'nodeClicked'; nodeId: string };
