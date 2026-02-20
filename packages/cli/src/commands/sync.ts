/**
 * `snoutguard sync` command.
 * Generates context files for AI coding assistants by synchronizing
 * architectural decisions into tool-specific formats via LLM compression.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'node:path';
import {
  loadConfig,
  initializeDatabase,
  findProjectRoot,
  getModelForOperation,
  type SyncFormat,
  type ArchDecision,
  type ArchCategory,
} from '@snoutguard/core';

/** Valid sync format names */
const VALID_FORMATS: SyncFormat[] = [
  'cursorrules',
  'claude',
  'copilot',
  'windsurf',
  'kiro',
  'agents',
];

export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .description('Generate context files for AI coding assistants')
    .option(
      '--format <format>',
      'Format to generate (all, cursorrules, claude, copilot, windsurf, kiro, agents)',
      'all'
    )
    .option('--path <dir>', 'Project directory', '.')
    .option('--output <dir>', 'Output directory for generated files')
    .option('--dry-run', 'Preview what would be generated without writing files or calling the LLM')
    .action(
      async (options: {
        format: string;
        path: string;
        output?: string;
        dryRun?: boolean;
      }) => {
        const projectDir = path.resolve(options.path);
        const config = loadConfig(projectDir);
        const outputDir = options.output
          ? path.resolve(options.output)
          : path.join(projectDir, config.sync.outputDir);

        // Determine which formats to generate
        let formats: SyncFormat[];
        if (options.format === 'all') {
          formats = config.sync.formats;
        } else {
          const requested = options.format as SyncFormat;
          if (!VALID_FORMATS.includes(requested)) {
            console.error(
              chalk.red(
                `\n  Unknown format: ${requested}. Valid formats: ${VALID_FORMATS.join(', ')}\n`
              )
            );
            process.exit(1);
          }
          formats = [requested];
        }

        console.log(
          chalk.bold(`\n  Syncing context files: ${chalk.cyan(formats.join(', '))}\n`)
        );

        const spinner = ora('Loading architectural decisions...').start();

        try {
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

          spinner.text = `Loaded ${decisions.length} decisions`;

          if (decisions.length === 0) {
            spinner.warn('No decisions found. Run `snoutguard analyze` first.');
            console.log('');
            return;
          }

          if (options.dryRun) {
            // Preview without LLM calls or file writes
            const { SyncEngine } = await import('@snoutguard/context-sync');
            const syncConfig = { ...config, sync: { ...config.sync, formats } };
            const engine = new SyncEngine({
              config: syncConfig,
              decisions,
              repoId: 'local',
              projectRoot: projectDir,
            });
            const outputPaths = engine.getOutputPaths();

            for (const format of formats) {
              const target = outputPaths[format] ?? `<unknown path for ${format}>`;
              console.log(chalk.gray(`\n  [dry-run] Would write: ${target}`));
              console.log(chalk.gray(`  Decisions: ${decisions.length}`));
              console.log(chalk.gray(`  Model: ${getModelForOperation(config, 'sync')}`));
              console.log(chalk.gray(`  Max context tokens: ${config.sync.maxContextTokens}\n`));
            }
            spinner.succeed('Dry run complete (no LLM calls made)');
          } else {
            // Create a SyncEngine with the determined formats
            const { SyncEngine } = await import('@snoutguard/context-sync');

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

            spinner.text = `Generating context files with ${getModelForOperation(config, 'sync')}...`;
            const syncResult = await engine.sync();

            for (const err of syncResult.errors) {
              console.log(chalk.yellow(`\n  Skipped ${err.format}: ${err.error}`));
            }

            spinner.succeed(
              `Generated ${syncResult.records.length} context file(s) in ${chalk.bold(outputDir)}`
            );
          }

          console.log('');
        } catch (error: unknown) {
          spinner.fail('Sync failed');
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`\n  ${message}\n`));
          process.exit(1);
        }
      }
    );
}
