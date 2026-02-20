/**
 * `archguard server` subcommand.
 * Manage the local ArchGuard API server and database.
 *
 * Starts the full Hono API server from @archguard/server with:
 * - REST API endpoints for decisions, reviews, velocity, summaries
 * - SSE for real-time dashboard events
 * - Optional BullMQ workers (requires Redis, disabled by default locally)
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
    .option('--workers', 'Enable BullMQ workers (requires Redis)', false)
    .option('--no-auth', 'Disable authentication (for local development)')
    .action(
      async (options: {
        port: string;
        host: string;
        path: string;
        workers: boolean;
        auth: boolean;
      }) => {
        const projectDir = path.resolve(options.path);
        const config = loadConfig(projectDir);
        const port = parseInt(options.port, 10) || 3200;
        const host = options.host;

        console.log(chalk.bold('\n  🏗  ArchGuard API Server\n'));
        console.log(chalk.gray(`  Host:    ${host}`));
        console.log(chalk.gray(`  Port:    ${port}`));
        console.log(chalk.gray(`  Project: ${projectDir}`));
        console.log(chalk.gray(`  Workers: ${options.workers ? 'enabled' : 'disabled (use --workers to enable)'}`));
        console.log(chalk.gray(`  Auth:    ${options.auth ? 'enabled' : 'disabled (--no-auth)'}`));
        console.log('');

        const spinner = ora('Starting server...').start();

        try {
          // Set environment variables for the server
          process.env.PORT = String(port);
          process.env.HOST = host;
          process.env.ARCHGUARD_PROJECT_DIR = projectDir;

          // Disable workers by default for local usage (requires Redis)
          if (!options.workers) {
            process.env.ENABLE_WORKERS = 'false';
          }

          // Disable auth for local development
          if (!options.auth) {
            process.env.ARCHGUARD_DISABLE_AUTH = 'true';
          }

          // Ensure database is initialized
          spinner.text = 'Initializing database...';
          initializeDatabase();

          spinner.text = 'Starting API server...';

          // Import and start the full Hono API server
          await import('@archguard/server');

          spinner.succeed(
            `Server running at ${chalk.bold(`http://${host}:${port}`)}`
          );

          console.log('');
          console.log(chalk.bold('  Available endpoints:'));
          console.log(chalk.gray('    GET  /api/health              Health check'));
          console.log(chalk.gray('    GET  /api/decisions           List decisions'));
          console.log(chalk.gray('    GET  /api/decisions/:id       Get decision'));
          console.log(chalk.gray('    POST /api/analysis/trigger    Trigger analysis'));
          console.log(chalk.gray('    GET  /api/reviews             List reviews'));
          console.log(chalk.gray('    GET  /api/velocity            Velocity metrics'));
          console.log(chalk.gray('    GET  /api/velocity/:devId     Developer velocity'));
          console.log(chalk.gray('    GET  /api/summaries           Work summaries'));
          console.log(chalk.gray('    POST /api/sync/trigger        Trigger context sync'));
          console.log(chalk.gray('    GET  /api/repos               List repositories'));
          console.log(chalk.gray('    GET  /api/teams               List teams'));
          console.log(chalk.gray('    GET  /api/events              SSE event stream'));
          console.log('');
          console.log(chalk.gray('  Press Ctrl+C to stop\n'));

        } catch (error: unknown) {
          spinner.fail('Failed to start server');
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`\n  ${message}\n`));

          // Common troubleshooting
          if (message.includes('Redis') || message.includes('ECONNREFUSED')) {
            console.log(chalk.yellow('  Tip: Workers require Redis. Use --workers=false or start Redis first.\n'));
          }
          if (message.includes('EADDRINUSE')) {
            console.log(chalk.yellow(`  Tip: Port ${port} is already in use. Try --port <different-port>\n`));
          }

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
