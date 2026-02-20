/**
 * LLM-powered architectural decision extraction.
 *
 * Uses Claude with structured XML prompts, chain-of-thought reasoning,
 * and Zod-validated responses to identify implicit architectural decisions
 * from codebase structure, AST data, and dependency graphs.
 */

import { z } from 'zod';
import {
  analyzeWithLlmValidated,
  generateId,
  now,
  truncate,
  estimateTokens,
  type ArchDecision,
  type ArchGuardConfig,
  type ParsedFile,
  type DetectedPattern,
} from '@archguard/core';
import type Anthropic from '@anthropic-ai/sdk';
import { formatDirectoryTree, type DirectoryNode } from './scanner.js';
import type { DependencyGraph } from './dependency-mapper.js';

// ─── Zod Response Schema ───────────────────────────────────────────

const evidenceSchema = z.object({
  filePath: z.string(),
  lineRange: z.tuple([z.number(), z.number()]),
  snippet: z.string(),
  explanation: z.string(),
});

const decisionSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(10),
  category: z.enum(['structural', 'behavioral', 'deployment', 'data', 'api', 'testing', 'security']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(10),
  evidence: z.array(evidenceSchema).min(1),
  constraints: z.array(z.string()),
  tags: z.array(z.string()),
  isIntentional: z.boolean(),
});

const decisionsResponseSchema = z.object({
  decisions: z.array(decisionSchema),
});

type DecisionResponse = z.infer<typeof decisionsResponseSchema>;

// ─── Constants ─────────────────────────────────────────────────────

const MAX_SAMPLE_SIZE = 12_000;
const MAX_SAMPLES_PER_REQUEST = 15;
const MAX_PROMPT_TOKENS = 150_000;

// ─── System Prompt ─────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a world-class software architect with 20 years of experience across every major architectural style. You are analyzing a codebase to extract architectural decisions — both explicit and implicit.

Your job is to identify **intentional architectural decisions** that were made by the development team, distinguish them from **accidental patterns** that emerged without deliberate thought, and assess each with calibrated confidence.

<important_rules>
1. Only report decisions you have strong evidence for. Do not hallucinate decisions.
2. Each decision MUST have real file paths from the codebase as evidence.
3. Distinguish between intentional decisions and accidental patterns. Mark this explicitly.
4. Provide calibrated confidence: 0.9+ means you're nearly certain, 0.5-0.7 means possible but uncertain, below 0.5 means speculative.
5. For each decision, explain your reasoning — WHY you believe this is an architectural decision rather than coincidence.
6. Look for decisions across ALL categories: structural patterns, behavioral patterns, API design, data access, testing strategy, security patterns, and deployment patterns.
</important_rules>

<categories>
- structural: Layer architecture, module organization, design patterns (MVC, Clean Architecture, Hexagonal, etc.)
- behavioral: State management, event handling, messaging patterns, middleware chains, pub/sub
- api: API versioning, REST/GraphQL conventions, request/response patterns, error handling contracts
- data: Data access patterns (Repository, Active Record, DAO), ORM usage, caching strategies, database choice
- testing: Test organization, testing frameworks, mocking strategies, test coverage patterns
- security: Auth patterns, input validation, CORS, CSP, encryption, secret management
- deployment: Container usage, CI/CD patterns, environment configuration, feature flags
</categories>

You must respond with ONLY valid JSON matching this exact schema — no markdown, no code fences, no explanation outside the JSON:

{
  "decisions": [
    {
      "title": "Short descriptive name",
      "description": "What this decision means and how it manifests in the codebase",
      "category": "structural|behavioral|api|data|testing|security|deployment",
      "confidence": 0.0-1.0,
      "reasoning": "Your chain-of-thought explaining WHY this is an architectural decision, what evidence convinced you, and how confident you are",
      "evidence": [
        {
          "filePath": "actual/file/path.ts",
          "lineRange": [1, 20],
          "snippet": "relevant code or import",
          "explanation": "why this file/code is evidence"
        }
      ],
      "constraints": ["Constraint this decision imposes on future code"],
      "tags": ["tag1", "tag2"],
      "isIntentional": true
    }
  ]
}`;

// ─── Few-Shot Example ──────────────────────────────────────────────

const FEW_SHOT_EXAMPLE = `<example_input>
Directory structure shows: src/controllers/, src/services/, src/repositories/, src/entities/
Files import patterns: controllers import services, services import repositories, repositories import entities
Decorators found: @Controller, @Injectable, @InjectRepository
</example_input>

