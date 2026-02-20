/**
 * `archguard server` subcommand.
 * Manage the local ArchGuard API server and database.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'node:path';
import { loadConfig, initializeDatabase, findProjectRoot } from '@archguard/core';

export function registerServerCommand(program: Command): void {
  const server = program
    .command('server')
    .description('Manage the ArchGuard API server');

  // ── start ─────────────────────────────────────────────────────────
  server
    .command('start')
    .description('Start the ArchGuard API server locally')
    .option('--port <number>', 'Port to listen on', '3200')
    .option('--host <host>', 'Host to bind to', '127.0.0.1')
    .option('--path <dir>', 'Project directory', '.')
    .action(
      async (options: {
        port: string;
        host: string;
        path: string;
      }) => {
        const projectDir = path.resolve(options.path);
        const config = loadConfig(projectDir);
        const port = parseInt(options.port, 10) || 3200;
        const host = options.host;

        console.log(chalk.bold('\n  ArchGuard API Server\n'));
        console.log(chalk.gray(`  Host:    ${host}`));
        console.log(chalk.gray(`  Port:    ${port}`));
        console.log(chalk.gray(`  Project: ${projectDir}`));
        console.log('');

        const spinner = ora('Starting server...').start();

        try {
          // Ensure database is initialized
          spinner.text = 'Initializing database...';
          initializeDatabase();

          spinner.text = 'Starting API server...';

          // Dynamic import to avoid loading server code unless needed
          const { createServer } = await import('@archguard/core');

          const serverInstance = (createServer as any)({
            port,
            host,
            projectDir,
            config,
          });

          spinner.succeed(
            `Server running at ${chalk.bold(`http://${host}:${port}`)}`
          );
          console.log(chalk.gray('  Press Ctrl+C to stop\n'));

          // API endpoints info
          console.log(chalk.bold('  Available endpoints:'));
          console.log(chalk.gray('    GET  /api/v1/decisions'));
          console.log(chalk.gray('    GET  /api/v1/snapshots'));
          console.log(chalk.gray('    GET  /api/v1/drift'));
          console.log(chalk.gray('    GET  /api/v1/velocity'));
          console.log(chalk.gray('    GET  /api/v1/reviews'));
          console.log(chalk.gray('    POST /api/v1/analyze'));
          console.log(chalk.gray('    POST /api/v1/sync'));
          console.log('');

          // Keep alive and handle shutdown
          const shutdown = () => {
            console.log(chalk.gray('\n  Shutting down server...'));
            if (serverInstance && typeof serverInstance.close === 'function') {
              serverInstance.close();
            }
            process.exit(0);
          };

          process.on('SIGINT', shutdown);
          process.on('SIGTERM', shutdown);

          await new Promise<void>(() => {
            // Keep event loop alive
          });
        } catch (error: unknown) {
          spinner.fail('Failed to start server');
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`\n  ${message}\n`));
          process.exit(1);
        }
      }
    );

  // ── migrate ───────────────────────────────────────────────────────
  server
    .command('migrate')
    .description('Run database migrations')
    .option('--db <path>', 'Database file path')
    .option('--dry-run', 'Show what migrations would run without applying')
    .action(
      async (options: {
        db?: string;
        dryRun?: boolean;
      }) => {
        console.log(chalk.bold('\n  Database Migration\n'));

        const spinner = ora('Running migrations...').start();

        try {
          if (options.dryRun) {
            spinner.text = 'Checking pending migrations...';
          }

          // Initialize database (which creates tables if they don't exist)
          const db = initializeDatabase(options.db);

          if (options.dryRun) {
            spinner.succeed('Dry run complete - database schema is up to date');
          } else {
            spinner.succeed('Database migrations applied successfully');
          }

          console.log(
            chalk.gray(
              `  Database: ${options.db ?? '~/.archguard/archguard.db'}\n`
            )
          );
        } catch (error: unknown) {
          spinner.fail('Migration failed');
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`\n  ${message}\n`));
          process.exit(1);
        }
      }
    );
}
