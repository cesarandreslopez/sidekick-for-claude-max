/**
 * @fileoverview CLAUDE.md advisor service for generating suggestions.
 *
 * Orchestrates session data collection and AI analysis to generate
 * actionable suggestions for improving CLAUDE.md files.
 *
 * @module services/ClaudeMdAdvisor
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { AuthService } from './AuthService';
import { resolveModel } from './ModelResolver';
import type { SessionAnalyzer, SessionAnalysisData } from './SessionAnalyzer';
import { buildClaudeMdAnalysisPrompt, parseClaudeMdSuggestions } from '../utils/analysisPrompts';
import { log, logError } from './Logger';

/**
 * A suggestion for improving CLAUDE.md.
 */
export interface ClaudeMdSuggestion {
  /** Short descriptive title */
  title: string;
  /** What was observed in the session that led to this suggestion */
  observed: string;
  /** The exact text to add to CLAUDE.md */
  suggestion: string;
  /** Why this suggestion would help */
  reasoning: string;
}

/**
 * Result of the analysis operation.
 */
export interface AnalysisResult {
  /** Whether the analysis was successful */
  success: boolean;
  /** Generated suggestions (empty if failed) */
  suggestions: ClaudeMdSuggestion[];
  /** Error message if failed */
  error?: string;
  /** The session data that was analyzed */
  sessionData?: SessionAnalysisData;
}

/**
 * Service for generating CLAUDE.md suggestions from session analysis.
 *
 * Uses the SessionAnalyzer to collect session data and AuthService
 * to call Claude for analysis. Parses the response into structured
 * suggestions that can be displayed in the dashboard.
 *
 * @example
 * ```typescript
 * const advisor = new ClaudeMdAdvisor(authService, sessionAnalyzer);
 *
 * const result = await advisor.analyze();
 * if (result.success) {
 *   for (const suggestion of result.suggestions) {
 *     console.log(suggestion.title);
 *     console.log(suggestion.suggestion);
 *   }
 * }
 * ```
 */
export class ClaudeMdAdvisor {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionAnalyzer: SessionAnalyzer
  ) {}

  /**
   * Reads the current CLAUDE.md content from the workspace root.
   *
   * @returns CLAUDE.md content if it exists, null otherwise
   */
  private async readCurrentClaudeMd(): Promise<string | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      log('ClaudeMdAdvisor: No workspace folders found');
      return null;
    }

    const claudeMdPath = path.join(workspaceFolders[0].uri.fsPath, 'CLAUDE.md');
    try {
      const content = await fs.promises.readFile(claudeMdPath, 'utf-8');
      log(`ClaudeMdAdvisor: Read CLAUDE.md (${content.length} chars)`);
      return content;
    } catch {
      log('ClaudeMdAdvisor: CLAUDE.md not found or unreadable');
      return null;
    }
  }

  /**
   * Analyzes the current session and generates CLAUDE.md suggestions.
   *
   * @returns Analysis result with suggestions or error
   */
  async analyze(): Promise<AnalysisResult> {
    log('ClaudeMdAdvisor: Starting session analysis');

    try {
      // 1. Collect session data
      const sessionData = this.sessionAnalyzer.collectData();
      log(`ClaudeMdAdvisor: Collected data - ${sessionData.toolPatterns.length} tool patterns, ${sessionData.errors.length} error types, ${sessionData.inefficiencies.length} inefficiencies`);

      // 2. Read current CLAUDE.md content
      const currentClaudeMd = await this.readCurrentClaudeMd();
      sessionData.currentClaudeMd = currentClaudeMd ?? undefined;

      // 3. Check if we have enough data for meaningful analysis
      if (!sessionData.hasEnoughData) {
        log('ClaudeMdAdvisor: Not enough session data for analysis');
        return {
          success: false,
          suggestions: [],
          error: 'Not enough session data for analysis. Try using Claude Code more before analyzing.',
          sessionData
        };
      }

      // 4. Build the analysis prompt
      const prompt = buildClaudeMdAnalysisPrompt(sessionData);
      log(`ClaudeMdAdvisor: Built prompt (${prompt.length} chars)`);

      // 5. Call Claude via AuthService (uses Max subscription with session isolation)
      log('ClaudeMdAdvisor: Calling Claude for analysis');
      const model = resolveModel('balanced', this.authService.getProviderId(), 'explanationModel');
      const response = await this.authService.complete(prompt, {
        model,
        timeout: 90000 // 90 second timeout for analysis (more context = more time)
      });
      log(`ClaudeMdAdvisor: Received response (${response.length} chars)`);

      // 6. Parse the response into structured suggestions
      const suggestions = parseClaudeMdSuggestions(response);
      log(`ClaudeMdAdvisor: Parsed ${suggestions.length} suggestions`);

      if (suggestions.length === 0) {
        logError('ClaudeMdAdvisor: No suggestions parsed from response');
        return {
          success: false,
          suggestions: [],
          error: 'Could not parse suggestions from the analysis. The response may have been in an unexpected format.',
          sessionData
        };
      }

      return {
        success: true,
        suggestions,
        sessionData
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logError('ClaudeMdAdvisor: Analysis failed', error);

      return {
        success: false,
        suggestions: [],
        error: `Analysis failed: ${message}`
      };
    }
  }

  /**
   * Checks if the session has enough data for meaningful analysis.
   *
   * @returns True if analysis would be meaningful
   */
  hasEnoughData(): boolean {
    const sessionData = this.sessionAnalyzer.collectData();
    return sessionData.hasEnoughData;
  }
}
