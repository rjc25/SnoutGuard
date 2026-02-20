/**
 * LLM-powered architectural decision extraction.
 * Uses Claude to analyze code samples and identify implicit architectural decisions.
 */

import {
  analyzeWithLlm,
  generateId,
  now,
  truncate,
  type ArchDecision,
  type ArchGuardConfig,
  type ParsedFile,
  type DetectedPattern,
} from '@archguard/core';
import type Anthropic from '@anthropic-ai/sdk';
import { formatDirectoryTree, type DirectoryNode } from './scanner.js';

/** Maximum code sample size sent to the LLM */
const MAX_SAMPLE_SIZE = 8000;
const MAX_SAMPLES_PER_REQUEST = 10;

/**
 * Extract architectural decisions using LLM analysis.
 * Sends representative code samples and directory structure to Claude
 * for deep architectural pattern identification.
 */
export async function extractDecisionsWithLlm(
  client: Anthropic,
  config: ArchGuardConfig,
  files: ParsedFile[],
  directoryTree: DirectoryNode,
  heuristicPatterns: DetectedPattern[]
): Promise<ArchDecision[]> {
  // Select representative samples
  const samples = selectRepresentativeSamples(files);
  const treeStr = formatDirectoryTree(directoryTree);

  const systemPrompt = `You are an expert software architect. Analyze the following code samples from a codebase and identify architectural decisions.

For each decision found, provide:
1. A clear title
2. A description of the decision
3. The category (structural, behavioral, deployment, data, api, testing, security)
4. Confidence level (0-1)
5. Evidence with file paths and explanations
6. Any constraints this decision implies
7. Tags for searchability

Previously detected patterns (via heuristics): ${JSON.stringify(heuristicPatterns.map((p) => p.name))}

Respond ONLY with valid JSON matching this schema:
{
  "decisions": [
    {
      "title": "string",
      "description": "string",
      "category": "structural|behavioral|deployment|data|api|testing|security",
      "confidence": 0.0-1.0,
      "evidence": [{"filePath": "string", "lineRange": [1, 10], "snippet": "string", "explanation": "string"}],
      "constraints": ["string"],
      "tags": ["string"]
    }
  ]
}`;

  const userPrompt = `Directory structure:
${truncate(treeStr, 3000)}

Code samples:
${samples.map((s) => `--- ${s.filePath} ---\n${truncate(s.content, MAX_SAMPLE_SIZE / MAX_SAMPLES_PER_REQUEST)}`).join('\n\n')}`;

  const response = await analyzeWithLlm(client, config, {
    systemPrompt,
    userPrompt,
    maxTokens: config.llm.maxTokensPerAnalysis,
    temperature: 0.3,
  });

  return parseDecisionResponse(response);
}

/**
 * Extract decisions using only heuristic patterns (no LLM).
 * Used when --no-llm flag is set or no API key is configured.
 */
export function extractDecisionsFromPatterns(
  patterns: DetectedPattern[]
): ArchDecision[] {
  return patterns.map((pattern) => ({
    id: generateId(),
    title: pattern.name,
    description: pattern.description,
    category: inferCategory(pattern.name),
    status: 'detected' as const,
    confidence: pattern.confidence,
    evidence: pattern.evidence,
    constraints: inferConstraints(pattern.name),
    relatedDecisions: [],
    detectedAt: now(),
    tags: inferTags(pattern.name),
  }));
}

/** Sample file with content for LLM analysis */
interface CodeSample {
  filePath: string;
  content: string;
}

/** Select a representative set of code samples for analysis */
function selectRepresentativeSamples(files: ParsedFile[]): CodeSample[] {
  // Prioritize files that are likely architecturally significant
  const scored = files.map((f) => ({
    file: f,
    score: calculateSignificance(f),
  }));

  scored.sort((a, b) => b.score - a.score);

  const selected = scored.slice(0, MAX_SAMPLES_PER_REQUEST);

  return selected.map((s) => {
    const content = readFileContent(s.file.filePath);
    return {
      filePath: s.file.filePath,
      content: truncate(content, MAX_SAMPLE_SIZE / MAX_SAMPLES_PER_REQUEST),
    };
  });
}

