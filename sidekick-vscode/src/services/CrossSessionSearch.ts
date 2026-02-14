/**
 * @fileoverview Cross-session search service.
 *
 * Provides full-text search across all Claude Code session files in
 * ~/.claude/projects/. Uses VS Code QuickPick for interactive search
 * with context snippets and session navigation.
 *
 * @module services/CrossSessionSearch
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { log } from './Logger';

/** Search result with context */
interface SearchResult {
  /** Session file path */
  sessionPath: string;
  /** Project path (decoded from directory name) */
  projectPath: string;
  /** Matched line content (truncated) */
  snippet: string;
  /** Event type (user, assistant, tool_use, etc.) */
  eventType: string;
  /** Timestamp of the matching event */
  timestamp: string;
}

/**
 * Provides cross-session text search using VS Code QuickPick.
 */
export class CrossSessionSearch implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly _sessionMonitor: { getSessionPath(): string | null }
  ) {}

  /**
   * Opens the cross-session search QuickPick.
   */
  async search(): Promise<void> {
    const quickPick = vscode.window.createQuickPick<SearchResultItem>();
    quickPick.placeholder = 'Search across all Claude Code sessions...';
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;

    let searchTimer: ReturnType<typeof setTimeout> | undefined;

    quickPick.onDidChangeValue(query => {
      if (searchTimer) clearTimeout(searchTimer);
      if (query.length < 3) {
        quickPick.items = [];
        return;
      }
      quickPick.busy = true;
      searchTimer = setTimeout(async () => {
        const results = await this.performSearch(query);
        quickPick.items = results.map(r => new SearchResultItem(r));
        quickPick.busy = false;
      }, 300);
    });

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (selected) {
        // Open the session file at the matching location
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(selected.result.sessionPath));
      }
      quickPick.hide();
    });

    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
  }

  /**
   * Searches across all session files for the given query.
   */
  private async performSearch(query: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    const queryLower = query.toLowerCase();
    const MAX_RESULTS = 50;

    try {
      if (!fs.existsSync(projectsDir)) return results;

      const projectDirs = fs.readdirSync(projectsDir);

      for (const projectDir of projectDirs) {
        if (results.length >= MAX_RESULTS) break;

        const projectPath = path.join(projectsDir, projectDir);
        const stat = fs.statSync(projectPath);
        if (!stat.isDirectory()) continue;

        const decodedProject = this.decodeProjectPath(projectDir);

        // Find .jsonl files in this project directory
        let files: string[];
        try {
          files = fs.readdirSync(projectPath)
            .filter(f => f.endsWith('.jsonl'))
            .slice(0, 20); // Limit per-project files to search
        } catch {
          continue;
        }

        for (const file of files) {
          if (results.length >= MAX_RESULTS) break;

          const filePath = path.join(projectPath, file);
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');

            for (const line of lines) {
              if (results.length >= MAX_RESULTS) break;
              if (!line.trim()) continue;

              // Quick check before JSON parsing
              if (!line.toLowerCase().includes(queryLower)) continue;

              try {
                const event = JSON.parse(line);
                const text = this.extractSearchableText(event);
                if (!text) continue;

                const textLower = text.toLowerCase();
                const matchIdx = textLower.indexOf(queryLower);
                if (matchIdx < 0) continue;

                // Extract context snippet around match
                const start = Math.max(0, matchIdx - 40);
                const end = Math.min(text.length, matchIdx + query.length + 40);
                const snippet = (start > 0 ? '...' : '') +
                  text.substring(start, end) +
                  (end < text.length ? '...' : '');

                results.push({
                  sessionPath: filePath,
                  projectPath: decodedProject,
                  snippet: snippet.replace(/\n/g, ' '),
                  eventType: event.type || 'unknown',
                  timestamp: event.timestamp || ''
                });
              } catch {
                // Skip malformed JSON
              }
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch (err) {
      log(`CrossSessionSearch error: ${err}`);
    }

    return results;
  }

  /**
   * Extracts searchable text from a session event.
   */
  private extractSearchableText(event: Record<string, unknown>): string {
    const content = (event.message as Record<string, unknown>)?.content;
    if (!content) return '';

    if (typeof content === 'string') return content;

    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const block of content) {
        if (block && typeof block === 'object') {
          const b = block as Record<string, unknown>;
          if (typeof b.text === 'string') parts.push(b.text as string);
          if (typeof b.thinking === 'string') parts.push(b.thinking as string);
          if (typeof b.content === 'string') parts.push(b.content as string);
          if (b.input && typeof b.input === 'object') {
            parts.push(JSON.stringify(b.input));
          }
        }
      }
      return parts.join(' ');
    }

    return '';
  }

  /**
   * Decodes an encoded project path directory name.
   */
  private decodeProjectPath(encoded: string): string {
    // Project dirs are encoded as: -home-user-code-myproject
    return encoded.replace(/^-/, '/').replace(/-/g, '/');
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

/**
 * QuickPick item wrapping a SearchResult.
 */
class SearchResultItem implements vscode.QuickPickItem {
  label: string;
  description: string;
  detail: string;

  constructor(public readonly result: SearchResult) {
    // Show event type icon + snippet
    const icon = result.eventType === 'user' ? '$(person)' :
      result.eventType === 'assistant' ? '$(hubot)' :
      result.eventType === 'tool_use' ? '$(tools)' : '$(file)';

    this.label = `${icon} ${result.snippet}`;

    // Show project + timestamp
    const displayPath = result.projectPath.replace(os.homedir(), '~');
    const time = result.timestamp ? new Date(result.timestamp).toLocaleString() : '';
    this.description = displayPath;
    this.detail = time;
  }
}
