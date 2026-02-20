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

const MAX_PROMPT_TOKENS = 150_000;
// Reserve tokens for system prompt, few-shot, tree, dep summary, task instructions
const PROMPT_OVERHEAD_TOKENS = 8_000;
// Token budget available for file content in the prompt
const FILE_CONTENT_BUDGET_TOKENS = MAX_PROMPT_TOKENS - PROMPT_OVERHEAD_TOKENS;

/** Content tiers determine how much of a file the LLM sees */
type ContentTier = 'full' | 'summary';

interface ScoredFile {
  file: ParsedFile;
  score: number;
  tier: ContentTier;
  /** Estimated tokens this file will consume in the prompt */
  tokenCost: number;
  /** Why this file scored high — useful for debugging */
  scoreBreakdown: Record<string, number>;
  /** Estimated tokens for full file content */
  contentTokens: number;
  /** Estimated tokens for summary-only representation */
  summaryTokens: number;
}

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
 *
 * Strategy:
 * 1. Score all files and determine which ones deserve full content
 * 2. If everything fits in one call — do one call
 * 3. If not — split high-value files into batches, each getting a full
 *    LLM call with the shared context (tree, dep graph) plus its batch
 *    of full-content files + summaries of everything else
 * 4. Merge and deduplicate across all calls
 *
 * This ensures every architecturally significant file gets its full
 * content seen by Opus, even if that requires multiple calls.
 */
export async function extractDecisions(
  client: Anthropic,
  config: ArchGuardConfig,
  files: ParsedFile[],
  directoryTree: DirectoryNode,
  dependencyGraph?: DependencyGraph
): Promise<ArchDecision[]> {
  // Score all files upfront so we can plan the call strategy
  const allScored = files.map((f) => {
    const { score, breakdown } = calculateSignificance(f, dependencyGraph);
    const content = readFileContent(f.filePath);
    const cTokens = content ? estimateTokens(content) : 0;
    const sTokens = estimateFileSummaryTokens(f);
    return {
      file: f,
      score,
      tier: 'summary' as ContentTier,
      tokenCost: sTokens,
      scoreBreakdown: breakdown,
      contentTokens: cTokens,
      summaryTokens: sTokens,
    };
  });
  allScored.sort((a, b) => b.score - a.score);

  // Separate files that deserve full content (score >= 4) from summary-only
  const fullCandidates = allScored.filter((s) => s.score >= 4 && s.contentTokens > 0);
  const summaryOnly = allScored.filter((s) => s.score < 4 || s.contentTokens === 0);

  // Calculate shared overhead: tree, dep summary, file paths, system prompt, etc.
  const treeStr = formatDirectoryTree(directoryTree);
  const depSummary = dependencyGraph ? buildDependencyContext(dependencyGraph) : '';
  const allPaths = files.map((f) => f.filePath).join('\n');
  const sharedOverhead =
    PROMPT_OVERHEAD_TOKENS +
    estimateTokens(treeStr) +
    estimateTokens(depSummary) +
    estimateTokens(allPaths) +
    summaryOnly.reduce((sum, s) => sum + s.summaryTokens, 0);

  // How many tokens are available per call for full-content files?
  const budgetPerCall = FILE_CONTENT_BUDGET_TOKENS - sharedOverhead;

  // Greedily pack full-content files into batches
  const batches: ScoredFile[][] = [];
  let currentBatch: ScoredFile[] = [];
  let currentBatchTokens = 0;

  for (const entry of fullCandidates) {
    const cost = entry.contentTokens + entry.summaryTokens;
    if (currentBatchTokens + cost > budgetPerCall && currentBatch.length > 0) {
      // Current batch is full — start a new one
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchTokens = 0;
    }
    entry.tier = 'full';
    entry.tokenCost = cost;
    currentBatch.push(entry);
    currentBatchTokens += cost;
  }
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  // If no full-content files, still do at least one call with summaries
  if (batches.length === 0) {
    batches.push([]);
  }

  // Execute LLM calls — one per batch
  const allDecisions: ArchDecision[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchLabel = batches.length > 1 ? `batch ${i + 1}/${batches.length}` : undefined;

    // Build the file selection for this call: batch's full-content files + all summaries
    const callFiles: ScoredFile[] = [
      ...batch,
      ...summaryOnly.map((s) => ({ ...s, tier: 'summary' as ContentTier })),
      // Also include full candidates NOT in this batch as summaries
      ...fullCandidates
        .filter((s) => !batch.includes(s))
        .map((s) => ({ ...s, tier: 'summary' as ContentTier, tokenCost: s.summaryTokens })),
    ];

    const userPrompt = buildAnalysisPromptFromScored(
      callFiles,
      files,
      directoryTree,
      dependencyGraph,
      batchLabel
    );

    const response = await analyzeWithLlmValidated<DecisionResponse>(
      client,
      config,
      { systemPrompt: SYSTEM_PROMPT, userPrompt },
      decisionsResponseSchema,
      'analyze'
    );
    allDecisions.push(...response.decisions.map(toArchDecision));
  }

  return batches.length > 1 ? deduplicateDecisions(allDecisions) : allDecisions;
}

