/**
 * @archguard/mcp-server - MCP server entrypoint
 *
 * Creates an MCP server that exposes architectural decisions, compliance
 * checking, guidance, and dependency information to AI coding agents.
 *
 * Supports stdio transport for compatibility with Claude Code, Cursor,
 * and other MCP-compatible AI coding tools.
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  loadConfig,
  initializeDatabase,
  findProjectRoot,
  type ArchGuardConfig,
  type DbClient,
} from '@archguard/core';

// Tools
import {
  executeGetDecisions,
  type GetDecisionsInput,
} from './tools/get-decisions.js';
import {
  executeCheckPattern,
  type CheckPatternInput,
} from './tools/check-pattern.js';
import {
  executeSuggestApproach,
  type SuggestApproachInput,
} from './tools/suggest-approach.js';
import {
  executeGetDependencies,
  type GetDependenciesInput,
} from './tools/get-dependencies.js';

// Resources
import {
  getDecisionsResource,
  getDecisionByIdResource,
  getConstraintsResource,
} from './resources/decisions.js';
import {
  getPatternsResource,
  getDependenciesResource,
} from './resources/patterns.js';

/**
 * Start the ArchGuard MCP server.
 *
 * @param options - Configuration options for the server
 * @param options.projectDir - Root directory of the project to analyze (defaults to cwd)
 * @param options.dbPath - Path to the SQLite database (defaults to ~/.archguard/archguard.db)
 * @param options.transport - Transport type: 'stdio' (default)
 */
