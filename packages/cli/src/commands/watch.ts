/**
 * `archguard watch` command.
 * Runs the sync engine in watch mode, automatically regenerating context files
 * when source code or decisions change.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'node:path';
import { loadConfig, findProjectRoot } from '@archguard/core';

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
          chalk.bold('\n  ArchGuard Watch Mode\n')
        );
        console.log(chalk.gray(`  Watching: ${projectDir}`));
        console.log(chalk.gray(`  Formats:  ${options.format}`));
        console.log(chalk.gray(`  Debounce: ${debounceMs}ms`));
        console.log('');

        const spinner = ora('Starting file watcher...').start();

        try {
          const { startWatcher } = await import('@archguard/context-sync');

          const watcher = await startWatcher(projectDir, config, {
            formats: options.format === 'all' ? config.sync.formats : [options.format as any],
            debounceMs,
            onChange: (event) => {
              console.log(
                chalk.gray(
                  `  [${new Date().toLocaleTimeString()}] ${event.type}: ${event.path}`
                )
              );
            },
            onSync: (result) => {
              console.log(
                chalk.green(
                  `  [${new Date().toLocaleTimeString()}] Synced ${result.format} -> ${result.outputPath}`
                )
              );
            },
            onError: (error) => {
              console.error(
                chalk.red(
                  `  [${new Date().toLocaleTimeString()}] Error: ${error.message}`
                )
              );
            },
          });

          spinner.succeed('Watching for changes (press Ctrl+C to stop)');
          console.log('');

          // Keep the process alive and handle shutdown
          const shutdown = () => {
            console.log(chalk.gray('\n  Stopping watcher...'));
            watcher.close();
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
