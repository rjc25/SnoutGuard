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

        const spinner: ReturnType<typeof ora> | null = null;

        try {
          const { startMcpServer } = await import('@archguard/mcp-server');

          await startMcpServer({
            transport,
            projectDir,
          });

          if (spinner) {
            spinner.succeed(`MCP server running on port ${chalk.bold(String(port))}`);
            console.log(
              chalk.gray('  Press Ctrl+C to stop\n')
            );

            // Keep alive for SSE mode
            const shutdown = () => {
              console.log(chalk.gray('\n  Stopping MCP server...'));
              process.exit(0);
            };

            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);

            await new Promise<void>(() => {
              // Keep event loop alive
            });
          }
          // For stdio transport, the server handles I/O directly
        } catch (error: unknown) {
          if (spinner) {
            spinner.fail('Failed to start MCP server');
          }
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`\n  ${message}\n`));
          process.exit(1);
        }
      }
    );
}
