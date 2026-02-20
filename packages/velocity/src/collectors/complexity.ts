/**
 * Complexity calculator.
 * Computes cyclomatic and cognitive complexity for source code,
 * calculates complexity deltas from changes, and determines
 * refactoring ratios (complexity reduction vs addition).
 */

import type { FileDiff } from '@snoutguard/core';
import type { FunctionComplexity, FileComplexity, ComplexityDelta } from '../types.js';

// ─── Decision Point Patterns ────────────────────────────────────────

/**
 * Regex patterns for counting cyclomatic complexity decision points.
 * Each match increments the cyclomatic complexity by 1.
 */
const DECISION_POINT_PATTERNS: RegExp[] = [
  /\bif\s*\(/g,
  /\belse\s+if\s*\(/g,
  /\bfor\s*\(/g,
  /\bfor\s+.*\bof\b/g,
  /\bfor\s+.*\bin\b/g,
  /\bwhile\s*\(/g,
  /\bdo\s*\{/g,
  /\bswitch\s*\(/g,
  /\bcatch\s*\(/g,
  /&&/g,
  /\|\|/g,
  /\?\?/g,
  /\?[^:?]/g, // ternary operator (not optional chaining ?.)
];

/**
 * Additional patterns that increase cognitive complexity
 * beyond cyclomatic complexity (nesting, recursion, etc.)
 */
const COGNITIVE_NESTING_BONUS_PATTERNS: RegExp[] = [
  /\bif\s*\(/g,
  /\bfor\s*\(/g,
  /\bwhile\s*\(/g,
  /\bswitch\s*\(/g,
  /\bcatch\s*\(/g,
];

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Calculate complexity metrics for a single block of source code.
 *
 * @param source - The source code text to analyze
 * @param filePath - Path of the file (for metadata)
 * @param functionName - Name of the function/block
 * @param lineStart - Starting line number of the block
 * @param lineEnd - Ending line number of the block
 * @returns FunctionComplexity metrics for the block
 */
export function calculateFunctionComplexity(
  source: string,
  filePath: string,
  functionName: string,
  lineStart: number,
  lineEnd: number
): FunctionComplexity {
  const cyclomatic = computeCyclomaticComplexity(source);
  const cognitive = computeCognitiveComplexity(source);

  return {
    filePath,
    functionName,
    lineStart,
    lineEnd,
    cyclomaticComplexity: cyclomatic,
    cognitiveComplexity: cognitive,
  };
}

/**
 * Calculate complexity metrics for an entire file by extracting
 * function bodies and scoring each one.
 *
 * @param source - Full file source code
 * @param filePath - Path of the file
 * @returns FileComplexity containing per-function and aggregate metrics
 */
export function calculateFileComplexity(
  source: string,
  filePath: string
): FileComplexity {
  const functions = extractFunctions(source, filePath);

  if (functions.length === 0) {
    // Treat the whole file as one block
    const wholeFile = calculateFunctionComplexity(
      source,
      filePath,
      '<module>',
      1,
      source.split('\n').length
    );
    return {
      filePath,
      functions: [wholeFile],
      avgCyclomaticComplexity: wholeFile.cyclomaticComplexity,
      avgCognitiveComplexity: wholeFile.cognitiveComplexity,
      maxCyclomaticComplexity: wholeFile.cyclomaticComplexity,
      maxCognitiveComplexity: wholeFile.cognitiveComplexity,
    };
  }

  const avgCyclomatic =
    functions.reduce((sum, f) => sum + f.cyclomaticComplexity, 0) / functions.length;
  const avgCognitive =
    functions.reduce((sum, f) => sum + f.cognitiveComplexity, 0) / functions.length;
  const maxCyclomatic = Math.max(...functions.map((f) => f.cyclomaticComplexity));
  const maxCognitive = Math.max(...functions.map((f) => f.cognitiveComplexity));

  return {
    filePath,
    functions,
    avgCyclomaticComplexity: Math.round(avgCyclomatic * 100) / 100,
    avgCognitiveComplexity: Math.round(avgCognitive * 100) / 100,
    maxCyclomaticComplexity: maxCyclomatic,
    maxCognitiveComplexity: maxCognitive,
  };
}

/**
 * Calculate complexity deltas for a set of file diffs.
 * Compares the complexity of added vs removed code to determine
 * whether changes increase or decrease complexity.
 *
 * @param diffs - Array of FileDiff objects from git
 * @param originalSources - Map of file path -> original source content (before change)
 * @param modifiedSources - Map of file path -> modified source content (after change)
 * @returns Array of ComplexityDelta for each changed file
 */
export function calculateComplexityDeltas(
  diffs: FileDiff[],
  originalSources: Map<string, string>,
  modifiedSources: Map<string, string>
): ComplexityDelta[] {
  const deltas: ComplexityDelta[] = [];

  for (const diff of diffs) {
    const originalSource = originalSources.get(diff.filePath) ?? '';
    const modifiedSource = modifiedSources.get(diff.filePath) ?? '';

    const beforeComplexity =
      originalSource.length > 0
        ? calculateFileComplexity(originalSource, diff.filePath)
        : null;
    const afterComplexity =
      modifiedSource.length > 0
        ? calculateFileComplexity(modifiedSource, diff.filePath)
        : null;

    const beforeAvg = beforeComplexity?.avgCyclomaticComplexity ?? 0;
    const afterAvg = afterComplexity?.avgCyclomaticComplexity ?? 0;
    const change = afterAvg - beforeAvg;

    // Refactoring reduction: how much complexity was removed
    // Complexity addition: how much complexity was added
    const refactoringReduction = change < 0 ? Math.abs(change) : 0;
    const complexityAddition = change > 0 ? change : 0;

    deltas.push({
      filePath: diff.filePath,
      beforeAvgComplexity: Math.round(beforeAvg * 100) / 100,
      afterAvgComplexity: Math.round(afterAvg * 100) / 100,
      complexityChange: Math.round(change * 100) / 100,
      refactoringReduction: Math.round(refactoringReduction * 100) / 100,
      complexityAddition: Math.round(complexityAddition * 100) / 100,
    });
  }

  return deltas;
}

/**
 * Calculate the refactoring ratio from complexity deltas.
 * Ratio = total complexity reduction / (total reduction + total addition).
 * Returns 0 if there are no complexity changes, 1.0 if all changes reduce complexity.
 *
 * @param deltas - Array of ComplexityDelta from calculateComplexityDeltas
 * @returns Refactoring ratio between 0 and 1
 */
export function calculateRefactoringRatio(deltas: ComplexityDelta[]): number {
  let totalReduction = 0;
  let totalAddition = 0;

  for (const delta of deltas) {
    totalReduction += delta.refactoringReduction;
    totalAddition += delta.complexityAddition;
  }

  const total = totalReduction + totalAddition;
  if (total === 0) return 0;

  return Math.round((totalReduction / total) * 1000) / 1000;
}

/**
 * Calculate complexity from diff hunks only (when full source is not available).
 * Analyzes added and removed lines from diff hunks to estimate complexity change.
 *
 * @param diffs - Array of FileDiff objects
 * @returns ComplexityDelta[] based on hunk analysis
 */
export function calculateComplexityFromDiffs(diffs: FileDiff[]): ComplexityDelta[] {
  const deltas: ComplexityDelta[] = [];

  for (const diff of diffs) {
    let addedComplexity = 0;
    let removedComplexity = 0;

    for (const hunk of diff.hunks) {
      const lines = hunk.content.split('\n');

      for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          addedComplexity += countDecisionPoints(line);
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          removedComplexity += countDecisionPoints(line);
        }
      }
    }

    const change = addedComplexity - removedComplexity;
    const refactoringReduction = change < 0 ? Math.abs(change) : 0;
    const complexityAddition = change > 0 ? change : 0;

    deltas.push({
      filePath: diff.filePath,
      beforeAvgComplexity: removedComplexity,
      afterAvgComplexity: addedComplexity,
      complexityChange: change,
      refactoringReduction,
      complexityAddition,
    });
  }

  return deltas;
}

// ─── Complexity Calculation Internals ───────────────────────────────

/**
 * Compute cyclomatic complexity for a source code block.
 * Cyclomatic complexity = 1 + number of decision points.
 */
function computeCyclomaticComplexity(source: string): number {
  // Strip comments and strings to avoid false positives
  const cleaned = stripCommentsAndStrings(source);
  let complexity = 1; // Base complexity

  complexity += countDecisionPoints(cleaned);

  return complexity;
}

/**
 * Compute cognitive complexity for a source code block.
 * Cognitive complexity adds nesting penalties on top of
 * structural complexity to better model human comprehension difficulty.
 */
function computeCognitiveComplexity(source: string): number {
  const cleaned = stripCommentsAndStrings(source);
  const lines = cleaned.split('\n');
  let complexity = 0;
  let nestingLevel = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Track nesting from braces
    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;

    // Check for nesting-increasing control structures
    let hasNestingStructure = false;
    for (const pattern of COGNITIVE_NESTING_BONUS_PATTERNS) {
      pattern.lastIndex = 0;
      const matches = trimmed.match(pattern);
      if (matches) {
        // Each nesting structure adds 1 + nesting level
        for (let i = 0; i < matches.length; i++) {
          complexity += 1 + nestingLevel;
          hasNestingStructure = true;
        }
      }
    }

    // Check for non-nesting increments (else, &&, ||, ??)
    if (/\belse\b/.test(trimmed) && !hasNestingStructure) {
      complexity += 1; // else does not get nesting penalty
    }

    // Logical operators (only if not already counted in nesting structures)
    if (!hasNestingStructure) {
      const andOr = (trimmed.match(/&&|\|\||\?\?/g) || []).length;
      complexity += andOr;
    }

    // Ternary operator
    const ternary = (trimmed.match(/\?[^:?.]/g) || []).length;
    complexity += ternary;

    // Update nesting level
    nestingLevel += openBraces - closeBraces;
    if (nestingLevel < 0) nestingLevel = 0;
  }

  return complexity;
}

/**
 * Count the number of decision points in a code string.
 */
function countDecisionPoints(source: string): number {
  let count = 0;

  for (const pattern of DECISION_POINT_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = source.match(pattern);
    if (matches) {
      count += matches.length;
    }
  }

  return count;
}

/**
 * Extract function definitions from source code and calculate
 * complexity for each one.
 */
function extractFunctions(source: string, filePath: string): FunctionComplexity[] {
  const functions: FunctionComplexity[] = [];
  const lines = source.split('\n');

  // Match common function patterns:
  //   function name(...)
  //   const name = (...) =>
  //   const name = function(...)
  //   name(...) {              (methods)
  //   async function name(...)
  //   export function name(...)
  //   export async function name(...)
  const functionPatterns = [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>/,
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function/,
    /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w[^{]*)?\s*\{/,
    /^\s+(?:public|private|protected|static|async)\s+(?:async\s+)?(\w+)\s*\(/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let functionName: string | null = null;

    for (const pattern of functionPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        functionName = match[1];
        break;
      }
    }

    if (!functionName) continue;

    // Find the function body by tracking brace depth
    const bodyStart = i;
    let braceDepth = 0;
    let foundOpen = false;
    let bodyEnd = i;

    for (let j = i; j < lines.length; j++) {
      const cleaned = stripCommentsAndStrings(lines[j]);
      for (const ch of cleaned) {
        if (ch === '{') {
          braceDepth++;
          foundOpen = true;
        } else if (ch === '}') {
          braceDepth--;
        }
      }

      if (foundOpen && braceDepth <= 0) {
        bodyEnd = j;
        break;
      }

      // Safety: don't scan too far for a single function
      if (j - i > 500) {
        bodyEnd = j;
        break;
      }
    }

    // If we never found an opening brace, this might be an arrow function
    // without braces. Use a single line or until next blank line.
    if (!foundOpen) {
      bodyEnd = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === '' || lines[j].match(/^(?:export\s+)?(?:const|let|var|function|class)\s/)) {
          bodyEnd = j - 1;
          break;
        }
        bodyEnd = j;
      }
    }

    const functionBody = lines.slice(bodyStart, bodyEnd + 1).join('\n');
    const fc = calculateFunctionComplexity(
      functionBody,
      filePath,
      functionName,
      bodyStart + 1, // 1-indexed
      bodyEnd + 1
    );

    functions.push(fc);

    // Skip past this function body to avoid double-counting nested function defs
    // at the top level (we still count their complexity within the parent)
  }

  return functions;
}

/**
 * Strip comments and string literals from source code to avoid
 * false-positive decision point matches inside strings/comments.
 */
function stripCommentsAndStrings(source: string): string {
  let result = '';
  let i = 0;
  const len = source.length;

  while (i < len) {
    // Single-line comment
    if (source[i] === '/' && source[i + 1] === '/') {
      while (i < len && source[i] !== '\n') i++;
      result += '\n';
      continue;
    }

    // Multi-line comment
    if (source[i] === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') result += '\n';
        i++;
      }
      i += 2; // skip */
      continue;
    }

    // Template literal
    if (source[i] === '`') {
      i++;
      while (i < len && source[i] !== '`') {
        if (source[i] === '\\') i++; // skip escaped char
        if (source[i] === '\n') result += '\n';
        i++;
      }
      i++; // skip closing `
      continue;
    }

    // String literals
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i];
      i++;
      while (i < len && source[i] !== quote) {
        if (source[i] === '\\') i++; // skip escaped char
        i++;
      }
      i++; // skip closing quote
      continue;
    }

    result += source[i];
    i++;
  }

  return result;
}