// ─── Prompt Building ───────────────────────────────────────────────

/**
 * Build the analysis prompt from pre-scored files.
 * This is the core prompt builder used by the main extraction flow.
 */
function buildAnalysisPromptFromScored(
  scoredFiles: ScoredFile[],
  allFiles: ParsedFile[],
  directoryTree: DirectoryNode,
  dependencyGraph?: DependencyGraph,
  batchLabel?: string
): string {
  const sections: string[] = [];

  // Few-shot example
  sections.push(FEW_SHOT_EXAMPLE);

  // Project overview
  const languages = [...new Set(allFiles.map((f) => f.language))];
  const totalLines = allFiles.reduce((sum, f) => sum + f.lineCount, 0);
  sections.push(`<project_overview>
Languages: ${languages.join(', ')}
Total files: ${allFiles.length}
Total lines: ${totalLines}
${batchLabel ? `Analysis pass: ${batchLabel} (results will be merged across passes)` : 'Full codebase analysis'}
</project_overview>`);

  // Directory structure
  const treeStr = formatDirectoryTree(directoryTree);
  const treeTokens = estimateTokens(treeStr);
  const maxTreeTokens = 10_000;
  sections.push(`<directory_structure>
${treeTokens > maxTreeTokens ? truncate(treeStr, maxTreeTokens * 4) : treeStr}
</directory_structure>`);

  // Build file sections with tiered content
  const fullContentFiles: string[] = [];
  const summaryFiles: string[] = [];

  for (const entry of scoredFiles) {
    const f = entry.file;
    const parts = [
      `<file path="${f.filePath}" language="${f.language}" lines="${f.lineCount}" tier="${entry.tier}" significance="${entry.score}">`,
    ];
    if (f.imports.length > 0) parts.push(`  <imports>${f.imports.join(', ')}</imports>`);
    if (f.exports.length > 0) parts.push(`  <exports>${f.exports.join(', ')}</exports>`);
    if (f.classes.length > 0) parts.push(`  <classes>${f.classes.join(', ')}</classes>`);
    if (f.interfaces && f.interfaces.length > 0) parts.push(`  <interfaces>${f.interfaces.join(', ')}</interfaces>`);
    if (f.functions.length > 0) parts.push(`  <functions>${f.functions.join(', ')}</functions>`);
    if (f.decorators.length > 0) parts.push(`  <decorators>${f.decorators.join(', ')}</decorators>`);

    if (entry.tier === 'full') {
      const content = readFileContent(f.filePath);
      if (content) {
        parts.push(`  <content>\n${content}\n  </content>`);
      }
    }

    parts.push('</file>');
    const fileXml = parts.join('\n');

    if (entry.tier === 'full') {
      fullContentFiles.push(fileXml);
    } else {
      summaryFiles.push(fileXml);
    }
  }

  // Present full-content files first (most important for LLM reasoning)
  const allFileSections = [...fullContentFiles, ...summaryFiles];
  const fullCount = fullContentFiles.length;
  const summaryCount = summaryFiles.length;
  sections.push(`<code_analysis files_with_full_content="${fullCount}" files_with_summary="${summaryCount}" total_project_files="${allFiles.length}">
${allFileSections.join('\n\n')}
</code_analysis>`);

  // Dependency graph summary
  if (dependencyGraph) {
    const depSummary = buildDependencyContext(dependencyGraph);
    sections.push(`<dependency_analysis>
${depSummary}
</dependency_analysis>`);
  }

  // All file paths for context
  const allPaths = allFiles.map((f) => f.filePath).join('\n');
  sections.push(`<all_file_paths>
${allPaths}
</all_file_paths>`);

  sections.push(`<task>
Analyze this codebase and identify ALL architectural decisions. For each decision:
1. Think step-by-step about what evidence supports it
2. Determine if it's intentional (deliberate choice) or accidental (emerged without planning)
3. Assign calibrated confidence based on evidence strength
4. List specific constraints this decision imposes

You have full source code for ${fullCount} architecturally significant files and structural summaries for ${summaryCount} more. Use the full source code to identify concrete patterns, and the summaries + dependency graph + directory structure to identify broader architectural decisions across the codebase.

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

// ─── File Scoring ───────────────────────────────────────────────────

/**
 * Calculate architectural significance of a file using both static
 * heuristics and dependency graph topology.
 *
 * Returns a score object with breakdown for debuggability.
 */
function calculateSignificance(
  file: ParsedFile,
  graph?: DependencyGraph
): { score: number; breakdown: Record<string, number> } {
  const b: Record<string, number> = {};

  // ── 1. Graph-derived signals (strongest indicators) ────────────

  if (graph) {
    const node = graph.nodes.get(file.filePath);
    if (node) {
      const fanIn = node.importedBy.length;
      const fanOut = node.imports.length;

      // Hub detection: files imported by many others are architectural anchors
      // Scale: 1pt per importer, capped at 15. A file imported by 10+ modules
      // is almost certainly architecturally significant.
      b.fanIn = Math.min(fanIn, 15);

      // Connector detection: files that import many others are integration points
      b.fanOut = Math.min(Math.floor(fanOut / 2), 6);

      // Cross-boundary imports: if this file is imported from multiple
      // top-level directories, it's a shared boundary/contract
      const importerAreas = new Set(
        node.importedBy.map((p: string) => p.split('/')[0])
      );
      if (importerAreas.size >= 3) b.crossBoundary = 8;
      else if (importerAreas.size === 2) b.crossBoundary = 4;

      // Circular dependency membership: files in cycles are architecturally
      // interesting (either intentional patterns or problems to surface)
      const inCycle = graph.circularDeps.some((c) =>
        c.files.includes(file.filePath)
      );
      if (inCycle) b.circularDep = 5;

      // High instability with high fan-in = fragile hub (important to see)
      const metrics = graph.couplingMetrics.get(file.filePath);
      if (metrics) {
        if (metrics.instability > 0.7 && fanIn >= 3) b.fragileHub = 4;
        // Low distance from main sequence = well-designed module
        if (metrics.distanceFromMainSequence < 0.2 && fanIn >= 2) b.wellDesigned = 2;
      }
    }
  }

  // ── 2. Structural role detection ───────────────────────────────

  const lowerPath = file.filePath.toLowerCase();
  const fileName = lowerPath.split('/').pop() ?? '';

  // Config/setup files define architectural constraints
  if (/(?:^|\/)(?:tsconfig|jest\.config|vite\.config|webpack\.config|\.eslintrc|rollup\.config|next\.config|nuxt\.config|tailwind\.config|docker-compose|\.env\.example|babel\.config|vitest\.config)/.test(lowerPath) ||
      /\.config\.(ts|js|mjs|cjs)$/.test(fileName)) {
    b.config = 6;
  }

  // Entry points / bootstrap files wire the application together
  if (/(?:^|\/)(?:main|app|server|index)\.(ts|js|tsx|jsx|py|go|rs|java)$/.test(fileName)) {
    b.entryPoint = 4;
  }

  // Schema/migration files define data architecture
  if (/(?:schema|migration|seed|model|entity|prisma\.schema)/.test(lowerPath)) {
    b.dataLayer = 4;
  }

  // Infrastructure files
  if (/(?:dockerfile|docker-compose|terraform|\.github\/|\.circleci|jenkinsfile|k8s|helm)/i.test(lowerPath)) {
    b.infrastructure = 3;
  }

  // ── 3. Code structure signals ──────────────────────────────────

  // Decorators indicate framework patterns (NestJS, Angular, Spring, etc.)
  if (file.decorators.length > 0) {
    b.decorators = Math.min(file.decorators.length * 2, 8);
  }

  // Interfaces and abstract classes define contracts
  const interfaceCount = file.interfaces?.length ?? 0;
  const abstractCount = file.abstractClasses?.length ?? 0;
  if (interfaceCount > 0 || abstractCount > 0) {
    b.contracts = Math.min(interfaceCount * 2 + abstractCount * 3, 10);
  }

  // Public API surface
  if (file.exports.length > 0) {
    b.exports = Math.min(file.exports.length, 6);
  }

  // ── 4. Architectural naming patterns ───────────────────────────

  // Check file path AND class/function names for role indicators
  const allNames = [
    lowerPath,
    ...file.classes.map((c: string) => c.toLowerCase()),
    ...file.functions.map((fn: string) => fn.toLowerCase()),
  ].join(' ');

  const namingPatterns: Array<{ names: string[]; points: number }> = [
    // Backend architectural roles
    { names: ['controller', 'router', 'endpoint', 'route', 'resolver'], points: 5 },
    { names: ['service', 'usecase', 'use-case', 'interactor', 'command-handler'], points: 5 },
    { names: ['repository', 'dao', 'data-source', 'datasource'], points: 5 },
    { names: ['middleware', 'interceptor', 'guard', 'pipe', 'filter'], points: 4 },
    { names: ['gateway', 'adapter', 'port', 'client', 'connector'], points: 4 },
    { names: ['factory', 'builder', 'provider', 'registry', 'container'], points: 4 },
    { names: ['module', 'plugin', 'extension'], points: 3 },
    // Frontend architectural roles
    { names: ['component', 'page', 'view', 'screen', 'layout'], points: 3 },
    { names: ['hook', 'composable', 'use-'], points: 3 },
    { names: ['store', 'reducer', 'slice', 'atom', 'signal', 'state'], points: 4 },
    { names: ['context', 'provider'], points: 3 },
    // Event/messaging patterns
    { names: ['event', 'listener', 'subscriber', 'handler', 'saga', 'effect'], points: 3 },
    { names: ['queue', 'worker', 'job', 'consumer', 'producer'], points: 3 },
    // Auth/security
    { names: ['auth', 'permission', 'policy', 'rbac', 'acl'], points: 4 },
  ];

  let namingScore = 0;
  for (const { names, points } of namingPatterns) {
    if (names.some((n) => allNames.includes(n))) {
      namingScore = Math.max(namingScore, points);
    }
  }
  if (namingScore > 0) b.naming = namingScore;

  // ── 5. Barrel file detection (lower value — re-exports, not logic) ─

  const isBarrel = fileName.startsWith('index.') &&
    file.exports.length > 3 &&
    file.functions.length === 0 &&
    file.classes.length === 0;
  if (isBarrel) {
    // Barrel files are useful for understanding module boundaries but
    // contain no logic. Cap their score — they shouldn't displace real files.
    b.barrel = -5;
  }

  const score = Object.values(b).reduce((sum, v) => sum + v, 0);
  return { score, breakdown: b };
}

function estimateFileSummaryTokens(file: ParsedFile): number {
  // Estimate tokens for the XML metadata (path, language, imports, exports, etc.)
  const parts = [
    file.filePath,
    file.language,
    file.imports.join(', '),
    file.exports.join(', '),
    file.classes.join(', '),
    (file.interfaces ?? []).join(', '),
    file.functions.join(', '),
    file.decorators.join(', '),
  ];
  return estimateTokens(parts.join(' ')) + 20; // +20 for XML tags
}

function readFileContent(filePath: string): string | null {
  try {
    const fs = require('node:fs');
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
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
    evidence: d.evidence.map((e: { filePath: string; lineRange: [number, number]; snippet: string; explanation: string }) => ({
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

