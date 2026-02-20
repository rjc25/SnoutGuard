#!/usr/bin/env node

/**
 * @archguard/cli - Main CLI entry point for ArchGuard.
 * Provides commands for architectural analysis, context sync,
 * code review, velocity tracking, and more.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// Load .env file from the current working directory (or --path target).
// Inline loader — avoids a dotenv dependency.
function loadDotenv(dir: string): void {
  const envPath = path.resolve(dir, '.env');
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Don't override existing env vars
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // No .env file — that's fine
  }
}

loadDotenv(process.cwd());

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
