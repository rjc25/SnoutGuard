/**
 * `snoutguard serve` command.
 * Starts the MCP (Model Context Protocol) server for integration
 * with AI coding assistants.
 *
 * Supports three transport modes:
 * - stdio: For Claude Code, Cursor, and other local MCP clients (default)
 * - sse: Legacy HTTP+SSE transport (GET /sse + POST /messages)
 * - streamable-http: Modern Streamable HTTP transport (POST/GET/DELETE /mcp)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'node:path';
import { loadConfig, findProjectRoot } from '@snoutguard/core';

const VALID_TRANSPORTS = ['stdio', 'sse', 'streamable-http'] as const;
type TransportType = typeof VALID_TRANSPORTS[number];

export function registerServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start the SnoutGuard MCP server')
    .option(
      '--transport <transport>',
      'Transport method: stdio, sse, or streamable-http',
      'stdio'
    )
    .option('--port <number>', 'Port for SSE/HTTP transports', '3100')
    .option('--host <host>', 'Host to bind to for SSE/HTTP transports', '127.0.0.1')
    .option('--path <dir>', 'Project directory', '.')
    .action(
      async (options: {
        transport: string;
        port: string;
        host: string;
        path: string;
      }) => {
        const projectDir = path.resolve(options.path);
        const config = loadConfig(projectDir);
        const port = parseInt(options.port, 10) || 3100;
        const host = options.host;
        const transport = options.transport as TransportType;

        if (!VALID_TRANSPORTS.includes(transport)) {
          console.error(
            chalk.red(
              `\n  Invalid transport: "${options.transport}". ` +
              `Valid options: ${VALID_TRANSPORTS.join(', ')}\n`
            )
          );
          process.exit(1);
        }

        try {
          const { startMcpServer } = await import('@snoutguard/mcp-server');

          if (transport !== 'stdio') {
            console.log(chalk.bold('\n  🏗  SnoutGuard MCP Server\n'));
            console.log(chalk.gray(`  Transport: ${transport}`));
            console.log(chalk.gray(`  Host:      ${host}`));
            console.log(chalk.gray(`  Port:      ${port}`));
            console.log(chalk.gray(`  Project:   ${projectDir}`));
            console.log('');
          }

          await startMcpServer({
            transport,
            projectDir,
            port,
            host,
          });

          // For stdio, the server handles I/O directly and blocks.
          // For SSE/HTTP, the listen callback already printed the URLs.
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`\n  Failed to start MCP server: ${message}\n`));
          process.exit(1);
        }
      }
    );
}
