/**
 * @snoutguard/mcp-server - MCP server entrypoint
 *
 * Creates an MCP server that exposes architectural decisions, compliance
 * checking, guidance, and dependency information to AI coding agents.
 *
 * Supports three transports:
 * - stdio: For Claude Code, Cursor, and other MCP-compatible tools (default)
 * - sse: Legacy HTTP+SSE transport (deprecated protocol version 2024-11-05)
 * - streamable-http: Modern Streamable HTTP transport with resumability
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  loadConfig,
  initializeDatabase,
  findProjectRoot,
  type SnoutGuardConfig,
  type DbClient,
} from '@snoutguard/core';

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

export type TransportType = 'stdio' | 'sse' | 'streamable-http';

/**
 * Start the SnoutGuard MCP server.
 *
 * @param options.projectDir - Root directory of the project to analyze (defaults to cwd)
 * @param options.dbPath - Path to the SQLite database
 * @param options.transport - Transport type: 'stdio' (default), 'sse', or 'streamable-http'
 * @param options.port - Port for SSE/HTTP transports (default 3100)
 * @param options.host - Host for SSE/HTTP transports (default '127.0.0.1')
 */
export async function startMcpServer(options: {
  projectDir?: string;
  dbPath?: string;
  transport?: TransportType | string;
  port?: number;
  host?: string;
} = {}): Promise<void> {
  const projectDir = options.projectDir ?? findProjectRoot(process.cwd());
  const config = loadConfig(projectDir);
  const db = initializeDatabase(options.dbPath);
  const transport = (options.transport ?? 'stdio') as TransportType;
  const port = options.port ?? 3100;
  const host = options.host ?? '127.0.0.1';

  switch (transport) {
    case 'stdio':
      return startStdioServer(db, config);
    case 'sse':
      return startSseServer(db, config, port, host);
    case 'streamable-http':
      return startStreamableHttpServer(db, config, port, host);
    default:
      throw new Error(`Unsupported transport: ${transport}. Use 'stdio', 'sse', or 'streamable-http'.`);
  }
}

// ─── stdio transport ─────────────────────────────────────────────

