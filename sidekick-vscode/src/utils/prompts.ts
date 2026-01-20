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
  const cleaned = text
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

/**
 * Patterns indicating a conversational transform response rather than code.
 */
const TRANSFORM_CONVERSATIONAL_PATTERNS = [
  /^Here/i,
  /^The transformed/i,
  /^I've/i,
  /^I have/i,
];

/**
 * Generates the system prompt for code transformation requests.
 *
 * Instructs Claude to act as a code transformation assistant,
 * outputting only the transformed code without explanations.
 *
 * @returns System prompt string for transforms
 *
 * @example
 * ```typescript
 * const systemPrompt = getTransformSystemPrompt();
 * // "You are a code transformation assistant..."
 * ```
 */
export function getTransformSystemPrompt(): string {
  return `You are a code transformation assistant. Transform the provided code according to the user's instruction.

RULES:
- Output ONLY the transformed code
- Preserve the code's functionality unless the instruction changes it
- Maintain the same programming language
- Keep the same indentation style
- NO explanations before or after the code
- NO markdown code blocks
- If the instruction is unclear, make a reasonable interpretation`;
}

/**
 * Generates the user prompt for a code transformation request.
 *
 * Includes the language, code to transform, optional context before/after,
 * and the transformation instruction.
 *
 * @param code - The code to transform
 * @param instruction - What transformation to apply
 * @param language - Programming language identifier
 * @param prefix - Optional code context before the selection
 * @param suffix - Optional code context after the selection
 * @returns User prompt string for transforms
 *
 * @example
 * ```typescript
 * const prompt = getTransformUserPrompt(
 *   'function add(a, b) { return a + b; }',
 *   'Add TypeScript types',
 *   'typescript'
 * );
 * ```
 */
export function getTransformUserPrompt(
  code: string,
  instruction: string,
  language: string,
  prefix?: string,
  suffix?: string
): string {
  let prompt = `Language: ${language}\n\n`;

  if (prefix) {
    prompt += `Context before:\n${prefix}\n\n`;
  }

  prompt += `Code to transform:\n${code}\n\n`;

  if (suffix) {
    prompt += `Context after:\n${suffix}\n\n`;
  }

  prompt += `Instruction: ${instruction}\n\nTransformed code:`;

  return prompt;
}

/**
 * Cleans and validates a transform response from Claude.
 *
 * Removes markdown code block markers and filters out conversational
 * responses that don't contain just code.
 *
 * @param text - Raw transform response text from Claude
 * @returns Cleaned code string, or undefined if invalid/filtered
 *
 * @example
 * ```typescript
 * // Valid transform
 * cleanTransformResponse('function add(a: number, b: number): number { return a + b; }');
 * // Returns the code
 *
 * // Markdown removal
 * cleanTransformResponse('```typescript\nconst x = 1;\n```');
 * // Returns 'const x = 1;'
 *
 * // Conversational filtering
 * cleanTransformResponse("Here's the transformed code:\nconst x = 1;");
 * // Returns 'const x = 1;' (extracts code after newline)
 * ```
 */
export function cleanTransformResponse(text: string): string | undefined {
  // Remove markdown code blocks (```language ... ```)
  let cleaned = text
    .replace(/^```[\w]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  // Check for conversational prefixes
  for (const pattern of TRANSFORM_CONVERSATIONAL_PATTERNS) {
    if (pattern.test(cleaned)) {
      // Try to extract code after first newline
      const newlineIndex = cleaned.indexOf('\n');
      if (newlineIndex !== -1) {
        cleaned = cleaned.slice(newlineIndex + 1).trim();
        // Remove any remaining markdown blocks after extraction
        cleaned = cleaned
          .replace(/^```[\w]*\n?/, '')
          .replace(/\n?```$/, '')
          .trim();
      } else {
        // No newline found, can't extract code
        return undefined;
      }
    }
  }

  return cleaned || undefined;
}