<example_output>
{
  "decisions": [
    {
      "title": "Layered Architecture with Dependency Injection (NestJS)",
      "description": "The codebase uses a strict 4-layer architecture: Controllers handle HTTP, Services contain business logic, Repositories manage data access, and Entities define domain models. Dependencies flow inward via NestJS dependency injection.",
      "category": "structural",
      "confidence": 0.95,
      "reasoning": "The directory structure perfectly maps to a layered architecture. Import analysis confirms dependencies only flow controller->service->repository->entity. NestJS decorators (@Controller, @Injectable, @InjectRepository) provide concrete evidence this is an intentional, framework-enforced pattern rather than an accident.",
      "evidence": [
        {
          "filePath": "src/controllers/user.controller.ts",
          "lineRange": [1, 15],
          "snippet": "@Controller('users') class UserController { constructor(private userService: UserService) {} }",
          "explanation": "Controller layer with injected service dependency — proves DI pattern"
        },
        {
          "filePath": "src/repositories/user.repository.ts",
          "lineRange": [1, 10],
          "snippet": "@Injectable() class UserRepository { constructor(@InjectRepository(User) private repo: Repository<User>) {} }",
          "explanation": "Repository pattern with TypeORM integration — data access is abstracted"
        }
      ],
      "constraints": [
        "Controllers must not directly access repositories or entities",
        "Business logic belongs in services, not controllers",
        "All dependencies must be injected via constructors, not imported directly",
        "Entity classes should be free of framework decorators except ORM annotations"
      ],
      "tags": ["layered-architecture", "dependency-injection", "nestjs", "repository-pattern"],
      "isIntentional": true
    }
  ]
}
</example_output>`;

// ─── Main Extraction Function ──────────────────────────────────────

/**
 * Extract architectural decisions using LLM analysis.
 * Sends representative code samples, dependency graph, and directory structure
 * to Claude for deep pattern identification with chain-of-thought reasoning.
 */
export async function extractDecisions(
  client: Anthropic,
  config: ArchGuardConfig,
  files: ParsedFile[],
  directoryTree: DirectoryNode,
  dependencyGraph?: DependencyGraph
): Promise<ArchDecision[]> {
  // For large codebases, analyze in batches
  const inputSize = estimateInputSize(files, directoryTree, dependencyGraph);

  if (inputSize > MAX_PROMPT_TOKENS) {
    return extractDecisionsMultiPass(client, config, files, directoryTree, dependencyGraph);
  }

  return extractDecisionsSinglePass(client, config, files, directoryTree, dependencyGraph);
}

/**
 * Single-pass extraction for codebases that fit within context.
 */
async function extractDecisionsSinglePass(
  client: Anthropic,
  config: ArchGuardConfig,
  files: ParsedFile[],
  directoryTree: DirectoryNode,
  dependencyGraph?: DependencyGraph
): Promise<ArchDecision[]> {
  const userPrompt = buildAnalysisPrompt(files, directoryTree, dependencyGraph);

  const response = await analyzeWithLlmValidated<DecisionResponse>(
    client,
    config,
    { systemPrompt: SYSTEM_PROMPT, userPrompt },
    decisionsResponseSchema,
    'analyze'
  );

  return response.decisions.map(toArchDecision);
}

/**
 * Multi-pass extraction for large codebases.
 * Splits files into groups by architectural area and analyzes each separately,
 * then merges and deduplicates results.
 */
async function extractDecisionsMultiPass(
  client: Anthropic,
  config: ArchGuardConfig,
  files: ParsedFile[],
  directoryTree: DirectoryNode,
  dependencyGraph?: DependencyGraph
): Promise<ArchDecision[]> {
  const groups = groupFilesByArea(files);
  const allDecisions: ArchDecision[] = [];

  for (const [area, areaFiles] of Object.entries(groups)) {
    const prompt = buildAnalysisPrompt(areaFiles, directoryTree, dependencyGraph, area);
    const inputTokens = estimateTokens(SYSTEM_PROMPT + prompt);

    // Skip if even a single area is too large — sample it
    if (inputTokens > MAX_PROMPT_TOKENS) {
      const sampled = selectRepresentativeSamples(areaFiles, MAX_SAMPLES_PER_REQUEST);
      const sampledPrompt = buildAnalysisPrompt(sampled, directoryTree, dependencyGraph, area);

      const response = await analyzeWithLlmValidated<DecisionResponse>(
        client,
        config,
        { systemPrompt: SYSTEM_PROMPT, userPrompt: sampledPrompt },
        decisionsResponseSchema,
        'analyze'
      );
      allDecisions.push(...response.decisions.map(toArchDecision));
    } else {
      const response = await analyzeWithLlmValidated<DecisionResponse>(
        client,
        config,
        { systemPrompt: SYSTEM_PROMPT, userPrompt: prompt },
        decisionsResponseSchema,
        'analyze'
      );
      allDecisions.push(...response.decisions.map(toArchDecision));
    }
  }

  return deduplicateDecisions(allDecisions);
}

// ─── Prompt Building ───────────────────────────────────────────────

function buildAnalysisPrompt(
  files: ParsedFile[],
  directoryTree: DirectoryNode,
  dependencyGraph?: DependencyGraph,
  areaFocus?: string
): string {
  const sections: string[] = [];

  // Few-shot example
  sections.push(FEW_SHOT_EXAMPLE);

  // Project overview
  const languages = [...new Set(files.map((f) => f.language))];
  const totalLines = files.reduce((sum, f) => sum + f.lineCount, 0);
  sections.push(`<project_overview>