/** Calculate architectural significance of a file */
function calculateSignificance(file: ParsedFile): number {
  let score = 0;

  // Config files are highly significant
  if (
    file.filePath.includes('config') ||
    file.filePath.includes('.config.') ||
    file.filePath.includes('tsconfig')
  ) {
    score += 5;
  }

  // Entry points
  if (
    file.filePath.endsWith('index.ts') ||
    file.filePath.endsWith('main.ts') ||
    file.filePath.endsWith('app.ts')
  ) {
    score += 3;
  }

  // Files with decorators (likely framework patterns)
  score += file.decorators.length * 2;

  // Files with many exports (likely public API)
  score += Math.min(file.exports.length, 5);

  // Files with many imports (highly connected)
  score += Math.min(file.imports.length / 3, 3);

  // Middleware, controllers, services — architecturally relevant
  const significantNames = [
    'controller',
    'service',
    'middleware',
    'router',
    'repository',
    'module',
    'provider',
    'factory',
    'handler',
  ];
  if (
    significantNames.some(
      (n) =>
        file.filePath.toLowerCase().includes(n) ||
        file.classes.some((c) => c.toLowerCase().includes(n))
    )
  ) {
    score += 4;
  }

  return score;
}

/** Read file content safely */
function readFileContent(filePath: string): string {
  try {
    const fs = require('node:fs');
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return `// File: ${filePath} (content not available)`;
  }
}

/** Parse LLM response into ArchDecision objects */
function parseDecisionResponse(response: string): ArchDecision[] {
  try {
    // Extract JSON from possible markdown code blocks
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : response.trim();

    const parsed = JSON.parse(jsonStr);
    const decisionsData = parsed.decisions || parsed;

    if (!Array.isArray(decisionsData)) return [];

    return decisionsData.map(
      (d: Record<string, unknown>) =>
        ({
          id: generateId(),
          title: String(d.title || 'Unknown Decision'),
          description: String(d.description || ''),
          category: validateCategory(String(d.category || 'structural')),
          status: 'detected' as const,
          confidence: Number(d.confidence) || 0.5,
          evidence: Array.isArray(d.evidence)
            ? (d.evidence as Record<string, unknown>[]).map((e) => ({
                filePath: String(e.filePath || ''),
                lineRange: (Array.isArray(e.lineRange)
                  ? e.lineRange
                  : [1, 10]) as [number, number],
                snippet: String(e.snippet || ''),
                explanation: String(e.explanation || ''),
              }))
            : [],
          constraints: Array.isArray(d.constraints)
            ? (d.constraints as string[])
            : [],
          relatedDecisions: [],
          detectedAt: now(),
          tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
        }) satisfies ArchDecision
    );
  } catch {
    return [];
  }
}

/** Validate category string */
function validateCategory(
  category: string
): ArchDecision['category'] {
  const valid = [
    'structural',
    'behavioral',
    'deployment',
    'data',
    'api',
    'testing',
    'security',
  ];
  return valid.includes(category)
    ? (category as ArchDecision['category'])
    : 'structural';
}

/** Infer category from pattern name */
function inferCategory(
  name: string
): ArchDecision['category'] {
  const lower = name.toLowerCase();
  if (
    lower.includes('state') ||
    lower.includes('event') ||
    lower.includes('middleware')
  )
    return 'behavioral';
  if (lower.includes('api') || lower.includes('versioning')) return 'api';
  if (lower.includes('deploy') || lower.includes('docker')) return 'deployment';
  if (lower.includes('repository') || lower.includes('data')) return 'data';
  if (lower.includes('test')) return 'testing';
  if (lower.includes('auth') || lower.includes('security')) return 'security';
  return 'structural';
}

/** Infer constraints from pattern name */
function inferConstraints(name: string): string[] {
  const lower = name.toLowerCase();
  const constraints: string[] = [];

  if (lower.includes('mvc')) {
    constraints.push('Controllers should not directly access data storage');
    constraints.push('Models should be independent of presentation logic');
  }
  if (lower.includes('repository')) {
    constraints.push('Data access should go through repository interfaces');
  }
  if (lower.includes('layered') || lower.includes('clean')) {
    constraints.push('Dependencies should point inward (toward domain)');
    constraints.push('Domain layer should have no external dependencies');
  }
  if (lower.includes('dependency injection')) {
    constraints.push('Use constructor injection for dependencies');
    constraints.push('Register services in module/container configuration');
  }

  return constraints;
}

/** Infer tags from pattern name */
function inferTags(name: string): string[] {
  const lower = name.toLowerCase();
  const tags: string[] = ['architecture'];

  if (lower.includes('mvc') || lower.includes('mvvm')) tags.push('pattern', 'mvc');
  if (lower.includes('repository')) tags.push('pattern', 'data-access');
  if (lower.includes('event')) tags.push('pattern', 'messaging');
  if (lower.includes('middleware')) tags.push('pattern', 'http');
  if (lower.includes('state')) tags.push('pattern', 'state-management');
  if (lower.includes('layered')) tags.push('architecture', 'layers');
  if (lower.includes('clean')) tags.push('architecture', 'clean-architecture');
  if (lower.includes('injection')) tags.push('pattern', 'di');

  return [...new Set(tags)];
}
