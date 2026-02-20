#!/usr/bin/env node

/**
 * @archguard/cli - Main CLI entry point for ArchGuard.
 * Provides commands for architectural analysis, context sync,
 * code review, velocity tracking, and more.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { registerInitCommand } from './commands/init.js';
import { registerAnalyzeCommand } from './commands/analyze.js';
import { registerDecisionsCommand } from './commands/decisions.js';
import { registerSyncCommand } from './commands/sync.js';
import { registerWatchCommand } from './commands/watch.js';
import { registerServeCommand } from './commands/serve.js';
import { registerReviewCommand } from './commands/review.js';
import { registerVelocityCommand } from './commands/velocity.js';
import { registerSummaryCommand } from './commands/summary.js';
import { registerLoginCommand } from './commands/login.js';
import { registerServerCommand } from './commands/server.js';
import { registerCostsCommand } from './commands/costs.js';

const program = new Command();

program
  .name('archguard')
  .version('0.1.0')
  .description(
    'Open-source architectural guardrails & engineering intelligence platform'
  );

// Register all subcommands
registerInitCommand(program);
registerAnalyzeCommand(program);
registerDecisionsCommand(program);
registerSyncCommand(program);
registerWatchCommand(program);
registerServeCommand(program);
registerReviewCommand(program);
registerVelocityCommand(program);
registerSummaryCommand(program);
registerLoginCommand(program);
registerServerCommand(program);
registerCostsCommand(program);

// Global error handler
program.exitOverride();

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error: unknown) {
    if (error instanceof Error && error.message !== '(outputHelp)') {
      console.error(chalk.red(`\nError: ${error.message}`));
      if (process.env.ARCHGUARD_DEBUG) {
        console.error(chalk.gray(error.stack ?? ''));
      }
      process.exit(1);
    }
  }
}

main();