Languages: ${languages.join(', ')}
Total files: ${files.length}
Total lines: ${totalLines}
${areaFocus ? `Analysis focus area: ${areaFocus}` : 'Full codebase analysis'}
</project_overview>`);

  // Directory structure
  const treeStr = formatDirectoryTree(directoryTree);
  sections.push(`<directory_structure>
${truncate(treeStr, 4000)}
</directory_structure>`);

  // File AST summaries
  const samples = selectRepresentativeSamples(files, MAX_SAMPLES_PER_REQUEST);
  const fileSummaries = samples.map((f) => {
    const parts = [
      `<file path="${f.filePath}" language="${f.language}" lines="${f.lineCount}">`,
    ];
    if (f.imports.length > 0) parts.push(`  <imports>${f.imports.join(', ')}</imports>`);
    if (f.exports.length > 0) parts.push(`  <exports>${f.exports.join(', ')}</exports>`);
    if (f.classes.length > 0) parts.push(`  <classes>${f.classes.join(', ')}</classes>`);
    if (f.interfaces && f.interfaces.length > 0) parts.push(`  <interfaces>${f.interfaces.join(', ')}</interfaces>`);
    if (f.functions.length > 0) parts.push(`  <functions>${f.functions.join(', ')}</functions>`);
    if (f.decorators.length > 0) parts.push(`  <decorators>${f.decorators.join(', ')}</decorators>`);

    // Include file content for architecturally significant files
    const content = readFileContent(f.filePath);
    if (content && calculateSignificance(f) > 6) {
      parts.push(`  <content>${truncate(content, MAX_SAMPLE_SIZE / MAX_SAMPLES_PER_REQUEST)}</content>`);
    }

    parts.push('</file>');
    return parts.join('\n');
  });

  sections.push(`<code_analysis>
${fileSummaries.join('\n\n')}
</code_analysis>`);

  // Dependency graph summary
  if (dependencyGraph) {
    const depSummary = buildDependencyContext(dependencyGraph);
    sections.push(`<dependency_analysis>
${depSummary}
</dependency_analysis>`);
  }

  // All file paths for context
  const allPaths = files.map((f) => f.filePath).join('\n');
  sections.push(`<all_file_paths>
${truncate(allPaths, 3000)}
</all_file_paths>`);

  sections.push(`<task>
Analyze this codebase and identify ALL architectural decisions. For each decision:
1. Think step-by-step about what evidence supports it
2. Determine if it's intentional (deliberate choice) or accidental (emerged without planning)
3. Assign calibrated confidence based on evidence strength
4. List specific constraints this decision imposes

