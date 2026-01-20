/**
 * @fileoverview System and user prompt templates for code completions.
 *
 * Provides prompt generation functions that instruct Claude to output
 * code-only completions without conversational text or markdown.
 *
 * @module prompts
 */

/**
 * Patterns that indicate a conversational response rather than code.
 *
 * If Claude returns a response matching any of these patterns,
 * it means the model didn't follow instructions and the completion
 * should be filtered out.
 */
const CONVERSATIONAL_PATTERNS = [
  /^I (need|cannot|can't|don't|would|could)/i,
  /^(Could|Would|Can) you/i,
  /more context/i,
  /cannot provide/i,
  /please provide/i,
  /let me/i,
  /however/i,
  /without (additional|more)/i,
];

/**
 * Generates the system prompt for completion requests.
 *
 * The system prompt instructs Claude to act as an autocomplete engine,
 * outputting only code without explanations, questions, or markdown.
 *
 * @param multiline - Whether to request multi-line (block/function) completions
 * @returns System prompt string
 *
 * @example
 * ```typescript
 * const singleLinePrompt = getSystemPrompt(false);
 * // "You are an autocomplete engine... Maximum 1-3 lines"
 *
 * const multiLinePrompt = getSystemPrompt(true);
 * // "You are an autocomplete engine... Maximum up to 10 lines"
 * ```
 */
export function getSystemPrompt(multiline: boolean): string {
  const blockType = multiline ? 'block/function' : 'line/statement';
  const lineLimit = multiline ? 'up to 10 lines' : '1-3 lines';

  return `You are an autocomplete engine. Complete the code at the cursor position.

RULES:
- Output ONLY code that completes the ${blockType}
- If unsure, output a reasonable default (e.g., None, 0, "", [], {})
- NEVER ask questions or explain
- NEVER say you need more context
- NO markdown, NO backticks
- Maximum ${lineLimit}`;
}

/**
 * Generates the user prompt for a specific completion request.
 *
 * The prompt format includes language, filename, and the code context
 * with a <CURSOR> marker indicating where completion should be inserted.
 *
 * @param language - Programming language identifier (e.g., 'typescript', 'python')
 * @param filename - Name of the file being edited
 * @param prefix - Code before the cursor position
 * @param suffix - Code after the cursor position
 * @returns User prompt string
 *
 * @example
 * ```typescript
 * const prompt = getUserPrompt(
 *   'typescript',
 *   'utils.ts',
 *   'function add(a: number, b: number): number {\n  return ',
 *   '\n}'
 * );
 * // "typescript | utils.ts\n\nfunction add(a: number, b: number): number {\n  return <CURSOR>\n}\n\nCompletion:"
 * ```
 */
export function getUserPrompt(
  language: string,
  filename: string,
  prefix: string,
  suffix: string
): string {
  return `${language} | ${filename}

${prefix}<CURSOR>${suffix}

Completion:`;
}

/**
 * Cleans and validates a completion response from Claude.
 *
 * Removes markdown code block markers, filters out conversational responses,
 * and enforces length limits.
 *
 * @param text - Raw completion text from Claude
 * @param multiline - Whether this was a multi-line completion request
 * @returns Cleaned completion string, or undefined if invalid/filtered
 *
 * @example
 * ```typescript
 * // Valid completion
 * cleanCompletion('a + b;', false); // Returns 'a + b;'
 *
 * // Markdown removal
 * cleanCompletion('```typescript\na + b;\n```', false); // Returns 'a + b;'
 *
 * // Conversational filtering
 * cleanCompletion('I need more context to complete this.', false); // Returns undefined
 *
 * // Length filtering
 * cleanCompletion('very long response...', false); // Returns undefined if > 200 chars
 * ```
 */
export function cleanCompletion(
  text: string,
  multiline: boolean
): string | undefined {
  const maxLength = multiline ? 1000 : 200;

  // Remove markdown code blocks
  let cleaned = text
    .replace(/^```[\w]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  // Check for conversational patterns (model didn't follow instructions)
  for (const pattern of CONVERSATIONAL_PATTERNS) {
    if (pattern.test(cleaned)) {
      return undefined;
    }
  }

  // Check length
  if (cleaned.length > maxLength) {
    return undefined;
  }

  return cleaned || undefined;
}
