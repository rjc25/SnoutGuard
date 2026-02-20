/**
 * `snoutguard watch` command.
 * Runs the sync engine in watch mode, automatically regenerating context files
 * when source code or decisions change.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'node:path';
import {
  loadConfig,
  findProjectRoot,
  initializeDatabase,
  type ArchDecision,
  type ArchCategory,
  type SyncFormat,
} from '@snoutguard/core';

export function registerWatchCommand(program: Command): void {
  program
    .command('watch')
    .description('Watch for changes and auto-sync context files')
    .option('--path <dir>', 'Project directory to watch', '.')
    .option(
      '--format <format>',
      'Format to generate (all, cursorrules, claude, copilot, windsurf, kiro)',
      'all'
    )
    .option('--debounce <ms>', 'Debounce interval in milliseconds', '1000')
    .action(
      async (options: {
        path: string;
        format: string;
        debounce: string;
      }) => {
        const projectDir = path.resolve(options.path);
        const config = loadConfig(projectDir);
        const debounceMs = parseInt(options.debounce, 10) || 1000;

        console.log(
          chalk.bold('\n  SnoutGuard Watch Mode\n')
        );
        console.log(chalk.gray(`  Watching: ${projectDir}`));
        console.log(chalk.gray(`  Formats:  ${options.format}`));
        console.log(chalk.gray(`  Debounce: ${debounceMs}ms`));
        console.log('');

        const spinner = ora('Starting file watcher...').start();

        try {
          const { SyncEngine } = await import('@snoutguard/context-sync');

          // Determine which formats to use
          const formats: SyncFormat[] =
            options.format === 'all'
              ? config.sync.formats
              : [options.format as SyncFormat];

          // Load decisions from database
          const db = initializeDatabase();
          const { schema } = await import('@snoutguard/core');
          const rows = await db.select().from(schema.decisions);

          const decisions: ArchDecision[] = rows.map((row) => ({
            id: row.id,
            title: row.title,
            description: row.description,
            category: row.category as ArchCategory,
            status: row.status as ArchDecision['status'],
            confidence: row.confidence,
            evidence: [],
            constraints: JSON.parse(row.constraints ?? '[]'),
            relatedDecisions: JSON.parse(row.relatedDecisions ?? '[]'),
            tags: JSON.parse(row.tags ?? '[]'),
            detectedAt: row.detectedAt,
            confirmedBy: row.confirmedBy ?? undefined,
          }));

          // Create sync engine with the requested formats
          const syncConfig = {
            ...config,
            sync: {
              ...config.sync,
              formats,
            },
          };

          const engine = new SyncEngine({
            config: syncConfig,
            decisions,
            repoId: 'local',
            projectRoot: projectDir,
          });

          // Start watch mode with the SyncEngine
          await engine.startWatch(undefined, (result) => {
            const timestamp = new Date().toLocaleTimeString();
            for (const record of result.records) {
              console.log(
                chalk.green(
                  `  [${timestamp}] Synced ${record.format} -> ${record.outputPath}`
                )
              );
            }
            for (const err of result.errors) {
              console.error(
                chalk.red(
                  `  [${timestamp}] Error in ${err.format}: ${err.error}`
                )
              );
            }
          });

          spinner.succeed('Watching for changes (press Ctrl+C to stop)');
          console.log('');

          // Keep the process alive and handle shutdown
          const shutdown = () => {
            console.log(chalk.gray('\n  Stopping watcher...'));
            engine.stopWatch();
            process.exit(0);
          };

          process.on('SIGINT', shutdown);
          process.on('SIGTERM', shutdown);

          // Keep the event loop alive
          await new Promise<void>(() => {
            // This promise never resolves - process stays alive until signal
          });
        } catch (error: unknown) {
          spinner.fail('Failed to start watcher');
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`\n  ${message}\n`));
          process.exit(1);
        }
      }
    );
}
