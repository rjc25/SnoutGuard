/**
 * `archguard summary` command.
 *
 * Generates work summaries using Claude (Sonnet by default).
 * Requires an Anthropic API key.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  loadConfig,
  requireApiKey,
  getModelForOperation,
  LlmAuthError,
  type SummaryType,
  type WorkSummary,
} from '@archguard/core';

/** Valid summary types */
const VALID_TYPES: SummaryType[] = [
  'standup',
  'one_on_one',
  'sprint_review',
  'progress_report',
];

/** Format a summary for terminal display */
function formatSummary(summary: WorkSummary): string {
  const typeLabels: Record<SummaryType, string> = {
    standup: 'Daily Standup',
    one_on_one: 'One-on-One',
    sprint_review: 'Sprint Review',
    progress_report: 'Progress Report',
  };

  const lines = [
    chalk.bold(`\n  ${typeLabels[summary.type as SummaryType] ?? summary.type}`),
    chalk.gray(
      `  Period: ${summary.periodStart} to ${summary.periodEnd}`
    ),
    chalk.gray(
      `  Generated: ${summary.generatedAt}`
    ),
  ];

  if (summary.developerId) {
    lines.push(chalk.gray(`  Developer: ${summary.developerId}`));
  }

  lines.push('');
  lines.push(summary.content);

  // Data points
  const dp = summary.dataPoints;
  if (dp) {
    lines.push('');
    lines.push(chalk.bold('  Key Metrics:'));
    lines.push(`    Commits:              ${dp.commits}`);
    lines.push(`    PRs Opened:           ${dp.prsOpened}`);
    lines.push(`    PRs Merged:           ${dp.prsMerged}`);
    lines.push(`    Reviews Given:        ${dp.reviewsGiven}`);
    lines.push(`    Violations Introduced: ${dp.violationsIntroduced}`);
    lines.push(`    Violations Resolved:  ${dp.violationsResolved}`);
    lines.push(`    Files Changed:        ${dp.filesChanged}`);

    if (dp.keyPrs.length > 0) {
      lines.push('');
      lines.push(chalk.bold('  Key PRs:'));
      for (const pr of dp.keyPrs) {
        lines.push(`    - ${pr}`);
      }
    }
  }

  return lines.join('\n');
}

export function registerSummaryCommand(program: Command): void {
  program
    .command('summary')
    .description('Generate work summaries')
    .option('--dev <name>', 'Developer name or email')
    .option(
      '--type <type>',
      'Summary type: standup, one_on_one, sprint_review, progress_report',
      'standup'
    )
    .option(
      '--period <period>',
      'Time period: weekly or sprint',
      'weekly'
    )
    .option('--json', 'Output as JSON')
    .option('--output <file>', 'Write summary to a file')
    .option('--path <dir>', 'Project directory', '.')
    .action(
      async (options: {
        dev?: string;
        type: string;
        period: string;
        json?: boolean;
        output?: string;
        path: string;
      }) => {
        const projectDir = path.resolve(options.path);
        const config = loadConfig(projectDir);
        const summaryType = options.type as SummaryType;

        // Validate API key upfront
        try {
          requireApiKey(config);
        } catch (error) {
          if (error instanceof LlmAuthError) {
            console.error(chalk.red(error.message));
            process.exit(1);
          }
          throw error;
        }

        if (!config.summaries.enabled) {
          console.log(
            chalk.yellow(
              '\n  Work summaries are disabled in .archguard.yml.\n' +
                '  Set summaries.enabled to true to enable them.\n'
            )
          );
          return;
        }

        if (!VALID_TYPES.includes(summaryType)) {
          console.error(
            chalk.red(
              `\n  Invalid summary type: ${options.type}.\n` +
                `  Valid types: ${VALID_TYPES.join(', ')}\n`
            )
          );
          process.exit(1);
        }

        const model = getModelForOperation(config, 'summary');
        console.log(chalk.gray(`  Model: ${model}`));

        const spinner = ora(
          `Generating ${summaryType.replace(/_/g, ' ')} summary...`
        ).start();

        try {
          const { generateSummary, collectData } = await import('@archguard/work-summary');

          // Calculate period dates based on the selected period
          const nowDate = new Date();
          const periodEnd = nowDate.toISOString().slice(0, 10);
          const periodStart =
            options.period === 'sprint'
              ? new Date(nowDate.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
              : new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

          const developerName = options.dev ?? 'team';

          // Collect data from git history
          const data = await collectData({
            repoPath: projectDir,
            developer: developerName,
            periodStart,
            periodEnd,
          });

          const summary = await generateSummary({
            data,
            type: summaryType,
            developerName,
            period: options.period,
            teamId: 'default',
            projectDir,
            config,
          });

          spinner.succeed('Summary generated');

          if (options.json) {
            const jsonOutput = JSON.stringify(summary, null, 2);
            if (options.output) {
              const outputPath = path.resolve(options.output);
              fs.writeFileSync(outputPath, jsonOutput, 'utf-8');
              console.log(
                chalk.green(`\n  Summary written to ${chalk.bold(outputPath)}\n`)
              );
            } else {
              console.log(jsonOutput);
            }
            return;
          }

          if (options.output) {
            const outputPath = path.resolve(options.output);
            fs.writeFileSync(outputPath, summary.content, 'utf-8');
            console.log(
              chalk.green(`\n  Summary written to ${chalk.bold(outputPath)}\n`)
            );
            return;
          }

          console.log(formatSummary(summary));
          console.log('');
        } catch (error: unknown) {
          spinner.fail('Failed to generate summary');
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`\n  ${message}\n`));
          process.exit(1);
        }
      }
    );
}
