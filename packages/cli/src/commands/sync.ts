/**
 * `archguard sync` command.
 * Generates context files for AI coding assistants by synchronizing
 * architectural decisions into tool-specific formats.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'node:path';
import {
  loadConfig,
  initializeDatabase,
  findProjectRoot,
  type SyncFormat,
  type ArchDecision,
  type ArchCategory,
} from '@archguard/core';

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
    .option('--dry-run', 'Show what would be generated without writing files')
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
          chalk.bold(`\n  Syncing context files for: ${chalk.cyan(formats.join(', '))}\n`)
        );

        const spinner = ora('Loading architectural decisions...').start();

        try {
          // Load decisions from database
          const db = initializeDatabase();
          const { schema } = await import('@archguard/core');
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
            spinner.warn('No decisions found. Run `archguard analyze` first.');
            console.log('');
            return;
          }

          // Create a SyncEngine with the determined formats
          const { SyncEngine } = await import('@archguard/context-sync');

          // Override config formats to only generate the requested ones
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

          if (options.dryRun) {
            // Preview what would be generated
            for (const format of formats) {
              spinner.text = `Previewing ${format} context file...`;
              try {
                const content = engine.renderFormat(format);
                const outputPaths = engine.getOutputPaths();
                console.log(chalk.gray(`\n  [dry-run] Would write: ${outputPaths[format]}`));
                console.log(chalk.gray(`  Content length: ${content.length} chars\n`));
              } catch (formatError: unknown) {
                const msg =
                  formatError instanceof Error
                    ? formatError.message
                    : String(formatError);
                spinner.text = `Skipping ${format}: ${msg}`;
              }
            }
            spinner.succeed('Dry run complete');
          } else {
            // Run the sync
            spinner.text = 'Generating context files...';
            const syncResult = engine.sync();

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
