/**
 * `archguard serve` command.
 * Starts the MCP (Model Context Protocol) server for integration
 * with AI coding assistants.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'node:path';
import { loadConfig, findProjectRoot } from '@archguard/core';

export function registerServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start the ArchGuard MCP server')
    .option('--transport <transport>', 'Transport method: stdio or sse', 'stdio')
    .option('--port <number>', 'Port for SSE transport', '3100')
    .option('--path <dir>', 'Project directory', '.')
    .action(
      async (options: {
        transport: string;
        port: string;
        path: string;
      }) => {
        const projectDir = path.resolve(options.path);
        const config = loadConfig(projectDir);
        const port = parseInt(options.port, 10) || 3100;

        const transport = options.transport;
        if (transport !== 'stdio') {
          console.error(
            chalk.red(`\n  Invalid transport: ${options.transport}. Only "stdio" is currently supported.\n`)
          );
          process.exit(1);
        }

        try {
          const { startMcpServer } = await import('@archguard/mcp-server');

          await startMcpServer({
            transport,
            projectDir,
          });

          // For stdio transport, the server handles I/O directly
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`\n  Failed to start MCP server: ${message}\n`));
          process.exit(1);
        }
      }
    );
}