async function startStdioServer(db: DbClient, config: SnoutGuardConfig): Promise<void> {
  const server = createMcpServer(db, config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// ─── SSE transport (deprecated but widely supported) ─────────────

async function startSseServer(
  db: DbClient,
  config: SnoutGuardConfig,
  port: number,
  host: string,
): Promise<void> {
  const app = createMcpExpressApp({ host });

  // Store transports by session ID
  const transports: Record<string, SSEServerTransport> = {};

  // GET /sse — establish SSE stream
  app.get('/sse', async (req: any, res: any) => {
    try {
      const transport = new SSEServerTransport('/messages', res);
      const sessionId = transport.sessionId;
      transports[sessionId] = transport;

      transport.onclose = () => {
        delete transports[sessionId];
      };

      const server = createMcpServer(db, config);
      await server.connect(transport);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).send('Error establishing SSE stream');
      }
    }
  });

  // POST /messages — receive client JSON-RPC requests
  app.post('/messages', async (req: any, res: any) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      res.status(400).send('Missing sessionId parameter');
      return;
    }

    const transport = transports[sessionId];
    if (!transport) {
      res.status(404).send('Session not found');
      return;
    }

    try {
      await transport.handlePostMessage(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).send('Error handling request');
      }
    }
  });

  return new Promise((resolve) => {
    app.listen(port, () => {
      console.log(`SnoutGuard MCP Server (SSE) listening on http://${host}:${port}`);
      console.log(`  SSE endpoint:      GET  http://${host}:${port}/sse`);
      console.log(`  Messages endpoint: POST http://${host}:${port}/messages`);
      resolve();
    });

    const shutdown = async () => {
      for (const sessionId in transports) {
        try {
          await transports[sessionId].close();
          delete transports[sessionId];
        } catch (_e) { /* ignore */ }
      }
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}

// ─── Streamable HTTP transport (modern, resumable) ───────────────

async function startStreamableHttpServer(
  db: DbClient,
  config: SnoutGuardConfig,
  port: number,
  host: string,
): Promise<void> {
  const app = createMcpExpressApp({ host });

  // Store transports by session ID
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // POST /mcp — handle JSON-RPC requests
  app.post('/mcp', async (req: any, res: any) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid: string) => {
            transports[sid] = transport;
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            delete transports[sid];
          }
        };

        const server = createMcpServer(db, config);
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // GET /mcp — SSE stream for server-to-client notifications
  app.get('/mcp', async (req: any, res: any) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  // DELETE /mcp — session termination
  app.delete('/mcp', async (req: any, res: any) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    try {
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  });

  return new Promise((resolve) => {
    app.listen(port, () => {
      console.log(`SnoutGuard MCP Server (Streamable HTTP) listening on http://${host}:${port}`);
      console.log(`  MCP endpoint: http://${host}:${port}/mcp`);
      console.log(`  Supports: POST (requests), GET (SSE stream), DELETE (session end)`);
      resolve();
    });

    const shutdown = async () => {
      for (const sessionId in transports) {
        try {
          await transports[sessionId].close();
          delete transports[sessionId];
        } catch (_e) { /* ignore */ }
      }
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}

// ─── Server factory ──────────────────────────────────────────────

/**
 * Create and configure the MCP server instance.
 * Registers all tools and resources.
 */
function createMcpServer(db: DbClient, config: SnoutGuardConfig): McpServer {
  const server = new McpServer({
    name: 'snoutguard',
    version: '0.1.0',
  });

  registerTools(server, db, config);
  registerResources(server, db);

  return server;
}

/**
 * Register all MCP tools on the server.
 */
function registerTools(
  server: McpServer,
  db: DbClient,
  config: SnoutGuardConfig
): void {
  server.tool(
    'get_architectural_decisions',
    'Retrieve architectural decisions filtered by query and optional category. ' +
    'Searches across file paths, titles, tags, and descriptions.',
    {
      query: z.string().describe('Search query to filter decisions.'),
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
                  decisions: decisions.map((d: any) => ({
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
          content: [{ type: 'text' as const, text: `Error retrieving decisions: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'check_architectural_compliance',
    'Check code against architectural decisions and constraints.',
    {
      code: z.string().describe('The code to check for architectural compliance.'),
      filePath: z.string().describe('The file path of the code being checked.'),
      intent: z.string().optional().describe('Optional description of what the code is intended to do.'),
    },
    async (input: CheckPatternInput) => {
      try {
        const result = await executeCheckPattern(db, input, config);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  compliant: result.compliant,
                  totalViolations: result.violations.length,
                  violations: result.violations.map((v: any) => ({
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
          content: [{ type: 'text' as const, text: `Error checking compliance: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'get_architectural_guidance',
    'Get architectural guidance for a task. Returns relevant decisions, constraints, and code examples.',
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
                  relevantDecisions: guidance.relevantDecisions.map((d: any) => ({
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
          content: [{ type: 'text' as const, text: `Error generating guidance: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'get_dependency_graph',
    'Get the dependency subgraph for a module or file.',
    {
      target: z.string().describe('The module or file path to get the dependency graph for.'),
      depth: z.number().default(2).describe('Maximum depth of dependencies to traverse.'),
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
                  nodes: result.nodes.map((n: any) => ({
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
          content: [{ type: 'text' as const, text: `Error retrieving dependency graph: ${error instanceof Error ? error.message : String(error)}` }],
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
  server.resource(
    'decisions-list',
    'snoutguard://decisions',
    { description: 'Full list of all architectural decisions.', mimeType: 'application/json' },
    async () => ({
      contents: [{ uri: 'snoutguard://decisions', text: await getDecisionsResource(db), mimeType: 'application/json' }],
    })
  );

  server.resource(
    'decision-by-id',
    new ResourceTemplate('snoutguard://decisions/{id}', { list: undefined }),
    { description: 'Individual architectural decision by ID.', mimeType: 'application/json' },
    async (uri: any, params: any) => {
      const id = String(params.id);
      return {
        contents: [{ uri: uri.href, text: await getDecisionByIdResource(db, id), mimeType: 'application/json' }],
      };
    }
  );

  server.resource(
    'constraints-list',
    'snoutguard://constraints',
    { description: 'All architectural constraints from all decisions.', mimeType: 'application/json' },
    async () => ({
      contents: [{ uri: 'snoutguard://constraints', text: await getConstraintsResource(db), mimeType: 'application/json' }],
    })
  );

  server.resource(
    'patterns-summary',
    'snoutguard://patterns',
    { description: 'Summary of all detected architectural patterns.', mimeType: 'application/json' },
    async () => ({
      contents: [{ uri: 'snoutguard://patterns', text: await getPatternsResource(db), mimeType: 'application/json' }],
    })
  );

  server.resource(
    'module-dependencies',
    new ResourceTemplate('snoutguard://dependencies/{module}', { list: undefined }),
    { description: 'Dependency information for a specific module.', mimeType: 'application/json' },
    async (uri: any, params: any) => {
      const module = String(params.module);
      return {
        contents: [{ uri: uri.href, text: await getDependenciesResource(db, module), mimeType: 'application/json' }],
      };
    }
  );
}

// ─── CLI Entrypoint ──────────────────────────────────────────────

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