export async function startMcpServer(options: {
  projectDir?: string;
  dbPath?: string;
  transport?: 'stdio';
} = {}): Promise<void> {
  const projectDir = options.projectDir ?? findProjectRoot(process.cwd());
  const config = loadConfig(projectDir);
  const db = initializeDatabase(options.dbPath);

  const server = createMcpServer(db, config);

  // Connect via stdio transport (primary transport for Claude Code/Cursor)
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * Create and configure the MCP server instance.
 * Registers all tools and resources.
 */
function createMcpServer(db: DbClient, config: ArchGuardConfig): McpServer {
  const server = new McpServer({
    name: 'archguard',
    version: '0.1.0',
  });

  // ─── Register Tools ──────────────────────────────────────────────

  registerTools(server, db, config);

  // ─── Register Resources ──────────────────────────────────────────

  registerResources(server, db);

  return server;
}

/**
 * Register all MCP tools on the server.
 */
function registerTools(
  server: McpServer,
  db: DbClient,
  config: ArchGuardConfig
): void {
  // Tool: get_architectural_decisions
  server.tool(
    'get_architectural_decisions',
    'Retrieve architectural decisions filtered by query and optional category. ' +
    'Searches across file paths, titles, tags, and descriptions.',
    {
      query: z.string().describe('Search query to filter decisions. Matches against file paths, titles, tags, and descriptions.'),
      category: z.enum(['structural', 'behavioral', 'deployment', 'data', 'api', 'testing', 'security']).optional().describe('Optional category filter.'),
    },
    async (input: GetDecisionsInput) => {
      try {
        const decisions = await executeGetDecisions(db, input);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  totalResults: decisions.length,
                  decisions: decisions.map((d) => ({
                    id: d.id,
                    title: d.title,
                    description: d.description,
                    category: d.category,
                    status: d.status,
                    confidence: d.confidence,
                    tags: d.tags,
                    constraints: d.constraints,
                    evidenceCount: d.evidence.length,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error retrieving decisions: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: check_architectural_compliance
  server.tool(
    'check_architectural_compliance',
    'Check code against architectural decisions and constraints. ' +
    'Returns compliance result with any violations found.',
    {
      code: z.string().describe('The code to check for architectural compliance.'),
      filePath: z.string().describe('The file path of the code being checked.'),
      intent: z.string().optional().describe('Optional description of what the code is intended to do.'),
    },
    async (input: CheckPatternInput) => {
      try {
        const result = await executeCheckPattern(db, input, config.rules);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  compliant: result.compliant,
                  totalViolations: result.violations.length,
                  violations: result.violations.map((v) => ({
                    rule: v.rule,
                    severity: v.severity,
                    message: v.message,
                    filePath: v.filePath,
                    lineStart: v.lineStart,
                    lineEnd: v.lineEnd,
                    suggestion: v.suggestion,
                  })),
                  suggestions: result.suggestions,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error checking compliance: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: get_architectural_guidance
  server.tool(
    'get_architectural_guidance',
    'Get architectural guidance for a task. Returns relevant decisions, ' +
    'constraints, and code examples to follow.',
    {
      task: z.string().describe('Description of the task or feature being implemented.'),
      constraints: z.array(z.string()).optional().describe('Optional additional constraints to consider.'),
    },
    async (input: SuggestApproachInput) => {
      try {
        const guidance = await executeSuggestApproach(db, input);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  approach: guidance.approach,
                  relevantDecisions: guidance.relevantDecisions.map((d) => ({
                    id: d.id,
                    title: d.title,
                    category: d.category,
                    confidence: d.confidence,
                    constraints: d.constraints,
                  })),
                  constraints: guidance.constraints,
                  examples: guidance.examples,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error generating guidance: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: get_dependency_graph
  server.tool(
    'get_dependency_graph',
    'Get the dependency subgraph for a module or file. ' +
    'Shows imports, importedBy, and circular dependencies.',
    {
      target: z.string().describe('The module or file path to get the dependency graph for.'),
      depth: z.number().default(2).describe('Maximum depth of dependencies to traverse. Defaults to 2.'),
    },
    async (input: GetDependenciesInput) => {
      try {
        const result = await executeGetDependencies(db, input);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  target: result.target,
                  resolvedTarget: result.resolvedTarget,
                  depth: result.depth,
                  totalNodes: result.nodes.length,
                  totalEdges: result.totalEdges,
                  nodes: result.nodes.map((n) => ({
                    filePath: n.filePath,
                    imports: n.imports,
                    importedBy: n.importedBy,
                  })),
                  circularDependencies: result.circularDependencies,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error retrieving dependency graph: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

/**
 * Register all MCP resources on the server.
 */
function registerResources(server: McpServer, db: DbClient): void {
  // Resource: archguard://decisions - Full list of decisions
  server.resource(
    'decisions-list',
    'archguard://decisions',
    {
      description: 'Full list of all architectural decisions detected in the codebase.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'archguard://decisions',
          text: await getDecisionsResource(db),
          mimeType: 'application/json',
        },
      ],
    })
  );

  // Resource template: archguard://decisions/{id} - Individual decision
  server.resource(
    'decision-by-id',
    new ResourceTemplate('archguard://decisions/{id}', { list: undefined }),
    {
      description: 'Individual architectural decision by ID.',
      mimeType: 'application/json',
    },
    async (uri, params) => {
      const id = String(params.id);
      return {
        contents: [
          {
            uri: uri.href,
            text: await getDecisionByIdResource(db, id),
            mimeType: 'application/json',
          },
        ],
      };
    }
  );

  // Resource: archguard://constraints - All constraints
  server.resource(
    'constraints-list',
    'archguard://constraints',
    {
      description: 'All architectural constraints from all decisions.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'archguard://constraints',
          text: await getConstraintsResource(db),
          mimeType: 'application/json',
        },
      ],
    })
  );

  // Resource: archguard://patterns - Detected patterns summary
  server.resource(
    'patterns-summary',
    'archguard://patterns',
    {
      description: 'Summary of all detected architectural patterns and their categories.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'archguard://patterns',
          text: await getPatternsResource(db),
          mimeType: 'application/json',
        },
      ],
    })
  );

  // Resource template: archguard://dependencies/{module} - Dependency info
  server.resource(
    'module-dependencies',
    new ResourceTemplate('archguard://dependencies/{module}', { list: undefined }),
    {
      description: 'Dependency information for a specific module or file.',
      mimeType: 'application/json',
    },
    async (uri, params) => {
      const module = String(params.module);
      return {
        contents: [
          {
            uri: uri.href,
            text: await getDependenciesResource(db, module),
            mimeType: 'application/json',
          },
        ],
      };
    }
  );
}

// ─── CLI Entrypoint ──────────────────────────────────────────────────

// When run directly (not imported), start the server with stdio transport
const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('/mcp-server/src/index.ts') ||
   process.argv[1].endsWith('/mcp-server/dist/index.js'));

if (isMainModule) {
  startMcpServer().catch((error) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });
}
