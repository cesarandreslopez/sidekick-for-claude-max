/**
 * @fileoverview Type definitions for Claude Code session events.
 *
 * This module defines types for parsing and working with Claude Code session
 * JSONL files located in ~/.claude/projects/. These types enable monitoring
 * token usage, tool calls, and session statistics from active Claude Code sessions.
 *
 * @module types/claudeSession
 */

/**
 * Token usage data from Claude API messages.
 *
 * Represents the usage field in assistant message events,
 * tracking input/output tokens and prompt caching metrics.
 */
export interface MessageUsage {
  /** Number of input tokens consumed */
  input_tokens: number;

  /** Number of output tokens generated */
  output_tokens: number;

  /** Number of tokens written to cache (1.25x input cost) */
  cache_creation_input_tokens?: number;

  /** Number of tokens read from cache (0.1x input cost) */
  cache_read_input_tokens?: number;
}

/**
 * Message object within session events.
 *
 * Contains role, model, and usage information for user/assistant messages.
 */
export interface SessionMessage {
  /** Message role (user, assistant, etc.) */
  role: string;

  /** Model identifier (e.g., "claude-opus-4-20250514") */
  model?: string;

  /** Token usage statistics (only present in assistant messages) */
  usage?: MessageUsage;

  /** Message content (may be string or structured content) */
  content?: unknown;
}

/**
 * Claude Code session event from JSONL log files.
 *
 * Events are logged as newline-delimited JSON in session files.
 * Each event represents a single interaction in the Claude Code session.
 */
export interface ClaudeSessionEvent {
  /** Event type discriminator */
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'summary';

  /** Message data containing role, model, usage */
  message: SessionMessage;

  /** ISO 8601 timestamp of event */
  timestamp: string;

  /** Whether this is a subagent/sidechain event */
  isSidechain?: boolean;

  /** Tool use details (when type is 'tool_use') */
  tool?: {
    name: string;
    input: Record<string, unknown>;
  };

  /** Tool result details (when type is 'tool_result') */
  result?: {
    tool_use_id: string;
    output?: unknown;
    is_error?: boolean;
  };
}

/**
 * Normalized token usage with model information.
 *
 * Provides a standardized view of token consumption with camelCase
 * naming and explicit model tracking for cost calculation.
 */
export interface TokenUsage {
  /** Number of input tokens consumed */
  inputTokens: number;

  /** Number of output tokens generated */
  outputTokens: number;

  /** Number of tokens written to cache */
  cacheWriteTokens: number;

  /** Number of tokens read from cache */
  cacheReadTokens: number;

  /** Model identifier used for this operation */
  model: string;

  /** When this usage occurred */
  timestamp: Date;
}

/**
 * Tool invocation record.
 *
 * Tracks tool calls made during the session for analysis
 * of extension behavior and usage patterns.
 */
export interface ToolCall {
  /** Tool name (e.g., "Read", "Write", "Bash") */
  name: string;

  /** Tool input parameters */
  input: Record<string, unknown>;

  /** When the tool was called */
  timestamp: Date;

  /** How long the tool took to execute (milliseconds) */
  duration?: number;
}

/**
 * Analytics for a specific tool type.
 *
 * Tracks success/failure rates and timing across all calls
 * to a particular tool (e.g., Read, Write, Bash).
 */
export interface ToolAnalytics {
  /** Tool name (e.g., "Read", "Write", "Bash") */
  name: string;

  /** Number of successful completions */
  successCount: number;

  /** Number of failed completions (is_error: true) */
  failureCount: number;

  /** Total duration across all calls (milliseconds) */
  totalDuration: number;

  /** Number of completed calls (has result) */
  completedCount: number;

  /** Number of pending calls (no result yet) */
  pendingCount: number;
}

/**
 * Entry for session activity timeline.
 *
 * Represents a single event in the chronological session history.
 */
export interface TimelineEvent {
  /** Event type for display categorization */
  type: 'user_prompt' | 'tool_call' | 'tool_result' | 'error' | 'session_start' | 'session_end' | 'assistant_response';

  /** ISO 8601 timestamp */
  timestamp: string;

  /** Human-readable description */
  description: string;

  /** Optional metadata for filtering/display */
  metadata?: {
    model?: string;
    toolName?: string;
    isError?: boolean;
    tokenCount?: number;
    fullText?: string;
  };
}

/**
 * Pending tool call awaiting result.
 *
 * Used internally to correlate tool_use with tool_result.
 */
export interface PendingToolCall {
  /** Tool use ID for correlation */
  toolUseId: string;

  /** Tool name */
  name: string;

  /** When the tool was called */
  startTime: Date;
}

/**
 * Statistics for a subagent spawned via the Task tool.
 *
 * Tracks subagent identity and its tool calls for mind map visualization.
 */
export interface SubagentStats {
  /** Unique agent identifier (from filename, e.g., "a55af98") */
  agentId: string;

  /** Agent type (e.g., "Explore", "Plan", "Bash") */
  agentType?: string;

  /** Short description from Task tool input */
  description?: string;

  /** All tool calls made by this subagent */
  toolCalls: ToolCall[];
}

/**
 * Aggregated statistics for a Claude Code session.
 *
 * Provides rollup metrics for token consumption, model usage,
 * and tool activity across an entire session.
 */
export interface SessionStats {
  /** Total input tokens across all messages */
  totalInputTokens: number;

  /** Total output tokens across all messages */
  totalOutputTokens: number;

  /** Total cache write tokens across all messages */
  totalCacheWriteTokens: number;

  /** Total cache read tokens across all messages */
  totalCacheReadTokens: number;

  /** Number of messages processed */
  messageCount: number;

  /** All tool calls made during session */
  toolCalls: ToolCall[];

  /** Per-model usage breakdown */
  modelUsage: Map<string, { calls: number; tokens: number }>;

  /** When the session was last updated */
  lastUpdated: Date;

  /** Per-tool analytics */
  toolAnalytics: Map<string, ToolAnalytics>;

  /** Session timeline (most recent first, capped at 100) */
  timeline: TimelineEvent[];

  /** Error count by type */
  errorDetails: Map<string, string[]>;

  /** Current context window size (from most recent assistant message) */
  currentContextSize: number;

  /** Recent token usage events for burn rate calculation (timestamp, tokens) */
  recentUsageEvents: Array<{ timestamp: Date; tokens: number }>;

  /** When the session started (first event timestamp) */
  sessionStartTime: Date | null;
}