Return your analysis as JSON matching the schema in the system prompt.
</task>`);

  return sections.join('\n\n');
}

function buildDependencyContext(graph: DependencyGraph): string {
  const parts: string[] = [];

  parts.push(`Total modules: ${graph.totalModules}`);
  parts.push(`Average coupling: ${graph.avgCoupling.toFixed(3)}`);
  parts.push(`Circular dependencies: ${graph.circularDeps.length}`);

  if (graph.circularDeps.length > 0) {
    parts.push('\nCircular dependency cycles:');
    for (const dep of graph.circularDeps.slice(0, 5)) {
      parts.push(`  ${dep.cycle.join(' -> ')}`);
    }
  }

  // Top coupled modules
  const topCoupled = [...graph.couplingScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (topCoupled.length > 0) {
    parts.push('\nHighest coupling scores:');
    for (const [file, score] of topCoupled) {
      const node = graph.nodes.get(file);
      if (node) {
        parts.push(`  ${file}: ${score.toFixed(3)} (imports: ${node.imports.length}, imported by: ${node.importedBy.length})`);
      }
    }
  }

  // Dependency flow patterns between top-level directories
  const layerDeps = new Map<string, Set<string>>();
  for (const [file, node] of graph.nodes) {
    const sourceDir = file.split('/').slice(0, 2).join('/');
    if (!layerDeps.has(sourceDir)) layerDeps.set(sourceDir, new Set());
    for (const imp of node.imports) {
      const targetDir = imp.split('/').slice(0, 2).join('/');
      if (targetDir !== sourceDir) {
        layerDeps.get(sourceDir)!.add(targetDir);
      }
    }
  }

  if (layerDeps.size > 0) {
    parts.push('\nModule-level dependency flow:');
    for (const [source, targets] of [...layerDeps.entries()].slice(0, 15)) {
      parts.push(`  ${source} -> ${[...targets].join(', ')}`);
    }
  }

  return parts.join('\n');
}

// ─── File Selection ────────────────────────────────────────────────

function selectRepresentativeSamples(files: ParsedFile[], max: number): ParsedFile[] {
  const scored = files.map((f) => ({ file: f, score: calculateSignificance(f) }));
  scored.sort((a, b) => b.score - a.score);

  // Ensure diversity: pick from different directories
  const selected: ParsedFile[] = [];
  const dirCounts = new Map<string, number>();

  for (const { file } of scored) {
    if (selected.length >= max) break;
    const dir = file.filePath.split('/').slice(0, -1).join('/');
    const count = dirCounts.get(dir) ?? 0;

    // Allow up to 3 from same directory
    if (count < 3) {
      selected.push(file);
      dirCounts.set(dir, count + 1);
    }
  }

  return selected;
}

function calculateSignificance(file: ParsedFile): number {
  let score = 0;

  // Config files
  if (/config|\.config\.|tsconfig/.test(file.filePath)) score += 5;

  // Entry points
  if (/index\.(ts|js)|main\.(ts|js)|app\.(ts|js)$/.test(file.filePath)) score += 3;

  // Decorators indicate framework patterns
  score += file.decorators.length * 2;

  // Exports indicate public API surface
  score += Math.min(file.exports.length, 5);

  // Imports indicate connectivity
  score += Math.min(file.imports.length / 3, 3);

  // Interfaces/abstract classes indicate design contracts
  score += (file.interfaces?.length ?? 0) * 2;
  score += (file.abstractClasses?.length ?? 0) * 3;

  // Architecturally significant naming
  const significantNames = [
    'controller', 'service', 'middleware', 'router', 'repository',
    'module', 'provider', 'factory', 'handler', 'gateway', 'guard',
    'interceptor', 'adapter', 'port', 'usecase',
  ];
  if (significantNames.some((n) =>
    file.filePath.toLowerCase().includes(n) ||
    file.classes.some((c) => c.toLowerCase().includes(n))
  )) {
    score += 4;
  }

  return score;
}

function readFileContent(filePath: string): string | null {
  try {
    const fs = require('node:fs');
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// ─── File Grouping ─────────────────────────────────────────────────

function groupFilesByArea(files: ParsedFile[]): Record<string, ParsedFile[]> {
  const groups: Record<string, ParsedFile[]> = {};

  for (const file of files) {
    const topDir = file.filePath.split('/')[0] || 'root';
    if (!groups[topDir]) groups[topDir] = [];
    groups[topDir].push(file);
  }

  return groups;
}

// ─── Result Transformation ─────────────────────────────────────────

function toArchDecision(d: DecisionResponse['decisions'][number]): ArchDecision {
  return {
    id: generateId(),
    title: d.title,
    description: d.description,
    category: d.category,
    status: 'detected',
    confidence: d.confidence,
    reasoning: d.reasoning,
    evidence: d.evidence.map((e) => ({
      filePath: e.filePath,
      lineRange: e.lineRange,
      snippet: e.snippet,
      explanation: e.explanation,
    })),
    constraints: d.constraints,
    relatedDecisions: [],
    detectedAt: now(),
    tags: d.tags,
  };
}

function deduplicateDecisions(decisions: ArchDecision[]): ArchDecision[] {
  const seen = new Map<string, ArchDecision>();

  for (const d of decisions) {
    const key = d.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const existing = seen.get(key);
    if (!existing || d.confidence > existing.confidence) {
      seen.set(key, d);
    }
  }

  return [...seen.values()];
}

// ─── Helpers ───────────────────────────────────────────────────────

function estimateInputSize(
  files: ParsedFile[],
  tree: DirectoryNode,
  graph?: DependencyGraph
): number {
  let estimate = estimateTokens(SYSTEM_PROMPT);
  estimate += estimateTokens(FEW_SHOT_EXAMPLE);
  estimate += estimateTokens(formatDirectoryTree(tree));

  for (const f of files.slice(0, MAX_SAMPLES_PER_REQUEST)) {
    estimate += estimateTokens(
      f.filePath + f.imports.join('') + f.exports.join('') + f.classes.join('') + f.functions.join('')
    );
  }

  if (graph) {
    estimate += graph.totalModules * 20;
  }

  return estimate;
}
